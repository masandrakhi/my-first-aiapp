import { useId, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import type { CoachConfirmResult, CoachProposal } from '../../shared/chat'

interface ProposalCardProps {
  proposal: CoachProposal
  onConfirm: (itemIds: string[]) => Promise<CoachConfirmResult | null>
  onDismiss: () => void
}

const SKIP_REASON = { duplicate: 'you already have it', unsafe: "it isn't allowed", limit: "you've reached the habit limit" } as const

/**
 * The Coach's suggestions as a card. Nothing is created until the user taps Create; they can untick
 * any habit first. The server re-checks everything when the card is confirmed.
 */
export function ProposalCard({ proposal, onConfirm, onDismiss }: ProposalCardProps) {
  const [selected, setSelected] = useState(() => new Set(proposal.items.map((i) => i.itemId)))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CoachConfirmResult | null>(null)
  const headingId = useId()
  // Read the clock once when the card appears; a card left open past expiry is refused by the server anyway.
  const [shownAt] = useState(() => Date.now())
  const expired = proposal.status === 'pending' && new Date(proposal.expiresAt).getTime() <= shownAt
  const open = proposal.status === 'pending' && !expired && !result

  const toggle = (itemId: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })

  const create = async () => {
    setBusy(true)
    const outcome = await onConfirm(proposal.items.filter((i) => selected.has(i.itemId)).map((i) => i.itemId))
    setBusy(false)
    if (outcome) setResult(outcome)
  }

  return (
    <section aria-labelledby={headingId} className="mt-2 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-900/5 dark:bg-stone-900 dark:ring-white/10">
      <h3 id={headingId} className="text-sm font-semibold">Suggested habits</h3>
      <ul className="mt-2 space-y-2">
        {proposal.items.map((item) => (
          <li key={item.itemId}>
            <label className={clsx('flex items-start gap-3 rounded-2xl p-2', open && 'cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800')}>
              <input
                type="checkbox"
                checked={selected.has(item.itemId)}
                onChange={() => toggle(item.itemId)}
                disabled={!open || busy}
                aria-labelledby={`${headingId}-${item.itemId}-name`}
                aria-describedby={`${headingId}-${item.itemId}-why`}
                className="mt-1 size-5 shrink-0 accent-accent-600"
              />
              <span className="grid size-9 shrink-0 place-items-center rounded-xl text-lg" style={{ backgroundColor: item.color + '22' }} aria-hidden="true">
                {item.emoji}
              </span>
              <span className="min-w-0">
                <span id={`${headingId}-${item.itemId}-name`} className="block font-medium">{item.name}</span>
                <span id={`${headingId}-${item.itemId}-why`} className="block text-sm text-stone-600 dark:text-stone-400">{item.why}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {open ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            className="h-11 flex-1 rounded-2xl bg-stone-100 text-sm font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || selected.size === 0}
            className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-2xl bg-accent-600 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            Create {selected.size} habit{selected.size === 1 ? '' : 's'}
          </button>
        </div>
      ) : (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
          {result ? (
            <>
              <Check className="size-4 text-emerald-600" aria-hidden="true" />
              <span>
                {result.created.length > 0 ? `Added ${result.created.length} habit${result.created.length === 1 ? '' : 's'} to Today.` : 'Nothing new was added.'}
                {result.skipped.map((s) => ` Skipped “${s.name}” because ${SKIP_REASON[s.reason]}.`).join('')}
              </span>
            </>
          ) : proposal.status === 'confirmed' ? (
            'Added to your habits.'
          ) : expired ? (
            'These suggestions expired. Ask the Coach again any time.'
          ) : (
            'Not added.'
          )}
        </p>
      )}
    </section>
  )
}
