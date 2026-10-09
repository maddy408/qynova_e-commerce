import React, { useState, useEffect } from 'react'
import { api, getErrorMessage } from '../lib/api'

export default function ReferralModal({ isOpen, onClose, onShowToast }) {
  const [referralSummary, setReferralSummary] = useState(null)
  const [referralInput, setReferralInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [successData, setSuccessData] = useState(null)
  const [copied, setCopied] = useState(false)

  // Fetch real referral data from PHP API on open
  useEffect(() => {
    if (!isOpen) {
      setSuccessData(null)
      setApplyError('')
      setReferralInput('')
      return
    }

    async function loadReferralData() {
      setIsLoading(true)
      try {
        const [meRes, settingsRes] = await Promise.allSettled([
          api.get('/customers/me'),
          api.get('/referral-settings'),
        ])

        const customerReferral =
          meRes.status === 'fulfilled' && meRes.value?.data?.referral
            ? meRes.value.data.referral
            : null

        const globalSettings =
          settingsRes.status === 'fulfilled' && settingsRes.value?.data?.settings
            ? settingsRes.value.data.settings
            : null

        const rate =
          customerReferral?.reward_percent ??
          (globalSettings?.referrer_discount_percent !== undefined && globalSettings?.referrer_discount_percent !== null
            ? Number(globalSettings.referrer_discount_percent)
            : null)

        setReferralSummary({
          ...globalSettings,
          ...customerReferral,
          reward_percent: rate,
        })
      } catch (err) {
        console.error('Failed to load customer referral summary', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadReferralData()
  }, [isOpen])

  if (!isOpen) return null

  // Copy referral code to clipboard
  const handleCopyCode = () => {
    if (!referralSummary?.referral_code) return
    navigator.clipboard.writeText(referralSummary.referral_code)
    setCopied(true)
    onShowToast?.('Referral code copied to clipboard! 📋')
    setTimeout(() => setCopied(false), 2500)
  }

  // Submit referral code to PHP API
  const handleApplyReferral = async (e) => {
    e.preventDefault()
    const cleanCode = referralInput.trim().toUpperCase()
    if (!cleanCode) {
      setApplyError('Please enter a referral code.')
      return
    }

    setIsApplying(true)
    setApplyError('')

    try {
      // Real API call to PHP REST backend
      const res = await api.post('/customers/referral/apply', {
        referral_code: cleanCode,
      })

      // Backend response determines success
      if (res.data?.success) {
        setSuccessData(res.data)
        // Refresh customer referral details from database
        const meRes = await api.get('/customers/me')
        if (meRes.data?.referral) {
          setReferralSummary(meRes.data.referral)
        }
      }
    } catch (err) {
      // Backend error response from PHP/MySQL
      const msg = getErrorMessage(err, 'Failed to apply referral code.')
      setApplyError(msg)
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-purple-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* SUCCESS POPUP (Renders ONLY on REAL successful response from PHP backend) */}
        {successData ? (
          <div className="p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-pink-100 text-pink-700 flex items-center justify-center text-3xl shadow-inner">
              🎉
            </div>
            
            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-pink-600 bg-pink-50 px-3 py-1 rounded-full">
                Reward Activated
              </span>
              <h3 className="text-2xl font-black text-purple-950 pt-2">
                Referral Successful!
              </h3>
            </div>

            <div className="bg-purple-50/80 border border-purple-200/80 rounded-2xl p-4 sm:p-5 space-y-2 text-left shadow-xs">
              <div className="flex items-center gap-2 text-purple-900 font-extrabold text-sm sm:text-base">
                <span className="text-lg">✨</span>
                <span>You received <span className="text-[#EC4899] font-black">{successData.referred_discount_percent}% OFF</span></span>
              </div>
              <div className="flex items-center gap-2 text-purple-800/90 font-semibold text-xs sm:text-sm pt-1 border-t border-purple-200/60">
                <span className="text-lg">🎁</span>
                <span>Your friend ({successData.referrer_name}) received <span className="text-[#6B21A8] font-bold">{successData.referrer_discount_percent}% OFF</span></span>
              </div>
            </div>

            <button
              onClick={() => {
                setSuccessData(null)
                onClose()
              }}
              className="w-full py-3.5 rounded-full bg-gradient-to-r from-[#6B21A8] to-[#9333EA] hover:brightness-110 active:scale-98 text-white font-black text-sm tracking-wide shadow-lg shadow-purple-950/20 cursor-pointer transition-all"
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          /* REGULAR REFER & EARN MODAL */
          <div>
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-[#3B0764] to-[#6B21A8] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🎁</span>
                <div>
                  <h3 className="text-base font-black tracking-tight leading-tight">
                    Refer & Earn
                  </h3>
                  <p className="text-[11px] text-purple-200 font-medium">
                    Share your code & get {referralSummary?.reward_percent ? `${referralSummary.reward_percent}%` : 'special rewards'} OFF each!
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {isLoading ? (
                <div className="py-8 text-center text-xs font-bold text-purple-700 animate-pulse">
                  Loading referral details from database...
                </div>
              ) : (
                <>
                  {/* Your Unique Referral Code */}
                  <div className="space-y-2">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-purple-900">
                      Your Unique Referral Code
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-purple-50/80 border-2 border-dashed border-purple-300 rounded-2xl py-2.5 px-4 text-center font-mono font-black text-lg text-purple-950 tracking-wider">
                        {referralSummary?.referral_code || 'N/A'}
                      </div>
                      <button
                        onClick={handleCopyCode}
                        className="px-4 py-3 rounded-2xl bg-[#6B21A8] hover:bg-[#581C87] text-white text-xs font-black shrink-0 transition-all cursor-pointer shadow-sm active:scale-95"
                      >
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Share this code with friends. When they apply it, you both get {referralSummary?.reward_percent ? `${referralSummary.reward_percent}%` : 'special rewards'} OFF!
                    </p>
                  </div>

                  {/* Apply a Referral Code Form (For Customer B or new referrals) */}
                  <div className="pt-3 border-t border-purple-100 space-y-2">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-purple-900">
                      Have a friend's referral code?
                    </label>
                    <form onSubmit={handleApplyReferral} className="flex gap-2">
                      <input
                        type="text"
                        value={referralInput}
                        onChange={(e) => {
                          setReferralInput(e.target.value)
                          if (applyError) setApplyError('')
                        }}
                        placeholder="Enter referral code"
                        className="flex-1 h-10 px-3.5 rounded-xl border border-purple-200 text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-purple-600 uppercase tracking-wider bg-purple-50/30"
                      />
                      <button
                        type="submit"
                        disabled={isApplying}
                        className="px-5 h-10 rounded-xl bg-pink-600 hover:bg-pink-700 active:scale-95 text-white text-xs font-black transition-all cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        {isApplying ? 'Applying...' : 'Apply Code'}
                      </button>
                    </form>

                    {applyError && (
                      <p className="text-xs font-bold text-red-600 pt-1 flex items-center gap-1">
                        <span>⚠️</span>
                        <span>{applyError}</span>
                      </p>
                    )}
                  </div>

                  {/* Customer's Referral Rewards from Database */}
                  {referralSummary?.rewards && referralSummary.rewards.length > 0 && (
                    <div className="pt-3 border-t border-purple-100 space-y-2">
                      <label className="block text-[11px] font-black uppercase tracking-wider text-purple-900">
                        Your Earned Rewards ({referralSummary.rewards.length})
                      </label>
                      <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                        {referralSummary.rewards.map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs font-bold"
                          >
                            <span className="text-emerald-900">
                              🎁 {r.discount_percent}% OFF ({r.reward_side})
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-200 text-emerald-800 text-[10px] font-black uppercase">
                              {r.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
