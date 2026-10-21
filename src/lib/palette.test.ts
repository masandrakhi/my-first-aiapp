import { describe, expect, it } from 'vitest'
import { contrastRatio, HABIT_COLORS, readableTextOn } from './palette'

// Card backgrounds the habit colors sit on: white (light) and stone-900 (dark).
const LIGHT_CARD = '#ffffff'
const DARK_CARD = '#1c1917'

describe('palette contrast (WCAG 2.2 AA)', () => {
  it.each(HABIT_COLORS)('%s has ≥ 3:1 against light and dark cards (graphics, 1.4.11)', (hex) => {
    expect(contrastRatio(hex, LIGHT_CARD)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(hex, DARK_CARD)).toBeGreaterThanOrEqual(3)
  })

  it.each(HABIT_COLORS)('text on %s reaches 4.5:1 (1.4.3)', (hex) => {
    expect(contrastRatio(hex, readableTextOn(hex))).toBeGreaterThanOrEqual(4.5)
  })

  it('computes known ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })
})
