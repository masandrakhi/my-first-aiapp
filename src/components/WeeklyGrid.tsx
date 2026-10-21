import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import type { DateKey, Habit, HabitId } from '../types'
import { addDays, formatWeekRange, fromDateKey, startOfWeek, weekDays } from '../lib/dates'
import { readableTextOn } from '../lib/palette'

interface WeeklyGridProps {
  habits: Habit[]
  completions: Record<HabitId, DateKey[]>
  today: DateKey
  onToggle: (habit: Habit, date: DateKey) => void
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const ROW_DELAY = 70 // ms between rows in the load animation
const DOT_DELAY = 35 // ms between dots in a row

export function WeeklyGrid({ habits, completions, today, onToggle }: WeeklyGridProps) {
  const thisWeek = startOfWeek(today)
  const [weekStart, setWeekStart] = useState(thisWeek)
  const days = weekDays(weekStart)
  const isCurrentWeek = weekStart === thisWeek

  const doneSets = new Map(habits.map((h) => [h.id, new Set(completions[h.id] ?? [])]))
  const elapsedDays = days.filter((d) => d <= today)
  const checkIns = habits.reduce((sum, h) => sum + elapsedDays.filter((d) => doneSets.get(h.id)!.has(d)).length, 0)
  const possible = habits.length * elapsedDays.length
  const perfectDays = new Set(
    habits.length === 0 ? [] : elapsedDays.filter((d) => habits.every((h) => doneSets.get(h.id)!.has(d))),
  )

  return (
    <section aria-label="Weekly summary">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          aria-label="Previous week"
          className="grid size-10 place-items-center rounded-full text-stone-600 hover:bg-stone-200/60 dark:hover:bg-stone-800"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="text-center">
          <p className="font-semibold">{isCurrentWeek ? 'This week' : 'Past week'}</p>
          <p className="text-xs text-stone-600 dark:text-stone-400">{formatWeekRange(weekStart)}</p>
        </div>
        <button
          type="button"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          disabled={isCurrentWeek}
          aria-label="Next week"
          className="grid size-10 place-items-center rounded-full text-stone-600 hover:bg-stone-200/60 disabled:invisible dark:hover:bg-stone-800"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {habits.length === 0 ? (
        <p className="mt-10 animate-fade-up text-center text-stone-600 dark:text-stone-400">
          No habits yet. Add one to see your week fill up.
        </p>
      ) : (
        // Re-keying on the week replays the load animation when paging between weeks.
        <div key={weekStart} className="space-y-4">
          <WeekSummary
            rate={possible === 0 ? 0 : checkIns / possible}
            checkIns={checkIns}
            perfectDays={perfectDays.size}
            daysLeft={7 - elapsedDays.length}
          />

          <div className="animate-fade-up rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-900/5 dark:bg-stone-900 dark:ring-white/10" style={{ animationDelay: '80ms' }}>
            <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden="true">
              {days.map((d, i) => (
                <div key={d} className="flex flex-col items-center gap-0.5">
                  <span className={clsx('text-[11px] font-medium', d === today ? 'text-stone-900 dark:text-white' : 'text-stone-600 dark:text-stone-400')}>
                    {DAY_LETTERS[i]}
                  </span>
                  <span
                    className={clsx(
                      'grid size-6 place-items-center rounded-full text-xs tabular-nums',
                      perfectDays.has(d)
                        ? 'bg-emerald-700 font-semibold text-white'
                        : d === today
                          ? 'font-bold text-stone-900 dark:text-white'
                          : 'text-stone-600 dark:text-stone-400',
                    )}
                    title={perfectDays.has(d) ? 'Perfect day' : undefined}
                  >
                    {fromDateKey(d).getDate()}
                  </span>
                </div>
              ))}
            </div>

            <ul className="divide-y divide-stone-900/5 dark:divide-white/5">
              {habits.map((habit, row) => {
                const done = doneSets.get(habit.id)!
                const count = days.filter((d) => done.has(d)).length
                return (
                  <li
                    key={habit.id}
                    className="animate-fade-up py-3 last:pb-0"
                    style={{ animationDelay: `${120 + row * ROW_DELAY}ms` }}
                  >
                    <div className="mb-2 flex items-center gap-2 text-sm">
                      <span aria-hidden="true">{habit.emoji}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{habit.name}</span>
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 tabular-nums dark:text-stone-300">
                        <span className="size-2 rounded-full" style={{ backgroundColor: habit.color }} aria-hidden="true" />
                        {count}/7
                      </span>
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {days.map((d, col) => (
                        <Dot
                          key={d}
                          habit={habit}
                          date={d}
                          done={done.has(d)}
                          isToday={d === today}
                          isFuture={d > today}
                          delay={180 + row * ROW_DELAY + col * DOT_DELAY}
                          onToggle={() => onToggle(habit, d)}
                        />
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

interface DotProps {
  habit: Habit
  date: DateKey
  done: boolean
  isToday: boolean
  isFuture: boolean
  delay: number
  onToggle: () => void
}

function Dot({ habit, date, done, isToday, isFuture, delay, onToggle }: DotProps) {
  const label = fromDateKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  return (
    <button
      type="button"
      disabled={isFuture}
      aria-pressed={done}
      aria-label={`${habit.name}, ${label}`}
      onClick={onToggle}
      className="group/dot grid h-9 place-items-center rounded-full disabled:cursor-default"
    >
      <span
        className={clsx(
          'grid size-6 animate-dot-in place-items-center rounded-full transition-[background-color,transform] duration-200 group-active/dot:scale-75',
          // Empty days get a 1.5px outline with 3:1+ contrast so the button stays identifiable (WCAG 1.4.11).
          !done && !isFuture && 'border-[1.5px] border-stone-500 group-hover/dot:bg-stone-100 dark:group-hover/dot:bg-stone-800',
          isFuture && 'border-[1.5px] border-dashed border-stone-300 dark:border-stone-700',
        )}
        style={{
          animationDelay: `${delay}ms`,
          ...(done ? { backgroundColor: habit.color } : {}),
          ...(isToday ? { boxShadow: `0 0 0 2px var(--dot-ring-gap), 0 0 0 4px ${habit.color}` } : {}),
        }}
      >
        {done && <Check className="size-3.5" strokeWidth={3.5} style={{ color: readableTextOn(habit.color) }} aria-hidden="true" />}
      </span>
    </button>
  )
}

interface WeekSummaryProps {
  rate: number
  checkIns: number
  perfectDays: number
  daysLeft: number
}

const RING_SIZE = 72
const RING_STROKE = 8
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function WeekSummary({ rate, checkIns, perfectDays, daysLeft }: WeekSummaryProps) {
  // Start empty, then fill — the ring "draws" in when the view loads.
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(rate))
    return () => cancelAnimationFrame(id)
  }, [rate])
  const pct = Math.round(rate * 100)

  return (
    <div className="flex animate-fade-up items-center gap-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-900/5 dark:bg-stone-900 dark:ring-white/10">
      <div className="relative size-18 shrink-0" role="img" aria-label={`${pct}% of check-ins done`}>
        <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="size-full -rotate-90">
          <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" strokeWidth={RING_STROKE} className="stroke-stone-100 dark:stroke-stone-800" />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - shown)}
            className="stroke-emerald-600"
            style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-lg font-bold tabular-nums">{pct}%</span>
      </div>
      <div className="flex-1">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div>
            <dt className="text-xs text-stone-600 dark:text-stone-400">Check-ins</dt>
            <dd className="text-xl font-bold tabular-nums">{checkIns}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-600 dark:text-stone-400">Perfect days</dt>
            <dd className="text-xl font-bold tabular-nums">
              {perfectDays}
              {perfectDays > 0 && <span className="ml-1 text-base" aria-hidden="true">⭐</span>}
            </dd>
          </div>
        </dl>
        <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">{summaryLine(rate, daysLeft)}</p>
      </div>
    </div>
  )
}

function summaryLine(rate: number, daysLeft: number): string {
  if (rate === 1) return 'Flawless so far. Keep it going! 🔥'
  if (rate >= 0.75) return 'Great consistency this week.'
  if (rate >= 0.4) return daysLeft > 0 ? `Solid start — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left to build on it.` : 'Solid week. Small steps add up.'
  if (daysLeft > 0) return 'Every check-in counts. Pick one habit and go.'
  return 'New week, fresh start. You’ve got this.'
}
