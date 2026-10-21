import clsx from 'clsx'
import { Check } from 'lucide-react'
import type { DateKey, Habit } from '../types'
import { fromDateKey, startOfWeek, weekDays } from '../lib/dates'
import { readableTextOn } from '../lib/palette'

interface WeekStripProps {
  habit: Habit
  completions: DateKey[]
  today: DateKey
  onToggle: (date: DateKey) => void
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** This week's Mon–Sun as small tappable days, so a forgotten check-in can be logged later. */
export function WeekStrip({ habit, completions, today, onToggle }: WeekStripProps) {
  const done = new Set(completions)
  const days = weekDays(startOfWeek(today))

  return (
    <div className="mt-3 grid grid-cols-7 gap-1 border-t border-stone-900/5 pt-3 dark:border-white/10" role="group" aria-label={`${habit.name} this week`}>
      {days.map((d, i) => {
        const isDone = done.has(d)
        const isToday = d === today
        const isFuture = d > today
        const label = fromDateKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
        return (
          <button
            key={d}
            type="button"
            disabled={isFuture}
            aria-pressed={isDone}
            aria-label={`${habit.name}, ${label}`}
            onClick={() => onToggle(d)}
            className="group/day flex flex-col items-center gap-1 rounded-xl py-1 disabled:cursor-not-allowed"
          >
            <span
              className={clsx(
                'text-[11px] font-medium',
                isToday ? 'font-bold text-stone-900 dark:text-white' : 'text-stone-600 dark:text-stone-400',
              )}
            >
              {DAY_LETTERS[i]}
            </span>
            <span
              className={clsx(
                'grid size-7 place-items-center rounded-full transition-all duration-200 group-active/day:scale-90',
                !isDone && !isFuture && 'border-[1.5px] border-stone-500 group-hover/day:bg-stone-100 dark:group-hover/day:bg-stone-800',
                isFuture && 'border-[1.5px] border-dashed border-stone-300 dark:border-stone-700',
              )}
              style={{
                ...(isDone ? { backgroundColor: habit.color } : {}),
                ...(isToday ? { boxShadow: `0 0 0 2px ${habit.color}` } : {}),
              }}
            >
              {isDone && <Check className="size-3.5" strokeWidth={3.5} style={{ color: readableTextOn(habit.color) }} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
