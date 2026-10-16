import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellIcon } from './Icons'
import { Spinner } from './ui'
import { useNotifications, type NotificationItem } from '../hooks/useNotifications'
import { syncDeviceToken } from '../hooks/useDeviceToken'
import { onForegroundMessage, requestNotificationPermission } from '../services/firebase/firebaseMessaging'

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Where clicking a notification should navigate, based on its reference — falls back to no navigation if unrecognized. */
function targetPathFor(n: NotificationItem): string | null {
  if (n.reference_type === 'ORDER' && n.reference_id) return `/orders/${n.reference_id}`
  if (n.reference_type === 'PRODUCT_VARIANT' && n.reference_id) return `/stock-adjustments`
  return null
}

export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  )
  const [enabling, setEnabling] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const { unreadCount, items, loading, error, loadList, markRead, markAllRead, notifyNewEvent } = useNotifications()

  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let cancelled = false

    onForegroundMessage(() => {
      notifyNewEvent()
    }).then((unsub: (() => void) | null) => {
      if (cancelled) {
        unsub?.()
      } else {
        unsubscribe = unsub
      }
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [notifyNewEvent])

  async function handleEnableNotifications() {
    setEnabling(true)
    try {
      const result = await requestNotificationPermission()
      setPermission(result === 'granted' ? 'granted' : result === 'unsupported' ? 'unsupported' : 'denied')
      if (result === 'granted') {
        await syncDeviceToken()
      }
    } finally {
      setEnabling(false)
    }
  }

  useEffect(() => {
    if (open && items === null) {
      loadList()
    }
  }, [open, items, loadList])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleClickItem(n: NotificationItem) {
    if (!n.is_read) markRead(n.id)
    const path = targetPathFor(n)
    if (path) {
      setOpen(false)
      navigate(path)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-extra-003)] bg-[var(--color-surface)] text-[var(--color-primary-strong)] hover:bg-[var(--color-extra-005)] transition-all cursor-pointer"
        title="Notifications"
        aria-label="Notifications"
      >
        <BellIcon className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 bg-rose-600 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none shadow-xs">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-2xl border border-[var(--color-border-muted)] bg-white shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border-muted)] bg-[var(--color-surface)]">
            <span className="text-xs font-black text-slate-900">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead()}
                className="text-[11px] font-bold text-[var(--color-primary-strong)] hover:underline cursor-pointer"
              >
                Mark all as read
              </button>
            )}
          </div>

          {permission === 'default' && (
            <div className="px-4 py-2.5 border-b border-[var(--color-border-muted)] bg-amber-50 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-amber-800">Enable desktop alerts for new orders</p>
              <button
                type="button"
                onClick={handleEnableNotifications}
                disabled={enabling}
                className="shrink-0 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-full px-2.5 py-1 disabled:opacity-60 cursor-pointer"
              >
                {enabling ? 'Enabling…' : 'Enable'}
              </button>
            </div>
          )}
          {permission === 'denied' && (
            <div className="px-4 py-2 border-b border-[var(--color-border-muted)] bg-slate-50">
              <p className="text-[10px] font-semibold text-slate-500">
                Browser notifications are blocked. Enable them in your browser's site settings to get desktop alerts.
              </p>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="py-6">
                <Spinner className="h-5 w-5" />
              </div>
            )}

            {!loading && error && (
              <p className="px-4 py-6 text-center text-xs text-rose-600 font-semibold">{error}</p>
            )}

            {!loading && !error && items !== null && items.length === 0 && (
              <p className="px-4 py-8 text-center text-xs text-slate-500 font-medium">You're all caught up — no notifications yet.</p>
            )}

            {!loading && !error && items !== null && items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClickItem(n)}
                className={`block w-full text-left px-4 py-3 border-b border-[var(--color-border-muted)] last:border-0 hover:bg-[var(--color-surface)]/60 transition-colors cursor-pointer ${
                  !n.is_read ? 'bg-[var(--color-primary-strong)]/5' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--color-primary-strong)] shrink-0" />}
                  <div className={!n.is_read ? '' : 'pl-3.5'}>
                    <p className="text-xs font-bold text-slate-900">{n.title}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{n.body}</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-semibold">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
