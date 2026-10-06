import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/categories', label: 'Categories', icon: '🗂️' },
  { to: '/subcategories', label: 'Subcategories', icon: '📁' },
  { to: '/products', label: 'Products', icon: '🏷️' },
]

export function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            UP
          </div>
          <span className="text-sm font-semibold text-slate-900">Unified POS Admin</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center justify-between rounded-lg px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.role}</p>
            </div>
            <button onClick={logout} className="text-xs font-medium text-slate-400 hover:text-slate-700" title="Log out">
              ⎋
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
