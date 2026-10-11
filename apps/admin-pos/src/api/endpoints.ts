/**
 * Every backend API path this app calls, grouped by module. Paths only,
 * relative to the base URL in src/config/env.ts — never a full URL.
 * Dynamic segments are functions. This is an exhaustive inventory of
 * every endpoint currently called (see src/lib/api.ts and the page
 * components under src/pages/) — the base URL + auth/401 handling live
 * in src/api/axiosInstance.ts, never duplicated here.
 */
export const ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    ME: '/auth/me',
  },

  DASHBOARD: {
    SUMMARY: '/dashboard/summary',
    SALES_CHART: '/dashboard/sales-chart',
    PRODUCT_ANALYTICS: '/dashboard/product-analytics',
    CUSTOMER_ANALYTICS: '/dashboard/customer-analytics',
    RECENT_ACTIVITY: '/dashboard/recent-activity',
  },

  CATEGORIES: {
    LIST: '/categories',
    CREATE: '/categories',
    BY_ID: (id: string | number) => `/categories/${id}`,
    IMAGE: (id: string | number) => `/categories/${id}/image`,
    REORDER: '/categories/reorder',
  },

  SUBCATEGORIES: {
    LIST: '/subcategories',
    CREATE: '/subcategories',
    BY_ID: (id: string | number) => `/subcategories/${id}`,
    IMAGE: (id: string | number) => `/subcategories/${id}/image`,
    REORDER: '/subcategories/reorder',
  },

  BRANDS: {
    LIST: '/brands',
    CREATE: '/brands',
    BY_ID: (id: string | number) => `/brands/${id}`,
  },

  UNITS: {
    LIST: '/units',
    CREATE: '/units',
    BY_ID: (id: string | number) => `/units/${id}`,
  },

  GST_RATES: {
    LIST: '/gst-rates',
    CREATE: '/gst-rates',
    BY_ID: (id: string | number) => `/gst-rates/${id}`,
  },

  HSN_CODES: {
    LIST: '/hsn-codes',
    CREATE: '/hsn-codes',
    BY_ID: (id: string | number) => `/hsn-codes/${id}`,
  },

  VARIANT_ATTRIBUTES: {
    LIST: '/variant-attributes',
    VALUES: (attributeId: string | number) => `/variant-attributes/${attributeId}/values`,
  },

  PRODUCTS: {
    LIST: '/products',
    CREATE: '/products',
    BY_ID: (id: string | number) => `/products/${id}`,
    PRICE_SETTINGS: '/products/price-settings',
    IMAGES: (productId: string | number) => `/products/${productId}/images`,
    IMAGE_BY_ID: (productId: string | number, imageId: string | number) => `/products/${productId}/images/${imageId}`,
    IMAGE_PRIMARY: (productId: string | number, imageId: string | number) => `/products/${productId}/images/${imageId}/primary`,
    VARIANTS: (productId: string | number) => `/products/${productId}/variants`,
    SPECIFICATIONS: (productId: string | number) => `/products/${productId}/specifications`,
  },

  VARIANTS: {
    BY_ID: (id: string | number) => `/variants/${id}`,
    IMAGES: (variantId: string | number) => `/variants/${variantId}/images`,
    IMAGE_BY_ID: (variantId: string | number, imageId: string | number) => `/variants/${variantId}/images/${imageId}`,
    IMAGE_PRIMARY: (variantId: string | number, imageId: string | number) => `/variants/${variantId}/images/${imageId}/primary`,
  },

  POS: {
    CATEGORIES: '/pos/categories',
    PRODUCTS: '/pos/products',
  },

  INVENTORY: {
    LIST: '/inventory',
    ADJUSTMENTS: '/inventory/adjustments',
    OPENING_STOCK: '/inventory/opening-stock',
    OPENING_STOCK_RESET: (variantId: string | number) => `/inventory/${variantId}/opening-stock`,
    THRESHOLD: (variantId: string | number) => `/inventory/${variantId}/threshold`,
    BATCHES: '/inventory/batches',
    BATCHES_EXPIRY: '/inventory/batches/expiry',
    BATCHES_BY_VARIANT: (variantId: string | number) => `/inventory/${variantId}/batches`,
    BATCH_BY_ID: (batchId: string | number) => `/inventory/batches/${batchId}`,
    CONSUMPTION_RULE: '/inventory/consumption-rule',
  },

  ORDERS: {
    LIST: '/orders',
    BY_ID: (id: string | number) => `/orders/${id}`,
    STATUS: (id: string | number) => `/orders/${id}/status`,
    CANCEL: (id: string | number) => `/orders/${id}/cancel`,
    DELIVERY: (id: string | number) => `/orders/${id}/delivery`,
  },

  INVOICES: {
    LIST: '/invoices',
    BY_ID: (id: string | number) => `/invoices/${id}`,
    POS_SALE: '/invoices/pos-sale',
  },

  DELIVERIES: {
    LIST: '/deliveries',
    BY_ID: (id: string | number) => `/deliveries/${id}`,
    STATUS: (id: string | number) => `/deliveries/${id}/status`,
  },

  RETURNS: {
    SALES: '/returns/sales',
    PURCHASES: '/returns/purchases',
  },

  SUPPLIERS: {
    LIST: '/suppliers',
    CREATE: '/suppliers',
    BY_ID: (id: string | number) => `/suppliers/${id}`,
  },

  PURCHASES: {
    LIST: '/purchases',
    CREATE: '/purchases',
    PAYMENTS: (purchaseId: string | number) => `/purchases/${purchaseId}/payments`,
    PAYMENT_REVERSE: (purchaseId: string | number, paymentId: string | number) => `/purchases/${purchaseId}/payments/${paymentId}/reverse`,
    PAYMENT_PRINT_DATA: (purchaseId: string | number, paymentId: string | number) => `/purchases/${purchaseId}/payments/${paymentId}/print-data`,
    PAYMENT: (purchaseId: string | number) => `/purchases/${purchaseId}/payment`,
    PRINT_DATA: (purchaseId: string | number) => `/purchases/${purchaseId}/print-data`,
  },

  CUSTOMERS: {
    LIST: '/customers',
    CREATE: '/customers',
    BY_ID: (id: string | number) => `/customers/${id}`,
  },

  COLLECTIONS: {
    PENDING: '/collections/pending',
    RECEIPTS: '/collections/receipts',
    CUSTOMER_UNPAID: (customerId: string | number) => `/collections/customer-unpaid/${customerId}`,
    PAY: '/collections/pay',
  },

  COUPONS: {
    LIST: '/coupons',
    CREATE: '/coupons',
    BY_ID: (id: string | number) => `/coupons/${id}`,
  },

  BANNERS: {
    LIST: '/banners',
    CREATE: '/banners',
    BY_ID: (id: string | number) => `/banners/${id}`,
    REORDER: '/banners/reorder',
    IMAGE: (id: string | number, side: string) => `/banners/${id}/image/${side}`,
    IMAGE_DESKTOP: (id: string | number) => `/banners/${id}/image/desktop`,
    IMAGE_MOBILE: (id: string | number) => `/banners/${id}/image/mobile`,
    ITEMS: (id: string | number) => `/banners/${id}/items`,
    ITEM_BY_ID: (bannerId: string | number, itemId: string | number) => `/banners/${bannerId}/items/${itemId}`,
  },

  HOME_SECTIONS: {
    LIST: '/home-sections',
    CREATE: '/home-sections',
    BY_ID: (id: string | number) => `/home-sections/${id}`,
    IMAGE: (id: string | number) => `/home-sections/${id}/image`,
    REORDER: '/home-sections/reorder',
  },

  REFERRAL_SETTINGS: {
    GET: '/referral-settings',
    UPDATE: '/referral-settings',
  },
  REFERRAL_REPORTS: '/reports/referrals',

  FINANCE: {
    LIST: (query?: string) => (query ? `/finance?${query}` : '/finance'),
    CREATE: '/finance',
    BY_ID: (id: string | number) => `/finance/${id}`,
  },

  PAYMENT_METHODS: {
    LIST: '/payment-methods',
    CREATE: '/payment-methods',
    BY_ID: (id: string | number) => `/payment-methods/${id}`,
  },

  HOLD_BILLS: {
    LIST: '/hold-bills',
    CREATE: '/hold-bills',
    BY_ID: (id: string | number) => `/hold-bills/${id}`,
  },

  USERS: {
    LIST: '/users',
    CREATE: '/users',
    BY_ID: (id: string | number) => `/users/${id}`,
  },
  ROLES: '/roles',
}
