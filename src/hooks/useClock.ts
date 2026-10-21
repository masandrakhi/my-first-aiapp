import { useEffect, useState } from 'react'
import type { DateKey } from '../types'
import { todayKey } from '../lib/dates'

export interface Clock {
  today: DateKey
  hour: number
}

function readClock(): Clock {
  const now = new Date()
  return { today: todayKey(now), hour: now.getHours() }
}

/**
 * Today's date key and the current hour, refreshed every minute and when the tab regains focus,
 * so the date and greeting roll over at midnight without a reload. Re-renders only on a change.
 */
export function useClock(): Clock {
  const [clock, setClock] = useState(readClock)
  useEffect(() => {
    const refresh = () =>
      setClock((prev) => {
        const next = readClock()
        return next.today === prev.today && next.hour === prev.hour ? prev : next
      })
    const id = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return clock
}
