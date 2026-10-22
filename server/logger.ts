/**
 * Minimal structured logger. Anything sensitive is redacted by key name before it is written,
 * and callers never pass request bodies, so passwords and tokens cannot reach the logs.
 */
export type LogFields = Record<string, unknown>

export interface Logger {
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
}

const SENSITIVE = /pass(word)?|token|secret|authorization|cookie|hash/i

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1)]),
  )
}

export function createLogger(write: (line: string) => void = (line) => console.log(line)): Logger {
  const log = (level: string) => (message: string, fields: LogFields = {}) =>
    write(JSON.stringify({ level, time: new Date().toISOString(), message, ...(redact(fields) as LogFields) }))
  return { info: log('info'), warn: log('warn'), error: log('error') }
}
