import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from './useDebounce'

/**
 * List-page filter state kept in the URL (Phase 1.2, G6: "filter state
 * kept in the URL so back, refresh and deep links work"). Handles the
 * two universal fields — `search` (debounced before it's returned, so
 * callers don't need their own debounce) and `page` — plus any number of
 * extra named filters (status, category, date range, ...), all synced
 * to ?search=&page=&status=... Changing search or any filter resets
 * page back to 1, matching how every existing list page already behaves.
 */
export function useListUrlState<F extends Record<string, string>>(filterKeys: (keyof F)[]) {
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('search') ?? ''
  const debouncedSearch = useDebounce(search, 350)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)

  const filters = useMemo(() => {
    const result = {} as F
    for (const key of filterKeys) {
      result[key] = (searchParams.get(String(key)) ?? '') as F[typeof key]
    }
    return result
  }, [searchParams, filterKeys])

  const setSearch = useCallback(
    (value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set('search', value)
        else next.delete('search')
        next.delete('page')
        return next
      })
    },
    [setSearchParams],
  )

  const setPage = useCallback(
    (value: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value > 1) next.set('page', String(value))
        else next.delete('page')
        return next
      })
    },
    [setSearchParams],
  )

  const setFilter = useCallback(
    (key: keyof F, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(String(key), value)
        else next.delete(String(key))
        next.delete('page')
        return next
      })
    },
    [setSearchParams],
  )

  return { search, debouncedSearch, setSearch, page, setPage, filters, setFilter }
}
