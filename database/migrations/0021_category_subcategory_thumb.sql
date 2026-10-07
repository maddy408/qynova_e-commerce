-- Migration 0021: thumbnail path for category/subcategory images.
--
-- image_path (added in 0004) already holds the compressed, WebP-converted
-- main image written by ImageUploadService::store(), which also writes a
-- separate small thumbnail file alongside it. Without a column to remember
-- that thumbnail's path, it could never be found again to delete when the
-- image is replaced or removed, leaving it orphaned on disk forever.

ALTER TABLE categories
    ADD COLUMN thumb_path VARCHAR(255) NULL AFTER image_path;

ALTER TABLE subcategories
    ADD COLUMN thumb_path VARCHAR(255) NULL AFTER image_path;
