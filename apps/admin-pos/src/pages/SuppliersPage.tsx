import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Card, Modal, PageHeader, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface Supplier {
  id: number
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  gstin: string | null
}

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [gstin, setGstin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function load() {
    api.get('/suppliers').then((res) => setSuppliers(res.data.suppliers))
  }

  useEffect(load, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/suppliers', { name, contact_person: contactPerson || null, phone: phone || null, gstin: gstin || null })
      setShowForm(false)
      setName('')
      setContactPerson('')
      setPhone('')
      setGstin('')
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create supplier'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Suppliers" actions={<Button onClick={() => setShowForm(true)}>+ New Supplier</Button>} />

      {suppliers === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">GSTIN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3 font-medium text-slate-900">{s.name}</td>
                  <td className="px-5 py-3 text-slate-600">{s.contact_person ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{s.phone ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{s.gstin ?? '—'}</td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">
                    No suppliers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <Modal title="New Supplier" onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Contact Person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <TextField label="GSTIN" value={gstin} onChange={(e) => setGstin(e.target.value)} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Supplier'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
