import React from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../routes/routes'
import { resolveImageUrl } from '../lib/api'
import { FiPhone, FiMapPin, FiMail } from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa6'

export default function GroceryFooter({
  storeSettings = null,
  categories = [],
}) {
  const storeName = storeSettings?.store_name || 'KiranaBazaar'
  const storeTagline = storeSettings?.tagline || 'YOUR TRUSTED NEIGHBORHOOD STORE'
  const storeDesc = storeSettings?.description || 'Your trusted supermarket for trending hair accessories, Korean jewellery, gifts, plush toys, and beauty essentials at unmatched prices.'
  const phone = storeSettings?.phone || '+91 98765 01234'
  const whatsappNum = (storeSettings?.whatsapp_number || storeSettings?.phone || '919876501234').replace(/[^0-9]/g, '')
  const email = storeSettings?.email || 'support@kiranabazaar.in'
  const address = storeSettings?.address ? `${storeSettings.address}${storeSettings.city ? `, ${storeSettings.city}` : ''}` : 'Plot 42, Commercial Avenue, Sector 5'

  return (
    <footer className="w-full bg-white text-slate-900 border-t border-[#e9d5ff] select-none">
      
      {/* 1. NEED HELP WITH ORDERS OR CUSTOM GIFTS? */}
      <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-10 sm:py-12 border-b border-[#e9d5ff] relative overflow-hidden bg-gradient-to-r from-[#faf5ff] via-[#ffffff] to-[#f5f3ff]">
        {/* Soft decorative circles */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#ede9fe]/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#f5f3ff]/60 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full flex flex-col lg:flex-row items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 text-left max-w-2xl">
            {/* 24/7 CUSTOMER CARE Pill Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ede9fe] text-[#6d28d9] border border-[#ddd6fe] text-[10px] font-black uppercase tracking-wider shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7c3aed] animate-pulse" />
              <span>24/7 CUSTOMER CARE</span>
            </div>

            {/* Bold Headline */}
            <h3 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight leading-tight">
              Need Help with Orders or Custom Gifts?
            </h3>

            {/* Subtitle */}
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Our customer care team is available on WhatsApp and phone to assist with product inquiries, bulk orders, return requests, and gift customization.
            </p>
          </div>

          {/* Action Pill Buttons */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* WhatsApp Chat Button (Black button with white text) */}
            <a
              href={`https://wa.me/${whatsappNum}?text=Hi%2C%20I%20have%20an%20inquiry%20regarding%20products`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-2.5 rounded-full bg-black hover:bg-neutral-800 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <FaWhatsapp className="w-4.5 h-4.5" />
              <span>Chat on WhatsApp</span>
            </a>

            {/* Phone Call Pill Button */}
            <a
              href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
              className="px-6 py-2.5 rounded-full bg-white hover:bg-neutral-50 text-black border border-slate-300 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-2xs hover:shadow transition-all active:scale-95 cursor-pointer"
            >
              <FiPhone className="w-4 h-4 text-slate-700" />
              <span>{phone}</span>
            </a>
          </div>
        </div>
      </div>

      {/* 2. MAIN 5-COLUMN FOOTER */}
      <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-10 sm:py-12 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          
          {/* Column 1 & 2: Store Branding & Description */}
          <div className="lg:col-span-2 space-y-3">
            <Link to={ROUTES.HOME} className="flex items-center gap-2.5 group">
              {storeSettings?.logo ? (
                <img
                  src={resolveImageUrl(storeSettings.logo)}
                  alt={storeName}
                  className="w-9 h-9 rounded-xl object-contain shadow-2xs"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center font-black text-sm shadow-2xs">
                  {storeName.charAt(0) || 'K'}
                </div>
              )}
              <div>
                <span className="text-xl font-black text-slate-900 tracking-tight block leading-tight">
                  {storeName}
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">
                  {storeTagline}
                </span>
              </div>
            </Link>

            <p className="text-xs text-slate-600 leading-relaxed max-w-sm pt-1">
              {storeDesc}
            </p>
          </div>

          {/* Column 3: COLLECTIONS */}
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-900">
              Collections
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-600">
              <li>
                <Link to={ROUTES.PRODUCTS_BY_SECTION('best_sellers')} className="hover:text-black transition-colors">
                  Best Sellers
                </Link>
              </li>
              <li>
                <Link to={ROUTES.PRODUCTS_BY_SECTION('new_arrivals')} className="hover:text-black transition-colors">
                  New Arrivals
                </Link>
              </li>
              <li>
                <Link to={ROUTES.PRODUCTS_BY_SECTION('featured')} className="hover:text-black transition-colors">
                  Featured Selections
                </Link>
              </li>
              <li>
                <Link to={ROUTES.PRODUCTS_BY_SECTION('deals')} className="hover:text-black transition-colors">
                  Flash Deals
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: CUSTOMER CARE */}
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-900">
              Customer Care
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-600">
              <li>
                <Link to={ROUTES.POLICY_SHIPPING} className="hover:text-black transition-colors">
                  Shipping Policy
                </Link>
              </li>
              <li>
                <Link to={ROUTES.POLICY_RETURNS} className="hover:text-black transition-colors">
                  Returns & Exchange
                </Link>
              </li>
              <li>
                <Link to={ROUTES.POLICY_PRIVACY} className="hover:text-black transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to={ROUTES.POLICY_TERMS_PAGE} className="hover:text-black transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 5: GET IN TOUCH */}
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-900">
              Get in Touch
            </h4>
            <div className="space-y-2 text-xs text-slate-600">
              <p className="flex items-start gap-1.5">
                <FiMapPin className="w-3.5 h-3.5 text-[#7c3aed] mt-0.5 shrink-0" />
                <span>{address}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <FiPhone className="w-3.5 h-3.5 text-[#7c3aed] shrink-0" />
                <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} className="hover:text-black">
                  {phone}
                </a>
              </p>
              <p className="flex items-center gap-1.5">
                <FiMail className="w-3.5 h-3.5 text-[#7c3aed] shrink-0" />
                <a href={`mailto:${email}`} className="hover:text-black">
                  {email}
                </a>
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* 3. SOLID BLACK BOTTOM STRIP */}
      <div className="w-full bg-black text-white py-3 px-3 sm:px-6 lg:px-8 xl:px-12 select-none">
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] font-medium">
          <p>
            © {new Date().getFullYear()} {storeSettings?.copyright_text || `${storeName} Hub. All rights reserved.`}
          </p>
          <p className="font-semibold text-white/95">
            100% Secure Checkout • Express Shipping • Quality Assured
          </p>
        </div>
      </div>

    </footer>
  )
}
