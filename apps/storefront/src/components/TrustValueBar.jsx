import React from 'react'
import { FiTruck, FiShield, FiPercent } from 'react-icons/fi'
import { LuLeaf, LuHeadphones } from 'react-icons/lu'

/**
 * Trust & Value Proposition Bar
 * Located directly under the Hero Banner matching KiranaBazaar reference image:
 * 5 key trust badges with soft cyan/primary circle icons and clean typography.
 */
export default function TrustValueBar({ deliverySettings = null }) {
  const freeThreshold = deliverySettings?.free_delivery_threshold != null
    ? Number(deliverySettings.free_delivery_threshold)
    : 499

  const items = [
    {
      icon: <FiTruck className="w-5 h-5 text-[var(--color-primary)] stroke-[2]" />,
      title: 'Free Delivery',
      desc: `On orders above ₹${freeThreshold}`,
    },
    {
      icon: <LuLeaf className="w-5 h-5 text-[var(--color-primary)] stroke-[2]" />,
      title: 'Fresh & Quality',
      desc: '100% Genuine Products',
    },
    {
      icon: <FiShield className="w-5 h-5 text-[var(--color-primary)] stroke-[2]" />,
      title: 'Secure Payments',
      desc: 'Multiple Payment Options',
    },
    {
      icon: <LuHeadphones className="w-5 h-5 text-[var(--color-primary)] stroke-[2]" />,
      title: '24/7 Support',
      desc: "We're here to help",
    },
    {
      icon: <FiPercent className="w-5 h-5 text-[var(--color-primary)] stroke-[2.2]" />,
      title: 'Great Offers',
      desc: 'Save More Every Day',
    },
  ]

  return (
    <section className="w-full select-none pt-2 pb-4">
      <div className="max-w-[1320px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs px-4 py-3.5 sm:py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {items.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-3 ${idx > 0 ? 'sm:pl-4 pt-2 sm:pt-0' : ''}`}
              >
                {/* Circular soft primary/cyan badge */}
                <div className="w-10 h-10 rounded-full bg-[var(--color-primary-tint)] border border-sky-200/60 flex items-center justify-center shrink-0">
                  {item.icon}
                </div>

                <div className="min-w-0">
                  <h4 className="font-sans text-xs sm:text-[13px] font-bold text-[var(--color-text-main)] truncate">
                    {item.title}
                  </h4>
                  <p className="font-sans text-[11px] text-[var(--color-text-muted)] truncate">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
