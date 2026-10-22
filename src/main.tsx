import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Root } from './Root.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { importFromUrl } from './lib/storage.ts'
import { logError } from './lib/log.ts'

// Errors outside React rendering (event handlers, timers, promises) are logged too.
window.addEventListener('error', (e) => logError('uncaught error', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => logError('unhandled promise rejection', e.reason))

// Development only: picks up habits handed over from localhost before the app reads device data.
importFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
)
