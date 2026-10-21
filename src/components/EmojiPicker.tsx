import { useRef, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import { HABIT_EMOJI } from '../lib/palette'

const COLUMNS = 8
const MOVES: Partial<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }

interface EmojiPickerProps {
  value: string
  onChange: (emoji: string) => void
  accent: string
}

/** Radio-group grid with arrow-key navigation (one tab stop). */
export function EmojiPicker({ value, onChange, accent }: EmojiPickerProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const selected = Math.max(0, HABIT_EMOJI.findIndex((e) => e === value))

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = MOVES[e.key]
    if (delta === undefined) return
    e.preventDefault()
    const next = (selected + delta + HABIT_EMOJI.length) % HABIT_EMOJI.length
    const emoji = HABIT_EMOJI[next]
    if (!emoji) return
    onChange(emoji)
    gridRef.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }

  return (
    <div
      ref={gridRef}
      role="radiogroup"
      aria-label="Emoji"
      onKeyDown={onKeyDown}
      className="grid grid-cols-8 gap-1"
    >
      {HABIT_EMOJI.map((emoji, i) => {
        const isOn = emoji === value
        return (
          <button
            key={emoji}
            type="button"
            role="radio"
            aria-checked={isOn}
            aria-label={emoji}
            tabIndex={i === selected ? 0 : -1}
            onClick={() => onChange(emoji)}
            className={clsx(
              'grid aspect-square place-items-center rounded-xl text-xl transition-transform hover:scale-110',
              !isOn && 'hover:bg-stone-100 dark:hover:bg-stone-800',
            )}
            style={isOn ? { backgroundColor: accent + '26', boxShadow: `inset 0 0 0 2px ${accent}` } : undefined}
          >
            {emoji}
          </button>
        )
      })}
    </div>
  )
}
