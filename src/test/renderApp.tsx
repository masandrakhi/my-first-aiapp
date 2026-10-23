import { fireEvent, render, screen, within } from '@testing-library/react'
import { Root } from '../Root'
import { installFakeApi, type FakeApi } from './fakeApi'

/** Renders the full app (sign-in gate included) against the fake API, signed out. */
export async function renderSignedOut(): Promise<FakeApi> {
  const api = installFakeApi()
  render(<Root />)
  await screen.findByRole('heading', { name: 'Welcome back' })
  return api
}

/** Renders the full app, creates an account through the real sign-up form, and waits for Today. */
export async function renderSignedIn(email = 'me@example.com', name = 'Sam'): Promise<FakeApi> {
  const api = await renderSignedOut()
  fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(screen.getByLabelText("I'm 13 or older"))
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  await screen.findByRole('button', { name: /add your first habit/i })
  return api
}

/** Adds a habit through the real dialog and waits until it appears (it's saved on the server first). */
export async function addHabit(name: string) {
  fireEvent.click(screen.getAllByRole('button', { name: /add (your first )?habit/i })[0]!)
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: name } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add habit' }))
  await screen.findByRole('button', { name: `Mark ${name} done today` })
}
