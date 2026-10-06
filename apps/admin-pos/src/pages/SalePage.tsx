import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Card, Modal, Select, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Category, PaymentMethod } from '../lib/types'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '')
function imageUrl(path: string | null) {
  return path ? `${API_ORIGIN}/${path}` : null
}

interface PosProduct {
  variant_id: number
  product_id: number
  sku: string
  barcode: string | null
  product_name: string
  mrp: string
  retail_price: string
  wholesale_price: string | null
  gst_percent: string | null
  tax_mode: 'INCLUSIVE' | 'EXCLUSIVE' | null
  primary_image: string | null
  on_hand: string
  available: string
}

interface Customer {
  id: number
  name: string
  phone: string
  customer_type: 'RETAIL' | 'WHOLESALE'
}

interface CartLine {
  variant_id: number
  product_name: string
  sku: string
  image: string | null
  qty: number
  unit_price: number
  mrp: number
  gst_percent: number
  tax_mode: 'INCLUSIVE' | 'EXCLUSIVE'
  available: number
}

function money(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function SalePage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<PosProduct[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [activeCategory, setActiveCategory] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  const [cart, setCart] = useState<CartLine[]>([])
  const [couponCode, setCouponCode] = useState('')

  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [amountPaid, setAmountPaid] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function loadProducts() {
    api
      .get('/pos/products', { params: { search: search || undefined, category_id: activeCategory === 'all' ? undefined : activeCategory } })
      .then((res) => setProducts(res.data.items))
  }

  useEffect(() => {
    api.get('/categories').then((res) => setCategories(res.data.categories))
    api.get('/payment-methods').then((res) => {
      setPaymentMethods(res.data.payment_methods)
      if (res.data.payment_methods.length > 0) setPaymentMethod(res.data.payment_methods[0].code)
    })
  }, [])

  useEffect(() => {
    const t = setTimeout(loadProducts, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeCategory])

  useEffect(() => {
    if (customerQuery.trim() === '') {
      setCustomerResults([])
      return
    }
    const t = setTimeout(() => {
      api.get('/customers', { params: { search: customerQuery } }).then((res) => setCustomerResults(res.data.customers))
    }, 250)
    return () => clearTimeout(t)
  }, [customerQuery])

  const priceField = customer?.customer_type === 'WHOLESALE' ? 'wholesale_price' : 'retail_price'

  function addToCart(p: PosProduct) {
    const rawPrice = (customer?.customer_type === 'WHOLESALE' ? p.wholesale_price : null) ?? p.retail_price
    setCart((prev) => {
      const existing = prev.find((l) => l.variant_id === p.variant_id)
      if (existing) {
        return prev.map((l) => (l.variant_id === p.variant_id ? { ...l, qty: l.qty + 1 } : l))
      }
      return [
        ...prev,
        {
          variant_id: p.variant_id,
          product_name: p.product_name,
          sku: p.sku,
          image: p.primary_image,
          qty: 1,
          unit_price: Number(rawPrice),
          mrp: Number(p.mrp),
          gst_percent: Number(p.gst_percent ?? 0),
          tax_mode: p.tax_mode ?? 'EXCLUSIVE',
          available: Number(p.available),
        },
      ]
    })
  }

  function updateQty(variantId: number, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.variant_id !== variantId))
      return
    }
    setCart((prev) => prev.map((l) => (l.variant_id === variantId ? { ...l, qty } : l)))
  }

  function removeLine(variantId: number) {
    setCart((prev) => prev.filter((l) => l.variant_id !== variantId))
  }

  function resetSale() {
    setCart([])
    setCustomer(null)
    setCouponCode('')
  }

  const totals = useMemo(() => {
    let subtotal = 0
    let tax = 0
    for (const line of cart) {
      const lineSubtotal = line.unit_price * line.qty
      const lineTax =
        line.tax_mode === 'INCLUSIVE'
          ? lineSubtotal - (lineSubtotal * 100) / (100 + line.gst_percent)
          : (lineSubtotal * line.gst_percent) / 100
      subtotal += lineSubtotal
      tax += lineTax
    }
    return { subtotal, tax, grandTotal: subtotal + tax }
  }, [cart])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && products && products.length > 0) {
      e.preventDefault()
      addToCart(products[0])
      setSearch('')
    }
  }

  async function completeSale() {
    setError('')
    setSubmitting(true)
    try {
      const res = await api.post('/invoices/pos-sale', {
        items: cart.map((l) => ({ variant_id: l.variant_id, quantity: l.qty })),
        customer_id: customer?.id ?? null,
        payment_method: paymentMethod,
        amount_paid: amountPaid || totals.grandTotal.toFixed(2),
        coupon_code: couponCode || null,
      })
      resetSale()
      navigate(`/invoices/${res.data.invoice.id}`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not complete sale'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
      <div>
        <Card className="mb-4 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setCustomer(null)
                setCustomerQuery('')
              }}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
                !customer ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Walk-in Customer
            </button>

            <div className="relative min-w-[220px]">
              <input
                value={customer ? `${customer.name} (${customer.phone})` : customerQuery}
                onChange={(e) => {
                  setCustomer(null)
                  setCustomerQuery(e.target.value)
                  setShowCustomerDropdown(true)
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                placeholder="Search customer by name or phone…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {showCustomerDropdown && customerResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCustomer(c)
                        setShowCustomerDropdown(false)
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span>
                        {c.name} <span className="text-slate-400">({c.phone})</span>
                      </span>
                      {c.customer_type === 'WHOLESALE' && <Badge tone="amber">Wholesale</Badge>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative min-w-[240px] flex-1">
              <input
                ref={searchRef}
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search product by name, SKU or barcode… (Enter adds the first match)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </Card>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveCategory('all')}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              activeCategory === 'all' ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === c.id ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(products ?? []).map((p) => {
            const price = customer?.customer_type === 'WHOLESALE' ? p.wholesale_price ?? p.retail_price : p.retail_price
            const outOfStock = Number(p.available) <= 0
            return (
              <button
                key={p.variant_id}
                type="button"
                disabled={outOfStock}
                onClick={() => addToCart(p)}
                className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="mb-2 flex h-20 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                  {imageUrl(p.primary_image) ? (
                    <img src={imageUrl(p.primary_image)!} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400">No image</span>
                  )}
                </div>
                {outOfStock && (
                  <span className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">Out of stock</span>
                )}
                <div className="truncate text-sm font-semibold text-slate-900">{p.product_name}</div>
                <div className="mb-1 font-bold text-slate-900">₹{Number(price).toFixed(2)}</div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{p.sku}</span>
                  {!outOfStock && <span>Stock: {Number(p.available)}</span>}
                </div>
              </button>
            )
          })}
          {products !== null && products.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-slate-500">No products match.</p>
          )}
        </div>
      </div>

      <div>
        <Card className="flex flex-col p-4">
          <div className="mb-3">
            <div className="text-lg font-bold text-slate-900">Current Bill</div>
            <div className="text-xs text-slate-500">{cart.length} item(s)</div>
          </div>

          <div className="mb-3 flex max-h-96 flex-col gap-2 overflow-y-auto">
            {cart.map((line) => (
              <div key={line.variant_id} className="flex gap-2 rounded-lg border border-slate-200 p-2">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-slate-100">
                  {imageUrl(line.image) && <img src={imageUrl(line.image)!} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0 truncate text-sm font-semibold text-slate-900">{line.product_name}</div>
                    <button onClick={() => removeLine(line.variant_id)} className="shrink-0 text-slate-400 hover:text-red-600">
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQty(line.variant_id, line.qty - 1)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={line.qty}
                        onChange={(e) => updateQty(line.variant_id, Number(e.target.value))}
                        className="w-10 rounded border border-slate-300 px-1 py-0.5 text-center text-sm"
                      />
                      <button
                        onClick={() => updateQty(line.variant_id, line.qty + 1)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">{money(line.unit_price * line.qty)}</span>
                  </div>
                </div>
              </div>
            ))}
            {cart.length === 0 && <div className="py-10 text-center text-sm text-slate-500">Cart is empty — search or tap a product.</div>}
          </div>

          <TextField
            placeholder="Coupon code (optional)"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            className="mb-3"
          />

          <div className="space-y-1 border-t border-slate-200 pt-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{money(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>GST</span>
              <span>{money(totals.tax)}</span>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2.5">
            <span className="font-bold text-slate-900">Total</span>
            <span className="text-xl font-bold text-slate-900">{money(totals.grandTotal)}</span>
          </div>

          <Button
            size="md"
            className="mt-4 w-full"
            disabled={cart.length === 0}
            onClick={() => {
              setAmountPaid(totals.grandTotal.toFixed(2))
              setShowPayment(true)
            }}
          >
            Proceed to Payment
          </Button>
          <Button variant="secondary" className="mt-2 w-full" disabled={cart.length === 0} onClick={resetSale}>
            Clear
          </Button>
        </Card>
      </div>

      {showPayment && (
        <Modal title="Payment" onClose={() => setShowPayment(false)}>
          <div className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Amount Due</p>
              <p className="text-2xl font-bold text-slate-900">{money(totals.grandTotal)}</p>
            </div>
            <Select label="Payment Method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.code}>
                  {m.name}
                </option>
              ))}
            </Select>
            <TextField
              label="Amount Paid"
              type="number"
              step="0.01"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
            {Number(amountPaid) < totals.grandTotal && (
              <Alert tone="green">Partial payment — remaining balance will show as PARTIAL on the invoice.</Alert>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowPayment(false)}>
                Back
              </Button>
              <Button onClick={completeSale} disabled={submitting}>
                {submitting ? 'Completing…' : 'Complete Sale'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
