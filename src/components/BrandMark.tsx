import { Flame } from 'lucide-react'
import { APP_NAME } from '../config'

/** The app's logo tile and name, shared by the header and the sign-in page. */
export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`grid place-items-center bg-gradient-to-br from-accent-600 to-fuchsia-600 text-white shadow-sm shadow-accent-600/30 ${large ? 'size-10 rounded-xl' : 'size-7 rounded-lg'}`}
      >
        <Flame className={large ? 'size-5' : 'size-4'} fill="currentColor" aria-hidden="true" />
      </span>
      <span className={`font-bold tracking-tight ${large ? 'text-2xl' : 'text-base'}`}>{APP_NAME}</span>
    </div>
  )
}
