import React from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../routes/routes'
import { resolveImageUrl } from '../lib/api'
import { FiPhone, FiMapPin, FiMail } from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa6'
import { LuSparkles } from 'react-icons/lu'

export default function GroceryFooter({
  storeSettings = null,
  categories = [],
}) {
  const storeName = storeSettings?.store_name || 'Shop with Adam'
  const storeTagline = storeSettings?.tagline || 'FRESH • DAILY • ESSENTIALS'
  const storeDesc =
    storeSettings?.description ||
    'Your trusted neighborhood supermarket delivering farm-fresh fruits, vegetables, dairy, pantry staples, and daily household essentials right to your doorstep.'
  const phone = storeSettings?.phone || '+91 98765 01234'
  const whatsappNum = (storeSettings?.whatsapp_number || storeSettings?.phone || '919876501234').replace(/[^0-9]/g, '')
  const email = storeSettings?.email || 'support@shopwithadam.com'
  const address = storeSettings?.address
    ? `${storeSettings.address}${storeSettings.city ? `, ${storeSettings.city}` : ''}`
    : '123 Market Road, Main City Bazaar'

  return (
    <footer className="w-full bg-[#0a0a0a] text-white border-t border-zinc-800 select-none">
      
      {/* 1. GROCERY CUSTOMER SUPPORT ASSISTANCE STRIP */}
      <div className="w-full py-12 sm:py-16 border-b border-zinc-800/80 relative overflow-hidden bg-gradient-to-r from-[#121214] via-[#0a0a0a] to-[#121214]">
        {/* Soft decorative blur circles */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-900/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-900/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="space-y-3 text-left max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 text-purple-300 border border-zinc-800 text-[11px] font-sans font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span>SUPERMARKET CUSTOMER CARE</span>
            </div>

            <h3 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight leading-tight">
              Need Assistance with Your Daily Grocery Order?
            </h3>

            <p className="font-sans text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Our friendly customer support team is available via WhatsApp and phone for immediate order assistance, delivery tracking, and fresh item inquiries.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3.5 shrink-0">
            {/* WhatsApp Chat Button */}
            <a
              href={`https://wa.me/${whatsappNum}?text=Hello%2C%20I%20have%20an%20inquiry%20regarding%20my%20grocery%20order.`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-7 py-3 rounded-full bg-[#6C4EFF] hover:bg-[#5839EE] text-white font-sans text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-[0_6px_20px_rgba(108,78,255,0.35)] active:scale-95 transition-all cursor-pointer"
            >
              <FaWhatsapp className="w-4 h-4" />
              <span>Chat on WhatsApp</span>
            </a>

            {/* Phone Call Button */}
            <a
              href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
              className="px-7 py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 hover:border-zinc-600 font-sans text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs hover:shadow transition-all active:scale-95 cursor-pointer"
            >
              <FiPhone className="w-4 h-4 text-purple-400" />
              <span>{phone}</span>
            </a>
          </div>
        </div>
      </div>

      {/* 2. MAIN 5-COLUMN EDITORIAL FOOTER */}
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          
          {/* Column 1 & 2: Store Identity & Description */}
          <div className="lg:col-span-2 space-y-4">
            <Link to={ROUTES.HOME} className="flex items-center gap-3 group">
              <img
                src={storeSettings?.logo ? resolveImageUrl(storeSettings.logo) : '/images/logo.png'}
                alt={storeName}
                title={storeName}
                className="h-14 sm:h-16 w-auto max-w-[240px] sm:max-w-[280px] object-contain rounded-2xl bg-white/95 p-2 border border-zinc-700 shadow-md group-hover:scale-105 transition-transform"
                onError={(e) => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = '/images/logo.png'
                }}
              />
            </Link>

            <p className="font-sans text-xs sm:text-[13px] text-zinc-400 leading-relaxed max-w-sm pt-1">
              {storeDesc}
            </p>
          </div>

          {/* Column 3: CATEGORIES & ESSENTIALS */}
          <div className="space-y-3">
            <h4 className="text-[12px] font-sans font-bold uppercase tracking-[0.16em] text-white">
              Shop Essentials
            </h4>
            <ul className="space-y-2 text-xs font-sans text-zinc-400">
              <li>
                <Link to={ROUTES.PRODUCTS_BY_SECTION('best_sellers')} className="hover:text-white transition-colors">
                  Best Selling Groceries
                </Link>
              </li>
              <li>
                <Link to={ROUTES.PRODUCTS_BY_SECTION('new_arrivals')} className="hover:text-white transition-colors">
                  Fresh Daily Arrivals
                </Link>
              </li>
              <li>
                <Link to={ROUTES.PRODUCTS_BY_SECTION('featured')} className="hover:text-white transition-colors">
                  Featured Supermarket Deals
                </Link>
              </li>
              <li>
                <Link to={ROUTES.PRODUCTS_BY_SECTION('deals')} className="hover:text-white transition-colors">
                  Offers & Combo Packs
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: CUSTOMER SUPPORT & POLICIES */}
          <div className="space-y-3">
            <h4 className="text-[12px] font-sans font-bold uppercase tracking-[0.16em] text-white">
              Customer Service
            </h4>
            <ul className="space-y-2 text-xs font-sans text-zinc-400">
              <li>
                <Link to={ROUTES.POLICY_SHIPPING} className="hover:text-white transition-colors">
                  Express Delivery Policy
                </Link>
              </li>
              <li>
                <Link to={ROUTES.POLICY_RETURNS} className="hover:text-white transition-colors">
                  Returns & Refund Guarantee
                </Link>
              </li>
              <li>
                <Link to={ROUTES.POLICY_PRIVACY} className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to={ROUTES.POLICY_TERMS_PAGE} className="hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 5: STORE CONTACT & LOCATION */}
          <div className="space-y-3">
            <h4 className="text-[12px] font-sans font-bold uppercase tracking-[0.16em] text-white">
              Store & Support
            </h4>
            <div className="space-y-2 text-xs font-sans text-zinc-400">
              <p className="flex items-start gap-2">
                <FiMapPin className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                <span>{address}</span>
              </p>
              <p className="flex items-center gap-2">
                <FiPhone className="w-4 h-4 text-purple-400 shrink-0" />
                <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} className="hover:text-white">
                  {phone}
                </a>
              </p>
              <p className="flex items-center gap-2">
                <FiMail className="w-4 h-4 text-purple-400 shrink-0" />
                <a href={`mailto:${email}`} className="hover:text-white">
                  {email}
                </a>
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* 3. BLACK BOTTOM COPYRIGHT STRIP */}
      <div className="w-full bg-black text-white/90 py-4 border-t border-zinc-900 select-none">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-sans">
          <p className="text-zinc-500">
            © {new Date().getFullYear()} {storeSettings?.copyright_text || `${storeName}. All rights reserved.`}
          </p>
          <p className="font-medium text-zinc-400 flex items-center gap-2">
            <span>100% Farm Fresh & Genuine</span>
            <span className="text-zinc-700">•</span>
            <span>Best Price Assurance</span>
            <span className="text-zinc-700">•</span>
            <span>Express Doorstep Delivery</span>
          </p>
        </div>
      </div>

    </footer>
  )
}
