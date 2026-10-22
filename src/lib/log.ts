/**
 * Browser-side error logging to the developer console. Records what failed, the HTTP status and
 * error code, and the server's request id (to find the matching server log line). It never logs
 * tokens, passwords or request bodies: callers pass errors, not payloads.
 */
import { ApiError } from '../auth/apiClient'

export function logError(context: string, err: unknown, extra: Record<string, unknown> = {}) {
  const details =
    err instanceof ApiError
      ? { status: err.status, code: err.code, requestId: err.requestId }
      : err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { value: String(err) }
  console.error(`[habits] ${context}`, { ...details, ...extra, at: new Date().toISOString() })
}

/** " (ref abc123)" for messages shown to the user, so a report can be matched to the server logs. */
export const refSuffix = (err: unknown): string =>
  err instanceof ApiError && err.requestId ? ` (ref ${err.requestId})` : ''
