import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Category, Subcategory } from '../lib/types'

export function SubcategoriesPage() {
  const [subcategories, setSubcategories] = useState<Subcategory[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [showForm, setShowForm] = useState(false)
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
      await api.post('/subcategories', { name, category_ids: categoryIds })
      setShowForm(false)
      setName('')
      setCategoryIds([])
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create subcategory'))
    } finally {
      setSubmitting(false)
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
          <Button onClick={() => setShowForm(true)} disabled={categories.length === 0}>
            + New Subcategory
          </Button>
        }
      />

      {subcategories === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Parent Categories</th>
                <th className="px-5 py-3 font-medium">Products</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subcategories.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3 font-medium text-slate-900">{s.name}</td>
                  <td className="px-5 py-3 text-slate-600">{categoryNames(s.category_ids)}</td>
                  <td className="px-5 py-3 text-slate-600">{s.product_count ?? 0}</td>
                  <td className="px-5 py-3">
                    <Badge tone={s.status === 'ACTIVE' ? 'green' : 'slate'}>{s.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => toggleStatus(s)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                      {s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {subcategories.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">
                    No subcategories yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <Modal title="New Subcategory" onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kids" />
            <div>
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Parent Categories <span className="text-red-500">*</span>
              </span>
              <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(c.id)}
                      onChange={() => toggleCategory(c.id)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Subcategory'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
