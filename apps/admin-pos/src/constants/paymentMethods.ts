export type PaymentMethodCode = 'CASH' | 'UPI' | 'CARD' | 'NETBANKING' | 'CREDIT' | 'GOOGLE_PAY'

export interface PaymentMethodItem {
  code: PaymentMethodCode
  label: string
  description?: string
}

export const PAYMENT_METHODS: PaymentMethodItem[] = [
  { code: 'CASH', label: 'Cash', description: 'Physical currency' },
  { code: 'UPI', label: 'UPI', description: 'Instant QR / VPA' },
  { code: 'CARD', label: 'Card', description: 'Debit / Credit POS' },
  { code: 'NETBANKING', label: 'Net Banking', description: 'Direct bank transfer' },
  { code: 'CREDIT', label: 'Credit', description: 'Customer due ledger' },
  { code: 'GOOGLE_PAY', label: 'Google Pay', description: 'GPay contactless' },
]

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  NETBANKING: 'Net Banking',
  CREDIT: 'Credit',
  GOOGLE_PAY: 'Google Pay',
}

/**
 * Returns the human-readable display label for any payment method code,
 * falling back gracefully to the raw code for unknown or legacy values.
 */
export function getPaymentMethodLabel(code?: string | null): string {
  if (!code) return '—'
  const upper = code.trim().toUpperCase()
  return PAYMENT_METHOD_LABELS[upper] || code
}
