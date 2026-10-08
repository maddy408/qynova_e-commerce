import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { XMarkIcon } from './Icons'

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-1 active:scale-98 cursor-pointer'
  const sizes = size === 'sm' ? 'px-3.5 py-1.5 text-xs' : 'px-4.5 py-2 text-xs'
  const variants: Record<string, string> = {
    primary: 'bg-gradient-to-r from-[#804652] to-[#6E3642] text-white hover:opacity-95 shadow-2xs focus:ring-[#804652]',
    secondary: 'bg-white text-slate-800 border border-[#EEDDE0] hover:bg-[#FAF2F4] hover:border-[#804652] shadow-2xs focus:ring-[#804652]',
    danger: 'bg-rose-700 text-white hover:bg-rose-800 shadow-2xs focus:ring-rose-500',
    ghost: 'text-[#804652] hover:bg-[#FAF2F4] focus:ring-[#804652]',
  }
  return <button className={`${base} ${sizes} ${variants[variant]} ${className}`} {...props} />
}

export function TextField({
  label,
  error,
  required,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <label className="block text-xs">
      {label && (
        <span className="mb-1 block font-bold text-slate-800 uppercase tracking-wider text-[11px]">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}
      <input
        className={`w-full rounded-2xl border border-[#EEDDE0] bg-[#FAF2F4]/30 px-3.5 py-2 text-xs font-semibold text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#804652] focus:border-[#804652] shadow-2xs transition-all ${
          error ? 'border-red-400' : ''
        } ${className}`}
        {...props}
      />
      {error && <span className="mt-1 block text-[11px] font-semibold text-red-600">{error}</span>}
    </label>
  )
}

export function TextArea({
  label,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block text-xs">
      {label && (
        <span className="mb-1 block font-bold text-slate-800 uppercase tracking-wider text-[11px]">
          {label}
        </span>
      )}
      <textarea
        className={`w-full rounded-2xl border border-[#EEDDE0] bg-[#FAF2F4]/30 px-3.5 py-2 text-xs font-semibold text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#804652] focus:border-[#804652] shadow-2xs transition-all ${className}`}
        {...props}
      />
    </label>
  )
}

export function Select({
  label,
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block text-xs">
      {label && (
        <span className="mb-1 block font-bold text-slate-800 uppercase tracking-wider text-[11px]">
          {label}
        </span>
      )}
      <select
        className={`w-full rounded-2xl border border-[#EEDDE0] bg-[#FAF2F4]/40 px-3.5 py-2 text-xs font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-[#804652] focus:border-[#804652] shadow-2xs transition-all ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'teal' }) {
  const tones: Record<string, string> = {
    slate: 'bg-[#FAF2F4] text-[#804652] border border-[#EEDDE0]',
    green: 'bg-emerald-50 text-emerald-900 border border-emerald-200',
    red: 'bg-rose-50 text-rose-900 border border-rose-200',
    amber: 'bg-amber-50 text-amber-900 border border-amber-200',
    teal: 'bg-teal-50 text-teal-900 border border-teal-200',
  }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-[#F2E5E7] bg-white shadow-2xs overflow-hidden ${className}`}>{children}</div>
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-xs text-slate-600 font-medium">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
  width = 'md',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}) {
  const widths = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-5xl',
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-6 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <div
        className={`relative flex max-h-[90vh] w-full ${widths[width] ?? widths.md} flex-col rounded-3xl bg-white shadow-2xl border border-[#F2E5E7] overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#F2E5E7] px-6 py-4 bg-[#FAF2F4]">
          <h2 className="text-base font-bold text-slate-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-[#EEDDE0] hover:text-slate-800 transition cursor-pointer"
            aria-label="Close modal"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 text-xs text-slate-900">
          {children}
        </div>
      </div>
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-bold text-slate-950">{title}</p>
      {description && <p className="mt-1 text-xs text-slate-600 font-medium">{description}</p>}
    </div>
  )
}

export function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <div className="flex justify-center py-12">
      <div className={`animate-spin rounded-full border-2 border-[#EEDDE0] border-t-[#804652] ${className}`} />
    </div>
  )
}

export function Alert({ tone = 'red', children }: { tone?: 'red' | 'green' | 'amber'; children: ReactNode }) {
  const tones = {
    red: 'bg-rose-50 text-rose-900 border-rose-200',
    green: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    amber: 'bg-amber-50 text-amber-900 border-amber-200',
  }
  return <div className={`rounded-2xl border px-3.5 py-2.5 text-xs font-semibold shadow-2xs ${tones[tone]}`}>{children}</div>
}
