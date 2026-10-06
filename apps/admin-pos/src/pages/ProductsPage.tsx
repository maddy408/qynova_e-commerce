import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui'
import { api } from '../lib/api'
import type { ProductListItem } from '../lib/types'

export function ProductsPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<ProductListItem[] | null>(null)

  useEffect(() => {
    api.get('/products', { params: { limit: 100 } }).then((res) => setProducts(res.data.items))
  }, [])

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
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Brand</th>
                <th className="px-5 py-3 font-medium">Price Range</th>
                <th className="px-5 py-3 font-medium">Variants</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/products/${p.id}`)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    {p.product_code && <p className="text-xs text-slate-500">{p.product_code}</p>}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{p.brand_name ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {p.min_price === null
                      ? '—'
                      : p.min_price === p.max_price
                        ? `₹${p.min_price}`
                        : `₹${p.min_price} – ₹${p.max_price}`}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{p.variant_count}</td>
                  <td className="px-5 py-3">
                    <Badge tone={p.is_active ? 'green' : 'slate'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>
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
