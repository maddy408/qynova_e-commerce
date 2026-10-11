/**
 * Every backend API path this app calls, grouped by module. Paths only,
 * relative to the base URL in src/config/env.js — never a full URL.
 * Dynamic segments are functions. This is an exhaustive inventory of
 * every endpoint currently called (see src/lib/api.js and the
 * pages/components under src/) — the base URL + auth/session handling
 * live in src/api/axiosInstance.js, never duplicated here.
 */
export const ENDPOINTS = {
  AUTH: {
    OTP_SEND: '/customers/otp/send',
    OTP_VERIFY: '/customers/otp/verify',
    OTP_LOGIN: '/customers/otp/login',
    SIGNUP: '/customers/signup',
    GOOGLE_LOGIN: '/customers/google-login',
    ME: '/customers/me',
  },

  CUSTOMER: {
    ADDRESSES: '/customer/addresses',
    ADDRESS_BY_ID: (id) => `/customer/addresses/${id}`,
  },

  REFERRAL: {
    SETTINGS: '/referral-settings',
    APPLY: '/customers/referral/apply',
  },

  CATEGORIES: '/categories',
  SUBCATEGORIES: '/subcategories',
  BRANDS: '/brands',

  PRODUCTS: {
    LIST: (query) => (query ? `/products?${query}` : '/products'),
    BY_ID: (id) => `/products/${id}`,
    VIEW: (id) => `/products/${id}/view`,
    RECENTLY_VIEWED: (limit, sessionId) =>
      `/products/recently-viewed?limit=${limit}${sessionId ? `&session_id=${sessionId}` : ''}`,
    BY_SECTION: (section, limit) => `/products?limit=${limit}&section=${section}`,
    BY_CATEGORY: (categoryId, limit) => `/products?limit=${limit}&category_id=${categoryId}`,
  },

  CART: {
    GET: '/cart',
    ITEMS: '/cart/items',
    ITEM_BY_ID: (cartItemId) => `/cart/items/${cartItemId}`,
    MERGE: '/cart/merge',
  },

  WISHLIST: {
    LIST: '/wishlist',
    BY_ID: (id) => `/wishlist/${id}`,
    MERGE: '/wishlist/merge',
  },

  COUPONS: {
    AVAILABLE: '/coupons/available',
    VALIDATE: '/coupons/validate',
  },

  ORDERS: {
    CHECKOUT: '/orders/checkout',
    CANCEL: (id) => `/orders/${id}/cancel`,
    MY_ORDERS: '/customers/orders',
    BY_ID: (id) => `/orders/${id}`,
  },

  DELIVERY: {
    CHECK_PINCODE: '/delivery/check-pincode',
  },

  BANNERS: {
    BY_POSITION: (position) => `/banners?position=${encodeURIComponent(position)}&is_active=1`,
  },

  OFFERS: {
    LIST: '/offers',
    FLASH_DEAL: '/offers/flash-deal',
  },

  HOME_SECTIONS: '/home-sections',

  PAGES: {
    LIST: '/pages',
    BY_SLUG: (slug) => `/pages/${slug}`,
  },

  SETTINGS: {
    STORE: '/settings/store',
    DELIVERY: '/settings/delivery',
  },

  // TODO: Razorpay implementation — placeholders only, not called yet
  // (see src/api/services/paymentService.js, src/config/razorpayConfig.js).
  // Matches the commented-out backend routes in backend/public/index.php.
  PAYMENTS: {
    RAZORPAY_CREATE_ORDER: '/payments/razorpay/create-order',
    RAZORPAY_VERIFY: '/payments/razorpay/verify',
  },
}
