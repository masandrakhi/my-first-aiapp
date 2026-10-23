import { and, eq, gt, isNull } from 'drizzle-orm'
import { passwordResets, users } from '../db/schema.js'
import type { AppDeps } from '../deps.js'
import { HttpError } from '../errors.js'
import { randomToken, sha256 } from './crypto.js'
import { hashPassword, passwordProblem } from './password.js'
import { revokeAllSessions } from './sessions.js'

/**
 * Emails a single-use, 30-minute reset link if the account exists. The caller always answers
 * the same way, so this never reveals whether an email is registered.
 */
export async function requestPasswordReset(deps: AppDeps, email: string): Promise<{ userId: string | null; emailSent: boolean }> {
  const { db, config, now, mailer, logger } = deps
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (!user) return { userId: null, emailSent: false }
  const at = now()
  // Earlier unused links stay valid until they expire: people often ask twice and open the first email.
  // Using any one of them retires all the others (completePasswordReset), so each is still single-use.
  const token = randomToken()
  await db.insert(passwordResets).values({
    userId: user.id,
    tokenHash: sha256(token),
    createdAt: at,
    expiresAt: new Date(at.getTime() + config.resetTtlMs),
  })
  // The token travels in the URL fragment: browsers never send it to the server or in Referer headers.
  const link = `${config.appOrigin}/#reset=${token}`
  try {
    await mailer.send({
      to: email,
      subject: 'Reset your Habits password',
      text: `Someone asked to reset the password for your Habits account.\n\nReset it here (valid for 30 minutes, one use):\n${link}\n\nIf this wasn't you, ignore this email; your password stays the same.`,
    })
    return { userId: user.id, emailSent: true }
  } catch (err) {
    logger.error('reset email failed', { userId: user.id, error: err instanceof Error ? err.message : 'unknown' })
    return { userId: user.id, emailSent: false }
  }
}

/** Why a reset link was refused, for the security log (never shown to the user, never the link itself). */
export type ResetFailure = 'unknown' | 'used' | 'expired'

export class ResetLinkError extends HttpError {
  readonly reason: ResetFailure
  constructor(reason: ResetFailure) {
    super(400, 'invalid_reset_link', 'This reset link is invalid or has expired. Request a new one.')
    this.reason = reason
  }
}

/** Sets a new password from a valid reset link, then signs the user out on every device. */
export async function completePasswordReset(deps: AppDeps, token: string, newPassword: string): Promise<string> {
  const { db, now, mailer, logger } = deps
  const at = now()
  const [reset] = await db
    .select({ id: passwordResets.id, userId: passwordResets.userId, email: users.email })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, at)))
  if (!reset) {
    const [known] = await db
      .select({ usedAt: passwordResets.usedAt })
      .from(passwordResets)
      .where(eq(passwordResets.tokenHash, sha256(token)))
    throw new ResetLinkError(!known ? 'unknown' : known.usedAt ? 'used' : 'expired')
  }

  const problem = passwordProblem(newPassword, reset.email)
  if (problem) throw new HttpError(400, 'validation_error', problem, { fields: { newPassword: problem } })
  const passwordHash = await hashPassword(newPassword)

  await db.transaction(async (tx) => {
    // Claim the link atomically so it can only ever be used once.
    const claimed = await tx
      .update(passwordResets)
      .set({ usedAt: at })
      .where(and(eq(passwordResets.id, reset.id), isNull(passwordResets.usedAt)))
      .returning({ id: passwordResets.id })
    if (claimed.length === 0) throw new ResetLinkError('used')
    await tx.update(users).set({ passwordHash, passwordChangedAt: at }).where(eq(users.id, reset.userId))
    await tx.update(passwordResets).set({ usedAt: at }).where(and(eq(passwordResets.userId, reset.userId), isNull(passwordResets.usedAt)))
    await revokeAllSessions(tx, reset.userId, at, 'password_reset')
  })

  try {
    await mailer.send({
      to: reset.email,
      subject: 'Your Habits password was changed',
      text: 'Your password was just changed and you were signed out on all devices.\n\nIf this wasn\'t you, reset your password again right away.',
    })
  } catch (err) {
    logger.error('password-changed email failed', { userId: reset.userId, error: err instanceof Error ? err.message : 'unknown' })
  }
  return reset.userId
}
