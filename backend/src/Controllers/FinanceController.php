<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use PDO;
use Exception;

final class FinanceController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.read');

        $type = $_GET['type'] ?? null;
        $category = $_GET['category'] ?? null;

        $query = "SELECT ft.*, u.name as created_by_name FROM finance_transactions ft LEFT JOIN users u ON u.id = ft.created_by WHERE 1=1";
        $params = [];

        if ($type && in_array(strtoupper($type), ['INCOME', 'EXPENSE'], true)) {
            $query .= " AND ft.type = :type";
            $params['type'] = strtoupper($type);
        }

        if ($category && trim($category) !== '') {
            $query .= " AND ft.category = :category";
            $params['category'] = trim($category);
        }

        $query .= " ORDER BY ft.transaction_date DESC, ft.created_at DESC";

        $stmt = $this->pdo->prepare($query);
        $stmt->execute($params);
        $transactions = $stmt->fetchAll();

        // Calculate summaries
        $incomeStmt = $this->pdo->query("SELECT COALESCE(SUM(amount), 0) FROM finance_transactions WHERE type = 'INCOME'");
        $totalIncome = (float) $incomeStmt->fetchColumn();

        $expenseStmt = $this->pdo->query("SELECT COALESCE(SUM(amount), 0) FROM finance_transactions WHERE type = 'EXPENSE'");
        $totalExpense = (float) $expenseStmt->fetchColumn();

        $netProfit = $totalIncome - $totalExpense;

        Response::json([
            'transactions' => $transactions,
            'summary' => [
                'total_income' => $totalIncome,
                'total_expense' => $totalExpense,
                'net_profit' => $netProfit,
            ],
        ]);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.read');

        $body = Request::json();
        $type = strtoupper(trim((string) ($body['type'] ?? 'EXPENSE')));
        $category = trim((string) ($body['category'] ?? 'General'));
        $amount = (float) ($body['amount'] ?? 0);
        $paymentMethod = trim((string) ($body['payment_method'] ?? 'CASH'));
        $referenceNo = trim((string) ($body['reference_no'] ?? ''));
        $transactionDate = trim((string) ($body['transaction_date'] ?? date('Y-m-d')));
        $notes = trim((string) ($body['notes'] ?? ''));

        if (!in_array($type, ['INCOME', 'EXPENSE'], true)) {
            Response::error('Invalid transaction type', 422);
        }

        if ($amount <= 0) {
            Response::error('Amount must be greater than 0', 422);
        }

        $prefix = $type === 'INCOME' ? 'INC' : 'EXP';
        $transactionNo = $prefix . '-' . date('YmdHis') . '-' . random_int(100, 999);

        $stmt = $this->pdo->prepare(
            "INSERT INTO finance_transactions (transaction_no, type, category, amount, payment_method, reference_no, transaction_date, notes, created_by)
             VALUES (:no, :type, :category, :amount, :method, :ref, :date, :notes, :created_by)"
        );

        $stmt->execute([
            'no' => $transactionNo,
            'type' => $type,
            'category' => $category,
            'amount' => $amount,
            'method' => $paymentMethod,
            'ref' => $referenceNo ?: null,
            'date' => $transactionDate,
            'notes' => $notes ?: null,
            'created_by' => $claims->sub,
        ]);

        Response::json(['id' => (int) $this->pdo->lastInsertId(), 'transaction_no' => $transactionNo], 201);
    }

    public function destroy(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.read');

        $stmt = $this->pdo->prepare("DELETE FROM finance_transactions WHERE id = :id");
        $stmt->execute(['id' => (int) $id]);

        Response::json(['message' => 'Transaction deleted']);
    }
}
