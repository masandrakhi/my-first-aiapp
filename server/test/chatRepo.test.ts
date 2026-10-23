// @vitest-environment node
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { chatConversations, chatMessages, habitProposals, users } from '../db/schema'
import type { AuthedUserId } from '../middleware'
import * as chat from '../repo/chat'
import { createHarness, type Harness } from './harness'

const ITEMS: chat.ProposalItem[] = [
  { itemId: 'a', catalogId: 'read-pages', name: 'Read 10 pages', emoji: '📚', color: '#2563eb', why: 'Books add up.' },
  { itemId: 'b', name: 'Make my bed', emoji: '🛏️', color: '#0d9488', why: 'A quick win.' },
]

let h: Harness
let alice: AuthedUserId
let bob: AuthedUserId
let now: Date

async function addUser(email: string): Promise<AuthedUserId> {
  const at = h.clock.now()
  const [row] = await h.db.insert(users).values({ email, passwordHash: 'x', passwordChangedAt: at, createdAt: at }).returning({ id: users.id })
  return row!.id as AuthedUserId
}

beforeEach(async () => {
  h = await createHarness()
  now = h.clock.now()
  alice = await addUser('alice@example.com')
  bob = await addUser('bob@example.com')
})

describe('conversations and messages', () => {
  it('creates a conversation once, then returns the latest one', async () => {
    const first = await chat.getOrCreateLatestConversation(h.db, alice, now)
    expect(first.created).toBe(true)
    const again = await chat.getOrCreateLatestConversation(h.db, alice, new Date(now.getTime() + 1000))
    expect(again).toEqual({ conversation: first.conversation, created: false })
    // Bob gets his own.
    const bobs = await chat.getOrCreateLatestConversation(h.db, bob, now)
    expect(bobs.created).toBe(true)
    expect(bobs.conversation.id).not.toBe(first.conversation.id)
  })

  it('appends and lists messages in order, and the latest window oldest-first', async () => {
    const { conversation } = await chat.getOrCreateLatestConversation(h.db, alice, now)
    for (const [i, role] of (['user', 'assistant', 'user'] as const).entries()) {
      // Same timestamp on purpose: order must come from insertion, not the clock.
      expect(await chat.appendMessage(h.db, alice, conversation.id, role, { text: `m${i}` }, now)).not.toBeNull()
    }
    expect((await chat.listMessages(h.db, alice, conversation.id)).map((m) => m.content.text)).toEqual(['m0', 'm1', 'm2'])
    expect((await chat.listMessages(h.db, alice, conversation.id, 2)).map((m) => [m.role, m.content.text])).toEqual([['assistant', 'm1'], ['user', 'm2']])
    expect(await chat.countMessages(h.db, alice, conversation.id)).toBe(3)
  })

  it('marks the conversation active when a message is added', async () => {
    const { conversation } = await chat.getOrCreateLatestConversation(h.db, alice, now)
    const later = new Date(now.getTime() + 60_000)
    await chat.appendMessage(h.db, alice, conversation.id, 'user', { text: 'hi' }, later)
    expect((await chat.getConversation(h.db, alice, conversation.id))?.updatedAt).toEqual(later)
  })

  it('deletes stale conversations after 30 days, only for that user, with their messages and proposals', async () => {
    const old = await chat.createConversation(h.db, alice, now)
    await chat.appendMessage(h.db, alice, old.id, 'user', { text: 'old' }, now)
    await chat.createProposal(h.db, alice, old.id, ITEMS, now)
    const bobOld = await chat.createConversation(h.db, bob, now)
    const later = new Date(now.getTime() + chat.CONVERSATION_RETENTION_MS + 1)
    const fresh = await chat.createConversation(h.db, alice, later)

    expect(await chat.deleteStaleConversations(h.db, alice, later)).toBe(1)
    expect(await chat.getConversation(h.db, alice, old.id)).toBeNull()
    expect(await chat.getConversation(h.db, alice, fresh.id)).not.toBeNull()
    expect(await chat.getConversation(h.db, bob, bobOld.id)).not.toBeNull()
    expect(await h.db.select().from(chatMessages).where(eq(chatMessages.conversationId, old.id))).toEqual([])
    expect(await h.db.select().from(habitProposals).where(eq(habitProposals.conversationId, old.id))).toEqual([])
  })

  it('cascades a user’s chats away when the account is deleted', async () => {
    const c = await chat.createConversation(h.db, alice, now)
    await chat.appendMessage(h.db, alice, c.id, 'user', { text: 'hi' }, now)
    await chat.addUsage(h.db, alice, '2026-10-21', 10, 5)
    await h.db.delete(users).where(eq(users.id, alice))
    expect(await h.db.select().from(chatConversations)).toEqual([])
    expect(await h.db.select().from(chatMessages)).toEqual([])
  })
})

describe('isolation between users', () => {
  it('user B cannot read, write to or delete user A’s conversation', async () => {
    const { conversation } = await chat.getOrCreateLatestConversation(h.db, alice, now)
    await chat.appendMessage(h.db, alice, conversation.id, 'user', { text: 'private' }, now)

    expect(await chat.getConversation(h.db, bob, conversation.id)).toBeNull()
    expect(await chat.getLatestConversation(h.db, bob)).toBeNull()
    expect(await chat.listMessages(h.db, bob, conversation.id)).toEqual([])
    expect(await chat.countMessages(h.db, bob, conversation.id)).toBe(0)
    expect(await chat.appendMessage(h.db, bob, conversation.id, 'user', { text: 'injected' }, now)).toBeNull()
    expect(await chat.createProposal(h.db, bob, conversation.id, ITEMS, now)).toBeNull()
    expect(await chat.deleteConversation(h.db, bob, conversation.id)).toBe(false)

    expect((await chat.listMessages(h.db, alice, conversation.id)).map((m) => m.content.text)).toEqual(['private'])
    expect(await chat.deleteConversation(h.db, alice, conversation.id)).toBe(true)
    expect(await chat.getConversation(h.db, alice, conversation.id)).toBeNull()
  })

  it('the database refuses a message whose user does not own the conversation', async () => {
    const c = await chat.createConversation(h.db, alice, now)
    await expect(
      h.db.insert(chatMessages).values({ conversationId: c.id, userId: bob, role: 'user', content: { text: 'x' }, createdAt: now }),
    ).rejects.toThrow()
  })

  it('user B cannot read, claim or dismiss user A’s proposal', async () => {
    const c = await chat.createConversation(h.db, alice, now)
    const p = (await chat.createProposal(h.db, alice, c.id, ITEMS, now))!
    expect(await chat.getProposal(h.db, bob, p.id)).toBeNull()
    expect(await chat.claimProposal(h.db, bob, p.id, now)).toBeNull()
    expect(await chat.dismissProposal(h.db, bob, p.id)).toBe(false)
    expect((await chat.getProposal(h.db, alice, p.id))?.status).toBe('pending')
  })
})

describe('proposals', () => {
  it('are created pending with a 30-minute expiry and their items', async () => {
    const c = await chat.createConversation(h.db, alice, now)
    const p = (await chat.createProposal(h.db, alice, c.id, ITEMS, now))!
    expect(p).toMatchObject({ conversationId: c.id, items: ITEMS, status: 'pending', confirmedAt: null })
    expect(p.expiresAt.getTime() - now.getTime()).toBe(chat.PROPOSAL_TTL_MS)
    expect(await chat.getProposal(h.db, alice, p.id)).toEqual(p)
  })

  it('can be claimed exactly once, even concurrently', async () => {
    const c = await chat.createConversation(h.db, alice, now)
    const p = (await chat.createProposal(h.db, alice, c.id, ITEMS, now))!
    const results = await Promise.all([chat.claimProposal(h.db, alice, p.id, now), chat.claimProposal(h.db, alice, p.id, now)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(results.find(Boolean)).toMatchObject({ status: 'confirmed', confirmedAt: now, items: ITEMS })
    expect(await chat.claimProposal(h.db, alice, p.id, now)).toBeNull()
    expect(await chat.dismissProposal(h.db, alice, p.id)).toBe(false)
  })

  it('cannot be claimed once expired', async () => {
    const c = await chat.createConversation(h.db, alice, now)
    const p = (await chat.createProposal(h.db, alice, c.id, ITEMS, now))!
    expect(await chat.claimProposal(h.db, alice, p.id, p.expiresAt)).toBeNull()
    expect(await chat.claimProposal(h.db, alice, p.id, new Date(p.expiresAt.getTime() - 1))).not.toBeNull()
  })

  it('cannot be claimed once dismissed', async () => {
    const c = await chat.createConversation(h.db, alice, now)
    const p = (await chat.createProposal(h.db, alice, c.id, ITEMS, now))!
    expect(await chat.dismissProposal(h.db, alice, p.id)).toBe(true)
    expect(await chat.claimProposal(h.db, alice, p.id, now)).toBeNull()
    expect((await chat.getProposal(h.db, alice, p.id))?.status).toBe('dismissed')
  })

  it('a claim inside a failed transaction is released', async () => {
    const c = await chat.createConversation(h.db, alice, now)
    const p = (await chat.createProposal(h.db, alice, c.id, ITEMS, now))!
    await expect(h.db.transaction(async (tx) => {
      expect(await chat.claimProposal(tx, alice, p.id, now)).not.toBeNull()
      throw new Error('habit insert failed')
    })).rejects.toThrow('habit insert failed')
    expect((await chat.getProposal(h.db, alice, p.id))?.status).toBe('pending')
  })
})

describe('daily usage', () => {
  it('adds up per user and per day', async () => {
    expect(await chat.getUsage(h.db, alice, '2026-10-21')).toEqual({ inputTokens: 0, outputTokens: 0 })
    expect(await chat.addUsage(h.db, alice, '2026-10-21', 100, 20)).toEqual({ inputTokens: 100, outputTokens: 20 })
    expect(await chat.addUsage(h.db, alice, '2026-10-21', 50, 5)).toEqual({ inputTokens: 150, outputTokens: 25 })
    await chat.addUsage(h.db, alice, '2026-10-22', 7, 1)
    await chat.addUsage(h.db, bob, '2026-10-21', 1, 1)
    expect(await chat.getUsage(h.db, alice, '2026-10-21')).toEqual({ inputTokens: 150, outputTokens: 25 })
    expect(await chat.getUsage(h.db, alice, '2026-10-22')).toEqual({ inputTokens: 7, outputTokens: 1 })
    expect(await chat.getUsage(h.db, bob, '2026-10-21')).toEqual({ inputTokens: 1, outputTokens: 1 })
  })
})
