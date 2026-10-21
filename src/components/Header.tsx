import { Flame, Monitor, Moon, Sun } from 'lucide-react'
import type { DateKey, Theme } from '../types'
import { formatLongDate } from '../lib/dates'
import { messageForDay } from '../lib/motivation'
import { APP_NAME, USER_NAME } from '../config'
import { ProgressRing } from './ProgressRing'

interface HeaderProps {
  today: DateKey
  doneToday: number
  totalToday: number
  theme: Theme
  onCycleTheme: () => void
}

function greeting(hour: number): string {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon }
const THEME_NEXT_LABEL = { system: 'light', light: 'dark', dark: 'system' }

export function Header({ today, doneToday, totalToday, theme, onCycleTheme }: HeaderProps) {
  const ThemeIcon = THEME_ICON[theme]
  const allDone = totalToday > 0 && doneToday === totalToday

  return (
    <header className="pt-5 pb-5">
      {/* App bar: quiet brand mark on the left, theme toggle on the right. */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent-600 to-fuchsia-600 text-white shadow-sm shadow-accent-600/30">
            <Flame className="size-4" fill="currentColor" aria-hidden="true" />
          </span>
          <span className="text-base font-bold tracking-tight">{APP_NAME}</span>
        </div>
        <button
          type="button"
          onClick={onCycleTheme}
          aria-label={`Theme: ${theme}. Switch to ${THEME_NEXT_LABEL[theme]}`}
          title={`Theme: ${theme}`}
          className="grid size-9 place-items-center rounded-full text-stone-600 hover:bg-stone-200/60 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
        >
          <ThemeIcon className="size-[18px]" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-stone-600 uppercase dark:text-stone-400">{formatLongDate(today)}</p>
          <h1 className="mt-1 text-xl leading-snug font-bold tracking-tight">
            {allDone ? 'Perfect day' : greeting(new Date().getHours())},{' '}
            <span className="whitespace-nowrap">
              <span className="text-accent-600 dark:text-accent-400">{USER_NAME}</span> {allDone ? '🎉' : '👋'}
            </span>
          </h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{messageForDay(today)}</p>
        </div>
        {totalToday > 0 && <ProgressRing done={doneToday} total={totalToday} />}
      </div>
    </header>
  )
}
