import { useState, type ReactNode } from 'react'
import { PencilIcon } from '../Icons'
import { useDoubleSubmitGuard } from '../../hooks/useDoubleSubmitGuard'
import { apiErrorMessage } from '../../lib/api'

/**
 * Inline per-row edit, Save/Cancel per row (Phase 1.2 — built for Phase
 * 2.3's Price Adjustment pages, which replace a single bulk "Save All"
 * button with per-row editing: saving one row sends only that row).
 *
 * Use as a table cell's content: pass the current saved `value`, a
 * `displayValue` for read mode, and `onSave(newValue)` — this owns its
 * own edit/draft/saving state and only calls onSave when the user
 * actually confirms, with a double-submit guard built in.
 */
export function RowEditable({
  value,
  displayValue,
  onSave,
  inputType = 'number',
  step,
}: {
  value: string
  displayValue: ReactNode
  onSave: (newValue: string) => Promise<void>
  inputType?: 'text' | 'number'
  step?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')
  const { submitting, guard } = useDoubleSubmitGuard()

  function startEdit() {
    setDraft(value)
    setError('')
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setError('')
  }

  const save = guard(async () => {
    setError('')
    try {
      await onSave(draft)
      setEditing(false)
    } catch (err) {
      setError(apiErrorMessage(err, 'Save failed'))
    }
  })

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className="group inline-flex items-center gap-1.5 hover:text-[var(--color-primary-strong)] transition-colors"
        title="Click to edit"
      >
        {displayValue}
        <PencilIcon className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
      </button>
    )
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <div className="inline-flex items-center gap-1.5">
        <input
          type={inputType}
          step={step}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') cancel()
          }}
          disabled={submitting}
          className="w-24 rounded-lg border border-[var(--color-primary)] bg-white px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
        />
        <button
          type="button"
          onClick={save}
          disabled={submitting}
          className="px-2 py-1 rounded-lg bg-[var(--color-primary-strong)] text-white text-[11px] font-bold disabled:opacity-50"
        >
          {submitting ? '…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={submitting}
          className="px-2 py-1 rounded-lg border border-slate-300 text-slate-600 text-[11px] font-bold disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <span className="text-[10px] text-rose-600 font-semibold">{error}</span>}
    </div>
  )
}
