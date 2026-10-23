// @vitest-environment node
/** The content policy is enforced by the API itself, not by the browser. */
import { beforeAll, describe, expect, it } from 'vitest'
import { Client, createHarness, type Harness } from './harness'

let h: Harness
let me: Client
const events = (name: string) =>
  h.logs.map((l) => JSON.parse(l)).filter((l) => l.message === 'security' && l.event === name)

beforeAll(async () => {
  h = await createHarness()
  me = new Client(h)
  await me.register('policy@example.com')
})

describe('habit content policy on the API', () => {
  it.each(['kill', 'Su1c1de', 's u i c i d e', 'Send nudes', 'Visit spam.com'])('refuses to create "%s"', async (name) => {
    const res = await me.req('POST', '/api/habits', { name, emoji: '✨', color: '#059669' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('unsafe_content')
    expect(res.body.error.fields.name).toMatch(/can't be saved/)
  })

  it('refuses to rename a habit to blocked content, and keeps the old name', async () => {
    const { body: habit } = await me.req('POST', '/api/habits', { name: 'Read', emoji: '📚', color: '#059669' })
    const res = await me.req('PATCH', `/api/habits/${habit.id}`, { name: 'k.i.l.l' })
    expect(res.status).toBe(400)
    expect((await me.req('GET', `/api/habits/${habit.id}`)).body.name).toBe('Read')
  })

  it('checks the emoji field as well as the name', async () => {
    const res = await me.req('POST', '/api/habits', { name: 'Walk', emoji: 'sex', color: '#059669' })
    expect(res.status).toBe(400)
  })

  it('still allows everyday habits that contain look-alike words', async () => {
    for (const name of ['Practice a new skill', 'Weed the garden', 'Stop vaping']) {
      expect((await me.req('POST', '/api/habits', { name, emoji: '✨', color: '#059669' })).status).toBe(201)
    }
  })

  it('skips blocked habits during import and reports how many', async () => {
    const legacy = {
      version: 1,
      habits: [
        { id: 'a', name: 'Stretch', emoji: '🧘', color: '#059669', order: 0 },
        { id: 'b', name: 'Starve myself', emoji: '🚫', color: '#059669', order: 1 },
      ],
      completions: {},
      settings: { theme: 'system' },
    }
    const res = await me.req('POST', '/api/import', { deviceImportId: 'device-policy', data: legacy })
    expect(res.body).toEqual({ imported: 1, skipped: 1, alreadyImported: false })
    const names = (await me.req('GET', '/api/habits')).body.habits.map((x: { name: string }) => x.name)
    expect(names).toContain('Stretch')
    expect(names).not.toContain('Starve myself')
  })

  it('logs blocked content by category and source only, never the text', async () => {
    const blocked = events('content_blocked')
    expect(blocked.length).toBeGreaterThan(0)
    expect(blocked[0]).toMatchObject({ category: 'violence', source: 'habit_create' })
    expect(h.logs.join('\n')).not.toMatch(/nudes|Su1c1de|spam\.com|Starve myself/)
  })
})
