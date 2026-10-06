<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

final class ProductSpecificationService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array<string, mixed>> */
    public function list(int $productId): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM product_specifications WHERE product_id = :id ORDER BY sort_order');
        $stmt->execute(['id' => $productId]);

        return $stmt->fetchAll();
    }

    /**
     * Replaces the full specification list for a product — simplest
     * correct semantics for a free-form key/value list edited as a whole
     * in the UI (spec section 23: "+ Add Specification").
     *
     * @param list<array{name: string, value: string}> $rows
     */
    public function replaceAll(int $productId, array $rows): void
    {
        $this->pdo->beginTransaction();

        try {
            $this->pdo->prepare('DELETE FROM product_specifications WHERE product_id = :id')->execute(['id' => $productId]);

            foreach ($rows as $index => $row) {
                $name = trim((string) ($row['name'] ?? ''));
                $value = trim((string) ($row['value'] ?? ''));

                if ($name === '' || $value === '') {
                    throw new RuntimeException('Each specification needs both a name and a value');
                }

                $this->pdo->prepare(
                    'INSERT INTO product_specifications (product_id, name, value, sort_order) VALUES (:product_id, :name, :value, :sort)'
                )->execute(['product_id' => $productId, 'name' => $name, 'value' => $value, 'sort' => $index]);
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }
}
