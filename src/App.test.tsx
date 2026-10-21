import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { SINK_DELAY_MS } from './components/TodayView'
import App from './App'
import { HabitsProvider } from './state/HabitsContext'
import { STORAGE_KEY } from './lib/storage'

// jsdom has no matchMedia
window.matchMedia ??= ((query: string) => ({
  matches: false, media: query, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as typeof window.matchMedia

const renderApp = () => render(<HabitsProvider><App /></HabitsProvider>)

describe('App', () => {
  it('adds a habit, checks it off, and persists it', () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /add your first habit/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByPlaceholderText(/drink water/i), { target: { value: 'Meditate' } })
    fireEvent.click(within(dialog).getByRole('radio', { name: '🧘' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add habit' }))

    expect(screen.getByText('Meditate')).toBeInTheDocument()
    expect(screen.getByText('Start a streak')).toBeInTheDocument()

    const check = screen.getByRole('button', { name: /mark meditate done today/i })
    fireEvent.click(check)
    expect(check).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/1 day/)).toBeInTheDocument()

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.habits[0]).toMatchObject({ name: 'Meditate', emoji: '🧘' })
    expect(Object.values(stored.completions)[0]).toHaveLength(1)
  })

  it('logs a forgotten day from the week strip on Today', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 12)) // Wednesday
    try {
      renderApp()
      fireEvent.click(screen.getByRole('button', { name: /add your first habit/i }))
      const dialog = screen.getByRole('dialog')
      fireEvent.change(within(dialog).getByPlaceholderText(/drink water/i), { target: { value: 'Stretch' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add habit' }))

      const strip = screen.getByRole('group', { name: 'Stretch this week' })
      const days = within(strip).getAllByRole('button')
      expect(days).toHaveLength(7)
      expect(days[3]).toBeDisabled() // Thursday is in the future
      fireEvent.click(days[1]) // Tuesday (yesterday)
      expect(days[1]).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText(/1 day/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /mark stretch done today/i }))
      expect(screen.getByText(/2 days/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves a checked habit into a collapsible Done section', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      renderApp()
      for (const name of ['Walk', 'Journal']) {
        fireEvent.click(screen.getAllByRole('button', { name: /add (your first )?habit/i })[0])
        const dialog = screen.getByRole('dialog')
        fireEvent.change(within(dialog).getByPlaceholderText(/drink water/i), { target: { value: name } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Add habit' }))
      }

      fireEvent.click(screen.getByRole('button', { name: /mark walk done today/i }))
      // It stays put briefly so the check animation can play...
      expect(within(screen.getByRole('list', { name: /to do/i })).getByText('Walk')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(SINK_DELAY_MS + 50))

      // ...then sinks into the collapsed Done row.
      expect(within(screen.getByRole('list', { name: /to do/i })).queryByText('Walk')).toBeNull()
      const doneToggle = screen.getByRole('button', { name: /1 done today/i })
      expect(doneToggle).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(doneToggle)
      expect(within(screen.getByRole('list', { name: /done today/i })).getByText('Walk')).toBeInTheDocument()

      // Unchecking brings it straight back up.
      fireEvent.click(screen.getByRole('button', { name: /mark walk done today/i }))
      expect(within(screen.getByRole('list', { name: /to do/i })).getByText('Walk')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps habits and progress after closing and reopening the app', () => {
    const first = renderApp()
    fireEvent.click(screen.getByRole('button', { name: /add your first habit/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByPlaceholderText(/drink water/i), { target: { value: 'Floss' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add habit' }))
    fireEvent.click(screen.getByRole('button', { name: /mark floss done today/i }))
    first.unmount() // "close the browser"

    renderApp() // "come back"
    fireEvent.click(screen.getByRole('button', { name: /1 done today/i })) // done habits start folded
    expect(screen.getByText('Floss')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark floss done today/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('never writes to storage just by opening the app', () => {
    localStorage.setItem(STORAGE_KEY, '{"version":1,"habits":[],"completions":{},"settings":{"theme":"dark","collapseDone":true}}')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    try {
      renderApp()
      expect(setItem).not.toHaveBeenCalledWith(STORAGE_KEY, expect.anything())
    } finally {
      setItem.mockRestore()
    }
  })

  it('disables saving an empty name', () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Add habit' })) // the "+" button
    const dialog = screen.getByRole('dialog')
    const submit = within(dialog).getByRole('button', { name: 'Add habit' })
    expect(submit).toBeDisabled()
    fireEvent.change(within(dialog).getByPlaceholderText(/drink water/i), { target: { value: '   ' } })
    expect(submit).toBeDisabled()
  })
})
