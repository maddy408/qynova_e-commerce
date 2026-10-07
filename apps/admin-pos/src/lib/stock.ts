/**
 * The exact priority order the merchant specified: OUT_OF_STOCK beats
 * LOW_STOCK beats IN_STOCK — a variant at 0 is "out of stock", never
 * also counted as "low stock". Threshold is per-variant, never a single
 * value shared across a product.
 */
export type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK'

export function stockStatus(available: string | number | null, threshold: string | number | null): StockStatus {
  const avail = Number(available ?? 0)
  const limit = Number(threshold ?? 0)

  if (avail <= 0) return 'OUT_OF_STOCK'
  if (avail <= limit) return 'LOW_STOCK'
  return 'IN_STOCK'
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  OUT_OF_STOCK: 'Out of Stock',
  LOW_STOCK: 'Low Stock',
  IN_STOCK: 'In Stock',
}

export const STOCK_STATUS_TONE: Record<StockStatus, 'red' | 'amber' | 'green'> = {
  OUT_OF_STOCK: 'red',
  LOW_STOCK: 'amber',
  IN_STOCK: 'green',
}
