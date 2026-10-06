import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge, Button, Spinner } from '../components/ui'
import { api } from '../lib/api'

interface InvoiceItem {
  id: number
  product_name_snapshot: string
  sku_snapshot: string
  quantity: number
  mrp: string
  unit_price: string
  discount_amount: string
  tax_amount: string
  line_total: string
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
  grand_total: string
  payment_method: string | null
  amount_paid: string
  payment_status: 'PAID' | 'PARTIAL' | 'UNPAID'
  status: 'ACTIVE' | 'CANCELLED'
  created_at: string
  items: InvoiceItem[]
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'text-base font-bold text-slate-900' : 'text-sm text-slate-600'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

export function InvoiceDetailPage() {
  const { id } = useParams()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [format, setFormat] = useState<'a4' | 'thermal'>('a4')

  useEffect(() => {
    api.get(`/invoices/${id}`).then((res) => setInvoice(res.data.invoice))
  }, [id])

  if (invoice === null) return <Spinner />

  const balance = (Number(invoice.grand_total) - Number(invoice.amount_paid)).toFixed(2)
  const whatsappHref = invoice.customer_phone
    ? `https://wa.me/91${invoice.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hi! Your invoice ${invoice.invoice_no} — Total: Rs. ${invoice.grand_total}. Thank you for your business!`,
      )}`
    : null

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center gap-2 rounded-lg bg-white p-3 shadow-sm">
        <span className="text-sm font-medium text-slate-600">Format:</span>
        <button
          onClick={() => setFormat('thermal')}
          className={`rounded px-3 py-1 text-sm ${format === 'thermal' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          Thermal (80mm)
        </button>
        <button
          onClick={() => setFormat('a4')}
          className={`rounded px-3 py-1 text-sm ${format === 'a4' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          A4
        </button>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => window.print()}>
          Print
        </Button>
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noreferrer" className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
            Share via WhatsApp
          </a>
        )}
      </div>

      <div className={`mx-auto rounded-lg bg-white p-6 shadow-sm print-area ${format === 'a4' ? 'w-[780px]' : 'w-[320px]'}`}>
        {format === 'a4' ? (
          <div>
            <div className="flex items-start justify-between border-b-2 border-indigo-700 pb-2">
              <div>
                <p className="text-sm font-semibold text-slate-500">Unified POS</p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-slate-900">TAX INVOICE</p>
                <p className="font-bold text-indigo-700">BILL NO: {invoice.invoice_no}</p>
                <p className="text-sm text-slate-600">{new Date(invoice.created_at).toLocaleString()}</p>
                <Badge tone={invoice.status === 'ACTIVE' ? 'green' : 'red'}>{invoice.status}</Badge>
              </div>
            </div>

            <div className="my-3 flex justify-between border border-slate-300 p-3 text-sm">
              <div>
                <p className="font-semibold text-slate-700">TO (CUSTOMER DETAILS):</p>
                <p className="text-slate-900">{invoice.customer_name ?? 'Walk-in Customer'}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-600">Mobile: {invoice.customer_phone ?? '—'}</p>
                <p className="text-slate-600">Served by: {invoice.cashier_name ?? '—'}</p>
                <Badge tone={invoice.payment_status === 'PAID' ? 'green' : invoice.payment_status === 'PARTIAL' ? 'amber' : 'red'}>
                  {invoice.payment_status}
                </Badge>
              </div>
            </div>

            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-300 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1.5">SKU</th>
                  <th className="py-1.5">Item</th>
                  <th className="py-1.5 text-right">MRP</th>
                  <th className="py-1.5 text-right">Qty</th>
                  <th className="py-1.5 text-right">Rate</th>
                  <th className="py-1.5 text-right">Disc</th>
                  <th className="py-1.5 text-right">Tax</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-1.5 text-slate-500">{item.sku_snapshot}</td>
                    <td className="py-1.5 text-slate-900">{item.product_name_snapshot}</td>
                    <td className="py-1.5 text-right text-slate-600">{item.mrp}</td>
                    <td className="py-1.5 text-right text-slate-600">{item.quantity}</td>
                    <td className="py-1.5 text-right text-slate-600">{item.unit_price}</td>
                    <td className="py-1.5 text-right text-slate-600">{item.discount_amount}</td>
                    <td className="py-1.5 text-right text-slate-600">{item.tax_amount}</td>
                    <td className="py-1.5 text-right font-medium text-slate-900">{item.line_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-1 rounded-lg bg-slate-50 p-3">
                <Row label="Subtotal" value={`₹${invoice.subtotal}`} />
                <Row label="Discount" value={`₹${invoice.discount_total}`} />
                <Row label="GST" value={`₹${invoice.tax_total}`} />
                <div className="my-1 border-t border-slate-300" />
                <Row label="Grand Total" value={`₹${invoice.grand_total}`} bold />
                <Row label="Amount Paid" value={`₹${invoice.amount_paid}`} />
                {Number(balance) > 0 && <Row label="Balance Due" value={`₹${balance}`} />}
                <p className="pt-1 text-xs text-slate-500">Paid via {invoice.payment_method ?? '—'}</p>
              </div>
            </div>

            <div className="mt-10 flex justify-end">
              <div className="text-center text-sm">
                <p>For: Unified POS</p>
                <p className="mt-10 border-t border-slate-900 pt-1">Authorized Signatory</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="font-mono text-xs">
            <div className="text-center">
              <p className="font-bold">Unified POS</p>
            </div>
            <hr className="my-2 border-dashed" />
            <p>Bill No: {invoice.invoice_no}</p>
            <p>Date: {new Date(invoice.created_at).toLocaleString()}</p>
            <p>Customer: {invoice.customer_name ?? 'Walk-in'}</p>
            <hr className="my-2 border-dashed" />
            {invoice.items.map((item) => (
              <div key={item.id} className="mb-1">
                <p>{item.product_name_snapshot}</p>
                <div className="flex justify-between">
                  <span>
                    {item.quantity} x {item.unit_price}
                  </span>
                  <span>{item.line_total}</span>
                </div>
              </div>
            ))}
            <hr className="my-2 border-dashed" />
            <Row label="Subtotal" value={invoice.subtotal} />
            <Row label="GST" value={invoice.tax_total} />
            <Row label="TOTAL" value={`Rs. ${invoice.grand_total}`} bold />
            <hr className="my-2 border-dashed" />
            <p className="text-center">Thank you, visit again!</p>
          </div>
        )}
      </div>
    </div>
  )
}
