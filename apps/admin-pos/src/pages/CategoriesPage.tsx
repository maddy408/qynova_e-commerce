import { useEffect, useState, type FormEvent } from 'react'
import { EyeIcon, PencilIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Badge, Button, Card, Modal, PageHeader, Spinner, TextArea, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Category } from '../lib/types'

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [viewingCategory, setViewingCategory] = useState<Category | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function load() {
    api.get('/categories').then((res) => setCategories(res.data.categories))
  }

  useEffect(load, [])

  function openCreateModal() {
    setName('')
    setDescription('')
    setError('')
    setShowForm(true)
  }

  function openEditModal(c: Category) {
    setEditingCategory(c)
    setName(c.name)
    setDescription(c.description ?? '')
    setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, { name, description })
        setEditingCategory(null)
      } else {
        await api.post('/categories', { name, description })
        setShowForm(false)
      }
      setName('')
      setDescription('')
      load()
    } catch (err) {
      setError(apiErrorMessage(err, editingCategory ? 'Could not update category' : 'Could not create category'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(category: Category) {
    if (!confirm(`Are you sure you want to delete category "${category.name}"? It will be soft-deleted.`)) return
    try {
      await api.delete(`/categories/${category.id}`)
      load()
    } catch (err) {
      alert(apiErrorMessage(err, 'Could not delete category'))
    }
  }

  async function toggleStatus(category: Category) {
    const next = category.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await api.put(`/categories/${category.id}`, { status: next })
    load()
  }

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Top-level product grouping — a product can belong to several, with one marked primary."
        actions={<Button onClick={openCreateModal}>+ New Category</Button>}
      />

      {categories === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 uppercase text-slate-500 bg-slate-50/70">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Slug</th>
                <th className="px-4 py-2.5 font-semibold">Subcategories</th>
                <th className="px-4 py-2.5 font-semibold">Products</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-900">{c.name}</p>
                    {c.description && <p className="text-[11px] text-slate-500 line-clamp-1">{c.description}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px]">{c.slug}</td>
                  <td className="px-4 py-2.5 text-slate-600 font-medium">{c.subcategory_count ?? 0}</td>
                  <td className="px-4 py-2.5 text-slate-600 font-medium">{c.product_count ?? 0}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={c.status === 'ACTIVE' ? 'green' : 'slate'}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setViewingCategory(c)}
                      className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                      title="View Details"
                    >
                      <EyeIcon />
                    </button>
                    <button
                      onClick={() => openEditModal(c)}
                      className="p-1 rounded text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                      title="Edit Category"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={() => toggleStatus(c)}
                      className={`p-1 rounded transition-colors ${c.status === 'ACTIVE' ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
                      title={c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    >
                      <PowerIcon />
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Soft Delete"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No categories found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create / Edit Modal */}
      {(showForm || editingCategory) && (
        <Modal title={editingCategory ? `Edit Category: ${editingCategory.name}` : 'New Category'} onClose={() => { setShowForm(false); setEditingCategory(null); }}>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <Alert>{error}</Alert>}
            <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Toys" />
            <TextArea
              label="Description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setEditingCategory(null); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : editingCategory ? 'Save Changes' : 'Create Category'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* View Modal */}
      {viewingCategory && (
        <Modal title={`Category Details: ${viewingCategory.name}`} onClose={() => setViewingCategory(null)}>
          <div className="space-y-3 text-xs">
            <div>
              <span className="font-semibold text-slate-500 block uppercase tracking-wider text-[10px]">Name</span>
              <p className="text-sm font-semibold text-slate-900 mt-0.5">{viewingCategory.name}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block uppercase tracking-wider text-[10px]">Slug</span>
              <p className="font-mono text-slate-700 bg-slate-100 px-2 py-1 rounded inline-block mt-0.5">{viewingCategory.slug}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block uppercase tracking-wider text-[10px]">Description</span>
              <p className="text-slate-700 mt-0.5">{viewingCategory.description || 'No description provided.'}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Subcategories</span>
                <p className="text-base font-bold text-slate-900">{viewingCategory.subcategory_count ?? 0}</p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Products</span>
                <p className="text-base font-bold text-slate-900">{viewingCategory.product_count ?? 0}</p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Status</span>
                <div className="mt-1">
                  <Badge tone={viewingCategory.status === 'ACTIVE' ? 'green' : 'slate'}>{viewingCategory.status}</Badge>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-3">
              <Button variant="secondary" onClick={() => setViewingCategory(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
