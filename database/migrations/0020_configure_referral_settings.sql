-- Configure referral settings for dynamic 10% referral program
UPDATE referral_settings 
SET 
    is_enabled = 1,
    referrer_discount_percent = 10.00,
    referred_discount_percent = 10.00,
    reward_trigger = 'SIGNUP',
    updated_at = NOW()
WHERE id = 1;
