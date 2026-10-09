# Blocked & Out-of-Scope Items for Customer Storefront

> **Date:** October 9, 2026  
> **Branch:** `audit-fixes`  
> **Context:** Storefront integration and customer flow fixes under strict hard boundaries.

---

## 1. Summary of Blocked Items

| ID | Area | Item Description | Reason Blocked / Why Not Changed | Recommended Resolution |
|---|---|---|---|---|
| **BLK-01** | Payments | Live Razorpay / Card Gateway Integration | Production API keys/secrets are not provisioned in the repository, and Admin payment webhook handlers cannot be modified under the hard boundary. | Retain COD (`CASH_ON_DELIVERY`) as the active storefront method. Once Razorpay keys are configured in environment variables and verified by the backend dev, enable Razorpay checkout JS SDK. |
| **BLK-02** | Database Migrations | Direct Schema Execution on `unified_pos` DB | Hard boundary explicitly mandates: *"Do NOT run migrations or change the database. Put any needed SQL in docs/audit/sql-to-run.md."* | All required inventory initialization and data seed SQL scripts have been documented in [`docs/audit/sql-to-run.md`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/docs/audit/sql-to-run.md) for DBA execution. |
| **BLK-03** | Admin Application | `apps/admin-pos/` UI and Admin-only Controllers | Hard boundary explicitly mandates: *"Another developer is working on the Admin panel. Do NOT edit anything in apps/admin-pos/ or admin-only backend files."* | Documented all discovered Admin bugs with file, method, and evidence in [`docs/audit/admin-issues-for-other-dev.md`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/docs/audit/admin-issues-for-other-dev.md). |
| **BLK-04** | Inventory Movements | Disjoint Dual Inventory System (`inventory_movements` vs `inventory_transactions`) | `inventory_transactions` table was introduced in migration `0024_inventory_batches.sql` for batch tracking without unifying with the core `inventory_movements` append-only trigger table. | Admin/backend architect must unify the inventory ledger tables before storefront batch-level reservations can be introduced. Storefront relies on authoritative `inventory.available` column. |
