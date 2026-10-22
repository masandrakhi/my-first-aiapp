/**
 * Legacy on-device storage. Since accounts were added, habits live on the server; this module only
 * reads data saved on a device by earlier versions (for the one-time import) and cleans it up after.
 */
import type { AppData } from '../types'
import { defaultData, mergeData, parseData } from './appData'

export { defaultData, mergeData, parseData }

export const STORAGE_KEY = 'habit-tracker:v1'
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
  // Never silently lose data: keep a copy of anything unreadable before it could be overwritten.
  try {
    localStorage.setItem(BACKUP_PREFIX + Date.now(), raw)
  } catch {
    // storage full — nothing more we can do
  }
  return defaultData()
}

/** Writes `data`; returns the serialized string so callers can skip identical rewrites. */
export function saveData(data: AppData): string {
  const json = JSON.stringify(data)
  try {
    localStorage.setItem(STORAGE_KEY, json)
  } catch {
    // Storage full or blocked (private mode) — keep running in memory.
  }
  return json
}

/** Removes this device's legacy habit data once it has been imported into an account. */
export function clearLegacyData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage blocked — nothing to clear
  }
}

const IMPORT_PREFIX = '#import='

/**
 * Development only: picks up habits handed over from localhost in the URL fragment (see public/boot.js),
 * merges them into this device's legacy data, and removes the fragment. Ignored on any other host,
 * so a crafted link can't inject data into a real user's browser.
 */
export function importFromUrl(): boolean {
  if (location.hostname !== '127.0.0.1' || !location.hash.startsWith(IMPORT_PREFIX)) return false
  const raw = decodeURIComponent(location.hash.slice(IMPORT_PREFIX.length))
  history.replaceState(null, '', location.pathname + location.search)
  try {
    const incoming = parseData(JSON.parse(raw))
    if (!incoming) return false
    saveData(mergeData(loadData(), incoming))
    return true
  } catch {
    return false
  }
}
