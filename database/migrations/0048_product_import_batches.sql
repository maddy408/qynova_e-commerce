-- Product import history: one row per committed Excel (+ images ZIP) import.
-- Imported images are tagged with the batch and their original Excel/ZIP
-- filename so an import's images can later be listed, replaced (single
-- image or a whole new ZIP) or deleted together.
CREATE TABLE IF NOT EXISTS product_import_batches (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(190) NOT NULL,
    note TEXT NULL,
    excel_filename VARCHAR(255) NULL,
    zip_filename VARCHAR(255) NULL,
    zip_size_bytes BIGINT UNSIGNED NULL,
    total_rows INT NOT NULL DEFAULT 0,
    successful_rows INT NOT NULL DEFAULT 0,
    failed_rows INT NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_import_batches_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE product_images
    ADD COLUMN import_batch_id BIGINT UNSIGNED NULL AFTER is_primary,
    ADD COLUMN source_filename VARCHAR(255) NULL AFTER import_batch_id,
    ADD KEY idx_product_images_batch (import_batch_id),
    ADD CONSTRAINT fk_product_images_batch FOREIGN KEY (import_batch_id) REFERENCES product_import_batches (id) ON DELETE SET NULL;

ALTER TABLE variant_images
    ADD COLUMN import_batch_id BIGINT UNSIGNED NULL AFTER is_primary,
    ADD COLUMN source_filename VARCHAR(255) NULL AFTER import_batch_id,
    ADD KEY idx_variant_images_batch (import_batch_id),
    ADD CONSTRAINT fk_variant_images_batch FOREIGN KEY (import_batch_id) REFERENCES product_import_batches (id) ON DELETE SET NULL;
