import { useEffect, useState } from 'react'
import { Alert, Button, Card, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface PriceVariant {
  variant_id: number
  product_id: number
  sku: string
  barcode: string | null
  product_name: string
  unit_name?: string | null
  mrp: string | number
  retail_price: string | number
  wholesale_price: string | number | null
  customer_price: string | number | null
}

export function PriceAdjustmentPage() {
  const [mode, setMode] = useState<'WHOLESALE' | 'RETAIL' | 'CUSTOMER_WISE'>('WHOLESALE')
  const [variants, setVariants] = useState<PriceVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    loadPrices()
  }, [])

  async function loadPrices() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/products/price-settings')
      setVariants(res.data.variants || [])
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load price settings'))
    } finally {
      setLoading(false)
    }
  }

  function handlePriceChange(variantId: number, field: 'retail_price' | 'wholesale_price' | 'customer_price', value: string) {
    setVariants((prev) =>
      prev.map((v) => (v.variant_id === variantId ? { ...v, [field]: value } : v))
    )
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccessMsg('')
    try {
      const items = variants.map((v) => ({
        variant_id: v.variant_id,
        retail_price: v.retail_price,
        wholesale_price: v.wholesale_price,
        customer_price: v.customer_price,
      }))
      await api.put('/products/price-settings', { items })
      setSuccessMsg('Price adjustments saved successfully! Wholesale & Retail rates updated.')
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save price adjustments'))
    } finally {
      setSaving(false)
    }
  }

  const filteredVariants = variants.filter(
    (v) =>
      v.product_name.toLowerCase().includes(search.toLowerCase()) ||
      v.sku.toLowerCase().includes(search.toLowerCase()) ||
      (v.barcode && v.barcode.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[#7B3F4A] text-xl">🏷️</span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Price Adjustment</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage wholesale &amp; retail selling prices across your product catalog
          </p>
        </div>

        {/* Mode Toggles */}
        <div className="flex items-center gap-1.5 rounded-full border border-[#EEDDE0] bg-[#FAF2F4] p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode('WHOLESALE')}
            className={`rounded-full px-4 py-1.5 transition-all ${
              mode === 'WHOLESALE'
                ? 'bg-[#7B3F4A] text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Wholesale Price
          </button>
          <button
            type="button"
            onClick={() => setMode('RETAIL')}
            className={`rounded-full px-4 py-1.5 transition-all ${
              mode === 'RETAIL'
                ? 'bg-[#7B3F4A] text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Retail Price
          </button>
          <button
            type="button"
            onClick={() => setMode('CUSTOMER_WISE')}
            className={`rounded-full px-4 py-1.5 transition-all ${
              mode === 'CUSTOMER_WISE'
                ? 'bg-[#7B3F4A] text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Customer Wise Price
          </button>
        </div>
      </div>

      {successMsg && <Alert tone="green">{successMsg}</Alert>}
      {error && <Alert tone="red">{error}</Alert>}

      {/* Filter Bar & Save Action */}
      <Card className="p-4 bg-white border-[#F2E5E7] shadow-2xs">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative flex-1 w-full sm:max-w-md">
            <TextField
              placeholder="Search item name / code / barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white pl-3 text-xs"
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            {saving ? 'Saving...' : 'Save Prices'}
          </Button>
        </div>
      </Card>

      {/* Main Prices Adjustment Table */}
      <Card className="overflow-hidden border-[#F2E5E7] rounded-3xl">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="w-8 h-8 text-[#7B3F4A]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#FAF2F4]/80 border-b border-[#F2E5E7] uppercase font-bold text-[#804652] tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-center">Unit</th>
                  <th className="px-4 py-3 text-right">MRP</th>
                  <th className="px-4 py-3 text-right">Normal Net_Srate (Retail)</th>
                  <th className="px-4 py-3 text-center bg-[#F2E5E7]/80 text-[#7B3F4A]">
                    {mode === 'WHOLESALE'
                      ? 'Wholesale Price (₹)'
                      : mode === 'RETAIL'
                      ? 'Retail Selling Price (₹)'
                      : 'Customer-Wise Special Rate (₹)'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2E5E7] bg-white">
                {filteredVariants.map((v) => {
                  const activeFieldValue =
                    mode === 'WHOLESALE'
                      ? v.wholesale_price
                      : mode === 'RETAIL'
                      ? v.retail_price
                      : v.customer_price

                  const activeFieldName =
                    mode === 'WHOLESALE'
                      ? 'wholesale_price'
                      : mode === 'RETAIL'
                      ? 'retail_price'
                      : 'customer_price'

                  return (
                    <tr key={v.variant_id} className="hover:bg-[#FAF2F4]/40 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-900 block">{v.product_name}</span>
                        <span className="text-[10px] font-mono text-slate-400">({v.sku})</span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-600 uppercase">
                        {v.unit_name || 'PCS'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-600">
                        ₹{Number(v.mrp || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">
                        ₹{Number(v.retail_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-center bg-[#FAF2F4]/30">
                        <input
                          type="number"
                          step="0.01"
                          value={activeFieldValue ?? ''}
                          onChange={(e) => handlePriceChange(v.variant_id, activeFieldName, e.target.value)}
                          placeholder="Not set"
                          className="w-32 rounded-xl border border-[#EEDDE0] bg-white px-3 py-1.5 text-center text-xs font-bold text-slate-900 shadow-2xs focus:border-[#7B3F4A] focus:outline-none focus:ring-2 focus:ring-[#7B3F4A]/20"
                        />
                      </td>
                    </tr>
                  )
                })}

                {filteredVariants.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                      No products found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
