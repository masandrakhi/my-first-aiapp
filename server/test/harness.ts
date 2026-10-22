/**
 * Runs the real API against an in-memory Postgres (PGlite) with a controllable clock and an
 * in-memory mailer. Requests go through app.request(), so no network or ports are involved.
 */
import { createApp } from '../app'
import { loadConfig, MINUTE } from '../config'
import { createPgliteDb, type Db } from '../db/client'
import { createLogger } from '../logger'
import { MemoryMailer } from '../mail/mailer'

export const ORIGIN = 'http://127.0.0.1:5173'

export interface TestClock {
  now: () => Date
  advance: (ms: number) => void
}

export function testClock(start = new Date('2026-10-21T12:00:00Z')): TestClock {
  let t = start.getTime()
  return { now: () => new Date(t), advance: (ms) => { t += ms } }
}

export interface Harness {
  app: ReturnType<typeof createApp>
  db: Db
  clock: TestClock
  mailer: MemoryMailer
  logs: string[]
}

export async function createHarness(): Promise<Harness> {
  const db = await createPgliteDb()
  const clock = testClock()
  const mailer = new MemoryMailer()
  const logs: string[] = []
  const config = { ...loadConfig({
    APP_ORIGIN: ORIGIN,
    JWT_SECRETS: 'test-secret-test-secret-test-secret-0001',
    IP_HASH_SECRET: 'test-ip-secret-test-ip-secret-test-0001',
    COOKIE_SECURE: 'false',
  }), forgotMinMs: 0 }
  const app = createApp({ db, config, mailer, logger: createLogger((l) => logs.push(l)), now: clock.now })
  return { app, db, clock, mailer, logs }
}

export interface Res<T = any> {
  status: number
  body: T
  headers: Headers
}

let clientCount = 0

/** A browser-like client: keeps the refresh cookie, sends the app's Origin, holds an access token. */
export class Client {
  cookie = ''
  token = ''
  ip: string
  private readonly h: Harness

  /** Each client gets its own IP unless one is given, so per-IP rate limits don't leak between tests. */
  constructor(h: Harness, ip = `10.0.${Math.floor(++clientCount / 250)}.${clientCount % 250}`) {
    this.h = h
    this.ip = ip
  }

  async req<T = any>(method: string, path: string, body?: unknown, opts: { origin?: string | null; auth?: boolean } = {}): Promise<Res<T>> {
    const headers: Record<string, string> = { 'x-real-ip': this.ip }
    if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (this.cookie) headers.cookie = this.cookie
    if (this.token && opts.auth !== false) headers.authorization = `Bearer ${this.token}`
    const res = await this.h.app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      const pair = setCookie.split(';')[0]!
      this.cookie = pair.endsWith('=') ? '' : pair
    }
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers }
  }

  async register(email: string, password = 'correct horse battery', name?: string) {
    const res = await this.req('POST', '/api/auth/register', { email, password, ...(name ? { name } : {}) })
    if (res.status === 201) this.token = res.body.accessToken
    return res
  }

  async login(email: string, password = 'correct horse battery') {
    const res = await this.req('POST', '/api/auth/login', { email, password })
    if (res.status === 200) this.token = res.body.accessToken
    return res
  }

  async refresh() {
    const res = await this.req('POST', '/api/auth/refresh', {}, { auth: false })
    if (res.status === 200) this.token = res.body.accessToken
    return res
  }
}

export { MINUTE }
