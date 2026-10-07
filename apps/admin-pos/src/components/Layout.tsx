import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { BellIcon, LogoutIcon, MenuIcon, XMarkIcon, ZapIcon } from './Icons'

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
  permission?: string
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
    permission: 'pos.sell',
  },
  {
    id: 'catalog',
    label: 'Catalog',
    to: '/categories',
    matchPrefixes: ['/categories', '/subcategories', '/brands', '/products', '/units', '/tax'],
    items: [
      { to: '/categories', label: 'Category', permission: 'catalog.manage' },
      { to: '/subcategories', label: 'Subcategory', permission: 'catalog.manage' },
      { to: '/brands', label: 'Brands & Mapping', permission: 'catalog.manage' },
      { to: '/products', label: 'Products', permission: 'catalog.manage' },
      { to: '/tax', label: 'Tax', permission: 'catalog.manage' },
      { to: '/units', label: 'Unit', permission: 'catalog.manage' },
    ],
  },
  {
    id: 'sales-orders',
    label: 'Sales & Orders',
    to: '/orders',
    matchPrefixes: ['/orders', '/invoices', '/customers', '/deliveries', '/returns', '/finance', '/reports'],
    items: [
      { to: '/orders', label: 'Orders', permission: 'orders.manage' },
      { to: '/invoices', label: 'Invoices', permission: 'orders.manage' },
      { to: '/customers', label: 'Customers' },
      { to: '/deliveries', label: 'Delivery', permission: 'delivery.manage' },
      { to: '/returns', label: 'Returns', permission: 'orders.manage' },
      { to: '/finance', label: 'Expenses & Income', permission: 'reports.financial.view' },
      { to: '/reports', label: 'Reports', permission: 'reports.financial.view' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    to: '/stock-adjustments',
    matchPrefixes: ['/stock-adjustments', '/suppliers', '/purchases'],
    items: [
      { to: '/stock-adjustments', label: 'Stock Adjustment', permission: 'inventory.view' },
      { to: '/suppliers', label: 'Supplier', permission: 'suppliers.manage' },
      { to: '/purchases', label: 'Purchase', permission: 'purchases.manage' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    to: '/referral-settings',
    matchPrefixes: ['/referral-settings', '/banners', '/home-sections'],
    items: [
      { to: '/referral-settings', label: 'Referral', permission: 'settings.manage' },
      { to: '/banners', label: 'Banner', permission: 'banners.manage' },
      { to: '/home-sections', label: 'Home Sections', permission: 'banners.manage' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    to: '/settings/company',
    matchPrefixes: ['/settings', '/coupons', '/payment-methods', '/users'],
    items: [
      { to: '/settings/company', label: 'Company Details', permission: 'settings.manage' },
      { to: '/settings/prefix', label: 'Invoice Prefix', permission: 'settings.manage' },
      { to: '/coupons', label: 'Coupons', permission: 'coupons.manage' },
      { to: '/payment-methods', label: 'Payment Methods', permission: 'payment_methods.manage' },
      { to: '/users', label: 'User Management', permission: 'users.manage' },
      { to: '/settings/printer', label: 'Thermal Printer Setup', permission: 'settings.manage' },
      { to: '/settings/scanner', label: 'WiFi Scanner Setup', permission: 'settings.manage' },
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

  // Sections/items the signed-in user actually has permission to see. A
  // section with sub-items (Catalog, Inventory, ...) disappears entirely
  // once every one of its items is filtered out; Dashboard/POS Sale (no
  // items to begin with) are instead gated by the section's own `permission`.
  const visibleSections = SECTIONS.map((sec) => {
    const items = sec.items.filter((item) => !item.permission || hasPermission(item.permission))
    // If permission filtering dropped the section's default landing item,
    // land on the first one this user can actually open instead — otherwise
    // clicking the section parks them on a page that 403s forever.
    const to = items.length > 0 && !items.some((item) => item.to === sec.to) ? items[0].to : sec.to
    return { ...sec, items, to }
  }).filter((sec) => {
    if (sec.permission && !hasPermission(sec.permission)) return false
    const hadItems = SECTIONS.find((s) => s.id === sec.id)!.items.length > 0
    return !hadItems || sec.items.length > 0
  })

  // Determine currently active top section (permission-filtered, so the tab
  // bar below only ever lists/counts items this user can actually open)
  const activeSection = visibleSections.find((sec) => isPathActive(location.pathname, sec))
  const breadcrumb = getBreadcrumb(location.pathname, activeSection)

  return (
    <div className="min-h-screen bg-[#faf8fc] flex flex-col font-sans text-slate-900 antialiased">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-2xs">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-600 text-white font-black text-base shadow-sm group-hover:scale-105 transition-transform">
                UP
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight text-slate-900">Unified POS</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest leading-none">ADMIN PANEL</span>
              </div>
            </Link>

            {/* Desktop Top Navbar Links */}
            <nav className="hidden lg:flex items-center gap-1.5 xl:gap-2">
              {visibleSections.map((sec) => {
                const isActive = isPathActive(location.pathname, sec)
                const isPosSale = sec.id === 'pos-sale'

                if (isPosSale) {
                  return (
                    <Link
                      key={sec.id}
                      to={sec.to}
                      className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-full transition-all border ${
                        isActive
                          ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                          : 'bg-amber-100/70 text-amber-950 border-amber-200/80 hover:bg-amber-200/80 shadow-2xs'
                      }`}
                    >
                      <ZapIcon className="h-3.5 w-3.5 text-amber-600 fill-amber-500" />
                      {sec.label}
                    </Link>
                  )
                }

                return (
                  <Link
                    key={sec.id}
                    to={sec.to}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${
                      isActive
                        ? 'bg-[#e7e2f5] text-indigo-950 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`}
                  >
                    {sec.label}
                  </Link>
                )
              })}
            </nav>

            {/* User Profile & Logout (Right Side) */}
            <div className="hidden sm:flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 border border-purple-200/70 text-xs font-extrabold text-purple-900 shadow-2xs">
                  {user?.name?.charAt(0).toUpperCase() || 'A'}
                </div>
                <div className="text-left leading-tight">
                  <p className="text-xs font-bold text-slate-900">{user?.name || 'Admin'}</p>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    {user?.role || 'ADMIN'}
                  </span>
                </div>
              </div>

              <button
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 transition-colors"
                title="Notifications"
              >
                <BellIcon className="h-4 w-4 text-slate-600" />
              </button>

              <button
                onClick={logout}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors shadow-2xs"
                title="Log out of Admin Panel"
              >
                <LogoutIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex lg:hidden items-center gap-2">
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                aria-label="Toggle Navigation Menu"
              >
                {mobileOpen ? <XMarkIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu (No Left Sidebar) */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2 shadow-lg">
            {visibleSections.map((sec) => {
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
        <div className="bg-white border-b border-slate-200/80 shadow-2xs">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              {/* Breadcrumb & Section Name */}
              <div>
                {breadcrumb && (
                  <nav className="flex items-center gap-1.5 text-[10px] font-bold text-[#804652]/80 uppercase tracking-[0.2em] mb-0.5">
                    <span>{breadcrumb.sectionLabel}</span>
                    <span>&gt;</span>
                    <span className="text-[#804652]">{breadcrumb.itemLabel}</span>
                  </nav>
                )}
                <h1 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 tracking-tight">
                  {activeSection.label}
                </h1>
              </div>

              {/* Horizontal Sub-Navigation Tab Bar */}
              <div className="inline-flex items-center gap-1 bg-[#F9F3F4] p-1 rounded-full border border-[#EEDDE0] text-xs overflow-x-auto max-w-full scrollbar-none shadow-2xs self-start sm:self-auto">
                {activeSection.items.map((sub) => {
                  if (sub.permission && !hasPermission(sub.permission)) return null
                  const isSubActive = location.pathname.startsWith(sub.to)
                  return (
                    <NavLink
                      key={sub.to}
                      to={sub.to}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all ${
                        isSubActive
                          ? 'bg-[#7B3F4A] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
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
