import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AuthResponse } from '../shared/schemas'
import { logError } from '../lib/log'
import { createApiClient } from './apiClient'
import { AuthContext, type AuthApi, type AuthState } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const [api] = useState(() =>
    createApiClient({
      onSignedOut: (reason) => setState({ status: 'signedOut', notice: reason }),
      onSession: (session) => setState((s) => (s.status === 'signedIn' && s.user.id === session.user.id ? s : { status: 'signedIn', user: session.user })),
    }),
  )
  useEffect(() => {
    api.connect()
    return () => api.close()
  }, [api])

  // On load, the in-memory access token is gone; the HttpOnly refresh cookie restores the session if it's still active.
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    api
      .refresh()
      .catch((err: unknown) => {
        // Network down or server unreachable: show the sign-in page rather than loading forever.
        logError('session restore failed', err)
        return null
      })
      .then((session) => {
        // Start the idle timer now; the server may expire sooner, and then the next request says so.
        if (session) api.markActive()
        setState((s) => (s.status !== 'loading' ? s : session ? { status: 'signedIn', user: session.user } : { status: 'signedOut', notice: null }))
      })
  }, [api])

  const value = useMemo<AuthApi>(() => {
    const begin = (session: AuthResponse) => {
      api.startSession(session) // also restarts the idle timer: signing in is activity on the server too
      setState({ status: 'signedIn', user: session.user })
    }
    return {
      state,
      api,
      signIn: async (email, password) => begin(await api.post<AuthResponse>('/api/auth/login', { email, password })),
      register: async (email, password, ageConfirmed, name) =>
        begin(await api.post<AuthResponse>('/api/auth/register', { email, password, ageConfirmed, ...(name ? { name } : {}) })),
      requestReset: async (email) => (await api.post<{ message: string }>('/api/auth/password/forgot', { email })).message,
      resetPassword: async (token, newPassword) => {
        await api.post('/api/auth/password/reset', { token, newPassword })
        setState({ status: 'signedOut', notice: 'password_changed' })
      },
      signOut: () => api.logout('signed_out'),
      keepAlive: async () => {
        await api.request('POST', '/api/session/keepalive', {})
      },
      idleMs: api.idleMs,
    }
  }, [api, state])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
