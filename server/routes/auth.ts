import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { and, eq, isNull } from 'drizzle-orm'
import { forgotSchema, loginSchema, registerSchema, resetSchema, type ApiUser, type AuthResponse } from '../../src/shared/schemas.js'
import { refreshTokens, users, userSettings } from '../db/schema.js'
import { HttpError, invalidRefresh, rateLimited, sessionExpired } from '../errors.js'
import { audit, clientIp, emailRef, jsonBody, type AppContext, type AppEnv } from '../middleware.js'
import { sha256 } from '../auth/crypto.js'
import { dummyHash, hashPassword, needsRehash, passwordProblem, verifyPassword } from '../auth/password.js'
import { clear, consume, LIMITS, peek, type Limit } from '../auth/rateLimit.js'
import { rotateRefreshToken } from '../auth/refresh.js'
import { completePasswordReset, requestPasswordReset } from '../auth/reset.js'
import { createSession, revokeSession, type NewSession } from '../auth/sessions.js'
import { signAccessToken, verifyAccessToken } from '../auth/tokens.js'

export const authRoutes = new Hono<AppEnv>()

const REFRESH_PATH = '/api/auth'

function setRefreshCookie(c: AppContext, token: string, expiresAt: Date) {
  const { config, now } = c.get('deps')
  setCookie(c, config.cookieName, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'Strict',
    path: REFRESH_PATH,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - now().getTime()) / 1000)),
  })
}

const clearRefreshCookie = (c: AppContext) =>
  deleteCookie(c, c.get('deps').config.cookieName, { path: REFRESH_PATH, secure: c.get('deps').config.cookieSecure })

async function signedIn(c: AppContext, user: ApiUser, session: NewSession): Promise<AuthResponse> {
  const deps = c.get('deps')
  setRefreshCookie(c, session.refreshToken, session.expiresAt)
  const accessToken = await signAccessToken(deps.config, { userId: user.id, sessionId: session.sessionId }, deps.now())
  return { accessToken, expiresIn: deps.config.accessTokenTtlSec, user }
}

async function enforce(c: AppContext, limit: Limit, subject: string) {
  const state = await consume(c.get('deps'), limit, subject)
  if (!state.allowed) {
    audit(c, 'rate_limited', { limit: limit.name, retryAfterSec: state.retryAfterSec }, 'warn')
    throw rateLimited(state.retryAfterSec)
  }
}

authRoutes.post('/register', async (c) => {
  const deps = c.get('deps')
  await enforce(c, LIMITS.registerPerIp, clientIp(c))
  const { email, password, name } = registerSchema.parse(await jsonBody(c))
  const problem = passwordProblem(password, email)
  if (problem) throw new HttpError(400, 'validation_error', problem, { fields: { password: problem } })

  const at = deps.now()
  const [user] = await deps.db
    .insert(users)
    .values({ email, passwordHash: await hashPassword(password), name: name ?? null, passwordChangedAt: at, createdAt: at })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id, email: users.email, name: users.name })
  if (!user) {
    audit(c, 'register_conflict', { emailRef: emailRef(c, email) })
    throw new HttpError(409, 'conflict', "We couldn't create an account with that email. If you already have one, sign in instead.")
  }
  await deps.db.insert(userSettings).values({ userId: user.id })
  const session = await createSession(deps, user.id)
  audit(c, 'register_succeeded', { userId: user.id, sessionId: session.sessionId })
  return c.json(await signedIn(c, user, session), 201)
})

authRoutes.post('/login', async (c) => {
  const deps = c.get('deps')
  await enforce(c, LIMITS.loginPerIp, clientIp(c))
  const { email, password } = loginSchema.parse(await jsonBody(c))

  const lock = await peek(deps, LIMITS.loginFailuresPerEmail, email)
  if (!lock.allowed) {
    audit(c, 'login_locked', { emailRef: emailRef(c, email), retryAfterSec: lock.retryAfterSec }, 'warn')
    throw rateLimited(lock.retryAfterSec)
  }

  const [user] = await deps.db.select().from(users).where(eq(users.email, email))
  // Unknown emails still pay for a full hash, so response time doesn't reveal which accounts exist.
  const valid = user ? await verifyPassword(user.passwordHash, password) : (await verifyPassword(await dummyHash(), password), false)
  if (!user || !valid) {
    const failures = await consume(deps, LIMITS.loginFailuresPerEmail, email)
    audit(c, 'login_failed', {
      reason: user ? 'wrong_password' : 'unknown_email',
      userId: user?.id,
      emailRef: emailRef(c, email),
      lockedNow: !failures.allowed,
    })
    throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.')
  }

  await clear(deps, LIMITS.loginFailuresPerEmail, email)
  if (needsRehash(user.passwordHash)) {
    await deps.db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id))
    audit(c, 'password_rehashed', { userId: user.id })
  }
  const profile = { id: user.id, email: user.email, name: user.name }
  const session = await createSession(deps, user.id)
  audit(c, 'login_succeeded', { userId: user.id, sessionId: session.sessionId })
  return c.json(await signedIn(c, profile, session))
})

authRoutes.post('/refresh', async (c) => {
  const deps = c.get('deps')
  await enforce(c, LIMITS.refreshPerIp, clientIp(c))
  const presented = getCookie(c, deps.config.cookieName)
  if (!presented) {
    audit(c, 'refresh_failed', { reason: 'no_cookie' })
    throw invalidRefresh()
  }

  const result = await rotateRefreshToken(deps, presented)
  if (!result.ok) {
    // Reuse means a refresh token was presented twice: possibly stolen. The session is already revoked.
    if (result.reason === 'reuse') audit(c, 'refresh_reuse_detected', { userId: result.userId, sessionId: result.sessionId }, 'warn')
    else audit(c, 'refresh_failed', { reason: result.reason, userId: result.userId, sessionId: result.sessionId })
    clearRefreshCookie(c)
    throw result.code === 'session_expired' ? sessionExpired() : invalidRefresh()
  }
  audit(c, 'refresh_succeeded', { userId: result.user.id, sessionId: result.sessionId })
  return c.json(await signedIn(c, result.user, result))
})

authRoutes.post('/logout', async (c) => {
  const deps = c.get('deps')
  const at = deps.now()
  const revoked = new Set<string>()
  const presented = getCookie(c, deps.config.cookieName)
  if (presented) {
    const [token] = await deps.db
      .select({ sessionId: refreshTokens.sessionId })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, sha256(presented)), isNull(refreshTokens.revokedAt)))
    if (token) {
      await revokeSession(deps.db, token.sessionId, at, 'logout')
      revoked.add(token.sessionId)
    }
  }
  const bearer = c.req.header('authorization')?.replace(/^Bearer /, '')
  if (bearer) {
    const verified = await verifyAccessToken(deps.config, bearer, at)
    // Usually the same session as the cookie's; it is only revoked once.
    if (verified.ok && !revoked.has(verified.claims.sessionId)) {
      await revokeSession(deps.db, verified.claims.sessionId, at, 'logout')
      revoked.add(verified.claims.sessionId)
    }
  }
  audit(c, 'logout', { sessionIds: [...revoked] })
  clearRefreshCookie(c)
  return c.body(null, 204)
})

authRoutes.post('/password/forgot', async (c) => {
  const deps = c.get('deps')
  const started = Date.now()
  const { email } = forgotSchema.parse(await jsonBody(c))
  const [byIp, byEmail] = await Promise.all([consume(deps, LIMITS.forgotPerIp, clientIp(c)), consume(deps, LIMITS.forgotPerEmail, email)])
  if (!byIp.allowed) {
    audit(c, 'rate_limited', { limit: LIMITS.forgotPerIp.name, retryAfterSec: byIp.retryAfterSec }, 'warn')
    throw rateLimited(byIp.retryAfterSec)
  }
  // Over the per-email limit we silently skip sending, but answer exactly as usual.
  const outcome = byEmail.allowed ? await requestPasswordReset(deps, email) : null
  audit(c, 'password_reset_requested', {
    emailRef: emailRef(c, email),
    accountExists: outcome ? outcome.userId !== null : undefined,
    userId: outcome?.userId ?? undefined,
    emailSent: outcome?.emailSent ?? false,
    skippedByLimit: outcome === null,
  })
  const wait = deps.config.forgotMinMs - (Date.now() - started)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  return c.json({ message: "If an account exists for that email, we've sent a link to reset the password." }, 202)
})

authRoutes.post('/password/reset', async (c) => {
  const deps = c.get('deps')
  await enforce(c, LIMITS.resetPerIp, clientIp(c))
  const { token, newPassword } = resetSchema.parse(await jsonBody(c))
  try {
    const userId = await completePasswordReset(deps, token, newPassword)
    audit(c, 'password_reset_completed', { userId, allSessionsRevoked: true })
  } catch (err) {
    if (err instanceof HttpError) audit(c, 'password_reset_failed', { reason: err.code })
    throw err
  }
  return c.body(null, 204)
})
