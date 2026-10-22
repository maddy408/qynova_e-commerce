/**
 * Manufacturing/expiry dates are month-year only in reality (see
 * ProductImportService::parseMonthYear on the backend) — always display
 * them as "MMM YYYY", never the stored day-of-month.
 */
export function formatMonthYear(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
