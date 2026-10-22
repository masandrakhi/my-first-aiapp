import type { Context, MiddlewareHandler } from 'hono'
import { ZodError } from 'zod'
import { randomBytes } from 'node:crypto'
import type { AppDeps } from './deps'
import type { LogFields } from './logger'
import { hmacKey } from './auth/crypto'
import { HttpError, sessionExpired, unauthorized } from './errors'
import { touchSession } from './auth/sessions'
import { verifyAccessToken } from './auth/tokens'

/**
 * A user id that came from a verified access token AND a live session.
 * Only `requireAuth` creates one, and every data-access function demands one,
 * so no code path can query habits with a user id taken from the URL or request body.
 */
export type AuthedUserId = string & { readonly __brand: 'AuthedUserId' }

export interface AppEnv {
  Variables: {
    deps: AppDeps
    userId: AuthedUserId
    sessionId: string
    /** Short id for this request, returned in X-Request-Id and error bodies, and on every log line. */
    requestId: string
    /** Error code of the response, if any, for the request log line. */
    errorCode: string
  }
}

export type AppContext = Context<AppEnv>

/**
 * Writes one security event (sign-ins, lockouts, token reuse, expiries, resets, blocked requests).
 * Carries the request id and, when known, the user and session ids. Never emails, passwords or tokens:
 * pass an email through `emailRef` to correlate attempts without storing the address.
 */
export function audit(c: AppContext, event: string, fields: LogFields = {}, level: 'info' | 'warn' = 'info') {
  c.get('deps').logger[level]('security', {
    event,
    requestId: c.get('requestId'),
    userId: c.get('userId'),
    sessionId: c.get('sessionId'),
    ...fields,
  })
}

/** A stable, non-reversible reference for an email, so log lines about the same account can be matched. */
export const emailRef = (c: AppContext, email: string) => hmacKey(c.get('deps').config.ipHashSecret, `email:${email}`).slice(0, 12)

/** Gives every request a short id, echoed in the X-Request-Id response header. */
export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = randomBytes(6).toString('base64url')
  c.set('requestId', id)
  c.header('X-Request-Id', id)
  await next()
}

/** Verifies the Bearer access token, then the session (revocation, absolute expiry, 15-minute inactivity). */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const deps = c.get('deps')
  const header = c.req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw unauthorized()

  const verified = await verifyAccessToken(deps.config, token, deps.now())
  if (!verified.ok) {
    throw verified.reason === 'expired'
      ? new HttpError(401, 'token_expired', 'Your sign-in needs refreshing.')
      : unauthorized()
  }
  const { userId, sessionId } = verified.claims
  const result = await touchSession(deps, userId, sessionId)
  if (result === 'inactive' || result === 'expired') {
    audit(c, 'session_expired', { reason: result, userId, sessionId })
    throw sessionExpired()
  }
  if (result !== 'ok') {
    audit(c, 'session_invalid', { userId, sessionId })
    throw unauthorized()
  }

  c.set('userId', userId as AuthedUserId)
  c.set('sessionId', sessionId)
  await next()
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * CSRF defence in depth: state-changing requests must come from the app's own origin and,
 * when they carry a body, send JSON (which a plain cross-site form cannot do).
 */
export const originCheck: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (STATE_CHANGING.has(c.req.method)) {
    const origin = c.req.header('origin')
    if (origin !== c.get('deps').config.appOrigin) {
      audit(c, 'origin_blocked', { origin: origin ?? null, method: c.req.method, path: c.req.path }, 'warn')
      throw new HttpError(403, 'forbidden', 'Request blocked.')
    }
    const length = Number(c.req.header('content-length') ?? 0)
    const hasBody = length > 0 || c.req.header('transfer-encoding') !== undefined
    if (hasBody && !(c.req.header('content-type') ?? '').startsWith('application/json')) {
      throw new HttpError(400, 'validation_error', 'Requests must be JSON.')
    }
  }
  await next()
}

/**
 * One line per request: id, method, path, status, error code, timing, and the user/session if signed in.
 * Bodies, headers and cookies are never logged. Vercel's own request id is kept for cross-referencing.
 */
export const requestLog: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = Date.now()
  await next()
  const status = c.res.status
  c.get('deps').logger[status >= 500 ? 'error' : 'info']('request', {
    requestId: c.get('requestId'),
    method: c.req.method,
    path: c.req.path,
    status,
    errorCode: c.get('errorCode'),
    ms: Date.now() - started,
    userId: c.get('userId'),
    sessionId: c.get('sessionId'),
    vercelId: c.req.header('x-vercel-id'),
  })
}

/** Turns any thrown error into the standard JSON error shape, never leaking internals. */
export function errorResponse(err: unknown, c: AppContext) {
  const requestId = c.get('requestId')
  if (err instanceof HttpError) {
    c.set('errorCode', err.code)
    if (err.retryAfterSec) c.header('Retry-After', String(err.retryAfterSec))
    return c.json({ error: { code: err.code, message: err.message, requestId, ...(err.fields ? { fields: err.fields } : {}) } }, err.status)
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {}
    for (const issue of err.issues) {
      const key = issue.path.join('.') || 'body'
      fields[key] ??= issue.message
    }
    c.set('errorCode', 'validation_error')
    return c.json({ error: { code: 'validation_error', message: 'Please check the highlighted fields.', requestId, fields } }, 400)
  }
  // Full detail for us (stack included); only a generic message and the request id for the user.
  c.set('errorCode', 'server_error')
  c.get('deps').logger.error('unhandled error', {
    requestId,
    method: c.req.method,
    path: c.req.path,
    userId: c.get('userId'),
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
  })
  return c.json({ error: { code: 'server_error', message: 'Something went wrong. Please try again.', requestId } }, 500)
}

/** Best-effort client IP. On Vercel, x-real-ip is set by the platform and can't be spoofed by clients. */
export const clientIp = (c: AppContext): string =>
  c.req.header('x-real-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

/** Parses a JSON body; malformed JSON becomes a validation error rather than a 500. */
export async function jsonBody(c: AppContext): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    throw new HttpError(400, 'validation_error', 'Request body must be valid JSON.')
  }
}
