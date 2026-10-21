import type { AppData, DateKey, Habit, HabitId, Theme } from '../types'

export type HabitDraft = Pick<Habit, 'name' | 'emoji' | 'color'>

export type Action =
  | { type: 'ADD_HABIT'; habit: Habit }
  | { type: 'UPDATE_HABIT'; id: HabitId; changes: Partial<HabitDraft> }
  | { type: 'DELETE_HABIT'; id: HabitId }
  | { type: 'TOGGLE_COMPLETION'; id: HabitId; date: DateKey }
  | { type: 'REORDER'; ids: HabitId[] }
  | { type: 'SET_THEME'; theme: Theme }
  | { type: 'SET_COLLAPSE_DONE'; collapsed: boolean }
  | { type: 'REPLACE'; data: AppData }

export function habitsReducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'ADD_HABIT':
      return { ...state, habits: [...state.habits, action.habit] }

    case 'UPDATE_HABIT':
      return {
        ...state,
        habits: state.habits.map((h) => (h.id === action.id ? { ...h, ...action.changes } : h)),
      }

    case 'DELETE_HABIT': {
      const { [action.id]: _removed, ...completions } = state.completions
      return { ...state, habits: state.habits.filter((h) => h.id !== action.id), completions }
    }

    case 'TOGGLE_COMPLETION': {
      const days = state.completions[action.id] ?? []
      const next = days.includes(action.date)
        ? days.filter((d) => d !== action.date)
        : [...days, action.date].sort()
      return { ...state, completions: { ...state.completions, [action.id]: next } }
    }

    case 'REORDER': {
      // Habits missing from `ids` keep their relative order after the listed ones.
      const rank = new Map(action.ids.map((id, i) => [id, i]))
      const sorted = [...state.habits].sort(
        (a, b) => (rank.get(a.id) ?? action.ids.length + a.order) - (rank.get(b.id) ?? action.ids.length + b.order),
      )
      return { ...state, habits: sorted.map((h, i) => (h.order === i ? h : { ...h, order: i })) }
    }

    case 'SET_THEME':
      return { ...state, settings: { ...state.settings, theme: action.theme } }

    case 'SET_COLLAPSE_DONE':
      return { ...state, settings: { ...state.settings, collapseDone: action.collapsed } }

    case 'REPLACE':
      return action.data
  }
}

export function createHabit(draft: HabitDraft, order: number): Habit {
  return {
    id: crypto.randomUUID(),
    name: draft.name.trim(),
    emoji: draft.emoji,
    color: draft.color,
    frequency: { type: 'daily' },
    createdAt: new Date().toISOString(),
    archived: false,
    order,
  }
}
