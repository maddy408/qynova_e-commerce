<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\ImageUploadService;
use PDO;
use Exception;
use RuntimeException;

final class ReturnsController
{
    private readonly \App\Services\ReturnService $returnService;
    private readonly ImageUploadService $uploader;

    public function __construct(private readonly PDO $pdo)
    {
        $this->returnService = new \App\Services\ReturnService($pdo);
        $this->uploader = new ImageUploadService();
    }

    private function assertOrderOwnership(array $claims, int $orderId): void
    {
        PermissionMiddleware::requireCustomer($claims);

        $stmt = $this->pdo->prepare('SELECT customer_id FROM orders WHERE id = :id');
        $stmt->execute(['id' => $orderId]);
        $ownerId = $stmt->fetchColumn();

        if ($ownerId === false) {
            Response::error('Order not found', 404);
            return;
        }

        if ((int) $ownerId !== (int) $claims['sub']) {
            Response::error('Forbidden', 403);
        }
    }

    /** Customer-facing: per-item return eligibility for one of their own orders (spec section 2). */
    public function customerEligibility(string|int $orderId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $this->assertOrderOwnership($claims, (int) $orderId);

        try {
            Response::json($this->returnService->eligibilityForOrder((int) $orderId, (int) $claims['sub']));
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /**
     * Customer-facing: submit a return request for one of their own
     * orders (spec sections 2-3). Everything that actually determines
     * eligibility, remaining quantity, pricing and the customer's
     * identity is re-derived server-side from the authenticated session
     * and the database — the request body only supplies which items/qty
     * the customer picked and their answers to the request form.
     *
     * multipart/form-data: a `payload` field holding the JSON-encoded
     * form fields, plus 0+ files under an `images[]` field — mirrors the
     * existing VariantImageController's plain-file-upload pattern, with
     * the structured fields carried as one JSON string since standard
     * multipart form fields can't nest objects/arrays.
     */
    public function customerCreate(string|int $orderId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $this->assertOrderOwnership($claims, (int) $orderId);

        $payload = json_decode((string) ($_POST['payload'] ?? '{}'), true);
        if (!is_array($payload)) {
            $payload = [];
        }

        $reason = trim((string) ($payload['reason'] ?? ''));
        $otherReasonText = trim((string) ($payload['description'] ?? ''));
        $condition = strtoupper(trim((string) ($payload['condition'] ?? '')));
        $packagingAvailable = array_key_exists('packaging_available', $payload) ? (bool) $payload['packaging_available'] : null;
        $resolution = strtoupper(trim((string) ($payload['resolution'] ?? 'REFUND')));
        $confirmed = (bool) ($payload['confirmed'] ?? false);
        $items = (array) ($payload['items'] ?? []);

        if (!$confirmed) {
            Response::error('Please confirm the return details are correct before submitting', 422);
            return;
        }

        if ($reason === 'Other' && $otherReasonText === '') {
            Response::error('Please describe the reason when "Other" is selected', 422);
            return;
        }

        // The reason dropdown's value IS the stored reason; the optional
        // description is appended as notes (section 3, item 2) so neither
        // the dropdown choice nor the free-text explanation is lost.
        $data = [
            'order_id' => (int) $orderId,
            'reason' => $reason,
            'notes' => $otherReasonText,
            'return_type' => $resolution,
            'items' => $items,
        ];

        $imagePaths = [];
        $uploadedFiles = $this->normalizeFiles($_FILES['images'] ?? null);

        try {
            if (count($uploadedFiles) > 5) {
                throw new RuntimeException('A maximum of 5 supporting images is allowed');
            }

            foreach ($uploadedFiles as $file) {
                $imagePaths[] = $this->uploader->store($file, 'returns');
            }

            // Eligibility (delivered, within window, remaining quantity)
            // is re-verified here against the database for every item,
            // using the exact same source of truth the GET endpoint above
            // shows the customer — never the frontend's own judgement of
            // which items/qty are returnable.
            $eligibility = $this->returnService->eligibilityForOrder((int) $orderId, (int) $claims['sub']);
            $eligibleByItemId = [];
            foreach ($eligibility['items'] as $eligItem) {
                $eligibleByItemId[$eligItem['order_item_id']] = $eligItem;
            }

            foreach ($items as $item) {
                $orderItemId = (int) ($item['order_item_id'] ?? 0);
                $qty = (int) ($item['qty'] ?? 0);
                $eligItem = $eligibleByItemId[$orderItemId] ?? null;

                if ($eligItem === null) {
                    throw new RuntimeException("Item #{$orderItemId} does not belong to this order");
                }
                if (!$eligItem['eligible']) {
                    throw new RuntimeException("'{$eligItem['product_name_snapshot']}' is not eligible for return: " . ($eligItem['reason'] ?? 'not eligible'));
                }
                if ($qty <= 0 || $qty > $eligItem['remaining_qty']) {
                    throw new RuntimeException("Invalid quantity for '{$eligItem['product_name_snapshot']}' — up to {$eligItem['remaining_qty']} may be returned");
                }
            }

            $returnId = $this->returnService->createReturn(
                $data,
                createdByUserId: null,
                customerId: (int) $claims['sub'],
                reportedCondition: $condition !== '' ? $condition : null,
                packagingAvailable: $packagingAvailable,
                imagePaths: $imagePaths,
            );

            Response::json(['return' => $this->returnService->find($returnId)], 201);
        } catch (RuntimeException $e) {
            // The request failed after some images may already have been
            // uploaded — those files would otherwise be orphaned on disk
            // with nothing in the database ever referencing them.
            foreach ($imagePaths as $img) {
                $this->uploader->delete($img['path']);
                $this->uploader->delete($img['thumb_path'] ?? null);
            }
            Response::error($e->getMessage(), 422);
        }
    }

    /**
     * Normalizes PHP's parallel-array $_FILES shape for a multi-file
     * input (`images[]`) into a list of individual file arrays.
     *
     * @return list<array{tmp_name: string, size: int, error: int, name: string}>
     */
    private function normalizeFiles(?array $filesField): array
    {
        if ($filesField === null || !isset($filesField['name'])) {
            return [];
        }

        if (!is_array($filesField['name'])) {
            return $filesField['error'] === UPLOAD_ERR_NO_FILE ? [] : [$filesField];
        }

        $normalized = [];
        foreach ($filesField['name'] as $i => $name) {
            if ($filesField['error'][$i] === UPLOAD_ERR_NO_FILE) {
                continue;
            }
            $normalized[] = [
                'name' => $name,
                'tmp_name' => $filesField['tmp_name'][$i],
                'size' => $filesField['size'][$i],
                'error' => $filesField['error'][$i],
            ];
        }

        return $normalized;
    }

    /** Admin-facing: create a linked replacement fulfillment order for an approved REPLACEMENT return (spec section 7). */
    public function createReplacement(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        try {
            $updated = $this->returnService->createReplacementOrder((int) $id, (int) $claims['sub']);
            Response::json(['return' => $updated]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function indexSaleReturns(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $stmt = $this->pdo->query(
            "SELECT sr.*, c.name as customer_name, c.phone as customer_phone, u.name as created_by_name
             FROM sale_returns sr
             LEFT JOIN customers c ON c.id = sr.customer_id
             LEFT JOIN users u ON u.id = sr.created_by
             ORDER BY sr.created_at DESC"
        );
        $returns = $stmt->fetchAll();

        foreach ($returns as &$ret) {
            $itemStmt = $this->pdo->prepare(
                "SELECT sri.*, pv.sku, p.name as product_name
                 FROM sale_return_items sri
                 JOIN product_variants pv ON pv.id = sri.variant_id
                 JOIN products p ON p.id = pv.product_id
                 WHERE sri.return_id = :id"
            );
            $itemStmt->execute(['id' => $ret['id']]);
            $ret['items'] = $itemStmt->fetchAll();
        }
        unset($ret);

        Response::json(['sale_returns' => $returns]);
    }

    public function storeSaleReturn(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.returns.process');

        $body = Request::json();
        $invoiceId = !empty($body['invoice_id']) ? (int) $body['invoice_id'] : null;
        $customerId = !empty($body['customer_id']) ? (int) $body['customer_id'] : null;
        $reason = trim((string) ($body['reason'] ?? 'Customer Return'));
        $notes = trim((string) ($body['notes'] ?? ''));
        $items = (array) ($body['items'] ?? []);

        if (empty($items)) {
            Response::error('At least one return item is required', 422);
        }

        // A sale return must reference the real invoice it's returning
        // against — previously invoice_id was optional and the frontend
        // never sent one at all, so item quantity/price came straight
        // from a free-text form with no link to any actual sale. Both
        // the refund-amount cap below and the quantity cap now depend on
        // this, so there is no return without a real invoice behind it.
        $stmtInv = $this->pdo->prepare('SELECT id, grand_total, amount_paid FROM invoices WHERE id = :id AND deleted_at IS NULL');
        $stmtInv->execute(['id' => $invoiceId]);
        $invoice = $stmtInv->fetch(PDO::FETCH_ASSOC);

        if ($invoiceId === null || $invoice === false) {
            Response::error('A valid invoice is required to process a sale return', 422);
            return;
        }

        $stmtInvItems = $this->pdo->prepare('SELECT id, variant_id, quantity, line_total FROM invoice_items WHERE invoice_id = :id');
        $stmtInvItems->execute(['id' => $invoiceId]);
        $invoiceItemsMap = [];
        foreach ($stmtInvItems->fetchAll(PDO::FETCH_ASSOC) as $ii) {
            $invoiceItemsMap[(int) $ii['variant_id']] = $ii;
        }

        // Quantity already returned per variant, across every non-empty
        // prior return against this same invoice — without this, the
        // same units could be "returned" (and their stock credited back)
        // over and over across multiple separate return requests.
        $alreadyReturnedStmt = $this->pdo->prepare(
            "SELECT sri.variant_id, COALESCE(SUM(sri.qty), 0) AS qty
             FROM sale_return_items sri
             JOIN sale_returns sr ON sr.id = sri.return_id
             WHERE sr.invoice_id = :invoice_id
             GROUP BY sri.variant_id"
        );
        $alreadyReturnedStmt->execute(['invoice_id' => $invoiceId]);
        $alreadyReturned = array_column($alreadyReturnedStmt->fetchAll(PDO::FETCH_ASSOC), 'qty', 'variant_id');

        $this->pdo->beginTransaction();

        try {
            $returnNo = 'SRET-' . date('YmdHis') . '-' . random_int(100, 999);
            $totalAmount = 0.0;
            $processedItems = [];

            foreach ($items as $item) {
                $variantId = (int) ($item['variant_id'] ?? 0);
                $qty = (int) ($item['qty'] ?? 0);
                if ($variantId <= 0 || $qty <= 0) continue;

                if (!isset($invoiceItemsMap[$variantId])) {
                    $this->pdo->rollBack();
                    Response::error("Variant {$variantId} was not part of invoice #{$invoiceId}", 422);
                    return;
                }

                $invItem = $invoiceItemsMap[$variantId];
                $invQty = (int) $invItem['quantity'];
                // The real, discounted per-unit price actually charged —
                // never the client-supplied unit_price, which previously
                // was trusted outright whenever no invoice match was found.
                $unitPrice = $invQty > 0 ? (float) $invItem['line_total'] / $invQty : 0.0;

                $returnedSoFar = (int) ($alreadyReturned[$variantId] ?? 0);
                $remaining = $invQty - $returnedSoFar;
                if ($qty > $remaining) {
                    $this->pdo->rollBack();
                    Response::error("Cannot return {$qty} of variant {$variantId} — only {$remaining} remain returnable on invoice #{$invoiceId}", 422);
                    return;
                }

                $itemTotal = round($qty * $unitPrice, 2);
                $totalAmount += $itemTotal;
                $processedItems[] = [
                    'variant_id' => $variantId,
                    'qty' => $qty,
                    'unit_price' => $unitPrice,
                    'item_total' => $itemTotal,
                ];
            }

            if ($processedItems === []) {
                $this->pdo->rollBack();
                Response::error('At least one valid return item is required', 422);
                return;
            }

            // Ensure cumulative refunds for this invoice do not exceed amount paid
            $stmtPastRefunds = $this->pdo->prepare('SELECT COALESCE(SUM(total_amount), 0) FROM sale_returns WHERE invoice_id = :invoice_id');
            $stmtPastRefunds->execute(['invoice_id' => $invoiceId]);
            $pastRefundTotal = (float) $stmtPastRefunds->fetchColumn();
            $maxRefundAllowed = (float) $invoice['amount_paid'];

            if (($pastRefundTotal + $totalAmount) > ($maxRefundAllowed + 0.001)) {
                $this->pdo->rollBack();
                Response::error("Total refund cannot exceed paid amount of Rs. " . number_format($maxRefundAllowed, 2), 422);
                return;
            }

            $stmt = $this->pdo->prepare(
                "INSERT INTO sale_returns (return_no, invoice_id, customer_id, total_amount, refund_status, reason, notes, created_by)
                 VALUES (:return_no, :invoice_id, :customer_id, :total_amount, 'REFUNDED', :reason, :notes, :created_by)"
            );
            $stmt->execute([
                'return_no' => $returnNo,
                'invoice_id' => $invoiceId,
                'customer_id' => $customerId,
                'total_amount' => $totalAmount,
                'reason' => $reason,
                'notes' => $notes ?: null,
                'created_by' => $claims['sub'],
            ]);
            $returnId = (int) $this->pdo->lastInsertId();

            $insertItem = $this->pdo->prepare(
                "INSERT INTO sale_return_items (return_id, variant_id, qty, unit_price, total_amount)
                 VALUES (:return_id, :variant_id, :qty, :unit_price, :total_amount)"
            );

            // Record stock adjustment to add items back into inventory
            $adjNo = 'ADJ-SR-' . date('YmdHis') . '-' . random_int(100, 999);
            $this->pdo->prepare(
                "INSERT INTO stock_adjustments (adjustment_no, reason, status, created_by)
                 VALUES (:no, :reason, 'APPROVED', :created_by)"
            )->execute(['no' => $adjNo, 'reason' => 'Sale Return: ' . $returnNo, 'created_by' => $claims['sub']]);
            $adjId = (int) $this->pdo->lastInsertId();

            $adjItemStmt = $this->pdo->prepare(
                "INSERT INTO stock_adjustment_items (adjustment_id, variant_id, system_qty, counted_qty)
                 VALUES (:adj_id, :variant_id, :sys_qty, :count_qty)"
            );

            foreach ($processedItems as $pItem) {
                $variantId = $pItem['variant_id'];
                $qty = $pItem['qty'];
                $unitPrice = $pItem['unit_price'];
                $itemTotal = $pItem['item_total'];

                $insertItem->execute([
                    'return_id' => $returnId,
                    'variant_id' => $variantId,
                    'qty' => $qty,
                    'unit_price' => $unitPrice,
                    'total_amount' => $itemTotal,
                ]);

                // Current stock on hand
                $stockStmt = $this->pdo->prepare("SELECT on_hand FROM inventory WHERE variant_id = :id");
                $stockStmt->execute(['id' => $variantId]);
                $currentOnHand = (float) ($stockStmt->fetchColumn() ?: 0);
                $newOnHand = $currentOnHand + $qty;

                // Update inventory
                $this->pdo->prepare(
                    "INSERT INTO inventory (variant_id, product_id, on_hand)
                     SELECT :variant_id, product_id, :on_hand FROM product_variants WHERE id = :v_id2
                     ON DUPLICATE KEY UPDATE on_hand = VALUES(on_hand)"
                )->execute(['variant_id' => $variantId, 'on_hand' => $newOnHand, 'v_id2' => $variantId]);

                $adjItemStmt->execute([
                    'adj_id' => $adjId,
                    'variant_id' => $variantId,
                    'sys_qty' => $currentOnHand,
                    'count_qty' => $newOnHand,
                ]);
            }

            $this->pdo->commit();
            Response::json(['id' => $returnId, 'return_no' => $returnNo], 201);
        } catch (Exception $e) {
            $this->pdo->rollBack();
            Response::error($e->getMessage(), 500);
        }
    }

    public function indexPurchaseReturns(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'purchases.manage');

        $stmt = $this->pdo->query(
            "SELECT pr.*, pr.purchase_return_no AS return_no, pr.grand_total AS total_amount, s.name AS supplier_name, s.contact_person AS supplier_contact, u.name AS created_by_name
             FROM purchase_returns pr
             LEFT JOIN suppliers s ON s.id = pr.supplier_id
             LEFT JOIN users u ON u.id = pr.created_by
             ORDER BY pr.created_at DESC"
        );
        $returns = $stmt->fetchAll();

        foreach ($returns as &$ret) {
            $itemStmt = $this->pdo->prepare(
                "SELECT pri.*, pri.quantity AS qty, pri.unit_cost AS unit_price, pri.line_total AS total_amount, pv.sku, p.name as product_name
                 FROM purchase_return_items pri
                 JOIN product_variants pv ON pv.id = pri.variant_id
                 JOIN products p ON p.id = pv.product_id
                 WHERE pri.purchase_return_id = :id"
            );
            $itemStmt->execute(['id' => $ret['id']]);
            $ret['items'] = $itemStmt->fetchAll();
        }
        unset($ret);

        Response::json(['purchase_returns' => $returns]);
    }

    public function storePurchaseReturn(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.returns.process');

        $body = Request::json();
        $purchaseId = !empty($body['purchase_id']) ? (int) $body['purchase_id'] : null;
        $supplierId = !empty($body['supplier_id']) ? (int) $body['supplier_id'] : null;
        $reason = trim((string) ($body['reason'] ?? 'Supplier Return'));
        $notes = trim((string) ($body['notes'] ?? ''));
        $items = (array) ($body['items'] ?? []);

        if (empty($items)) {
            Response::error('At least one return item is required', 422);
        }

        $this->pdo->beginTransaction();

        try {
            $returnNo = 'PRET-' . date('YmdHis') . '-' . random_int(100, 999);
            $totalAmount = 0.0;

            foreach ($items as $item) {
                $qty = (int) ($item['qty'] ?? 0);
                $unitPrice = (float) ($item['unit_price'] ?? 0);
                if ($qty <= 0) continue;
                $totalAmount += ($qty * $unitPrice);
            }

            $stmt = $this->pdo->prepare(
                "INSERT INTO purchase_returns (purchase_return_no, purchase_id, supplier_id, grand_total, reason, created_by)
                 VALUES (:return_no, :purchase_id, :supplier_id, :grand_total, :reason, :created_by)"
            );
            $stmt->execute([
                'return_no' => $returnNo,
                'purchase_id' => $purchaseId,
                'supplier_id' => $supplierId,
                'grand_total' => $totalAmount,
                'reason' => $reason,
                'created_by' => $claims['sub'],
            ]);
            $returnId = (int) $this->pdo->lastInsertId();

            $insertItem = $this->pdo->prepare(
                "INSERT INTO purchase_return_items (purchase_return_id, purchase_item_id, variant_id, quantity, unit_cost, line_total)
                 VALUES (:purchase_return_id, :purchase_item_id, :variant_id, :quantity, :unit_cost, :line_total)"
            );

            // Record stock adjustment to deduct items from inventory
            $adjNo = 'ADJ-PR-' . date('YmdHis') . '-' . random_int(100, 999);
            $this->pdo->prepare(
                "INSERT INTO stock_adjustments (adjustment_no, reason, status, created_by)
                 VALUES (:no, :reason, 'APPROVED', :created_by)"
            )->execute(['no' => $adjNo, 'reason' => 'Purchase Return: ' . $returnNo, 'created_by' => $claims['sub']]);
            $adjId = (int) $this->pdo->lastInsertId();

            $adjItemStmt = $this->pdo->prepare(
                "INSERT INTO stock_adjustment_items (adjustment_id, variant_id, system_qty, counted_qty)
                 VALUES (:adj_id, :variant_id, :sys_qty, :count_qty)"
            );

            foreach ($items as $item) {
                $variantId = (int) ($item['variant_id'] ?? 0);
                $qty = (float) ($item['qty'] ?? 0);
                $unitPrice = (float) ($item['unit_price'] ?? 0);
                if ($variantId <= 0 || $qty <= 0) continue;

                $itemTotal = $qty * $unitPrice;
                $insertItem->execute([
                    'purchase_return_id' => $returnId,
                    'purchase_item_id' => null,
                    'variant_id' => $variantId,
                    'quantity' => $qty,
                    'unit_cost' => $unitPrice,
                    'line_total' => $itemTotal,
                ]);

                // Current stock on hand
                $stockStmt = $this->pdo->prepare("SELECT on_hand FROM inventory WHERE variant_id = :id");
                $stockStmt->execute(['id' => $variantId]);
                $currentOnHand = (float) ($stockStmt->fetchColumn() ?: 0);
                $newOnHand = max(0, $currentOnHand - $qty);

                // Update inventory
                $this->pdo->prepare(
                    "INSERT INTO inventory (variant_id, product_id, on_hand)
                     SELECT :variant_id, product_id, :on_hand FROM product_variants WHERE id = :v_id2
                     ON DUPLICATE KEY UPDATE on_hand = VALUES(on_hand)"
                )->execute(['variant_id' => $variantId, 'on_hand' => $newOnHand, 'v_id2' => $variantId]);

                $adjItemStmt->execute([
                    'adj_id' => $adjId,
                    'variant_id' => $variantId,
                    'sys_qty' => $currentOnHand,
                    'count_qty' => $newOnHand,
                ]);
            }

            $this->pdo->commit();
            Response::json(['id' => $returnId, 'return_no' => $returnNo], 201);
        } catch (Exception $e) {
            $this->pdo->rollBack();
            Response::error($e->getMessage(), 500);
        }
    }

    public function summary(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        Response::json($this->returnService->summary());
    }

    public function eligibleOrders(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $search = Request::query('search');
        Response::json(['orders' => $this->returnService->getEligibleOrders($search)]);
    }

    public function list(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $filters = [
            'tab' => Request::query('tab', 'all'),
            'search' => Request::query('search', ''),
            'status' => Request::query('status', ''),
            'reason' => Request::query('reason', ''),
            'date_from' => Request::query('date_from', ''),
            'date_to' => Request::query('date_to', ''),
            'page' => (int) Request::query('page', '1'),
            'limit' => (int) Request::query('limit', '10'),
        ];

        Response::json($this->returnService->list($filters));
    }

    public function show(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $return = $this->returnService->find((int) $id);
        if ($return === null) {
            Response::error('Return not found', 404);
            return;
        }

        Response::json(['return' => $return]);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $isCustomer = (($claims['type'] ?? '') === 'customer' || ($claims['role'] ?? '') === 'CUSTOMER');

        if (!$isCustomer) {
            PermissionMiddleware::require($claims, 'orders.manage');
            $actorUserId = (int) $claims['sub'];
            $customerId = null;
        } else {
            $actorUserId = null;
            $customerId = (int) $claims['sub'];
        }

        $body = Request::json();

        try {
            $returnId = $this->returnService->createReturn($body, $actorUserId, $customerId);
            $return = $this->returnService->find($returnId);
            Response::json(['return' => $return], 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function storeForOrder(string|int $orderId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $isCustomer = (($claims['type'] ?? '') === 'customer' || ($claims['role'] ?? '') === 'CUSTOMER');

        if (!$isCustomer) {
            PermissionMiddleware::require($claims, 'orders.manage');
            $actorUserId = (int) $claims['sub'];
            $customerId = null;
        } else {
            $actorUserId = null;
            $customerId = (int) $claims['sub'];
        }

        $body = Request::json();
        $body['order_id'] = (int) $orderId;

        try {
            $returnId = $this->returnService->createReturn($body, $actorUserId, $customerId);
            $return = $this->returnService->find($returnId);
            Response::json(['return' => $return], 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function updateStatus(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $body = Request::json();
        $status = strtoupper(trim((string) ($body['status'] ?? '')));
        $note = !empty($body['note']) ? trim((string) $body['note']) : null;
        $actorUserId = (int) $claims['sub'];

        if ($status === '') {
            Response::error('Status is required', 422);
            return;
        }

        try {
            $updated = $this->returnService->updateStatus((int) $id, $status, $note, $actorUserId, $body);
            Response::json(['return' => $updated]);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function approve(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $body = Request::json();
        $note = !empty($body['note']) ? trim((string) $body['note']) : 'Approved by staff';
        $actorUserId = (int) $claims['sub'];

        try {
            $updated = $this->returnService->updateStatus((int) $id, 'APPROVED', $note, $actorUserId, $body);
            Response::json(['return' => $updated]);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function reject(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $body = Request::json();
        $reason = trim((string) ($body['rejection_reason'] ?? $body['reason'] ?? ''));
        $note = !empty($body['note']) ? trim((string) $body['note']) : null;
        $actorUserId = (int) $claims['sub'];

        if ($reason === '') {
            Response::error('A rejection reason is required', 422);
            return;
        }

        try {
            $updated = $this->returnService->updateStatus((int) $id, 'REJECTED', $note, $actorUserId, [
                'rejection_reason' => $reason,
            ]);
            Response::json(['return' => $updated]);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function processRefund(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $body = Request::json();
        $method = trim((string) ($body['payment_method'] ?? 'ORIGINAL'));
        $actorUserId = (int) $claims['sub'];

        try {
            $updated = $this->returnService->processRefund((int) $id, $actorUserId, $method);
            Response::json(['return' => $updated]);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function showForOrder(string|int $orderId): void
    {
        $claims = JwtAuthMiddleware::authenticate();

        $return = $this->returnService->findByOrder((int) $orderId);

        if (($claims['role'] ?? '') === 'CUSTOMER') {
            $stmt = $this->pdo->prepare('SELECT customer_id FROM orders WHERE id = :id');
            $stmt->execute(['id' => (int) $orderId]);
            $ownerId = $stmt->fetchColumn();
            if ((int) $ownerId !== (int) $claims['sub']) {
                Response::error('Forbidden', 403);
                return;
            }
        }

        Response::json(['return' => $return]);
    }

    public function export(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $filters = [
            'tab' => Request::query('tab', 'all'),
            'search' => Request::query('search', ''),
            'status' => Request::query('status', ''),
            'reason' => Request::query('reason', ''),
            'date_from' => Request::query('date_from', ''),
            'date_to' => Request::query('date_to', ''),
            'page' => 1,
            'limit' => 1000,
        ];

        $data = $this->returnService->list($filters);

        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="returns_export_' . date('Ymd_His') . '.csv"');

        $out = fopen('php://output', 'w');
        fputcsv($out, [
            'RMA ID', 'Order No', 'Customer Name', 'Customer Phone',
            'First Product', 'Qty', 'Reason', 'Return Type',
            'Status', 'Refund Status', 'Refund Amount (Rs)', 'Request Date'
        ]);

        foreach ($data['items'] as $row) {
            fputcsv($out, [
                $row['return_no'],
                $row['order_no'] ?? '',
                $row['customer_name'] ?? '',
                $row['customer_phone'] ?? '',
                $row['first_item_name'] ?? '',
                $row['total_returned_qty'] ?? 1,
                $row['reason'] ?? '',
                $row['return_type'] ?? 'REFUND',
                $row['status'],
                $row['refund_status'],
                number_format((float) $row['refund_amount'], 2, '.', ''),
                $row['created_at'],
            ]);
        }

        fclose($out);
        exit;
    }
}
