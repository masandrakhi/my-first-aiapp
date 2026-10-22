import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { Check, Flame, GripVertical } from 'lucide-react'
import clsx from 'clsx'
import type { Habit } from '../types'
import { HabitMenu } from './HabitMenu'

interface HabitCardProps {
  habit: Habit
  done: boolean
  streak: number
  onEdit: () => void
  onDelete: () => void
  /** The check button. */
  children: ReactNode
  /** Shown under the main row (the week strip). */
  footer?: ReactNode
  /** Wiring from the drag-and-drop list. */
  sortable?: SortableWiring
  /** Fade in on mount (used when a card moves into the Done section). */
  entering?: boolean
}

export interface SortableWiring {
  ref: (node: HTMLLIElement | null) => void
  style: CSSProperties
  dragging: boolean
  /** Spread onto the drag handle: pointer, touch and keyboard listeners plus a11y attributes. */
  handleProps: HTMLAttributes<HTMLButtonElement>
}

export function HabitCard({ habit, done, streak, onEdit, onDelete, children, footer, sortable, entering }: HabitCardProps) {
  // Pulse the flame whenever the streak grows.
  const prevStreak = useRef(streak)
  const [pulse, setPulse] = useState(0)
  useEffect(() => {
    if (streak > prevStreak.current) setPulse((p) => p + 1)
    prevStreak.current = streak
  }, [streak])

  // Give the whole card a little bounce when it becomes done.
  const prevDone = useRef(done)
  const [bouncing, setBouncing] = useState(false)
  useEffect(() => {
    if (done && !prevDone.current) setBouncing(true)
    prevDone.current = done
  }, [done])

  return (
    <li
      ref={sortable?.ref}
      style={sortable?.style}
      onAnimationEnd={(e) => e.target === e.currentTarget && setBouncing(false)}
      className={clsx(
        'group relative rounded-3xl p-4 ring-1 transition-colors duration-300',
        sortable && 'pl-7',
        done
          ? 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-800/60'
          : 'bg-white shadow-sm ring-stone-900/5 dark:bg-stone-900 dark:ring-white/10',
        bouncing && 'animate-card-bounce',
        entering && 'animate-fade-up',
        sortable?.dragging && 'z-20 scale-[1.02] shadow-xl ring-accent-300 dark:ring-accent-700',
      )}
    >
      {sortable && (
        <button
          type="button"
          aria-label={`Reorder ${habit.name}`}
          {...sortable.handleProps}
          className={clsx(
            'absolute top-4 left-0.5 grid h-12 w-6 touch-none place-items-center rounded-lg text-stone-600 transition-colors',
            'hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200',
            sortable.dragging ? 'cursor-grabbing text-accent-600 dark:text-accent-300' : 'cursor-grab',
          )}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <div className="flex items-center gap-4">
        <div
          className="relative grid size-12 shrink-0 place-items-center rounded-2xl text-2xl"
          style={{ backgroundColor: habit.color + '22' }}
          aria-hidden="true"
        >
          {habit.emoji}
          {done && (
            <span className="absolute -right-1.5 -bottom-1.5 grid size-5 animate-badge-in place-items-center rounded-full bg-emerald-600 text-white ring-2 ring-emerald-50 dark:ring-emerald-950">
              <Check className="size-3" strokeWidth={3.5} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={clsx(
              'truncate font-semibold transition-colors',
              done && 'text-emerald-900/80 dark:text-emerald-100/80',
            )}
          >
            {habit.name}
          </p>
          {streak > 0 ? (
            <p className="mt-0.5 flex items-center gap-1 text-sm font-medium text-stone-700 dark:text-stone-300">
              <Flame
                key={pulse}
                className={clsx('size-4', pulse > 0 && 'animate-flame')}
                style={{ color: habit.color }}
                fill="currentColor"
                aria-hidden="true"
              />
              <span>
                {streak} day{streak === 1 ? '' : 's'}
                <span className="sr-only"> streak</span>
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">Start a streak</p>
          )}
        </div>

        <HabitMenu habitName={habit.name} onEdit={onEdit} onDelete={onDelete} />

        {children}
      </div>
      {footer}
    </li>
  )
}
