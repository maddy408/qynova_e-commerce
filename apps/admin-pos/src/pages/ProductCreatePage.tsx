import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Select, TextArea, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Brand, Category, GstRate, HsnCode, Subcategory, Unit } from '../lib/types'

const SECTIONS = [
  { id: 'basic', label: '1. Basic Information' },
  { id: 'classification', label: '2. Classification' },
  { id: 'pricing', label: '3. Pricing & Tax' },
  { id: 'specs', label: '4. Specifications' },
] as const

export function ProductCreatePage() {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]['id']>('basic')

  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [gstRates, setGstRates] = useState<GstRate[]>([])
  const [hsnCodes, setHsnCodes] = useState<HsnCode[]>([])

  // Basic information
  const [name, setName] = useState('')
  const [productCode, setProductCode] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')
  const [bulletPoints, setBulletPoints] = useState<string[]>([''])
  const [tags, setTags] = useState('')

  // Classification
  const [brandId, setBrandId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<number | null>(null)
  const [subcategoryIds, setSubcategoryIds] = useState<number[]>([])

  // Product type + simple-product pricing/inventory. A "Simple Product"
  // is just a product with one unlabeled variant under the hood — this
  // build never stores price/SKU/stock on the product itself (see
  // database/README.md: "every product has at least one variant").
  // "Variable Product" skips this and the detail page's variant
  // generator takes over once the product exists.
  const [productType, setProductType] = useState<'SIMPLE' | 'VARIABLE'>('SIMPLE')
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [mrp, setMrp] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [gstRateId, setGstRateId] = useState('')
  const [hsnCodeId, setHsnCodeId] = useState('')
  const [openingStock, setOpeningStock] = useState('')

  // Specifications
  const [specs, setSpecs] = useState<{ name: string; value: string }[]>([{ name: '', value: '' }])

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.get('/categories').then((res) => setCategories(res.data.categories))
    api.get('/subcategories').then((res) => setSubcategories(res.data.subcategories))
    api.get('/brands').then((res) => setBrands(res.data.brands))
    api.get('/units').then((res) => setUnits(res.data.units))
    api.get('/gst-rates').then((res) => setGstRates(res.data.gst_rates))
    api.get('/hsn-codes').then((res) => setHsnCodes(res.data.hsn_codes))
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

    if (productType === 'SIMPLE') {
      if (sku.trim() === '' || mrp === '' || sellingPrice === '') {
        setError('SKU, MRP and Selling Price are required for a simple product')
        setActiveSection('pricing')
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await api.post('/products', {
        name,
        product_code: productCode || null,
        short_description: shortDescription || null,
        description: description || null,
        bullet_points: bulletPoints.filter((b) => b.trim() !== ''),
        tags: tags || null,
        brand_id: brandId || null,
        unit_id: unitId || null,
        category_ids: categoryIds,
        primary_category_id: primaryCategoryId,
        subcategory_ids: subcategoryIds,
      })
      const productId = res.data.id

      if (productType === 'SIMPLE') {
        await api.post(`/products/${productId}/variants`, {
          sku,
          barcode: barcode || null,
          mrp,
          retail_price: sellingPrice,
          purchase_price: costPrice || null,
          gst_rate_id: gstRateId || null,
          hsn_code_id: hsnCodeId || null,
          is_default: true,
        })

        const stock = openingStock.trim()
        if (stock !== '' && Number(stock) > 0) {
          const variantsRes = await api.get(`/products/${productId}`)
          const variantId = variantsRes.data.product.variants[0]?.id
          if (variantId) {
            await api.post('/inventory/adjustments', {
              reason: 'Opening stock',
              items: [{ variant_id: variantId, product_id: productId, counted_qty: stock }],
            })
          }
        }
      }

      const validSpecs = specs.filter((s) => s.name.trim() !== '' && s.value.trim() !== '')
      if (validSpecs.length > 0) {
        await api.put(`/products/${productId}/specifications`, { specifications: validSpecs })
      }

      navigate(`/products/${productId}`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create product'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Create Product</h1>
          <p className="mt-1 text-sm text-slate-500">
            {productType === 'SIMPLE'
              ? 'Images and further detail can be added once the product is created.'
              : 'Variants, their pricing and images are added on the next screen.'}
          </p>
        </div>
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
              <TextField label="Product Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Classic T-Shirt" />
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

            <TextField
              label="Search Keywords / Tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Space-separated, e.g. cleaning brush floor bathroom"
            />
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
                  : 'Has variants (e.g. Color x Size) — each with its own SKU, price, stock and images, set up on the next screen.'}
              </p>
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

          <Card className={`space-y-4 p-5 ${activeSection === 'pricing' ? '' : 'hidden'}`}>
            <h2 className="text-sm font-semibold text-slate-900">Pricing, Tax &amp; Inventory</h2>
            {productType === 'VARIABLE' ? (
              <p className="text-sm text-slate-500">
                Variable products set pricing, stock and SKU per variant — you'll do that on the next screen after creating the
                product.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <TextField label="SKU" required value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. TSH-001" />
                  <TextField label="Barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <TextField label="MRP" required type="number" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} />
                  <TextField
                    label="Selling Price"
                    required
                    type="number"
                    step="0.01"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                  />
                  <TextField label="Cost Price" type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
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
                  <TextField
                    label="Opening Stock"
                    type="number"
                    step="1"
                    value={openingStock}
                    onChange={(e) => setOpeningStock(e.target.value)}
                  />
                </div>
              </>
            )}
          </Card>

          <Card className={`space-y-3 p-5 ${activeSection === 'specs' ? '' : 'hidden'}`}>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Specifications</h2>
              <p className="text-xs text-slate-500">Free-form name/value rows — no fixed column per attribute.</p>
            </div>
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
          </Card>

          <div className="flex justify-end gap-2">
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
