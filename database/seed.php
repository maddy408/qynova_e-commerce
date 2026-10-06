<?php

declare(strict_types=1);

// Dev-only seed runner. Not idempotent — run once against a freshly
// migrated database. Re-running will fail on duplicate-key constraints,
// which is intentional (no silent double-seeding).

require dirname(__DIR__) . '/backend/vendor/autoload.php';

use Dotenv\Dotenv;

Dotenv::createImmutable(dirname(__DIR__) . '/backend')->safeLoad();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$port = $_ENV['DB_PORT'] ?? '3306';
$name = $_ENV['DB_NAME'] ?? 'unified_pos';
$user = $_ENV['DB_USER'] ?? 'root';
$pass = $_ENV['DB_PASS'] ?? '';

$pdo = new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$files = glob(__DIR__ . '/seed/*.sql');
sort($files);

foreach ($files as $file) {
    $sql = file_get_contents($file);

    foreach (splitStatements($sql) as $statement) {
        $statement = trim($statement);
        if ($statement === '') {
            continue;
        }
        $pdo->exec($statement);
    }

    echo 'seeded ' . basename($file) . "\n";
}

echo "done\n";

/** @return list<string> */
function splitStatements(string $sql): array
{
    $statements = [];
    $buffer = '';

    foreach (preg_split('/\r?\n/', $sql) as $line) {
        $buffer .= $line . "\n";

        if (str_ends_with(rtrim($line), ';')) {
            $statements[] = rtrim(rtrim($buffer), ';');
            $buffer = '';
        }
    }

    if (trim($buffer) !== '') {
        $statements[] = $buffer;
    }

    return $statements;
}
