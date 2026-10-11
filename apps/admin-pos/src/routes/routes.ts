/**
 * Single source of truth for every route in apps/admin-pos: path
 * constants, which component renders at each path, the permission
 * required to open it, and the nav menu structure. API endpoints are
 * handled entirely separately (see src/api/endpoints.ts) — this file
 * only ever contains frontend paths, never a URL or API path.
 *
 * `App.tsx` renders <Route> elements from ROUTE_TABLE and wraps each in
 * a permission check (see components/RequirePermission.tsx) instead of
 * only checking "is logged in." `Layout.tsx` renders its nav from
 * NAV_SECTIONS instead of keeping its own duplicate copy. Any
 * navigate()/<Link>/<NavLink> in a page or component should use a ROUTES
 * constant, never a raw path string.
 */
import type { ComponentType } from 'react'
import { BannersPage } from '../pages/BannersPage'
import { BrandsPage } from '../pages/BrandsPage'
import { CategoriesPage } from '../pages/CategoriesPage'
import { CouponsPage } from '../pages/CouponsPage'
import { CreditManagementPage } from '../pages/CreditManagementPage'
import { CustomersPage } from '../pages/CustomersPage'
import { DashboardPage } from '../pages/DashboardPage'
import { DeliveriesPage } from '../pages/DeliveriesPage'
import { DeliveryDetailPage } from '../pages/DeliveryDetailPage'
import { FinancePage } from '../pages/FinancePage'
import { HomeSectionsPage } from '../pages/HomeSectionsPage'
import { InvoiceDetailPage } from '../pages/InvoiceDetailPage'
import { InvoicesPage } from '../pages/InvoicesPage'
import { LoginPage } from '../pages/LoginPage'
import { OrderDetailPage } from '../pages/OrderDetailPage'
import { OrdersPage } from '../pages/OrdersPage'
import { PaymentMethodsPage } from '../pages/PaymentMethodsPage'
import { PriceAdjustmentPage } from '../pages/PriceAdjustmentPage'
import { ProductCreatePage } from '../pages/ProductCreatePage'
import { ProductDetailPage } from '../pages/ProductDetailPage'
import { ProductsPage } from '../pages/ProductsPage'
import { PurchasesPage } from '../pages/PurchasesPage'
import { ReferralSettingsPage } from '../pages/ReferralSettingsPage'
import { ReportsPage } from '../pages/ReportsPage'
import { ReturnsPage } from '../pages/ReturnsPage'
import { SalePage } from '../pages/SalePage'
import { SettingsSetupPage } from '../pages/SettingsSetupPage'
import { StockAdjustmentsPage } from '../pages/StockAdjustmentsPage'
import { SubcategoriesPage } from '../pages/SubcategoriesPage'
import { SuppliersPage } from '../pages/SuppliersPage'
import { TaxPage } from '../pages/TaxPage'
import { UnitsPage } from '../pages/UnitsPage'
import { UsersPage } from '../pages/UsersPage'

export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/',

  CATALOG: '/catalog',
  CATEGORIES: '/categories',
  SUBCATEGORIES: '/subcategories',
  BRANDS: '/brands',
  PRODUCTS: '/products',
  PRODUCT_NEW: '/products/new',
  PRODUCT_DETAIL: (id: string | number = ':id') => `/products/${id}`,
  PRICE_ADJUSTMENT: '/price-adjustment',
  UNITS: '/units',
  TAX: '/tax',

  SALES_REPORTS: '/sales-reports',
  SALE: '/sale',
  ORDERS: '/orders',
  ORDER_DETAIL: (id: string | number = ':id') => `/orders/${id}`,
  INVOICES: '/invoices',
  INVOICE_DETAIL: (id: string | number = ':id') => `/invoices/${id}`,
  COLLECTIONS: '/collections',
  CREDIT_MANAGEMENT: '/credit-management',
  CUSTOMERS: '/customers',
  DELIVERIES: '/deliveries',
  DELIVERY_DETAIL: (id: string | number = ':id') => `/deliveries/${id}`,
  RETURNS: '/returns',
  FINANCE: '/finance',
  REPORTS: '/reports',

  INVENTORY: '/inventory',
  STOCK_ADJUSTMENTS: '/stock-adjustments',
  RECENT_ADJUSTMENT_LOGS: '/recent-adjustment-logs',
  SUPPLIERS: '/suppliers',
  PURCHASES: '/purchases',

  MARKETING: '/marketing',
  REFERRAL_SETTINGS: '/referral-settings',
  BANNERS: '/banners',
  HOME_SECTIONS: '/home-sections',

  SETTINGS: '/settings',
  SETTINGS_COMPANY: '/settings/company',
  SETTINGS_PREFIX: '/settings/prefix',
  COUPONS: '/coupons',
  PAYMENT_METHODS: '/payment-methods',
  USERS: '/users',
  SETTINGS_PRINTER: '/settings/printer',
  SETTINGS_SCANNER: '/settings/scanner',
} as const

/** 'public' = no login required. 'authenticated' = any signed-in staff,
 * no specific permission. Any other string = the permission code
 * PermissionMiddleware/hasPermission checks, matching the backend's own
 * permission codes 1:1. */
export type Access = 'public' | 'authenticated' | string

export interface RouteDef {
  path: string
  component: ComponentType
  access: Access
}

export const ROUTE_TABLE: RouteDef[] = [
  { path: ROUTES.LOGIN, component: LoginPage, access: 'public' },
  { path: ROUTES.DASHBOARD, component: DashboardPage, access: 'authenticated' },

  { path: ROUTES.CATEGORIES, component: CategoriesPage, access: 'catalog.manage' },
  { path: ROUTES.SUBCATEGORIES, component: SubcategoriesPage, access: 'catalog.manage' },
  { path: ROUTES.BRANDS, component: BrandsPage, access: 'catalog.manage' },
  { path: ROUTES.PRODUCTS, component: ProductsPage, access: 'catalog.manage' },
  { path: ROUTES.PRODUCT_NEW, component: ProductCreatePage, access: 'catalog.manage' },
  { path: ROUTES.PRODUCT_DETAIL(':id'), component: ProductDetailPage, access: 'catalog.manage' },
  { path: ROUTES.PRICE_ADJUSTMENT, component: PriceAdjustmentPage, access: 'catalog.manage' },
  { path: ROUTES.UNITS, component: UnitsPage, access: 'catalog.manage' },
  { path: ROUTES.TAX, component: TaxPage, access: 'catalog.manage' },

  { path: ROUTES.SALE, component: SalePage, access: 'pos.sell' },
  { path: ROUTES.ORDERS, component: OrdersPage, access: 'orders.manage' },
  { path: ROUTES.ORDER_DETAIL(':id'), component: OrderDetailPage, access: 'orders.manage' },
  { path: ROUTES.INVOICES, component: InvoicesPage, access: 'orders.manage' },
  { path: ROUTES.INVOICE_DETAIL(':id'), component: InvoiceDetailPage, access: 'orders.manage' },
  { path: ROUTES.COLLECTIONS, component: CreditManagementPage, access: 'authenticated' },
  { path: ROUTES.CREDIT_MANAGEMENT, component: CreditManagementPage, access: 'authenticated' },
  { path: ROUTES.CUSTOMERS, component: CustomersPage, access: 'authenticated' },
  { path: ROUTES.DELIVERIES, component: DeliveriesPage, access: 'delivery.manage' },
  { path: ROUTES.DELIVERY_DETAIL(':id'), component: DeliveryDetailPage, access: 'delivery.manage' },
  { path: ROUTES.RETURNS, component: ReturnsPage, access: 'orders.manage' },
  { path: ROUTES.FINANCE, component: FinancePage, access: 'reports.financial.view' },
  { path: ROUTES.REPORTS, component: ReportsPage, access: 'reports.financial.view' },

  { path: ROUTES.STOCK_ADJUSTMENTS, component: StockAdjustmentsPage, access: 'inventory.view' },
  { path: ROUTES.RECENT_ADJUSTMENT_LOGS, component: StockAdjustmentsPage, access: 'inventory.view' },
  { path: ROUTES.SUPPLIERS, component: SuppliersPage, access: 'suppliers.manage' },
  { path: ROUTES.PURCHASES, component: PurchasesPage, access: 'purchases.manage' },

  { path: ROUTES.REFERRAL_SETTINGS, component: ReferralSettingsPage, access: 'settings.manage' },
  { path: ROUTES.BANNERS, component: BannersPage, access: 'banners.manage' },
  { path: ROUTES.HOME_SECTIONS, component: HomeSectionsPage, access: 'banners.manage' },

  { path: ROUTES.SETTINGS_COMPANY, component: SettingsSetupPage, access: 'settings.manage' },
  { path: ROUTES.SETTINGS_PREFIX, component: SettingsSetupPage, access: 'settings.manage' },
  { path: ROUTES.COUPONS, component: CouponsPage, access: 'coupons.manage' },
  { path: ROUTES.PAYMENT_METHODS, component: PaymentMethodsPage, access: 'payment_methods.manage' },
  { path: ROUTES.USERS, component: UsersPage, access: 'users.manage' },
  { path: ROUTES.SETTINGS_PRINTER, component: SettingsSetupPage, access: 'settings.manage' },
  { path: ROUTES.SETTINGS_SCANNER, component: SettingsSetupPage, access: 'settings.manage' },
]

/** Redirects for the 6 section "landing" paths (e.g. /catalog -> /categories). */
export const SECTION_REDIRECTS: Record<string, string> = {
  [ROUTES.CATALOG]: ROUTES.CATEGORIES,
  [ROUTES.SALES_REPORTS]: ROUTES.ORDERS,
  [ROUTES.INVENTORY]: ROUTES.STOCK_ADJUSTMENTS,
  [ROUTES.MARKETING]: ROUTES.REFERRAL_SETTINGS,
  [ROUTES.SETTINGS]: ROUTES.SETTINGS_COMPANY,
}

export interface NavItem {
  to: string
  label: string
  permission?: string
}

export interface NavSection {
  id: string
  label: string
  to: string
  matchPrefixes: string[]
  items: NavItem[]
  permission?: string
}

/** Drives both the top nav bar and the mobile menu in components/Layout.tsx. */
export const NAV_SECTIONS: NavSection[] = [
  { id: 'dashboard', label: 'Dashboard', to: ROUTES.DASHBOARD, matchPrefixes: ['/'], items: [] },
  { id: 'pos-sale', label: 'POS Sale', to: ROUTES.SALE, matchPrefixes: [ROUTES.SALE], items: [], permission: 'pos.sell' },
  {
    id: 'catalog',
    label: 'Catalog',
    to: ROUTES.CATEGORIES,
    matchPrefixes: [ROUTES.CATEGORIES, ROUTES.SUBCATEGORIES, ROUTES.BRANDS, ROUTES.PRODUCTS, ROUTES.PRICE_ADJUSTMENT, ROUTES.UNITS, ROUTES.TAX],
    items: [
      { to: ROUTES.CATEGORIES, label: 'Category', permission: 'catalog.manage' },
      { to: ROUTES.SUBCATEGORIES, label: 'Subcategory', permission: 'catalog.manage' },
      { to: ROUTES.BRANDS, label: 'Brands & Mapping', permission: 'catalog.manage' },
      { to: ROUTES.PRODUCTS, label: 'Products', permission: 'catalog.manage' },
      { to: ROUTES.PRICE_ADJUSTMENT, label: 'Price Adjustment', permission: 'catalog.manage' },
      { to: ROUTES.TAX, label: 'Tax', permission: 'catalog.manage' },
      { to: ROUTES.UNITS, label: 'Unit', permission: 'catalog.manage' },
    ],
  },
  {
    id: 'sales-orders',
    label: 'Sales & Orders',
    to: ROUTES.ORDERS,
    matchPrefixes: [ROUTES.ORDERS, ROUTES.INVOICES, ROUTES.COLLECTIONS, ROUTES.CUSTOMERS, ROUTES.DELIVERIES, ROUTES.RETURNS, ROUTES.FINANCE, ROUTES.REPORTS],
    items: [
      { to: ROUTES.ORDERS, label: 'Orders', permission: 'orders.manage' },
      { to: ROUTES.INVOICES, label: 'Invoices', permission: 'orders.manage' },
      { to: ROUTES.COLLECTIONS, label: 'Collections (Credit)' },
      { to: ROUTES.CUSTOMERS, label: 'Customers' },
      { to: ROUTES.DELIVERIES, label: 'Delivery', permission: 'delivery.manage' },
      { to: ROUTES.RETURNS, label: 'Returns', permission: 'orders.manage' },
      { to: ROUTES.FINANCE, label: 'Expenses & Income', permission: 'reports.financial.view' },
      { to: ROUTES.REPORTS, label: 'Reports', permission: 'reports.financial.view' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    to: ROUTES.STOCK_ADJUSTMENTS,
    matchPrefixes: [ROUTES.STOCK_ADJUSTMENTS, ROUTES.RECENT_ADJUSTMENT_LOGS, ROUTES.SUPPLIERS, ROUTES.PURCHASES],
    items: [
      { to: ROUTES.STOCK_ADJUSTMENTS, label: 'Stock Adjustment', permission: 'inventory.view' },
      { to: ROUTES.SUPPLIERS, label: 'Supplier', permission: 'suppliers.manage' },
      { to: ROUTES.PURCHASES, label: 'Purchase', permission: 'purchases.manage' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    to: ROUTES.REFERRAL_SETTINGS,
    matchPrefixes: [ROUTES.REFERRAL_SETTINGS, ROUTES.BANNERS, ROUTES.HOME_SECTIONS],
    items: [
      { to: ROUTES.REFERRAL_SETTINGS, label: 'Referral', permission: 'settings.manage' },
      { to: ROUTES.BANNERS, label: 'Banner', permission: 'banners.manage' },
      { to: ROUTES.HOME_SECTIONS, label: 'Home Sections', permission: 'banners.manage' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    to: ROUTES.SETTINGS_COMPANY,
    matchPrefixes: [ROUTES.SETTINGS, ROUTES.COUPONS, ROUTES.PAYMENT_METHODS, ROUTES.USERS],
    items: [
      { to: ROUTES.SETTINGS_COMPANY, label: 'Company Details', permission: 'settings.manage' },
      { to: ROUTES.SETTINGS_PREFIX, label: 'Invoice Prefix', permission: 'settings.manage' },
      { to: ROUTES.COUPONS, label: 'Coupons', permission: 'coupons.manage' },
      { to: ROUTES.PAYMENT_METHODS, label: 'Payment Methods', permission: 'payment_methods.manage' },
      { to: ROUTES.USERS, label: 'User Management', permission: 'users.manage' },
      { to: ROUTES.SETTINGS_PRINTER, label: 'Thermal Printer Setup', permission: 'settings.manage' },
      { to: ROUTES.SETTINGS_SCANNER, label: 'WiFi Scanner Setup', permission: 'settings.manage' },
    ],
  },
]
