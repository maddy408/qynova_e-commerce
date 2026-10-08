import { useState, useMemo } from 'react'
import { Badge, Button } from './ui'

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
  }
  supplier: {
    id: number
    name: string
    phone?: string | null
    email?: string | null
    address?: string | null
    gstin?: string | null
  }
  payment: PurchasePrintPayment
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
  printed_at: string
  printed_by: string
  purchases: PurchaseListItem[]
  totals: {
    grand_total: string
    paid_amount: string
    balance_amount: string
    active_count: number
    cancelled_count: number
    total_count: number
  }
  footnote: string
}

interface PurchasePrintModalProps {
  data?: PurchasePrintData | null
  paymentData?: SinglePaymentPrintData | null
  listData?: PurchaseListPrintData | null
  onClose: () => void
}

function formatMoneyDisplay(val: string | number): string {
  const num = Number(val || 0)
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function PurchasePrintModal({ data, paymentData, listData, onClose }: PurchasePrintModalProps) {
  // Read initial paper size from hardware setting if stored
  const initialFormat = useMemo<'a4' | '80mm' | '58mm'>(() => {
    if (listData) return 'a4' // List reports always default to A4
    try {
      const savedPaper = localStorage.getItem('printer_paper_size')
      if (savedPaper === '58mm') return '58mm'
      if (savedPaper === '80mm') return '80mm'
      if (savedPaper === 'a4' || savedPaper === 'A4') return 'a4'
    } catch {
      // Fallback
    }
    return '80mm'
  }, [listData])

  const [format, setFormat] = useState<'a4' | '80mm' | '58mm'>(initialFormat)

  // Local storage company details override if updated on client, otherwise backend data (empty if not set)
  const companyDetails = useMemo(() => {
    let name = ''
    let address = ''
    let phone = ''
    let email = ''
    let gstin = ''

    try {
      const s = localStorage.getItem('company_settings')
      if (s) {
        const parsed = JSON.parse(s)
        name = (parsed.name || '').trim()
        address = (parsed.address || '').trim()
        phone = (parsed.phone || '').trim()
        email = (parsed.email || '').trim()
        gstin = (parsed.gstin || '').trim()
      }
    } catch {
      // Ignore
    }

    const backendShop = data?.shop || paymentData?.shop || listData?.shop
    if (backendShop) {
      if (!name && backendShop.name) name = backendShop.name.trim()
      if (!address && backendShop.address) address = backendShop.address.trim()
      if (!phone && backendShop.phone) phone = backendShop.phone.trim()
      if (!email && backendShop.email) email = backendShop.email.trim()
      if (!gstin && backendShop.gstin) gstin = backendShop.gstin.trim()
    }

    return { name, address, phone, email, gstin }
  }, [data, paymentData, listData])

  const hasShopDetails = Boolean(
    companyDetails.name ||
    companyDetails.address ||
    companyDetails.phone ||
    companyDetails.email ||
    companyDetails.gstin
  )

  const [toastDismissed, setToastDismissed] = useState(false)

  if (!data && !paymentData) return null

  const isSinglePayment = !!paymentData && !data
  const isCancelled = isSinglePayment
    ? paymentData.purchase.status === 'CANCELLED' || paymentData.payment.status === 'REVERSED'
    : data?.purchase.status === 'CANCELLED'

  function handlePrint() {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white print:static">
      {/* Strict Print CSS Override for Purchases */}
      <style>{`
        @media print {
          @page {
            size: ${format === 'a4' ? 'A4 portrait' : format === '58mm' ? '58mm auto' : '80mm auto'};
            margin: ${format === 'a4' ? '8mm' : '2mm'};
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          header, nav, aside, footer, main > div:not(.print-modal-container), .no-print, .no-print * {
            display: none !important;
          }
          .print-modal-container {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
          }
          .print-area {
            position: static !important;
            width: 100% !important;
            max-width: ${format === 'a4' ? '100%' : format === '58mm' ? '220px' : '300px'} !important;
            margin: 0 auto !important;
            padding: ${format === 'a4' ? '4mm' : '1mm'} !important;
            box-shadow: none !important;
            border: ${format === 'a4' ? '1px solid #94a3b8' : 'none'} !important;
            background: #ffffff !important;
            page-break-after: avoid;
            page-break-inside: avoid;
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

      {/* Modal Wrapper */}
      <div className="print-modal-container relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden print:border-none print:shadow-none print:bg-white print:max-h-none print:rounded-none">
        {/* Missing shop info toast banner */}
        {!hasShopDetails && !toastDismissed && (
          <div className="no-print bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900 font-medium">
            <div className="flex items-center gap-2">
              <span>ℹ️</span>
              <span>Shop details are not set. Add them in Settings.</span>
            </div>
            <button
              type="button"
              onClick={() => setToastDismissed(true)}
              className="text-amber-700 hover:text-amber-950 font-bold ml-4 cursor-pointer text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Controls Toolbar Header */}
        <div className="no-print sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-white border-b border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Print Format:</span>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setFormat('a4')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  format === 'a4'
                    ? 'bg-[#7B3F4A] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-[#7B3F4A]'
                }`}
              >
                📄 A4 Bill
              </button>
              <button
                type="button"
                onClick={() => setFormat('80mm')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  format === '80mm'
                    ? 'bg-[#7B3F4A] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-[#7B3F4A]'
                }`}
              >
                🖨️ Thermal 80mm
              </button>
              <button
                type="button"
                onClick={() => setFormat('58mm')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  format === '58mm'
                    ? 'bg-[#7B3F4A] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-[#7B3F4A]'
                }`}
              >
                🖨️ Thermal 58mm
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isCancelled && <Badge tone="red">{isSinglePayment && paymentData?.payment.status === 'REVERSED' ? 'PAYMENT REVERSED' : 'CANCELLED'}</Badge>}
            <Button size="sm" onClick={handlePrint} className="bg-[#7B3F4A] hover:bg-[#68343E] text-white font-bold text-xs gap-1.5 shadow-2xs">
              🖨️ Print
            </Button>
            <Button size="sm" variant="secondary" onClick={onClose} className="font-semibold text-xs">
              Close
            </Button>
          </div>
        </div>

        {/* Printable Document Scroll Body */}
        <div className="overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-100/60 print:p-0 print:bg-white">
          <div
            className={`print-area w-full bg-white text-slate-900 shadow-md transition-all ${
              format === 'a4'
                ? 'max-w-[850px] p-6 sm:p-8 border border-slate-300 rounded-sm'
                : format === '58mm'
                ? 'max-w-[280px] p-3 border border-slate-200 font-mono text-[11px]'
                : 'max-w-[360px] p-4 border border-slate-200 font-mono text-xs'
            }`}
          >
            {/* ======================= CASE 1: FULL PURCHASE DOCUMENT ======================= */}
            {data && (
              <>
                {format === 'a4' ? (
                  /* ----------------- A4 PURCHASE BILL LAYOUT ----------------- */
                  <div className="space-y-4 text-xs text-slate-900 leading-tight">
                    {/* Header: Shop & Document Meta */}
                    <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                      {hasShopDetails ? (
                        <div>
                          {companyDetails.name && <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">{companyDetails.name}</h1>}
                          {companyDetails.address && <p className="mt-1 text-[11px] text-slate-600">{companyDetails.address}</p>}
                          {(companyDetails.phone || companyDetails.email) && (
                            <p className="text-[11px] text-slate-600">
                              {[
                                companyDetails.phone ? `Phone: ${companyDetails.phone}` : null,
                                companyDetails.email ? companyDetails.email : null,
                              ].filter(Boolean).join(' | ')}
                            </p>
                          )}
                          {companyDetails.gstin && <p className="text-[11px] font-bold text-slate-800">GSTIN: {companyDetails.gstin}</p>}
                        </div>
                      ) : (
                        <div />
                      )}
                      <div className="text-right">
                        <h2 className="text-lg font-black tracking-widest text-[#7B3F4A] uppercase">PURCHASE BILL</h2>
                        <p className="mt-1 text-xs font-bold text-slate-900">
                          PURCHASE NO: <span className="text-[#7B3F4A] font-mono">{data.purchase.purchase_no}</span>
                        </p>
                        <p className="text-xs text-slate-600">DATE: {data.purchase.purchase_date}</p>
                        {data.purchase.status === 'CANCELLED' && (
                          <div className="mt-1.5 inline-block border-2 border-red-600 px-2 py-0.5 text-xs font-black uppercase text-red-600 rounded">
                            *** CANCELLED ***
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Supplier Details Box */}
                    <div className="border border-slate-300 p-3 rounded-xs flex justify-between items-start bg-slate-50/50">
                      <div>
                        <p className="font-extrabold uppercase text-[10px] tracking-wider text-slate-500">SUPPLIER (VENDOR DETAILS):</p>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">{data.purchase.supplier.name}</p>
                        {data.purchase.supplier.address && <p className="text-[11px] text-slate-600 mt-0.5">{data.purchase.supplier.address}</p>}
                      </div>
                      <div className="text-right font-medium space-y-0.5">
                        <p className="text-xs text-slate-700">
                          Phone: <span className="font-bold text-slate-900">{data.purchase.supplier.phone || 'N/A'}</span>
                        </p>
                        {data.purchase.supplier.gstin && (
                          <p className="text-xs text-slate-700">
                            GSTIN: <span className="font-bold text-slate-900 font-mono">{data.purchase.supplier.gstin}</span>
                          </p>
                        )}
                        <p className="text-xs text-slate-700">
                          Payment: <span className="font-bold uppercase text-[#7B3F4A]">{data.payment.payment_status.replace('_', ' ')}</span>
                        </p>
                      </div>
                    </div>

                    {/* Line Items Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-slate-300 text-[11px]">
                        <thead className="bg-slate-100 uppercase font-black text-slate-800 border-b border-slate-300">
                          <tr>
                            <th className="border border-slate-300 px-2 py-1.5 text-center w-8">#</th>
                            <th className="border border-slate-300 px-2 py-1.5 text-left">Item Description</th>
                            <th className="border border-slate-300 px-2 py-1.5 text-left">SKU</th>
                            <th className="border border-slate-300 px-2 py-1.5 text-center">Qty</th>
                            <th className="border border-slate-300 px-2 py-1.5 text-center">Unit</th>
                            <th className="border border-slate-300 px-2 py-1.5 text-right">Unit Cost (₹)</th>
                            <th className="border border-slate-300 px-2 py-1.5 text-right">GST %</th>
                            <th className="border border-slate-300 px-2 py-1.5 text-right font-black">Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {data.items.map((item) => (
                            <tr key={item.serial} className="hover:bg-slate-50/50">
                              <td className="border border-slate-300 px-2 py-1 text-center font-mono text-slate-600">{item.serial}</td>
                              <td className="border border-slate-300 px-2 py-1 font-bold text-slate-900">
                                {item.item_name}
                                {item.variant_label && <span className="block text-[10px] text-slate-500 font-normal">{item.variant_label}</span>}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 font-mono text-slate-700">{item.sku}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center font-bold text-slate-900">{item.quantity}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center uppercase text-slate-600">{item.unit}</td>
                              <td className="border border-slate-300 px-2 py-1 text-right font-semibold text-slate-900">{formatMoneyDisplay(item.unit_cost)}</td>
                              <td className="border border-slate-300 px-2 py-1 text-right text-slate-700">{item.gst_percent}%</td>
                              <td className="border border-slate-300 px-2 py-1 text-right font-black text-slate-900">{formatMoneyDisplay(item.line_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals & Notes Section */}
                    <div className="flex justify-between items-start pt-2 gap-4">
                      <div className="space-y-2 flex-1 max-w-md">
                        {data.purchase.notes && (
                          <div className="p-2 border border-slate-200 rounded-xs bg-slate-50 text-[11px]">
                            <span className="font-bold text-slate-700">Notes: </span>
                            <span className="text-slate-600">{data.purchase.notes}</span>
                          </div>
                        )}
                        <p className="text-[11px] text-slate-500">
                          Method: <span className="font-bold text-slate-800">{data.payment.payment_method || 'N/A'}</span> | Status:{' '}
                          <span className="font-bold text-slate-800">{data.payment.payment_status.replace('_', ' ')}</span>
                        </p>
                      </div>

                      <div className="w-64 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-700">
                          <span className="uppercase font-semibold">Subtotal</span>
                          <span className="font-mono">₹{formatMoneyDisplay(data.totals.subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-slate-700">
                          <span className="uppercase font-semibold">GST Tax</span>
                          <span className="font-mono">₹{formatMoneyDisplay(data.totals.tax_total)}</span>
                        </div>
                        <div className="border-b border-slate-300 pb-1 flex justify-between text-sm font-black text-slate-900">
                          <span className="uppercase">Grand Total</span>
                          <span className="font-mono">₹{formatMoneyDisplay(data.totals.grand_total)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-800 font-bold">
                          <span className="uppercase">Paid Amount</span>
                          <span className="font-mono">₹{formatMoneyDisplay(data.totals.paid_amount)}</span>
                        </div>
                        <div className="flex justify-between text-[#7B3F4A] font-black text-sm pt-0.5">
                          <span className="uppercase">Balance Payable</span>
                          <span className="font-mono">₹{formatMoneyDisplay(data.totals.balance_amount)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Payments Breakdown Table (when active payments exist) */}
                    {data.payment.payments.length > 0 && (
                      <div className="pt-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">Active Payment Breakdown:</p>
                        <table className="w-full border-collapse border border-slate-300 text-[10px]">
                          <thead className="bg-slate-100 uppercase font-bold text-slate-700 border-b border-slate-300">
                            <tr>
                              <th className="border border-slate-300 px-2 py-1 text-left">Date</th>
                              <th className="border border-slate-300 px-2 py-1 text-left">Receipt No</th>
                              <th className="border border-slate-300 px-2 py-1 text-left">Method</th>
                              <th className="border border-slate-300 px-2 py-1 text-left">Reference</th>
                              <th className="border border-slate-300 px-2 py-1 text-right">Amount (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {data.payment.payments.flatMap((p) =>
                              p.lines.map((l, lIdx) => (
                                <tr key={`${p.id}-${lIdx}`}>
                                  <td className="border border-slate-300 px-2 py-1 text-slate-700 font-mono">{p.payment_date}</td>
                                  <td className="border border-slate-300 px-2 py-1 font-mono text-slate-800">{p.receipt_no}</td>
                                  <td className="border border-slate-300 px-2 py-1 font-bold text-slate-900">{l.payment_method}</td>
                                  <td className="border border-slate-300 px-2 py-1 text-slate-600 font-mono">{l.reference_no || '—'}</td>
                                  <td className="border border-slate-300 px-2 py-1 text-right font-bold text-slate-900">{formatMoneyDisplay(l.amount)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Reversed Payments (if any) */}
                    {data.payment.reversed_payments.length > 0 && (
                      <div className="pt-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-red-700 mb-1">Reversed Payments (Excluded from paid):</p>
                        <div className="space-y-1">
                          {data.payment.reversed_payments.map((rp) => (
                            <div key={rp.id} className="p-1.5 bg-red-50 border border-red-200 rounded text-[10px] text-red-900 flex justify-between items-center">
                              <div>
                                <span className="font-mono font-bold">{rp.receipt_no}</span> ({rp.payment_date}) — Reason: {rp.reverse_reason || 'N/A'}
                              </div>
                              <div className="font-mono font-bold">₹{formatMoneyDisplay(rp.total_amount)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Signatures & Print Footer */}
                    <div className="pt-8 flex justify-between items-end border-t border-slate-300">
                      <div className="text-center">
                        <div className="w-44 border-b border-slate-400 mb-1" />
                        <p className="text-[10px] font-bold uppercase text-slate-600">Supplier / Receiver Signature</p>
                      </div>
                      <div className="text-center">
                        <div className="w-44 border-b border-slate-400 mb-1" />
                        <p className="text-[10px] font-bold uppercase text-slate-600">Prepared By: {data.printed_by}</p>
                      </div>
                    </div>

                    <div className="pt-2 text-center text-[9px] text-slate-400 font-mono">
                      Printed At: {data.printed_at} | Unified POS Software
                    </div>
                  </div>
                ) : (
                  /* ----------------- THERMAL (80mm & 58mm) LAYOUT ----------------- */
                  <div className="space-y-2 leading-tight">
                    {/* Header */}
                    {hasShopDetails ? (
                      <div className="text-center space-y-0.5">
                        {companyDetails.name && <h1 className="text-sm font-black uppercase tracking-tight">{companyDetails.name}</h1>}
                        {companyDetails.address && <p className="text-[10px] text-slate-700">{companyDetails.address}</p>}
                        {(companyDetails.phone || companyDetails.gstin) && (
                          <p className="text-[10px] text-slate-700">
                            {[
                              companyDetails.phone ? `Ph: ${companyDetails.phone}` : null,
                              companyDetails.gstin ? `GST: ${companyDetails.gstin}` : null,
                            ].filter(Boolean).join(' | ')}
                          </p>
                        )}
                        <p className="text-xs font-black uppercase tracking-widest pt-1">*** PURCHASE BILL ***</p>
                        {data.purchase.status === 'CANCELLED' && (
                          <p className="text-xs font-black text-red-600 uppercase">*** CANCELLED ***</p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center space-y-0.5">
                        <p className="text-xs font-black uppercase tracking-widest pt-1">*** PURCHASE BILL ***</p>
                        {data.purchase.status === 'CANCELLED' && (
                          <p className="text-xs font-black text-red-600 uppercase">*** CANCELLED ***</p>
                        )}
                      </div>
                    )}

                    <div className="border-b border-dashed border-slate-800" />

                    {/* Bill Meta */}
                    <div className="space-y-0.5 text-[11px]">
                      <div className="flex justify-between">
                        <span>PUR NO:</span>
                        <span className="font-bold">{data.purchase.purchase_no}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>DATE:</span>
                        <span>{data.purchase.purchase_date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>SUPPLIER:</span>
                        <span className="font-bold truncate max-w-[180px]">{data.purchase.supplier.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>STATUS:</span>
                        <span className="font-bold">{data.payment.payment_status.replace('_', ' ')}</span>
                      </div>
                    </div>

                    <div className="border-b border-dashed border-slate-800" />

                    {/* Items List */}
                    <div className="space-y-1 text-[11px]">
                      {data.items.map((item) => (
                        <div key={item.serial} className="space-y-0.5">
                          <div className="font-bold truncate">{item.item_name}</div>
                          <div className="flex justify-between text-[10px] text-slate-700">
                            <span>
                              {item.quantity} {item.unit} x Rs. {formatMoneyDisplay(item.unit_cost)}
                            </span>
                            <span className="font-bold text-slate-900">Rs. {formatMoneyDisplay(item.line_amount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-b border-dashed border-slate-800" />

                    {/* Totals */}
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>Rs. {formatMoneyDisplay(data.totals.subtotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GST Tax:</span>
                        <span>Rs. {formatMoneyDisplay(data.totals.tax_total)}</span>
                      </div>
                      <div className="flex justify-between font-black text-xs pt-0.5 border-t border-slate-800">
                        <span>GRAND TOTAL:</span>
                        <span>Rs. {formatMoneyDisplay(data.totals.grand_total)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>PAID AMOUNT:</span>
                        <span>Rs. {formatMoneyDisplay(data.totals.paid_amount)}</span>
                      </div>
                      <div className="flex justify-between font-black">
                        <span>BALANCE DUE:</span>
                        <span>Rs. {formatMoneyDisplay(data.totals.balance_amount)}</span>
                      </div>
                    </div>

                    {/* Payments */}
                    {data.payment.payments.length > 0 && (
                      <>
                        <div className="border-b border-dashed border-slate-800" />
                        <div className="text-[10px] space-y-0.5">
                          <p className="font-bold">PAYMENTS:</p>
                          {data.payment.payments.flatMap((p) =>
                            p.lines.map((l, lIdx) => (
                              <div key={`${p.id}-${lIdx}`} className="flex justify-between">
                                <span>{l.payment_method}{l.reference_no ? ` (${l.reference_no})` : ''}:</span>
                                <span>Rs. {formatMoneyDisplay(l.amount)}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}

                    <div className="border-b border-dashed border-slate-800" />

                    {/* Barcode / Footer */}
                    <div className="text-center pt-1 space-y-1">
                      <div className="inline-block bg-slate-900 text-white font-mono px-4 py-1 text-[10px] tracking-widest uppercase">
                        |||||| | |||| ||| |||||||
                      </div>
                      <p className="text-[9px] font-mono">*{data.purchase.purchase_no}*</p>
                      <p className="text-[9px] font-bold pt-1 uppercase">*** GOODS RECEIVED &amp; VERIFIED ***</p>
                      <p className="text-[8px] text-slate-500">Printed: {data.printed_at} by {data.printed_by}</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ======================= CASE 2: SINGLE PAYMENT RECEIPT ======================= */}
            {paymentData && (
              <>
                {format === 'a4' ? (
                  /* A4 Single Payment Receipt */
                  <div className="space-y-4 text-xs text-slate-900 leading-tight">
                    <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                      {hasShopDetails ? (
                        <div>
                          {companyDetails.name && <h1 className="text-xl font-black uppercase tracking-tight">{companyDetails.name}</h1>}
                          {companyDetails.address && <p className="mt-1 text-[11px] text-slate-600">{companyDetails.address}</p>}
                          {(companyDetails.phone || companyDetails.email) && (
                            <p className="text-[11px] text-slate-600">
                              {[
                                companyDetails.phone ? `Ph: ${companyDetails.phone}` : null,
                                companyDetails.email ? companyDetails.email : null,
                              ].filter(Boolean).join(' | ')}
                            </p>
                          )}
                          {companyDetails.gstin && <p className="text-[11px] font-bold">GSTIN: {companyDetails.gstin}</p>}
                        </div>
                      ) : (
                        <div />
                      )}
                      <div className="text-right">
                        <h2 className="text-lg font-black tracking-widest text-[#7B3F4A] uppercase">PAYMENT RECEIPT</h2>
                        <p className="mt-1 text-xs font-bold text-slate-900">
                          RECEIPT NO: <span className="text-[#7B3F4A] font-mono">{paymentData.payment.receipt_no}</span>
                        </p>
                        <p className="text-xs text-slate-600">DATE: {paymentData.payment.payment_date}</p>
                        {paymentData.payment.status === 'REVERSED' && (
                          <div className="mt-1.5 inline-block border-2 border-red-600 px-2 py-0.5 text-xs font-black uppercase text-red-600 rounded">
                            *** PAYMENT REVERSED ***
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border border-slate-300 p-3 rounded-xs bg-slate-50/50">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-500">SUPPLIER:</p>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">{paymentData.supplier.name}</p>
                        {paymentData.supplier.phone && <p className="text-[11px] text-slate-600">Ph: {paymentData.supplier.phone}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-slate-500">AGAINST PURCHASE:</p>
                        <p className="text-sm font-bold text-[#7B3F4A] font-mono mt-0.5">{paymentData.purchase.purchase_no}</p>
                        <p className="text-[11px] text-slate-600">Purchase Date: {paymentData.purchase.purchase_date}</p>
                      </div>
                    </div>

                    {/* Payment breakdown lines */}
                    <div className="overflow-x-auto pt-2">
                      <table className="w-full border-collapse border border-slate-300 text-[11px]">
                        <thead className="bg-slate-100 uppercase font-bold text-slate-800 border-b border-slate-300">
                          <tr>
                            <th className="border border-slate-300 px-3 py-1.5 text-left">#</th>
                            <th className="border border-slate-300 px-3 py-1.5 text-left">Payment Mode</th>
                            <th className="border border-slate-300 px-3 py-1.5 text-left">Transaction / Reference No</th>
                            <th className="border border-slate-300 px-3 py-1.5 text-right font-black">Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {paymentData.payment.lines.map((line, idx) => (
                            <tr key={idx}>
                              <td className="border border-slate-300 px-3 py-1.5 font-mono text-center w-10">{idx + 1}</td>
                              <td className="border border-slate-300 px-3 py-1.5 font-bold text-slate-900">{line.payment_method}</td>
                              <td className="border border-slate-300 px-3 py-1.5 font-mono text-slate-700">{line.reference_no || '—'}</td>
                              <td className="border border-slate-300 px-3 py-1.5 text-right font-black text-slate-900">{formatMoneyDisplay(line.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals Summary */}
                    <div className="flex justify-between items-start pt-2">
                      <div className="max-w-md text-[11px] text-slate-600">
                        {paymentData.payment.notes && <p className="mb-1"><strong>Notes:</strong> {paymentData.payment.notes}</p>}
                        {paymentData.payment.status === 'REVERSED' && (
                          <div className="p-2 bg-red-100 text-red-900 rounded font-semibold text-[11px]">
                            Reversed: {paymentData.payment.reverse_reason || 'N/A'} (on {paymentData.payment.reversed_at} by {paymentData.payment.reversed_by_name || 'Admin'})
                          </div>
                        )}
                      </div>

                      <div className="w-64 space-y-1 text-xs">
                        <div className="flex justify-between font-black text-sm border-b border-slate-300 pb-1">
                          <span className="uppercase text-emerald-800">Total Paid in Receipt</span>
                          <span className="font-mono text-emerald-800">₹{formatMoneyDisplay(paymentData.payment.total_amount)}</span>
                        </div>
                        <div className="flex justify-between text-slate-700 text-[11px] pt-1">
                          <span>Purchase Total:</span>
                          <span className="font-mono">₹{formatMoneyDisplay(paymentData.purchase.grand_total)}</span>
                        </div>
                        <div className="flex justify-between text-[#7B3F4A] font-bold text-xs">
                          <span>Remaining Balance:</span>
                          <span className="font-mono">₹{formatMoneyDisplay(paymentData.purchase.balance_amount)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Signatures */}
                    <div className="pt-8 flex justify-between items-end border-t border-slate-300">
                      <div className="text-center">
                        <div className="w-40 border-b border-slate-400 mb-1" />
                        <p className="text-[10px] font-bold uppercase text-slate-600">Authorized Signature</p>
                      </div>
                      <div className="text-center">
                        <div className="w-40 border-b border-slate-400 mb-1" />
                        <p className="text-[10px] font-bold uppercase text-slate-600">Receiver / Cashier: {paymentData.printed_by}</p>
                      </div>
                    </div>

                    <div className="pt-2 text-center text-[9px] text-slate-400 font-mono">
                      Printed At: {paymentData.printed_at} | Unified POS Software
                    </div>
                  </div>
                ) : (
                  /* Thermal Single Payment Receipt */
                  <div className="space-y-2 leading-tight">
                    {hasShopDetails ? (
                      <div className="text-center space-y-0.5">
                        {companyDetails.name && <h1 className="text-sm font-black uppercase tracking-tight">{companyDetails.name}</h1>}
                        {companyDetails.address && <p className="text-[10px] text-slate-700">{companyDetails.address}</p>}
                        {(companyDetails.phone || companyDetails.gstin) && (
                          <p className="text-[10px] text-slate-700">
                            {[
                              companyDetails.phone ? `Ph: ${companyDetails.phone}` : null,
                              companyDetails.gstin ? `GST: ${companyDetails.gstin}` : null,
                            ].filter(Boolean).join(' | ')}
                          </p>
                        )}
                        <p className="text-xs font-black uppercase tracking-widest pt-1">*** PAYMENT RECEIPT ***</p>
                        {paymentData.payment.status === 'REVERSED' && (
                          <p className="text-xs font-black text-red-600 uppercase">*** REVERSED ***</p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center space-y-0.5">
                        <p className="text-xs font-black uppercase tracking-widest pt-1">*** PAYMENT RECEIPT ***</p>
                        {paymentData.payment.status === 'REVERSED' && (
                          <p className="text-xs font-black text-red-600 uppercase">*** REVERSED ***</p>
                        )}
                      </div>
                    )}

                    <div className="border-b border-dashed border-slate-800" />

                    <div className="space-y-0.5 text-[11px]">
                      <div className="flex justify-between">
                        <span>RECEIPT NO:</span>
                        <span className="font-bold">{paymentData.payment.receipt_no}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>DATE:</span>
                        <span>{paymentData.payment.payment_date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>PURCHASE NO:</span>
                        <span className="font-bold">{paymentData.purchase.purchase_no}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>SUPPLIER:</span>
                        <span className="font-bold truncate max-w-[180px]">{paymentData.supplier.name}</span>
                      </div>
                    </div>

                    <div className="border-b border-dashed border-slate-800" />

                    <div className="space-y-1 text-[11px]">
                      <p className="font-bold text-[10px]">PAYMENT LINES:</p>
                      {paymentData.payment.lines.map((line, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{line.payment_method}{line.reference_no ? ` (${line.reference_no})` : ''}:</span>
                          <span className="font-bold">Rs. {formatMoneyDisplay(line.amount)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-b border-dashed border-slate-800" />

                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between font-black text-xs">
                        <span>AMOUNT PAID:</span>
                        <span>Rs. {formatMoneyDisplay(paymentData.payment.total_amount)}</span>
                      </div>
                      <div className="flex justify-between text-slate-700 text-[10px]">
                        <span>Remaining Balance:</span>
                        <span>Rs. {formatMoneyDisplay(paymentData.purchase.balance_amount)}</span>
                      </div>
                    </div>

                    <div className="border-b border-dashed border-slate-800" />

                    <div className="text-center pt-1 space-y-0.5">
                      <p className="text-[9px] font-mono">*{paymentData.payment.receipt_no}*</p>
                      <p className="text-[9px] font-bold uppercase">*** PAYMENT CONFIRMATION ***</p>
                      <p className="text-[8px] text-slate-500">Printed: {paymentData.printed_at} by {paymentData.printed_by}</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ======================= CASE 3: FULL PURCHASES LIST REPORT ======================= */}
            {listData && (
              <div className="space-y-4 text-xs text-slate-900 leading-tight">
                {/* Header: Shop & Document Meta */}
                <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                  {hasShopDetails ? (
                    <div>
                      {companyDetails.name && <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">{companyDetails.name}</h1>}
                      {companyDetails.address && <p className="mt-1 text-[11px] text-slate-600">{companyDetails.address}</p>}
                      {(companyDetails.phone || companyDetails.email) && (
                        <p className="text-[11px] text-slate-600">
                          {[
                            companyDetails.phone ? `Phone: ${companyDetails.phone}` : null,
                            companyDetails.email ? companyDetails.email : null,
                          ].filter(Boolean).join(' | ')}
                        </p>
                      )}
                      {companyDetails.gstin && <p className="text-[11px] font-bold text-slate-800">GSTIN: {companyDetails.gstin}</p>}
                    </div>
                  ) : (
                    <div />
                  )}
                  <div className="text-right">
                    <h2 className="text-lg font-black tracking-widest text-[#7B3F4A] uppercase">PURCHASES LIST REPORT</h2>
                    <p className="mt-1 text-xs text-slate-600">DATE: {listData.printed_at}</p>
                    <p className="text-xs text-slate-600">
                      TOTAL RECORDS: <span className="font-bold text-slate-900">{listData.totals.total_count}</span> ({listData.totals.active_count} Active, {listData.totals.cancelled_count} Cancelled)
                    </p>
                  </div>
                </div>

                {/* Table of All Purchases */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-300 text-[10px]">
                    <thead className="bg-slate-100 uppercase font-black text-slate-800 border-b border-slate-300">
                      <tr>
                        <th className="border border-slate-300 px-2 py-1.5 text-center w-8">#</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-left">Purchase No</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-left">Supplier</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center">Date</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-right">Grand Total (₹)</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-right">Paid (₹)</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-right">Balance (₹)</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center">Method</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center">Payment Status</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {listData.purchases.map((p, idx) => {
                        const isCancelled = p.status === 'CANCELLED'
                        return (
                          <tr key={p.id} className={isCancelled ? 'bg-rose-50/40 text-slate-500' : 'hover:bg-slate-50/50'}>
                            <td className="border border-slate-300 px-2 py-1 text-center font-mono">{idx + 1}</td>
                            <td className="border border-slate-300 px-2 py-1 font-mono font-bold text-slate-900">{p.purchase_no}</td>
                            <td className="border border-slate-300 px-2 py-1 font-semibold text-slate-900">{p.supplier_name}</td>
                            <td className="border border-slate-300 px-2 py-1 text-center font-mono">{p.purchase_date}</td>
                            <td className={`border border-slate-300 px-2 py-1 text-right font-black ${isCancelled ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              {formatMoneyDisplay(p.grand_total)}
                            </td>
                            <td className={`border border-slate-300 px-2 py-1 text-right font-bold ${isCancelled ? 'line-through text-slate-400' : 'text-emerald-800'}`}>
                              {formatMoneyDisplay(p.paid_amount)}
                            </td>
                            <td className={`border border-slate-300 px-2 py-1 text-right font-black ${isCancelled ? 'line-through text-slate-400' : 'text-[#7B3F4A]'}`}>
                              {formatMoneyDisplay(p.balance_amount)}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-700">{p.payment_method || '—'}</td>
                            <td className="border border-slate-300 px-2 py-1 text-center font-bold text-[9px] uppercase">{p.payment_status.replace('_', ' ')}</td>
                            <td className="border border-slate-300 px-2 py-1 text-center font-black text-[9px] uppercase">
                              <span className={isCancelled ? 'text-red-700 font-black' : 'text-emerald-800'}>
                                {p.status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-slate-100 font-black border-t-2 border-slate-800 text-[10px]">
                      <tr>
                        <td colSpan={4} className="border border-slate-300 px-2 py-1.5 text-right uppercase tracking-wider">
                          Active Purchases Total ({listData.totals.active_count} Active):
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right font-black text-slate-900">
                          ₹{formatMoneyDisplay(listData.totals.grand_total)}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right font-black text-emerald-800">
                          ₹{formatMoneyDisplay(listData.totals.paid_amount)}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right font-black text-[#7B3F4A]">
                          ₹{formatMoneyDisplay(listData.totals.balance_amount)}
                        </td>
                        <td colSpan={3} className="border border-slate-300 px-2 py-1.5 text-center text-slate-500 font-normal">
                          —
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Footnote on active totals vs cancelled */}
                <div className="p-2 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-600">
                  <p><strong>Note:</strong> {listData.footnote}</p>
                </div>

                {/* Signatures & Footer */}
                <div className="pt-6 flex justify-between items-end border-t border-slate-300">
                  <div className="text-center">
                    <div className="w-40 border-b border-slate-400 mb-1" />
                    <p className="text-[10px] font-bold uppercase text-slate-600">Store Manager Signature</p>
                  </div>
                  <div className="text-center">
                    <div className="w-40 border-b border-slate-400 mb-1" />
                    <p className="text-[10px] font-bold uppercase text-slate-600">Prepared By: {listData.printed_by}</p>
                  </div>
                </div>

                <div className="pt-2 text-center text-[9px] text-slate-400 font-mono">
                  Printed At: {listData.printed_at} | Unified POS Software
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}



