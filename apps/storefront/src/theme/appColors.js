/**
 * Single source of truth for every color used in apps/storefront.
 *
 * Mirrors the `@theme` block in `src/index.css` (keep both in sync when
 * re-theming) — that file already defined most of these as CSS variables
 * before this file existed; the names here match it exactly rather than
 * inventing a second naming scheme. Each key generates a Tailwind utility
 * (`bg-brand`, `text-text-muted`, `border-border-subtle`, ...). Outside
 * Tailwind (inline styles, JS-computed colors), import `AppColors`.
 */
export const AppColors = {
  // Central Brand Tokens (Primary: Ocean Cyan/Blue, Secondary: Fresh Green)
  primary: '#0284C7',
  primaryHover: '#0369A1',
  primaryTint: '#E0F2FE',
  primarySubtle: '#F0F9FF',

  secondary: '#16A34A',
  secondaryHover: '#15803D',
  secondaryTint: '#DCFCE7',

  accent: '#F59E0B',
  accentGold: '#F59E0B',

  // Backward compatibility brand aliases
  brand: '#0284C7',
  brandHover: '#0369A1',

  // Surfaces
  bgMain: '#F8FAFC',
  bgAlt: '#F1F5F9',
  background: '#FFFFFF',

  // Borders
  borderSubtle: '#E2E8F0',

  // Text
  textMain: '#0F172A',
  textMuted: '#64748B',

  // Status
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#0284C7',

  // Referral program accent
  referralTint: '#E0F2FE',
  referral: '#0284C7',
  referralAlt: '#0369A1',
  referralStrong: '#075985',
  referralDark: '#082F49',

  // Third-party brand colors used verbatim — not design tokens, kept for
  // traceability
  whatsapp: '#25D366',
  googleBlue: '#4285F4',
  googleGreen: '#34A853',
  googleYellow: '#FBBC05',
  googleRed: '#EA4335',

  // Header / footer
  headerBg: '#FFFFFF',
  footerBg: '#000000',

  // "Extra" tokens: every other distinct color this app used before this
  // refactor that doesn't map to a semantic name above — pass-through
  // values kept for a pixel-identical render, not meaningful design
  // tokens. See the matching comment in index.css.
  extra001: '#0284c7',
  extra002: '#0d9488',
  extra003: '#f97316',
  extra004: '#0369a1',
  extra005: '#0f766e',
  extra006: '#c2410c',
  extra007: '#be123c',
  extra008: '#7c4de8',
  extra009: '#0a192f',
  extra010: '#1e3a8a',
  extra011: '#06b6d4',
  extra012: '#38bdf8',
  extra013: '#431407',
  extra014: '#9a3412',
  extra015: '#f59e0b',
  extra016: '#4c0519',
  extra017: '#831843',
  extra018: '#be185d',
  extra019: '#fb7185',
  extra020: '#042f2e',
  extra021: '#115e59',
  extra022: '#2dd4bf',
  extra023: '#a78bfa',
  extra024: '#0ea5e9',
  extra025: '#e11d48',
  extra026: '#16a34a',
  extra027: '#22c55e',
  extra028: '#5b21b6',
  extra029: '#db2777',
  extra030: '#d8c8ff',
  extra031: '#ec4899',
  extra032: '#9333ea',
  extra033: '#3b0764',
  extra034: '#581c87',
  extra035: '#e8cedb',
  extra036: '#d8adc5',
  extra037: '#9b3e7a',
  extra038: '#75235a',
  extra039: '#421332',
  extra040: '#e0d6ff',
  extra041: '#20bd5a',
}
