import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Modal, Spinner } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Unit } from '../lib/types'

export function UnitsPage() {
  const [units, setUnits] = useState<Unit[] | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [shortCode, setShortCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

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
      await api.post('/units', { name: name.trim(), short_code: shortCode.trim().toUpperCase() })
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

  const filteredUnits = (units ?? []).filter(
    (u) =>
      !searchQuery.trim() ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.short_code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6 pb-12">
      {/* ================= ALL UNITS TABLE CARD ================= */}
      {units === null ? (
        <div className="p-12 text-center">
          <Spinner />
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
          {/* Card Header with Search and New Unit Button */}
          <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
            <div>
              <h3 className="text-xl font-serif font-bold text-slate-900">All Measurement Units</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {filteredUnits.length} of {units.length} units
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search units, symbols…"
                  className="rounded-full border border-[#E5D5D8] bg-[#FDFBFB] pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7B3F4A] transition-all w-48 sm:w-56"
                />
              </div>

              {/* + New Unit Button */}
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-all shadow-md active:scale-98"
              >
                + New Unit
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
                <tr>
                  <th className="px-6 py-4">Unit Name</th>
                  <th className="px-6 py-4">Short Code / Symbol</th>
                  <th className="px-6 py-4 text-right">System ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F6EDEE]">
                {filteredUnits.map((u) => (
                  <tr key={u.id} className="hover:bg-[#FAF5F6] transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 text-sm">{u.name}</td>
                    <td className="px-6 py-4">
                      <span className="bg-[#F3E1E4] text-[#4A1821] border border-[#DCBAC1] px-3.5 py-1 rounded-full text-xs font-mono font-bold inline-block shadow-2xs">
                        {u.short_code}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-700">#{u.id}</td>
                  </tr>
                ))}
                {filteredUnits.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-slate-500 font-medium">
                      No measurement units found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL: NEW UNIT ================= */}
      {showModal && (
        <Modal title="Add New Measurement Unit" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert tone="red">{error}</Alert>}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Unit Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kilogram, Pieces, Box, Meters"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Short Code / Symbol <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value)}
                placeholder="e.g. KG, PCS, BOX, MTR"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs uppercase font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#F2E5E7]">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-5 py-2 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {submitting ? 'Adding…' : 'Add Unit'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
