import { useState, type ReactNode } from 'react'
import { Alert, Button, Modal } from '../ui'
import { useDoubleSubmitGuard } from '../../hooks/useDoubleSubmitGuard'
import { apiErrorMessage } from '../../lib/api'

/**
 * Generic confirmation dialog (Phase 1.2) — replaces the native
 * `window.confirm()` calls scattered across the app (not stylable, not
 * testable, blocks the whole tab) and the hand-written "are you sure"
 * Modal boilerplate repeated on most delete flows. Has its own
 * double-submit guard, so a confirm button can't fire the action twice
 * from a fast double-click.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}) {
  const { submitting, guard } = useDoubleSubmitGuard()
  const [error, setError] = useState('')

  if (!open) return null

  const handleConfirm = guard(async () => {
    setError('')
    try {
      await onConfirm()
    } catch (err) {
      setError(apiErrorMessage(err, 'Something went wrong'))
    }
  })

  return (
    <Modal title={title} onClose={onCancel} width="sm">
      <div className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        <div className="text-xs text-slate-700">{message}</div>
        <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--color-border-muted)]">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" variant={tone === 'danger' ? 'danger' : 'primary'} onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Please wait…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
