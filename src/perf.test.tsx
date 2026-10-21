import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { HabitsProvider } from './state/HabitsProvider'
import * as HabitCardModule from './components/HabitCard'

// Count how often each habit's card renders, while keeping the real component.
const renders = new Map<string, number>()
vi.mock('./components/HabitCard', async (importOriginal) => {
  const actual = await importOriginal<typeof HabitCardModule>()
  return {
    ...actual,
    HabitCard: (props: Parameters<typeof actual.HabitCard>[0]) => {
      renders.set(props.habit.name, (renders.get(props.habit.name) ?? 0) + 1)
      return actual.HabitCard(props)
    },
  }
})

function addHabit(name: string) {
  fireEvent.click(screen.getAllByRole('button', { name: /add (your first )?habit/i })[0]!)
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: name } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add habit' }))
}

describe('render performance', () => {
  it('toggling one habit re-renders only that habit’s card', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 12)) // Wednesday, so Monday is a past day
    try {
      render(<HabitsProvider><App /></HabitsProvider>)
      for (const name of ['Read', 'Walk', 'Stretch']) addHabit(name)

      renders.clear()
      // Log a past day for "Walk" from its week strip (it stays in the to-do list).
      fireEvent.click(within(screen.getByRole('group', { name: 'Walk this week' })).getAllByRole('button')[0]!)

      expect(renders.get('Walk')).toBeGreaterThan(0)
      expect(renders.get('Read') ?? 0).toBe(0)
      expect(renders.get('Stretch') ?? 0).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
