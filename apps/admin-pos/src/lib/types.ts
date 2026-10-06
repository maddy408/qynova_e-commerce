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
  product_count?: number
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

export interface Brand {
  id: number
  name: string
}

export interface Unit {
  id: number
  name: string
  short_code: string
}

export interface GstRate {
  id: number
  name: string
  gst_percent: string
  tax_mode: 'INCLUSIVE' | 'EXCLUSIVE'
}

export interface HsnCode {
  id: number
  code: string
  description: string | null
}

export interface ProductImage {
  id: number
  image_path: string
  thumb_path: string | null
  sort_order: number
  is_primary: 0 | 1
}

export interface VariantAttributeValue {
  id: number
  value: string
  color_hex: string | null
}

export interface VariantAttribute {
  id: number
  name: string
  values: VariantAttributeValue[]
}

export interface VariantAttributeValueLink {
  attribute_id: number
  attribute_name: string
  value_id: number
  value: string
  color_hex: string | null
}

export interface ProductVariant {
  id: number
  product_id: number
  sku: string
  barcode: string | null
  mrp: string
  retail_price: string
  wholesale_price: string | null
  purchase_price: string | null
  variant_description: string | null
  status: 'ACTIVE' | 'INACTIVE'
  on_hand: string | null
  reserved: string | null
  available: string | null
  attribute_values: VariantAttributeValueLink[]
  images: ProductImage[]
}

export interface ProductSpecification {
  id: number
  name: string
  value: string
  sort_order: number
}

export interface ProductDetail {
  id: number
  name: string
  slug: string
  product_code: string | null
  brand_id: number | null
  unit_id: number | null
  short_description: string | null
  description: string | null
  bullet_points: string[]
  tags: string | null
  is_active: 0 | 1
  is_pos_enabled: 0 | 1
  is_ecommerce_enabled: 0 | 1
  is_featured: 0 | 1
  is_trending: 0 | 1
  is_deal: 0 | 1
  returnable: 0 | 1
  return_window_days: number | null
  warranty_applicable: 0 | 1
  images: ProductImage[]
  categories: { id: number; name: string; is_primary: 0 | 1 }[]
  subcategories: { id: number; name: string }[]
  variants: ProductVariant[]
  specifications: ProductSpecification[]
}
