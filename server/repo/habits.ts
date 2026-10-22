/**
 * Every function here takes an AuthedUserId and filters by it in SQL. There is deliberately no
 * function that reads habits without a user id, so cross-user access cannot be written by accident.
 */
import { and, asc, eq, max } from 'drizzle-orm'
import type { AppData, Completions, Habit, Theme } from '../../src/types'
import { colorAt, HABIT_COLORS } from '../../src/lib/palette'
import { parseData } from '../../src/lib/appData'
import { dateKeySchema, NAME_MAX } from '../../src/shared/schemas'
import type { DbOrTx } from '../db/client'
import { completions, habits, imports, userSettings } from '../db/schema'
import type { AuthedUserId } from '../middleware'

type HabitRow = typeof habits.$inferSelect

export interface Settings {
  theme: Theme
  collapseDone: boolean
}

export interface HabitDraft {
  name: string
  emoji: string
  color: string
}

const toHabit = (row: HabitRow): Habit => ({
  id: row.id,
  name: row.name,
  emoji: row.emoji,
  color: row.color,
  frequency: row.frequency,
  createdAt: row.createdAt.toISOString(),
  archived: row.archived,
  order: row.sortOrder,
})

const owned = (uid: AuthedUserId, id: string) => and(eq(habits.id, id), eq(habits.userId, uid))

async function nextSortOrder(db: DbOrTx, uid: AuthedUserId): Promise<number> {
  const [row] = await db.select({ top: max(habits.sortOrder) }).from(habits).where(eq(habits.userId, uid))
  return (row?.top ?? -1) + 1
}

export async function getSettings(db: DbOrTx, uid: AuthedUserId): Promise<Settings> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, uid))
  return { theme: row?.theme ?? 'system', collapseDone: row?.collapseDone ?? true }
}

export async function updateSettings(db: DbOrTx, uid: AuthedUserId, patch: Partial<Settings>): Promise<Settings> {
  await db
    .insert(userSettings)
    .values({ userId: uid, ...patch })
    .onConflictDoUpdate({ target: userSettings.userId, set: patch })
  return getSettings(db, uid)
}

/** Everything the Today and Week views need, for this user only. */
export async function listAll(db: DbOrTx, uid: AuthedUserId): Promise<Omit<AppData, 'version'>> {
  const rows = await db.select().from(habits).where(eq(habits.userId, uid)).orderBy(asc(habits.sortOrder))
  const done = await db
    .select({ habitId: completions.habitId, date: completions.date })
    .from(completions)
    .where(eq(completions.userId, uid))
    .orderBy(asc(completions.date))
  const byHabit: Completions = {}
  for (const c of done) (byHabit[c.habitId] ??= []).push(c.date)
  return { habits: rows.map(toHabit), completions: byHabit, settings: await getSettings(db, uid) }
}

export async function createHabit(db: DbOrTx, uid: AuthedUserId, draft: HabitDraft, at: Date): Promise<Habit> {
  const [row] = await db
    .insert(habits)
    .values({ userId: uid, ...draft, frequency: { type: 'daily' }, sortOrder: await nextSortOrder(db, uid), createdAt: at, updatedAt: at })
    .returning()
  return toHabit(row!)
}

export async function getHabit(db: DbOrTx, uid: AuthedUserId, id: string): Promise<Habit | null> {
  const [row] = await db.select().from(habits).where(owned(uid, id))
  return row ? toHabit(row) : null
}

export async function updateHabit(db: DbOrTx, uid: AuthedUserId, id: string, patch: Partial<HabitDraft>, at: Date): Promise<Habit | null> {
  const [row] = await db.update(habits).set({ ...patch, updatedAt: at }).where(owned(uid, id)).returning()
  return row ? toHabit(row) : null
}

/** Deletes the habit; its completions go with it (ON DELETE CASCADE). */
export async function deleteHabit(db: DbOrTx, uid: AuthedUserId, id: string): Promise<boolean> {
  const rows = await db.delete(habits).where(owned(uid, id)).returning({ id: habits.id })
  return rows.length > 0
}

/** Adds or removes one check-in. Returns false when the habit isn't this user's. */
export async function setCompletion(db: DbOrTx, uid: AuthedUserId, habitId: string, date: string, done: boolean, at: Date): Promise<boolean> {
  const [habit] = await db.select({ id: habits.id }).from(habits).where(owned(uid, habitId))
  if (!habit) return false
  if (done) {
    // user_id is written from the session, and the composite foreign key re-checks ownership in the database.
    await db.insert(completions).values({ habitId, userId: uid, date, createdAt: at }).onConflictDoNothing()
  } else {
    await db.delete(completions).where(and(eq(completions.habitId, habitId), eq(completions.userId, uid), eq(completions.date, date)))
  }
  return true
}

/** Applies a new order. `ids` must be exactly this user's habits, each once. */
export async function reorderHabits(db: DbOrTx, uid: AuthedUserId, ids: string[]): Promise<boolean> {
  const mine = await db.select({ id: habits.id }).from(habits).where(eq(habits.userId, uid))
  const mineSet = new Set(mine.map((h) => h.id))
  if (ids.length !== mineSet.size || new Set(ids).size !== ids.length || !ids.every((id) => mineSet.has(id))) return false
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.update(habits).set({ sortOrder: i }).where(owned(uid, id))
  })
  return true
}

const MAX_IMPORT_HABITS = 200

/**
 * Copies a device's legacy localStorage data into this user's account, once per device.
 * Habits get fresh server ids; nothing from the payload can name another user or habit.
 */
export async function importLegacy(
  db: DbOrTx, uid: AuthedUserId, deviceImportId: string, payload: unknown, at: Date, latestDate: string,
): Promise<{ imported: number; alreadyImported: boolean }> {
  const data = parseData(payload)
  if (!data) return { imported: 0, alreadyImported: false }
  return db.transaction(async (tx) => {
    const claimed = await tx.insert(imports).values({ userId: uid, deviceImportId, createdAt: at }).onConflictDoNothing().returning()
    if (claimed.length === 0) return { imported: 0, alreadyImported: true }

    let order = await nextSortOrder(tx, uid)
    let imported = 0
    const source = [...data.habits].sort((a, b) => a.order - b.order).slice(0, MAX_IMPORT_HABITS)
    for (const [i, h] of source.entries()) {
      const name = h.name.trim().slice(0, NAME_MAX)
      if (!name) continue
      const [row] = await tx
        .insert(habits)
        .values({
          userId: uid,
          name,
          emoji: h.emoji.slice(0, 16) || '✨',
          color: HABIT_COLORS.includes(h.color) ? h.color : colorAt(i),
          frequency: { type: 'daily' },
          archived: h.archived,
          sortOrder: order++,
          createdAt: at,
          updatedAt: at,
        })
        .returning({ id: habits.id })
      const dates = (data.completions[h.id] ?? []).filter((d) => dateKeySchema.safeParse(d).success && d <= latestDate)
      if (dates.length) {
        await tx.insert(completions).values(dates.map((date) => ({ habitId: row!.id, userId: uid, date, createdAt: at }))).onConflictDoNothing()
      }
      imported++
    }
    return { imported, alreadyImported: false }
  })
}
