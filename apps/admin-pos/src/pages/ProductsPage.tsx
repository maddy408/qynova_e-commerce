import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EyeIcon, PencilIcon, TrashIcon } from '../components/Icons'
import { Spinner } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { ProductListItem } from '../lib/types'

export function ProductsPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<ProductListItem[] | null>(null)

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL')

  function load() {
    api.get('/products', { params: { limit: 200 } }).then((res) => setProducts(res.data.items))
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

  // Filtered products
  const filteredProducts = (products ?? []).filter((p) => {
    const matchesSearch =
      !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.product_code && p.product_code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.brand_name && p.brand_name.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && p.is_active) ||
      (statusFilter === 'INACTIVE' && !p.is_active)

    const matchesStock =
      stockFilter === 'ALL' ||
      (stockFilter === 'OUT_OF_STOCK' && p.out_of_stock_variant_count > 0) ||
      (stockFilter === 'LOW_STOCK' && p.low_stock_variant_count > 0) ||
      (stockFilter === 'IN_STOCK' && Number(p.total_stock) > 0)

    return matchesSearch && matchesStatus && matchesStock
  })

  return (
    <div className="space-y-6 pb-12">
      {/* ================= ALL PRODUCTS TABLE CARD ================= */}
      {products === null ? (
        <div className="p-12 text-center">
          <Spinner />
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
          {/* Card Header with Filters, Search and New Product Button */}
          <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
            <div>
              <h3 className="text-xl font-serif font-bold text-slate-900">All Products</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {filteredProducts.length} of {products.length} products
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Stock Filter Dropdown */}
              <select
                value={stockFilter}
                onChange={(e: any) => setStockFilter(e.target.value)}
                className="rounded-full border border-[#E5D5D8] bg-[#FAF2F4] px-3.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#7B3F4A] transition-all shadow-2xs cursor-pointer"
              >
                <option value="ALL">All Stock Status</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="LOW_STOCK">Low Stock</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>

              {/* Status Filter Pills */}
              <div className="inline-flex items-center gap-1 bg-[#FAF2F4] p-1 rounded-full border border-[#EEDDE0] text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1 rounded-full font-medium transition-all ${
                    statusFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ACTIVE')}
                  className={`px-3 py-1 rounded-full font-medium transition-all ${
                    statusFilter === 'ACTIVE'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('INACTIVE')}
                  className={`px-3 py-1 rounded-full font-medium transition-all ${
                    statusFilter === 'INACTIVE'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Inactive
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products, SKU, code…"
                  className="rounded-full border border-[#E5D5D8] bg-[#FDFBFB] pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7B3F4A] transition-all w-48 sm:w-56"
                />
              </div>

              {/* + New Product Button */}
              <Link
                to="/products/new"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-all shadow-md active:scale-98"
              >
                + New Product
              </Link>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
                <tr>
                  <th className="px-6 py-4">Product</th>
                  <th className="px-6 py-4">Brand</th>
                  <th className="px-6 py-4">Price Range</th>
                  <th className="px-6 py-4 text-center">Variants</th>
                  <th className="px-6 py-4 text-center">Stock</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F6EDEE]">
                {filteredProducts.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/products/${p.id}`)}
                    className="cursor-pointer hover:bg-[#FAF5F6] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-bold text-slate-900 text-sm hover:text-[#4A1821] transition-colors">
                          {p.name}
                        </p>
                        {p.product_code && (
                          <p className="text-xs text-slate-600 font-mono font-medium mt-0.5">{p.product_code}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {p.brand_name ? (
                        <span className="bg-[#F3E1E4] text-[#4A1821] border border-[#DCBAC1] px-3 py-0.5 rounded-full text-xs font-bold inline-block shadow-2xs">
                          {p.brand_name}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-bold">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-900 font-extrabold text-sm">
                      {p.min_price === null
                        ? '—'
                        : p.min_price === p.max_price
                        ? `₹${p.min_price}`
                        : `₹${p.min_price} – ₹${p.max_price}`}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-slate-900 text-sm">
                      {p.variant_count}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <p className="font-bold text-slate-900 text-sm">{Number(p.total_stock)}</p>
                      {(p.low_stock_variant_count > 0 || p.out_of_stock_variant_count > 0) && (
                        <p className="text-xs text-slate-600 mt-0.5">
                          {p.out_of_stock_variant_count > 0 && (
                            <span className="text-rose-700 font-bold">{p.out_of_stock_variant_count} out</span>
                          )}
                          {p.out_of_stock_variant_count > 0 && p.low_stock_variant_count > 0 && ' · '}
                          {p.low_stock_variant_count > 0 && (
                            <span className="text-amber-700 font-bold">{p.low_stock_variant_count} low</span>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {p.is_active ? (
                        <span className="bg-[#E3F8E9] text-[#0E7A36] border border-[#B7EDC4] font-black text-[11px] px-3 py-1 rounded-full inline-flex items-center gap-1.5 uppercase tracking-wider shadow-2xs">
                          <span className="h-2 w-2 rounded-full bg-[#0E7A36]"></span>
                          ACTIVE
                        </span>
                      ) : (
                        <span className="bg-[#FDE8EC] text-[#B91C1C] border border-[#F9B6C2] font-black text-[11px] px-3 py-1 rounded-full inline-flex items-center gap-1.5 uppercase tracking-wider shadow-2xs">
                          <span className="h-2 w-2 rounded-full bg-[#B91C1C]"></span>
                          INACTIVE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/products/${p.id}`)
                          }}
                          className="p-2 rounded-lg text-slate-700 hover:bg-[#F3E1E4] hover:text-[#4A1821] transition-colors"
                          title="View Details"
                        >
                          <EyeIcon className="h-4 w-4 stroke-[2]" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/products/${p.id}`)
                          }}
                          className="p-2 rounded-lg text-slate-700 hover:bg-[#F3E1E4] hover:text-[#4A1821] transition-colors"
                          title="Edit Product"
                        >
                          <PencilIcon className="h-4 w-4 stroke-[2]" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(p, e)}
                          className="p-2 rounded-lg text-rose-600 hover:bg-rose-100 hover:text-rose-800 transition-colors"
                          title="Soft Delete"
                        >
                          <TrashIcon className="h-4 w-4 stroke-[2]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      No products found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
