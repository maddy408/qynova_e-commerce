import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EyeIcon, ImageIcon, PencilIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Button, Modal, Spinner } from '../components/ui'
import { api, apiErrorMessage, getApiOrigin } from '../lib/api'
import type { Category, Subcategory } from '../lib/types'

const API_ORIGIN = getApiOrigin()

function imageUrl(path: string | null) {
  return path ? `${API_ORIGIN}/${path}` : null
}

export function SubcategoriesPage() {
  const [subcategories, setSubcategories] = useState<Subcategory[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingSubcategory, setEditingSubcategory] = useState<Subcategory | null>(null)
  const [viewingSubcategory, setViewingSubcategory] = useState<Subcategory | null>(null)

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')

  // Top 5 Sub-categories Management State (T14)
  const [topSubcategoryIds, setTopSubcategoryIds] = useState<number[]>([])
  const [savingTop, setSavingTop] = useState(false)
  const [topSuccessMessage, setTopSuccessMessage] = useState('')
  const [topErrorMessage, setTopErrorMessage] = useState('')

  const [name, setName] = useState('')
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageRemoved, setImageRemoved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function load() {
    api.get('/subcategories').then((res) => {
      const subs: Subcategory[] = res.data.subcategories ?? []
      setSubcategories(subs)
      const activeSubs = subs.filter((s) => s.status === 'ACTIVE')
      const sorted = [...activeSubs].sort((a, b) => (Number(a.sort_order) || 999) - (Number(b.sort_order) || 999))
      setTopSubcategoryIds(sorted.slice(0, 5).map((s) => s.id))
    })
    api.get('/categories').then((res) => setCategories(res.data.categories ?? []))
  }

  useEffect(load, [])

  function moveTopSubcategory(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= topSubcategoryIds.length) return
    const next = [...topSubcategoryIds]
    const temp = next[index]
    next[index] = next[targetIndex]
    next[targetIndex] = temp
    setTopSubcategoryIds(next)
    setTopSuccessMessage('')
    setTopErrorMessage('')
  }

  function replaceTopSubcategory(index: number, newId: number) {
    if (!newId) return
    const next = [...topSubcategoryIds]
    const existingIndex = next.indexOf(newId)
    if (existingIndex !== -1) {
      next[existingIndex] = next[index]
    }
    next[index] = newId
    setTopSubcategoryIds(next)
    setTopSuccessMessage('')
    setTopErrorMessage('')
  }

  function removeTopSubcategory(index: number) {
    setTopSubcategoryIds((prev) => prev.filter((_, i) => i !== index))
    setTopSuccessMessage('')
    setTopErrorMessage('')
  }

  function addTopSubcategory(newId: number) {
    if (!newId || topSubcategoryIds.includes(newId) || topSubcategoryIds.length >= 5) return
    setTopSubcategoryIds((prev) => [...prev, newId])
    setTopSuccessMessage('')
    setTopErrorMessage('')
  }

  async function saveTopSubcategories() {
    if (!subcategories) return
    setSavingTop(true)
    setTopSuccessMessage('')
    setTopErrorMessage('')
    try {
      const remainingIds = subcategories
        .filter((s) => !topSubcategoryIds.includes(s.id))
        .map((s) => s.id)
      const ordered_ids = [...topSubcategoryIds, ...remainingIds]
      await api.put('/subcategories/reorder', { ordered_ids })
      setTopSuccessMessage('Top 5 sub-categories order saved successfully! The storefront homepage is updated.')
      load()
    } catch (err) {
      setTopErrorMessage(apiErrorMessage(err, 'Failed to save Top 5 sub-categories ordering'))
    } finally {
      setSavingTop(false)
    }
  }

  function categoryNames(ids: number[] | undefined) {
    if (!ids || ids.length === 0) return []
    return ids
      .map((id) => categories.find((c) => c.id === id)?.name)
      .filter(Boolean) as string[]
  }

  function resetImageState() {
    setImageFile(null)
    setImagePreview(null)
    setImageRemoved(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  function openCreateModal() {
    setName('')
    setCategoryIds([])
    setError('')
    resetImageState()
    setShowForm(true)
  }

  function openEditModal(s: Subcategory) {
    setEditingSubcategory(s)
    setName(s.name)
    setCategoryIds(s.category_ids ?? [])
    setError('')
    resetImageState()
  }

  function closeModals() {
    setShowForm(false)
    setEditingSubcategory(null)
    resetImageState()
  }

  function pickImage(file: File | undefined) {
    if (!file) return
    setImageFile(file)
    setImageRemoved(false)
    setImagePreview(URL.createObjectURL(file))
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
      let subcategoryId: number
      if (editingSubcategory) {
        await api.put(`/subcategories/${editingSubcategory.id}`, { name, category_ids: categoryIds })
        subcategoryId = editingSubcategory.id
      } else {
        const res = await api.post('/subcategories', { name, category_ids: categoryIds })
        subcategoryId = res.data.id
      }

      if (imageFile) {
        const formData = new FormData()
        formData.append('file', imageFile)
        await api.post(`/subcategories/${subcategoryId}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else if (imageRemoved) {
        await api.delete(`/subcategories/${subcategoryId}/image`)
      }

      closeModals()
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

  // Filtered subcategories
  const filteredSubcategories = (subcategories ?? []).filter((s) => {
    const matchesSearch =
      !searchQuery.trim() ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.slug && s.slug.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && s.status === 'ACTIVE') ||
      (statusFilter === 'INACTIVE' && s.status === 'INACTIVE')
    const matchesCategory =
      categoryFilter === 'ALL' || (s.category_ids && s.category_ids.includes(Number(categoryFilter)))

    return matchesSearch && matchesStatus && matchesCategory
  })

  const activeSubcategories = (subcategories ?? []).filter((s) => s.status === 'ACTIVE')
  const availableToAddSubcategories = activeSubcategories.filter((s) => !topSubcategoryIds.includes(s.id))

  return (
    <div className="space-y-6 pb-12">
      {/* ================= TOP 5 SUB-CATEGORIES (HOME PAGE) MANAGEMENT SECTION ================= */}
      {subcategories !== null && (
        <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
          {/* Card Header */}
          <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-white via-[#FAF2F4]/40 to-white">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#804652] text-white text-xs font-bold shadow-xs">
                  ★
                </span>
                <h3 className="text-xl font-bold text-slate-950">Top 5 Sub-categories (Home Page)</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-[#FAF2F4] text-[#804652] border border-[#E8CCD1] text-xs font-bold">
                  {topSubcategoryIds.length} / 5 Slots
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 font-medium max-w-2xl">
                Configure the top sub-categories featured on the customer storefront homepage. Rank from #1 (primary / leftmost) to #5. Use Move Up/Down or slot dropdowns to reorder, then save your changes.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={saveTopSubcategories}
                disabled={savingTop || topSubcategoryIds.length === 0}
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
            {activeSubcategories.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 font-medium">
                No active subcategories available. Please create or activate subcategories below first.
              </div>
            ) : (
              <div className="divide-y divide-[#F2E5E7]">
                {topSubcategoryIds.map((subId, index) => {
                  const sub = subcategories?.find((s) => s.id === subId)
                  const parentNames = categoryNames(sub?.category_ids)
                  const isPrimary = index === 0

                  return (
                    <div
                      key={subId}
                      className={`px-5 py-3.5 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-3.5 transition-colors ${
                        isPrimary
                          ? 'bg-gradient-to-r from-[#FAF2F4]/70 via-[#FAF2F4]/30 to-white'
                          : 'hover:bg-[#FAF2F4]/30'
                      }`}
                    >
                      {/* Left: Rank & Subcategory Info */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {/* Rank indicator */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black shadow-2xs ${
                              isPrimary
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
                          {imageUrl(sub?.thumb_path ?? sub?.image_path ?? null) ? (
                            <img
                              src={imageUrl(sub?.thumb_path ?? sub?.image_path ?? null)!}
                              alt={sub?.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xs font-black text-[#804652]">
                              {sub ? sub.name.slice(0, 2).toUpperCase() : 'SC'}
                            </span>
                          )}
                        </div>

                        {/* Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs font-bold text-slate-900 truncate">
                              {sub ? sub.name : `Subcategory #${subId}`}
                            </h4>
                            {parentNames.length > 0 && (
                              <span className="inline-block text-[10px] font-bold text-[#804652] bg-[#FAF2F4] px-2 py-0.5 rounded-full border border-[#EEDDE0] truncate max-w-[140px]">
                                {parentNames.join(', ')}
                              </span>
                            )}
                            <span className="text-[11px] font-medium text-slate-500">
                              • {sub?.product_count ?? 0} {sub?.product_count === 1 ? 'Product' : 'Products'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono truncate">
                            /{sub?.slug ?? ''}
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
                            value={subId}
                            onChange={(e) => replaceTopSubcategory(index, Number(e.target.value))}
                            aria-label={`Replace Subcategory Rank ${index + 1}`}
                            className="w-48 sm:w-56 text-xs font-semibold rounded-xl border border-[#E5D5D8] bg-white px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#804652] transition-all cursor-pointer shadow-2xs hover:border-[#804652]"
                          >
                            {activeSubcategories.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} {topSubcategoryIds.includes(s.id) && s.id !== subId ? `(Rank #${topSubcategoryIds.indexOf(s.id) + 1})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Reorder Buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveTopSubcategory(index, 'up')}
                            title="Move subcategory up"
                            aria-label={`Move subcategory ${sub?.name ?? ''} up`}
                            className="w-7 h-7 rounded-lg border border-[#E8CCD1] bg-white text-slate-700 hover:bg-[#FAF2F4] hover:text-[#804652] disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            disabled={index === topSubcategoryIds.length - 1}
                            onClick={() => moveTopSubcategory(index, 'down')}
                            title="Move subcategory down"
                            aria-label={`Move subcategory ${sub?.name ?? ''} down`}
                            className="w-7 h-7 rounded-lg border border-[#E8CCD1] bg-white text-slate-700 hover:bg-[#FAF2F4] hover:text-[#804652] disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTopSubcategory(index)}
                            title="Remove from top 5"
                            aria-label={`Remove subcategory ${sub?.name ?? ''} from top 5`}
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

                {/* Add slot row if fewer than 5 active subcategories in top list and more active subcategories exist */}
                {topSubcategoryIds.length < 5 && availableToAddSubcategories.length > 0 && (
                  <div className="px-5 py-3.5 sm:px-6 bg-[#FAF2F4]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-dashed border-[#E8CCD1]">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-[#804652]/40 bg-white text-[#804652] text-xs font-black">
                        +{topSubcategoryIds.length + 1}
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          Add Next Slot (Rank #{topSubcategoryIds.length + 1})
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium">
                          {availableToAddSubcategories.length} active {availableToAddSubcategories.length === 1 ? 'subcategory' : 'subcategories'} available to add
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) addTopSubcategory(Number(e.target.value))
                        }}
                        aria-label="Add subcategory to next slot"
                        className="w-full sm:w-64 text-xs font-semibold rounded-xl border border-[#E8CCD1] bg-white px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#804652] shadow-2xs cursor-pointer"
                      >
                        <option value="">Select a subcategory to add…</option>
                        {availableToAddSubcategories.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.product_count ?? 0} products)
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
      )}

      {/* ================= ALL SUBCATEGORIES TABLE ================= */}
      {subcategories === null ? (
        <div className="p-12 text-center">
          <Spinner />
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
          {/* Card Header with Filters, Search and New Subcategory Button */}
          <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
            <div>
              <h3 className="text-xl font-bold text-slate-950">All Subcategories</h3>
              <p className="text-xs text-slate-600 mt-0.5 font-medium">
                Showing {filteredSubcategories.length} of {subcategories.length}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Category Filter Select */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-full border border-[#E5D5D8] bg-[#FAF2F4] px-3.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#7B3F4A] transition-all shadow-2xs cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

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
                  placeholder="Search subcategories…"
                  className="rounded-full border border-[#E5D5D8] bg-[#FDFBFB] pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7B3F4A] transition-all w-44 sm:w-52"
                />
              </div>

              {/* + New Subcategory Button */}
              <button
                type="button"
                onClick={openCreateModal}
                disabled={categories.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-all shadow-md active:scale-98 disabled:opacity-50"
              >
                + New Subcategory
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
                <tr>
                  <th className="px-6 py-4">Subcategory</th>
                  <th className="px-6 py-4">Parent Categories</th>
                  <th className="px-6 py-4 text-center">Products</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F6EDEE]">
                {filteredSubcategories.map((s) => {
                  const pNames = categoryNames(s.category_ids)
                  return (
                    <tr key={s.id} className="hover:bg-[#FAF5F6] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3.5">
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[#DCBAC1] bg-[#F3E1E4] shadow-2xs">
                            {imageUrl(s.thumb_path ?? s.image_path) ? (
                              <img
                                src={imageUrl(s.thumb_path ?? s.image_path)!}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[#4A1821]">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{s.name}</p>
                            {s.slug && <p className="text-xs text-slate-600 font-mono font-medium">{s.slug}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {pNames.length > 0 ? (
                            pNames.map((pName, pIdx) => (
                              <span
                                key={pIdx}
                                className="bg-[#F3E1E4] text-[#4A1821] border border-[#DCBAC1] px-3 py-0.5 rounded-full text-xs font-bold inline-block shadow-2xs"
                              >
                                {pName}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 font-bold">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-900 text-sm">
                        {s.product_count ?? 0}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {s.status === 'ACTIVE' ? (
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
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingSubcategory(s)}
                            className="p-2 rounded-lg text-slate-700 hover:bg-[#F3E1E4] hover:text-[#4A1821] transition-colors"
                            title="View Details"
                          >
                            <EyeIcon className="h-4 w-4 stroke-[2]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            className="p-2 rounded-lg text-slate-700 hover:bg-[#F3E1E4] hover:text-[#4A1821] transition-colors"
                            title="Edit Subcategory"
                          >
                            <PencilIcon className="h-4 w-4 stroke-[2]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStatus(s)}
                            className={`p-2 rounded-lg transition-colors ${
                              s.status === 'ACTIVE'
                                ? 'text-emerald-700 hover:bg-emerald-100'
                                : 'text-slate-600 hover:bg-slate-200'
                            }`}
                            title={s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          >
                            <PowerIcon className="h-4 w-4 stroke-[2.5]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(s)}
                            className="p-2 rounded-lg text-rose-600 hover:bg-rose-100 hover:text-rose-800 transition-colors"
                            title="Soft Delete"
                          >
                            <TrashIcon className="h-4 w-4 stroke-[2]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredSubcategories.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      No subcategories match the criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= CREATE / EDIT MODAL ================= */}
      {(showForm || editingSubcategory) && (
        <Modal
          title={editingSubcategory ? `Edit Subcategory: ${editingSubcategory.name}` : 'New Subcategory'}
          onClose={closeModals}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert tone="red">{error}</Alert>}

            {/* Subcategory Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Subcategory Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kids, Hair Clips, Keychains…"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
              />
            </div>

            {/* Parent Categories Multi-Select */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Parent Categories <span className="text-rose-500">*</span>
              </label>
              <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-[#E5D5D8] bg-[#FDFBFB] p-3 text-xs">
                {categories.map((c) => {
                  const checked = categoryIds.includes(c.id)
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer ${
                        checked
                          ? 'bg-[#FAF0F2] border-[#EEDDE0] text-[#7B3F4A] font-bold shadow-2xs'
                          : 'border-transparent text-slate-700 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(c.id)}
                        className="h-4 w-4 rounded border-slate-300 text-[#7B3F4A] focus:ring-[#7B3F4A]"
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Image Uploader Card */}
            <div className="rounded-2xl border-2 border-dashed border-[#EEDDE0] bg-[#FAF5F6]/70 p-4 transition-colors">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#804652] mb-2.5">
                Subcategory Image &amp; Thumbnail
              </label>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-[#EEDDE0] bg-white shadow-2xs flex items-center justify-center">
                  {imagePreview || (editingSubcategory && !imageRemoved && imageUrl(editingSubcategory.image_path)) ? (
                    <img
                      src={imagePreview ?? imageUrl(editingSubcategory!.image_path)!}
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
                      {imagePreview || (editingSubcategory && !imageRemoved && editingSubcategory.image_path)
                        ? 'Change Image'
                        : 'Upload Image'}
                    </button>

                    {(imagePreview || (editingSubcategory && !imageRemoved && editingSubcategory.image_path)) && (
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
                {submitting ? 'Saving…' : editingSubcategory ? 'Save Changes' : 'Create Subcategory'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ================= VIEW MODAL ================= */}
      {viewingSubcategory && (
        <Modal title={`Subcategory Details: ${viewingSubcategory.name}`} onClose={() => setViewingSubcategory(null)}>
          <div className="space-y-4 text-xs">
            <div className="h-28 w-28 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 mx-auto shadow-sm">
              {imageUrl(viewingSubcategory.image_path) ? (
                <img
                  src={imageUrl(viewingSubcategory.image_path)!}
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
              <p className="text-sm font-semibold text-slate-900 mt-0.5">{viewingSubcategory.name}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block uppercase tracking-wider text-[10px]">
                Slug
              </span>
              <p className="font-mono text-[#804652] bg-[#FAF0F2] px-2.5 py-1 rounded-full inline-block mt-0.5 font-semibold">
                {viewingSubcategory.slug}
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block uppercase tracking-wider text-[10px]">
                Parent Categories
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {categoryNames(viewingSubcategory.category_ids).map((cName, cIdx) => (
                  <span
                    key={cIdx}
                    className="bg-[#FAF0F2] text-[#804652] border border-[#F2DFE2] px-2.5 py-0.5 rounded-full font-semibold"
                  >
                    {cName}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-center">
              <div className="bg-[#FAF5F6] p-2.5 rounded-xl border border-[#F2E5E7]">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Products</span>
                <p className="text-base font-bold text-slate-900">{viewingSubcategory.product_count ?? 0}</p>
              </div>
              <div className="bg-[#FAF5F6] p-2.5 rounded-xl border border-[#F2E5E7]">
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Status</span>
                <div className="mt-1">
                  {viewingSubcategory.status === 'ACTIVE' ? (
                    <span className="text-emerald-700 font-bold">● ACTIVE</span>
                  ) : (
                    <span className="text-rose-700 font-bold">● INACTIVE</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-3">
              <button
                type="button"
                onClick={() => setViewingSubcategory(null)}
                className="px-5 py-2 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
