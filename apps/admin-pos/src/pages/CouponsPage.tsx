import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Category } from '../lib/types'

interface Coupon {
  id: number
  code: string
  name: string
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

export function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE')
  const [discountValue, setDiscountValue] = useState('')
  const [minOrderAmount, setMinOrderAmount] = useState('')
  const [maxDiscountAmount, setMaxDiscountAmount] = useState('')
  const [usageLimit, setUsageLimit] = useState('')
  const [perCustomerLimit, setPerCustomerLimit] = useState('')
  const [firstOrderOnly, setFirstOrderOnly] = useState(false)
  const [canCombineWithReferral, setCanCombineWithReferral] = useState(false)
  const [categoryIds, setCategoryIds] = useState<number[]>([])

  // Customer targeting
  const [targetType, setTargetType] = useState<'ALL' | 'SPECIFIC'>('ALL')
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([])
  const [customerSearch, setCustomerSearch] = useState('')

  function load() {
    api.get('/coupons').then((res) => setCoupons(res.data.coupons))
  }

  useEffect(() => {
    load()
    api.get('/categories').then((res) => setCategories(res.data.categories))
    api.get('/customers').then((res) => setCustomers(res.data.customers))
  }, [])

  function resetForm() {
    setCode('')
    setName('')
    setDiscountType('PERCENTAGE')
    setDiscountValue('')
    setMinOrderAmount('')
    setMaxDiscountAmount('')
    setUsageLimit('')
    setPerCustomerLimit('')
    setFirstOrderOnly(false)
    setCanCombineWithReferral(false)
    setCategoryIds([])
    setTargetType('ALL')
    setSelectedCustomerIds([])
    setCustomerSearch('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/coupons', {
        code,
        name,
        discount_type: discountType,
        discount_value: discountValue,
        min_order_amount: minOrderAmount || null,
        max_discount_amount: maxDiscountAmount || null,
        usage_limit: usageLimit || null,
        per_customer_usage_limit: perCustomerLimit || null,
        first_order_only: firstOrderOnly,
        can_combine_with_referral: canCombineWithReferral,
        category_ids: categoryIds,
        customer_ids: targetType === 'SPECIFIC' ? selectedCustomerIds : [],
      })
      setShowForm(false)
      resetForm()
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create coupon'))
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleStatus(coupon: Coupon) {
    await api.put(`/coupons/${coupon.id}`, { status: coupon.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
    load()
  }

  function toggleCategory(id: number) {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function toggleCustomer(id: number) {
    setSelectedCustomerIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch.trim()) return true
    const q = customerSearch.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.phone.includes(q)
  })

  return (
    <div>
      <PageHeader
        title="Coupons & Discount Codes"
        description="Create promotional coupon codes with target category and target customer mapping (e.g., recent buyers)."
        actions={<Button onClick={() => setShowForm(true)}>+ New Coupon</Button>}
      />

      {coupons === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 uppercase text-slate-500 bg-slate-50/70">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Code</th>
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Discount</th>
                <th className="px-4 py-2.5 font-semibold">Limits</th>
                <th className="px-4 py-2.5 font-semibold">First Order</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {coupons.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-bold text-indigo-700 bg-indigo-50/50 rounded">{c.code}</td>
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
                    <button
                      onClick={() => toggleStatus(c)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
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
        <Modal title="New Coupon Code" onClose={() => setShowForm(false)} width="lg">
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {error && <Alert>{error}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Coupon Code" required autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. WELCOME20" />
              <TextField label="Coupon Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 20% Off First Purchase" />
            </div>

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
                    className={`px-3 py-1 rounded-md text-xs font-semibold ${targetType === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-300'}`}
                  >
                    All Customers
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType('SPECIFIC')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold ${targetType === 'SPECIFIC' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-300'}`}
                  >
                    Specific Recent Customers ({selectedCustomerIds.length})
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
                    className="w-full rounded-md border border-slate-300 px-3 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto bg-white p-2 rounded-lg border border-slate-200">
                    {filteredCustomers.map((cust) => (
                      <label
                        key={cust.id}
                        className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                          selectedCustomerIds.includes(cust.id) ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedCustomerIds.includes(cust.id)}
                            onChange={() => toggleCustomer(cust.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
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

            <div>
              <span className="mb-1 block font-semibold text-slate-700">Applies Only to Categories</span>
              <div className="grid max-h-36 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2.5">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(c.id)}
                      onChange={() => toggleCategory(c.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={firstOrderOnly}
                  onChange={(e) => setFirstOrderOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                First Order Only
              </label>
              <label className="flex items-center gap-2 text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={canCombineWithReferral}
                  onChange={(e) => setCanCombineWithReferral(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Combine with Referral Reward
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Coupon'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
