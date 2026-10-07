import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'
import { BannersPage } from './pages/BannersPage'
import { BrandsPage } from './pages/BrandsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { CouponsPage } from './pages/CouponsPage'
import { CustomersPage } from './pages/CustomersPage'
import { DashboardPage } from './pages/DashboardPage'
import { DeliveriesPage } from './pages/DeliveriesPage'
import { DeliveryDetailPage } from './pages/DeliveryDetailPage'
import { FinancePage } from './pages/FinancePage'
import { HomeSectionsPage } from './pages/HomeSectionsPage'
import { InvoiceDetailPage } from './pages/InvoiceDetailPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { LoginPage } from './pages/LoginPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { OrdersPage } from './pages/OrdersPage'
import { ProductCreatePage } from './pages/ProductCreatePage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { PaymentMethodsPage } from './pages/PaymentMethodsPage'
import { ProductsPage } from './pages/ProductsPage'
import { PurchasesPage } from './pages/PurchasesPage'
import { ReferralSettingsPage } from './pages/ReferralSettingsPage'
import { ReportsPage } from './pages/ReportsPage'
import { ReturnsPage } from './pages/ReturnsPage'
import { SalePage } from './pages/SalePage'
import { StockAdjustmentsPage } from './pages/StockAdjustmentsPage'
import { SubcategoriesPage } from './pages/SubcategoriesPage'
import { SuppliersPage } from './pages/SuppliersPage'
import { TaxPage } from './pages/TaxPage'
import { UnitsPage } from './pages/UnitsPage'
import { SettingsSetupPage } from './pages/SettingsSetupPage'
import { UsersPage } from './pages/UsersPage'

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

        {/* Catalog Section */}
        <Route path="/catalog" element={<Navigate to="/categories" replace />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/subcategories" element={<SubcategoriesPage />} />
        <Route path="/brands" element={<BrandsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<ProductCreatePage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/units" element={<UnitsPage />} />

        {/* Sales & Reports Section */}
        <Route path="/sales-reports" element={<Navigate to="/orders" replace />} />
        <Route path="/sale" element={<SalePage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/deliveries" element={<DeliveriesPage />} />
        <Route path="/deliveries/:id" element={<DeliveryDetailPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/coupons" element={<CouponsPage />} />
        <Route path="/reports" element={<ReportsPage />} />

        {/* Inventory Section */}
        <Route path="/inventory" element={<Navigate to="/stock-adjustments" replace />} />
        <Route path="/stock-adjustments" element={<StockAdjustmentsPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />

        {/* Marketing Section */}
        <Route path="/marketing" element={<Navigate to="/referral-settings" replace />} />
        <Route path="/referral-settings" element={<ReferralSettingsPage />} />
        <Route path="/banners" element={<BannersPage />} />
        <Route path="/home-sections" element={<HomeSectionsPage />} />

        {/* Settings & Masters Section */}
        <Route path="/settings" element={<Navigate to="/settings/company" replace />} />
        <Route path="/settings/company" element={<SettingsSetupPage defaultTab="company" />} />
        <Route path="/settings/prefix" element={<SettingsSetupPage defaultTab="prefix" />} />
        <Route path="/tax" element={<TaxPage />} />
        <Route path="/payment-methods" element={<PaymentMethodsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/settings/printer" element={<SettingsSetupPage defaultTab="printer" />} />
        <Route path="/settings/scanner" element={<SettingsSetupPage defaultTab="scanner" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
