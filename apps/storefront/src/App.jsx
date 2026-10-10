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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Shop />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/catalog" element={<Shop />} />
        <Route path="/wishlist" element={<Shop />} />
        <Route path="/cart" element={<Shop />} />
        <Route path="/product/:id" element={<ProductDetails />} />
        <Route path="/pages/:slug" element={<PolicyPage />} />
        <Route path="/policy/:slug" element={<PolicyPage />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/customer/profile" element={<Profile />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/customer/orders" element={<Orders />} />
        <Route path="/customer/orders/:id" element={<OrderDetail />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
