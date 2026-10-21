import { useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { loadData, parseData, saveData, STORAGE_KEY } from '../lib/storage'
import { createHabit, habitsReducer } from './habitsReducer'
import { HabitsContext, type HabitActions } from './habitsContext'

export function HabitsProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(habitsReducer, undefined, loadData)

  // Every change is saved immediately — no save button. The data as loaded is never written back,
  // so opening the app can't overwrite what's stored (only a real change does), and identical
  // content (e.g. a sync from another tab) isn't rewritten, which also stops tabs echoing each other.
  const loaded = useRef(data)
  const lastWritten = useRef<string | null>(null)
  useEffect(() => {
    if (data === loaded.current) return
    const json = JSON.stringify(data)
    if (json !== lastWritten.current) lastWritten.current = saveData(data)
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
        if (!next) return
        lastWritten.current = JSON.stringify(next)
        dispatch({ type: 'REPLACE', data: next })
      } catch {
        // ignore malformed writes from elsewhere
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // `dispatch` is stable, so the actions are created once for the app's lifetime.
  const actions = useMemo<HabitActions>(
    () => ({
      addHabit: (draft) => dispatch({ type: 'ADD_HABIT', habit: createHabit(draft) }),
      updateHabit: (id, changes) => dispatch({ type: 'UPDATE_HABIT', id, changes }),
      deleteHabit: (id) => dispatch({ type: 'DELETE_HABIT', id }),
      toggleCompletion: (id, date) => dispatch({ type: 'TOGGLE_COMPLETION', id, date }),
      reorderHabits: (ids) => dispatch({ type: 'REORDER', ids }),
      setTheme: (theme) => dispatch({ type: 'SET_THEME', theme }),
      setCollapseDone: (collapsed) => dispatch({ type: 'SET_COLLAPSE_DONE', collapsed }),
    }),
    [],
  )

  const value = useMemo(() => ({ data, ...actions }), [data, actions])
  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>
}
