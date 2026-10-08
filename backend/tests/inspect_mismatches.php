<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/database.php';

$pdo = db();

$pIds = $pdo->query("SELECT id FROM purchases WHERE supplier_id = 15")->fetchAll(PDO::FETCH_COLUMN);
if ($pIds !== []) {
    $pIdsStr = implode(',', $pIds);
    $pdo->exec("DELETE ppl FROM purchase_payment_lines ppl JOIN purchase_payments pp ON pp.id = ppl.payment_id WHERE pp.purchase_id IN ({$pIdsStr})");
    $pdo->exec("DELETE FROM supplier_ledger WHERE reference_type = 'PURCHASE_PAYMENT' AND reference_id IN (SELECT id FROM purchase_payments WHERE purchase_id IN ({$pIdsStr}))");
    $pdo->exec("DELETE FROM purchase_payments WHERE purchase_id IN ({$pIdsStr})");
    $pdo->exec("DELETE pri FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.purchase_return_id WHERE pr.purchase_id IN ({$pIdsStr})");
    $pdo->exec("DELETE FROM supplier_ledger WHERE reference_type = 'PURCHASE_RETURN' AND reference_id IN (SELECT id FROM purchase_returns WHERE purchase_id IN ({$pIdsStr}))");
    $pdo->exec("DELETE FROM purchase_returns WHERE purchase_id IN ({$pIdsStr})");
    $pdo->exec("DELETE FROM purchase_items WHERE purchase_id IN ({$pIdsStr})");
    $pdo->exec("DELETE FROM supplier_ledger WHERE reference_type = 'PURCHASE' AND reference_id IN ({$pIdsStr})");
    $pdo->exec("DELETE FROM purchases WHERE id IN ({$pIdsStr})");
}
$pdo->exec("DELETE FROM supplier_ledger WHERE supplier_id = 15");
$pdo->exec("DELETE FROM suppliers WHERE id = 15");

echo "Cleaned supplier 15\n";
