import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, PartyPopper, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import type { Burst, Completions, DateKey, Habit, HabitId } from '../types'
import { completionSet, currentStreak } from '../lib/stats'
import { useStableCallback } from '../hooks/useStableCallback'
import { useSortableWiring } from '../hooks/useSortableWiring'
import { CheckButton } from './CheckButton'
import { HabitCard } from './HabitCard'
import { SortableHabitList } from './SortableHabitList'
import { WeekStrip } from './WeekStrip'

/** How long a just-checked card stays put (so its animation can play) before sinking to Done. */
export const SINK_DELAY_MS = 900

const NO_DAYS: readonly DateKey[] = []

interface TodayViewProps {
  habits: readonly Habit[]
  completions: Completions
  today: DateKey
  /** Fires a mini confetti burst from this habit's check button. */
  burst: Burst | null
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
  const [lingering, setLingering] = useState<ReadonlySet<HabitId>>(() => new Set())
  const timers = useRef(new Map<HabitId, number>())
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((id) => window.clearTimeout(id))
  }, [])

  const doneListId = useId()
  const isDone = (id: HabitId) => completionSet(completions[id] ?? NO_DAYS).has(today)

  // Stable identity so memoized rows don't re-render when an unrelated habit changes.
  const toggle = useStableCallback((habit: Habit, date: DateKey) => {
    if (date === today && !isDone(habit.id)) {
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
  })

  const { todo, done } = useMemo(() => {
    const todo: Habit[] = []
    const done: Habit[] = []
    for (const h of habits) {
      const checked = completionSet(completions[h.id] ?? NO_DAYS).has(today)
      ;(checked && !lingering.has(h.id) ? done : todo).push(h)
    }
    return { todo, done }
  }, [habits, completions, today, lingering])

  // dnd-kit re-renders every sortable item when `items` changes identity, so keep each id list
  // referentially stable unless its contents actually change.
  const todoIds = useStableIds(todo)
  const doneIds = useStableIds(done)

  if (habits.length === 0) {
    return (
      <div className="mt-10 flex animate-fade-up flex-col items-center rounded-3xl border-2 border-dashed border-stone-200 px-6 py-14 text-center dark:border-stone-800">
        <div className="mb-4 text-5xl" aria-hidden="true">🌱</div>
        <h2 className="text-xl font-semibold">Small steps, every day</h2>
        <p className="mt-2 max-w-xs text-stone-600 dark:text-stone-400">
          Add a habit you want to build. Check it off daily and watch your streak grow.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-accent-600 px-6 font-semibold text-white shadow-lg shadow-accent-600/30 transition hover:bg-accent-700 active:scale-[0.98]"
        >
          <Sparkles className="size-5" aria-hidden="true" /> Add your first habit
        </button>
      </div>
    )
  }

  const rows = (list: Habit[], section: Section) =>
    list.map((habit) => (
      <HabitRow
        key={habit.id}
        habit={habit}
        days={completions[habit.id] ?? NO_DAYS}
        today={today}
        section={section}
        burstKey={burst?.habitId === habit.id ? burst.key : undefined}
        onToggle={toggle}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    ))

  return (
    <div className="space-y-3">
      {todo.length > 0 ? (
        <SortableHabitList label="Habits to do today" ids={todoIds} onReorder={onReorder}>
          {rows(todo, 'todo')}
        </SortableHabitList>
      ) : (
        <div className="flex animate-fade-up items-center gap-3 rounded-3xl bg-gradient-to-br from-emerald-700 to-teal-700 p-5 text-white shadow-lg shadow-emerald-700/20">
          <PartyPopper className="size-8 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">All done for today!</p>
            <p className="text-sm">Every habit checked off. See you tomorrow.</p>
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
              <SortableHabitList label="Habits done today" ids={doneIds} onReorder={onReorder}>
                {rows(done, 'done')}
              </SortableHabitList>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

type Section = 'todo' | 'done'

/** The habits' ids, as the same array instance for as long as the ids (and their order) are unchanged. */
function useStableIds(habits: readonly Habit[]): HabitId[] {
  const key = habits.map((h) => h.id).join('\n')
  return useMemo(() => (key ? key.split('\n') : []), [key])
}

interface HabitRowProps {
  habit: Habit
  days: readonly DateKey[]
  today: DateKey
  section: Section
  burstKey: number | undefined
  onToggle: (habit: Habit, date: DateKey) => void
  onEdit: (habit: Habit) => void
  onDelete: (habit: Habit) => void
}

/**
 * One draggable habit card. Memoized: toggling a habit re-renders only that habit's row, because
 * every other row receives the same `habit`/`days` references and stable callbacks.
 */
const HabitRow = memo(function HabitRow({
  habit, days, today, section, burstKey, onToggle, onEdit, onDelete,
}: HabitRowProps) {
  const sortable = useSortableWiring(habit.id)
  const checked = completionSet(days).has(today)
  const streak = useMemo(() => currentStreak(habit, days, today), [habit, days, today])

  return (
    <HabitCard
      habit={habit}
      done={checked}
      streak={streak}
      sortable={sortable}
      entering={section === 'done'}
      onEdit={() => onEdit(habit)}
      onDelete={() => onDelete(habit)}
      footer={<WeekStrip habit={habit} completions={days} today={today} onToggle={(date) => onToggle(habit, date)} />}
    >
      <CheckButton
        checked={checked}
        color={habit.color}
        label={`Mark ${habit.name} done today`}
        onToggle={() => onToggle(habit, today)}
        burstKey={burstKey}
      />
    </HabitCard>
  )
})
