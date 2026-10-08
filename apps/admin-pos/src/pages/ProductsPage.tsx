import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EyeIcon, PencilIcon, TrashIcon } from '../components/Icons'
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { ProductListItem } from '../lib/types'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '')
function imageUrl(path: string | null) {
  return path ? `${API_ORIGIN}/${path}` : null
}

export function ProductsPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<ProductListItem[] | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  function load() {
    api.get('/products', { params: { limit: 100 } }).then((res) => setProducts(res.data.items))
  }

  useEffect(load, [])

  async function handleDelete(p: ProductListItem, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Are you sure you want to soft delete "${p.name}"?`)) return
    try {
      await api.delete(`/products/${p.id}`)
      load()
    } catch (err) {
      alert(apiErrorMessage(err, 'Could not delete product'))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products Catalog"
        description="Manage products, variants, SKUs, pricing, and batch stock."
        actions={
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-md border border-slate-300 bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 rounded-sm transition-all ${
                  viewMode === 'grid' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Grid View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-sm transition-all ${
                  viewMode === 'table' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Table View
              </button>
            </div>

            <Link to="/products/new">
              <Button>+ New Product</Button>
            </Link>
          </div>
        }
      />

      {products === null ? (
        <Spinner />
      ) : products.length === 0 ? (
        <Card>
          <EmptyState title="No products yet" description="Create your first product to get started." />
        </Card>
      ) : viewMode === 'grid' ? (
        /* Compact Product Grid List View */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {products.map((p) => {
            const img = imageUrl(p.primary_image)
            const priceStr =
              p.min_price === null
                ? '—'
                : p.min_price === p.max_price
                ? `₹${p.min_price}`
                : `₹${p.min_price} – ₹${p.max_price}`

            return (
              <div
                key={p.id}
                onClick={() => navigate(`/products/${p.id}`)}
                className="group relative flex flex-col justify-between overflow-hidden rounded-md border border-slate-200 bg-white p-3 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer"
              >
                <div>
                  {/* Thumbnail Image */}
                  <div className="relative h-32 w-full overflow-hidden rounded-sm bg-slate-100 flex items-center justify-center">
                    {img ? (
                      <img
                        src={img}
                        alt={p.name}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <span className="text-[10px] font-medium">No Image</span>
                      </div>
                    )}
                    <span className="absolute top-1.5 right-1.5">
                      <Badge tone={p.is_active ? 'green' : 'slate'}>{p.is_active ? 'Active' : 'Off'}</Badge>
                    </span>
                  </div>

                  {/* Content */}
                  <div className="mt-2.5 space-y-1">
                    <h3 className="text-xs font-bold text-slate-900 truncate leading-tight group-hover:text-indigo-600">
                      {p.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 truncate">{p.brand_name ?? 'No Brand'}</p>

                    <div className="pt-1 flex items-baseline justify-between">
                      <span className="text-xs font-extrabold text-indigo-700">{priceStr}</span>
                      <span className="text-[10px] text-slate-500 font-medium">{p.variant_count} var</span>
                    </div>

                    <div className="text-[10px] text-slate-500 flex items-center justify-between pt-0.5 border-t border-slate-100">
                      <span>Stock: <strong className="text-slate-900">{Number(p.total_stock)}</strong></span>
                      {p.out_of_stock_variant_count > 0 ? (
                        <span className="text-red-600 font-bold">Out</span>
                      ) : p.low_stock_variant_count > 0 ? (
                        <span className="text-amber-600 font-bold">Low</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/products/${p.id}`)
                    }}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    View Details →
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/products/${p.id}`)
                      }}
                      className="p-1 rounded text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                      title="Edit"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(p, e)}
                      className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Table View */
        <Card>
          <table className="w-full text-left text-xs">
            <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Price Range</th>
                <th className="px-4 py-3">Variants</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E0E3]">
              {products.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/products/${p.id}`)}
                  className="cursor-pointer hover:bg-[#FAF2F4]/80 transition-colors"
                >
                  <td className="px-4 py-2.5 flex items-center gap-3">
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-slate-100 border border-slate-200 flex items-center justify-center">
                      {imageUrl(p.primary_image) ? (
                        <img src={imageUrl(p.primary_image)!} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[9px] text-slate-400">No img</span>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      {p.product_code && <p className="text-[11px] text-slate-500 font-mono">{p.product_code}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 font-medium">{p.brand_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-700 font-medium">
                    {p.min_price === null
                      ? '—'
                      : p.min_price === p.max_price
                        ? `₹${p.min_price}`
                        : `₹${p.min_price} – ₹${p.max_price}`}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 font-semibold">{p.variant_count}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-900">{Number(p.total_stock)}</p>
                    {(p.low_stock_variant_count > 0 || p.out_of_stock_variant_count > 0) && (
                      <p className="text-[11px] text-slate-500">
                        {p.out_of_stock_variant_count > 0 && <span className="text-red-600">{p.out_of_stock_variant_count} out</span>}
                        {p.out_of_stock_variant_count > 0 && p.low_stock_variant_count > 0 && ' · '}
                        {p.low_stock_variant_count > 0 && <span className="text-amber-600">{p.low_stock_variant_count} low</span>}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={p.is_active ? 'green' : 'slate'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right flex items-center justify-end gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/products/${p.id}`)
                      }}
                      className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                      title="View Details"
                    >
                      <EyeIcon />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/products/${p.id}`)
                      }}
                      className="p-1 rounded text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                      title="Edit Product"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={(e) => handleDelete(p, e)}
                      className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Soft Delete Product"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
