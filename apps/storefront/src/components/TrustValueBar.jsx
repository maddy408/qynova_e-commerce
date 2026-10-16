import React from 'react'

export default function TrustValueBar() {
  const items = [
    {
      icon: (
        <svg className="w-5 h-5 text-[#7c3aed]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: '100% Genuine',
      desc: 'Curated products handpicked fresh',
    },
    {
      icon: (
        <svg className="w-5 h-5 text-[#7c3aed]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <line x1="2" x2="22" y1="10" y2="10" />
        </svg>
      ),
      title: 'Secure Payments',
      desc: '100% protected UPI & card checkout',
    },
    {
      icon: (
        <svg className="w-5 h-5 text-[#7c3aed]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
      ),
      title: 'Easy Returns',
      desc: 'Instant refund or hassle-free replacement',
    },
    {
      icon: (
        <svg className="w-5 h-5 text-[#7c3aed]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      ),
      title: '24/7 Support',
      desc: 'Dedicated phone & WhatsApp care',
    },
  ]

  return (
    <section className="w-full bg-[#faf5ff] border-y border-[#e9d5ff] py-5 sm:py-6 px-3 sm:px-6 lg:px-8 xl:px-12 select-none">
      <div className="w-full grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white shadow-2xs border border-[#e9d5ff] flex items-center justify-center shrink-0">
              {item.icon}
            </div>
            <div>
              <h4 className="text-xs sm:text-[13px] font-bold text-slate-900 leading-tight">
                {item.title}
              </h4>
              <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
