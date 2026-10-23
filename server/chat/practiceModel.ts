/**
 * Stand-ins for the real model, so the Coach can be built, tried and tested at no cost.
 *
 * - PracticeChatModel: a simple rule-based coach for local use (shown as "Practice mode" in the app).
 *   It follows the same tool protocol as the real model: search the catalog, then suggest or propose.
 * - ScriptedChatModel: returns pre-written turns, for tests that need the model to (mis)behave exactly.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { HABIT_BLOCKED } from '../safety/responses.js'
import { TOOL } from './toolDefs.js'
import type { ChatModel, ModelRequest, ModelTurn } from './model.js'

const USAGE = { inputTokens: 0, outputTokens: 0 }
const text = (t: string): ModelTurn => ({ content: [{ type: 'text', text: t }], stop: 'end_turn', usage: USAGE })
let toolSeq = 0
const toolCall = (name: string, input: unknown): ModelTurn => ({
  content: [{ type: 'tool_use', id: `practice_${++toolSeq}`, name, input }],
  stop: 'tool_use',
  usage: USAGE,
})

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, a: 1, an: 1 }
/** 'add a habit called "Read at lunch"' → the custom name the user asked for. */
const CUSTOM_NAME = /\b(?:called|named)\s+["“'‘]?([^"”'’\n]{1,40})/i
/** Requests aimed at someone else's account, which the Coach can never act on. */
const OTHER_ACCOUNT = /[\w.+-]+@[\w-]+\.\w+|\bfor (?:my )?(?:friend|user|someone else|another (?:user|account)|him|her|them)\b/i
const WANTS_PROPOSAL = /\b(add|create|set up|setup|make|start|pick|choose|give me|yes|sure|ok|okay|let'?s do)\b/i

/** "add 2 habits", "create three", "yes, the first one" → how many habits the user wants (default 3). */
function requestedCount(message: string): number | null {
  const m = /\b(\d+|one|two|three|four|five)\b(?:\s+(?:of\s+)?(?:these|them|habits?|ideas?))?/i.exec(message)
  if (!m) return null
  const raw = m[1]!.toLowerCase()
  const n = NUMBER_WORDS[raw] ?? Number(raw)
  return Number.isInteger(n) && n > 0 ? Math.min(n, 5) : null
}

const userTexts = (messages: Anthropic.MessageParam[]) =>
  messages.filter((m) => m.role === 'user' && typeof m.content === 'string').map((m) => m.content as string)

function lastToolUse(messages: Anthropic.MessageParam[]): Anthropic.ToolUseBlockParam | undefined {
  const assistant = [...messages].reverse().find((m) => m.role === 'assistant' && Array.isArray(m.content))
  if (!assistant || !Array.isArray(assistant.content)) return undefined
  for (const block of assistant.content) if (block.type === 'tool_use') return block as Anthropic.ToolUseBlockParam
  return undefined
}

function toolResultText(message: Anthropic.MessageParam): { text: string; isError: boolean } | null {
  if (!Array.isArray(message.content)) return null
  for (const b of message.content) {
    if (b.type !== 'tool_result') continue
    const block = b as Anthropic.ToolResultBlockParam
    return { text: typeof block.content === 'string' ? block.content : '', isError: block.is_error === true }
  }
  return null
}

interface SearchHit { id: string; name: string; emoji: string; why: string }

export class PracticeChatModel implements ChatModel {
  readonly practice = true
  readonly name = 'practice'

  async respond({ messages }: ModelRequest): Promise<ModelTurn> {
    const last = messages.at(-1)
    if (!last) return text('Hi! Tell me about something you’d like to improve, like sleep, energy, focus or stress.')
    const texts = userTexts(messages)
    const latest = texts.at(-1) ?? ''
    const result = toolResultText(last)

    // A new message from the user: look at the catalog first, using the recent conversation as context.
    if (!result && OTHER_ACCOUNT.test(latest)) {
      return text("I can only suggest habits for your own account, and nothing is added until you tap Create yourself. What would you like to work on?")
    }
    const custom = CUSTOM_NAME.exec(latest)?.[1]?.trim()
    if (!result && custom) return toolCall(TOOL.propose, { items: [{ kind: 'custom', catalog_id: '', name: custom, emoji: '✨' }] })
    if (!result) return toolCall(TOOL.search, { query: texts.slice(-3).join(' ').slice(0, 200), categories: [], limit: 5 })

    const tool = lastToolUse(messages)
    if (result.isError) {
      // Tool errors are written for the model; turn the known ones into plain answers for the user.
      if (/content policy/.test(result.text)) return text(HABIT_BLOCKED)
      if (/already has all of these/.test(result.text)) return text('You already have those habits. Want me to suggest something different?')
      return text("I couldn't set that up. Could you try asking a different way?")
    }

    if (tool?.name === TOOL.search) {
      const hits = (JSON.parse(result.text) as { results: SearchHit[] }).results
      if (hits.length === 0) {
        return text('I couldn’t find a good match yet. What would you most like to improve — sleep, energy, focus, stress, fitness or screen time?')
      }
      const count = requestedCount(latest)
      if (WANTS_PROPOSAL.test(latest) || count !== null) {
        const picks = hits.slice(0, count ?? 3)
        return toolCall(TOOL.propose, { items: picks.map((h) => ({ kind: 'catalog', catalog_id: h.id, name: '', emoji: '' })) })
      }
      const list = hits.slice(0, 3).map((h) => `• ${h.emoji} ${h.name} — ${h.why}`).join('\n')
      return text(`Here are a few small habits that could help:\n${list}\n\nWould you like me to set some of these up? You could say “add 2 of these”.`)
    }

    if (tool?.name === TOOL.propose) {
      const { items } = JSON.parse(result.text) as { items: string[] }
      return text(`I've put ${items.length === 1 ? 'this habit' : `these ${items.length} habits`} below. Nothing is added until you tap Create — and you can untick any you don't want.`)
    }
    return text('Tell me a bit more about what you’d like to work on.')
  }
}

/** Plays back pre-written turns (or computes them) and records every request, for tests. */
export class ScriptedChatModel implements ChatModel {
  readonly practice = true
  readonly name = 'scripted'
  readonly requests: ModelRequest[] = []
  private readonly script: (request: ModelRequest, index: number) => ModelTurn

  constructor(script: ModelTurn[] | ((request: ModelRequest, index: number) => ModelTurn)) {
    this.script = Array.isArray(script) ? (_, i) => script[Math.min(i, script.length - 1)]! : script
  }

  async respond(request: ModelRequest): Promise<ModelTurn> {
    this.requests.push(structuredClone(request))
    return this.script(request, this.requests.length - 1)
  }
}

export const scripted = { text, toolCall }
