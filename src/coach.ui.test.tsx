import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { renderSignedIn } from './test/renderApp'

async function openCoach() {
  const api = await renderSignedIn()
  fireEvent.click(screen.getByRole('button', { name: 'Coach' }))
  await screen.findByText("Tell me what you'd like to improve.")
  return api
}

const send = (text: string) => {
  fireEvent.change(screen.getByLabelText('Message the Coach'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

describe('Coach tab', () => {
  it('introduces itself as an AI, offers starters, and hides the add button', async () => {
    await openCoach()
    expect(screen.getByRole('heading', { name: 'AI Coach' })).toBeInTheDocument()
    expect(screen.getByText(/not a person or a professional/)).toBeInTheDocument()
    expect(screen.getByText('Practice mode')).toBeInTheDocument()
    expect(screen.getByText(/never for ads/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add habit' })).toBeNull()
  })

  it('chats, shows suggestions as a card, and adds only the ticked habits after Create', async () => {
    const api = await openCoach()
    fireEvent.click(screen.getByRole('button', { name: 'I sleep badly' }))
    const log = screen.getByRole('log', { name: 'Conversation' })
    expect(await within(log).findByText(/not a person or a licensed professional/)).toBeInTheDocument()
    expect(within(log).getByText('I sleep badly')).toBeInTheDocument()

    send('add 2 of these')
    const card = await screen.findByRole('region', { name: 'Suggested habits' })
    const boxes = within(card).getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true)
    expect([...api.stores.values()][0]!.habits).toHaveLength(0) // nothing yet

    expect(within(card).getByRole('checkbox', { name: 'Phone out of the bedroom' })).toHaveAccessibleDescription('Less late-night scrolling.')
    fireEvent.click(boxes[1]!)
    fireEvent.click(within(card).getByRole('button', { name: 'Create 1 habit' }))
    expect(await within(card).findByText(/Added 1 habit to Today/)).toBeInTheDocument()
    expect([...api.stores.values()][0]!.habits.map((h) => h.name)).toEqual(['Same bedtime every night'])

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(await screen.findByText('Same bedtime every night')).toBeInTheDocument()
  })

  it('lets the user say "Not now" to a card', async () => {
    const api = await openCoach()
    send('create some habits')
    const card = await screen.findByRole('region', { name: 'Suggested habits' })
    fireEvent.click(within(card).getByRole('button', { name: 'Not now' }))
    expect(await within(card).findByText('Not added.')).toBeInTheDocument()
    expect([...api.stores.values()][0]!.habits).toHaveLength(0)
  })

  it('clears the chat', async () => {
    await openCoach()
    send('hello')
    await screen.findByText(/Want me to add some/)
    fireEvent.click(screen.getByRole('button', { name: 'Clear chat' }))
    expect(await screen.findByText("Tell me what you'd like to improve.")).toBeInTheDocument()
  })

  it('explains when the Coach is unavailable and keeps the draft', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const api = await openCoach()
      api.coachUnavailable()
      send('help me focus')
      expect(await screen.findByText(/The Coach can't reply right now/)).toHaveAttribute('role', 'alert')
      expect(screen.getByLabelText('Message the Coach')).toHaveValue('help me focus')
    } finally {
      log.mockRestore()
    }
  })

  it('has no accessibility violations with a suggestion card', async () => {
    await openCoach()
    send('add habits')
    await screen.findByRole('region', { name: 'Suggested habits' })
    await waitFor(() => expect(screen.queryByText('Coach is typing…')).toBeNull())
    // Same WCAG 2.2 AA rule set as a11y.test.tsx (jsdom can't compute colours, so contrast is checked elsewhere).
    const { violations } = await axe.run(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
  })
})
