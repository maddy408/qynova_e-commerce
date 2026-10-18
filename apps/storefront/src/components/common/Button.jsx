import React from 'react'
import { Link } from 'react-router-dom'

/**
 * Reusable Common Button Component
 * Powered by centralized design system tokens (--color-primary, --color-secondary).
 * Re-theming the app in index.css automatically updates all Button instances.
 */
export default function Button({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'outline' | 'light' | 'white' | 'ghost'
  size = 'md',        // 'xs' | 'sm' | 'md' | 'lg'
  rounded = 'full',   // 'full' | 'xl' | 'lg' | 'md'
  to = null,
  href = null,
  type = 'button',
  onClick,
  disabled = false,
  isLoading = false,
  icon = null,
  iconPosition = 'left',
  fullWidth = false,
  className = '',
  title = '',
  target = null,
  rel = null,
  ...rest
}) {
  const baseStyles =
    'inline-flex items-center justify-center font-sans font-semibold transition-all duration-200 select-none active:scale-[0.98] focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100'

  const variantStyles = {
    primary:
      'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white shadow-xs hover:shadow-md border border-transparent',
    secondary:
      'bg-[var(--color-secondary)] hover:bg-[var(--color-secondary-hover)] text-white shadow-xs hover:shadow-md border border-transparent',
    outline:
      'border border-[var(--color-primary)] text-[var(--color-primary)] bg-white hover:bg-[var(--color-primary)] hover:text-white shadow-2xs',
    light:
      'bg-[var(--color-primary-tint)] hover:bg-[var(--color-primary)] text-[var(--color-primary)] hover:text-white border border-transparent',
    white:
      'bg-white hover:bg-slate-50 text-[var(--color-text-main)] border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow',
    ghost:
      'text-[var(--color-text-main)] hover:bg-[var(--color-bg-alt)] border border-transparent',
  }

  const sizeStyles = {
    xs: 'px-2.5 py-1 text-[11px] gap-1',
    sm: 'px-3.5 py-1.5 text-xs gap-1.5',
    md: 'px-5 py-2 text-xs sm:text-sm gap-2',
    lg: 'px-7 py-3 text-sm sm:text-base gap-2.5',
  }

  const roundedStyles = {
    full: 'rounded-full',
    xl: 'rounded-xl',
    lg: 'rounded-lg',
    md: 'rounded-md',
  }

  const widthStyle = fullWidth ? 'w-full' : ''
  const selectedVariant = variantStyles[variant] || variantStyles.primary
  const selectedSize = sizeStyles[size] || sizeStyles.md
  const selectedRounded = roundedStyles[rounded] || roundedStyles.full

  const combinedClasses = `${baseStyles} ${selectedVariant} ${selectedSize} ${selectedRounded} ${widthStyle} ${className}`.trim()

  const content = (
    <>
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      ) : icon && iconPosition === 'left' ? (
        <span className="shrink-0">{icon}</span>
      ) : null}

      {children && <span>{children}</span>}

      {!isLoading && icon && iconPosition === 'right' ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
    </>
  )

  if (to && !disabled) {
    return (
      <Link to={to} className={combinedClasses} title={title} onClick={onClick} {...rest}>
        {content}
      </Link>
    )
  }

  if (href && !disabled) {
    return (
      <a
        href={href}
        className={combinedClasses}
        title={title}
        target={target}
        rel={target === '_blank' ? (rel || 'noopener noreferrer') : rel}
        onClick={onClick}
        {...rest}
      >
        {content}
      </a>
    )
  }

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={combinedClasses}
      title={title}
      onClick={onClick}
      {...rest}
    >
      {content}
    </button>
  )
}
