import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Modal, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import { STOCK_STATUS_LABEL, STOCK_STATUS_TONE, stockStatus } from '../lib/stock'
import type { ProductDetail, ProductVariant, VariantAttribute } from '../lib/types'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '')

function imageUrl(path: string) {
  return `${API_ORIGIN}/${path}`
}

function skuAbbr(value: string) {
  const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return (clean || 'VAL').slice(0, 3)
}

function cartesianProduct<T>(groups: T[][]): T[][] {
  return groups.reduce<T[][]>((acc, group) => acc.flatMap((combo) => group.map((value) => [...combo, value])), [[]])
}

interface NewVariantRow {
  key: string
  valueIds: number[]
  title: string
  sku: string
  openingStock: string
  lowStockThreshold: string
  image: { file: File; previewUrl: string } | null
}

export function ProductDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [attributes, setAttributes] = useState<VariantAttribute[]>([])
  const [error, setError] = useState('')
  const [managingVariant, setManagingVariant] = useState<ProductVariant | null>(null)

  const load = useCallback(() => {
    api.get(`/products/${id}`).then((res) => setProduct(res.data.product))
  }, [id])

  useEffect(() => {
    load()
    api.get('/variant-attributes').then((res) => setAttributes(res.data.attributes))
  }, [load])

  if (product === null) {
    return <Spinner />
  }

  const isVariable = product.variants.length > 1 || product.variants.some((v) => v.attribute_values.length > 0)

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <button onClick={() => navigate('/products')} className="text-xs font-medium text-slate-400 hover:text-slate-700">
            ← Products
          </button>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">{product.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {product.product_code && <span className="mr-2">{product.product_code}</span>}
            <Badge tone={product.is_active ? 'green' : 'slate'}>{product.is_active ? 'Active' : 'Inactive'}</Badge>
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="space-y-6">
        <ProductImagesSection product={product} onError={setError} onChange={load} />

        {isVariable ? (
          <VariantsSection
            product={product}
            attributes={attributes}
            onError={setError}
            onChange={load}
            onManageImages={setManagingVariant}
          />
        ) : (
          <SimpleVariantSection product={product} onError={setError} onChange={load} />
        )}

        <SpecificationsSection product={product} onError={setError} onChange={load} />
      </div>

      {managingVariant && (
        <VariantImageModal variant={managingVariant} onClose={() => setManagingVariant(null)} onChange={load} onError={setError} />
      )}
    </div>
  )
}

function ProductImagesSection({
  product,
  onError,
  onChange,
}: {
  product: ProductDetail
  onError: (msg: string) => void
  onChange: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    onError('');
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/products/${product.id}/images`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      onChange();
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not upload image'));
    } finally {
      setUploading(false);
    }
  }

  async function setPrimary(imageId: number) {
    await api.patch(`/products/${product.id}/images/${imageId}/primary`);
    onChange();
  }

  async function remove(imageId: number) {
    await api.delete(`/products/${product.id}/images/${imageId}`);
    onChange();
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Product Images</h2>
      <p className="mb-4 text-xs text-slate-500">
        {product.variants.length > 1
          ? 'Generic/common images — color or size-specific images belong on each variant below.'
          : 'Shown on product cards, search results and the storefront.'}
      </p>
      <div className="flex flex-wrap gap-3">
        {product.images.map((img) => (
          <div key={img.id} className="group relative h-24 w-24 overflow-hidden rounded-lg border border-slate-200">
            <img src={imageUrl(img.thumb_path ?? img.image_path)} alt="" className="h-full w-full object-cover" />
            {img.is_primary === 1 && (
              <span className="absolute left-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                PRIMARY
              </span>
            )}
            <div className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/50 group-hover:flex">
              {img.is_primary !== 1 && (
                <button
                  onClick={() => setPrimary(img.id)}
                  title="Set primary"
                  className="rounded bg-white/90 px-1.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-white"
                >
                  ★
                </button>
              )}
              <button
                onClick={() => remove(img.id)}
                title="Delete"
                className="rounded bg-white/90 px-1.5 py-1 text-[10px] font-medium text-red-600 hover:bg-white"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void upload(e.dataTransfer.files);
          }}
          disabled={uploading}
          className={`flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs font-medium text-slate-400 hover:border-indigo-400 hover:text-indigo-500 ${
            dragOver ? 'border-indigo-400 bg-indigo-50 text-indigo-500' : 'border-slate-300'
          }`}
        >
          {uploading ? '…' : <>+<br />Add</>}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
    </Card>
  )
}

function SimpleVariantSection({
  product,
  onError,
  onChange,
}: {
  product: ProductDetail
  onError: (msg: string) => void
  onChange: () => void
}) {
  const variant = product.variants[0];
  const [sku, setSku] = useState(variant?.sku ?? '');
  const [mrp, setMrp] = useState(variant?.mrp ?? '');
  const [retailPrice, setRetailPrice] = useState(variant?.retail_price ?? '');
  const [lowStockThreshold, setLowStockThreshold] = useState(variant?.low_stock_threshold ?? '5');
  const [saving, setSaving] = useState(false);

  if (!variant) {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-500">No variant yet — this shouldn't happen for a saved product.</p>
      </Card>
    );
  }

  const status = stockStatus(variant.available, variant.low_stock_threshold);

  async function save() {
    setSaving(true);
    onError('');
    try {
      await api.put(`/variants/${variant.id}`, { sku, mrp, retail_price: retailPrice });
      if (lowStockThreshold.trim() !== '' && lowStockThreshold !== variant.low_stock_threshold) {
        await api.put(`/inventory/${variant.id}/threshold`, { low_stock_threshold: Number(lowStockThreshold) });
      }
      onChange();
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not update pricing'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Pricing &amp; Inventory</h2>
        <Badge tone={STOCK_STATUS_TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>
      </div>
      <div className="grid grid-cols-5 gap-4">
        <TextField label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
        <TextField label="MRP" type="number" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} />
        <TextField label="Selling Price" type="number" step="0.01" value={retailPrice} onChange={(e) => setRetailPrice(e.target.value)} />
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Stock on hand</span>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{variant.on_hand ?? '0'}</p>
        </div>
        <TextField
          label="Low Stock Alert"
          type="number"
          min="0"
          step="1"
          value={lowStockThreshold}
          onChange={(e) => setLowStockThreshold(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </Card>
  );
}

function VariantsSection({
  product,
  attributes,
  onError,
  onChange,
  onManageImages,
}: {
  product: ProductDetail
  attributes: VariantAttribute[]
  onError: (msg: string) => void
  onChange: () => void
  onManageImages: (variant: ProductVariant) => void
}) {
  const [selectedValueIds, setSelectedValueIds] = useState<number[]>([]);
  const [newRows, setNewRows] = useState<NewVariantRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Record<number, { mrp: string; retail_price: string }>>({});
  const [editingThreshold, setEditingThreshold] = useState<Record<number, string>>({});
  const [addingValueForAttr, setAddingValueForAttr] = useState<number | null>(null);
  const [newValueInput, setNewValueInput] = useState('');
  const [newValueHexInput, setNewValueHexInput] = useState('');
  const [savingNewValue, setSavingNewValue] = useState(false);

  async function handleAddCustomAttributeValue(attributeId: number) {
    if (!newValueInput.trim()) return;
    setSavingNewValue(true);
    try {
      const res = await api.post(`/variant-attributes/${attributeId}/values`, {
        value: newValueInput.trim(),
        color_hex: newValueHexInput.trim() || null,
      });
      const newId = res.data.id;
      // Trigger outer refresh to update attributes list from server
      onChange();
      setSelectedValueIds((prev) => [...prev, newId]);
      setNewValueInput('');
      setNewValueHexInput('');
      setAddingValueForAttr(null);
    } catch (err) {
      onError(apiErrorMessage(err, 'Failed to add custom attribute value'));
    } finally {
      setSavingNewValue(false);
    }
  }

  const valueLookup = useMemo(() => {
    const map = new Map<number, { value: string; colorHex: string | null }>();
    for (const attribute of attributes) {
      for (const value of attribute.values) {
        map.set(value.id, { value: value.value, colorHex: value.color_hex });
      }
    }
    return map;
  }, [attributes]);

  const existingCombinations = useMemo(() => {
    const set = new Set<string>();
    for (const v of product.variants) {
      set.add(
        v.attribute_values
          .map((a) => a.value_id)
          .sort((a, b) => a - b)
          .join('-'),
      );
    }
    return set;
  }, [product.variants]);

  function toggleValue(valueId: number) {
    setSelectedValueIds((prev) => (prev.includes(valueId) ? prev.filter((v) => v !== valueId) : [...prev, valueId]));
  }

  // Recomputes the staged new-variant rows whenever the attribute-value
  // selection changes — same per-row SKU/image/opening-stock/low-stock
  // treatment as Product Create, skipping combinations that already
  // exist on this product.
  useEffect(() => {
    const groups = attributes
      .map((attribute) => attribute.values.map((v) => v.id).filter((id) => selectedValueIds.includes(id)))
      .filter((group) => group.length > 0);

    if (groups.length === 0) {
      setNewRows([]);
      return;
    }

    const combinations = cartesianProduct(groups).filter((valueIds) => {
      const key = [...valueIds].sort((a, b) => a - b).join('-');
      return !existingCombinations.has(key);
    });
    const baseSku = (product.product_code || product.name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'PROD');

    setNewRows((prev) => {
      const byKey = new Map(prev.map((row) => [row.key, row]));
      return combinations.map((valueIds) => {
        const key = valueIds.join('-');
        const existing = byKey.get(key);
        if (existing) return existing;

        const labels = valueIds.map((id) => valueLookup.get(id)?.value ?? '?');
        return {
          key,
          valueIds,
          title: labels.join(' / '),
          sku: `${baseSku}-${valueIds.map((id) => skuAbbr(valueLookup.get(id)?.value ?? '')).join('-')}`,
          openingStock: '',
          lowStockThreshold: '',
          image: null,
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedValueIds, attributes, existingCombinations]);

  function updateRow(key: string, patch: Partial<NewVariantRow>) {
    setNewRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function setRowImage(key: string, file: File | undefined) {
    if (!file) return;
    updateRow(key, { image: { file, previewUrl: URL.createObjectURL(file) } });
  }

  async function createVariants() {
    if (newRows.length === 0) return;
    const emptySku = newRows.find((r) => r.sku.trim() === '');
    if (emptySku) {
      onError(`SKU is required for every variant (missing on "${emptySku.title}")`);
      return;
    }

    setCreating(true);
    onError('');
    try {
      for (const row of newRows) {
        const variantRes = await api.post(`/products/${product.id}/variants`, {
          sku: row.sku.trim(),
          mrp: 0,
          retail_price: 0,
          attribute_value_ids: row.valueIds,
        });
        const variantId = variantRes.data.id;

        if (row.image) {
          const formData = new FormData();
          formData.append('file', row.image.file);
          formData.append('is_primary', '1');
          await api.post(`/variants/${variantId}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        }

        const stock = row.openingStock.trim();
        if (stock !== '' && Number(stock) > 0) {
          await api.post('/inventory/adjustments', { reason: 'Opening stock', items: [{ variant_id: variantId, counted_qty: stock }] });
        }

        if (row.lowStockThreshold.trim() !== '') {
          await api.put(`/inventory/${variantId}/threshold`, { low_stock_threshold: Number(row.lowStockThreshold) });
        }
      }
      setSelectedValueIds([]);
      setNewRows([]);
      onChange();
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not create variants'));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(v: ProductVariant) {
    setEditing((prev) => ({ ...prev, [v.id]: { mrp: v.mrp, retail_price: v.retail_price } }));
  }

  async function saveEdit(variantId: number) {
    const values = editing[variantId];
    if (!values) return;
    await api.put(`/variants/${variantId}`, values);
    setEditing((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    onChange();
  }

  async function saveThreshold(variantId: number) {
    const value = editingThreshold[variantId];
    if (value === undefined || value.trim() === '') return;
    await api.put(`/inventory/${variantId}/threshold`, { low_stock_threshold: Number(value) });
    setEditingThreshold((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    onChange();
  }

  async function toggleVariantActive(v: ProductVariant) {
    await api.put(`/variants/${v.id}`, { status: v.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
    onChange();
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Variants</h2>
        <p className="text-xs text-slate-500">
          Every variant is its own sellable SKU — pick attribute values to stage new combinations, each with its own image,
          opening stock and low-stock alert.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/30 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Add New Variant Combinations</h3>
        {attributes.map((attr) => {
          const selectedForAttr = attr.values.filter((v) => selectedValueIds.includes(v.id))
          const unselectedForAttr = attr.values.filter((v) => !selectedValueIds.includes(v.id))
          const isAddingValue = addingValueForAttr === attr.id

          return (
            <div key={attr.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs transition hover:border-slate-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    {attr.name}
                  </label>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {selectedForAttr.length} selected
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAddingValueForAttr(isAddingValue ? null : attr.id)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  {isAddingValue ? 'Cancel' : `+ Add Custom ${attr.name}`}
                </button>
              </div>

              {/* Dropdown Selector for Colors / Attributes */}
              <div className="flex gap-2">
                <select
                  value=""
                  onChange={(e) => {
                    const valId = Number(e.target.value)
                    if (valId && !selectedValueIds.includes(valId)) {
                      toggleValue(valId)
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Select a {attr.name} ({unselectedForAttr.length} available)…</option>
                  {unselectedForAttr.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.value} {v.color_hex ? `(${v.color_hex})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Inline Form to Add New Custom Value */}
              {isAddingValue && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 p-2.5">
                  <input
                    type="text"
                    placeholder={`New ${attr.name} value (e.g. ${attr.name === 'Color' ? 'Lime Green' : attr.name === 'Weight' ? '500g' : 'Value'})`}
                    value={newValueInput}
                    onChange={(e) => setNewValueInput(e.target.value)}
                    className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {attr.name.toLowerCase() === 'color' && (
                    <input
                      type="color"
                      title="Pick Color Hex"
                      value={newValueHexInput || '#3b82f6'}
                      onChange={(e) => setNewValueHexInput(e.target.value)}
                      className="h-7 w-9 cursor-pointer rounded border border-slate-300 p-0.5"
                    />
                  )}
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingNewValue || !newValueInput.trim()}
                    onClick={() => handleAddCustomAttributeValue(attr.id)}
                  >
                    {savingNewValue ? 'Adding…' : 'Save & Select'}
                  </Button>
                </div>
              )}

              {/* Selected Chips */}
              {selectedForAttr.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedForAttr.map((value) => (
                    <span
                      key={value.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1 text-xs font-semibold text-indigo-900 shadow-2xs transition hover:bg-indigo-100"
                    >
                      {value.color_hex && (
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-black/10 shadow-2xs"
                          style={{ backgroundColor: value.color_hex }}
                        />
                      )}
                      {value.value}
                      <button
                        type="button"
                        onClick={() => toggleValue(value.id)}
                        className="ml-1 text-indigo-400 hover:text-red-600 font-bold text-xs"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {newRows.length > 0 && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                Staged Variants ({newRows.length} combination{newRows.length === 1 ? '' : 's'})
              </h3>
              <span className="text-[11px] font-medium text-slate-500">Attach images and initial stock before creating</span>
            </div>
            {newRows.map((row, index) => (
              <div key={row.key} className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">
                    Variant {index + 1}: <span className="text-indigo-700">{row.title}</span>
                  </p>
                </div>

                <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Variant Image</label>
                    <label className="group relative flex h-16 w-16 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-indigo-300 bg-white hover:border-indigo-500 hover:bg-indigo-50/50 transition">
                      {row.image ? (
                        <>
                          <img src={row.image.previewUrl} alt="" className="h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                            <span className="text-[10px] font-bold text-white">Change</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-1">
                          <span className="block text-indigo-600 text-xs font-bold">+ Image</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => setRowImage(row.key, e.target.files?.[0])}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">SKU <span className="text-red-500">*</span></label>
                      <input
                        value={row.sku}
                        onChange={(e) => updateRow(row.key, { sku: e.target.value })}
                        placeholder="SKU"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Opening Stock</label>
                      <input
                        value={row.openingStock}
                        onChange={(e) => updateRow(row.key, { openingStock: e.target.value })}
                        type="number"
                        min="0"
                        placeholder="Qty e.g. 10"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Low Stock Alert</label>
                      <input
                        value={row.lowStockThreshold}
                        onChange={(e) => updateRow(row.key, { lowStockThreshold: e.target.value })}
                        type="number"
                        min="0"
                        placeholder="Threshold e.g. 5"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Button size="sm" onClick={createVariants} disabled={creating}>
                {creating ? 'Creating Variants & Uploading Images…' : `Create ${newRows.length} Variant${newRows.length === 1 ? '' : 's'} With Images`}
              </Button>
            </div>
          </div>
        )}
      </div>

      {product.variants.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
              <tr>
                <th className="py-3 px-3">Variant</th>
                <th className="py-3 px-3">SKU</th>
                <th className="py-3 px-3">MRP</th>
                <th className="py-3 px-3">Price</th>
                <th className="py-3 px-3">Stock</th>
                <th className="py-3 px-3">Low Stock Alert</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Images</th>
                <th className="py-3 px-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E0E3]">
              {product.variants.map((v) => {
                const label = v.attribute_values.map((a) => a.value).join(' / ') || '—';
                const editValues = editing[v.id];
                const status = stockStatus(v.available, v.low_stock_threshold);
                const thresholdEditing = editingThreshold[v.id];
                return (
                  <tr key={v.id} className={v.status === 'INACTIVE' ? 'opacity-50' : ''}>
                    <td className="py-2 pr-3 font-medium text-slate-900">{label}</td>
                    <td className="py-2 pr-3 text-slate-600">{v.sku}</td>
                    <td className="py-2 pr-3">
                      {editValues ? (
                        <input
                          value={editValues.mrp}
                          onChange={(e) => setEditing((prev) => ({ ...prev, [v.id]: { ...prev[v.id], mrp: e.target.value } }))}
                          className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
                        />
                      ) : (
                        `₹${v.mrp}`
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {editValues ? (
                        <input
                          value={editValues.retail_price}
                          onChange={(e) =>
                            setEditing((prev) => ({ ...prev, [v.id]: { ...prev[v.id], retail_price: e.target.value } }))
                          }
                          className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
                        />
                      ) : (
                        `₹${v.retail_price}`
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{v.on_hand ?? '0'}</td>
                    <td className="py-2 pr-3">
                      <input
                        value={thresholdEditing ?? v.low_stock_threshold ?? '5'}
                        onChange={(e) => setEditingThreshold((prev) => ({ ...prev, [v.id]: e.target.value }))}
                        onBlur={() => saveThreshold(v.id)}
                        type="number"
                        min="0"
                        className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={STOCK_STATUS_TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex -space-x-2">
                        {v.images.slice(0, 3).map((img) => (
                          <img
                            key={img.id}
                            src={imageUrl(img.thumb_path ?? img.image_path)}
                            alt=""
                            className="h-7 w-7 rounded-full border-2 border-white object-cover"
                          />
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <div className="flex justify-end gap-2">
                        {editValues ? (
                          <button onClick={() => saveEdit(v.id)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                            Save
                          </button>
                        ) : (
                          <button onClick={() => startEdit(v)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                            Edit
                          </button>
                        )}
                        <button onClick={() => onManageImages(v)} className="text-xs font-medium text-slate-500 hover:text-slate-800">
                          Manage Images
                        </button>
                        <button onClick={() => toggleVariantActive(v)} className="text-xs font-medium text-slate-500 hover:text-slate-800">
                          {v.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function VariantImageModal({
  variant,
  onClose,
  onChange,
  onError,
}: {
  variant: ProductVariant
  onClose: () => void
  onChange: () => void
  onError: (msg: string) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const label = variant.attribute_values.map((a) => a.value).join(' / ') || variant.sku;

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/variants/${variant.id}/images`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      onChange();
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not upload image'));
    } finally {
      setUploading(false);
    }
  }

  async function setPrimary(imageId: number) {
    await api.patch(`/variants/${variant.id}/images/${imageId}/primary`);
    onChange();
  }

  async function remove(imageId: number) {
    await api.delete(`/variants/${variant.id}/images/${imageId}`);
    onChange();
  }

  return (
    <Modal title={`${label} — Images`} onClose={onClose} width="lg">
      <p className="mb-3 text-xs text-slate-500">
        These images are shown only when a customer selects this exact variant — never mixed with another variant's gallery.
      </p>
      <div className="flex flex-wrap gap-3">
        {variant.images.map((img) => (
          <div key={img.id} className="group relative h-28 w-28 overflow-hidden rounded-lg border border-slate-200">
            <img src={imageUrl(img.thumb_path ?? img.image_path)} alt="" className="h-full w-full object-cover" />
            {img.is_primary === 1 && (
              <span className="absolute left-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                PRIMARY
              </span>
            )}
            <div className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/50 group-hover:flex">
              {img.is_primary !== 1 && (
                <button
                  onClick={() => setPrimary(img.id)}
                  className="rounded bg-white/90 px-1.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-white"
                >
                  ★
                </button>
              )}
              <button
                onClick={() => remove(img.id)}
                className="rounded bg-white/90 px-1.5 py-1 text-[10px] font-medium text-red-600 hover:bg-white"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs font-medium text-slate-400 hover:border-indigo-400 hover:text-indigo-500"
        >
          {uploading ? '…' : <>+<br />Add</>}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
    </Modal>
  );
}

function SpecificationsSection({
  product,
  onError,
  onChange,
}: {
  product: ProductDetail
  onError: (msg: string) => void
  onChange: () => void
}) {
  const [rows, setRows] = useState(product.specifications.map((s) => ({ name: s.name, value: s.value })));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(product.specifications.map((s) => ({ name: s.name, value: s.value })));
  }, [product.specifications]);

  function update(index: number, field: 'name' | 'value', value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }
  function add() {
    setRows((prev) => [...prev, { name: '', value: '' }]);
  }
  function remove(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    onError('');
    try {
      const valid = rows.filter((r) => r.name.trim() !== '' && r.value.trim() !== '');
      await api.put(`/products/${product.id}/specifications`, { specifications: valid });
      onChange();
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not save specifications'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-sm font-semibold text-slate-900">Specifications</h2>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={row.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              placeholder="Name (e.g. Material)"
              className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={row.value}
              onChange={(e) => update(i, 'value', e.target.value)}
              placeholder="Value (e.g. Plastic)"
              className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
              ✕
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={add}>
            + Add Specification
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Specifications'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
