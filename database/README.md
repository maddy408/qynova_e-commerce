# Database

Single MySQL database (`unified_pos`) shared by Admin, POS and Storefront
through the one PHP backend. See [docs/DOCUMENTATION.md](../docs/DOCUMENTATION.md)
section 21 for the full table list and section 11 for the inventory ledger
design.

- `migrations/` — one file per schema change, applied in filename order.
- `seed/` — seed data (admin user, cashier, sample customer, seed categories,
  sample products per section 27 phase 2).

No `product_line`, `route`, `city` or `branch` tables — single branch, no
route/city logic anywhere (see the Decisions table and rule 48 in the docs).

Schema and seed migrations land in Phase 2 of the build (section 27).
