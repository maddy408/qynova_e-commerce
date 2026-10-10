import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'

export interface PurchasePrintItem {
  serial: number
  item_name: string
  variant_label?: string | null
  barcode?: string | null
  sku: string
  quantity: string
  raw_quantity?: string
  unit: string
  unit_cost: string
  mrp: string
  discount_amount: string
  tax_amount: string
  gst_percent: string
  hsn_code?: string | null
  line_amount: string
}

export interface PurchasePaymentLine {
  payment_method: string
  amount: string
  reference_no?: string | null
}

export interface PurchasePrintPayment {
  id: number
  receipt_no: string
  payment_date: string
  total_amount: string
  notes?: string | null
  status: string
  reverse_reason?: string | null
  reversed_at?: string | null
  reversed_by_name?: string | null
  created_by_name?: string | null
  created_at?: string
  lines: PurchasePaymentLine[]
}

export interface PurchasePrintData {
  shop: {
    name: string
    address: string
    phone: string
    email: string
    gstin: string
  }
  purchase: {
    id: number
    purchase_no: string
    purchase_date: string
    status: string
    notes?: string | null
    created_by_name?: string | null
    created_at?: string
    supplier: {
      id: number
      name: string
      phone?: string | null
      email?: string | null
      address?: string | null
      gstin?: string | null
    }
  }
  items: PurchasePrintItem[]
  totals: {
    subtotal: string
    tax_total: string
    grand_total: string
    paid_amount: string
    balance_amount: string
  }
  payment: {
    payment_status: string
    payment_method: string
    payments: PurchasePrintPayment[]
    reversed_payments: PurchasePrintPayment[]
  }
  printed_at: string
  printed_by: string
}

export interface SinglePaymentPrintData {
  shop: {
    name: string
    address: string
    phone: string
    email: string
    gstin: string
  }
  purchase: {
    id: number
    purchase_no: string
    purchase_date: string
    status: string
    grand_total: string
    paid_amount: string
    balance_amount: string
    supplier: {
      id: number
      name: string
      phone?: string | null
      email?: string | null
      address?: string | null
      gstin?: string | null
    }
  }
  payment: {
    id: number
    receipt_no: string
    payment_date: string
    total_amount: string
    notes?: string | null
    status: string
    created_by_name?: string | null
    created_at?: string
    reverse_reason?: string | null
    reversed_at?: string | null
    reversed_by_name?: string | null
    lines: PurchasePaymentLine[]
  }
  printed_at: string
  printed_by: string
}

export interface PurchaseListItem {
  id: number
  purchase_no: string
  supplier_name: string
  purchase_date: string
  grand_total: string
  paid_amount: string
  balance_amount: string
  payment_method: string | null
  payment_status: string
  status: string
}

export interface PurchaseListPrintData {
  shop: {
    name: string
    address: string
    phone: string
    email: string
    gstin: string
  }
  scope_title?: string
  page_info?: {
    current_page: number
    total_pages: number
    page_size: number
    total_records: number
  }
  filters: {
    search?: string
    status?: string
    payment_status?: string
    from_date?: string
    to_date?: string
    supplier_name?: string
  }
  items: PurchaseListItem[]
  totals: {
    active_grand_total: string
    active_paid_amount: string
    active_balance_amount: string
    total_count: number
    active_count: number
    cancelled_count: number
  }
  printed_at: string
  printed_by: string
}

interface Props {
  data?: PurchasePrintData | null
  paymentData?: SinglePaymentPrintData | null
  listData?: PurchaseListPrintData | null
  onClose: () => void
}

function money(val: string | number | undefined | null): string {
  if (val === undefined || val === null || isNaN(Number(val))) return '0.00'
  return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr.replace(' ', 'T'))
    if (isNaN(d.getTime())) return dateStr.split(' ')[0] || dateStr
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return dateStr.split(' ')[0] || dateStr
  }
}

export function PurchasePrintModal({ data, paymentData, listData, onClose }: Props) {
  // Read hardware paper size from localStorage
  const savedPaperSize = useMemo(() => {
    try {
      const hw = localStorage.getItem('hardware_settings')
      if (hw) {
        const parsed = JSON.parse(hw)
        if (parsed.printer_paper_size === '58mm' || parsed.printer_paper_size === '80mm' || parsed.printer_paper_size === 'a4') {
          return parsed.printer_paper_size as 'a4' | '80mm' | '58mm'
        }
      }
    } catch {
      // ignore
    }
    return '80mm'
  }, [])

  // If listData is active, default format is A4 (landscape). Otherwise use savedPaperSize
  const initialFormat = listData ? 'a4' : savedPaperSize
  const [format, setFormat] = useState<'a4' | '80mm' | '58mm'>(initialFormat)
  const [isPrinting, setIsPrinting] = useState(false)

  // Shop details resolution
  const resolvedShop = useMemo(() => {
    try {
      const stored = localStorage.getItem('company_settings')
      if (stored) {
        const parsed = JSON.parse(stored)
        return {
          name: (parsed.company_name || parsed.name || '').trim(),
          address: (parsed.company_address || parsed.address || '').trim(),
          phone: (parsed.company_phone || parsed.phone || '').trim(),
          email: (parsed.company_email || parsed.email || '').trim(),
          gstin: (parsed.company_gstin || parsed.gstin || '').trim(),
        }
      }
    } catch {
      // ignore
    }
    const backendShop = data?.shop || paymentData?.shop || listData?.shop
    return {
      name: (backendShop?.name || '').trim(),
      address: (backendShop?.address || '').trim(),
      phone: (backendShop?.phone || '').trim(),
      email: (backendShop?.email || '').trim(),
      gstin: (backendShop?.gstin || '').trim(),
    }
  }, [data, paymentData, listData])

  const hasShopDetails = Boolean(
    resolvedShop.name || resolvedShop.address || resolvedShop.phone || resolvedShop.email || resolvedShop.gstin
  )

  // Manage print isolation lifecycle on document.body
  useEffect(() => {
    document.body.classList.add('purchase-print-active')
    const handleAfterPrint = () => {
      setIsPrinting(false)
    }
    window.addEventListener('afterprint', handleAfterPrint)
    return () => {
      document.body.classList.remove('purchase-print-active')
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [])

  const handlePrint = () => {
    if (isPrinting) return
    setIsPrinting(true)
    setTimeout(() => {
      window.print()
      setIsPrinting(false)
    }, 100)
  }

  // Common Shop Header Block Component
  const renderShopHeader = (isThermal = false) => {
    if (!hasShopDetails) return null
    if (isThermal) {
      return (
        <div className="text-center pb-2.5 mb-2.5 border-b border-dashed border-slate-400">
          {resolvedShop.name && (
            <div className="font-extrabold uppercase text-[13px] tracking-wide text-black leading-tight">
              {resolvedShop.name}
            </div>
          )}
          {resolvedShop.address && (
            <div className="text-[10px] text-slate-700 leading-snug mt-0.5 max-w-[95%] mx-auto">
              {resolvedShop.address}
            </div>
          )}
          <div className="flex justify-center flex-wrap gap-x-2 text-[10px] text-slate-700 mt-0.5 font-medium">
            {resolvedShop.phone && <span>Ph: {resolvedShop.phone}</span>}
            {resolvedShop.gstin && <span>GSTIN: {resolvedShop.gstin}</span>}
          </div>
        </div>
      )
    }

    return (
      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-4">
        <div>
          {resolvedShop.name && <h1 className="text-xl font-bold uppercase tracking-tight text-slate-900">{resolvedShop.name}</h1>}
          {resolvedShop.address && <p className="text-xs text-slate-600 mt-0.5 max-w-md">{resolvedShop.address}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600 mt-1">
            {resolvedShop.phone && <span><strong>Ph:</strong> {resolvedShop.phone}</span>}
            {resolvedShop.email && <span><strong>Email:</strong> {resolvedShop.email}</span>}
            {resolvedShop.gstin && <span><strong>GSTIN:</strong> {resolvedShop.gstin}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="inline-block px-3 py-1 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded">
            {listData ? (listData.scope_title || 'PURCHASES LIST REPORT') : paymentData ? 'PAYMENT RECEIPT' : 'PURCHASE BILL'}
          </div>
          {data?.purchase?.status === 'CANCELLED' && (
            <div className="text-rose-600 font-extrabold text-sm uppercase tracking-widest mt-1">
              *** CANCELLED ***
            </div>
          )}
        </div>
      </div>
    )
  }

  // ================= RENDER A4 PURCHASE BILL =================
  const renderA4PurchaseBill = (pData: PurchasePrintData) => {
    const isCancelled = pData.purchase.status === 'CANCELLED'
    return (
      <div className="purchase-print-sheet a4-portrait font-sans text-slate-900 bg-white p-8">
        {renderShopHeader(false)}

        {/* Bill Metadata & Supplier Grid */}
        <div className="grid grid-cols-2 gap-4 border border-slate-300 rounded p-3 mb-4 text-xs">
          <div>
            <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">Supplier Details:</div>
            <div className="font-bold text-slate-900 text-sm">{pData.purchase.supplier.name}</div>
            {pData.purchase.supplier.address && <div className="text-slate-600 mt-0.5">{pData.purchase.supplier.address}</div>}
            {pData.purchase.supplier.phone && <div className="text-slate-600">Ph: {pData.purchase.supplier.phone}</div>}
            {pData.purchase.supplier.gstin && <div className="text-slate-600 font-semibold">GSTIN: {pData.purchase.supplier.gstin}</div>}
          </div>
          <div className="text-right space-y-1">
            <div><span className="text-slate-500">Purchase No:</span> <strong className="font-mono text-sm text-slate-900">{pData.purchase.purchase_no}</strong></div>
            <div><span className="text-slate-500">Purchase Date:</span> <strong className="text-slate-900">{formatDate(pData.purchase.purchase_date)}</strong></div>
            <div>
              <span className="text-slate-500">Status:</span>{' '}
              <span className={`px-2 py-0.5 font-bold rounded text-[10px] ${isCancelled ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {pData.purchase.status}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Payment Status:</span>{' '}
              <span className="font-semibold text-slate-800">{pData.payment.payment_status}</span>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full border-collapse border border-slate-300 text-xs mb-4">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
              <th className="border border-slate-300 p-2 text-center w-10">No</th>
              <th className="border border-slate-300 p-2 text-left">Item Name & SKU</th>
              <th className="border border-slate-300 p-2 text-center w-16">Qty</th>
              <th className="border border-slate-300 p-2 text-right w-24">Unit Cost</th>
              <th className="border border-slate-300 p-2 text-center w-16">GST %</th>
              <th className="border border-slate-300 p-2 text-right w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            {pData.items.map((item, idx) => (
              <tr key={idx} className="border-b border-slate-200">
                <td className="border border-slate-300 p-2 text-center">{item.serial || idx + 1}</td>
                <td className="border border-slate-300 p-2">
                  <div className="font-bold text-slate-900">{item.item_name}</div>
                  <div className="text-[10px] font-mono text-slate-500">{item.sku}</div>
                </td>
                <td className="border border-slate-300 p-2 text-center font-semibold">{item.quantity} {item.unit || 'pcs'}</td>
                <td className="border border-slate-300 p-2 text-right">₹{money(item.unit_cost)}</td>
                <td className="border border-slate-300 p-2 text-center">{item.gst_percent || '0'}%</td>
                <td className="border border-slate-300 p-2 text-right font-bold">₹{money(item.line_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals & Financial Summary */}
        <div className="flex justify-end mb-4">
          <div className="w-72 border border-slate-300 rounded text-xs">
            <div className="flex justify-between p-2 border-b border-slate-200 text-slate-600">
              <span>Subtotal:</span>
              <span className="font-semibold text-slate-900">₹{money(pData.totals.subtotal)}</span>
            </div>
            <div className="flex justify-between p-2 border-b border-slate-200 text-slate-600">
              <span>Tax Total:</span>
              <span className="font-semibold text-slate-900">₹{money(pData.totals.tax_total)}</span>
            </div>
            <div className="flex justify-between p-2 border-b border-slate-300 bg-slate-50 font-bold text-slate-900 text-sm">
              <span>Grand Total:</span>
              <span>₹{money(pData.totals.grand_total)}</span>
            </div>
            <div className="flex justify-between p-2 border-b border-slate-200 text-slate-600">
              <span>Paid Amount:</span>
              <span className="font-bold text-emerald-700">₹{money(pData.totals.paid_amount)}</span>
            </div>
            <div className="flex justify-between p-2 font-bold text-slate-900">
              <span>Balance Due:</span>
              <span className={Number(pData.totals.balance_amount) > 0 ? 'text-rose-700' : 'text-slate-900'}>
                ₹{money(pData.totals.balance_amount)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Records Breakdown */}
        {pData.payment.payments.length > 0 && (
          <div className="mb-4">
            <div className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1.5">Payment History</div>
            <table className="w-full border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-50 font-semibold text-slate-700 border-b border-slate-300">
                  <th className="p-1.5 text-left border-r border-slate-300">Date</th>
                  <th className="p-1.5 text-left border-r border-slate-300">Receipt No</th>
                  <th className="p-1.5 text-left border-r border-slate-300">Method</th>
                  <th className="p-1.5 text-left border-r border-slate-300">Reference</th>
                  <th className="p-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pData.payment.payments.map((p) =>
                  p.lines.map((l, lIdx) => (
                    <tr key={`${p.id}-${lIdx}`} className="border-b border-slate-200">
                      <td className="p-1.5 border-r border-slate-200">{formatDate(p.payment_date)}</td>
                      <td className="p-1.5 border-r border-slate-200 font-mono">{p.receipt_no}</td>
                      <td className="p-1.5 border-r border-slate-200 font-semibold">{l.payment_method}</td>
                      <td className="p-1.5 border-r border-slate-200 text-slate-600">{l.reference_no || '—'}</td>
                      <td className="p-1.5 text-right font-bold">₹{money(l.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer & Signatures */}
        <div className="mt-8 pt-6 border-t border-slate-300 grid grid-cols-2 text-xs">
          <div>
            <div className="text-slate-500 text-[10px]">
              Printed: {pData.printed_at} | By: {pData.printed_by || 'Admin'}
            </div>
            {pData.purchase.notes && (
              <div className="text-slate-600 mt-1 italic">Notes: {pData.purchase.notes}</div>
            )}
          </div>
          <div className="text-right space-y-8">
            <div className="text-slate-500">For {resolvedShop.name || 'Store'}</div>
            <div className="border-t border-slate-400 inline-block pt-1 px-8 font-semibold text-slate-700">
              Authorized Signatory
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ================= RENDER THERMAL (80mm & 58mm) PURCHASE BILL =================
  const renderThermalPurchaseBill = (pData: PurchasePrintData, widthClass: string) => {
    const isCancelled = pData.purchase.status === 'CANCELLED'
    return (
      <div className={`purchase-print-sheet thermal-receipt font-mono text-black bg-white ${widthClass} mx-auto text-[11px] leading-tight p-4 shadow-sm`}>
        {renderShopHeader(true)}

        <div className="text-center font-bold uppercase text-[12px] pb-1.5 mb-2 border-b border-black">
          {isCancelled ? '*** CANCELLED PURCHASE ***' : 'PURCHASE INVOICE'}
        </div>

        {/* Meta Info */}
        <div className="space-y-1 text-[10.5px] pb-2 border-b border-dashed border-slate-400 mb-2">
          <div className="flex justify-between">
            <span className="text-slate-600">Pur No:</span>
            <span className="font-bold">{pData.purchase.purchase_no}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Date:</span>
            <span>{formatDate(pData.purchase.purchase_date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Supplier:</span>
            <span className="font-bold truncate max-w-[150px]">{pData.purchase.supplier.name}</span>
          </div>
          {pData.purchase.supplier.phone && (
            <div className="flex justify-between">
              <span className="text-slate-600">Supplier Ph:</span>
              <span>{pData.purchase.supplier.phone}</span>
            </div>
          )}
        </div>

        {/* Items List */}
        <div className="pb-2 border-b border-dashed border-slate-400 mb-2">
          <div className="flex justify-between text-[10px] font-bold uppercase text-slate-700 pb-1 border-b border-slate-300 mb-1.5">
            <span>Item &amp; Details</span>
            <span>Total</span>
          </div>
          <div className="space-y-2">
            {pData.items.map((item, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="font-bold text-[11px] leading-tight text-slate-900">{item.item_name}</div>
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span>
                    {item.quantity} {item.unit || 'pcs'} × ₹{money(item.unit_cost)}
                    {Number(item.gst_percent) > 0 ? ` (${item.gst_percent}% GST)` : ''}
                  </span>
                  <span className="font-bold text-slate-900">₹{money(item.line_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals Section */}
        <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-slate-400 mb-2">
          <div className="flex justify-between text-slate-700">
            <span>Subtotal:</span>
            <span>₹{money(pData.totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-700">
            <span>Tax Amount:</span>
            <span>₹{money(pData.totals.tax_total)}</span>
          </div>
          <div className="flex justify-between font-black text-xs pt-1.5 border-t border-black text-black">
            <span>GRAND TOTAL:</span>
            <span>₹{money(pData.totals.grand_total)}</span>
          </div>
          <div className="flex justify-between text-slate-700 pt-0.5">
            <span>Paid Amount:</span>
            <span className="font-bold text-slate-900">₹{money(pData.totals.paid_amount)}</span>
          </div>
          <div className="flex justify-between font-bold text-slate-900">
            <span>Balance Due:</span>
            <span>₹{money(pData.totals.balance_amount)}</span>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="text-[10.5px] space-y-1 pb-2 border-b border-dashed border-slate-400 mb-2">
          <div className="flex justify-between">
            <span className="text-slate-600">Payment Status:</span>
            <span className="font-bold uppercase">{pData.payment.payment_status}</span>
          </div>
          {pData.payment.payments.map((p) =>
            p.lines.map((l, lIdx) => (
              <div key={`${p.id}-${lIdx}`} className="flex justify-between text-slate-700 text-[10px]">
                <span>• {l.payment_method} {l.reference_no ? `(${l.reference_no})` : ''}</span>
                <span className="font-semibold">₹{money(l.amount)}</span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-[9.5px] text-slate-500 pt-1 space-y-1">
          <div>Printed: {pData.printed_at} | By: {pData.printed_by || 'Admin'}</div>
          <div className="font-semibold text-slate-700 pt-1 border-t border-dotted border-slate-300">
            *** Thank You for Doing Business ***
          </div>
        </div>
      </div>
    )
  }

  // ================= RENDER PAYMENT RECEIPT =================
  const renderPaymentReceipt = (recData: SinglePaymentPrintData) => {
    const supplier = recData.purchase?.supplier || (recData as any).supplier || { name: '—' }

    if (format === 'a4') {
      return (
        <div className="purchase-print-sheet a4-portrait font-sans text-slate-900 bg-white p-8">
          {renderShopHeader(false)}

          <div className="border border-slate-300 rounded p-4 mb-4 text-xs grid grid-cols-2 gap-4">
            <div>
              <div className="font-bold text-slate-500 uppercase text-[10px] mb-1">Receipt To:</div>
              <div className="font-bold text-sm text-slate-900">{supplier.name}</div>
              {supplier.phone && <div className="text-slate-600">Ph: {supplier.phone}</div>}
              {supplier.gstin && <div className="text-slate-600 font-semibold">GSTIN: {supplier.gstin}</div>}
            </div>
            <div className="text-right space-y-1">
              <div><span className="text-slate-500">Receipt No:</span> <strong className="font-mono text-sm">{recData.payment.receipt_no}</strong></div>
              <div><span className="text-slate-500">Receipt Date:</span> <strong>{formatDate(recData.payment.payment_date)}</strong></div>
              <div><span className="text-slate-500">Against Purchase:</span> <strong className="font-mono">{recData.purchase.purchase_no}</strong></div>
            </div>
          </div>

          <div className="border border-slate-300 rounded overflow-hidden mb-4 text-xs">
            <table className="w-full">
              <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700">
                <tr>
                  <th className="p-2 text-left">Payment Method</th>
                  <th className="p-2 text-left">Transaction Reference</th>
                  <th className="p-2 text-right">Amount Paid</th>
                </tr>
              </thead>
              <tbody>
                {recData.payment.lines.map((l, idx) => (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="p-2 font-bold">{l.payment_method}</td>
                    <td className="p-2 text-slate-600">{l.reference_no || '—'}</td>
                    <td className="p-2 text-right font-black">₹{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mb-6">
            <div className="w-72 border border-slate-300 rounded p-3 text-xs space-y-1.5 bg-slate-50">
              <div className="flex justify-between text-slate-600">
                <span>Total Payment:</span>
                <span className="font-bold text-emerald-800 text-sm">₹{money(recData.payment.total_amount)}</span>
              </div>
              <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                <span>Purchase Grand Total:</span>
                <span>₹{money(recData.purchase.grand_total)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Total Paid To Date:</span>
                <span className="font-semibold text-emerald-700">₹{money(recData.purchase.paid_amount)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-300">
                <span>Remaining Balance:</span>
                <span className={Number(recData.purchase.balance_amount) > 0 ? 'text-rose-700' : 'text-slate-900'}>
                  ₹{money(recData.purchase.balance_amount)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-slate-300 grid grid-cols-2 text-xs">
            <div className="text-slate-500 text-[10px]">
              Printed: {recData.printed_at} | By: {recData.printed_by || 'Admin'}
            </div>
            <div className="text-right space-y-8">
              <div className="text-slate-500">Authorized Receiver</div>
              <div className="border-t border-slate-400 inline-block pt-1 px-8 font-semibold text-slate-700">
                Signature
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Thermal Receipt (80mm / 58mm)
    const widthClass = format === '58mm' ? 'w-[48mm]' : 'w-[72mm]'
    return (
      <div className={`purchase-print-sheet thermal-receipt font-mono text-black bg-white ${widthClass} mx-auto text-[11px] leading-tight p-4 shadow-sm`}>
        {renderShopHeader(true)}
        <div className="text-center font-bold uppercase text-[12px] pb-1.5 border-b border-black mb-2">
          PAYMENT RECEIPT
        </div>

        <div className="space-y-1 text-[10.5px] pb-2 border-b border-dashed border-slate-400 mb-2">
          <div className="flex justify-between">
            <span className="text-slate-600">Receipt No:</span>
            <span className="font-bold">{recData.payment.receipt_no}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Date:</span>
            <span>{formatDate(recData.payment.payment_date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Supplier:</span>
            <span className="font-bold truncate max-w-[150px]">{supplier.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Against Pur:</span>
            <span className="font-mono">{recData.purchase.purchase_no}</span>
          </div>
        </div>

        <div className="space-y-1.5 text-[11px] pb-2 border-b border-dashed border-slate-400 mb-2">
          <div className="text-[10px] font-bold uppercase text-slate-600 pb-0.5">Payment Modes:</div>
          {recData.payment.lines.map((l, idx) => (
            <div key={idx} className="flex justify-between">
              <span>{l.payment_method} {l.reference_no ? `(${l.reference_no})` : ''}</span>
              <span className="font-bold">₹{money(l.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between font-black text-xs pt-1.5 border-t border-black text-black">
            <span>TOTAL PAID:</span>
            <span>₹{money(recData.payment.total_amount)}</span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-700">
            <span>Purchase Total:</span>
            <span>₹{money(recData.purchase.grand_total)}</span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-700">
            <span>Remaining Bal:</span>
            <span className="font-bold">₹{money(recData.purchase.balance_amount)}</span>
          </div>
        </div>

        <div className="text-center text-[9.5px] text-slate-500 pt-1 space-y-1">
          <div>Printed: {recData.printed_at} | By: {recData.printed_by || 'Admin'}</div>
          <div className="font-semibold text-slate-700 pt-1 border-t border-dotted border-slate-300">
            *** Payment Acknowledgement ***
          </div>
        </div>
      </div>
    )
  }

  // ================= RENDER PURCHASES LIST REPORT =================
  const renderPurchasesListReport = (lData: PurchaseListPrintData) => {
    const listItems = lData.items || []

    if (format === '80mm' || format === '58mm') {
      const widthClass = format === '58mm' ? 'w-[48mm]' : 'w-[72mm]'
      return (
        <div className={`purchase-print-sheet thermal-receipt font-mono text-black bg-white ${widthClass} mx-auto text-[11px] leading-tight p-4 shadow-sm`}>
          {renderShopHeader(true)}
          <div className="text-center font-bold uppercase text-[12px] pb-1 border-b border-black mb-2">
            PURCHASES LIST
          </div>
          <div className="text-[10px] text-center text-slate-600 pb-1.5 border-b border-dashed border-slate-400 mb-2">
            <div>{lData.scope_title || 'Purchases Summary'}</div>
            {lData.page_info && (
              <div className="font-semibold text-slate-800">
                Page {lData.page_info.current_page} of {lData.page_info.total_pages} ({listItems.length} records)
              </div>
            )}
          </div>

          <div className="space-y-2 pb-2 border-b border-dashed border-slate-400 mb-2">
            {listItems.map((row) => (
              <div key={row.id} className="space-y-0.5 text-[10.5px]">
                <div className="flex justify-between font-bold">
                  <span>{row.purchase_no}</span>
                  <span>₹{money(row.grand_total)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span className="truncate max-w-[130px]">{row.supplier_name}</span>
                  <span>{formatDate(row.purchase_date)}</span>
                </div>
                <div className="flex justify-between text-[9.5px] text-slate-500">
                  <span>Paid: ₹{money(row.paid_amount)} | Bal: ₹{money(row.balance_amount)}</span>
                  <span className="uppercase font-semibold">{row.status}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-slate-400 mb-2">
            <div className="flex justify-between font-bold">
              <span>ACTIVE TOTAL:</span>
              <span>₹{money(lData.totals?.active_grand_total)}</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>Active Paid:</span>
              <span>₹{money(lData.totals?.active_paid_amount)}</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>Active Balance:</span>
              <span>₹{money(lData.totals?.active_balance_amount)}</span>
            </div>
          </div>

          <div className="text-center text-[9.5px] text-slate-500 pt-1 space-y-0.5">
            <div>Printed: {lData.printed_at}</div>
            <div>*** End of Report ***</div>
          </div>
        </div>
      )
    }

    return (
      <div className="purchase-print-sheet a4-landscape font-sans text-slate-900 bg-white p-6">
        {renderShopHeader(false)}

        <div className="flex justify-between items-center text-xs text-slate-600 mb-3 bg-slate-50 p-2.5 border border-slate-200 rounded-lg">
          <div>
            <strong className="text-slate-900">Report Scope:</strong>{' '}
            <span className="font-semibold text-slate-800">
              {lData.scope_title || `Purchases List (${listItems.length} records)`}
            </span>
            {lData.page_info && (
              <span className="ml-2 font-bold text-[#804652] bg-[#FAF2F4] px-2 py-0.5 rounded border border-[#EEDDE0]">
                Page {lData.page_info.current_page} of {lData.page_info.total_pages} (Showing {listItems.length} of {lData.page_info.total_records} total)
              </span>
            )}
            {lData.filters?.supplier_name && <span className="ml-2">| Supplier: {lData.filters.supplier_name}</span>}
            {lData.filters?.status && <span className="ml-2">| Status: {lData.filters.status}</span>}
            {lData.filters?.payment_status && <span className="ml-2">| Payment: {lData.filters.payment_status}</span>}
          </div>
          <div>
            Printed: {lData.printed_at} | By: {lData.printed_by || 'Admin'}
          </div>
        </div>

        <table className="w-full border-collapse border border-slate-300 text-[11px] mb-3">
          <thead>
            <tr className="bg-slate-100 font-bold text-slate-700 border-b border-slate-300">
              <th className="border border-slate-300 p-2 text-left">Purchase No</th>
              <th className="border border-slate-300 p-2 text-left">Supplier</th>
              <th className="border border-slate-300 p-2 text-center w-24">Date</th>
              <th className="border border-slate-300 p-2 text-right w-24">Grand Total</th>
              <th className="border border-slate-300 p-2 text-right w-24">Paid Amount</th>
              <th className="border border-slate-300 p-2 text-right w-24">Balance Due</th>
              <th className="border border-slate-300 p-2 text-center w-24">Method</th>
              <th className="border border-slate-300 p-2 text-center w-24">Payment Status</th>
              <th className="border border-slate-300 p-2 text-center w-20">Status</th>
            </tr>
          </thead>
          <tbody>
            {listItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-4 text-center text-slate-500 font-semibold">
                  No purchase records found for the selected scope.
                </td>
              </tr>
            ) : (
              listItems.map((row) => {
                const isCancelled = row.status === 'CANCELLED'
                return (
                  <tr key={row.id} className={`border-b border-slate-200 ${isCancelled ? 'bg-rose-50/50 text-slate-400 line-through' : 'hover:bg-slate-50/50'}`}>
                    <td className="border border-slate-300 p-2 font-mono font-bold text-slate-900">{row.purchase_no}</td>
                    <td className="border border-slate-300 p-2 font-semibold text-slate-900">{row.supplier_name}</td>
                    <td className="border border-slate-300 p-2 text-center">{formatDate(row.purchase_date)}</td>
                    <td className="border border-slate-300 p-2 text-right font-bold text-slate-900">₹{money(row.grand_total)}</td>
                    <td className="border border-slate-300 p-2 text-right font-semibold text-emerald-800">₹{money(row.paid_amount)}</td>
                    <td className="border border-slate-300 p-2 text-right font-bold text-slate-900">₹{money(row.balance_amount)}</td>
                    <td className="border border-slate-300 p-2 text-center text-[10px] font-mono">{row.payment_method || '—'}</td>
                    <td className="border border-slate-300 p-2 text-center text-[10px] font-semibold">{row.payment_status}</td>
                    <td className="border border-slate-300 p-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isCancelled ? 'bg-rose-100 text-rose-800 no-underline' : 'bg-emerald-100 text-emerald-800'}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-400 text-xs">
              <td colSpan={3} className="border border-slate-300 p-2 text-right uppercase">
                Active Purchases Totals on Sheet:
              </td>
              <td className="border border-slate-300 p-2 text-right font-black">
                ₹{money(lData.totals?.active_grand_total)}
              </td>
              <td className="border border-slate-300 p-2 text-right font-black text-emerald-800">
                ₹{money(lData.totals?.active_paid_amount)}
              </td>
              <td className="border border-slate-300 p-2 text-right font-black text-slate-900">
                ₹{money(lData.totals?.active_balance_amount)}
              </td>
              <td colSpan={3} className="border border-slate-300 p-2 text-center text-[10px] text-slate-500 font-normal">
                ({lData.totals?.active_count || 0} Active, {lData.totals?.cancelled_count || 0} Cancelled)
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Footnote */}
        <div className="text-[10px] text-slate-500 italic mt-2">
          Note: Grand Total, Paid, and Balance sums include ACTIVE purchases only. Cancelled purchases are displayed for audit history.
        </div>
      </div>
    )
  }

  // Active printable content
  const activePrintContent = useMemo(() => {
    if (listData) {
      return renderPurchasesListReport(listData)
    }
    if (paymentData) {
      return renderPaymentReceipt(paymentData)
    }
    if (data) {
      if (format === 'a4') return renderA4PurchaseBill(data)
      return renderThermalPurchaseBill(data, format === '58mm' ? 'w-[48mm]' : 'w-[72mm]')
    }
    return null
  }, [data, paymentData, listData, format, resolvedShop])

  return (
    <>
      {/* 1. ON-SCREEN PREVIEW MODAL */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print overflow-y-auto">
        <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Missing shop info toast banner */}
          {!hasShopDetails && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 font-medium flex items-center justify-between">
              <span>ℹ️ Shop details are not set. Add them in Settings.</span>
            </div>
          )}

          {/* Modal Header & Controls */}
          <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-white border-b border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Format:</span>
              <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setFormat('a4')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    format === 'a4' ? 'bg-[#804652] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📄 {listData ? 'A4 Landscape' : 'A4 Bill'}
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('80mm')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    format === '80mm' ? 'bg-[#804652] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🧾 80mm Thermal
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('58mm')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    format === '58mm' ? 'bg-[#804652] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🧾 58mm Thermal
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                disabled={isPrinting}
                className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-[#804652] to-[#6E3642] hover:opacity-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                🖨️ Print Now
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          {/* On-Screen Preview Body */}
          <div className="flex-1 overflow-y-auto p-6 flex justify-center bg-slate-200/70">
            <div className="shadow-2xl border border-slate-300 rounded-sm bg-white overflow-hidden max-w-full">
              {activePrintContent}
            </div>
          </div>
        </div>
      </div>

      {/* 2. DEDICATED PRINT PORTAL ROOT (OUTSIDE APP LAYOUT) */}
      {createPortal(
        <div id="purchase-print-root" className={`purchase-print-root format-${format}`}>
          {/* Dynamic Scoped Print Styles */}
          <style>{`
            @media print {
              /* 1. Isolate: Hide entire regular app layout when purchase print portal is active */
              body.purchase-print-active #root {
                display: none !important;
              }
              body.purchase-print-active header,
              body.purchase-print-active nav,
              body.purchase-print-active aside,
              body.purchase-print-active footer,
              body.purchase-print-active .no-print {
                display: none !important;
              }

              /* 2. Show ONLY the dedicated purchase print root */
              body.purchase-print-active #purchase-print-root {
                display: block !important;
                visibility: visible !important;
                position: static !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                width: 100% !important;
              }

              /* 3. Real Page Sizes per format with safe printer margins */
              ${
                listData && format === 'a4'
                  ? `@page { size: A4 landscape; margin: 8mm 10mm; }`
                  : format === 'a4'
                  ? `@page { size: A4 portrait; margin: 10mm 12mm; }`
                  : format === '58mm'
                  ? `@page { size: 58mm auto; margin: 2mm 1mm; }`
                  : `@page { size: 80mm auto; margin: 3mm 2mm; }`
              }

              html, body {
                background: #ffffff !important;
                margin: 0 !important;
                padding: 0 !important;
                color: #000000 !important;
              }

              .purchase-print-sheet {
                box-shadow: none !important;
                border: none !important;
                background: #ffffff !important;
                page-break-after: auto;
              }

              .a4-portrait {
                width: 100% !important;
                max-width: 100% !important;
                padding: 0 !important;
              }

              .a4-landscape {
                width: 100% !important;
                max-width: 100% !important;
                padding: 0 !important;
              }

              .thermal-receipt {
                margin: 0 auto !important;
                padding: ${format === '58mm' ? '3mm 2mm' : '4mm 3mm'} !important;
                width: ${format === '58mm' ? '50mm' : '74mm'} !important;
                max-width: ${format === '58mm' ? '50mm' : '74mm'} !important;
                overflow: hidden !important;
                color: #000000 !important;
              }

              table {
                page-break-inside: auto;
              }

              tr {
                page-break-inside: avoid;
                page-break-after: auto;
              }

              thead {
                display: table-header-group;
              }

              tfoot {
                display: table-footer-group;
              }
            }
          `}</style>

          {activePrintContent}
        </div>,
        document.body
      )}
    </>
  )
}
