import { createContext, useContext } from 'react'
import type { AppData, DateKey, HabitId, Theme } from '../types'
import type { HabitDraft } from './habitsReducer'

/** Stable action functions: identity never changes, so they're safe in memo deps and props. */
export interface HabitActions {
  addHabit: (draft: HabitDraft) => void
  updateHabit: (id: HabitId, changes: Partial<HabitDraft>) => void
  deleteHabit: (id: HabitId) => void
  toggleCompletion: (id: HabitId, date: DateKey) => void
  /** Persist a new display order; `ids` is the full list, first to last. */
  reorderHabits: (ids: readonly HabitId[]) => void
  setTheme: (theme: Theme) => void
  setCollapseDone: (collapsed: boolean) => void
}

export interface HabitsApi extends HabitActions {
  data: AppData
}

export const HabitsContext = createContext<HabitsApi | null>(null)

export function useHabits(): HabitsApi {
  const ctx = useContext(HabitsContext)
  if (!ctx) throw new Error('useHabits must be used inside <HabitsProvider>')
  return ctx
}
