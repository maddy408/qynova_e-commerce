import { useEffect, useState, type FormEvent } from 'react'
import { EyeIcon, PencilIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Badge, Button, Card, Modal, PageHeader, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Category, Subcategory } from '../lib/types'

export function SubcategoriesPage() {
  const [subcategories, setSubcategories] = useState<Subcategory[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingSubcategory, setEditingSubcategory] = useState<Subcategory | null>(null)
  const [viewingSubcategory, setViewingSubcategory] = useState<Subcategory | null>(null)

  const [name, setName] = useState('')
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function load() {
    api.get('/subcategories').then((res) => setSubcategories(res.data.subcategories))
    api.get('/categories').then((res) => setCategories(res.data.categories))
  }

  useEffect(load, [])

  function categoryNames(ids: number[] | undefined) {
    if (!ids || ids.length === 0) return '—'
    return ids
      .map((id) => categories.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(', ')
  }

  function openCreateModal() {
    setName('')
    setCategoryIds([])
    setError('')
    setShowForm(true)
  }

  function openEditModal(s: Subcategory) {
    setEditingSubcategory(s)
    setName(s.name)
    setCategoryIds(s.category_ids ?? [])
    setError('')
  }

  function toggleCategory(id: number) {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (categoryIds.length === 0) {
      setError('Select at least one parent category')
      return
    }
    setSubmitting(true)
    try {
      if (editingSubcategory) {
        await api.put(`/subcategories/${editingSubcategory.id}`, { name, category_ids: categoryIds })
        setEditingSubcategory(null)
      } else {
        await api.post('/subcategories', { name, category_ids: categoryIds })
        setShowForm(false)
      }
      setName('')
      setCategoryIds([])
      load()
    } catch (err) {
      setError(apiErrorMessage(err, editingSubcategory ? 'Could not update subcategory' : 'Could not create subcategory'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(subcategory: Subcategory) {
    if (!confirm(`Are you sure you want to delete subcategory "${subcategory.name}"? It will be soft-deleted.`)) return
    try {
      await api.delete(`/subcategories/${subcategory.id}`)
      load()
    } catch (err) {
      alert(apiErrorMessage(err, 'Could not delete subcategory'))
    }
  }

  async function toggleStatus(subcategory: Subcategory) {
    const next = subcategory.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await api.put(`/subcategories/${subcategory.id}`, { status: next })
    load()
  }

  return (
    <div>
      <PageHeader
        title="Subcategories"
        description="Each subcategory can sit under one or more categories — e.g. “Kids” under both Toys and Gift Items."
        actions={
          <Button onClick={openCreateModal} disabled={categories.length === 0}>
            + New Subcategory
          </Button>
        }
      />

      {subcategories === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 uppercase text-slate-500 bg-slate-50/70">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Parent Categories</th>
                <th className="px-4 py-2.5 font-semibold">Products</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subcategories.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{s.name}</td>
                  <td className="px-4 py-2.5 text-slate-600 font-medium">{categoryNames(s.category_ids)}</td>
                  <td className="px-4 py-2.5 text-slate-600 font-medium">{s.product_count ?? 0}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={s.status === 'ACTIVE' ? 'green' : 'slate'}>{s.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setViewingSubcategory(s)}
                      className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                      title="View Details"
                    >
                      <EyeIcon />
                    </button>
                    <button
                      onClick={() => openEditModal(s)}
                      className="p-1 rounded text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                      title="Edit Subcategory"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={() => toggleStatus(s)}
                      className={`p-1 rounded transition-colors ${s.status === 'ACTIVE' ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
                      title={s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    >
                      <PowerIcon />
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Soft Delete"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
              {subcategories.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No subcategories found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create / Edit Modal */}
      {(showForm || editingSubcategory) && (
        <Modal
          title={editingSubcategory ? `Edit Subcategory: ${editingSubcategory.name}` : 'New Subcategory'}
          onClose={() => { setShowForm(false); setEditingSubcategory(null); }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <Alert>{error}</Alert>}
            <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kids" />
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Parent Categories <span className="text-red-500">*</span>
              </span>
              <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-slate-200 p-2.5 text-xs">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(c.id)}
                      onChange={() => toggleCategory(c.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setEditingSubcategory(null); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : editingSubcategory ? 'Save Changes' : 'Create Subcategory'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* View Modal */}
      {viewingSubcategory && (
        <Modal title={`Subcategory Details: ${viewingSubcategory.name}`} onClose={() => setViewingSubcategory(null)}>
          <div className="space-y-3 text-xs">
            <div>
              <span className="font-semibold text-slate-500 block uppercase tracking-wider text-[10px]">Name</span>
              <p className="text-sm font-semibold text-slate-900 mt-0.5">{viewingSubcategory.name}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block uppercase tracking-wider text-[10px]">Slug</span>
              <p className="font-mono text-slate-700 bg-slate-100 px-2 py-1 rounded inline-block mt-0.5">{viewingSubcategory.slug}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block uppercase tracking-wider text-[10px]">Parent Categories</span>
              <p className="text-slate-700 mt-0.5 font-medium">{categoryNames(viewingSubcategory.category_ids)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Products</span>
                <p className="text-base font-bold text-slate-900">{viewingSubcategory.product_count ?? 0}</p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Status</span>
                <div className="mt-1">
                  <Badge tone={viewingSubcategory.status === 'ACTIVE' ? 'green' : 'slate'}>{viewingSubcategory.status}</Badge>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-3">
              <Button variant="secondary" onClick={() => setViewingSubcategory(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
