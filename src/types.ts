import type { CSSProperties } from 'react'

export type HabitId = string
/** "YYYY-MM-DD" in the user's local time zone. */
export type DateKey = string

export type Frequency = { type: 'daily' } | { type: 'weekly'; days: number[] } // 0=Sun..6=Sat

export interface Habit {
  id: HabitId
  name: string
  emoji: string
  /** Hex accent color, e.g. "#059669". */
  color: string
  frequency: Frequency
  createdAt: string
  archived: boolean
  order: number
}

export type Theme = 'light' | 'dark' | 'system'

/** Check-in dates per habit, kept sorted ascending. */
export type Completions = Record<HabitId, DateKey[]>

export interface AppData {
  version: 1
  habits: Habit[]
  completions: Completions
  settings: {
    theme: Theme
    /** Whether today's finished habits are folded into a "Done" row. */
    collapseDone: boolean
  }
}

/** A one-off confetti pop from a habit's check button; a new `key` replays it. */
export interface Burst {
  habitId: HabitId
  key: number
}

/** Inline styles that also set CSS custom properties (e.g. `--x`), without unsafe casts. */
export interface CSSVars extends CSSProperties {
  [name: `--${string}`]: string | number | undefined
}
