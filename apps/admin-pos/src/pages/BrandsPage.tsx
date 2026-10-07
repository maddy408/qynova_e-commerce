import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Card, Modal, PageHeader, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Brand, Category } from '../lib/types'

export function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([api.get('/brands'), api.get('/categories')])
      .then(([brandRes, catRes]) => {
        setBrands(brandRes.data.brands || [])
        setCategories(catRes.data.categories || [])
      })
      .catch((err) => setError(apiErrorMessage(err, 'Could not load brands')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  function openCreateModal() {
    setEditingBrand(null)
    setName('')
    setDescription('')
    setSelectedCategoryIds([])
    setError('')
    setShowModal(true)
  }

  function openEditModal(b: Brand) {
    setEditingBrand(b)
    setName(b.name)
    setDescription(b.description || '')
    setSelectedCategoryIds(b.category_ids || [])
    setError('')
    setShowModal(true)
  }

  function toggleCategory(id: number) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    setError('')

    try {
      if (editingBrand) {
        await api.put(`/brands/${editingBrand.id}`, {
          name: name.trim(),
          description: description.trim() || null,
          category_ids: selectedCategoryIds,
        })
      } else {
        await api.post('/brands', {
          name: name.trim(),
          description: description.trim() || null,
          category_ids: selectedCategoryIds,
        })
      }
      setShowModal(false)
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save brand'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this brand?')) return
    try {
      await api.delete(`/brands/${id}`)
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to delete brand'))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Brands & Category Mapping"
        description="Manage product brands and link brands to one or multiple catalog categories"
        actions={
          <Button onClick={openCreateModal}>
            + New Brand
          </Button>
        }
      />

      {error && <Alert>{error}</Alert>}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading brands…</div>
        ) : brands.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No brands created yet. Click "+ New Brand" above to add one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Brand Name</th>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold">Mapped Categories</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {brands.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-bold text-slate-900">{b.name}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                      {b.description || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {b.categories && b.categories.length > 0 ? (
                          b.categories.map((cat) => (
                            <span
                              key={cat.id}
                              className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700"
                            >
                              {cat.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">All / Unmapped</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditModal(b)}
                          className="rounded px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(b.id)}
                          className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <Modal
          title={editingBrand ? `Edit Brand: ${editingBrand.name}` : 'New Brand & Category Mapping'}
          onClose={() => setShowModal(false)}
          width="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <TextField
              label="Brand Name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nike, Nestle, Amul"
            />

            <TextField
              label="Description (Optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short brand overview"
            />

            <div>
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Map to Categories (Select all that apply)
              </span>
              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                {categories.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-white cursor-pointer transition"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(c.id)}
                      onChange={() => toggleCategory(c.id)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-medium">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : editingBrand ? 'Update Brand' : 'Create Brand'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
