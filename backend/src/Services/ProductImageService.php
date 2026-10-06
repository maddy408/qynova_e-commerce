<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

final class ProductImageService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly ImageUploadService $uploader,
    ) {
    }

    /** @param array{tmp_name: string, size: int, error: int, name: string} $file */
    public function upload(int $productId, array $file, bool $isPrimary): int
    {
        $stored = $this->uploader->store($file, "products/{$productId}");

        $countStmt = $this->pdo->prepare('SELECT COUNT(*) FROM product_images WHERE product_id = :id');
        $countStmt->execute(['id' => $productId]);
        $isFirst = (int) $countStmt->fetchColumn() === 0;

        $this->pdo->beginTransaction();

        try {
            if ($isPrimary || $isFirst) {
                $this->pdo->prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = :id')->execute(['id' => $productId]);
            }

            $sortStmt = $this->pdo->prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM product_images WHERE product_id = :id');
            $sortStmt->execute(['id' => $productId]);
            $sortOrder = (int) $sortStmt->fetchColumn();

            $this->pdo->prepare(
                'INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
                 VALUES (:product_id, :path, :thumb, :sort, :primary)'
            )->execute([
                'product_id' => $productId,
                'path' => $stored['path'],
                'thumb' => $stored['thumb_path'],
                'sort' => $sortOrder,
                'primary' => (int) ($isPrimary || $isFirst),
            ]);

            $id = (int) $this->pdo->lastInsertId();
            $this->pdo->commit();

            return $id;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            $this->uploader->delete($stored['path']);
            $this->uploader->delete($stored['thumb_path']);
            throw $e;
        }
    }

    public function setPrimary(int $productId, int $imageId): void
    {
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = :id')->execute(['id' => $productId]);
            $stmt = $this->pdo->prepare('UPDATE product_images SET is_primary = 1 WHERE id = :image_id AND product_id = :product_id');
            $stmt->execute(['image_id' => $imageId, 'product_id' => $productId]);

            if ($stmt->rowCount() === 0) {
                throw new RuntimeException('Image not found for this product');
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** @param list<int> $orderedIds */
    public function reorder(int $productId, array $orderedIds): void
    {
        foreach ($orderedIds as $index => $imageId) {
            $this->pdo->prepare('UPDATE product_images SET sort_order = :sort WHERE id = :id AND product_id = :product_id')
                ->execute(['sort' => $index, 'id' => $imageId, 'product_id' => $productId]);
        }
    }

    public function delete(int $productId, int $imageId): void
    {
        $stmt = $this->pdo->prepare('SELECT * FROM product_images WHERE id = :id AND product_id = :product_id');
        $stmt->execute(['id' => $imageId, 'product_id' => $productId]);
        $image = $stmt->fetch();

        if ($image === false) {
            throw new RuntimeException('Image not found for this product');
        }

        $this->pdo->prepare('DELETE FROM product_images WHERE id = :id')->execute(['id' => $imageId]);
        $this->uploader->delete($image['image_path']);
        $this->uploader->delete($image['thumb_path']);

        if ((bool) $image['is_primary']) {
            $next = $this->pdo->prepare('SELECT id FROM product_images WHERE product_id = :id ORDER BY sort_order LIMIT 1');
            $next->execute(['id' => $productId]);
            $nextId = $next->fetchColumn();

            if ($nextId !== false) {
                $this->pdo->prepare('UPDATE product_images SET is_primary = 1 WHERE id = :id')->execute(['id' => $nextId]);
            }
        }
    }
}
