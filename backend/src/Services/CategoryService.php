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
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array<string, mixed>> */
    public function list(): array
    {
        return $this->pdo->query(
            "SELECT c.*,
                (SELECT COUNT(*) FROM category_subcategory cs WHERE cs.category_id = c.id) AS subcategory_count,
                (SELECT COUNT(*) FROM product_categories pc WHERE pc.category_id = c.id) AS product_count
             FROM categories c
             WHERE c.deleted_at IS NULL
             ORDER BY c.sort_order, c.name"
        )->fetchAll();
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
