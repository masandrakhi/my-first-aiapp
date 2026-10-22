import { useState } from 'react'
import { Download } from 'lucide-react'
import { useAuth } from '../../auth/authContext'
import { clearLegacyData, loadData } from '../../lib/storage'

const DEVICE_KEY = 'habits:device-id'

/** A stable id for this browser, so importing the same device twice is a no-op on the server. */
function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

/**
 * Offers a one-time import of habits saved on this device before accounts existed.
 * After a successful import the device copy is deleted, so no habit data stays in the browser.
 */
export function ImportPrompt({ onImported }: { onImported: () => Promise<void> }) {
  const { api } = useAuth()
  const [legacy] = useState(loadData)
  const [state, setState] = useState<'offer' | 'busy' | 'done' | 'hidden' | 'error'>(legacy.habits.length ? 'offer' : 'hidden')
  const count = legacy.habits.length

  if (state === 'hidden') return null
  if (state === 'done') {
    return (
      <p role="status" className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
        Imported {count} habit{count === 1 ? '' : 's'} into your account.
      </p>
    )
  }

  const runImport = async () => {
    setState('busy')
    try {
      await api.request('POST', '/api/import', { deviceImportId: deviceId(), data: legacy })
      clearLegacyData()
      await onImported()
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <section aria-label="Import habits from this device" className="mb-4 rounded-3xl bg-white p-4 ring-1 ring-accent-200 dark:bg-stone-900 dark:ring-accent-800">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-100 text-accent-700 dark:bg-accent-900 dark:text-accent-200">
          <Download className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Import {count} habit{count === 1 ? '' : 's'} from this device?</p>
          <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">
            {state === 'error' ? "That didn't work. Try again." : 'They were saved here before accounts. Importing moves them into your account, with their history.'}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={state === 'busy'}
              onClick={() => void runImport()}
              className="h-10 rounded-xl bg-accent-600 px-4 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {state === 'busy' ? 'Importing…' : 'Import'}
            </button>
            <button
              type="button"
              onClick={() => setState('hidden')}
              className="h-10 rounded-xl px-4 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
