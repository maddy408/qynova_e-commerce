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
  image_path: string | null
  thumb_path: string | null
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
  image_path: string | null
  thumb_path: string | null
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
  total_stock: string
  low_stock_variant_count: number
  out_of_stock_variant_count: number
}

export interface ApiError {
  error: string
}

export interface Brand {
  id: number
  name: string
  description?: string | null
  categories?: { id: number; name: string }[]
  category_ids?: number[]
}

export interface Customer {
  id: number
  name: string
  phone: string
  email?: string | null
  customer_type?: 'RETAIL' | 'WHOLESALE'
  order_count?: number
  latest_order_at?: string | null
}

export interface Supplier {
  id: number
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  gstin: string | null
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
  updated_at: string
}

export interface Unit {
  id: number
  name: string
  short_code: string
}

export interface PaymentMethod {
  id: number
  code: string
  name: string
  sort_order: number
  is_active: 0 | 1
}

export interface GstRate {
  id: number
  name: string
  gst_percent: string
  cgst_percent: string
  sgst_percent: string
  igst_percent: string
  tax_mode: 'INCLUSIVE' | 'EXCLUSIVE'
  status: 'ACTIVE' | 'INACTIVE'
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
  low_stock_threshold: string | null
  attribute_values: VariantAttributeValueLink[]
  images: ProductImage[]
}

export interface ProductSpecification {
  id: number
  name: string
  value: string
  sort_order: number
}

export type BannerPosition = 'HOME_HERO' | 'HOME_MIDDLE' | 'CATEGORY_PAGE' | 'POPUP'
export type BannerTargetType = 'PRODUCT' | 'CATEGORY' | 'SUBCATEGORY' | 'BRAND' | 'COUPON' | 'EXTERNAL_URL' | 'NONE'

export interface BannerItem {
  id: number
  product_id: number
  product_name: string
  offer_text: string | null
  sort_order: number
}

export interface Banner {
  id: number
  title: string
  image_desktop_path: string | null
  image_mobile_path: string | null
  position: BannerPosition
  target_type: BannerTargetType
  target_id: number | null
  target_url: string | null
  starts_at: string | null
  ends_at: string | null
  sort_order: number
  is_active: 0 | 1
  items: BannerItem[]
}

export type HomeSectionType =
  | 'BANNER'
  | 'CATEGORIES'
  | 'BEST_SELLERS'
  | 'NEW_ARRIVALS'
  | 'FEATURED'
  | 'COMBOS'
  | 'DEALS'
  | 'CUSTOM'

export interface HomeSection {
  id: number
  type: HomeSectionType
  title: string | null
  image_path: string | null
  item_limit: number
  sort_order: number
  is_active: 0 | 1
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
