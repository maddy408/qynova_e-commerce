# Admin + POS

React (Vite) app — Admin Panel and POS Billing in one app with role-based
access (ECOMMERCE_POS_ADMIN_SPEC.md section 1). Talks to the backend at
`VITE_API_BASE_URL` (see `.env.example`); never computes money values
itself — every price/discount/tax/total shown comes straight from the
API response.

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- `react-router-dom` for routing
- `axios` for API calls (auth token attached by a request interceptor in
  `src/lib/api.ts`; a 401 response clears the token and redirects to
  `/login`)

## Structure

```
src/
  lib/
    api.ts       axios instance, token storage, apiErrorMessage() helper
    auth.tsx     AuthProvider/useAuth — current user, login/logout, permission check
    types.ts     shared TS types matching backend API shapes
  components/
    ui.tsx       Button/TextField/Select/Modal/Card/Badge/... primitives
    Layout.tsx   sidebar + topbar shell (used by every authenticated route)
  pages/         one file per route
```

## Setup

```bash
npm install
copy .env.example .env   # point VITE_API_BASE_URL at your backend
npm run dev
```

Sign in with the seeded admin login (`database/seed/0001_seed.sql`):
`admin@example.com` / `Admin@123`.

## Built so far

- Auth: login, session restore via `/api/auth/me`, logout, role/
  permission-aware nav.
- Dashboard: live summary cards from `/api/dashboard/summary`.
- Categories: list, create, activate/deactivate.
- Subcategories: list, create with multi-category mapping (checkbox
  list against `category_subcategory`), activate/deactivate.
- Products: list; create form with a category chip-picker (click a
  chip's star to set the primary category) and a subcategory picker
  that's live-filtered to only subcategories mapped to the selected
  categories — mirroring the backend's own validation rule in
  `ProductService`, so a submission here can never be rejected for
  violating it.

Not built yet: product variants (SKU/price/stock — spec says these are
added from a product's detail page, which doesn't exist yet), editing an
existing product, POS billing screens, and everything else in
`docs/ECOMMERCE_POS_ADMIN_SPEC.md` beyond category/subcategory/product
creation.
