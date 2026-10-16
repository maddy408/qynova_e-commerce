import type { ReactNode } from 'react'
import { Spinner } from '../ui'

export interface DataTableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'center' | 'right'
  className?: string
}

/**
 * Generic list-page table (Phase 1.2) — search box, filter slot,
 * pagination, and an action column, matching the pattern already used
 * by SuppliersPage/PurchasesPage/StockAdjustmentsPage before this
 * existed, just made reusable instead of hand-rolled per page. Doesn't
 * fetch data itself — pair with useListUrlState (URL-synced search/
 * page/filters) and useListQuery (fetch with stale-response guarding).
 *
 * `rows === null` renders the loading spinner; `rows === []` renders
 * emptyMessage; `actions` is rendered as its own right-aligned column
 * when provided, matching every existing list page's Action column.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  total,
  page,
  limit,
  onPageChange,
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters,
  actions,
  emptyMessage = 'No results found.',
  totalsRow,
  title,
  subtitle,
  headerActions,
}: {
  columns: DataTableColumn<T>[]
  rows: T[] | null
  rowKey: (row: T) => string | number
  total: number
  page: number
  limit: number
  onPageChange: (page: number) => void
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  filters?: ReactNode
  actions?: (row: T) => ReactNode
  emptyMessage?: string
  /** Rendered as a final table row — for showing a column-amount total (G6). */
  totalsRow?: ReactNode
  title?: string
  subtitle?: string
  headerActions?: ReactNode
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit))

  if (rows === null) {
    return (
      <div className="p-12 text-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="rounded-3xl bg-white border border-[var(--color-border-muted)] shadow-2xs overflow-hidden">
      {(title || onSearchChange || filters || headerActions) && (
        <div className="p-5 sm:p-6 border-b border-[var(--color-border-muted)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
          <div>
            {title && <h3 className="text-xl font-serif font-bold text-slate-900">{title}</h3>}
            <p className="text-xs text-slate-500 mt-0.5">{subtitle ?? `Showing ${rows.length} of ${total}`}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {filters}

            {onSearchChange && (
              <div className="relative">
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={search ?? ''}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="rounded-full border border-[var(--color-surface-muted)] bg-[var(--color-extra-002)] pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all w-44 sm:w-56"
                />
              </div>
            )}

            {headerActions}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b-2 border-[var(--color-extra-003)] uppercase text-[var(--color-extra-001)] bg-[var(--color-extra-005)] text-xs font-black tracking-wider">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-6 py-4 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {col.header}
                </th>
              ))}
              {actions && <th className="px-6 py-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-extra-004)]">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-[var(--color-surface)]/80 transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-6 py-4 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''} ${col.className ?? ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
                {actions && (
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-6 py-12 text-center text-slate-600 font-semibold text-sm">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {totalsRow && rows.length > 0 && totalsRow}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--color-border-muted)] px-6 py-4 text-xs font-semibold text-slate-700 bg-[var(--color-surface)]/30">
          <span>
            Page <span className="font-extrabold text-slate-950">{page}</span> of{' '}
            <span className="font-extrabold text-slate-950">{totalPages}</span> ({total} total)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-3 py-1 rounded-full border border-[var(--color-border)] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[var(--color-surface)] transition-colors text-xs"
            >
              ← Previous
            </button>
            <span className="text-slate-600 font-medium px-2">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-3 py-1 rounded-full border border-[var(--color-border)] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[var(--color-surface)] transition-colors text-xs"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
