import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, PartyPopper, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import type { DateKey, Habit, HabitId } from '../types'
import { currentStreak } from '../lib/stats'
import { CheckButton } from './CheckButton'
import { HabitCard, type SortableWiring } from './HabitCard'
import { SortableHabitList } from './SortableHabitList'
import { WeekStrip } from './WeekStrip'

/** How long a just-checked card stays put (so its animation can play) before sinking to Done. */
export const SINK_DELAY_MS = 900

interface TodayViewProps {
  habits: Habit[]
  completions: Record<string, DateKey[]>
  today: DateKey
  /** Fires a mini confetti burst from this habit's check button. */
  burst: { habitId: string; key: number } | null
  collapseDone: boolean
  onCollapseDoneChange: (collapsed: boolean) => void
  /** Move `activeId` to where `overId` is in the overall order. */
  onReorder: (activeId: HabitId, overId: HabitId) => void
  onToggle: (habit: Habit, date: DateKey) => void
  onAdd: () => void
  onEdit: (habit: Habit) => void
  onDelete: (habit: Habit) => void
}

export function TodayView({
  habits, completions, today, burst, collapseDone, onCollapseDoneChange, onReorder, onToggle, onAdd, onEdit, onDelete,
}: TodayViewProps) {
  // Habits checked a moment ago stay in the to-do list until SINK_DELAY_MS passes.
  const [lingering, setLingering] = useState<ReadonlySet<HabitId>>(new Set())
  const timers = useRef(new Map<HabitId, number>())
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((id) => window.clearTimeout(id))
  }, [])

  const doneListId = useId()
  const isDone = (h: Habit) => (completions[h.id] ?? []).includes(today)

  const toggle = (habit: Habit, date: DateKey) => {
    if (date === today && !isDone(habit)) {
      setLingering((s) => new Set(s).add(habit.id))
      window.clearTimeout(timers.current.get(habit.id))
      timers.current.set(
        habit.id,
        window.setTimeout(() => {
          timers.current.delete(habit.id)
          setLingering((s) => {
            const next = new Set(s)
            next.delete(habit.id)
            return next
          })
        }, SINK_DELAY_MS),
      )
    }
    onToggle(habit, date)
  }

  if (habits.length === 0) {
    return (
      <div className="mt-10 flex animate-fade-up flex-col items-center rounded-3xl border-2 border-dashed border-stone-200 px-6 py-14 text-center dark:border-stone-800">
        <div className="mb-4 text-5xl">🌱</div>
        <h2 className="text-xl font-semibold">Small steps, every day</h2>
        <p className="mt-2 max-w-xs text-stone-600 dark:text-stone-400">
          Add a habit you want to build. Check it off daily and watch your streak grow.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-accent-600 px-6 font-semibold text-white shadow-lg shadow-accent-600/30 transition hover:bg-accent-700 active:scale-[0.98]"
        >
          <Sparkles className="size-5" /> Add your first habit
        </button>
      </div>
    )
  }

  const todo = habits.filter((h) => !isDone(h) || lingering.has(h.id))
  const done = habits.filter((h) => isDone(h) && !lingering.has(h.id))

  const renderCard = (habit: Habit, section: 'todo' | 'done') => {
    const days = completions[habit.id] ?? []
    const checked = days.includes(today)
    return (sortable: SortableWiring) => (
      <HabitCard
        habit={habit}
        done={checked}
        streak={currentStreak(habit, days, today)}
        sortable={sortable}
        entering={section === 'done'}
        onEdit={() => onEdit(habit)}
        onDelete={() => onDelete(habit)}
        footer={<WeekStrip habit={habit} completions={days} today={today} onToggle={(date) => toggle(habit, date)} />}
      >
        <CheckButton
          checked={checked}
          color={habit.color}
          label={`Mark ${habit.name} done today`}
          onToggle={() => toggle(habit, today)}
          burstKey={burst?.habitId === habit.id ? burst.key : undefined}
        />
      </HabitCard>
    )
  }

  return (
    <div className="space-y-3">
      {todo.length > 0 ? (
        <SortableHabitList
          label="Habits to do today"
          habits={todo}
          onReorder={onReorder}
          renderItem={(h) => renderCard(h, 'todo')}
        />
      ) : (
        <div className="flex animate-fade-up items-center gap-3 rounded-3xl bg-gradient-to-br from-emerald-700 to-teal-700 p-5 text-white shadow-lg shadow-emerald-700/20">
          <PartyPopper className="size-8 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">All done for today!</p>
            <p className="text-sm text-white">Every habit checked off. See you tomorrow.</p>
          </div>
        </div>
      )}

      {done.length > 0 && (
        <section aria-label="Done today" className="pt-2">
          <button
            type="button"
            onClick={() => onCollapseDoneChange(!collapseDone)}
            aria-expanded={!collapseDone}
            aria-controls={doneListId}
            className="flex w-full items-center gap-2 rounded-2xl px-2 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:bg-stone-800/60"
          >
            <span
              key={done.length}
              className="grid h-6 min-w-6 animate-pop place-items-center rounded-full bg-emerald-700 px-1.5 text-xs text-white tabular-nums"
            >
              {done.length}
            </span>{' '}
            <span className="flex-1 text-left">
              Done <span className="sr-only">today</span> <span aria-hidden="true">✓</span>
            </span>
            <ChevronDown aria-hidden="true" className={clsx('size-5 transition-transform duration-200', !collapseDone && 'rotate-180')} />
          </button>
          {!collapseDone && (
            <div className="mt-2" id={doneListId}>
              <SortableHabitList
                label="Habits done today"
                habits={done}
                onReorder={onReorder}
                renderItem={(h) => renderCard(h, 'done')}
              />
            </div>
          )}
        </section>
      )}
    </div>
  )
}
