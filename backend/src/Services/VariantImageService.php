<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Each variant's image gallery is linked to its own variant_id — never
 * mixed with another variant's or stored only at the product level
 * (the explicit rule driving this: a customer switching from Blue/L to
 * Orange/XL must see Orange/XL's images, never Blue/L's).
 */
final class VariantImageService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly ImageUploadService $uploader,
    ) {
    }

    /** @param array{tmp_name: string, size: int, error: int, name: string} $file */
    public function upload(int $variantId, array $file, bool $isPrimary): int
    {
        $stored = $this->uploader->store($file, "variants/{$variantId}");

        $countStmt = $this->pdo->prepare('SELECT COUNT(*) FROM variant_images WHERE variant_id = :id');
        $countStmt->execute(['id' => $variantId]);
        $isFirst = (int) $countStmt->fetchColumn() === 0;

        $this->pdo->beginTransaction();

        try {
            if ($isPrimary || $isFirst) {
                $this->pdo->prepare('UPDATE variant_images SET is_primary = 0 WHERE variant_id = :id')->execute(['id' => $variantId]);
            }

            $sortStmt = $this->pdo->prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM variant_images WHERE variant_id = :id');
            $sortStmt->execute(['id' => $variantId]);
            $sortOrder = (int) $sortStmt->fetchColumn();

            $this->pdo->prepare(
                'INSERT INTO variant_images (variant_id, image_path, thumb_path, sort_order, is_primary)
                 VALUES (:variant_id, :path, :thumb, :sort, :primary)'
            )->execute([
                'variant_id' => $variantId,
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

    public function setPrimary(int $variantId, int $imageId): void
    {
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare('UPDATE variant_images SET is_primary = 0 WHERE variant_id = :id')->execute(['id' => $variantId]);
            $stmt = $this->pdo->prepare('UPDATE variant_images SET is_primary = 1 WHERE id = :image_id AND variant_id = :variant_id');
            $stmt->execute(['image_id' => $imageId, 'variant_id' => $variantId]);

            if ($stmt->rowCount() === 0) {
                throw new RuntimeException('Image not found for this variant');
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** @param list<int> $orderedIds */
    public function reorder(int $variantId, array $orderedIds): void
    {
        foreach ($orderedIds as $index => $imageId) {
            $this->pdo->prepare('UPDATE variant_images SET sort_order = :sort WHERE id = :id AND variant_id = :variant_id')
                ->execute(['sort' => $index, 'id' => $imageId, 'variant_id' => $variantId]);
        }
    }

    public function delete(int $variantId, int $imageId): void
    {
        $stmt = $this->pdo->prepare('SELECT * FROM variant_images WHERE id = :id AND variant_id = :variant_id');
        $stmt->execute(['id' => $imageId, 'variant_id' => $variantId]);
        $image = $stmt->fetch();

        if ($image === false) {
            throw new RuntimeException('Image not found for this variant');
        }

        $this->pdo->prepare('DELETE FROM variant_images WHERE id = :id')->execute(['id' => $imageId]);
        $this->uploader->delete($image['image_path']);
        $this->uploader->delete($image['thumb_path']);

        if ((bool) $image['is_primary']) {
            $next = $this->pdo->prepare('SELECT id FROM variant_images WHERE variant_id = :id ORDER BY sort_order LIMIT 1');
            $next->execute(['id' => $variantId]);
            $nextId = $next->fetchColumn();

            if ($nextId !== false) {
                $this->pdo->prepare('UPDATE variant_images SET is_primary = 1 WHERE id = :id')->execute(['id' => $nextId]);
            }
        }
    }
}
