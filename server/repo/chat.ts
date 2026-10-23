/**
 * Coach data: conversations, messages, habit proposals and daily token usage.
 * Like repo/habits.ts, every function takes an AuthedUserId and filters by it in SQL, so another user's
 * chat or proposal reads as missing. Ids are assumed to be valid UUIDs (routes check them first).
 */
import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import { DAY } from '../config.js'
import type { DbOrTx } from '../db/client.js'
import {
  chatConversations, chatMessages, chatUsage, habitProposals,
  type ChatContent, type ChatRole, type ProposalItem, type ProposalStatus,
} from '../db/schema.js'
import type { AuthedUserId } from '../middleware.js'

export type { ChatContent, ChatRole, ProposalItem, ProposalStatus }

/** Chats untouched for this long are deleted. */
export const CONVERSATION_RETENTION_MS = 30 * DAY
/** A proposal can be confirmed for this long after it is offered. */
export const PROPOSAL_TTL_MS = 30 * 60 * 1000

export interface Conversation {
  id: string
  createdAt: Date
  updatedAt: Date
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: ChatContent
  createdAt: Date
}

export interface Proposal {
  id: string
  conversationId: string
  items: ProposalItem[]
  status: ProposalStatus
  createdAt: Date
  expiresAt: Date
  confirmedAt: Date | null
}

export interface DailyUsage {
  inputTokens: number
  outputTokens: number
}

const conversationCols = { id: chatConversations.id, createdAt: chatConversations.createdAt, updatedAt: chatConversations.updatedAt }
const messageCols = { id: chatMessages.id, role: chatMessages.role, content: chatMessages.content, createdAt: chatMessages.createdAt }
const proposalCols = {
  id: habitProposals.id,
  conversationId: habitProposals.conversationId,
  items: habitProposals.items,
  status: habitProposals.status,
  createdAt: habitProposals.createdAt,
  expiresAt: habitProposals.expiresAt,
  confirmedAt: habitProposals.confirmedAt,
}

const ownedConversation = (uid: AuthedUserId, id: string) => and(eq(chatConversations.id, id), eq(chatConversations.userId, uid))
const ownedProposal = (uid: AuthedUserId, id: string) => and(eq(habitProposals.id, id), eq(habitProposals.userId, uid))

export async function getConversation(db: DbOrTx, uid: AuthedUserId, id: string): Promise<Conversation | null> {
  const [row] = await db.select(conversationCols).from(chatConversations).where(ownedConversation(uid, id))
  return row ?? null
}

/** The user's most recently active chat, if any. */
export async function getLatestConversation(db: DbOrTx, uid: AuthedUserId): Promise<Conversation | null> {
  const [row] = await db
    .select(conversationCols)
    .from(chatConversations)
    .where(eq(chatConversations.userId, uid))
    .orderBy(desc(chatConversations.updatedAt), desc(chatConversations.createdAt))
    .limit(1)
  return row ?? null
}

export async function createConversation(db: DbOrTx, uid: AuthedUserId, at: Date): Promise<Conversation> {
  const [row] = await db.insert(chatConversations).values({ userId: uid, createdAt: at, updatedAt: at }).returning(conversationCols)
  return row!
}

/** The latest chat, or a new one when the user has none. `created` tells the caller to show the AI disclosure. */
export async function getOrCreateLatestConversation(db: DbOrTx, uid: AuthedUserId, at: Date): Promise<{ conversation: Conversation; created: boolean }> {
  const latest = await getLatestConversation(db, uid)
  if (latest) return { conversation: latest, created: false }
  return { conversation: await createConversation(db, uid, at), created: true }
}

/** Deletes the chat with its messages and proposals ("Clear chat"). False when it isn't this user's. */
export async function deleteConversation(db: DbOrTx, uid: AuthedUserId, id: string): Promise<boolean> {
  const rows = await db.delete(chatConversations).where(ownedConversation(uid, id)).returning({ id: chatConversations.id })
  return rows.length > 0
}

/** Retention: deletes this user's chats with no activity in the last 30 days. Returns how many went. */
export async function deleteStaleConversations(db: DbOrTx, uid: AuthedUserId, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - CONVERSATION_RETENTION_MS)
  const rows = await db
    .delete(chatConversations)
    .where(and(eq(chatConversations.userId, uid), lt(chatConversations.updatedAt, cutoff)))
    .returning({ id: chatConversations.id })
  return rows.length
}

/**
 * Messages in the order they were written. With `limit`, only the most recent ones (still oldest first).
 * Empty when the conversation isn't this user's.
 */
export async function listMessages(db: DbOrTx, uid: AuthedUserId, conversationId: string, limit?: number): Promise<ChatMessage[]> {
  const where = and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.userId, uid))
  if (limit === undefined) return db.select(messageCols).from(chatMessages).where(where).orderBy(asc(chatMessages.seq))
  const recent = await db.select(messageCols).from(chatMessages).where(where).orderBy(desc(chatMessages.seq)).limit(limit)
  return recent.reverse()
}

export async function countMessages(db: DbOrTx, uid: AuthedUserId, conversationId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.userId, uid)))
  return row?.n ?? 0
}

/** Adds a message and marks the chat active. Null when the conversation isn't this user's. */
export async function appendMessage(
  db: DbOrTx, uid: AuthedUserId, conversationId: string, role: ChatRole, content: ChatContent, at: Date,
): Promise<ChatMessage | null> {
  // The touch doubles as the ownership check; the composite foreign key re-checks it in the database.
  const touched = await db
    .update(chatConversations)
    .set({ updatedAt: at })
    .where(ownedConversation(uid, conversationId))
    .returning({ id: chatConversations.id })
  if (touched.length === 0) return null
  const [row] = await db.insert(chatMessages).values({ conversationId, userId: uid, role, content, createdAt: at }).returning(messageCols)
  return row!
}

/** Saves a pending proposal. Creates no habits. Null when the conversation isn't this user's. */
export async function createProposal(
  db: DbOrTx, uid: AuthedUserId, conversationId: string, items: ProposalItem[], at: Date, ttlMs = PROPOSAL_TTL_MS,
): Promise<Proposal | null> {
  if (!(await getConversation(db, uid, conversationId))) return null
  const [row] = await db
    .insert(habitProposals)
    .values({ userId: uid, conversationId, items, status: 'pending', createdAt: at, expiresAt: new Date(at.getTime() + ttlMs) })
    .returning(proposalCols)
  return row!
}

export async function getProposal(db: DbOrTx, uid: AuthedUserId, id: string): Promise<Proposal | null> {
  const [row] = await db.select(proposalCols).from(habitProposals).where(ownedProposal(uid, id))
  return row ?? null
}

/** Several proposals in one query (for rendering a conversation), keyed by id; missing ones are left out. */
export async function getProposals(db: DbOrTx, uid: AuthedUserId, ids: readonly string[]): Promise<Map<string, Proposal>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select(proposalCols).from(habitProposals).where(and(eq(habitProposals.userId, uid), inArray(habitProposals.id, [...ids])))
  return new Map(rows.map((r) => [r.id, r]))
}

/**
 * Marks a pending, unexpired proposal as confirmed in one statement and returns it, so of two concurrent
 * confirms exactly one gets the proposal. Null for anything else (not this user's, used, dismissed or expired).
 * Run it in the same transaction as the habit inserts so a failed insert releases the claim.
 */
export async function claimProposal(db: DbOrTx, uid: AuthedUserId, id: string, now: Date): Promise<Proposal | null> {
  const [row] = await db
    .update(habitProposals)
    .set({ status: 'confirmed', confirmedAt: now })
    .where(and(ownedProposal(uid, id), eq(habitProposals.status, 'pending'), gt(habitProposals.expiresAt, now)))
    .returning(proposalCols)
  return row ?? null
}

/** "Not now": a pending proposal can no longer be confirmed. False when there was no such pending proposal. */
export async function dismissProposal(db: DbOrTx, uid: AuthedUserId, id: string): Promise<boolean> {
  const rows = await db
    .update(habitProposals)
    .set({ status: 'dismissed' })
    .where(and(ownedProposal(uid, id), eq(habitProposals.status, 'pending')))
    .returning({ id: habitProposals.id })
  return rows.length > 0
}

/** Adds to the user's token count for `day` (YYYY-MM-DD, UTC) and returns the new totals. */
export async function addUsage(db: DbOrTx, uid: AuthedUserId, day: string, inputTokens: number, outputTokens: number): Promise<DailyUsage> {
  const [row] = await db
    .insert(chatUsage)
    .values({ userId: uid, day, inputTokens, outputTokens })
    .onConflictDoUpdate({
      target: [chatUsage.userId, chatUsage.day],
      set: {
        inputTokens: sql`${chatUsage.inputTokens} + excluded.input_tokens`,
        outputTokens: sql`${chatUsage.outputTokens} + excluded.output_tokens`,
      },
    })
    .returning({ inputTokens: chatUsage.inputTokens, outputTokens: chatUsage.outputTokens })
  return row!
}

export async function getUsage(db: DbOrTx, uid: AuthedUserId, day: string): Promise<DailyUsage> {
  const [row] = await db
    .select({ inputTokens: chatUsage.inputTokens, outputTokens: chatUsage.outputTokens })
    .from(chatUsage)
    .where(and(eq(chatUsage.userId, uid), eq(chatUsage.day, day)))
  return row ?? { inputTokens: 0, outputTokens: 0 }
}
