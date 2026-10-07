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

interface VariantRow {
  key: string
  valueIds: number[]
  title: string
  sku: string
  wholesalePrice?: string
  openingStock: string
  lowStockThreshold: string
  images: StagedImage[]
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Same abbreviation rule VariantService::skuSlug()/generateCombinations() uses server-side — kept only as a starting point, the admin can edit every row's SKU before saving. */
function skuAbbr(value: string) {
  const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return (clean || 'VAL').slice(0, 3)
}

function cartesianProduct<T>(groups: T[][]): T[][] {
  return groups.reduce<T[][]>((acc, group) => acc.flatMap((combo) => group.map((value) => [...combo, value])), [[]])
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
  const [wholesalePrice, setWholesalePrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [pricingType, setPricingType] = useState<'RETAIL_WHOLESALE' | 'RETAIL_ONLY' | 'WHOLESALE_ONLY' | 'CUSTOMERWISE'>('RETAIL_WHOLESALE')
  const [gstRateId, setGstRateId] = useState('')
  const [hsnCodeId, setHsnCodeId] = useState('')
  const [selectedValueIds, setSelectedValueIds] = useState<number[]>([])
  const [addingValueForAttr, setAddingValueForAttr] = useState<number | null>(null)
  const [newValueInput, setNewValueInput] = useState('')
  const [newValueHexInput, setNewValueHexInput] = useState('')
  const [savingNewValue, setSavingNewValue] = useState(false)
  // Every variant is its own sellable SKU — image, opening stock and
  // low-stock threshold are never shared across generated combinations,
  // each row below holds its own.
  const [variantRows, setVariantRows] = useState<VariantRow[]>([])

  async function handleAddCustomAttributeValue(attributeId: number) {
    if (!newValueInput.trim()) return
    setSavingNewValue(true)
    try {
      const res = await api.post(`/variant-attributes/${attributeId}/values`, {
        value: newValueInput.trim(),
        color_hex: newValueHexInput.trim() || null,
      })
      const newId = res.data.id
      setVariantAttributes((prev) =>
        prev.map((attr) =>
          attr.id === attributeId
            ? {
                ...attr,
                values: [
                  ...attr.values,
                  {
                    id: newId,
                    attribute_id: attributeId,
                    value: newValueInput.trim(),
                    color_hex: newValueHexInput.trim() || null,
                    sort_order: attr.values.length + 1,
                    status: 'ACTIVE',
                    created_at: new Date().toISOString(),
                  },
                ],
              }
            : attr
        )
      )
      setSelectedValueIds((prev) => [...prev, newId])
      setNewValueInput('')
      setNewValueHexInput('')
      setAddingValueForAttr(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to add custom attribute value'))
    } finally {
      setSavingNewValue(false)
    }
  }

  // 5. Inventory (Simple product only — a Variable product's stock is
  // configured per row above, never as one shared value for every variant).
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

  const eligibleBrands = useMemo(() => {
    if (categoryIds.length === 0) return brands
    const mapped = brands.filter((b) => (b.category_ids ?? []).some((id) => categoryIds.includes(id)))
    return mapped.length > 0 ? mapped : brands
  }, [brands, categoryIds])

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

  const valueLookup = useMemo(() => {
    const map = new Map<number, { value: string; colorHex: string | null }>()
    for (const attribute of variantAttributes) {
      for (const value of attribute.values) {
        map.set(value.id, { value: value.value, colorHex: value.color_hex })
      }
    }
    return map
  }, [variantAttributes])

  // Recomputes the per-variant row list whenever the attribute-value
  // selection changes: adds a fresh row (auto title/SKU, blank stock) for
  // every newly-possible combination, drops rows for combinations no
  // longer selected, and leaves already-edited rows untouched.
  useEffect(() => {
    const groups = variantAttributes
      .map((attribute) => attribute.values.map((v) => v.id).filter((id) => selectedValueIds.includes(id)))
      .filter((group) => group.length > 0)

    if (groups.length === 0) {
      setVariantRows([])
      return
    }

    const combinations = cartesianProduct(groups)
    const baseSku = (productCode || slugify(name).toUpperCase() || 'PROD').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'PROD'

    setVariantRows((prev) => {
      const byKey = new Map(prev.map((row) => [row.key, row]))
      return combinations.map((valueIds) => {
        const key = valueIds.join('-')
        const existing = byKey.get(key)
        if (existing) return existing

        const labels = valueIds.map((id) => valueLookup.get(id)?.value ?? '?')
        return {
          key,
          valueIds,
          title: labels.join(' / '),
          sku: `${baseSku}-${valueIds.map((id) => skuAbbr(valueLookup.get(id)?.value ?? '')).join('-')}`,
          openingStock: '',
          lowStockThreshold: '',
          images: [],
        }
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedValueIds, variantAttributes])

  function updateVariantRow(key: string, patch: Partial<VariantRow>) {
    setVariantRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function addVariantRowImages(key: string, files: FileList | null) {
    if (!files) return
    const next = Array.from(files).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))
    setVariantRows((prev) => prev.map((row) => (row.key === key ? { ...row, images: [...row.images, ...next] } : row)))
  }

  function removeVariantRowImage(key: string, index: number) {
    setVariantRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row
        URL.revokeObjectURL(row.images[index].previewUrl)
        return { ...row, images: row.images.filter((_, i) => i !== index) }
      }),
    )
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

    if (productType === 'VARIABLE') {
      if (variantRows.length === 0) {
        setError('Pick at least one attribute value to generate variants from')
        setActiveSection('type')
        return
      }
      const emptySkuRow = variantRows.find((r) => r.sku.trim() === '')
      if (emptySkuRow) {
        setError(`SKU is required for every variant (missing on "${emptySkuRow.title}")`)
        setActiveSection('type')
        return
      }
      const skuCounts = new Map<string, number>()
      for (const row of variantRows) skuCounts.set(row.sku.trim(), (skuCounts.get(row.sku.trim()) ?? 0) + 1)
      const dupeSku = [...skuCounts.entries()].find(([, count]) => count > 1)
      if (dupeSku) {
        setError(`SKU "${dupeSku[0]}" is used by more than one variant — SKUs must be unique`)
        setActiveSection('type')
        return
      }
      const negativeRow = variantRows.find((r) => Number(r.openingStock || '0') < 0 || Number(r.lowStockThreshold || '0') < 0)
      if (negativeRow) {
        setError(`Opening stock and low stock threshold cannot be negative (see "${negativeRow.title}")`)
        setActiveSection('type')
        return
      }
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
          wholesale_price: wholesalePrice || null,
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
        // Every row is its own sellable SKU: created individually (not
        // via the bulk generator, which only takes one shared opening
        // stock/threshold for everything) so each combination's image,
        // opening stock and low-stock threshold land on that exact
        // variant and nowhere else.
        for (let i = 0; i < variantRows.length; i++) {
          const row = variantRows[i]
          setSubmitStep(`Creating variant ${i + 1} of ${variantRows.length} (${row.title})…`)

          const variantRes = await api.post(`/products/${productId}/variants`, {
            sku: row.sku.trim(),
            mrp: mrp || 0,
            retail_price: sellingPrice || 0,
            wholesale_price: row.wholesalePrice || wholesalePrice || null,
            purchase_price: costPrice || null,
            gst_rate_id: gstRateId || null,
            hsn_code_id: hsnCodeId || null,
            attribute_value_ids: row.valueIds,
          })
          const variantId = variantRes.data.id

          if (row.images.length > 0) {
            setSubmitStep(`Uploading images for ${row.title}…`)
            for (let imgIndex = 0; imgIndex < row.images.length; imgIndex++) {
              const formData = new FormData()
              formData.append('file', row.images[imgIndex].file)
              formData.append('is_primary', imgIndex === 0 ? '1' : '0')
              await api.post(`/variants/${variantId}/images`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
              })
            }
          }

          const stock = row.openingStock.trim()
          if (stock !== '' && Number(stock) > 0) {
            setSubmitStep(`Setting opening stock for ${row.title}…`)
            await api.post('/inventory/adjustments', {
              reason: 'Opening stock',
              items: [{ variant_id: variantId, counted_qty: stock }],
            })
          }

          if (row.lowStockThreshold.trim() !== '') {
            setSubmitStep(`Setting low stock alert for ${row.title}…`)
            await api.put(`/inventory/${variantId}/threshold`, { low_stock_threshold: Number(row.lowStockThreshold) })
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
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
          Pricing Type &amp; Selection Strategy
        </label>
        <Select value={pricingType} onChange={(e: any) => setPricingType(e.target.value)} className="w-full bg-white text-xs">
          <option value="RETAIL_WHOLESALE">Wholesale &amp; Retail Price (Standard Dual Pricing)</option>
          <option value="RETAIL_ONLY">Retail Price Only</option>
          <option value="WHOLESALE_ONLY">Wholesale Price Only</option>
          <option value="CUSTOMERWISE">Customer-wise / Custom Tier Price</option>
        </Select>
        <p className="text-[11px] text-slate-500">
          {pricingType === 'RETAIL_WHOLESALE' && 'Set distinct retail price for standard customers and wholesale price for bulk buyers.'}
          {pricingType === 'RETAIL_ONLY' && 'General retail pricing only. Wholesale buyers pay retail rate.'}
          {pricingType === 'WHOLESALE_ONLY' && 'Exclusive bulk pricing reserved for wholesale buyers.'}
          {pricingType === 'CUSTOMERWISE' && 'Base prices set here can be mapped to specific customer accounts via customer price lists.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <TextField label="MRP (₹)" required type="number" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="e.g. 999" />
        <TextField
          label="Retail / Selling Price (₹)"
          required
          type="number"
          step="0.01"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
          placeholder="e.g. 799"
        />
        <TextField
          label="Wholesale Price (₹)"
          type="number"
          step="0.01"
          value={wholesalePrice}
          onChange={(e) => setWholesalePrice(e.target.value)}
          placeholder="e.g. 550"
        />
        <TextField label="Cost / Purchase Price (₹)" type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="e.g. 400" />
      </div>

      <div className="grid grid-cols-3 gap-4">
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
                {eligibleBrands.map((b) => {
                  const isMapped = (b.category_ids ?? []).some((id) => categoryIds.includes(id))
                  return (
                    <option key={b.id} value={b.id}>
                      {b.name} {isMapped ? '✓ (Mapped to Category)' : ''}
                    </option>
                  )
                })}
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
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <span className="block text-sm font-semibold text-slate-900">
                        Attribute Values <span className="text-red-500">*</span>
                      </span>
                      <p className="text-xs text-slate-500">
                        Select values from master attributes (Color, Size, Weight, Volume, Flavor, Pack Size, Diet Type, etc.) to automatically generate sellable variant combinations.
                      </p>
                    </div>
                  </div>

                  {variantAttributes.length === 0 ? (
                    <p className="text-sm text-slate-400">No variant attributes set up yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {variantAttributes.map((attribute) => {
                        const selectedForAttr = attribute.values.filter((v) => selectedValueIds.includes(v.id))
                        const unselectedForAttr = attribute.values.filter((v) => !selectedValueIds.includes(v.id))
                        const isAddingValue = addingValueForAttr === attribute.id

                        return (
                          <div key={attribute.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs transition hover:border-slate-300">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-800">
                                  {attribute.name}
                                </label>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                  {selectedForAttr.length} selected
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setAddingValueForAttr(isAddingValue ? null : attribute.id)}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                              >
                                {isAddingValue ? 'Cancel' : `+ Add Custom ${attribute.name}`}
                              </button>
                            </div>

                            {/* Dropdown Selector for Attributes */}
                            <div className="flex gap-2">
                              <select
                                value=""
                                onChange={(e) => {
                                  const valId = Number(e.target.value)
                                  if (valId && !selectedValueIds.includes(valId)) {
                                    setSelectedValueIds((prev) => [...prev, valId])
                                  }
                                }}
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                              >
                                <option value="">Select a {attribute.name} ({unselectedForAttr.length} available)…</option>
                                {unselectedForAttr.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.value} {v.color_hex ? `(${v.color_hex})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Inline Form to Add New Custom Value */}
                            {isAddingValue && (
                              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 p-2.5">
                                <input
                                  type="text"
                                  placeholder={`New ${attribute.name} value (e.g. ${attribute.name === 'Color' ? 'Lime Green' : attribute.name === 'Weight' ? '500g' : 'Value'})`}
                                  value={newValueInput}
                                  onChange={(e) => setNewValueInput(e.target.value)}
                                  className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                {attribute.name.toLowerCase() === 'color' && (
                                  <input
                                    type="color"
                                    title="Pick Color Hex"
                                    value={newValueHexInput || '#3b82f6'}
                                    onChange={(e) => setNewValueHexInput(e.target.value)}
                                    className="h-7 w-9 cursor-pointer rounded border border-slate-300 p-0.5"
                                  />
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={savingNewValue || !newValueInput.trim()}
                                  onClick={() => handleAddCustomAttributeValue(attribute.id)}
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
                                    className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1 text-xs font-semibold text-indigo-900 shadow-2xs transition hover:bg-indigo-100"
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
                                      onClick={() => toggleAttributeValue(value.id)}
                                      className="ml-1 text-indigo-400 hover:text-red-600 font-bold text-xs"
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
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-medium">Starting price &amp; tax for every generated variant (SKU, image and stock are set per variant below):</p>
                {priceFieldsCard}

                {variantRows.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                        Generated Variant Combinations ({variantRows.length})
                      </h3>
                      <span className="text-xs text-slate-500">Each variant gets its own SKU, image and opening stock</span>
                    </div>
                    <div className="space-y-3">
                      {variantRows.map((row, index) => (
                        <div key={row.key} className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/40 via-white to-slate-50 p-4 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between border-b border-indigo-100/60 pb-2">
                            <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">{index + 1}</span>
                              <span className="text-indigo-800">{row.title}</span>
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500">SKU Code: {row.sku}</span>
                          </div>
                          <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                            <div>
                              <label className="mb-1 block text-[11px] font-semibold text-slate-600">Variant Image</label>
                              <label className="group relative flex h-16 w-16 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-indigo-300 bg-white hover:border-indigo-500 hover:bg-indigo-50/50 transition">
                                {row.images[0] ? (
                                  <>
                                    <img src={row.images[0].previewUrl} alt="" className="h-full w-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                      <span className="text-[10px] font-bold text-white">+ Add More</span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-center p-1">
                                    <span className="block text-indigo-600 text-xs font-bold">+ Image</span>
                                  </div>
                                )}
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  multiple
                                  className="hidden"
                                  onChange={(e) => addVariantRowImages(row.key, e.target.files)}
                                />
                              </label>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <TextField
                                label="SKU"
                                required
                                value={row.sku}
                                onChange={(e) => updateVariantRow(row.key, { sku: e.target.value })}
                              />
                              <TextField
                                label="Opening Stock"
                                type="number"
                                min="0"
                                step="1"
                                value={row.openingStock}
                                onChange={(e) => updateVariantRow(row.key, { openingStock: e.target.value })}
                                placeholder="0"
                              />
                              <TextField
                                label="Low Stock Alert"
                                type="number"
                                min="0"
                                step="1"
                                value={row.lowStockThreshold}
                                onChange={(e) => updateVariantRow(row.key, { lowStockThreshold: e.target.value })}
                                placeholder="Default: 5"
                              />
                            </div>
                          </div>
                          {row.images.length > 0 && (
                            <div className="mt-2 flex items-center gap-2 pl-[96px]">
                              {row.images.map((img, imgIndex) => (
                                <div key={img.previewUrl} className="relative group">
                                  <img src={img.previewUrl} alt="" className="h-10 w-10 rounded-lg border border-slate-200 object-cover shadow-2xs" />
                                  <button
                                    type="button"
                                    onClick={() => removeVariantRowImage(row.key, imgIndex)}
                                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white shadow"
                                    title="Delete Image"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>

          <Card className={`space-y-4 p-5 ${activeSection === 'inventory' ? '' : 'hidden'}`}>
            <h2 className="text-sm font-semibold text-slate-900">Inventory</h2>
            {productType === 'SIMPLE' ? (
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  label="Opening Stock"
                  type="number"
                  min="0"
                  step="1"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                  placeholder="e.g. 50"
                />
                <TextField
                  label="Low Stock Alert Threshold"
                  type="number"
                  min="0"
                  step="1"
                  value={lowStockAlert}
                  onChange={(e) => setLowStockAlert(e.target.value)}
                  placeholder="Default: 5"
                />
              </div>
            ) : variantRows.length === 0 ? (
              <p className="text-sm text-slate-500">Pick attribute values in "4. Product Type" to configure each variant's own stock.</p>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  Every variant holds its own stock — edit opening stock and low-stock alert per row in "4. Product Type". Summary:
                </p>
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-1.5 font-medium">Variant</th>
                      <th className="py-1.5 font-medium">SKU</th>
                      <th className="py-1.5 font-medium">Opening Stock</th>
                      <th className="py-1.5 font-medium">Low Stock Alert</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {variantRows.map((row) => (
                      <tr key={row.key}>
                        <td className="py-1.5 text-slate-900">{row.title}</td>
                        <td className="py-1.5 text-slate-500">{row.sku || '—'}</td>
                        <td className="py-1.5 text-slate-600">{row.openingStock || '0'}</td>
                        <td className="py-1.5 text-slate-600">{row.lowStockThreshold || '5 (default)'}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold text-slate-900">
                      <td className="py-1.5" colSpan={2}>
                        Total Product Stock
                      </td>
                      <td className="py-1.5" colSpan={2}>
                        {variantRows.reduce((sum, r) => sum + (Number(r.openingStock) || 0), 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
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
                <dd className="font-medium text-slate-900">{productType === 'SIMPLE' ? 'Simple Product' : `Variable Product (${variantRows.length} variant(s))`}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Categories</dt>
                <dd className="font-medium text-slate-900">{categoryIds.length} selected</dd>
              </div>
              <div>
                <dt className="text-slate-500">Product Images</dt>
                <dd className="font-medium text-slate-900">{stagedImages.length} staged</dd>
              </div>
              {productType === 'SIMPLE' ? (
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
              ) : (
                <div>
                  <dt className="text-slate-500">Total Opening Stock</dt>
                  <dd className="font-medium text-slate-900">
                    {variantRows.reduce((sum, r) => sum + (Number(r.openingStock) || 0), 0)} across {variantRows.length} variant(s)
                  </dd>
                </div>
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
