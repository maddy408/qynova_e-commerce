<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Home page section layout (docs/DOCUMENTATION.md section 10) — just the
 * admin-configured list and ordering. Resolving each section's actual
 * items (best sellers, new arrivals, combos, deals) is storefront work
 * that isn't built yet; this is schema + CRUD so that work isn't blocked
 * later on a missing table.
 */
final class HomeSectionService
{
    private const TYPES = ['BANNER', 'CATEGORIES', 'BEST_SELLERS', 'NEW_ARRIVALS', 'FEATURED', 'COMBOS', 'DEALS', 'CUSTOM'];

    public function __construct(
        private readonly PDO $pdo,
        private readonly ImageUploadService $uploader = new ImageUploadService(),
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(): array
    {
        return $this->pdo->query('SELECT * FROM home_sections ORDER BY sort_order ASC, id ASC')->fetchAll();
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        $type = $data['type'] ?? null;
        if (!in_array($type, self::TYPES, true)) {
            throw new RuntimeException('Invalid type');
        }

        $this->pdo->prepare(
            'INSERT INTO home_sections (type, section_key, title, subtitle, badge_text, item_limit, sort_order, is_active, view_all_link)
             VALUES (:type, :section_key, :title, :subtitle, :badge_text, :item_limit, :sort_order, :is_active, :view_all_link)'
        )->execute([
            'type' => $type,
            'section_key' => $data['section_key'] ?? null,
            'title' => $data['title'] ?? null,
            'subtitle' => $data['subtitle'] ?? null,
            'badge_text' => $data['badge_text'] ?? null,
            'item_limit' => (int) ($data['item_limit'] ?? 10),
            'sort_order' => (int) ($data['sort_order'] ?? 0),
            'is_active' => (int) (bool) ($data['is_active'] ?? true),
            'view_all_link' => $data['view_all_link'] ?? null,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): void
    {
        $fields = ['type', 'section_key', 'title', 'subtitle', 'badge_text', 'item_limit', 'sort_order', 'is_active', 'image_path', 'view_all_link'];
        $sets = [];
        $params = ['id' => $id];

        foreach ($fields as $field) {
            if (!array_key_exists($field, $data)) {
                continue;
            }

            if ($field === 'type' && !in_array($data['type'], self::TYPES, true)) {
                throw new RuntimeException('Invalid type');
            }

            if ($field === 'image_path') {
                if ($data['image_path'] === null) {
                    $section = $this->find($id);
                    if ($section !== null && !empty($section['image_path'])) {
                        $this->uploader->delete($section['image_path']);
                    }
                    $sets[] = 'image_path = NULL';
                }
                continue;
            }

            $sets[] = "{$field} = :{$field}";
            $params[$field] = $field === 'is_active' ? (int) (bool) $data[$field] : $data[$field];
        }

        if ($sets === []) {
            return;
        }

        $stmt = $this->pdo->prepare('UPDATE home_sections SET ' . implode(', ', $sets) . ' WHERE id = :id');
        $stmt->execute($params);

        if ($stmt->rowCount() === 0 && $this->find($id) === null) {
            throw new RuntimeException('Home section not found');
        }
    }

    /** @param array{tmp_name: string, size: int, error: int, name: string} $file */
    public function uploadImage(int $id, array $file): string
    {
        $section = $this->find($id);
        if ($section === null) {
            throw new RuntimeException('Home section not found');
        }

        $stored = $this->uploader->store($file, "home-sections/{$id}");
        if (!empty($section['image_path'])) {
            $this->uploader->delete($section['image_path']);
        }

        $this->pdo->prepare('UPDATE home_sections SET image_path = :path WHERE id = :id')
            ->execute(['path' => $stored['path'], 'id' => $id]);

        return $stored['path'];
    }

    public function removeImage(int $id): void
    {
        $section = $this->find($id);
        if ($section === null) {
            throw new RuntimeException('Home section not found');
        }

        $this->pdo->prepare('UPDATE home_sections SET image_path = NULL WHERE id = :id')->execute(['id' => $id]);
        if (!empty($section['image_path'])) {
            $this->uploader->delete($section['image_path']);
        }
    }

    public function delete(int $id): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM home_sections WHERE id = :id');
        $stmt->execute(['id' => $id]);

        if ($stmt->rowCount() === 0) {
            throw new RuntimeException('Home section not found');
        }
    }

    /** @param list<int> $orderedIds */
    public function reorder(array $orderedIds): void
    {
        foreach ($orderedIds as $index => $id) {
            $this->pdo->prepare('UPDATE home_sections SET sort_order = :sort_order WHERE id = :id')
                ->execute(['sort_order' => $index, 'id' => (int) $id]);
        }
    }

    /** @return array<string, mixed>|null */
    private function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM home_sections WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }
}
