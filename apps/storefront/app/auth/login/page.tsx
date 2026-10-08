"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // TODO: wire up your real auth logic here
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    setError("Invalid email or password. Please try again.");
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', sans-serif;
          background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
          position: relative;
          overflow: hidden;
        }

        .login-root::before {
          content: '';
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%);
          top: -200px;
          right: -100px;
          pointer-events: none;
        }

        .login-root::after {
          content: '';
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%);
          bottom: -150px;
          left: -100px;
          pointer-events: none;
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          margin: 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 2.5rem;
          box-shadow: 0 32px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
          position: relative;
          z-index: 1;
          animation: fadeSlideUp 0.5s ease both;
        }

        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .brand-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 2rem;
        }

        .brand-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, #8b5cf6, #3b82f6);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .brand-name {
          font-size: 1.25rem;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.02em;
        }

        .login-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.03em;
          margin-bottom: 0.4rem;
        }

        .login-subtitle {
          font-size: 0.9rem;
          color: rgba(255,255,255,0.5);
          margin-bottom: 2rem;
        }

        .form-group {
          margin-bottom: 1.1rem;
        }

        .form-label {
          display: block;
          font-size: 0.8rem;
          font-weight: 500;
          color: rgba(255,255,255,0.6);
          margin-bottom: 0.45rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .input-wrapper {
          position: relative;
        }

        .form-input {
          width: 100%;
          padding: 0.75rem 1rem;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          color: #fff;
          font-size: 0.95rem;
          font-family: 'Inter', sans-serif;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }

        .form-input::placeholder {
          color: rgba(255,255,255,0.25);
        }

        .form-input:focus {
          border-color: rgba(139,92,246,0.7);
          background: rgba(255,255,255,0.1);
          box-shadow: 0 0 0 3px rgba(139,92,246,0.15);
        }

        .form-input.has-toggle {
          padding-right: 3rem;
        }

        .toggle-btn {
          position: absolute;
          right: 0.9rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.4);
          font-size: 1rem;
          padding: 0;
          line-height: 1;
          transition: color 0.2s;
        }

        .toggle-btn:hover {
          color: rgba(255,255,255,0.8);
        }

        .forgot-row {
          display: flex;
          justify-content: flex-end;
          margin-top: 0.4rem;
        }

        .forgot-link {
          font-size: 0.8rem;
          color: rgba(139,92,246,0.9);
          text-decoration: none;
          transition: color 0.2s;
        }

        .forgot-link:hover {
          color: #a78bfa;
        }

        .error-box {
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 10px;
          padding: 0.7rem 1rem;
          color: #fca5a5;
          font-size: 0.85rem;
          margin-bottom: 1.2rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          animation: shake 0.4s ease;
        }

        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%,60%  { transform: translateX(-4px); }
          40%,80%  { transform: translateX(4px); }
        }

        .submit-btn {
          width: 100%;
          padding: 0.85rem;
          background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%);
          border: none;
          border-radius: 12px;
          color: #fff;
          font-size: 0.95rem;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 4px 20px rgba(139,92,246,0.4);
          margin-top: 0.5rem;
        }

        .submit-btn:hover:not(:disabled) {
          opacity: 0.92;
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(139,92,246,0.5);
        }

        .submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .submit-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          vertical-align: middle;
          margin-right: 6px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .divider {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin: 1.5rem 0;
          color: rgba(255,255,255,0.25);
          font-size: 0.8rem;
        }

        .divider::before,
        .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.1);
        }

        .social-btn {
          width: 100%;
          padding: 0.75rem;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: rgba(255,255,255,0.8);
          font-size: 0.9rem;
          font-family: 'Inter', sans-serif;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
        }

        .social-btn:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.2);
        }

        .signup-row {
          text-align: center;
          margin-top: 1.6rem;
          font-size: 0.875rem;
          color: rgba(255,255,255,0.4);
        }

        .signup-link {
          color: #a78bfa;
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
        }

        .signup-link:hover {
          color: #c4b5fd;
        }
      `}</style>

      <div className="login-root">
        <div className="login-card">
          {/* Brand */}
          <div className="brand-logo">
            <div className="brand-icon">🛍️</div>
            <span className="brand-name">Qynova</span>
          </div>

          <h1 className="login-title">Welcome back</h1>
          <p className="login-subtitle">Sign in to your account to continue shopping</p>

          {/* Error */}
          {error && (
            <div className="error-box" role="alert">
              <span>⚠️</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className="form-group">
              <label htmlFor="login-email" className="form-label">Email address</label>
              <div className="input-wrapper">
                <input
                  id="login-email"
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label htmlFor="login-password" className="form-label">Password</label>
              <div className="input-wrapper">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  className="form-input has-toggle"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="toggle-btn"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
              <div className="forgot-row">
                <Link href="/auth/forgot-password" className="forgot-link">
                  Forgot password?
                </Link>
              </div>
            </div>

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              className="submit-btn"
              disabled={loading}
            >
              {loading && <span className="spinner" />}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Divider */}
          <div className="divider">or continue with</div>

          {/* Google */}
          <button id="login-google-btn" type="button" className="social-btn">
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          {/* Sign up */}
          <div className="signup-row">
            Don&apos;t have an account?{" "}
            <Link href="/auth/register" className="signup-link">
              Create one free
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

