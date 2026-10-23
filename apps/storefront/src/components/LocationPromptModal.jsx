import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { FiMapPin, FiX, FiCheck, FiNavigation, FiAlertCircle } from 'react-icons/fi'
import { useDeliveryLocation } from '../hooks/useDeliveryLocation'
import { isLocationPromptDismissed, setLocationPromptDismissed } from '../services/locationService'

export default function LocationPromptModal() {
  const routerLocation = useLocation()
  const { location, detectLocation, isLoading, error, setError } = useDeliveryLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [successInfo, setSuccessInfo] = useState(null)

  // Do not show location prompt modal on auth, profile, orders, or checkout screens
  const isExcludedRoute =
    routerLocation.pathname.startsWith('/login') ||
    routerLocation.pathname.startsWith('/register') ||
    routerLocation.pathname.startsWith('/profile') ||
    routerLocation.pathname.startsWith('/orders')

  useEffect(() => {
    if (isExcludedRoute) {
      setIsOpen(false)
      return
    }

    // Only prompt if no location is stored and prompt was not dismissed during this browser session
    if (!location && !isLocationPromptDismissed()) {
      const timer = setTimeout(() => {
        setIsOpen(true)
      }, 1200)
      return () => clearTimeout(timer)
    }
  }, [location, isExcludedRoute])

  if (isExcludedRoute || !isOpen) return null

  const handleDismiss = () => {
    setIsOpen(false)
    setLocationPromptDismissed()
  }

  const handleAllowLocation = async () => {
    setError(null)
    setSuccessInfo(null)
    try {
      const detected = await detectLocation()
      setSuccessInfo(detected)
      setLocationPromptDismissed()
      // Auto close after brief celebration so user can see coordinates
      setTimeout(() => {
        setIsOpen(false)
      }, 1600)
    } catch (err) {
      // error is handled by hook
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-[#E9DFFF] text-[var(--color-text-main)] overflow-hidden animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200">
        
        {/* Decorative Top Accent Glow */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#6C4EFF] via-[#8B5CF6] to-[#EC4899]" />

        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 flex items-center justify-center text-xs transition-colors cursor-pointer"
          aria-label="Close"
        >
          <FiX className="w-4 h-4" />
        </button>

        {successInfo ? (
          /* SUCCESS STATE WITH LATITUDE AND LONGITUDE DISPLAY */
          <div className="text-center py-2 space-y-3 animate-in zoom-in-90 duration-200">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl shadow-inner">
              <FiCheck className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Location Enabled
              </span>
              <h3 className="text-base font-extrabold text-[#1B133F] mt-1.5">
                {successInfo.displayTitle || successInfo.city}
              </h3>
              <p className="text-xs text-[#666666] font-medium truncate px-4">
                {successInfo.formattedAddress}
              </p>
            </div>

            {/* Latitude & Longitude Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FAF8FF] border border-[#E9DFFF] text-[11px] font-mono font-semibold text-[#6C4EFF]">
              <FiNavigation className="w-3.5 h-3.5 text-[#6C4EFF] shrink-0" />
              <span>
                Lat: {successInfo.latitude?.toFixed(4)}, Lng: {successInfo.longitude?.toFixed(4)}
              </span>
            </div>

            {typeof successInfo.accuracy === 'number' && (
              <p className={`text-[10px] font-bold ${successInfo.accuracy > 100 ? 'text-amber-600' : 'text-emerald-600'}`}>
                Accuracy: ±{Math.round(successInfo.accuracy)}m
                {successInfo.accuracy > 100 ? ' — you can adjust the pin manually if this looks off' : ''}
              </p>
            )}
          </div>
        ) : (
          /* PROMPT STATE */
          <div className="space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="relative w-12 h-12 rounded-2xl bg-[#FAF8FF] border border-[#E9DFFF] text-[#6C4EFF] flex items-center justify-center shrink-0 shadow-xs">
                <FiMapPin className="w-6 h-6 text-[#6C4EFF] animate-bounce" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-ping" />
              </div>

              <div className="pr-6">
                <h3 className="text-base sm:text-lg font-black text-[#1B133F] leading-snug">
                  Enable Your Location
                </h3>
                <p className="text-xs text-[#666666] mt-0.5 leading-relaxed">
                  Allow location access to check instant delivery options, local grocery stock, and auto-fill your delivery address.
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-start gap-2">
                <FiAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleAllowLocation}
                disabled={isLoading}
                className="w-full h-11 rounded-full bg-gradient-to-r from-[#6C4EFF] to-[#4B2AC5] hover:from-[#5A3EE0] hover:to-[#3F22AA] text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-98 disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span>Detecting Location...</span>
                  </>
                ) : (
                  <>
                    <FiNavigation className="w-4 h-4" />
                    <span>Allow & Detect Location</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                className="w-full py-2 text-[11px] font-bold text-[#666666] hover:text-[#1B133F] transition-colors cursor-pointer text-center"
              >
                Enter Manually or Later
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
