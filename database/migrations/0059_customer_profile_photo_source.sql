-- 0059_customer_profile_photo_source.sql
-- Profile photo upload (D2): tracks WHERE a customer's profile_photo_path
-- came from, so a Google-provided photo can be safely refreshed on every
-- login (as today) while a customer's own uploaded photo never gets
-- silently overwritten by a later Google login. Without this column,
-- CustomerAuthController::loginWithGoogle() has no way to tell the two
-- apart and unconditionally overwrites profile_photo_path every time.
ALTER TABLE customers
    ADD COLUMN profile_photo_source ENUM('GOOGLE', 'UPLOAD') NULL AFTER profile_photo_path;

-- Backfill: any existing customer with both a google_id and a photo
-- already on file got that photo from Google (the only path that wrote
-- profile_photo_path before this migration) — mark it as such so it
-- keeps refreshing on login exactly like before. Customers with a photo
-- but no google_id are left NULL (unknown provenance, pre-dates this
-- column) — treated the same as GOOGLE by the application's fallback
-- logic (COALESCE to 'GOOGLE' at read time), so existing behavior is
-- unchanged until the customer uploads their own photo.
UPDATE customers
SET profile_photo_source = 'GOOGLE'
WHERE profile_photo_path IS NOT NULL
  AND profile_photo_path != ''
  AND google_id IS NOT NULL
  AND google_id != '';
