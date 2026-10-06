<?php

declare(strict_types=1);

namespace App\Helpers;

final class Response
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function error(string $message, int $status = 400, array $extra = []): never
    {
        self::json(['error' => $message, ...$extra], $status);
    }

    /**
     * Streams a generated file to the client and deletes the temp copy
     * afterward — every caller of this writes its file under
     * sys_get_temp_dir() first (see Spreadsheet::writeRows() callers).
     */
    public static function file(string $path, string $downloadName, string $contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'): never
    {
        http_response_code(200);
        header("Content-Type: {$contentType}");
        header('Content-Disposition: attachment; filename="' . $downloadName . '"');
        header('Content-Length: ' . (string) filesize($path));
        readfile($path);
        unlink($path);
        exit;
    }
}
