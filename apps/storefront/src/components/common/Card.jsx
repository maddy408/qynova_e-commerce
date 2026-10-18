import React from 'react'

/**
 * Reusable Common Card Component
 * Uses central surface tokens (--color-bg-card, --color-border-subtle).
 */
export default function Card({
  children,
  className = '',
  padding = 'md',     // 'none' | 'sm' | 'md' | 'lg'
  rounded = '2xl',    // 'xl' | '2xl' | '3xl'
  hover = false,
  onClick = null,
  ...rest
}) {
  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6 sm:p-7',
  }

  const roundedStyles = {
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    '3xl': 'rounded-3xl',
  }

  const hoverStyle = hover
    ? 'hover:shadow-md hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 cursor-pointer'
    : ''

  const baseStyles =
    'bg-[var(--color-card-bg)] text-[var(--color-text-main)] border border-[var(--color-border-subtle)] shadow-xs transition-all duration-200'

  return (
    <div
      onClick={onClick}
      className={`${baseStyles} ${roundedStyles[rounded] || 'rounded-2xl'} ${paddingStyles[padding] || 'p-4'} ${hoverStyle} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  )
}
