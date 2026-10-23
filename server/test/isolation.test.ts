// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { Client, createHarness, type Harness } from './harness'

const DRAFT = { name: 'Read', emoji: '📚', color: '#059669' }

let h: Harness
let alice: Client
let bob: Client
let aliceHabit: string

beforeAll(async () => {
  h = await createHarness()
  alice = new Client(h, '203.0.113.10')
  bob = new Client(h, '203.0.113.11')
  await alice.register('alice@example.com')
  await bob.register('bob@example.com')
  aliceHabit = (await alice.req('POST', '/api/habits', DRAFT)).body.id
  await alice.req('PUT', `/api/habits/${aliceHabit}/completions/2026-10-21`)
})

describe('per-user data isolation', () => {
  it('lists only the caller’s habits', async () => {
    await bob.req('POST', '/api/habits', { ...DRAFT, name: 'Walk' })
    const mine = await bob.req('GET', '/api/habits')
    expect(mine.body.habits.map((x: { name: string }) => x.name)).toEqual(['Walk'])
    expect(Object.keys(mine.body.completions)).not.toContain(aliceHabit)
  })

  it.each([
    ['GET', () => `/api/habits/${aliceHabit}`, undefined],
    ['PATCH', () => `/api/habits/${aliceHabit}`, { name: 'Hacked' }],
    ['DELETE', () => `/api/habits/${aliceHabit}`, undefined],
    ['PUT', () => `/api/habits/${aliceHabit}/completions/2026-10-20`, undefined],
    ['DELETE', () => `/api/habits/${aliceHabit}/completions/2026-10-21`, undefined],
  ] as const)('%s on another user’s habit returns 404 and changes nothing', async (method, path, body) => {
    const res = await bob.req(method, path(), body)
    expect(res.status).toBe(404)
    expect(JSON.stringify(res.body)).not.toContain('Read')

    const aliceView = await alice.req('GET', '/api/habits')
    expect(aliceView.body.habits).toHaveLength(1)
    expect(aliceView.body.habits[0].name).toBe('Read')
    expect(aliceView.body.completions[aliceHabit]).toEqual(['2026-10-21'])
  })

  it('refuses a reorder that includes another user’s habit', async () => {
    const bobs = (await bob.req('GET', '/api/habits')).body.habits.map((x: { id: string }) => x.id)
    const res = await bob.req('PUT', '/api/habits/order', { ids: [...bobs, aliceHabit] })
    expect(res.status).toBe(400)
  })

  it('applies a reorder of the caller’s own habits, and only theirs', async () => {
    await bob.req('POST', '/api/habits', { ...DRAFT, name: 'Stretch' })
    const before = (await bob.req('GET', '/api/habits')).body.habits.map((x: { id: string }) => x.id)
    expect((await bob.req('PUT', '/api/habits/order', { ids: [...before].reverse() })).status).toBe(204)
    const after = (await bob.req('GET', '/api/habits')).body.habits
    expect(after.map((x: { id: string }) => x.id)).toEqual([...before].reverse())
    expect(after.map((x: { order: number }) => x.order)).toEqual(before.map((_: string, i: number) => i))
    expect((await alice.req('GET', '/api/habits')).body.habits[0].order).toBe(0)
  })

  it('ignores any user id smuggled into a request body', async () => {
    const aliceId = (await alice.req('GET', '/api/me')).body.user.id
    const created = await bob.req('POST', '/api/habits', { ...DRAFT, name: 'Mine', userId: aliceId, user_id: aliceId })
    expect(created.status).toBe(201)
    const aliceView = await alice.req('GET', '/api/habits')
    expect(aliceView.body.habits.map((x: { name: string }) => x.name)).not.toContain('Mine')
  })

  it('answers malformed ids like missing ones (404, no database error)', async () => {
    expect((await bob.req('GET', '/api/habits/not-a-uuid')).status).toBe(404)
    expect((await bob.req('GET', "/api/habits/1' OR '1'='1")).status).toBe(404)
  })

  it('validates check-in dates', async () => {
    const own = (await bob.req('GET', '/api/habits')).body.habits[0].id
    expect((await bob.req('PUT', `/api/habits/${own}/completions/2026-02-30`)).status).toBe(400)
    expect((await bob.req('PUT', `/api/habits/${own}/completions/2027-01-01`)).status).toBe(400)
    expect((await bob.req('PUT', `/api/habits/${own}/completions/2026-10-21`)).status).toBe(204)
  })

  it('imports a device’s legacy data into the caller only, once per device', async () => {
    const legacy = {
      version: 1,
      habits: [{ id: aliceHabit, name: 'Legacy', emoji: '🌱', color: '#f59e0b', order: 0 }],
      completions: { [aliceHabit]: ['2026-10-19', '2026-10-20', '2099-01-01'] },
      settings: { theme: 'dark' },
    }
    const first = await bob.req('POST', '/api/import', { deviceImportId: 'device-1234', data: legacy })
    expect(first.body).toEqual({ imported: 1, skipped: 0, alreadyImported: false })
    const again = await bob.req('POST', '/api/import', { deviceImportId: 'device-1234', data: legacy })
    expect(again.body.alreadyImported).toBe(true)

    const bobView = await bob.req('GET', '/api/habits')
    const legacyHabit = bobView.body.habits.find((x: { name: string }) => x.name === 'Legacy')
    expect(legacyHabit.id).not.toBe(aliceHabit) // fresh server id, not the id from the payload
    expect(legacyHabit.color).toBe('#d97706') // legacy colour upgraded
    expect(bobView.body.completions[legacyHabit.id]).toEqual(['2026-10-19', '2026-10-20']) // future date dropped

    const aliceView = await alice.req('GET', '/api/habits')
    expect(aliceView.body.completions[aliceHabit]).toEqual(['2026-10-21'])
  })

  it('imports several habits in their saved order, after the caller’s existing ones', async () => {
    const carol = new Client(h, '203.0.113.12')
    await carol.register('carol@example.com')
    await carol.req('POST', '/api/habits', { ...DRAFT, name: 'Existing' })
    const legacy = {
      version: 1,
      habits: [
        { id: 'b', name: 'Second', emoji: '🌙', color: '#059669', order: 1 },
        { id: 'a', name: 'First', emoji: '🌞', color: '#059669', order: 0 },
        { id: 'c', name: '   ', emoji: '🚫', color: '#059669', order: 2 },
      ],
      completions: { a: ['2026-10-20'], b: ['2026-10-19', '2026-10-21'] },
      settings: { theme: 'system' },
    }
    expect((await carol.req('POST', '/api/import', { deviceImportId: 'device-5678', data: legacy })).body).toEqual({ imported: 2, skipped: 0, alreadyImported: false })
    const view = (await carol.req('GET', '/api/habits')).body
    expect(view.habits.map((x: { name: string; order: number }) => [x.name, x.order])).toEqual([['Existing', 0], ['First', 1], ['Second', 2]])
    expect(view.completions[view.habits[1].id]).toEqual(['2026-10-20'])
    expect(view.completions[view.habits[2].id]).toEqual(['2026-10-19', '2026-10-21'])
  })

  it('keeps settings per user', async () => {
    await bob.req('PATCH', '/api/me/settings', { theme: 'dark' })
    expect((await alice.req('GET', '/api/me')).body.settings.theme).toBe('system')
    expect((await bob.req('GET', '/api/me')).body.settings.theme).toBe('dark')
  })
})
