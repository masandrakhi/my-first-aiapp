import type { ApiErrorCode } from '../src/shared/schemas'

/** An error that maps directly to a JSON API response. `message` must be safe to show users. */
export class HttpError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500
  readonly code: ApiErrorCode
  readonly fields?: Record<string, string>
  readonly retryAfterSec?: number

  constructor(
    status: HttpError['status'],
    code: ApiErrorCode,
    message: string,
    extra: { fields?: Record<string, string>; retryAfterSec?: number } = {},
  ) {
    super(message)
    this.status = status
    this.code = code
    this.fields = extra.fields
    this.retryAfterSec = extra.retryAfterSec
  }
}

export const unauthorized = () => new HttpError(401, 'unauthorized', 'Please sign in.')
export const notFound = () => new HttpError(404, 'not_found', 'Not found.')
export const rateLimited = (retryAfterSec: number) =>
  new HttpError(429, 'rate_limited', 'Too many attempts. Please wait a moment and try again.', { retryAfterSec })
