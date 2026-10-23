import { Hono } from 'hono'
import { z } from 'zod'
import { dateKeySchema, habitDraftSchema, habitPatchSchema, importSchema, reorderSchema, settingsPatchSchema } from '../../src/shared/schemas.js'
import { HttpError, notFound, unauthorized } from '../errors.js'
import { audit, jsonBody, requireAuth, type AppContext, type AppEnv } from '../middleware.js'
import { checkHabit, responses } from '../safety/index.js'
import * as repo from '../repo/habits.js'

/** All routes here require a live session; the user id always comes from it, never from the request. */
export const dataRoutes = new Hono<AppEnv>()
for (const path of ['/habits', '/habits/*', '/me', '/me/*', '/session/*', '/import']) dataRoutes.use(path, requireAuth)

const uuid = z.uuid()

/** A malformed id can't belong to the caller, so it is answered exactly like someone else's id: 404. */
function habitId(c: AppContext): string {
  const id = c.req.param('id')
  if (!id || !uuid.safeParse(id).success) throw notFound()
  return id
}

/** Check-ins may be dated at most one day ahead of UTC, which covers every time zone. */
function checkInDate(c: AppContext): string {
  const date = c.req.param('date') ?? ''
  if (!dateKeySchema.safeParse(date).success) throw new HttpError(400, 'validation_error', 'Invalid date.')
  if (date > latestAllowedDate(c.get('deps').now())) throw new HttpError(400, 'validation_error', "Can't check in for a future day.")
  return date
}

/** Server-side content check for anything saved as a habit; the client is never trusted to filter. */
function assertSafeHabit(c: AppContext, source: string, ...texts: (string | undefined)[]) {
  const result = checkHabit(...texts.filter((t): t is string => t !== undefined))
  if (result.ok === true) return // explicit form: Vercel's own type-check narrows only this way
  audit(c, 'content_blocked', { category: result.category, source }, 'warn')
  // Self-harm always comes with the crisis lines; other categories get the neutral refusal.
  const message = result.category === 'self_harm' ? responses.HABIT_BLOCKED_SELF_HARM : responses.HABIT_BLOCKED
  throw new HttpError(400, 'unsafe_content', message, { fields: { name: message } })
}

export const latestAllowedDate = (now: Date) => new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)

dataRoutes.get('/habits', async (c) => c.json(await repo.listAll(c.get('deps').db, c.get('userId'))))

dataRoutes.post('/habits', async (c) => {
  const draft = habitDraftSchema.parse(await jsonBody(c))
  assertSafeHabit(c, 'habit_create', draft.name, draft.emoji)
  return c.json(await repo.createHabit(c.get('deps').db, c.get('userId'), draft, c.get('deps').now()), 201)
})

dataRoutes.put('/habits/order', async (c) => {
  const { ids } = reorderSchema.parse(await jsonBody(c))
  const ok = await repo.reorderHabits(c.get('deps').db, c.get('userId'), ids)
  if (!ok) throw new HttpError(400, 'validation_error', 'The order must list each of your habits exactly once.')
  return c.body(null, 204)
})

dataRoutes.get('/habits/:id', async (c) => {
  const habit = await repo.getHabit(c.get('deps').db, c.get('userId'), habitId(c))
  if (!habit) throw notFound()
  return c.json(habit)
})

dataRoutes.patch('/habits/:id', async (c) => {
  const id = habitId(c)
  const patch = habitPatchSchema.parse(await jsonBody(c))
  assertSafeHabit(c, 'habit_update', patch.name, patch.emoji)
  const habit = await repo.updateHabit(c.get('deps').db, c.get('userId'), id, patch, c.get('deps').now())
  if (!habit) throw notFound()
  return c.json(habit)
})

dataRoutes.delete('/habits/:id', async (c) => {
  if (!(await repo.deleteHabit(c.get('deps').db, c.get('userId'), habitId(c)))) throw notFound()
  return c.body(null, 204)
})

dataRoutes.put('/habits/:id/completions/:date', async (c) => {
  const [id, date] = [habitId(c), checkInDate(c)]
  if (!(await repo.setCompletion(c.get('deps').db, c.get('userId'), id, date, true, c.get('deps').now()))) throw notFound()
  return c.body(null, 204)
})

dataRoutes.delete('/habits/:id/completions/:date', async (c) => {
  const [id, date] = [habitId(c), checkInDate(c)]
  if (!(await repo.setCompletion(c.get('deps').db, c.get('userId'), id, date, false, c.get('deps').now()))) throw notFound()
  return c.body(null, 204)
})

dataRoutes.get('/me', async (c) => {
  const { db } = c.get('deps')
  const [user, settings] = await Promise.all([repo.getProfile(db, c.get('userId')), repo.getSettings(db, c.get('userId'))])
  if (!user) throw unauthorized()
  return c.json({ user, settings })
})

dataRoutes.patch('/me/settings', async (c) => {
  const patch = settingsPatchSchema.parse(await jsonBody(c))
  return c.json(await repo.updateSettings(c.get('deps').db, c.get('userId'), patch))
})

/** An explicit "Stay signed in" click. requireAuth already recorded it as activity. */
dataRoutes.post('/session/keepalive', (c) => c.body(null, 204))

dataRoutes.post('/import', async (c) => {
  const { deviceImportId, data } = importSchema.parse(await jsonBody(c))
  const deps = c.get('deps')
  const allowed = (name: string, emoji: string) => checkHabit(name, emoji).ok
  const result = await repo.importLegacy(deps.db, c.get('userId'), deviceImportId, data, deps.now(), latestAllowedDate(deps.now()), allowed)
  if (result.skipped > 0) audit(c, 'content_blocked', { source: 'import', count: result.skipped }, 'warn')
  return c.json(result)
})
