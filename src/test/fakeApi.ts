/**
 * An in-memory stand-in for the API, installed as `fetch`, for UI tests that run in jsdom.
 * It mirrors the real endpoints' shapes and status codes. The real server's security behaviour
 * (hashing, sessions, rotation, isolation) is tested separately in server/test against the real code.
 */
import { vi } from 'vitest'
import type { AppData, Completions, Habit, Theme } from '../types'

interface User { id: string; email: string; name: string | null; password: string }
interface Store { habits: Habit[]; completions: Completions; settings: { theme: Theme; collapseDone: boolean } }

export interface FakeApi {
  /** Ends every session on the "server", as if the user had been idle for 15 minutes. */
  expireSessions: () => void
  /** Makes the next save fail with a 500, to exercise the error path. */
  failNextWrite: () => void
  calls: { method: string; path: string }[]
  stores: Map<string, Store>
}

export function installFakeApi(): FakeApi {
  const users = new Map<string, User>()
  const stores = new Map<string, Store>()
  const tokens = new Map<string, string>() // access token → user id
  let cookie: string | null = null // refresh "cookie" → user id
  const refresh = new Map<string, string>()
  let failWrite = false
  let n = 0
  const calls: FakeApi['calls'] = []

  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const error = (status: number, code: string, message: string, fields?: Record<string, string>) =>
    json(status, { error: { code, message, requestId: `req-${++n}`, ...(fields ? { fields } : {}) } })

  const session = (user: User) => {
    const accessToken = `at-${++n}`
    tokens.set(accessToken, user.id)
    cookie = `rt-${++n}`
    refresh.set(cookie, user.id)
    return { accessToken, expiresIn: 900, user: { id: user.id, email: user.email, name: user.name } }
  }

  const handler = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push({ method, path })
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    const auth = new Headers(init.headers).get('authorization')?.replace('Bearer ', '')
    const uid = auth ? tokens.get(auth) : undefined

    if (path === '/api/auth/register') {
      if (String(body.password).length < 12) return error(400, 'validation_error', 'Please check the highlighted fields.', { password: 'Use at least 12 characters' })
      if ([...users.values()].some((u) => u.email === body.email)) return error(409, 'conflict', "We couldn't create an account with that email.")
      const user = { id: `user-${++n}`, email: body.email, name: body.name ?? null, password: body.password }
      users.set(user.id, user)
      stores.set(user.id, { habits: [], completions: {}, settings: { theme: 'system', collapseDone: true } })
      return json(201, session(user))
    }
    if (path === '/api/auth/login') {
      const user = [...users.values()].find((u) => u.email === body.email && u.password === body.password)
      return user ? json(200, session(user)) : error(401, 'invalid_credentials', 'Email or password is incorrect.')
    }
    if (path === '/api/auth/refresh') {
      const owner = cookie ? refresh.get(cookie) : undefined
      if (!owner) return error(401, 'invalid_refresh', 'Please sign in.')
      refresh.delete(cookie!)
      return json(200, session(users.get(owner)!))
    }
    if (path === '/api/auth/logout') {
      if (auth) tokens.delete(auth)
      if (cookie) refresh.delete(cookie)
      cookie = null
      return json(204)
    }
    if (path === '/api/auth/password/forgot') return json(202, { message: "If an account exists for that email, we've sent a link to reset the password." })
    if (path === '/api/auth/password/reset') return body.token === 'valid-reset-token-123' ? json(204) : error(400, 'invalid_reset_link', 'This reset link is invalid or has expired. Request a new one.')

    if (!uid) return error(401, auth ? 'session_expired' : 'unauthorized', 'You were signed out after 15 minutes of inactivity.')
    const store = stores.get(uid)!
    if (method !== 'GET' && failWrite) {
      failWrite = false
      return error(500, 'server_error', 'Something went wrong. Please try again.')
    }

    if (path === '/api/habits' && method === 'GET') return json(200, { habits: store.habits, completions: store.completions, settings: store.settings })
    if (path === '/api/habits' && method === 'POST') {
      const habit: Habit = { id: crypto.randomUUID(), ...body, frequency: { type: 'daily' }, createdAt: new Date().toISOString(), archived: false, order: store.habits.length }
      store.habits.push(habit)
      return json(201, habit)
    }
    if (path === '/api/habits/order') {
      store.habits = (body.ids as string[]).map((id, i) => ({ ...store.habits.find((h) => h.id === id)!, order: i }))
      return json(204)
    }
    if (path === '/api/me/settings') {
      Object.assign(store.settings, body)
      return json(200, store.settings)
    }
    if (path === '/api/session/keepalive') return json(204)
    if (path === '/api/import') {
      const data = body.data as AppData
      for (const h of data.habits) {
        const id = crypto.randomUUID()
        store.habits.push({ ...h, id, order: store.habits.length })
        store.completions[id] = [...(data.completions[h.id] ?? [])]
      }
      return json(200, { imported: data.habits.length, alreadyImported: false })
    }
    const done = /^\/api\/habits\/([^/]+)\/completions\/(\d{4}-\d{2}-\d{2})$/.exec(path)
    if (done) {
      const [, id, date] = done as unknown as [string, string, string]
      if (!store.habits.some((h) => h.id === id)) return error(404, 'not_found', 'Not found.')
      const days = new Set(store.completions[id] ?? [])
      if (method === 'PUT') days.add(date)
      else days.delete(date)
      store.completions[id] = [...days].sort()
      return json(204)
    }
    const one = /^\/api\/habits\/([^/]+)$/.exec(path)
    if (one) {
      const i = store.habits.findIndex((h) => h.id === one[1])
      if (i < 0) return error(404, 'not_found', 'Not found.')
      if (method === 'PATCH') store.habits[i] = { ...store.habits[i]!, ...body }
      if (method === 'DELETE') store.habits.splice(i, 1)
      return method === 'DELETE' ? json(204) : json(200, store.habits[i])
    }
    return error(404, 'not_found', 'Not found.')
  }

  vi.stubGlobal('fetch', vi.fn(handler))
  return {
    expireSessions: () => {
      tokens.clear()
      refresh.clear()
    },
    failNextWrite: () => {
      failWrite = true
    },
    calls,
    stores,
  }
}
