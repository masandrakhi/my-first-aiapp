/** Shapes of the Coach API (/api/chat), shared by the server and the browser. */

export const CHAT_MESSAGE_MAX = 1000

export type CoachProposalStatus = 'pending' | 'confirmed' | 'dismissed'

export interface CoachProposalItem {
  itemId: string
  name: string
  emoji: string
  color: string
  why: string
}

export interface CoachProposal {
  id: string
  status: CoachProposalStatus
  expiresAt: string
  items: CoachProposalItem[]
}

export interface CoachMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Server-written messages: the AI disclosure, a safety reply, or a notice (limits). Null for model replies. */
  kind: 'disclosure' | 'safety' | 'notice' | null
  createdAt: string
  proposal: CoachProposal | null
}

/** GET /api/chat */
export interface CoachState {
  /** False when no AI model is configured; the Coach then can't reply. */
  available: boolean
  /** True while the free practice stand-in answers instead of the real model. */
  practice: boolean
  conversationId: string | null
  messages: CoachMessage[]
}

/** POST /api/chat/messages: the new messages to append, in order. */
export interface CoachTurn {
  conversationId: string
  practice: boolean
  messages: CoachMessage[]
}

/** POST /api/chat/proposals/:id/confirm */
export interface CoachConfirmResult {
  created: { id: string; name: string }[]
  skipped: { name: string; reason: 'duplicate' | 'unsafe' | 'limit' }[]
}
