<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Config;
use Firebase\JWT\JWT;

/**
 * Server-side push delivery via Firebase Cloud Messaging's HTTP v1 API,
 * authenticated with a Google service-account OAuth2 flow (no Firebase
 * Admin SDK exists for PHP from Google itself; this avoids pulling in a
 * large third-party package — firebase/php-jwt, already a dependency
 * for this project's own JWT auth, is all RS256-signing the service-
 * account assertion needs).
 *
 * This is a best-effort, swallow-all-errors sender by design: every
 * public method here returns a result rather than throwing, because a
 * push notification failing to send must never roll back or fail the
 * business operation that triggered it (an order placed, a status
 * changed) — see NotificationService::create()'s docblock for the
 * corresponding separation on the in-app-record side.
 *
 * Fully inert (every send() call immediately returns false) unless both
 * FCM_ENABLED=true and a readable service-account JSON file exists at
 * FIREBASE_SERVICE_ACCOUNT_PATH — see .env.example and the project
 * README for how to obtain one from the Firebase Console.
 */
final class FcmSenderService
{
    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';
    private const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

    private ?array $serviceAccount = null;
    private bool $serviceAccountLoadAttempted = false;
    private ?string $cachedAccessToken = null;
    private int $cachedAccessTokenExpiresAt = 0;

    public function __construct(private readonly ?DeviceTokenService $deviceTokens = null)
    {
    }

    public function isConfigured(): bool
    {
        return Config::get('fcm.enabled') === true && $this->loadServiceAccount() !== null;
    }

    /**
     * Sends to every token in the list, tolerating individual failures.
     * Tokens FCM reports as unregistered/invalid are deactivated via
     * DeviceTokenService so future sends don't keep retrying them.
     *
     * @param list<string> $tokens
     * @param array<string, string> $data string-only values — FCM's data
     *        payload requires every value to be a string, never nested.
     * @return array{attempted: int, sent: int}
     */
    public function sendToTokens(array $tokens, string $title, string $body, array $data = []): array
    {
        $sent = 0;

        foreach ($tokens as $token) {
            if ($this->send($token, $title, $body, $data)) {
                $sent++;
            }
        }

        return ['attempted' => count($tokens), 'sent' => $sent];
    }

    /** @param array<string, string> $data */
    public function send(string $token, string $title, string $body, array $data = []): bool
    {
        if (!$this->isConfigured()) {
            return false;
        }

        $accessToken = $this->getAccessToken();
        if ($accessToken === null) {
            return false;
        }

        $projectId = (string) Config::get('fcm.project_id');
        $url = "https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send";

        $payload = [
            'message' => [
                'token' => $token,
                'notification' => [
                    'title' => $title,
                    'body' => $body,
                ],
                'data' => array_map('strval', $data),
                'webpush' => [
                    'fcm_options' => array_key_exists('click_action', $data) ? ['link' => $data['click_action']] : [],
                ],
            ],
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $accessToken,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => 8,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            error_log('FcmSenderService: cURL error sending push: ' . $curlError);

            return false;
        }

        if ($status >= 200 && $status < 300) {
            return true;
        }

        $decoded = json_decode((string) $response, true);
        $errorStatus = $decoded['error']['status'] ?? null;

        if (in_array($errorStatus, ['NOT_FOUND', 'UNREGISTERED', 'INVALID_ARGUMENT'], true)) {
            $this->deviceTokens?->deactivateToken($token);
        }

        error_log("FcmSenderService: FCM send failed, HTTP {$status}, status={$errorStatus}");

        return false;
    }

    /** @return array<string, mixed>|null */
    private function loadServiceAccount(): ?array
    {
        if ($this->serviceAccountLoadAttempted) {
            return $this->serviceAccount;
        }

        $this->serviceAccountLoadAttempted = true;

        $path = (string) Config::get('fcm.service_account_path');
        if ($path === '') {
            return null;
        }

        // A relative path (the documented default, e.g.
        // "storage/firebase-service-account.json") is resolved against
        // the backend's own root — never the current working directory,
        // which depends on how/where the PHP process happens to be
        // started and would otherwise make this silently stop finding
        // the file under a different invocation (cron, a different
        // docroot, etc).
        if (!preg_match('#^(/|[A-Za-z]:[\\\\/])#', $path)) {
            $path = dirname(__DIR__, 2) . '/' . $path;
        }

        if (!is_file($path) || !is_readable($path)) {
            return null;
        }

        $contents = file_get_contents($path);
        if ($contents === false) {
            return null;
        }

        $decoded = json_decode($contents, true);
        if (!is_array($decoded) || !isset($decoded['private_key'], $decoded['client_email'])) {
            return null;
        }

        $this->serviceAccount = $decoded;

        return $decoded;
    }

    private function getAccessToken(): ?string
    {
        if ($this->cachedAccessToken !== null && time() < $this->cachedAccessTokenExpiresAt) {
            return $this->cachedAccessToken;
        }

        $serviceAccount = $this->loadServiceAccount();
        if ($serviceAccount === null) {
            return null;
        }

        $now = time();
        $assertion = JWT::encode([
            'iss' => $serviceAccount['client_email'],
            'scope' => self::SCOPE,
            'aud' => self::TOKEN_URL,
            'iat' => $now,
            'exp' => $now + 3600,
        ], $serviceAccount['private_key'], 'RS256');

        $ch = curl_init(self::TOKEN_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query([
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $assertion,
            ]),
            CURLOPT_TIMEOUT => 8,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $status < 200 || $status >= 300) {
            error_log("FcmSenderService: OAuth token exchange failed, HTTP {$status}");

            return null;
        }

        $decoded = json_decode((string) $response, true);
        if (!isset($decoded['access_token'])) {
            return null;
        }

        $this->cachedAccessToken = $decoded['access_token'];
        $this->cachedAccessTokenExpiresAt = $now + (int) ($decoded['expires_in'] ?? 3600) - 60;

        return $this->cachedAccessToken;
    }
}
