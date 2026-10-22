import { hash, verify } from '@node-rs/argon2'

// OWASP-recommended Argon2id minimum: 19 MiB memory, 2 iterations, 1 lane. Salt is random per hash.
const PARAMS = { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const
const CURRENT_PREFIX = `$argon2id$v=19$m=${PARAMS.memoryCost},t=${PARAMS.timeCost},p=${PARAMS.parallelism}$`

export const hashPassword = (password: string): Promise<string> => hash(password, PARAMS)

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

/** True when a stored hash uses older parameters and should be upgraded at the next successful login. */
export const needsRehash = (passwordHash: string): boolean => !passwordHash.startsWith(CURRENT_PREFIX)

let dummy: Promise<string> | undefined
/** A real hash to verify against when the email is unknown, so both paths take the same time. */
export const dummyHash = (): Promise<string> => (dummy ??= hashPassword('timing-equalizer-not-a-real-password'))

// Passwords already over the 12-character minimum that appear in public breach lists.
const COMMON = new Set([
  'password1234', 'password12345', 'password123456', '123456789012', '1234567890123', 'qwertyuiop12',
  'qwertyuiopas', 'qwerty123456', '1q2w3e4r5t6y', 'iloveyou1234', 'welcome12345', 'letmein12345',
  'abcdefghijkl', 'abc123456789', 'aaaaaaaaaaaa', '111111111111', '000000000000', 'passwordpassword',
  'administrator', 'changeme1234', 'football1234', 'baseball1234', 'superman1234', 'trustno11234',
  'sunshine1234', 'princess1234', 'monkey123456', 'dragon123456', 'master123456', 'p@ssw0rd1234',
])

/** NIST 800-63B style checks beyond length: no breached/common passwords, not the email itself. */
export function passwordProblem(password: string, email: string): string | null {
  const lower = password.toLowerCase()
  if (COMMON.has(lower)) return 'This password is too common. Choose another.'
  const local = email.split('@')[0] ?? ''
  if (lower === email || (local.length >= 4 && lower.includes(local))) return "Don't use your email address in your password."
  return null
}
