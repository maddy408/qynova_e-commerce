/**
 * Single source of truth for every color used in apps/admin-pos.
 *
 * Edit values here (and the matching `@theme` block in `src/index.css`,
 * which must stay in sync) to re-theme the whole app. Components should
 * never write a raw hex/rgb/hsl value — use the Tailwind utility classes
 * these tokens generate (`bg-primary`, `border-border`, `text-text-muted`,
 * ...) or, outside Tailwind (charts, inline styles), import `AppColors`.
 *
 * The three `*Strong`/`saleAccent` primary variants exist because the app
 * already used three distinct near-maroon brand shades on different pages
 * before this file existed; they're kept as separate named tokens (instead
 * of being silently merged into one) so this refactor doesn't change how
 * any existing page renders. Consolidating them into a single primary is a
 * design decision for a future pass, not this one.
 */
export const AppColors = {
  // Primary brand (see note above on the 3 near-duplicate shades)
  primary: '#7B3F4A',
  primaryStrong: '#804652',
  primaryStrongHover: '#6E3642',
  saleAccent: '#7E1235',

  // Surfaces
  surface: '#FAF2F4',
  surfaceAlt: '#FAF5F6',
  surfaceMuted: '#E5D5D8',
  background: '#FFFFFF',

  // Borders
  border: '#EEDDE0',
  borderMuted: '#F2E5E7',

  // Text (aliases Tailwind's slate scale so there's one documented place
  // this app's neutral text colors come from; override via @theme's
  // slate tokens if the neutral palette itself ever needs to change)
  text: '#0f172a', // slate-950
  textMuted: '#475569', // slate-600

  // Status
  success: '#059669', // emerald-600
  warning: '#d97706', // amber-600
  error: '#be123c', // rose-700
  info: '#0d9488', // teal-600

  // Header / footer / print
  headerBg: '#FFFFFF',
  footerBg: '#FFFFFF',
  printBg: '#ffffff',
  ink: '#000000',

  // "Extra" tokens: every other distinct color this app used before this
  // refactor that doesn't map to a semantic name above (chart accents,
  // gradient stops, status-pill tints, etc.) — pass-through values kept
  // for a pixel-identical render, not meaningful design tokens. See the
  // matching comment in index.css.
  extra001: '#4a1821',
  extra002: '#fdfbfb',
  extra003: '#e8ccd1',
  extra004: '#f0e0e3',
  extra005: '#f8eaed',
  extra006: '#f3e1e4',
  extra007: '#dcbac1',
  extra008: '#b91c1c',
  extra009: '#68343e',
  extra010: '#faf0f2',
  extra011: '#0e7a36',
  extra012: '#650e2a',
  extra013: '#f6edee',
  extra014: '#fde8ec',
  extra015: '#f9b6c2',
  extra016: '#e3f8e9',
  extra017: '#b7edc4',
  extra018: '#7a4550',
  extra019: '#f2dfe2',
  extra020: '#f9f3f4',
  extra021: '#68333d',
  extra022: '#6e3743',
  extra023: '#8b5cf6',
  extra024: '#22c55e',
  extra025: '#16a34a',
  extra026: '#6a3340',
  extra027: '#f5e6e9',
  extra028: '#faf8fc',
  extra029: '#3b82f6',
  extra030: '#f97316',
  extra031: '#a78bfa',
  extra032: '#ec4899',
  extra033: '#14b8a6',
  extra034: '#e2cbd0',
  extra035: '#faf8f0',
  extra036: '#faf6f3',
  extra037: '#fbf8f6',
  extra038: '#f7f0eb',
  extra039: '#ece0d6',
  extra040: '#8b4856',
  extra041: '#5a2c36',
  extra042: '#f3e5e8',
  extra043: '#a35c69',
  extra044: '#680f2c',
} as const

export type AppColorToken = keyof typeof AppColors
