import type { DateKey } from '../types'
import { fromDateKey } from './dates'

export const MESSAGES = [
  'Small steps still move you forward.',
  'Show up today. That’s the whole trick.',
  'Progress, not perfection.',
  'You don’t have to be great to start.',
  'One good day at a time.',
  'Tiny wins add up to big change.',
  'Consistency beats intensity.',
  'Future you says thanks.',
  'Do it for the streak.',
  'Done is better than perfect.',
  'Keep the chain unbroken.',
  'A little every day goes a long way.',
  'Be proud of the small stuff.',
  'Today counts.',
  'Habits are built, not born.',
  'Make it easy. Make it daily.',
  'Every check-in is a vote for who you’re becoming.',
  'Start where you are.',
  'Momentum loves company.',
  'Missed yesterday? Today’s a fresh start.',
  'Slow progress is still progress.',
  'You’ve done hard things before.',
  'Keep going — it’s working.',
  'Discipline is just remembering what you want.',
  'Little by little, then all at once.',
  'Your routine is your superpower.',
  'Two minutes is enough to begin.',
  'Celebrate showing up.',
  'Steady wins.',
  'Build the life you want, one day at a time.',
] as const

const MS_PER_DAY = 86_400_000

/** The same message all day, a different one tomorrow. */
export function messageForDay(key: DateKey): string {
  const date = fromDateKey(key)
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY)
  return MESSAGES[dayNumber % MESSAGES.length] ?? MESSAGES[0]
}
