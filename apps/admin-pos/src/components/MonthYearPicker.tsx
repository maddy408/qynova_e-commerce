import { useEffect, useState } from 'react'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const SELECT_CLASS =
  'w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-3.5 py-2 text-xs font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-strong)] focus:border-[var(--color-primary-strong)] shadow-2xs transition-all'

const COMPACT_SELECT_CLASS = 'w-14 rounded border border-slate-300 p-1 text-xs'

function computeDate(year: string, month: string, mode: 'start' | 'end'): string {
  const y = Number(year)
  const m = Number(month)
  const day = mode === 'end' ? new Date(y, m, 0).getDate() : 1
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Manufacturing/expiry dates only ever carry a month and year in reality
 * (see ProductImportService::parseMonthYear on the backend) — this picks
 * month+year and emits a normalized full date: the 1st of that month for
 * mode="start" (manufacturing), the last day of that month for mode="end"
 * (expiry). `value`/`onChange` stay plain 'YYYY-MM-DD' strings so this
 * drops in wherever a date TextField was used before.
 *
 * Keeps its own local month/year draft rather than deriving straight from
 * `value` on every render: onChange only fires once BOTH are picked, so a
 * half-made selection (e.g. month picked, year not yet) is never round-
 * tripped back through the (still-empty) `value` prop and wiped out.
 */
export function MonthYearPicker({
  label,
  value,
  onChange,
  mode = 'start',
  required,
  yearsBack = 5,
  yearsForward = 10,
  compact = false,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  mode?: 'start' | 'end'
  required?: boolean
  yearsBack?: number
  yearsForward?: number
  /** No label, smaller selects — fits a dense table cell. */
  compact?: boolean
}) {
  const [draftMonth, setDraftMonth] = useState('')
  const [draftYear, setDraftYear] = useState('')

  useEffect(() => {
    const [y, m] = (value || '').split('-')
    setDraftYear(y || '')
    setDraftMonth(m || '')
  }, [value])

  const currentYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = currentYear - yearsBack; y <= currentYear + yearsForward; y++) years.push(y)

  function handleMonthChange(m: string) {
    setDraftMonth(m)
    if (m && draftYear) {
      onChange(computeDate(draftYear, m, mode))
    } else if (!m && !draftYear) {
      onChange('')
    }
  }

  function handleYearChange(y: string) {
    setDraftYear(y)
    if (y && draftMonth) {
      onChange(computeDate(y, draftMonth, mode))
    } else if (!y && !draftMonth) {
      onChange('')
    }
  }

  function handleClear() {
    setDraftMonth('')
    setDraftYear('')
    onChange('')
  }

  const selectClass = compact ? COMPACT_SELECT_CLASS : SELECT_CLASS

  const selects = (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
      <select value={draftMonth} onChange={(e) => handleMonthChange(e.target.value)} className={selectClass}>
        <option value="">{compact ? 'Mo' : 'Month'}</option>
        {MONTH_NAMES.map((name, idx) => (
          <option key={name} value={String(idx + 1).padStart(2, '0')}>
            {name}
          </option>
        ))}
      </select>
      <select value={draftYear} onChange={(e) => handleYearChange(e.target.value)} className={selectClass}>
        <option value="">{compact ? 'Yr' : 'Year'}</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      {(draftMonth || draftYear) && (
        <button
          type="button"
          onClick={handleClear}
          className="shrink-0 text-slate-400 hover:text-rose-600 text-xs font-bold cursor-pointer"
          title="Clear"
        >
          ✕
        </button>
      )}
    </div>
  )

  if (compact) {
    return selects
  }

  return (
    <label className="block text-xs">
      {label && (
        <span className="mb-1 block font-bold text-slate-800 uppercase tracking-wider text-[11px]">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}
      {selects}
    </label>
  )
}
