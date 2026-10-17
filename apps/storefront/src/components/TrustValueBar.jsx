import React from 'react'
import { LuSparkles, LuShieldCheck } from 'react-icons/lu'
import { TbTruckDelivery, TbHeadset } from 'react-icons/tb'

export default function TrustValueBar() {
  const items = [
    {
      icon: <LuShieldCheck className="w-6 h-6 text-[#6C4EFF]" />,
      title: '100% Fresh & Genuine',
      desc: 'Directly sourced from trusted local farms & verified brand distributors',
    },
    {
      icon: <LuSparkles className="w-6 h-6 text-[#6C4EFF]" />,
      title: 'Best Price Guaranteed',
      desc: 'Unbeatable daily supermarket prices, combo deals & festival savings',
    },
    {
      icon: <TbTruckDelivery className="w-6 h-6 text-[#6C4EFF]" />,
      title: 'Express Doorstep Delivery',
      desc: 'Fast 60-minute neighborhood delivery right to your kitchen counter',
    },
    {
      icon: <TbHeadset className="w-6 h-6 text-[#6C4EFF]" />,
      title: '24/7 Dedicated Support',
      desc: 'Instant customer assistance via WhatsApp & phone for all grocery queries',
    },
  ]

  return (
    <section className="w-full bg-[#FAF8FF] border-y border-[#E9DFFF] py-10 sm:py-14 select-none">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="bg-white rounded-[20px] p-6 border border-[#E9DFFF] shadow-[0_4px_20px_rgba(108,78,255,0.03)] hover:shadow-[0_8px_25px_rgba(108,78,255,0.08)] hover:-translate-y-1 transition-all duration-200 flex items-start gap-4"
            >
              <div className="w-12 h-12 rounded-[14px] bg-[#FAF8FF] border border-[#E9DFFF] flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <div>
                <h4 className="font-serif text-[15px] sm:text-base font-bold text-[#1B133F] leading-tight mb-1">
                  {item.title}
                </h4>
                <p className="font-sans text-xs text-[#666666] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
