import { and, eq, isNull } from 'drizzle-orm'
import { refreshTokens, sessions } from '../db/schema'
import type { AppDeps } from '../deps'
import { randomToken, sha256 } from './crypto'
import { revokeSession } from './sessions'

/** Why a refresh was refused; logged so a failed refresh can be explained later. */
export type RefreshFailure = 'unknown_token' | 'revoked' | 'reuse' | 'expired' | 'inactive'

export type RotateResult =
  | { ok: true; userId: string; sessionId: string; refreshToken: string; expiresAt: Date }
  | { ok: false; code: 'invalid_refresh' | 'session_expired'; reason: RefreshFailure; userId?: string; sessionId?: string }

/**
 * Exchanges a refresh token for a new one (rotation).
 * - A token that was already used is treated as stolen: the whole session (token family) is revoked.
 * - Refreshing never counts as activity, so it cannot outlive the 15-minute inactivity timeout.
 */
export async function rotateRefreshToken(deps: AppDeps, presented: string): Promise<RotateResult> {
  const { db, config, now } = deps
  const at = now()
  return db.transaction(async (tx): Promise<RotateResult> => {
    const [token] = await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(presented)))
    if (!token) return { ok: false, code: 'invalid_refresh', reason: 'unknown_token' }
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, token.sessionId))
    const ids = { userId: session?.userId, sessionId: token.sessionId }
    if (!session || session.revokedAt || token.revokedAt) return { ok: false, code: 'invalid_refresh', reason: 'revoked', ...ids }

    if (token.usedAt) {
      await revokeSession(tx, session.id, at, 'refresh_reuse')
      return { ok: false, code: 'invalid_refresh', reason: 'reuse', ...ids }
    }
    if (token.expiresAt <= at || session.expiresAt <= at) {
      await revokeSession(tx, session.id, at, 'expired')
      return { ok: false, code: 'session_expired', reason: 'expired', ...ids }
    }
    if (at.getTime() - session.lastActivityAt.getTime() >= config.inactivityMs) {
      await revokeSession(tx, session.id, at, 'inactive')
      return { ok: false, code: 'session_expired', reason: 'inactive', ...ids }
    }

    // Claim the token atomically: if a concurrent request used it first, this matches no row.
    const claimed = await tx
      .update(refreshTokens)
      .set({ usedAt: at })
      .where(and(eq(refreshTokens.id, token.id), isNull(refreshTokens.usedAt), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id })
    if (claimed.length === 0) {
      await revokeSession(tx, session.id, at, 'refresh_reuse')
      return { ok: false, code: 'invalid_refresh', reason: 'reuse', ...ids }
    }

    const next = randomToken()
    const [created] = await tx
      .insert(refreshTokens)
      .values({ sessionId: session.id, tokenHash: sha256(next), createdAt: at, expiresAt: session.expiresAt })
      .returning({ id: refreshTokens.id })
    await tx.update(refreshTokens).set({ replacedBy: created!.id }).where(eq(refreshTokens.id, token.id))
    return { ok: true, userId: session.userId, sessionId: session.id, refreshToken: next, expiresAt: session.expiresAt }
  })
}
