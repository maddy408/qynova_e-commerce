import { useEffect, useState, useRef, type FormEvent } from 'react'
import { PencilIcon, TrashIcon, ImageIcon } from '../components/Icons'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { api, apiErrorMessage } from '../lib/api'

export interface TopOffer {
  id: number
  badge: string
  icon: 'truck' | 'tag' | 'percent' | 'gift' | 'zap' | 'star'
  title: string
  subtitle: string | null
  image_path?: string | null
  code: string | null
  button_text: string
  link: string
  sort_order: number
  is_active: number | boolean
  created_at?: string
  updated_at?: string
}

function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path
  }
  const base = (import.meta.env.VITE_API_ORIGIN as string | undefined) ?? 'http://localhost:8000'
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

const ICON_OPTIONS = [
  { value: 'truck', label: '🚚 Delivery Truck (Free Shipping / Delivery)' },
  { value: 'tag', label: '🏷️ Discount Tag (Flat Discount)' },
  { value: 'percent', label: '％ Percentage (Percentage Off)' },
  { value: 'gift', label: '🎁 Gift (Gift / Festive / Hamper)' },
  { value: 'zap', label: '⚡ Flash / Zap (Lightning Deals)' },
  { value: 'star', label: '⭐ Star (Featured Offer)' },
]

export function TopOffersPage() {
  const [offers, setOffers] = useState<TopOffer[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingOffer, setEditingOffer] = useState<TopOffer | null>(null)
  const [deletingOffer, setDeletingOffer] = useState<TopOffer | null>(null)

  // Form Fields
  const [badge, setBadge] = useState('')
  const [icon, setIcon] = useState<'truck' | 'tag' | 'percent' | 'gift' | 'zap' | 'star'>('percent')
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [code, setCode] = useState('')
  const [buttonText, setButtonText] = useState('Shop Deals')
  const [link, setLink] = useState('/products?section=deals')
  const [sortOrder, setSortOrder] = useState('0')
  const [isActive, setIsActive] = useState(true)

  // Image Upload Fields
  const [imagePath, setImagePath] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageRemoved, setImageRemoved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  function load() {
    api.get('/admin/top-offers')
      .then((res) => setOffers(res.data.top_offers || []))
      .catch((err) => setError(apiErrorMessage(err, 'Failed to load top offers')))
  }

  useEffect(() => {
    load()
  }, [])

  function openCreateModal() {
    setEditingOffer(null)
    setBadge('FLAT ₹50 OFF')
    setIcon('tag')
    setTitle('')
    setSubtitle('')
    setCode('')
    setImagePath('')
    setImageFile(null)
    setImagePreview(null)
    setImageRemoved(false)
    setButtonText('Shop Deals')
    setLink('/products?section=deals')
    setSortOrder(String((offers?.length || 0) + 1))
    setIsActive(true)
    setError('')
    setSuccessMessage('')
    setShowForm(true)
  }

  function openEditModal(offer: TopOffer) {
    setEditingOffer(offer)
    setBadge(offer.badge)
    setIcon(offer.icon || 'percent')
    setTitle(offer.title)
    setSubtitle(offer.subtitle || '')
    setCode(offer.code || '')
    setImagePath(offer.image_path || '')
    setImageFile(null)
    setImagePreview(null)
    setImageRemoved(false)
    setButtonText(offer.button_text || 'Shop Deals')
    setLink(offer.link || '/products?section=deals')
    setSortOrder(String(offer.sort_order ?? 0))
    setIsActive(Boolean(offer.is_active))
    setError('')
    setSuccessMessage('')
    setShowForm(true)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
      setImageRemoved(false)
    }
  }

  function handleRemoveImage() {
    setImageFile(null)
    setImagePreview(null)
    setImagePath('')
    setImageRemoved(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!badge.trim() || !title.trim()) {
      setError('Badge and Title are required')
      return
    }

    setSubmitting(true)
    setError('')

    const payload: any = {
      badge: badge.trim(),
      icon,
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      code: code.trim() ? code.trim().toUpperCase() : null,
      button_text: buttonText.trim() || 'Shop Deals',
      link: link.trim() || '/products?section=deals',
      sort_order: parseInt(sortOrder, 10) || 0,
      is_active: isActive ? 1 : 0,
      image_path: imageRemoved ? null : (imageFile ? undefined : (imagePath.trim() || null)),
    }

    try {
      let targetId: number | null = null

      if (editingOffer) {
        await api.put(`/admin/top-offers/${editingOffer.id}`, payload)
        targetId = editingOffer.id
        setSuccessMessage('Top offer updated successfully')
      } else {
        const res = await api.post('/admin/top-offers', payload)
        targetId = res.data?.id
        setSuccessMessage('Top offer created successfully')
      }

      // If an image file was selected, upload it
      if (targetId && imageFile) {
        const formData = new FormData()
        formData.append('file', imageFile)
        await api.post(`/admin/top-offers/${targetId}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else if (targetId && imageRemoved && editingOffer?.image_path) {
        await api.delete(`/admin/top-offers/${targetId}/image`).catch(() => {})
      }

      setShowForm(false)
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save offer'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggle(id: number) {
    setTogglingId(id)
    try {
      await api.patch(`/admin/top-offers/${id}/toggle`, {})
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to toggle status'))
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete() {
    if (!deletingOffer) return
    setSubmitting(true)
    try {
      await api.delete(`/admin/top-offers/${deletingOffer.id}`)
      setDeletingOffer(null)
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to delete offer'))
    } finally {
      setSubmitting(false)
    }
  }

  const renderIconBadge = (ic: string) => {
    switch (ic) {
      case 'truck':
        return <span className="text-base">🚚</span>
      case 'tag':
        return <span className="text-base">🏷️</span>
      case 'percent':
        return <span className="text-base">％</span>
      case 'gift':
        return <span className="text-base">🎁</span>
      case 'zap':
        return <span className="text-base">⚡</span>
      case 'star':
        return <span className="text-base">⭐</span>
      default:
        return <span className="text-base">％</span>
    }
  }

  const activeCardImage = imagePreview || (imageRemoved ? null : imageUrl(imagePath))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Top Offers for You"
        description="Manage the high-visibility promotional cards displayed on the storefront home page."
        actions={
          <Button variant="primary" onClick={openCreateModal}>
            + Create Top Offer
          </Button>
        }
      />

      {error && <Alert tone="red">{error}</Alert>}
      {successMessage && <Alert tone="green">{successMessage}</Alert>}

      {/* Info Banner */}
      <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200 text-purple-900 text-xs sm:text-sm flex items-start gap-3">
        <span className="text-xl">✨</span>
        <div className="space-y-1">
          <p className="font-bold">Storefront Top Offers Banner System</p>
          <p className="text-purple-700">
            These cards appear directly on the storefront homepage under <strong>"Top Offers for You"</strong>.
            You can set custom badges, promo codes, direct links, and reorder them using sort order.
          </p>
        </div>
      </div>

      {/* Offers Table */}
      <Card>
        {offers === null ? (
          <div className="py-12 flex justify-center">
            <Spinner />
          </div>
        ) : offers.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <p className="text-base font-semibold">No Top Offers created yet</p>
            <p className="text-xs text-slate-400 mt-1">Click "+ Create Top Offer" above to create your first offer card.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Image</th>
                  <th className="px-4 py-3">Card Preview</th>
                  <th className="px-4 py-3">Badge & Icon</th>
                  <th className="px-4 py-3">Coupon Code</th>
                  <th className="px-4 py-3">Action Button</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {offers.map((offer) => {
                  const active = Boolean(offer.is_active)
                  return (
                    <tr key={offer.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-400 text-xs">
                        #{offer.sort_order}
                      </td>
                      <td className="px-4 py-3">
                        {offer.image_path ? (
                          <div className="w-16 h-11 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 relative group shadow-2xs">
                            <img
                              src={imageUrl(offer.image_path)!}
                              alt={offer.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-11 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-[10px] text-slate-400">
                            <ImageIcon className="w-4 h-4 text-slate-300 mb-0.5" />
                            <span>Gradient</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 min-w-[240px]">
                        <div className="font-bold text-slate-900 leading-tight">{offer.title}</div>
                        {offer.subtitle && (
                          <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">{offer.subtitle}</div>
                        )}
                        <div className="text-[11px] text-purple-600 font-mono mt-0.5">{offer.link}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-purple-100 border border-purple-200 flex items-center justify-center">
                            {renderIconBadge(offer.icon)}
                          </div>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                            {offer.badge}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {offer.code ? (
                          <span className="inline-flex items-center gap-1 font-mono text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded">
                            CODE: {offer.code}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No code (Direct)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block bg-black text-white text-[11px] font-bold px-2.5 py-1 rounded-md">
                          {offer.button_text} &rarr;
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggle(offer.id)}
                          disabled={togglingId === offer.id}
                          className="inline-flex items-center cursor-pointer"
                          title="Click to toggle active status"
                        >
                          {active ? (
                            <Badge tone="green">Active</Badge>
                          ) : (
                            <Badge tone="slate">Inactive</Badge>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(offer)}
                            className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Offer"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingOffer(offer)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Offer"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create / Edit Modal */}
      {showForm && (
        <Modal
          title={editingOffer ? 'Edit Top Offer' : 'Create Top Offer'}
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Live Storefront Preview Card (Glass UI) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Live Storefront Card Preview (Glass UI)
                </label>
                {activeCardImage && (
                  <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                    ✨ Glassmorphism Active
                  </span>
                )}
              </div>
              <div
                className={`relative overflow-hidden rounded-2xl border transition-all duration-300 flex flex-col justify-between shadow-sm min-h-[160px] ${
                  activeCardImage ? 'border-white/50 bg-slate-900/10' : 'bg-gradient-to-br from-[#faf5ff] to-[#f5f3ff] border-[#e9d5ff]'
                }`}
              >
                {/* Background Image Container */}
                {activeCardImage && (
                  <div className="absolute inset-0 z-0">
                    <img
                      src={activeCardImage}
                      alt={title || 'Preview'}
                      className="w-full h-full object-cover"
                    />
                    {/* Frosted Glass Overlay tint */}
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-[3px] bg-gradient-to-tr from-white/90 via-white/75 to-white/60" />
                  </div>
                )}

                {/* Glass UI Content */}
                <div className="relative z-10 p-4 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md tracking-wide border ${
                          activeCardImage
                            ? 'bg-white/85 text-[#6d28d9] border-white/80 shadow-2xs backdrop-blur-md'
                            : 'bg-[#ede9fe] text-[#6d28d9] border-[#ddd6fe]'
                        }`}
                      >
                        {badge || 'BADGE'}
                      </span>
                      <div
                        className={`w-8 h-8 flex items-center justify-center rounded-xl border ${
                          activeCardImage
                            ? 'bg-white/85 border-white/80 shadow-2xs backdrop-blur-md'
                            : 'bg-white border-[#e9d5ff]'
                        }`}
                      >
                        {renderIconBadge(icon)}
                      </div>
                    </div>
                    <h4 className="text-sm font-extrabold text-slate-900 leading-tight">
                      {title || 'Offer Card Title'}
                    </h4>
                    <p className="text-[11px] text-slate-700 font-medium mt-1 line-clamp-2">
                      {subtitle || 'Short description of your special deal or discount terms.'}
                    </p>
                    {code && (
                      <div className="mt-2.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold ${
                            activeCardImage
                              ? 'bg-white/90 text-[#6d28d9] border-white/80 shadow-2xs backdrop-blur-md'
                              : 'bg-white text-[#6d28d9] border-[#ddd6fe]'
                          }`}
                        >
                          CODE: {code.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="pt-3.5">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-black text-white text-[11px] font-bold shadow-2xs">
                      <span>{buttonText || 'Shop Deals'}</span>
                      <span>&rarr;</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Background Image Upload & URL Picker */}
            <div className="p-3.5 rounded-xl border border-purple-200/80 bg-purple-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-800">
                    Card Background Image (Glass UI)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Upload an image or paste a URL. A frosted glass overlay will display text clearly over it.
                  </p>
                </div>
                {activeCardImage && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-1 rounded border border-rose-200 bg-white hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    ✕ Remove Image
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                {/* File upload button */}
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="top-offer-image-input"
                  />
                  <label
                    htmlFor="top-offer-image-input"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-purple-500 text-slate-700 hover:text-purple-700 text-xs font-semibold cursor-pointer shadow-2xs transition-all active:scale-95"
                  >
                    <ImageIcon className="w-4 h-4 text-purple-600" />
                    <span>{activeCardImage ? 'Change Image File' : 'Upload Image File'}</span>
                  </label>
                  {imageFile && (
                    <span className="text-[11px] text-emerald-600 font-medium truncate max-w-[150px]">
                      ✓ {imageFile.name}
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-400 font-medium hidden sm:block">OR</div>

                {/* Direct URL input */}
                <div className="flex-1 w-full">
                  <input
                    type="text"
                    value={imagePath}
                    onChange={(e) => {
                      setImagePath(e.target.value)
                      setImageRemoved(false)
                    }}
                    placeholder="Paste Image URL (e.g. https://... or /uploads/...)"
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <TextField
                  label="Badge / Tag Text *"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  placeholder="e.g. FREE DELIVERY, FLAT ₹50 OFF, 10% OFF"
                  required
                />
              </div>
              <div>
                <Select
                  label="Card Icon *"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value as any)}
                >
                  {ICON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <TextField
                label="Offer Title *"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Free Delivery Above ₹499"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Subtitle / Description
              </label>
              <textarea
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                rows={2}
                placeholder="e.g. No shipping charge applied on orders over ₹499. Fast doorstep delivery."
                className="w-full text-xs rounded-lg border border-slate-300 p-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <TextField
                  label="Coupon Code (Optional)"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. KIRANA50"
                />
              </div>
              <div>
                <TextField
                  label="Button Text"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  placeholder="e.g. Shop Deals"
                />
              </div>
              <div>
                <TextField
                  label="Target Link"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="e.g. /products?section=deals"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <TextField
                  label="Sort Order"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  placeholder="1"
                />
              </div>
              <div className="pt-5">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Active (Show on Storefront)
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Saving...' : editingOffer ? 'Save Changes' : 'Create Offer'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deletingOffer)}
        title="Delete Top Offer"
        message={`Are you sure you want to delete "${deletingOffer?.title}"? This card will no longer appear on the storefront homepage.`}
        confirmLabel="Delete Offer"
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeletingOffer(null)}
      />
    </div>
  )
}