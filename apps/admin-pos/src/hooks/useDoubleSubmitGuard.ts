import { useRef, useState, useCallback } from 'react'

/**
 * Double-submit guard (Phase 1.2, G3). Wrap any submit handler with
 * `guard(fn)` — a second click/Enter while the first call is still
 * in-flight is silently ignored instead of firing a second request.
 * `submitting` drives the button's disabled state + "Saving…" label.
 *
 * Uses a ref (not just the `submitting` state) to block re-entrancy
 * synchronously, since two rapid clicks can both fire before React
 * re-renders with the updated `submitting` state.
 */
export function useDoubleSubmitGuard() {
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)

  const guard = useCallback(<T,>(fn: () => Promise<T>): (() => Promise<T | undefined>) => {
    return async () => {
      if (inFlight.current) return undefined
      inFlight.current = true
      setSubmitting(true)
      try {
        return await fn()
      } finally {
        inFlight.current = false
        setSubmitting(false)
      }
    }
  }, [])

  return { submitting, guard }
}
