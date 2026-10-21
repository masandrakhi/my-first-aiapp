import { useCallback, useInsertionEffect, useRef } from 'react'

/**
 * A callback whose identity never changes but always calls the latest `fn`.
 * Lets memoized children receive handlers without re-rendering when the parent does.
 * Only call the result from event handlers or effects, not during render.
 */
export function useStableCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const ref = useRef(fn)
  useInsertionEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: Args) => ref.current(...args), [])
}
