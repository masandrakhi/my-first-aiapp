import type { HabitDraft } from '../shared/schemas'
import type { Habit } from '../types'

/** A new daily habit for tests (the app gets real ones from the server). */
export function createHabit(draft: HabitDraft, order = 0): Habit {
  return {
    id: crypto.randomUUID(),
    name: draft.name.trim(),
    emoji: draft.emoji,
    color: draft.color,
    frequency: { type: 'daily' },
    createdAt: new Date().toISOString(),
    archived: false,
    order,
  }
}
