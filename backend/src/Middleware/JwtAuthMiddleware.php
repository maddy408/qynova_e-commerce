<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\JwtHelper;
use App\Helpers\Request;
use App\Helpers\Response;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\SignatureInvalidException;
use UnexpectedValueException;

final class JwtAuthMiddleware
{
    /** @return array<string, mixed> */
    public static function authenticate(): array
    {
        $token = Request::bearerToken();

        if ($token === null) {
            Response::error('Unauthorized', 401);
        }

        try {
            return JwtHelper::verify($token);
        } catch (ExpiredException) {
            Response::error('Token expired', 401);
        } catch (SignatureInvalidException | UnexpectedValueException) {
            Response::error('Invalid token', 401);
        }
    }
}
