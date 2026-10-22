/**
 * Pure helpers for the AppData format, with no browser APIs, so the API server can reuse them
 * (for example to validate a device's legacy data during import).
 */
import type { AppData, Completions, Frequency, Habit } from '../types'
import { migrateColor } from './palette'

export function defaultData(): AppData {
  return { version: 1, habits: [], completions: {}, settings: { theme: 'system', collapseDone: true } }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function parseFrequency(v: unknown): Frequency {
  if (isRecord(v) && v.type === 'weekly' && Array.isArray(v.days)) {
    return { type: 'weekly', days: v.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) }
  }
  return { type: 'daily' }
}

/**
 * A habit with all required fields, or null when the essentials (id, name) are missing.
 * Optional-ish fields get sensible defaults so older or hand-edited data still loads.
 */
function parseHabit(v: unknown, index: number): Habit | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null
  return {
    id: v.id,
    name: v.name,
    emoji: typeof v.emoji === 'string' ? v.emoji : '✨',
    color: migrateColor(typeof v.color === 'string' ? v.color : '#9333ea'),
    frequency: parseFrequency(v.frequency),
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : new Date(0).toISOString(),
    archived: v.archived === true,
    order: typeof v.order === 'number' && Number.isFinite(v.order) ? v.order : index,
  }
}

/** Returns a valid AppData or null if `raw` can't be trusted. */
export function parseData(raw: unknown): AppData | null {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.habits) || !isRecord(raw.completions)) return null
  const habits = raw.habits.map(parseHabit)
  if (habits.some((h) => h === null)) return null

  const completions: Completions = {}
  for (const [id, days] of Object.entries(raw.completions)) {
    if (Array.isArray(days)) {
      completions[id] = [...new Set(days.filter((k): k is string => typeof k === 'string' && DATE_KEY.test(k)))].sort()
    }
  }
  const settings = isRecord(raw.settings) ? raw.settings : {}
  return {
    version: 1,
    habits: habits as Habit[],
    completions,
    settings: {
      theme: settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : 'system',
      collapseDone: settings.collapseDone !== false,
    },
  }
}

/**
 * Union of two data sets: every habit from both (existing ones win on an id clash), imported
 * habits appended after the current ones, and check-ins combined. Current settings are kept.
 */
export function mergeData(current: AppData, incoming: AppData): AppData {
  const known = new Set(current.habits.map((h) => h.id))
  let nextOrder = Math.max(-1, ...current.habits.map((h) => h.order)) + 1
  const added = [...incoming.habits]
    .sort((a, b) => a.order - b.order)
    .filter((h) => !known.has(h.id))
    .map((h) => ({ ...h, order: nextOrder++ }))

  const completions: Completions = { ...current.completions }
  for (const [id, days] of Object.entries(incoming.completions)) {
    completions[id] = [...new Set([...(completions[id] ?? []), ...days])].sort()
  }
  return { ...current, habits: [...current.habits, ...added], completions }
}
