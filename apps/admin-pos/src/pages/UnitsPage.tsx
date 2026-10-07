import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Card, Modal, PageHeader, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Unit } from '../lib/types'

export function UnitsPage() {
  const [units, setUnits] = useState<Unit[] | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [shortCode, setShortCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function load() {
    api.get('/units').then((res) => setUnits(res.data.units))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/units', { name, short_code: shortCode })
      setShowModal(false)
      setName('')
      setShortCode('')
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to add unit'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unit Management"
        description="Configure measurement units (e.g., Pieces, Kg, Meters) used for product inventory and catalog items."
        actions={<Button onClick={() => setShowModal(true)}>+ Add New Unit</Button>}
      />

      {units === null ? (
        <Spinner />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 uppercase text-slate-500 bg-slate-50/70">
                <tr>
                  <th className="px-4 py-3 font-semibold">Unit Name</th>
                  <th className="px-4 py-3 font-semibold">Short Code</th>
                  <th className="px-4 py-3 font-semibold text-right">Unit ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {units.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{u.name}</td>
                    <td className="px-4 py-3 font-mono font-bold text-indigo-700 bg-indigo-50/40 rounded w-max inline-block my-1.5 px-2 py-0.5">
                      {u.short_code}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">#{u.id}</td>
                  </tr>
                ))}
                {units.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                      No units configured yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showModal && (
        <Modal title="Add New Measurement Unit" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {error && <Alert>{error}</Alert>}
            <TextField label="Unit Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kilogram, Pieces, Box" />
            <TextField label="Short Code / Symbol" required value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="e.g. KG, PCS, BOX" />

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Adding…' : 'Add Unit'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
