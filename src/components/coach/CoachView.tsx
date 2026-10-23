import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Info, Loader2, SendHorizontal, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { CHAT_MESSAGE_MAX, type CoachMessage } from '../../shared/chat'
import { useCoach } from '../../state/useCoach'
import { ProposalCard } from './ProposalCard'

const STARTERS = ['I sleep badly', 'I want more energy', 'I spend too long on my phone', 'I feel stressed at work']

interface CoachViewProps {
  /** Called after habits were created from a card, so Today and Week can refresh. */
  onHabitsAdded: (count: number) => void
}

/**
 * The AI Coach chat. Replies are plain text (never HTML). It's labelled as an AI, says it isn't a
 * professional, and explains how chats are used; it never starts conversations or sends reminders.
 */
export function CoachView({ onHabitsAdded }: CoachViewProps) {
  const coach = useCoach()
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [coach.messages.length, coach.sending])

  const submit = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || coach.sending) return
    if (await coach.send(trimmed)) setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit(draft)
    }
  }

  return (
    <section aria-label="AI Coach" className="pb-28">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-bold tracking-tight">AI Coach</h2>
        {coach.practice && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
            Practice mode
          </span>
        )}
        {coach.messages.length > 0 && (
          <button
            type="button"
            onClick={() => void coach.clear()}
            className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-200/60 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            <Trash2 className="size-4" aria-hidden="true" /> Clear chat
          </button>
        )}
      </div>

      {coach.status === 'loading' ? (
        <div role="status" aria-label="Loading the Coach" className="h-40 animate-pulse rounded-3xl bg-white ring-1 ring-stone-900/5 motion-reduce:animate-none dark:bg-stone-900 dark:ring-white/10" />
      ) : coach.status === 'error' ? (
        <div role="alert" className="rounded-3xl bg-white p-6 text-center ring-1 ring-stone-900/5 dark:bg-stone-900 dark:ring-white/10">
          <p className="font-semibold">We couldn't load the Coach.</p>
          <button type="button" onClick={coach.retry} className="mt-4 h-11 rounded-2xl bg-accent-600 px-5 font-semibold text-white hover:bg-accent-700">
            Try again
          </button>
        </div>
      ) : !coach.available ? (
        <p className="rounded-3xl bg-white p-6 text-center text-stone-600 ring-1 ring-stone-900/5 dark:bg-stone-900 dark:text-stone-400 dark:ring-white/10">
          The Coach isn't set up yet. Check back soon.
        </p>
      ) : (
        <>
          {coach.messages.length === 0 && (
            <div className="animate-fade-up rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-900/5 dark:bg-stone-900 dark:ring-white/10">
              <p className="font-semibold">Tell me what you'd like to improve.</p>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                I'm an AI coach — not a person or a professional. I'll suggest a few small habits, and add the ones you pick.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void submit(s)}
                    disabled={coach.sending}
                    className="rounded-full bg-accent-50 px-3 py-1.5 text-sm font-medium text-accent-800 hover:bg-accent-100 dark:bg-accent-900/40 dark:text-accent-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div role="log" aria-label="Conversation" aria-live="polite">
          <ul className="space-y-3">
            {coach.messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onConfirm={async (itemIds) => {
                  const result = m.proposal ? await coach.confirm(m.proposal, itemIds) : null
                  if (result && result.created.length > 0) onHabitsAdded(result.created.length)
                  return result
                }}
                onDismiss={() => m.proposal && void coach.dismiss(m.proposal)}
              />
            ))}
          </ul>
          {coach.sending && (
            <p role="status" className="mt-3 flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Coach is typing…
            </p>
          )}
          </div>
          {/* Scroll target; the margin keeps the newest message clear of the fixed message box and tabs. */}
          <div ref={endRef} className="scroll-mb-40" />

          <p className="mt-6 flex gap-2 text-xs text-stone-600 dark:text-stone-400">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              AI can make mistakes and isn't medical advice. Chats are used only to continue this conversation — never for ads — and are deleted after 30 days, or now with Clear chat.
            </span>
          </p>
        </>
      )}

      {coach.error && (
        <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-100">
          {coach.error}
        </p>
      )}

      {coach.status === 'ready' && coach.available && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void submit(draft)
          }}
          className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 border-t border-stone-200/70 bg-paper/90 backdrop-blur-lg dark:border-white/10 dark:bg-paper-dark/90"
        >
          <div className="mx-auto flex max-w-xl items-end gap-2 px-4 py-2">
            <label htmlFor="coach-input" className="sr-only">Message the Coach</label>
            <textarea
              id="coach-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={CHAT_MESSAGE_MAX}
              rows={1}
              placeholder="Describe a goal or a challenge…"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl bg-white px-4 py-2.5 ring-1 ring-stone-900/10 outline-none focus:ring-2 focus:ring-accent-500 dark:bg-stone-900 dark:ring-white/10"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={coach.sending || draft.trim().length === 0}
              className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
            >
              <SendHorizontal className="size-5" aria-hidden="true" />
            </button>
          </div>
          {draft.length > CHAT_MESSAGE_MAX - 200 && (
            <p className="mx-auto max-w-xl px-4 pb-1 text-right text-xs text-stone-600 dark:text-stone-400">
              {draft.length}/{CHAT_MESSAGE_MAX}
            </p>
          )}
        </form>
      )}
    </section>
  )
}

interface MessageBubbleProps {
  message: CoachMessage
  onConfirm: Parameters<typeof ProposalCard>[0]['onConfirm']
  onDismiss: () => void
}

function MessageBubble({ message, onConfirm, onDismiss }: MessageBubbleProps) {
  const mine = message.role === 'user'
  const notice = message.kind !== null
  return (
    <li className={clsx('flex animate-fade-up flex-col', mine ? 'items-end' : 'items-start')}>
      <span className="sr-only">{mine ? 'You said:' : 'Coach said:'}</span>
      <p
        className={clsx(
          'max-w-[85%] rounded-3xl px-4 py-2.5 whitespace-pre-wrap',
          mine
            ? 'rounded-br-lg bg-accent-600 text-white'
            : notice
              ? 'rounded-bl-lg bg-sky-50 text-sky-950 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-50 dark:ring-sky-800/60'
              : 'rounded-bl-lg bg-white shadow-sm ring-1 ring-stone-900/5 dark:bg-stone-900 dark:ring-white/10',
        )}
      >
        {message.text}
      </p>
      {message.proposal && (
        <div className="w-full max-w-[85%]">
          <ProposalCard proposal={message.proposal} onConfirm={onConfirm} onDismiss={onDismiss} />
        </div>
      )}
    </li>
  )
}
