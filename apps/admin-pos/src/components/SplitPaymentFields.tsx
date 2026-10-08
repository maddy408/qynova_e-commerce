import { Badge, Select, TextField } from './ui'

export interface SplitPaymentValues {
  mode: 'SINGLE' | 'SPLIT'
  singleMethod: string
  singleAmount: string
  singleRef: string
  cash: string
  upi: string
  card: string
  bank: string
  upiRef: string
  cardRef: string
  bankRef: string
}

export interface SplitPaymentLine {
  method: 'CASH' | 'UPI' | 'CARD' | 'NETBANKING'
  amount: string
  reference_no?: string | null
}

interface SplitPaymentFieldsProps {
  total: number
  values: SplitPaymentValues
  onChange: (values: SplitPaymentValues) => void
  disabled?: boolean
  isCollectMode?: boolean // In collect mode, total is fixed to the amount being collected
  error?: string
}

export const INITIAL_SPLIT_PAYMENT_VALUES: SplitPaymentValues = {
  mode: 'SINGLE',
  singleMethod: 'CASH',
  singleAmount: '',
  singleRef: '',
  cash: '',
  upi: '',
  card: '',
  bank: '',
  upiRef: '',
  cardRef: '',
  bankRef: '',
}

export function SplitPaymentFields({
  total,
  values,
  onChange,
  disabled = false,
  isCollectMode = false,
  error,
}: SplitPaymentFieldsProps) {
  const safeTotal = Math.max(0, total || 0)
  const isZeroTotal = disabled

  // Calculate split sums
  const cashNum = Number(values.cash) || 0
  const upiNum = Number(values.upi) || 0
  const cardNum = Number(values.card) || 0
  const bankNum = Number(values.bank) || 0

  const splitTotalPaid = cashNum + upiNum + cardNum + bankNum
  const splitPendingDue = Math.max(0, safeTotal - splitTotalPaid)
  const isSplitOverpaid = splitTotalPaid > safeTotal + 0.001

  // Single mode calculation
  const singleAmountNum = Number(values.singleAmount) || 0
  const singlePendingDue = Math.max(0, safeTotal - singleAmountNum)
  const isSingleOverpaid = singleAmountNum > safeTotal + 0.001

  const effectiveAllocated = values.mode === 'SPLIT' ? splitTotalPaid : singleAmountNum
  const effectivePending = values.mode === 'SPLIT' ? splitPendingDue : singlePendingDue
  const isOverpaid = values.mode === 'SPLIT' ? isSplitOverpaid : isSingleOverpaid

  function updateField<K extends keyof SplitPaymentValues>(key: K, val: SplitPaymentValues[K]) {
    const next = { ...values, [key]: val }
    onChange(next)
  }

  function handleModeToggle(newMode: 'SINGLE' | 'SPLIT') {
    if (newMode === values.mode) return

    if (newMode === 'SPLIT') {
      // If switching to SPLIT, copy single amount to cash or distribute if single amount was set
      const currentSingleAmt = values.singleAmount || (isCollectMode ? String(safeTotal) : '')
      const next: SplitPaymentValues = {
        ...values,
        mode: 'SPLIT',
        cash: values.singleMethod === 'CASH' ? currentSingleAmt : values.cash,
        upi: values.singleMethod === 'UPI' ? currentSingleAmt : values.upi,
        card: values.singleMethod === 'CARD' ? currentSingleAmt : values.card,
        bank: values.singleMethod === 'NETBANKING' ? currentSingleAmt : values.bank,
        upiRef: values.singleMethod === 'UPI' ? values.singleRef : values.upiRef,
        cardRef: values.singleMethod === 'CARD' ? values.singleRef : values.cardRef,
        bankRef: values.singleMethod === 'NETBANKING' ? values.singleRef : values.bankRef,
      }
      onChange(next)
    } else {
      // Switching to SINGLE
      const next: SplitPaymentValues = {
        ...values,
        mode: 'SINGLE',
        singleAmount: isCollectMode ? String(safeTotal) : (splitTotalPaid > 0 ? String(splitTotalPaid) : ''),
      }
      onChange(next)
    }
  }

  const singleRequiresRef = ['UPI', 'CARD', 'NETBANKING'].includes(values.singleMethod)

  return (
    <div className="space-y-3">
      {/* Mode Switcher Header */}
      <div className="flex items-center justify-between p-2.5 rounded-2xl border border-[#F2E5E7] bg-[#FAF2F4]/70">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#804652]">Payment Breakdown</p>
          <p className="text-[11px] text-slate-500">
            {values.mode === 'SINGLE' ? 'Single payment mode' : 'Multi-mode split payment allocation'}
          </p>
        </div>

        <div className="flex gap-1 p-1 rounded-full border border-[#EEDDE0] bg-white shadow-2xs">
          <button
            type="button"
            disabled={isZeroTotal}
            onClick={() => handleModeToggle('SINGLE')}
            className={`px-3.5 py-1 text-xs font-bold rounded-full transition-all ${
              values.mode === 'SINGLE'
                ? 'bg-gradient-to-r from-[#804652] to-[#6E3642] text-white shadow-2xs'
                : 'text-slate-600 hover:text-[#804652] disabled:opacity-50'
            }`}
          >
            Single Mode
          </button>
          <button
            type="button"
            disabled={isZeroTotal}
            onClick={() => handleModeToggle('SPLIT')}
            className={`px-3.5 py-1 text-xs font-bold rounded-full transition-all ${
              values.mode === 'SPLIT'
                ? 'bg-gradient-to-r from-[#804652] to-[#6E3642] text-white shadow-2xs'
                : 'text-slate-600 hover:text-[#804652] disabled:opacity-50'
            }`}
          >
            Split Payment
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
          {error}
        </div>
      )}

      {isOverpaid && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
          ⚠️ Total allocated (₹{effectiveAllocated.toFixed(2)}) exceeds the maximum amount (₹{safeTotal.toFixed(2)}) by ₹
          {(effectiveAllocated - safeTotal).toFixed(2)}. Please adjust the boxes.
        </div>
      )}

      {/* SINGLE MODE */}
      {values.mode === 'SINGLE' && (
        <div className="p-4 rounded-2xl border border-[#F2E5E7] bg-[#FAF5F6]/40 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Payment Method"
              disabled={isZeroTotal}
              value={values.singleMethod}
              onChange={(e) => updateField('singleMethod', e.target.value)}
            >
              <option value="CASH">Cash</option>
              <option value="UPI">UPI / Online</option>
              <option value="CARD">Credit / Debit Card</option>
              <option value="NETBANKING">Bank Transfer / NEFT</option>
            </Select>

            <TextField
              label="Amount Paid (₹)"
              type="number"
              step="0.01"
              min="0"
              max={safeTotal}
              disabled={isZeroTotal}
              value={values.singleAmount}
              onChange={(e) => updateField('singleAmount', e.target.value)}
              placeholder={isZeroTotal ? '0.00' : `Max ₹${safeTotal.toFixed(2)}`}
            />
          </div>

          {singleRequiresRef && (
            <TextField
              label={`Transaction / Reference No (${values.singleMethod}) *`}
              required
              disabled={isZeroTotal}
              value={values.singleRef}
              onChange={(e) => updateField('singleRef', e.target.value)}
              placeholder={
                values.singleMethod === 'UPI'
                  ? 'UPI Transaction ID / UTR'
                  : values.singleMethod === 'CARD'
                  ? 'Card Last 4 / Auth Code'
                  : 'NEFT / RTGS Reference Number'
              }
            />
          )}
        </div>
      )}

      {/* SPLIT MODE */}
      {values.mode === 'SPLIT' && (
        <div className="p-4 rounded-2xl border border-[#F2E5E7] bg-[#FAF5F6]/40 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Box 1: Cash */}
            <div className="bg-white p-3 rounded-xl border border-[#EEDDE0] shadow-2xs space-y-1.5 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800">Cash (₹)</label>
                <p className="text-[10px] text-slate-500">Direct cash payment</p>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                max={safeTotal}
                disabled={isZeroTotal}
                value={values.cash}
                onChange={(e) => updateField('cash', e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-[#E5D5D8] bg-[#FDFBFB] px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#7B3F4A] focus:ring-2 focus:ring-[#7B3F4A]/10 disabled:bg-slate-100 disabled:opacity-60"
              />
            </div>

            {/* Box 2: UPI / Online */}
            <div className="bg-white p-3 rounded-xl border border-[#EEDDE0] shadow-2xs space-y-1.5 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800">UPI / Online (₹)</label>
                <p className="text-[10px] text-slate-500">GPay, PhonePe, QR</p>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                max={safeTotal}
                disabled={isZeroTotal}
                value={values.upi}
                onChange={(e) => updateField('upi', e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-[#E5D5D8] bg-[#FDFBFB] px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#7B3F4A] focus:ring-2 focus:ring-[#7B3F4A]/10 disabled:bg-slate-100 disabled:opacity-60"
              />
              {upiNum > 0 && (
                <input
                  type="text"
                  required
                  disabled={isZeroTotal}
                  value={values.upiRef}
                  onChange={(e) => updateField('upiRef', e.target.value)}
                  placeholder="UPI Ref / UTR *"
                  className="w-full rounded-md border border-[#E5D5D8] bg-[#FAF2F4]/40 px-2 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-1 focus:ring-[#7B3F4A]"
                />
              )}
            </div>

            {/* Box 3: Card */}
            <div className="bg-white p-3 rounded-xl border border-[#EEDDE0] shadow-2xs space-y-1.5 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800">Card (₹)</label>
                <p className="text-[10px] text-slate-500">Credit / Debit swipe</p>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                max={safeTotal}
                disabled={isZeroTotal}
                value={values.card}
                onChange={(e) => updateField('card', e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-[#E5D5D8] bg-[#FDFBFB] px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#7B3F4A] focus:ring-2 focus:ring-[#7B3F4A]/10 disabled:bg-slate-100 disabled:opacity-60"
              />
              {cardNum > 0 && (
                <input
                  type="text"
                  required
                  disabled={isZeroTotal}
                  value={values.cardRef}
                  onChange={(e) => updateField('cardRef', e.target.value)}
                  placeholder="Card Last 4 / Auth *"
                  className="w-full rounded-md border border-[#E5D5D8] bg-[#FAF2F4]/40 px-2 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-1 focus:ring-[#7B3F4A]"
                />
              )}
            </div>

            {/* Box 4: Bank Transfer */}
            <div className="bg-white p-3 rounded-xl border border-[#EEDDE0] shadow-2xs space-y-1.5 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800">Bank Transfer (₹)</label>
                <p className="text-[10px] text-slate-500">NEFT / RTGS / IMPS</p>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                max={safeTotal}
                disabled={isZeroTotal}
                value={values.bank}
                onChange={(e) => updateField('bank', e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-[#E5D5D8] bg-[#FDFBFB] px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#7B3F4A] focus:ring-2 focus:ring-[#7B3F4A]/10 disabled:bg-slate-100 disabled:opacity-60"
              />
              {bankNum > 0 && (
                <input
                  type="text"
                  required
                  disabled={isZeroTotal}
                  value={values.bankRef}
                  onChange={(e) => updateField('bankRef', e.target.value)}
                  placeholder="Bank UTR / Ref No *"
                  className="w-full rounded-md border border-[#E5D5D8] bg-[#FAF2F4]/40 px-2 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-1 focus:ring-[#7B3F4A]"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Financial Summary & Auto Badge Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#F2E5E7] bg-white p-3.5 text-xs shadow-2xs">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-slate-500 font-medium">Total Paid: </span>
            <strong className="text-emerald-700 font-bold">₹{effectiveAllocated.toFixed(2)}</strong>
          </div>
          <div>
            <span className="text-slate-500 font-medium">Pending Due: </span>
            <strong className={effectivePending > 0 ? 'text-amber-700 font-bold' : 'text-slate-700 font-bold'}>
              ₹{effectivePending.toFixed(2)}
            </strong>
          </div>
        </div>

        <div>
          <Badge
            tone={
              effectiveAllocated >= safeTotal && safeTotal > 0
                ? 'green'
                : effectiveAllocated > 0
                ? 'amber'
                : 'red'
            }
          >
            {effectiveAllocated >= safeTotal && safeTotal > 0
              ? 'PAID'
              : effectiveAllocated > 0
              ? 'PARTIALLY PAID'
              : 'UNPAID'}
          </Badge>
        </div>
      </div>
    </div>
  )
}

/**
 * Converts SplitPaymentValues into the API lines payload and status/method metadata.
 */
export function extractSplitPaymentPayload(
  values: SplitPaymentValues,
  total: number
): {
  lines: SplitPaymentLine[]
  paidAmount: string
  paymentMethod: string | null
  paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID'
  isValid: boolean
  errorMessage?: string
} {
  const safeTotal = Math.max(0, total || 0)

  if (values.mode === 'SINGLE') {
    const amtNum = Number(values.singleAmount) || 0
    if (amtNum > safeTotal + 0.001) {
      return {
        lines: [],
        paidAmount: '0.00',
        paymentMethod: null,
        paymentStatus: 'UNPAID',
        isValid: false,
        errorMessage: 'Payment exceeds total amount',
      }
    }

    if (amtNum <= 0) {
      return {
        lines: [],
        paidAmount: '0.00',
        paymentMethod: null,
        paymentStatus: 'UNPAID',
        isValid: true,
      }
    }

    const requiresRef = ['UPI', 'CARD', 'NETBANKING'].includes(values.singleMethod)
    if (requiresRef && !values.singleRef.trim()) {
      return {
        lines: [],
        paidAmount: '0.00',
        paymentMethod: null,
        paymentStatus: 'UNPAID',
        isValid: false,
        errorMessage: `Reference number is required for ${values.singleMethod}`,
      }
    }

    const lines: SplitPaymentLine[] = [
      {
        method: values.singleMethod as any,
        amount: amtNum.toFixed(2),
        reference_no: values.singleRef.trim() || null,
      },
    ]

    const status: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' =
      amtNum >= safeTotal && safeTotal > 0 ? 'PAID' : 'PARTIALLY_PAID'

    return {
      lines,
      paidAmount: amtNum.toFixed(2),
      paymentMethod: values.singleMethod,
      paymentStatus: status,
      isValid: true,
    }
  }

  // SPLIT MODE
  const cashNum = Number(values.cash) || 0
  const upiNum = Number(values.upi) || 0
  const cardNum = Number(values.card) || 0
  const bankNum = Number(values.bank) || 0

  const totalPaid = cashNum + upiNum + cardNum + bankNum

  if (totalPaid > safeTotal + 0.001) {
    return {
      lines: [],
      paidAmount: '0.00',
      paymentMethod: null,
      paymentStatus: 'UNPAID',
      isValid: false,
      errorMessage: 'Total split payment exceeds total amount',
    }
  }

  if (upiNum > 0 && !values.upiRef.trim()) {
    return {
      lines: [],
      paidAmount: '0.00',
      paymentMethod: null,
      paymentStatus: 'UNPAID',
      isValid: false,
      errorMessage: 'Reference number is required for UPI / Online payment',
    }
  }

  if (cardNum > 0 && !values.cardRef.trim()) {
    return {
      lines: [],
      paidAmount: '0.00',
      paymentMethod: null,
      paymentStatus: 'UNPAID',
      isValid: false,
      errorMessage: 'Reference number is required for Card payment',
    }
  }

  if (bankNum > 0 && !values.bankRef.trim()) {
    return {
      lines: [],
      paidAmount: '0.00',
      paymentMethod: null,
      paymentStatus: 'UNPAID',
      isValid: false,
      errorMessage: 'Reference number is required for Bank Transfer payment',
    }
  }

  const lines: SplitPaymentLine[] = []
  if (cashNum > 0) lines.push({ method: 'CASH', amount: cashNum.toFixed(2), reference_no: null })
  if (upiNum > 0) lines.push({ method: 'UPI', amount: upiNum.toFixed(2), reference_no: values.upiRef.trim() })
  if (cardNum > 0) lines.push({ method: 'CARD', amount: cardNum.toFixed(2), reference_no: values.cardRef.trim() })
  if (bankNum > 0) lines.push({ method: 'NETBANKING', amount: bankNum.toFixed(2), reference_no: values.bankRef.trim() })

  const method = lines.length > 1 ? 'SPLIT' : lines.length === 1 ? lines[0].method : null
  const status: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' =
    totalPaid >= safeTotal && safeTotal > 0 ? 'PAID' : totalPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID'

  return {
    lines,
    paidAmount: totalPaid.toFixed(2),
    paymentMethod: method,
    paymentStatus: status,
    isValid: true,
  }
}
