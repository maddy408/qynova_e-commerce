import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Badge, Button, Modal, Spinner, TextArea, TextField } from './ui'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { ToastStack, useToasts } from './ui/Toast'
import { api, apiErrorMessage, getApiOrigin } from '../lib/api'

interface ImportBatch {
  id: number
  name: string
  note: string | null
  excel_filename: string | null
  zip_filename: string | null
  zip_size_bytes: number | null
  total_rows: number
  successful_rows: number
  failed_rows: number
  created_by_name: string | null
  created_at: string
  updated_at: string
  image_count: number
  preview_image?: string | null
}

interface BatchImage {
  type: 'product' | 'variant'
  id: number
  product_id: number
  variant_id: number | null
  product_name: string
  sku: string | null
  source_filename: string | null
  image_path: string
  thumb_path: string | null
  is_primary: boolean
}

type BatchDetail = ImportBatch & { images: BatchImage[] }

// ZIP replace / delete compress + upload to R2, which can take minutes.
const LONG_TIMEOUT_MS = 30 * 60 * 1000

function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${getApiOrigin()}/${path.replace(/^\/+/, '')}`
}

function formatDate(value: string) {
  const d = new Date(value.replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
}

/**
 * Import History — recent Excel / images-ZIP imports. Edit = rename / note,
 * replace the whole ZIP, or replace / remove single images. Delete = remove
 * every image that import added (products themselves stay).
 */
export function ImportHistoryPanel({ onChanged }: { onChanged?: () => void }) {
  const { toasts, push, dismiss } = useToasts()
  const [open, setOpen] = useState(false)
  const [batches, setBatches] = useState<ImportBatch[] | null>(null)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<ImportBatch | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await api.get<{ data: ImportBatch[] }>('/product-imports')
      setBatches(res.data.data)
    } catch (err) {
      setError(apiErrorMessage(err))
      setBatches([])
    }
  }, [])

  useEffect(() => {
    if (open) {
      setBatches(null)
      void load()
    }
  }, [open, load])

  async function confirmDelete() {
    if (!deleting) return
    const res = await api.delete<{ deleted_images: number }>(`/product-imports/${deleting.id}`, { timeout: LONG_TIMEOUT_MS })
    push('success', `Deleted ${res.data.deleted_images} image(s) from "${deleting.name}".`)
    setDeleting(null)
    await load()
    onChanged?.()
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Import History
      </Button>

      {open && editingId === null && (
        <Modal title="Import History" onClose={() => setOpen(false)} width="xl">
          {error && <Alert>{error}</Alert>}
          {batches === null ? (
            <Spinner />
          ) : batches.length === 0 ? (
            <p className="py-10 text-center text-xs font-semibold text-slate-500">No imports yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-muted)]">
              {batches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-surface)]">
                    {imageUrl(b.preview_image) && <img src={imageUrl(b.preview_image)!} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-950">{b.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {formatDate(b.created_at)}
                      {b.created_by_name && <> · {b.created_by_name}</>}
                      {b.zip_filename && <> · {b.zip_filename} {formatSize(b.zip_size_bytes)}</>}
                    </p>
                    {b.note && <p className="mt-0.5 truncate text-[11px] italic text-slate-600">{b.note}</p>}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone="teal">{b.image_count} images</Badge>
                      <Badge tone="green">{b.successful_rows} rows ok</Badge>
                      {b.failed_rows > 0 && <Badge tone="red">{b.failed_rows} failed</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditingId(b.id)}>
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setDeleting(b)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {open && editingId !== null && (
        <ImportBatchEditor
          id={editingId}
          onClose={() => {
            setEditingId(null)
            void load()
          }}
          onChanged={() => onChanged?.()}
          notify={push}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete import images?"
        message={
          <>
            This deletes all <b>{deleting?.image_count ?? 0}</b> image(s) added by <b>{deleting?.name}</b> from the products and
            from cloud storage, and removes it from the history. The products themselves are kept. This cannot be undone.
          </>
        }
        confirmLabel="Delete images"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}

function ImportBatchEditor({
  id,
  onClose,
  onChanged,
  notify,
}: {
  id: number
  onClose: () => void
  onChanged: () => void
  notify: (tone: 'success' | 'error' | 'info', message: string) => void
}) {
  const [batch, setBatch] = useState<BatchDetail | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [zip, setZip] = useState<File | null>(null)
  const [replacingZip, setReplacingZip] = useState(false)
  const [zipResult, setZipResult] = useState<{ replaced: string[]; not_in_zip: string[] } | null>(null)
  const [busyImage, setBusyImage] = useState<string | null>(null)
  const [removing, setRemoving] = useState<BatchImage | null>(null)
  const zipInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const replaceTarget = useRef<BatchImage | null>(null)

  const apply = useCallback((data: BatchDetail) => {
    setBatch(data)
    setName(data.name)
    setNote(data.note ?? '')
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await api.get<BatchDetail>(`/product-imports/${id}`)
      apply(res.data)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }, [id, apply])

  useEffect(() => {
    void load()
  }, [load])

  async function saveDetails() {
    setSaving(true)
    try {
      const res = await api.patch<BatchDetail>(`/product-imports/${id}`, { name, note })
      apply(res.data)
      notify('success', 'Import details saved.')
    } catch (err) {
      notify('error', apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function replaceZip() {
    if (!zip) return
    setReplacingZip(true)
    setZipResult(null)
    try {
      const form = new FormData()
      form.append('images_zip', zip)
      const res = await api.post<{ replaced: string[]; not_in_zip: string[]; import: BatchDetail }>(`/product-imports/${id}/zip`, form, {
        timeout: LONG_TIMEOUT_MS,
      })
      apply(res.data.import)
      setZipResult({ replaced: res.data.replaced, not_in_zip: res.data.not_in_zip })
      setZip(null)
      if (zipInputRef.current) zipInputRef.current.value = ''
      notify('success', `Replaced ${res.data.replaced.length} image file(s) from the new ZIP.`)
      onChanged()
    } catch (err) {
      notify('error', apiErrorMessage(err))
    } finally {
      setReplacingZip(false)
    }
  }

  function pickReplacement(img: BatchImage) {
    replaceTarget.current = img
    imageInputRef.current?.click()
  }

  async function uploadReplacement(file: File | undefined) {
    const img = replaceTarget.current
    if (imageInputRef.current) imageInputRef.current.value = ''
    if (!file || !img) return
    const key = `${img.type}-${img.id}`
    setBusyImage(key)
    try {
      const form = new FormData()
      form.append('file', file)
      await api.post(`/product-imports/${id}/images/${img.type}/${img.id}`, form, { timeout: 120000 })
      await load()
      notify('success', `Image replaced for ${img.product_name}.`)
      onChanged()
    } catch (err) {
      notify('error', apiErrorMessage(err))
    } finally {
      setBusyImage(null)
    }
  }

  async function confirmRemove() {
    if (!removing) return
    await api.delete(`/product-imports/${id}/images/${removing.type}/${removing.id}`)
    setRemoving(null)
    await load()
    notify('success', 'Image removed.')
    onChanged()
  }

  return (
    <Modal title={batch ? `Edit import: ${batch.name}` : 'Edit import'} onClose={onClose} width="2xl">
      {error && <Alert>{error}</Alert>}
      {!batch ? (
        !error && <Spinner />
      ) : (
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <TextField label="Import name" value={name} onChange={(e) => setName(e.target.value)} maxLength={190} />
            <div className="text-[11px] text-slate-600 sm:pt-5">
              {formatDate(batch.created_at)}
              {batch.created_by_name && <> · by {batch.created_by_name}</>}
              <br />
              Excel: {batch.excel_filename || '—'} · ZIP: {batch.zip_filename || '—'} {formatSize(batch.zip_size_bytes)}
            </div>
            <div className="sm:col-span-2">
              <TextArea label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Diwali stock batch" />
            </div>
            <div className="sm:col-span-2">
              <Button size="sm" onClick={saveDetails} disabled={saving || name.trim() === ''}>
                {saving ? 'Saving…' : 'Save name & note'}
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border-muted)] bg-[var(--color-surface)]/40 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-800">Replace ZIP</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Upload a corrected ZIP. Each image is matched by the same file name used in the Excel and replaced; images not in the new ZIP
              stay as they are.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                onChange={(e) => setZip(e.target.files?.[0] ?? null)}
                className="block text-xs text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-xs file:font-bold file:text-white"
              />
              <Button size="sm" onClick={replaceZip} disabled={!zip || replacingZip}>
                {replacingZip ? 'Uploading & compressing…' : 'Replace images'}
              </Button>
            </div>
            {zipResult && (
              <p className="mt-2 text-[11px] text-slate-700">
                Replaced: {zipResult.replaced.length}
                {zipResult.not_in_zip.length > 0 && (
                  <span className="text-amber-700"> · Not in new ZIP (kept): {zipResult.not_in_zip.join(', ')}</span>
                )}
              </p>
            )}
          </section>

          <section>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-800">Images in this import ({batch.images.length})</p>
            {batch.images.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">This import has no images left.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {batch.images.map((img) => {
                  const key = `${img.type}-${img.id}`
                  const src = imageUrl(img.thumb_path || img.image_path)
                  return (
                    <div key={key} className="overflow-hidden rounded-2xl border border-[var(--color-border-muted)] bg-white">
                      <div className="relative aspect-square bg-[var(--color-surface)]">
                        {src && <img src={src} alt={img.product_name} className="h-full w-full object-contain" loading="lazy" />}
                        {busyImage === key && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[11px] font-bold">Uploading…</div>
                        )}
                        {img.is_primary && (
                          <span className="absolute left-2 top-2">
                            <Badge tone="teal">Main</Badge>
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5 p-2">
                        <p className="truncate text-[11px] font-bold text-slate-950" title={img.product_name}>
                          {img.product_name}
                        </p>
                        <p className="truncate text-[10px] text-slate-500" title={img.source_filename ?? ''}>
                          {img.type === 'variant' ? `Variant ${img.sku ?? ''} · ` : ''}
                          {img.source_filename}
                        </p>
                        <div className="flex gap-1.5 pt-1">
                          <Button variant="secondary" size="sm" className="flex-1 !px-2" disabled={busyImage !== null} onClick={() => pickReplacement(img)}>
                            Replace
                          </Button>
                          <Button variant="ghost" size="sm" className="!px-2 text-rose-700" disabled={busyImage !== null} onClick={() => setRemoving(img)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void uploadReplacement(e.target.files?.[0])}
            />
          </section>

          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Back to history
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove image?"
        message={<>Remove this image from <b>{removing?.product_name}</b>? It will also be deleted from cloud storage.</>}
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </Modal>
  )
}
