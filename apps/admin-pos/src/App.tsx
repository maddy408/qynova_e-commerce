import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { useAuth } from './context/auth'
import { NotFoundPage } from './pages/NotFoundPage'
import { ROUTE_TABLE, ROUTES, SECTION_REDIRECTS } from './routes/routes'
import { RequireAccess } from './routes/RequireAccess'

function ProtectedLayout() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-3.5 p-6 text-center">
          <img
            src="/images/logo2.jpeg"
            alt="Shop with Adam"
            className="h-12 w-auto max-w-[180px] object-contain animate-pulse drop-shadow-xs"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/logo2.jpeg'
            }}
          />
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-500">
            <Spinner />
            <span>Loading Shop with Adam...</span>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to={ROUTES.LOGIN} replace />
  }

  return <Layout />
}

function App() {
  return (
    <Routes>
      <Route path={ROUTES.LOGIN} element={<LoginRoute />} />
      <Route element={<ProtectedLayout />}>
        {Object.entries(SECTION_REDIRECTS).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        {ROUTE_TABLE.filter((r) => r.path !== ROUTES.LOGIN).map(({ path, component: Component, access }) => (
          <Route
            key={path}
            path={path}
            element={
              <RequireAccess access={access}>
                <Component />
              </RequireAccess>
            }
          />
        ))}
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

function LoginRoute() {
  const loginRoute = ROUTE_TABLE.find((r) => r.path === ROUTES.LOGIN)!
  const Component = loginRoute.component
  return <Component />
}

export default App
