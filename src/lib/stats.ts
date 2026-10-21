import type { DateKey, Habit } from '../types'
import { fromDateKey, isScheduled, todayKey, toDateKey } from './dates'

// Safety bound so corrupt data can never loop forever.
const MAX_DAYS = 3660

// The reducer replaces a habit's completions array whenever it changes, so the array itself is a
// perfect cache key: unchanged habits reuse their Set instead of rebuilding it on every render.
const setCache = new WeakMap<readonly DateKey[], ReadonlySet<DateKey>>()

/** Fast membership lookups for a habit's check-in dates (cached per array). */
export function completionSet(days: readonly DateKey[]): ReadonlySet<DateKey> {
  let set = setCache.get(days)
  if (!set) {
    set = new Set(days)
    setCache.set(days, set)
  }
  return set
}

/**
 * Consecutive scheduled days completed, walking back from today.
 * If today is not done yet it doesn't break the streak — counting starts from yesterday.
 */
export function currentStreak(habit: Habit, completions: readonly DateKey[], today: DateKey = todayKey()): number {
  if (completions.length === 0) return 0
  const done = completionSet(completions)
  // Step a single Date backwards rather than parsing a key per day.
  const cursor = fromDateKey(today)
  if (!done.has(today)) cursor.setDate(cursor.getDate() - 1)

  let streak = 0
  for (let i = 0; i < MAX_DAYS; i++, cursor.setDate(cursor.getDate() - 1)) {
    if (!isScheduled(habit, cursor)) continue
    if (!done.has(toDateKey(cursor))) break
    streak++
  }
  return streak
}
