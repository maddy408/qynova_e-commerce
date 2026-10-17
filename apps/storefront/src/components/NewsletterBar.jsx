import React, { useState } from 'react'
import { FiCheck, FiMail, FiArrowRight } from 'react-icons/fi'

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
    }, 4000)
  }

  return (
    <section className="w-full bg-[#F3EDFF]/70 text-[#1B133F] py-14 sm:py-20 select-none border-b border-[#E9DFFF]">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-[32px] p-8 sm:p-12 lg:p-16 border border-[#E9DFFF] shadow-[0_12px_40px_rgba(108,78,255,0.06)] flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-14">
          
          {/* Left Side: Icon & Copy */}
          <div className="space-y-3 max-w-xl text-left">
            <span className="text-[12px] font-sans font-bold uppercase tracking-[0.2em] text-[#6C4EFF] block">
              WEEKLY SAVINGS & OFFERS
            </span>
            <h3 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1B133F] tracking-tight leading-tight">
              Stay Updated with Supermarket Deals & Weekly Savings
            </h3>
            <p className="font-sans text-sm sm:text-base text-[#666666] leading-relaxed">
              Receive exclusive discount coupons, weekend fresh stock alerts, and seasonal festival offers delivered directly to your inbox.
            </p>
          </div>

          {/* Right Side: Subscription Form */}
          <div className="w-full lg:w-auto shrink-0">
            {subscribed ? (
              <div className="px-6 py-4 rounded-full bg-[#FAF8FF] text-[#6C4EFF] border border-[#E9DFFF] text-sm font-sans font-semibold flex items-center gap-2.5 shadow-xs">
                <FiCheck className="w-4 h-4 text-[#10B981] stroke-[2.5]" />
                <span>Thank you for subscribing! Your exclusive discount voucher is on its way.</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-80">
                  <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#BFA2FF]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address..."
                    required
                    className="w-full h-12 pl-11 pr-4 rounded-full bg-[#FAF8FF] text-[#1B133F] placeholder-[#666666]/60 text-xs sm:text-sm font-sans border border-[#E9DFFF] focus:outline-none focus:border-[#6C4EFF] focus:bg-white transition-all shadow-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full sm:w-auto h-12 px-7 rounded-full bg-[#6C4EFF] hover:bg-[#4B2AC5] text-white text-xs sm:text-sm font-sans font-semibold tracking-wide transition-all shadow-[0_6px_20px_rgba(108,78,255,0.3)] active:scale-95 cursor-pointer flex items-center justify-center gap-2 shrink-0"
                >
                  <span>Subscribe</span>
                  <FiArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
            <p className="text-[11px] font-sans text-[#666666] mt-3 text-left">
              We respect your privacy. Unsubscribe at any time with one click.
            </p>
          </div>

        </div>
      </div>
    </section>
  )
}
