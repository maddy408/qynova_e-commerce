-- Allow phone to be NULL for customers registering via Google OAuth
ALTER TABLE customers MODIFY phone VARCHAR(20) NULL;
