import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Select, TextArea, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Brand, Category, GstRate, HsnCode, Subcategory, Unit, VariantAttribute } from '../lib/types'

interface StagedImage {
  file: File
  previewUrl: string
}

interface VariantRow {
  key: string
  valueIds: number[]
  title: string
  sku: string
  mrp: string
  sellingPrice: string
  wholesalePrice: string
  discountPercent: string
  discountAmount: string
  manufacturingDate: string
  expiryDate: string
  batchNo: string
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

function skuAbbr(value: string) {
  const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return (clean || 'VAL').slice(0, 3)
}

function cartesianProduct<T>(groups: T[][]): T[][] {
  return groups.reduce<T[][]>((acc, group) => acc.flatMap((combo) => group.map((value) => [...combo, value])), [[]])
}

function countWords(text: string): number {
  const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!plainText) return 0
  return plainText.split(/\s+/).filter(Boolean).length
}

function calcDiscount(mrpStr: string, sellingStr: string) {
  const m = parseFloat(mrpStr)
  const s = parseFloat(sellingStr)
  if (!isNaN(m) && !isNaN(s) && m > 0 && s >= 0 && m >= s) {
    const diff = m - s
    const pct = ((m - s) / m) * 100
    return {
      amount: Number.isInteger(diff) ? diff.toString() : diff.toFixed(2).replace(/\.?0+$/, ''),
      percent: Number.isInteger(pct) ? pct.toString() : pct.toFixed(2).replace(/\.?0+$/, ''),
    }
  }
  return { amount: '0', percent: '0' }
}

export function ProductCreatePage() {
  const navigate = useNavigate()

  // Master Data
  const [categories, setCategories] = useState<Category[]>([])
  const [allSubcategories, setAllSubcategories] = useState<Subcategory[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [gstRates, setGstRates] = useState<GstRate[]>([])
  const [hsnCodes, setHsnCodes] = useState<HsnCode[]>([])
  const [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>([])

  // 1. Basic Product Info
  const [name, setName] = useState('')
  const [productCode, setProductCode] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')
  const [bulletPoints, setBulletPoints] = useState<string[]>([''])

  // 2. Classification & Organization (Multiple Categories & Subcategories)
  const [brandId, setBrandId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<number | null>(null)
  const [subcategoryIds, setSubcategoryIds] = useState<number[]>([])
  const [searchKeywords, setSearchKeywords] = useState('')

  // 3. Media & Staged Images
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([])
  const [mainImageIndex, setMainImageIndex] = useState(0)

  // 4. Product Type & Pricing
  const [productType, setProductType] = useState<'SIMPLE' | 'VARIABLE'>('SIMPLE')
  const [pricingType, setPricingType] = useState<'RETAIL_WHOLESALE' | 'RETAIL_ONLY' | 'WHOLESALE_ONLY' | 'CUSTOMERWISE'>('RETAIL_WHOLESALE')
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [mrp, setMrp] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [wholesalePrice, setWholesalePrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [manufacturingDate, setManufacturingDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [discountPercent, setDiscountPercent] = useState('')
  const [discountAmount, setDiscountAmount] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [gstRateId, setGstRateId] = useState('')
  const [hsnCodeId, setHsnCodeId] = useState('')
  const [showDiscount, setShowDiscount] = useState(true)

  // 5. Inventory & Stock
  const [openingStock, setOpeningStock] = useState('')
  const [lowStockThreshold, setLowStockThreshold] = useState('')

  // 6. Shipping & Returns
  const [weightGrams, setWeightGrams] = useState('')
  const [lengthCm, setLengthCm] = useState('')
  const [widthCm, setWidthCm] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [returnable, setReturnable] = useState(true)
  const [returnWindowDays, setReturnWindowDays] = useState('7')
  const [replacementAvailable, setReplacementAvailable] = useState(true)
  const [refundAvailable, setRefundAvailable] = useState(true)
  const [shippingRequired, setShippingRequired] = useState(true)
  const [codAvailable, setCodAvailable] = useState(true)

  // 7. Status & SEO
  const [statusMode, setStatusMode] = useState<'ACTIVE' | 'DRAFT' | 'ARCHIVED'>('ACTIVE')
  const [isFeatured, setIsFeatured] = useState(false)
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')

  // 8. Specifications & Option Matrix
  const [specs, setSpecs] = useState<{ name: string; value: string }[]>([{ name: '', value: '' }])
  const [activeAttributeIds, setActiveAttributeIds] = useState<number[]>([])
  const [selectedValueIds, setSelectedValueIds] = useState<number[]>([])
  const [variantRows, setVariantRows] = useState<VariantRow[]>([])

  // Submit & Progress
  const [submitting, setSubmitting] = useState(false)
  const [submitStep, setSubmitStep] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/categories'),
      api.get('/brands'),
      api.get('/units'),
      api.get('/gst-rates'),
      api.get('/hsn-codes'),
      api.get('/variant-attributes'),
      api.get('/subcategories'),
    ]).then(([catRes, brandRes, unitRes, gstRes, hsnRes, attrRes, subRes]) => {
      setCategories(catRes.data.categories || [])
      setBrands(brandRes.data.brands || [])
      setUnits(unitRes.data.units || [])
      setGstRates(gstRes.data.gst_rates || [])
      setHsnCodes(hsnRes.data.hsn_codes || [])
      setVariantAttributes(attrRes.data.attributes || [])
      setAllSubcategories(subRes.data.subcategories || [])
    })
  }, [])

  // Dynamic available subcategories based on selected categories
  const availableSubcategories = useMemo(() => {
    if (categoryIds.length === 0) return allSubcategories
    return allSubcategories.filter((sub) => {
      if (sub.category_ids && sub.category_ids.length > 0) {
        return sub.category_ids.some((cid) => categoryIds.includes(cid))
      }
      return true
    })
  }, [allSubcategories, categoryIds])

  const slug = useMemo(() => slugify(name), [name])

  // Word Count Calculation & 150 Word Limit Validation
  const descriptionWordCount = useMemo(() => countWords(description), [description])
  const isWordLimitExceeded = descriptionWordCount > 150

  function applyFormatting(command: string) {
    if (command === 'bold') setDescription((prev) => prev + ' <b>bold text</b> ')
    else if (command === 'italic') setDescription((prev) => prev + ' <i>italic text</i> ')
    else if (command === 'underline') setDescription((prev) => prev + ' <u>underlined text</u> ')
    else if (command === 'bullet') setDescription((prev) => prev + '\n• Item point')
    else if (command === 'number') setDescription((prev) => prev + '\n1. Numbered item')
    else if (command === 'h1') setDescription((prev) => prev + '\n<h1>Heading 1</h1>\n')
    else if (command === 'h2') setDescription((prev) => prev + '\n<h2>Heading 2</h2>\n')
    else if (command === 'clear') setDescription((prev) => prev.replace(/<[^>]*>/g, ''))
  }

  // Simple Product Price handlers with Auto-Calculated Discount Amount & Percentage
  function handleMrpChange(val: string) {
    setMrp(val)
    if (val && sellingPrice) {
      const { amount, percent } = calcDiscount(val, sellingPrice)
      setDiscountAmount(amount)
      setDiscountPercent(percent)
    }
  }

  function handleSellingPriceChange(val: string) {
    setSellingPrice(val)
    if (mrp && val) {
      const { amount, percent } = calcDiscount(mrp, val)
      setDiscountAmount(amount)
      setDiscountPercent(percent)
    }
  }

  function handleDiscountAmountChange(val: string) {
    setDiscountAmount(val)
    const m = parseFloat(mrp)
    const amt = parseFloat(val)
    if (!isNaN(m) && m > 0 && !isNaN(amt) && amt >= 0 && amt <= m) {
      const newSelling = (m - amt).toFixed(2).replace(/\.?0+$/, '')
      const pct = ((amt / m) * 100).toFixed(2).replace(/\.?0+$/, '')
      setSellingPrice(newSelling)
      setDiscountPercent(pct)
    }
  }

  function handleDiscountPercentChange(val: string) {
    setDiscountPercent(val)
    const m = parseFloat(mrp)
    const pct = parseFloat(val)
    if (!isNaN(m) && m > 0 && !isNaN(pct) && pct >= 0 && pct <= 100) {
      const amt = (m * (pct / 100)).toFixed(2).replace(/\.?0+$/, '')
      const newSelling = (m - parseFloat(amt)).toFixed(2).replace(/\.?0+$/, '')
      setDiscountAmount(amt)
      setSellingPrice(newSelling)
    }
  }

  function handleAddStagedImages(files: FileList | null) {
    if (!files) return
    const next: StagedImage[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    setStagedImages((prev) => [...prev, ...next])
  }

  function removeStagedImage(index: number) {
    setStagedImages((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
    if (mainImageIndex >= index && mainImageIndex > 0) {
      setMainImageIndex((prev) => prev - 1)
    }
  }

  // Bullet point list helpers
  function addBulletPoint() {
    setBulletPoints((prev) => [...prev, ''])
  }
  function updateBulletPoint(index: number, val: string) {
    setBulletPoints((prev) => prev.map((b, i) => (i === index ? val : b)))
  }
  function removeBulletPoint(index: number) {
    setBulletPoints((prev) => prev.filter((_, i) => i !== index))
  }

  // Specifications helpers
  function addSpec() {
    setSpecs((prev) => [...prev, { name: '', value: '' }])
  }
  function updateSpec(index: number, field: 'name' | 'value', val: string) {
    setSpecs((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: val } : s)))
  }
  function removeSpec(index: number) {
    setSpecs((prev) => prev.filter((_, i) => i !== index))
  }

  // Attribute Dropdown Helpers
  function addAttributeOption(attrId: number) {
    if (!activeAttributeIds.includes(attrId)) {
      setActiveAttributeIds((prev) => [...prev, attrId])
    }
  }

  function removeAttributeOption(attrId: number) {
    setActiveAttributeIds((prev) => prev.filter((id) => id !== attrId))
    const attr = variantAttributes.find((a) => a.id === attrId)
    if (attr) {
      const valIds = attr.values.map((v) => v.id)
      setSelectedValueIds((prev) => prev.filter((id) => !valIds.includes(id)))
    }
  }

  // Generate combinations whenever selectedValueIds or base pricing changes
  useEffect(() => {
    if (productType !== 'VARIABLE') return

    const valueLookup = new Map<number, { attributeId: number; value: string }>()
    for (const attr of variantAttributes) {
      for (const val of attr.values) {
        valueLookup.set(val.id, { attributeId: attr.id, value: val.value })
      }
    }

    const groupedByAttr = new Map<number, number[]>()
    for (const id of selectedValueIds) {
      const info = valueLookup.get(id)
      if (!info) continue
      const list = groupedByAttr.get(info.attributeId) ?? []
      list.push(id)
      groupedByAttr.set(info.attributeId, list)
    }

    const groups = Array.from(groupedByAttr.values())
    if (groups.length === 0) {
      setVariantRows([])
      return
    }

    const combinations = cartesianProduct(groups)
    const baseSku = sku.trim() || slugify(name || 'product').toUpperCase()

    setVariantRows((prevRows) => {
      const byKey = new Map(prevRows.map((r) => [r.key, r]))
      return combinations.map((valueIds) => {
        const key = valueIds.join('-')
        const existing = byKey.get(key)
        if (existing) return existing

        const labels = valueIds.map((id) => valueLookup.get(id)?.value ?? '?')
        const baseMrp = mrp || ''
        const baseSelling = sellingPrice || ''
        const { amount, percent } = calcDiscount(baseMrp, baseSelling)

        return {
          key,
          valueIds,
          title: labels.join(' / '),
          sku: `${baseSku}-${valueIds.map((id) => skuAbbr(valueLookup.get(id)?.value ?? '')).join('-')}`,
          mrp: baseMrp,
          sellingPrice: baseSelling,
          wholesalePrice: wholesalePrice || '',
          discountPercent: percent || discountPercent || '0',
          discountAmount: amount || discountAmount || '0',
          manufacturingDate: manufacturingDate || '',
          expiryDate: expiryDate || '',
          batchNo: `BATCH-${valueIds.map((id) => skuAbbr(valueLookup.get(id)?.value ?? '')).join('')}`,
          openingStock: '',
          lowStockThreshold: '',
          images: [],
        }
      })
    })
  }, [selectedValueIds, variantAttributes, productType, mrp, sellingPrice, wholesalePrice, discountPercent, discountAmount, manufacturingDate, expiryDate, sku, name])

  function updateVariantRow(key: string, patch: Partial<VariantRow>) {
    setVariantRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row
        const updated = { ...row, ...patch }
        // Auto calculate discount for variant row when MRP or Selling price changes
        if (patch.mrp !== undefined || patch.sellingPrice !== undefined) {
          const { amount, percent } = calcDiscount(updated.mrp, updated.sellingPrice)
          updated.discountAmount = amount
          updated.discountPercent = percent
        }
        return updated
      })
    )
  }

  function handleAddVariantImage(rowKey: string, files: FileList | null) {
    if (!files || files.length === 0) return
    const newImgs: StagedImage[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    setVariantRows((prev) =>
      prev.map((row) => (row.key === rowKey ? { ...row, images: [...row.images, ...newImgs] } : row))
    )
  }

  function handleRemoveVariantImage(rowKey: string, imgIdx: number) {
    setVariantRows((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row
        const targetImg = row.images[imgIdx]
        if (targetImg) URL.revokeObjectURL(targetImg.previewUrl)
        return {
          ...row,
          images: row.images.filter((_, idx) => idx !== imgIdx),
        }
      })
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (isWordLimitExceeded) {
      setError(`Description cannot exceed 150 words (currently ${descriptionWordCount} words)`)
      return
    }

    if (categoryIds.length === 0) {
      setError('Select at least one category')
      return
    }

    if (productType === 'SIMPLE' && (sku.trim() === '' || mrp === '' || sellingPrice === '')) {
      setError('SKU, MRP and Selling Price are required for a simple product')
      return
    }

    if (productType === 'VARIABLE' && variantRows.length === 0) {
      setError('Pick at least one attribute value to generate variants from')
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
        primary_category_id: primaryCategoryId || categoryIds[0] || null,
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
        is_active: statusMode === 'ACTIVE',
        show_discount: showDiscount,
      })
      const productId = res.data.id

      if (productType === 'SIMPLE') {
        setSubmitStep('Creating product pricing…')
        const variantRes = await api.post(`/products/${productId}/variants`, {
          sku,
          barcode: barcode || null,
          mrp: mrp || 0,
          retail_price: sellingPrice || 0,
          wholesale_price: wholesalePrice || null,
          purchase_price: costPrice || null,
          manufacturing_date: manufacturingDate || null,
          expiry_date: expiryDate || null,
          discount_percent: discountPercent || 0,
          discount_amount: discountAmount || 0,
          batch_no: batchNo || 'OPENING-001',
          opening_stock: openingStock || 0,
          low_stock_threshold: lowStockThreshold || 0,
          gst_rate_id: gstRateId || null,
          hsn_code_id: hsnCodeId || null,
        })
        const variantId = variantRes.data.id

        if (openingStock.trim() !== '' && Number(openingStock) > 0) {
          setSubmitStep('Setting opening stock…')
          await api.post('/inventory/adjustments', {
            reason: 'Opening stock',
            items: [{ variant_id: variantId, counted_qty: openingStock }],
          })
        }
      } else {
        for (const row of variantRows) {
          setSubmitStep(`Creating variant "${row.title}"…`)
          const variantRes = await api.post(`/products/${productId}/variants`, {
            sku: row.sku,
            mrp: row.mrp || mrp || 0,
            retail_price: row.sellingPrice || sellingPrice || 0,
            wholesale_price: row.wholesalePrice || wholesalePrice || null,
            manufacturing_date: row.manufacturingDate || manufacturingDate || null,
            expiry_date: row.expiryDate || expiryDate || null,
            discount_percent: row.discountPercent || discountPercent || 0,
            discount_amount: row.discountAmount || discountAmount || 0,
            batch_no: row.batchNo || batchNo || 'BATCH-001',
            opening_stock: row.openingStock || 0,
            low_stock_threshold: row.lowStockThreshold || 0,
            attribute_value_ids: row.valueIds,
            gst_rate_id: gstRateId || null,
            hsn_code_id: hsnCodeId || null,
          })
          const variantId = variantRes.data.id

          if (row.openingStock.trim() !== '' && Number(row.openingStock) > 0) {
            await api.post('/inventory/adjustments', {
              reason: 'Opening stock',
              items: [{ variant_id: variantId, counted_qty: row.openingStock }],
            })
          }

          // Upload Variant-Specific Images
          if (row.images && row.images.length > 0) {
            setSubmitStep(`Uploading images for variant "${row.title}"…`)
            for (let i = 0; i < row.images.length; i++) {
              const formData = new FormData()
              formData.append('file', row.images[i].file)
              formData.append('is_primary', i === 0 ? '1' : '0')
              await api.post(`/variants/${variantId}/images`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
              })
            }
          }
        }
      }

      if (stagedImages.length > 0) {
        setSubmitStep('Uploading main product images…')
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

  return (
    <div className="w-full space-y-6 pb-24">
      {/* Sticky Top Action Bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-3.5 backdrop-blur-md shadow-2xs w-full">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/products')}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            ‹ Products
          </button>
          <span className="text-slate-300">|</span>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Add product</h1>
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
            Unsaved product
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate('/products')} className="text-xs font-bold px-4 py-1.5">
            Discard
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || isWordLimitExceeded}
            className="bg-slate-900 hover:bg-black text-white text-xs font-bold px-5 py-1.5 rounded-md shadow-xs transition-all"
          >
            {submitting ? submitStep || 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-6">
          <Alert tone="red">{error}</Alert>
        </div>
      )}

      {/* 100% Full-Width Screen Layout */}
      <form onSubmit={handleSubmit} className="w-full px-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2/3 Width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Title & Description & Bullet Points */}
          <Card className="p-6 space-y-4 border-slate-200 shadow-2xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <TextField
                  label="Title *"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Short sleeve t-shirt..."
                  className="text-sm font-medium"
                />
              </div>
              <div>
                <TextField
                  label="Product Code"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  placeholder="e.g. PRD-001"
                  className="text-xs"
                />
              </div>
            </div>

            <TextArea
              label="Short Description"
              rows={2}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder="Brief summary for product card..."
            />

            {/* Rich Text Description Editor */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Description</label>

              {/* Rich Text Toolbar */}
              <div className="rounded-t-lg border border-slate-300 border-b-0 bg-slate-50 px-3 py-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-700">
                <select
                  onChange={(e) => applyFormatting(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none"
                  defaultValue=""
                >
                  <option value="" disabled>Paragraph</option>
                  <option value="h1">Heading 1</option>
                  <option value="h2">Heading 2</option>
                  <option value="clear">Paragraph</option>
                </select>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => applyFormatting('bold')}
                  className="rounded px-2 py-1 font-black hover:bg-slate-200 transition-colors"
                  title="Bold"
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatting('italic')}
                  className="rounded px-2 py-1 italic hover:bg-slate-200 transition-colors"
                  title="Italic"
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatting('underline')}
                  className="rounded px-2 py-1 underline hover:bg-slate-200 transition-colors"
                  title="Underline"
                >
                  U
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => applyFormatting('bullet')}
                  className="rounded px-2 py-1 hover:bg-slate-200 transition-colors"
                  title="Bullet List"
                >
                  • List
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatting('number')}
                  className="rounded px-2 py-1 hover:bg-slate-200 transition-colors"
                  title="Numbered List"
                >
                  1. List
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatting('clear')}
                  className="rounded px-2 py-1 text-red-600 hover:bg-slate-200 transition-colors text-[11px]"
                  title="Clear formatting"
                >
                  Clear
                </button>
              </div>

              {/* Text Area */}
              <textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write detailed product description..."
                className={`w-full rounded-b-lg border ${
                  isWordLimitExceeded ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-[#7B3F4A]/20 focus:border-[#7B3F4A]'
                } bg-white p-3 text-xs focus:outline-none focus:ring-2`}
              />

              {/* Footer Word Count & Validation Alert */}
              <div className="flex items-center justify-between mt-1 text-xs">
                <span className={`font-bold ${isWordLimitExceeded ? 'text-red-600' : 'text-slate-500'}`}>
                  {descriptionWordCount} / 150 words max
                </span>
                {isWordLimitExceeded && (
                  <span className="font-semibold text-red-600 text-[11px]">
                    ⚠️ Description exceeds 150 words limit!
                  </span>
                )}
              </div>
            </div>

            {/* Bullet Points */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700">Bullet Highlights</label>
                <button
                  type="button"
                  onClick={addBulletPoint}
                  className="text-xs font-bold text-[#7B3F4A] hover:text-[#68343E]"
                >
                  + Add Point
                </button>
              </div>
              {bulletPoints.map((bp, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <input
                    type="text"
                    value={bp}
                    onChange={(e) => updateBulletPoint(idx, e.target.value)}
                    placeholder={`Highlight ${idx + 1}`}
                    className="flex-1 rounded-md border border-slate-300 px-3 py-1 text-xs"
                  />
                  {bulletPoints.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBulletPoint(idx)}
                      className="text-xs text-red-600 font-bold px-2 py-1 hover:bg-red-50 rounded"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Card 2: Media Upload */}
          <Card className="p-6 space-y-4 border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">Media</h2>
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center hover:bg-slate-50 transition-colors">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => handleAddStagedImages(e.target.files)}
                className="hidden"
                id="media-upload-input"
              />
              <label htmlFor="media-upload-input" className="cursor-pointer space-y-2 block">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-lg font-bold">
                  📷
                </div>
                <div className="text-xs font-bold text-[#7B3F4A]">Upload new <span className="text-slate-500 font-normal">or drag and drop</span></div>
                <p className="text-[11px] text-slate-400">Accepts PNG, JPG, WEBP formats</p>
              </label>
            </div>

            {stagedImages.length > 0 && (
              <div className="grid grid-cols-4 gap-3 pt-2 sm:grid-cols-6">
                {stagedImages.map((img, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs">
                    <img src={img.previewUrl} alt="Preview" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setMainImageIndex(idx)}
                      className={`absolute top-1 left-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                        mainImageIndex === idx ? 'bg-amber-500 text-white' : 'bg-black/60 text-white opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {mainImageIndex === idx ? 'Main' : 'Set Main'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStagedImage(idx)}
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Card 3: Pricing & Rates */}
          <Card className="p-6 space-y-4 border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Pricing &amp; Tax</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Pricing Strategy:</span>
                <Select
                  value={pricingType}
                  onChange={(e: any) => setPricingType(e.target.value)}
                  className="w-48 text-xs bg-white font-bold"
                >
                  <option value="RETAIL_WHOLESALE">Wholesale &amp; Retail Price</option>
                  <option value="RETAIL_ONLY">Retail Price Only</option>
                  <option value="WHOLESALE_ONLY">Wholesale Price Only</option>
                  <option value="CUSTOMERWISE">Customer-Wise Price</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <TextField
                label="MRP (₹) *"
                required
                type="number"
                step="0.01"
                value={mrp}
                onChange={(e) => handleMrpChange(e.target.value)}
                placeholder="0.00"
              />
              <TextField
                label="Retail Selling Price (₹) *"
                required
                type="number"
                step="0.01"
                value={sellingPrice}
                onChange={(e) => handleSellingPriceChange(e.target.value)}
                placeholder="0.00"
              />
              <TextField label="Wholesale Price (₹)" type="number" step="0.01" value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value)} placeholder="0.00" />
              <TextField label="Cost / Purchase Price (₹)" type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0.00" />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <TextField
                label="Discount Amount (₹)"
                type="number"
                step="0.01"
                value={discountAmount}
                onChange={(e) => handleDiscountAmountChange(e.target.value)}
                placeholder="0.00"
              />
              <TextField
                label="Discount (%)"
                type="number"
                step="0.01"
                value={discountPercent}
                onChange={(e) => handleDiscountPercentChange(e.target.value)}
                placeholder="0"
              />
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Calculated Savings</label>
                <div className="flex h-9 items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800">
                  <span>Save ₹{discountAmount || '0'}</span>
                  <span className="rounded bg-emerald-200/80 px-1.5 py-0.5 text-[11px]">{discountPercent || '0'}% OFF</span>
                </div>
              </div>
              <div className="flex items-end pb-1">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDiscount}
                    onChange={(e) => setShowDiscount(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#7B3F4A]"></div>
                  <span className="ml-2 text-xs font-semibold text-slate-700">Show Badge</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">GST Rate</label>
                <Select value={gstRateId} onChange={(e) => setGstRateId(e.target.value)}>
                  <option value="">— None —</option>
                  {gstRates.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">HSN Code</label>
                <Select value={hsnCodeId} onChange={(e) => setHsnCodeId(e.target.value)}>
                  <option value="">— None —</option>
                  {hsnCodes.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.code}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>

          {/* Card 4: Inventory & Tracking & Batches */}
          <Card className="p-6 space-y-4 border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">Inventory &amp; Batch Details</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <TextField label="SKU *" required value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. TSHIRT-RED-M" />
              <TextField label="Barcode (ISBN, UPC)" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode..." />
              <TextField label="Opening Quantity" type="number" value={openingStock} onChange={(e) => setOpeningStock(e.target.value)} placeholder="0" />
              <TextField label="Low Stock Threshold" type="number" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} placeholder="5" />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <TextField label="Manufacturing Date" type="date" value={manufacturingDate} onChange={(e) => setManufacturingDate(e.target.value)} />
              <TextField label="Expiry Date" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              <TextField label="Batch No" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="OPENING-001" />
            </div>
          </Card>

          {/* Card 5: Shipping & E-Commerce Settings */}
          <Card className="p-6 space-y-4 border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">Shipping &amp; Delivery</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <TextField label="Weight (grams)" type="number" value={weightGrams} onChange={(e) => setWeightGrams(e.target.value)} placeholder="500" />
              <TextField label="Length (cm)" type="number" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} placeholder="10" />
              <TextField label="Width (cm)" type="number" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} placeholder="10" />
              <TextField label="Height (cm)" type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="10" />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={shippingRequired} onChange={(e) => setShippingRequired(e.target.checked)} className="rounded border-[#EEDDE0] accent-[#7B3F4A] text-[#7B3F4A]" />
                Shipping Required
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={codAvailable} onChange={(e) => setCodAvailable(e.target.checked)} className="rounded border-[#EEDDE0] accent-[#7B3F4A] text-[#7B3F4A]" />
                COD Available
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={replacementAvailable} onChange={(e) => setReplacementAvailable(e.target.checked)} className="rounded border-[#EEDDE0] accent-[#7B3F4A] text-[#7B3F4A]" />
                Replacement Allowed
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={refundAvailable} onChange={(e) => setRefundAvailable(e.target.checked)} className="rounded border-[#EEDDE0] accent-[#7B3F4A] text-[#7B3F4A]" />
                Refund Allowed
              </label>
            </div>

            <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={returnable} onChange={(e) => setReturnable(e.target.checked)} className="rounded border-[#EEDDE0] accent-[#7B3F4A] text-[#7B3F4A]" />
                Returnable Item
              </label>
              {returnable && (
                <div className="w-40">
                  <TextField label="Return Window (Days)" type="number" value={returnWindowDays} onChange={(e) => setReturnWindowDays(e.target.value)} />
                </div>
              )}
            </div>
          </Card>

          {/* Card 6: Variants Option Matrix (With Variant-Specific Image Upload & Auto-Discounts) */}
          <Card className="p-6 space-y-4 border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Variants Matrix</h2>
                <p className="text-xs text-slate-500">Configure options and add variant-specific images and pricing.</p>
              </div>
              <Select
                value={productType}
                onChange={(e: any) => setProductType(e.target.value)}
                className="w-44 text-xs bg-white font-bold"
              >
                <option value="SIMPLE">Simple Product</option>
                <option value="VARIABLE">Variable Product</option>
              </Select>
            </div>

            {productType === 'VARIABLE' && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                {/* Attribute Selection Dropdown Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#FAF2F4]/60 p-3 rounded-2xl border border-[#EEDDE0]">
                  <label className="text-xs font-bold text-[#804652]">
                    + Add Variant Attribute Type:
                  </label>
                  <select
                    className="w-full sm:w-72 rounded-xl border border-[#EEDDE0] bg-white px-3 py-1.5 text-xs font-bold text-[#7B3F4A] shadow-2xs focus:border-[#7B3F4A] focus:outline-none"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        addAttributeOption(Number(e.target.value))
                        e.target.value = ''
                      }
                    }}
                  >
                    <option value="" disabled>Choose Attribute (e.g. Color, Size, Weight...)</option>
                    {variantAttributes
                      .filter((attr) => !activeAttributeIds.includes(attr.id))
                      .map((attr) => (
                        <option key={attr.id} value={attr.id}>
                          {attr.name} ({attr.values.length} options)
                        </option>
                      ))}
                  </select>
                </div>

                {/* Only Render Cards for Selected Active Attributes */}
                <div className="space-y-4">
                  {activeAttributeIds.map((attrId) => {
                    const attr = variantAttributes.find((a) => a.id === attrId)
                    if (!attr) return null

                    return (
                      <div key={attr.id} className="rounded-2xl border border-[#EEDDE0] p-4 bg-[#FAF2F4]/30 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between border-b border-[#EEDDE0] pb-2">
                          <span className="font-extrabold text-xs text-[#7B3F4A] uppercase tracking-wider flex items-center gap-2">
                            🏷️ {attr.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAttributeOption(attr.id)}
                            className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-0.5 rounded-full transition-colors"
                          >
                            Remove Option ×
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {attr.values.map((val) => {
                            const checked = selectedValueIds.includes(val.id)
                            return (
                              <button
                                key={val.id}
                                type="button"
                                onClick={() =>
                                  setSelectedValueIds((prev) =>
                                    checked ? prev.filter((id) => id !== val.id) : [...prev, val.id]
                                  )
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all border flex items-center gap-1.5 ${
                                  checked
                                    ? 'bg-[#7B3F4A] text-white border-[#7B3F4A] shadow-2xs'
                                    : 'bg-white text-slate-700 border-[#EEDDE0] hover:bg-[#FAF2F4]'
                                }`}
                              >
                                {val.color_hex && (
                                  <span
                                    className="w-3 h-3 rounded-full border border-white shadow-2xs"
                                    style={{ backgroundColor: val.color_hex }}
                                  />
                                )}
                                <span>{val.value}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  {activeAttributeIds.length === 0 && (
                    <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                      No variant attribute selected. Choose an attribute (e.g. Color, Size, Weight) from the dropdown above to configure options.
                    </div>
                  )}
                </div>

                {/* Variant Matrix Table with Variant Images & Auto-Calculated Discounts */}
                {variantRows.length > 0 && (
                  <div className="overflow-x-auto pt-2 border-t border-slate-100">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 uppercase font-semibold text-slate-600 text-[11px]">
                        <tr>
                          <th className="px-3 py-2">Variant</th>
                          <th className="px-3 py-2">Variant Image</th>
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2">MRP (₹)</th>
                          <th className="px-3 py-2">Selling (₹)</th>
                          <th className="px-3 py-2">Discount</th>
                          <th className="px-3 py-2">Wholesale</th>
                          <th className="px-3 py-2">Mfg Date</th>
                          <th className="px-3 py-2">Exp Date</th>
                          <th className="px-3 py-2">Batch</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {variantRows.map((row) => {
                          const { amount, percent } = calcDiscount(row.mrp, row.sellingPrice)
                          return (
                            <tr key={row.key} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-3 py-2 font-bold text-slate-900 min-w-[100px]">
                                {row.title}
                              </td>

                              {/* Variant Image Upload & Preview Cell */}
                              <td className="px-3 py-2 min-w-[130px]">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {row.images.map((img, imgIdx) => (
                                    <div key={imgIdx} className="relative group w-8 h-8 rounded border border-slate-200 overflow-hidden bg-white shadow-2xs">
                                      <img src={img.previewUrl} alt="Variant" className="w-full h-full object-cover" />
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveVariantImage(row.key, imgIdx)}
                                        className="absolute top-0 right-0 bg-red-600 text-white text-[9px] w-3.5 h-3.5 flex items-center justify-center rounded-bl opacity-0 group-hover:opacity-100 transition-opacity font-bold"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                  <label
                                    className="cursor-pointer flex items-center justify-center w-8 h-8 rounded-lg border border-dashed border-[#7B3F4A] bg-[#FAF2F4] text-[#7B3F4A] hover:bg-[#F3E5E8] transition-colors text-xs font-bold"
                                    title="Add Image for this variant"
                                  >
                                    📷
                                    <input
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      className="hidden"
                                      onChange={(e) => handleAddVariantImage(row.key, e.target.files)}
                                    />
                                  </label>
                                </div>
                              </td>

                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={row.sku}
                                  onChange={(e) => updateVariantRow(row.key, { sku: e.target.value })}
                                  className="w-28 rounded border border-slate-300 p-1 text-xs font-mono"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={row.mrp}
                                  onChange={(e) => updateVariantRow(row.key, { mrp: e.target.value })}
                                  className="w-20 rounded border border-slate-300 p-1 text-xs font-bold"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={row.sellingPrice}
                                  onChange={(e) => updateVariantRow(row.key, { sellingPrice: e.target.value })}
                                  className="w-20 rounded border border-slate-300 p-1 text-xs font-bold text-emerald-700"
                                />
                              </td>

                              {/* Auto Calculated Discount Display */}
                              <td className="px-3 py-2 min-w-[110px]">
                                {Number(amount) > 0 ? (
                                  <div className="flex flex-col text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                                    <span>Save ₹{amount}</span>
                                    <span className="text-emerald-600 font-semibold">{percent}% OFF</span>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400">—</span>
                                )}
                              </td>

                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={row.wholesalePrice}
                                  onChange={(e) => updateVariantRow(row.key, { wholesalePrice: e.target.value })}
                                  className="w-20 rounded border border-slate-300 p-1 text-xs"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="date"
                                  value={row.manufacturingDate}
                                  onChange={(e) => updateVariantRow(row.key, { manufacturingDate: e.target.value })}
                                  className="w-28 rounded border border-slate-300 p-1 text-xs"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="date"
                                  value={row.expiryDate}
                                  onChange={(e) => updateVariantRow(row.key, { expiryDate: e.target.value })}
                                  className="w-28 rounded border border-slate-300 p-1 text-xs"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={row.batchNo}
                                  onChange={(e) => updateVariantRow(row.key, { batchNo: e.target.value })}
                                  className="w-24 rounded border border-slate-300 p-1 text-xs"
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Card 7: Specifications Key-Value */}
          <Card className="p-6 space-y-4 border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Custom Specifications</h2>
              <button
                type="button"
                onClick={addSpec}
                className="text-xs font-bold text-[#7B3F4A] hover:text-[#68343E]"
              >
                + Add Spec
              </button>
            </div>
            <div className="space-y-2">
              {specs.map((spec, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={spec.name}
                    onChange={(e) => updateSpec(index, 'name', e.target.value)}
                    placeholder="Specification Name (e.g. Material)"
                    className="flex-1 rounded-md border border-slate-300 px-3 py-1 text-xs"
                  />
                  <input
                    type="text"
                    value={spec.value}
                    onChange={(e) => updateSpec(index, 'value', e.target.value)}
                    placeholder="Specification Value (e.g. 100% Cotton)"
                    className="flex-1 rounded-md border border-slate-300 px-3 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => removeSpec(index)}
                    className="text-xs text-red-600 font-bold px-2 py-1 hover:bg-red-50 rounded"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Sidebar Column (1/3 Width) */}
        <div className="space-y-6">
          {/* Status Card */}
          <Card className="p-6 space-y-3 border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">Status</h2>
            <Select
              value={statusMode}
              onChange={(e: any) => setStatusMode(e.target.value)}
              className="w-full bg-white font-bold text-xs"
            >
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  className="rounded border-[#EEDDE0] accent-[#7B3F4A] text-[#7B3F4A]"
                />
                Featured Product on Home Page
              </label>
            </div>
          </Card>

          {/* Organization Card (Multi-Category & Multi-Subcategory Selector) */}
          <Card className="p-6 space-y-4 border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">Product organization</h2>

            {/* Categories Multi-Select */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700">Categories *</label>
                <span className="text-[11px] font-semibold text-[#7B3F4A] bg-[#FAF2F4] px-2 py-0.5 rounded-full border border-[#EEDDE0]">
                  {categoryIds.length} selected
                </span>
              </div>

              <div className="max-h-52 overflow-y-auto space-y-1 rounded-xl border border-slate-200 p-2 bg-slate-50/50">
                {categories.map((c) => {
                  const isChecked = categoryIds.includes(c.id)
                  const isPrimary = primaryCategoryId === c.id
                  return (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs font-semibold transition-all ${
                        isChecked ? 'bg-white border border-[#EEDDE0] shadow-2xs' : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCategoryIds((prev) => [...prev, c.id])
                              if (!primaryCategoryId) setPrimaryCategoryId(c.id)
                            } else {
                              setCategoryIds((prev) => prev.filter((id) => id !== c.id))
                              if (primaryCategoryId === c.id) {
                                const remaining = categoryIds.filter((id) => id !== c.id)
                                setPrimaryCategoryId(remaining.length ? remaining[0] : null)
                              }
                            }
                          }}
                          className="rounded border-[#EEDDE0] accent-[#7B3F4A] text-[#7B3F4A] h-4 w-4"
                        />
                        <span className={isChecked ? 'font-bold text-[#7B3F4A]' : 'text-slate-700'}>{c.name}</span>
                      </label>

                      {isChecked && (
                        <button
                          type="button"
                          onClick={() => setPrimaryCategoryId(c.id)}
                          title={isPrimary ? 'Primary category' : 'Set as primary category'}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            isPrimary
                              ? 'bg-[#7B3F4A] text-white'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {isPrimary ? '★ Primary' : 'Make Primary'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Subcategories Multi-Select */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700">Subcategories</label>
                <span className="text-[11px] font-semibold text-[#7B3F4A] bg-[#FAF2F4] px-2 py-0.5 rounded-full border border-[#EEDDE0]">
                  {subcategoryIds.length} selected
                </span>
              </div>

              {availableSubcategories.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">No subcategories available for selected categories.</p>
              ) : (
                <div className="max-h-52 overflow-y-auto space-y-1 rounded-xl border border-slate-200 p-2 bg-slate-50/50">
                  {availableSubcategories.map((s) => {
                    const isChecked = subcategoryIds.includes(s.id)
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center gap-2.5 p-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                          isChecked ? 'bg-white border border-[#EEDDE0] text-[#7B3F4A] font-bold shadow-2xs' : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSubcategoryIds((prev) => [...prev, s.id])
                            } else {
                              setSubcategoryIds((prev) => prev.filter((id) => id !== s.id))
                            }
                          }}
                          className="rounded border-[#EEDDE0] accent-[#7B3F4A] text-[#7B3F4A] h-4 w-4"
                        />
                        <span>{s.name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Vendor / Brand</label>
              <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">— None —</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Unit</label>
              <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">— None —</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          {/* Search Engine Listing Preview Card (SEO) */}
          <Card className="p-6 space-y-3 border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">Search engine listing</h2>

            {/* Live SERP Preview Box */}
            <div className="rounded-2xl border border-[#EEDDE0] bg-[#FAF2F4]/60 p-4 space-y-1">
              <p className="text-xs font-bold text-[#7B3F4A] truncate">
                {metaTitle || name || 'Product Title'}
              </p>
              <p className="text-[11px] text-emerald-700 font-mono truncate">
                https://store.qynova.in/products/{slug || 'product-slug'}
              </p>
              <p className="text-[11px] text-slate-600 line-clamp-2">
                {metaDescription || description || 'Add a title and description to see how this product might appear in a search engine listing.'}
              </p>
            </div>

            <TextField
              label="Page Title"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="SEO Meta Title"
            />
            <TextArea
              label="Meta Description"
              rows={2}
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="SEO Meta Description"
            />
            <TextField
              label="Search Tags / Keywords"
              value={searchKeywords}
              onChange={(e) => setSearchKeywords(e.target.value)}
              placeholder="e.g. summer, cotton, top"
            />
          </Card>
        </div>
      </form>
    </div>
  )
}
