import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/auth'
import { NAV_SECTIONS, ROUTES, type NavSection } from '../routes/routes'
import { LogoutIcon, MenuIcon, XMarkIcon, ZapIcon } from './Icons'
import { NotificationBell } from './NotificationBell'

const SECTIONS = NAV_SECTIONS

function isPathActive(pathname: string, section: NavSection): boolean {
  if (section.id === 'dashboard') {
    return pathname === '/'
  }
  return (
    section.matchPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    section.items.some((item) => pathname.startsWith(item.to))
  )
}

function getBreadcrumb(pathname: string, activeSection: NavSection | undefined): { sectionLabel: string; itemLabel: string } | null {
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
  const isPosSaleRoute = location.pathname.startsWith(ROUTES.SALE)

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-slate-900 antialiased">
      {/* Unique Floating Luxury Navbar */}
      <header className="no-print sticky top-3 z-50 px-3 sm:px-6 lg:px-8 mb-1">
        <div className="w-full bg-white/95 backdrop-blur-xl border border-cyan-200/80 shadow-md shadow-cyan-950/5 rounded-full px-3.5 sm:px-5 py-2">
          <div className="flex items-center justify-between gap-3">
            <Link to={ROUTES.DASHBOARD} className="flex items-center gap-2.5 group shrink-0 pl-1 select-none">
              <img
                src="/images/logo.png"
                alt="Shop with Adam"
                title="Shop with Adam"
                className="h-8 sm:h-9 w-auto max-w-[130px] object-contain group-hover:scale-105 transition-transform"
                onError={(e) => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = '/logo.png'
                }}
              />
              <div className="flex flex-col">
                <span className="text-sm font-black tracking-tight text-slate-950 leading-none">Shop with Adam</span>
                <span className="text-[9px] font-black text-cyan-700 uppercase tracking-widest mt-0.5">ADMIN &amp; POS</span>
              </div>
            </Link>

            {/* Desktop Center Floating Navigation Pill Dock */}
            <nav className="hidden lg:flex items-center gap-1 bg-cyan-50/60 p-1 rounded-full border border-cyan-200/70 shadow-inner">
              {visibleSections.map((sec) => {
                const isActive = isPathActive(location.pathname, sec)
                const isPosSale = sec.id === 'pos-sale'

                if (isPosSale) {
                  return (
                    <Link
                      key={sec.id}
                      to={sec.to}
                      className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-black rounded-full transition-all cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-700 via-teal-700 to-cyan-800 text-white shadow-md shadow-cyan-600/25 ring-2 ring-cyan-400/20'
                          : 'bg-white text-cyan-800 border border-cyan-200 hover:bg-cyan-50'
                      }`}
                    >
                      <ZapIcon className={`h-3.5 w-3.5 ${isActive ? 'text-amber-300 fill-amber-300' : 'text-cyan-700 fill-cyan-700'}`} />
                      {sec.label}
                    </Link>
                  )
                }

                return (
                  <Link
                    key={sec.id}
                    to={sec.to}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-cyan-700 via-teal-700 to-cyan-800 text-white shadow-xs font-black'
                        : 'text-slate-700 hover:text-cyan-900 hover:bg-white/90'
                    }`}
                  >
                    {sec.label}
                  </Link>
                )
              })}
            </nav>

            {/* Right Action Island (User profile + logout) */}
            <div className="hidden sm:flex items-center gap-2.5 shrink-0 pr-1">
              <NotificationBell />

              {/* User Profile Capsule */}
              <div className="flex items-center gap-2 pl-1 pr-3.5 py-1 bg-cyan-50/80 border border-cyan-200 rounded-full shadow-2xs">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-700 to-teal-800 text-[11px] font-black text-white shadow-xs">
                  {user?.name?.charAt(0).toUpperCase() || 'A'}
                </div>
                <div className="text-left leading-tight">
                  <p className="text-xs font-bold text-slate-950">{user?.name || 'Admin'}</p>
                  <span className="text-[9px] font-black text-cyan-800 uppercase tracking-wider block">
                    {user?.role || 'ADMIN'}
                  </span>
                </div>
              </div>

              {/* Modern Sleek Logout Button */}
              <button
                onClick={logout}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 hover:border-rose-300 transition-all cursor-pointer shadow-xs active:scale-95"
                title="Log out of Admin Panel"
                aria-label="Logout"
              >
                <LogoutIcon className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex lg:hidden items-center gap-2">
              <NotificationBell />
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="p-1.5 rounded-full border border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100"
                aria-label="Toggle Navigation Menu"
              >
                {mobileOpen ? <XMarkIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileOpen && (
          <div className="lg:hidden w-full mt-2 rounded-2xl border border-cyan-200 bg-white p-4 space-y-2 shadow-xl">
            {visibleSections.map((sec) => {
              const isActive = isPathActive(location.pathname, sec)
              return (
                <div key={sec.id} className="space-y-1">
                  <Link
                    to={sec.to}
                    onClick={() => setMobileOpen(false)}
                    className={`block px-3.5 py-2 text-xs font-bold rounded-xl ${
                      isActive ? 'bg-gradient-to-r from-cyan-700 via-teal-700 to-cyan-800 text-white' : 'text-slate-800 bg-cyan-50/60'
                    }`}
                  >
                    {sec.label}
                  </Link>
                  {sec.items.length > 0 && (
                    <div className="pl-3 grid grid-cols-2 gap-1 py-1">
                      {sec.items.map((sub) => (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive: subActive }) =>
                            `block px-2.5 py-1 text-[11px] font-medium rounded-lg ${
                              subActive ? 'text-cyan-900 bg-cyan-100/80 font-bold' : 'text-slate-600 hover:bg-cyan-50/50'
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
            <div className="pt-3 border-t border-cyan-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">{user?.name}</p>
                <p className="text-[10px] text-slate-500">{user?.role}</p>
              </div>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100"
              >
                <LogoutIcon className="h-3.5 w-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Section Sub-Header & Horizontal Tab Navigation */}
      {activeSection && activeSection.items.length > 0 && (
        <div className="no-print bg-white border-b border-cyan-100 shadow-2xs">
          <div className="w-full max-w-full px-4 sm:px-6 py-3.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              {/* Breadcrumb & Section Name */}
              <div>
                {breadcrumb && (
                  <nav className="flex items-center gap-1.5 text-[10px] font-bold text-cyan-700/80 uppercase tracking-[0.2em] mb-0.5">
                    <span>{breadcrumb.sectionLabel}</span>
                    <span>&gt;</span>
                    <span className="text-cyan-800 font-extrabold">{breadcrumb.itemLabel}</span>
                  </nav>
                )}
                <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-slate-900">
                  {activeSection.label}
                </h1>
              </div>

              {/* Horizontal Sub-Navigation Tab Bar */}
              <div className="inline-flex items-center gap-1 p-1 rounded-full text-xs overflow-x-auto max-w-full scrollbar-none shadow-sm self-start sm:self-auto border bg-cyan-50/60 border-cyan-200/70">
                {activeSection.items.map((sub) => {
                  if (sub.permission && !hasPermission(sub.permission)) return null
                  const isSubActive = location.pathname.startsWith(sub.to)
                  return (
                    <NavLink
                      key={sub.to}
                      to={sub.to}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all ${
                        isSubActive
                          ? 'bg-gradient-to-r from-cyan-700 via-teal-700 to-cyan-800 text-white shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
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
      <main className={isPosSaleRoute ? 'flex-1 w-full max-w-full px-2 sm:px-4 py-1 bg-white' : 'flex-1 w-full max-w-full px-4 sm:px-6 py-4 bg-white'}>
        <Outlet />
      </main>
    </div>
  )
}
