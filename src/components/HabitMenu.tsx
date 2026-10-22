import { useEffect, useRef, useState } from 'react'
import { Ellipsis, Pencil, Trash2 } from 'lucide-react'
import clsx from 'clsx'

interface HabitMenuProps {
  habitName: string
  onEdit: () => void
  onDelete: () => void
  /** Trigger size: the Today card uses the roomier one, the Week grid's compact rows the smaller. */
  size?: 'md' | 'sm'
}

/** The "…" button with Edit and Delete, shared by the Today cards and the Week grid. */
export function HabitMenu({ habitName, onEdit, onDelete, size = 'md' }: HabitMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return
        setOpen(false)
        buttonRef.current?.focus() // return focus to the trigger
      } else if (!menuRef.current?.contains(e.target as Node)) {
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

  const choose = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label={`Options for ${habitName}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        ref={buttonRef}
        className={clsx(
          'grid place-items-center rounded-full text-stone-600 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200',
          size === 'md' ? 'size-9' : 'size-8',
        )}
      >
        <Ellipsis className="size-5" />
      </button>
      {open && (
        <div
          className={clsx(
            'absolute right-0 z-20 w-36 animate-fade-up overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-stone-900/10 dark:bg-stone-800 dark:ring-white/10',
            size === 'md' ? 'top-10' : 'top-9',
          )}
        >
          <button
            type="button"
            autoFocus
            onClick={choose(onEdit)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-700"
          >
            <Pencil className="size-4" /> Edit
          </button>
          <button
            type="button"
            onClick={choose(onDelete)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
          >
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      )}
    </div>
  )
}
