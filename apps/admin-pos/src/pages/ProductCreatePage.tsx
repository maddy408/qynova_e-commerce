import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Select, TextArea, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Brand, Category, GstRate, HsnCode, Subcategory, Unit, VariantAttribute } from '../lib/types'

const SECTIONS = [
  { id: 'basic', label: '1. Basic Information' },
  { id: 'classification', label: '2. Classification' },
  { id: 'images', label: '3. Product Images' },
  { id: 'type', label: '4. Product Type' },
  { id: 'inventory', label: '5. Inventory' },
  { id: 'ecommerce', label: '6. E-commerce & Shipping' },
  { id: 'seo', label: '7. SEO & Visibility' },
  { id: 'review', label: '8. Review & Save' },
] as const

interface StagedImage {
  file: File
  previewUrl: string
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function ProductCreatePage() {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]['id']>('basic')

  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [gstRates, setGstRates] = useState<GstRate[]>([])
  const [hsnCodes, setHsnCodes] = useState<HsnCode[]>([])
  const [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>([])

  // 1. Basic information
  const [name, setName] = useState('')
  const [productCode, setProductCode] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')
  const [bulletPoints, setBulletPoints] = useState<string[]>([''])

  // 2. Classification
  const [brandId, setBrandId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<number | null>(null)
  const [subcategoryIds, setSubcategoryIds] = useState<number[]>([])

  // 3. Images — staged client-side; the product needs a real ID before
  // an image can be uploaded, so these are only sent right after Save
  // creates the product, not as the user adds them.
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([])
  const [mainImageIndex, setMainImageIndex] = useState(0)

  // 4. Product type + pricing/tax (shared by Simple, and as the default
  // applied to every generated variant for Variable).
  const [productType, setProductType] = useState<'SIMPLE' | 'VARIABLE'>('SIMPLE')
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [mrp, setMrp] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [gstRateId, setGstRateId] = useState('')
  const [hsnCodeId, setHsnCodeId] = useState('')
  const [selectedValueIds, setSelectedValueIds] = useState<number[]>([])

  // 5. Inventory (Simple only — a Variable product's stock is set per
  // generated variant on the product detail page, since there's no
  // honest single "opening stock" before the variants exist).
  const [openingStock, setOpeningStock] = useState('')
  const [lowStockAlert, setLowStockAlert] = useState('')

  // 6. E-commerce & shipping
  const [weightGrams, setWeightGrams] = useState('')
  const [lengthCm, setLengthCm] = useState('')
  const [widthCm, setWidthCm] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [returnable, setReturnable] = useState(true)
  const [returnWindowDays, setReturnWindowDays] = useState('')
  const [replacementAvailable, setReplacementAvailable] = useState(false)
  const [refundAvailable, setRefundAvailable] = useState(true)
  const [shippingRequired, setShippingRequired] = useState(true)
  const [codAvailable, setCodAvailable] = useState(true)

  // 7. SEO & visibility
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [searchKeywords, setSearchKeywords] = useState('')
  const [isFeatured, setIsFeatured] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [showDiscount, setShowDiscount] = useState(true)
  const [colorSearch, setColorSearch] = useState('')

  // Specifications (kept from the previous build — free-form name/value rows)
  const [specs, setSpecs] = useState<{ name: string; value: string }[]>([{ name: '', value: '' }])

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitStep, setSubmitStep] = useState('')

  useEffect(() => {
    api.get('/categories').then((res) => setCategories(res.data.categories))
    api.get('/subcategories').then((res) => setSubcategories(res.data.subcategories))
    api.get('/brands').then((res) => setBrands(res.data.brands))
    api.get('/units').then((res) => setUnits(res.data.units))
    api.get('/gst-rates').then((res) => setGstRates(res.data.gst_rates))
    api.get('/hsn-codes').then((res) => setHsnCodes(res.data.hsn_codes))
    api.get('/variant-attributes').then((res) => setVariantAttributes(res.data.attributes))
  }, [])

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name))
  }, [name, slugTouched])

  useEffect(() => {
    return () => {
      stagedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const eligibleSubcategories = useMemo(
    () => subcategories.filter((s) => (s.category_ids ?? []).some((id) => categoryIds.includes(id))),
    [subcategories, categoryIds],
  )

  function toggleCategory(id: number) {
    setCategoryIds((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
      if (!next.includes(id) && primaryCategoryId === id) setPrimaryCategoryId(next[0] ?? null)
      if (!prev.includes(id) && prev.length === 0) setPrimaryCategoryId(id)
      return next
    })
  }

  useEffect(() => {
    const eligibleIds = new Set(eligibleSubcategories.map((s) => s.id))
    setSubcategoryIds((prev) => prev.filter((id) => eligibleIds.has(id)))
  }, [eligibleSubcategories])

  function toggleSubcategory(id: number) {
    setSubcategoryIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  function updateBullet(index: number, value: string) {
    setBulletPoints((prev) => prev.map((b, i) => (i === index ? value : b)))
  }
  function addBullet() {
    setBulletPoints((prev) => [...prev, ''])
  }
  function removeBullet(index: number) {
    setBulletPoints((prev) => prev.filter((_, i) => i !== index))
  }

  function addImages(files: FileList | null) {
    if (!files) return
    const next = Array.from(files).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))
    setStagedImages((prev) => [...prev, ...next])
  }
  function removeStagedImage(index: number) {
    setStagedImages((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl)
      const next = prev.filter((_, i) => i !== index)
      return next
    })
    setMainImageIndex((prev) => (prev === index ? 0 : prev > index ? prev - 1 : prev))
  }

  function toggleAttributeValue(valueId: number) {
    setSelectedValueIds((prev) => (prev.includes(valueId) ? prev.filter((v) => v !== valueId) : [...prev, valueId]))
  }

  function updateSpec(index: number, field: 'name' | 'value', value: string) {
    setSpecs((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }
  function addSpec() {
    setSpecs((prev) => [...prev, { name: '', value: '' }])
  }
  function removeSpec(index: number) {
    setSpecs((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (categoryIds.length === 0) {
      setError('Select at least one category')
      setActiveSection('classification')
      return
    }

    if (productType === 'SIMPLE' && (sku.trim() === '' || mrp === '' || sellingPrice === '')) {
      setError('SKU, MRP and Selling Price are required for a simple product')
      setActiveSection('type')
      return
    }

    if (productType === 'VARIABLE' && selectedValueIds.length === 0) {
      setError('Pick at least one attribute value to generate variants from')
      setActiveSection('type')
      return
    }

    setSubmitting(true)
    try {
      setSubmitStep('Creating product…')
      const res = await api.post('/products', {
        name,
        slug: slug || undefined,
        product_code: productCode || null,
        short_description: shortDescription || null,
        description: description || null,
        bullet_points: bulletPoints.filter((b) => b.trim() !== ''),
        tags: searchKeywords || null,
        brand_id: brandId || null,
        unit_id: unitId || null,
        category_ids: categoryIds,
        primary_category_id: primaryCategoryId,
        subcategory_ids: subcategoryIds,
        weight_grams: weightGrams || null,
        length_cm: lengthCm || null,
        width_cm: widthCm || null,
        height_cm: heightCm || null,
        returnable,
        return_window_days: returnable ? returnWindowDays || null : null,
        replacement_available: replacementAvailable,
        refund_available: refundAvailable,
        shipping_required: shippingRequired,
        cod_available: codAvailable,
        meta_title: metaTitle || null,
        meta_description: metaDescription || null,
        is_featured: isFeatured,
        is_active: isActive,
        show_discount: showDiscount,
      })
      const productId = res.data.id

      if (productType === 'SIMPLE') {
        setSubmitStep('Creating variant…')
        const variantRes = await api.post(`/products/${productId}/variants`, {
          sku,
          barcode: barcode || null,
          mrp,
          retail_price: sellingPrice,
          purchase_price: costPrice || null,
          gst_rate_id: gstRateId || null,
          hsn_code_id: hsnCodeId || null,
          is_default: true,
        })
        const variantId = variantRes.data.id

        const stock = openingStock.trim()
        if (stock !== '' && Number(stock) > 0) {
          setSubmitStep('Setting opening stock…')
          await api.post('/inventory/adjustments', {
            reason: 'Opening stock',
            items: [{ variant_id: variantId, counted_qty: stock }],
          })
        }

        if (lowStockAlert.trim() !== '') {
          setSubmitStep('Setting low stock alert…')
          await api.put(`/inventory/${variantId}/threshold`, { low_stock_threshold: Number(lowStockAlert) })
        }
      } else {
        setSubmitStep('Generating variants…')
        const groupsByAttribute = new Map<number, number[]>()
        for (const attribute of variantAttributes) {
          const ids = attribute.values.map((v) => v.id).filter((id) => selectedValueIds.includes(id))
          if (ids.length > 0) groupsByAttribute.set(attribute.id, ids)
        }

        const generateRes = await api.post(`/products/${productId}/variants/generate`, {
          attribute_value_groups: Array.from(groupsByAttribute.values()),
          defaults: {
            mrp: mrp || undefined,
            retail_price: sellingPrice || undefined,
            purchase_price: costPrice || undefined,
            gst_rate_id: gstRateId || undefined,
            hsn_code_id: hsnCodeId || undefined,
          },
        })

        const createdVariantIds: number[] = generateRes.data.created ?? []

        const stock = openingStock.trim()
        if (stock !== '' && Number(stock) > 0 && createdVariantIds.length > 0) {
          setSubmitStep('Setting opening stock for variants…')
          await api.post('/inventory/adjustments', {
            reason: 'Opening stock',
            items: createdVariantIds.map((varId) => ({ variant_id: varId, counted_qty: stock })),
          })
        }

        if (lowStockAlert.trim() !== '' && createdVariantIds.length > 0) {
          setSubmitStep('Setting low stock alert for variants…')
          for (const varId of createdVariantIds) {
            await api.put(`/inventory/${varId}/threshold`, { low_stock_threshold: Number(lowStockAlert) })
          }
        }
      }

      if (stagedImages.length > 0) {
        setSubmitStep('Uploading images…')
        for (let i = 0; i < stagedImages.length; i++) {
          const formData = new FormData()
          formData.append('file', stagedImages[i].file)
          formData.append('is_primary', i === mainImageIndex ? '1' : '0')
          await api.post(`/products/${productId}/images`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        }
      }

      const validSpecs = specs.filter((s) => s.name.trim() !== '' && s.value.trim() !== '')
      if (validSpecs.length > 0) {
        setSubmitStep('Saving specifications…')
        await api.put(`/products/${productId}/specifications`, { specifications: validSpecs })
      }

      navigate(`/products/${productId}`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create product'))
      setSubmitStep('')
    } finally {
      setSubmitting(false)
    }
  }

  const computedDiscountPercent = useMemo(() => {
    const m = Number(mrp)
    const s = Number(sellingPrice)
    if (m > 0 && s > 0 && m > s) {
      return Math.round(((m - s) / m) * 100)
    }
    return 0
  }, [mrp, sellingPrice])

  const priceFieldsCard = (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <TextField label="MRP (₹)" required type="number" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="e.g. 999" />
        <TextField
          label="Selling Price (₹)"
          required
          type="number"
          step="0.01"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
          placeholder="e.g. 799"
        />
        <TextField label="Cost / Purchase Price (₹)" type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="e.g. 500" />
        <Select label="GST Rate" value={gstRateId} onChange={(e) => setGstRateId(e.target.value)}>
          <option value="">— None —</option>
          {gstRates.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Select label="HSN Code" value={hsnCodeId} onChange={(e) => setHsnCodeId(e.target.value)}>
          <option value="">— None —</option>
          {hsnCodes.map((h) => (
            <option key={h.id} value={h.id}>
              {h.code}
            </option>
          ))}
        </Select>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Auto Discount</label>
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 h-[38px]">
            <span>{computedDiscountPercent}% OFF</span>
            {mrp && sellingPrice && Number(mrp) > Number(sellingPrice) && (
              <span className="text-[10px] font-medium text-emerald-600">(Save ₹{(Number(mrp) - Number(sellingPrice)).toFixed(2)})</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={showDiscount}
            onChange={(e) => setShowDiscount(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          <span className="ml-2 text-xs font-medium text-slate-700">Show Discount Badge on E-Commerce</span>
        </label>
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Create Product</h1>
        <p className="mt-1 text-sm text-slate-500">
          Images and variants are created together with the product when you save — nothing is deferred to a second screen.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                activeSection === s.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="space-y-6">
          {error && <Alert>{error}</Alert>}

          <Card className={`space-y-4 p-5 ${activeSection === 'basic' ? '' : 'hidden'}`}>
            <h2 className="text-sm font-semibold text-slate-900">Basic Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Product Title" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Classic T-Shirt" />
              <TextField label="Product Code" value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="e.g. TSH" />
            </div>
            <TextField
              label="Short Description"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder="One line shown on product cards"
            />
            <TextArea label="Full Description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />

            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">Bullet Points</span>
              <div className="space-y-2">
                {bulletPoints.map((bullet, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={bullet}
                      onChange={(e) => updateBullet(i, e.target.value)}
                      placeholder="e.g. Premium cotton fabric"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeBullet(i)}>
                      ✕
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={addBullet}>
                  + Add bullet
                </Button>
              </div>
            </div>
          </Card>

          <Card className={`space-y-4 p-5 ${activeSection === 'classification' ? '' : 'hidden'}`}>
            <h2 className="text-sm font-semibold text-slate-900">Classification</h2>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">— None —</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <Select label="Unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">— None —</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.short_code})
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Categories <span className="text-red-500">*</span>
                </span>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                      <span className="flex items-center gap-2 text-slate-700">
                        <input
                          type="checkbox"
                          checked={categoryIds.includes(c.id)}
                          onChange={() => toggleCategory(c.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        {c.name}
                      </span>
                      {categoryIds.includes(c.id) && (
                        <button
                          type="button"
                          onClick={() => setPrimaryCategoryId(c.id)}
                          title={primaryCategoryId === c.id ? 'Primary category' : 'Set as primary'}
                          className={primaryCategoryId === c.id ? 'text-amber-500' : 'text-slate-300 hover:text-slate-400'}
                        >
                          ★
                        </button>
                      )}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-2 block text-sm font-medium text-slate-700">Subcategories</span>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {eligibleSubcategories.length === 0 ? (
                    <p className="p-2 text-sm text-slate-400">
                      {categoryIds.length === 0 ? 'Select a category first.' : 'No subcategories mapped yet.'}
                    </p>
                  ) : (
                    eligibleSubcategories.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={subcategoryIds.includes(s.id)}
                          onChange={() => toggleSubcategory(s.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        {s.name}
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className={`space-y-4 p-5 ${activeSection === 'images' ? '' : 'hidden'}`}>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Product Images</h2>
              <p className="text-xs text-slate-500">
                Added when you click "Create Product" below. Pick one as the main image — the rest form the gallery.
              </p>
            </div>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-6 text-center hover:border-indigo-400">
              <span className="text-sm font-medium text-slate-600">Click to choose images</span>
              <span className="mt-1 text-xs text-slate-400">JPG, PNG or WEBP — multiple allowed</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => addImages(e.target.files)} />
            </label>

            {stagedImages.length > 0 && (
              <div className="grid grid-cols-4 gap-3">
                {stagedImages.map((img, i) => (
                  <div key={img.previewUrl} className={`relative overflow-hidden rounded-lg border-2 ${i === mainImageIndex ? 'border-indigo-500' : 'border-slate-200'}`}>
                    <img src={img.previewUrl} alt="" className="h-24 w-full object-cover" />
                    <div className="flex items-center justify-between bg-white px-1.5 py-1 text-[11px]">
                      <button type="button" onClick={() => setMainImageIndex(i)} className={i === mainImageIndex ? 'font-medium text-indigo-600' : 'text-slate-500 hover:text-slate-700'}>
                        {i === mainImageIndex ? '★ Main' : 'Set main'}
                      </button>
                      <button type="button" onClick={() => removeStagedImage(i)} className="text-red-500 hover:text-red-700">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className={`space-y-4 p-5 ${activeSection === 'type' ? '' : 'hidden'}`}>
            <h2 className="text-sm font-semibold text-slate-900">Product Type, Pricing &amp; Tax</h2>
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Product Type <span className="text-red-500">*</span>
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setProductType('SIMPLE')}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                    productType === 'SIMPLE' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  Simple Product
                </button>
                <button
                  type="button"
                  onClick={() => setProductType('VARIABLE')}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                    productType === 'VARIABLE' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  Variable Product
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {productType === 'SIMPLE'
                  ? 'No variants — one SKU, one price, one stock count.'
                  : 'Pick attribute values below (e.g. Color x Size) — every combination is created as a variant the moment you save, using the pricing below as a starting point for each.'}
              </p>
            </div>

            {productType === 'SIMPLE' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <TextField label="SKU" required value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. TSH-001" />
                  <TextField label="Barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                </div>
                {priceFieldsCard}
              </>
            ) : (
              <>
                <div>
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    Attribute Values <span className="text-red-500">*</span>
                  </span>
                  {variantAttributes.length === 0 ? (
                    <p className="text-sm text-slate-400">No variant attributes set up yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {variantAttributes.map((attribute) => {
                        const isColor = attribute.name.toLowerCase().includes('color')
                        const selectedForAttr = attribute.values.filter((v) => selectedValueIds.includes(v.id))
                        const unselectedForAttr = attribute.values.filter((v) => !selectedValueIds.includes(v.id))

                        return (
                          <div key={attribute.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                Select {attribute.name}
                              </label>
                              <span className="text-[11px] text-slate-500 font-medium">
                                {selectedForAttr.length} selected
                              </span>
                            </div>

                            {/* Dropdown Selector for Colors / Attributes */}
                            <div className="flex gap-2">
                              <select
                                value=""
                                onChange={(e) => {
                                  const valId = Number(e.target.value)
                                  if (valId && !selectedValueIds.includes(valId)) {
                                    setSelectedValueIds((prev) => [...prev, valId])
                                  }
                                }}
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                <option value="">Choose a {attribute.name} from list ({unselectedForAttr.length} available)…</option>
                                {unselectedForAttr.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.value} {v.color_hex ? `(${v.color_hex})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Selected Chips */}
                            {selectedForAttr.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {selectedForAttr.map((value) => (
                                  <span
                                    key={value.id}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 shadow-2xs"
                                  >
                                    {value.color_hex && (
                                      <span
                                        className="inline-block h-3 w-3 rounded-full border border-black/10"
                                        style={{ backgroundColor: value.color_hex }}
                                      />
                                    )}
                                    {value.value}
                                    <button
                                      type="button"
                                      onClick={() => toggleAttributeValue(value.id)}
                                      className="ml-0.5 text-indigo-400 hover:text-indigo-900 font-bold"
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
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-medium">Starting price &amp; tax for every generated variant:</p>
                {priceFieldsCard}

                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
                  <h3 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">Initial Stock &amp; Alert Threshold for Variants</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <TextField
                      label="Opening Stock (per generated variant)"
                      type="number"
                      step="1"
                      value={openingStock}
                      onChange={(e) => setOpeningStock(e.target.value)}
                      placeholder="e.g. 100"
                    />
                    <TextField
                      label="Low Stock Alert Threshold"
                      type="number"
                      step="1"
                      value={lowStockAlert}
                      onChange={(e) => setLowStockAlert(e.target.value)}
                      placeholder="Default: 5"
                    />
                  </div>
                  <p className="text-[11px] text-indigo-700">
                    ✓ This opening stock &amp; low stock alert count will be applied automatically to all generated variants (e.g. Blue/L, Red/XL).
                  </p>
                </div>
              </>
            )}
          </Card>

          <Card className={`space-y-4 p-5 ${activeSection === 'inventory' ? '' : 'hidden'}`}>
            <h2 className="text-sm font-semibold text-slate-900">Inventory</h2>
            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Opening Stock"
                type="number"
                step="1"
                value={openingStock}
                onChange={(e) => setOpeningStock(e.target.value)}
                placeholder="e.g. 50"
              />
              <TextField
                label="Low Stock Alert Threshold"
                type="number"
                step="1"
                value={lowStockAlert}
                onChange={(e) => setLowStockAlert(e.target.value)}
                placeholder="Default: 5"
              />
            </div>
            {productType === 'VARIABLE' && (
              <p className="text-xs text-indigo-600 font-medium">
                ✓ Opening stock and low stock alerts set here will be automatically applied to all created variants upon saving.
              </p>
            )}
          </Card>

          <Card className={`space-y-4 p-5 ${activeSection === 'ecommerce' ? '' : 'hidden'}`}>
            <h2 className="text-sm font-semibold text-slate-900">E-commerce &amp; Shipping</h2>
            <div className="grid grid-cols-4 gap-4">
              <TextField label="Weight (g)" type="number" step="0.01" value={weightGrams} onChange={(e) => setWeightGrams(e.target.value)} />
              <TextField label="Length (cm)" type="number" step="0.01" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
              <TextField label="Width (cm)" type="number" step="0.01" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
              <TextField label="Height (cm)" type="number" step="0.01" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={shippingRequired} onChange={(e) => setShippingRequired(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                Shipping required
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={codAvailable} onChange={(e) => setCodAvailable(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                Cash on Delivery available
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={returnable} onChange={(e) => setReturnable(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                Returnable
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={replacementAvailable} onChange={(e) => setReplacementAvailable(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                Replacement available
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={refundAvailable} onChange={(e) => setRefundAvailable(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                Refund available
              </label>
            </div>
            {returnable && (
              <TextField
                label="Return Window (days)"
                type="number"
                step="1"
                value={returnWindowDays}
                onChange={(e) => setReturnWindowDays(e.target.value)}
                className="max-w-xs"
              />
            )}
          </Card>

          <Card className={`space-y-4 p-5 ${activeSection === 'seo' ? '' : 'hidden'}`}>
            <h2 className="text-sm font-semibold text-slate-900">SEO &amp; Visibility</h2>
            <TextField
              label="Slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(slugify(e.target.value))
              }}
              placeholder="auto-generated-from-title"
            />
            <TextField label="Meta Title" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
            <TextArea label="Meta Description" rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
            <TextField
              label="Search Keywords"
              value={searchKeywords}
              onChange={(e) => setSearchKeywords(e.target.value)}
              placeholder="Space-separated, e.g. cleaning brush floor bathroom"
            />
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                Featured
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                Active
              </label>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Specifications</h3>
              <p className="mb-2 text-xs text-slate-500">Free-form name/value rows — no fixed column per attribute.</p>
              <div className="space-y-2">
                {specs.map((spec, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={spec.name}
                      onChange={(e) => updateSpec(i, 'name', e.target.value)}
                      placeholder="Specification name (e.g. Material)"
                      className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      value={spec.value}
                      onChange={(e) => updateSpec(i, 'value', e.target.value)}
                      placeholder="Value (e.g. Plastic)"
                      className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeSpec(i)}>
                      ✕
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={addSpec}>
                  + Add Specification
                </Button>
              </div>
            </div>
          </Card>

          <Card className={`space-y-4 p-5 ${activeSection === 'review' ? '' : 'hidden'}`}>
            <h2 className="text-sm font-semibold text-slate-900">Review &amp; Save</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-slate-500">Title</dt>
                <dd className="font-medium text-slate-900">{name || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Type</dt>
                <dd className="font-medium text-slate-900">{productType === 'SIMPLE' ? 'Simple Product' : `Variable Product (${selectedValueIds.length} value(s) selected)`}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Categories</dt>
                <dd className="font-medium text-slate-900">{categoryIds.length} selected</dd>
              </div>
              <div>
                <dt className="text-slate-500">Images</dt>
                <dd className="font-medium text-slate-900">{stagedImages.length} staged</dd>
              </div>
              {productType === 'SIMPLE' && (
                <>
                  <div>
                    <dt className="text-slate-500">SKU</dt>
                    <dd className="font-medium text-slate-900">{sku || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Price</dt>
                    <dd className="font-medium text-slate-900">{sellingPrice ? `₹${sellingPrice}` : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Opening Stock</dt>
                    <dd className="font-medium text-slate-900">{openingStock || '0'}</dd>
                  </div>
                </>
              )}
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd className="font-medium text-slate-900">{isActive ? 'Active' : 'Inactive'}{isFeatured ? ' · Featured' : ''}</dd>
              </div>
            </dl>
            <p className="text-xs text-slate-500">
              Saving creates the product, {productType === 'SIMPLE' ? 'its variant and opening stock' : 'every generated variant'},
              uploads the staged images, and sets specifications — all in one go.
            </p>
          </Card>

          <div className="flex items-center justify-end gap-3">
            {submitting && submitStep && <span className="text-sm text-slate-500">{submitStep}</span>}
            <Button type="button" variant="secondary" onClick={() => navigate('/products')}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Product'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
