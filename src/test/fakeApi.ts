/**
 * An in-memory stand-in for the API, installed as `fetch`, for UI tests that run in jsdom.
 * It mirrors the real endpoints' shapes and status codes. The real server's security behaviour
 * (hashing, sessions, rotation, isolation) is tested separately in server/test against the real code.
 */
import { vi } from 'vitest'
import type { AppData, Completions, Habit, Theme } from '../types'
import type { CoachMessage, CoachProposal } from '../shared/chat'

interface User { id: string; email: string; name: string | null; password: string }
interface Chat { id: string; messages: CoachMessage[] }
interface Store { habits: Habit[]; completions: Completions; settings: { theme: Theme; collapseDone: boolean }; chat: Chat | null }

/** The fake Coach always suggests these two (the real behaviour is tested in server/test/coach.test.ts). */
const COACH_ITEMS = [
  { itemId: 'item-1', name: 'Same bedtime every night', emoji: '🌙', color: '#7c3aed', why: 'A steady rhythm makes falling asleep easier.' },
  { itemId: 'item-2', name: 'Phone out of the bedroom', emoji: '📵', color: '#e11d48', why: 'Less late-night scrolling.' },
]

export interface FakeApi {
  /** Ends every session on the "server", as if the user had been idle for 15 minutes. */
  expireSessions: () => void
  /** Makes the next save fail with a 500, to exercise the error path. */
  failNextWrite: () => void
  /** Makes the next habit create fail the server's content policy (the real check is tested in server/test). */
  rejectNextHabitAsUnsafe: () => void
  /** Makes the next Coach message fail as if the AI were unavailable (503). */
  coachUnavailable: () => void
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
  let unsafeNext = false
  let coachDown = false
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
      if (body.ageConfirmed !== true) return error(400, 'validation_error', 'Please check the highlighted fields.', { ageConfirmed: 'You must be 13 or older to use Habits' })
      if (String(body.password).length < 12) return error(400, 'validation_error', 'Please check the highlighted fields.', { password: 'Use at least 12 characters' })
      if ([...users.values()].some((u) => u.email === body.email)) return error(409, 'conflict', "We couldn't create an account with that email.")
      const user = { id: `user-${++n}`, email: body.email, name: body.name ?? null, password: body.password }
      users.set(user.id, user)
      stores.set(user.id, { habits: [], completions: {}, settings: { theme: 'system', collapseDone: true }, chat: null })
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
      if (unsafeNext) {
        unsafeNext = false
        return error(400, 'unsafe_content', "That habit can't be saved because it includes content we don't allow.", { name: "That habit can't be saved." })
      }
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
    if (path === '/api/chat' && method === 'GET') {
      return json(200, { available: true, practice: true, conversationId: store.chat?.id ?? null, messages: store.chat?.messages ?? [] })
    }
    if (path === '/api/chat/messages') {
      if (coachDown) {
        coachDown = false
        return error(503, 'unavailable', "The Coach can't reply right now. Please try again in a moment.")
      }
      const at = new Date().toISOString()
      const added: CoachMessage[] = []
      const push = (m: Omit<CoachMessage, 'id' | 'createdAt'>) => {
        const message = { id: `msg-${++n}`, createdAt: at, ...m }
        added.push(message)
        store.chat!.messages.push(message)
      }
      if (!store.chat) {
        store.chat = { id: `chat-${++n}`, messages: [] }
        push({ role: 'assistant', text: "I'm an AI coach, not a person or a licensed professional.", kind: 'disclosure', proposal: null })
      }
      push({ role: 'user', text: body.text, kind: null, proposal: null })
      const proposal: CoachProposal | null = /\b(add|create)\b/i.test(body.text)
        ? { id: `proposal-${++n}`, status: 'pending', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), items: COACH_ITEMS }
        : null
      push({
        role: 'assistant',
        text: proposal ? "I've put these below. Nothing is added until you tap Create." : 'Here are a few small habits that could help. Want me to add some?',
        kind: null,
        proposal,
      })
      return json(200, { conversationId: store.chat.id, practice: true, messages: added })
    }
    const chatAction = /^\/api\/chat\/(proposals|conversations)\/([^/]+)(?:\/(confirm|dismiss))?$/.exec(path)
    if (chatAction) {
      const [, kind, id, action] = chatAction
      if (kind === 'conversations') {
        if (store.chat?.id !== id) return error(404, 'not_found', 'Not found.')
        store.chat = null
        return json(204)
      }
      const message = store.chat?.messages.find((m) => m.proposal?.id === id)
      if (!message?.proposal || message.proposal.status !== 'pending') return error(404, 'not_found', 'Not found.')
      if (action === 'dismiss') {
        message.proposal.status = 'dismissed'
        return json(204)
      }
      const picked = message.proposal.items.filter((i) => (body.itemIds as string[]).includes(i.itemId))
      message.proposal.status = 'confirmed'
      const created = picked.map((i) => {
        const habit: Habit = { id: crypto.randomUUID(), name: i.name, emoji: i.emoji, color: i.color, frequency: { type: 'daily' }, createdAt: new Date().toISOString(), archived: false, order: store.habits.length }
        store.habits.push(habit)
        return { id: habit.id, name: habit.name }
      })
      return json(200, { created, skipped: [] })
    }
    if (path === '/api/import') {
      const data = body.data as AppData
      for (const h of data.habits) {
        const id = crypto.randomUUID()
        store.habits.push({ ...h, id, order: store.habits.length })
        store.completions[id] = [...(data.completions[h.id] ?? [])]
      }
      return json(200, { imported: data.habits.length, skipped: 0, alreadyImported: false })
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
    rejectNextHabitAsUnsafe: () => {
      unsafeNext = true
    },
    coachUnavailable: () => {
      coachDown = true
    },
    calls,
    stores,
  }
}
