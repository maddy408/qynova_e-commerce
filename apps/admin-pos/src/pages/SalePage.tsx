import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Card, Modal, Select, TextField } from '../components/ui'
import { ClockIcon, PauseIcon, TrashIcon } from '../components/Icons'
import { api, apiErrorMessage } from '../lib/api'
import { STOCK_STATUS_LABEL, stockStatus } from '../lib/stock'
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
  customer_price?: string | null
  gst_percent: string | null
  tax_mode: 'INCLUSIVE' | 'EXCLUSIVE' | null
  primary_image: string | null
  on_hand: string
  available: string
  low_stock_threshold: string
}

interface Customer {
  id: number
  name: string
  phone: string
  customer_type: 'RETAIL' | 'WHOLESALE' | 'CUSTOMER_WISE'
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

interface HoldBill {
  id: number
  bill_no: string
  customer_id: number | null
  customer_name: string | null
  note: string | null
  total_amount: string
  price_type: string
  items: any[]
  created_at: string
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

  // Price Mode Selection: RETAIL | WHOLESALE | CUSTOMER_WISE
  const [priceType, setPriceType] = useState<'RETAIL' | 'WHOLESALE' | 'CUSTOMER_WISE'>('RETAIL')

  // Customer search & keyboard navigation state
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [customerHighlightIndex, setCustomerHighlightIndex] = useState<number>(0)

  // Cart & Hold Bills state
  const [cart, setCart] = useState<CartLine[]>([])
  const [couponCode, setCouponCode] = useState('')
  const [holdBills, setHoldBills] = useState<HoldBill[]>([])
  const [showHoldBillsModal, setShowHoldBillsModal] = useState(false)
  const [holdNoteModal, setHoldNoteModal] = useState(false)
  const [holdNote, setHoldNote] = useState('')
  const [holdingBill, setHoldingBill] = useState(false)

  // Payment modal state
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

  function fetchHoldBills() {
    api.get('/hold-bills').then((res) => setHoldBills(res.data.hold_bills || []))
  }

  useEffect(() => {
    api.get('/categories').then((res) => setCategories(res.data.categories))
    api.get('/payment-methods').then((res) => {
      setPaymentMethods(res.data.payment_methods)
      if (res.data.payment_methods.length > 0) setPaymentMethod(res.data.payment_methods[0].code)
    })
    fetchHoldBills()
  }, [])

  useEffect(() => {
    const t = setTimeout(loadProducts, 250)
    return () => clearTimeout(t)
  }, [search, activeCategory])

  useEffect(() => {
    if (customerQuery.trim() === '') {
      setCustomerResults([])
      setCustomerHighlightIndex(0)
      return
    }
    const t = setTimeout(() => {
      api.get('/customers', { params: { search: customerQuery } }).then((res) => {
        setCustomerResults(res.data.customers || [])
        setCustomerHighlightIndex(0)
      })
    }, 250)
    return () => clearTimeout(t)
  }, [customerQuery])

  function resolveVariantPrice(p: PosProduct, mode: 'RETAIL' | 'WHOLESALE' | 'CUSTOMER_WISE'): number {
    if (mode === 'CUSTOMER_WISE' && p.customer_price && Number(p.customer_price) > 0) {
      return Number(p.customer_price)
    }
    if (mode === 'WHOLESALE' && p.wholesale_price && Number(p.wholesale_price) > 0) {
      return Number(p.wholesale_price)
    }
    return Number(p.retail_price)
  }

  // Automatically update prices in active cart whenever priceType changes
  useEffect(() => {
    if (!products || cart.length === 0) return
    setCart((prevCart) =>
      prevCart.map((line) => {
        const prod = products.find((p) => p.variant_id === line.variant_id)
        if (prod) {
          const newPrice = resolveVariantPrice(prod, priceType)
          return { ...line, unit_price: newPrice }
        }
        return line
      })
    )
  }, [priceType])

  function selectCustomer(c: Customer) {
    setCustomer(c)
    setShowCustomerDropdown(false)
    setCustomerQuery('')
    // Auto-map price type based on customer type
    if (c.customer_type === 'WHOLESALE') {
      setPriceType('WHOLESALE')
    } else if (c.customer_type === 'CUSTOMER_WISE') {
      setPriceType('CUSTOMER_WISE')
    } else {
      setPriceType('RETAIL')
    }
  }

  function handleCustomerKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showCustomerDropdown || customerResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCustomerHighlightIndex((prev) => (prev + 1) % customerResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCustomerHighlightIndex((prev) => (prev - 1 + customerResults.length) % customerResults.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (customerResults[customerHighlightIndex]) {
        selectCustomer(customerResults[customerHighlightIndex])
      }
    } else if (e.key === 'Escape') {
      setShowCustomerDropdown(false)
    }
  }

  function addToCart(p: PosProduct) {
    const unitPrice = resolveVariantPrice(p, priceType)
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
          unit_price: unitPrice,
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

  function handleProductKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && products && products.length > 0) {
      e.preventDefault()
      addToCart(products[0])
      setSearch('')
    }
  }

  async function handleHoldBill() {
    if (cart.length === 0) return
    setHoldingBill(true)
    setError('')
    try {
      await api.post('/hold-bills', {
        customer_id: customer?.id ?? null,
        customer_name: customer?.name ?? null,
        note: holdNote,
        total_amount: totals.grandTotal.toFixed(2),
        price_type: priceType,
        items: cart,
      })
      resetSale()
      setHoldNote('')
      setHoldNoteModal(false)
      fetchHoldBills()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not hold bill'))
    } finally {
      setHoldingBill(false)
    }
  }

  async function retrieveHoldBill(hb: HoldBill) {
    setCart(hb.items || [])
    setPriceType((hb.price_type as any) || 'RETAIL')
    if (hb.customer_id) {
      setCustomer({ id: hb.customer_id, name: hb.customer_name || 'Customer', phone: '', customer_type: hb.price_type as any })
    }
    setShowHoldBillsModal(false)
    try {
      await api.delete(`/hold-bills/${hb.id}`)
      fetchHoldBills()
    } catch (err) {
      console.error(err)
    }
  }

  async function deleteHoldBill(id: number) {
    try {
      await api.delete(`/hold-bills/${id}`)
      fetchHoldBills()
    } catch (err) {
      console.error(err)
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
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]">
      <div>
        <Card className="mb-4 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Price Type Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase px-2">Price Mode:</span>
              <button
                type="button"
                onClick={() => setPriceType('RETAIL')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                  priceType === 'RETAIL' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Retail Price
              </button>
              <button
                type="button"
                onClick={() => setPriceType('WHOLESALE')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                  priceType === 'WHOLESALE' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Wholesale Price
              </button>
              <button
                type="button"
                onClick={() => setPriceType('CUSTOMER_WISE')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                  priceType === 'CUSTOMER_WISE' ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Customer-Wise Price
              </button>
            </div>

            {/* Hold Bills Retrieve Badge Button */}
            <button
              type="button"
              onClick={() => {
                fetchHoldBills()
                setShowHoldBillsModal(true)
              }}
              className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
            >
              <ClockIcon className="w-4 h-4 text-amber-600" />
              <span>Held Bills</span>
              {holdBills.length > 0 && (
                <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {holdBills.length}
                </span>
              )}
            </button>
          </div>

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

            {/* Customer Search with Keyboard Navigation (Up/Down + Enter) */}
            <div className="relative min-w-[260px] flex-1">
              <input
                value={customer ? `${customer.name} (${customer.phone})` : customerQuery}
                onChange={(e) => {
                  setCustomer(null)
                  setCustomerQuery(e.target.value)
                  setShowCustomerDropdown(true)
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onKeyDown={handleCustomerKeyDown}
                placeholder="Search customer (type & press ↑↓ Enter)…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {showCustomerDropdown && customerResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {customerResults.map((c, idx) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                        idx === customerHighlightIndex ? 'bg-indigo-50 text-indigo-900 font-semibold' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span>
                        {c.name} <span className="text-slate-400">({c.phone})</span>
                      </span>
                      <Badge tone={c.customer_type === 'WHOLESALE' ? 'amber' : c.customer_type === 'CUSTOMER_WISE' ? 'teal' : 'green'}>
                        {c.customer_type}
                      </Badge>
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
                onKeyDown={handleProductKeyDown}
                placeholder="Search product by name, SKU or barcode… (Enter adds top match)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </Card>

        {/* Category filter tabs */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveCategory('all')}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              activeCategory === 'all' ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Items
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

        {/* Product Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(products ?? []).map((p) => {
            const price = resolveVariantPrice(p, priceType)
            const status = stockStatus(p.available, p.low_stock_threshold)
            const outOfStock = status === 'OUT_OF_STOCK'
            return (
              <button
                key={p.variant_id}
                type="button"
                disabled={outOfStock}
                onClick={() => addToCart(p)}
                className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-3 text-left shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="mb-2 flex h-20 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                  {imageUrl(p.primary_image) ? (
                    <img src={imageUrl(p.primary_image)!} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400">No image</span>
                  )}
                </div>
                {status !== 'IN_STOCK' && (
                  <span
                    className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${
                      status === 'OUT_OF_STOCK' ? 'bg-red-600' : 'bg-amber-500'
                    }`}
                  >
                    {STOCK_STATUS_LABEL[status]}
                  </span>
                )}
                <div className="truncate text-sm font-semibold text-slate-900">{p.product_name}</div>
                <div className="flex items-center justify-between mt-1">
                  <div className="font-bold text-slate-900">₹{Number(price).toFixed(2)}</div>
                  {priceType !== 'RETAIL' && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 uppercase">
                      {priceType}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                  <span>{p.sku}</span>
                  {!outOfStock && <span>Stock: {Number(p.available)}</span>}
                </div>
              </button>
            )
          })}
          {products !== null && products.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-slate-500">No products match search.</p>
          )}
        </div>
      </div>

      {/* Cart & Billing Section */}
      <div>
        <Card className="flex flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-slate-900">Current Bill</div>
              <div className="text-xs text-slate-500">{cart.length} item(s) selected</div>
            </div>
            {cart.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setHoldNoteModal(true)}
                className="flex items-center gap-1.5 border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100"
              >
                <PauseIcon className="w-4 h-4 text-amber-700" />
                Hold Bill
              </Button>
            )}
          </div>

          <div className="mb-3 flex max-h-96 flex-col gap-2 overflow-y-auto">
            {cart.map((line) => (
              <div key={line.variant_id} className="flex gap-2 rounded-lg border border-slate-200 p-2 bg-white">
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
            {cart.length === 0 && <div className="py-10 text-center text-sm text-slate-500">Cart is empty — tap a product or search barcode.</div>}
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
            Clear Bill
          </Button>
        </Card>
      </div>

      {/* Hold Note Prompt Modal */}
      {holdNoteModal && (
        <Modal title="Hold Current Bill" onClose={() => setHoldNoteModal(false)}>
          <div className="space-y-4">
            <p className="text-xs text-slate-600">Add an optional customer note or desk reference before holding this bill.</p>
            <TextField
              label="Hold Note / Reference (Optional)"
              value={holdNote}
              onChange={(e) => setHoldNote(e.target.value)}
              placeholder="e.g. Table 4 / Customer will return in 5 mins"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setHoldNoteModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleHoldBill} disabled={holdingBill}>
                {holdingBill ? 'Holding Bill…' : 'Confirm Hold Bill'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Held Bills Retrieve List Modal */}
      {showHoldBillsModal && (
        <Modal title="Held Bills List" onClose={() => setShowHoldBillsModal(false)}>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {holdBills.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No held bills currently stored.</p>
            ) : (
              <div className="space-y-3">
                {holdBills.map((hb) => (
                  <div key={hb.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-700">{hb.bill_no}</span>
                        <Badge tone="amber">{hb.price_type}</Badge>
                      </div>
                      <div className="text-xs font-semibold text-slate-800 mt-1">
                        Customer: {hb.customer_name || 'Walk-in'}
                      </div>
                      {hb.note && <div className="text-xs text-slate-500 italic">"{hb.note}"</div>}
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {hb.items?.length || 0} items • {new Date(hb.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right font-bold text-slate-900 text-sm mr-2">
                        ₹{Number(hb.total_amount).toFixed(2)}
                      </div>
                      <Button size="sm" onClick={() => retrieveHoldBill(hb)}>
                        Retrieve / Resume
                      </Button>
                      <button
                        onClick={() => deleteHoldBill(hb.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-slate-200"
                        title="Delete held bill"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <Modal title="Complete POS Sale & Payment" onClose={() => setShowPayment(false)}>
          <div className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Grand Total Due</p>
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
              label="Amount Paid (₹)"
              type="number"
              step="0.01"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
            {Number(amountPaid) < totals.grandTotal && (
              <Alert tone="amber">Partial payment — remaining balance will show as PARTIAL due on the invoice.</Alert>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowPayment(false)}>
                Back
              </Button>
              <Button onClick={completeSale} disabled={submitting}>
                {submitting ? 'Completing Sale…' : 'Complete Sale & Print'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
