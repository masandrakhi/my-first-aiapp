import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logError } from '../lib/log'

interface State {
  failed: boolean
}

/**
 * Catches rendering crashes anywhere below it: logs the error (with React's component stack)
 * and shows a calm recovery screen instead of a blank page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    logError('render crash', error, { componentStack: info.componentStack })
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 text-5xl" aria-hidden="true">🌧️</div>
        <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          Your habits are saved. Reloading usually fixes this.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 h-12 rounded-2xl bg-accent-600 px-6 font-semibold text-white hover:bg-accent-700"
        >
          Reload
        </button>
      </main>
    )
  }
}
