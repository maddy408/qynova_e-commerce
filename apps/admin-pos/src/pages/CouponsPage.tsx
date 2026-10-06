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

export function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
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

  function load() {
    api.get('/coupons').then((res) => setCoupons(res.data.coupons))
  }

  useEffect(() => {
    load()
    api.get('/categories').then((res) => setCategories(res.data.categories))
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

  return (
    <div>
      <PageHeader
        title="Coupons"
        description="Backend always re-validates and recomputes the discount — this form only sets the rules."
        actions={<Button onClick={() => setShowForm(true)}>+ New Coupon</Button>}
      />

      {coupons === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Discount</th>
                <th className="px-5 py-3 font-medium">Min Order</th>
                <th className="px-5 py-3 font-medium">Usage Limit</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3 font-mono font-medium text-slate-900">{c.code}</td>
                  <td className="px-5 py-3 text-slate-600">{c.name}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {c.discount_type === 'PERCENTAGE' ? `${c.discount_value}%` : `₹${c.discount_value}`}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{c.min_order_amount ? `₹${c.min_order_amount}` : '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{c.usage_limit ?? 'Unlimited'}</td>
                  <td className="px-5 py-3">
                    <Badge tone={c.status === 'ACTIVE' ? 'green' : 'slate'}>{c.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => toggleStatus(c)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                      {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    No coupons yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <Modal title="New Coupon" onClose={() => setShowForm(false)} width="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Coupon Code" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SAVE10" />
              <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="10% off" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Discount Type" value={discountType} onChange={(e) => setDiscountType(e.target.value as 'PERCENTAGE' | 'FIXED')}>
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED">Fixed Amount</option>
              </Select>
              <TextField
                label="Discount Value"
                required
                type="number"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Minimum Order Amount" type="number" step="0.01" value={minOrderAmount} onChange={(e) => setMinOrderAmount(e.target.value)} />
              <TextField label="Maximum Discount Amount" type="number" step="0.01" value={maxDiscountAmount} onChange={(e) => setMaxDiscountAmount(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Total Usage Limit" type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Unlimited" />
              <TextField label="Per-Customer Usage Limit" type="number" value={perCustomerLimit} onChange={(e) => setPerCustomerLimit(e.target.value)} placeholder="Unlimited" />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={firstOrderOnly} onChange={(e) => setFirstOrderOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                First order only
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={canCombineWithReferral}
                  onChange={(e) => setCanCombineWithReferral(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                Can combine with referral discount
              </label>
            </div>
            <div>
              <span className="mb-2 block text-sm font-medium text-slate-700">Applicable Categories (leave empty = entire order)</span>
              <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={categoryIds.includes(c.id)} onChange={() => toggleCategory(c.id)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
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
