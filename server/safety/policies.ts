/**
 * The three content checkpoints. All deterministic: they run on the server around the AI model and
 * are the authority on what is allowed. Instructions to the model are only a second line of defence.
 *
 * - checkHabit:   any habit name/emoji before it is saved (Coach proposals, manual create/rename, import)
 * - checkInput:   each chat message BEFORE the model is called (a flagged message never reaches the API)
 * - checkOutput:  each model reply AFTER it returns and before the user sees or the server stores it
 */
import { makeMatcher, normalizeVariants, type Normalized } from './normalize.js'
import {
  BENIGN_IDIOMS, CRISIS_PHRASES, CYBER, DRUGS, EATING_DISORDER, FIRST_PERSON, HARASSMENT, HATE_SLURS, IDENTITY_QUESTIONS,
  OUTPUT_CYBER, OUTPUT_DEPENDENCY, OUTPUT_HARASSMENT, OUTPUT_IDENTITY, OUTPUT_SELF_HARM, OUTPUT_VIOLENCE, ROMANTIC,
  SELF_HARM, SELF_HARM_TOPICS, SENSITIVE_TOPICS, SEXUAL, THIRD_PARTY, URL_PATTERN, VIOLENCE, VIOLENCE_CORE,
} from './terms.js'

/** Normalised readings of `text` after removing harmless idioms ("cutting myself some slack"). */
const readings = (text: string) => normalizeVariants(BENIGN_IDIOMS.reduce((t, idiom) => t.replace(idiom, ' '), text))

export type HabitCategory =
  | 'self_harm' | 'violence' | 'cyber' | 'harassment' | 'eating_disorder' | 'sexual' | 'romantic' | 'drugs' | 'link'

type Rule<C> = [C, (v: readonly Normalized[]) => boolean]

const HABIT_RULES: Rule<HabitCategory>[] = [
  ['self_harm', makeMatcher(SELF_HARM)],
  ['violence', makeMatcher(VIOLENCE)],
  ['cyber', makeMatcher(CYBER)],
  ['harassment', makeMatcher([...HARASSMENT, ...HATE_SLURS])],
  ['eating_disorder', makeMatcher(EATING_DISORDER)],
  ['sexual', makeMatcher(SEXUAL)],
  ['romantic', makeMatcher(ROMANTIC)],
  ['drugs', makeMatcher(DRUGS)],
]

export type HabitCheck = { ok: true } | { ok: false; category: HabitCategory }

/** Checks every text that would be saved as part of a habit (name, emoji). */
export function checkHabit(...texts: string[]): HabitCheck {
  for (const text of texts) {
    if (URL_PATTERN.test(text)) return { ok: false, category: 'link' }
    const variants = readings(text)
    for (const [category, matches] of HABIT_RULES) if (matches(variants)) return { ok: false, category }
  }
  return { ok: true }
}

export type InputCheck =
  | { kind: 'ok' }
  /** A sensitive topic that isn't a crisis: the model may answer, with extra care and the support footer. */
  | { kind: 'sensitive' }
  | { kind: 'crisis' }
  | { kind: 'violence' }
  | { kind: 'cyber' }
  | { kind: 'harassment' }
  | { kind: 'sexual' }
  | { kind: 'romantic' }
  | { kind: 'identity' }

const isCrisisPhrase = makeMatcher(CRISIS_PHRASES)
const mentionsSelfHarm = makeMatcher(SELF_HARM_TOPICS)
const isFirstPerson = makeMatcher(FIRST_PERSON)
const aboutSomeoneElse = makeMatcher(THIRD_PARTY)
const isSensitive = makeMatcher(SENSITIVE_TOPICS)
// Chat uses violent intent and entities only, so "kill time" or "beat my record" aren't refused.
const isViolent = makeMatcher(VIOLENCE_CORE)
const isCyber = makeMatcher(CYBER)
const isHarassment = makeMatcher([...HARASSMENT, ...HATE_SLURS])
const isSexual = makeMatcher(SEXUAL)
const isRomantic = makeMatcher(ROMANTIC)
const asksIdentity = makeMatcher(IDENTITY_QUESTIONS)

/** Classifies a user's chat message. Order matters: a crisis outranks everything else. */
export function checkInput(text: string): InputCheck {
  const v = readings(text)
  if (isCrisisPhrase(v)) return { kind: 'crisis' }
  // "I keep thinking about suicide" is a crisis; "my friend's suicide" or "suicide prevention" is sensitive.
  if (mentionsSelfHarm(v) && isFirstPerson(v) && !aboutSomeoneElse(v)) return { kind: 'crisis' }
  if (isViolent(v)) return { kind: 'violence' }
  if (isCyber(v)) return { kind: 'cyber' }
  if (isHarassment(v)) return { kind: 'harassment' }
  if (isSexual(v)) return { kind: 'sexual' }
  if (isRomantic(v)) return { kind: 'romantic' }
  if (asksIdentity(v)) return { kind: 'identity' }
  if (isSensitive(v)) return { kind: 'sensitive' }
  return { kind: 'ok' }
}

export type OutputCategory = 'self_harm' | 'violence' | 'cyber' | 'harassment' | 'sexual' | 'dependency' | 'identity'
export type OutputCheck = { ok: true } | { ok: false; category: OutputCategory }

const OUTPUT_RULES: Rule<OutputCategory>[] = [
  ['self_harm', makeMatcher(OUTPUT_SELF_HARM)],
  ['violence', makeMatcher(OUTPUT_VIOLENCE)],
  ['cyber', makeMatcher(OUTPUT_CYBER)],
  ['harassment', makeMatcher(OUTPUT_HARASSMENT)],
  ['sexual', makeMatcher(SEXUAL)],
  ['dependency', makeMatcher(OUTPUT_DEPENDENCY)],
  ['identity', makeMatcher(OUTPUT_IDENTITY)],
]

/** Checks a model reply before it is shown or stored. */
export function checkOutput(text: string): OutputCheck {
  const v = readings(text)
  for (const [category, matches] of OUTPUT_RULES) if (matches(v)) return { ok: false, category }
  return { ok: true }
}
