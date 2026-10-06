import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, Select, PageHeader, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { GstRate, HsnCode } from '../lib/types'

export function TaxPage() {
  const [gstRates, setGstRates] = useState<GstRate[] | null>(null)
  const [hsnCodes, setHsnCodes] = useState<HsnCode[] | null>(null)
  const [showGstForm, setShowGstForm] = useState(false)
  const [showHsnForm, setShowHsnForm] = useState(false)

  function loadGstRates() {
    api.get('/gst-rates', { params: { all: 1 } }).then((res) => setGstRates(res.data.gst_rates))
  }
  function loadHsnCodes() {
    api.get('/hsn-codes').then((res) => setHsnCodes(res.data.hsn_codes))
  }

  useEffect(() => {
    loadGstRates()
    loadHsnCodes()
  }, [])

  async function toggleGstStatus(rate: GstRate) {
    await api.put(`/gst-rates/${rate.id}`, { status: rate.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
    loadGstRates()
  }

  async function removeHsnCode(id: number) {
    if (!window.confirm('Delete this HSN code?')) return
    await api.delete(`/hsn-codes/${id}`)
    loadHsnCodes()
  }

  return (
    <div>
      <PageHeader title="Tax" description="GST rates and HSN codes used across products, invoices and purchases." />

      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">GST Rates</h2>
          <Button size="sm" onClick={() => setShowGstForm(true)}>
            + New GST Rate
          </Button>
        </div>
        {gstRates === null ? (
          <Spinner />
        ) : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">GST %</th>
                  <th className="px-5 py-3 font-medium">CGST / SGST</th>
                  <th className="px-5 py-3 font-medium">IGST</th>
                  <th className="px-5 py-3 font-medium">Tax Mode</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gstRates.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-medium text-slate-900">{r.name}</td>
                    <td className="px-5 py-3 text-slate-600">{r.gst_percent}%</td>
                    <td className="px-5 py-3 text-slate-600">
                      {r.cgst_percent}% / {r.sgst_percent}%
                    </td>
                    <td className="px-5 py-3 text-slate-600">{r.igst_percent}%</td>
                    <td className="px-5 py-3 text-slate-600">{r.tax_mode}</td>
                    <td className="px-5 py-3">
                      <Badge tone={r.status === 'ACTIVE' ? 'green' : 'slate'}>{r.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button type="button" onClick={() => toggleGstStatus(r)} className="text-xs text-slate-600 hover:underline">
                        {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {gstRates.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                      No GST rates yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">HSN Codes</h2>
          <Button size="sm" onClick={() => setShowHsnForm(true)}>
            + New HSN Code
          </Button>
        </div>
        {hsnCodes === null ? (
          <Spinner />
        ) : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hsnCodes.map((h) => (
                  <tr key={h.id}>
                    <td className="px-5 py-3 font-medium text-slate-900">{h.code}</td>
                    <td className="px-5 py-3 text-slate-600">{h.description ?? '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <button type="button" onClick={() => removeHsnCode(h.id)} className="text-xs text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {hsnCodes.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-sm text-slate-500">
                      No HSN codes yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {showGstForm && (
        <GstRateFormModal
          onClose={() => setShowGstForm(false)}
          onSaved={() => {
            setShowGstForm(false)
            loadGstRates()
          }}
        />
      )}

      {showHsnForm && (
        <HsnCodeFormModal
          onClose={() => setShowHsnForm(false)}
          onSaved={() => {
            setShowHsnForm(false)
            loadHsnCodes()
          }}
        />
      )}
    </div>
  )
}

function GstRateFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [percent, setPercent] = useState('')
  const [taxMode, setTaxMode] = useState<'EXCLUSIVE' | 'INCLUSIVE'>('EXCLUSIVE')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/gst-rates', { name, gst_percent: Number(percent), tax_mode: taxMode })
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create GST rate'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="New GST Rate" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GST 12%" />
        <TextField label="GST %" type="number" step="0.01" required value={percent} onChange={(e) => setPercent(e.target.value)} />
        <p className="text-xs text-slate-500">CGST and SGST are set to half the GST% (intrastate); IGST is set to the full GST% (interstate) — the same split used elsewhere in the app. Edit via the API later if you need something different.</p>
        <Select label="Tax Mode" value={taxMode} onChange={(e) => setTaxMode(e.target.value as 'EXCLUSIVE' | 'INCLUSIVE')}>
          <option value="EXCLUSIVE">Exclusive (added on top of price)</option>
          <option value="INCLUSIVE">Inclusive (already part of price)</option>
        </Select>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create GST Rate'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function HsnCodeFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/hsn-codes', { code, description: description || null })
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create HSN code'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="New HSN Code" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <TextField label="Code" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 6109" />
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. T-shirts, knitted" />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create HSN Code'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
