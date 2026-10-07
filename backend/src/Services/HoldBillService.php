<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

final class HoldBillService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array<string, mixed>> */
    public function list(): array
    {
        $stmt = $this->pdo->query("SELECT * FROM hold_bills ORDER BY created_at DESC");
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['items'] = json_decode((string) $row['items_json'], true) ?? [];
        }
        unset($row);
        return $rows;
    }

    public function save(array $data, int $userId): array
    {
        $billNo = 'HOLD-' . date('YmdHis') . '-' . random_int(100, 999);
        $customerId = isset($data['customer_id']) && $data['customer_id'] !== '' ? (int) $data['customer_id'] : null;
        $customerName = trim((string) ($data['customer_name'] ?? ''));
        $note = trim((string) ($data['note'] ?? ''));
        $totalAmount = (string) ($data['total_amount'] ?? '0');
        $priceType = (string) ($data['price_type'] ?? 'RETAIL');
        $items = (array) ($data['items'] ?? []);

        if ($items === []) {
            throw new RuntimeException('Cannot hold an empty bill');
        }

        $itemsJson = json_encode($items, JSON_UNESCAPED_UNICODE);

        $stmt = $this->pdo->prepare(
            "INSERT INTO hold_bills (bill_no, customer_id, customer_name, note, total_amount, price_type, items_json, created_by)
             VALUES (:bill_no, :customer_id, :customer_name, :note, :total_amount, :price_type, :items_json, :created_by)"
        );

        $stmt->execute([
            'bill_no' => $billNo,
            'customer_id' => $customerId,
            'customer_name' => $customerName !== '' ? $customerName : null,
            'note' => $note !== '' ? $note : null,
            'total_amount' => $totalAmount,
            'price_type' => $priceType,
            'items_json' => $itemsJson,
            'created_by' => $userId,
        ]);

        $id = (int) $this->pdo->lastInsertId();

        $stmtFetch = $this->pdo->prepare("SELECT * FROM hold_bills WHERE id = :id");
        $stmtFetch->execute(['id' => $id]);
        $row = $stmtFetch->fetch();
        if ($row !== false) {
            $row['items'] = json_decode((string) $row['items_json'], true) ?? [];
        }
        return $row ?: [];
    }

    public function delete(int $id): bool
    {
        $stmt = $this->pdo->prepare("DELETE FROM hold_bills WHERE id = :id");
        return $stmt->execute(['id' => $id]);
    }
}
