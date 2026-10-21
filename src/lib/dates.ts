import type { DateKey, Habit } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local-time date key. Never use toISOString() here: it is UTC and shifts days. */
export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now)
}

export function addDays(key: DateKey, days: number): DateKey {
  const date = fromDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/** Monday of the week containing `key`. */
export function startOfWeek(key: DateKey): DateKey {
  const day = fromDateKey(key).getDay() // 0=Sun
  return addDays(key, -((day + 6) % 7))
}

/** The seven date keys Mon..Sun starting at `weekStart`. */
export function weekDays(weekStart: DateKey): DateKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

export function isScheduled(habit: Habit, key: DateKey): boolean {
  if (habit.frequency.type === 'daily') return true
  return habit.frequency.days.includes(fromDateKey(key).getDay())
}

export function formatLongDate(key: DateKey): string {
  return fromDateKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function formatWeekRange(weekStart: DateKey): string {
  const start = fromDateKey(weekStart)
  const end = fromDateKey(addDays(weekStart, 6))
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`
}
