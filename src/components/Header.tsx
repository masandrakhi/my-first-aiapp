import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import type { DateKey, Theme } from '../types'
import type { ApiUser } from '../shared/schemas'
import { formatLongDate } from '../lib/dates'
import { messageForDay } from '../lib/motivation'
import { AccountMenu } from './AccountMenu'
import { BrandMark } from './BrandMark'
import { ProgressRing } from './ProgressRing'

interface HeaderProps {
  today: DateKey
  /** Current hour (0–23), for the greeting. */
  hour: number
  doneToday: number
  totalToday: number
  theme: Theme
  onCycleTheme: () => void
  user: ApiUser
  onSignOut: () => void
}

function greeting(hour: number): string {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** The name to greet: the first name given at sign-up, else the part of the email before "@". */
const greetingName = (user: ApiUser) => user.name?.trim() || user.email.split('@')[0] || 'there'

const THEME_ICON: Record<Theme, LucideIcon> = { system: Monitor, light: Sun, dark: Moon }
const THEME_NEXT_LABEL: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }

export function Header({ today, hour, doneToday, totalToday, theme, onCycleTheme, user, onSignOut }: HeaderProps) {
  const ThemeIcon = THEME_ICON[theme]
  const allDone = totalToday > 0 && doneToday === totalToday

  return (
    <header className="pt-5 pb-5">
      {/* App bar: quiet brand mark on the left; theme toggle and account on the right. */}
      <div className="mb-5 flex items-center justify-between">
        <BrandMark />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCycleTheme}
            aria-label={`Theme: ${theme}. Switch to ${THEME_NEXT_LABEL[theme]}`}
            title={`Theme: ${theme}`}
            className="grid size-9 place-items-center rounded-full text-stone-600 hover:bg-stone-200/60 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <ThemeIcon className="size-[18px]" aria-hidden="true" />
          </button>
          <AccountMenu user={user} onSignOut={onSignOut} />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-stone-600 uppercase dark:text-stone-400">{formatLongDate(today)}</p>
          <h1 className="mt-1 text-xl leading-snug font-bold tracking-tight">
            {allDone ? 'Perfect day' : greeting(hour)},{' '}
            <span className="whitespace-nowrap">
              <span className="text-accent-600 dark:text-accent-400">{greetingName(user)}</span> {allDone ? '🎉' : '👋'}
            </span>
          </h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{messageForDay(today)}</p>
        </div>
        {totalToday > 0 && <ProgressRing done={doneToday} total={totalToday} />}
      </div>
    </header>
  )
}
