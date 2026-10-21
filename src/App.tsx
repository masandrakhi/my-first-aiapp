import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, ListChecks, Plus } from 'lucide-react'
import clsx from 'clsx'
import type { DateKey, Habit, Theme } from './types'
import { fromDateKey, todayKey } from './lib/dates'
import { HABIT_COLORS } from './lib/palette'
import { useHabits } from './state/HabitsContext'
import { Header } from './components/Header'
import { TodayView } from './components/TodayView'
import { WeeklyGrid } from './components/WeeklyGrid'
import { AddHabitModal } from './components/AddHabitModal'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { Celebration, CelebrationToast } from './components/Celebration'
import { TopProgress } from './components/TopProgress'

type Tab = 'today' | 'week'
type Dialog = { kind: 'add' } | { kind: 'edit'; habit: Habit } | { kind: 'delete'; habit: Habit } | null

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }

/** Today's date key, refreshed when the day rolls over or the tab regains focus. */
function useToday(): DateKey {
  const [today, setToday] = useState(todayKey)
  useEffect(() => {
    const refresh = () => setToday(todayKey())
    const id = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return today
}

function useThemeClass(theme: Theme) {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f0d0b' : '#faf7f2')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

export default function App() {
  const { data, addHabit, updateHabit, deleteHabit, toggleCompletion, reorderHabits, setTheme, setCollapseDone } = useHabits()
  const [tab, setTab] = useState<Tab>('today')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [celebrating, setCelebrating] = useState(false)
  const [burst, setBurst] = useState<{ habitId: string; key: number } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [navigating, setNavigating] = useState(0) // > 0 while the top progress bar shows
  const today = useToday()
  useThemeClass(data.settings.theme)

  const habits = data.habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order)
  const doneToday = habits.filter((h) => data.completions[h.id]?.includes(today)).length

  const toggle = (habit: Habit, date: DateKey) => {
    const wasDone = data.completions[habit.id]?.includes(date) ?? false
    toggleCompletion(habit.id, date)
    // Screen readers hear the result of every check-in (the visuals alone aren't enough).
    const nowDone = date === today ? doneToday + (wasDone ? -1 : 1) : doneToday
    const when = date === today ? 'today' : 'on ' + fromDateKey(date).toLocaleDateString(undefined, { weekday: 'long' })
    setAnnouncement(`${habit.name} ${wasDone ? 'unmarked' : 'done'} ${when}. ${nowDone} of ${habits.length} done today.`)
    if (date !== today || wasDone) return
    // A tiny burst for the first check-off of the day; the big one when the last habit is done.
    if (doneToday === 0) setBurst({ habitId: habit.id, key: Date.now() })
    if (doneToday + 1 === habits.length) setCelebrating(true)
  }

  useEffect(() => {
    if (!burst) return
    const id = window.setTimeout(() => setBurst(null), 900)
    return () => window.clearTimeout(id)
  }, [burst])

  useEffect(() => {
    if (!celebrating) return
    const id = window.setTimeout(() => setCelebrating(false), 2600)
    return () => window.clearTimeout(id)
  }, [celebrating])

  const reorder = (activeId: string, overId: string) => {
    const ids = habits.map((h) => h.id)
    const from = ids.indexOf(activeId)
    const to = ids.indexOf(overId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ...ids.splice(from, 1))
    reorderHabits(ids)
  }

  const switchTab = (next: Tab) => {
    if (next === tab) return
    setTab(next)
    setNavigating((n) => n + 1)
  }

  useEffect(() => {
    if (!navigating) return
    const id = window.setTimeout(() => setNavigating(0), 500)
    return () => window.clearTimeout(id)
  }, [navigating])

  const closeDialog = useCallback(() => setDialog(null), [])
  const openAdd = () => setDialog({ kind: 'add' })

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-32">
      <a
        href="#main"
        className="sr-only rounded-xl bg-accent-600 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to habits
      </a>
      {navigating > 0 && <TopProgress key={navigating} />}
      <Header
        today={today}
        doneToday={doneToday}
        totalToday={habits.length}
        theme={data.settings.theme}
        onCycleTheme={() => setTheme(NEXT_THEME[data.settings.theme])}
      />

      <main id="main" tabIndex={-1} key={tab} className="animate-fade-in outline-none">
        {tab === 'today' ? (
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
            onEdit={(habit) => setDialog({ kind: 'edit', habit })}
            onDelete={(habit) => setDialog({ kind: 'delete', habit })}
          />
        ) : (
          <WeeklyGrid habits={habits} completions={data.completions} today={today} onToggle={toggle} />
        )}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200/70 bg-paper/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg dark:border-white/10 dark:bg-paper-dark/85"
      >
        <div className="mx-auto flex h-18 max-w-xl items-center justify-around px-4">
          <TabButton active={tab === 'today'} onClick={() => switchTab('today')} icon={ListChecks} label="Today" />
          <button
            type="button"
            onClick={openAdd}
            aria-label="Add habit"
            className="-mt-8 grid size-16 place-items-center rounded-full bg-accent-600 text-white shadow-lg shadow-accent-600/40 ring-4 ring-paper transition hover:bg-accent-700 active:scale-95 dark:ring-paper-dark"
          >
            <Plus className="size-7" strokeWidth={2.5} aria-hidden="true" />
          </button>
          <TabButton active={tab === 'week'} onClick={() => switchTab('week')} icon={CalendarDays} label="Week" />
        </div>
      </nav>

      {dialog?.kind === 'add' && (
        <AddHabitModal
          defaultColor={HABIT_COLORS[habits.length % HABIT_COLORS.length]}
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
  icon: typeof ListChecks
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
