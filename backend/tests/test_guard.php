<?php

declare(strict_types=1);

namespace App\Tests;

use PDO;

final class TestDbGuard
{
    public const REQUIRED_TEST_DB = 'unified_pos_test';

    /**
     * Asserts that the active database is unified_pos_test.
     * Hard-exits if connected to any other database (e.g. unified_pos).
     */
    public static function assertTestDatabase(PDO $pdo, string $callerFile = ''): void
    {
        $activeDb = (string) $pdo->query('SELECT DATABASE()')->fetchColumn();
        if ($activeDb !== self::REQUIRED_TEST_DB) {
            $caller = $callerFile !== '' ? basename($callerFile) : 'Unknown Script';
            $msg = "\n================================================================================\n"
                 . " FATAL SAFETY GUARD: REFUSING TO RUN ON NON-TEST DATABASE!\n"
                 . " Caller Script: {$caller}\n"
                 . " Active DB:     '{$activeDb}'\n"
                 . " Required DB:   '" . self::REQUIRED_TEST_DB . "'\n"
                 . " All automated tests and benchmark suites MUST run exclusively against\n"
                 . " '" . self::REQUIRED_TEST_DB . "' to ensure zero mutation of development data.\n"
                 . "================================================================================\n\n";
            fwrite(STDERR, $msg);
            exit(1);
        }
    }
}
