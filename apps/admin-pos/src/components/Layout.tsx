import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

interface SubItem {
  to: string
  label: string
  permission?: string
}

interface SectionConfig {
  id: string
  label: string
  to: string
  matchPrefixes: string[]
  items: SubItem[]
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    to: '/',
    matchPrefixes: ['/'],
    items: [],
  },
  {
    id: 'pos-sale',
    label: 'POS Sale',
    to: '/sale',
    matchPrefixes: ['/sale'],
    items: [],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    to: '/categories',
    matchPrefixes: ['/categories', '/subcategories', '/brands', '/products', '/units', '/tax'],
    items: [
      { to: '/categories', label: 'Category' },
      { to: '/subcategories', label: 'Subcategory' },
      { to: '/brands', label: 'Brands & Mapping' },
      { to: '/products', label: 'Products' },
      { to: '/tax', label: 'Tax' },
      { to: '/units', label: 'Unit' },
    ],
  },
  {
    id: 'sales-orders',
    label: 'Sales & Orders',
    to: '/orders',
    matchPrefixes: ['/orders', '/invoices', '/customers', '/deliveries', '/returns', '/finance', '/reports'],
    items: [
      { to: '/orders', label: 'Orders' },
      { to: '/invoices', label: 'Invoices' },
      { to: '/customers', label: 'Customers' },
      { to: '/deliveries', label: 'Delivery' },
      { to: '/returns', label: 'Returns' },
      { to: '/finance', label: 'Expenses & Income' },
      { to: '/reports', label: 'Reports' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    to: '/stock-adjustments',
    matchPrefixes: ['/stock-adjustments', '/suppliers', '/purchases'],
    items: [
      { to: '/stock-adjustments', label: 'Stock Adjustment' },
      { to: '/suppliers', label: 'Supplier' },
      { to: '/purchases', label: 'Purchase' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    to: '/referral-settings',
    matchPrefixes: ['/referral-settings', '/banners', '/home-sections'],
    items: [
      { to: '/referral-settings', label: 'Referral' },
      { to: '/banners', label: 'Banner' },
      { to: '/home-sections', label: 'Home Sections' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    to: '/settings/company',
    matchPrefixes: ['/settings', '/coupons', '/payment-methods', '/users'],
    items: [
      { to: '/settings/company', label: 'Company Details' },
      { to: '/settings/prefix', label: 'Invoice Prefix' },
      { to: '/coupons', label: 'Coupons' },
      { to: '/tax', label: 'Tax' },
      { to: '/payment-methods', label: 'Payment Methods' },
      { to: '/users', label: 'User Management' },
      { to: '/settings/printer', label: 'Thermal Printer Setup' },
      { to: '/settings/scanner', label: 'WiFi Scanner Setup' },
    ],
  },
]

function isPathActive(pathname: string, section: SectionConfig): boolean {
  if (section.id === 'dashboard') {
    return pathname === '/'
  }
  return section.matchPrefixes.some((prefix) => pathname.startsWith(prefix))
}

function getBreadcrumb(pathname: string, activeSection: SectionConfig | undefined): { sectionLabel: string; itemLabel: string } | null {
  if (!activeSection || activeSection.id === 'dashboard') return null

  // Find sub-item matching pathname
  const matchingItem = activeSection.items.find((item) => pathname.startsWith(item.to))
  return {
    sectionLabel: activeSection.label,
    itemLabel: matchingItem ? matchingItem.label : 'Management',
  }
}

export function Layout() {
  const { user, logout, hasPermission } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Determine currently active top section
  const activeSection = SECTIONS.find((sec) => isPathActive(location.pathname, sec))
  const breadcrumb = getBreadcrumb(location.pathname, activeSection)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 antialiased">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/80 shadow-2xs">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white font-black text-base shadow-sm group-hover:bg-indigo-700 transition-colors">
                UP
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight text-slate-900">Unified POS</span>
                <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-widest leading-none">Admin Panel</span>
              </div>
            </Link>

            {/* Desktop Top Navbar Links */}
            <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
              {SECTIONS.map((sec) => {
                const isActive = isPathActive(location.pathname, sec)
                const isPosSale = sec.id === 'pos-sale'

                if (isPosSale) {
                  return (
                    <Link
                      key={sec.id}
                      to={sec.to}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all border ${
                        isActive
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300'
                      }`}
                    >
                      <span>⚡</span>
                      {sec.label}
                    </Link>
                  )
                }

                return (
                  <Link
                    key={sec.id}
                    to={sec.to}
                    className={`relative px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                    }`}
                  >
                    {sec.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-indigo-600 rounded-full" />
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* User Profile & Logout (Right Side) */}
            <div className="hidden sm:flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2.5 border-l border-slate-200 pl-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="text-left leading-tight">
                  <p className="text-xs font-bold text-slate-900">{user?.name}</p>
                  <span className="inline-block px-1.5 py-0.2 text-[9px] font-bold text-indigo-700 bg-indigo-50 rounded uppercase">
                    {user?.role}
                  </span>
                </div>
              </div>

              <button
                onClick={logout}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                title="Log out of Admin Panel"
              >
                ⎋
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex lg:hidden items-center gap-2">
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                aria-label="Toggle Navigation Menu"
              >
                {mobileOpen ? '✕' : '☰'}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu (No Left Sidebar) */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2 shadow-lg">
            {SECTIONS.map((sec) => {
              const isActive = isPathActive(location.pathname, sec)
              return (
                <div key={sec.id} className="space-y-1">
                  <Link
                    to={sec.to}
                    onClick={() => setMobileOpen(false)}
                    className={`block px-3 py-2 text-xs font-bold rounded-lg ${
                      isActive ? 'bg-indigo-600 text-white' : 'text-slate-800 bg-slate-100'
                    }`}
                  >
                    {sec.label}
                  </Link>
                  {sec.items.length > 0 && (
                    <div className="pl-4 grid grid-cols-2 gap-1 py-1">
                      {sec.items.map((sub) => (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive: subActive }) =>
                            `block px-2.5 py-1 text-[11px] font-medium rounded ${
                              subActive ? 'text-indigo-700 bg-indigo-50 font-bold' : 'text-slate-600 hover:bg-slate-50'
                            }`
                          }
                        >
                          {sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">{user?.name}</p>
                <p className="text-[10px] text-slate-500">{user?.role}</p>
              </div>
              <button onClick={logout} className="text-xs font-semibold text-red-600 hover:underline">
                Logout
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Section Sub-Header & Horizontal Tab Navigation */}
      {activeSection && activeSection.items.length > 0 && (
        <div className="bg-white border-b border-slate-200 shadow-2xs">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              {/* Breadcrumb & Section Name */}
              <div>
                {breadcrumb && (
                  <nav className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                    <span>{breadcrumb.sectionLabel}</span>
                    <span>/</span>
                    <span className="text-indigo-600">{breadcrumb.itemLabel}</span>
                  </nav>
                )}
                <h1 className="text-base font-bold text-slate-900 uppercase tracking-tight">
                  {activeSection.label}
                </h1>
              </div>

              {/* Horizontal Sub-Navigation Tab Bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {activeSection.items.map((sub) => {
                  if (sub.permission && !hasPermission(sub.permission)) return null
                  const isSubActive = location.pathname.startsWith(sub.to)
                  return (
                    <NavLink
                      key={sub.to}
                      to={sub.to}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                        isSubActive
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                      }`}
                    >
                      {sub.label}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  )
}
