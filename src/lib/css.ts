import type { CSSProperties } from 'react'
import type { CSSVars } from '../types'

/** Type-checked inline style that may also set CSS custom properties, e.g. `cssVars({ '--x': '4px' })`. */
export const cssVars = (style: CSSVars): CSSProperties => style
