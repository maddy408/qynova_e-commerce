/**
 * Single source of truth for every route in apps/storefront: path
 * constants (including the query-string variants the product grid is
 * filtered with) and access level. API endpoints are handled entirely
 * separately (see src/api/endpoints.js) — this file only ever contains
 * frontend paths, never a URL or API path.
 *
 * Any navigate()/<Link>/<NavLink> in a page or component should use a
 * ROUTES constant or helper, never a raw path string.
 */
export const ROUTES = {
  HOME: '/',
  PRODUCTS: '/products',
  SHOP: '/shop',
  CATALOG: '/catalog',
  WISHLIST: '/wishlist',
  CART: '/cart',
  PRODUCT_DETAIL: (id) => `/product/${id}`,

  PRODUCTS_BY_SECTION: (section) => `/products?section=${section}`,
  PRODUCTS_BY_CATEGORY: (categoryId) => `/products?category_id=${categoryId}`,
  PRODUCTS_BY_SUBCATEGORY: (subcategoryId) => `/products?subcategory_id=${subcategoryId}`,
  PRODUCTS_BY_CATEGORY_SUBCATEGORY: (categoryId, subcategoryId) =>
    `/products?category_id=${categoryId}&subcategory_id=${subcategoryId}`,
  PRODUCTS_WISHLIST: '/products?wishlist=1',
  PRODUCTS_SEARCH: (query) => `/products?search=${encodeURIComponent(query)}`,

  POLICY_PAGE: (slug) => `/pages/${slug}`,
  POLICY_SHIPPING: '/pages/shipping-policy',
  POLICY_PRIVACY: '/pages/privacy-policy',
  POLICY_RETURNS: '/pages/return-exchange-policy',
  POLICY_TERMS_PAGE: '/pages/terms-and-conditions',
  POLICY_TERMS: '/policy/terms',

  REGISTER: '/register',
  LOGIN: '/login',
  PROFILE: '/profile',
  ORDERS: '/orders',
  ORDER_DETAIL: (id) => `/orders/${id}`,

  // TODO: Razorpay implementation — these paths are reserved but not yet
  // registered in App.jsx's <Routes> (see src/pages/payment/).
  PAYMENT_SUCCESS: '/payment/success',
  PAYMENT_FAILED: '/payment/failed',
}

/** <Route path> patterns (react-router's own ":param" syntax) — used only
 * in App.jsx's route table, never for building a real link (use the
 * ROUTES.*_DETAIL functions above for that). */
export const ROUTE_PATTERNS = {
  PRODUCT_DETAIL: '/product/:id',
  POLICY_PAGE: '/pages/:slug',
  POLICY_TERMS: '/policy/:slug',
  CUSTOMER_PROFILE_ALIAS: '/customer/profile',
  ORDER_DETAIL: '/orders/:id',
  CUSTOMER_ORDERS_ALIAS: '/customer/orders',
  CUSTOMER_ORDER_DETAIL_ALIAS: '/customer/orders/:id',
}

/** 'public' = open to everyone. 'customer' = requires a signed-in customer
 * (mobile-OTP or Google auth) — see src/lib/api.js's getCustomerToken(). */
export const ROUTE_ACCESS = {
  [ROUTES.HOME]: 'public',
  [ROUTES.PRODUCTS]: 'public',
  [ROUTES.SHOP]: 'public',
  [ROUTES.CATALOG]: 'public',
  [ROUTES.WISHLIST]: 'public',
  [ROUTES.CART]: 'public',
  [ROUTES.REGISTER]: 'public',
  [ROUTES.LOGIN]: 'public',
  [ROUTES.PROFILE]: 'customer',
  [ROUTES.ORDERS]: 'customer',
}
