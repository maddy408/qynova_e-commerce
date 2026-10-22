-- Migration: 0054_add_customer_email_to_reviews.sql
-- Add customer_email column to customer_reviews table for verified buyer email tracking

ALTER TABLE customer_reviews 
ADD COLUMN customer_email VARCHAR(255) NULL AFTER customer_name;
