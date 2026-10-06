import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, PageHeader, Select, TextArea, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Category, Subcategory } from '../lib/types'

interface Brand {
  id: number
  name: string
}
interface Unit {
  id: number
  name: string
  short_code: string
}

export function ProductCreatePage() {
  const navigate = useNavigate()

  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [units, setUnits] = useState<Unit[]>([])

  const [name, setName] = useState('')
  const [brandId, setBrandId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<number | null>(null)
  const [subcategoryIds, setSubcategoryIds] = useState<number[]>([])

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.get('/categories').then((res) => setCategories(res.data.categories))
    api.get('/subcategories').then((res) => setSubcategories(res.data.subcategories))
    api.get('/brands').then((res) => setBrands(res.data.brands))
    api.get('/units').then((res) => setUnits(res.data.units))
  }, [])

  // Only subcategories mapped to at least one selected category are
  // eligible — mirrors the backend's own validation rule in
  // ProductService, so a submission here can never be rejected for
  // violating it.
  const eligibleSubcategories = useMemo(
    () => subcategories.filter((s) => (s.category_ids ?? []).some((id) => categoryIds.includes(id))),
    [subcategories, categoryIds],
  )

  function toggleCategory(id: number) {
    setCategoryIds((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
      if (!next.includes(id) && primaryCategoryId === id) {
        setPrimaryCategoryId(next[0] ?? null)
      }
      if (!prev.includes(id) && prev.length === 0) {
        setPrimaryCategoryId(id)
      }
      return next
    })
  }

  useEffect(() => {
    // Drop any subcategory selection that's no longer eligible once the
    // category selection changes.
    const eligibleIds = new Set(eligibleSubcategories.map((s) => s.id))
    setSubcategoryIds((prev) => prev.filter((id) => eligibleIds.has(id)))
  }, [eligibleSubcategories])

  function toggleSubcategory(id: number) {
    setSubcategoryIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (categoryIds.length === 0) {
      setError('Select at least one category')
      return
    }

    setSubmitting(true)
    try {
      const res = await api.post('/products', {
        name,
        brand_id: brandId || null,
        unit_id: unitId || null,
        short_description: shortDescription || null,
        description: description || null,
        category_ids: categoryIds,
        primary_category_id: primaryCategoryId,
        subcategory_ids: subcategoryIds,
      })
      navigate(`/products`, { state: { createdId: res.data.id } })
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create product'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader title="New Product" description="Variants (SKU, price, stock) are added after the product is created." />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Basic Information</h2>
            <TextField label="Product Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Classic T-Shirt" />
            <TextField
              label="Short Description"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder="One line shown on product cards"
            />
            <TextArea label="Description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
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
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-3 p-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Categories</h2>
              <p className="text-xs text-slate-500">Pick one or more. Click a chip's star to make it primary.</p>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
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
          </Card>

          <Card className="space-y-3 p-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Subcategories</h2>
              <p className="text-xs text-slate-500">
                {categoryIds.length === 0
                  ? 'Select a category first.'
                  : 'Only subcategories mapped to a selected category are shown.'}
              </p>
            </div>
            {eligibleSubcategories.length === 0 ? (
              <p className="py-2 text-sm text-slate-400">
                {categoryIds.length === 0 ? '—' : 'No subcategories mapped to the selected categories yet.'}
              </p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {eligibleSubcategories.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={subcategoryIds.includes(s.id)}
                      onChange={() => toggleSubcategory(s.id)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-3">
          {error && (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          )}
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
