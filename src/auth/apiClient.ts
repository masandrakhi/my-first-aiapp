/**
 * Talks to the API. The access token lives only in this module's memory (never in storage);
 * the refresh token is an HttpOnly cookie the browser sends to /api/auth/refresh.
 *
 * - Expired access token → one refresh, then the request is retried once.
 * - Refreshes are single-flight across tabs (Web Locks) and the result is shared over BroadcastChannel,
 *   so two tabs never present the same refresh token (which the server would treat as theft).
 * - Every successful authenticated request is recorded as activity for the inactivity timer.
 */
import type { ApiErrorBody, ApiErrorCode, AuthResponse } from '../shared/schemas'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly fields: Record<string, string>
  /** The server's id for the failed request (also in its logs), when the server sent one. */
  readonly requestId: string | null
  constructor(status: number, body: ApiErrorBody | null, requestId: string | null = null) {
    super(body?.error.message ?? 'Something went wrong. Please try again.')
    this.status = status
    this.code = body?.error.code ?? 'server_error'
    this.fields = body?.error.fields ?? {}
    this.requestId = body?.error.requestId ?? requestId
  }
}

const apiError = (res: Response, body: ApiErrorBody | null) => new ApiError(res.status, body, res.headers.get('x-request-id'))

export type SignOutReason = 'inactive' | 'expired' | 'signed_out'

export interface ApiClientEvents {
  /** The session ended (in this tab or another); show the sign-in page. */
  onSignedOut: (reason: SignOutReason) => void
  /** Another tab signed in or refreshed; adopt its session. */
  onSession: (session: AuthResponse) => void
}

type Message = { type: 'session'; session: AuthResponse } | { type: 'signout'; reason: SignOutReason }

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function readJson<T>(res: Response): Promise<T | null> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export function createApiClient(events: ApiClientEvents) {
  let accessToken: string | null = null
  let generation = 0 // bumps whenever a new session/token is adopted
  let lastSession: AuthResponse | null = null
  let inflight: Promise<AuthResponse | null> | null = null
  // Time of the last request the server counted as activity (sign-in or any authenticated request).
  let lastActivity = 0
  // Cross-tab channel; opened by connect() while the app is mounted, so a closed one is never used.
  let channel: BroadcastChannel | null = null

  const adopt = (session: AuthResponse) => {
    accessToken = session.accessToken
    lastSession = session
    generation++
  }

  const onMessage = (e: MessageEvent<Message>) => {
    if (e.data.type === 'session') {
      adopt(e.data.session)
      events.onSession(e.data.session)
    } else {
      accessToken = null
      lastSession = null
      events.onSignedOut(e.data.reason)
    }
  }

  const broadcast = (message: Message) => channel?.postMessage(message)

  /** Public endpoints (sign in, register, reset). Throws ApiError on failure. */
  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(path, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body), credentials: 'same-origin' })
    const json = await readJson<T & ApiErrorBody>(res)
    if (!res.ok) throw apiError(res, json)
    return json as T
  }

  /** Starts a session from a sign-in or registration response and tells other tabs. */
  function startSession(session: AuthResponse) {
    adopt(session)
    lastActivity = Date.now()
    broadcast({ type: 'session', session })
  }

  /** Exchanges the refresh cookie for a new access token. Returns null when there's no valid session. */
  function refresh(): Promise<AuthResponse | null> {
    inflight ??= (async () => {
      const seen = generation
      const run = async (): Promise<AuthResponse | null> => {
        // Another tab may have refreshed while we waited for the lock; reuse its result.
        if (generation !== seen && lastSession) return lastSession
        const res = await fetch('/api/auth/refresh', { method: 'POST', headers: JSON_HEADERS, body: '{}', credentials: 'same-origin' })
        if (!res.ok) return null
        const session = await readJson<AuthResponse>(res)
        if (!session) return null
        startSession(session)
        return session
      }
      return navigator.locks ? navigator.locks.request('habits-refresh', run) : run()
    })().finally(() => {
      inflight = null
    })
    return inflight
  }

  /** Authenticated request. Refreshes once on an expired token; ends the session on any other 401. */
  async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const headers: Record<string, string> = body === undefined ? {} : { ...JSON_HEADERS }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' })
    const json = await readJson<T & ApiErrorBody>(res)

    if (res.status === 401) {
      const err = apiError(res, json)
      if (err.code === 'token_expired' && !retried && (await refresh())) return request<T>(method, path, body, true)
      endSession(err.code === 'session_expired' ? 'inactive' : 'expired')
      throw err
    }
    if (!res.ok) throw apiError(res, json)
    lastActivity = Date.now()
    return json as T
  }

  function endSession(reason: SignOutReason) {
    accessToken = null
    lastSession = null
    broadcast({ type: 'signout', reason })
    events.onSignedOut(reason)
  }

  /** Revokes the session on the server (best effort) and signs out every tab. */
  async function logout(reason: SignOutReason = 'signed_out') {
    const headers: Record<string, string> = { ...JSON_HEADERS }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers, body: '{}', credentials: 'same-origin' })
    } finally {
      endSession(reason)
    }
  }

  return {
    post,
    startSession,
    refresh,
    request,
    logout,
    /** Restarts the idle timer, e.g. when a session is restored on page load. */
    markActive: () => {
      lastActivity = Date.now()
    },
    /** Milliseconds since the last activity the server counted. */
    idleMs: () => Date.now() - lastActivity,
    /** Starts listening to other tabs. Safe to call again after close() (React StrictMode remounts). */
    connect: () => {
      if (channel || typeof BroadcastChannel === 'undefined') return
      channel = new BroadcastChannel('habits-auth')
      channel.addEventListener('message', onMessage)
    },
    close: () => {
      channel?.close()
      channel = null
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
