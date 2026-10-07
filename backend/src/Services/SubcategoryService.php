<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Subcategory master + category_subcategory mapping
 * (docs/DOCUMENTATION.md section 7). A subcategory can map to multiple
 * categories ("Kids" under both "Toys" and "Gift Items") — that mapping
 * is what lets a product's subcategory choices be filtered to only
 * subcategories under its selected categories (ProductService enforces
 * that at the product level; this service just manages the mapping
 * itself).
 */
final class SubcategoryService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly ImageUploadService $images = new ImageUploadService(),
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(): array
    {
        $subcategories = $this->pdo->query(
            "SELECT s.*,
                (SELECT COUNT(*) FROM product_subcategories ps WHERE ps.subcategory_id = s.id) AS product_count
             FROM subcategories s
             WHERE s.deleted_at IS NULL
             ORDER BY s.sort_order, s.name"
        )->fetchAll();

        foreach ($subcategories as &$subcategory) {
            $stmt = $this->pdo->prepare('SELECT category_id FROM category_subcategory WHERE subcategory_id = :id');
            $stmt->execute(['id' => $subcategory['id']]);
            $subcategory['category_ids'] = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        }
        unset($subcategory);

        return $subcategories;
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            "SELECT s.*, (SELECT COUNT(*) FROM product_subcategories ps WHERE ps.subcategory_id = s.id) AS product_count
             FROM subcategories s
             WHERE s.id = :id AND s.deleted_at IS NULL"
        );
        $stmt->execute(['id' => $id]);
        $subcategory = $stmt->fetch();

        if ($subcategory === false) {
            return null;
        }

        $catStmt = $this->pdo->prepare('SELECT category_id FROM category_subcategory WHERE subcategory_id = :id');
        $catStmt->execute(['id' => $id]);
        $subcategory['category_ids'] = array_map('intval', $catStmt->fetchAll(PDO::FETCH_COLUMN));

        return $subcategory;
    }

    /**
     * @param array<string, mixed> $data
     * @param list<int> $categoryIds
     */
    public function create(array $data, array $categoryIds): int
    {
        $name = trim((string) ($data['name'] ?? ''));

        if ($name === '') {
            throw new RuntimeException('Name is required');
        }

        if ($categoryIds === []) {
            throw new RuntimeException('At least one parent category is required');
        }

        $this->pdo->beginTransaction();

        try {
            $this->pdo->prepare(
                'INSERT INTO subcategories (name, slug, description, sort_order)
                 VALUES (:name, :slug, :description, :sort_order)'
            )->execute([
                'name' => $name,
                'slug' => $this->uniqueSlug($name),
                'description' => $data['description'] ?? null ?: null,
                'sort_order' => (int) ($data['sort_order'] ?? 0),
            ]);

            $subcategoryId = (int) $this->pdo->lastInsertId();
            $this->syncCategories($subcategoryId, $categoryIds);

            $this->pdo->commit();

            return $subcategoryId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * @param array<string, mixed> $data
     * @param list<int>|null $categoryIds
     */
    public function update(int $id, array $data, ?array $categoryIds): void
    {
        $fields = ['name', 'description', 'sort_order', 'status'];
        $sets = [];
        $params = ['id' => $id];

        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $sets[] = "{$field} = :{$field}";
                $params[$field] = $data[$field];
            }
        }

        if ($sets !== []) {
            $this->pdo->prepare('UPDATE subcategories SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
        }

        if ($categoryIds !== null) {
            if ($categoryIds === []) {
                throw new RuntimeException('At least one parent category is required');
            }
            $this->syncCategories($id, $categoryIds);
        }
    }

    public function delete(int $id): void
    {
        $this->pdo->prepare("UPDATE subcategories SET deleted_at = NOW(), status = 'INACTIVE' WHERE id = :id")->execute(['id' => $id]);
    }

    /** @param array{tmp_name: string, size: int, error: int, name: string} $file */
    public function setImage(int $id, array $file): string
    {
        $subcategory = $this->find($id);
        if ($subcategory === null) {
            throw new RuntimeException('Subcategory not found');
        }

        $stored = $this->images->store($file, 'subcategories');

        $this->pdo->prepare('UPDATE subcategories SET image_path = :path, thumb_path = :thumb WHERE id = :id')
            ->execute(['path' => $stored['path'], 'thumb' => $stored['thumb_path'], 'id' => $id]);

        $this->images->delete($subcategory['image_path'] ?? null);
        $this->images->delete($subcategory['thumb_path'] ?? null);

        return $stored['path'];
    }

    public function removeImage(int $id): void
    {
        $subcategory = $this->find($id);
        if ($subcategory === null) {
            throw new RuntimeException('Subcategory not found');
        }

        $this->pdo->prepare('UPDATE subcategories SET image_path = NULL, thumb_path = NULL WHERE id = :id')->execute(['id' => $id]);
        $this->images->delete($subcategory['image_path'] ?? null);
        $this->images->delete($subcategory['thumb_path'] ?? null);
    }

    /** @param list<int> $categoryIds */
    private function syncCategories(int $subcategoryId, array $categoryIds): void
    {
        $this->pdo->prepare('DELETE FROM category_subcategory WHERE subcategory_id = :id')->execute(['id' => $subcategoryId]);

        foreach ($categoryIds as $categoryId) {
            $this->pdo->prepare(
                'INSERT INTO category_subcategory (category_id, subcategory_id) VALUES (:category_id, :subcategory_id)'
            )->execute(['category_id' => (int) $categoryId, 'subcategory_id' => $subcategoryId]);
        }
    }

    private function uniqueSlug(string $name): string
    {
        $base = $this->slugify($name);
        $slug = $base;
        $suffix = 1;

        while (true) {
            $stmt = $this->pdo->prepare('SELECT 1 FROM subcategories WHERE slug = :slug');
            $stmt->execute(['slug' => $slug]);

            if ($stmt->fetchColumn() === false) {
                return $slug;
            }

            $slug = "{$base}-{$suffix}";
            $suffix++;
        }
    }

    private function slugify(string $value): string
    {
        $slug = mb_strtolower(trim($value));
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? $slug;

        return trim($slug, '-');
    }
}
