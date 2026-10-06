-- OTP verification (spec: ECOMMERCE_POS_ADMIN_SPEC.md section 2).
-- One row per OTP sent; resend creates a new row rather than mutating the
-- old one, so cooldown/attempt history stays auditable.

CREATE TABLE otp_verifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    purpose ENUM('SIGNUP', 'LOGIN', 'RESET_PASSWORD') NOT NULL DEFAULT 'SIGNUP',
    status ENUM('PENDING', 'VERIFIED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
    max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 5,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    verified_at DATETIME NULL,
    ip_address VARCHAR(45) NULL,
    INDEX idx_otp_verifications_phone_status (phone, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Referral system (spec: ECOMMERCE_POS_ADMIN_SPEC.md sections 3-4).
-- referral_settings is a singleton config row (id is always 1).

CREATE TABLE referral_settings (
    id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
    is_enabled TINYINT(1) NOT NULL DEFAULT 0,
    referrer_discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
    referred_discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
    max_discount_amount DECIMAL(15, 2) NULL,
    min_order_amount DECIMAL(15, 2) NULL,
    first_order_only TINYINT(1) NOT NULL DEFAULT 1,
    reward_trigger ENUM('SIGNUP', 'FIRST_ORDER', 'FIRST_DELIVERED_ORDER') NOT NULL DEFAULT 'FIRST_DELIVERED_ORDER',
    referral_validity_days INT UNSIGNED NULL,
    referral_code_prefix VARCHAR(20) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_referral_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO referral_settings (id) VALUES (1);

CREATE TABLE referral_codes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(30) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_referral_codes_customer (customer_id),
    UNIQUE KEY uq_referral_codes_code (code),
    CONSTRAINT fk_referral_codes_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A customer can be referred at most once (uq on referred_customer_id);
-- a customer cannot refer themself (enforced in the service layer, since
-- CHECK cannot compare two columns portably across all MySQL/MariaDB
-- versions still in use here).
CREATE TABLE referrals (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    referrer_customer_id BIGINT UNSIGNED NOT NULL,
    referred_customer_id BIGINT UNSIGNED NOT NULL,
    referral_code_id BIGINT UNSIGNED NOT NULL,
    status ENUM('PENDING', 'ELIGIBLE', 'APPLIED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_referrals_referred (referred_customer_id),
    INDEX idx_referrals_referrer (referrer_customer_id, status),
    CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_customer_id) REFERENCES customers(id),
    CONSTRAINT fk_referrals_referred FOREIGN KEY (referred_customer_id) REFERENCES customers(id),
    CONSTRAINT fk_referrals_code FOREIGN KEY (referral_code_id) REFERENCES referral_codes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each referral can produce up to two reward rows (one per side), never
-- more — enforced by uq_referral_rewards_side, so the same referral can
-- never be rewarded twice on the same side.
CREATE TABLE referral_rewards (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    referral_id BIGINT UNSIGNED NOT NULL,
    beneficiary_customer_id BIGINT UNSIGNED NOT NULL,
    reward_side ENUM('REFERRER', 'REFERRED') NOT NULL,
    discount_percent DECIMAL(5, 2) NOT NULL,
    discount_amount DECIMAL(15, 2) NULL,
    status ENUM('PENDING', 'ELIGIBLE', 'APPLIED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    trigger_event ENUM('SIGNUP', 'FIRST_ORDER', 'FIRST_DELIVERED_ORDER') NOT NULL,
    applied_order_id BIGINT UNSIGNED NULL,
    expires_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_referral_rewards_side (referral_id, reward_side),
    INDEX idx_referral_rewards_beneficiary (beneficiary_customer_id, status),
    CONSTRAINT fk_referral_rewards_referral FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE,
    CONSTRAINT fk_referral_rewards_beneficiary FOREIGN KEY (beneficiary_customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
