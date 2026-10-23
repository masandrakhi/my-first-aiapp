import { eq, sql } from 'drizzle-orm'
import { rateLimits } from '../db/schema.js'
import type { AppDeps } from '../deps.js'
import { DAY, HOUR, MINUTE } from '../config.js'
import { hmacKey } from './crypto.js'

export interface Limit {
  name: string
  max: number
  windowMs: number
}

export const LIMITS = {
  loginPerIp: { name: 'login-ip', max: 20, windowMs: 15 * MINUTE },
  loginFailuresPerEmail: { name: 'login-email', max: 5, windowMs: 15 * MINUTE },
  registerPerIp: { name: 'register-ip', max: 5, windowMs: HOUR },
  forgotPerEmail: { name: 'forgot-email', max: 3, windowMs: HOUR },
  forgotPerIp: { name: 'forgot-ip', max: 10, windowMs: HOUR },
  resetPerIp: { name: 'reset-ip', max: 10, windowMs: HOUR },
  refreshPerIp: { name: 'refresh-ip', max: 60, windowMs: 15 * MINUTE },
  // The Coach (per user): chat volume, confirmations, and habits it may create in a day.
  chatPerUser: { name: 'chat-user', max: 20, windowMs: 15 * MINUTE },
  chatPerUserDay: { name: 'chat-user-day', max: 100, windowMs: DAY },
  coachConfirmPerUser: { name: 'coach-confirm', max: 10, windowMs: HOUR },
  coachHabitsPerDay: { name: 'coach-habits-day', max: 20, windowMs: DAY },
} satisfies Record<string, Limit>

export interface LimitState {
  allowed: boolean
  retryAfterSec: number
}

const keyFor = (deps: AppDeps, limit: Limit, subject: string) => `${limit.name}:${hmacKey(deps.config.ipHashSecret, subject)}`

/** Counts `amount` attempts (default one) in a fixed window and says whether it is still within the limit. */
export async function consume(deps: AppDeps, limit: Limit, subject: string, amount = 1): Promise<LimitState> {
  const at = deps.now()
  const windowOpenedBefore = new Date(at.getTime() - limit.windowMs)
  const expired = sql`${rateLimits.windowStart} <= ${windowOpenedBefore}`
  const [row] = await deps.db
    .insert(rateLimits)
    .values({ key: keyFor(deps, limit, subject), windowStart: at, count: amount })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then ${amount} else ${rateLimits.count} + ${amount} end`,
        windowStart: sql`case when ${expired} then ${at} else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart })
  return state(limit, row!.windowStart, at, row!.count <= limit.max)
}

/** Checks a limit without counting (used to refuse logins once too many have failed). */
export async function peek(deps: AppDeps, limit: Limit, subject: string): Promise<LimitState> {
  const at = deps.now()
  const [row] = await deps.db.select().from(rateLimits).where(eq(rateLimits.key, keyFor(deps, limit, subject)))
  if (!row || row.windowStart.getTime() + limit.windowMs <= at.getTime()) return { allowed: true, retryAfterSec: 0 }
  return state(limit, row.windowStart, at, row.count < limit.max)
}

export async function clear(deps: AppDeps, limit: Limit, subject: string) {
  await deps.db.delete(rateLimits).where(eq(rateLimits.key, keyFor(deps, limit, subject)))
}

function state(limit: Limit, windowStart: Date, at: Date, allowed: boolean): LimitState {
  const retryAfterSec = Math.max(1, Math.ceil((windowStart.getTime() + limit.windowMs - at.getTime()) / 1000))
  return { allowed, retryAfterSec: allowed ? 0 : retryAfterSec }
}
