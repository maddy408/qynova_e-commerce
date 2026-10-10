import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EyeIcon, ImageIcon, PencilIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Button, Modal, Spinner } from '../components/ui'
import { api, apiErrorMessage, getApiOrigin } from '../lib/api'
import type { Category } from '../lib/types'

const API_ORIGIN = getApiOrigin()

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

  // Top 5 Categories Management State (T13)
  const [topCategoryIds, setTopCategoryIds] = useState<number[]>([])
  const [savingTop, setSavingTop] = useState(false)
  const [topSuccessMessage, setTopSuccessMessage] = useState('')
  const [topErrorMessage, setTopErrorMessage] = useState('')

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
    api.get('/categories', { params: { sort: 'sort_order' } }).then((res) => {
      const cats: Category[] = res.data.categories ?? []
      setCategories(cats)
      // Initialize Top 5 IDs from active categories sorted by sort_order
      const activeCats = cats.filter((c) => c.status === 'ACTIVE')
      const sorted = [...activeCats].sort((a, b) => (Number(a.sort_order) || 999) - (Number(b.sort_order) || 999))
      setTopCategoryIds(sorted.slice(0, 5).map((c) => c.id))
    })
  }

  useEffect(load, [])

  function moveTopCategory(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= topCategoryIds.length) return
    const next = [...topCategoryIds]
    const temp = next[index]
    next[index] = next[targetIndex]
    next[targetIndex] = temp
    setTopCategoryIds(next)
    setTopSuccessMessage('')
    setTopErrorMessage('')
  }

  function replaceTopCategory(index: number, newId: number) {
    if (!newId) return
    const next = [...topCategoryIds]
    // If the category is already chosen in another slot, swap them
    const existingIndex = next.indexOf(newId)
    if (existingIndex !== -1) {
      next[existingIndex] = next[index]
    }
    next[index] = newId
    setTopCategoryIds(next)
    setTopSuccessMessage('')
    setTopErrorMessage('')
  }

  function removeTopCategory(index: number) {
    setTopCategoryIds((prev) => prev.filter((_, i) => i !== index))
    setTopSuccessMessage('')
    setTopErrorMessage('')
  }

  function addTopCategory(newId: number) {
    if (!newId || topCategoryIds.includes(newId) || topCategoryIds.length >= 5) return
    setTopCategoryIds((prev) => [...prev, newId])
    setTopSuccessMessage('')
    setTopErrorMessage('')
  }

  async function saveTopCategories() {
    if (!categories) return
    setSavingTop(true)
    setTopSuccessMessage('')
    setTopErrorMessage('')
    try {
      // Top 5 come first (rank 1..N), followed by any remaining categories
      const remainingIds = categories
        .filter((c) => !topCategoryIds.includes(c.id))
        .map((c) => c.id)
      const ordered_ids = [...topCategoryIds, ...remainingIds]
      await api.put('/categories/reorder', { ordered_ids })
      setTopSuccessMessage('Top 5 categories order saved successfully! The storefront homepage is updated.')
      load()
    } catch (err) {
      setTopErrorMessage(apiErrorMessage(err, 'Failed to save Top 5 categories ordering'))
    } finally {
      setSavingTop(false)
    }
  }

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

  const activeCategories = (categories ?? []).filter((c) => c.status === 'ACTIVE')
  const availableToAdd = activeCategories.filter((c) => !topCategoryIds.includes(c.id))

  return (
    <div className="space-y-6 pb-12">
      {categories === null ? (
        <div className="p-12 text-center">
          <Spinner />
        </div>
      ) : (
        <>
          {/* ================= TOP 5 CATEGORIES (HOME PAGE) MANAGEMENT SECTION ================= */}
          <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
            {/* Card Header */}
            <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-white via-[#FAF2F4]/40 to-white">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#804652] text-white text-xs font-bold shadow-xs">
                    ★
                  </span>
                  <h3 className="text-xl font-bold text-slate-950">Top 5 Categories (Home Page)</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FAF2F4] text-[#804652] border border-[#E8CCD1] text-xs font-bold">
                    {topCategoryIds.length} / 5 Slots
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 font-medium max-w-2xl">
                  Configure the top categories displayed on the customer storefront homepage. Rank from #1 (primary / leftmost) to #5. Use Move Up/Down or slot dropdowns to reorder, then save your changes.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  onClick={saveTopCategories}
                  disabled={savingTop || topCategoryIds.length === 0}
                  className="bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-full hover:opacity-95 shadow-md active:scale-98 disabled:opacity-50"
                >
                  {savingTop ? (
                    <div className="flex items-center gap-2">
                      <Spinner className="h-3.5 w-3.5 text-white" />
                      <span>Saving Order…</span>
                    </div>
                  ) : (
                    <span>Save Top 5 Order</span>
                  )}
                </Button>
              </div>
            </div>

            {/* Feedback alerts */}
            {topSuccessMessage && (
              <div className="mx-5 sm:mx-6 mt-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">✓</span>
                  <span>{topSuccessMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTopSuccessMessage('')}
                  className="text-emerald-600 hover:text-emerald-800 font-bold px-2 py-0.5 rounded"
                >
                  ✕
                </button>
              </div>
            )}

            {topErrorMessage && (
              <div className="mx-5 sm:mx-6 mt-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold">!</span>
                  <span>{topErrorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTopErrorMessage('')}
                  className="text-rose-600 hover:text-rose-800 font-bold px-2 py-0.5 rounded"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Compact Rows List */}
            <div>
              {activeCategories.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 font-medium">
                  No active categories available. Please create or activate categories below first.
                </div>
              ) : (
                <div className="divide-y divide-[#F2E5E7]">
                  {topCategoryIds.map((catId, index) => {
                    const cat = categories?.find((c) => c.id === catId)
                    const isPrimary = index === 0

                    return (
                      <div
                        key={catId}
                        className={`px-5 py-3.5 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-3.5 transition-colors ${isPrimary
                          ? 'bg-gradient-to-r from-[#FAF2F4]/70 via-[#FAF2F4]/30 to-white'
                          : 'hover:bg-[#FAF2F4]/30'
                          }`}
                      >
                        {/* Left: Rank & Category Info */}
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          {/* Rank indicator */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black shadow-2xs ${isPrimary
                                ? 'bg-[#804652] text-white ring-2 ring-[#804652]/20'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                            >
                              #{index + 1}
                            </span>
                            {isPrimary ? (
                              <span className="px-2 py-0.5 rounded-full bg-[#FAF2F4] text-[#804652] border border-[#E8CCD1] text-[10px] font-black uppercase tracking-wider">
                                Primary
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
                                Rank {index + 1}
                              </span>
                            )}
                          </div>

                          {/* Thumbnail */}
                          <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#E8CCD1] bg-[#FAF2F4] shrink-0 flex items-center justify-center shadow-2xs">
                            {cat?.image_path ? (
                              <img
                                src={imageUrl(cat.image_path) ?? ''}
                                alt={cat.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-black text-[#804652]">
                                {cat ? cat.name.slice(0, 2).toUpperCase() : '✨'}
                              </span>
                            )}
                          </div>

                          {/* Details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-slate-900 truncate">
                                {cat ? cat.name : `Category #${catId}`}
                              </h4>
                              <span className="text-[11px] font-medium text-slate-500">
                                • {cat?.product_count ?? 0} {cat?.product_count === 1 ? 'Product' : 'Products'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono truncate">
                              /{cat?.slug ?? ''}
                            </p>
                          </div>
                        </div>

                        {/* Right: Swap Dropdown & Controls */}
                        <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                          {/* Swap Selector */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden lg:inline">
                              Replace:
                            </span>
                            <select
                              value={catId}
                              onChange={(e) => replaceTopCategory(index, Number(e.target.value))}
                              aria-label={`Replace Category Rank ${index + 1}`}
                              className="w-48 sm:w-56 text-xs font-semibold rounded-xl border border-[#E5D5D8] bg-white px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#804652] transition-all cursor-pointer shadow-2xs hover:border-[#804652]"
                            >
                              {activeCategories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} {topCategoryIds.includes(c.id) && c.id !== catId ? `(Rank #${topCategoryIds.indexOf(c.id) + 1})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Reorder Buttons */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveTopCategory(index, 'up')}
                              title="Move category up"
                              aria-label={`Move category ${cat?.name ?? ''} up`}
                              className="w-7 h-7 rounded-lg border border-[#E8CCD1] bg-white text-slate-700 hover:bg-[#FAF2F4] hover:text-[#804652] disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              disabled={index === topCategoryIds.length - 1}
                              onClick={() => moveTopCategory(index, 'down')}
                              title="Move category down"
                              aria-label={`Move category ${cat?.name ?? ''} down`}
                              className="w-7 h-7 rounded-lg border border-[#E8CCD1] bg-white text-slate-700 hover:bg-[#FAF2F4] hover:text-[#804652] disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeTopCategory(index)}
                              title="Remove from top 5"
                              aria-label={`Remove category ${cat?.name ?? ''} from top 5`}
                              className="w-7 h-7 rounded-lg border border-transparent text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Add slot row if fewer than 5 active categories in top list and more active categories exist */}
                  {topCategoryIds.length < 5 && availableToAdd.length > 0 && (
                    <div className="px-5 py-3.5 sm:px-6 bg-[#FAF2F4]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-dashed border-[#E8CCD1]">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-[#804652]/40 bg-white text-[#804652] text-xs font-black">
                          +{topCategoryIds.length + 1}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-800">
                            Add Next Slot (Rank #{topCategoryIds.length + 1})
                          </p>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {availableToAdd.length} active {availableToAdd.length === 1 ? 'category' : 'categories'} available to add
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) addTopCategory(Number(e.target.value))
                          }}
                          aria-label="Add category to next slot"
                          className="w-full sm:w-64 text-xs font-semibold rounded-xl border border-[#E8CCD1] bg-white px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#804652] shadow-2xs cursor-pointer"
                        >
                          <option value="">Select a category to add…</option>
                          {availableToAdd.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.product_count ?? 0} products)
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ================= ALL CATEGORIES TABLE ================= */}
          <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
            {/* Card Header with Filters, Search and New Category Button */}
            <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
              <div>
                <h3 className="text-xl font-bold text-slate-950">All Categories</h3>
                <p className="text-xs text-slate-600 mt-0.5 font-medium">
                  Showing {filteredCategories.length} of {categories.length}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Filter Pills (All / Active / Inactive) */}
                <div className="inline-flex items-center gap-1 bg-[#FAF2F4] p-1 rounded-full border border-[#EEDDE0] text-xs shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-3 py-1 rounded-full font-medium transition-all ${statusFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ACTIVE')}
                    className={`px-3 py-1 rounded-full font-medium transition-all ${statusFilter === 'ACTIVE'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('INACTIVE')}
                    className={`px-3 py-1 rounded-full font-medium transition-all ${statusFilter === 'INACTIVE'
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
                    className="rounded-full border border-[#E5D5D8] bg-[#FDFBFB] pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7B3F4A] transition-all w-44 sm:w-52"
                  />
                </div>

                {/* + New Category Button */}
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-all shadow-md active:scale-98"
                >
                  + New Category
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Slug</th>
                    <th className="px-6 py-4 text-center">Subcategories</th>
                    <th className="px-6 py-4 text-center">Products</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E0E3]">
                  {filteredCategories.map((c) => (
                    <tr key={c.id} className="hover:bg-[#FAF2F4]/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-[#E2CBD0] bg-[#FAF2F4] shadow-2xs">
                            {imageUrl(c.thumb_path ?? c.image_path) ? (
                              <img
                                src={imageUrl(c.thumb_path ?? c.image_path)!}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[#4A1821]">
                                <ImageIcon className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-950 text-sm">{c.name}</p>
                            {c.description && (
                              <p className="text-xs text-slate-600 font-medium line-clamp-1">{c.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-[#F3E1E4] text-[#4A1821] border border-[#DCBAC1] px-3 py-1 rounded-full text-xs font-mono font-bold inline-block shadow-2xs">
                          {c.slug}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-900 text-sm">
                        {c.subcategory_count ?? 0}
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-900 text-sm">
                        {c.product_count ?? 0}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {c.status === 'ACTIVE' ? (
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
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setViewingCategory(c)}
                            className="p-2 rounded-lg text-slate-700 hover:bg-[#F3E1E4] hover:text-[#4A1821] transition-colors"
                            title="View Details"
                          >
                            <EyeIcon className="h-4 w-4 stroke-[2]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            className="p-2 rounded-lg text-slate-700 hover:bg-[#F3E1E4] hover:text-[#4A1821] transition-colors"
                            title="Edit Category"
                          >
                            <PencilIcon className="h-4 w-4 stroke-[2]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStatus(c)}
                            className={`p-2 rounded-lg transition-colors ${c.status === 'ACTIVE'
                              ? 'text-emerald-700 hover:bg-emerald-100/70'
                              : 'text-slate-500 hover:bg-slate-200'
                              }`}
                            title={c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          >
                            <PowerIcon className="h-4 w-4 stroke-[2]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            className="p-2 rounded-lg text-rose-600 hover:bg-rose-100 hover:text-rose-800 transition-colors"
                            title="Soft Delete"
                          >
                            <TrashIcon className="h-4 w-4 stroke-[2]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCategories.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-600 font-semibold text-sm">
                        No categories match the criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ================= CREATE / EDIT MODAL ================= */}
      {(showForm || editingCategory) && (
        <Modal
          title={editingCategory ? `Edit Category: ${editingCategory.name}` : 'New Category'}
          onClose={closeModals}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert tone="red">{error}</Alert>}

            {/* Category Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Category Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hair Accessories, Toys, Jewellery…"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Description <span className="text-slate-400 font-normal normal-case">(Optional)</span>
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write a brief description or note about this category…"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs resize-none"
              />
            </div>

            {/* Image Uploader Card */}
            <div className="rounded-2xl border-2 border-dashed border-[#EEDDE0] bg-[#FAF5F6]/70 p-4 transition-colors">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#804652] mb-2.5">
                Category Image &amp; Thumbnail
              </label>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-[#EEDDE0] bg-white shadow-2xs flex items-center justify-center">
                  {imagePreview || (editingCategory && !imageRemoved && imageUrl(editingCategory.image_path)) ? (
                    <img
                      src={imagePreview ?? imageUrl(editingCategory!.image_path)!}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[#804652]/60">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#7B3F4A] text-white text-xs font-semibold hover:bg-[#68333D] transition-all shadow-2xs active:scale-98"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      {imagePreview || (editingCategory && !imageRemoved && editingCategory.image_path)
                        ? 'Change Image'
                        : 'Upload Image'}
                    </button>

                    {(imagePreview || (editingCategory && !imageRemoved && editingCategory.image_path)) && (
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null)
                          setImagePreview(null)
                          setImageRemoved(true)
                          if (fileInput.current) fileInput.current.value = ''
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs font-medium transition-colors"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    JPG, PNG, WEBP supported • Automatically compressed &amp; stored as WebP
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
                {submitting ? 'Saving…' : editingCategory ? 'Save Changes' : 'Create Category'}
              </button>
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
