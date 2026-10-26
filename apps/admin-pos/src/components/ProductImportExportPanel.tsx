import { useRef, useState } from 'react'
import { Button, Modal } from './ui'
import { ToastStack, useToasts } from './ui/Toast'
import { useDoubleSubmitGuard } from '../hooks/useDoubleSubmitGuard'
import { api, apiErrorMessage } from '../lib/api'

interface RowResult {
  row: number
  status: 'success' | 'error'
  errors: string[]
  product_id?: number
  variant_id?: number
}

interface ImageSummary {
  product_images_found: string[]
  product_images_missing: string[]
  variant_images_found: string[]
  variant_images_missing: string[]
}

interface ImportResult {
  total_rows: number
  successful_rows: number
  failed_rows: number
  results: RowResult[]
  errors: { row: number; reason: string }[]
  image_summary: ImageSummary
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export const EXCEL_HEADERS = [
  { name: 'Product Name', required: true, desc: 'Title of product' },
  { name: 'Product Code', required: false, desc: 'Grouping code for variants' },
  { name: 'Category', required: true, desc: 'Main category name' },
  { name: 'Subcategory', required: false, desc: 'Subcategory name' },
  { name: 'Brand', required: false, desc: 'Brand name' },
  { name: 'Description', required: false, desc: 'Long product details' },
  { name: 'Short Description', required: false, desc: 'Short subtitle' },
  { name: 'Material', required: false, desc: 'Material/Composition' },
  { name: 'Unit', required: false, desc: 'e.g. PCS, KG, PACK, GM' },
  { name: 'HSN Code', required: false, desc: 'HSN code for tax' },
  { name: 'Tax', required: false, desc: 'GST rate (e.g. 5%, 12%, 18%)' },
  { name: 'Tax Type', required: false, desc: 'INCLUSIVE or EXCLUSIVE' },
  { name: 'Manufacturer', required: false, desc: 'Manufacturer name' },
  { name: 'Manufacturing Date', required: false, desc: 'MM/YYYY or YYYY-MM-DD' },
  { name: 'Expiry Date', required: false, desc: 'MM/YYYY or YYYY-MM-DD' },
  { name: 'Return Eligible', required: false, desc: 'YES or NO' },
  { name: 'Return Window (Days)', required: false, desc: 'e.g. 7' },
  { name: 'Product Image Path', required: false, desc: 'Image URLs or ZIP filenames' },
  { name: 'Variant SKU', required: false, desc: 'Unique SKU for this variant' },
  { name: 'Variant Barcode', required: false, desc: 'Barcode / EAN code' },
  { name: 'Variant Description', required: false, desc: 'e.g. 500g Pack, Blue 32' },
  { name: 'Size', required: false, desc: 'e.g. 500g, XL, 1L' },
  { name: 'Color', required: false, desc: 'Color variant' },
  { name: 'MRP', required: true, desc: 'Maximum Retail Price' },
  { name: 'Selling Price', required: false, desc: 'Storefront selling price' },
  { name: 'Variant Cost Price', required: false, desc: 'Purchase/cost price' },
  { name: 'Opening Stock', required: false, desc: 'Starting quantity' },
  { name: 'Low Stock Threshold', required: false, desc: 'Alert threshold' },
  { name: 'Variant Image Path', required: false, desc: 'Variant image URLs or ZIP filenames' },
  { name: 'Status', required: false, desc: 'ACTIVE or INACTIVE' },
] as const

/**
 * Product Create Excel Import/Export (section 39/12 of
 * ECOMMERCE_POS_ADMIN_SPEC.md). The backend contract already existed
 * (ProductImportService/ProductExportService) but had no admin UI at
 * all — this panel is that UI: download the sample template, export the
 * catalog, and the upload → preview → confirm → result workflow for
 * import. Preview and Confirm both call the backend with the identical
 * file + flags, so they can never disagree about which rows are valid —
 * only Confirm persists.
 */
export function ProductImportExportPanel({ onImported }: { onImported: () => void }) {
  const { toasts, push, dismiss } = useToasts()
  const [modalOpen, setModalOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [imagesZip, setImagesZip] = useState<File | null>(null)
  const [importName, setImportName] = useState('')
  const [autoCreate, setAutoCreate] = useState(false)
  const [updateExisting, setUpdateExisting] = useState(false)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [committedResult, setCommittedResult] = useState<ImportResult | null>(null)
  const [showHeaderDetails, setShowHeaderDetails] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imagesZipInputRef = useRef<HTMLInputElement | null>(null)

  function handleCopySingleHeader(name: string) {
    try {
      navigator.clipboard.writeText(name)
      push('success', `Copied header "${name}" to clipboard`)
    } catch {
      push('info', `Header: ${name}`)
    }
  }

  function handleCopyAllHeaders() {
    try {
      const allText = EXCEL_HEADERS.map((h) => h.name).join('\t')
      navigator.clipboard.writeText(allText)
      push('success', `Copied all ${EXCEL_HEADERS.length} column headers (tab-separated) for Excel paste!`)
    } catch {
      push('error', 'Could not copy headers to clipboard')
    }
  }

  const templateGuard = useDoubleSubmitGuard()
  const exportGuard = useDoubleSubmitGuard()
  const previewGuard = useDoubleSubmitGuard()
  const commitGuard = useDoubleSubmitGuard()
  const errorReportGuard = useDoubleSubmitGuard()

  function resetModal() {
    setFile(null)
    setImagesZip(null)
    setImportName('')
    setPreview(null)
    setCommittedResult(null)
    setAutoCreate(false)
    setUpdateExisting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (imagesZipInputRef.current) imagesZipInputRef.current.value = ''
  }

  function closeModal() {
    setModalOpen(false)
    resetModal()
  }

  async function handleDownloadTemplate() {
    try {
      const res = await api.get('/products/import/template', { responseType: 'blob' })
      downloadBlob(res.data, 'product-import-template.xlsx')
      push('success', 'Sample template downloaded successfully.')
    } catch (err) {
      push('error', apiErrorMessage(err))
    }
  }

  async function handleExport() {
    try {
      const res = await api.get('/products/export', { responseType: 'blob' })
      downloadBlob(res.data, 'products-export.xlsx')
      push('success', 'Export completed successfully.')
    } catch (err) {
      push('error', apiErrorMessage(err))
    }
  }

  // Bulk imports compress + upload every ZIP image to R2 - can take minutes.
  const IMPORT_TIMEOUT_MS = 30 * 60 * 1000

  function buildFormData() {
    const formData = new FormData()
    formData.append('file', file as File)
    formData.append('auto_create_masters', autoCreate ? '1' : '0')
    formData.append('update_existing', updateExisting ? '1' : '0')
    if (importName.trim()) formData.append('import_name', importName.trim())
    if (imagesZip) {
      formData.append('images_zip', imagesZip)
    }
    return formData
  }

  async function handlePreview() {
    if (!file) return
    try {
      const res = await api.post<ImportResult>('/products/import/preview', buildFormData(), { timeout: IMPORT_TIMEOUT_MS })
      setPreview(res.data)
      setCommittedResult(null)
      push('info', 'Validation completed. Please review the preview.')
    } catch (err) {
      setPreview(null)
      push('error', apiErrorMessage(err))
    }
  }

  async function handleConfirmImport() {
    if (!file || !preview) return
    try {
      const res = await api.post<ImportResult>('/products/import', buildFormData(), { timeout: IMPORT_TIMEOUT_MS })
      setCommittedResult(res.data)
      if (res.data.failed_rows === 0) {
        push('success', `Import completed: ${res.data.total_rows} products processed, ${res.data.successful_rows} successful, 0 failed.`)
      } else {
        push('error', `Import completed: ${res.data.total_rows} rows processed, ${res.data.successful_rows} successful, ${res.data.failed_rows} failed.`)
      }
      onImported()
    } catch (err) {
      push('error', apiErrorMessage(err))
    }
  }

  async function handleDownloadErrorReport() {
    if (!file) return
    try {
      const res = await api.post('/products/import/error-report', buildFormData(), { responseType: 'blob' })
      downloadBlob(res.data, 'product-import-errors.xlsx')
    } catch (err) {
      push('error', apiErrorMessage(err))
    }
  }

  const activeResult = committedResult ?? preview

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <Button variant="secondary" size="sm" disabled={templateGuard.submitting} onClick={templateGuard.guard(handleDownloadTemplate)}>
        {templateGuard.submitting ? 'Downloading…' : 'Download Sample Template'}
      </Button>
      <Button variant="secondary" size="sm" disabled={exportGuard.submitting} onClick={exportGuard.guard(handleExport)}>
        {exportGuard.submitting ? 'Exporting…' : 'Export Excel'}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setModalOpen(true)}>
        Import Excel
      </Button>

      {modalOpen && (
        <Modal title="Import Products from Excel" onClose={closeModal} width="2xl">
          <div className="space-y-4">
            {/* Dynamic Sticky Header of Excel Column Titles */}
            <div className="sticky -top-6 -mx-6 px-6 py-2.5 bg-white/95 backdrop-blur-md border-b border-slate-200 z-30 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-600 animate-pulse" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                    Excel Column Titles ({EXCEL_HEADERS.length} Total)
                  </span>
                  <span className="hidden sm:inline text-[10px] font-semibold text-slate-500">
                    · Sticks to top while scrolling for easy title matching
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAllHeaders}
                    className="text-[10px] font-bold text-cyan-800 bg-cyan-50 hover:bg-cyan-100 px-2.5 py-1 rounded-full border border-cyan-200 transition-colors cursor-pointer"
                    title="Copy all column headers to paste directly into Excel first row"
                  >
                    Copy All Titles (Excel Row)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHeaderDetails((prev) => !prev)}
                    className="text-[10px] font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    {showHeaderDetails ? 'Compact ▲' : 'Details ▼'}
                  </button>
                </div>
              </div>

              {/* Horizontally scrollable & wrap pill dock of all column titles with copy on click */}
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto no-scrollbar py-0.5">
                {EXCEL_HEADERS.map((h, idx) => (
                  <span
                    key={h.name}
                    onClick={() => handleCopySingleHeader(h.name)}
                    title={`Click to copy: "${h.name}" (${h.desc})`}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-semibold border transition-all cursor-pointer select-none active:scale-95 ${
                      h.required
                        ? 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100 hover:border-rose-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-[9px] font-mono text-slate-400 font-bold">{idx + 1}.</span>
                    <span className="font-bold">{h.name}</span>
                    {h.required && <span className="text-red-500 font-black" title="Required field">*</span>}
                    {showHeaderDetails && <span className="text-[9px] text-slate-400">({h.desc})</span>}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-800">Excel file (.xlsx)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setPreview(null)
                  setCommittedResult(null)
                }}
                className="block w-full text-xs text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-primary-strong)] file:px-4 file:py-2 file:text-xs file:font-bold file:text-white"
              />
              {file && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {file.name} · {(file.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-800">
                Product Images ZIP (Optional)
              </label>
              <p className="mb-1.5 text-[11px] text-slate-500">
                Upload a ZIP containing your product and variant images inside an images folder. The image filenames in
                Excel must match the filenames inside the ZIP.
              </p>
              <input
                ref={imagesZipInputRef}
                type="file"
                accept=".zip"
                onChange={(e) => {
                  setImagesZip(e.target.files?.[0] ?? null)
                  setPreview(null)
                  setCommittedResult(null)
                }}
                className="block w-full text-xs text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-xs file:font-bold file:text-white"
              />
              {imagesZip && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {imagesZip.name} · {(imagesZip.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-800">Import name (Optional)</label>
              <input
                type="text"
                value={importName}
                maxLength={190}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="e.g. Diwali stock batch — shown in Import History"
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 px-3.5 py-2 text-xs font-semibold text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-strong)]"
              />
            </div>

            <div className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border-muted)] bg-[var(--color-surface)]/40 p-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <input type="checkbox" checked={autoCreate} onChange={(e) => setAutoCreate(e.target.checked)} />
                Auto-create missing categories/brands/units/HSN/GST/attributes
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
                Update existing products/variants (otherwise a row whose SKU already exists is rejected)
              </label>
            </div>

            {activeResult && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-800">
                  <span>Total rows: {activeResult.total_rows}</span>
                  <span className="text-emerald-700">Success: {activeResult.successful_rows}</span>
                  <span className="text-rose-700">Failed: {activeResult.failed_rows}</span>
                  {committedResult && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Committed</span>}
                </div>

                {activeResult.image_summary && (
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--color-border-muted)] bg-[var(--color-surface)]/40 p-3 text-[11px]">
                    <div>
                      <p className="font-bold uppercase tracking-wider text-slate-600">Product images found</p>
                      <p className="text-emerald-700">{activeResult.image_summary.product_images_found.length}</p>
                      {activeResult.image_summary.product_images_found.length > 0 && (
                        <p className="text-slate-500 break-words">{activeResult.image_summary.product_images_found.join(', ')}</p>
                      )}
                    </div>
                    <div>
                      <p className="font-bold uppercase tracking-wider text-slate-600">Product images missing</p>
                      <p className={activeResult.image_summary.product_images_missing.length > 0 ? 'text-rose-700' : 'text-slate-500'}>
                        {activeResult.image_summary.product_images_missing.length}
                      </p>
                      {activeResult.image_summary.product_images_missing.length > 0 && (
                        <p className="text-rose-600 break-words">{activeResult.image_summary.product_images_missing.join(', ')}</p>
                      )}
                    </div>
                    <div>
                      <p className="font-bold uppercase tracking-wider text-slate-600">Variant images found</p>
                      <p className="text-emerald-700">{activeResult.image_summary.variant_images_found.length}</p>
                      {activeResult.image_summary.variant_images_found.length > 0 && (
                        <p className="text-slate-500 break-words">{activeResult.image_summary.variant_images_found.join(', ')}</p>
                      )}
                    </div>
                    <div>
                      <p className="font-bold uppercase tracking-wider text-slate-600">Variant images missing</p>
                      <p className={activeResult.image_summary.variant_images_missing.length > 0 ? 'text-rose-700' : 'text-slate-500'}>
                        {activeResult.image_summary.variant_images_missing.length}
                      </p>
                      {activeResult.image_summary.variant_images_missing.length > 0 && (
                        <p className="text-rose-600 break-words">{activeResult.image_summary.variant_images_missing.join(', ')}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="max-h-72 overflow-auto rounded-2xl border border-[var(--color-border-muted)]">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-[var(--color-surface)] font-bold uppercase tracking-wider text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border-muted)]">
                      {activeResult.results.map((r) => (
                        <tr key={r.row} className={r.status === 'error' ? 'bg-rose-50' : ''}>
                          <td className="px-3 py-1.5 font-mono">{r.row}</td>
                          <td className="px-3 py-1.5">
                            {r.status === 'error' ? (
                              <span className="font-bold text-rose-700">Error</span>
                            ) : (
                              <span className="font-bold text-emerald-700">OK</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-slate-700">
                            {r.status === 'error' ? r.errors[0] : `Product #${r.product_id}, Variant #${r.variant_id}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {activeResult && activeResult.failed_rows > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={errorReportGuard.submitting}
                  onClick={errorReportGuard.guard(handleDownloadErrorReport)}
                >
                  {errorReportGuard.submitting ? 'Preparing…' : 'Download Error Report'}
                </Button>
              )}
              {!committedResult && (
                <Button variant="secondary" size="sm" disabled={!file || previewGuard.submitting} onClick={previewGuard.guard(handlePreview)}>
                  {previewGuard.submitting ? 'Validating…' : 'Preview'}
                </Button>
              )}
              {!committedResult && (
                <Button
                  size="sm"
                  disabled={!preview || preview.successful_rows === 0 || commitGuard.submitting}
                  onClick={commitGuard.guard(handleConfirmImport)}
                >
                  {commitGuard.submitting ? 'Importing…' : 'Confirm Import'}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={closeModal}>
                {committedResult ? 'Close' : 'Cancel'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
