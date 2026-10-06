export interface StaffUser {
  id: number
  name: string
  role: 'ADMIN' | 'CASHIER'
  permissions?: string[]
}

export interface Category {
  id: number
  name: string
  slug: string
  description: string | null
  sort_order: number
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
  subcategory_count?: number
  product_count?: number
}

export interface Subcategory {
  id: number
  name: string
  slug: string
  description: string | null
  sort_order: number
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
  category_ids?: number[]
}

export interface ProductListItem {
  id: number
  name: string
  slug: string
  product_code: string | null
  is_active: 0 | 1
  is_pos_enabled: 0 | 1
  is_ecommerce_enabled: 0 | 1
  is_featured: 0 | 1
  brand_name: string | null
  primary_image: string | null
  min_price: string | null
  max_price: string | null
  variant_count: number
}

export interface ApiError {
  error: string
}
