import { useEffect, useState, type FormEvent } from 'react'
import { EyeIcon, PencilIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Badge, Button, Card, Modal, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Supplier } from '../lib/types'

interface SupplierForm {
  name: string
  contact_person: string
  phone: string
  email: string
  address: string
  gstin: string
}

const EMPTY_FORM: SupplierForm = { name: '', contact_person: '', phone: '', email: '', address: '', gstin: '' }

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null)
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null)

  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function load() {
    api
      .get('/suppliers', { params: { search: search || undefined, status: status || undefined, page, limit } })
      .then((res) => {
        setSuppliers(res.data.suppliers)
        setTotal(res.data.total ?? res.data.suppliers.length)
      })
  }

  useEffect(load, [search, status, page])

  function field<K extends keyof SupplierForm>(key: K) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    }
  }

  function openCreateModal() {
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  function openEditModal(s: Supplier) {
    setEditingSupplier(s)
    setForm({
      name: s.name,
      contact_person: s.contact_person ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      address: s.address ?? '',
      gstin: s.gstin ?? '',
    })
    setError('')
  }

  function closeModals() {
    setShowForm(false)
    setEditingSupplier(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const payload = {
      name: form.name,
      contact_person: form.contact_person || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      gstin: form.gstin || null,
    }
    try {
      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier.id}`, payload)
      } else {
        await api.post('/suppliers', payload)
      }
      closeModals()
      load()
    } catch (err) {
      setError(apiErrorMessage(err, editingSupplier ? 'Could not update supplier' : 'Could not create supplier'))
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleStatus(supplier: Supplier) {
    const next = supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await api.put(`/suppliers/${supplier.id}`, { status: next })
    load()
  }

  async function handleDelete() {
    if (!deletingSupplier) return
    setDeleting(true)
    try {
      await api.delete(`/suppliers/${deletingSupplier.id}`)
      setDeletingSupplier(null)
      load()
    } catch (err) {
      alert(apiErrorMessage(err, 'Could not delete supplier'))
    } finally {
      setDeleting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-6 pb-12">
      {/* ================= ALL SUPPLIERS TABLE ================= */}
      {suppliers === null ? (
        <div className="p-12 text-center">
          <Spinner />
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
          {/* Card Header with Filters, Search and New Supplier Button */}
          <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
            <div>
              <h3 className="text-xl font-serif font-bold text-slate-900">All Suppliers</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {suppliers.length} of {total} suppliers
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Status Filter Pills */}
              <div className="inline-flex items-center gap-1 bg-[#FAF2F4] p-1 rounded-full border border-[#EEDDE0] text-xs shadow-2xs">
                {(['', 'ACTIVE', 'INACTIVE'] as const).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setPage(1); setStatus(val) }}
                    className={`px-3 py-1 rounded-full font-medium transition-all ${
                      status === val
                        ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {val === '' ? 'All' : val === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
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
                  placeholder="Search suppliers…"
                  value={search}
                  onChange={(e) => { setPage(1); setSearch(e.target.value) }}
                  className="rounded-full border border-[#E5D5D8] bg-[#FDFBFB] pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7B3F4A] transition-all w-44 sm:w-56"
                />
              </div>

              {/* + New Supplier Button */}
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-all shadow-md active:scale-98"
              >
                + New Supplier
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Contact Person</th>
                  <th className="px-6 py-4">Phone</th>
                  <th className="px-6 py-4">GSTIN</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E0E3]">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-[#FAF2F4]/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-950 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 shrink-0 rounded-full bg-[#FAF2F4] border border-[#EEDDE0] flex items-center justify-center text-[#804652] font-bold text-xs shadow-2xs">
                          {s.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span>{s.name}</span>
                          {s.email && <p className="text-[11px] font-normal text-slate-500">{s.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-700 font-medium">{s.contact_person ?? '—'}</td>
                    <td className="px-6 py-4 text-slate-700 font-mono font-medium">{s.phone ?? '—'}</td>
                    <td className="px-6 py-4">
                      {s.gstin ? (
                        <span className="bg-[#F3E1E4] text-[#4A1821] border border-[#DCBAC1] px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold inline-block shadow-2xs">
                          {s.gstin}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {s.status === 'ACTIVE' ? (
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
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingSupplier(s)}
                          className="p-2 rounded-lg text-slate-700 hover:bg-[#F3E1E4] hover:text-[#4A1821] transition-colors"
                          title="View Details"
                        >
                          <EyeIcon className="h-4 w-4 stroke-[2]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(s)}
                          className="p-2 rounded-lg text-slate-700 hover:bg-[#F3E1E4] hover:text-[#4A1821] transition-colors"
                          title="Edit Supplier"
                        >
                          <PencilIcon className="h-4 w-4 stroke-[2]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStatus(s)}
                          className={`p-2 rounded-lg transition-colors ${
                            s.status === 'ACTIVE'
                              ? 'text-emerald-700 hover:bg-emerald-100/70'
                              : 'text-slate-500 hover:bg-slate-200'
                          }`}
                          title={s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        >
                          <PowerIcon className="h-4 w-4 stroke-[2]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingSupplier(s)}
                          className="p-2 rounded-lg text-rose-600 hover:bg-rose-100 hover:text-rose-800 transition-colors"
                          title="Delete Supplier"
                        >
                          <TrashIcon className="h-4 w-4 stroke-[2]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-600 font-semibold text-sm">
                      No suppliers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#F2E5E7] px-6 py-3 bg-[#FAF2F4]/50 text-xs">
              <span className="text-slate-500">
                Page <span className="font-bold text-slate-900">{page}</span> of <span className="font-bold text-slate-900">{totalPages}</span> ({total} suppliers)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 rounded-full border border-[#EEDDE0] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[#FAF2F4] transition-colors text-xs"
                >
                  ← Previous
                </button>
                <span className="text-slate-600 font-medium px-2">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 rounded-full border border-[#EEDDE0] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[#FAF2F4] transition-colors text-xs"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= CREATE / EDIT MODAL ================= */}
      {(showForm || editingSupplier) && (
        <Modal
          title={editingSupplier ? `Edit Supplier: ${editingSupplier.name}` : 'New Supplier'}
          onClose={closeModals}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert tone="red">{error}</Alert>}

            {/* Supplier Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Supplier Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Acme Supplies, Wholesale Traders…"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
              />
            </div>

            {/* Contact Person */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Contact Person <span className="text-slate-400 font-normal normal-case">(Optional)</span>
              </label>
              <input
                type="text"
                value={form.contact_person}
                onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
                placeholder="e.g. Rajesh Kumar, John Doe…"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
              />
            </div>

            {/* Phone & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Phone <span className="text-slate-400 font-normal normal-case">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="e.g. +91 9876543210"
                  className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Email <span className="text-slate-400 font-normal normal-case">(Optional)</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="supplier@example.com"
                  className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Address <span className="text-slate-400 font-normal normal-case">(Optional)</span>
              </label>
              <textarea
                rows={2}
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Street address, City, State, PIN code…"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs resize-none"
              />
            </div>

            {/* GSTIN */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                GSTIN <span className="text-slate-400 font-normal normal-case">(Optional)</span>
              </label>
              <input
                type="text"
                value={form.gstin}
                onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))}
                placeholder="e.g. 22AAAAA0000A1Z5"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#F2E5E7]">
              <button
                type="button"
                onClick={closeModals}
                className="px-5 py-2 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {submitting ? 'Saving…' : editingSupplier ? 'Save Changes' : 'Create Supplier'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ================= VIEW MODAL ================= */}
      {viewingSupplier && (
        <Modal title={`Supplier Details: ${viewingSupplier.name}`} onClose={() => setViewingSupplier(null)}>
          <div className="space-y-3 text-xs">
            {(
              [
                ['Name', viewingSupplier.name],
                ['Contact Person', viewingSupplier.contact_person ?? '—'],
                ['Phone', viewingSupplier.phone ?? '—'],
                ['Email', viewingSupplier.email ?? '—'],
                ['Address', viewingSupplier.address ?? '—'],
                ['GSTIN', viewingSupplier.gstin ?? '—'],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-[#FAF2F4] px-4 py-2.5 border border-[#EEDDE0]">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#804652]">{label}</span>
                <p className="mt-0.5 text-slate-800 font-medium">{value}</p>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 border-t border-[#F2E5E7] pt-3">
              <div className="rounded-xl border border-[#EEDDE0] bg-[#FAF2F4] p-2.5">
                <span className="text-[10px] font-bold uppercase text-[#804652]">Status</span>
                <div className="mt-1">
                  <Badge tone={viewingSupplier.status === 'ACTIVE' ? 'green' : 'slate'}>{viewingSupplier.status}</Badge>
                </div>
              </div>
              <div className="rounded-xl border border-[#EEDDE0] bg-[#FAF2F4] p-2.5">
                <span className="text-[10px] font-bold uppercase text-[#804652]">Created</span>
                <p className="mt-0.5 font-medium text-slate-800">{new Date(viewingSupplier.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex justify-end pt-3 border-t border-[#F2E5E7]">
              <button
                type="button"
                onClick={() => setViewingSupplier(null)}
                className="px-5 py-2 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================= DELETE CONFIRMATION MODAL ================= */}
      {deletingSupplier && (
        <Modal title="Delete Supplier" onClose={() => setDeletingSupplier(null)}>
          <div className="space-y-4 text-xs">
            <p className="text-slate-700">
              Are you sure you want to delete supplier <strong className="text-slate-900">{deletingSupplier.name}</strong>? It will be
              soft-deleted — existing purchases and GRNs that reference it are kept intact.
            </p>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#F2E5E7]">
              <button
                type="button"
                onClick={() => setDeletingSupplier(null)}
                className="px-5 py-2 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-rose-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-rose-700 shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete Supplier'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
