<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

final class PaymentService
{
    // Payment line methods (CREDIT is intentionally excluded because credit/due is not a payment)
    private const ALLOWED_METHODS = ['CASH', 'UPI', 'CARD', 'NETBANKING'];
    private const REFERENCE_REQUIRED_METHODS = ['UPI', 'CARD', 'NETBANKING'];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Shared single source of truth for payment status derivation.
     */
    public static function derivePaymentStatus(string $paidAmount, string $grandTotal): string
    {
        $paid = bcadd($paidAmount, '0', 2);
        $total = bcadd($grandTotal, '0', 2);

        if (bccomp($total, '0', 2) === 0) {
            return 'PAID';
        }
        if (bccomp($paid, '0', 2) <= 0) {
            return 'UNPAID';
        }
        if (bccomp($paid, $total, 2) >= 0) {
            return 'PAID';
        }
        return 'PARTIALLY_PAID';
    }

    /**
     * Collects a new payment against an active purchase.
     * Supports single or split payment lines.
     *
     * @param array{
     *     amount: string|numeric,
     *     payment_date?: string,
     *     notes?: string|null,
     *     idempotency_key?: string|null,
     *     lines: list<array{method: string, amount: string|numeric, reference_no?: string|null}>
     * } $data
     * @return array{purchase: array<string, mixed>, payment: array<string, mixed>}
     */
    public function collectPayment(int $purchaseId, array $data, int $userId, ?string $clientIp = null): array
    {
        $idempotencyKey = isset($data['idempotency_key']) && trim((string) $data['idempotency_key']) !== ''
            ? trim((string) $data['idempotency_key'])
            : null;

        // Idempotency check before lock
        if ($idempotencyKey !== null) {
            $stmt = $this->pdo->prepare('SELECT id FROM purchase_payments WHERE idempotency_key = :key');
            $stmt->execute(['key' => $idempotencyKey]);
            $existingPaymentId = $stmt->fetchColumn();
            if ($existingPaymentId !== false) {
                $payment = $this->findPayment((int) $existingPaymentId);
                $purchase = $this->findPurchase($purchaseId);
                if ($payment !== null && $purchase !== null) {
                    return ['purchase' => $purchase, 'payment' => $payment];
                }
            }
        }

        $rawAmount = $data['amount'] ?? null;
        if ($rawAmount === null || !is_numeric($rawAmount)) {
            throw new RuntimeException('Payment amount is required and must be numeric');
        }

        $amount = bcadd((string) $rawAmount, '0', 2);
        if (bccomp($amount, '0', 2) <= 0) {
            throw new RuntimeException('Payment amount must be greater than 0');
        }

        $paymentDate = !empty($data['payment_date']) ? trim((string) $data['payment_date']) : date('Y-m-d');
        $notes = isset($data['notes']) && trim((string) $data['notes']) !== '' ? trim((string) $data['notes']) : null;
        $lines = (array) ($data['lines'] ?? []);

        if ($lines === []) {
            throw new RuntimeException('At least one payment line is required');
        }

        // Validate payment lines
        $parsedLines = [];
        $linesSum = '0.00';
        $usedMethods = [];

        foreach ($lines as $line) {
            $method = strtoupper(trim((string) ($line['method'] ?? '')));
            if ($method === 'CREDIT') {
                throw new RuntimeException('Credit/Due cannot be used as a payment line method');
            }
            if (!in_array($method, self::ALLOWED_METHODS, true)) {
                throw new RuntimeException("Invalid payment method: {$method}");
            }

            if (isset($usedMethods[$method])) {
                throw new RuntimeException("Duplicate payment method {$method} in one payment is not allowed");
            }
            $usedMethods[$method] = true;

            $lineAmountRaw = $line['amount'] ?? null;
            if ($lineAmountRaw === null || !is_numeric($lineAmountRaw)) {
                throw new RuntimeException("Line amount for {$method} must be numeric");
            }

            $lineAmount = bcadd((string) $lineAmountRaw, '0', 2);
            if (bccomp($lineAmount, '0', 2) <= 0) {
                throw new RuntimeException("Line amount for {$method} must be greater than 0");
            }

            $referenceNo = isset($line['reference_no']) ? trim((string) $line['reference_no']) : '';
            if (in_array($method, self::REFERENCE_REQUIRED_METHODS, true) && $referenceNo === '') {
                throw new RuntimeException("Reference number is required for {$method}");
            }

            $parsedLines[] = [
                'method' => $method,
                'amount' => $lineAmount,
                'reference_no' => $referenceNo !== '' ? $referenceNo : null,
            ];

            $linesSum = bcadd($linesSum, $lineAmount, 2);
        }

        if (bccomp($linesSum, $amount, 2) !== 0) {
            throw new RuntimeException("Sum of payment lines (₹{$linesSum}) must equal total payment amount (₹{$amount})");
        }

        $this->pdo->beginTransaction();

        try {
            $stmt = $this->pdo->prepare('SELECT * FROM purchases WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $purchaseId]);
            $purchase = $stmt->fetch();

            if ($purchase === false || !empty($purchase['deleted_at'])) {
                throw new RuntimeException('Purchase not found');
            }

            if ($purchase['status'] === 'CANCELLED') {
                throw new RuntimeException('Cannot add payment to a cancelled purchase');
            }

            $currentBalance = bcadd((string) $purchase['balance_amount'], '0', 2);
            if (bccomp($amount, $currentBalance, 2) > 0) {
                throw new RuntimeException('Payment exceeds balance');
            }

            $receiptNo = $this->generateReceiptNumber();

            $insertStmt = $this->pdo->prepare(
                'INSERT INTO purchase_payments (
                    purchase_id, supplier_id, receipt_no, payment_date, total_amount, notes, status, idempotency_key, created_by
                ) VALUES (
                    :purchase_id, :supplier_id, :receipt_no, :payment_date, :total_amount, :notes, \'ACTIVE\', :idempotency_key, :created_by
                )'
            );
            $insertStmt->execute([
                'purchase_id' => $purchaseId,
                'supplier_id' => $purchase['supplier_id'],
                'receipt_no' => $receiptNo,
                'payment_date' => $paymentDate,
                'total_amount' => $amount,
                'notes' => $notes,
                'idempotency_key' => $idempotencyKey,
                'created_by' => $userId,
            ]);

            $paymentId = (int) $this->pdo->lastInsertId();

            $lineStmt = $this->pdo->prepare(
                'INSERT INTO purchase_payment_lines (payment_id, payment_method, amount, reference_no)
                 VALUES (:payment_id, :method, :amount, :reference_no)'
            );
            foreach ($parsedLines as $line) {
                $lineStmt->execute([
                    'payment_id' => $paymentId,
                    'method' => $line['method'],
                    'amount' => $line['amount'],
                    'reference_no' => $line['reference_no'],
                ]);
            }

            // Recalculate purchase from active payments
            $totals = $this->calculatePurchasePaymentTotals($purchaseId, (string) $purchase['grand_total']);

            $this->pdo->prepare(
                'UPDATE purchases SET
                    paid_amount = :paid,
                    amount_paid = :amount_paid,
                    balance_amount = :balance,
                    payment_status = :status,
                    payment_method = :method,
                    updated_by = :updated_by,
                    updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'paid' => $totals['paid_amount'],
                'amount_paid' => $totals['paid_amount'],
                'balance' => $totals['balance_amount'],
                'status' => $totals['payment_status'],
                'method' => $totals['payment_method'],
                'updated_by' => $userId,
                'id' => $purchaseId,
            ]);

            // Insert ONE supplier_ledger row
            $this->pdo->prepare(
                "INSERT INTO supplier_ledger (
                    supplier_id, transaction_type, reference_type, reference_id, amount, paid_amount_delta, notes, created_by
                ) VALUES (
                    :supplier_id, 'PAYMENT', 'PURCHASE_PAYMENT', :reference_id, :amount, :paid_delta, :notes, :created_by
                )"
            )->execute([
                'supplier_id' => $purchase['supplier_id'],
                'reference_id' => $paymentId,
                'amount' => $amount,
                'paid_delta' => $amount,
                'notes' => "Payment {$receiptNo} for purchase {$purchase['purchase_no']}",
                'created_by' => $userId,
            ]);

            // Audit log
            $this->pdo->prepare(
                "INSERT INTO audit_logs (
                    actor_type, actor_id, action, entity_type, entity_id, old_value, new_value, reason, ip_address
                ) VALUES (
                    'USER', :actor_id, 'PURCHASE_PAYMENT_COLLECT', 'purchase', :entity_id, :old_val, :new_val, :reason, :ip
                )"
            )->execute([
                'actor_id' => $userId,
                'entity_id' => $purchaseId,
                'old_val' => json_encode([
                    'paid_amount' => $purchase['paid_amount'],
                    'balance_amount' => $purchase['balance_amount'],
                    'payment_status' => $purchase['payment_status'],
                    'payment_method' => $purchase['payment_method'],
                ]),
                'new_val' => json_encode([
                    'paid_amount' => $totals['paid_amount'],
                    'balance_amount' => $totals['balance_amount'],
                    'payment_status' => $totals['payment_status'],
                    'payment_method' => $totals['payment_method'],
                    'payment_id' => $paymentId,
                    'receipt_no' => $receiptNo,
                    'amount' => $amount,
                    'lines' => $parsedLines,
                ]),
                'reason' => "Collected payment {$receiptNo} of ₹{$amount}",
                'ip' => $clientIp,
            ]);

            $this->pdo->commit();

            $updatedPurchase = $this->findPurchase($purchaseId) ?? throw new RuntimeException('Purchase not found');
            $payment = $this->findPayment($paymentId) ?? throw new RuntimeException('Payment not found');

            return ['purchase' => $updatedPurchase, 'payment' => $payment];
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Reverses an existing payment.
     *
     * @return array{purchase: array<string, mixed>, reversed_payment_id: int}
     */
    public function reversePayment(int $purchaseId, int $paymentId, string $reason, int $userId, ?string $clientIp = null): array
    {
        $cleanReason = trim($reason);
        if ($cleanReason === '') {
            throw new RuntimeException('A reversal reason is required');
        }

        $this->pdo->beginTransaction();

        try {
            $stmt = $this->pdo->prepare('SELECT * FROM purchases WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $purchaseId]);
            $purchase = $stmt->fetch();

            if ($purchase === false || !empty($purchase['deleted_at'])) {
                throw new RuntimeException('Purchase not found');
            }

            $payStmt = $this->pdo->prepare('SELECT * FROM purchase_payments WHERE id = :id AND purchase_id = :purchase_id FOR UPDATE');
            $payStmt->execute(['id' => $paymentId, 'purchase_id' => $purchaseId]);
            $payment = $payStmt->fetch();

            if ($payment === false) {
                throw new RuntimeException('Payment not found for this purchase');
            }

            if ($payment['status'] === 'REVERSED') {
                throw new RuntimeException('Payment is already reversed');
            }

            $revAmount = (string) $payment['total_amount'];

            // Mark payment REVERSED
            $this->pdo->prepare(
                "UPDATE purchase_payments SET
                    status = 'REVERSED',
                    reversed_by = :reversed_by,
                    reversed_at = NOW(),
                    reverse_reason = :reason
                 WHERE id = :id"
            )->execute([
                'reversed_by' => $userId,
                'reason' => $cleanReason,
                'id' => $paymentId,
            ]);

            // Recalculate purchase from remaining active payments
            $totals = $this->calculatePurchasePaymentTotals($purchaseId, (string) $purchase['grand_total']);

            $this->pdo->prepare(
                'UPDATE purchases SET
                    paid_amount = :paid,
                    amount_paid = :amount_paid,
                    balance_amount = :balance,
                    payment_status = :status,
                    payment_method = :method,
                    updated_by = :updated_by,
                    updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'paid' => $totals['paid_amount'],
                'amount_paid' => $totals['paid_amount'],
                'balance' => $totals['balance_amount'],
                'status' => $totals['payment_status'],
                'method' => $totals['payment_method'],
                'updated_by' => $userId,
                'id' => $purchaseId,
            ]);

            // Insert negative delta in supplier_ledger
            $this->pdo->prepare(
                "INSERT INTO supplier_ledger (
                    supplier_id, transaction_type, reference_type, reference_id, amount, paid_amount_delta, notes, created_by
                ) VALUES (
                    :supplier_id, 'PAYMENT_REVERSAL', 'PURCHASE_PAYMENT', :reference_id, :amount, :paid_delta, :notes, :created_by
                )"
            )->execute([
                'supplier_id' => $purchase['supplier_id'],
                'reference_id' => $paymentId,
                'amount' => '-' . $revAmount,
                'paid_delta' => '-' . $revAmount,
                'notes' => "Payment reversal: {$payment['receipt_no']} - {$cleanReason}",
                'created_by' => $userId,
            ]);

            // Audit log
            $this->pdo->prepare(
                "INSERT INTO audit_logs (
                    actor_type, actor_id, action, entity_type, entity_id, old_value, new_value, reason, ip_address
                ) VALUES (
                    'USER', :actor_id, 'PURCHASE_PAYMENT_REVERSE', 'purchase', :entity_id, :old_val, :new_val, :reason, :ip
                )"
            )->execute([
                'actor_id' => $userId,
                'entity_id' => $purchaseId,
                'old_val' => json_encode([
                    'paid_amount' => $purchase['paid_amount'],
                    'balance_amount' => $purchase['balance_amount'],
                    'payment_status' => $purchase['payment_status'],
                    'payment_method' => $purchase['payment_method'],
                ]),
                'new_val' => json_encode([
                    'paid_amount' => $totals['paid_amount'],
                    'balance_amount' => $totals['balance_amount'],
                    'payment_status' => $totals['payment_status'],
                    'payment_method' => $totals['payment_method'],
                    'reversed_payment_id' => $paymentId,
                ]),
                'reason' => "Reversed payment {$payment['receipt_no']} (₹{$revAmount}): {$cleanReason}",
                'ip' => $clientIp,
            ]);

            $this->pdo->commit();

            $updatedPurchase = $this->findPurchase($purchaseId) ?? throw new RuntimeException('Purchase not found');

            return ['purchase' => $updatedPurchase, 'reversed_payment_id' => $paymentId];
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Lists all payments and their lines for a purchase.
     *
     * @return list<array<string, mixed>>
     */
    public function listPayments(int $purchaseId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT pp.*, u.name AS created_by_name, ru.name AS reversed_by_name
             FROM purchase_payments pp
             LEFT JOIN users u ON u.id = pp.created_by
             LEFT JOIN users ru ON ru.id = pp.reversed_by
             WHERE pp.purchase_id = :id
             ORDER BY pp.created_at DESC'
        );
        $stmt->execute(['id' => $purchaseId]);
        $payments = $stmt->fetchAll();

        foreach ($payments as &$payment) {
            $lineStmt = $this->pdo->prepare('SELECT * FROM purchase_payment_lines WHERE payment_id = :payment_id ORDER BY id ASC');
            $lineStmt->execute(['payment_id' => $payment['id']]);
            $payment['lines'] = $lineStmt->fetchAll();
        }
        unset($payment);

        return $payments;
    }

    /**
     * Finds a single payment with its lines.
     *
     * @return array<string, mixed>|null
     */
    public function findPayment(int $paymentId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT pp.*, u.name AS created_by_name, ru.name AS reversed_by_name
             FROM purchase_payments pp
             LEFT JOIN users u ON u.id = pp.created_by
             LEFT JOIN users ru ON ru.id = pp.reversed_by
             WHERE pp.id = :id'
        );
        $stmt->execute(['id' => $paymentId]);
        $payment = $stmt->fetch();

        if ($payment === false) {
            return null;
        }

        $lineStmt = $this->pdo->prepare('SELECT * FROM purchase_payment_lines WHERE payment_id = :payment_id ORDER BY id ASC');
        $lineStmt->execute(['payment_id' => $paymentId]);
        $payment['lines'] = $lineStmt->fetchAll();

        return $payment;
    }

    /**
     * Calculates paid_amount, balance_amount, payment_status, and payment_method
     * from all ACTIVE purchase_payments for a purchase.
     *
     * @return array{paid_amount: string, balance_amount: string, payment_status: string, payment_method: string|null}
     */
    public function calculatePurchasePaymentTotals(int $purchaseId, string $grandTotal): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT IFNULL(SUM(total_amount), 0.00) AS total_paid
             FROM purchase_payments
             WHERE purchase_id = :id AND status = 'ACTIVE'"
        );
        $stmt->execute(['id' => $purchaseId]);
        $paidAmount = bcadd((string) ($stmt->fetchColumn() ?: '0.00'), '0', 2);

        $balanceAmount = bcsub($grandTotal, $paidAmount, 2);
        if (bccomp($balanceAmount, '0', 2) < 0) {
            $balanceAmount = '0.00';
        }

        $paymentStatus = self::derivePaymentStatus($paidAmount, $grandTotal);

        // Determine combined payment method
        $methodStmt = $this->pdo->prepare(
            "SELECT DISTINCT ppl.payment_method
             FROM purchase_payment_lines ppl
             JOIN purchase_payments pp ON pp.id = ppl.payment_id
             WHERE pp.purchase_id = :id AND pp.status = 'ACTIVE'"
        );
        $methodStmt->execute(['id' => $purchaseId]);
        $methods = $methodStmt->fetchAll(PDO::FETCH_COLUMN);

        $paymentMethod = null;
        if (count($methods) === 1) {
            $paymentMethod = $methods[0];
        } elseif (count($methods) > 1) {
            $paymentMethod = 'SPLIT';
        }

        return [
            'paid_amount' => $paidAmount,
            'balance_amount' => $balanceAmount,
            'payment_status' => $paymentStatus,
            'payment_method' => $paymentMethod,
        ];
    }

    /**
     * Refactored Edit Payment method maintaining the single source of truth for payment totals.
     * Synchronizes purchase_payments with the new paid_amount and optional split lines.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function updatePayment(int $purchaseId, array $data, int $userId, ?string $clientIp = null): array
    {
        $status = isset($data['payment_status']) ? trim((string) $data['payment_status']) : '';
        if (!in_array($status, ['UNPAID', 'PARTIALLY_PAID', 'PAID'], true)) {
            throw new RuntimeException('Invalid payment status');
        }

        $rawMethod = isset($data['payment_method']) ? trim((string) $data['payment_method']) : null;
        $rawPaid = $data['paid_amount'] ?? null;
        $rawLines = (array) ($data['lines'] ?? []);

        $this->pdo->beginTransaction();

        try {
            $stmt = $this->pdo->prepare('SELECT * FROM purchases WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $purchaseId]);
            $purchase = $stmt->fetch();

            if ($purchase === false || !empty($purchase['deleted_at'])) {
                throw new RuntimeException('Purchase not found');
            }

            if ($purchase['status'] === 'CANCELLED') {
                throw new RuntimeException('Purchase cancelled');
            }

            $grandTotal = (string) $purchase['grand_total'];

            if ($status === 'UNPAID') {
                $newPaid = '0.00';
                $newMethod = ($rawMethod !== null && $rawMethod !== '' && $rawMethod !== 'SPLIT') ? $rawMethod : null;
                $parsedLines = [];
            } elseif ($status === 'PARTIALLY_PAID') {
                if ($rawPaid === null || !is_numeric($rawPaid)) {
                    throw new RuntimeException('Paid amount must be greater than 0 and less than total');
                }

                $parsedPaid = bcadd((string) $rawPaid, '0', 2);

                if (bccomp($parsedPaid, $grandTotal, 2) > 0) {
                    throw new RuntimeException('Payment exceeds balance');
                }

                if (bccomp($parsedPaid, '0', 2) <= 0 || bccomp($parsedPaid, $grandTotal, 2) >= 0) {
                    throw new RuntimeException('Paid amount must be greater than 0 and less than total');
                }

                $newPaid = $parsedPaid;
                $parsedLines = $this->validateAndParseLines($rawLines, $newPaid, $rawMethod);
                $newMethod = $this->resolveCombinedMethod($parsedLines, $rawMethod);
            } else { // PAID
                $newPaid = $grandTotal;
                $parsedLines = $this->validateAndParseLines($rawLines, $newPaid, $rawMethod);
                $newMethod = $this->resolveCombinedMethod($parsedLines, $rawMethod);
            }

            $newBalance = bcsub($grandTotal, $newPaid, 2);

            $oldStatus = (string) $purchase['payment_status'];
            $oldMethod = $purchase['payment_method'] !== null ? (string) $purchase['payment_method'] : null;
            $oldPaid = bcadd((string) ($purchase['paid_amount'] ?? $purchase['amount_paid'] ?? '0.00'), '0', 2);
            $oldBalance = bcsub($grandTotal, $oldPaid, 2);

            // If nothing changed and no explicit new lines provided, return existing
            if ($oldStatus === $status && $oldMethod === $newMethod && bccomp($oldPaid, $newPaid, 2) === 0 && $rawLines === []) {
                $this->pdo->commit();
                return $this->findPurchase($purchaseId) ?? throw new RuntimeException('Purchase not found');
            }

            $paidDelta = bcsub($newPaid, $oldPaid, 2);

            // Synchronize purchase_payments table to preserve SUM(active payments) == purchases.paid_amount
            if (bccomp($newPaid, '0', 2) === 0) {
                // Mark all active payments as REVERSED
                $this->pdo->prepare(
                    "UPDATE purchase_payments SET
                        status = 'REVERSED',
                        reversed_by = :userId,
                        reversed_at = NOW(),
                        reverse_reason = 'Payment edited to UNPAID'
                     WHERE purchase_id = :purchase_id AND status = 'ACTIVE'"
                )->execute(['userId' => $userId, 'purchase_id' => $purchaseId]);
            } else {
                // Active payments exist or need to be replaced with new lines
                $this->pdo->prepare(
                    "UPDATE purchase_payments SET
                        status = 'REVERSED',
                        reversed_by = :userId,
                        reversed_at = NOW(),
                        reverse_reason = 'Payment revised via edit'
                     WHERE purchase_id = :purchase_id AND status = 'ACTIVE'"
                )->execute(['userId' => $userId, 'purchase_id' => $purchaseId]);

                $receiptNo = $this->generateReceiptNumber();
                $this->pdo->prepare(
                    "INSERT INTO purchase_payments (
                        purchase_id, supplier_id, receipt_no, payment_date, total_amount, notes, status, created_by
                    ) VALUES (
                        :purchase_id, :supplier_id, :receipt_no, CURRENT_DATE, :amount, 'Payment adjustment revised', 'ACTIVE', :created_by
                    )"
                )->execute([
                    'purchase_id' => $purchaseId,
                    'supplier_id' => $purchase['supplier_id'],
                    'receipt_no' => $receiptNo,
                    'amount' => $newPaid,
                    'created_by' => $userId,
                ]);
                $payId = (int) $this->pdo->lastInsertId();

                $lineStmt = $this->pdo->prepare(
                    'INSERT INTO purchase_payment_lines (payment_id, payment_method, amount, reference_no)
                     VALUES (:payment_id, :method, :amount, :reference_no)'
                );

                foreach ($parsedLines as $pLine) {
                    $lineStmt->execute([
                        'payment_id' => $payId,
                        'method' => $pLine['method'],
                        'amount' => $pLine['amount'],
                        'reference_no' => $pLine['reference_no'],
                    ]);
                }
            }

            // Update purchases table
            $this->pdo->prepare(
                'UPDATE purchases SET
                    payment_method = :method,
                    payment_status = :status,
                    paid_amount = :paid_amount,
                    amount_paid = :amount_paid,
                    balance_amount = :balance,
                    updated_by = :updated_by,
                    updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'method' => $newMethod,
                'status' => $status,
                'paid_amount' => $newPaid,
                'amount_paid' => $newPaid,
                'balance' => $newBalance,
                'updated_by' => $userId,
                'id' => $purchaseId,
            ]);

            if (bccomp($paidDelta, '0', 2) !== 0) {
                $this->pdo->prepare(
                    "INSERT INTO supplier_ledger (
                        supplier_id, transaction_type, reference_type, reference_id, amount, paid_amount_delta, notes, created_by
                    ) VALUES (
                        :supplier_id, 'PAYMENT_ADJUSTMENT', 'PURCHASE', :reference_id, :amount, :paid_delta, :notes, :created_by
                    )"
                )->execute([
                    'supplier_id' => $purchase['supplier_id'],
                    'reference_id' => $purchaseId,
                    'amount' => $paidDelta,
                    'paid_delta' => $paidDelta,
                    'notes' => "Purchase {$purchase['purchase_no']} payment update: {$oldStatus} -> {$status}",
                    'created_by' => $userId,
                ]);
            }

            $this->pdo->prepare(
                "INSERT INTO audit_logs (
                    actor_type, actor_id, action, entity_type, entity_id, old_value, new_value, reason, ip_address
                ) VALUES (
                    'USER', :actor_id, 'PURCHASE_PAYMENT_UPDATE', 'purchase', :entity_id, :old_val, :new_val, :reason, :ip
                )"
            )->execute([
                'actor_id' => $userId,
                'entity_id' => $purchaseId,
                'old_val' => json_encode([
                    'payment_method' => $oldMethod,
                    'payment_status' => $oldStatus,
                    'paid_amount' => $oldPaid,
                    'balance_amount' => $oldBalance,
                ]),
                'new_val' => json_encode([
                    'payment_method' => $newMethod,
                    'payment_status' => $status,
                    'paid_amount' => $newPaid,
                    'balance_amount' => $newBalance,
                    'lines' => $parsedLines,
                ]),
                'reason' => "Payment update from {$oldStatus} ({$oldPaid}) to {$status} ({$newPaid})",
                'ip' => $clientIp,
            ]);

            $this->pdo->commit();

            return $this->findPurchase($purchaseId) ?? throw new RuntimeException('Purchase not found');
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Calculates supplier outstanding balance using both ledger and entity formulas.
     *
     * @return array{
     *     supplier_id: int,
     *     ledger_outstanding: string,
     *     entity_outstanding: string,
     *     is_reconciled: bool
     * }
     */
    public function getSupplierOutstanding(int $supplierId): array
    {
        // 1. Ledger-based formula:
        $ledgerStmt = $this->pdo->prepare(
            "SELECT
                IFNULL(SUM(CASE WHEN transaction_type = 'PURCHASE' THEN amount ELSE 0 END), 0.00) AS purchase_total,
                IFNULL(SUM(CASE WHEN transaction_type = 'PURCHASE_CANCEL' THEN amount ELSE 0 END), 0.00) AS cancel_total,
                IFNULL(SUM(CASE WHEN transaction_type = 'PURCHASE_RETURN' THEN amount ELSE 0 END), 0.00) AS return_total,
                IFNULL(SUM(paid_amount_delta), 0.00) AS paid_total
             FROM supplier_ledger
             WHERE supplier_id = :id"
        );
        $ledgerStmt->execute(['id' => $supplierId]);
        $ledgerRow = $ledgerStmt->fetch();

        $purchaseTotal = (string) ($ledgerRow['purchase_total'] ?? '0.00');
        $cancelTotal = (string) ($ledgerRow['cancel_total'] ?? '0.00');
        $returnTotal = (string) ($ledgerRow['return_total'] ?? '0.00');
        $paidTotal = (string) ($ledgerRow['paid_total'] ?? '0.00');

        $grossPayable = bcadd($purchaseTotal, $cancelTotal, 2);
        $netPayable = bcsub($grossPayable, $returnTotal, 2);
        $ledgerOutstanding = bcsub($netPayable, $paidTotal, 2);

        // 2. Entity-based formula:
        $entityStmt = $this->pdo->prepare(
            "SELECT
                IFNULL(SUM(balance_amount), 0.00) AS active_balance
             FROM purchases
             WHERE supplier_id = :id AND status = 'ACTIVE' AND deleted_at IS NULL"
        );
        $entityStmt->execute(['id' => $supplierId]);
        $activeBalance = (string) ($entityStmt->fetchColumn() ?: '0.00');

        $returnStmt = $this->pdo->prepare(
            "SELECT
                IFNULL(SUM(pr.grand_total), 0.00) AS return_sum
             FROM purchase_returns pr
             JOIN purchases p ON p.id = pr.purchase_id
             WHERE pr.supplier_id = :id AND p.status = 'ACTIVE' AND p.deleted_at IS NULL"
        );
        $returnStmt->execute(['id' => $supplierId]);
        $returnSum = (string) ($returnStmt->fetchColumn() ?: '0.00');

        $entityOutstanding = bcsub($activeBalance, $returnSum, 2);
        $isReconciled = bccomp($ledgerOutstanding, $entityOutstanding, 2) === 0;

        return [
            'supplier_id' => $supplierId,
            'ledger_outstanding' => $ledgerOutstanding,
            'entity_outstanding' => $entityOutstanding,
            'is_reconciled' => $isReconciled,
        ];
    }

    /**
     * Helper to validate and parse lines or fallback to single method line.
     *
     * @param list<array<string, mixed>> $rawLines
     * @return list<array{method: string, amount: string, reference_no: string|null}>
     */
    private function validateAndParseLines(array $rawLines, string $expectedTotal, ?string $fallbackMethod): array
    {
        if ($rawLines === []) {
            if ($fallbackMethod === null || $fallbackMethod === '') {
                throw new RuntimeException('Payment method required');
            }
            $cleanMethod = strtoupper(trim($fallbackMethod));
            if ($cleanMethod === 'CREDIT') {
                throw new RuntimeException('Credit/Due cannot be used as a payment line method');
            }
            if (!in_array($cleanMethod, self::ALLOWED_METHODS, true)) {
                throw new RuntimeException("Invalid payment method: {$cleanMethod}");
            }
            return [
                [
                    'method' => $cleanMethod,
                    'amount' => $expectedTotal,
                    'reference_no' => null,
                ],
            ];
        }

        $parsed = [];
        $sum = '0.00';
        $usedMethods = [];

        foreach ($rawLines as $line) {
            $method = strtoupper(trim((string) ($line['method'] ?? '')));
            if ($method === 'CREDIT') {
                throw new RuntimeException('Credit/Due cannot be used as a payment line method');
            }
            if (!in_array($method, self::ALLOWED_METHODS, true)) {
                throw new RuntimeException("Invalid payment method: {$method}");
            }

            if (isset($usedMethods[$method])) {
                throw new RuntimeException("Duplicate payment method {$method} in one payment is not allowed");
            }
            $usedMethods[$method] = true;

            $lineAmountRaw = $line['amount'] ?? null;
            if ($lineAmountRaw === null || !is_numeric($lineAmountRaw)) {
                throw new RuntimeException("Line amount for {$method} must be numeric");
            }

            $lineAmount = bcadd((string) $lineAmountRaw, '0', 2);
            if (bccomp($lineAmount, '0', 2) <= 0) {
                throw new RuntimeException("Line amount for {$method} must be greater than 0");
            }

            $referenceNo = isset($line['reference_no']) ? trim((string) $line['reference_no']) : '';
            if (in_array($method, self::REFERENCE_REQUIRED_METHODS, true) && $referenceNo === '') {
                throw new RuntimeException("Reference number is required for {$method}");
            }

            $parsed[] = [
                'method' => $method,
                'amount' => $lineAmount,
                'reference_no' => $referenceNo !== '' ? $referenceNo : null,
            ];

            $sum = bcadd($sum, $lineAmount, 2);
        }

        if (bccomp($sum, $expectedTotal, 2) !== 0) {
            throw new RuntimeException("Sum of payment lines (₹{$sum}) must equal total payment amount (₹{$expectedTotal})");
        }

        return $parsed;
    }

    /**
     * @param list<array{method: string, amount: string, reference_no: string|null}> $parsedLines
     */
    private function resolveCombinedMethod(array $parsedLines, ?string $fallbackMethod): string
    {
        $methods = array_unique(array_column($parsedLines, 'method'));
        if (count($methods) > 1) {
            return 'SPLIT';
        }
        if (count($methods) === 1) {
            return $methods[0];
        }
        return ($fallbackMethod !== null && $fallbackMethod !== '' && $fallbackMethod !== 'SPLIT') ? $fallbackMethod : 'CASH';
    }

    private function generateReceiptNumber(): string
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $no = 'REC-PAY-' . date('Ymd') . '-' . random_int(1000, 9999);

            $stmt = $this->pdo->prepare('SELECT 1 FROM purchase_payments WHERE receipt_no = :no');
            $stmt->execute(['no' => $no]);

            if ($stmt->fetchColumn() === false) {
                return $no;
            }
        }

        throw new RuntimeException('Could not generate a unique payment receipt number, please retry');
    }

    private function findPurchase(int $purchaseId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.*, s.name AS supplier_name FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = :id'
        );
        $stmt->execute(['id' => $purchaseId]);
        $purchase = $stmt->fetch();

        if ($purchase === false) {
            return null;
        }

        $items = $this->pdo->prepare('SELECT * FROM purchase_items WHERE purchase_id = :id');
        $items->execute(['id' => $purchaseId]);
        $purchase['items'] = $items->fetchAll();

        $returns = $this->pdo->prepare('SELECT * FROM purchase_returns WHERE purchase_id = :id ORDER BY created_at DESC');
        $returns->execute(['id' => $purchaseId]);
        $purchase['returns'] = $returns->fetchAll();

        return PurchaseService::decorateFlags($purchase);
    }
}
