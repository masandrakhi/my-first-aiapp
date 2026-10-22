import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// Server tests run in a plain Node environment (no DOM), so browser-only setup is guarded.
if (typeof window !== 'undefined') {
  // jsdom has no matchMedia; the app reads it for the system light/dark theme.
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia

  const { cleanup } = await import('@testing-library/react')
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })
}
