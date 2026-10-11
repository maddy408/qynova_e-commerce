import { useCallback, useState, type FormEvent } from 'react'
import { EyeIcon, PencilIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Badge, Modal } from '../components/ui'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { DetailsView } from '../components/ui/DetailsView'
import { api, apiErrorMessage } from '../lib/api'
import type { Supplier } from '../lib/types'
import { useListQuery } from '../hooks/useListQuery'
import { useListUrlState } from '../hooks/useListUrlState'
import { useDoubleSubmitGuard } from '../hooks/useDoubleSubmitGuard'

interface SupplierForm {
  name: string
  contact_person: string
  phone: string
  email: string
  address: string
  gstin: string
}

const EMPTY_FORM: SupplierForm = { name: '', contact_person: '', phone: '', email: '', address: '', gstin: '' }
const LIMIT = 20

export function SuppliersPage() {
  const { search, debouncedSearch, setSearch, page, setPage, filters, setFilter } = useListUrlState<{ status: string }>(['status'])

  const fetchSuppliers = useCallback(async () => {
    const res = await api.get('/suppliers', {
      params: { search: debouncedSearch || undefined, status: filters.status || undefined, page, limit: LIMIT },
    })
    return { rows: res.data.suppliers as Supplier[], total: res.data.total ?? res.data.suppliers.length }
  }, [debouncedSearch, filters.status, page])

  const { rows: suppliers, total, reload } = useListQuery(fetchSuppliers, [debouncedSearch, filters.status, page])

  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null)
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null)

  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM)
  const [error, setError] = useState('')
  const { submitting, guard } = useDoubleSubmitGuard()

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

  const handleSubmit = guard(async () => {
    setError('')
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
      reload()
    } catch (err) {
      setError(apiErrorMessage(err, editingSupplier ? 'Could not update supplier' : 'Could not create supplier'))
    }
  })

  async function toggleStatus(supplier: Supplier) {
    const next = supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await api.put(`/suppliers/${supplier.id}`, { status: next })
    reload()
  }

  async function handleDelete() {
    if (!deletingSupplier) return
    await api.delete(`/suppliers/${deletingSupplier.id}`)
    setDeletingSupplier(null)
    reload()
  }

  const columns: DataTableColumn<Supplier>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (s) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-primary-strong)] font-bold text-xs shadow-2xs">
            {s.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <span className="font-bold text-slate-950 text-sm">{s.name}</span>
            {s.email && <p className="text-[11px] font-normal text-slate-500">{s.email}</p>}
          </div>
        </div>
      ),
    },
    { key: 'contact_person', header: 'Contact Person', render: (s) => <span className="text-slate-700 font-medium">{s.contact_person ?? '—'}</span> },
    { key: 'phone', header: 'Phone', render: (s) => <span className="text-slate-700 font-mono font-medium">{s.phone ?? '—'}</span> },
    {
      key: 'gstin',
      header: 'GSTIN',
      render: (s) =>
        s.gstin ? (
          <span className="bg-[var(--color-extra-006)] text-[var(--color-extra-001)] border border-[var(--color-extra-007)] px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold inline-block shadow-2xs">
            {s.gstin}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (s) =>
        s.status === 'ACTIVE' ? (
          <span className="bg-[var(--color-extra-016)] text-[var(--color-extra-011)] border border-[var(--color-extra-017)] font-black text-[11px] px-3 py-1 rounded-full inline-flex items-center gap-1.5 uppercase tracking-wider shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-[var(--color-extra-011)]" />
            ACTIVE
          </span>
        ) : (
          <span className="bg-[var(--color-extra-014)] text-[var(--color-extra-008)] border border-[var(--color-extra-015)] font-black text-[11px] px-3 py-1 rounded-full inline-flex items-center gap-1.5 uppercase tracking-wider shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-[var(--color-extra-008)]" />
            INACTIVE
          </span>
        ),
    },
  ]

  return (
    <div className="space-y-6 pb-12">
      <DataTable
        title="All Suppliers"
        columns={columns}
        rows={suppliers}
        rowKey={(s) => s.id}
        total={total}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search suppliers…"
        emptyMessage="No suppliers found."
        filters={
          <div className="inline-flex items-center gap-1 bg-[var(--color-surface)] p-1 rounded-full border border-[var(--color-border)] text-xs shadow-2xs">
            {(['', 'ACTIVE', 'INACTIVE'] as const).map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setFilter('status', val)}
                className={`px-3 py-1 rounded-full font-medium transition-all ${
                  filters.status === val ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {val === '' ? 'All' : val === 'ACTIVE' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>
        }
        headerActions={
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-[var(--color-primary-strong)] to-[var(--color-primary-strong-hover)] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-all shadow-md active:scale-98"
          >
            + New Supplier
          </button>
        }
        actions={(s) => (
          <>
            <button
              type="button"
              onClick={() => setViewingSupplier(s)}
              className="p-2 rounded-lg text-slate-700 hover:bg-[var(--color-extra-006)] hover:text-[var(--color-extra-001)] transition-colors"
              title="View Details"
            >
              <EyeIcon className="h-4 w-4 stroke-[2]" />
            </button>
            <button
              type="button"
              onClick={() => openEditModal(s)}
              className="p-2 rounded-lg text-slate-700 hover:bg-[var(--color-extra-006)] hover:text-[var(--color-extra-001)] transition-colors"
              title="Edit Supplier"
            >
              <PencilIcon className="h-4 w-4 stroke-[2]" />
            </button>
            <button
              type="button"
              onClick={() => toggleStatus(s)}
              className={`p-2 rounded-lg transition-colors ${
                s.status === 'ACTIVE' ? 'text-emerald-700 hover:bg-emerald-100/70' : 'text-slate-500 hover:bg-slate-200'
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
          </>
        )}
      />

      {/* ================= CREATE / EDIT MODAL ================= */}
      {(showForm || editingSupplier) && (
        <Modal title={editingSupplier ? `Edit Supplier: ${editingSupplier.name}` : 'New Supplier'} onClose={closeModals}>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleSubmit() }} className="space-y-4">
            {error && <Alert tone="red">{error}</Alert>}

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
                className="w-full rounded-xl border border-[var(--color-surface-muted)] bg-[var(--color-extra-002)] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 transition-all shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Contact Person <span className="text-slate-400 font-normal normal-case">(Optional)</span>
              </label>
              <input
                type="text"
                value={form.contact_person}
                onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
                placeholder="e.g. Rajesh Kumar, John Doe…"
                className="w-full rounded-xl border border-[var(--color-surface-muted)] bg-[var(--color-extra-002)] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 transition-all shadow-2xs"
              />
            </div>

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
                  className="w-full rounded-xl border border-[var(--color-surface-muted)] bg-[var(--color-extra-002)] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 transition-all shadow-2xs"
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
                  className="w-full rounded-xl border border-[var(--color-surface-muted)] bg-[var(--color-extra-002)] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 transition-all shadow-2xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Address <span className="text-slate-400 font-normal normal-case">(Optional)</span>
              </label>
              <textarea
                rows={2}
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Street address, City, State, PIN code…"
                className="w-full rounded-xl border border-[var(--color-surface-muted)] bg-[var(--color-extra-002)] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 transition-all shadow-2xs resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                GSTIN <span className="text-slate-400 font-normal normal-case">(Optional)</span>
              </label>
              <input
                type="text"
                value={form.gstin}
                onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))}
                placeholder="e.g. 22AAAAA0000A1Z5"
                className="w-full rounded-xl border border-[var(--color-surface-muted)] bg-[var(--color-extra-002)] px-3.5 py-2.5 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 transition-all shadow-2xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--color-border-muted)]">
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
                className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-[var(--color-primary-strong)] to-[var(--color-primary-strong-hover)] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 shadow-md active:scale-98 transition-all disabled:opacity-50"
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
          <DetailsView
            fields={[
              { label: 'Name', value: viewingSupplier.name },
              { label: 'Contact Person', value: viewingSupplier.contact_person ?? '—' },
              { label: 'Phone', value: viewingSupplier.phone ?? '—' },
              { label: 'Email', value: viewingSupplier.email ?? '—' },
              { label: 'Address', value: viewingSupplier.address ?? '—' },
              { label: 'GSTIN', value: viewingSupplier.gstin ?? '—' },
              { label: 'Status', value: <Badge tone={viewingSupplier.status === 'ACTIVE' ? 'green' : 'slate'}>{viewingSupplier.status}</Badge>, compact: true },
              { label: 'Created', value: new Date(viewingSupplier.created_at).toLocaleDateString(), compact: true },
            ]}
            footer={
              <button
                type="button"
                onClick={() => setViewingSupplier(null)}
                className="px-5 py-2 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            }
          />
        </Modal>
      )}

      {/* ================= DELETE CONFIRMATION ================= */}
      <ConfirmDialog
        open={deletingSupplier !== null}
        title="Delete Supplier"
        message={
          <>
            Are you sure you want to delete supplier <strong className="text-slate-900">{deletingSupplier?.name}</strong>? It will be
            soft-deleted — existing purchases and GRNs that reference it are kept intact.
          </>
        }
        confirmLabel="Delete Supplier"
        onConfirm={handleDelete}
        onCancel={() => setDeletingSupplier(null)}
      />
    </div>
  )
}
