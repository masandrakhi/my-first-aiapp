import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { ApiUser } from '../../src/shared/schemas'
import { refreshTokens, sessions, users } from '../db/schema'
import type { AppDeps } from '../deps'
import { randomToken, sha256 } from './crypto'
import { revokeSession, type NewSession } from './sessions'

/** Why a refresh was refused; logged so a failed refresh can be explained later. */
export type RefreshFailure = 'unknown_token' | 'revoked' | 'reuse' | 'expired' | 'inactive'

export type RotateResult =
  | ({ ok: true; user: ApiUser } & NewSession)
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
    // Token, session and user in one round trip (the foreign keys guarantee the joins match).
    const [row] = await tx
      .select({
        tokenId: refreshTokens.id,
        tokenExpiresAt: refreshTokens.expiresAt,
        usedAt: refreshTokens.usedAt,
        tokenRevokedAt: refreshTokens.revokedAt,
        sessionId: sessions.id,
        sessionExpiresAt: sessions.expiresAt,
        sessionRevokedAt: sessions.revokedAt,
        lastActivityAt: sessions.lastActivityAt,
        user: { id: users.id, email: users.email, name: users.name },
      })
      .from(refreshTokens)
      .innerJoin(sessions, eq(sessions.id, refreshTokens.sessionId))
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(refreshTokens.tokenHash, sha256(presented)))
    if (!row) return { ok: false, code: 'invalid_refresh', reason: 'unknown_token' }
    const { sessionId, user } = row
    const ids = { userId: user.id, sessionId }
    if (row.sessionRevokedAt || row.tokenRevokedAt) return { ok: false, code: 'invalid_refresh', reason: 'revoked', ...ids }

    if (row.usedAt) {
      await revokeSession(tx, sessionId, at, 'refresh_reuse')
      return { ok: false, code: 'invalid_refresh', reason: 'reuse', ...ids }
    }
    if (row.tokenExpiresAt <= at || row.sessionExpiresAt <= at) {
      await revokeSession(tx, sessionId, at, 'expired')
      return { ok: false, code: 'session_expired', reason: 'expired', ...ids }
    }
    if (at.getTime() - row.lastActivityAt.getTime() >= config.inactivityMs) {
      await revokeSession(tx, sessionId, at, 'inactive')
      return { ok: false, code: 'session_expired', reason: 'inactive', ...ids }
    }

    // Claim the token atomically: if a concurrent request used it first, this matches no row.
    // The successor's id is chosen up front so the claim can link to it in the same statement.
    const nextId = randomUUID()
    const claimed = await tx
      .update(refreshTokens)
      .set({ usedAt: at, replacedBy: nextId })
      .where(and(eq(refreshTokens.id, row.tokenId), isNull(refreshTokens.usedAt), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id })
    if (claimed.length === 0) {
      await revokeSession(tx, sessionId, at, 'refresh_reuse')
      return { ok: false, code: 'invalid_refresh', reason: 'reuse', ...ids }
    }

    const refreshToken = randomToken()
    await tx
      .insert(refreshTokens)
      .values({ id: nextId, sessionId, tokenHash: sha256(refreshToken), createdAt: at, expiresAt: row.sessionExpiresAt })
    return { ok: true, user, sessionId, refreshToken, expiresAt: row.sessionExpiresAt }
  })
}
