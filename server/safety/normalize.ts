/**
 * Turns text into comparable word lists so blocked terms can't slip through with tricks:
 * accents ("kíll"), zero-width characters, leetspeak ("k1ll"), symbols between letters ("k.i.l.l"),
 * letters spread out ("k i l l"), stretched letters ("kiiiill") and words split in two ("sui-cide").
 *
 * Words are compared in "collapsed" form (runs of the same letter reduced to one), so "kill" and
 * "kiiiill" both become "kil". A term spelled with a double letter only matches words that also had
 * one, so collapsing can't create false matches: "boob" (→ "bob") doesn't match the name "Bob", and
 * "xxx" (→ "x") doesn't match the "x" in "3 x 10 push-ups".
 */

// Format and filler characters that render as nothing. Combining marks (including U+034F and
// variation selectors) are removed separately by MARKS after decomposition.
const INVISIBLE = /[­؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ﻿]/g
const MARKS = /\p{M}+/gu

// "1", "!" and "|" can stand for either i or l, so both readings are checked.
const LEET_COMMON: Record<string, string> = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '+': 't', '€': 'e' }
const AMBIGUOUS = /[1!|]/g

export interface Word {
  /** Collapsed spelling: "kiiill" → "kil". */
  c: string
  /** Whether the spelling had a repeated letter before collapsing. */
  d: boolean
}

export interface Normalized {
  /** Words after cleanup, with spread-out letters ("k i l l") joined back together. */
  words: Word[]
  /** Each pair of neighbouring words glued together, to catch a word split in two ("sui-cide"). */
  pairs: Word[]
}

const REPEAT = /(.)\1+/g
const toWord = (raw: string): Word => ({ c: raw.replace(REPEAT, '$1'), d: /(.)\1/.test(raw) })

function rawWords(text: string, ambiguousAs: 'i' | 'l'): string[] {
  const mapped = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(INVISIBLE, '')
    .normalize('NFD')
    .replace(MARKS, '')
    .replace(AMBIGUOUS, ambiguousAs)
    .replace(/[^\p{L}\p{N}]/gu, (ch) => LEET_COMMON[ch] ?? ' ')
    .replace(/[0-9]/g, (d) => LEET_COMMON[d] ?? ' ')

  // Re-join runs of single letters: "k i l l" or "k.i.l.l" (symbols became spaces above).
  const words: string[] = []
  let run = ''
  for (const w of mapped.split(/[^\p{L}]+/u).filter(Boolean)) {
    if (w.length === 1) {
      run += w
      continue
    }
    if (run) words.push(run)
    run = ''
    words.push(w)
  }
  if (run) words.push(run)
  return words
}

function normalized(raw: string[]): Normalized {
  return { words: raw.map(toWord), pairs: raw.slice(1).map((w, i) => toWord(raw[i]! + w)) }
}

/** Every reading of `text` worth checking (one per interpretation of ambiguous characters). */
export function normalizeVariants(text: string): Normalized[] {
  const a = rawWords(text, 'i')
  const b = rawWords(text, 'l')
  return a.join(' ') === b.join(' ') ? [normalized(a)] : [normalized(a), normalized(b)]
}

export interface Term {
  words: Word[]
  /** The last word may be followed by more letters ("suicid" matches "suicidal"). */
  prefix: boolean
  /** The whole phrase written as one word ("killmyself"). */
  joined: Word
}

/** Compiles "suicid*" or "kill myself" into a matcher entry. */
export function compileTerm(term: string): Term {
  const prefix = term.endsWith('*')
  const raw = rawWords(prefix ? term.slice(0, -1) : term, 'i')
  return { words: raw.map(toWord), prefix, joined: toWord(raw.join('')) }
}

const matches = (word: Word, want: Word, prefix: boolean) =>
  (prefix ? word.c.startsWith(want.c) : word.c === want.c) && (!want.d || word.d)

/** True when the phrase appears as consecutive whole words (or glued into one word). */
export function containsTerm({ words, pairs }: Normalized, term: Term): boolean {
  const n = term.words.length
  if (n === 0) return false
  for (let i = 0; i + n <= words.length; i++) {
    if (term.words.every((want, j) => matches(words[i + j]!, want, term.prefix && j === n - 1))) return true
  }
  const glued = n > 1 ? [...words, ...pairs] : pairs
  return glued.some((word) => matches(word, term.joined, term.prefix))
}

/** Compiles a term list once; the returned function checks every normalised reading of a text. */
export function makeMatcher(list: readonly string[]): (variants: readonly Normalized[]) => boolean {
  const terms = list.map(compileTerm)
  return (variants) => variants.some((v) => terms.some((t) => containsTerm(v, t)))
}
