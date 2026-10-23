/**
 * The Coach's API. Every route needs a live session (requireAuth); the user id always comes from it.
 * Habits are created in exactly one place, POST /chat/proposals/:id/confirm, which re-checks everything.
 */
import { Hono } from 'hono'
import { z } from 'zod'
import type { Habit } from '../../src/types.js'
import { CHAT_MESSAGE_MAX, type CoachConfirmResult, type CoachMessage, type CoachProposal, type CoachState, type CoachTurn } from '../../src/shared/chat.js'
import { consume, LIMITS, type Limit } from '../auth/rateLimit.js'
import { runChatTurn } from '../chat/orchestrator.js'
import { MAX_HABITS_PER_ACCOUNT } from '../chat/tools.js'
import { normalizeHabitName } from '../chat/recommend.js'
import { MAX_PROPOSAL } from '../chat/toolDefs.js'
import { HttpError, notFound, rateLimited } from '../errors.js'
import { audit, jsonBody, requireAuth, type AppContext, type AppEnv } from '../middleware.js'
import * as chatRepo from '../repo/chat.js'
import * as habitsRepo from '../repo/habits.js'
import { checkHabit } from '../safety/index.js'

export const chatRoutes = new Hono<AppEnv>()
chatRoutes.use('*', requireAuth)

const messageSchema = z.object({ text: z.string().trim().min(1, 'Type a message').max(CHAT_MESSAGE_MAX, `Keep it under ${CHAT_MESSAGE_MAX} characters`) })
const confirmSchema = z.object({ itemIds: z.array(z.string().max(20)).min(1, 'Pick at least one habit').max(MAX_PROPOSAL) })
const uuid = z.uuid()

function idParam(c: AppContext): string {
  const id = c.req.param('id')
  if (!id || !uuid.safeParse(id).success) throw notFound()
  return id
}

async function enforce(c: AppContext, limit: Limit, amount = 1) {
  const state = await consume(c.get('deps'), limit, c.get('userId'), amount)
  if (!state.allowed) {
    audit(c, 'rate_limited', { limit: limit.name, retryAfterSec: state.retryAfterSec }, 'warn')
    throw rateLimited(state.retryAfterSec)
  }
}

/** What the browser sees of a proposal (no user ids). */
const proposalView = (p: chatRepo.Proposal): CoachProposal => ({
  id: p.id,
  status: p.status,
  expiresAt: p.expiresAt.toISOString(),
  items: p.items.map(({ itemId, name, emoji, color, why }) => ({ itemId, name, emoji, color, why })),
})

/** Messages as the browser sees them, with their proposal cards loaded in one query. */
async function messageViews(c: AppContext, messages: readonly chatRepo.ChatMessage[]): Promise<CoachMessage[]> {
  const ids = messages.flatMap((m) => (m.content.proposalId ? [m.content.proposalId] : []))
  const cards = await chatRepo.getProposals(c.get('deps').db, c.get('userId'), ids)
  return messages.map((m) => {
    const p = m.content.proposalId ? cards.get(m.content.proposalId) : undefined
    return { id: m.id, role: m.role, text: m.content.text, kind: m.content.kind ?? null, createdAt: m.createdAt.toISOString(), proposal: p ? proposalView(p) : null }
  })
}

/** The current conversation (after retention cleanup), or none. */
chatRoutes.get('/', async (c) => {
  const { db, now, chatModel } = c.get('deps')
  const uid = c.get('userId')
  await chatRepo.deleteStaleConversations(db, uid, now())
  const conversation = await chatRepo.getLatestConversation(db, uid)
  const stored = conversation ? await chatRepo.listMessages(db, uid, conversation.id) : []
  return c.json<CoachState>({
    available: chatModel !== null,
    practice: chatModel?.practice ?? false,
    conversationId: conversation?.id ?? null,
    messages: await messageViews(c, stored),
  })
})

chatRoutes.post('/messages', async (c) => {
  const deps = c.get('deps')
  if (!deps.chatModel) throw new HttpError(503, 'unavailable', "The Coach isn't set up yet.")
  const { text } = messageSchema.parse(await jsonBody(c))
  await enforce(c, LIMITS.chatPerUser)
  await enforce(c, LIMITS.chatPerUserDay)
  const result = await runChatTurn(deps, deps.chatModel, c.get('userId'), text, (event, fields, level) => audit(c, event, fields, level))
  return c.json<CoachTurn>({
    conversationId: result.conversationId,
    practice: deps.chatModel.practice,
    messages: await messageViews(c, result.messages),
  })
})

/** "Clear chat": deletes the conversation with its messages and proposals at once. */
chatRoutes.delete('/conversations/:id', async (c) => {
  if (!(await chatRepo.deleteConversation(c.get('deps').db, c.get('userId'), idParam(c)))) throw notFound()
  audit(c, 'chat_cleared')
  return c.body(null, 204)
})

chatRoutes.post('/proposals/:id/dismiss', async (c) => {
  if (!(await chatRepo.dismissProposal(c.get('deps').db, c.get('userId'), idParam(c)))) throw notFound()
  return c.body(null, 204)
})

/**
 * Creates the habits the user ticked on a proposal card. The proposal must be this user's, pending and
 * unexpired; it is claimed atomically (so a double tap creates once), and every item is re-checked
 * against the content policy, the user's current habits and the limits before anything is saved.
 */
chatRoutes.post('/proposals/:id/confirm', async (c) => {
  const deps = c.get('deps')
  const uid = c.get('userId')
  const id = idParam(c)
  const { itemIds } = confirmSchema.parse(await jsonBody(c))
  await enforce(c, LIMITS.coachConfirmPerUser)
  // Counted before the transaction (as an upper bound): rate-limit writes must not wait on it.
  await enforce(c, LIMITS.coachHabitsPerDay, new Set(itemIds).size)

  const denied = (reason: string, error: HttpError): never => {
    audit(c, 'proposal_confirm_denied', { proposalId: id, reason }, 'warn')
    throw error
  }

  const outcome = await deps.db.transaction(async (tx) => {
    const claimed = await chatRepo.claimProposal(tx, uid, id, deps.now())
    if (!claimed) {
      const existing = await chatRepo.getProposal(tx, uid, id)
      if (!existing) return denied('not_found', notFound())
      return denied(existing.status === 'pending' ? 'expired' : `already_${existing.status}`,
        new HttpError(409, 'conflict', 'These suggestions were already used or have expired. Ask the Coach again.'))
    }

    const wanted = new Set(itemIds)
    const picked = claimed.items.filter((i) => wanted.has(i.itemId))
    if (picked.length !== wanted.size) return denied('unknown_item', new HttpError(400, 'validation_error', 'Pick habits from this card only.'))

    const current = await habitsRepo.listHabitNames(tx, uid)
    const taken = new Set(current.map(normalizeHabitName))
    const created: Habit[] = []
    const skipped: { name: string; reason: 'duplicate' | 'unsafe' | 'limit' }[] = []
    const toCreate = []
    for (const item of picked) {
      const key = normalizeHabitName(item.name)
      if (!checkHabit(item.name, item.emoji).ok) skipped.push({ name: item.name, reason: 'unsafe' })
      else if (taken.has(key)) skipped.push({ name: item.name, reason: 'duplicate' })
      else if (current.length + toCreate.length >= MAX_HABITS_PER_ACCOUNT) skipped.push({ name: item.name, reason: 'limit' })
      else {
        taken.add(key)
        toCreate.push(item)
      }
    }
    for (const item of toCreate) {
      created.push(await habitsRepo.createHabit(tx, uid, { name: item.name, emoji: item.emoji, color: item.color }, deps.now()))
    }
    return { created, skipped }
  })

  const unsafe = outcome.skipped.filter((s) => s.reason === 'unsafe').length
  if (unsafe > 0) audit(c, 'content_blocked', { source: 'coach_confirm', count: unsafe }, 'warn')
  audit(c, 'proposal_confirmed', { proposalId: id, created: outcome.created.length, skipped: outcome.skipped.length })
  return c.json<CoachConfirmResult>({ created: outcome.created.map((h) => ({ id: h.id, name: h.name })), skipped: outcome.skipped })
})
