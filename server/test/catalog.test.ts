// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { HABIT_COLORS } from '../../src/lib/palette'
import { habitDraftSchema, NAME_MAX } from '../../src/shared/schemas'
import { CATALOG, CATALOG_CATEGORIES, catalogById } from '../chat/catalog'
import { excludeExisting, normalizeHabitName, searchCatalog } from '../chat/recommend'

describe('habit catalog', () => {
  it('has about 40 habits with unique, stable slug ids', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(35)
    const ids = CATALOG.map((h) => h.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(catalogById.size).toBe(CATALOG.length)
    expect(catalogById.get('read-pages')?.name).toBe('Read 10 pages')
  })

  it('covers every category', () => {
    for (const c of CATALOG_CATEGORIES) expect(CATALOG.some((h) => h.category === c)).toBe(true)
  })

  it.each(CATALOG.map((h) => [h.id, h] as const))('%s is a valid habit draft', (_, h) => {
    expect(h.name.length).toBeLessThanOrEqual(NAME_MAX)
    expect(HABIT_COLORS).toContain(h.color)
    expect(habitDraftSchema.safeParse({ name: h.name, emoji: h.emoji, color: h.color }).success).toBe(true)
    expect(h.tags.length).toBeGreaterThan(0)
    expect(h.why.length).toBeGreaterThan(0)
    expect(h.why.length).toBeLessThanOrEqual(80)
  })

  it('has no links, brands or sponsored fields', () => {
    const allowed = ['id', 'name', 'emoji', 'color', 'category', 'tags', 'why']
    for (const h of CATALOG) {
      expect(Object.keys(h).sort()).toEqual([...allowed].sort())
      const text = JSON.stringify(h)
      expect(text).not.toMatch(/https?:|www\.|\.(com|org|net|io|app)\b|@/i)
    }
  })
})

describe('searchCatalog', () => {
  it('ranks habits by query words against tags, category and text', () => {
    const ids = searchCatalog({ query: 'I sleep badly and feel tired', limit: 5 }).map((h) => h.id)
    expect(ids).toHaveLength(5)
    expect(ids[0]).toBe('consistent-bedtime')
    expect(ids.slice(0, 4).every((id) => catalogById.get(id)?.category === 'sleep')).toBe(true)
  })

  it('matches plurals and accents loosely', () => {
    expect(searchCatalog({ query: 'too many screens', limit: 3 }).map((h) => h.category)).toContain('screen-time')
    expect(searchCatalog({ query: 'SLÈEP', limit: 1 })[0]?.category).toBe('sleep')
  })

  it('restricts to the given categories', () => {
    const results = searchCatalog({ query: 'morning', categories: ['tidiness'], limit: 10 })
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((h) => h.category === 'tidiness')).toBe(true)
    expect(results[0]?.id).toBe('make-the-bed')
  })

  it('favours explicit tags', () => {
    expect(searchCatalog({ tags: ['phone', 'meals'], limit: 1 })[0]?.id).toBe('phone-free-meals')
  })

  it('returns the catalog in order when there is nothing to match on, and nothing for unrelated words', () => {
    expect(searchCatalog({ categories: ['social'], limit: 2 }).map((h) => h.id)).toEqual(['message-a-friend', 'call-family'])
    expect(searchCatalog({ query: 'the and my', categories: ['social'], limit: 2 })).toHaveLength(2)
    expect(searchCatalog({ query: 'xylophone quasar', limit: 5 })).toEqual([])
  })

  it('is deterministic and respects the limit', () => {
    const a = searchCatalog({ query: 'stress energy focus', limit: 7 })
    expect(a).toHaveLength(7)
    expect(searchCatalog({ query: 'stress energy focus', limit: 7 })).toEqual(a)
    expect(searchCatalog({ limit: 1000 })).toHaveLength(20)
    expect(searchCatalog({ limit: -3 })).toEqual([])
  })
})

describe('duplicate exclusion', () => {
  it('normalises case, spacing, punctuation and emoji', () => {
    expect(normalizeHabitName('  Read   10 Pages! 📚 ')).toBe('read 10 pages')
    expect(normalizeHabitName('Write one thing I’m grateful for')).toBe(normalizeHabitName("write one thing im grateful for"))
    expect(normalizeHabitName('❤️ Message a friend')).toBe('message a friend')
  })

  it('leaves out habits the user already has', () => {
    const items = searchCatalog({ categories: ['learning'], limit: 10 })
    const kept = excludeExisting(items, ['read 10 PAGES 📚', 'Something else', 'practise an instrument.'])
    expect(kept.map((h) => h.id)).toEqual(['learn-new-words', 'creative-time'])
    expect(excludeExisting(items, [])).toEqual(items)
  })
})
