import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Modal, Spinner } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { GstRate, HsnCode } from '../lib/types'

export function TaxPage() {
  const [gstRates, setGstRates] = useState<GstRate[] | null>(null)
  const [hsnCodes, setHsnCodes] = useState<HsnCode[] | null>(null)
  const [showGstForm, setShowGstForm] = useState(false)
  const [showHsnForm, setShowHsnForm] = useState(false)

  const [editingGstRate, setEditingGstRate] = useState<GstRate | null>(null)
  const [editingHsnCode, setEditingHsnCode] = useState<HsnCode | null>(null)

  // GST Form State
  const [gstName, setGstName] = useState('')
  const [gstPercent, setGstPercent] = useState('')
  const [cgstPercent, setCgstPercent] = useState('')
  const [sgstPercent, setSgstPercent] = useState('')
  const [igstPercent, setIgstPercent] = useState('')
  const [taxMode, setTaxMode] = useState('EXCLUSIVE')
  const [gstError, setGstError] = useState('')
  const [gstSubmitting, setGstSubmitting] = useState(false)

  // HSN Form State
  const [hsnCode, setHsnCode] = useState('')
  const [hsnDescription, setHsnDescription] = useState('')
  const [hsnGstRateId, setHsnGstRateId] = useState('')
  const [hsnError, setHsnError] = useState('')
  const [hsnSubmitting, setHsnSubmitting] = useState(false)

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

  function handleOpenGstCreate() {
    setEditingGstRate(null)
    setGstName('')
    setGstPercent('')
    setCgstPercent('')
    setSgstPercent('')
    setIgstPercent('')
    setTaxMode('EXCLUSIVE')
    setGstError('')
    setShowGstForm(true)
  }

  function handleOpenGstEdit(rate: GstRate) {
    setEditingGstRate(rate)
    setGstName(rate.name)
    setGstPercent(rate.gst_percent.toString())
    setCgstPercent(rate.cgst_percent.toString())
    setSgstPercent(rate.sgst_percent.toString())
    setIgstPercent(rate.igst_percent.toString())
    setTaxMode(rate.tax_mode)
    setGstError('')
    setShowGstForm(true)
  }

  async function handleDeleteGstRate(id: number, name: string) {
    if (!window.confirm(`Are you sure you want to delete GST rate slab "${name}"?`)) return
    try {
      await api.delete(`/gst-rates/${id}`)
      loadGstRates()
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to delete GST rate'))
    }
  }

  async function toggleGstStatus(rate: GstRate) {
    await api.put(`/gst-rates/${rate.id}`, { status: rate.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
    loadGstRates()
  }

  function handleOpenHsnCreate() {
    setEditingHsnCode(null)
    setHsnCode('')
    setHsnDescription('')
    setHsnGstRateId('')
    setHsnError('')
    setShowHsnForm(true)
  }

  function handleOpenHsnEdit(hsn: HsnCode) {
    setEditingHsnCode(hsn)
    setHsnCode(hsn.code)
    setHsnDescription(hsn.description || '')
    setHsnGstRateId(hsn.gst_rate_id ? hsn.gst_rate_id.toString() : '')
    setHsnError('')
    setShowHsnForm(true)
  }

  async function removeHsnCode(id: number) {
    if (!window.confirm('Delete this HSN code?')) return
    await api.delete(`/hsn-codes/${id}`)
    loadHsnCodes()
  }

  async function handleGstSubmit(e: FormEvent) {
    e.preventDefault()
    setGstError('')
    setGstSubmitting(true)
    const payload = {
      name: gstName,
      gst_percent: parseFloat(gstPercent),
      cgst_percent: parseFloat(cgstPercent || (parseFloat(gstPercent) / 2).toString()),
      sgst_percent: parseFloat(sgstPercent || (parseFloat(gstPercent) / 2).toString()),
      igst_percent: parseFloat(igstPercent || gstPercent),
      tax_mode: taxMode,
    }
    try {
      if (editingGstRate) {
        await api.put(`/gst-rates/${editingGstRate.id}`, payload)
      } else {
        await api.post('/gst-rates', payload)
      }
      setShowGstForm(false)
      setGstName('')
      setGstPercent('')
      setCgstPercent('')
      setSgstPercent('')
      setIgstPercent('')
      setEditingGstRate(null)
      loadGstRates()
    } catch (err) {
      setGstError(apiErrorMessage(err, editingGstRate ? 'Failed to update GST rate' : 'Failed to create GST rate'))
    } finally {
      setGstSubmitting(false)
    }
  }

  async function handleHsnSubmit(e: FormEvent) {
    e.preventDefault()
    setHsnError('')
    setHsnSubmitting(true)
    const payload = {
      code: hsnCode,
      description: hsnDescription || null,
      gst_rate_id: hsnGstRateId ? parseInt(hsnGstRateId) : null,
    }
    try {
      if (editingHsnCode) {
        await api.put(`/hsn-codes/${editingHsnCode.id}`, payload)
      } else {
        await api.post('/hsn-codes', payload)
      }
      setShowHsnForm(false)
      setHsnCode('')
      setHsnDescription('')
      setHsnGstRateId('')
      setEditingHsnCode(null)
      loadHsnCodes()
    } catch (err) {
      setHsnError(apiErrorMessage(err, editingHsnCode ? 'Failed to update HSN code' : 'Failed to create HSN code'))
    } finally {
      setHsnSubmitting(false)
    }
  }

  return (
    <div className="space-y-8 pb-12">
      {/* ================= SECTION 1: GST RATES TABLE ================= */}
      <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex items-center justify-between bg-white">
          <div>
            <h3 className="text-xl font-serif font-bold text-slate-900">GST Rates &amp; Split Slabs</h3>
            <p className="text-xs text-slate-500 mt-0.5">CGST, SGST, IGST breakup for invoices and purchases</p>
          </div>
          <button
            type="button"
            onClick={handleOpenGstCreate}
            className="px-4 py-1.5 rounded-full bg-[#FAF0F2] text-[#804652] border border-[#F2DFE2] text-xs font-bold hover:bg-[#F5E6E9] transition-colors shadow-2xs"
          >
            + Add GST Rate
          </button>
        </div>

        {gstRates === null ? (
          <div className="p-8 text-center"><Spinner /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
                <tr>
                  <th className="px-6 py-4">Tax Name</th>
                  <th className="px-6 py-4">Total GST %</th>
                  <th className="px-6 py-4">CGST / SGST</th>
                  <th className="px-6 py-4">IGST %</th>
                  <th className="px-6 py-4">Tax Mode</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F6EDEE]">
                {gstRates.map((r) => (
                  <tr key={r.id} className="hover:bg-[#FAF5F6] transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 text-sm">{r.name}</td>
                    <td className="px-6 py-4">
                      <span className="bg-[#F3E1E4] text-[#4A1821] border border-[#DCBAC1] font-mono font-bold px-3 py-1 rounded-full text-xs shadow-2xs">
                        {r.gst_percent}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-800 font-bold font-mono text-xs">
                      {r.cgst_percent}% / {r.sgst_percent}%
                    </td>
                    <td className="px-6 py-4 text-slate-800 font-bold font-mono text-xs">{r.igst_percent}%</td>
                    <td className="px-6 py-4">
                      <span className="text-slate-800 font-bold uppercase text-xs tracking-wider">
                        {r.tax_mode}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {r.status === 'ACTIVE' ? (
                        <span className="bg-[#E3F8E9] text-[#0E7A36] border border-[#B7EDC4] font-black text-[11px] px-3 py-1 rounded-full inline-flex items-center gap-1.5 uppercase tracking-wider shadow-2xs">
                          <span className="h-2 w-2 rounded-full bg-[#0E7A36]"></span>
                          ACTIVE
                        </span>
                      ) : (
                        <span className="bg-[#FDE8EC] text-[#B91C1C] border border-[#F9B6C2] font-black text-[11px] px-3 py-1 rounded-full inline-flex items-center gap-1.5 uppercase tracking-wider shadow-2xs">
                          <span className="h-2 w-2 rounded-full bg-[#B91C1C]"></span>
                          INACTIVE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-3 font-bold">
                      <button
                        type="button"
                        onClick={() => handleOpenGstEdit(r)}
                        className="text-xs text-indigo-700 hover:text-indigo-900 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGstStatus(r)}
                        className={`text-xs font-bold hover:underline ${
                          r.status === 'ACTIVE' ? 'text-amber-700 hover:text-amber-900' : 'text-emerald-700 hover:text-emerald-900'
                        }`}
                      >
                        {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGstRate(r.id, r.name)}
                        className="text-xs text-rose-600 hover:text-rose-800 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= SECTION 2: HSN CODES TABLE ================= */}
      <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex items-center justify-between bg-white">
          <div>
            <h3 className="text-xl font-serif font-bold text-slate-900">HSN &amp; SAC Codes</h3>
            <p className="text-xs text-slate-500 mt-0.5">Harmonized System Nomenclature mapping for GST filing</p>
          </div>
          <button
            type="button"
            onClick={handleOpenHsnCreate}
            className="px-4 py-1.5 rounded-full bg-[#FAF0F2] text-[#804652] border border-[#F2DFE2] text-xs font-bold hover:bg-[#F5E6E9] transition-colors shadow-2xs"
          >
            + Add HSN Code
          </button>
        </div>

        {hsnCodes === null ? (
          <div className="p-8 text-center"><Spinner /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
                <tr>
                  <th className="px-6 py-4">HSN / SAC Code</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F6EDEE]">
                {hsnCodes.map((h) => (
                  <tr key={h.id} className="hover:bg-[#FAF5F6] transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-slate-900 text-sm">
                      <span className="bg-[#F3E1E4] text-[#4A1821] border border-[#DCBAC1] px-3 py-1 rounded-full text-xs font-mono font-bold inline-block shadow-2xs">
                        {h.code}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-800 font-medium">{h.description || '—'}</td>
                    <td className="px-6 py-4 text-right space-x-3 font-bold">
                      <button
                        type="button"
                        onClick={() => handleOpenHsnEdit(h)}
                        className="text-xs text-indigo-700 hover:text-indigo-900 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeHsnCode(h.id)}
                        className="text-xs text-rose-600 hover:text-rose-800 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= MODAL: NEW / EDIT GST RATE ================= */}
      {showGstForm && (
        <Modal title={editingGstRate ? 'Edit GST Tax Rate Slab' : 'New GST Tax Rate Slab'} onClose={() => setShowGstForm(false)}>
          <form onSubmit={handleGstSubmit} className="space-y-4">
            {gstError && <Alert tone="red">{gstError}</Alert>}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Tax Slab Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={gstName}
                onChange={(e) => setGstName(e.target.value)}
                placeholder="e.g. GST 18%, GST 5%, Exempt"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Total GST % <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={gstPercent}
                  onChange={(e) => {
                    const val = e.target.value
                    setGstPercent(val)
                    const num = parseFloat(val) || 0
                    setCgstPercent((num / 2).toString())
                    setSgstPercent((num / 2).toString())
                    setIgstPercent(val)
                  }}
                  placeholder="e.g. 18"
                  className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Tax Mode
                </label>
                <select
                  value={taxMode}
                  onChange={(e) => setTaxMode(e.target.value)}
                  className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs cursor-pointer"
                >
                  <option value="EXCLUSIVE">Exclusive (Tax added on top)</option>
                  <option value="INCLUSIVE">Inclusive (Tax included in price)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-[#FAF5F6] p-3 rounded-2xl border border-[#EEDDE0]">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  CGST %
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={cgstPercent}
                  onChange={(e) => setCgstPercent(e.target.value)}
                  className="w-full rounded-lg border border-[#E5D5D8] bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  SGST %
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={sgstPercent}
                  onChange={(e) => setSgstPercent(e.target.value)}
                  className="w-full rounded-lg border border-[#E5D5D8] bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  IGST %
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={igstPercent}
                  onChange={(e) => setIgstPercent(e.target.value)}
                  className="w-full rounded-lg border border-[#E5D5D8] bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#F2E5E7]">
              <button
                type="button"
                onClick={() => setShowGstForm(false)}
                className="px-5 py-2 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={gstSubmitting}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {gstSubmitting ? 'Saving…' : editingGstRate ? 'Save Changes' : 'Create GST Rate'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ================= MODAL: NEW / EDIT HSN CODE ================= */}
      {showHsnForm && (
        <Modal title={editingHsnCode ? 'Edit HSN / SAC Code' : 'New HSN / SAC Code'} onClose={() => setShowHsnForm(false)}>
          <form onSubmit={handleHsnSubmit} className="space-y-4">
            {hsnError && <Alert tone="red">{hsnError}</Alert>}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                HSN / SAC Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                placeholder="e.g. 6109, 8517, 9503"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Description <span className="text-slate-400 font-normal normal-case">(Optional)</span>
              </label>
              <input
                type="text"
                value={hsnDescription}
                onChange={(e) => setHsnDescription(e.target.value)}
                placeholder="e.g. T-Shirts, Mobile Phones, Toys"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Default GST Rate Slab
              </label>
              <select
                value={hsnGstRateId}
                onChange={(e) => setHsnGstRateId(e.target.value)}
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs cursor-pointer"
              >
                <option value="">No Default Rate</option>
                {gstRates?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.gst_percent}%)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#F2E5E7]">
              <button
                type="button"
                onClick={() => setShowHsnForm(false)}
                className="px-5 py-2 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={hsnSubmitting}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {hsnSubmitting ? 'Saving…' : editingHsnCode ? 'Save Changes' : 'Create HSN Code'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
