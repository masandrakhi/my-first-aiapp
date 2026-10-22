import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/authContext'
import { idlePhase, INACTIVITY_MS } from '../../auth/inactivity'
import { Modal } from '../ui/Modal'

const TICK_MS = 1000

/**
 * Warns two minutes before the 15-minute inactivity sign-out. Only a deliberate click
 * ("Stay signed in") counts as activity; nothing here pings the server in the background.
 */
export function InactivityDialog() {
  const { idleMs, keepAlive, signOut, api } = useAuth()
  const [idle, setIdle] = useState(0)

  useEffect(() => {
    // While the user is active the phase can't change, so keep the old value and skip the re-render.
    const tick = () => setIdle((prev) => {
      const next = idleMs()
      return idlePhase(prev) === 'active' && idlePhase(next) === 'active' ? prev : next
    })
    const id = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(id)
  }, [idleMs])

  const phase = idlePhase(idle)
  useEffect(() => {
    if (phase === 'expired') void api.logout('inactive')
  }, [phase, api])

  if (phase !== 'warning') return null
  const secondsLeft = Math.max(0, Math.ceil((INACTIVITY_MS - idle) / 1000))
  const stay = () => {
    void keepAlive().then(() => setIdle(idleMs())).catch(() => {})
  }

  return (
    <Modal title="Still there?" onClose={stay}>
      <p className="mb-6 text-stone-600 dark:text-stone-300">
        For your security, you'll be signed out in{' '}
        <span className="font-semibold text-stone-900 tabular-nums dark:text-stone-100">
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </span>{' '}
        unless you continue.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void signOut()}
          className="h-12 flex-1 rounded-2xl bg-stone-100 font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
        >
          Sign out
        </button>
        <button
          type="button"
          autoFocus
          onClick={stay}
          className="h-12 flex-1 rounded-2xl bg-accent-600 font-semibold text-white hover:bg-accent-700"
        >
          Stay signed in
        </button>
      </div>
    </Modal>
  )
}
