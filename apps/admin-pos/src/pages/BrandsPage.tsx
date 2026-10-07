import { useEffect, useState, type FormEvent } from 'react'
import { PencilIcon, TrashIcon } from '../components/Icons'
import { Alert, Modal, Spinner } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Brand, Category } from '../lib/types'

export function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null)

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')

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

  // Filtered brands
  const filteredBrands = brands.filter((b) => {
    const matchesSearch =
      !searchQuery.trim() ||
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.description && b.description.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCategory =
      categoryFilter === 'ALL' || (b.category_ids && b.category_ids.includes(Number(categoryFilter)))
    return matchesSearch && matchesCategory
  })

  return (
    <div className="space-y-6 pb-12">
      {/* ================= ALL BRANDS TABLE CARD ================= */}
      {loading ? (
        <div className="p-12 text-center">
          <Spinner />
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
          {/* Card Header with Filters, Search and New Brand Button */}
          <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
            <div>
              <h3 className="text-xl font-serif font-bold text-slate-900">All Brands</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {filteredBrands.length} of {brands.length}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Category Filter */}
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
                  placeholder="Search brands…"
                  className="rounded-full border border-[#E5D5D8] bg-[#FDFBFB] pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7B3F4A] transition-all w-44 sm:w-52"
                />
              </div>

              {/* + New Brand Button */}
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-all shadow-md active:scale-98"
              >
                + New Brand
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
                <tr>
                  <th className="px-6 py-4">Brand</th>
                  <th className="px-6 py-4">Mapped Categories</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F6EDEE]">
                {filteredBrands.map((b) => (
                  <tr key={b.id} className="hover:bg-[#FAF5F6] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3.5">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-[#F3E1E4] border border-[#DCBAC1] flex items-center justify-center font-bold text-[#4A1821] text-xs shadow-2xs">
                          {b.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{b.name}</p>
                          <p className="text-xs text-slate-600 font-mono font-medium">ID #{b.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-sm">
                        {b.categories && b.categories.length > 0 ? (
                          b.categories.map((c) => (
                            <span
                              key={c.id}
                              className="bg-[#F3E1E4] text-[#4A1821] border border-[#DCBAC1] px-3 py-0.5 rounded-full text-xs font-bold inline-block shadow-2xs"
                            >
                              {c.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 text-xs font-medium italic">All Categories</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-800 font-medium max-w-xs truncate">
                      {b.description || '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(b)}
                          className="p-2 rounded-lg text-slate-700 hover:bg-[#F3E1E4] hover:text-[#4A1821] transition-colors"
                          title="Edit Brand"
                        >
                          <PencilIcon className="h-4 w-4 stroke-[2]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(b.id)}
                          className="p-2 rounded-lg text-rose-600 hover:bg-rose-100 hover:text-rose-800 transition-colors"
                          title="Delete Brand"
                        >
                          <TrashIcon className="h-4 w-4 stroke-[2]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredBrands.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                      No brands found.
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
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert tone="red">{error}</Alert>}

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
                placeholder="e.g. Nike, Apple, L'Oreal…"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Description <span className="text-slate-400 font-normal normal-case">(Optional)</span>
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write a brief note about this brand…"
                className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Associated Categories
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Selecting categories enables smart brand suggestions when creating products.
              </p>
              <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-[#E5D5D8] bg-[#FDFBFB] p-3 text-xs">
                {categories.map((c) => {
                  const checked = selectedCategoryIds.includes(c.id)
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

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#F2E5E7]">
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
                className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {submitting ? 'Saving…' : editingBrand ? 'Save Changes' : 'Create Brand'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
