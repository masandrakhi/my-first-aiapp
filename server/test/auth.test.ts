// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { Client, createHarness, MINUTE, type Harness } from './harness'

let h: Harness
let n = 0
const email = () => `user${++n}@example.com`

beforeAll(async () => {
  h = await createHarness()
})

describe('registration and login', () => {
  it('registers, returns a 15-minute access token, and sets an HttpOnly SameSite=Strict refresh cookie', async () => {
    const c = new Client(h)
    const res = await c.register(email(), 'correct horse battery', 'Ana')
    expect(res.status).toBe(201)
    expect(res.body.expiresIn).toBe(900)
    expect(res.body.user).toMatchObject({ name: 'Ana' })
    expect(res.body.user).not.toHaveProperty('passwordHash')
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Strict/i)
    expect(cookie).toMatch(/Path=\/api\/auth/i)
  })

  it('stores an Argon2id hash, never the plaintext password', async () => {
    const e = email()
    await new Client(h).register(e, 'my plaintext secret')
    const { users } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    const [row] = await h.db.select().from(users).where(eq(users.email, e))
    expect(row!.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(row!.passwordHash).not.toContain('my plaintext secret')
  })

  it('rejects short and common passwords with field errors', async () => {
    const short = await new Client(h).register(email(), 'short')
    expect(short.status).toBe(400)
    expect(short.body.error.fields.password).toMatch(/at least 12/)
    const common = await new Client(h).register(email(), 'password1234')
    expect(common.status).toBe(400)
    expect(common.body.error.code).toBe('validation_error')
  })

  it('treats emails case-insensitively and refuses duplicates', async () => {
    const e = email()
    await new Client(h).register(e)
    const dup = await new Client(h).register(e.toUpperCase())
    expect(dup.status).toBe(409)
    expect((await new Client(h).login(e.toUpperCase())).status).toBe(200)
  })

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    const e = email()
    await new Client(h).register(e)
    const wrong = await new Client(h).login(e, 'not the right password')
    const unknown = await new Client(h).login('nobody@example.com', 'whatever whatever')
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    // Identical apart from each request's own id: nothing reveals whether the email exists.
    const { requestId: _a, ...wrongError } = wrong.body.error
    const { requestId: _b, ...unknownError } = unknown.body.error
    expect(wrongError).toEqual(unknownError)
    expect(wrong.body.error.message).toBe('Email or password is incorrect.')
  })

  it('locks an email after 5 failed logins (429 with Retry-After), even for the right password', async () => {
    const e = email()
    await new Client(h).register(e)
    for (let i = 0; i < 5; i++) expect((await new Client(h, `198.51.100.${i}`).login(e, 'wrong password!!')).status).toBe(401)
    const locked = await new Client(h, '198.51.100.99').login(e)
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0)
    h.clock.advance(16 * MINUTE)
    expect((await new Client(h, '198.51.100.99').login(e)).status).toBe(200)
  })

  it('rate-limits login attempts per IP', async () => {
    const c = new Client(h, '192.0.2.77')
    let last = 0
    for (let i = 0; i < 21; i++) last = (await c.login(`spray${i}@example.com`, 'some password!!')).status
    expect(last).toBe(429)
  })
})

describe('access tokens, inactivity and refresh', () => {
  it('requires a valid Bearer token for protected routes (401)', async () => {
    const anon = await new Client(h).req('GET', '/api/habits')
    expect(anon.status).toBe(401)
    const forged = new Client(h)
    forged.token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid'
    expect((await forged.req('GET', '/api/habits')).status).toBe(401)
  })

  it('expires access tokens after 15 minutes even while the session is active', async () => {
    const c = new Client(h)
    await c.register(email())
    h.clock.advance(14 * MINUTE)
    expect((await c.req('GET', '/api/habits')).status).toBe(200) // activity at 14 min
    h.clock.advance(2 * MINUTE) // token is now 16 minutes old, session active 2 minutes ago
    const res = await c.req('GET', '/api/habits')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('token_expired')
    expect((await c.refresh()).status).toBe(200)
    expect((await c.req('GET', '/api/habits')).status).toBe(200)
  })

  it('signs the user out after 15 minutes without activity, separately from token expiry', async () => {
    const c = new Client(h)
    await c.register(email())
    h.clock.advance(14 * MINUTE + 59_000)
    expect((await c.req('GET', '/api/habits')).status).toBe(200) // 14:59 → still active
    h.clock.advance(15 * MINUTE + 1000)
    const idle = await c.req('GET', '/api/habits')
    expect(idle.status).toBe(401)
    const refreshed = await c.refresh()
    expect(refreshed.status).toBe(401)
    expect(refreshed.body.error.code).toBe('session_expired')
  })

  it('rejects a still-valid access token once the session has been idle for 15 minutes', async () => {
    const c = new Client(h)
    await c.register(email()) // activity at 0:00
    h.clock.advance(10 * MINUTE)
    expect((await c.refresh()).status).toBe(200) // fresh token at 10:00; refreshing is not activity
    h.clock.advance(5 * MINUTE + 1000) // 15:01 idle, but the token is only 5 minutes old
    const res = await c.req('GET', '/api/habits')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('session_expired')
  })

  it('does not let refreshing keep an idle session alive', async () => {
    const c = new Client(h)
    await c.register(email())
    for (let i = 0; i < 3; i++) {
      h.clock.advance(6 * MINUTE)
      const res = await c.refresh() // 6, 12 minutes: allowed but NOT activity
      if (i < 2) expect(res.status).toBe(200)
      else expect(res.body.error.code).toBe('session_expired') // 18 minutes since last activity
    }
  })

  it('rotates refresh tokens and revokes the whole session when an old one is reused', async () => {
    const c = new Client(h)
    await c.register(email())
    const stolen = c.cookie
    const rotated = await c.refresh()
    expect(rotated.status).toBe(200)
    expect(rotated.body.user).toMatchObject({ email: expect.stringContaining('@'), name: null })
    expect(c.cookie).not.toBe(stolen)

    const attacker = new Client(h)
    attacker.cookie = stolen
    const reuse = await attacker.refresh()
    expect(reuse.status).toBe(401)
    expect(reuse.body.error.code).toBe('invalid_refresh')

    // The legitimate client's newer token is revoked too, and so is its access token's session.
    expect((await c.refresh()).status).toBe(401)
    expect((await c.req('GET', '/api/habits')).status).toBe(401)
  })

  it('logout revokes the session and refresh token and clears the cookie', async () => {
    const c = new Client(h)
    await c.register(email())
    const cookie = c.cookie
    const out = await c.req('POST', '/api/auth/logout', {})
    expect(out.status).toBe(204)
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/i)
    expect((await c.req('GET', '/api/habits')).status).toBe(401)
    const replay = new Client(h)
    replay.cookie = cookie
    expect((await replay.refresh()).status).toBe(401)
  })

  it('counts "Stay signed in" as activity', async () => {
    const c = new Client(h)
    await c.register(email())
    h.clock.advance(13 * MINUTE)
    expect((await c.req('POST', '/api/session/keepalive', {})).status).toBe(204)
    h.clock.advance(13 * MINUTE)
    expect((await c.refresh()).status).toBe(200) // 13 min since keepalive
  })

  it('blocks state-changing requests from another origin (403)', async () => {
    const c = new Client(h)
    await c.register(email())
    const res = await c.req('POST', '/api/auth/refresh', {}, { origin: 'https://evil.example', auth: false })
    expect(res.status).toBe(403)
    expect((await c.req('POST', '/api/habits', { name: 'x', emoji: '✨', color: '#059669' }, { origin: null })).status).toBe(403)
  })
})

describe('password reset', () => {
  it('always answers the same way, emails a single-use link, and signs out every session', async () => {
    const e = email()
    const phone = new Client(h)
    await phone.register(e)
    const laptop = new Client(h)
    await laptop.login(e)

    const sentBefore = h.mailer.sent.length
    const known = await new Client(h).req('POST', '/api/auth/password/forgot', { email: e })
    const unknown = await new Client(h).req('POST', '/api/auth/password/forgot', { email: 'ghost@example.com' })
    expect(known.status).toBe(202)
    expect(unknown.status).toBe(202)
    expect(known.body).toEqual(unknown.body)
    expect(h.mailer.sent.length).toBe(sentBefore + 1)

    const link = h.mailer.sent.at(-1)!.text.match(/#reset=([\w-]+)/)![1]!
    const reset = await new Client(h).req('POST', '/api/auth/password/reset', { token: link, newPassword: 'a brand new passphrase' })
    expect(reset.status).toBe(204)
    expect(h.mailer.sent.at(-1)!.subject).toMatch(/changed/)

    // Every existing session is gone, the old password fails, the new one works.
    expect((await phone.req('GET', '/api/habits')).status).toBe(401)
    expect((await laptop.refresh()).status).toBe(401)
    expect((await new Client(h).login(e)).status).toBe(401)
    expect((await new Client(h).login(e, 'a brand new passphrase')).status).toBe(200)

    const again = await new Client(h).req('POST', '/api/auth/password/reset', { token: link, newPassword: 'yet another passphrase' })
    expect(again.status).toBe(400)
    expect(again.body.error.code).toBe('invalid_reset_link')
  })

  it('keeps an earlier link valid after a second request, and using either retires the other', async () => {
    const e = email()
    await new Client(h).register(e)
    const linkFrom = () => h.mailer.sent.at(-1)!.text.match(/#reset=([\w-]+)/)![1]!
    await new Client(h).req('POST', '/api/auth/password/forgot', { email: e })
    const first = linkFrom()
    await new Client(h).req('POST', '/api/auth/password/forgot', { email: e })
    const second = linkFrom()
    expect(second).not.toBe(first)

    // People often open the first email: it still works.
    const reset = await new Client(h).req('POST', '/api/auth/password/reset', { token: first, newPassword: 'a brand new passphrase' })
    expect(reset.status).toBe(204)
    // ...and the second link is now retired, so a forwarded or leaked copy is useless.
    const later = await new Client(h).req('POST', '/api/auth/password/reset', { token: second, newPassword: 'yet another passphrase' })
    expect(later.body.error.code).toBe('invalid_reset_link')
  })

  it('logs why a reset link was refused, never the link', async () => {
    const e = email()
    await new Client(h).register(e)
    await new Client(h).req('POST', '/api/auth/password/forgot', { email: e })
    const link = h.mailer.sent.at(-1)!.text.match(/#reset=([\w-]+)/)![1]!
    const refusals = () => h.logs.map((l) => JSON.parse(l)).filter((l) => l.event === 'password_reset_failed').map((l) => l.linkState)

    await new Client(h).req('POST', '/api/auth/password/reset', { token: 'x'.repeat(43), newPassword: 'a brand new passphrase' })
    await new Client(h).req('POST', '/api/auth/password/reset', { token: link, newPassword: 'a brand new passphrase' })
    await new Client(h).req('POST', '/api/auth/password/reset', { token: link, newPassword: 'another passphrase here' })
    await new Client(h).req('POST', '/api/auth/password/forgot', { email: e })
    const stale = h.mailer.sent.at(-1)!.text.match(/#reset=([\w-]+)/)![1]!
    h.clock.advance(31 * MINUTE)
    await new Client(h).req('POST', '/api/auth/password/reset', { token: stale, newPassword: 'a brand new passphrase' })

    expect(refusals().slice(-3)).toEqual(['unknown', 'used', 'expired'])
    expect(h.logs.join('\n')).not.toContain(link)
  })

  it('rejects expired reset links', async () => {
    const e = email()
    await new Client(h).register(e)
    await new Client(h).req('POST', '/api/auth/password/forgot', { email: e })
    const link = h.mailer.sent.at(-1)!.text.match(/#reset=([\w-]+)/)![1]!
    h.clock.advance(31 * MINUTE)
    const res = await new Client(h).req('POST', '/api/auth/password/reset', { token: link, newPassword: 'a brand new passphrase' })
    expect(res.status).toBe(400)
  })
})

describe('logging', () => {
  it('never writes passwords or tokens to the logs', async () => {
    const c = new Client(h)
    await c.register(email(), 'super secret passphrase')
    await c.refresh()
    await c.req('GET', '/api/habits')
    const all = h.logs.join('\n')
    expect(all).not.toContain('super secret passphrase')
    expect(all).not.toContain(c.token)
    expect(all).not.toContain(c.cookie.split('=')[1]!)
  })
})
