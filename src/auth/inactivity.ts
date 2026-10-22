/** Mirrors the server's 15-minute inactivity timeout. The server is authoritative; this only drives the UI. */
export const INACTIVITY_MS = 15 * 60_000
/** The "Still there?" warning appears this long before sign-out. */
export const WARNING_MS = 2 * 60_000

export type IdlePhase = 'active' | 'warning' | 'expired'

export function idlePhase(idleMs: number): IdlePhase {
  if (idleMs >= INACTIVITY_MS) return 'expired'
  if (idleMs >= INACTIVITY_MS - WARNING_MS) return 'warning'
  return 'active'
}
