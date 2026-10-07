<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Spreadsheet;
use PDO;

final class ReportExportService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Export sales & invoices report as Excel file (.xlsx)
     * @param array<string, mixed> $filters
     */
    public function exportExcel(array $filters): string
    {
        $where = ['i.status = "ACTIVE"', 'i.deleted_at IS NULL'];
        $params = [];

        if (!empty($filters['start_date'])) {
            $where[] = 'DATE(i.created_at) >= :start_date';
            $params['start_date'] = $filters['start_date'];
        }

        if (!empty($filters['end_date'])) {
            $where[] = 'DATE(i.created_at) <= :end_date';
            $params['end_date'] = $filters['end_date'];
        }

        if (!empty($filters['channel']) && $filters['channel'] !== 'ALL') {
            $where[] = 'i.channel = :channel';
            $params['channel'] = strtoupper((string) $filters['channel']);
        }

        if (!empty($filters['customer_type']) && $filters['customer_type'] !== 'ALL') {
            $where[] = 'c.customer_type = :customer_type';
            $params['customer_type'] = strtoupper((string) $filters['customer_type']);
        }

        $whereSql = implode(' AND ', $where);

        $stmt = $this->pdo->prepare(
            "SELECT i.invoice_no, i.channel, COALESCE(c.name, 'Walk-in Customer') AS customer_name,
                    COALESCE(c.customer_type, 'RETAIL') AS customer_type,
                    i.subtotal, i.tax_amount, i.discount_amount, i.grand_total,
                    i.payment_status, i.created_at
             FROM invoices i
             LEFT JOIN customers c ON c.id = i.customer_id
             WHERE {$whereSql}
             ORDER BY i.created_at DESC"
        );
        $stmt->execute($params);

        $rows = [];
        foreach ($stmt->fetchAll() as $r) {
            $rows[] = [
                'Invoice No' => $r['invoice_no'],
                'Channel' => $r['channel'],
                'Customer Name' => $r['customer_name'],
                'Customer Type' => $r['customer_type'],
                'Subtotal (₹)' => $r['subtotal'],
                'Tax Amount (₹)' => $r['tax_amount'],
                'Discount (₹)' => $r['discount_amount'],
                'Grand Total (₹)' => $r['grand_total'],
                'Payment Status' => $r['payment_status'],
                'Date & Time' => $r['created_at'],
            ];
        }

        $headers = [
            'Invoice No', 'Channel', 'Customer Name', 'Customer Type',
            'Subtotal (₹)', 'Tax Amount (₹)', 'Discount (₹)', 'Grand Total (₹)',
            'Payment Status', 'Date & Time'
        ];

        $path = sys_get_temp_dir() . '/sales-report-' . bin2hex(random_bytes(6)) . '.xlsx';
        Spreadsheet::writeRows($path, $headers, $rows);

        return $path;
    }
}
