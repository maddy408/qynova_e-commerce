import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

const POLL_INTERVAL_MS = 30_000

/**
 * Backs the customer-facing notification bell (order confirmed, shipped,
 * delivered, cancelled, ...). Polls the unread count on an interval (no
 * WebSocket/SSE infrastructure exists in this app to push updates
 * instead) and fetches the full recent list lazily, only when the
 * dropdown is opened, so most polls stay a single cheap COUNT query.
 * Does nothing while `enabled` is false (no customer logged in) —
 * callers should pass `Boolean(customer)`.
 */
export function useNotifications(enabled) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  const refreshUnreadCount = useCallback(async () => {
    if (!enabled) return
    try {
      const res = await api.get('/notifications/unread-count')
      setUnreadCount(res.data.unread_count ?? 0)
    } catch {
      // Silent — a failed poll should never surface an error banner for
      // something this non-critical; the next interval just tries again.
    }
  }, [enabled])

  const loadList = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/notifications', { params: { page: 1, limit: 20 } })
      setItems(res.data.items ?? [])
      setUnreadCount(res.data.unread_count ?? 0)
    } catch {
      setError('Could not load notifications right now.')
    } finally {
      setLoading(false)
    }
  }, [enabled])

  const markRead = useCallback(async (id) => {
    setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, is_read: true } : n)) ?? prev)
    setUnreadCount((prev) => Math.max(0, prev - 1))
    try {
      await api.post(`/notifications/${id}/read`)
    } catch {
      // Best-effort — see markAllRead()'s note.
    }
  }, [])

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev?.map((n) => ({ ...n, is_read: true })) ?? prev)
    setUnreadCount(0)
    try {
      await api.post('/notifications/read-all')
    } catch {
      // Best-effort: the optimistic update stays even if the server call
      // fails — a stray extra "read" state is harmless, re-opening the
      // dropdown later reconciles it either way.
    }
  }, [])

  const notifyNewEvent = useCallback(() => {
    refreshUnreadCount()
    setItems(null)
  }, [refreshUnreadCount])

  useEffect(() => {
    if (!enabled) {
      setUnreadCount(0)
      setItems(null)
      return
    }

    refreshUnreadCount()
    pollRef.current = window.setInterval(refreshUnreadCount, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current)
    }
  }, [enabled, refreshUnreadCount])

  return { unreadCount, items, loading, error, loadList, markRead, markAllRead, notifyNewEvent }
}
