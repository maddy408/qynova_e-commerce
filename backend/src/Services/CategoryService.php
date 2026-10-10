<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Category master (docs/DOCUMENTATION.md section 7). Name/slug are
 * unique case-insensitively via the table's collation (utf8mb4_unicode_ci),
 * not application code — a duplicate insert surfaces as a PDO integrity
 * error, which the controller maps to a 409.
 */
final class CategoryService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly ImageUploadService $images = new ImageUploadService(),
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(?string $sort = null): array
    {
        $sort = $sort ?? ($_GET['sort'] ?? null);
        $orderClause = ($sort === 'sort_order' || $sort === 'order')
            ? 'c.sort_order ASC, c.name ASC'
            : 'total_units_sold DESC, c.sort_order ASC, c.name ASC';

        return $this->pdo->query(
            "SELECT c.*,
                (SELECT COUNT(*) FROM category_subcategory cs WHERE cs.category_id = c.id) AS subcategory_count,
                (SELECT COUNT(*) FROM product_categories pc WHERE pc.category_id = c.id) AS product_count,
                COALESCE((
                    SELECT SUM(ii.quantity) 
                    FROM invoice_items ii 
                    JOIN product_variants pv ON pv.id = ii.variant_id 
                    JOIN product_categories pc ON pc.product_id = pv.product_id 
                    WHERE pc.category_id = c.id
                ), 0) AS total_units_sold
             FROM categories c
             WHERE c.deleted_at IS NULL
             ORDER BY {$orderClause}"
        )->fetchAll();
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            "SELECT c.*,
                (SELECT COUNT(*) FROM category_subcategory cs WHERE cs.category_id = c.id) AS subcategory_count,
                (SELECT COUNT(*) FROM product_categories pc WHERE pc.category_id = c.id) AS product_count
             FROM categories c
             WHERE c.id = :id AND c.deleted_at IS NULL"
        );
        $stmt->execute(['id' => $id]);

        return $stmt->fetch() ?: null;
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        $name = trim((string) ($data['name'] ?? ''));

        if ($name === '') {
            throw new RuntimeException('Name is required');
        }

        $this->pdo->prepare(
            'INSERT INTO categories (name, slug, description, sort_order)
             VALUES (:name, :slug, :description, :sort_order)'
        )->execute([
            'name' => $name,
            'slug' => $this->uniqueSlug($name),
            'description' => $data['description'] ?? null ?: null,
            'sort_order' => (int) ($data['sort_order'] ?? 0),
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): void
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

        if ($sets === []) {
            return;
        }

        $this->pdo->prepare('UPDATE categories SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
    }

    public function delete(int $id): void
    {
        $this->pdo->prepare("UPDATE categories SET deleted_at = NOW(), status = 'INACTIVE' WHERE id = :id")->execute(['id' => $id]);
    }

    /**
     * T13: Reorder categories within a database transaction.
     * Sets sort_order = 1, 2, 3, ... based on ordered category IDs.
     *
     * @param list<int> $orderedIds
     */
    public function reorder(array $orderedIds): void
    {
        if ($orderedIds === []) {
            return;
        }

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('UPDATE categories SET sort_order = :sort_order WHERE id = :id AND deleted_at IS NULL');
            foreach ($orderedIds as $index => $id) {
                $stmt->execute(['sort_order' => $index + 1, 'id' => (int) $id]);
            }
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Validates, compresses and converts the upload to WebP, stores it,
     * swaps the category's image_path to it, then deletes the old file —
     * never leaving both the old and new file on disk.
     *
     * @param array{tmp_name: string, size: int, error: int, name: string} $file
     */
    public function setImage(int $id, array $file): string
    {
        $category = $this->find($id);
        if ($category === null) {
            throw new RuntimeException('Category not found');
        }

        $stored = $this->images->store($file, 'categories');

        $this->pdo->prepare('UPDATE categories SET image_path = :path, thumb_path = :thumb WHERE id = :id')
            ->execute(['path' => $stored['path'], 'thumb' => $stored['thumb_path'], 'id' => $id]);

        $this->images->delete($category['image_path'] ?? null);
        $this->images->delete($category['thumb_path'] ?? null);

        return $stored['path'];
    }

    public function removeImage(int $id): void
    {
        $category = $this->find($id);
        if ($category === null) {
            throw new RuntimeException('Category not found');
        }

        $this->pdo->prepare('UPDATE categories SET image_path = NULL, thumb_path = NULL WHERE id = :id')->execute(['id' => $id]);
        $this->images->delete($category['image_path'] ?? null);
        $this->images->delete($category['thumb_path'] ?? null);
    }

    private function uniqueSlug(string $name): string
    {
        $base = $this->slugify($name);
        $slug = $base;
        $suffix = 1;

        while (true) {
            $stmt = $this->pdo->prepare('SELECT 1 FROM categories WHERE slug = :slug');
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
