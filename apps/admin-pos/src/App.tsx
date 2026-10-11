import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'
import { NotFoundPage } from './pages/NotFoundPage'
import { ROUTE_TABLE, ROUTES, SECTION_REDIRECTS } from './routes/routes'
import { RequireAccess } from './routes/RequireAccess'

function ProtectedLayout() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
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
