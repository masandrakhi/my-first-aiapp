import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { AppData, Habit } from '../types'
import { THEME_KEY } from '../config'
import { defaultData } from '../lib/appData'
import { ApiError } from '../auth/apiClient'
import { logError, refSuffix } from '../lib/log'
import { useAuth } from '../auth/authContext'
import { habitsReducer } from './habitsReducer'
import { HabitsContext, type HabitActions, type HabitsApi } from './habitsContext'

const rememberTheme = (theme: string) => {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // storage blocked — the theme still applies for this visit
  }
}

/**
 * Holds the signed-in user's habits. The server is the source of truth: changes apply to the
 * screen immediately (optimistic) and are sent in order; if one fails, everything is reloaded.
 * Habit data is never written to the device's storage.
 */
export function HabitsProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth()
  const [data, dispatch] = useReducer(habitsReducer, undefined, defaultData)
  const [status, setStatus] = useState<HabitsApi['status']>('loading')
  const [syncError, setSyncError] = useState<string | null>(null)
  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  const reload = useCallback(async () => {
    try {
      const server = await api.request<Omit<AppData, 'version'>>('GET', '/api/habits')
      dispatch({ type: 'REPLACE', data: { version: 1, ...server } })
      rememberTheme(server.settings.theme)
      setStatus('ready')
    } catch (err) {
      // A 401 already switched the app to the sign-in page; anything else is shown here.
      if (!(err instanceof ApiError && err.status === 401)) {
        logError('loading habits failed', err)
        setStatus('error')
      }
    }
  }, [api])

  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    void reload()
  }, [reload])

  // Saves run one at a time, in the order the user made them.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const save = useCallback((what: string, send: () => Promise<unknown>) => {
    queue.current = queue.current.then(async () => {
      try {
        await send()
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return
        logError(`saving failed: ${what}`, err)
        setSyncError(`Couldn't save your last change${refSuffix(err)}. Showing your latest saved habits.`)
        await reload()
      }
    })
  }, [reload])

  const actions = useMemo<HabitActions>(() => ({
    addHabit: (draft) =>
      save('add habit', async () => {
        const habit = await api.request<Habit>('POST', '/api/habits', draft)
        dispatch({ type: 'ADD_HABIT', habit })
      }),
    updateHabit: (id, changes) => {
      dispatch({ type: 'UPDATE_HABIT', id, changes })
      save('update habit', () => api.request('PATCH', `/api/habits/${id}`, changes))
    },
    deleteHabit: (id) => {
      dispatch({ type: 'DELETE_HABIT', id })
      save('delete habit', () => api.request('DELETE', `/api/habits/${id}`))
    },
    toggleCompletion: (id, date) => {
      const wasDone = dataRef.current.completions[id]?.includes(date) ?? false
      dispatch({ type: 'TOGGLE_COMPLETION', id, date })
      save('check-in', () => api.request(wasDone ? 'DELETE' : 'PUT', `/api/habits/${id}/completions/${date}`))
    },
    reorderHabits: (ids) => {
      dispatch({ type: 'REORDER', ids })
      save('reorder', () => api.request('PUT', '/api/habits/order', { ids }))
    },
    setTheme: (theme) => {
      dispatch({ type: 'SET_THEME', theme })
      rememberTheme(theme)
      save('theme', () => api.request('PATCH', '/api/me/settings', { theme }))
    },
    setCollapseDone: (collapsed) => {
      dispatch({ type: 'SET_COLLAPSE_DONE', collapsed })
      save('done section', () => api.request('PATCH', '/api/me/settings', { collapseDone: collapsed }))
    },
    reload,
    dismissSyncError: () => setSyncError(null),
  }), [api, save, reload])

  const value = useMemo<HabitsApi>(() => ({ data, status, syncError, ...actions }), [data, status, syncError, actions])
  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>
}
