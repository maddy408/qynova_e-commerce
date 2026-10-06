-- Invoices (docs/DOCUMENTATION.md section 16). Numbering rule: deleted
-- invoice numbers are reused (lowest gap first), cancelled invoice
-- numbers are NEVER reused, and a cancelled invoice "remains a valid
-- historical transaction" — so cancelling an invoice must block deleting
-- it (enforced in InvoiceService, not here), otherwise its number could
-- free up and violate that rule.
--
-- active_invoice_no is NULL whenever an invoice is soft-deleted, so the
-- unique key only reserves invoice_no while the row is live — the same
-- generated-column trick as product_categories' one-primary-per-product
-- constraint (0005_products.sql). A cancelled-but-not-deleted invoice
-- keeps its slot reserved forever, which is exactly the rule above.

CREATE TABLE invoices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_no VARCHAR(30) NOT NULL,
    active_invoice_no VARCHAR(30) GENERATED ALWAYS AS (IF(deleted_at IS NULL, invoice_no, NULL)) STORED,
    channel ENUM('POS', 'ECOMMERCE') NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    customer_id BIGINT UNSIGNED NULL,
    cashier_user_id BIGINT UNSIGNED NULL,
    subtotal DECIMAL(15, 2) NOT NULL,
    discount_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    tax_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    shipping_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    grand_total DECIMAL(15, 2) NOT NULL,
    payment_method ENUM('CASH', 'UPI', 'CARD', 'NETBANKING', 'CREDIT', 'RAZORPAY') NULL,
    amount_paid DECIMAL(15, 2) NOT NULL DEFAULT 0,
    payment_status ENUM('PAID', 'PARTIAL', 'UNPAID') NOT NULL DEFAULT 'UNPAID',
    status ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    cancelled_at DATETIME NULL,
    cancelled_by BIGINT UNSIGNED NULL,
    cancellation_reason VARCHAR(255) NULL,
    deleted_at DATETIME NULL,
    deleted_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_invoices_active_no (active_invoice_no),
    INDEX idx_invoices_order (order_id),
    INDEX idx_invoices_customer (customer_id, created_at),
    INDEX idx_invoices_channel (channel, created_at),
    CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_invoices_cashier FOREIGN KEY (cashier_user_id) REFERENCES users(id),
    CONSTRAINT fk_invoices_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id),
    CONSTRAINT fk_invoices_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoice_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NOT NULL,
    product_name_snapshot VARCHAR(255) NOT NULL,
    variant_label_snapshot VARCHAR(255) NULL,
    sku_snapshot VARCHAR(80) NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    mrp DECIMAL(15, 2) NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    discount_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    line_total DECIMAL(15, 2) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_invoice_items_invoice (invoice_id),
    CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    CONSTRAINT fk_invoice_items_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_invoice_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
