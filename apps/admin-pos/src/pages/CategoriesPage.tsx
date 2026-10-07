import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EyeIcon, ImageIcon, PencilIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Badge, Button, Card, Modal, PageHeader, Spinner, TextArea, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Category } from '../lib/types'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '')

function imageUrl(path: string | null) {
  return path ? `${API_ORIGIN}/${path}` : null
}

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [viewingCategory, setViewingCategory] = useState<Category | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Image: a newly-picked file is staged client-side and only uploaded
  // after the category row exists (create) or directly on edit (row already
  // exists). `imageRemoved` tracks an explicit "Remove Image" on edit.
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageRemoved, setImageRemoved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function load() {
    api.get('/categories').then((res) => setCategories(res.data.categories))
  }

  useEffect(load, [])

  function resetImageState() {
    setImageFile(null)
    setImagePreview(null)
    setImageRemoved(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  function openCreateModal() {
    setName('')
    setDescription('')
    setError('')
    resetImageState()
    setShowForm(true)
  }

  function openEditModal(c: Category) {
    setEditingCategory(c)
    setName(c.name)
    setDescription(c.description ?? '')
    setError('')
    resetImageState()
  }

  function closeModals() {
    setShowForm(false)
    setEditingCategory(null)
    resetImageState()
  }

  function pickImage(file: File | undefined) {
    if (!file) return
    setImageFile(file)
    setImageRemoved(false)
    setImagePreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      let categoryId: number
      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, { name, description })
        categoryId = editingCategory.id
      } else {
        const res = await api.post('/categories', { name, description })
        categoryId = res.data.id
      }

      if (imageFile) {
        const formData = new FormData()
        formData.append('file', imageFile)
        await api.post(`/categories/${categoryId}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else if (imageRemoved) {
        await api.delete(`/categories/${categoryId}/image`)
      }

      closeModals()
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
                <th className="px-4 py-2.5 font-semibold">Image</th>
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
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                      {imageUrl(c.thumb_path ?? c.image_path) ? (
                        <img src={imageUrl(c.thumb_path ?? c.image_path)!} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  </td>
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
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
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
        <Modal title={editingCategory ? `Edit Category: ${editingCategory.name}` : 'New Category'} onClose={closeModals}>
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

            <div className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Category Image</span>
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {imagePreview || (editingCategory && !imageRemoved && imageUrl(editingCategory.image_path)) ? (
                    <img
                      src={imagePreview ?? imageUrl(editingCategory!.image_path)!}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
                      {imagePreview || (editingCategory && !imageRemoved && editingCategory.image_path) ? 'Change Image' : 'Upload Image'}
                    </Button>
                    {(imagePreview || (editingCategory && !imageRemoved && editingCategory.image_path)) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setImageFile(null)
                          setImagePreview(null)
                          setImageRemoved(true)
                          if (fileInput.current) fileInput.current.value = ''
                        }}
                      >
                        Remove Image
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Supported: JPG, JPEG, PNG, WEBP • Images are automatically optimized and stored as WEBP
                  </p>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => pickImage(e.target.files?.[0])}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={closeModals}>
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
            <div className="h-28 w-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {imageUrl(viewingCategory.image_path) ? (
                <img src={imageUrl(viewingCategory.image_path)!} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-300">
                  <ImageIcon className="h-8 w-8" />
                </div>
              )}
            </div>
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
