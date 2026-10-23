/**
 * Deterministic catalog search for the Coach. Pure functions: same input, same ranked output, no DB.
 */
import { CATALOG, type CatalogCategory, type CatalogHabit } from './catalog.js'

export interface CatalogQuery {
  /** Free text, e.g. the user's own words ("I can't sleep and I'm always on my phone"). */
  query?: string
  /** When given, only these categories are searched. */
  categories?: readonly CatalogCategory[]
  /** Tags to favour (matched like query words, but weighted higher). */
  tags?: readonly string[]
  limit: number
}

export const SEARCH_LIMIT_MAX = 20

/** Folds a word to a rough stem so "screens"/"screen" and "walks"/"walk" match. */
const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)

/** Words that say nothing about a habit; dropped from free-text queries (stemmed like query words). */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'but', 'can', 'do', 'for', 'from', 'get', 'have', 'i', 'im', 'in', 'into',
  'is', 'it', 'its', 'just', 'me', 'more', 'my', 'need', 'not', 'of', 'on', 'or', 'so', 'some', 'that', 'the',
  'to', 'too', 'want', 'with', 'would', 'you', 'like', 'help', 'habit', 'habits', 'always', 'really', 'very',
].map(stem))

const WEIGHT = { tag: 4, queryTag: 3, queryCategory: 2, queryText: 1 } as const

/** Lowercased, accent-free words of two or more letters or digits. */
function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1)
    .map(stem)
}

interface Indexed {
  habit: CatalogHabit
  tags: Set<string>
  category: Set<string>
  text: Set<string>
}

const INDEX: readonly Indexed[] = CATALOG.map((habit) => ({
  habit,
  tags: new Set(habit.tags.flatMap(words)),
  category: new Set(words(habit.category)),
  text: new Set(words(`${habit.name} ${habit.why}`)),
}))

/**
 * Ranks catalog habits against a query. Explicit tags weigh most, then query words that hit a tag, the
 * category, or the name and "why". With no query and no tags, returns the (filtered) catalog in its own order.
 */
export function searchCatalog({ query, categories, tags, limit }: CatalogQuery): CatalogHabit[] {
  const max = Math.min(Math.max(Math.trunc(limit), 0), SEARCH_LIMIT_MAX)
  const allowed = categories?.length ? new Set<string>(categories) : null
  const tagWords = [...new Set((tags ?? []).flatMap(words))]
  const queryWords = [...new Set(words(query ?? '').filter((w) => !STOP_WORDS.has(w)))]
  const pool = INDEX.filter((i) => !allowed || allowed.has(i.habit.category))
  if (tagWords.length === 0 && queryWords.length === 0) return pool.slice(0, max).map((i) => i.habit)

  return pool
    .map((i, order) => {
      let score = 0
      for (const t of tagWords) if (i.tags.has(t)) score += WEIGHT.tag
      for (const w of queryWords) {
        if (i.tags.has(w)) score += WEIGHT.queryTag
        if (i.category.has(w)) score += WEIGHT.queryCategory
        if (i.text.has(w)) score += WEIGHT.queryText
      }
      return { habit: i.habit, score, order }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max)
    .map((r) => r.habit)
}

/**
 * The form two habit names are compared in: lowercase, emoji and punctuation removed, spaces collapsed.
 * "  Read 10 pages! 📚" and "read 10 PAGES" are the same habit.
 */
export function normalizeHabitName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    // Emoji, skin tones, joiners, variation selectors and keycaps (an alternation: some are combining marks).
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|︎|️|⃣/gu, '')
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Drops items whose name matches one of the user's existing habits after normalising. */
export function excludeExisting<T extends { name: string }>(items: readonly T[], existingHabitNames: readonly string[]): T[] {
  const existing = new Set(existingHabitNames.map(normalizeHabitName))
  return items.filter((item) => !existing.has(normalizeHabitName(item.name)))
}
