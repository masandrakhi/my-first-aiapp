import { useMemo, type CSSProperties } from 'react'
import { HABIT_COLORS } from '../lib/palette'

const PIECES = 48

/** A short CSS-only confetti burst plus a toast. Parent unmounts it when done. */
export function Celebration() {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 300,
        dx: (Math.random() - 0.5) * 200,
        rot: (Math.random() - 0.5) * 1080,
        color: HABIT_COLORS[i % HABIT_COLORS.length],
        w: 6 + Math.random() * 6,
        round: Math.random() > 0.6,
      })),
    [],
  )

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden motion-reduce:hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute -top-4 block animate-confetti"
          style={
            {
              left: `${p.left}%`,
              width: p.w,
              height: p.round ? p.w : p.w * 1.6,
              borderRadius: p.round ? '9999px' : '2px',
              backgroundColor: p.color,
              animationDelay: `${p.delay}ms`,
              '--dx': `${p.dx}px`,
              '--rot': `${p.rot}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

export function CelebrationToast() {
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-6 z-50 mx-auto w-fit animate-fade-up rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white shadow-xl dark:bg-white dark:text-stone-900"
    >
      Perfect day! Every habit done 🎉
    </div>
  )
}
