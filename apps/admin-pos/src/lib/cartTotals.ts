export type DiscountType = 'PERCENT' | 'AMOUNT'

export interface CartLineForTotals {
  variant_id: number
  qty: number
  unit_price: number
  gst_percent: number
  tax_mode?: 'INCLUSIVE' | 'EXCLUSIVE'
}

export interface AllocatedLineTotals extends CartLineForTotals {
  line_subtotal: number
  allocated_discount: number
  discounted_subtotal: number
  tax_amount: number
  line_total: number
}

export interface CartTotalsResult {
  subtotal: number
  discountType: DiscountType
  discountValue: number
  discountAmount: number
  effectivePercent: number
  tax: number
  grandTotal: number
  lines: AllocatedLineTotals[]
}

/**
 * Pure calculation for cart totals with bill discount and line-level tax computation.
 * Exactly matches backend InvoiceService calculation.
 */
export function calculateCartTotals(
  lines: CartLineForTotals[],
  discountType: DiscountType = 'PERCENT',
  rawDiscountValue: number | string = 0
): CartTotalsResult {
  let subtotal = 0
  for (const line of lines) {
    const lineSub = Math.round(line.unit_price * line.qty * 100) / 100
    subtotal += lineSub
  }
  subtotal = Math.round(subtotal * 100) / 100

  let numVal = typeof rawDiscountValue === 'string' ? parseFloat(rawDiscountValue) : rawDiscountValue
  if (isNaN(numVal) || numVal < 0) {
    numVal = 0
  }

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

  let discountAmount = 0
  let effectivePercent = 0

  if (subtotal > 0 && numVal > 0) {
    if (discountType === 'PERCENT') {
      const clampedPercent = Math.min(100, numVal)
      effectivePercent = clampedPercent
      discountAmount = round2((subtotal * clampedPercent) / 100)
    } else {
      const clampedAmount = Math.min(subtotal, numVal)
      discountAmount = round2(clampedAmount)
      effectivePercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0
    }
  }

  // Allocate discount proportionally across lines (last line absorbs rounding difference)
  let remainingDiscount = discountAmount
  const allocatedLines: AllocatedLineTotals[] = []
  let totalTax = 0
  let grandTotal = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineSub = round2(line.unit_price * line.qty)

    let allocated = 0
    if (discountAmount > 0 && subtotal > 0) {
      if (i === lines.length - 1) {
        allocated = round2(remainingDiscount)
      } else {
        const share = lineSub / subtotal
        allocated = round2(discountAmount * share)
        allocated = Math.min(allocated, remainingDiscount)
      }
      remainingDiscount = round2(remainingDiscount - allocated)
    }

    const discountedSub = Math.max(0, round2(lineSub - allocated))
    const gstRate = line.gst_percent || 0
    let lineTax = 0

    if (line.tax_mode === 'INCLUSIVE') {
      lineTax = round2(discountedSub - (discountedSub * 100) / (100 + gstRate))
    } else {
      lineTax = round2((discountedSub * gstRate) / 100)
    }

    let lineTotal = 0
    if (line.tax_mode === 'INCLUSIVE') {
      lineTotal = discountedSub
    } else {
      lineTotal = round2(discountedSub + lineTax)
    }

    totalTax += lineTax
    grandTotal += lineTotal

    allocatedLines.push({
      ...line,
      line_subtotal: lineSub,
      allocated_discount: allocated,
      discounted_subtotal: discountedSub,
      tax_amount: lineTax,
      line_total: lineTotal,
    })
  }

  totalTax = Math.round(totalTax * 100) / 100
  grandTotal = Math.round(grandTotal * 100) / 100

  return {
    subtotal,
    discountType,
    discountValue: numVal,
    discountAmount,
    effectivePercent,
    tax: totalTax,
    grandTotal,
    lines: allocatedLines,
  }
}
