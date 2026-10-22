import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { addHabit, renderSignedIn } from './test/renderApp'
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


describe('render performance', () => {
  it('toggling one habit re-renders only that habit’s card', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 12)) // Wednesday, so Monday is a past day
    try {
      await renderSignedIn()
      for (const name of ['Read', 'Walk', 'Stretch']) await addHabit(name)
      // Let follow-up work from adding habits (drag-and-drop re-measuring) finish before counting.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

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
