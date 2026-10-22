import { createContext, useContext } from 'react'
import type { ApiUser } from '../shared/schemas'
import type { ApiClient, SignOutReason } from './apiClient'

/** Why the sign-in page is showing, so it can explain (e.g. "signed out after 15 minutes"). */
export type SignInNotice = SignOutReason | 'password_changed'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; notice: SignInNotice | null }
  | { status: 'signedIn'; user: ApiUser }

export interface AuthApi {
  state: AuthState
  api: ApiClient
  signIn(email: string, password: string): Promise<void>
  register(email: string, password: string, name?: string): Promise<void>
  requestReset(email: string): Promise<string>
  resetPassword(token: string, newPassword: string): Promise<void>
  signOut(): Promise<void>
  /** "Stay signed in": a deliberate user action, which the server counts as activity. */
  keepAlive(): Promise<void>
  /** Milliseconds since the last authenticated activity, for the inactivity warning. */
  idleMs(): number
}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** The signed-in user; only call below the sign-in gate. */
export function useUser(): ApiUser {
  const { state } = useAuth()
  if (state.status !== 'signedIn') throw new Error('useUser called while signed out')
  return state.user
}
