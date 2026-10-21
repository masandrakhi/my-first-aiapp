import type { AppData, DateKey, Habit, HabitId, Theme } from '../types'

export type HabitDraft = Pick<Habit, 'name' | 'emoji' | 'color'>

export type Action =
  /** The reducer assigns `order` (after the last habit), so callers needn't know the list. */
  | { type: 'ADD_HABIT'; habit: Habit }
  | { type: 'UPDATE_HABIT'; id: HabitId; changes: Partial<HabitDraft> }
  | { type: 'DELETE_HABIT'; id: HabitId }
  | { type: 'TOGGLE_COMPLETION'; id: HabitId; date: DateKey }
  | { type: 'REORDER'; ids: readonly HabitId[] }
  | { type: 'SET_THEME'; theme: Theme }
  | { type: 'SET_COLLAPSE_DONE'; collapsed: boolean }
  | { type: 'REPLACE'; data: AppData }

export function habitsReducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'ADD_HABIT': {
      const order = Math.max(-1, ...state.habits.map((h) => h.order)) + 1
      return { ...state, habits: [...state.habits, { ...action.habit, order }] }
    }

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
      // Only this habit's array is replaced, so every other habit keeps its cached stats.
      const days = state.completions[action.id] ?? []
      const next = days.includes(action.date)
        ? days.filter((d) => d !== action.date)
        : [...days, action.date].sort()
      return { ...state, completions: { ...state.completions, [action.id]: next } }
    }

    case 'REORDER': {
      // Habits missing from `ids` keep their relative order after the listed ones.
      const rank = new Map(action.ids.map((id, i) => [id, i]))
      const position = (h: Habit) => rank.get(h.id) ?? action.ids.length + h.order
      const sorted = [...state.habits].sort((a, b) => position(a) - position(b))
      return { ...state, habits: sorted.map((h, i) => (h.order === i ? h : { ...h, order: i })) }
    }

    case 'SET_THEME':
      return { ...state, settings: { ...state.settings, theme: action.theme } }

    case 'SET_COLLAPSE_DONE':
      return { ...state, settings: { ...state.settings, collapseDone: action.collapsed } }

    case 'REPLACE':
      return action.data

    default: {
      // Compile-time guarantee that every action type is handled above.
      const unhandled: never = action
      return unhandled
    }
  }
}

/** A new daily habit. Impure (random id, timestamp), so call it outside the reducer. */
export function createHabit(draft: HabitDraft, order = 0): Habit {
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
