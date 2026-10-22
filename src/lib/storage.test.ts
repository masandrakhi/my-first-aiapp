// @vitest-environment-options {"url": "http://127.0.0.1:5173/"}
// The #import= hand-over only runs on 127.0.0.1 (local development), so this file runs as that origin.
import { describe, expect, it } from 'vitest'
import type { AppData } from '../types'
import { createHabit } from '../test/habits'
import { defaultData, importFromUrl, loadData, mergeData, parseData, saveData } from './storage'

const withHabits = (names: string[], completions: Record<number, string[]> = {}): AppData => {
  const data = defaultData()
  data.habits = names.map((name, i) => createHabit({ name, emoji: '✨', color: '#059669' }, i))
  for (const [i, days] of Object.entries(completions)) data.completions[data.habits[+i]!.id] = days
  return data
}

describe('parseData', () => {
  it('fills in missing optional fields instead of trusting them', () => {
    const parsed = parseData({
      version: 1,
      habits: [{ id: 'a', name: 'Read' }, { id: 'b', name: 'Walk', order: 'x', archived: 'yes', frequency: null }],
      completions: { a: ['2026-10-21', '2026-10-21', 'not-a-date', 42, '2026-10-20'] },
    })
    expect(parsed?.habits).toEqual([
      expect.objectContaining({ id: 'a', emoji: '✨', order: 0, archived: false, frequency: { type: 'daily' } }),
      expect.objectContaining({ id: 'b', order: 1, archived: false, frequency: { type: 'daily' } }),
    ])
    // de-duplicated, invalid entries dropped, sorted
    expect(parsed?.completions.a).toEqual(['2026-10-20', '2026-10-21'])
  })

  it('rejects habits without an id or name', () => {
    expect(parseData({ version: 1, habits: [{ name: 'No id' }], completions: {} })).toBeNull()
  })
})

describe('mergeData', () => {
  it('keeps every habit from both sides, imported ones last', () => {
    const current = withHabits(['Drink 8 glass of water'], { 0: ['2026-10-21'] })
    const incoming = withHabits(['Read', 'Walk'], { 0: ['2026-10-20'] })
    const merged = mergeData(current, incoming)
    expect(merged.habits.map((h) => [h.name, h.order])).toEqual([
      ['Drink 8 glass of water', 0], ['Read', 1], ['Walk', 2],
    ])
    expect(merged.completions[incoming.habits[0]!.id]).toEqual(['2026-10-20'])
    expect(merged.completions[current.habits[0]!.id]).toEqual(['2026-10-21'])
  })

  it('is idempotent and unions check-ins for the same habit', () => {
    const current = withHabits(['Read'], { 0: ['2026-10-20'] })
    const incoming: AppData = { ...current, completions: { [current.habits[0]!.id]: ['2026-10-19', '2026-10-20'] } }
    const merged = mergeData(current, incoming)
    expect(merged.habits).toHaveLength(1)
    expect(merged.completions[current.habits[0]!.id]).toEqual(['2026-10-19', '2026-10-20'])
    expect(mergeData(merged, incoming)).toEqual(merged)
  })
})

describe('importFromUrl', () => {
  it('merges habits handed over in the URL fragment and clears the fragment', () => {
    saveData(withHabits(['Drink 8 glass of water']))
    const old = withHabits(['Read', 'Walk'])
    history.replaceState(null, '', '/#import=' + encodeURIComponent(JSON.stringify(old)))

    expect(importFromUrl()).toBe(true)
    expect(loadData().habits.map((h) => h.name)).toEqual(['Drink 8 glass of water', 'Read', 'Walk'])
    expect(location.hash).toBe('')
  })

  it('ignores a malformed fragment without touching stored data', () => {
    saveData(withHabits(['Keep me']))
    history.replaceState(null, '', '/#import=%7Bbroken')
    expect(importFromUrl()).toBe(false)
    expect(loadData().habits.map((h) => h.name)).toEqual(['Keep me'])
    expect(location.hash).toBe('')
  })
})
