import { describe, expect, it } from 'vitest'
import type { Habit } from '../types'
import { currentStreak, longestStreak } from './stats'
import { addDays, startOfWeek, toDateKey, weekDays } from './dates'
import { MESSAGES, messageForDay } from './motivation'

const habit = (frequency: Habit['frequency'] = { type: 'daily' }): Habit => ({
  id: 'h1', name: 'Water', emoji: '💧', color: '#0ea5e9', frequency,
  createdAt: '2026-01-01T00:00:00.000Z', archived: false, order: 0,
})

const TODAY = '2026-10-21' // a Wednesday

describe('currentStreak', () => {
  it('is 0 with no completions', () => {
    expect(currentStreak(habit(), [], TODAY)).toBe(0)
  })

  it('counts consecutive days ending today', () => {
    expect(currentStreak(habit(), ['2026-10-19', '2026-10-20', TODAY], TODAY)).toBe(3)
  })

  it("keeps yesterday's streak when today isn't done yet", () => {
    expect(currentStreak(habit(), ['2026-10-19', '2026-10-20'], TODAY)).toBe(2)
  })

  it('resets after a missed day', () => {
    expect(currentStreak(habit(), ['2026-10-17', '2026-10-18', TODAY], TODAY)).toBe(1)
    expect(currentStreak(habit(), ['2026-10-18', '2026-10-19'], TODAY)).toBe(0)
  })

  it('skips unscheduled days for weekly habits', () => {
    const monWedFri = habit({ type: 'weekly', days: [1, 3, 5] })
    // Fri 16, Mon 19, Wed 21 — Tue/Thu/weekend are not scheduled.
    expect(currentStreak(monWedFri, ['2026-10-16', '2026-10-19', TODAY], TODAY)).toBe(3)
  })

  it('crosses month boundaries', () => {
    expect(currentStreak(habit(), ['2026-09-30', '2026-10-01'], '2026-10-01')).toBe(2)
  })
})

describe('longestStreak', () => {
  it('finds the best run', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06']
    expect(longestStreak(habit(), days)).toBe(3)
    expect(longestStreak(habit(), [])).toBe(0)
  })
})

describe('messageForDay', () => {
  it('is stable within a day and changes the next day', () => {
    expect(messageForDay(TODAY)).toBe(messageForDay(TODAY))
    expect(messageForDay(addDays(TODAY, 1))).not.toBe(messageForDay(TODAY))
  })

  it('cycles through every message', () => {
    const seen = new Set(Array.from({ length: MESSAGES.length }, (_, i) => messageForDay(addDays(TODAY, i))))
    expect(seen.size).toBe(MESSAGES.length)
  })
})

describe('dates', () => {
  it('uses local time for keys', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('weeks start on Monday', () => {
    expect(startOfWeek(TODAY)).toBe('2026-10-19')
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19') // Sunday
    expect(weekDays('2026-10-19')).toEqual(
      Array.from({ length: 7 }, (_, i) => addDays('2026-10-19', i)),
    )
  })
})
