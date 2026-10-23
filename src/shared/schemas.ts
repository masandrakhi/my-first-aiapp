/**
 * Validation rules shared by the browser and the API server, so both enforce the same limits.
 * The server is the authority: the client uses these only for friendly, early error messages.
 */
import { z } from 'zod'
import { HABIT_COLORS } from '../lib/palette.js'
import type { AppData } from '../types.js'

export const NAME_MAX = 40
export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email address'))

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`)

export const displayNameSchema = z.string().trim().min(1).max(NAME_MAX)

export const MIN_AGE = 13
export const AGE_MESSAGE = `You must be ${MIN_AGE} or older to use Habits`

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: displayNameSchema.optional(),
  /** The user confirmed they are 13 or older (children's online privacy rules). No birth date is stored. */
  ageConfirmed: z.literal(true, AGE_MESSAGE),
})

/** Login never reveals the password policy; it only needs non-empty values within sane bounds. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(PASSWORD_MAX),
})

export const forgotSchema = z.object({ email: emailSchema })

export const resetSchema = z.object({
  token: z.string().min(16).max(256),
  newPassword: passwordSchema,
})

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

/** A real calendar date written as YYYY-MM-DD. */
export const dateKeySchema = z.string().refine((s) => {
  const m = DATE_KEY.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d && y >= 2000
}, 'Invalid date')

export const habitDraftSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(NAME_MAX, `Use at most ${NAME_MAX} characters`),
  emoji: z.string().min(1).max(16),
  color: z.string().refine((c) => HABIT_COLORS.includes(c), 'Pick a colour from the palette'),
})

/** What the user types when adding or editing a habit. */
export type HabitDraft = z.infer<typeof habitDraftSchema>

export const habitPatchSchema = habitDraftSchema.partial().refine((p) => Object.keys(p).length > 0, 'Nothing to update')

export const reorderSchema = z.object({ ids: z.array(z.uuid()).max(500) })

export const themeSchema = z.enum(['system', 'light', 'dark'])

export const settingsPatchSchema = z
  .object({ theme: themeSchema, collapseDone: z.boolean() })
  .partial()
  .refine((p) => Object.keys(p).length > 0, 'Nothing to update')

export const importSchema = z.object({
  deviceImportId: z.string().min(8).max(64),
  data: z.unknown(),
})

/** GET /api/habits: everything the Today and Week views need, for the signed-in user only. */
export type HabitsPayload = Omit<AppData, 'version'>

/** User as returned by the API. */
export interface ApiUser {
  id: string
  email: string
  name: string | null
}

export interface AuthResponse {
  accessToken: string
  /** Seconds until the access token expires. */
  expiresIn: number
  user: ApiUser
}

/** Machine-readable error codes; `message` is always safe to show to the user. */
export type ApiErrorCode =
  | 'validation_error'
  /** A habit's text broke the content policy; `message` explains it and is safe to show. */
  | 'unsafe_content'
  | 'invalid_credentials'
  | 'rate_limited'
  | 'unauthorized'
  | 'token_expired'
  | 'session_expired'
  | 'invalid_refresh'
  | 'invalid_reset_link'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'server_error'

export interface ApiErrorBody {
  /** `requestId` matches the X-Request-Id header and the server's log lines for this request. */
  error: { code: ApiErrorCode; message: string; requestId?: string; fields?: Record<string, string> }
}
