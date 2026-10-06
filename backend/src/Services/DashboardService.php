<?php

declare(strict_types=1);

namespace App\Services;

use PDO;

/**
 * Admin dashboard (ECOMMERCE_POS_ADMIN_SPEC.md section 24;
 * docs/DOCUMENTATION.md section 6). "Sales" figures are read from
 * `invoices` (status ACTIVE, not soft-deleted) since both POS and
 * e-commerce funnel through an invoice — see docs section 1's "one
 * common backend" principle. "Orders" figures are read from the e-commerce
 * `orders` table specifically, since POS has no separate order concept.
 *
 * Deliberately NOT included: Net Profit, Expenses, Income
 * (docs section 6/20) — there is no expenses/income module yet, and
 * reporting a number as if it were real when it's actually always zero
 * would be worse than omitting it. Gross profit IS included, but labeled
 * an estimate: invoice_items don't snapshot the cost price at sale time,
 * so it's computed against each variant's *current* purchase_price, which
 * drifts from the truth if costs changed since. See database/README.md.
 */
final class DashboardService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<string, mixed> */
    public function summary(): array
    {
        $sales = $this->pdo->query(
            "SELECT
                COALESCE(SUM(grand_total), 0) AS total_sales,
                COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN grand_total ELSE 0 END), 0) AS today_sales,
                COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN grand_total ELSE 0 END), 0) AS this_month_sales,
                COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN amount_paid ELSE 0 END), 0) AS today_collection,
                SUM(channel = 'POS') AS pos_invoice_count,
                SUM(channel = 'ECOMMERCE') AS ecommerce_invoice_count
             FROM invoices WHERE status = 'ACTIVE' AND deleted_at IS NULL"
        )->fetch();

        $orders = $this->pdo->query(
            "SELECT
                COUNT(*) AS total_orders,
                SUM(status = 'PENDING') AS pending_orders,
                SUM(status = 'DELIVERED') AS completed_orders,
                SUM(status = 'CANCELLED') AS cancelled_orders,
                SUM(DATE(created_at) = CURDATE()) AS today_orders
             FROM orders"
        )->fetch();

        $refunds = $this->pdo->query(
            "SELECT
                COALESCE(SUM(amount), 0) AS total_refund_amount,
                COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0) AS pending_refund_amount,
                COALESCE(SUM(status = 'COMPLETED'), 0) AS completed_refund_count,
                COALESCE(SUM(status = 'PENDING'), 0) AS pending_refund_count
             FROM refunds"
        )->fetch();

        $customers = $this->pdo->query(
            "SELECT
                COUNT(*) AS total_customers,
                SUM(status = 'ACTIVE') AS active_customers,
                SUM(DATE(created_at) = CURDATE()) AS new_customers_today,
                SUM(created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS new_customers_30d
             FROM customers WHERE deleted_at IS NULL"
        )->fetch();

        $products = $this->pdo->query(
            "SELECT COUNT(*) AS total_products FROM products WHERE deleted_at IS NULL"
        )->fetch();

        // available > 0 excludes already-out-of-stock items, so a variant
        // is never counted in both this and out_of_stock_products below.
        $lowStockCount = (int) $this->pdo->query(
            'SELECT COUNT(*) FROM inventory WHERE available > 0 AND available <= low_stock_threshold'
        )->fetchColumn();

        $outOfStockCount = (int) $this->pdo->query(
            'SELECT COUNT(*) FROM inventory WHERE available <= 0'
        )->fetchColumn();

        return [
            'sales' => $sales,
            'orders' => $orders,
            'refunds' => $refunds,
            'customers' => $customers,
            'products' => [
                'total_products' => (int) $products['total_products'],
                'low_stock_products' => $lowStockCount,
                'out_of_stock_products' => $outOfStockCount,
            ],
        ];
    }

    /** @return list<array{period: string, sales_amount: string, order_count: int}> */
    public function salesChart(string $granularity, int $buckets): array
    {
        [$format, $interval] = match ($granularity) {
            'weekly' => ['%x-W%v', 'WEEK'],
            'monthly' => ['%Y-%m', 'MONTH'],
            default => ['%Y-%m-%d', 'DAY'],
        };

        $stmt = $this->pdo->prepare(
            "SELECT DATE_FORMAT(created_at, :format) AS period,
                    COALESCE(SUM(grand_total), 0) AS sales_amount,
                    COUNT(*) AS order_count
             FROM invoices
             WHERE status = 'ACTIVE' AND deleted_at IS NULL
               AND created_at >= DATE_SUB(NOW(), INTERVAL :buckets {$interval})
             GROUP BY period
             ORDER BY MIN(created_at)"
        );
        $stmt->bindValue('format', $format);
        $stmt->bindValue('buckets', $buckets, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /** @return array<string, mixed> */
    public function productAnalytics(int $limit = 10): array
    {
        $topProducts = $this->pdo->prepare(
            "SELECT p.id, p.name, SUM(ii.quantity) AS units_sold, SUM(ii.line_total) AS revenue
             FROM invoice_items ii
             JOIN invoices i ON i.id = ii.invoice_id AND i.status = 'ACTIVE' AND i.deleted_at IS NULL
             JOIN products p ON p.id = ii.product_id
             GROUP BY p.id, p.name ORDER BY units_sold DESC LIMIT :limit"
        );
        $topProducts->bindValue('limit', $limit, PDO::PARAM_INT);
        $topProducts->execute();

        $topCategories = $this->pdo->prepare(
            "SELECT c.id, c.name, SUM(ii.quantity) AS units_sold, SUM(ii.line_total) AS revenue
             FROM invoice_items ii
             JOIN invoices i ON i.id = ii.invoice_id AND i.status = 'ACTIVE' AND i.deleted_at IS NULL
             JOIN product_categories pc ON pc.product_id = ii.product_id
             JOIN categories c ON c.id = pc.category_id
             GROUP BY c.id, c.name ORDER BY units_sold DESC LIMIT :limit"
        );
        $topCategories->bindValue('limit', $limit, PDO::PARAM_INT);
        $topCategories->execute();

        $topVariants = $this->pdo->prepare(
            "SELECT v.id, v.sku, p.name AS product_name, SUM(ii.quantity) AS units_sold, SUM(ii.line_total) AS revenue
             FROM invoice_items ii
             JOIN invoices i ON i.id = ii.invoice_id AND i.status = 'ACTIVE' AND i.deleted_at IS NULL
             JOIN product_variants v ON v.id = ii.variant_id
             JOIN products p ON p.id = v.product_id
             GROUP BY v.id, v.sku, p.name ORDER BY units_sold DESC LIMIT :limit"
        );
        $topVariants->bindValue('limit', $limit, PDO::PARAM_INT);
        $topVariants->execute();

        $lowStock = $this->pdo->query(
            "SELECT v.id AS variant_id, v.sku, p.name AS product_name, i.available, i.low_stock_threshold
             FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = i.product_id
             WHERE i.available > 0 AND i.available <= i.low_stock_threshold
             ORDER BY i.available ASC LIMIT {$limit}"
        )->fetchAll();

        $outOfStock = $this->pdo->query(
            "SELECT v.id AS variant_id, v.sku, p.name AS product_name, i.available
             FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = i.product_id
             WHERE i.available <= 0
             ORDER BY i.updated_at DESC LIMIT {$limit}"
        )->fetchAll();

        // Estimate only — see class docblock: no cost-at-sale-time snapshot exists.
        $grossProfitEstimate = $this->pdo->query(
            "SELECT
                COALESCE(SUM(ii.line_total - ii.tax_amount), 0) AS revenue_ex_tax,
                COALESCE(SUM(ii.quantity * v.purchase_price), 0) AS estimated_cogs
             FROM invoice_items ii
             JOIN invoices i ON i.id = ii.invoice_id AND i.status = 'ACTIVE' AND i.deleted_at IS NULL
             JOIN product_variants v ON v.id = ii.variant_id
             WHERE v.purchase_price IS NOT NULL"
        )->fetch();

        return [
            'top_selling_products' => $topProducts->fetchAll(),
            'top_selling_categories' => $topCategories->fetchAll(),
            'top_selling_variants' => $topVariants->fetchAll(),
            'low_stock_products' => $lowStock,
            'out_of_stock_products' => $outOfStock,
            'gross_profit_estimate' => [
                'revenue_ex_tax' => $grossProfitEstimate['revenue_ex_tax'],
                'estimated_cogs' => $grossProfitEstimate['estimated_cogs'],
                'estimated_gross_profit' => bcsub(
                    (string) $grossProfitEstimate['revenue_ex_tax'],
                    (string) $grossProfitEstimate['estimated_cogs'],
                    2
                ),
                'note' => 'Estimated from each variant\'s current purchase_price, not a cost snapshot at sale time. Excludes items with no recorded purchase_price.',
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function customerAnalytics(int $limit = 10): array
    {
        $newCustomers = $this->pdo->query(
            "SELECT DATE(created_at) AS date, COUNT(*) AS count FROM customers
             WHERE deleted_at IS NULL AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY DATE(created_at) ORDER BY date"
        )->fetchAll();

        $returningVsNew = $this->pdo->query(
            "SELECT
                SUM(order_count = 1) AS one_time_customers,
                SUM(order_count > 1) AS returning_customers
             FROM (
                SELECT customer_id, COUNT(*) AS order_count FROM orders
                WHERE status != 'CANCELLED' GROUP BY customer_id
             ) sub"
        )->fetch();

        $topCustomers = $this->pdo->prepare(
            "SELECT c.id, c.name, c.phone, COUNT(i.id) AS invoice_count, COALESCE(SUM(i.grand_total), 0) AS total_spent
             FROM customers c JOIN invoices i ON i.customer_id = c.id AND i.status = 'ACTIVE' AND i.deleted_at IS NULL
             GROUP BY c.id, c.name, c.phone ORDER BY total_spent DESC LIMIT :limit"
        );
        $topCustomers->bindValue('limit', $limit, PDO::PARAM_INT);
        $topCustomers->execute();

        $referralCustomers = $this->pdo->query(
            'SELECT COUNT(DISTINCT referred_customer_id) AS referred_customer_count FROM referrals'
        )->fetchColumn();

        return [
            'new_customers_by_day' => $newCustomers,
            'one_time_customers' => (int) ($returningVsNew['one_time_customers'] ?? 0),
            'returning_customers' => (int) ($returningVsNew['returning_customers'] ?? 0),
            'top_customers' => $topCustomers->fetchAll(),
            'referral_customer_count' => (int) $referralCustomers,
        ];
    }

    /** @return array{recent_sales: list<array<string, mixed>>, recent_orders: list<array<string, mixed>>} */
    public function recentActivity(int $limit = 10): array
    {
        $sales = $this->pdo->prepare(
            "SELECT id, invoice_no, channel, customer_id, grand_total, payment_status, created_at
             FROM invoices WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT :limit"
        );
        $sales->bindValue('limit', $limit, PDO::PARAM_INT);
        $sales->execute();

        $orders = $this->pdo->prepare(
            "SELECT o.id, o.order_no, c.name AS customer_name, o.status, o.payment_status, o.grand_total, o.created_at
             FROM orders o JOIN customers c ON c.id = o.customer_id
             ORDER BY o.created_at DESC LIMIT :limit"
        );
        $orders->bindValue('limit', $limit, PDO::PARAM_INT);
        $orders->execute();

        return ['recent_sales' => $sales->fetchAll(), 'recent_orders' => $orders->fetchAll()];
    }
}
