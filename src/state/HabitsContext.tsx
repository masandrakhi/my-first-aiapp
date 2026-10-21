import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import type { AppData, DateKey, HabitId, Theme } from '../types'
import { loadData, parseData, saveData, STORAGE_KEY } from '../lib/storage'
import { createHabit, habitsReducer, type HabitDraft } from './habitsReducer'

interface HabitsApi {
  data: AppData
  addHabit: (draft: HabitDraft) => void
  updateHabit: (id: HabitId, changes: Partial<HabitDraft>) => void
  deleteHabit: (id: HabitId) => void
  toggleCompletion: (id: HabitId, date: DateKey) => void
  /** Persist a new display order; `ids` is the full list, first to last. */
  reorderHabits: (ids: HabitId[]) => void
  setTheme: (theme: Theme) => void
  setCollapseDone: (collapsed: boolean) => void
}

const HabitsContext = createContext<HabitsApi | null>(null)

export function HabitsProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(habitsReducer, undefined, loadData)

  // Every change is saved immediately — no save button. The data as loaded is never written back,
  // so opening the app can't overwrite what's stored (only a real change does).
  const loaded = useRef(data)
  useEffect(() => {
    if (data !== loaded.current) saveData(data)
  }, [data])

  // Ask the browser to keep our storage even when disk space runs low (it may decline; that's fine).
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => {})
  }, [])

  // Keep multiple open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        const next = parseData(JSON.parse(e.newValue))
        if (next) dispatch({ type: 'REPLACE', data: next })
      } catch {
        // ignore malformed writes from elsewhere
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const api = useMemo<HabitsApi>(
    () => ({
      data,
      addHabit: (draft) => {
        const nextOrder = Math.max(-1, ...data.habits.map((h) => h.order)) + 1
        dispatch({ type: 'ADD_HABIT', habit: createHabit(draft, nextOrder) })
      },
      updateHabit: (id, changes) => dispatch({ type: 'UPDATE_HABIT', id, changes }),
      deleteHabit: (id) => dispatch({ type: 'DELETE_HABIT', id }),
      toggleCompletion: (id, date) => dispatch({ type: 'TOGGLE_COMPLETION', id, date }),
      reorderHabits: (ids) => dispatch({ type: 'REORDER', ids }),
      setTheme: (theme) => dispatch({ type: 'SET_THEME', theme }),
      setCollapseDone: (collapsed) => dispatch({ type: 'SET_COLLAPSE_DONE', collapsed }),
    }),
    [data],
  )

  return <HabitsContext.Provider value={api}>{children}</HabitsContext.Provider>
}

export function useHabits(): HabitsApi {
  const ctx = useContext(HabitsContext)
  if (!ctx) throw new Error('useHabits must be used inside <HabitsProvider>')
  return ctx
}
