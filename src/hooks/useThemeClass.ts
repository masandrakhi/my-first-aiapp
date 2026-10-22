import { useEffect } from 'react'
import type { Theme } from '../types'

/** Applies the light/dark class to <html>, following the OS setting when the theme is "system". `null` = leave it alone. */
export function useThemeClass(theme: Theme | null) {
  useEffect(() => {
    if (!theme) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f0d0b' : '#faf7f2')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}
