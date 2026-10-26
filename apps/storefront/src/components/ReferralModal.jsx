import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiGift, FiCheck, FiX, FiInfo, FiAlertCircle, FiLogIn, FiCopy } from 'react-icons/fi'
import { LuSparkles } from 'react-icons/lu'
import { FaWhatsapp } from 'react-icons/fa6'
import { api, getErrorMessage, getCustomerToken, getStoredCustomer } from '../lib/api'
import { ROUTES } from '../routes/routes'

export default function ReferralModal({ isOpen, onClose, onShowToast }) {
  const navigate = useNavigate()
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
        const token = getCustomerToken()
        const storedCustomer = getStoredCustomer()

        const [meRes, settingsRes] = await Promise.allSettled([
          token ? api.get('/customers/me') : Promise.reject(new Error('No customer token')),
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
            : 10)

        // Determine referral code: from backend, or fallback from cached customer, or null if guest
        let code = null
        if (token) {
          code = customerReferral?.referral_code || null
          if (!code && storedCustomer) {
            const cleanName = storedCustomer.name ? storedCustomer.name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) : 'ADAMS'
            code = `${cleanName}${storedCustomer.id || '40'}`
          }
          if (code === 'N/A') code = null
        }

        setReferralSummary({
          ...globalSettings,
          ...customerReferral,
          referral_code: code,
          reward_percent: rate,
          isLoggedIn: !!token,
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
    onShowToast?.('Referral code copied to clipboard!')
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

    const token = getCustomerToken()
    if (!token) {
      setApplyError('Please login to apply your friend\'s referral code.')
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
          setReferralSummary((prev) => ({
            ...prev,
            ...meRes.data.referral,
            isLoggedIn: true,
          }))
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
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-[var(--color-border-subtle)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* SUCCESS POPUP (Renders ONLY on REAL successful response from PHP backend) */}
        {successData ? (
          <div className="p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-pink-100 text-pink-700 flex items-center justify-center shadow-inner">
              <LuSparkles className="w-8 h-8 text-pink-600" />
            </div>
            
            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-pink-600 bg-pink-50 px-3 py-1 rounded-full">
                Reward Activated
              </span>
              <h3 className="text-2xl font-black text-purple-950 pt-2">
                Referral Successful!
              </h3>
            </div>

            <div className="bg-purple-50/80 border border-[var(--color-border-subtle)]/80 rounded-2xl p-4 sm:p-5 space-y-2 text-left shadow-xs">
              <div className="flex items-center gap-2 text-[var(--color-text-main)] font-extrabold text-sm sm:text-base">
                <LuSparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span>You received <span className="text-pink-600 font-black">{successData.referred_discount_percent}% OFF</span></span>
              </div>
              <div className="flex items-center gap-2 text-purple-800/90 font-semibold text-xs sm:text-sm pt-1 border-t border-[var(--color-border-subtle)]/60">
                <FiGift className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Your friend ({successData.referrer_name}) received <span className="text-purple-900 font-bold">{successData.referrer_discount_percent}% OFF</span></span>
              </div>
            </div>

            <button
              onClick={() => {
                setSuccessData(null)
                onClose()
              }}
              className="w-full py-3.5 rounded-full bg-gradient-to-r from-[#6C4EFF] to-[#9333EA] hover:brightness-110 active:scale-98 text-white font-black text-sm tracking-wide shadow-lg shadow-purple-950/20 cursor-pointer transition-all"
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          /* REGULAR REFER & EARN MODAL */
          <div>
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-pink-300">
                  <FiGift className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight leading-tight">
                    Refer & Earn
                  </h3>
                  <p className="text-[11px] text-purple-200 font-medium">
                    Share your code & get {referralSummary?.reward_percent ? `${referralSummary.reward_percent}%` : '10%'} OFF each!
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {isLoading ? (
                <div className="py-8 text-center text-xs font-bold text-purple-700 animate-pulse space-y-2">
                  <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Loading referral details from database...</p>
                </div>
              ) : referralSummary && (referralSummary.is_enabled === 0 || referralSummary.is_enabled === false) ? (
                <div className="py-8 px-4 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl mx-auto shadow-inner">
                    <FiInfo className="w-6 h-6 text-amber-600" />
                  </div>
                  <h4 className="text-sm font-black text-purple-950">
                    Referral Program Currently Unavailable
                  </h4>
                  <p className="text-xs text-gray-500 max-w-xs mx-auto">
                    The referral program is currently disabled. Please check back later!
                  </p>
                </div>
              ) : (
                <>
                  {/* Your Unique Referral Code Section */}
                  {referralSummary?.isLoggedIn && referralSummary.referral_code && referralSummary.referral_code !== 'N/A' ? (
                    <div className="space-y-2.5">
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800">
                        Your Unique Referral Code
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-purple-50/90 border-2 border-dashed border-purple-300 rounded-2xl py-2.5 px-4 text-center font-mono font-black text-lg text-purple-950 tracking-wider shadow-2xs">
                          {referralSummary.referral_code}
                        </div>
                        <button
                          onClick={handleCopyCode}
                          className={`px-4 py-3 rounded-2xl text-xs font-black shrink-0 transition-all cursor-pointer shadow-xs active:scale-95 flex items-center gap-1.5 ${
                            copied ? 'bg-emerald-600 text-white' : 'bg-[#6C4EFF] hover:bg-[#5839EE] text-white'
                          }`}
                        >
                          {copied ? (
                            <>
                              <FiCheck className="w-3.5 h-3.5" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <FiCopy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* WhatsApp Share Action */}
                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                          `Hey! Shop fresh groceries at Adam's Supermarket Melagaram and get ${referralSummary.reward_percent || 10}% OFF using my referral code: ${referralSummary.referral_code}. Shop now at: ${window.location.origin}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 px-3 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-transform active:scale-98"
                      >
                        <FaWhatsapp className="w-4 h-4" />
                        <span>Share on WhatsApp with Friends</span>
                      </a>

                      <p className="text-[11px] text-gray-500 leading-snug">
                        Share this code with friends. When they apply it, you both get {referralSummary?.reward_percent ? `${referralSummary.reward_percent}%` : '10%'} OFF!
                      </p>
                    </div>
                  ) : (
                    /* Guest / Unauthenticated Prompt */
                    <div className="bg-gradient-to-br from-purple-50/90 via-pink-50/60 to-white rounded-2xl p-4 sm:p-5 border border-purple-200/90 text-center space-y-3 shadow-2xs">
                      <div className="w-11 h-11 mx-auto rounded-2xl bg-purple-100 text-[#6C4EFF] flex items-center justify-center shadow-inner">
                        <FiGift className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-extrabold text-slate-900">
                          Sign In to Get Your Referral Code
                        </h4>
                        <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                          Login with your mobile number to get your unique referral code and earn 10% OFF on all supermarket orders!
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          onClose()
                          navigate(ROUTES.LOGIN)
                        }}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#6C4EFF] to-[#9333EA] hover:brightness-110 active:scale-95 text-white font-black text-xs shadow-md shadow-purple-900/20 cursor-pointer transition-all flex items-center justify-center gap-2"
                      >
                        <FiLogIn className="w-4 h-4" />
                        <span>Login / Sign Up to Get Code →</span>
                      </button>
                    </div>
                  )}

                  {/* Apply a Referral Code Form (For Customer B or new referrals) */}
                  <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-2">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-[var(--color-text-main)]">
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
                        className="flex-1 h-10 px-3.5 rounded-xl border border-[var(--color-border-subtle)] text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[var(--color-brand)] uppercase tracking-wider bg-[var(--color-bg-main)]"
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
                      <p className="text-xs font-bold text-red-600 pt-1 flex items-center gap-1.5">
                        <FiAlertCircle className="w-4 h-4 shrink-0" />
                        <span>{applyError}</span>
                      </p>
                    )}
                  </div>

                  {/* Customer's Referral Rewards from Database */}
                  {referralSummary?.rewards && referralSummary.rewards.length > 0 && (
                    <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-2">
                      <label className="block text-[11px] font-black uppercase tracking-wider text-[var(--color-text-main)]">
                        Your Earned Rewards ({referralSummary.rewards.length})
                      </label>
                      <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                        {referralSummary.rewards.map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs font-bold"
                          >
                            <span className="text-emerald-900 flex items-center gap-1.5">
                              <FiGift className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <span>{r.discount_percent}% OFF ({r.reward_side})</span>
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
