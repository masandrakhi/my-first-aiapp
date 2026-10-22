import { createHash, createHmac, randomBytes } from 'node:crypto'

/** A 256-bit random token, URL-safe. Used for refresh tokens and password-reset links. */
export const randomToken = (): string => randomBytes(32).toString('base64url')

/** SHA-256 of a token. Only this is stored, so a database leak doesn't expose usable tokens. */
export const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest()

/** Keyed hash for rate-limit keys, so IPs and emails are never stored in the clear. */
export const hmacKey = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('base64url').slice(0, 32)
