/**
 * Shared money/quantity formatters (Phase 1.2). Every page that displays
 * a currency amount or a stock quantity should go through these instead
 * of ad-hoc toFixed()/toLocaleString() calls, so the whole app agrees on
 * what "₹1,23,456.00" and "5" (not "5.000") look like.
 */

const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const INR_NUMBER_FORMATTER = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "₹1,23,456.00" — Indian digit grouping, always 2 decimals. */
export function formatMoney(value: number | string | null | undefined): string {
  const n = toNumber(value)
  return INR_FORMATTER.format(n)
}

/** Same grouping as formatMoney but without the ₹ symbol, for table cells
 * that already show a ₹ in the column header. */
export function formatAmount(value: number | string | null | undefined): string {
  const n = toNumber(value)
  return INR_NUMBER_FORMATTER.format(n)
}

/** Whole quantities show with no trailing zeros ("5", not "5.000");
 * fractional quantities keep only as many decimals as they need, up to 3
 * ("2.5", not "2.500" or "2.5000001"). */
export function formatQuantity(value: number | string | null | undefined): string {
  const n = toNumber(value)
  if (Number.isInteger(n)) {
    return n.toLocaleString('en-IN')
  }
  const rounded = Math.round(n * 1000) / 1000
  return rounded.toLocaleString('en-IN', { maximumFractionDigits: 3 })
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) ? n : 0
}
