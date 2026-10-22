import { describe, expect, it } from 'vitest'
import { BACKUP_PREFIX, defaultData, loadData, saveData, STORAGE_KEY } from '../lib/storage'
import { createHabit } from '../test/habits'
import { habitsReducer } from './habitsReducer'

describe('habitsReducer', () => {
  const habit = createHabit({ name: '  Read  ', emoji: '📚', color: '#8b5cf6' }, 0)
  const withHabit = habitsReducer(defaultData(), { type: 'ADD_HABIT', habit })

  it('adds a habit with a trimmed name', () => {
    expect(withHabit.habits).toHaveLength(1)
    expect(withHabit.habits[0]!.name).toBe('Read')
  })

  it('toggles a completion on and off', () => {
    const on = habitsReducer(withHabit, { type: 'TOGGLE_COMPLETION', id: habit.id, date: '2026-10-21' })
    expect(on.completions[habit.id]).toEqual(['2026-10-21'])
    const off = habitsReducer(on, { type: 'TOGGLE_COMPLETION', id: habit.id, date: '2026-10-21' })
    expect(off.completions[habit.id]).toEqual([])
  })

  it('updates and deletes (including history)', () => {
    const edited = habitsReducer(withHabit, { type: 'UPDATE_HABIT', id: habit.id, changes: { emoji: '📖' } })
    expect(edited.habits[0]!.emoji).toBe('📖')
    const done = habitsReducer(edited, { type: 'TOGGLE_COMPLETION', id: habit.id, date: '2026-10-21' })
    const deleted = habitsReducer(done, { type: 'DELETE_HABIT', id: habit.id })
    expect(deleted.habits).toEqual([])
    expect(deleted.completions).toEqual({})
  })
})

describe('REORDER', () => {
  it('renumbers habits in the given order', () => {
    let state = defaultData()
    for (const [i, name] of ['A', 'B', 'C'].entries()) {
      state = habitsReducer(state, { type: 'ADD_HABIT', habit: createHabit({ name, emoji: '✨', color: '#000' }, i) })
    }
    const [a, b, c] = state.habits.map((h) => h.id) as [string, string, string]
    const next = habitsReducer(state, { type: 'REORDER', ids: [c, a, b] })
    expect(next.habits.map((h) => [h.name, h.order])).toEqual([['C', 0], ['A', 1], ['B', 2]])
  })
})

describe('storage', () => {
  it('defaults collapseDone to true for older saved data', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, habits: [], completions: {}, settings: { theme: 'dark' } }))
    expect(loadData().settings).toEqual({ theme: 'dark', collapseDone: true })
  })

  it('round-trips data', () => {
    const data = habitsReducer(defaultData(), {
      type: 'ADD_HABIT',
      habit: createHabit({ name: 'Walk', emoji: '🚶', color: '#059669' }, 0),
    })
    saveData(data)
    expect(loadData()).toEqual(data)
  })

  it('backs up unreadable data instead of losing it', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadData()).toEqual(defaultData())
    const backups = Object.keys(localStorage).filter((k) => k.startsWith(BACKUP_PREFIX))
    expect(backups).toHaveLength(1)
    expect(localStorage.getItem(backups[0]!)).toBe('{not json')
  })

  it('upgrades old low-contrast habit colors', () => {
    const old = habitsReducer(defaultData(), {
      type: 'ADD_HABIT',
      habit: createHabit({ name: 'Walk', emoji: '🚶', color: '#f59e0b' }, 0),
    })
    saveData(old)
    expect(loadData().habits[0]!.color).toBe('#d97706')
  })

  it('falls back to defaults on corrupt or unknown data', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadData()).toEqual(defaultData())
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }))
    expect(loadData()).toEqual(defaultData())
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, habits: [{ id: 1 }], completions: {} }))
    expect(loadData()).toEqual(defaultData())
  })
})
