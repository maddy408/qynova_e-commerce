import React, { useRef } from 'react'
import { PAYMENT_METHODS, type PaymentMethodCode } from '../constants/paymentMethods'
import { CheckIcon } from './Icons'

// Accessible SVG Icons for each payment method
function CashIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6H2.25m0 0v10.5m0-10.5h19.5m0 0v10.5m0 0h-.75a.75.75 0 0 1-.75-.75V15m-18 3.75h19.5m-19.5 0a2.25 2.25 0 0 0 2.25 2.25h15a2.25 2.25 0 0 0 2.25-2.25M6.75 12a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0Z" />
    </svg>
  )
}

function UpiIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.008v.008H6.75V6.75ZM6.75 16.5h.008v.008H6.75V16.5ZM16.5 6.75h.008v.008H16.5V6.75ZM13.5 13.5h3.75v3.75H13.5zM17.25 17.25h3v3h-3zM20.25 13.5h.008v.008h-.008z" />
    </svg>
  )
}

function CardIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-6.75-10.5h16.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5v-9a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
  )
}

function NetBankingIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.5M4.5 21V10.5M2.25 21h19.5" />
    </svg>
  )
}

function CreditIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5h3m-1.5-1.5v3" />
    </svg>
  )
}

function GooglePayIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
    </svg>
  )
}

function getMethodIcon(code: PaymentMethodCode, className = 'w-5 h-5') {
  switch (code) {
    case 'CASH':
      return <CashIcon className={className} />
    case 'UPI':
      return <UpiIcon className={className} />
    case 'CARD':
      return <CardIcon className={className} />
    case 'NETBANKING':
      return <NetBankingIcon className={className} />
    case 'CREDIT':
      return <CreditIcon className={className} />
    case 'GOOGLE_PAY':
      return <GooglePayIcon className={className} />
    default:
      return <CashIcon className={className} />
  }
}

interface PaymentMethodButtonsProps {
  value: string
  onChange: (method: PaymentMethodCode) => void
  isCreditAllowed?: boolean
  creditDisabledReason?: string
  className?: string
}

export function PaymentMethodButtons({
  value,
  onChange,
  isCreditAllowed = true,
  creditDisabledReason = 'Credit is available for registered customers only',
  className = '',
}: PaymentMethodButtonsProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Normalize current selected code
  const currentCode = (value ? value.trim().toUpperCase() : 'CASH') as PaymentMethodCode

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' ', 'Enter'].includes(e.key)) {
      return
    }

    const available = PAYMENT_METHODS.filter((m) => m.code !== 'CREDIT' || isCreditAllowed)
    if (available.length === 0) return

    const currentIndex = available.findIndex((m) => m.code === currentCode)
    const validIndex = currentIndex >= 0 ? currentIndex : 0

    let nextIndex = validIndex

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIndex = (validIndex + 1) % available.length
      onChange(available[nextIndex].code)
      focusButton(available[nextIndex].code)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIndex = (validIndex - 1 + available.length) % available.length
      onChange(available[nextIndex].code)
      focusButton(available[nextIndex].code)
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(available[0].code)
      focusButton(available[0].code)
    } else if (e.key === 'End') {
      e.preventDefault()
      const last = available[available.length - 1]
      onChange(last.code)
      focusButton(last.code)
    } else if (e.key === ' ' || e.key === 'Enter') {
      // Space or Enter on the focused button selects it
      const activeEl = document.activeElement as HTMLElement | null
      const targetCode = activeEl?.getAttribute('data-method-code') as PaymentMethodCode | undefined
      if (targetCode && (targetCode !== 'CREDIT' || isCreditAllowed)) {
        e.preventDefault()
        onChange(targetCode)
      }
    }
  }

  function focusButton(code: string) {
    setTimeout(() => {
      const btn = containerRef.current?.querySelector<HTMLButtonElement>(`button[data-method-code="${code}"]`)
      btn?.focus()
    }, 10)
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-xs font-bold text-slate-700">
        Select Payment Method <span className="text-red-500">*</span>
      </label>

      <div
        ref={containerRef}
        role="radiogroup"
        aria-label="Payment Method"
        onKeyDown={handleKeyDown}
        className="grid grid-cols-2 sm:grid-cols-3 gap-2.5"
      >
        {PAYMENT_METHODS.map((method) => {
          const isSelected = currentCode === method.code
          const isDisabled = method.code === 'CREDIT' && !isCreditAllowed

          return (
            <button
              key={method.code}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={isDisabled}
              disabled={isDisabled}
              tabIndex={isSelected ? 0 : -1}
              data-method-code={method.code}
              onClick={() => {
                if (!isDisabled) {
                  onChange(method.code)
                }
              }}
              title={isDisabled ? creditDisabledReason : method.description || method.label}
              className={`relative flex items-center justify-between min-h-[48px] px-3.5 py-2.5 rounded-xl text-left transition-all cursor-pointer select-none border focus-visible:ring-2 focus-visible:ring-[#7E1235] focus-visible:outline-hidden ${
                isDisabled
                  ? 'opacity-40 bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  : isSelected
                  ? 'border-[#7E1235] bg-[#7E1235]/8 text-[#7E1235] ring-1.5 ring-[#7E1235] shadow-xs'
                  : 'border-slate-200 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0 pr-1">
                <span
                  className={`shrink-0 transition-colors ${
                    isDisabled ? 'text-slate-400' : isSelected ? 'text-[#7E1235]' : 'text-slate-600'
                  }`}
                >
                  {getMethodIcon(method.code, 'w-5 h-5')}
                </span>
                <span className="text-xs font-black tracking-tight truncate">
                  {method.label}
                </span>
              </div>

              {/* Selected indicator: Checkmark icon with ring border */}
              {isSelected ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#7E1235] text-white shadow-2xs">
                  <CheckIcon className="h-3.5 w-3.5 stroke-[3]" />
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-50 opacity-60" />
              )}
            </button>
          )
        })}
      </div>

      {!isCreditAllowed && (
        <p className="text-[11px] text-slate-500 font-medium">
          💡 <span className="font-semibold text-slate-700">Credit</span> is disabled for Walk-in customers. Select or register a customer to enable Credit.
        </p>
      )}
    </div>
  )
}
