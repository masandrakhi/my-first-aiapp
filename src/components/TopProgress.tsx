/**
 * A thin accent bar at the very top of the screen, shown briefly while switching views.
 * Re-mount it with a new `key` to play it again. Decorative — screen readers get the live announcement instead.
 */
export function TopProgress() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden" aria-hidden="true">
      <div className="h-full w-2/5 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-accent-500 to-transparent motion-reduce:hidden" />
    </div>
  )
}
