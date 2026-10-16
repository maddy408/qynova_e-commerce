import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

export interface NotificationItem {
  id: number
  type: string
  title: string
  body: string
  reference_type: string | null
  reference_id: number | null
  data: Record<string, unknown> | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

const POLL_INTERVAL_MS = 30_000

/**
 * Backs the admin-pos notification bell. Polls the unread count on an
 * interval (no WebSocket/SSE infrastructure exists in this app to push
 * updates instead — see docs/audit for the current architecture) and
 * fetches the full recent list lazily, only when the dropdown is opened,
 * so most polls stay a single cheap COUNT query.
 */
export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const refreshUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count')
      setUnreadCount(res.data.unread_count ?? 0)
    } catch {
      // Silent — a failed poll should never surface an error banner for
      // something this non-critical; the next interval just tries again.
    }
  }, [])

  const loadList = useCallback(async () => {
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
  }, [])

  const markRead = useCallback(async (id: number) => {
    setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, is_read: true } : n)) ?? prev)
    setUnreadCount((prev) => Math.max(0, prev - 1))
    try {
      await api.post(`/notifications/${id}/read`)
    } catch {
      // Best-effort: the optimistic update stays even if the server call
      // fails — a stray extra "read" state is harmless, re-fetching on
      // next open will reconcile it either way.
    }
  }, [])

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev?.map((n) => ({ ...n, is_read: true })) ?? prev)
    setUnreadCount(0)
    try {
      await api.post('/notifications/read-all')
    } catch {
      // Same best-effort reasoning as markRead().
    }
  }, [])

  useEffect(() => {
    refreshUnreadCount()
    pollRef.current = window.setInterval(refreshUnreadCount, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current)
    }
  }, [refreshUnreadCount])

  /** Call when a foreground push arrives — refreshes the count and forces the next dropdown open to re-fetch rather than show a stale list. */
  const notifyNewEvent = useCallback(() => {
    refreshUnreadCount()
    setItems(null)
  }, [refreshUnreadCount])

  return { unreadCount, items, loading, error, loadList, markRead, markAllRead, notifyNewEvent }
}
