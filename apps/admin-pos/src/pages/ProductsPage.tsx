import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EyeIcon, PencilIcon, TrashIcon } from '../components/Icons'
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ProductImportExportPanel } from '../components/ProductImportExportPanel'
import { ImportHistoryPanel } from '../components/ImportHistoryPanel'
import { api, getApiOrigin } from '../lib/api'
import type { ProductListItem } from '../lib/types'
import { ROUTES } from '../routes/routes'

function imageUrl(path: string | null) {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${getApiOrigin()}/${path}`
}

export function ProductsPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<ProductListItem[] | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  })
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [deletingProduct, setDeletingProduct] = useState<ProductListItem | null>(null)

  function load(p = page, l = limit, s = search) {
    const params: Record<string, string | number> = { page: p, limit: l }
    if (s.trim()) params.search = s.trim()

    api.get('/products', { params }).then((res) => {
      setProducts(res.data.items || res.data.data || [])
      if (res.data.pagination) {
        setPagination(res.data.pagination)
      } else {
        const total = res.data.total ?? (res.data.items?.length || 0)
        const totalPages = Math.max(1, Math.ceil(total / l))
        setPagination({
          page: p,
          limit: l,
          total,
          totalPages,
          hasNextPage: p < totalPages,
          hasPreviousPage: p > 1,
        })
      }
    })
  }

  useEffect(() => {
    load(page, limit, search)
  }, [page, limit])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    load(1, limit, search)
  }

  async function handleToggleActive(p: ProductListItem, e: React.MouseEvent) {
    e.stopPropagation()
    const nextStatus = p.is_active ? 0 : 1
    setTogglingId(p.id)
    try {
      await api.put(`/products/${p.id}`, { is_active: nextStatus })
      setProducts((prev) =>
        prev ? prev.map((item) => (item.id === p.id ? { ...item, is_active: nextStatus as 0 | 1 } : item)) : null
      )
    } catch (err) {
      console.error('Failed to toggle product status:', err)
    } finally {
      setTogglingId(null)
    }
  }

  function handleDelete(p: ProductListItem, e: React.MouseEvent) {
    e.stopPropagation()
    setDeletingProduct(p)
  }

  async function confirmDelete() {
    if (!deletingProduct) return
    await api.delete(`/products/${deletingProduct.id}`)
    setDeletingProduct(null)
    load(page, limit, search)
  }

  const startCount = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const endCount = Math.min(pagination.page * pagination.limit, pagination.total)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products Catalog"
        description="Manage products, variants, SKUs, pricing, and batch stock."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 rounded-full transition-all ${
                  viewMode === 'grid' ? 'bg-[var(--color-primary)] text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Grid View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-full transition-all ${
                  viewMode === 'table' ? 'bg-[var(--color-primary)] text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Table View
              </button>
            </div>

            <ProductImportExportPanel onImported={() => load(page, limit, search)} />
            <ImportHistoryPanel onChanged={() => load(page, limit, search)} />

            <Link to={ROUTES.PRODUCT_NEW}>
              <Button>+ New Product</Button>
            </Link>
          </div>
        }
      />

      {/* Search and Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border-muted)] bg-white p-3 shadow-2xs">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name, code or tags..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[var(--color-primary)] focus:outline-hidden"
          />
          <Button type="submit" size="sm" variant="secondary">
            Search
          </Button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setPage(1)
                load(1, limit, '')
              }}
              className="text-xs text-slate-400 hover:text-rose-600 font-bold px-1"
            >
              ✕
            </button>
          )}
        </form>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <span>Show:</span>
          <select
            value={limit}
            onChange={(e) => {
              const newLimit = Number(e.target.value)
              setLimit(newLimit)
              setPage(1)
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <span>per page</span>
        </div>
      </div>

      {products === null ? (
        <Spinner />
      ) : products.length === 0 ? (
        <Card>
          <EmptyState title="No products found" description="Try adjusting your search filter or add a new product." />
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
                onClick={() => navigate(ROUTES.PRODUCT_DETAIL(p.id))}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white p-3 shadow-2xs hover:shadow-md hover:border-[var(--color-primary)] transition-all cursor-pointer ${
                  p.is_active ? 'border-[var(--color-border-muted)]' : 'border-slate-200 bg-slate-50/60 opacity-80'
                }`}
              >
                <div>
                  {/* Thumbnail Image */}
                  <div className="relative h-32 w-full overflow-hidden rounded-xl bg-slate-100 flex items-center justify-center">
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
                      <Badge tone={p.is_active ? 'green' : 'slate'}>{p.is_active ? 'Active' : 'Deactivated'}</Badge>
                    </span>
                  </div>

                  {/* Content */}
                  <div className="mt-2.5 space-y-1">
                    <h3 className="text-xs font-bold text-slate-900 truncate leading-tight group-hover:text-[var(--color-primary)]">
                      {p.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 truncate">{p.brand_name ?? 'No Brand'}</p>

                    <div className="pt-1 flex items-baseline justify-between">
                      <span className="text-xs font-extrabold text-[var(--color-primary)]">{priceStr}</span>
                      <span className="text-[10px] text-slate-500 font-medium">{p.variant_count} var</span>
                    </div>

                    <div className="text-[10px] text-slate-500 flex items-center justify-between pt-0.5 border-t border-slate-100">
                      <span>Stock: <strong className="text-slate-900">{Number(p.total_stock)}</strong></span>
                      {p.out_of_stock_variant_count > 0 ? (
                        <span className="text-rose-600 font-bold">Out</span>
                      ) : p.low_stock_variant_count > 0 ? (
                        <span className="text-amber-600 font-bold">Low</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                  {/* Product Deactivate / Activate Button */}
                  <button
                    type="button"
                    disabled={togglingId === p.id}
                    onClick={(e) => handleToggleActive(p, e)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                      p.is_active
                        ? 'border-slate-300 text-slate-600 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                    title={p.is_active ? 'Click to deactivate product' : 'Click to activate product'}
                  >
                    {togglingId === p.id ? 'Saving…' : p.is_active ? 'Deactivate' : 'Activate'}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(ROUTES.PRODUCT_DETAIL(p.id))
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:bg-[var(--color-surface)] hover:text-[var(--color-primary)]"
                      title="Edit"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(p, e)}
                      className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
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
        <Card className="border border-[var(--color-border-muted)] shadow-2xs rounded-3xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--color-border-muted)] uppercase font-bold text-[10px] tracking-wider text-[var(--color-primary-strong)] bg-[var(--color-surface)]/80">
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
            <tbody className="divide-y divide-[var(--color-border-muted)]">
              {products.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(ROUTES.PRODUCT_DETAIL(p.id))}
                  className="cursor-pointer hover:bg-[var(--color-surface)]/40 transition-colors"
                >
                  <td className="px-4 py-2.5 flex items-center gap-3">
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-slate-100 border border-[var(--color-border)] flex items-center justify-center">
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
                  <td className="px-4 py-2.5 text-[var(--color-primary)] font-bold">
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
                        {p.out_of_stock_variant_count > 0 && <span className="text-rose-600 font-bold">{p.out_of_stock_variant_count} out</span>}
                        {p.out_of_stock_variant_count > 0 && p.low_stock_variant_count > 0 && ' · '}
                        {p.low_stock_variant_count > 0 && <span className="text-amber-600 font-bold">{p.low_stock_variant_count} low</span>}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      disabled={togglingId === p.id}
                      onClick={(e) => handleToggleActive(p, e)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                        p.is_active
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      title="Click to toggle active / deactivated status"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${p.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <span>{togglingId === p.id ? 'Saving…' : p.is_active ? 'Active' : 'Deactivated'}</span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right flex items-center justify-end gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(ROUTES.PRODUCT_DETAIL(p.id))
                      }}
                      className="p-1 rounded-lg text-slate-500 hover:bg-[var(--color-surface)] hover:text-[var(--color-primary)] transition-colors"
                      title="View Details"
                    >
                      <EyeIcon />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(ROUTES.PRODUCT_DETAIL(p.id))
                      }}
                      className="p-1 rounded-lg text-slate-500 hover:bg-[var(--color-surface)] hover:text-[var(--color-primary)] transition-colors"
                      title="Edit Product"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={(e) => handleDelete(p, e)}
                      className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
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

      {/* Backend Direct Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-[var(--color-border-muted)] bg-white p-3 shadow-2xs">
          <p className="text-xs text-slate-500 font-medium">
            Showing <strong className="text-slate-800">{startCount}</strong> to{' '}
            <strong className="text-slate-800">{endCount}</strong> of{' '}
            <strong className="text-slate-800">{pagination.total}</strong> products
          </p>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={!pagination.hasPreviousPage}
              onClick={() => setPage(page - 1)}
            >
              ← Previous
            </Button>

            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pagination.totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => {
                const prev = arr[idx - 1]
                const showEllipsis = prev && p - prev > 1
                return (
                  <div key={p} className="flex items-center">
                    {showEllipsis && <span className="px-1 text-slate-400 text-xs">…</span>}
                    <button
                      type="button"
                      onClick={() => setPage(p)}
                      className={`h-7 w-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        p === page
                          ? 'bg-[var(--color-primary)] text-white shadow-2xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  </div>
                )
              })}

            <Button
              size="sm"
              variant="secondary"
              disabled={!pagination.hasNextPage}
              onClick={() => setPage(page + 1)}
            >
              Next →
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deletingProduct !== null}
        title="Delete Product"
        message={<>Are you sure you want to soft delete <strong className="text-slate-900">"{deletingProduct?.name}"</strong>?</>}
        confirmLabel="Delete Product"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingProduct(null)}
      />
    </div>
  )
}
