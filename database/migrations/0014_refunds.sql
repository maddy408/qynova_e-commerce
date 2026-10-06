-- Refund management (ECOMMERCE_POS_ADMIN_SPEC.md section 23). A refund
-- is requested (PENDING) the moment a paid order/invoice is cancelled,
-- and processed (COMPLETED/FAILED) as a separate, explicit admin action
-- — mirroring a real gateway's async refund flow (docs section 14:
-- "refund.processed" webhook) even though there is no real gateway here.
-- Exactly one of order_id/invoice_id is set, matching whichever flow
-- created the refund.

CREATE TABLE refunds (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    refund_no VARCHAR(30) NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    invoice_id BIGINT UNSIGNED NULL,
    customer_id BIGINT UNSIGNED NULL,
    amount DECIMAL(15, 2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    method ENUM('CASH', 'UPI', 'CARD', 'NETBANKING', 'RAZORPAY', 'STORE_CREDIT') NOT NULL,
    status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    gateway_refund_id VARCHAR(100) NULL,
    requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME NULL,
    processed_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_refunds_no (refund_no),
    INDEX idx_refunds_order (order_id),
    INDEX idx_refunds_invoice (invoice_id),
    INDEX idx_refunds_status (status),
    CONSTRAINT fk_refunds_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_refunds_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    CONSTRAINT fk_refunds_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_refunds_processed_by FOREIGN KEY (processed_by) REFERENCES users(id),
    CONSTRAINT chk_refunds_source CHECK (
        (order_id IS NOT NULL AND invoice_id IS NULL) OR (order_id IS NULL AND invoice_id IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only event log of refund processing attempts (mirrors
-- payment_transaction_events in docs/DOCUMENTATION.md section 11).
CREATE TABLE refund_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    refund_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(30) NULL,
    to_status VARCHAR(30) NOT NULL,
    gateway_response JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_refund_transactions_refund (refund_id, created_at),
    CONSTRAINT fk_refund_transactions_refund FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
