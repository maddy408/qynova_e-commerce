import { useEffect, useState, type FormEvent } from 'react'
import { PencilIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Brand, Category } from '../lib/types'

interface Coupon {
  id: number
  code: string
  name: string
  description?: string | null
  discount_type: 'PERCENTAGE' | 'FIXED'
  discount_value: string
  min_order_amount: string | null
  max_discount_amount: string | null
  usage_limit: number | null
  per_customer_usage_limit: number | null
  first_order_only: 0 | 1
  can_combine_with_referral: 0 | 1
  status: 'ACTIVE' | 'INACTIVE'
}

interface CustomerOption {
  id: number
  name: string
  phone: string
  customer_type: string
  order_count?: number
  latest_order_at?: string | null
}

interface ProductOption {
  id: number
  name: string
  product_code?: string | null
}

export function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])

  const [showForm, setShowForm] = useState(false)
  const [editingCouponId, setEditingCouponId] = useState<number | null>(null)
  const [modalError, setModalError] = useState('')
  const [pageError, setPageError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [fetchingEditId, setFetchingEditId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE')
  const [discountValue, setDiscountValue] = useState('')
  const [minOrderAmount, setMinOrderAmount] = useState('')
  const [maxDiscountAmount, setMaxDiscountAmount] = useState('')
  const [usageLimit, setUsageLimit] = useState('')
  const [perCustomerLimit, setPerCustomerLimit] = useState('')
  const [firstOrderOnly, setFirstOrderOnly] = useState(false)
  const [canCombineWithReferral, setCanCombineWithReferral] = useState(false)

  const [productIds, setProductIds] = useState<number[]>([])
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [brandIds, setBrandIds] = useState<number[]>([])

  // Scoping filters search
  const [productSearch, setProductSearch] = useState('')

  // Customer targeting
  const [targetType, setTargetType] = useState<'ALL' | 'SPECIFIC'>('ALL')
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([])
  const [customerSearch, setCustomerSearch] = useState('')

  function load() {
    api.get('/coupons')
      .then((res) => setCoupons(res.data.coupons))
      .catch((err) => setPageError(apiErrorMessage(err, 'Failed to load coupons')))
  }

  useEffect(() => {
    load()
    api.get('/categories').then((res) => setCategories(res.data.categories ?? [])).catch(() => {})
    api.get('/brands').then((res) => setBrands(res.data.brands ?? [])).catch(() => {})
    api.get('/products', { params: { limit: 100 } }).then((res) => setProducts(res.data.items ?? res.data.products ?? [])).catch(() => {})
    api.get('/customers').then((res) => setCustomers(res.data.customers ?? [])).catch(() => {})
  }, [])

  function resetForm() {
    setCode('')
    setName('')
    setDescription('')
    setDiscountType('PERCENTAGE')
    setDiscountValue('')
    setMinOrderAmount('')
    setMaxDiscountAmount('')
    setUsageLimit('')
    setPerCustomerLimit('')
    setFirstOrderOnly(false)
    setCanCombineWithReferral(false)
    setProductIds([])
    setCategoryIds([])
    setBrandIds([])
    setProductSearch('')
    setTargetType('ALL')
    setSelectedCustomerIds([])
    setCustomerSearch('')
  }

  function handleOpenCreate() {
    setEditingCouponId(null)
    resetForm()
    setModalError('')
    setPageError('')
    setShowForm(true)
  }

  async function handleOpenEdit(couponId: number) {
    setPageError('')
    setSuccessMessage('')
    setModalError('')
    setFetchingEditId(couponId)
    try {
      const res = await api.get(`/coupons/${couponId}`)
      const c = res.data.coupon
      if (!c) {
        throw new Error('Coupon details could not be found')
      }

      setEditingCouponId(c.id)
      setCode(c.code ?? '')
      setName(c.name ?? '')
      setDescription(c.description ?? '')
      setDiscountType(c.discount_type ?? 'PERCENTAGE')
      setDiscountValue(c.discount_value != null ? String(c.discount_value) : '')
      setMinOrderAmount(c.min_order_amount != null ? String(c.min_order_amount) : '')
      setMaxDiscountAmount(c.max_discount_amount != null ? String(c.max_discount_amount) : '')
      setUsageLimit(c.usage_limit != null ? String(c.usage_limit) : '')
      setPerCustomerLimit(c.per_customer_usage_limit != null ? String(c.per_customer_usage_limit) : '')
      setFirstOrderOnly(Boolean(c.first_order_only))
      setCanCombineWithReferral(Boolean(c.can_combine_with_referral))

      setProductIds(Array.isArray(c.product_ids) ? c.product_ids.map(Number) : [])
      setCategoryIds(Array.isArray(c.category_ids) ? c.category_ids.map(Number) : [])
      setBrandIds(Array.isArray(c.brand_ids) ? c.brand_ids.map(Number) : [])

      const custIds = Array.isArray(c.customers)
        ? c.customers.map((cust: any) => Number(cust.customer_id))
        : Array.isArray(c.customer_ids)
          ? c.customer_ids.map(Number)
          : []

      if (custIds.length > 0) {
        setTargetType('SPECIFIC')
        setSelectedCustomerIds(custIds)
      } else {
        setTargetType('ALL')
        setSelectedCustomerIds([])
      }

      setProductSearch('')
      setCustomerSearch('')
      setShowForm(true)
    } catch (err) {
      setPageError(apiErrorMessage(err, 'Could not fetch coupon details'))
    } finally {
      setFetchingEditId(null)
    }
  }

  function handleCloseModal() {
    setShowForm(false)
    setEditingCouponId(null)
    setModalError('')
    resetForm()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setModalError('')
    setPageError('')
    setSubmitting(true)
    try {
      const payload: Record<string, any> = {
        name,
        description: description || null,
        discount_type: discountType,
        discount_value: discountValue,
        min_order_amount: minOrderAmount || null,
        max_discount_amount: maxDiscountAmount || null,
        usage_limit: usageLimit || null,
        per_customer_usage_limit: perCustomerLimit || null,
        first_order_only: firstOrderOnly,
        can_combine_with_referral: canCombineWithReferral,
        product_ids: productIds,
        category_ids: categoryIds,
        brand_ids: brandIds,
        customer_ids: targetType === 'SPECIFIC' ? selectedCustomerIds : [],
      }

      if (editingCouponId !== null) {
        await api.put(`/coupons/${editingCouponId}`, payload)
        setSuccessMessage(`Coupon "${code}" updated successfully.`)
      } else {
        payload.code = code
        await api.post('/coupons', payload)
        setSuccessMessage(`Coupon "${code}" created successfully.`)
      }

      handleCloseModal()
      load()
    } catch (err) {
      setModalError(apiErrorMessage(err, editingCouponId !== null ? 'Could not update coupon' : 'Could not create coupon'))
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleStatus(coupon: Coupon) {
    setPageError('')
    setSuccessMessage('')
    setTogglingId(coupon.id)
    try {
      const nextStatus = coupon.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      await api.put(`/coupons/${coupon.id}`, { status: nextStatus })
      setSuccessMessage(`Coupon "${coupon.code}" ${nextStatus === 'ACTIVE' ? 'activated' : 'deactivated'} successfully.`)
      load()
    } catch (err) {
      setPageError(apiErrorMessage(err, `Could not ${coupon.status === 'ACTIVE' ? 'deactivate' : 'activate'} coupon`))
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(coupon: Coupon) {
    const confirmed = window.confirm(
      `Are you sure you want to delete coupon "${coupon.code}" (${coupon.name})? This action cannot be undone.`
    )
    if (!confirmed) return

    setPageError('')
    setSuccessMessage('')
    setDeletingId(coupon.id)
    try {
      await api.delete(`/coupons/${coupon.id}`)
      setSuccessMessage(`Coupon "${coupon.code}" was deleted successfully.`)
      load()
    } catch (err) {
      setPageError(apiErrorMessage(err, 'Failed to delete coupon'))
    } finally {
      setDeletingId(null)
    }
  }

  function toggleProduct(id: number) {
    setProductIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  function toggleCategory(id: number) {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function toggleBrand(id: number) {
    setBrandIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]))
  }

  function toggleCustomer(id: number) {
    setSelectedCustomerIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch.trim()) return true
    const q = customerSearch.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.phone.includes(q)
  })

  const filteredProducts = products.filter((p) => {
    if (!productSearch.trim()) return true
    const q = productSearch.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.product_code && p.product_code.toLowerCase().includes(q))
  })

  return (
    <div>
      <PageHeader
        title="Coupons & Discount Codes"
        description="Create promotional coupon codes with target category, product, and customer mapping (e.g., recent buyers)."
        actions={<Button onClick={handleOpenCreate}>+ New Coupon</Button>}
      />

      {successMessage && (
        <div className="mb-4">
          <Alert tone="green">{successMessage}</Alert>
        </div>
      )}

      {pageError && (
        <div className="mb-4">
          <Alert tone="red">{pageError}</Alert>
        </div>
      )}

      {coupons === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#F2E5E7] uppercase text-[#804652] bg-[#FAF2F4]/80 text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Limits</th>
                <th className="px-4 py-3">First Order</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2E5E7]">
              {coupons.map((c) => (
                <tr key={c.id} className="hover:bg-[#FAF2F4]/40 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-bold text-[#7B3F4A] bg-[#FAF2F4] border border-[#EEDDE0] rounded">{c.code}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{c.name}</td>
                  <td className="px-4 py-2.5 text-slate-900 font-bold">
                    {c.discount_type === 'PERCENTAGE' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 font-medium">
                    {c.usage_limit ? `${c.usage_limit} total uses` : 'Unlimited'}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.first_order_only ? <Badge tone="amber">1st Order Only</Badge> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={c.status === 'ACTIVE' ? 'green' : 'slate'}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(c.id)}
                        disabled={fetchingEditId === c.id || deletingId === c.id}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-[#7B3F4A] hover:bg-[#FAF2F4] transition-colors border border-transparent hover:border-[#EEDDE0] disabled:opacity-50 cursor-pointer"
                        title="Edit Coupon"
                        aria-label={`Edit coupon ${c.code}`}
                      >
                        <PencilIcon className="h-4 w-4 stroke-[2]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(c)}
                        disabled={togglingId === c.id || deletingId === c.id}
                        className={`p-1.5 rounded-lg transition-colors border border-transparent cursor-pointer ${
                          c.status === 'ACTIVE'
                            ? 'text-emerald-700 hover:bg-emerald-100/70 hover:border-emerald-200'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 hover:border-slate-300'
                        } disabled:opacity-50`}
                        title={c.status === 'ACTIVE' ? 'Deactivate Coupon' : 'Activate Coupon'}
                        aria-label={c.status === 'ACTIVE' ? `Deactivate coupon ${c.code}` : `Activate coupon ${c.code}`}
                      >
                        <PowerIcon className="h-4 w-4 stroke-[2]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        disabled={deletingId === c.id || togglingId === c.id}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-colors border border-transparent disabled:opacity-50 cursor-pointer"
                        title="Delete Coupon"
                        aria-label={`Delete coupon ${c.code}`}
                      >
                        <TrashIcon className="h-4 w-4 stroke-[2]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No coupons created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <Modal
          title={editingCouponId !== null ? `Edit Coupon: ${code}` : 'New Coupon Code'}
          onClose={handleCloseModal}
          width="lg"
        >
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {modalError && <Alert tone="red">{modalError}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Coupon Code"
                required
                autoFocus={editingCouponId === null}
                disabled={editingCouponId !== null}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME20"
                className={editingCouponId !== null ? 'opacity-70 cursor-not-allowed bg-slate-100' : ''}
              />
              <TextField
                label="Coupon Name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 20% Off First Purchase"
              />
            </div>

            <TextField
              label="Description (Optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Special festival coupon for loyal customers"
            />

            <div className="grid grid-cols-4 gap-3">
              <Select label="Discount Type" value={discountType} onChange={(e: any) => setDiscountType(e.target.value)}>
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (₹)</option>
              </Select>
              <TextField
                label={discountType === 'PERCENTAGE' ? 'Discount Percentage' : 'Discount Amount (₹)'}
                required
                type="number"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
              <TextField label="Min Order Amount (₹)" type="number" step="0.01" value={minOrderAmount} onChange={(e) => setMinOrderAmount(e.target.value)} placeholder="Optional" />
              <TextField label="Max Discount (₹)" type="number" step="0.01" value={maxDiscountAmount} onChange={(e) => setMaxDiscountAmount(e.target.value)} placeholder="Optional" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <TextField label="Total Usage Limit" type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Unlimited" />
              <TextField label="Per-Customer Usage Limit" type="number" value={perCustomerLimit} onChange={(e) => setPerCustomerLimit(e.target.value)} placeholder="e.g. 1" />
            </div>

            {/* Target Customer Mapping & Recent Orders */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">Target Customers (Customer Mapping)</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetType('ALL')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold ${targetType === 'ALL' ? 'bg-[#7B3F4A] text-white' : 'bg-white text-slate-700 border border-[#EEDDE0]'}`}
                  >
                    All Customers
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType('SPECIFIC')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold ${targetType === 'SPECIFIC' ? 'bg-[#7B3F4A] text-white' : 'bg-white text-slate-700 border border-[#EEDDE0]'}`}
                  >
                    Specific Customers ({selectedCustomerIds.length})
                  </button>
                </div>
              </div>

              {targetType === 'SPECIFIC' && (
                <div className="space-y-2 pt-1">
                  <input
                    type="text"
                    placeholder="Search recent customers by name or phone..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-1 text-xs focus:ring-1 focus:ring-[#7B3F4A] focus:border-[#7B3F4A]"
                  />
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto bg-white p-2 rounded-lg border border-slate-200">
                    {filteredCustomers.map((cust) => (
                      <label
                        key={cust.id}
                        className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                          selectedCustomerIds.includes(cust.id) ? 'border-[#7B3F4A] bg-[#FAF2F4]/80' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedCustomerIds.includes(cust.id)}
                            onChange={() => toggleCustomer(cust.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 accent-[#7B3F4A] text-[#7B3F4A] focus:ring-[#7B3F4A]"
                          />
                          <div>
                            <p className="font-semibold text-slate-900">{cust.name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{cust.phone}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge tone={(cust.order_count ?? 0) > 0 ? 'green' : 'slate'}>
                            {cust.order_count ?? 0} Orders
                          </Badge>
                          {cust.latest_order_at && (
                            <p className="text-[9px] text-emerald-700 font-medium mt-0.5">Recent Buyer</p>
                          )}
                        </div>
                      </label>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <p className="text-xs text-slate-400 col-span-2 py-2 text-center">No customers found.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Applicable Products */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-700">Applies Only to Specific Products</span>
                {productIds.length > 0 && (
                  <span className="text-[10px] text-[#7B3F4A] font-semibold">{productIds.length} selected</span>
                )}
              </div>
              {products.length > 6 && (
                <input
                  type="text"
                  placeholder="Filter products by name or code..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full mb-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:ring-1 focus:ring-[#7B3F4A] focus:border-[#7B3F4A]"
                />
              )}
              <div className="grid max-h-36 grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2.5">
                {filteredProducts.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-slate-700 cursor-pointer truncate hover:text-slate-900" title={p.name}>
                    <input
                      type="checkbox"
                      checked={productIds.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-[#7B3F4A] text-[#7B3F4A] focus:ring-[#7B3F4A]"
                    />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))}
                {filteredProducts.length === 0 && (
                  <p className="text-xs text-slate-400 col-span-2 sm:col-span-3 py-1">No products found.</p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-700">Applies Only to Categories</span>
                {categoryIds.length > 0 && (
                  <span className="text-[10px] text-[#7B3F4A] font-semibold">{categoryIds.length} selected</span>
                )}
              </div>
              <div className="grid max-h-36 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2.5">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-slate-700 cursor-pointer hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(c.id)}
                      onChange={() => toggleCategory(c.id)}
                      className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-[#7B3F4A] text-[#7B3F4A] focus:ring-[#7B3F4A]"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
                {categories.length === 0 && (
                  <p className="text-xs text-slate-400 col-span-3 py-1">No categories created yet.</p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-700">Applies Only to Brands</span>
                {brandIds.length > 0 && (
                  <span className="text-[10px] text-[#7B3F4A] font-semibold">{brandIds.length} selected</span>
                )}
              </div>
              <div className="grid max-h-36 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2.5">
                {brands.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-slate-700 cursor-pointer hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={brandIds.includes(b.id)}
                      onChange={() => toggleBrand(b.id)}
                      className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-[#7B3F4A] text-[#7B3F4A] focus:ring-[#7B3F4A]"
                    />
                    <span className="truncate">{b.name}</span>
                  </label>
                ))}
                {brands.length === 0 && (
                  <p className="text-xs text-slate-400 col-span-3 py-1">No brands created yet.</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={firstOrderOnly}
                  onChange={(e) => setFirstOrderOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-[#7B3F4A] text-[#7B3F4A] focus:ring-[#7B3F4A]"
                />
                First Order Only
              </label>
              <label className="flex items-center gap-2 text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={canCombineWithReferral}
                  onChange={(e) => setCanCombineWithReferral(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-[#7B3F4A] text-[#7B3F4A] focus:ring-[#7B3F4A]"
                />
                Combine with Referral Reward
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? editingCouponId !== null
                    ? 'Saving Changes…'
                    : 'Creating…'
                  : editingCouponId !== null
                    ? 'Save Changes'
                    : 'Create Coupon'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
