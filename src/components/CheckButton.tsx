import { useState } from 'react'
import clsx from 'clsx'
import { cssVars } from '../lib/css'
import { colorAt, readableTextOn } from '../lib/palette'

interface CheckButtonProps {
  checked: boolean
  color: string
  label: string
  onToggle: () => void
  /** Changes to a new number to fire a small confetti burst from the button. */
  burstKey?: number
}

/** Large circular toggle: fills with the habit color, pops, ripples, and draws a checkmark. */
export function CheckButton({ checked, color, label, onToggle, burstKey }: CheckButtonProps) {
  // Only animate on user action, not when the page loads with items already done.
  const [popping, setPopping] = useState(false)
  const [buzzing, setBuzzing] = useState(false)
  const [ripple, setRipple] = useState(0)

  return (
    <span
      className={clsx('relative grid shrink-0 place-items-center', buzzing && 'animate-haptic')}
      onAnimationEnd={(e) => e.target === e.currentTarget && setBuzzing(false)}
    >
      {ripple > 0 && (
        <span
          key={ripple}
          className="pointer-events-none absolute inset-0 animate-ripple rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )}
      {burstKey !== undefined && <MiniBurst key={burstKey} color={color} />}
      <button
        type="button"
        aria-pressed={checked}
        aria-label={label}
        onClick={() => {
          // Haptic-style feedback: a tiny buzz on every tap, plus pop + ripple when completing.
          setBuzzing(true)
          if (!checked) {
            setPopping(true)
            setRipple((r) => r + 1)
            navigator.vibrate?.([10, 30, 10])
          } else {
            navigator.vibrate?.(6)
          }
          onToggle()
        }}
        onAnimationEnd={(e) => e.target === e.currentTarget && setPopping(false)}
        className={clsx(
          'relative grid size-12 place-items-center rounded-full border-[3px] transition-[background-color,scale] duration-150',
          // Press-in feels like a physical button.
          'active:scale-90',
          'focus-visible:outline-2 focus-visible:outline-offset-2',
          popping && 'animate-pop',
        )}
        style={{
          borderColor: color,
          backgroundColor: checked ? color : 'transparent',
          outlineColor: color,
        }}
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            className="check-path"
            data-on={checked}
            stroke={readableTextOn(color)}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </span>
  )
}

const BURST_PIECES = 14

/** A tiny radial confetti pop centered on the button. */
function MiniBurst({ color }: { color: string }) {
  const [pieces] = useState(() =>
    Array.from({ length: BURST_PIECES }, (_, i) => {
      const angle = (i / BURST_PIECES) * Math.PI * 2 + Math.random() * 0.4
      const distance = 34 + Math.random() * 22
      return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        rot: (Math.random() - 0.5) * 540,
        size: 4 + Math.random() * 4,
        round: i % 3 === 0,
        color: i % 2 === 0 ? color : colorAt(i),
      }
    }),
  )

  return (
    <span className="pointer-events-none absolute inset-0 z-10 motion-reduce:hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 block animate-burst"
          style={cssVars({
            width: p.size,
            height: p.round ? p.size : p.size * 1.8,
            borderRadius: p.round ? '9999px' : '1px',
            backgroundColor: p.color,
            '--x': `${p.x}px`,
            '--y': `${p.y}px`,
            '--rot': `${p.rot}deg`,
          })}
        />
      ))}
    </span>
  )
}
