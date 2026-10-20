<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\BroadcastService;
use App\Services\DeviceTokenService;
use App\Services\FcmSenderService;
use App\Services\ImageUploadService;
use App\Services\NotificationService;
use PDO;
use RuntimeException;

final class TopOfferController
{
    private readonly ImageUploadService $uploader;

    public function __construct(private readonly PDO $pdo)
    {
        $this->uploader = new ImageUploadService();
    }

    /**
     * Attach mapped products list from top_offer_products to each offer.
     * @param list<array<string, mixed>> $offers
     */
    private function attachProducts(array &$offers, bool $isPublic = false): void
    {
        if (empty($offers)) {
            return;
        }

        $offerIds = array_map(fn($o) => (int) $o['id'], $offers);
        $placeholders = implode(',', array_fill(0, count($offerIds), '?'));

        $publicClause = $isPublic ? "AND p.is_active = 1 AND p.is_ecommerce_enabled = 1" : "";

        $stmt = $this->pdo->prepare("
            SELECT top.top_offer_id, top.sort_order,
                   p.id, p.name, p.slug, p.product_code, p.short_description, p.is_active, p.is_ecommerce_enabled,
                   COALESCE(MIN(v.retail_price), 0) AS retail_price,
                   COALESCE(MIN(v.mrp), 0) AS mrp,
                   COALESCE(MAX(v.id), 0) AS default_variant_id,
                   (SELECT pi.image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1) AS image_path
            FROM top_offer_products top
            JOIN products p ON top.product_id = p.id
            LEFT JOIN product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL AND v.status = 'ACTIVE'
            WHERE top.top_offer_id IN ({$placeholders}) AND p.deleted_at IS NULL {$publicClause}
            GROUP BY top.top_offer_id, top.sort_order, p.id, p.name, p.slug, p.product_code, p.short_description, p.is_active, p.is_ecommerce_enabled
            ORDER BY top.sort_order ASC, p.id ASC
        ");
        $stmt->execute($offerIds);
        $productsByOffer = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $offerId = (int) $row['top_offer_id'];
            $productsByOffer[$offerId][] = [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'slug' => $row['slug'],
                'product_code' => $row['product_code'],
                'short_description' => $row['short_description'],
                'retail_price' => $row['retail_price'] !== null ? (float) $row['retail_price'] : 0,
                'mrp' => $row['mrp'] !== null ? (float) $row['mrp'] : 0,
                'default_variant_id' => (int) $row['default_variant_id'],
                'image_path' => $row['image_path'],
            ];
        }

        foreach ($offers as &$offer) {
            $oId = (int) $offer['id'];
            $offer['products'] = $productsByOffer[$oId] ?? [];
            $offer['product_ids'] = array_column($offer['products'], 'id');
        }
        unset($offer);
    }

    /** Public storefront endpoint: active offers ordered by sort_order */
    public function index(): void
    {
        $stmt = $this->pdo->query(
            "SELECT t.id, t.badge, t.icon, t.title, t.subtitle, t.image_path, t.product_id, t.code, t.button_text, t.link, t.sort_order, t.is_active,
                    p.name AS product_name, p.slug AS product_slug
             FROM top_offers t
             LEFT JOIN products p ON t.product_id = p.id
             WHERE t.is_active = 1
             ORDER BY t.sort_order ASC, t.id ASC"
        );
        $offers = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $this->attachProducts($offers, true);

        Response::json(['top_offers' => $offers]);
    }

    /** Admin endpoint: list all offers (active and inactive) */
    public function adminIndex(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        $stmt = $this->pdo->query(
            "SELECT t.id, t.badge, t.icon, t.title, t.subtitle, t.image_path, t.product_id, t.code, t.button_text, t.link, t.sort_order, t.is_active, t.created_at, t.updated_at,
                    p.name AS product_name, p.product_code, p.slug AS product_slug
             FROM top_offers t
             LEFT JOIN products p ON t.product_id = p.id
             ORDER BY t.sort_order ASC, t.id ASC"
        );
        $offers = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $this->attachProducts($offers, false);

        Response::json(['top_offers' => $offers]);
    }

    public function publicShow(string|int $id): void
    {
        $stmt = $this->pdo->prepare(
            "SELECT t.id, t.badge, t.icon, t.title, t.subtitle, t.image_path, t.product_id, t.code, t.button_text, t.link, t.sort_order, t.is_active
             FROM top_offers t
             WHERE t.id = ? AND t.is_active = 1"
        );
        $stmt->execute([(int) $id]);
        $offer = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$offer) {
            Response::error('Offer not found or inactive', 404);
            return;
        }

        $singleList = [$offer];
        $this->attachProducts($singleList, true);
        $offer = $singleList[0];

        Response::json(['top_offer' => $offer]);
    }

    public function show(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        $stmt = $this->pdo->prepare(
            "SELECT t.*, p.name AS product_name, p.product_code, p.slug AS product_slug
             FROM top_offers t
             LEFT JOIN products p ON t.product_id = p.id
             WHERE t.id = ?"
        );
        $stmt->execute([(int) $id]);
        $offer = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$offer) {
            Response::error('Top offer not found', 404);
            return;
        }

        $singleList = [$offer];
        $this->attachProducts($singleList, false);
        $offer = $singleList[0];

        Response::json(['top_offer' => $offer]);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        $body = Request::json();
        $badge = trim((string) ($body['badge'] ?? ''));
        $title = trim((string) ($body['title'] ?? ''));
        if ($badge === '' || $title === '') {
            Response::error('Badge and Title are required', 422);
            return;
        }

        $icon = trim((string) ($body['icon'] ?? 'percent')) ?: 'percent';
        $subtitle = isset($body['subtitle']) ? trim((string) $body['subtitle']) : null;
        $imagePath = isset($body['image_path']) && trim((string) $body['image_path']) !== '' ? trim((string) $body['image_path']) : null;

        // Support multiple product_ids array or single product_id
        $productIds = [];
        if (isset($body['product_ids']) && is_array($body['product_ids'])) {
            $productIds = array_values(array_unique(array_filter(array_map('intval', $body['product_ids']), fn($pId) => $pId > 0)));
        } elseif (isset($body['product_id']) && (int) $body['product_id'] > 0) {
            $productIds = [(int) $body['product_id']];
        }
        $primaryProductId = $productIds[0] ?? null;

        $code = isset($body['code']) && trim((string) $body['code']) !== '' ? trim((string) $body['code']) : null;
        $buttonText = trim((string) ($body['button_text'] ?? 'Shop Deals')) ?: 'Shop Deals';
        $link = trim((string) ($body['link'] ?? ''));
        if ($link === '' || str_starts_with($link, '/product/')) {
            $link = '/products?section=deals';
        }
        $sortOrder = isset($body['sort_order']) ? (int) $body['sort_order'] : 0;
        $isActive = isset($body['is_active']) ? ((int) $body['is_active'] ? 1 : 0) : 1;

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                "INSERT INTO top_offers (badge, icon, title, subtitle, image_path, product_id, code, button_text, link, sort_order, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            $stmt->execute([
                $badge,
                $icon,
                $title,
                $subtitle,
                $imagePath,
                $primaryProductId,
                $code,
                $buttonText,
                $link,
                $sortOrder,
                $isActive
            ]);

            $id = (int) $this->pdo->lastInsertId();

            if (!empty($productIds)) {
                $prodStmt = $this->pdo->prepare("INSERT INTO top_offer_products (top_offer_id, product_id, sort_order) VALUES (?, ?, ?)");
                foreach ($productIds as $idx => $pId) {
                    $prodStmt->execute([$id, $pId, $idx]);
                }
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Failed to create top offer: ' . $e->getMessage(), 500);
            return;
        }

        // Automatically dispatch push notification to customers for new top offer
        try {
            $notifyTitle = $badge !== '' ? "🔥 {$badge}: {$title}" : "🎉 New Offer: {$title}";
            $notifyBody = $code !== null
                ? "Use code '{$code}'! " . ($subtitle ?: 'Check out this exclusive deal today.')
                : ($subtitle ?: 'New exclusive deal just added! Tap to explore discounts.');

            $notifications = new NotificationService($this->pdo);
            $deviceTokens = new DeviceTokenService($this->pdo);
            $fcm = new FcmSenderService($deviceTokens);
            $broadcastService = new BroadcastService($this->pdo, $notifications, $deviceTokens, $fcm);

            $broadcastService->sendToCustomers(
                title: $notifyTitle,
                body: $notifyBody,
                sentByUserId: (int) ($claims['sub'] ?? 1),
                targetCustomerIds: [], // All active customers
                type: 'OFFER',
                data: [
                    'type' => 'OFFER',
                    'reference_type' => 'TOP_OFFER',
                    'reference_id' => (string) $id,
                    'code' => (string) ($code ?? ''),
                    'url' => $link,
                    'click_action' => $link,
                    'image' => $imagePath ?: '',
                ],
                referenceType: 'TOP_OFFER',
                referenceId: $id,
            );
        } catch (\Throwable $e) {
            error_log('TopOfferController: automatic push notification failed: ' . $e->getMessage());
        }

        Response::json([
            'id' => $id,
            'message' => 'Top offer created successfully and push notification sent to customers',
        ], 201);
    }

    public function update(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        $body = Request::json();
        $badge = trim((string) ($body['badge'] ?? ''));
        $title = trim((string) ($body['title'] ?? ''));
        if ($badge === '' || $title === '') {
            Response::error('Badge and Title are required', 422);
            return;
        }

        $icon = trim((string) ($body['icon'] ?? 'percent')) ?: 'percent';
        $subtitle = isset($body['subtitle']) ? trim((string) $body['subtitle']) : null;

        // Support multiple product_ids array or single product_id
        $productIds = null;
        if (array_key_exists('product_ids', $body) && is_array($body['product_ids'])) {
            $productIds = array_values(array_unique(array_filter(array_map('intval', $body['product_ids']), fn($pId) => $pId > 0)));
        } elseif (array_key_exists('product_id', $body) && (int) $body['product_id'] > 0) {
            $productIds = [(int) $body['product_id']];
        } elseif (array_key_exists('product_id', $body) && empty($body['product_id'])) {
            $productIds = [];
        }

        $primaryProductId = $productIds !== null ? ($productIds[0] ?? null) : (isset($body['product_id']) && (int) $body['product_id'] > 0 ? (int) $body['product_id'] : null);

        $code = isset($body['code']) && trim((string) $body['code']) !== '' ? trim((string) $body['code']) : null;
        $buttonText = trim((string) ($body['button_text'] ?? 'Shop Deals')) ?: 'Shop Deals';
        $link = trim((string) ($body['link'] ?? ''));
        if ($link === '' || str_starts_with($link, '/product/')) {
            $link = '/products?section=deals';
        }
        $sortOrder = isset($body['sort_order']) ? (int) $body['sort_order'] : 0;
        $isActive = isset($body['is_active']) ? ((int) $body['is_active'] ? 1 : 0) : 1;

        $this->pdo->beginTransaction();
        try {
            // Check if image_path is provided in payload
            if (array_key_exists('image_path', $body)) {
                $imagePath = trim((string) $body['image_path']) !== '' ? trim((string) $body['image_path']) : null;
                $stmt = $this->pdo->prepare(
                    "UPDATE top_offers
                     SET badge = ?, icon = ?, title = ?, subtitle = ?, image_path = ?, product_id = ?, code = ?, button_text = ?, link = ?, sort_order = ?, is_active = ?
                     WHERE id = ?"
                );
                $stmt->execute([
                    $badge,
                    $icon,
                    $title,
                    $subtitle,
                    $imagePath,
                    $primaryProductId,
                    $code,
                    $buttonText,
                    $link,
                    $sortOrder,
                    $isActive,
                    (int) $id
                ]);
            } else {
                $stmt = $this->pdo->prepare(
                    "UPDATE top_offers
                     SET badge = ?, icon = ?, title = ?, subtitle = ?, product_id = ?, code = ?, button_text = ?, link = ?, sort_order = ?, is_active = ?
                     WHERE id = ?"
                );
                $stmt->execute([
                    $badge,
                    $icon,
                    $title,
                    $subtitle,
                    $primaryProductId,
                    $code,
                    $buttonText,
                    $link,
                    $sortOrder,
                    $isActive,
                    (int) $id
                ]);
            }

            if ($productIds !== null) {
                $this->pdo->prepare("DELETE FROM top_offer_products WHERE top_offer_id = ?")->execute([(int) $id]);
                if (!empty($productIds)) {
                    $prodStmt = $this->pdo->prepare("INSERT INTO top_offer_products (top_offer_id, product_id, sort_order) VALUES (?, ?, ?)");
                    foreach ($productIds as $idx => $pId) {
                        $prodStmt->execute([(int) $id, $pId, $idx]);
                    }
                }
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Failed to update top offer: ' . $e->getMessage(), 500);
            return;
        }

        Response::json(['message' => 'Top offer updated successfully']);
    }

    public function uploadImage(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        if (!isset($_FILES['file'])) {
            Response::error('A file upload named "file" is required', 422);
            return;
        }

        $stmt = $this->pdo->prepare("SELECT * FROM top_offers WHERE id = ?");
        $stmt->execute([(int) $id]);
        $offer = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$offer) {
            Response::error('Top offer not found', 404);
            return;
        }

        try {
            $stored = $this->uploader->store($_FILES['file'], "top-offers/{$id}");
            if (!empty($offer['image_path']) && !str_starts_with($offer['image_path'], 'http')) {
                $this->uploader->delete($offer['image_path']);
            }

            $this->pdo->prepare('UPDATE top_offers SET image_path = ? WHERE id = ?')
                ->execute([$stored['path'], (int) $id]);

            Response::json(['image_path' => $stored['path']]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function removeImage(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        $stmt = $this->pdo->prepare("SELECT * FROM top_offers WHERE id = ?");
        $stmt->execute([(int) $id]);
        $offer = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$offer) {
            Response::error('Top offer not found', 404);
            return;
        }

        if (!empty($offer['image_path']) && !str_starts_with($offer['image_path'], 'http')) {
            $this->uploader->delete($offer['image_path']);
        }

        $this->pdo->prepare('UPDATE top_offers SET image_path = NULL WHERE id = ?')
            ->execute([(int) $id]);

        Response::json(['updated' => true]);
    }

    public function toggle(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        $stmt = $this->pdo->prepare("UPDATE top_offers SET is_active = 1 - is_active WHERE id = ?");
        $stmt->execute([(int) $id]);
        Response::json(['message' => 'Status updated']);
    }

    public function destroy(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        $stmt = $this->pdo->prepare("SELECT * FROM top_offers WHERE id = ?");
        $stmt->execute([(int) $id]);
        $offer = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($offer && !empty($offer['image_path']) && !str_starts_with($offer['image_path'], 'http')) {
            $this->uploader->delete($offer['image_path']);
        }

        $stmt = $this->pdo->prepare("DELETE FROM top_offers WHERE id = ?");
        $stmt->execute([(int) $id]);
        Response::json(['message' => 'Top offer deleted']);
    }
}