import { useCallback, useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '../lib/api'

/**
 * Fetches a paginated list and ignores stale responses (Phase 1.2, G6:
 * "a search box ... ignores stale responses"). If the user types fast
 * enough that request #1 (for "a") and request #2 (for "ab") are both
 * in flight, and #1's response arrives after #2's, this discards #1's
 * result instead of letting it clobber the newer, correct one — a
 * sequence number per request is compared against the latest one fired,
 * not arrival order.
 *
 * `fetcher` should be a stable function reference (e.g. wrapped in
 * useCallback by the caller) that performs the actual api.get() and
 * returns { rows, total }. Call the returned `reload()` after a
 * create/update/delete to refresh the list without changing any filter
 * (which `deps` alone wouldn't trigger).
 */
export function useListQuery<T>(
  fetcher: () => Promise<{ rows: T[]; total: number }>,
  deps: unknown[],
) {
  const [rows, setRows] = useState<T[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const run = useCallback(() => {
    const requestId = ++sequence.current
    setError('')

    fetcherRef
      .current()
      .then(({ rows: newRows, total: newTotal }) => {
        if (requestId !== sequence.current) return // a newer request has since superseded this one
        setRows(newRows)
        setTotal(newTotal)
      })
      .catch((err) => {
        if (requestId !== sequence.current) return
        setError(apiErrorMessage(err, 'Failed to load'))
        setRows([])
      })
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps)

  return { rows, total, error, reload: run }
}
