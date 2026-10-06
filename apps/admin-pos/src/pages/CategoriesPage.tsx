import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Spinner, TextArea, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Category } from '../lib/types'

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function load() {
    api.get('/categories').then((res) => setCategories(res.data.categories))
  }

  useEffect(load, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/categories', { name, description })
      setShowForm(false)
      setName('')
      setDescription('')
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create category'))
    } finally {
      setSubmitting(false)
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
        actions={<Button onClick={() => setShowForm(true)}>+ New Category</Button>}
      />

      {categories === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Subcategories</th>
                <th className="px-5 py-3 font-medium">Products</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">{c.name}</p>
                    {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{c.subcategory_count ?? 0}</td>
                  <td className="px-5 py-3 text-slate-600">{c.product_count ?? 0}</td>
                  <td className="px-5 py-3">
                    <Badge tone={c.status === 'ACTIVE' ? 'green' : 'slate'}>{c.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => toggleStatus(c)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                      {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">
                    No categories yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <Modal title="New Category" onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Toys" />
            <TextArea
              label="Description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Category'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
