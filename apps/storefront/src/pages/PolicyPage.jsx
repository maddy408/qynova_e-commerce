import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchPage, fetchStoreSettings } from '../lib/api'
import Navbar from '../components/Navbar'
import CartDrawer from '../components/CartDrawer'
import CheckoutModal from '../components/CheckoutModal'

export default function PolicyPage() {
  const { slug } = useParams()
  const [page, setPage] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [storeSettings, setStoreSettings] = useState(null)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [checkoutCartData, setCheckoutCartData] = useState(null)

  useEffect(() => {
    fetchStoreSettings().then((s) => s && setStoreSettings(s))
  }, [])

  useEffect(() => {
    setIsLoading(true)
    fetchPage(slug)
      .then((res) => {
        setPage(res?.page || null)
      })
      .catch(() => {
        setPage(null)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [slug])

  return (
    <div className="min-h-screen bg-[#FAF8FF] text-[#27213A] font-sans flex flex-col justify-between">
      <div>
        <Navbar onOpenCart={() => setIsCartOpen(true)} />

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-8 bg-purple-100 rounded-xl w-1/2"></div>
              <div className="h-4 bg-purple-50 rounded-lg w-full"></div>
              <div className="h-4 bg-purple-50 rounded-lg w-5/6"></div>
              <div className="h-4 bg-purple-50 rounded-lg w-4/6"></div>
            </div>
          ) : !page ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-[#E8E0F5] p-8 shadow-sm">
              <span className="text-4xl mb-3 block">📄</span>
              <h1 className="text-2xl font-black text-[#27213A] mb-2">Page Not Found</h1>
              <p className="text-sm text-[#716A82] mb-6">
                The policy or information page you are looking for is currently unavailable.
              </p>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#8B5CF6] text-white font-bold text-xs shadow-md hover:bg-[#7042D2] transition-all"
              >
                ← Return to Home
              </Link>
            </div>
          ) : (
            <article className="bg-white rounded-3xl border border-[#E8E0F5] p-6 sm:p-10 shadow-sm">
              <div className="border-b border-[#E8E0F5] pb-5 mb-6">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#7042D2] bg-[#EDE5FF] px-3 py-1 rounded-full inline-block mb-3">
                  Store Policy & Legal
                </span>
                <h1 className="text-2xl sm:text-3xl font-black text-[#27213A] tracking-tight">
                  {page.title}
                </h1>
                {page.updated_at && (
                  <p className="text-xs text-[#716A82] mt-1">
                    Last updated: {new Date(page.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>

              <div className="prose prose-purple max-w-none text-xs sm:text-sm text-[#27213A] leading-relaxed whitespace-pre-line space-y-4">
                {page.content}
              </div>

              <div className="mt-10 pt-6 border-t border-[#E8E0F5] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#716A82]">
                <p>Have questions about this policy? Contact our support team.</p>
                {storeSettings?.email && (
                  <a
                    href={`mailto:${storeSettings.email}`}
                    className="font-bold text-[#7042D2] hover:text-[#8B5CF6] underline"
                  >
                    ✉️ {storeSettings.email}
                  </a>
                )}
              </div>
            </article>
          )}
        </main>
      </div>

      <footer className="bg-[#27213A] text-white py-8 border-t border-[#E8E0F5]/20 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-[#EDE5FF]/60">
          <p>© {new Date().getFullYear()} {storeSettings?.store_name || 'Qynova'}. All rights reserved.</p>
        </div>
      </footer>

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onProceedToCheckout={(cartData) => {
          setCheckoutCartData(cartData)
          setIsCartOpen(false)
          setIsCheckoutOpen(true)
        }}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartData={checkoutCartData}
      />
    </div>
  )
}
