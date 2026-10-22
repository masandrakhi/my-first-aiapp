import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { Root } from './Root'
import { idlePhase, INACTIVITY_MS, WARNING_MS } from './auth/inactivity'
import { installFakeApi } from './test/fakeApi'
import { addHabit, renderSignedIn, renderSignedOut } from './test/renderApp'
import { STORAGE_KEY } from './lib/storage'

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('sign-in page', () => {
  it('shows field errors before contacting the server', async () => {
    const api = await renderSignedOut()
    fill('Email', 'not-an-email')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(api.calls.filter((c) => c.path === '/api/auth/login')).toHaveLength(0)
  })

  it('shows the server’s generic message for wrong credentials', async () => {
    await renderSignedOut()
    fill('Email', 'who@example.com')
    fill('Password', 'wrong password!!')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
  })

  it('uses the right autocomplete hints and can reveal the password', async () => {
    await renderSignedOut()
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(password).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password')
  })

  it('signs in and out again', async () => {
    await renderSignedIn('sam@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Account: sam@example.com' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText("You're signed out.")).toBeInTheDocument()
    fill('Email', 'sam@example.com')
    fill('Password', 'correct horse battery')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('button', { name: /add your first habit/i })).toBeInTheDocument()
  })

  it('always answers "forgot password" the same way', async () => {
    await renderSignedOut()
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fill('Email', 'anyone@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByText(/If an account exists for that email/)).toBeInTheDocument()
  })

  it('sets a new password from a reset link and removes the token from the address bar', async () => {
    window.history.replaceState(null, '', '/#reset=valid-reset-token-123')
    installFakeApi()
    render(<Root />)
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(window.location.hash).toBe('')
    fill('New password', 'a brand new passphrase')
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(await screen.findByText(/Password changed/)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    await renderSignedOut()
    const result = await axe.run(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})

describe('session handling', () => {
  it('returns to the sign-in page with an explanation when the server says the session expired', async () => {
    const api = await renderSignedIn()
    await addHabit('Walk')
    api.expireSessions()
    fireEvent.click(screen.getByRole('button', { name: /mark walk done today/i }))
    expect(await screen.findByText(/signed out after 15 minutes of inactivity/i)).toBeInTheDocument()
    expect(screen.queryByText('Walk')).toBeNull()
  })

  it('maps idle time to the warning and sign-out phases', () => {
    expect(idlePhase(0)).toBe('active')
    expect(idlePhase(INACTIVITY_MS - WARNING_MS - 1)).toBe('active')
    expect(idlePhase(INACTIVITY_MS - WARNING_MS)).toBe('warning')
    expect(idlePhase(INACTIVITY_MS)).toBe('expired')
  })

  it('warns at 13 minutes, keeps the session on "Stay signed in", and signs out at 15', async () => {
    const api = await renderSignedIn()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    try {
      act(() => vi.advanceTimersByTime(INACTIVITY_MS - WARNING_MS + 1000))
      const dialog = await screen.findByRole('dialog', { name: 'Still there?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Stay signed in' }))
      await waitFor(() => expect(api.calls.at(-1)?.path).toBe('/api/session/keepalive'))
      act(() => vi.advanceTimersByTime(2000))
      expect(screen.queryByRole('dialog', { name: 'Still there?' })).toBeNull()

      act(() => vi.advanceTimersByTime(INACTIVITY_MS + 1000))
      expect(await screen.findByText(/signed out after 15 minutes of inactivity/i)).toBeInTheDocument()
      expect(api.calls.some((c) => c.path === '/api/auth/logout')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('importing habits saved on this device before accounts', () => {
  it('offers a one-time import, then removes the device copy', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      habits: [{ id: 'old-1', name: 'Old habit', emoji: '🌱', color: '#059669', order: 0 }],
      completions: { 'old-1': ['2026-10-20'] },
      settings: {},
    }))
    await renderSignedIn()
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }))
    expect(await screen.findByText('Imported 1 habit into your account.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Old habit done today' })).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
