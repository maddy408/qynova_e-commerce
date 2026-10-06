<?php

declare(strict_types=1);

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

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
);

$applied = $pdo->query('SELECT filename FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);

$dir = __DIR__ . '/migrations';
$files = glob($dir . '/*.sql');
sort($files);

foreach ($files as $file) {
    $filename = basename($file);

    if (in_array($filename, $applied, true)) {
        echo "skip   {$filename}\n";
        continue;
    }

    $sql = file_get_contents($file);

    foreach (splitStatements($sql) as $statement) {
        $statement = trim($statement);
        if ($statement === '') {
            continue;
        }
        $pdo->exec($statement);
    }

    $pdo->prepare('INSERT INTO schema_migrations (filename) VALUES (?)')->execute([$filename]);
    echo "apply  {$filename}\n";
}

echo "done\n";

/**
 * Splits a .sql file into individual statements, honouring DELIMITER
 * changes (needed for CREATE TRIGGER bodies that use ; internally).
 *
 * @return list<string>
 */
function splitStatements(string $sql): array
{
    $statements = [];
    $delimiter = ';';
    $buffer = '';

    foreach (preg_split('/\r?\n/', $sql) as $line) {
        $trimmed = trim($line);

        if (preg_match('/^DELIMITER\s+(\S+)$/i', $trimmed, $m)) {
            $delimiter = $m[1];
            continue;
        }

        $buffer .= $line . "\n";

        if (str_ends_with(rtrim($line), $delimiter)) {
            $stmt = rtrim(rtrim($buffer), $delimiter);
            $statements[] = $stmt;
            $buffer = '';
        }
    }

    if (trim($buffer) !== '') {
        $statements[] = $buffer;
    }

    return $statements;
}
