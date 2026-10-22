import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Root } from './Root'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function Broken(): never {
  throw new Error('render blew up')
}

describe('error handling', () => {
  it('shows a recovery screen instead of a blank page, and logs the crash', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Broken /></ErrorBoundary>)
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(log).toHaveBeenCalledWith('[habits] render crash', expect.objectContaining({ message: 'render blew up', componentStack: expect.any(String) }))
  })

  it('reloads the page from the recovery screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(<ErrorBoundary><Broken /></ErrorBoundary>)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalled()
  })

  it('falls back to the sign-in page (not an endless spinner) when the server is unreachable on load', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    render(<Root />)
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(log).toHaveBeenCalledWith('[habits] session restore failed', expect.objectContaining({ message: 'Failed to fetch' }))
  })
})
