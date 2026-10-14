import { useCallback, useRef, useState } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

/**
 * No app-wide toast provider exists yet (every other screen uses inline
 * <Alert> banners instead) — this is a small, self-contained stack meant
 * to be mounted by one feature (the Import/Export panel) rather than at
 * the app root, so it doesn't require touching App.tsx/routing.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, tone, message }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, tone === 'error' ? 6000 : 4000)
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, push, dismiss }
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  error: 'bg-rose-50 text-rose-900 border-rose-200',
  info: 'bg-[var(--color-surface)] text-[var(--color-primary-strong)] border-[var(--color-border)]',
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-semibold shadow-lg ${TONE_STYLES[t.tone]}`}
          role="status"
        >
          <span className="leading-snug">{t.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="shrink-0 text-current opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
