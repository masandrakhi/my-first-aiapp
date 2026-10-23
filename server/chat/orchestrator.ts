/**
 * The Coach's single coordinator: one chat turn from the user's message to the stored reply.
 *
 *   user text ─► input check ─┬─ crisis / sexual / romantic / identity ─► fixed reply (model not called)
 *                             └─ ok ─► model + tools (max 4 steps) ─► output check ─► reply (+ support footer)
 *
 * History comes only from the database (the browser sends just the new text), the model's tools can at
 * most save a pending proposal, and every safety decision is made here in code, not by the model.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { HttpError } from '../errors.js'
import type { AppDeps } from '../deps.js'
import type { AuthedUserId } from '../middleware.js'
import * as chatRepo from '../repo/chat.js'
import { checkInput, checkOutput, responses, type OutputCategory } from '../safety/index.js'
import type { ChatModel } from './model.js'
import { SENSITIVE_NOTE, SYSTEM_PROMPT } from './prompt.js'
import { TOOL_DEFS } from './toolDefs.js'
import { runTool, type ToolContext } from './tools.js'

export const MAX_TOOL_STEPS = 4
/** User messages per conversation before the Coach suggests a break and a fresh chat. */
export const MAX_TURNS = 40
/** Messages of history sent to the model. */
export const HISTORY_LIMIT = 30
/** Model tokens per user per day (input + output); about two cents with Claude Haiku 5.5. */
export const DAILY_TOKEN_BUDGET = 150_000
/** The AI disclosure is repeated after this long in an ongoing conversation. */
export const DISCLOSURE_INTERVAL_MS = 3 * 60 * 60 * 1000

export type Audit = (event: string, fields: Record<string, unknown>, level?: 'info' | 'warn') => void

export interface TurnResult {
  conversationId: string
  /** New messages to show, in order (a disclosure may precede the user's message and the reply). */
  messages: chatRepo.ChatMessage[]
  proposal: chatRepo.Proposal | null
}

const REPLACEMENT: Record<OutputCategory, string> = {
  self_harm: responses.CRISIS_RESPONSE,
  violence: responses.VIOLENCE_REFUSAL,
  cyber: responses.CYBER_REFUSAL,
  harassment: responses.HARASSMENT_REFUSAL,
  sexual: responses.SEXUAL_REFUSAL,
  dependency: responses.SAFE_FALLBACK,
  identity: responses.PROFESSIONAL_FALLBACK,
}

const INPUT_REFUSAL = {
  violence: responses.VIOLENCE_REFUSAL,
  cyber: responses.CYBER_REFUSAL,
  harassment: responses.HARASSMENT_REFUSAL,
} as const

const LIMIT_REACHED = `${responses.BREAK_SUGGESTION} This chat is full — tap “Clear chat” to start a new one.`
const BUDGET_REACHED = "You've reached today's Coach limit. Your habits are all saved — come back tomorrow for more ideas."

const utcDay = (d: Date) => d.toISOString().slice(0, 10)

/** Renders stored messages as model history: plain text only, with proposal cards described. */
async function history(deps: AppDeps, uid: AuthedUserId, conversationId: string): Promise<Anthropic.MessageParam[]> {
  const stored = await chatRepo.listMessages(deps.db, uid, conversationId, HISTORY_LIMIT)
  const cards = await chatRepo.getProposals(deps.db, uid, stored.flatMap((m) => (m.content.proposalId ? [m.content.proposalId] : [])))
  const out: Anthropic.MessageParam[] = []
  for (const m of stored) {
    const p = m.content.proposalId ? cards.get(m.content.proposalId) : undefined
    const text = p ? `${m.content.text}\n[Card shown: ${p.items.map((i) => i.name).join(', ')} — ${p.status}]` : m.content.text
    out.push({ role: m.role, content: text })
  }
  while (out[0]?.role === 'assistant') out.shift() // the API needs a user message first
  return out
}

function needsDisclosure(messages: chatRepo.ChatMessage[], now: Date): boolean {
  const last = [...messages].reverse().find((m) => m.content.kind === 'disclosure')
  return !last || now.getTime() - last.createdAt.getTime() >= DISCLOSURE_INTERVAL_MS
}

export async function runChatTurn(deps: AppDeps, model: ChatModel, uid: AuthedUserId, text: string, audit: Audit): Promise<TurnResult> {
  const { db } = deps
  const now = deps.now()
  await chatRepo.deleteStaleConversations(db, uid, now)
  const { conversation } = await chatRepo.getOrCreateLatestConversation(db, uid, now)
  const conversationId = conversation.id
  const added: chatRepo.ChatMessage[] = []
  const save = async (role: chatRepo.ChatRole, content: chatRepo.ChatContent) => {
    const m = await chatRepo.appendMessage(db, uid, conversationId, role, content, deps.now())
    if (!m) throw new HttpError(404, 'not_found', 'Not found.')
    added.push(m)
    return m
  }
  const finish = async (reply: chatRepo.ChatContent, proposal: chatRepo.Proposal | null = null): Promise<TurnResult> => {
    await save('assistant', reply)
    return { conversationId, messages: added, proposal }
  }

  const previous = await chatRepo.listMessages(db, uid, conversationId)
  if (needsDisclosure(previous, now)) await save('assistant', { text: responses.AI_DISCLOSURE, kind: 'disclosure' })
  const turns = previous.filter((m) => m.role === 'user').length
  await save('user', { text })
  if (turns >= MAX_TURNS) return finish({ text: LIMIT_REACHED, kind: 'notice' })

  // 1. Input check, BEFORE any model call: flagged messages get a fixed reply and never reach the API.
  const input = checkInput(text)
  switch (input.kind) {
    case 'crisis':
      audit('safety_crisis_response', { conversationId })
      return finish({ text: responses.CRISIS_RESPONSE, kind: 'safety' })
    case 'violence':
    case 'cyber':
    case 'harassment':
      audit('safety_input_blocked', { category: input.kind, conversationId }, 'warn')
      return finish({ text: INPUT_REFUSAL[input.kind], kind: 'safety' })
    case 'sexual':
    case 'romantic':
      audit('safety_input_blocked', { category: input.kind, conversationId }, 'warn')
      return finish({ text: input.kind === 'sexual' ? responses.SEXUAL_REFUSAL : responses.ROMANTIC_REFUSAL, kind: 'safety' })
    case 'identity':
      return finish({ text: responses.IDENTITY_ANSWER, kind: 'disclosure' })
  }

  const usage = await chatRepo.getUsage(db, uid, utcDay(now))
  if (usage.inputTokens + usage.outputTokens >= DAILY_TOKEN_BUDGET) {
    audit('chat_budget_reached', { conversationId }, 'warn')
    return finish({ text: BUDGET_REACHED, kind: 'notice' })
  }

  // 2. Model and tools. The loop's working messages live only in memory for this turn.
  const system = input.kind === 'sensitive' ? SYSTEM_PROMPT + SENSITIVE_NOTE : SYSTEM_PROMPT
  const messages = await history(deps, uid, conversationId)
  const ctx: ToolContext = { db, uid, conversationId, now, audit, proposal: null }
  const toolsUsed: string[] = []
  const tokens = { input: 0, output: 0 }
  let reply = ''
  let refused = false
  try {
    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const turn = await model.respond({ system, tools: TOOL_DEFS, messages })
      tokens.input += turn.usage.inputTokens
      tokens.output += turn.usage.outputTokens
      const texts = turn.content.filter((b): b is Anthropic.TextBlockParam => b.type === 'text').map((b) => b.text)
      if (turn.stop === 'refusal') {
        refused = true
        break
      }
      const calls = turn.content.filter((b) => b.type === 'tool_use') as Anthropic.ToolUseBlockParam[]
      if (turn.stop !== 'tool_use' || calls.length === 0) {
        reply = texts.join('\n').trim()
        break
      }
      // All results go back in one user message, as the API expects.
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const call of calls) {
        toolsUsed.push(call.name.slice(0, 40))
        const outcome = await runTool(ctx, call.name, call.input)
        results.push({ type: 'tool_result', tool_use_id: call.id, content: outcome.content, is_error: outcome.isError })
      }
      messages.push({ role: 'assistant', content: turn.content }, { role: 'user', content: results })
    }
  } catch (err) {
    if (err instanceof HttpError) throw err
    deps.logger.error('coach model failed', { error: err instanceof Error ? err.message : 'unknown', conversationId })
    throw new HttpError(503, 'unavailable', "The Coach can't reply right now. Please try again in a moment.")
  } finally {
    if (tokens.input + tokens.output > 0) await chatRepo.addUsage(db, uid, utcDay(now), tokens.input, tokens.output)
  }

  // 3. Output check: a reply that breaks a conduct rule is replaced, never shown.
  let proposal = ctx.proposal
  let kind: chatRepo.ChatContent['kind']
  if (refused) {
    reply = responses.SAFE_FALLBACK
    kind = 'safety'
  } else if (!reply) {
    reply = proposal ? "I've put these below. Nothing is added until you tap Create." : responses.SAFE_FALLBACK
  } else {
    const verdict = checkOutput(reply)
    if (verdict.ok === false) { // explicit form: Vercel's type-check narrows only this way
      audit('safety_output_replaced', { category: verdict.category, conversationId }, 'warn')
      reply = REPLACEMENT[verdict.category]
      kind = 'safety'
      if (proposal && verdict.category !== 'dependency' && verdict.category !== 'identity') {
        await chatRepo.dismissProposal(db, uid, proposal.id)
        proposal = null
      }
    }
  }
  if (input.kind === 'sensitive' && reply !== responses.CRISIS_RESPONSE) reply = `${reply}\n\n${responses.SUPPORT_FOOTER}`

  // ("usage", not "tokens": the logger redacts any field whose name contains "token".)
  audit('chat_message', { conversationId, model: model.name, tools: toolsUsed, usageIn: tokens.input, usageOut: tokens.output })
  return finish({ text: reply, ...(kind ? { kind } : {}), ...(proposal ? { proposalId: proposal.id } : {}) }, proposal)
}
