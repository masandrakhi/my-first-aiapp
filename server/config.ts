import { z } from 'zod'

export interface Config {
  /** Exact origin the app is served from; state-changing requests must come from it. */
  appOrigin: string
  /** HMAC secrets for access tokens, newest first; older ones still verify during key rotation. */
  jwtSecrets: Uint8Array[]
  /** Secret used to hash IPs and emails in rate-limit keys, so raw values are never stored. */
  ipHashSecret: string
  cookieName: string
  cookieSecure: boolean
  mailFrom: string
  accessTokenTtlSec: number
  /** Inactivity timeout, independent of access-token expiry. */
  inactivityMs: number
  /** Absolute session lifetime, however active the user is. */
  sessionMaxMs: number
  resetTtlMs: number
  /** Minimum response time for "forgot password", so timing doesn't reveal which emails exist. */
  forgotMinMs: number
}

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

const envSchema = z.object({
  APP_ORIGIN: z.url(),
  JWT_SECRETS: z.string().min(32),
  IP_HASH_SECRET: z.string().min(32),
  MAIL_FROM: z.string().min(3).default('Habits <onboarding@resend.dev>'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
})

/** Reads and validates configuration; throws at startup rather than running half-configured. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const e = envSchema.parse(env)
  const secrets = e.JWT_SECRETS.split(',').map((s) => s.trim()).filter(Boolean)
  if (secrets.some((s) => s.length < 32)) throw new Error('Every JWT secret must be at least 32 characters')
  const secure = e.COOKIE_SECURE === 'true'
  return {
    appOrigin: new URL(e.APP_ORIGIN).origin,
    jwtSecrets: secrets.map((s) => new TextEncoder().encode(s)),
    ipHashSecret: e.IP_HASH_SECRET,
    // The __Secure- prefix makes browsers refuse the cookie unless it is Secure (production).
    cookieName: secure ? '__Secure-hb_rt' : 'hb_rt',
    cookieSecure: secure,
    mailFrom: e.MAIL_FROM,
    accessTokenTtlSec: 15 * 60,
    inactivityMs: 15 * MINUTE,
    sessionMaxMs: 7 * DAY,
    resetTtlMs: 30 * MINUTE,
    forgotMinMs: 600,
  }
}
