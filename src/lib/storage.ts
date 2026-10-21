import type { AppData, Habit } from '../types'
import { migrateColor } from './palette'

export const STORAGE_KEY = 'habit-tracker:v1'

export function defaultData(): AppData {
  return { version: 1, habits: [], completions: {}, settings: { theme: 'system', collapseDone: true } }
}

function isHabit(value: unknown): value is Habit {
  const h = value as Habit
  return (
    typeof h === 'object' && h !== null &&
    typeof h.id === 'string' && typeof h.name === 'string' &&
    typeof h.emoji === 'string' && typeof h.color === 'string' &&
    typeof h.frequency === 'object' && h.frequency !== null
  )
}

/** Returns a valid AppData or null if `raw` can't be trusted. */
export function parseData(raw: unknown): AppData | null {
  const d = raw as AppData
  if (typeof d !== 'object' || d === null || d.version !== 1) return null
  if (!Array.isArray(d.habits) || !d.habits.every(isHabit)) return null
  if (typeof d.completions !== 'object' || d.completions === null) return null
  const completions: AppData['completions'] = {}
  for (const [id, days] of Object.entries(d.completions)) {
    if (Array.isArray(days)) completions[id] = days.filter((k): k is string => typeof k === 'string')
  }
  const theme = d.settings?.theme
  return {
    version: 1,
    habits: d.habits.map((h) => ({ ...h, color: migrateColor(h.color) })),
    completions,
    settings: {
      theme: theme === 'light' || theme === 'dark' ? theme : 'system',
      collapseDone: d.settings?.collapseDone !== false,
    },
  }
}

export const BACKUP_PREFIX = `${STORAGE_KEY}:backup:`

export function loadData(): AppData {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return defaultData() // storage blocked
  }
  if (!raw) return defaultData()
  try {
    const parsed = parseData(JSON.parse(raw))
    if (parsed) return parsed
  } catch {
    // fall through to backup
  }
  // Never silently lose data: the app is about to save defaults over this key, so keep a copy first.
  try {
    localStorage.setItem(BACKUP_PREFIX + Date.now(), raw)
  } catch {
    // storage full — nothing more we can do
  }
  return defaultData()
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Storage full or blocked (private mode) — keep running in memory.
  }
}
