/**
 * Habit accent colors. These are the Tailwind 600 shades: each has at least 3:1 contrast
 * against both the light and dark card backgrounds (WCAG 1.4.11 for graphics and borders).
 */
export const HABIT_COLOR_OPTIONS = [
  { name: 'Emerald', hex: '#059669' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Purple', hex: '#9333ea' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Pink', hex: '#db2777' },
] as const

export const HABIT_COLORS: readonly string[] = HABIT_COLOR_OPTIONS.map((c) => c.hex)
export const DEFAULT_COLOR: string = HABIT_COLOR_OPTIONS[0].hex

/** The palette color at position `i`, wrapping around. */
export const colorAt = (i: number): string => HABIT_COLORS[i % HABIT_COLORS.length] ?? DEFAULT_COLOR

/** Earlier versions used lighter 500 shades that failed contrast; map them to the new ones. */
const LEGACY_COLORS: Record<string, string> = {
  '#10b981': '#059669',
  '#0ea5e9': '#2563eb',
  '#0284c7': '#2563eb',
  '#8b5cf6': '#9333ea',
  '#f43f5e': '#e11d48',
  '#f59e0b': '#d97706',
  '#f97316': '#ea580c',
  '#14b8a6': '#0d9488',
  '#ec4899': '#db2777',
}

export function migrateColor(hex: string): string {
  return LEGACY_COLORS[hex.toLowerCase()] ?? hex
}

export const HABIT_EMOJI = [
  '💧', '📚', '🏃', '🧘', '🥗', '😴', '✍️', '💊',
  '🏋️', '🚶', '🚴', '🏊', '🧠', '🎯', '📝', '🎨',
  '🎸', '🎹', '🌱', '☀️', '🍎', '🥦', '☕', '🚭',
  '📵', '🧹', '🛏️', '🦷', '💰', '🙏', '❤️', '😊',
  '🌙', '⏰', '📖', '💻', '🐶', '🌿', '🧴', '✨',
] as const

export const DEFAULT_EMOJI = '✨'

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** White or near-black, whichever reads better on `bg` (used for text on habit-colored buttons). */
export function readableTextOn(bg: string): string {
  const dark = '#1c1917' // stone-900
  return contrastRatio(bg, '#ffffff') >= contrastRatio(bg, dark) ? '#ffffff' : dark
}
