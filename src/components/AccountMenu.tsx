import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
import type { ApiUser } from '../shared/schemas'

/** Avatar button with the signed-in account and a Sign out action. */
export function AccountMenu({ user, onSignOut }: { user: ApiUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const initial = (user.name ?? user.email).trim().charAt(0).toUpperCase()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return
        setOpen(false)
        buttonRef.current?.focus()
      } else if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Account: ${user.email}`}
        className="grid size-9 place-items-center rounded-full bg-accent-100 text-sm font-bold text-accent-800 hover:bg-accent-200 dark:bg-accent-900 dark:text-accent-100 dark:hover:bg-accent-800"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-30 w-64 animate-fade-up overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-stone-900/10 dark:bg-stone-800 dark:ring-white/10">
          <div className="border-b border-stone-900/5 px-4 py-3 dark:border-white/10">
            {user.name && <p className="truncate font-semibold">{user.name}</p>}
            <p className="truncate text-sm text-stone-600 dark:text-stone-400">{user.email}</p>
          </div>
          <button
            type="button"
            autoFocus
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-stone-100 dark:hover:bg-stone-700"
          >
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
