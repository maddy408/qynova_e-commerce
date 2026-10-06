<?php

declare(strict_types=1);

namespace App\Helpers;

final class Config
{
    /** @var array<string, mixed>|null */
    private static ?array $data = null;

    /** @return array<string, mixed> */
    public static function all(): array
    {
        if (self::$data === null) {
            self::$data = require dirname(__DIR__, 2) . '/config/config.php';
        }

        return self::$data;
    }

    public static function get(string $dotKey, mixed $default = null): mixed
    {
        $value = self::all();

        foreach (explode('.', $dotKey) as $segment) {
            if (!is_array($value) || !array_key_exists($segment, $value)) {
                return $default;
            }
            $value = $value[$segment];
        }

        return $value;
    }
}
