import type { ReactNode } from 'react'

export interface DetailsField {
  label: string
  value: ReactNode
  /** Render in the 2-column summary grid at the bottom instead of the
   * full-width stacked list (for short values like status/date — see
   * SuppliersPage's original "Status"/"Created" pair). */
  compact?: boolean
}

/**
 * Generic read-only details panel (Phase 1.2) — the "View" half of a
 * list page's View/Edit split (Phase 2.3 requires Product Details to be
 * read-only with no editable fields; this is the shared shape for that
 * and every other entity's details view). Pair with Modal for a details
 * popup, or render directly on a dedicated details route/page.
 */
export function DetailsView({ fields, footer }: { fields: DetailsField[]; footer?: ReactNode }) {
  const stacked = fields.filter((f) => !f.compact)
  const compact = fields.filter((f) => f.compact)

  return (
    <div className="space-y-3 text-xs">
      {stacked.map((f) => (
        <div key={f.label} className="rounded-xl bg-[var(--color-surface)] px-4 py-2.5 border border-[var(--color-border)]">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-strong)]">{f.label}</span>
          <p className="mt-0.5 text-slate-800 font-medium">{f.value}</p>
        </div>
      ))}

      {compact.length > 0 && (
        <div className="grid grid-cols-2 gap-2 border-t border-[var(--color-border-muted)] pt-3">
          {compact.map((f) => (
            <div key={f.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
              <span className="text-[10px] font-bold uppercase text-[var(--color-primary-strong)]">{f.label}</span>
              <div className="mt-1 font-medium text-slate-800">{f.value}</div>
            </div>
          ))}
        </div>
      )}

      {footer && <div className="flex justify-end pt-3 border-t border-[var(--color-border-muted)]">{footer}</div>}
    </div>
  )
}
