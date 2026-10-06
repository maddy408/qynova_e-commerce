import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Modal, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { ProductDetail, ProductVariant, VariantAttribute } from '../lib/types'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '')

function imageUrl(path: string) {
  return `${API_ORIGIN}/${path}`
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
  const [saving, setSaving] = useState(false);

  if (!variant) {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-500">No variant yet — this shouldn't happen for a saved product.</p>
      </Card>
    );
  }

  async function save() {
    setSaving(true);
    onError('');
    try {
      await api.put(`/variants/${variant.id}`, { sku, mrp, retail_price: retailPrice });
      onChange();
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not update pricing'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-sm font-semibold text-slate-900">Pricing &amp; Inventory</h2>
      <div className="grid grid-cols-4 gap-4">
        <TextField label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
        <TextField label="MRP" type="number" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} />
        <TextField label="Selling Price" type="number" step="0.01" value={retailPrice} onChange={(e) => setRetailPrice(e.target.value)} />
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Stock on hand</span>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{variant.on_hand ?? '0'}</p>
        </div>
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
  const [selectedValues, setSelectedValues] = useState<Record<number, number[]>>({});
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<Record<number, { mrp: string; retail_price: string }>>({});

  function toggleValue(attributeId: number, valueId: number) {
    setSelectedValues((prev) => {
      const current = prev[attributeId] ?? [];
      const next = current.includes(valueId) ? current.filter((v) => v !== valueId) : [...current, valueId];
      return { ...prev, [attributeId]: next };
    });
  }

  async function generate() {
    const groups = Object.values(selectedValues).filter((g) => g.length > 0);
    if (groups.length === 0) {
      onError('Select at least one attribute value to generate variants');
      return;
    }
    setGenerating(true);
    onError('');
    try {
      const res = await api.post(`/products/${product.id}/variants/generate`, {
        attribute_value_groups: groups,
        defaults: { mrp: 0, retail_price: 0 },
      });
      onChange();
      if (res.data.skipped.length > 0) {
        onError(`${res.data.created.length} created, ${res.data.skipped.length} already existed and were skipped.`);
      }
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not generate variants'));
    } finally {
      setGenerating(false);
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

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Variants</h2>
        <p className="text-xs text-slate-500">Pick attribute values, then generate every combination automatically.</p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 p-3">
        {attributes.map((attr) => (
          <div key={attr.id} className="flex items-start gap-3">
            <span className="w-16 shrink-0 pt-1 text-sm font-medium text-slate-700">{attr.name}</span>
            <div className="flex flex-wrap gap-2">
              {attr.values.map((val) => {
                const checked = (selectedValues[attr.id] ?? []).includes(val.id);
                return (
                  <button
                    key={val.id}
                    type="button"
                    onClick={() => toggleValue(attr.id, val.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      checked ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600'
                    }`}
                  >
                    {val.color_hex && (
                      <span
                        className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle"
                        style={{ backgroundColor: val.color_hex }}
                      />
                    )}
                    {val.value}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <Button size="sm" onClick={generate} disabled={generating}>
          {generating ? 'Generating…' : 'Generate Combinations'}
        </Button>
      </div>

      {product.variants.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Variant</th>
                <th className="py-2 pr-3 font-medium">SKU</th>
                <th className="py-2 pr-3 font-medium">MRP</th>
                <th className="py-2 pr-3 font-medium">Price</th>
                <th className="py-2 pr-3 font-medium">Stock</th>
                <th className="py-2 pr-3 font-medium">Images</th>
                <th className="py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {product.variants.map((v) => {
                const label = v.attribute_values.map((a) => a.value).join(' / ') || '—';
                const editValues = editing[v.id];
                return (
                  <tr key={v.id}>
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
