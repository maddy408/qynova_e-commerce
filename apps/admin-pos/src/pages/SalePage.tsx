import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Modal, Select, TextField } from '../components/ui'
import { ClockIcon, TrashIcon, CameraIcon, WifiIcon, BluetoothIcon, CheckIcon } from '../components/Icons'
import { api, apiErrorMessage } from '../lib/api'
import { stockStatus, STOCK_STATUS_LABEL } from '../lib/stock'
import type { Category, PaymentMethod } from '../lib/types'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '')
function imageUrl(path: string | null) {
  return path ? `${API_ORIGIN}/${path}` : null
}

function playBeepSound(type: 'success' | 'error' = 'success') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(type === 'success' ? 880 : 330, ctx.currentTime)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + (type === 'success' ? 0.12 : 0.25))
  } catch (e) {
    console.error(e)
  }
}

interface PosProduct {
  variant_id: number
  product_id: number
  sku: string
  barcode: string | null
  product_name: string
  mrp: string
  normal_price?: string | null
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
  customer_type: 'NORMAL' | 'RETAIL' | 'WHOLESALE' | 'CUSTOMER_WISE'
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

  // Customer Type-Wise Pricing Mode Selection: NORMAL (default) | RETAIL | WHOLESALE | CUSTOMER_WISE
  const [priceType, setPriceType] = useState<'NORMAL' | 'RETAIL' | 'WHOLESALE' | 'CUSTOMER_WISE'>('NORMAL')

  // Customer search & keyboard navigation state
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [customerHighlightIndex, setCustomerHighlightIndex] = useState<number>(0)

  // Quick Customer Creation Modal State
  const [showNewCustModal, setShowNewCustModal] = useState(false)
  const [newCustName, setNewCustName] = useState('')
  const [newCustPhone, setNewCustPhone] = useState('')
  const [newCustEmail, setNewCustEmail] = useState('')
  const [newCustType, setNewCustType] = useState<'NORMAL' | 'RETAIL' | 'WHOLESALE'>('NORMAL')
  const [creatingCust, setCreatingCust] = useState(false)

  // Scanner states & modes (camera | wifi | bluetooth | null)
  const [activeScanner, setActiveScanner] = useState<'camera' | 'wifi' | 'bluetooth' | null>(null)
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastScanTimeRef = useRef<number>(0)
  const lastScannedCodeRef = useRef<string>('')

  // Bluetooth HID fast inter-key timing buffer (<50ms)
  const keyBufferRef = useRef<{ char: string; time: number }[]>([])

  // Toast notification state
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Unmatched Barcode Quick Add state
  const [unmatchedBarcode, setUnmatchedBarcode] = useState<string | null>(null)

  // Cart & Hold Bills state
  const [cart, setCart] = useState<CartLine[]>([])
  const [couponCode, setCouponCode] = useState('')
  const [holdBills, setHoldBills] = useState<HoldBill[]>([])
  const [showHoldBillsModal, setShowHoldBillsModal] = useState(false)
  const [holdNoteModal, setHoldNoteModal] = useState(false)
  const [holdNote, setHoldNote] = useState('')
  const [holdingBill, setHoldingBill] = useState(false)

  // Quick Sale modal & state
  const [showQuickSaleModal, setShowQuickSaleModal] = useState(false)
  const [quickItemName, setQuickItemName] = useState('Quick Sale Item')
  const [quickQty, setQuickQty] = useState<number | string>(2)
  const [quickRate, setQuickRate] = useState<number | string>(20)

  // Payment modal state
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [amountPaid, setAmountPaid] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function showToast(text: string, type: 'success' | 'error' = 'success') {
    setToastMsg({ text, type })
    setTimeout(() => setToastMsg(null), 3000)
  }

  function loadProducts() {
    api
      .get('/pos/products', { params: { search: search || undefined, category_id: activeCategory === 'all' ? undefined : activeCategory } })
      .then((res) => setProducts(res.data.items))
  }

  function fetchHoldBills() {
    api.get('/hold-bills').then((res) => setHoldBills(res.data.hold_bills || []))
  }

  function fetchCustomers() {
    api.get('/customers').then((res) => {
      setAllCustomers(res.data.customers || [])
      setCustomerResults(res.data.customers || [])
    })
  }

  useEffect(() => {
    api.get('/categories').then((res) => setCategories(res.data.categories))
    api.get('/payment-methods').then((res) => {
      setPaymentMethods(res.data.payment_methods)
      if (res.data.payment_methods.length > 0) setPaymentMethod(res.data.payment_methods[0].code)
    })
    fetchHoldBills()
    fetchCustomers()
  }, [])

  useEffect(() => {
    const t = setTimeout(loadProducts, 250)
    return () => clearTimeout(t)
  }, [search, activeCategory])

  useEffect(() => {
    if (customerQuery.trim() === '') {
      setCustomerResults(allCustomers)
      setCustomerHighlightIndex(0)
      return
    }
    const q = customerQuery.toLowerCase()
    const filtered = allCustomers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    )
    setCustomerResults(filtered)
    setCustomerHighlightIndex(0)
  }, [customerQuery, allCustomers])

  function resolveVariantPrice(p: PosProduct, mode: 'NORMAL' | 'RETAIL' | 'WHOLESALE' | 'CUSTOMER_WISE'): number {
    const normal = Number(p.normal_price || p.retail_price || p.mrp || 0)
    if (mode === 'WHOLESALE') {
      return (p.wholesale_price && Number(p.wholesale_price) > 0) ? Number(p.wholesale_price) : normal
    }
    if (mode === 'RETAIL') {
      return (p.retail_price && Number(p.retail_price) > 0) ? Number(p.retail_price) : normal
    }
    if (mode === 'CUSTOMER_WISE') {
      return (p.customer_price && Number(p.customer_price) > 0) ? Number(p.customer_price) : normal
    }
    return normal
  }

  // Automatically update prices in active cart whenever priceType changes mid-sale
  useEffect(() => {
    if (!products || cart.length === 0) return
    setCart((prevCart) =>
      prevCart.map((line) => {
        if (line.variant_id < 0) return line // preserve manual / quick sale prices
        const prod = products.find((p) => p.variant_id === line.variant_id)
        if (prod) {
          const newPrice = resolveVariantPrice(prod, priceType)
          return { ...line, unit_price: newPrice }
        }
        return line
      })
    )
  }, [priceType])

  // Barcode Scanner handler logic
  function handleBarcodeScanned(code: string) {
    const trimmed = code.trim()
    if (!trimmed) return

    // Debounce duplicate scans within 500ms
    const now = Date.now()
    if (lastScannedCodeRef.current === trimmed && now - lastScanTimeRef.current < 500) {
      return
    }
    lastScanTimeRef.current = now
    lastScannedCodeRef.current = trimmed

    // Search product in current product list or via API
    const match = (products || []).find((p) => (p.barcode && p.barcode.toLowerCase() === trimmed.toLowerCase()) || p.sku.toLowerCase() === trimmed.toLowerCase())
    if (match) {
      addToCart(match)
      playBeepSound('success')
      showToast(`Scanned: ${match.product_name} ✓`, 'success')
      setShowCameraModal(false)
    } else {
      // Fallback search via API
      api.get('/pos/products', { params: { search: trimmed } }).then((res) => {
        const found = (res.data.items || []).find((p: PosProduct) => (p.barcode && p.barcode.toLowerCase() === trimmed.toLowerCase()) || p.sku.toLowerCase() === trimmed.toLowerCase())
        if (found) {
          addToCart(found)
          playBeepSound('success')
          showToast(`Scanned: ${found.product_name} ✓`, 'success')
          setShowCameraModal(false)
        } else {
          playBeepSound('error')
          showToast(`Item not found for barcode: ${trimmed}`, 'error')
          setUnmatchedBarcode(trimmed)
          setShowCameraModal(false)
        }
      })
    }
  }

  // Bluetooth HID Keyboard scanner listener (<50ms inter-key gap)
  useEffect(() => {
    if (activeScanner !== 'bluetooth') return

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now()
      if (e.key === 'Enter') {
        if (keyBufferRef.current.length >= 3) {
          const code = keyBufferRef.current.map((k) => k.char).join('')
          handleBarcodeScanned(code)
        }
        keyBufferRef.current = []
        return
      }

      if (e.key.length === 1) {
        // Filter out keys typed with gap > 50ms (human typing)
        if (keyBufferRef.current.length > 0) {
          const lastTime = keyBufferRef.current[keyBufferRef.current.length - 1].time
          if (now - lastTime > 60) {
            keyBufferRef.current = []
          }
        }
        keyBufferRef.current.push({ char: e.key, time: now })
      }
    }

    window.addEventListener('keydown', handleKeyDown as any)
    return () => window.removeEventListener('keydown', handleKeyDown as any)
  }, [activeScanner, products, priceType])

  // Camera Barcode Scanner stream handler using BarcodeDetector API
  useEffect(() => {
    if (!showCameraModal) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      return
    }

    setCameraError('')
    let animFrameId: number

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access requires HTTPS or localhost.')
      return
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }

        if ('BarcodeDetector' in window) {
          const barcodeDetector = new (window as any).BarcodeDetector()
          const scanFrame = async () => {
            if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
              try {
                const barcodes = await barcodeDetector.detect(videoRef.current)
                if (barcodes && barcodes.length > 0) {
                  handleBarcodeScanned(barcodes[0].rawValue)
                }
              } catch (err) {
                console.error(err)
              }
            }
            if (showCameraModal) animFrameId = requestAnimationFrame(scanFrame)
          }
          scanFrame()
        } else {
          setCameraError('BarcodeDetector API is not supported on this browser. Use Chrome/Edge on HTTPS.')
        }
      })
      .catch((err) => {
        setCameraError(`Camera permission denied or unavailable: ${err.message}`)
      })

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [showCameraModal])

  function selectCustomer(c: Customer) {
    setCustomer(c)
    setShowCustomerDropdown(false)
    setCustomerQuery('')
    if (c.customer_type === 'WHOLESALE') {
      setPriceType('WHOLESALE')
    } else if (c.customer_type === 'RETAIL') {
      setPriceType('RETAIL')
    } else {
      setPriceType('NORMAL')
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

  async function handleCreateCustomer(e: FormEvent) {
    e.preventDefault()
    if (!newCustName || !newCustPhone) return
    setCreatingCust(true)
    setError('')
    try {
      const res = await api.post('/customers', {
        name: newCustName,
        phone: newCustPhone,
        email: newCustEmail || null,
        customer_type: newCustType,
      })
      const created = res.data.customer || res.data
      await fetchCustomers()
      selectCustomer(created)
      setShowNewCustModal(false)
      setNewCustName('')
      setNewCustPhone('')
      setNewCustEmail('')
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to create customer'))
    } finally {
      setCreatingCust(false)
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
    setPriceType('NORMAL')
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
    if (e.key === 'Enter' && search.trim() !== '') {
      e.preventDefault()
      handleBarcodeScanned(search)
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
    setPriceType((hb.price_type as any) || 'NORMAL')
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

  function handleAddQuickSale(e?: FormEvent) {
    if (e) e.preventDefault()
    const qtyNum = Number(quickQty) || 1
    const rateNum = Number(quickRate) || 0
    if (qtyNum <= 0 || rateNum <= 0) return

    const syntheticId = -Date.now() - Math.floor(Math.random() * 1000)
    setCart((prev) => [
      ...prev,
      {
        variant_id: syntheticId,
        product_name: quickItemName.trim() || 'Quick Sale Item',
        sku: 'QUICK-SALE',
        image: null,
        qty: qtyNum,
        unit_price: rateNum,
        mrp: rateNum,
        gst_percent: 0,
        tax_mode: 'EXCLUSIVE',
        available: 99999,
      },
    ])
    setShowQuickSaleModal(false)
    setQuickItemName('Quick Sale Item')
    setQuickQty(2)
    setQuickRate(20)
  }

  async function completeSale() {
    setError('')
    const isCredit = paymentMethod.toUpperCase().includes('CREDIT')
    if (isCredit && !customer) {
      setError('Credit payment is only allowed for registered customers. Please select or add a customer.')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post('/invoices/pos-sale', {
        items: cart.map((l) => ({
          variant_id: l.variant_id < 0 ? 0 : l.variant_id,
          quantity: l.qty,
          unit_price: l.unit_price,
          product_name: l.product_name,
          is_quick_sale: l.variant_id < 0,
        })),
        price_type: priceType,
        customer_id: customer?.id ?? null,
        payment_method: paymentMethod,
        amount_paid: amountPaid || totals.grandTotal.toFixed(2),
        coupon_code: couponCode || null,
      })

      const newInvoiceId = res.data?.invoice?.id
      setShowPayment(false)
      resetSale()

      if (newInvoiceId) {
        navigate(`/invoices/${newInvoiceId}?print=true`)
      } else {
        setError('Sale completed, but invoice ID was missing.')
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not complete sale'))
    } finally {
      setSubmitting(false)
    }
  }

  const isCreditSelected = paymentMethod.toUpperCase().includes('CREDIT')
  const isWalkInCreditBlocked = isCreditSelected && !customer

  return (
    <div className="w-full max-w-full grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-3 relative">
      {/* Toast Notification Banner */}
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-50 flex items-center space-x-2 rounded-xl px-4 py-3 text-xs font-bold shadow-xl border ${
          toastMsg.type === 'success' ? 'bg-emerald-900 text-emerald-100 border-emerald-700' : 'bg-red-900 text-red-100 border-red-700'
        }`}>
          {toastMsg.type === 'success' ? <CheckIcon className="h-4 w-4 text-emerald-400" /> : <span className="text-red-400 font-extrabold">⚠️</span>}
          <span>{toastMsg.text}</span>
        </div>
      )}

      <div>
        {/* Top Control Bar & Customer Type Section */}
        <div className="mb-3 rounded-2xl bg-white border border-[#F2E5E7] p-3.5 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Customer Type Selector Pills: Normal | Retail | Wholesale | Customer-Wise */}
            <div className="flex flex-wrap items-center gap-1.5 bg-[#FAF2F4] p-1 rounded-xl border border-[#F2E5E7]">
              <span className="text-[11px] font-black text-[#804652] uppercase px-2">Price Mode:</span>
              <button
                type="button"
                onClick={() => setPriceType('NORMAL')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  priceType === 'NORMAL' ? 'bg-[#804652] text-white shadow-xs' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setPriceType('RETAIL')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  priceType === 'RETAIL' ? 'bg-[#804652] text-white shadow-xs' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                Retail
              </button>
              <button
                type="button"
                onClick={() => setPriceType('WHOLESALE')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  priceType === 'WHOLESALE' ? 'bg-[#804652] text-white shadow-xs' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                Wholesale
              </button>
              <button
                type="button"
                onClick={() => setPriceType('CUSTOMER_WISE')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  priceType === 'CUSTOMER_WISE' ? 'bg-[#804652] text-white shadow-xs' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                Customer-Wise
              </button>
            </div>

            {/* Quick Sale & Held Bills Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowQuickSaleModal(true)}
                className="flex items-center gap-1 rounded-xl border border-[#E8CCD1] bg-[#FAF2F4] px-3 py-1.5 text-xs font-bold text-[#804652] hover:bg-[#F8EAED] transition-colors cursor-pointer"
              >
                <span>⚡ Quick Sale</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  fetchHoldBills()
                  setShowHoldBillsModal(true)
                }}
                className="flex items-center gap-1.5 rounded-xl border border-[#E8CCD1] bg-[#FAF2F4] px-3.5 py-1.5 text-xs font-bold text-[#804652] hover:bg-[#F8EAED] transition-colors cursor-pointer"
              >
                <ClockIcon className="w-3.5 h-3.5 text-[#804652]" />
                <span>Held Bills</span>
                {holdBills.length > 0 && (
                  <span className="rounded-full bg-[#804652] px-2 py-0.5 text-[10px] font-black text-white">
                    {holdBills.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Customer Search & Product Search Row */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Walk-in Customer Button */}
            <button
              type="button"
              onClick={() => {
                setCustomer(null)
                setCustomerQuery('')
              }}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition-all cursor-pointer ${
                !customer ? 'bg-[#804652] text-white shadow-xs' : 'border border-[#E8CCD1] bg-white text-slate-800 hover:bg-[#FAF2F4]'
              }`}
            >
              Walk-in Customer
            </button>

            <button
              type="button"
              onClick={() => setShowNewCustModal(true)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#E8CCD1] bg-[#FAF2F4] px-3 text-xs font-bold text-[#804652] hover:bg-[#F8EAED] transition-colors cursor-pointer"
            >
              + Add Customer
            </button>

            {/* Customer Search with Keyboard Navigation */}
            <div className="relative min-w-[220px] flex-1">
              <input
                value={customer ? `${customer.name} (${customer.phone})` : customerQuery}
                onChange={(e) => {
                  setCustomer(null)
                  setCustomerQuery(e.target.value)
                  setShowCustomerDropdown(true)
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onKeyDown={handleCustomerKeyDown}
                placeholder="Search customer by name or phone…"
                className="w-full rounded-xl border border-[#E8CCD1] bg-white pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-[#804652]"
              />
              {showCustomerDropdown && customerResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-xl border border-[#E8CCD1] bg-white shadow-xl">
                  {customerResults.map((c, idx) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                        idx === customerHighlightIndex ? 'bg-[#FAF2F4] text-[#804652] font-bold' : 'hover:bg-[#FAF2F4]/60'
                      }`}
                    >
                      <span className="font-bold text-slate-950">
                        {c.name} <span className="text-slate-600 font-semibold">({c.phone})</span>
                      </span>
                      <Badge tone={c.customer_type === 'WHOLESALE' ? 'amber' : c.customer_type === 'RETAIL' ? 'teal' : 'green'}>
                        {c.customer_type}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Search Bar with 3 Barcode Scanner Icons */}
            <div className="relative min-w-[260px] flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              <input
                ref={searchRef}
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleProductKeyDown}
                placeholder="Search product by name, SKU or barcode… (Enter adds top match)"
                className="w-full rounded-xl border border-[#E8CCD1] bg-white pl-8 pr-24 py-1.5 text-xs font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-[#804652]"
              />
              
              {/* 3 Scanner Buttons inside search bar right */}
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => {
                    if (activeScanner === 'camera') {
                      setActiveScanner(null)
                      setShowCameraModal(false)
                    } else {
                      setActiveScanner('camera')
                      setShowCameraModal(true)
                    }
                  }}
                  className={`p-1 rounded-md transition-all ${
                    activeScanner === 'camera' ? 'bg-[#7E1235] text-white shadow-xs' : 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                  }`}
                  title="Camera Barcode Scanner"
                >
                  <CameraIcon className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveScanner(activeScanner === 'wifi' ? null : 'wifi')}
                  className={`p-1 rounded-md transition-all ${
                    activeScanner === 'wifi' ? 'bg-emerald-600 text-white shadow-xs animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  title="WiFi Barcode Scanner Feed"
                >
                  <WifiIcon className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveScanner(activeScanner === 'bluetooth' ? null : 'bluetooth')}
                  className={`p-1 rounded-md transition-all ${
                    activeScanner === 'bluetooth' ? 'bg-blue-600 text-white shadow-xs animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  title="Bluetooth HID Barcode Scanner"
                >
                  <BluetoothIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Active Scanner Status Indicator Badges */}
          {activeScanner && (
            <div className="flex items-center space-x-2 pt-1">
              <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeScanner === 'camera' ? 'bg-pink-100 text-pink-900 border border-pink-200' :
                activeScanner === 'wifi' ? 'bg-emerald-100 text-emerald-900 border border-emerald-200 animate-pulse' :
                'bg-blue-100 text-blue-900 border border-blue-200 animate-pulse'
              }`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current mr-1" />
                <span>
                  {activeScanner === 'camera' && 'Camera Scanner Active / Modal Open'}
                  {activeScanner === 'wifi' && 'WiFi Scanner Feed Listening…'}
                  {activeScanner === 'bluetooth' && 'Bluetooth HID Scanner Listening (< 50ms keystrokes)…'}
                </span>
              </span>
            </div>
          )}
        </div>
        {/* Category filter tabs */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveCategory('all')}
            className={`rounded-full px-4 py-1.5 text-xs font-black transition-all cursor-pointer ${
              activeCategory === 'all' ? 'bg-[#804652] text-white shadow-xs' : 'border border-[#E8CCD1] bg-white text-slate-800 hover:bg-[#FAF2F4]'
            }`}
          >
            All Items
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-black transition-all cursor-pointer ${
                activeCategory === c.id ? 'bg-[#804652] text-white shadow-xs' : 'border border-[#E8CCD1] bg-white text-slate-800 hover:bg-[#FAF2F4]'
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
                className="group relative flex flex-col rounded-2xl border border-[#F2E5E7] bg-white p-3 text-left shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-[#804652]/30 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded-xl bg-[#FAF2F4] p-1 border border-[#F2E5E7]">
                  {imageUrl(p.primary_image) ? (
                    <img src={imageUrl(p.primary_image)!} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs font-bold text-[#804652]">No image</span>
                  )}
                </div>
                {status !== 'IN_STOCK' && (
                  <span
                    className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${
                      status === 'OUT_OF_STOCK' ? 'bg-rose-600' : 'bg-amber-600'
                    }`}
                  >
                    {STOCK_STATUS_LABEL[status]}
                  </span>
                )}
                <div className="truncate text-sm font-bold text-slate-950">{p.product_name}</div>
                <div className="flex items-center justify-between mt-1">
                  <div className="font-black text-slate-950 text-base">₹{Number(price).toFixed(2)}</div>
                  {priceType !== 'RETAIL' && (
                    <span className="text-[10px] font-black text-[#804652] bg-[#FAF2F4] px-1.5 py-0.5 rounded border border-[#E8CCD1] uppercase">
                      {priceType}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 font-semibold mt-1">
                  <span className="font-mono">{p.sku}</span>
                  {!outOfStock && <span className="font-bold text-slate-800">Stock: {Number(p.available)}</span>}
                </div>
              </button>
            )
          })}
          {products !== null && products.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm font-semibold text-slate-500">No products match search.</p>
          )}
        </div>
      </div>

      {/* Cart & Billing Right Sidebar Panel */}
      <div>
        <div className="flex flex-col rounded-2xl border border-[#F2E5E7] bg-white p-4 shadow-2xs">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between border-b border-[#F2E5E7] pb-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base font-black text-slate-950">Current Bill</span>
                <span className="rounded-lg bg-[#FAF2F4] text-[#804652] border border-[#E8CCD1] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                  {priceType} PRICING
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1 font-medium">
                <ClockIcon className="h-3 w-3 text-slate-400" />
                <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}, {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            <div className="text-xs font-bold text-slate-600">
              {cart.length} item(s)
            </div>
          </div>

          {/* Cart Items List */}
          <div className="mb-3 flex max-h-96 flex-col gap-2 overflow-y-auto">
            {cart.map((line) => (
              <div key={line.variant_id} className="flex items-center justify-between rounded-xl border border-slate-200 p-2.5 bg-slate-50">
                <div className="min-w-0 flex-1 pr-2">
                  <div className="truncate text-xs font-extrabold text-slate-900 uppercase">{line.product_name}</div>
                  <div className="text-[10px] text-slate-500 font-medium">₹{line.unit_price.toFixed(2)} × {line.qty}</div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQty(line.variant_id, line.qty - 1)}
                      className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-xs font-bold">{line.qty}</span>
                    <button
                      onClick={() => updateQty(line.variant_id, line.qty + 1)}
                      className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-xs font-extrabold text-slate-900 w-16 text-right">{money(line.unit_price * line.qty)}</span>
                  <button onClick={() => removeLine(line.variant_id)} className="text-slate-400 hover:text-red-600 ml-1">
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {cart.length === 0 && (
              <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center space-y-2 border border-dashed border-[#E8CCD1] rounded-2xl bg-[#FAF2F4]/40">
                <div className="h-9 w-9 rounded-xl border border-[#E8CCD1] bg-white flex items-center justify-center text-slate-500">
                  📦
                </div>
                <span className="font-bold text-slate-700 text-xs">Cart is empty — scan barcode or tap a product.</span>
              </div>
            )}
          </div>

          {/* Coupon Input */}
          <TextField
            placeholder="Coupon code (optional)"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            className="mb-3 text-xs bg-[#FAF2F4]/50 border-[#E8CCD1]"
          />

          {/* Totals Breakdown */}
          <div className="space-y-1.5 border-t border-[#F2E5E7] pt-3 text-xs font-semibold">
            <div className="flex justify-between text-slate-700 font-bold">
              <span>Subtotal</span>
              <span className="text-slate-950 font-black">₹{totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-700 font-bold">
              <span>GST Total</span>
              <span className="text-slate-950 font-black">₹{totals.tax.toFixed(2)}</span>
            </div>
          </div>

          {/* Total Amount Callout Box */}
          <div className="mt-3 mb-3 flex items-center justify-between rounded-2xl bg-[#F8EAED] border border-[#E8CCD1] px-4 py-3">
            <span className="font-black text-[#4A1821] text-sm uppercase tracking-wider">Total Amount</span>
            <span className="text-2xl font-black text-[#4A1821]">₹{totals.grandTotal.toFixed(2)}</span>
          </div>

          {/* Proceed to Payment Action Button (Vibrant Green Button) */}
          <button
            type="button"
            disabled={cart.length === 0}
            onClick={() => {
              setAmountPaid(totals.grandTotal.toFixed(2))
              setShowPayment(true)
            }}
            className="w-full rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-white font-extrabold text-sm py-3 px-4 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <span>Proceed to Payment</span>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">Ctrl+S</span>
          </button>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => setHoldNoteModal(true)}
              className="flex-1 rounded-lg border border-slate-300 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Hold Bill
            </button>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={resetSale}
              className="flex-1 rounded-lg border border-slate-300 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Camera Barcode Scanner Modal */}
      {showCameraModal && (
        <Modal title="📷 Camera Barcode Scanner" onClose={() => setShowCameraModal(false)}>
          <div className="space-y-4 text-center">
            {cameraError ? (
              <Alert tone="red">{cameraError}</Alert>
            ) : (
              <div className="relative overflow-hidden rounded-xl bg-black">
                <video ref={videoRef} className="h-64 w-full object-cover" />
                <div className="absolute inset-0 border-2 border-dashed border-indigo-400/70 pointer-events-none rounded-xl flex items-center justify-center">
                  <span className="text-white text-xs bg-black/60 px-3 py-1 rounded-full animate-pulse">Align Barcode within Frame</span>
                </div>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setShowCameraModal(false)}>
                Close Scanner
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Unmatched Barcode Modal */}
      {unmatchedBarcode && (
        <Modal title="Barcode Not Found" onClose={() => setUnmatchedBarcode(null)}>
          <div className="space-y-4">
            <Alert tone="amber">
              Item not found for scanned barcode: <strong>{unmatchedBarcode}</strong>
            </Alert>
            <p className="text-xs text-slate-600">Would you like to add a quick item or register a new product with this barcode?</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setUnmatchedBarcode(null)}>
                Cancel
              </Button>
              <Button onClick={() => {
                setQuickItemName(`Barcode Item (${unmatchedBarcode})`)
                setUnmatchedBarcode(null)
                setShowQuickSaleModal(true)
              }}>
                Add Quick Item
              </Button>
            </div>
          </div>
        </Modal>
      )}

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

      {/* Held Bills List Modal */}
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
            {error && <Alert tone="red">{error}</Alert>}
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
            {isWalkInCreditBlocked && (
              <Alert tone="red">
                ⚠️ <strong>Credit Payment Restricted:</strong> Credit payment is strictly for registered customers only. Please select or add a customer.
              </Alert>
            )}
            <TextField
              label="Amount Paid (₹)"
              type="number"
              step="0.01"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
            {!isWalkInCreditBlocked && Number(amountPaid) < totals.grandTotal && (
              <Alert tone="amber">Partial payment — remaining balance will show as PARTIAL due on the invoice.</Alert>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowPayment(false)}>
                Back
              </Button>
              <Button onClick={completeSale} disabled={submitting || isWalkInCreditBlocked}>
                {submitting ? 'Completing Sale…' : 'Complete Sale & Print'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quick Sale Modal */}
      {showQuickSaleModal && (
        <Modal title="⚡ Quick Sale (Weight / Custom Item)" onClose={() => setShowQuickSaleModal(false)} width="md">
          <form onSubmit={handleAddQuickSale} className="space-y-4 text-xs">
            <TextField
              label="Item Name / Description"
              required
              autoFocus
              value={quickItemName}
              onChange={(e) => setQuickItemName(e.target.value)}
              placeholder="e.g. Tomato, Potato, Custom Item"
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Quantity / Weight (e.g. 2 kg)"
                type="number"
                step="0.001"
                required
                value={quickQty}
                onChange={(e) => setQuickQty(e.target.value)}
                placeholder="2"
              />
              <TextField
                label="Per Unit / Kg Rate (₹)"
                type="number"
                step="0.01"
                required
                value={quickRate}
                onChange={(e) => setQuickRate(e.target.value)}
                placeholder="20"
              />
            </div>

            <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 flex justify-between items-center">
              <div>
                <span className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider block">Calculated Total Price</span>
                <span className="text-xs text-indigo-700">
                  {quickQty || 0} qty × ₹{quickRate || 0} / unit
                </span>
              </div>
              <span className="text-xl font-black text-indigo-950">
                ₹{((Number(quickQty) || 0) * (Number(quickRate) || 0)).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setShowQuickSaleModal(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Add Quick Sale to Bill
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Quick Create Customer Modal */}
      {showNewCustModal && (
        <Modal title="Create New Customer" onClose={() => setShowNewCustModal(false)} width="md">
          <form onSubmit={handleCreateCustomer} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <TextField
              label="Customer Name"
              required
              autoFocus
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              placeholder="e.g. John Doe"
            />
            <TextField
              label="Phone Number"
              required
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              placeholder="e.g. 9876543210"
            />
            <TextField
              label="Email Address (Optional)"
              type="email"
              value={newCustEmail}
              onChange={(e) => setNewCustEmail(e.target.value)}
              placeholder="e.g. john@example.com"
            />
            <Select
              label="Customer Type (Price Tier)"
              value={newCustType}
              onChange={(e) => setNewCustType(e.target.value as any)}
            >
              <option value="NORMAL">Normal Customer (Default Price)</option>
              <option value="RETAIL">Retail Customer (Standard Price)</option>
              <option value="WHOLESALE">Wholesale Customer (Bulk Price)</option>
            </Select>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setShowNewCustModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creatingCust}>
                {creatingCust ? 'Creating…' : 'Save & Select Customer'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

