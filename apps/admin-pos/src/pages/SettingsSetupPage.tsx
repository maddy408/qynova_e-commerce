import { useEffect, useState } from 'react'
import { Alert, Button, Card, PageHeader, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface PriceVariant {
  variant_id: number
  product_id: number
  sku: string
  barcode: string | null
  product_name: string
  mrp: string | number
  retail_price: string | number
  wholesale_price: string | number | null
  customer_price: string | number | null
}

export function SettingsSetupPage({ defaultTab = 'company' }: { defaultTab?: 'company' | 'prefix' | 'printer' | 'scanner' | 'prices' }) {
  const [tab, setTab] = useState<string>(defaultTab)

  useEffect(() => setTab(defaultTab), [defaultTab])

  // Company Details state
  const [companyName, setCompanyName] = useState(() => {
    const s = localStorage.getItem('company_settings')
    return s ? JSON.parse(s).name || 'Unified POS Store Ltd' : 'Unified POS Store Ltd'
  })
  const [companyAddress, setCompanyAddress] = useState(() => {
    const s = localStorage.getItem('company_settings')
    return s ? JSON.parse(s).address || '123 Retail Hub Street, Commercial Zone, City' : '123 Retail Hub Street, Commercial Zone, City'
  })
  const [companyGstin, setCompanyGstin] = useState(() => {
    const s = localStorage.getItem('company_settings')
    return s ? JSON.parse(s).gstin || '27AAAAA0000A1Z5' : '27AAAAA0000A1Z5'
  })
  const [companyPhone, setCompanyPhone] = useState(() => {
    const s = localStorage.getItem('company_settings')
    return s ? JSON.parse(s).phone || '+91 9876543210' : '+91 9876543210'
  })
  const [companyEmail, setCompanyEmail] = useState(() => {
    const s = localStorage.getItem('company_settings')
    return s ? JSON.parse(s).email || 'contact@unifiedpos.store' : 'contact@unifiedpos.store'
  })

  // Invoice Prefix state
  const [invoicePrefix, setInvoicePrefix] = useState('INV')
  const [posInvoicePrefix, setPosInvoicePrefix] = useState('POS')
  const [orderPrefix, setOrderPrefix] = useState('ORD')

  // Printer state
  const [printerPaperSize, setPrinterPaperSize] = useState('80mm')
  const [printerConnection, setPrinterConnection] = useState('USB / Local Spooler')
  const [autoPrintPosSales, setAutoPrintPosSales] = useState(true)

  // Scanner state
  const [scannerIp, setScannerIp] = useState('192.168.1.120')
  const [scannerMode, setScannerMode] = useState('HID / Wireless TCP')
  const [scannerBeep, setScannerBeep] = useState(true)

  // Price Settings & Batch Rule state
  const [priceVariants, setPriceVariants] = useState<PriceVariant[]>([])
  const [consumptionRule, setConsumptionRule] = useState<'FIFO' | 'FEFO'>('FIFO')
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [savingPrices, setSavingPrices] = useState(false)
  const [priceSearch, setPriceSearch] = useState('')
  const [priceError, setPriceError] = useState('')

  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    if (tab === 'prices') {
      fetchPriceSettings()
    }
  }, [tab])

  async function fetchPriceSettings() {
    setLoadingPrices(true)
    setPriceError('')
    try {
      const [res, ruleRes] = await Promise.all([
        api.get('/products/price-settings'),
        api.get('/inventory/consumption-rule').catch(() => ({ data: { rule: 'FIFO' } })),
      ])
      setPriceVariants(res.data.variants || [])
      if (ruleRes.data && ruleRes.data.rule) {
        setConsumptionRule(ruleRes.data.rule as 'FIFO' | 'FEFO')
      }
    } catch (err) {
      setPriceError(apiErrorMessage(err))
    } finally {
      setLoadingPrices(false)
    }
  }

  function handlePriceChange(variantId: number, field: 'retail_price' | 'wholesale_price' | 'customer_price', value: string) {
    setPriceVariants((prev) =>
      prev.map((v) => (v.variant_id === variantId ? { ...v, [field]: value } : v))
    )
  }

  async function handleSavePrices() {
    setSavingPrices(true)
    setPriceError('')
    try {
      const items = priceVariants.map((v) => ({
        variant_id: v.variant_id,
        retail_price: v.retail_price,
        wholesale_price: v.wholesale_price,
        customer_price: v.customer_price,
      }))
      await Promise.all([
        api.put('/products/price-settings', { items }),
        api.put('/inventory/consumption-rule', { rule: consumptionRule }),
      ])
      setSavedMsg('Wholesale, Retail, Customer-Wise prices & Batch Consumption Rule saved successfully!')
      setTimeout(() => setSavedMsg(''), 4000)
    } catch (err) {
      setPriceError(apiErrorMessage(err))
    } finally {
      setSavingPrices(false)
    }
  }

  function handleSave() {
    if (tab === 'prices') {
      handleSavePrices()
      return
    }
    if (tab === 'company') {
      localStorage.setItem(
        'company_settings',
        JSON.stringify({
          name: companyName,
          address: companyAddress,
          gstin: companyGstin,
          phone: companyPhone,
          email: companyEmail,
        })
      )
    }
    setSavedMsg('Settings saved successfully!')
    setTimeout(() => setSavedMsg(''), 3000)
  }

  const filteredPriceVariants = priceVariants.filter(
    (v) =>
      v.product_name.toLowerCase().includes(priceSearch.toLowerCase()) ||
      v.sku.toLowerCase().includes(priceSearch.toLowerCase()) ||
      (v.barcode && v.barcode.toLowerCase().includes(priceSearch.toLowerCase()))
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Store & Price Settings"
        description="Configure company details, item wholesale/retail/customer-wise price rates, invoice prefixes, printer, and scanner setup."
      />

      {savedMsg && <Alert tone="green">{savedMsg}</Alert>}
      {priceError && <Alert tone="red">{priceError}</Alert>}

      <div className="inline-flex items-center gap-1 p-1 rounded-full text-xs overflow-x-auto max-w-full scrollbar-none shadow-sm border bg-[#F9F3F4] border-[#EEDDE0]">
        {[
          { id: 'company', label: 'Company Details' },
          { id: 'prices', label: 'Price Settings (Wholesale / Retail / Customer-Wise)' },
          { id: 'prefix', label: 'Invoice Prefix' },
          { id: 'printer', label: 'Thermal Printer Setup' },
          { id: 'scanner', label: 'WiFi Scanner Setup' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all ${
              tab === t.id
                ? 'bg-[#7B3F4A] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="p-6 space-y-4">
        {tab === 'prices' && (
          <div className="space-y-4 text-xs">
            {/* Batch Consumption Strategy Card */}
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 space-y-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-950">Batch Stock Consumption Strategy (FIFO vs FEFO)</h4>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Select how POS sales &amp; orders consume stock batches. FIFO (First-In, First-Out) consumes oldest batch; FEFO (First-Expired, First-Out) consumes nearest expiry.
                  </p>
                </div>
                <div className="flex items-center gap-4 bg-white px-3 py-1.5 rounded-md border border-indigo-200 shadow-2xs">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="radio"
                      name="consumption_rule"
                      value="FIFO"
                      checked={consumptionRule === 'FIFO'}
                      onChange={() => setConsumptionRule('FIFO')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    FIFO (First-In First-Out)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="radio"
                      name="consumption_rule"
                      value="FEFO"
                      checked={consumptionRule === 'FEFO'}
                      onChange={() => setConsumptionRule('FEFO')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    FEFO (First-Expired First-Out)
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Item Pricing Matrix</h3>
                <p className="text-slate-500 text-xs">Set Wholesale Selling Rate, Retail Rate, and Customer-Wise Special Rate for all product variants.</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <TextField
                  placeholder="Search item by name or SKU..."
                  value={priceSearch}
                  onChange={(e) => setPriceSearch(e.target.value)}
                  className="w-full sm:w-64"
                />
                <Button onClick={handleSavePrices} disabled={savingPrices}>
                  {savingPrices ? <Spinner className="w-4 h-4" /> : 'Save Price Rates'}
                </Button>
              </div>
            </div>

            {loadingPrices ? (
              <div className="flex justify-center py-12">
                <Spinner className="w-8 h-8 text-indigo-600" />
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#F2E5E7] rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF2F4]/80 border-b border-[#F2E5E7] uppercase font-bold text-[#804652] text-[10px] tracking-wider">
                    <tr>
                      <th className="px-3 py-3">Item / SKU</th>
                      <th className="px-3 py-3 text-right">MRP (₹)</th>
                      <th className="px-3 py-3 text-center bg-[#FAF2F4]">Retail Rate (₹)</th>
                      <th className="px-3 py-3 text-center bg-amber-50/50">Wholesale Rate (₹)</th>
                      <th className="px-3 py-3 text-center bg-rose-50/40">Customer-Wise Rate (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2E5E7]">
                    {filteredPriceVariants.map((v) => (
                      <tr key={v.variant_id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-900">{v.product_name}</div>
                          <div className="text-[11px] font-mono text-slate-400">{v.sku}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-slate-500">
                          ₹{Number(v.mrp || 0).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 bg-indigo-50/20">
                          <input
                            type="number"
                            step="0.01"
                            value={v.retail_price ?? ''}
                            onChange={(e) => handlePriceChange(v.variant_id, 'retail_price', e.target.value)}
                            className="w-28 text-center font-semibold text-slate-900 rounded border border-slate-300 p-1 focus:ring-2 focus:ring-indigo-500"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-2 bg-amber-50/20">
                          <input
                            type="number"
                            step="0.01"
                            value={v.wholesale_price ?? ''}
                            onChange={(e) => handlePriceChange(v.variant_id, 'wholesale_price', e.target.value)}
                            className="w-28 text-center font-semibold text-amber-900 rounded border border-amber-300 p-1 focus:ring-2 focus:ring-amber-500"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-2 bg-teal-50/20">
                          <input
                            type="number"
                            step="0.01"
                            value={v.customer_price ?? ''}
                            onChange={(e) => handlePriceChange(v.variant_id, 'customer_price', e.target.value)}
                            className="w-28 text-center font-semibold text-teal-900 rounded border border-teal-300 p-1 focus:ring-2 focus:ring-teal-500"
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                    ))}
                    {filteredPriceVariants.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          No items found matching search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'company' && (
          <div className="space-y-4 text-xs max-w-3xl">
            <h3 className="text-sm font-semibold text-slate-900">Company Information</h3>
            <TextField label="Store / Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <TextField label="GSTIN / Tax ID" value={companyGstin} onChange={(e) => setCompanyGstin(e.target.value)} />
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Phone Number" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} />
              <TextField label="Support Email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">Full Store Address</label>
              <textarea
                rows={3}
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {tab === 'prefix' && (
          <div className="space-y-4 text-xs max-w-3xl">
            <h3 className="text-sm font-semibold text-slate-900">Invoice &amp; Document Numbering Format</h3>
            <div className="grid grid-cols-3 gap-4">
              <TextField label="POS Invoice Prefix" value={posInvoicePrefix} onChange={(e) => setPosInvoicePrefix(e.target.value)} placeholder="e.g. POS" />
              <TextField label="E-Commerce Invoice Prefix" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} placeholder="e.g. INV" />
              <TextField label="Order No. Prefix" value={orderPrefix} onChange={(e) => setOrderPrefix(e.target.value)} placeholder="e.g. ORD" />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">Preview Generated Numbers:</p>
              <p className="mt-1 font-mono text-indigo-700">{posInvoicePrefix}-20261007-0012</p>
              <p className="font-mono text-indigo-700">{invoicePrefix}-20261007-0045</p>
              <p className="font-mono text-indigo-700">{orderPrefix}-20261007-0099</p>
            </div>
          </div>
        )}

        {tab === 'printer' && (
          <div className="space-y-4 text-xs max-w-3xl">
            <h3 className="text-sm font-semibold text-slate-900">POS Thermal Receipt Printer Setup</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Receipt Paper Size</label>
                <select
                  value={printerPaperSize}
                  onChange={(e) => setPrinterPaperSize(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="80mm">80mm Standard Thermal Paper</option>
                  <option value="58mm">58mm Compact Mini Receipt</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Printer Connection Type</label>
                <select
                  value={printerConnection}
                  onChange={(e) => setPrinterConnection(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="USB / Local Spooler">USB / Direct ESC/POS Spooler</option>
                  <option value="Network / Ethernet (LAN)">Network / Ethernet (LAN IP)</option>
                  <option value="Bluetooth">Bluetooth Wireless</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={autoPrintPosSales}
                onChange={(e) => setAutoPrintPosSales(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Auto-print receipt immediately upon completing POS sale
            </label>
          </div>
        )}

        {tab === 'scanner' && (
          <div className="space-y-4 text-xs max-w-3xl">
            <h3 className="text-sm font-semibold text-slate-900">WiFi &amp; Wireless Barcode Scanner Setup</h3>
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Scanner IP Address / Host" value={scannerIp} onChange={(e) => setScannerIp(e.target.value)} placeholder="e.g. 192.168.1.120" />
              <div>
                <label className="block font-medium text-slate-700 mb-1">Scanner Connection Mode</label>
                <select
                  value={scannerMode}
                  onChange={(e) => setScannerMode(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="HID / Wireless TCP">Wireless TCP / HID Keyboard Emulation</option>
                  <option value="SPP Serial">SPP Serial Port Mode</option>
                  <option value="Websocket Gateway">Websocket Hardware Gateway</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={scannerBeep}
                onChange={(e) => setScannerBeep(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Enable audio notification tone on successful barcode scan
            </label>
          </div>
        )}

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <Button onClick={handleSave}>Save {tab.charAt(0).toUpperCase() + tab.slice(1)} Settings</Button>
        </div>
      </Card>
    </div>
  )
}
