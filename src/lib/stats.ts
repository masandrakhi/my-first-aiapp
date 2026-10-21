import type { DateKey, Habit } from '../types'
import { addDays, isScheduled, todayKey } from './dates'

// Safety bound so a corrupt createdAt can never loop forever.
const MAX_DAYS = 3660

/**
 * Consecutive scheduled days completed, walking back from today.
 * If today is not done yet it doesn't break the streak — counting starts from yesterday.
 */
export function currentStreak(habit: Habit, completions: DateKey[], today: DateKey = todayKey()): number {
  const done = new Set(completions)
  let day = today
  if (!done.has(day)) day = addDays(day, -1)

  let streak = 0
  for (let i = 0; i < MAX_DAYS; i++, day = addDays(day, -1)) {
    if (!isScheduled(habit, day)) continue
    if (!done.has(day)) break
    streak++
  }
  return streak
}

export function longestStreak(habit: Habit, completions: DateKey[]): number {
  if (completions.length === 0) return 0
  const done = new Set(completions)
  const sorted = [...done].sort()
  let best = 0
  let run = 0
  let day = sorted[0]
  const last = sorted[sorted.length - 1]
  for (let i = 0; i < MAX_DAYS && day <= last; i++, day = addDays(day, 1)) {
    if (!isScheduled(habit, day)) continue
    run = done.has(day) ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}
