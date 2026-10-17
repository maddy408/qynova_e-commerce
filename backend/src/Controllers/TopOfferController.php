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

    /** Public storefront endpoint: active offers ordered by sort_order */
    public function index(): void
    {
        $stmt = $this->pdo->query(
            "SELECT id, badge, icon, title, subtitle, image_path, code, button_text, link, sort_order, is_active
             FROM top_offers
             WHERE is_active = 1
             ORDER BY sort_order ASC, id ASC"
        );
        Response::json(['top_offers' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    /** Admin endpoint: list all offers (active and inactive) */
    public function adminIndex(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        $stmt = $this->pdo->query(
            "SELECT id, badge, icon, title, subtitle, image_path, code, button_text, link, sort_order, is_active, created_at, updated_at
             FROM top_offers
             ORDER BY sort_order ASC, id ASC"
        );
        Response::json(['top_offers' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    public function show(string|int $id): void
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
        $code = isset($body['code']) && trim((string) $body['code']) !== '' ? trim((string) $body['code']) : null;
        $buttonText = trim((string) ($body['button_text'] ?? 'Shop Deals')) ?: 'Shop Deals';
        $link = trim((string) ($body['link'] ?? '/products?section=deals')) ?: '/products?section=deals';
        $sortOrder = isset($body['sort_order']) ? (int) $body['sort_order'] : 0;
        $isActive = isset($body['is_active']) ? ((int) $body['is_active'] ? 1 : 0) : 1;

        $stmt = $this->pdo->prepare(
            "INSERT INTO top_offers (badge, icon, title, subtitle, image_path, code, button_text, link, sort_order, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $badge,
            $icon,
            $title,
            $subtitle,
            $imagePath,
            $code,
            $buttonText,
            $link,
            $sortOrder,
            $isActive
        ]);

        $id = (int) $this->pdo->lastInsertId();

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
        $code = isset($body['code']) && trim((string) $body['code']) !== '' ? trim((string) $body['code']) : null;
        $buttonText = trim((string) ($body['button_text'] ?? 'Shop Deals')) ?: 'Shop Deals';
        $link = trim((string) ($body['link'] ?? '/products?section=deals')) ?: '/products?section=deals';
        $sortOrder = isset($body['sort_order']) ? (int) $body['sort_order'] : 0;
        $isActive = isset($body['is_active']) ? ((int) $body['is_active'] ? 1 : 0) : 1;

        // Check if image_path is provided in payload
        if (array_key_exists('image_path', $body)) {
            $imagePath = trim((string) $body['image_path']) !== '' ? trim((string) $body['image_path']) : null;
            $stmt = $this->pdo->prepare(
                "UPDATE top_offers
                 SET badge = ?, icon = ?, title = ?, subtitle = ?, image_path = ?, code = ?, button_text = ?, link = ?, sort_order = ?, is_active = ?
                 WHERE id = ?"
            );
            $stmt->execute([
                $badge,
                $icon,
                $title,
                $subtitle,
                $imagePath,
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
                 SET badge = ?, icon = ?, title = ?, subtitle = ?, code = ?, button_text = ?, link = ?, sort_order = ?, is_active = ?
                 WHERE id = ?"
            );
            $stmt->execute([
                $badge,
                $icon,
                $title,
                $subtitle,
                $code,
                $buttonText,
                $link,
                $sortOrder,
                $isActive,
                (int) $id
            ]);
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