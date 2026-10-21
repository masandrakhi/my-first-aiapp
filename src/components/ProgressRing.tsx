interface ProgressRingProps {
  done: number
  total: number
}

const SIZE = 64
const STROKE = 7
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ProgressRing({ done, total }: ProgressRingProps) {
  const pct = total === 0 ? 0 : done / total
  const complete = total > 0 && done === total

  return (
    <div
      className="relative size-16 shrink-0"
      role="img"
      aria-label={`${done} of ${total} habits done today`}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full -rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-stone-200 dark:stroke-stone-800"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - pct)}
          className={complete ? 'stroke-emerald-600' : 'stroke-accent-600 dark:stroke-accent-400'}
          style={{ transition: 'stroke-dashoffset 500ms cubic-bezier(0.22, 1, 0.36, 1), stroke 300ms' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-sm font-bold tabular-nums">
        {complete ? '🎉' : `${done}/${total}`}
      </div>
    </div>
  )
}
