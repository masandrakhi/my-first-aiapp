import { useState } from 'react'
import type { Theme } from './types'
import { THEME_KEY } from './config'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/authContext'
import { AuthPage } from './components/auth/AuthPage'
import { InactivityDialog } from './components/auth/InactivityDialog'
import { HabitsSkeleton } from './components/LoadStates'
import { useThemeClass } from './hooks/useThemeClass'
import { HabitsProvider } from './state/HabitsProvider'

const storedTheme = (): Theme => {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

/** Shows the sign-in page until there's a session, then the app for that user only. */
function Gate() {
  const { state } = useAuth()
  const [theme] = useState(storedTheme)
  // Once signed in, App applies the account's theme instead.
  useThemeClass(state.status === 'signedIn' ? null : theme)

  if (state.status === 'loading') {
    return (
      <div className="mx-auto max-w-xl px-4 pt-24">
        <HabitsSkeleton />
      </div>
    )
  }
  // Keyed by notice so a new reason (e.g. "password changed") resets the page and shows its message.
  if (state.status === 'signedOut') return <AuthPage key={state.notice ?? 'none'} notice={state.notice} />
  // Keyed by user: switching accounts starts from empty state, never showing the previous user's data.
  return (
    <HabitsProvider key={state.user.id}>
      <App />
      <InactivityDialog />
    </HabitsProvider>
  )
}

export function Root() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
