import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PencilIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Banner, BannerPosition, BannerTargetType, Category, ProductListItem, Subcategory } from '../lib/types'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '')
function imageUrl(path: string) {
  return `${API_ORIGIN}/${path}`
}

const POSITIONS: BannerPosition[] = ['HOME_HERO', 'HOME_MIDDLE', 'CATEGORY_PAGE', 'POPUP']
const TARGET_TYPES: BannerTargetType[] = ['NONE', 'PRODUCT', 'CATEGORY', 'SUBCATEGORY', 'BRAND', 'COUPON', 'EXTERNAL_URL']

interface Brand {
  id: number
  name: string
}
interface Coupon {
  id: number
  code: string
}

export function BannersPage() {
  const [banners, setBanners] = useState<Banner[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [products, setProducts] = useState<ProductListItem[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Banner | null>(null)

  function load() {
    api.get('/banners').then((res) => setBanners(res.data.banners))
  }

  useEffect(() => {
    load()
    api.get('/categories').then((res) => setCategories(res.data.categories))
    api.get('/subcategories').then((res) => setSubcategories(res.data.subcategories))
    api.get('/brands').then((res) => setBrands(res.data.brands))
    api.get('/coupons').then((res) => setCoupons(res.data.coupons))
    api.get('/products', { params: { limit: 100 } }).then((res) => setProducts(res.data.items))
  }, [])

  async function toggleActive(banner: Banner) {
    await api.put(`/banners/${banner.id}`, { is_active: banner.is_active ? 0 : 1 })
    load()
  }

  async function removeBanner(id: number) {
    if (!window.confirm('Delete this banner? This cannot be undone.')) return
    await api.delete(`/banners/${id}`)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Banners"
        description="Home hero / middle / category-page / popup banners. Clicking one can link to a product, category, subcategory, brand, coupon, or an external URL."
        actions={<Button onClick={() => setShowCreate(true)}>+ New Banner</Button>}
      />

      {banners === null ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {banners.map((b) => (
            <Card key={b.id} className="overflow-hidden">
              <div className="flex h-32 items-center justify-center bg-slate-100">
                {b.image_desktop_path ? (
                  <img src={imageUrl(b.image_desktop_path)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-slate-400">No image</span>
                )}
              </div>
              <div className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-900">{b.title}</p>
                  <Badge tone={b.is_active ? 'green' : 'slate'}>{b.is_active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <div className="mb-3 flex flex-wrap gap-1 text-xs text-slate-500">
                  <Badge>{b.position.replace('_', ' ')}</Badge>
                  <Badge>{b.target_type}</Badge>
                  {b.items.length > 0 && <Badge tone="amber">{b.items.length} item(s)</Badge>}
                </div>
                <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setEditing(b)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    title="Manage / Edit Banner"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    onClick={() => toggleActive(b)}
                    className={`p-1.5 rounded-lg transition-colors ${b.is_active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
                    title={b.is_active ? 'Deactivate Banner' : 'Activate Banner'}
                  >
                    <PowerIcon />
                  </button>
                  <button
                    onClick={() => removeBanner(b.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Delete Banner"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </Card>
          ))}
          {banners.length === 0 && (
            <Card className="col-span-full p-8 text-center text-sm text-slate-500">No banners yet.</Card>
          )}
        </div>
      )}

      {showCreate && (
        <BannerFormModal
          title="New Banner"
          categories={categories}
          subcategories={subcategories}
          brands={brands}
          coupons={coupons}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            load()
          }}
        />
      )}

      {editing && (
        <BannerManageModal
          banner={editing}
          categories={categories}
          subcategories={subcategories}
          brands={brands}
          coupons={coupons}
          products={products}
          onClose={() => setEditing(null)}
          onChanged={(updated) => {
            setEditing(updated)
            load()
          }}
        />
      )}
    </div>
  )
}

function TargetFields({
  targetType,
  setTargetType,
  targetId,
  setTargetId,
  targetUrl,
  setTargetUrl,
  categories,
  subcategories,
  brands,
  coupons,
}: {
  targetType: BannerTargetType
  setTargetType: (v: BannerTargetType) => void
  targetId: string
  setTargetId: (v: string) => void
  targetUrl: string
  setTargetUrl: (v: string) => void
  categories: Category[]
  subcategories: Subcategory[]
  brands: Brand[]
  coupons: Coupon[]
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Select label="Links to" value={targetType} onChange={(e) => setTargetType(e.target.value as BannerTargetType)}>
        {TARGET_TYPES.map((t) => (
          <option key={t} value={t}>
            {t.replace('_', ' ')}
          </option>
        ))}
      </Select>

      {targetType === 'CATEGORY' && (
        <Select label="Category" required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Select…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}
      {targetType === 'SUBCATEGORY' && (
        <Select label="Subcategory" required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Select…</option>
          {subcategories.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      )}
      {targetType === 'BRAND' && (
        <Select label="Brand" required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Select…</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      )}
      {targetType === 'COUPON' && (
        <Select label="Coupon" required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Select…</option>
          {coupons.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </Select>
      )}
      {targetType === 'EXTERNAL_URL' && (
        <TextField
          label="URL"
          required
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://…"
        />
      )}
    </div>
  )
}

function BannerFormModal({
  title,
  categories,
  subcategories,
  brands,
  coupons,
  onClose,
  onSaved,
}: {
  title: string
  categories: Category[]
  subcategories: Subcategory[]
  brands: Brand[]
  coupons: Coupon[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [position, setPosition] = useState<BannerPosition>('HOME_HERO')
  const [targetType, setTargetType] = useState<BannerTargetType>('NONE')
  const [targetId, setTargetId] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [desktopFile, setDesktopFile] = useState<File | null>(null)
  const [mobileFile, setMobileFile] = useState<File | null>(null)
  const [desktopPreview, setDesktopPreview] = useState<string>('')
  const [mobilePreview, setMobilePreview] = useState<string>('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await api.post('/banners', {
        title: name,
        position,
        target_type: targetType,
        target_id: targetId || null,
        target_url: targetType === 'EXTERNAL_URL' ? targetUrl : null,
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        sort_order: Number(sortOrder) || 0,
      })
      const bannerId = res.data.id

      if (desktopFile) {
        const formData = new FormData()
        formData.append('file', desktopFile)
        await api.post(`/banners/${bannerId}/image/desktop`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      if (mobileFile) {
        const formData = new FormData()
        formData.append('file', mobileFile)
        await api.post(`/banners/${bannerId}/image/mobile`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create banner'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} width="lg">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Title" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Special Sale" />
          <Select label="Position" value={position} onChange={(e) => setPosition(e.target.value as BannerPosition)}>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </div>

        {/* Banner Images Selection */}
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Desktop Image Banner</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setDesktopFile(f)
                  setDesktopPreview(URL.createObjectURL(f))
                }
              }}
              className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {desktopPreview && (
              <img src={desktopPreview} alt="Desktop Preview" className="mt-2 h-16 w-full rounded border border-slate-300 object-cover" />
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Image Banner (Optional)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setMobileFile(f)
                  setMobilePreview(URL.createObjectURL(f))
                }
              }}
              className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {mobilePreview && (
              <img src={mobilePreview} alt="Mobile Preview" className="mt-2 h-16 w-full rounded border border-slate-300 object-cover" />
            )}
          </div>
        </div>

        <TargetFields
          targetType={targetType}
          setTargetType={setTargetType}
          targetId={targetId}
          setTargetId={setTargetId}
          targetUrl={targetUrl}
          setTargetUrl={setTargetUrl}
          categories={categories}
          subcategories={subcategories}
          brands={brands}
          coupons={coupons}
        />

        <div className="grid grid-cols-3 gap-4">
          <TextField label="Starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          <TextField label="Ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          <TextField label="Sort Order" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Banner'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function BannerManageModal({
  banner,
  categories,
  subcategories,
  brands,
  coupons,
  products,
  onClose,
  onChanged,
}: {
  banner: Banner
  categories: Category[]
  subcategories: Subcategory[]
  brands: Brand[]
  coupons: Coupon[]
  products: ProductListItem[]
  onClose: () => void
  onChanged: (updated: Banner) => void
}) {
  const [title, setTitle] = useState(banner.title)
  const [position, setPosition] = useState<BannerPosition>(banner.position)
  const [targetType, setTargetType] = useState<BannerTargetType>(banner.target_type)
  const [targetId, setTargetId] = useState(banner.target_id ? String(banner.target_id) : '')
  const [targetUrl, setTargetUrl] = useState(banner.target_url ?? '')
  const [sortOrder, setSortOrder] = useState(String(banner.sort_order))
  const [error, setError] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)

  const [uploadingDesktop, setUploadingDesktop] = useState(false)
  const [uploadingMobile, setUploadingMobile] = useState(false)
  const desktopInput = useRef<HTMLInputElement>(null)
  const mobileInput = useRef<HTMLInputElement>(null)

  const [newItemProductId, setNewItemProductId] = useState('')
  const [newItemOfferText, setNewItemOfferText] = useState('')

  async function refresh() {
    const res = await api.get(`/banners/${banner.id}`)
    onChanged(res.data.banner)
  }

  async function saveMeta(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSavingMeta(true)
    try {
      await api.put(`/banners/${banner.id}`, {
        title,
        position,
        target_type: targetType,
        target_id: targetId || null,
        target_url: targetType === 'EXTERNAL_URL' ? targetUrl : null,
        sort_order: Number(sortOrder) || 0,
      })
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save changes'))
    } finally {
      setSavingMeta(false)
    }
  }

  async function uploadImage(side: 'desktop' | 'mobile', file: File | undefined) {
    if (!file) return
    const setBusy = side === 'desktop' ? setUploadingDesktop : setUploadingMobile
    setBusy(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.post(`/banners/${banner.id}/image/${side}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not upload image'))
    } finally {
      setBusy(false)
    }
  }

  async function addItem(e: FormEvent) {
    e.preventDefault()
    if (!newItemProductId) return
    setError('')
    try {
      await api.post(`/banners/${banner.id}/items`, {
        product_id: Number(newItemProductId),
        offer_text: newItemOfferText || null,
      })
      setNewItemProductId('')
      setNewItemOfferText('')
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not add product'))
    }
  }

  async function removeItem(itemId: number) {
    await api.delete(`/banners/${banner.id}/items/${itemId}`)
    await refresh()
  }

  return (
    <Modal title={`Manage: ${banner.title}`} onClose={onClose} width="lg">
      <div className="space-y-6">
        {error && <Alert>{error}</Alert>}

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Images</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                {banner.image_desktop_path ? (
                  <img src={imageUrl(banner.image_desktop_path)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-slate-400">Desktop</span>
                )}
              </div>
              <input
                ref={desktopInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => uploadImage('desktop', e.target.files?.[0])}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-2 w-full"
                disabled={uploadingDesktop}
                onClick={() => desktopInput.current?.click()}
              >
                {uploadingDesktop ? 'Uploading…' : 'Upload Desktop Image'}
              </Button>
            </div>
            <div>
              <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                {banner.image_mobile_path ? (
                  <img src={imageUrl(banner.image_mobile_path)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-slate-400">Mobile (optional)</span>
                )}
              </div>
              <input
                ref={mobileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => uploadImage('mobile', e.target.files?.[0])}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-2 w-full"
                disabled={uploadingMobile}
                onClick={() => mobileInput.current?.click()}
              >
                {uploadingMobile ? 'Uploading…' : 'Upload Mobile Image'}
              </Button>
            </div>
          </div>
        </div>

        <form onSubmit={saveMeta} className="space-y-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-700">Details</p>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            <Select label="Position" value={position} onChange={(e) => setPosition(e.target.value as BannerPosition)}>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </div>
          <TargetFields
            targetType={targetType}
            setTargetType={setTargetType}
            targetId={targetId}
            setTargetId={setTargetId}
            targetUrl={targetUrl}
            setTargetUrl={setTargetUrl}
            categories={categories}
            subcategories={subcategories}
            brands={brands}
            coupons={coupons}
          />
          <TextField label="Sort Order" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={savingMeta}>
              {savingMeta ? 'Saving…' : 'Save Details'}
            </Button>
          </div>
        </form>

        <div className="border-t border-slate-200 pt-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Landing page products</p>
          <p className="mb-3 text-xs text-slate-500">
            Clicking this banner opens a landing page listing these products, with the offer text shown. Pricing still
            comes from the backend.
          </p>

          {banner.items.length > 0 && (
            <ul className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {banner.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{item.product_name}</p>
                    {item.offer_text && <p className="text-xs text-slate-500">{item.offer_text}</p>}
                  </div>
                  <button type="button" onClick={() => removeItem(item.id)} className="text-xs text-red-600">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={addItem} className="flex gap-2">
            <Select value={newItemProductId} onChange={(e) => setNewItemProductId(e.target.value)} className="flex-1">
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <TextField
              placeholder="Offer text (optional)"
              value={newItemOfferText}
              onChange={(e) => setNewItemOfferText(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" size="sm" variant="secondary">
              Add
            </Button>
          </form>
        </div>

        <div className="flex justify-end border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
