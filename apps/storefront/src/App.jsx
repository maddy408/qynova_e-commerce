import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Shop from './pages/Shop'
import ProductDetails from './pages/ProductDetails'
import NotFound from './pages/NotFound'
import Register from './pages/customer/Register'
import Login from './pages/customer/Login'
import Profile from './pages/customer/Profile'
import Orders from './pages/customer/Orders'
import OrderDetail from './pages/customer/OrderDetail'
import PolicyPage from './pages/PolicyPage'
import LocationPromptModal from './components/LocationPromptModal'
import SeoRouteReset from './components/SeoRouteReset'
import { ROUTES, ROUTE_PATTERNS } from './routes/routes'

export default function App() {
  return (
    <BrowserRouter>
      <LocationPromptModal />
      <SeoRouteReset />
      <Routes>
        <Route path={ROUTES.HOME} element={<Home />} />
        <Route path={ROUTES.PRODUCTS} element={<Shop />} />
        <Route path={ROUTES.SHOP} element={<Shop />} />
        <Route path={ROUTES.CATALOG} element={<Shop />} />
        <Route path={ROUTE_PATTERNS.CATEGORY} element={<Shop />} />
        <Route path={ROUTE_PATTERNS.CATEGORY_SUB} element={<Shop />} />
        <Route path={ROUTES.WISHLIST} element={<Shop />} />
        <Route path={ROUTES.CART} element={<Shop />} />
        <Route path={ROUTE_PATTERNS.PRODUCT_DETAIL} element={<ProductDetails />} />
        <Route path={ROUTE_PATTERNS.POLICY_PAGE} element={<PolicyPage />} />
        <Route path={ROUTE_PATTERNS.POLICY_TERMS} element={<PolicyPage />} />
        <Route path={ROUTES.REGISTER} element={<Register />} />
        <Route path={ROUTES.LOGIN} element={<Login />} />
        <Route path={ROUTES.PROFILE} element={<Profile />} />
        <Route path={ROUTE_PATTERNS.CUSTOMER_PROFILE_ALIAS} element={<Profile />} />
        <Route path={ROUTES.ORDERS} element={<Orders />} />
        <Route path={ROUTE_PATTERNS.ORDER_DETAIL} element={<OrderDetail />} />
        <Route path={ROUTE_PATTERNS.CUSTOMER_ORDERS_ALIAS} element={<Orders />} />
        <Route path={ROUTE_PATTERNS.CUSTOMER_ORDER_DETAIL_ALIAS} element={<OrderDetail />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
