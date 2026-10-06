import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EyeIcon, PencilIcon, TrashIcon } from '../components/Icons'
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { ProductListItem } from '../lib/types'

export function ProductsPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<ProductListItem[] | null>(null)

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
    <div>
      <PageHeader
        title="Products"
        description="Manage your catalog. Variants (SKU, price, stock) are added from a product's detail page."
        actions={
          <Link to="/products/new">
            <Button>+ New Product</Button>
          </Link>
        }
      />

      {products === null ? (
        <Spinner />
      ) : products.length === 0 ? (
        <Card>
          <EmptyState title="No products yet" description="Create your first product to get started." />
        </Card>
      ) : (
        <Card>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 uppercase text-slate-500 bg-slate-50/70">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Product</th>
                <th className="px-4 py-2.5 font-semibold">Brand</th>
                <th className="px-4 py-2.5 font-semibold">Price Range</th>
                <th className="px-4 py-2.5 font-semibold">Variants</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/products/${p.id}`)}
                  className="cursor-pointer hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-900">{p.name}</p>
                    {p.product_code && <p className="text-[11px] text-slate-500 font-mono">{p.product_code}</p>}
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
