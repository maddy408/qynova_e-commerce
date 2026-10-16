import React, { useState } from 'react'
import { FiCheck } from 'react-icons/fi'

export default function NewsletterBar() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email || !email.includes('@')) return
    setSubscribed(true)
    setTimeout(() => {
      setEmail('')
      setSubscribed(false)
    }, 3500)
  }

  return (
    <section className="w-full bg-[#ede9fe] text-slate-900 py-6 sm:py-7 px-3 sm:px-6 lg:px-8 xl:px-12 select-none border-y border-[#ddd6fe]">
      <div className="w-full flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left Side: Icon & Copy */}
        <div className="flex items-center gap-3.5 text-left">
          <div className="w-11 h-11 rounded-xl bg-white border border-[#ddd6fe] flex items-center justify-center shrink-0 shadow-2xs">
            <svg className="w-5.5 h-5.5 text-[#7c3aed]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black tracking-tight leading-tight text-slate-900">
              Stay Updated with Best Offers
            </h3>
            <p className="text-[11px] sm:text-xs text-[#6d28d9] mt-0.5">
              Subscribe to our store alerts and never miss weekly savings & coupons.
            </p>
          </div>
        </div>

        {/* Right Side: Subscription Form */}
        <form onSubmit={handleSubmit} className="w-full md:w-auto flex items-center gap-2 max-w-md">
          {subscribed ? (
            <div className="px-4 py-2.5 rounded-xl bg-white text-[#6d28d9] border border-[#ddd6fe] text-xs font-bold flex items-center gap-2 shadow-2xs">
              <FiCheck className="w-4 h-4 text-emerald-600" />
              <span>Subscribed successfully! Thank you.</span>
            </div>
          ) : (
            <>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address..."
                required
                className="w-full md:w-72 h-10 px-3.5 rounded-lg bg-white text-slate-800 placeholder-slate-400 text-xs border border-[#ddd6fe] focus:outline-none focus:ring-1 focus:ring-black focus:border-black shadow-xs"
              />
              <button
                type="submit"
                className="h-10 px-5 rounded-lg bg-black hover:bg-neutral-800 text-white text-xs font-bold tracking-wide uppercase transition-all shadow-xs cursor-pointer shrink-0 active:scale-95"
              >
                Subscribe
              </button>
            </>
          )}
        </form>
      </div>
    </section>
  )
}
