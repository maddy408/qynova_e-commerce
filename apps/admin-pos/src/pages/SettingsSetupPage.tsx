import { useState } from 'react'
import { Alert, Button, Card, PageHeader, TextField } from '../components/ui'

export function SettingsSetupPage({ defaultTab = 'company' }: { defaultTab?: 'company' | 'prefix' | 'printer' | 'scanner' }) {
  const [tab, setTab] = useState(defaultTab)

  // Company Details state
  const [companyName, setCompanyName] = useState('Unified POS Store Ltd')
  const [companyAddress, setCompanyAddress] = useState('123 Retail Hub Street, Commercial Zone, City')
  const [companyGstin, setCompanyGstin] = useState('27AAAAA0000A1Z5')
  const [companyPhone, setCompanyPhone] = useState('+91 9876543210')
  const [companyEmail, setCompanyEmail] = useState('contact@unifiedpos.store')

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

  const [savedMsg, setSavedMsg] = useState('')

  function handleSave() {
    setSavedMsg('Settings saved successfully!')
    setTimeout(() => setSavedMsg(''), 3000)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Store & Hardware Settings"
        description="Configure company details, invoice numbering prefix, thermal receipt printer, and wireless barcode scanners."
      />

      {savedMsg && <Alert tone="green">{savedMsg}</Alert>}

      <div className="flex border-b border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setTab('company')}
          className={`px-4 py-2.5 border-b-2 transition-colors ${
            tab === 'company' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🏢 Company Details
        </button>
        <button
          onClick={() => setTab('prefix')}
          className={`px-4 py-2.5 border-b-2 transition-colors ${
            tab === 'prefix' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🧾 Invoice Prefix
        </button>
        <button
          onClick={() => setTab('printer')}
          className={`px-4 py-2.5 border-b-2 transition-colors ${
            tab === 'printer' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🖨️ Thermal Printer Setup
        </button>
        <button
          onClick={() => setTab('scanner')}
          className={`px-4 py-2.5 border-b-2 transition-colors ${
            tab === 'scanner' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📶 WiFi Scanner Setup
        </button>
      </div>

      <Card className="p-6 space-y-4 max-w-3xl">
        {tab === 'company' && (
          <div className="space-y-4 text-xs">
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
          <div className="space-y-4 text-xs">
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
          <div className="space-y-4 text-xs">
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
          <div className="space-y-4 text-xs">
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
