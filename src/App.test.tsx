import { describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SINK_DELAY_MS } from './components/TodayView'
import { Root } from './Root'
import { STORAGE_KEY } from './lib/storage'
import { addHabit, renderSignedIn } from './test/renderApp'

describe('App (signed in)', () => {
  it('greets the user by the name given at sign-up', async () => {
    await renderSignedIn('ana@example.com', 'Ana')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ana')
  })

  it('adds a habit, checks it off, and saves both on the server', async () => {
    const api = await renderSignedIn()
    fireEvent.click(screen.getByRole('button', { name: /add your first habit/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Meditate' } })
    fireEvent.click(within(dialog).getByRole('radio', { name: '🧘' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add habit' }))

    const check = await screen.findByRole('button', { name: /mark meditate done today/i })
    expect(screen.getByText('Start a streak')).toBeInTheDocument()
    fireEvent.click(check)
    expect(check).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/1 day/)).toBeInTheDocument()

    await waitFor(() => {
      const store = [...api.stores.values()][0]!
      expect(store.habits[0]).toMatchObject({ name: 'Meditate', emoji: '🧘' })
      expect(Object.values(store.completions)[0]).toHaveLength(1)
    })
  })

  it('never keeps habit data in the browser’s storage', async () => {
    await renderSignedIn()
    await addHabit('Floss')
    fireEvent.click(screen.getByRole('button', { name: /mark floss done today/i }))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('logs a forgotten day from the week strip on Today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 12)) // Wednesday
    try {
      await renderSignedIn()
      await addHabit('Stretch')
      const strip = screen.getByRole('group', { name: 'Stretch this week' })
      const days = within(strip).getAllByRole('button')
      expect(days).toHaveLength(7)
      expect(days[3]).toBeDisabled() // Thursday is in the future
      fireEvent.click(days[1]!) // Tuesday (yesterday)
      expect(days[1]).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText(/1 day/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /mark stretch done today/i }))
      expect(screen.getByText(/2 days/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves a checked habit into a collapsible Done section', async () => {
    await renderSignedIn()
    await addHabit('Walk')
    await addHabit('Journal')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
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

  it('restores habits and progress from the server after closing and reopening', async () => {
    await renderSignedIn()
    await addHabit('Floss')
    fireEvent.click(screen.getByRole('button', { name: /mark floss done today/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /mark floss done today/i })).toHaveAttribute('aria-pressed', 'true'))
    cleanup() // "close the browser": the in-memory access token is gone; the refresh cookie remains

    render(<Root />) // "come back"
    fireEvent.click(await screen.findByRole('button', { name: /1 done today/i }))
    expect(screen.getByText('Floss')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark floss done today/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('edits a habit from the Week view by tapping its name', async () => {
    const api = await renderSignedIn()
    await addHabit('Stretch')
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Stretch' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Yoga' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))
    expect(await screen.findByRole('button', { name: 'Edit Yoga' })).toBeInTheDocument()
    await waitFor(() => expect([...api.stores.values()][0]!.habits[0]!.name).toBe('Yoga'))
  })

  it('edits and deletes a habit from the Week view’s options menu', async () => {
    const api = await renderSignedIn()
    await addHabit('Walk')
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Options for Walk' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(within(screen.getByRole('dialog')).getByLabelText('Name')).toHaveValue('Walk')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel|close/i }))

    fireEvent.click(screen.getByRole('button', { name: 'Options for Walk' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Edit Walk' })).toBeNull())
    await waitFor(() => expect([...api.stores.values()][0]!.habits).toHaveLength(0))
  })

  it('keeps the add button available on the Week view', async () => {
    await renderSignedIn()
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add habit' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('disables saving an empty name', async () => {
    await renderSignedIn()
    fireEvent.click(screen.getByRole('button', { name: 'Add habit' })) // the "+" button
    const dialog = screen.getByRole('dialog')
    const submit = within(dialog).getByRole('button', { name: 'Add habit' })
    expect(submit).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: '   ' } })
    expect(submit).toBeDisabled()
  })

  it('reloads from the server, shows a reference code and logs the failure when a save fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const api = await renderSignedIn()
      await addHabit('Read')
      api.failNextWrite()
      fireEvent.click(screen.getByRole('button', { name: /mark read done today/i }))
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent("Couldn't save your last change")
      expect(alert).toHaveTextContent(/\(ref req-\d+\)/)
      await waitFor(() => expect(screen.getByRole('button', { name: /mark read done today/i })).toHaveAttribute('aria-pressed', 'false'))
      expect(log).toHaveBeenCalledWith('[habits] saving failed: check-in', expect.objectContaining({ status: 500, code: 'server_error', requestId: expect.stringMatching(/^req-/) }))
    } finally {
      log.mockRestore()
    }
  })
})
