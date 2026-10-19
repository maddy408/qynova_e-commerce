<?php

declare(strict_types=1);

namespace App\Helpers;

final class Request
{
    /** @return array<string, mixed> */
    public static function json(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        if ($raw === '' && PHP_SAPI === 'cli') {
            $raw = file_get_contents('php://stdin') ?: '';
        }
        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : [];
    }

    public static function bearerToken(): ?string
    {
        $candidates = [
            $_SERVER['HTTP_AUTHORIZATION'] ?? null,
            $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null,
            $_SERVER['HTTP_X_AUTHORIZATION'] ?? null,
            $_SERVER['HTTP_X_CUSTOMER_TOKEN'] ?? null,
        ];

        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            $candidates[] = $headers['Authorization'] ?? null;
            $candidates[] = $headers['authorization'] ?? null;
            $candidates[] = $headers['X-Authorization'] ?? null;
            $candidates[] = $headers['x-authorization'] ?? null;
            $candidates[] = $headers['X-Customer-Token'] ?? null;
            $candidates[] = $headers['x-customer-token'] ?? null;
        }

        if (!empty($_COOKIE['storefront_customer_jwt'])) {
            $candidates[] = $_COOKIE['storefront_customer_jwt'];
        }
        if (!empty($_COOKIE['customer_jwt'])) {
            $candidates[] = $_COOKIE['customer_jwt'];
        }

        foreach ($candidates as $cand) {
            if (!is_string($cand) || trim($cand) === '') {
                continue;
            }
            $clean = trim($cand);
            if (preg_match('/^Bearer\s+(.+)$/i', $clean, $matches)) {
                return trim($matches[1]);
            }
            // Direct JWT format: header.payload.signature
            if (preg_match('/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/', $clean)) {
                return $clean;
            }
        }

        return null;
    }

    public static function query(?string $key = null, mixed $default = null): mixed
    {
        if ($key === null) {
            return $_GET;
        }

        return $_GET[$key] ?? $default;
    }

    public static function clientIp(): ?string
    {
        return $_SERVER['REMOTE_ADDR'] ?? null;
    }

    public static function userAgent(): ?string
    {
        return $_SERVER['HTTP_USER_AGENT'] ?? null;
    }
}
