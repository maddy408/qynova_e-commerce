import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, PageHeader, Spinner, TextArea, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import { useDoubleSubmitGuard } from '../hooks/useDoubleSubmitGuard'

const TITLE_MAX = 255
const MESSAGE_MAX = 500

interface BroadcastResult {
  campaign_id: number
  status: string
  recipient_customer_count: number
  token_count: number
  success_count: number
  failure_count: number
  message: string
  duplicate: boolean
}

interface CampaignHistoryItem {
  id: number
  title: string
  body: string
  recipient_customer_count: number
  token_count: number
  success_count: number
  failure_count: number
  status: string
  created_at: string
  sent_by_name: string | null
}

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function BroadcastNotificationsPage() {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; message?: string }>({})
  const [result, setResult] = useState<BroadcastResult | null>(null)
  const [error, setError] = useState('')
  const { submitting, guard } = useDoubleSubmitGuard()

  const [history, setHistory] = useState<CampaignHistoryItem[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  function loadHistory() {
    setHistoryLoading(true)
    api
      .get('/notifications/broadcast-history', { params: { page: 1, limit: 10 } })
      .then((res) => setHistory(res.data.items ?? []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
  }

  useEffect(loadHistory, [])

  function validate(): boolean {
    const errors: { title?: string; message?: string } = {}
    if (title.trim() === '') errors.title = 'Title is required.'
    else if (title.length > TITLE_MAX) errors.title = `Title must be ${TITLE_MAX} characters or fewer.`

    if (message.trim() === '') errors.message = 'Message is required.'
    else if (message.length > MESSAGE_MAX) errors.message = `Message must be ${MESSAGE_MAX} characters or fewer.`

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function doSend() {
    setError('')
    setResult(null)

    if (!validate()) return

    try {
      const res = await api.post<BroadcastResult>('/notifications/broadcast', {
        title: title.trim(),
        message: message.trim(),
        idempotency_key: idempotencyKey,
      })
      setResult(res.data)
      // A fresh key for the NEXT campaign — reusing the old one would
      // make a deliberate follow-up broadcast look like a duplicate.
      setIdempotencyKey(newIdempotencyKey())
      setTitle('')
      setMessage('')
      loadHistory()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send the notification'))
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    guard(doSend)()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Send Notification"
        description="Send a custom push notification to every active, registered customer."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={handleSubmit} className="space-y-4 lg:col-span-2">
          <Card className="space-y-4 p-5">
            {error && <Alert>{error}</Alert>}

            {result && !error && (
              <Alert tone={result.failure_count > 0 && result.success_count === 0 ? 'amber' : result.failure_count > 0 ? 'amber' : 'green'}>
                <div className="space-y-1">
                  <p>{result.message}</p>
                  {result.duplicate && <p className="text-[11px] font-bold uppercase tracking-wide">Duplicate submission — showing the original campaign's result.</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge>Eligible customers: {result.recipient_customer_count}</Badge>
                    <Badge>Devices targeted: {result.token_count}</Badge>
                    <Badge tone="green">Accepted: {result.success_count}</Badge>
                    {result.failure_count > 0 && <Badge tone="red">Failed: {result.failure_count}</Badge>}
                  </div>
                </div>
              </Alert>
            )}

            <TextField
              label="Notification Title"
              required
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Special Discount Offer!"
              error={fieldErrors.title}
              disabled={submitting}
            />
            <p className="-mt-2 text-right text-[10px] text-slate-400 font-semibold">{title.length}/{TITLE_MAX}</p>

            <TextArea
              label="Notification Message"
              required
              rows={4}
              value={message}
              maxLength={MESSAGE_MAX}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Get 20% off on selected products. Shop now!"
              disabled={submitting}
            />
            {fieldErrors.message && <span className="-mt-2 block text-[11px] font-semibold text-red-600">{fieldErrors.message}</span>}
            <p className="-mt-2 text-right text-[10px] text-slate-400 font-semibold">{message.length}/{MESSAGE_MAX}</p>

            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send Notification'}
              </Button>
            </div>
          </Card>
        </form>

        <Card className="p-5 space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-600">Recent campaigns</h3>

          {historyLoading && <Spinner className="h-5 w-5" />}

          {!historyLoading && history !== null && history.length === 0 && (
            <p className="text-xs text-slate-500 font-medium">No broadcast notifications sent yet.</p>
          )}

          {!historyLoading && history !== null && history.length > 0 && (
            <ul className="space-y-3">
              {history.map((c) => (
                <li key={c.id} className="rounded-xl border border-[var(--color-border-muted)] p-3">
                  <p className="text-xs font-bold text-slate-900 truncate">{c.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{c.body}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px] font-semibold text-slate-500">
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                    {c.sent_by_name && <span>· by {c.sent_by_name}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge>{c.recipient_customer_count} customers</Badge>
                    <Badge tone="green">{c.success_count} sent</Badge>
                    {c.failure_count > 0 && <Badge tone="red">{c.failure_count} failed</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
