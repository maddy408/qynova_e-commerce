-- Allow NULL product_id and variant_id for Quick Sale custom items in invoice_items
ALTER TABLE invoice_items 
    MODIFY product_id BIGINT UNSIGNED NULL,
    MODIFY variant_id BIGINT UNSIGNED NULL;
