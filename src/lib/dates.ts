import type { DateKey, Habit } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Monday-first single-letter day names, matching `weekDays()`. */
export const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

/** Local-time date key. Never use toISOString() here: it is UTC and shifts days. */
export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fromDateKey(key: DateKey): Date {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number)
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
  const date = fromDateKey(weekStart)
  return Array.from({ length: 7 }, (_, i) => {
    if (i > 0) date.setDate(date.getDate() + 1)
    return toDateKey(date)
  })
}

export function isScheduled(habit: Habit, day: Date): boolean {
  return habit.frequency.type === 'daily' || habit.frequency.days.includes(day.getDay())
}

const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
const weekdayName = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

/** "Wednesday, October 21" */
export const formatLongDate = (key: DateKey) => longDate.format(fromDateKey(key))
/** "Wednesday, Oct 21" — used in accessible labels for day buttons. */
export const formatDayLabel = (key: DateKey) => dayLabel.format(fromDateKey(key))
/** "Wednesday" */
export const formatWeekday = (key: DateKey) => weekdayName.format(fromDateKey(key))

/** "Oct 19 – Oct 25" */
export function formatWeekRange(weekStart: DateKey): string {
  return `${shortDate.format(fromDateKey(weekStart))} – ${shortDate.format(fromDateKey(addDays(weekStart, 6)))}`
}
