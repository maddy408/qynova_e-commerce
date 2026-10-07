<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/database.php';

$pdo = db();
$sql = file_get_contents(__DIR__ . '/../../database/migrations/0019_purchase_payment_update.sql');

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

$stmts = splitStatements($sql);

echo "Running Migration 0019 (1st re-run)...\n";
foreach ($stmts as $stmt) {
    $stmt = trim($stmt);
    if ($stmt !== '') {
        $pdo->exec($stmt);
    }
}
echo "1st re-run PASSED!\n";

echo "Running Migration 0019 (2nd re-run)...\n";
foreach ($stmts as $stmt) {
    $stmt = trim($stmt);
    if ($stmt !== '') {
        $pdo->exec($stmt);
    }
}
echo "2nd re-run PASSED!\n";
