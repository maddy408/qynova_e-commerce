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
  // Primary brand (Deep Ocean Teal / Petrol Blue from Modern Furnish aesthetic)
  primary: '#0e7490',
  primaryStrong: '#155e75',
  primaryStrongHover: '#164e63',
  saleAccent: '#0e7490',
  saleAccentHover: '#155e75',

  // Surfaces: Crisp, light ice-cyan tinted or clean white
  surface: '#f0fdfa',
  surfaceAlt: '#f8fafc',
  surfaceMuted: '#e0f2fe',
  background: '#FFFFFF',

  // Borders: soft cyan / slate borders
  border: '#cffafe',
  borderMuted: '#e2e8f0',

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
  extra001: '#164e63',
  extra002: '#ffffff',
  extra003: '#cffafe',
  extra004: '#e0f2fe',
  extra005: '#ecfeff',
  extra006: '#f0fdfa',
  extra007: '#cffafe',
  extra008: '#b91c1c',
  extra009: '#0e7490',
  extra010: '#f0fdfa',
  extra011: '#0e7a36',
  extra012: '#164e63',
  extra013: '#f0fdfa',
  extra014: '#ecfeff',
  extra015: '#67e8f9',
  extra016: '#e3f8e9',
  extra017: '#b7edc4',
  extra018: '#155e75',
  extra019: '#e0f2fe',
  extra020: '#f0fdfa',
  extra021: '#0e7490',
  extra022: '#0891b2',
  extra023: '#8b5cf6',
  extra024: '#22c55e',
  extra025: '#16a34a',
  extra026: '#0e7490',
  extra027: '#f0fdfa',
  extra028: '#ffffff',
  extra029: '#3b82f6',
  extra030: '#f97316',
  extra031: '#a78bfa',
  extra032: '#ec4899',
  extra033: '#14b8a6',
  extra034: '#cffafe',
  extra035: '#faf8f0',
  extra036: '#faf6f3',
  extra037: '#fbf8f6',
  extra038: '#f7f0eb',
  extra039: '#ece0d6',
  extra040: '#155e75',
  extra041: '#164e63',
  extra042: '#f0fdfa',
  extra043: '#0891b2',
  extra044: '#164e63',
} as const

export type AppColorToken = keyof typeof AppColors
