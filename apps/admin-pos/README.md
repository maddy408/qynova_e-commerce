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
- Products: list (click a row to open it); a sectioned Create screen
  (Basic Info/Classification/Pricing & Tax/Specifications) with a
  category chip-picker (click a chip's star to set the primary category),
  a subcategory picker live-filtered to only subcategories mapped to the
  selected categories, bullet points, and a Simple vs. Variable product
  type toggle — then redirects to the product's detail page.
- Product detail page (`/products/:id`): everything that needs a real
  product ID first —
  - **Product images**: drag-drop or click-to-browse upload, set
    primary, delete (promotes the next image to primary automatically).
  - **Variants** (variable products): pick attribute values as chips,
    "Generate Combinations" creates the full cartesian product in one
    call (skips any combination that already exists rather than
    erroring), inline price editing per row, and a **per-variant "Manage
    Images" modal** — scoped to exactly that variant's own gallery,
    never another variant's.
  - **Specifications**: free-form name/value rows, saved as a whole list.
  - Simple products get an inline Pricing & Inventory card instead of
    the variant table (SKU/MRP/price directly, stock shown read-only
    from the real inventory ledger).

Not built yet: editing a product's basic info/classification after
creation, POS billing screens, and everything else in
`docs/ECOMMERCE_POS_ADMIN_SPEC.md` beyond category/subcategory/product
creation — coupons, orders, referral settings, purchases, stock
adjustments, banners and reports all have working backends already but
no frontend yet.
