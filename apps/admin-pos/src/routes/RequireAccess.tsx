import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/auth'
import { ROUTES, type Access } from './routes'

/**
 * Per-route guard. Previously the only client-side check anywhere in
 * this app was "is someone logged in" (see the old ProtectedLayout) —
 * any signed-in staff member, any role, could open /users, /finance,
 * /settings/company etc. by typing the URL directly; only the sidebar
 * nav hid the links. This wraps every route in ROUTE_TABLE with the
 * same permission check the nav already used to decide what to show,
 * so it's now also enforced on direct navigation, not just rendered
 * for or against in the menu. The backend's own PermissionMiddleware
 * check is still the real authority — this is defense in depth, not a
 * replacement for it.
 */
export function RequireAccess({ access, children }: { access: Access; children: ReactNode }) {
  const { user, loading, hasPermission } = useAuth()

  if (loading) return null
  if (!user) return <Navigate to={ROUTES.LOGIN} replace />
  if (access === 'public' || access === 'authenticated') return <>{children}</>
  if (!hasPermission(access)) return <ForbiddenPage />
  return <>{children}</>
}

function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center gap-2">
      <p className="text-3xl font-black text-text">403</p>
      <p className="text-sm font-bold text-text">You don't have permission to view this page</p>
      <a href={ROUTES.DASHBOARD} className="mt-2 text-xs font-bold text-primary-strong hover:underline">
        Back to Dashboard
      </a>
    </div>
  )
}
