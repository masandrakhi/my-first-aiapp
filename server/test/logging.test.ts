// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { errorResponse, requestId, requestLog, type AppEnv } from '../middleware'
import { createLogger } from '../logger'
import { Client, createHarness, MINUTE, type Harness } from './harness'

type Line = Record<string, any>

let h: Harness
let n = 0
const email = () => `log${++n}@example.com`
const lines = (): Line[] => h.logs.map((l) => JSON.parse(l))
const events = (name: string) => lines().filter((l) => l.message === 'security' && l.event === name)

beforeAll(async () => {
  h = await createHarness()
})

describe('request ids and request log', () => {
  it('tags every response with X-Request-Id and puts the same id in error bodies and log lines', async () => {
    const c = new Client(h)
    const res = await c.req('GET', '/api/habits')
    const id = res.headers.get('x-request-id')
    expect(id).toMatch(/^[\w-]{8}$/)
    expect(res.body.error.requestId).toBe(id)
    const line = lines().find((l) => l.message === 'request' && l.requestId === id)!
    expect(line).toMatchObject({ method: 'GET', path: '/api/habits', status: 401, errorCode: 'unauthorized' })
  })

  it('records the user and session on signed-in requests', async () => {
    const c = new Client(h)
    const reg = await c.register(email())
    const res = await c.req('GET', '/api/habits')
    const line = lines().find((l) => l.message === 'request' && l.requestId === res.headers.get('x-request-id'))!
    expect(line.userId).toBe(reg.body.user.id)
    expect(line.sessionId).toEqual(expect.any(String))
  })
})

describe('security events', () => {
  it('logs failed logins with a reason and an email reference (never the address)', async () => {
    const e = email()
    await new Client(h).register(e)
    await new Client(h).login(e, 'wrong password!!')
    await new Client(h).login('nobody-here@example.com', 'wrong password!!')
    const [wrong, unknown] = events('login_failed').slice(-2)
    expect(wrong).toMatchObject({ reason: 'wrong_password', emailRef: expect.any(String) })
    expect(wrong!.userId).toEqual(expect.any(String))
    expect(unknown).toMatchObject({ reason: 'unknown_email' })
    expect(JSON.stringify(wrong)).not.toContain(e)
  })

  it('logs lockouts and successful logins', async () => {
    const e = email()
    await new Client(h).register(e)
    for (let i = 0; i < 5; i++) await new Client(h).login(e, 'wrong password!!')
    await new Client(h).login(e)
    expect(events('login_locked').at(-1)).toMatchObject({ level: 'warn', retryAfterSec: expect.any(Number) })
    h.clock.advance(16 * MINUTE)
    await new Client(h).login(e)
    expect(events('login_succeeded').at(-1)).toMatchObject({ userId: expect.any(String), sessionId: expect.any(String) })
  })

  it('warns when a refresh token is reused', async () => {
    const c = new Client(h)
    const reg = await c.register(email())
    const stolen = c.cookie
    await c.refresh()
    const attacker = new Client(h)
    attacker.cookie = stolen
    await attacker.refresh()
    expect(events('refresh_reuse_detected').at(-1)).toMatchObject({ level: 'warn', userId: reg.body.user.id })
  })

  it('explains inactivity expiry on both API requests and refresh', async () => {
    const c = new Client(h)
    await c.register(email())
    h.clock.advance(10 * MINUTE)
    await c.refresh()
    h.clock.advance(5 * MINUTE + 1000)
    await c.req('GET', '/api/habits')
    expect(events('session_expired').at(-1)).toMatchObject({ reason: 'inactive' })

    const d = new Client(h)
    await d.register(email())
    h.clock.advance(16 * MINUTE)
    await d.refresh()
    expect(events('refresh_failed').at(-1)).toMatchObject({ reason: 'inactive' })
  })

  it('logs blocked cross-site requests', async () => {
    await new Client(h).req('POST', '/api/auth/refresh', {}, { origin: 'https://evil.example', auth: false })
    expect(events('origin_blocked').at(-1)).toMatchObject({ level: 'warn', origin: 'https://evil.example' })
  })

  it('logs password reset requests and completions', async () => {
    const e = email()
    const c = new Client(h)
    const reg = await c.register(e)
    await new Client(h).req('POST', '/api/auth/password/forgot', { email: e })
    expect(events('password_reset_requested').at(-1)).toMatchObject({ accountExists: true, emailSent: true, userId: reg.body.user.id })
    const link = h.mailer.sent.at(-1)!.text.match(/#reset=([\w-]+)/)![1]!
    await new Client(h).req('POST', '/api/auth/password/reset', { token: link, newPassword: 'another fine passphrase' })
    expect(events('password_reset_completed').at(-1)).toMatchObject({ userId: reg.body.user.id, allSessionsRevoked: true })
    await new Client(h).req('POST', '/api/auth/password/reset', { token: link, newPassword: 'another fine passphrase' })
    expect(events('password_reset_failed').at(-1)).toMatchObject({ reason: 'invalid_reset_link' })
  })
})

describe('unexpected errors', () => {
  it('logs the full stack with the request id, but sends the user only a generic message', async () => {
    const logs: string[] = []
    const app = new Hono<AppEnv>()
    app.use('*', async (c, next) => {
      c.set('deps', { logger: createLogger((l) => logs.push(l)) } as never)
      await next()
    })
    app.use('*', requestId)
    app.use('*', requestLog)
    app.get('/boom', () => {
      throw new Error('database exploded')
    })
    app.onError(errorResponse)

    const res = await app.request('/boom')
    const body = (await res.json()) as { error: unknown }
    expect(res.status).toBe(500)
    expect(body.error).toEqual({ code: 'server_error', message: 'Something went wrong. Please try again.', requestId: res.headers.get('x-request-id') })
    const error = logs.map((l) => JSON.parse(l)).find((l) => l.message === 'unhandled error')!
    expect(error.requestId).toBe(res.headers.get('x-request-id'))
    expect(error.error.message).toBe('database exploded')
    expect(error.error.stack).toContain('logging.test.ts')
  })
})

describe('log hygiene', () => {
  it('never contains passwords, tokens, cookies or email addresses', async () => {
    const e = email()
    const c = new Client(h)
    await c.register(e, 'super secret passphrase')
    await c.login(e, 'super secret passphrase')
    await c.refresh()
    await c.req('POST', '/api/auth/password/forgot', { email: e })
    const all = h.logs.join('\n')
    expect(all).not.toContain('super secret passphrase')
    expect(all).not.toContain(c.token)
    expect(all).not.toContain(c.cookie.split('=')[1]!)
    expect(all).not.toContain(e)
    expect(all).not.toMatch(/#reset=/)
  })
})
