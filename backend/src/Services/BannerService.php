<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Banner CRUD + their attached landing-page products (docs/DOCUMENTATION.md
 * section 10). target_id is polymorphic (depends on target_type), so it's
 * validated here against the right table rather than enforced by an FK.
 */
final class BannerService
{
    private const TARGET_TABLES = [
        'PRODUCT' => 'products',
        'CATEGORY' => 'categories',
        'SUBCATEGORY' => 'subcategories',
        'BRAND' => 'brands',
        'COUPON' => 'coupons',
    ];

    public function __construct(
        private readonly PDO $pdo,
        private readonly ImageUploadService $images,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(?string $position = null): array
    {
        $where = [];
        $params = [];

        if ($position !== null) {
            $where[] = 'position = :position';
            $params['position'] = $position;
        }

        $whereSql = $where === [] ? '1=1' : implode(' AND ', $where);

        $stmt = $this->pdo->prepare("SELECT * FROM banners WHERE {$whereSql} ORDER BY sort_order ASC, id DESC");
        $stmt->execute($params);
        $banners = $stmt->fetchAll();

        foreach ($banners as &$banner) {
            $banner['items'] = $this->itemsFor((int) $banner['id']);
        }
        unset($banner);

        return $banners;
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM banners WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $banner = $stmt->fetch();

        if ($banner === false) {
            return null;
        }

        $banner['items'] = $this->itemsFor($id);

        return $banner;
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        $title = trim((string) ($data['title'] ?? ''));
        if ($title === '') {
            throw new RuntimeException('title is required');
        }

        $position = $data['position'] ?? 'HOME_HERO';
        if (!in_array($position, ['HOME_HERO', 'HOME_MIDDLE', 'CATEGORY_PAGE', 'POPUP'], true)) {
            throw new RuntimeException('Invalid position');
        }

        $targetType = $data['target_type'] ?? 'NONE';
        $targetId = $this->resolveTarget($targetType, isset($data['target_id']) ? (int) $data['target_id'] : null);

        if ($targetType === 'EXTERNAL_URL' && trim((string) ($data['target_url'] ?? '')) === '') {
            throw new RuntimeException('target_url is required for target_type EXTERNAL_URL');
        }

        $this->pdo->prepare(
            'INSERT INTO banners (title, position, target_type, target_id, target_url, starts_at, ends_at, sort_order, is_active)
             VALUES (:title, :position, :target_type, :target_id, :target_url, :starts_at, :ends_at, :sort_order, :is_active)'
        )->execute([
            'title' => $title,
            'position' => $position,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'target_url' => $targetType === 'EXTERNAL_URL' ? ($data['target_url'] ?? null) : null,
            'starts_at' => $data['starts_at'] ?? null,
            'ends_at' => $data['ends_at'] ?? null,
            'sort_order' => (int) ($data['sort_order'] ?? 0),
            'is_active' => (int) (bool) ($data['is_active'] ?? true),
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): void
    {
        if ($this->find($id) === null) {
            throw new RuntimeException('Banner not found');
        }

        $fields = ['title', 'position', 'starts_at', 'ends_at', 'sort_order', 'is_active'];
        $sets = [];
        $params = ['id' => $id];

        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $sets[] = "{$field} = :{$field}";
                $params[$field] = $field === 'is_active' ? (int) (bool) $data[$field] : $data[$field];
            }
        }

        if (array_key_exists('target_type', $data)) {
            $targetType = $data['target_type'];
            $targetId = $this->resolveTarget($targetType, isset($data['target_id']) ? (int) $data['target_id'] : null);

            $sets[] = 'target_type = :target_type';
            $params['target_type'] = $targetType;
            $sets[] = 'target_id = :target_id';
            $params['target_id'] = $targetId;
            $sets[] = 'target_url = :target_url';
            $params['target_url'] = $targetType === 'EXTERNAL_URL' ? ($data['target_url'] ?? null) : null;
        }

        if ($sets === []) {
            return;
        }

        $this->pdo->prepare('UPDATE banners SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
    }

    /** @param array{tmp_name: string, size: int, error: int, name: string} $desktopFile */
    public function uploadDesktopImage(int $id, array $desktopFile): string
    {
        $banner = $this->find($id);
        if ($banner === null) {
            throw new RuntimeException('Banner not found');
        }

        $upload = $this->images->store($desktopFile, 'banners');
        $this->images->delete($banner['image_desktop_path']);

        $this->pdo->prepare('UPDATE banners SET image_desktop_path = :path WHERE id = :id')
            ->execute(['path' => $upload['path'], 'id' => $id]);

        return $upload['path'];
    }

    /** @param array{tmp_name: string, size: int, error: int, name: string} $mobileFile */
    public function uploadMobileImage(int $id, array $mobileFile): string
    {
        $banner = $this->find($id);
        if ($banner === null) {
            throw new RuntimeException('Banner not found');
        }

        $upload = $this->images->store($mobileFile, 'banners');
        $this->images->delete($banner['image_mobile_path']);

        $this->pdo->prepare('UPDATE banners SET image_mobile_path = :path WHERE id = :id')
            ->execute(['path' => $upload['path'], 'id' => $id]);

        return $upload['path'];
    }

    public function delete(int $id): void
    {
        $banner = $this->find($id);
        if ($banner === null) {
            throw new RuntimeException('Banner not found');
        }

        $this->images->delete($banner['image_desktop_path']);
        $this->images->delete($banner['image_mobile_path']);

        $this->pdo->prepare('DELETE FROM banners WHERE id = :id')->execute(['id' => $id]);
    }

    /** @param list<int> $orderedIds */
    public function reorder(array $orderedIds): void
    {
        foreach ($orderedIds as $index => $id) {
            $this->pdo->prepare('UPDATE banners SET sort_order = :sort_order WHERE id = :id')
                ->execute(['sort_order' => $index, 'id' => (int) $id]);
        }
    }

    public function addItem(int $bannerId, int $productId, ?string $offerText): int
    {
        if ($this->find($bannerId) === null) {
            throw new RuntimeException('Banner not found');
        }

        $productExists = $this->pdo->prepare('SELECT 1 FROM products WHERE id = :id');
        $productExists->execute(['id' => $productId]);
        if ($productExists->fetchColumn() === false) {
            throw new RuntimeException('Product not found');
        }

        $this->pdo->prepare(
            'INSERT INTO banner_items (banner_id, product_id, offer_text) VALUES (:banner_id, :product_id, :offer_text)
             ON DUPLICATE KEY UPDATE offer_text = VALUES(offer_text)'
        )->execute(['banner_id' => $bannerId, 'product_id' => $productId, 'offer_text' => $offerText]);

        return (int) $this->pdo->lastInsertId();
    }

    public function removeItem(int $bannerId, int $itemId): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM banner_items WHERE id = :item_id AND banner_id = :banner_id');
        $stmt->execute(['item_id' => $itemId, 'banner_id' => $bannerId]);

        if ($stmt->rowCount() === 0) {
            throw new RuntimeException('Banner item not found');
        }
    }

    /** @return list<array<string, mixed>> */
    private function itemsFor(int $bannerId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT bi.id, bi.product_id, bi.offer_text, bi.sort_order, p.name AS product_name
             FROM banner_items bi JOIN products p ON p.id = bi.product_id
             WHERE bi.banner_id = :id ORDER BY bi.sort_order ASC, bi.id ASC'
        );
        $stmt->execute(['id' => $bannerId]);

        return $stmt->fetchAll();
    }

    private function resolveTarget(string $targetType, ?int $targetId): ?int
    {
        if ($targetType === 'NONE' || $targetType === 'EXTERNAL_URL') {
            return null;
        }

        if (!array_key_exists($targetType, self::TARGET_TABLES)) {
            throw new RuntimeException('Invalid target_type');
        }

        if ($targetId === null) {
            throw new RuntimeException('target_id is required for this target_type');
        }

        $table = self::TARGET_TABLES[$targetType];
        $stmt = $this->pdo->prepare("SELECT 1 FROM {$table} WHERE id = :id");
        $stmt->execute(['id' => $targetId]);

        if ($stmt->fetchColumn() === false) {
            throw new RuntimeException("Target {$targetType} not found");
        }

        return $targetId;
    }
}
