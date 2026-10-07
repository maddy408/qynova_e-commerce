import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiErrorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid credentials. Please check and try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative h-screen max-h-screen w-full flex flex-col justify-between overflow-hidden bg-[#FAF6F3]">
      {/* ================= BACKGROUND IMAGE & AMBIENT GLOW ================= */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-700 scale-100 pointer-events-none"
        style={{ backgroundImage: "url('/login-bg.jpg')" }}
      >
        {/* Soft frosted warm overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#FBF8F6]/40 via-[#F7F0EB]/30 to-[#ECE0D6]/60 backdrop-blur-[1.5px]" />
      </div>

      {/* ================= TOP NAVIGATION BRAND HEADER ================= */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-3 sm:px-10 sm:py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/70 backdrop-blur-md border border-white/80 shadow-sm flex items-center justify-center text-[#804652]">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </div>
          <div>
            <span className="font-serif text-base font-bold tracking-widest text-[#4A1821] uppercase">
              QYNOVA
            </span>
            <p className="text-[8px] font-bold tracking-[0.2em] text-[#804652]/80 uppercase">
              Unified Commerce &amp; POS
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3">
          <span className="text-xs font-serif italic text-[#7A4550]">
            Craft Your Store Experience
          </span>
          <div className="w-6 h-[1px] bg-[#804652]/40" />
        </div>
      </header>

      {/* ================= CENTER FROSTED LOGIN CARD ================= */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-2 min-h-0">
        <div className="w-full max-w-[390px] rounded-[28px] bg-white/65 backdrop-blur-xl border border-white/80 p-6 sm:p-7 shadow-[0_20px_50px_-15px_rgba(74,24,33,0.18)] text-center transition-all my-auto">
          
          {/* Top Lotus Emblem Icon */}
          <div className="mx-auto mb-2 w-10 h-10 rounded-full bg-[#FAF0F2] border border-[#F2DFE2] flex items-center justify-center text-[#804652] shadow-2xs">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2C12 2 8 7 8 12C8 17 12 22 12 22C12 22 16 17 16 12C16 7 12 2 12 2ZM12 4.5C13.2 8 14.5 11.5 14.5 14C14.5 15.5 13.5 17 12 18.5C10.5 17 9.5 15.5 9.5 14C9.5 11.5 10.8 8 12 4.5ZM5.5 8C5.5 8 7.5 11.5 7.5 14C7.5 16 6.5 17.5 5 18.5C3.5 17 3 15.5 3 14C3 11 5.5 8 5.5 8ZM18.5 8C18.5 8 21 11 21 14C21 15.5 20.5 17 19 18.5C17.5 17.5 16.5 16 16.5 14C16.5 11.5 18.5 8 18.5 8Z" />
            </svg>
          </div>

          {/* Heading & Subtitle */}
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#4A1821] tracking-tight mb-1">
            Welcome
          </h1>
          <p className="text-xs text-[#7A4550] font-light leading-relaxed mb-4">
            Log in to manage your unified store &amp; POS
          </p>

          {/* Error Message */}
          {error && (
            <div className="mb-3.5 p-2.5 rounded-xl bg-[#FDE8EC]/90 border border-[#F9B6C2] text-[#B91C1C] text-xs font-semibold flex items-center gap-2 text-left shadow-2xs">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3 text-left">
            {/* Email Field */}
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#804652]/70 pointer-events-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                className="w-full rounded-xl bg-white/80 border border-white focus:bg-white pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-[#804652]/50 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#804652]/25 focus:border-[#804652] transition-all font-medium"
              />
            </div>

            {/* Password Field */}
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#804652]/70 pointer-events-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-xl bg-white/80 border border-white focus:bg-white pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-[#804652]/50 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#804652]/25 focus:border-[#804652] transition-all font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#804652]/60 hover:text-[#804652] transition-colors focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12c1.274-4.057 5.065-7 9.544-7s8.27 2.943 9.543 7c-1.274 4.057-5.065 7-9.543 7s-8.27-2.943-9.544-7z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Remember Me & Forgot Password Row */}
            <div className="flex items-center justify-between text-[11px] text-[#7A4550] pt-0.5">
              <label className="flex items-center gap-1.5 cursor-pointer font-medium select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-[#DCBAC1] text-[#804652] focus:ring-[#804652] w-3 h-3 accent-[#804652]"
                />
                <span>Remember Me</span>
              </label>
              <button
                type="button"
                onClick={() => alert('Please contact store administrator to reset your password.')}
                className="hover:text-[#4A1821] hover:underline font-medium"
              >
                Forgot Password?
              </button>
            </div>

            {/* Log In Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-[#8B4856] via-[#804652] to-[#6E3642] text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-[#804652]/20 hover:shadow-lg hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <span>{submitting ? 'Authenticating…' : 'Log In'}</span>
              {!submitting && <span className="text-sm font-normal">→</span>}
            </button>
          </form>
        </div>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="relative z-10 w-full py-2 text-center text-[10px] text-[#7A4550]/80 shrink-0">
        <p>© 2026 Qynova Luxury Retail POS Platform • All rights reserved</p>
      </footer>
    </div>
  )
}

