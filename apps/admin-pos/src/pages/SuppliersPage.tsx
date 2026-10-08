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
    <div className="space-y-4">
      {/* ── Amber Action Bar ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl bg-amber-50/60 border border-amber-200/60 px-4 py-3">
        <p className="text-[11px] font-medium text-amber-700/80">Vendors you purchase stock from — referenced by purchases and GRNs.</p>
        <div className="flex flex-wrap items-center gap-2">
          <TextField
            placeholder="Search name, phone or GSTIN…"
            value={search}
            onChange={(e) => {
              setPage(1)
              setSearch(e.target.value)
            }}
            className="w-56"
          />
          <Select
            value={status}
            onChange={(e) => {
              setPage(1)
              setStatus(e.target.value)
            }}
            className="w-36"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
          <Button onClick={openCreateModal} className="!bg-amber-800 hover:!bg-amber-900 !text-white shrink-0">
            + New Supplier
          </Button>
        </div>
      </div>

      {suppliers === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b-2 border-amber-200 text-[10px] uppercase tracking-wider text-amber-800 bg-amber-50/80">
              <tr>
                <th className="px-5 py-3 font-bold">Name</th>
                <th className="px-5 py-3 font-bold">Contact</th>
                <th className="px-5 py-3 font-bold">Phone</th>
                <th className="px-5 py-3 font-bold">GSTIN</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-amber-50/60 transition-colors">
                  <td className="px-5 py-3 font-medium text-stone-900">{s.name}</td>
                  <td className="px-5 py-3 text-stone-600">{s.contact_person ?? '—'}</td>
                  <td className="px-5 py-3 text-stone-600">{s.phone ?? '—'}</td>
                  <td className="px-5 py-3 text-stone-600">{s.gstin ?? '—'}</td>
                  <td className="px-5 py-3">
                    <Badge tone={s.status === 'ACTIVE' ? 'green' : 'slate'}>{s.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setViewingSupplier(s)}
                        className="rounded p-1.5 text-slate-500 transition-colors hover:bg-amber-50 hover:text-amber-700"
                        title="View Details"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(s)}
                        className="rounded p-1.5 text-slate-500 transition-colors hover:bg-amber-50 hover:text-amber-600"
                        title="Edit Supplier"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => toggleStatus(s)}
                        className={`rounded p-1.5 transition-colors ${s.status === 'ACTIVE' ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
                        title={s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      >
                        <PowerIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeletingSupplier(s)}
                        className="rounded p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Delete Supplier"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>

                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-stone-500">
                    No suppliers found.

                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-amber-100 px-5 py-3 text-xs text-stone-600 bg-amber-50/40">
              <span>
                Page <span className="font-bold text-stone-900">{page}</span> of <span className="font-bold text-stone-900">{totalPages}</span> &bull; {total} supplier(s)
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  ← Previous
                </Button>
                <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next →
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Create / Edit Modal */}
      {(showForm || editingSupplier) && (
        <Modal title={editingSupplier ? `Edit Supplier: ${editingSupplier.name}` : 'New Supplier'} onClose={closeModals}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <TextField label="Name" required autoFocus {...field('name')} />
            <TextField label="Contact Person" {...field('contact_person')} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Phone" {...field('phone')} />
              <TextField label="Email" type="email" {...field('email')} />
            </div>
            <TextField label="Address" {...field('address')} />
            <TextField label="GSTIN" {...field('gstin')} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={closeModals}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="!bg-amber-800 hover:!bg-amber-900 !text-white">
                {submitting ? 'Saving…' : editingSupplier ? 'Save Changes' : 'Create Supplier'}

              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* View Modal */}
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
              <div key={label}>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
                <p className="mt-0.5 text-slate-800">{value}</p>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <span className="text-[10px] font-semibold uppercase text-slate-500">Status</span>
                <div className="mt-1">
                  <Badge tone={viewingSupplier.status === 'ACTIVE' ? 'green' : 'slate'}>{viewingSupplier.status}</Badge>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <span className="text-[10px] font-semibold uppercase text-slate-500">Created</span>
                <p className="mt-0.5 font-medium text-slate-800">{new Date(viewingSupplier.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex justify-end pt-3">
              <Button variant="secondary" onClick={() => setViewingSupplier(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingSupplier && (
        <Modal title="Delete Supplier" onClose={() => setDeletingSupplier(null)}>
          <div className="space-y-4 text-sm">
            <p className="text-slate-700">
              Are you sure you want to delete supplier <strong className="text-slate-900">{deletingSupplier.name}</strong>? It will be
              soft-deleted — existing purchases and GRNs that reference it are kept intact.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setDeletingSupplier(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Supplier'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
