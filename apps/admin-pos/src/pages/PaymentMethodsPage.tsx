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
          <table className="w-full text-left text-xs">
            <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
              <tr>
                <th className="px-6 py-4 font-black">Code</th>
                <th className="px-6 py-4 font-black">Name</th>
                <th className="px-6 py-4 font-black">Status</th>
                <th className="px-6 py-4 font-black text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E0E3]">
              {methods.map((m) => (
                <tr key={m.id} className="hover:bg-[#FAF2F4]/80 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-[#804652]">{m.code}</td>
                  <td className="px-6 py-4 font-bold text-slate-950">{m.name}</td>
                  <td className="px-6 py-4">
                    <Badge tone={m.is_active ? 'green' : 'slate'}>{m.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleActive(m)}
                      className="text-xs font-bold text-[#804652] hover:text-[#5a2c36] transition-colors cursor-pointer"
                    >
                      {m.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {methods.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-xs font-semibold text-slate-500">
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
