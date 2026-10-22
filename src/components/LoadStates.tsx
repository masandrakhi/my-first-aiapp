import { useEffect } from 'react'
import { X } from 'lucide-react'

/** Placeholder cards while habits load from the server. */
export function HabitsSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading your habits">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[140px] animate-pulse rounded-3xl bg-white ring-1 ring-stone-900/5 motion-reduce:animate-none dark:bg-stone-900 dark:ring-white/10"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  )
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mt-10 rounded-3xl bg-white p-6 text-center ring-1 ring-stone-900/5 dark:bg-stone-900 dark:ring-white/10">
      <p className="font-semibold">We couldn't load your habits.</p>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">Check your connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 h-11 rounded-2xl bg-accent-600 px-5 font-semibold text-white hover:bg-accent-700"
      >
        Try again
      </button>
    </div>
  )
}

/** A save failed and data was reloaded from the server. Disappears after a few seconds. */
export function SyncErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, 6000)
    return () => window.clearTimeout(id)
  }, [message, onDismiss])
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-28 z-40 mx-auto flex max-w-md animate-fade-up items-center gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-xl dark:bg-white dark:text-stone-900"
    >
      <p className="flex-1">{message}</p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="grid size-8 place-items-center rounded-full hover:bg-white/10 dark:hover:bg-stone-900/10">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
