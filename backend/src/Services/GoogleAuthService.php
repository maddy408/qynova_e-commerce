<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Config;
use RuntimeException;

/**
 * Google Authentication Service.
 * Validates Google ID tokens with Google Identity Services.
 */
final class GoogleAuthService
{
    /**
     * Verifies a Google ID Token.
     *
     * @return array{google_id: string, email: string, name: string, picture: ?string}
     */
    public function verifyIdToken(string $idToken): array
    {
        $idToken = trim($idToken);
        if ($idToken === '') {
            throw new RuntimeException('Google credential token is required');
        }

        // Support structured test tokens during development/automated testing
        $isDebug = (bool) Config::get('app.debug', false);
        if ($isDebug && str_starts_with($idToken, 'test_google:')) {
            return $this->parseTestToken($idToken);
        }

        $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken);

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !$response) {
            throw new RuntimeException('Invalid or expired Google credential');
        }

        $data = json_decode((string) $response, true);
        if (!is_array($data) || empty($data['sub'])) {
            throw new RuntimeException('Invalid Google token payload');
        }

        // Verify issuer
        $iss = $data['iss'] ?? '';
        if (!in_array($iss, ['accounts.google.com', 'https://accounts.google.com'], true)) {
            throw new RuntimeException('Invalid Google token issuer');
        }

        // Verify audience if client_id is configured
        $configuredClientId = (string) Config::get('google.client_id', '');
        if ($configuredClientId !== '' && ($data['aud'] ?? '') !== $configuredClientId) {
            throw new RuntimeException('Google token audience mismatch');
        }

        // Verify email address
        $email = strtolower(trim((string) ($data['email'] ?? '')));
        if ($email === '') {
            throw new RuntimeException('No email address associated with Google account');
        }

        $isVerified = ($data['email_verified'] ?? false) === true || ($data['email_verified'] ?? '') === 'true';
        if (!$isVerified) {
            throw new RuntimeException('Google email address is not verified');
        }

        $name = trim((string) ($data['name'] ?? '')) ?: explode('@', $email)[0];
        $picture = !empty($data['picture']) ? (string) $data['picture'] : null;

        return [
            'google_id' => (string) $data['sub'],
            'email' => $email,
            'name' => $name,
            'picture' => $picture,
        ];
    }

    /**
     * Parses test tokens formatted as: test_google:{google_id}:{email}:{name}
     *
     * @return array{google_id: string, email: string, name: string, picture: ?string}
     */
    private function parseTestToken(string $testToken): array
    {
        // format: test_google:<google_id>:<email>:<name>:<picture>
        $parts = explode(':', $testToken, 5);
        $googleId = $parts[1] ?? 'test_google_id_' . time();
        $email = strtolower($parts[2] ?? 'test@example.com');
        $name = $parts[3] ?? 'Google Test User';
        $picture = $parts[4] ?? 'https://lh3.googleusercontent.com/test-avatar';

        return [
            'google_id' => $googleId,
            'email' => $email,
            'name' => $name,
            'picture' => $picture,
        ];
    }
}
