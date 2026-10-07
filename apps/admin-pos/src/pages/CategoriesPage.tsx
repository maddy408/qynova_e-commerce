import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EyeIcon, ImageIcon, PencilIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Button, Modal, Spinner, TextArea, TextField } from '../components/ui'
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

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Image upload state
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

  // Derived statistics
  const totalCount = categories?.length ?? 0
  const activeCount = categories?.filter((c) => c.status === 'ACTIVE').length ?? 0
  const totalSubcategories = categories?.reduce((acc, c) => acc + (c.subcategory_count ?? 0), 0) ?? 0
  const totalProducts = categories?.reduce((acc, c) => acc + (c.product_count ?? 0), 0) ?? 0

  // Filtered categories
  const filteredCategories = (categories ?? []).filter((c) => {
    const matchesSearch =
      !searchQuery.trim() ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.slug.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && c.status === 'ACTIVE') ||
      (statusFilter === 'INACTIVE' && c.status === 'INACTIVE')
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6 pb-12">
      {/* ================= TOP HERO BANNER ("Categories, curated.") ================= */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-sm bg-gradient-to-r from-[#804652] via-[#78404C] to-[#6E3642]">
        {/* Subtle decorative circles background */}
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/5 pointer-events-none blur-xl"></div>
        <div className="absolute right-1/4 -bottom-20 w-80 h-80 rounded-full bg-black/10 pointer-events-none blur-2xl"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-pink-200/90">
              PRODUCT GROUPING
            </span>
            <h2 className="text-3xl lg:text-4xl font-serif font-bold text-white tracking-tight">
              Categories, curated.
            </h2>
            <p className="text-xs sm:text-sm text-pink-100/90 max-w-lg font-light leading-relaxed">
              Top-level product grouping — a product can belong to several, with one marked primary.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-[#7B3F4A] text-xs font-bold uppercase tracking-wider hover:bg-pink-50 transition-all shadow-md active:scale-98"
              >
                + NEW CATEGORY
              </button>
            </div>
          </div>

          {/* 4 Connected Frosted Metric Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15 text-center min-w-[95px] flex flex-col justify-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-pink-200/80 mb-1">CATEGORIES</p>
              <p className="text-2xl lg:text-3xl font-bold font-serif text-white">{totalCount}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15 text-center min-w-[95px] flex flex-col justify-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-pink-200/80 mb-1">ACTIVE</p>
              <p className="text-2xl lg:text-3xl font-bold font-serif text-white">{activeCount}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15 text-center min-w-[95px] flex flex-col justify-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-pink-200/80 mb-1">SUBCATEGORIES</p>
              <p className="text-2xl lg:text-3xl font-bold font-serif text-white">{totalSubcategories}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15 text-center min-w-[95px] flex flex-col justify-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-pink-200/80 mb-1">PRODUCTS</p>
              <p className="text-2xl lg:text-3xl font-bold font-serif text-white">{totalProducts}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ================= MIDDLE CARD: "QUICK VIEW BY CATEGORY" ================= */}
      {categories !== null && categories.length > 0 && (
        <div className="rounded-3xl bg-white p-6 border border-[#F2E5E7] shadow-2xs">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="h-[1px] bg-[#EEDDE0] flex-1 max-w-[140px]"></div>
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#804652]">
              QUICK VIEW BY CATEGORY
            </span>
            <div className="h-[1px] bg-[#EEDDE0] flex-1 max-w-[140px]"></div>
          </div>

          <div className="flex items-center justify-center gap-6 sm:gap-10 overflow-x-auto py-2 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setViewingCategory(cat)}
                className="group flex flex-col items-center gap-2.5 shrink-0 focus:outline-none"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-[#EEDDE0] group-hover:border-[#7B3F4A] group-hover:scale-105 transition-all p-0.5 bg-white shadow-2xs">
                  {imageUrl(cat.thumb_path ?? cat.image_path) ? (
                    <img
                      src={imageUrl(cat.thumb_path ?? cat.image_path)!}
                      alt={cat.name}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-[#FAF2F4] flex items-center justify-center text-[#804652]">
                      <span className="font-bold text-sm">{cat.name.slice(0, 2).toUpperCase()}</span>
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 group-hover:text-[#7B3F4A] transition-colors max-w-[105px] text-center truncate">
                  {cat.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ================= BOTTOM CARD: "ALL CATEGORIES" TABLE ================= */}
      {categories === null ? (
        <div className="p-12 text-center">
          <Spinner />
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
          {/* Card Header with Filters and Search */}
          <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
            <div>
              <h3 className="text-xl font-serif font-bold text-slate-900">All Categories</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {filteredCategories.length} of {categories.length}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Filter Pills (All / Active / Inactive) */}
              <div className="inline-flex items-center gap-1 bg-[#FAF2F4] p-1 rounded-full border border-[#EEDDE0] text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1 rounded-full font-medium transition-all ${
                    statusFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ACTIVE')}
                  className={`px-3 py-1 rounded-full font-medium transition-all ${
                    statusFilter === 'ACTIVE'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('INACTIVE')}
                  className={`px-3 py-1 rounded-full font-medium transition-all ${
                    statusFilter === 'INACTIVE'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Inactive
                </button>
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
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search categories…"
                  className="rounded-full border border-[#E5D5D8] bg-[#FDFBFB] pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7B3F4A] transition-all w-48 sm:w-56"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#F2E5E7] uppercase text-[#8A505D] bg-[#FCF7F8] text-[11px] font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Slug</th>
                  <th className="px-6 py-3.5 text-center">Subcategories</th>
                  <th className="px-6 py-3.5 text-center">Products</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F6EDEE]">
                {filteredCategories.map((c) => (
                  <tr key={c.id} className="hover:bg-[#FAF5F6]/70 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[#EEDDE0] bg-[#FAF2F4] shadow-2xs">
                          {imageUrl(c.thumb_path ?? c.image_path) ? (
                            <img
                              src={imageUrl(c.thumb_path ?? c.image_path)!}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#804652]">
                              <ImageIcon className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{c.name}</p>
                          {c.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-1">{c.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="bg-[#FAF0F2] text-[#804652] px-2.5 py-1 rounded-full text-[11px] font-mono inline-block">
                        {c.slug}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-center font-medium text-slate-700">
                      {c.subcategory_count ?? 0}
                    </td>
                    <td className="px-6 py-3.5 text-center font-medium text-slate-700">
                      {c.product_count ?? 0}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      {c.status === 'ACTIVE' ? (
                        <span className="bg-[#EAF7EE] text-[#16A34A] border border-[#D0F0D8] font-bold text-[10px] px-3 py-1 rounded-full inline-flex items-center gap-1.5 uppercase tracking-wider">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]"></span>
                          ACTIVE
                        </span>
                      ) : (
                        <span className="bg-[#FDF0F2] text-[#E11D48] border border-[#FCD9E0] font-bold text-[10px] px-3 py-1 rounded-full inline-flex items-center gap-1.5 uppercase tracking-wider">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#E11D48]"></span>
                          INACTIVE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingCategory(c)}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-[#FAF2F4] hover:text-[#7B3F4A] transition-colors"
                          title="View Details"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(c)}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-[#FAF2F4] hover:text-[#7B3F4A] transition-colors"
                          title="Edit Category"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStatus(c)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            c.status === 'ACTIVE'
                              ? 'text-emerald-600 hover:bg-emerald-50'
                              : 'text-slate-400 hover:bg-slate-100'
                          }`}
                          title={c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        >
                          <PowerIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Soft Delete"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCategories.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      No categories match the criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= CREATE / EDIT MODAL ================= */}
      {(showForm || editingCategory) && (
        <Modal
          title={editingCategory ? `Edit Category: ${editingCategory.name}` : 'New Category'}
          onClose={closeModals}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert tone="red">{error}</Alert>}
            <TextField
              label="Name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Toys"
            />
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
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-50">
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
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInput.current?.click()}
                    >
                      {imagePreview || (editingCategory && !imageRemoved && editingCategory.image_path)
                        ? 'Change Image'
                        : 'Upload Image'}
                    </Button>
                    {(imagePreview ||
                      (editingCategory && !imageRemoved && editingCategory.image_path)) && (
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

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
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

      {/* ================= VIEW MODAL ================= */}
      {viewingCategory && (
        <Modal title={`Category Details: ${viewingCategory.name}`} onClose={() => setViewingCategory(null)}>
          <div className="space-y-4 text-xs">
            <div className="h-28 w-28 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 mx-auto shadow-sm">
              {imageUrl(viewingCategory.image_path) ? (
                <img
                  src={imageUrl(viewingCategory.image_path)!}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-300">
                  <ImageIcon className="h-8 w-8" />
                </div>
              )}
            </div>
            <div>
              <span className="font-semibold text-slate-500 block uppercase tracking-wider text-[10px]">
                Name
              </span>
              <p className="text-sm font-semibold text-slate-900 mt-0.5">{viewingCategory.name}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block uppercase tracking-wider text-[10px]">
                Slug
              </span>
              <p className="font-mono text-[#804652] bg-[#FAF0F2] px-2.5 py-1 rounded-full inline-block mt-0.5 font-semibold">
                {viewingCategory.slug}
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block uppercase tracking-wider text-[10px]">
                Description
              </span>
              <p className="text-slate-700 mt-0.5">
                {viewingCategory.description || 'No description provided.'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
              <div className="bg-[#FAF5F6] p-2.5 rounded-xl border border-[#F2E5E7]">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Subcategories</span>
                <p className="text-base font-bold text-slate-900">{viewingCategory.subcategory_count ?? 0}</p>
              </div>
              <div className="bg-[#FAF5F6] p-2.5 rounded-xl border border-[#F2E5E7]">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Products</span>
                <p className="text-base font-bold text-slate-900">{viewingCategory.product_count ?? 0}</p>
              </div>
              <div className="bg-[#FAF5F6] p-2.5 rounded-xl border border-[#F2E5E7]">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Status</span>
                <div className="mt-1">
                  {viewingCategory.status === 'ACTIVE' ? (
                    <span className="text-emerald-700 font-bold">● ACTIVE</span>
                  ) : (
                    <span className="text-rose-700 font-bold">● INACTIVE</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-3">
              <Button variant="secondary" onClick={() => setViewingCategory(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
