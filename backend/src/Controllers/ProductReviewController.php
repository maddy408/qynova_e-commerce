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
     * Require customer authentication: verifies JWT and ensures customer exists in database
     *
     * @return array<string, mixed>
     */
    private function requireCustomer(): array
    {
        $token = Request::bearerToken();
        if ($token === null) {
            Response::error('You must be logged in as a registered customer to submit a review.', 401);
        }

        try {
            $claims = JwtHelper::verify($token);
        } catch (\Throwable) {
            Response::error('Session expired or invalid. Please sign in again to write a review.', 401);
        }

        $customerId = (int) ($claims['sub'] ?? 0);
        if ($customerId <= 0) {
            Response::error('Invalid customer session. Please sign in again.', 401);
        }

        $stmt = $this->pdo->prepare('SELECT id, name, email, phone FROM customers WHERE id = :id AND deleted_at IS NULL');
        $stmt->execute(['id' => $customerId]);
        $customer = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$customer) {
            Response::error('Only verified registered customers can write reviews.', 403);
        }

        return $customer;
    }

    /**
     * GET /api/products/{id}/reviews
     */
    public function index(string|int $productId): void
    {
        $id = (int) $productId;

        $stmt = $this->pdo->prepare(
            'SELECT id, product_id, customer_id, customer_name, customer_email, customer_avatar,
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

        // STRICT REQUIREMENT: Only authenticated customers present in DB can post reviews (no guest reviews)
        $customer = $this->requireCustomer();
        $customerId = (int) $customer['id'];

        $body = Request::json();

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

        // Customer Name
        $customerName = trim((string) ($body['customer_name'] ?? ''));
        if ($customerName === '') {
            $customerName = trim((string) ($customer['name'] ?? '')) ?: 'Verified Customer';
        }

        // Customer Email verification requirement
        $customerEmail = trim((string) ($body['customer_email'] ?? ''));
        if ($customerEmail === '') {
            $customerEmail = trim((string) ($customer['email'] ?? ''));
        }

        if ($customerEmail === '' || !filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
            Response::error('A valid email address is required for review verification.', 422);
        }

        // If the customer in DB does not have an email stored yet, update their profile
        if (empty($customer['email']) && !empty($customerEmail)) {
            $updateCust = $this->pdo->prepare('UPDATE customers SET email = :email WHERE id = :id AND (email IS NULL OR email = "")');
            $updateCust->execute(['email' => $customerEmail, 'id' => $customerId]);
        }

        // Check verified purchase: did this customer actually order this product?
        $isVerifiedPurchase = 0;
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

        $insert = $this->pdo->prepare(
            'INSERT INTO customer_reviews 
             (product_id, customer_id, customer_name, customer_email, customer_avatar, rating, title, comment, is_verified_purchase, helpful_count, status, created_at)
             VALUES (:product_id, :customer_id, :customer_name, :customer_email, :customer_avatar, :rating, :title, :comment, :is_verified_purchase, 0, "APPROVED", NOW())'
        );

        $insert->execute([
            'product_id' => $id,
            'customer_id' => $customerId,
            'customer_name' => $customerName,
            'customer_email' => $customerEmail,
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
            'message' => 'Thank you! Your verified review has been published.',
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
