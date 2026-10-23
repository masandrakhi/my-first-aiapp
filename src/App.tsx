import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ListChecks, Plus, Sparkles, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import type { Burst, DateKey, Habit, Theme } from './types'
import { formatWeekday } from './lib/dates'
import { colorAt } from './lib/palette'
import { completionSet } from './lib/stats'
import { useHabits } from './state/habitsContext'
import { useClock } from './hooks/useClock'
import { useStableCallback } from './hooks/useStableCallback'
import { useThemeClass } from './hooks/useThemeClass'
import { useAuth, useUser } from './auth/authContext'
import { ImportPrompt } from './components/auth/ImportPrompt'
import { HabitsSkeleton, LoadError, SyncErrorToast } from './components/LoadStates'
import { Header } from './components/Header'
import { TodayView } from './components/TodayView'
import { WeeklyGrid } from './components/WeeklyGrid'
import { CoachView } from './components/coach/CoachView'
import { AddHabitModal } from './components/AddHabitModal'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { Celebration, CelebrationToast } from './components/Celebration'
import { TopProgress } from './components/TopProgress'

type Tab = 'today' | 'week' | 'coach'
type Dialog = { kind: 'add' } | { kind: 'edit'; habit: Habit } | { kind: 'delete'; habit: Habit }

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const BURST_MS = 900
const CELEBRATION_MS = 2600
const TOP_PROGRESS_MS = 500

/** A piece of state that resets to `null` `ms` after being set (for one-shot effects). */
function useTransient<T>(ms: number): [T | null, (value: T) => void] {
  const [value, setValue] = useState<T | null>(null)
  useEffect(() => {
    if (value === null) return
    const id = window.setTimeout(() => setValue(null), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return [value, setValue]
}

export default function App() {
  const { data, status, syncError, dismissSyncError, reload, addHabit, updateHabit, deleteHabit, toggleCompletion, reorderHabits, setTheme, setCollapseDone } = useHabits()
  const user = useUser()
  const { signOut } = useAuth()
  const [tab, setTab] = useState<Tab>('today')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [burst, setBurst] = useTransient<Burst>(BURST_MS)
  const [celebrating, setCelebrating] = useTransient<true>(CELEBRATION_MS)
  const [navigation, setNavigation] = useTransient<number>(TOP_PROGRESS_MS) // a new number replays the bar
  const { today, hour } = useClock()
  useThemeClass(data.settings.theme)

  const habits = useMemo(
    () => data.habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order),
    [data.habits],
  )
  const doneToday = useMemo(
    () => habits.filter((h) => completionSet(data.completions[h.id] ?? []).has(today)).length,
    [habits, data.completions, today],
  )

  const toggle = useStableCallback((habit: Habit, date: DateKey) => {
    const wasDone = completionSet(data.completions[habit.id] ?? []).has(date)
    toggleCompletion(habit.id, date)
    // Screen readers hear the result of every check-in (the visuals alone aren't enough).
    const nowDone = date === today ? doneToday + (wasDone ? -1 : 1) : doneToday
    const when = date === today ? 'today' : `on ${formatWeekday(date)}`
    setAnnouncement(`${habit.name} ${wasDone ? 'unmarked' : 'done'} ${when}. ${nowDone} of ${habits.length} done today.`)
    if (date !== today || wasDone) return
    // A tiny burst for the first check-off of the day; the big one when the last habit is done.
    if (doneToday === 0) setBurst({ habitId: habit.id, key: Date.now() })
    if (doneToday + 1 === habits.length) setCelebrating(true)
  })

  const reorder = useStableCallback((activeId: string, overId: string) => {
    const ids = habits.map((h) => h.id)
    const from = ids.indexOf(activeId)
    const to = ids.indexOf(overId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ...ids.splice(from, 1))
    reorderHabits(ids)
  })

  const switchTab = (next: Tab) => {
    if (next === tab) return
    setTab(next)
    setNavigation(Date.now())
  }

  const closeDialog = useCallback(() => setDialog(null), [])
  const openAdd = useCallback(() => setDialog({ kind: 'add' }), [])
  const openEdit = useCallback((habit: Habit) => setDialog({ kind: 'edit', habit }), [])
  const openDelete = useCallback((habit: Habit) => setDialog({ kind: 'delete', habit }), [])

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-40">
      <a
        href="#main"
        className="sr-only rounded-xl bg-accent-600 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to habits
      </a>
      {navigation !== null && <TopProgress key={navigation} />}
      <Header
        today={today}
        hour={hour}
        doneToday={doneToday}
        totalToday={habits.length}
        theme={data.settings.theme}
        onCycleTheme={() => setTheme(NEXT_THEME[data.settings.theme])}
        user={user}
        onSignOut={() => void signOut()}
      />

      {status === 'ready' && <ImportPrompt onImported={reload} />}

      <main id="main" tabIndex={-1} key={tab} className="animate-fade-in outline-none">
        {status === 'loading' ? (
          <HabitsSkeleton />
        ) : status === 'error' ? (
          <LoadError onRetry={() => void reload()} />
        ) : tab === 'today' ? (
          <TodayView
            habits={habits}
            completions={data.completions}
            today={today}
            burst={burst}
            collapseDone={data.settings.collapseDone}
            onCollapseDoneChange={setCollapseDone}
            onReorder={reorder}
            onToggle={toggle}
            onAdd={openAdd}
            onEdit={openEdit}
            onDelete={openDelete}
          />
        ) : tab === 'week' ? (
          <WeeklyGrid habits={habits} completions={data.completions} today={today} onToggle={toggle} onEdit={openEdit} onDelete={openDelete} />
        ) : (
          <CoachView
            onHabitsAdded={(count) => {
              void reload()
              setAnnouncement(`${count} habit${count === 1 ? '' : 's'} added from the Coach.`)
            }}
          />
        )}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200/70 bg-paper/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg dark:border-white/10 dark:bg-paper-dark/85"
      >
        <div className="relative mx-auto flex h-18 max-w-xl items-center justify-around px-4">
          <TabButton active={tab === 'today'} onClick={() => switchTab('today')} icon={ListChecks} label="Today" />
          <TabButton active={tab === 'week'} onClick={() => switchTab('week')} icon={CalendarDays} label="Week" />
          <TabButton active={tab === 'coach'} onClick={() => switchTab('coach')} icon={Sparkles} label="Coach" />
          {/* Floats in the bottom-right corner above the tabs, in thumb reach. Hidden on the Coach tab,
              where the message box sits there (and the Coach adds habits itself). */}
          {tab !== 'coach' && <button
            type="button"
            onClick={openAdd}
            aria-label="Add habit"
            className="absolute right-4 bottom-full mb-4 grid size-14 place-items-center rounded-2xl bg-accent-600 text-white shadow-lg shadow-accent-600/40 transition hover:bg-accent-700 active:scale-95"
          >
            <Plus className="size-7" strokeWidth={2.5} aria-hidden="true" />
          </button>}
        </div>
      </nav>

      {dialog?.kind === 'add' && (
        <AddHabitModal
          defaultColor={colorAt(habits.length)}
          onClose={closeDialog}
          onSave={(draft) => {
            addHabit(draft)
            closeDialog()
            switchTab('today')
          }}
        />
      )}
      {dialog?.kind === 'edit' && (
        <AddHabitModal
          habit={dialog.habit}
          onClose={closeDialog}
          onSave={(draft) => {
            updateHabit(dialog.habit.id, draft)
            closeDialog()
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete “${dialog.habit.name}”?`}
          message="This removes the habit and all of its history. This can't be undone."
          confirmLabel="Delete"
          onCancel={closeDialog}
          onConfirm={() => {
            deleteHabit(dialog.habit.id)
            closeDialog()
          }}
        />
      )}

      {syncError && <SyncErrorToast message={syncError} onDismiss={dismissSyncError} />}

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {celebrating && (
        <>
          <Celebration />
          <CelebrationToast />
        </>
      )}
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: LucideIcon
  label: string
}

function TabButton({ active, onClick, icon: Icon, label }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex w-20 flex-col items-center gap-1 rounded-2xl py-2 text-xs font-medium transition-colors',
        active ? 'text-accent-600 dark:text-accent-400' : 'text-stone-600 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200',
      )}
    >
      <Icon className="size-6" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
      {label}
    </button>
  )
}
