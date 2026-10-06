import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { PaymentMethod } from '../lib/types'

export function PaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function load() {
    api.get('/payment-methods', { params: { all: 1 } }).then((res) => setMethods(res.data.payment_methods))
  }

  useEffect(load, [])

  async function toggleActive(method: PaymentMethod) {
    await api.put(`/payment-methods/${method.id}`, { is_active: method.is_active ? 0 : 1 })
    load()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/payment-methods', { code, name, sort_order: (methods?.length ?? 0) + 1 })
      setShowForm(false)
      setCode('')
      setName('')
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create payment method'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Payment Methods"
        description="Available payment methods at POS, checkout, and purchases. Deactivating one keeps it on past records but hides it from new ones."
        actions={<Button onClick={() => setShowForm(true)}>+ New Payment Method</Button>}
      />

      {methods === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {methods.map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">{m.code}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{m.name}</td>
                  <td className="px-5 py-3">
                    <Badge tone={m.is_active ? 'green' : 'slate'}>{m.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" onClick={() => toggleActive(m)} className="text-xs text-slate-600 hover:underline">
                      {m.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {methods.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">
                    No payment methods yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <Modal title="New Payment Method" onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <TextField
              label="Code"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. GPAY"
            />
            <TextField label="Display Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Google Pay" />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
