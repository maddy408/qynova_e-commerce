<?php

declare(strict_types=1);

namespace App\Helpers;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

final class JwtHelper
{
    /** @param array<string, mixed> $claims */
    public static function issue(array $claims, int $ttlSeconds): string
    {
        $now = time();
        $payload = $claims + ['iat' => $now, 'exp' => $now + $ttlSeconds];

        return JWT::encode($payload, (string) Config::get('jwt.secret'), 'HS256');
    }

    /** @return array<string, mixed> */
    public static function verify(string $token): array
    {
        $decoded = JWT::decode($token, new Key((string) Config::get('jwt.secret'), 'HS256'));

        return (array) $decoded;
    }
}
