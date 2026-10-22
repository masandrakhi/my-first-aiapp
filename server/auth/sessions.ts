import { and, eq, gt, inArray, isNull } from 'drizzle-orm'
import type { DbOrTx } from '../db/client.js'
import { refreshTokens, sessions } from '../db/schema.js'
import type { AppDeps } from '../deps.js'
import { randomToken, sha256 } from './crypto.js'

export type RevokeReason = 'logout' | 'inactive' | 'expired' | 'refresh_reuse' | 'password_reset'

export interface NewSession {
  sessionId: string
  refreshToken: string
  expiresAt: Date
}

/** Starts a session (sign-in) and issues its first refresh token. */
export async function createSession({ db, config, now }: AppDeps, userId: string): Promise<NewSession> {
  const at = now()
  const expiresAt = new Date(at.getTime() + config.sessionMaxMs)
  const [session] = await db
    .insert(sessions)
    .values({ userId, createdAt: at, lastActivityAt: at, expiresAt })
    .returning({ id: sessions.id })
  const refreshToken = randomToken()
  await db.insert(refreshTokens).values({ sessionId: session!.id, tokenHash: sha256(refreshToken), createdAt: at, expiresAt })
  return { sessionId: session!.id, refreshToken, expiresAt }
}

/** Ends a session and every refresh token in its family. Idempotent. */
export async function revokeSession(db: DbOrTx, sessionId: string, at: Date, reason: RevokeReason) {
  await db.update(sessions).set({ revokedAt: at, revokeReason: reason }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
  await db.update(refreshTokens).set({ revokedAt: at }).where(and(eq(refreshTokens.sessionId, sessionId), isNull(refreshTokens.revokedAt)))
}

/** Signs a user out everywhere (used after a password reset). */
export async function revokeAllSessions(db: DbOrTx, userId: string, at: Date, reason: RevokeReason) {
  // Two statements however many devices the user has, instead of two per session.
  await db.update(sessions).set({ revokedAt: at, revokeReason: reason }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
  const ofUser = db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId))
  await db.update(refreshTokens).set({ revokedAt: at }).where(and(inArray(refreshTokens.sessionId, ofUser), isNull(refreshTokens.revokedAt)))
}

/** 'inactive' = idle 15+ minutes; 'expired' = past the absolute lifetime; 'invalid' = unknown or already revoked. */
export type TouchResult = 'ok' | 'inactive' | 'expired' | 'invalid'

/**
 * Records meaningful activity on a session, enforcing the inactivity timeout.
 * The check and the update happen in ONE statement, so two requests can't race past an expired session.
 */
export async function touchSession({ db, config, now }: AppDeps, userId: string, sessionId: string): Promise<TouchResult> {
  const at = now()
  const activeSince = new Date(at.getTime() - config.inactivityMs)
  const touched = await db
    .update(sessions)
    .set({ lastActivityAt: at })
    .where(and(
      eq(sessions.id, sessionId),
      eq(sessions.userId, userId),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, at),
      gt(sessions.lastActivityAt, activeSince),
    ))
    .returning({ id: sessions.id })
  if (touched.length > 0) return 'ok'

  const [session] = await db
    .select({ revokedAt: sessions.revokedAt, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
  if (!session || session.revokedAt) return 'invalid'
  const reason = session.expiresAt <= at ? 'expired' : 'inactive'
  await revokeSession(db, sessionId, at, reason)
  return reason
}
