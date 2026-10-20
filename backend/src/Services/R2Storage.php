<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Config;
use RuntimeException;

/**
 * Minimal Cloudflare R2 client (S3-compatible API, AWS Signature V4).
 * Only what the app needs: PUT and DELETE objects. No SDK dependency,
 * just ext-curl, so it runs on XAMPP / shared hosting as-is.
 *
 * Configure in backend/.env:
 *   R2_ENABLED=true
 *   R2_ACCOUNT_ID=...            (Cloudflare account id)
 *   R2_ACCESS_KEY_ID=...         (from "Manage API Tokens" → R2 token)
 *   R2_SECRET_ACCESS_KEY=...
 *   R2_BUCKET=adams-images
 *   R2_PUBLIC_URL=https://pub-xxxx.r2.dev   (or your custom domain)
 */
final class R2Storage
{
    private const REGION = 'auto';
    private const SERVICE = 's3';

    private string $endpointHost;

    public function __construct(
        private readonly string $accountId,
        private readonly string $accessKeyId,
        private readonly string $secretAccessKey,
        private readonly string $bucket,
        private readonly string $publicUrl,
        ?string $endpoint = null,
    ) {
        $endpoint = $endpoint ?: "https://{$accountId}.r2.cloudflarestorage.com";
        $port = parse_url($endpoint, PHP_URL_PORT);
        $this->endpointHost = (string) parse_url($endpoint, PHP_URL_HOST) . ($port ? ":{$port}" : '');
    }

    /** Returns a configured client, or null when R2 is disabled / incomplete. */
    public static function fromConfig(): ?self
    {
        if (!Config::get('r2.enabled', false)) {
            return null;
        }

        $required = ['account_id', 'access_key_id', 'secret_access_key', 'bucket', 'public_url'];
        foreach ($required as $key) {
            if (trim((string) Config::get("r2.{$key}", '')) === '') {
                throw new RuntimeException("R2 is enabled but R2_" . strtoupper($key) . ' is not set in .env');
            }
        }

        return new self(
            (string) Config::get('r2.account_id'),
            (string) Config::get('r2.access_key_id'),
            (string) Config::get('r2.secret_access_key'),
            (string) Config::get('r2.bucket'),
            (string) Config::get('r2.public_url'),
            (string) Config::get('r2.endpoint', ''),
        );
    }

    /** Uploads bytes and returns the public URL of the object. */
    public function put(string $key, string $body, string $contentType): string
    {
        $key = ltrim($key, '/');
        $this->request('PUT', $key, $body, [
            'content-type' => $contentType,
            // filenames are random, so the content never changes → cache forever
            'cache-control' => 'public, max-age=31536000, immutable',
        ]);

        return $this->urlFor($key);
    }

    public function delete(string $key): void
    {
        $this->request('DELETE', ltrim($key, '/'), '', []);
    }

    public function urlFor(string $key): string
    {
        return rtrim($this->publicUrl, '/') . '/' . $this->encodeKey(ltrim($key, '/'));
    }

    /** If $url points into this bucket's public URL, return the object key; otherwise null. */
    public function keyFromUrl(string $url): ?string
    {
        $base = rtrim($this->publicUrl, '/') . '/';
        if (!str_starts_with($url, $base)) {
            return null;
        }

        return rawurldecode(substr($url, strlen($base)));
    }

    /** @param array<string, string> $extraHeaders lower-case names */
    private function request(string $method, string $key, string $body, array $extraHeaders): void
    {
        $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $amzDate = $now->format('Ymd\THis\Z');
        $dateStamp = $now->format('Ymd');
        $payloadHash = hash('sha256', $body);
        $canonicalUri = '/' . $this->encodeKey($this->bucket) . '/' . $this->encodeKey($key);

        $headers = array_merge($extraHeaders, [
            'host' => $this->endpointHost,
            'x-amz-content-sha256' => $payloadHash,
            'x-amz-date' => $amzDate,
        ]);
        ksort($headers);

        $canonicalHeaders = '';
        foreach ($headers as $name => $value) {
            $canonicalHeaders .= $name . ':' . trim($value) . "\n";
        }
        $signedHeaders = implode(';', array_keys($headers));

        $canonicalRequest = implode("\n", [$method, $canonicalUri, '', $canonicalHeaders, $signedHeaders, $payloadHash]);
        $scope = "{$dateStamp}/" . self::REGION . '/' . self::SERVICE . '/aws4_request';
        $stringToSign = implode("\n", ['AWS4-HMAC-SHA256', $amzDate, $scope, hash('sha256', $canonicalRequest)]);

        $kDate = hash_hmac('sha256', $dateStamp, 'AWS4' . $this->secretAccessKey, true);
        $kRegion = hash_hmac('sha256', self::REGION, $kDate, true);
        $kService = hash_hmac('sha256', self::SERVICE, $kRegion, true);
        $kSigning = hash_hmac('sha256', 'aws4_request', $kService, true);
        $signature = hash_hmac('sha256', $stringToSign, $kSigning);

        $authorization = "AWS4-HMAC-SHA256 Credential={$this->accessKeyId}/{$scope}, SignedHeaders={$signedHeaders}, Signature={$signature}";

        $curlHeaders = ["Authorization: {$authorization}"];
        foreach ($headers as $name => $value) {
            if ($name !== 'host') {
                $curlHeaders[] = "{$name}: {$value}";
            }
        }

        $ch = curl_init("https://{$this->endpointHost}{$canonicalUri}");
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $curlHeaders,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 60,
        ]);
        if ($method === 'PUT') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            throw new RuntimeException("R2 {$method} failed: {$error}");
        }
        // DELETE of a missing object returns 204 too; treat 404 as already gone.
        if ($status >= 300 && !($method === 'DELETE' && $status === 404)) {
            $message = preg_match('#<Message>(.*?)</Message>#s', (string) $response, $m) ? $m[1] : substr((string) $response, 0, 200);
            throw new RuntimeException("R2 {$method} {$key} failed (HTTP {$status}): {$message}");
        }
    }

    private function encodeKey(string $key): string
    {
        return implode('/', array_map('rawurlencode', explode('/', $key)));
    }
}
