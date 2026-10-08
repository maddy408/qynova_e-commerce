-- Enforce single-use constraint on referral codes
-- Each referral_code_id can appear in referrals at most once.
-- Once used, attempts to use the same referral code are rejected at both application and MySQL engine level.
ALTER TABLE referrals ADD UNIQUE KEY uq_referrals_code (referral_code_id);
