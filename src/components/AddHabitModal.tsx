import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import type { Habit } from '../types'
import { cssVars } from '../lib/css'
import type { HabitDraft } from '../shared/schemas'
import { colorAt, DEFAULT_COLOR, DEFAULT_EMOJI, HABIT_COLOR_OPTIONS, HABIT_COLORS, readableTextOn } from '../lib/palette'
import { Modal } from './ui/Modal'
import { EmojiPicker } from './EmojiPicker'

export const MAX_NAME_LENGTH = 40

const ARROW_STEP: Partial<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

interface AddHabitModalProps {
  /** When given, the modal edits this habit instead of creating a new one. */
  habit?: Habit
  defaultColor?: string
  onSave: (draft: HabitDraft) => void
  onClose: () => void
}

export function AddHabitModal({ habit, defaultColor = DEFAULT_COLOR, onSave, onClose }: AddHabitModalProps) {
  const [name, setName] = useState(habit?.name ?? '')
  const [emoji, setEmoji] = useState(habit?.emoji ?? DEFAULT_EMOJI)
  const [color, setColor] = useState(habit?.color ?? defaultColor)

  const nameId = useId()

  // Radio-group keyboard pattern: arrows move the selection within the swatches.
  const onColorKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_STEP[e.key]
    if (step === undefined) return
    e.preventDefault()
    const i = (HABIT_COLORS.indexOf(color) + step + HABIT_COLORS.length) % HABIT_COLORS.length
    setColor(colorAt(i))
    e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[i]?.focus()
  }

  const trimmed = name.trim()
  const valid = trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onSave({ name: trimmed, emoji, color })
  }

  return (
    <Modal title={habit ? 'Edit habit' : 'New habit'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor={nameId} className="mb-2 block text-sm font-medium text-stone-600 dark:text-stone-300">
            Name
          </label>
          <div className="flex items-center gap-3">
            <div
              className="grid size-14 shrink-0 place-items-center rounded-2xl text-3xl"
              style={{ backgroundColor: color + '26' }}
              aria-hidden="true"
            >
              {emoji}
            </div>
            <input
              id={nameId}
              autoFocus
              required
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              placeholder="e.g. Drink water"
              aria-describedby={`${nameId}-count`}
              className="h-14 min-w-0 flex-1 rounded-2xl bg-stone-100 px-4 text-base outline-none placeholder:text-stone-600 focus-visible:outline-none focus:ring-2 dark:bg-stone-800 dark:placeholder:text-stone-400"
              style={cssVars({ '--tw-ring-color': color })}
            />
          </div>
          <p id={`${nameId}-count`} className="mt-1 text-right text-xs text-stone-600 tabular-nums dark:text-stone-400">
            {name.length}/{MAX_NAME_LENGTH}
          </p>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-stone-600 dark:text-stone-400">Emoji</legend>
          <EmojiPicker value={emoji} onChange={setEmoji} accent={color} />
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-stone-600 dark:text-stone-400">Color</legend>
          <div className="flex justify-between px-1" role="radiogroup" aria-label="Color" onKeyDown={onColorKey}>
            {HABIT_COLOR_OPTIONS.map(({ name: label, hex }) => (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={hex === color}
                aria-label={label}
                tabIndex={hex === color ? 0 : -1}
                onClick={() => setColor(hex)}
                className="grid size-9 place-items-center rounded-full transition-transform hover:scale-110"
                style={{ backgroundColor: hex, outline: hex === color ? `2px solid ${hex}` : undefined, outlineOffset: 3 }}
              >
                {hex === color && <Check className="size-4" strokeWidth={3} style={{ color: readableTextOn(hex) }} />}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={!valid}
          className="h-12 w-full rounded-2xl font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: color, color: readableTextOn(color) }}
        >
          {habit ? 'Save changes' : 'Add habit'}
        </button>
      </form>
    </Modal>
  )
}
