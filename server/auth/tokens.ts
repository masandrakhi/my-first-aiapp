import { createHash, randomUUID } from 'node:crypto'
import { decodeProtectedHeader, errors, jwtVerify, SignJWT } from 'jose'
import type { Config } from '../config'

const ISSUER = 'habits-api'
const AUDIENCE = 'habits-app'

const keyId = (secret: Uint8Array) => createHash('sha256').update(secret).digest('hex').slice(0, 12)
const seconds = (d: Date) => Math.floor(d.getTime() / 1000)

export interface AccessClaims {
  userId: string
  sessionId: string
}

/** A short-lived (15 min) HS256 JWT. It proves identity only; every request also checks the session row. */
export function signAccessToken(config: Config, claims: AccessClaims, now: Date): Promise<string> {
  const secret = config.jwtSecrets[0]!
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: 'HS256', kid: keyId(secret) })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt(seconds(now))
    .setExpirationTime(seconds(now) + config.accessTokenTtlSec)
    .sign(secret)
}

export type VerifyResult = { ok: true; claims: AccessClaims } | { ok: false; reason: 'expired' | 'invalid' }

export async function verifyAccessToken(config: Config, token: string, now: Date): Promise<VerifyResult> {
  try {
    const { kid } = decodeProtectedHeader(token)
    const secret = config.jwtSecrets.find((s) => keyId(s) === kid)
    if (!secret) return { ok: false, reason: 'invalid' }
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      currentDate: now,
    })
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return { ok: false, reason: 'invalid' }
    return { ok: true, claims: { userId: payload.sub, sessionId: payload.sid } }
  } catch (err) {
    return { ok: false, reason: err instanceof errors.JWTExpired ? 'expired' : 'invalid' }
  }
}
