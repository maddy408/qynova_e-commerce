import { useEffect, useState, useRef, type FormEvent } from 'react'
import { PencilIcon, TrashIcon } from '../components/Icons'
import { Alert, Modal, Spinner } from '../components/ui'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { api, apiErrorMessage } from '../lib/api'
import { env } from '../config/env'
import type { Brand, Category } from '../lib/types'

export function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null)
  const [deletingBrand, setDeletingBrand] = useState<Brand | null>(null)

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [topFilter, setTopFilter] = useState<'ALL' | 'TOP_ONLY'>('ALL')

  // Form states
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([])
  const [isTopBrand, setIsTopBrand] = useState(false)
  const [offerText, setOfferText] = useState('')
  const [sortOrder, setSortOrder] = useState<number>(0)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [removeExistingImage, setRemoveExistingImage] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

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
    setIsTopBrand(false)
    setOfferText('')
    setSortOrder(0)
    setImageFile(null)
    setImagePreview(null)
    setRemoveExistingImage(false)
    setError('')
    setShowModal(true)
  }

  function openEditModal(b: Brand) {
    setEditingBrand(b)
    setName(b.name)
    setDescription(b.description || '')
    setSelectedCategoryIds(b.category_ids || [])
    setIsTopBrand(Boolean(b.is_top_brand))
    setOfferText(b.offer_text || '')
    setSortOrder(b.sort_order || 0)
    setImageFile(null)
    setImagePreview(b.image_path ? `${env.API_ORIGIN}/${b.image_path}` : null)
    setRemoveExistingImage(false)
    setError('')
    setShowModal(true)
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPG, PNG, WEBP)')
      return
    }
    setImageFile(file)
    setRemoveExistingImage(false)
    const reader = new FileReader()
    reader.onload = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  function handleRemoveImage() {
    setImageFile(null)
    setImagePreview(null)
    setRemoveExistingImage(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function toggleCategory(id: number) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  async function handleToggleTopBrand(b: Brand) {
    setTogglingId(b.id)
    try {
      const res = await api.patch(`/brands/${b.id}/toggle-top`)
      const updatedTop = Boolean(res.data.is_top_brand)
      setBrands((prev) =>
        prev.map((item) => (item.id === b.id ? { ...item, is_top_brand: updatedTop } : item))
      )
      setSuccessMessage(
        updatedTop
          ? `"${b.name}" is now featured in Top Brands on Storefront!`
          : `"${b.name}" removed from Top Brands.`
      )
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to toggle top brand status'))
    } finally {
      setTogglingId(null)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    setError('')

    try {
      let brandId: number

      if (editingBrand) {
        await api.put(`/brands/${editingBrand.id}`, {
          name: name.trim(),
          description: description.trim() || null,
          category_ids: selectedCategoryIds,
          is_top_brand: isTopBrand ? 1 : 0,
          offer_text: offerText.trim() || null,
          sort_order: Number(sortOrder) || 0,
        })
        brandId = editingBrand.id
      } else {
        const res = await api.post('/brands', {
          name: name.trim(),
          description: description.trim() || null,
          category_ids: selectedCategoryIds,
          is_top_brand: isTopBrand ? 1 : 0,
          offer_text: offerText.trim() || null,
          sort_order: Number(sortOrder) || 0,
        })
        brandId = res.data.id
      }

      // Handle image upload or removal
      if (imageFile) {
        const formData = new FormData()
        formData.append('file', imageFile)
        await api.post(`/brands/${brandId}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else if (removeExistingImage && editingBrand?.image_path) {
        await api.delete(`/brands/${brandId}/image`)
      }

      setShowModal(false)
      load()
      setSuccessMessage(editingBrand ? 'Brand updated successfully!' : 'Brand created successfully!')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save brand'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!deletingBrand) return
    try {
      await api.delete(`/brands/${deletingBrand.id}`)
      setDeletingBrand(null)
      load()
      setSuccessMessage('Brand deleted successfully.')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to delete brand'))
    }
  }

  // Filtered brands
  const filteredBrands = brands.filter((b) => {
    const matchesSearch =
      !searchQuery.trim() ||
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.description && b.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (b.offer_text && b.offer_text.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesCategory =
      categoryFilter === 'ALL' || (b.category_ids && b.category_ids.includes(Number(categoryFilter)))

    const matchesTop =
      topFilter === 'ALL' || (topFilter === 'TOP_ONLY' && Boolean(b.is_top_brand))

    return matchesSearch && matchesCategory && matchesTop
  })

  const topBrandsCount = brands.filter((b) => Boolean(b.is_top_brand)).length

  return (
    <div className="space-y-6 pb-12">
      {/* Notifications */}
      {successMessage && (
        <Alert tone="green" onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}
      {error && (
        <Alert tone="red" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* ================= ALL BRANDS TABLE CARD ================= */}
      {loading ? (
        <div className="p-12 text-center">
          <Spinner />
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-[var(--color-border-muted)] shadow-2xs overflow-hidden">
          {/* Card Header with Filters, Search and New Brand Button */}
          <div className="p-5 sm:p-6 border-b border-[var(--color-border-muted)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-slate-950">Brands Management</h3>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  <span className="text-amber-500">★</span> {topBrandsCount} Top Brands on Storefront
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 font-medium">
                Showing {filteredBrands.length} of {brands.length} total brands
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Top Brands Tab Filter */}
              <div className="inline-flex rounded-full bg-slate-100 p-1 border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setTopFilter('ALL')}
                  className={`px-3 py-1 rounded-full transition-all ${
                    topFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({brands.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTopFilter('TOP_ONLY')}
                  className={`px-3 py-1 rounded-full flex items-center gap-1 transition-all ${
                    topFilter === 'TOP_ONLY'
                      ? 'bg-amber-500 text-white shadow-2xs font-extrabold'
                      : 'text-amber-700 hover:text-amber-900'
                  }`}
                >
                  <span>★</span> Top Brands ({topBrandsCount})
                </button>
              </div>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-full border border-[var(--color-surface-muted)] bg-[var(--color-surface)] px-3.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all shadow-2xs cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

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
                  placeholder="Search brands or offers…"
                  className="rounded-full border border-[var(--color-surface-muted)] bg-[var(--color-extra-002)] pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all w-44 sm:w-52"
                />
              </div>

              {/* + New Brand Button */}
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-[var(--color-primary-strong)] to-[var(--color-primary-strong-hover)] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-all shadow-md active:scale-98"
              >
                + New Brand
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b-2 border-[var(--color-extra-003)] uppercase text-[var(--color-extra-001)] bg-[var(--color-extra-005)] text-xs font-black tracking-wider">
                <tr>
                  <th className="px-6 py-4">Brand</th>
                  <th className="px-6 py-4">Show on Storefront</th>
                  <th className="px-6 py-4">Offer / Deal Tag</th>
                  <th className="px-6 py-4">Mapped Categories</th>
                  <th className="px-6 py-4">Products</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-extra-013)]">
                {filteredBrands.map((b) => {
                  const isTop = Boolean(b.is_top_brand)
                  const imgUrl = b.image_path ? `${env.API_ORIGIN}/${b.image_path}` : null

                  return (
                    <tr key={b.id} className="hover:bg-[var(--color-surface-alt)] transition-colors">
                      {/* Brand Info & Logo */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3.5">
                          <div className="h-11 w-11 shrink-0 rounded-2xl bg-white border border-slate-200 p-1 flex items-center justify-center shadow-xs overflow-hidden">
                            {imgUrl ? (
                              <img
                                src={imgUrl}
                                alt={b.name}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <span className="font-extrabold text-[var(--color-primary)] text-xs uppercase">
                                {b.name.slice(0, 2)}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-900 text-sm">{b.name}</p>
                              {isTop && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                  ★ TOP BRAND
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 font-mono">
                              ID #{b.id} {b.description ? `• ${b.description}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Interactive Top Brand Toggle */}
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          disabled={togglingId === b.id}
                          onClick={() => handleToggleTopBrand(b)}
                          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shadow-2xs ${
                            isTop
                              ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                              : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          }`}
                          title="Click to toggle top brand status on storefront homepage"
                        >
                          <span
                            className={`inline-block w-2.5 h-2.5 rounded-full ${
                              isTop ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
                            }`}
                          />
                          <span>{isTop ? 'Featured (Active)' : 'Not Featured'}</span>
                        </button>
                      </td>

                      {/* Offer Text */}
                      <td className="px-6 py-4">
                        {b.offer_text ? (
                          <span className="inline-block px-3 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-black text-xs shadow-2xs">
                            {b.offer_text}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Auto price</span>
                        )}
                      </td>

                      {/* Mapped Categories */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {b.categories && b.categories.length > 0 ? (
                            b.categories.map((c) => (
                              <span
                                key={c.id}
                                className="bg-[var(--color-extra-006)] text-[var(--color-extra-001)] border border-[var(--color-extra-007)] px-2.5 py-0.5 rounded-full text-xs font-bold inline-block shadow-2xs"
                              >
                                {c.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 text-xs font-medium italic">All Categories</span>
                          )}
                        </div>
                      </td>

                      {/* Product Count */}
                      <td className="px-6 py-4">
                        <span className="font-semibold text-slate-700">
                          {b.product_count ?? 0} products
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(b)}
                            className="p-2 rounded-xl text-slate-700 hover:bg-[var(--color-extra-006)] hover:text-[var(--color-extra-001)] transition-colors border border-transparent hover:border-slate-200"
                            title="Edit Brand"
                          >
                            <PencilIcon className="h-4 w-4 stroke-[2]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingBrand(b)}
                            className="p-2 rounded-xl text-rose-600 hover:bg-rose-100 hover:text-rose-800 transition-colors border border-transparent hover:border-rose-200"
                            title="Delete Brand"
                          >
                            <TrashIcon className="h-4 w-4 stroke-[2]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {filteredBrands.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      No brands found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= CREATE / EDIT MODAL ================= */}
      {showModal && (
        <Modal
          title={editingBrand ? `Edit Brand: ${editingBrand.name}` : 'New Brand'}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <Alert tone="red">{error}</Alert>}

            {/* Brand Logo / Image Upload */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Brand Logo / Showcase Image <span className="text-slate-400 font-normal normal-case">(Recommended for Storefront)</span>
              </label>

              <div className="flex items-center gap-4">
                <div className="h-20 w-20 shrink-0 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden relative shadow-2xs">
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Brand Preview"
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <div className="text-center p-2">
                      <svg
                        className="mx-auto h-6 w-6 text-slate-400"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                        />
                      </svg>
                      <span className="text-[10px] text-slate-400 font-medium block mt-0.5">No Logo</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleImageChange}
                    className="hidden"
                    id="brand-image-input"
                  />
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="brand-image-input"
                      className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all shadow-xs"
                    >
                      <span>Choose Brand Logo / Image</span>
                    </label>

                    {imagePreview && (
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-all"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    PNG, JPG, or WEBP. Upload high-res logo or product showcase for homepage.
                  </p>
                </div>
              </div>
            </div>

            {/* Brand Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Brand Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Nike, Apple, Dabur, Denver, Sparx…"
                className="w-full rounded-xl border border-[var(--color-surface-muted)] bg-[var(--color-extra-002)] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 transition-all shadow-2xs font-semibold"
              />
            </div>

            {/* Top Brand Showcase Controls */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isTopBrand}
                      onChange={(e) => setIsTopBrand(e.target.checked)}
                      className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                      ★ Feature in Top Brands on Storefront Homepage
                    </span>
                  </label>
                  <p className="text-[11px] text-amber-800 mt-1 pl-6">
                    Displays this brand card in the "Most Loved Brands" section on the storefront home page.
                  </p>
                </div>
              </div>

              {isTopBrand && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-200/60 pl-6">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      Offer / Deal Tagline
                    </label>
                    <input
                      type="text"
                      value={offerText}
                      onChange={(e) => setOfferText(e.target.value)}
                      placeholder="e.g. From ₹999 or Upto 50% Off"
                      className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                    />
                    <span className="text-[10px] text-amber-700 block mt-0.5">
                      Leave empty to auto-calculate lowest starting price.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      Display Priority (Sort Order)
                    </label>
                    <input
                      type="number"
                      value={sortOrder}
                      onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                      placeholder="1, 2, 3..."
                      className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                    />
                    <span className="text-[10px] text-amber-700 block mt-0.5">
                      1 appears first, 2 second, etc.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Description <span className="text-slate-400 font-normal normal-case">(Optional)</span>
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write a brief note or slogan about this brand…"
                className="w-full rounded-xl border border-[var(--color-surface-muted)] bg-[var(--color-extra-002)] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 transition-all shadow-2xs resize-none"
              />
            </div>

            {/* Associated Categories */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Associated Categories
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Selecting categories enables smart brand suggestions when creating products.
              </p>
              <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-[var(--color-surface-muted)] bg-[var(--color-extra-002)] p-3 text-xs">
                {categories.map((c) => {
                  const checked = selectedCategoryIds.includes(c.id)
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer ${
                        checked
                          ? 'bg-[var(--color-extra-010)] border-[var(--color-border)] text-[var(--color-primary)] font-bold shadow-2xs'
                          : 'border-transparent text-slate-700 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(c.id)}
                        className="h-4 w-4 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--color-border-muted)]">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-5 py-2 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-[var(--color-primary-strong)] to-[var(--color-primary-strong-hover)] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {submitting ? 'Saving…' : editingBrand ? 'Save Changes' : 'Create Brand'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={deletingBrand !== null}
        title="Delete Brand"
        message={<>Are you sure you want to delete brand <strong className="text-slate-900">{deletingBrand?.name}</strong>?</>}
        confirmLabel="Delete Brand"
        onConfirm={handleDelete}
        onCancel={() => setDeletingBrand(null)}
      />
    </div>
  )
}
