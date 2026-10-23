import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../auth/apiClient'
import { useAuth } from '../auth/authContext'
import { logError, refSuffix } from '../lib/log'
import type { CoachConfirmResult, CoachMessage, CoachProposal, CoachState, CoachTurn } from '../shared/chat'

export interface CoachApi {
  status: 'loading' | 'ready' | 'error'
  available: boolean
  practice: boolean
  messages: CoachMessage[]
  sending: boolean
  error: string | null
  send: (text: string) => Promise<boolean>
  confirm: (proposal: CoachProposal, itemIds: string[]) => Promise<CoachConfirmResult | null>
  dismiss: (proposal: CoachProposal) => Promise<void>
  clear: () => Promise<void>
  retry: () => void
}

/** The server's own message for expected outcomes (limits, expiry, "Coach unavailable"); a reference otherwise. */
const message = (err: unknown, fallback: string) =>
  err instanceof ApiError && (err.status < 500 || err.code === 'unavailable') ? err.message : `${fallback}${refSuffix(err)}`

/** The Coach conversation, loaded from and saved on the server (nothing is kept on the device). */
export function useCoach(): CoachApi {
  const { api } = useAuth()
  const [state, setState] = useState<CoachState | null>(null)
  const [status, setStatus] = useState<CoachApi['status']>('loading')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sendingRef = useRef(false)

  const load = useCallback(async () => {
    try {
      setState(await api.request<CoachState>('GET', '/api/chat'))
      setStatus('ready')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return
      logError('loading coach failed', err)
      setStatus('error')
    }
  }, [api])

  // Loads once per visit to the Coach tab (same pattern as HabitsProvider).
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    void load()
  }, [load])

  const replaceProposal = (id: string, change: Partial<CoachProposal>) =>
    setState((s) => s && { ...s, messages: s.messages.map((m) => (m.proposal?.id === id ? { ...m, proposal: { ...m.proposal, ...change } } : m)) })

  const send = useCallback(async (text: string) => {
    if (sendingRef.current) return false
    sendingRef.current = true
    setSending(true)
    setError(null)
    try {
      const turn = await api.request<CoachTurn>('POST', '/api/chat/messages', { text })
      setState((s) => ({
        available: true,
        practice: turn.practice,
        conversationId: turn.conversationId,
        messages: [...(s?.conversationId === turn.conversationId ? s.messages : []), ...turn.messages],
      }))
      return true
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return false
      logError('coach message failed', err)
      setError(message(err, "Couldn't send your message. Please try again."))
      return false
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [api])

  const confirm = useCallback(async (proposal: CoachProposal, itemIds: string[]) => {
    setError(null)
    try {
      const result = await api.request<CoachConfirmResult>('POST', `/api/chat/proposals/${proposal.id}/confirm`, { itemIds })
      replaceProposal(proposal.id, { status: 'confirmed' })
      return result
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null
      logError('coach confirm failed', err)
      setError(message(err, "Couldn't add those habits. Please try again."))
      if (err instanceof ApiError && err.status === 409) replaceProposal(proposal.id, { status: 'dismissed' })
      return null
    }
  }, [api])

  const dismiss = useCallback(async (proposal: CoachProposal) => {
    replaceProposal(proposal.id, { status: 'dismissed' })
    try {
      await api.request('POST', `/api/chat/proposals/${proposal.id}/dismiss`)
    } catch (err) {
      logError('coach dismiss failed', err) // the card can't be used either way; nothing to undo
    }
  }, [api])

  const conversationId = state?.conversationId ?? null
  const clear = useCallback(async () => {
    if (!conversationId) return
    setError(null)
    try {
      await api.request('DELETE', `/api/chat/conversations/${conversationId}`)
      setState((s) => s && { ...s, conversationId: null, messages: [] })
    } catch (err) {
      logError('coach clear failed', err)
      setError(message(err, "Couldn't clear the chat. Please try again."))
    }
  }, [api, conversationId])

  return {
    status,
    available: state?.available ?? true,
    practice: state?.practice ?? false,
    messages: state?.messages ?? [],
    sending,
    error,
    send,
    confirm,
    dismiss,
    clear,
    retry: () => {
      setStatus('loading')
      void load()
    },
  }
}
