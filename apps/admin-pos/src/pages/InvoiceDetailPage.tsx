import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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

const PAYMENT_TONE: Record<string, 'green' | 'amber' | 'red'> = { PAID: 'green', PARTIAL: 'amber', UNPAID: 'red' }

function money(value: string | number) {
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function PaymentMethodLabel(method: string | null) {
  const labels: Record<string, string> = {
    CASH: 'Cash',
    UPI: 'UPI',
    CARD: 'Card',
    BANK_TRANSFER: 'Bank Transfer',
    CREDIT: 'Credit',
  }
  return method ? labels[method] ?? method : '—'
}

function TotalRow({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between ${
        bold ? 'text-sm font-semibold text-slate-900' : `text-xs ${muted ? 'text-slate-400' : 'text-slate-600'}`
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
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
  const hasShipping = Number(invoice.shipping_total) > 0
  const whatsappHref = invoice.customer_phone
    ? `https://wa.me/91${invoice.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hi! Your invoice ${invoice.invoice_no} — Total: Rs. ${invoice.grand_total}. Thank you for your business!`,
      )}`
    : null

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-6">
      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center gap-2 rounded-lg bg-white p-3 shadow-sm">
        <span className="text-sm font-medium text-slate-600">Format:</span>
        <button
          onClick={() => setFormat('thermal')}
          className={`rounded px-3 py-1 text-sm transition-colors ${format === 'thermal' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          Thermal (80mm)
        </button>
        <button
          onClick={() => setFormat('a4')}
          className={`rounded px-3 py-1 text-sm transition-colors ${format === 'a4' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          A4
        </button>
        {invoice.status === 'CANCELLED' && (
          <Badge tone="red">CANCELLED</Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Share via WhatsApp
            </a>
          )}
        </div>
      </div>

      <div
        className={`print-area mx-auto w-full rounded-lg border border-slate-200 bg-white shadow-sm ${
          format === 'a4' ? 'max-w-[780px] p-6 sm:p-8' : 'max-w-[320px] p-4'
        }`}
      >
        {format === 'a4' ? (
          <div>
            {/* Header: business info + invoice info */}
            <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
              <div>
                <p className="text-lg font-bold tracking-tight text-slate-900">Unified POS</p>
                <p className="mt-0.5 text-xs text-slate-500">Retail &amp; E-commerce Billing</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Tax Invoice</p>
                <p className="mt-1 text-xl font-bold text-indigo-700">{invoice.invoice_no}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(invoice.created_at).toLocaleString()}</p>
              </div>
            </div>

            {/* Bill to + payment status */}
            <div className="mt-5 flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Bill To</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{invoice.customer_name ?? 'Walk-in Customer'}</p>
                {invoice.customer_phone && <p className="text-xs text-slate-500">{invoice.customer_phone}</p>}
              </div>
              <div className="flex flex-col items-start gap-1.5 sm:items-end">
                <Badge tone={PAYMENT_TONE[invoice.payment_status]}>{invoice.payment_status}</Badge>
                <p className="text-xs text-slate-500">
                  Channel: <span className="font-medium text-slate-700">{invoice.channel}</span>
                </p>
                {invoice.cashier_name && (
                  <p className="text-xs text-slate-500">
                    Served by: <span className="font-medium text-slate-700">{invoice.cashier_name}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Items — only this scrolls horizontally on narrow screens, so
                totals/payment/footer below stay fully visible without the
                reader having to scroll sideways to find them. */}
            <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="border-b border-slate-300 uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-2 pr-2 font-semibold">#</th>
                  <th className="py-2 pr-2 font-semibold">Product</th>
                  <th className="py-2 pr-2 font-semibold">SKU</th>
                  <th className="py-2 pr-2 text-right font-semibold">Qty</th>
                  <th className="py-2 pr-2 text-right font-semibold">Rate</th>
                  <th className="py-2 pr-2 text-right font-semibold">Discount</th>
                  <th className="py-2 pr-2 text-right font-semibold">Tax</th>
                  <th className="py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="py-2 pr-2 align-top text-slate-400">{index + 1}</td>
                    <td className="max-w-[220px] py-2 pr-2 align-top">
                      <p className="font-medium text-slate-900">{item.product_name_snapshot}</p>
                      {item.variant_label_snapshot && <p className="text-[11px] text-slate-500">{item.variant_label_snapshot}</p>}
                    </td>
                    <td className="py-2 pr-2 align-top font-mono text-[11px] text-slate-500">{item.sku_snapshot}</td>
                    <td className="py-2 pr-2 text-right align-top tabular-nums text-slate-600">{item.quantity}</td>
                    <td className="py-2 pr-2 text-right align-top tabular-nums text-slate-600">{money(item.unit_price)}</td>
                    <td className="py-2 pr-2 text-right align-top tabular-nums text-slate-600">{money(item.discount_amount)}</td>
                    <td className="py-2 pr-2 text-right align-top tabular-nums text-slate-600">{money(item.tax_amount)}</td>
                    <td className="py-2 text-right align-top tabular-nums font-semibold text-slate-900">{money(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Totals */}
            <div className="mt-5 flex justify-end">
              <div className="w-full max-w-[280px] space-y-1.5 rounded-lg bg-slate-50 p-4">
                <TotalRow label="Subtotal" value={`₹${money(invoice.subtotal)}`} />
                {Number(invoice.discount_total) > 0 && <TotalRow label="Discount" value={`-₹${money(invoice.discount_total)}`} />}
                <TotalRow label="Tax (GST)" value={`₹${money(invoice.tax_total)}`} />
                {hasShipping && <TotalRow label="Shipping" value={`₹${money(invoice.shipping_total)}`} />}
                <div className="my-1.5 border-t border-slate-300" />
                <TotalRow label="Grand Total" value={`₹${money(invoice.grand_total)}`} bold />
                <div className="my-1.5 border-t border-dashed border-slate-200" />
                <TotalRow label="Amount Paid" value={`₹${money(invoice.amount_paid)}`} muted />
                {Number(balance) > 0 && <TotalRow label="Balance Due" value={`₹${money(balance)}`} />}
              </div>
            </div>

            {/* Payment info */}
            <div className="mt-2 flex flex-col gap-1 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Payment Method: <span className="font-medium text-slate-700">{PaymentMethodLabel(invoice.payment_method)}</span>
              </p>
              <p>
                Payment Status: <span className="font-medium text-slate-700">{invoice.payment_status}</span>
              </p>
            </div>

            {/* Footer */}
            <div className="mt-10 flex items-end justify-between border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-400">Thank you for your business.</p>
              <div className="text-center text-xs text-slate-600">
                <p>For Unified POS</p>
                <p className="mt-8 border-t border-slate-300 pt-1">Authorized Signatory</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="font-mono text-xs">
            <div className="text-center">
              <p className="text-sm font-bold">Unified POS</p>
            </div>
            <hr className="my-2 border-dashed" />
            <p>Bill No: {invoice.invoice_no}</p>
            <p>Date: {new Date(invoice.created_at).toLocaleString()}</p>
            <p>Customer: {invoice.customer_name ?? 'Walk-in'}</p>
            <p>
              Payment: {invoice.payment_status} ({PaymentMethodLabel(invoice.payment_method)})
            </p>
            <hr className="my-2 border-dashed" />
            {invoice.items.map((item) => (
              <div key={item.id} className="mb-1">
                <p>
                  {item.product_name_snapshot}
                  {item.variant_label_snapshot ? ` (${item.variant_label_snapshot})` : ''}
                </p>
                <div className="flex justify-between">
                  <span>
                    {item.quantity} x {money(item.unit_price)}
                  </span>
                  <span>{money(item.line_total)}</span>
                </div>
              </div>
            ))}
            <hr className="my-2 border-dashed" />
            <TotalRow label="Subtotal" value={money(invoice.subtotal)} />
            {Number(invoice.discount_total) > 0 && <TotalRow label="Discount" value={`-${money(invoice.discount_total)}`} />}
            <TotalRow label="GST" value={money(invoice.tax_total)} />
            {hasShipping && <TotalRow label="Shipping" value={money(invoice.shipping_total)} />}
            <TotalRow label="TOTAL" value={`Rs. ${money(invoice.grand_total)}`} bold />
            <hr className="my-2 border-dashed" />
            <p className="text-center">Thank you, visit again!</p>
          </div>
        )}
      </div>
    </div>
  )
}
