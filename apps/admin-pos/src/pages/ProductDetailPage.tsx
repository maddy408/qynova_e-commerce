import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Modal, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage, getApiOrigin } from '../lib/api'
import { STOCK_STATUS_LABEL, STOCK_STATUS_TONE, stockStatus } from '../lib/stock'
import type { Brand, Category, ProductDetail, ProductVariant, Subcategory, VariantAttribute } from '../lib/types'
import { ROUTES } from '../routes/routes'

function imageUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${getApiOrigin()}/${path}`
}

function skuAbbr(value: string) {
  const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return (clean || 'VAL').slice(0, 3)
}

function cartesianProduct<T>(groups: T[][]): T[][] {
  return groups.reduce<T[][]>((acc, group) => acc.flatMap((combo) => group.map((value) => [...combo, value])), [[]])
}

interface NewVariantRow {
  key: string
  valueIds: number[]
  title: string
  sku: string
  openingStock: string
  lowStockThreshold: string
  image: { file: File; previewUrl: string } | null
}

export function ProductDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [attributes, setAttributes] = useState<VariantAttribute[]>([])
  const [error, setError] = useState('')
  const [managingVariant, setManagingVariant] = useState<ProductVariant | null>(null)
  const [togglingActive, setTogglingActive] = useState(false)

  const load = useCallback(() => {
    api.get(`/products/${id}`).then((res) => setProduct(res.data.product))
  }, [id])

  useEffect(() => {
    load()
    api.get('/variant-attributes').then((res) => setAttributes(res.data.attributes))
  }, [load])

  if (product === null) {
    return <Spinner />
  }

  async function handleToggleActive() {
    if (!product) return
    const nextStatus = product.is_active ? 0 : 1
    setTogglingActive(true)
    setError('')
    try {
      await api.put(`/products/${product.id}`, { is_active: nextStatus })
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to toggle product status'))
    } finally {
      setTogglingActive(false)
    }
  }

  const isVariable = product.variants.length > 1 || product.variants.some((v) => v.attribute_values.length > 0)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <button onClick={() => navigate(ROUTES.PRODUCTS)} className="text-xs font-medium text-slate-400 hover:text-slate-700">
            ← Back to Products
          </button>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{product.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            {product.product_code && <span className="text-xs font-mono text-slate-500">{product.product_code}</span>}
            <Badge tone={product.is_active ? 'green' : 'slate'}>{product.is_active ? 'Active' : 'Inactive'}</Badge>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleToggleActive}
            disabled={togglingActive}
          >
            {product.is_active ? 'Deactivate Product' : 'Activate Product'}
          </Button>

          <Button
            variant="secondary"
            onClick={() => navigate(ROUTES.PRODUCTS)}
            className="flex items-center gap-1.5"
          >
            <span>✕</span>
            <span>Close</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="space-y-6">
        <ProductInformationSection product={product} onError={setError} onChange={load} />

        <ProductImagesSection product={product} onError={setError} onChange={load} />

        {isVariable ? (
          <VariantsSection
            product={product}
            attributes={attributes}
            onError={setError}
            onChange={load}
            onManageImages={setManagingVariant}
          />
        ) : (
          <SimpleVariantSection product={product} onError={setError} onChange={load} />
        )}

        <SpecificationsSection product={product} onError={setError} onChange={load} />
      </div>

      {managingVariant && (
        <VariantImageModal variant={managingVariant} onClose={() => setManagingVariant(null)} onChange={load} onError={setError} />
      )}
    </div>
  )
}

function ProductInformationSection({
  product,
  onError,
  onChange,
}: {
  product: ProductDetail
  onError: (msg: string) => void
  onChange: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(product.name || '')
  const [productCode, setProductCode] = useState(product.product_code || '')
  const [brandId, setBrandId] = useState<string>(product.brand_id ? String(product.brand_id) : '')
  const [categoryIds, setCategoryIds] = useState<number[]>(product.categories?.map((c) => c.id) || [])
  const [subcategoryIds, setSubcategoryIds] = useState<number[]>(product.subcategories?.map((s) => s.id) || [])
  const [shortDesc, setShortDesc] = useState(product.short_description || '')
  const [description, setDescription] = useState(product.description || '')
  const [tags, setTags] = useState(product.tags || '')
  const [expiryDate, setExpiryDate] = useState((product as any).expiry_date ? String((product as any).expiry_date).slice(0, 10) : '')
  const [isActive, setIsActive] = useState(Boolean(product.is_active))
  const [isPosEnabled, setIsPosEnabled] = useState(Boolean(product.is_pos_enabled))
  const [isEcommerceEnabled, setIsEcommerceEnabled] = useState(Boolean(product.is_ecommerce_enabled))
  const [isFeatured, setIsFeatured] = useState(Boolean(product.is_featured))
  const [isTrending, setIsTrending] = useState(Boolean(product.is_trending))
  const [isDeal, setIsDeal] = useState(Boolean(product.is_deal))
  const [returnable, setReturnable] = useState(Boolean(product.returnable))
  const [returnDays, setReturnDays] = useState(String(product.return_window_days || '7'))

  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [allSubcategories, setAllSubcategories] = useState<Subcategory[]>([])
  const [allBrands, setAllBrands] = useState<Brand[]>([])

  useEffect(() => {
    api.get('/categories').then((res) => setAllCategories(res.data?.categories || [])).catch(() => {})
    api.get('/subcategories').then((res) => setAllSubcategories(res.data?.subcategories || [])).catch(() => {})
    api.get('/brands').then((res) => setAllBrands(res.data?.brands || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setName(product.name || '')
    setProductCode(product.product_code || '')
    setBrandId(product.brand_id ? String(product.brand_id) : '')
    setCategoryIds(product.categories?.map((c) => c.id) || [])
    setSubcategoryIds(product.subcategories?.map((s) => s.id) || [])
    setShortDesc(product.short_description || '')
    setDescription(product.description || '')
    setTags(product.tags || '')
    setExpiryDate((product as any).expiry_date ? String((product as any).expiry_date).slice(0, 10) : '')
    setIsActive(Boolean(product.is_active))
    setIsPosEnabled(Boolean(product.is_pos_enabled))
    setIsEcommerceEnabled(Boolean(product.is_ecommerce_enabled))
    setIsFeatured(Boolean(product.is_featured))
    setIsTrending(Boolean(product.is_trending))
    setIsDeal(Boolean(product.is_deal))
    setReturnable(Boolean(product.returnable))
    setReturnDays(String(product.return_window_days || '7'))
  }, [product])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    onError('')
    try {
      await api.put(`/products/${product.id}`, {
        name: name.trim(),
        product_code: productCode.trim() || null,
        brand_id: brandId ? Number(brandId) : null,
        category_ids: categoryIds,
        subcategory_ids: subcategoryIds,
        short_description: shortDesc.trim() || null,
        description: description.trim() || null,
        tags: tags.trim() || null,
        expiry_date: expiryDate || null,
        expiry_applicable: expiryDate ? 1 : 0,
        is_active: isActive ? 1 : 0,
        is_pos_enabled: isPosEnabled ? 1 : 0,
        is_ecommerce_enabled: isEcommerceEnabled ? 1 : 0,
        is_featured: isFeatured ? 1 : 0,
        is_trending: isTrending ? 1 : 0,
        is_deal: isDeal ? 1 : 0,
        returnable: returnable ? 1 : 0,
        return_window_days: returnable ? Number(returnDays) || 7 : null,
      })
      setIsEditing(false)
      onChange()
    } catch (err) {
      onError(apiErrorMessage(err, 'Failed to update product details'))
    } finally {
      setSaving(false)
    }
  }

  const brandName = allBrands.find((b) => String(b.id) === String(product.brand_id))?.name || (product as any).brand_name || 'None'

  return (
    <Card className="p-5 border border-slate-200 shadow-2xs rounded-2xl bg-white space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Product Details & Settings</h2>
          <p className="text-xs text-slate-500">Base information, brand, categories, descriptions, and channel status.</p>
        </div>
        {!isEditing ? (
          <Button size="sm" variant="secondary" onClick={() => setIsEditing(true)}>
            Edit Details
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        )}
      </div>

      {!isEditing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Product Name</span>
            <span className="font-semibold text-slate-900 text-sm">{product.name}</span>
          </div>

          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Product Code / SKU</span>
            <span className="font-mono font-semibold text-slate-800">{product.product_code || '—'}</span>
          </div>

          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Brand</span>
            <span className="font-semibold text-slate-900">{brandName}</span>
          </div>

          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Categories</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {product.categories && product.categories.length > 0 ? (
                product.categories.map((c) => (
                  <span key={c.id} className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold text-[11px]">
                    {c.name}
                  </span>
                ))
              ) : (
                <span className="text-slate-400">None</span>
              )}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Subcategories</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {product.subcategories && product.subcategories.length > 0 ? (
                product.subcategories.map((s) => (
                  <span key={s.id} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px]">
                    {s.name}
                  </span>
                ))
              ) : (
                <span className="text-slate-400">None</span>
              )}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Expiry Date</span>
            <span className="font-semibold text-slate-800">
              {(product as any).expiry_date ? String((product as any).expiry_date).slice(0, 10) : 'Not Applicable'}
            </span>
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Short Description</span>
            <p className="text-slate-700 mt-0.5">{product.short_description || '—'}</p>
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Detailed Description</span>
            <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{product.description || '—'}</p>
          </div>

          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Tags</span>
            <span className="text-slate-700">{product.tags || '—'}</span>
          </div>

          <div className="md:col-span-2 lg:col-span-3 pt-2 border-t border-slate-100 flex flex-wrap gap-2">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${product.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
              ● {product.is_active ? 'Active' : 'Deactivated'}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${product.is_pos_enabled ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-500'}`}>
              POS Enabled
            </span>
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${product.is_ecommerce_enabled ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-500'}`}>
              Online Store Enabled
            </span>
            {product.is_featured ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                ★ Featured
              </span>
            ) : null}
            {product.is_trending ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                🔥 Trending
              </span>
            ) : null}
            {product.is_deal ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                % Deal
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <TextField label="Product Name *" value={name} onChange={(e) => setName(e.target.value)} required />
            <TextField label="Product Code" value={productCode} onChange={(e) => setProductCode(e.target.value)} />
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Brand</label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-hidden"
              >
                <option value="">None / No Brand</option>
                {allBrands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Categories</label>
              <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1 bg-slate-50">
                {allCategories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white p-1 rounded">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(c.id)}
                      onChange={(e) => {
                        if (e.target.checked) setCategoryIds([...categoryIds, c.id])
                        else setCategoryIds(categoryIds.filter((id) => id !== c.id))
                      }}
                      className="rounded border-slate-300 text-purple-600"
                    />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Subcategories</label>
              <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1 bg-slate-50">
                {allSubcategories.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white p-1 rounded">
                    <input
                      type="checkbox"
                      checked={subcategoryIds.includes(s.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSubcategoryIds([...subcategoryIds, s.id])
                        else setSubcategoryIds(subcategoryIds.filter((id) => id !== s.id))
                      }}
                      className="rounded border-slate-300 text-purple-600"
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Short Description</label>
              <textarea
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-800 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Detailed Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-800 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TextField label="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
            <TextField label="Expiry Date" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            {returnable && (
              <TextField label="Return Window (Days)" type="number" value={returnDays} onChange={(e) => setReturnDays(e.target.value)} />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
              <span>Active Product</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
              <input type="checkbox" checked={isPosEnabled} onChange={(e) => setIsPosEnabled(e.target.checked)} className="rounded" />
              <span>POS Enabled</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
              <input type="checkbox" checked={isEcommerceEnabled} onChange={(e) => setIsEcommerceEnabled(e.target.checked)} className="rounded" />
              <span>Online Store Enabled</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="rounded" />
              <span>Featured</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
              <input type="checkbox" checked={isTrending} onChange={(e) => setIsTrending(e.target.checked)} className="rounded" />
              <span>Trending</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
              <input type="checkbox" checked={isDeal} onChange={(e) => setIsDeal(e.target.checked)} className="rounded" />
              <span>Deal</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
              <input type="checkbox" checked={returnable} onChange={(e) => setReturnable(e.target.checked)} className="rounded" />
              <span>Returnable</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

function ProductImagesSection({
  product,
  onError,
  onChange,
}: {
  product: ProductDetail
  onError: (msg: string) => void
  onChange: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    onError('');
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/products/${product.id}/images`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      onChange();
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not upload image'));
    } finally {
      setUploading(false);
    }
  }

  async function setPrimary(imageId: number) {
    await api.patch(`/products/${product.id}/images/${imageId}/primary`);
    onChange();
  }

  async function remove(imageId: number) {
    await api.delete(`/products/${product.id}/images/${imageId}`);
    onChange();
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Product Images</h2>
      <p className="mb-4 text-xs text-slate-500">
        {product.variants.length > 1
          ? 'Generic/common images — color or size-specific images belong on each variant below.'
          : 'Shown on product cards, search results and the storefront.'}
      </p>
      <div className="flex flex-wrap gap-3">
        {product.images.map((img) => (
          <div key={img.id} className="group relative h-24 w-24 overflow-hidden rounded-lg border border-slate-200">
            <img src={imageUrl(img.thumb_path ?? img.image_path)} alt="" className="h-full w-full object-cover" />
            {img.is_primary === 1 && (
              <span className="absolute left-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                PRIMARY
              </span>
            )}
            <div className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/50 group-hover:flex">
              {img.is_primary !== 1 && (
                <button
                  onClick={() => setPrimary(img.id)}
                  title="Set primary"
                  className="rounded bg-white/90 px-1.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-white"
                >
                  ★
                </button>
              )}
              <button
                onClick={() => remove(img.id)}
                title="Delete"
                className="rounded bg-white/90 px-1.5 py-1 text-[10px] font-medium text-red-600 hover:bg-white"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void upload(e.dataTransfer.files);
          }}
          disabled={uploading}
          className={`flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-xs font-medium text-slate-400 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] ${
            dragOver ? 'border-[var(--color-primary)] bg-[var(--color-surface)] text-[var(--color-primary)]' : 'border-[var(--color-border)]'
          }`}
        >
          {uploading ? '…' : <>+<br />Add</>}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
    </Card>
  )
}

function SimpleVariantSection({
  product,
  onError,
  onChange,
}: {
  product: ProductDetail
  onError: (msg: string) => void
  onChange: () => void
}) {
  const variant = product.variants[0];
  const [sku, setSku] = useState(variant?.sku ?? '');
  const [mrp, setMrp] = useState(variant?.mrp ?? '');
  // "Selling Price" shown here initializes from retail_price — the column
  // PricingService.php actually reads first for a RETAIL-type customer,
  // which every walk-in sale defaults to (InvoiceService::createPosSale
  // defaults customerType to 'RETAIL'). Saving writes BOTH normal_price
  // and retail_price together so the edit takes effect at checkout
  // immediately and the fallback column doesn't go stale. The one
  // accepted trade-off: if a distinct Retail-tier override was set via
  // the Retail Price Adjustment page, editing this field resets it back
  // to match the base price — deliberate, not silent, since this is the
  // only place a SIMPLE product's base price can be edited post-creation.
  const [sellingPrice, setSellingPrice] = useState(variant?.retail_price ?? '');
  const [lowStockThreshold, setLowStockThreshold] = useState(variant?.low_stock_threshold ?? '5');
  const [saving, setSaving] = useState(false);

  if (!variant) {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-500">No variant yet — this shouldn't happen for a saved product.</p>
      </Card>
    );
  }

  const status = stockStatus(variant.available, variant.low_stock_threshold);

  async function save() {
    setSaving(true);
    onError('');
    try {
      await api.put(`/variants/${variant.id}`, { sku, mrp, normal_price: sellingPrice, retail_price: sellingPrice });
      if (lowStockThreshold.trim() !== '' && lowStockThreshold !== variant.low_stock_threshold) {
        await api.put(`/inventory/${variant.id}/threshold`, { low_stock_threshold: Number(lowStockThreshold) });
      }
      onChange();
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not update pricing'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Pricing &amp; Inventory</h2>
        <Badge tone={STOCK_STATUS_TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>
      </div>
      <div className="grid grid-cols-5 gap-4">
        <TextField label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
        <TextField label="MRP" type="number" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} />
        <TextField label="Selling Price" type="number" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Stock on hand</span>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{variant.on_hand ?? '0'}</p>
        </div>
        <TextField
          label="Low Stock Alert"
          type="number"
          min="0"
          step="1"
          value={lowStockThreshold}
          onChange={(e) => setLowStockThreshold(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </Card>
  );
}

function VariantsSection({
  product,
  attributes,
  onError,
  onChange,
  onManageImages,
}: {
  product: ProductDetail
  attributes: VariantAttribute[]
  onError: (msg: string) => void
  onChange: () => void
  onManageImages: (variant: ProductVariant) => void
}) {
  const [selectedValueIds, setSelectedValueIds] = useState<number[]>([]);
  const [newRows, setNewRows] = useState<NewVariantRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Record<number, { mrp: string; retail_price: string }>>({});
  const [editingThreshold, setEditingThreshold] = useState<Record<number, string>>({});
  const [addingValueForAttr, setAddingValueForAttr] = useState<number | null>(null);
  const [newValueInput, setNewValueInput] = useState('');
  const [newValueHexInput, setNewValueHexInput] = useState('');
  const [savingNewValue, setSavingNewValue] = useState(false);

  async function handleAddCustomAttributeValue(attributeId: number) {
    if (!newValueInput.trim()) return;
    setSavingNewValue(true);
    try {
      const res = await api.post(`/variant-attributes/${attributeId}/values`, {
        value: newValueInput.trim(),
        color_hex: newValueHexInput.trim() || null,
      });
      const newId = res.data.id;
      // Trigger outer refresh to update attributes list from server
      onChange();
      setSelectedValueIds((prev) => [...prev, newId]);
      setNewValueInput('');
      setNewValueHexInput('');
      setAddingValueForAttr(null);
    } catch (err) {
      onError(apiErrorMessage(err, 'Failed to add custom attribute value'));
    } finally {
      setSavingNewValue(false);
    }
  }

  const valueLookup = useMemo(() => {
    const map = new Map<number, { value: string; colorHex: string | null }>();
    for (const attribute of attributes) {
      for (const value of attribute.values) {
        map.set(value.id, { value: value.value, colorHex: value.color_hex });
      }
    }
    return map;
  }, [attributes]);

  const existingCombinations = useMemo(() => {
    const set = new Set<string>();
    for (const v of product.variants) {
      set.add(
        v.attribute_values
          .map((a) => a.value_id)
          .sort((a, b) => a - b)
          .join('-'),
      );
    }
    return set;
  }, [product.variants]);

  function toggleValue(valueId: number) {
    setSelectedValueIds((prev) => (prev.includes(valueId) ? prev.filter((v) => v !== valueId) : [...prev, valueId]));
  }

  // Recomputes the staged new-variant rows whenever the attribute-value
  // selection changes — same per-row SKU/image/opening-stock/low-stock
  // treatment as Product Create, skipping combinations that already
  // exist on this product.
  useEffect(() => {
    const groups = attributes
      .map((attribute) => attribute.values.map((v) => v.id).filter((id) => selectedValueIds.includes(id)))
      .filter((group) => group.length > 0);

    if (groups.length === 0) {
      setNewRows([]);
      return;
    }

    const combinations = cartesianProduct(groups).filter((valueIds) => {
      const key = [...valueIds].sort((a, b) => a - b).join('-');
      return !existingCombinations.has(key);
    });
    const baseSku = (product.product_code || product.name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'PROD');

    setNewRows((prev) => {
      const byKey = new Map(prev.map((row) => [row.key, row]));
      return combinations.map((valueIds) => {
        const key = valueIds.join('-');
        const existing = byKey.get(key);
        if (existing) return existing;

        const labels = valueIds.map((id) => valueLookup.get(id)?.value ?? '?');
        return {
          key,
          valueIds,
          title: labels.join(' / '),
          sku: `${baseSku}-${valueIds.map((id) => skuAbbr(valueLookup.get(id)?.value ?? '')).join('-')}`,
          openingStock: '',
          lowStockThreshold: '',
          image: null,
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedValueIds, attributes, existingCombinations]);

  function updateRow(key: string, patch: Partial<NewVariantRow>) {
    setNewRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function setRowImage(key: string, file: File | undefined) {
    if (!file) return;
    updateRow(key, { image: { file, previewUrl: URL.createObjectURL(file) } });
  }

  async function createVariants() {
    if (newRows.length === 0) return;
    const emptySku = newRows.find((r) => r.sku.trim() === '');
    if (emptySku) {
      onError(`SKU is required for every variant (missing on "${emptySku.title}")`);
      return;
    }

    setCreating(true);
    onError('');
    try {
      for (const row of newRows) {
        const variantRes = await api.post(`/products/${product.id}/variants`, {
          sku: row.sku.trim(),
          mrp: 0,
          retail_price: 0,
          attribute_value_ids: row.valueIds,
        });
        const variantId = variantRes.data.id;

        if (row.image) {
          const formData = new FormData();
          formData.append('file', row.image.file);
          formData.append('is_primary', '1');
          await api.post(`/variants/${variantId}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        }

        const stock = row.openingStock.trim();
        if (stock !== '' && Number(stock) > 0) {
          await api.post('/inventory/adjustments', { reason: 'Opening stock', items: [{ variant_id: variantId, counted_qty: stock }] });
        }

        if (row.lowStockThreshold.trim() !== '') {
          await api.put(`/inventory/${variantId}/threshold`, { low_stock_threshold: Number(row.lowStockThreshold) });
        }
      }
      setSelectedValueIds([]);
      setNewRows([]);
      onChange();
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not create variants'));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(v: ProductVariant) {
    // "Price" is retail_price — see the comment on SimpleVariantSection's
    // sellingPrice state above for why saveEdit() below also writes
    // normal_price alongside it.
    setEditing((prev) => ({ ...prev, [v.id]: { mrp: v.mrp, retail_price: v.retail_price } }));
  }

  async function saveEdit(variantId: number) {
    const values = editing[variantId];
    if (!values) return;
    // normal_price too, so the base-price fallback doesn't go stale — see
    // the comment on SimpleVariantSection's sellingPrice state above.
    await api.put(`/variants/${variantId}`, { ...values, normal_price: values.retail_price });
    setEditing((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    onChange();
  }

  async function saveThreshold(variantId: number) {
    const value = editingThreshold[variantId];
    if (value === undefined || value.trim() === '') return;
    await api.put(`/inventory/${variantId}/threshold`, { low_stock_threshold: Number(value) });
    setEditingThreshold((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    onChange();
  }

  async function toggleVariantActive(v: ProductVariant) {
    await api.put(`/variants/${v.id}`, { status: v.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
    onChange();
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Variants</h2>
        <p className="text-xs text-slate-500">
          Every variant is its own sellable SKU — pick attribute values to stage new combinations, each with its own image,
          opening stock and low-stock alert.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/30 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Add New Variant Combinations</h3>
        {attributes.map((attr) => {
          const selectedForAttr = attr.values.filter((v) => selectedValueIds.includes(v.id))
          const unselectedForAttr = attr.values.filter((v) => !selectedValueIds.includes(v.id))
          const isAddingValue = addingValueForAttr === attr.id

          return (
            <div key={attr.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs transition hover:border-slate-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    {attr.name}
                  </label>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {selectedForAttr.length} selected
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAddingValueForAttr(isAddingValue ? null : attr.id)}
                  className="text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-extra-009)] flex items-center gap-1"
                >
                  {isAddingValue ? 'Cancel' : `+ Add Custom ${attr.name}`}
                </button>
              </div>

              {/* Dropdown Selector for Colors / Attributes */}
              <div className="flex gap-2">
                <select
                  value=""
                  onChange={(e) => {
                    const valId = Number(e.target.value)
                    if (valId && !selectedValueIds.includes(valId)) {
                      toggleValue(valId)
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                >
                  <option value="">Select a {attr.name} ({unselectedForAttr.length} available)…</option>
                  {unselectedForAttr.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.value} {v.color_hex ? `(${v.color_hex})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Inline Form to Add New Custom Value */}
              {isAddingValue && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-2.5">
                  <input
                    type="text"
                    placeholder={`New ${attr.name} value (e.g. ${attr.name === 'Color' ? 'Lime Green' : attr.name === 'Weight' ? '500g' : 'Value'})`}
                    value={newValueInput}
                    onChange={(e) => setNewValueInput(e.target.value)}
                    className="flex-1 rounded-xl border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                  {attr.name.toLowerCase() === 'color' && (
                    <input
                      type="color"
                      title="Pick Color Hex"
                      value={newValueHexInput || 'var(--color-primary)'}
                      onChange={(e) => setNewValueHexInput(e.target.value)}
                      className="h-7 w-9 cursor-pointer rounded border border-[var(--color-border)] p-0.5"
                    />
                  )}
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingNewValue || !newValueInput.trim()}
                    onClick={() => handleAddCustomAttributeValue(attr.id)}
                  >
                    {savingNewValue ? 'Adding…' : 'Save & Select'}
                  </Button>
                </div>
              )}

              {/* Selected Chips */}
              {selectedForAttr.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedForAttr.map((value) => (
                    <span
                      key={value.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-primary)] shadow-2xs transition hover:bg-[var(--color-border-muted)]"
                    >
                      {value.color_hex && (
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-black/10 shadow-2xs"
                          style={{ backgroundColor: value.color_hex }}
                        />
                      )}
                      {value.value}
                      <button
                        type="button"
                        onClick={() => toggleValue(value.id)}
                        className="ml-1 text-[var(--color-primary-strong)] hover:text-rose-600 font-bold text-xs"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {newRows.length > 0 && (
          <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
                Staged Variants ({newRows.length} combination{newRows.length === 1 ? '' : 's'})
              </h3>
              <span className="text-[11px] font-medium text-slate-500">Attach images and initial stock before creating</span>
            </div>
            {newRows.map((row, index) => (
              <div key={row.key} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">
                    Variant {index + 1}: <span className="text-[var(--color-primary)]">{row.title}</span>
                  </p>
                </div>

                <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Variant Image</label>
                    <label className="group relative flex h-16 w-16 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-white hover:border-[var(--color-primary)] hover:bg-[var(--color-surface)] transition">
                      {row.image ? (
                        <>
                          <img src={row.image.previewUrl} alt="" className="h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                            <span className="text-[10px] font-bold text-white">Change</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-1">
                          <span className="block text-[var(--color-primary)] text-xs font-bold">+ Image</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => setRowImage(row.key, e.target.files?.[0])}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">SKU <span className="text-red-500">*</span></label>
                      <input
                        value={row.sku}
                        onChange={(e) => updateRow(row.key, { sku: e.target.value })}
                        placeholder="SKU"
                        className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Opening Stock</label>
                      <input
                        value={row.openingStock}
                        onChange={(e) => updateRow(row.key, { openingStock: e.target.value })}
                        type="number"
                        min="0"
                        placeholder="Qty e.g. 10"
                        className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Low Stock Alert</label>
                      <input
                        value={row.lowStockThreshold}
                        onChange={(e) => updateRow(row.key, { lowStockThreshold: e.target.value })}
                        type="number"
                        min="0"
                        placeholder="Threshold e.g. 5"
                        className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Button size="sm" onClick={createVariants} disabled={creating}>
                {creating ? 'Creating Variants & Uploading Images…' : `Create ${newRows.length} Variant${newRows.length === 1 ? '' : 's'} With Images`}
              </Button>
            </div>
          </div>
        )}
      </div>

      {product.variants.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b-2 border-[var(--color-extra-003)] uppercase text-[var(--color-extra-001)] bg-[var(--color-extra-005)] text-xs font-black tracking-wider">
              <tr>
                <th className="py-3 px-3">Variant</th>
                <th className="py-3 px-3">SKU</th>
                <th className="py-3 px-3">MRP</th>
                <th className="py-3 px-3">Price</th>
                <th className="py-3 px-3">Stock</th>
                <th className="py-3 px-3">Low Stock Alert</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Images</th>
                <th className="py-3 px-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-extra-004)]">
              {product.variants.map((v) => {
                const label = v.attribute_values.map((a) => a.value).join(' / ') || '—';
                const editValues = editing[v.id];
                const status = stockStatus(v.available, v.low_stock_threshold);
                const thresholdEditing = editingThreshold[v.id];
                return (
                  <tr key={v.id} className={v.status === 'INACTIVE' ? 'opacity-50' : ''}>
                    <td className="py-2 pr-3 font-medium text-slate-900">{label}</td>
                    <td className="py-2 pr-3 text-slate-600">{v.sku}</td>
                    <td className="py-2 pr-3">
                      {editValues ? (
                        <input
                          value={editValues.mrp}
                          onChange={(e) => setEditing((prev) => ({ ...prev, [v.id]: { ...prev[v.id], mrp: e.target.value } }))}
                          className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
                        />
                      ) : (
                        `₹${v.mrp}`
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {editValues ? (
                        <input
                          value={editValues.retail_price}
                          onChange={(e) =>
                            setEditing((prev) => ({ ...prev, [v.id]: { ...prev[v.id], retail_price: e.target.value } }))
                          }
                          className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
                        />
                      ) : (
                        `₹${v.retail_price}`
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{v.on_hand ?? '0'}</td>
                    <td className="py-2 pr-3">
                      <input
                        value={thresholdEditing ?? v.low_stock_threshold ?? '5'}
                        onChange={(e) => setEditingThreshold((prev) => ({ ...prev, [v.id]: e.target.value }))}
                        onBlur={() => saveThreshold(v.id)}
                        type="number"
                        min="0"
                        className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={STOCK_STATUS_TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex -space-x-2">
                        {v.images.slice(0, 3).map((img) => (
                          <img
                            key={img.id}
                            src={imageUrl(img.thumb_path ?? img.image_path)}
                            alt=""
                            className="h-7 w-7 rounded-full border-2 border-white object-cover"
                          />
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <div className="flex justify-end gap-2">
                        {editValues ? (
                          <button onClick={() => saveEdit(v.id)} className="text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-extra-009)]">
                            Save
                          </button>
                        ) : (
                          <button onClick={() => startEdit(v)} className="text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-extra-009)]">
                            Edit
                          </button>
                        )}
                        <button onClick={() => onManageImages(v)} className="text-xs font-medium text-slate-500 hover:text-slate-800">
                          Manage Images
                        </button>
                        <button onClick={() => toggleVariantActive(v)} className="text-xs font-medium text-slate-500 hover:text-slate-800">
                          {v.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function VariantImageModal({
  variant,
  onClose,
  onChange,
  onError,
}: {
  variant: ProductVariant
  onClose: () => void
  onChange: () => void
  onError: (msg: string) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const label = variant.attribute_values.map((a) => a.value).join(' / ') || variant.sku;

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/variants/${variant.id}/images`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      onChange();
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not upload image'));
    } finally {
      setUploading(false);
    }
  }

  async function setPrimary(imageId: number) {
    await api.patch(`/variants/${variant.id}/images/${imageId}/primary`);
    onChange();
  }

  async function remove(imageId: number) {
    await api.delete(`/variants/${variant.id}/images/${imageId}`);
    onChange();
  }

  return (
    <Modal title={`${label} — Images`} onClose={onClose} width="lg">
      <p className="mb-3 text-xs text-slate-500">
        These images are shown only when a customer selects this exact variant — never mixed with another variant's gallery.
      </p>
      <div className="flex flex-wrap gap-3">
        {variant.images.map((img) => (
          <div key={img.id} className="group relative h-28 w-28 overflow-hidden rounded-lg border border-slate-200">
            <img src={imageUrl(img.thumb_path ?? img.image_path)} alt="" className="h-full w-full object-cover" />
            {img.is_primary === 1 && (
              <span className="absolute left-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                PRIMARY
              </span>
            )}
            <div className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/50 group-hover:flex">
              {img.is_primary !== 1 && (
                <button
                  onClick={() => setPrimary(img.id)}
                  className="rounded bg-white/90 px-1.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-white"
                >
                  ★
                </button>
              )}
              <button
                onClick={() => remove(img.id)}
                className="rounded bg-white/90 px-1.5 py-1 text-[10px] font-medium text-red-600 hover:bg-white"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[var(--color-border)] text-xs font-medium text-slate-400 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          {uploading ? '…' : <>+<br />Add</>}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
    </Modal>
  );
}

function SpecificationsSection({
  product,
  onError,
  onChange,
}: {
  product: ProductDetail
  onError: (msg: string) => void
  onChange: () => void
}) {
  const [rows, setRows] = useState(product.specifications.map((s) => ({ name: s.name, value: s.value })));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(product.specifications.map((s) => ({ name: s.name, value: s.value })));
  }, [product.specifications]);

  function update(index: number, field: 'name' | 'value', value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }
  function add() {
    setRows((prev) => [...prev, { name: '', value: '' }]);
  }
  function remove(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    onError('');
    try {
      const valid = rows.filter((r) => r.name.trim() !== '' && r.value.trim() !== '');
      await api.put(`/products/${product.id}/specifications`, { specifications: valid });
      onChange();
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not save specifications'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-sm font-semibold text-slate-900">Specifications</h2>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={row.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              placeholder="Name (e.g. Material)"
              className="w-1/2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
            />
            <input
              value={row.value}
              onChange={(e) => update(i, 'value', e.target.value)}
              placeholder="Value (e.g. Plastic)"
              className="w-1/2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
              ✕
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={add}>
            + Add Specification
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Specifications'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
