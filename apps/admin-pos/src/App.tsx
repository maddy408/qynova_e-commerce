import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'
import { BannersPage } from './pages/BannersPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { CouponsPage } from './pages/CouponsPage'
import { DashboardPage } from './pages/DashboardPage'
import { HomeSectionsPage } from './pages/HomeSectionsPage'
import { LoginPage } from './pages/LoginPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { OrdersPage } from './pages/OrdersPage'
import { ProductCreatePage } from './pages/ProductCreatePage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { ProductsPage } from './pages/ProductsPage'
import { PurchasesPage } from './pages/PurchasesPage'
import { ReferralSettingsPage } from './pages/ReferralSettingsPage'
import { StockAdjustmentsPage } from './pages/StockAdjustmentsPage'
import { SubcategoriesPage } from './pages/SubcategoriesPage'
import { SuppliersPage } from './pages/SuppliersPage'

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
    return <Navigate to="/login" replace />
  }

  return <Layout />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/subcategories" element={<SubcategoriesPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<ProductCreatePage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/coupons" element={<CouponsPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/stock-adjustments" element={<StockAdjustmentsPage />} />
        <Route path="/referral-settings" element={<ReferralSettingsPage />} />
        <Route path="/banners" element={<BannersPage />} />
        <Route path="/home-sections" element={<HomeSectionsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
