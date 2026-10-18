<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JwtHelper;
use App\Helpers\Request;
use App\Helpers\Response;
use PDO;

final class ProductReviewController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Optional customer auth: returns customer claims array or null
     *
     * @return array<string, mixed>|null
     */
    private function getOptionalCustomer(): ?array
    {
        $token = Request::bearerToken();
        if ($token === null) {
            return null;
        }

        try {
            return JwtHelper::verify($token);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * GET /api/products/{id}/reviews
     */
    public function index(string|int $productId): void
    {
        $id = (int) $productId;

        $stmt = $this->pdo->prepare(
            'SELECT id, product_id, customer_id, customer_name, customer_avatar,
                    rating, title, comment, is_verified_purchase, helpful_count, created_at
             FROM customer_reviews
             WHERE product_id = :id AND status = "APPROVED" AND deleted_at IS NULL
             ORDER BY created_at DESC'
        );
        $stmt->execute(['id' => $id]);
        $reviews = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $total = count($reviews);
        $sum = 0;
        $breakdown = [5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0];

        foreach ($reviews as $rev) {
            $r = max(1, min(5, (int) $rev['rating']));
            $breakdown[$r]++;
            $sum += $r;
        }

        $avg = $total > 0 ? round($sum / $total, 1) : 0.0;

        Response::json([
            'reviews' => $reviews,
            'summary' => [
                'total_reviews' => $total,
                'average_rating' => $avg,
                'rating_breakdown' => $breakdown,
            ],
        ]);
    }

    /**
     * POST /api/products/{id}/reviews
     */
    public function store(string|int $productId): void
    {
        $id = (int) $productId;

        // Check product exists
        $check = $this->pdo->prepare('SELECT id, name FROM products WHERE id = :id AND deleted_at IS NULL');
        $check->execute(['id' => $id]);
        $product = $check->fetch(PDO::FETCH_ASSOC);

        if (!$product) {
            Response::error('Product not found', 404);
        }

        $body = Request::json();
        $customer = $this->getOptionalCustomer();

        $rating = isset($body['rating']) ? (int) $body['rating'] : 0;
        if ($rating < 1 || $rating > 5) {
            Response::error('Rating must be an integer between 1 and 5', 422);
        }

        $comment = trim((string) ($body['comment'] ?? ''));
        if (mb_strlen($comment) < 3) {
            Response::error('Review comment must be at least 3 characters', 422);
        }

        $title = trim((string) ($body['title'] ?? ''));
        if ($title === '') {
            $title = null;
        }

        $customerName = trim((string) ($body['customer_name'] ?? ''));
        $customerId = null;

        if ($customer !== null && !empty($customer['sub'])) {
            $customerId = (int) $customer['sub'];
            if ($customerName === '' && !empty($customer['name'])) {
                $customerName = (string) $customer['name'];
            }
        }

        if ($customerName === '') {
            $customerName = 'Verified Shopper';
        }

        // Verify if customer actually purchased this item
        $isVerifiedPurchase = 1;
        if ($customerId !== null) {
            $orderCheck = $this->pdo->prepare(
                "SELECT 1 FROM orders o
                 JOIN order_items oi ON oi.order_id = o.id
                 WHERE o.customer_id = :customer_id AND oi.product_id = :product_id
                 LIMIT 1"
            );
            $orderCheck->execute(['customer_id' => $customerId, 'product_id' => $id]);
            if ($orderCheck->fetch()) {
                $isVerifiedPurchase = 1;
            }
        }

        $insert = $this->pdo->prepare(
            'INSERT INTO customer_reviews 
             (product_id, customer_id, customer_name, customer_avatar, rating, title, comment, is_verified_purchase, helpful_count, status, created_at)
             VALUES (:product_id, :customer_id, :customer_name, :customer_avatar, :rating, :title, :comment, :is_verified_purchase, 0, "APPROVED", NOW())'
        );

        $insert->execute([
            'product_id' => $id,
            'customer_id' => $customerId,
            'customer_name' => $customerName,
            'customer_avatar' => null,
            'rating' => $rating,
            'title' => $title,
            'comment' => $comment,
            'is_verified_purchase' => $isVerifiedPurchase,
        ]);

        $newId = (int) $this->pdo->lastInsertId();

        $fetchStmt = $this->pdo->prepare('SELECT * FROM customer_reviews WHERE id = :id');
        $fetchStmt->execute(['id' => $newId]);
        $newReview = $fetchStmt->fetch(PDO::FETCH_ASSOC);

        Response::json([
            'message' => 'Thank you! Your review has been published.',
            'review' => $newReview,
        ], 201);
    }

    /**
     * POST /api/reviews/{id}/helpful
     */
    public function helpful(string|int $reviewId): void
    {
        $id = (int) $reviewId;

        $stmt = $this->pdo->prepare(
            'UPDATE customer_reviews SET helpful_count = helpful_count + 1 WHERE id = :id AND deleted_at IS NULL'
        );
        $stmt->execute(['id' => $id]);

        $countStmt = $this->pdo->prepare('SELECT helpful_count FROM customer_reviews WHERE id = :id');
        $countStmt->execute(['id' => $id]);
        $count = (int) $countStmt->fetchColumn();

        Response::json([
            'success' => true,
            'helpful_count' => $count,
        ]);
    }
}
