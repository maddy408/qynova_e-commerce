import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiBell } from 'react-icons/fi'
import { useNotifications } from '../hooks/useNotifications'
import { syncDeviceToken } from '../hooks/useDeviceToken'
import { onForegroundMessage, requestNotificationPermission } from '../services/firebase/firebaseMessaging'

function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function targetPathFor(n) {
  if (n.reference_type === 'ORDER' && n.reference_id) return `/orders/${n.reference_id}`
  return null
}

/** Only rendered by Navbar when a customer is logged in. */
export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const [enabling, setEnabling] = useState(false)
  const ref = useRef(null)
  const { unreadCount, items, loading, error, loadList, markRead, markAllRead, notifyNewEvent } = useNotifications(true)

  useEffect(() => {
    if (open && items === null) {
      loadList()
    }
  }, [open, items, loadList])

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    let unsubscribe = null
    let cancelled = false

    onForegroundMessage(() => {
      notifyNewEvent()
    }).then((unsub) => {
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
      setPermission(result)
      if (result === 'granted') {
        await syncDeviceToken()
      }
    } finally {
      setEnabling(false)
    }
  }

  function handleClickItem(n) {
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
        className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full neumorph-circle flex items-center justify-center text-[#7c3aed] hover:text-[#581c87] transition-all cursor-pointer group"
        title="Notifications"
        aria-label="Notifications"
      >
        <FiBell className="w-5 h-5 transition-transform group-hover:scale-105" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#7c3aed] text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-xs leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-2xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <span className="text-xs font-black text-slate-900">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={() => markAllRead()} className="text-[11px] font-bold text-[#7c3aed] hover:underline cursor-pointer">
                Mark all as read
              </button>
            )}
          </div>

          {permission === 'default' && (
            <div className="px-4 py-2.5 border-b border-slate-100 bg-amber-50 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-amber-800">Get notified about your orders</p>
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
            <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
              <p className="text-[10px] font-semibold text-slate-500">
                Notifications are blocked. Enable them in your browser's site settings to get order updates.
              </p>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto">
            {loading && <div className="py-6 text-center text-xs text-slate-400 font-semibold">Loading…</div>}

            {!loading && error && <p className="px-4 py-6 text-center text-xs text-rose-600 font-semibold">{error}</p>}

            {!loading && !error && items !== null && items.length === 0 && (
              <p className="px-4 py-8 text-center text-xs text-slate-500 font-medium">No notifications yet.</p>
            )}

            {!loading &&
              !error &&
              items !== null &&
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClickItem(n)}
                  className={`block w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer ${
                    !n.is_read ? 'bg-[#7c3aed]/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#7c3aed] shrink-0" />}
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
