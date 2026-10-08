import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Badge, Button, Spinner } from '../components/ui'
import { api } from '../lib/api'

interface InvoiceItem {
  id: number
  product_name_snapshot: string
  variant_label_snapshot: string | null
  sku_snapshot: string
  quantity: number
  mrp: string
  unit_price: string
  discount_amount: string
  tax_amount: string
  line_total: string
  hsn_code?: string | null
  unit_name?: string | null
  gst_percent?: string | number | null
  tax_mode?: 'INCLUSIVE' | 'EXCLUSIVE' | null
}

interface InvoiceDetail {
  id: number
  invoice_no: string
  channel: 'POS' | 'ECOMMERCE'
  customer_name: string | null
  customer_phone: string | null
  cashier_name: string | null
  subtotal: string
  discount_total: string
  tax_total: string
  shipping_total: string
  grand_total: string
  payment_method: string | null
  amount_paid: string
  payment_status: 'PAID' | 'PARTIAL' | 'UNPAID'
  status: 'ACTIVE' | 'CANCELLED'
  created_at: string
  items: InvoiceItem[]
}

function money(value: string | number) {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function numberToWords(amount: number): string {
  const words = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  const numToWords = (n: number): string => {
    if (n < 20) return words[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + words[n % 10] : '')
    if (n < 1000) return words[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '')
    if (n < 100000) return numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '')
    if (n < 10000000) return numToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numToWords(n % 100000) : '')
    return numToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numToWords(n % 10000000) : '')
  }

  const integerPart = Math.floor(Math.abs(amount))
  if (integerPart === 0) return 'Zero Rupees Only'
  return numToWords(integerPart) + ' Rupees Only'
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return 'N/A'
  try {
    const d = new Date(dateStr.replace(' ', 'T'))
    if (isNaN(d.getTime())) return dateStr.split(' ')[0] || dateStr
    return d.toISOString().split('T')[0]
  } catch (e) {
    return dateStr.split(' ')[0] || dateStr
  }
}

export function InvoiceDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [format, setFormat] = useState<'a4' | 'thermal'>('a4')

  const companyDetails = useMemo(() => {
    try {
      const s = localStorage.getItem('company_settings')
      if (s) {
        const parsed = JSON.parse(s)
        return {
          name: parsed.name || 'Unified POS Store Ltd',
          address: parsed.address || '123 Retail Hub Street, Commercial Zone, City',
          gstin: parsed.gstin || '27AAAAA0000A1Z5',
          phone: parsed.phone || '+91 9876543210',
          email: parsed.email || 'contact@unifiedpos.store',
        }
      }
    } catch (e) {
      console.error(e)
    }
    return {
      name: 'Unified POS Store Ltd',
      address: '123 Retail Hub Street, Commercial Zone, City',
      gstin: '27AAAAA0000A1Z5',
      phone: '+91 9876543210',
      email: 'contact@unifiedpos.store',
    }
  }, [])

  useEffect(() => {
    setError(null)
    api
      .get(`/invoices/${id}`)
      .then((res) => {
        if (res.data && res.data.invoice) {
          setInvoice(res.data.invoice)
        } else {
          setError('Invoice not found.')
        }
      })
      .catch((err) => {
        console.error(err)
        setError(err?.response?.data?.error || err.message || 'Could not load invoice details')
      })
  }, [id])

  useEffect(() => {
    if (invoice && searchParams.get('print') === 'true') {
      const timer = setTimeout(() => {
        window.print()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [invoice, searchParams])

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-sm max-w-md space-y-3">
          <h3 className="text-base font-bold">Unable to Load Invoice</h3>
          <p className="text-xs text-red-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors"
          >
            Retry Loading
          </button>
        </div>
      </div>
    )
  }

  if (invoice === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="w-8 h-8 text-indigo-600" />
      </div>
    )
  }

  const grandTotal = Number(invoice.grand_total || 0)
  const subtotal = Number(invoice.subtotal || 0)
  const discountTotal = Number(invoice.discount_total || 0)
  const taxTotal = Number(invoice.tax_total || 0)
  const amountPaid = Number(invoice.amount_paid || 0)
  const balance = (grandTotal - amountPaid).toFixed(2)

  const rawSum = subtotal - discountTotal + taxTotal
  const roundOff = (grandTotal - rawSum).toFixed(2)

  const whatsappHref = invoice.customer_phone
    ? `https://wa.me/91${invoice.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hi! Your invoice ${invoice.invoice_no} — Total: Rs. ${invoice.grand_total}. Thank you for your business!`,
      )}`
    : null

  // Group Tax Breakdown by GST Slabs
  const gstSlabsMap: Record<number, { taxable: number; cgst: number; sgst: number; cess: number }> = {}
  for (const item of (invoice.items || [])) {
    const gstRate = Number(item.gst_percent ?? 0)
    const lineSubtotal = Number(item.unit_price || 0) * (item.quantity || 0) - Number(item.discount_amount || 0)
    const taxAmt = Number(item.tax_amount || 0)
    const cgst = taxAmt / 2
    const sgst = taxAmt / 2

    if (!gstSlabsMap[gstRate]) {
      gstSlabsMap[gstRate] = { taxable: 0, cgst: 0, sgst: 0, cess: 0 }
    }
    gstSlabsMap[gstRate].taxable += lineSubtotal
    gstSlabsMap[gstRate].cgst += cgst
    gstSlabsMap[gstRate].sgst += sgst
  }
  const gstSlabs = Object.entries(gstSlabsMap).map(([rate, val]) => ({
    rate: Number(rate),
    ...val,
  }))

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-6 font-sans">
      {/* Strict Print CSS Override */}
      <style>{`
        @media print {
          @page {
            margin: 5mm;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          header, nav, aside, footer, .no-print, .no-print * {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .print-area {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      {/* Print Controls Header */}
      <div className="no-print mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Print Layout:</span>
          <button
            type="button"
            onClick={() => setFormat('a4')}
            className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${
              format === 'a4' ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            📄 A4 Tax Invoice
          </button>
          <button
            type="button"
            onClick={() => setFormat('thermal')}
            className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${
              format === 'thermal' ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            🖨️ Thermal Receipt (80mm)
          </button>
        </div>

        <div className="flex items-center gap-2">
          {invoice.status === 'CANCELLED' && <Badge tone="red">CANCELLED</Badge>}
          <Button size="sm" variant="secondary" onClick={() => window.print()} className="font-semibold text-xs">
            🖨️ Print
          </Button>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 shadow-2xs"
            >
              Share WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Main Printable Document Area */}
      <div
        className={`print-area mx-auto w-full bg-white text-slate-900 shadow-md ${
          format === 'a4' ? 'max-w-[850px] p-6 sm:p-10 border border-slate-300 rounded-sm' : 'max-w-[340px] p-4 border border-slate-200 bg-[#faf8f0]'
        }`}
      >
        {format === 'a4' ? (
          /* A4 TAX INVOICE LAYOUT (Matching Dynamic Company Details) */
          <div className="space-y-4 text-xs text-slate-900 leading-tight">
            {/* Header: Business & Invoice Meta */}
            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
              <div>
                <h1 className="text-xl font-extrabold uppercase tracking-tight text-slate-900">{companyDetails.name}</h1>
                <p className="mt-1 text-[11px] text-slate-600">{companyDetails.address}</p>
                <p className="text-[11px] text-slate-600">Phone: {companyDetails.phone} | {companyDetails.email}</p>
                <p className="text-[11px] font-semibold text-slate-800">GSTIN: {companyDetails.gstin}</p>
              </div>
              <div className="text-right">
                <h2 className="text-lg font-black tracking-widest text-indigo-900 uppercase">TAX INVOICE</h2>
                <p className="mt-1 text-xs font-bold text-slate-900">
                  BILL NO: <span className="text-indigo-700">{invoice.invoice_no}</span>
                </p>
                <p className="text-xs text-slate-600">
                  DATE: {formatDate(invoice.created_at)}
                </p>
              </div>
            </div>

            {/* Customer Box */}
            <div className="border border-slate-400 p-3 rounded-xs flex justify-between items-center bg-slate-50/50">
              <div>
                <p className="font-extrabold uppercase text-[11px] text-slate-700">TO (CUSTOMER DETAILS):</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{invoice.customer_name ?? 'Walk-in Customer'}</p>
              </div>
              <div className="text-right font-medium">
                <p className="text-xs text-slate-700">
                  MOBILE: <span className="font-bold">{invoice.customer_phone || 'N/A'}</span>
                </p>
                <p className="text-xs uppercase text-slate-700 mt-0.5">
                  PAYMENT: <span className="font-bold text-emerald-700">{(invoice.payment_status || '').toLowerCase()}</span>
                </p>
              </div>
            </div>

            {/* Main Particulars Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-400 text-[11px]">
                <thead className="bg-slate-100 uppercase font-bold text-slate-800 border-b border-slate-400">
                  <tr>
                    <th className="border border-slate-400 px-2 py-1.5 text-left">HSN</th>
                    <th className="border border-slate-400 px-2 py-1.5 text-left">Particulars</th>
                    <th className="border border-slate-400 px-2 py-1.5 text-right">MRP</th>
                    <th className="border border-slate-400 px-2 py-1.5 text-center">Qty</th>
                    <th className="border border-slate-400 px-2 py-1.5 text-center">Unit</th>
                    <th className="border border-slate-400 px-2 py-1.5 text-center">Free</th>
                    <th className="border border-slate-400 px-2 py-1.5 text-right">Net Rate</th>
                    <th className="border border-slate-400 px-2 py-1.5 text-right">Disc</th>
                    <th className="border border-slate-400 px-2 py-1.5 text-right">GST%</th>
                    <th className="border border-slate-400 px-2 py-1.5 text-right">GST Amt</th>
                    <th className="border border-slate-400 px-2 py-1.5 text-right">Net Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-300">
                      <td className="border border-slate-300 px-2 py-1.5 font-mono text-slate-600">
                        {item.hsn_code || '-'}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 font-semibold text-slate-900">
                        {item.product_name_snapshot}
                        {item.variant_label_snapshot && (
                          <span className="text-[10px] text-slate-500 block">{item.variant_label_snapshot}</span>
                        )}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right text-slate-700">
                        {money(item.mrp)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-bold text-slate-900">
                        {item.quantity}.000
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center uppercase text-slate-600">
                        {item.unit_name || 'PCS'}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center text-slate-500">0.000</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right font-bold text-slate-900">
                        {money(item.unit_price)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right text-slate-600">
                        {money(item.discount_amount)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right text-slate-700">
                        {money(item.gst_percent || 0)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right text-slate-700">
                        {money(item.tax_amount)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right font-bold text-slate-900">
                        {money(item.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* TAX BREAKDOWN BOX */}
            <div className="border border-slate-400 rounded-xs overflow-hidden">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-400 font-extrabold uppercase text-[11px] text-slate-800">
                TAX BREAKDOWN (GST SLABS):
              </div>
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 border-b border-slate-300 uppercase font-semibold text-slate-600">
                  <tr>
                    <th className="px-3 py-1 border-r border-slate-300">GST%</th>
                    <th className="px-3 py-1 border-r border-slate-300">Taxable</th>
                    <th className="px-3 py-1 border-r border-slate-300">CGST</th>
                    <th className="px-3 py-1 border-r border-slate-300">SGST</th>
                    <th className="px-3 py-1">Cess</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {gstSlabs.map((s) => (
                    <tr key={s.rate}>
                      <td className="px-3 py-1 border-r border-slate-200 font-semibold">{s.rate}%</td>
                      <td className="px-3 py-1 border-r border-slate-200">{money(s.taxable)}</td>
                      <td className="px-3 py-1 border-r border-slate-200">{money(s.cgst)}</td>
                      <td className="px-3 py-1 border-r border-slate-200">{money(s.sgst)}</td>
                      <td className="px-3 py-1">0.00</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Summary & Balance */}
            <div className="flex justify-between items-start pt-2">
              <div className="space-y-2 max-w-md">
                <p className="text-xs font-semibold text-slate-800">
                  Amount in Words: <span className="font-bold text-slate-900">{numberToWords(grandTotal)}</span>
                </p>
                <p className="text-xs font-semibold text-slate-700">
                  Customer Outstanding Balance: Rs. <span className="font-bold text-slate-900">{balance}</span>
                </p>
              </div>

              <div className="w-64 space-y-1 text-xs">
                <div className="flex justify-between text-slate-700">
                  <span className="uppercase font-semibold">GROSS AMOUNT</span>
                  <span className="font-mono">{money(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span className="uppercase font-semibold">DISCOUNT</span>
                  <span className="font-mono">{money(discountTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span className="uppercase font-semibold">GST TAX</span>
                  <span className="font-mono">{money(taxTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-700 border-b border-slate-200 pb-1">
                  <span className="uppercase font-semibold">ROUND OFF</span>
                  <span className="font-mono">{roundOff}</span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-indigo-700 pt-1">
                  <span>NET TOTAL</span>
                  <span className="text-base">{money(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* THERMAL RECEIPT PRINTER LAYOUT (Matching AJ AGENCY Thermal Printer Image) */
          <div className="font-mono text-xs text-slate-900 space-y-3 leading-snug">
            {/* Header */}
            <div className="text-center space-y-0.5">
              <h1 className="text-base font-extrabold tracking-tight uppercase">{companyDetails.name}</h1>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-700">DISTRIBUTOR BILLING &amp; INVENTORY</p>
              <p className="text-[10px] text-slate-600">{companyDetails.address}</p>
              <p className="text-[10px] text-slate-600">GSTIN: {companyDetails.gstin} · Ph: {companyDetails.phone}</p>
            </div>

            <div className="border-b border-dashed border-slate-800" />

            {/* Bill Details */}
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="font-bold">INVOICE NO:</span>
                <span className="font-bold">{invoice.invoice_no}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>DATE &amp; TIME:</span>
                <span>{formatDate(invoice.created_at)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>CUSTOMER:</span>
                <span className="font-semibold">{invoice.customer_name || 'Walk-in'}</span>
              </div>
              <div className="flex justify-between">
                <span>STATUS:</span>
                <span className="font-bold text-emerald-700 uppercase">{invoice.payment_status}</span>
              </div>
            </div>

            <div className="border-b border-dashed border-slate-800" />

            {/* Thermal Table */}
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-800 font-extrabold text-slate-900">
                  <th className="py-1 text-left">ITEM</th>
                  <th className="py-1 text-center">QTY</th>
                  <th className="py-1 text-right">RATE</th>
                  <th className="py-1 text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-slate-300">
                {invoice.items.map((item) => (
                  <tr key={item.id} className="py-1">
                    <td className="py-1 pr-1 font-bold text-slate-900">{item.product_name_snapshot}</td>
                    <td className="py-1 text-center font-semibold">{item.quantity}.000</td>
                    <td className="py-1 text-right">{money(item.unit_price)}</td>
                    <td className="py-1 text-right font-bold">{money(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-b border-dashed border-slate-800" />

            {/* Totals */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between font-medium">
                <span>Subtotal</span>
                <span>Rs. {money(subtotal)}</span>
              </div>
              <div className="border-b border-slate-800 my-1" />
              <div className="flex justify-between text-sm font-black text-slate-900">
                <span>TOTAL AMOUNT</span>
                <span>Rs. {money(grandTotal)}</span>
              </div>
            </div>

            <div className="border-b border-dashed border-slate-800" />

            {/* Barcode Graphic */}
            <div className="text-center pt-2 space-y-1">
              <div className="inline-block bg-slate-900 text-white font-mono px-6 py-2 text-xs tracking-widest uppercase">
                |||||| | |||| ||| |||||||
              </div>
              <p className="text-[10px] font-mono text-slate-600">*{invoice.invoice_no}*</p>
            </div>

            <p className="text-center text-[10px] font-bold text-slate-700 pt-2 tracking-wide uppercase">
              *** THANK YOU FOR YOUR BUSINESS ***
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
