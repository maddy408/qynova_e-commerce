/**
 * Idempotency-key helper (Phase 1.2, G3 "no duplicates"). Call
 * newIdempotencyKey() once when a form/modal opens (store it in state),
 * send it as the `Idempotency-Key` header (or an `idempotency_key` body
 * field, matching whatever a given endpoint expects — see
 * purchase_payments.idempotency_key for the DB-level unique constraint
 * this backs) on every submit attempt including retries, and generate a
 * fresh one only after a successful submit or when the user explicitly
 * starts a new action. The same key submitted twice must produce the
 * same effect once, never two.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID (older browsers)
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
