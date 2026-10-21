export type HabitId = string
/** "YYYY-MM-DD" in the user's local time zone. */
export type DateKey = string

export type Frequency = { type: 'daily' } | { type: 'weekly'; days: number[] } // 0=Sun..6=Sat

export interface Habit {
  id: HabitId
  name: string
  emoji: string
  /** Hex accent color, e.g. "#10b981". */
  color: string
  frequency: Frequency
  createdAt: string
  archived: boolean
  order: number
}

export type Theme = 'light' | 'dark' | 'system'

export interface AppData {
  version: 1
  habits: Habit[]
  completions: Record<HabitId, DateKey[]>
  settings: {
    theme: Theme
    /** Whether today's finished habits are folded into a "Done" row. */
    collapseDone: boolean
  }
}
