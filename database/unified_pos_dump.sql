-- Unified POS Database Dump
-- Generated: 2026-10-06 21:05:54

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `actor_type` enum('USER','CUSTOMER','SYSTEM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_id` bigint unsigned DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` bigint unsigned DEFAULT NULL,
  `old_value` json DEFAULT NULL,
  `new_value` json DEFAULT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_entity` (`entity_type`,`entity_id`),
  KEY `idx_audit_logs_actor` (`actor_type`,`actor_id`),
  KEY `idx_audit_logs_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `audit_logs` (`id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `old_value`, `new_value`, `reason`, `ip_address`, `created_at`) VALUES ('1', 'USER', '1', 'PURCHASE', 'purchase', '1', NULL, NULL, NULL, NULL, '2026-10-06 21:45:49');
INSERT INTO `audit_logs` (`id`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `old_value`, `new_value`, `reason`, `ip_address`, `created_at`) VALUES ('2', 'USER', '1', 'PURCHASE', 'purchase', '2', NULL, NULL, NULL, NULL, '2026-10-06 23:11:10');

DROP TABLE IF EXISTS `banner_items`;
CREATE TABLE `banner_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `banner_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `offer_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_banner_items_banner_product` (`banner_id`,`product_id`),
  KEY `fk_banner_items_product` (`product_id`),
  CONSTRAINT `fk_banner_items_banner` FOREIGN KEY (`banner_id`) REFERENCES `banners` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_banner_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `banner_items` (`id`, `banner_id`, `product_id`, `offer_text`, `sort_order`) VALUES ('2', '1', '1', 'Buy 1 Get 1', '0');

DROP TABLE IF EXISTS `banners`;
CREATE TABLE `banners` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_desktop_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_mobile_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `position` enum('HOME_HERO','HOME_MIDDLE','CATEGORY_PAGE','POPUP') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'HOME_HERO',
  `target_type` enum('PRODUCT','CATEGORY','SUBCATEGORY','BRAND','COUPON','EXTERNAL_URL','NONE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NONE',
  `target_id` bigint unsigned DEFAULT NULL,
  `target_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `starts_at` datetime DEFAULT NULL,
  `ends_at` datetime DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_banners_position_active` (`position`,`is_active`,`sort_order`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `banners` (`id`, `title`, `image_desktop_path`, `image_mobile_path`, `position`, `target_type`, `target_id`, `target_url`, `starts_at`, `ends_at`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES ('1', 'Diwali Mega Sale', 'uploads/banners/c8497f2ab7be53dac3f6953dd3a21ca0.webp', NULL, 'HOME_HERO', 'CATEGORY', '3', NULL, NULL, NULL, '1', '1', '2026-10-06 21:54:04', '2026-10-06 21:56:06');

DROP TABLE IF EXISTS `brands`;
CREATE TABLE `brands` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_brands_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `cart_items`;
CREATE TABLE `cart_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cart_id` bigint unsigned NOT NULL,
  `variant_id` bigint unsigned NOT NULL,
  `quantity` int unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cart_items_variant` (`cart_id`,`variant_id`),
  KEY `fk_cart_items_variant` (`variant_id`),
  CONSTRAINT `fk_cart_items_cart` FOREIGN KEY (`cart_id`) REFERENCES `carts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cart_items_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`),
  CONSTRAINT `chk_cart_items_quantity` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `carts`;
CREATE TABLE `carts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `customer_id` bigint unsigned NOT NULL,
  `status` enum('ACTIVE','CONVERTED','ABANDONED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_carts_customer` (`customer_id`),
  CONSTRAINT `fk_carts_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `categories`;
CREATE TABLE `categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(170) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_name` (`name`),
  UNIQUE KEY `uq_categories_slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `image_path`, `sort_order`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('1', 'Hair Accessories', 'hair-accessories', NULL, NULL, '1', 'ACTIVE', NULL, '2026-10-06 17:59:48', '2026-10-06 17:59:48');
INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `image_path`, `sort_order`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('2', 'Jewellery & Fashion Accessories', 'jewellery-fashion-accessories', NULL, NULL, '2', 'ACTIVE', NULL, '2026-10-06 17:59:48', '2026-10-06 17:59:48');
INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `image_path`, `sort_order`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('3', 'Gift Items', 'gift-items', NULL, NULL, '3', 'ACTIVE', NULL, '2026-10-06 17:59:48', '2026-10-06 17:59:48');
INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `image_path`, `sort_order`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('4', 'Toys', 'toys', NULL, NULL, '4', 'ACTIVE', NULL, '2026-10-06 17:59:48', '2026-10-06 17:59:48');
INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `image_path`, `sort_order`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('5', 'Bags & Pouches', 'bags-pouches', NULL, NULL, '5', 'ACTIVE', NULL, '2026-10-06 17:59:48', '2026-10-06 17:59:48');
INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `image_path`, `sort_order`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('6', 'Beauty Accessories', 'beauty-accessories', NULL, NULL, '6', 'ACTIVE', NULL, '2026-10-06 17:59:48', '2026-10-06 17:59:48');
INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `image_path`, `sort_order`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('7', 'Storage & Utility Products', 'storage-utility-products', NULL, NULL, '7', 'ACTIVE', NULL, '2026-10-06 17:59:48', '2026-10-06 17:59:48');
INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `image_path`, `sort_order`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('8', 'Combo Offers', 'combo-offers', NULL, NULL, '8', 'ACTIVE', NULL, '2026-10-06 17:59:48', '2026-10-06 17:59:48');
INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `image_path`, `sort_order`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('9', 'maddy', 'maddy', NULL, NULL, '0', 'INACTIVE', '2026-10-07 00:03:11', '2026-10-07 00:03:06', '2026-10-07 00:03:11');

DROP TABLE IF EXISTS `category_subcategory`;
CREATE TABLE `category_subcategory` (
  `category_id` int unsigned NOT NULL,
  `subcategory_id` int unsigned NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`category_id`,`subcategory_id`),
  KEY `fk_category_subcategory_subcategory` (`subcategory_id`),
  CONSTRAINT `fk_category_subcategory_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_category_subcategory_subcategory` FOREIGN KEY (`subcategory_id`) REFERENCES `subcategories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `category_subcategory` (`category_id`, `subcategory_id`, `sort_order`) VALUES ('3', '1', '0');
INSERT INTO `category_subcategory` (`category_id`, `subcategory_id`, `sort_order`) VALUES ('3', '2', '0');
INSERT INTO `category_subcategory` (`category_id`, `subcategory_id`, `sort_order`) VALUES ('4', '1', '0');

DROP TABLE IF EXISTS `coupon_brands`;
CREATE TABLE `coupon_brands` (
  `coupon_id` bigint unsigned NOT NULL,
  `brand_id` int unsigned NOT NULL,
  PRIMARY KEY (`coupon_id`,`brand_id`),
  KEY `fk_coupon_brands_brand` (`brand_id`),
  CONSTRAINT `fk_coupon_brands_brand` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`),
  CONSTRAINT `fk_coupon_brands_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `coupon_categories`;
CREATE TABLE `coupon_categories` (
  `coupon_id` bigint unsigned NOT NULL,
  `category_id` int unsigned NOT NULL,
  PRIMARY KEY (`coupon_id`,`category_id`),
  KEY `fk_coupon_categories_category` (`category_id`),
  CONSTRAINT `fk_coupon_categories_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`),
  CONSTRAINT `fk_coupon_categories_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `coupon_customers`;
CREATE TABLE `coupon_customers` (
  `coupon_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`coupon_id`,`customer_id`),
  KEY `fk_coupon_customers_customer` (`customer_id`),
  CONSTRAINT `fk_coupon_customers_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_coupon_customers_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `coupon_products`;
CREATE TABLE `coupon_products` (
  `coupon_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`coupon_id`,`product_id`),
  KEY `fk_coupon_products_product` (`product_id`),
  CONSTRAINT `fk_coupon_products_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_coupon_products_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `coupon_usages`;
CREATE TABLE `coupon_usages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `coupon_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `order_id` bigint unsigned DEFAULT NULL,
  `discount_amount` decimal(15,2) NOT NULL,
  `used_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_coupon_usages_coupon` (`coupon_id`),
  KEY `idx_coupon_usages_customer` (`coupon_id`,`customer_id`),
  KEY `fk_coupon_usages_customer` (`customer_id`),
  KEY `fk_coupon_usages_order` (`order_id`),
  CONSTRAINT `fk_coupon_usages_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`),
  CONSTRAINT `fk_coupon_usages_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_coupon_usages_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `coupons`;
CREATE TABLE `coupons` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `discount_type` enum('PERCENTAGE','FIXED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `discount_value` decimal(15,2) NOT NULL,
  `max_discount_amount` decimal(15,2) DEFAULT NULL,
  `min_order_amount` decimal(15,2) DEFAULT NULL,
  `start_at` datetime DEFAULT NULL,
  `end_at` datetime DEFAULT NULL,
  `usage_limit` int unsigned DEFAULT NULL,
  `per_customer_usage_limit` int unsigned DEFAULT NULL,
  `first_order_only` tinyint(1) NOT NULL DEFAULT '0',
  `can_combine_with_product_offer` tinyint(1) NOT NULL DEFAULT '1',
  `can_combine_with_referral` tinyint(1) NOT NULL DEFAULT '0',
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_coupons_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `coupons` (`id`, `code`, `name`, `description`, `discount_type`, `discount_value`, `max_discount_amount`, `min_order_amount`, `start_at`, `end_at`, `usage_limit`, `per_customer_usage_limit`, `first_order_only`, `can_combine_with_product_offer`, `can_combine_with_referral`, `status`, `created_at`, `updated_at`) VALUES ('1', 'TEST10', 'Test Coupon', NULL, 'PERCENTAGE', '10.00', NULL, NULL, NULL, NULL, NULL, NULL, '0', '1', '0', 'ACTIVE', '2026-10-06 21:44:27', '2026-10-06 21:44:27');

DROP TABLE IF EXISTS `customer_addresses`;
CREATE TABLE `customer_addresses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `customer_id` bigint unsigned NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `line1` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `line2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city_district` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pincode` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_customer_addresses_customer` (`customer_id`),
  KEY `idx_customer_addresses_pincode` (`pincode`),
  CONSTRAINT `fk_customer_addresses_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `customer_price_list_items`;
CREATE TABLE `customer_price_list_items` (
  `price_list_id` bigint unsigned NOT NULL,
  `variant_id` bigint unsigned NOT NULL,
  `price` decimal(15,2) NOT NULL,
  PRIMARY KEY (`price_list_id`,`variant_id`),
  KEY `fk_customer_price_list_items_variant` (`variant_id`),
  CONSTRAINT `fk_customer_price_list_items_list` FOREIGN KEY (`price_list_id`) REFERENCES `customer_price_lists` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_customer_price_list_items_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `customer_price_lists`;
CREATE TABLE `customer_price_lists` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `customer_id` bigint unsigned NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_price_lists_customer` (`customer_id`),
  CONSTRAINT `fk_customer_price_lists_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `customers`;
CREATE TABLE `customers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_verified_at` datetime DEFAULT NULL,
  `email` varchar(190) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `google_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile_photo_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_type` enum('RETAIL','WHOLESALE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'RETAIL',
  `profile_completed` tinyint(1) NOT NULL DEFAULT '0',
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customers_phone` (`phone`),
  UNIQUE KEY `uq_customers_email` (`email`),
  UNIQUE KEY `uq_customers_google_id` (`google_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `customers` (`id`, `name`, `phone`, `phone_verified_at`, `email`, `password_hash`, `google_id`, `profile_photo_path`, `customer_type`, `profile_completed`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('1', 'Sample Customer', '9999999999', '2026-10-06 17:59:48', NULL, '$2y$10$iGDT65XjolGEOgvERtNu4.tM/bYxLJouLrGEHuAV7cZiqyR.M4sLK', NULL, NULL, 'RETAIL', '0', 'ACTIVE', NULL, '2026-10-06 17:59:48', '2026-10-06 17:59:48');

DROP TABLE IF EXISTS `deliveries`;
CREATE TABLE `deliveries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `provider` enum('MOCK','SHIPROCKET') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MOCK',
  `courier` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `awb` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tracking_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','FAILED','RETURNED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `expected_delivery_date` date DEFAULT NULL,
  `delivery_notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_deliveries_order` (`order_id`),
  KEY `idx_deliveries_status` (`status`),
  KEY `idx_deliveries_awb` (`awb`),
  CONSTRAINT `fk_deliveries_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `delivery_status_history`;
CREATE TABLE `delivery_status_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `delivery_id` bigint unsigned NOT NULL,
  `from_status` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` enum('ADMIN','SYSTEM','SHIPPING_WEBHOOK') COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_delivery_status_history_delivery` (`delivery_id`,`created_at`),
  CONSTRAINT `fk_delivery_status_history_delivery` FOREIGN KEY (`delivery_id`) REFERENCES `deliveries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `device_tokens`;
CREATE TABLE `device_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `owner_type` enum('USER','CUSTOMER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_id` bigint unsigned NOT NULL,
  `token` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `platform` enum('WEB','ANDROID','IOS') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WEB',
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_seen_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_device_tokens_token` (`token`),
  KEY `idx_device_tokens_owner` (`owner_type`,`owner_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `gst_rates`;
CREATE TABLE `gst_rates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `gst_percent` decimal(5,2) NOT NULL,
  `cgst_percent` decimal(5,2) NOT NULL,
  `sgst_percent` decimal(5,2) NOT NULL,
  `igst_percent` decimal(5,2) NOT NULL,
  `tax_mode` enum('INCLUSIVE','EXCLUSIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EXCLUSIVE',
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gst_rates_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `gst_rates` (`id`, `name`, `gst_percent`, `cgst_percent`, `sgst_percent`, `igst_percent`, `tax_mode`, `status`) VALUES ('1', 'GST 0%', '0.00', '0.00', '0.00', '0.00', 'EXCLUSIVE', 'ACTIVE');
INSERT INTO `gst_rates` (`id`, `name`, `gst_percent`, `cgst_percent`, `sgst_percent`, `igst_percent`, `tax_mode`, `status`) VALUES ('2', 'GST 5%', '5.00', '2.50', '2.50', '5.00', 'EXCLUSIVE', 'ACTIVE');
INSERT INTO `gst_rates` (`id`, `name`, `gst_percent`, `cgst_percent`, `sgst_percent`, `igst_percent`, `tax_mode`, `status`) VALUES ('3', 'GST 12%', '12.00', '6.00', '6.00', '12.00', 'EXCLUSIVE', 'ACTIVE');
INSERT INTO `gst_rates` (`id`, `name`, `gst_percent`, `cgst_percent`, `sgst_percent`, `igst_percent`, `tax_mode`, `status`) VALUES ('4', 'GST 18%', '18.00', '9.00', '9.00', '18.00', 'EXCLUSIVE', 'ACTIVE');
INSERT INTO `gst_rates` (`id`, `name`, `gst_percent`, `cgst_percent`, `sgst_percent`, `igst_percent`, `tax_mode`, `status`) VALUES ('6', 'GST 28%', '28.00', '14.00', '14.00', '28.00', 'EXCLUSIVE', 'ACTIVE');

DROP TABLE IF EXISTS `home_sections`;
CREATE TABLE `home_sections` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `type` enum('BANNER','CATEGORIES','BEST_SELLERS','NEW_ARRIVALS','FEATURED','COMBOS','DEALS','CUSTOM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item_limit` int unsigned NOT NULL DEFAULT '10',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `home_sections` (`id`, `type`, `title`, `image_path`, `item_limit`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES ('1', 'FEATURED', 'Featured Picks', NULL, '8', '1', '1', '2026-10-06 21:56:17', '2026-10-06 22:02:15');
INSERT INTO `home_sections` (`id`, `type`, `title`, `image_path`, `item_limit`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES ('2', 'BANNER', 'Top Banner', 'uploads/home-sections/2/d75009beadc888cd3646e4e09880e358.webp', '10', '0', '1', '2026-10-06 22:01:39', '2026-10-06 23:51:35');

DROP TABLE IF EXISTS `hsn_codes`;
CREATE TABLE `hsn_codes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_hsn_codes_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `hsn_codes` (`id`, `code`, `description`) VALUES ('2', '6109', 'T-shirts, knitted');

DROP TABLE IF EXISTS `inventory`;
CREATE TABLE `inventory` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `variant_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `on_hand` decimal(15,3) NOT NULL DEFAULT '0.000',
  `reserved` decimal(15,3) NOT NULL DEFAULT '0.000',
  `available` decimal(15,3) GENERATED ALWAYS AS ((`on_hand` - `reserved`)) STORED,
  `low_stock_threshold` decimal(15,3) NOT NULL DEFAULT '5.000',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_variant` (`variant_id`),
  KEY `idx_inventory_product` (`product_id`),
  CONSTRAINT `fk_inventory_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_inventory_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`),
  CONSTRAINT `chk_inventory_on_hand` CHECK ((`on_hand` >= 0)),
  CONSTRAINT `chk_inventory_reserved` CHECK ((`reserved` >= 0)),
  CONSTRAINT `chk_inventory_reserved_le_on_hand` CHECK ((`reserved` <= `on_hand`))
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `inventory` (`id`, `variant_id`, `product_id`, `on_hand`, `reserved`, `available`, `low_stock_threshold`, `updated_at`) VALUES ('1', '1', '1', '0.000', '0.000', '0.000', '5.000', '2026-10-06 21:03:48');
INSERT INTO `inventory` (`id`, `variant_id`, `product_id`, `on_hand`, `reserved`, `available`, `low_stock_threshold`, `updated_at`) VALUES ('2', '2', '1', '0.000', '0.000', '0.000', '5.000', '2026-10-06 21:03:48');
INSERT INTO `inventory` (`id`, `variant_id`, `product_id`, `on_hand`, `reserved`, `available`, `low_stock_threshold`, `updated_at`) VALUES ('3', '3', '1', '0.000', '0.000', '0.000', '5.000', '2026-10-06 21:03:48');
INSERT INTO `inventory` (`id`, `variant_id`, `product_id`, `on_hand`, `reserved`, `available`, `low_stock_threshold`, `updated_at`) VALUES ('4', '4', '1', '0.000', '0.000', '0.000', '5.000', '2026-10-06 21:03:48');
INSERT INTO `inventory` (`id`, `variant_id`, `product_id`, `on_hand`, `reserved`, `available`, `low_stock_threshold`, `updated_at`) VALUES ('5', '5', '2', '46.000', '0.000', '46.000', '10.000', '2026-10-06 23:10:23');
INSERT INTO `inventory` (`id`, `variant_id`, `product_id`, `on_hand`, `reserved`, `available`, `low_stock_threshold`, `updated_at`) VALUES ('10', '6', '4', '0.000', '0.000', '0.000', '5.000', '2026-10-06 22:50:11');
INSERT INTO `inventory` (`id`, `variant_id`, `product_id`, `on_hand`, `reserved`, `available`, `low_stock_threshold`, `updated_at`) VALUES ('11', '7', '5', '32.000', '0.000', '32.000', '8.000', '2026-10-06 22:59:34');
INSERT INTO `inventory` (`id`, `variant_id`, `product_id`, `on_hand`, `reserved`, `available`, `low_stock_threshold`, `updated_at`) VALUES ('14', '8', '6', '6.000', '0.000', '6.000', '5.000', '2026-10-06 23:11:09');
INSERT INTO `inventory` (`id`, `variant_id`, `product_id`, `on_hand`, `reserved`, `available`, `low_stock_threshold`, `updated_at`) VALUES ('20', '9', '6', '0.000', '0.000', '0.000', '5.000', '2026-10-06 23:17:57');
INSERT INTO `inventory` (`id`, `variant_id`, `product_id`, `on_hand`, `reserved`, `available`, `low_stock_threshold`, `updated_at`) VALUES ('21', '10', '6', '0.000', '0.000', '0.000', '5.000', '2026-10-06 23:17:59');

DROP TABLE IF EXISTS `inventory_movements`;
CREATE TABLE `inventory_movements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `variant_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `movement_type` enum('OPENING_STOCK','PURCHASE','PURCHASE_RETURN','SALE','SALE_RETURN','ORDER_RESERVE','ORDER_RESERVE_RELEASE','ORDER_CONFIRM','ORDER_CANCEL','INVOICE_CANCEL','STOCK_ADJUSTMENT_IN','STOCK_ADJUSTMENT_OUT','DAMAGE','EXPIRED_WRITE_OFF') COLLATE utf8mb4_unicode_ci NOT NULL,
  `on_hand_delta` decimal(15,3) NOT NULL DEFAULT '0.000',
  `reserved_delta` decimal(15,3) NOT NULL DEFAULT '0.000',
  `on_hand_before` decimal(15,3) NOT NULL,
  `on_hand_after` decimal(15,3) NOT NULL,
  `reserved_before` decimal(15,3) NOT NULL,
  `reserved_after` decimal(15,3) NOT NULL,
  `unit_cost` decimal(15,2) DEFAULT NULL,
  `reference_type` enum('INVOICE','ORDER','PURCHASE','SALES_RETURN','PURCHASE_RETURN','ADJUSTMENT','RESERVATION') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_id` bigint unsigned NOT NULL,
  `reference_item_id` bigint unsigned DEFAULT NULL,
  `channel` enum('POS','ECOMMERCE','ADMIN','SYSTEM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `user_id` bigint unsigned DEFAULT NULL,
  `idempotency_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_movements_idempotency` (`idempotency_key`),
  KEY `idx_inventory_movements_variant` (`variant_id`,`created_at`),
  KEY `idx_inventory_movements_reference` (`reference_type`,`reference_id`),
  KEY `idx_inventory_movements_type` (`movement_type`,`created_at`),
  KEY `fk_inventory_movements_product` (`product_id`),
  KEY `fk_inventory_movements_user` (`user_id`),
  CONSTRAINT `fk_inventory_movements_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_inventory_movements_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_inventory_movements_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `inventory_movements` (`id`, `variant_id`, `product_id`, `movement_type`, `on_hand_delta`, `reserved_delta`, `on_hand_before`, `on_hand_after`, `reserved_before`, `reserved_after`, `unit_cost`, `reference_type`, `reference_id`, `reference_item_id`, `channel`, `reason`, `note`, `user_id`, `idempotency_key`, `created_at`) VALUES ('1', '5', '2', 'STOCK_ADJUSTMENT_IN', '50.000', '0.000', '0.000', '50.000', '0.000', '0.000', NULL, 'ADJUSTMENT', '1', '0', 'ADMIN', 'Opening stock', NULL, '1', 'adjustment-1-5', '2026-10-06 21:15:30.807');
INSERT INTO `inventory_movements` (`id`, `variant_id`, `product_id`, `movement_type`, `on_hand_delta`, `reserved_delta`, `on_hand_before`, `on_hand_after`, `reserved_before`, `reserved_after`, `unit_cost`, `reference_type`, `reference_id`, `reference_item_id`, `channel`, `reason`, `note`, `user_id`, `idempotency_key`, `created_at`) VALUES ('2', '5', '2', 'PURCHASE', '1.000', '0.000', '50.000', '51.000', '0.000', '0.000', '150.00', 'PURCHASE', '1', NULL, 'ADMIN', NULL, NULL, '1', 'purchase-1-5', '2026-10-06 21:45:49.829');
INSERT INTO `inventory_movements` (`id`, `variant_id`, `product_id`, `movement_type`, `on_hand_delta`, `reserved_delta`, `on_hand_before`, `on_hand_after`, `reserved_before`, `reserved_after`, `unit_cost`, `reference_type`, `reference_id`, `reference_item_id`, `channel`, `reason`, `note`, `user_id`, `idempotency_key`, `created_at`) VALUES ('3', '5', '2', 'STOCK_ADJUSTMENT_OUT', '-6.000', '0.000', '51.000', '45.000', '0.000', '0.000', NULL, 'ADJUSTMENT', '2', '0', 'ADMIN', 'Damaged stock count', NULL, '1', 'adjustment-2-5', '2026-10-06 21:46:36.614');
INSERT INTO `inventory_movements` (`id`, `variant_id`, `product_id`, `movement_type`, `on_hand_delta`, `reserved_delta`, `on_hand_before`, `on_hand_after`, `reserved_before`, `reserved_after`, `unit_cost`, `reference_type`, `reference_id`, `reference_item_id`, `channel`, `reason`, `note`, `user_id`, `idempotency_key`, `created_at`) VALUES ('4', '7', '5', 'STOCK_ADJUSTMENT_IN', '30.000', '0.000', '0.000', '30.000', '0.000', '0.000', NULL, 'ADJUSTMENT', '3', '0', 'ADMIN', 'Opening stock', NULL, '1', 'adjustment-3-7', '2026-10-06 22:52:07.161');
INSERT INTO `inventory_movements` (`id`, `variant_id`, `product_id`, `movement_type`, `on_hand_delta`, `reserved_delta`, `on_hand_before`, `on_hand_after`, `reserved_before`, `reserved_after`, `unit_cost`, `reference_type`, `reference_id`, `reference_item_id`, `channel`, `reason`, `note`, `user_id`, `idempotency_key`, `created_at`) VALUES ('5', '5', '2', 'STOCK_ADJUSTMENT_IN', '3.000', '0.000', '45.000', '48.000', '0.000', '0.000', NULL, 'ADJUSTMENT', '4', '0', 'ADMIN', 'Card UI test', NULL, '1', 'adjustment-4-5', '2026-10-06 22:57:59.958');
INSERT INTO `inventory_movements` (`id`, `variant_id`, `product_id`, `movement_type`, `on_hand_delta`, `reserved_delta`, `on_hand_before`, `on_hand_after`, `reserved_before`, `reserved_after`, `unit_cost`, `reference_type`, `reference_id`, `reference_item_id`, `channel`, `reason`, `note`, `user_id`, `idempotency_key`, `created_at`) VALUES ('6', '7', '5', 'STOCK_ADJUSTMENT_IN', '2.000', '0.000', '30.000', '32.000', '0.000', '0.000', NULL, 'ADJUSTMENT', '5', '0', 'ADMIN', 'add', NULL, '1', 'adjustment-5-7', '2026-10-06 22:59:34.119');
INSERT INTO `inventory_movements` (`id`, `variant_id`, `product_id`, `movement_type`, `on_hand_delta`, `reserved_delta`, `on_hand_before`, `on_hand_after`, `reserved_before`, `reserved_after`, `unit_cost`, `reference_type`, `reference_id`, `reference_item_id`, `channel`, `reason`, `note`, `user_id`, `idempotency_key`, `created_at`) VALUES ('7', '8', '6', 'STOCK_ADJUSTMENT_IN', '5.000', '0.000', '0.000', '5.000', '0.000', '0.000', NULL, 'ADJUSTMENT', '6', '0', 'ADMIN', 'h', NULL, '1', 'adjustment-6-8', '2026-10-06 22:59:55.018');
INSERT INTO `inventory_movements` (`id`, `variant_id`, `product_id`, `movement_type`, `on_hand_delta`, `reserved_delta`, `on_hand_before`, `on_hand_after`, `reserved_before`, `reserved_after`, `unit_cost`, `reference_type`, `reference_id`, `reference_item_id`, `channel`, `reason`, `note`, `user_id`, `idempotency_key`, `created_at`) VALUES ('8', '5', '2', 'SALE', '-2.000', '0.000', '48.000', '46.000', '0.000', '0.000', NULL, 'INVOICE', '1', NULL, 'POS', NULL, NULL, '1', 'invoice-sale-1-5', '2026-10-06 23:10:23.130');
INSERT INTO `inventory_movements` (`id`, `variant_id`, `product_id`, `movement_type`, `on_hand_delta`, `reserved_delta`, `on_hand_before`, `on_hand_after`, `reserved_before`, `reserved_after`, `unit_cost`, `reference_type`, `reference_id`, `reference_item_id`, `channel`, `reason`, `note`, `user_id`, `idempotency_key`, `created_at`) VALUES ('9', '8', '6', 'PURCHASE', '1.000', '0.000', '5.000', '6.000', '0.000', '0.000', '12.00', 'PURCHASE', '2', NULL, 'ADMIN', NULL, NULL, '1', 'purchase-2-8', '2026-10-06 23:11:10.014');

DROP TABLE IF EXISTS `invoice_items`;
CREATE TABLE `invoice_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `invoice_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `variant_id` bigint unsigned NOT NULL,
  `product_name_snapshot` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `variant_label_snapshot` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sku_snapshot` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int unsigned NOT NULL,
  `mrp` decimal(15,2) NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `discount_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `tax_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `line_total` decimal(15,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invoice_items_invoice` (`invoice_id`),
  KEY `fk_invoice_items_product` (`product_id`),
  KEY `fk_invoice_items_variant` (`variant_id`),
  CONSTRAINT `fk_invoice_items_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invoice_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_invoice_items_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `invoice_items` (`id`, `invoice_id`, `product_id`, `variant_id`, `product_name_snapshot`, `variant_label_snapshot`, `sku_snapshot`, `quantity`, `mrp`, `unit_price`, `discount_amount`, `tax_amount`, `line_total`, `created_at`) VALUES ('1', '1', '2', '5', 'Coffee Mug', NULL, 'MUG-001', '2', '299.00', '249.00', '0.00', '89.64', '587.64', '2026-10-06 23:10:23');

DROP TABLE IF EXISTS `invoices`;
CREATE TABLE `invoices` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `invoice_no` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `active_invoice_no` varchar(30) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (if((`deleted_at` is null),`invoice_no`,NULL)) STORED,
  `channel` enum('POS','ECOMMERCE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `order_id` bigint unsigned DEFAULT NULL,
  `customer_id` bigint unsigned DEFAULT NULL,
  `cashier_user_id` bigint unsigned DEFAULT NULL,
  `subtotal` decimal(15,2) NOT NULL,
  `discount_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `tax_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `shipping_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `grand_total` decimal(15,2) NOT NULL,
  `payment_method` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount_paid` decimal(15,2) NOT NULL DEFAULT '0.00',
  `payment_status` enum('PAID','PARTIAL','UNPAID') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UNPAID',
  `status` enum('ACTIVE','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `cancelled_at` datetime DEFAULT NULL,
  `cancelled_by` bigint unsigned DEFAULT NULL,
  `cancellation_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoices_active_no` (`active_invoice_no`),
  KEY `idx_invoices_order` (`order_id`),
  KEY `idx_invoices_customer` (`customer_id`,`created_at`),
  KEY `idx_invoices_channel` (`channel`,`created_at`),
  KEY `fk_invoices_cashier` (`cashier_user_id`),
  KEY `fk_invoices_cancelled_by` (`cancelled_by`),
  KEY `fk_invoices_deleted_by` (`deleted_by`),
  CONSTRAINT `fk_invoices_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_invoices_cashier` FOREIGN KEY (`cashier_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_invoices_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_invoices_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_invoices_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `invoices` (`id`, `invoice_no`, `active_invoice_no`, `channel`, `order_id`, `customer_id`, `cashier_user_id`, `subtotal`, `discount_total`, `tax_total`, `shipping_total`, `grand_total`, `payment_method`, `amount_paid`, `payment_status`, `status`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `deleted_at`, `deleted_by`, `created_at`, `updated_at`) VALUES ('1', 'INV-1', 'INV-1', 'POS', NULL, NULL, '1', '498.00', '0.00', '89.64', '0.00', '587.64', 'CASH', '498.00', 'PARTIAL', 'ACTIVE', NULL, NULL, NULL, NULL, NULL, '2026-10-06 23:10:22', '2026-10-06 23:10:22');

DROP TABLE IF EXISTS `order_item_discounts`;
CREATE TABLE `order_item_discounts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_item_id` bigint unsigned NOT NULL,
  `discount_type` enum('COUPON','REFERRAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_order_item_discounts_item` (`order_item_id`),
  CONSTRAINT `fk_order_item_discounts_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `order_items`;
CREATE TABLE `order_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `variant_id` bigint unsigned NOT NULL,
  `product_name_snapshot` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `variant_label_snapshot` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sku_snapshot` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int unsigned NOT NULL,
  `mrp` decimal(15,2) NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `product_discount_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `tax_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `line_total` decimal(15,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order` (`order_id`),
  KEY `fk_order_items_product` (`product_id`),
  KEY `fk_order_items_variant` (`variant_id`),
  CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_order_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_order_items_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `order_status_history`;
CREATE TABLE `order_status_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `from_status` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `changed_by` bigint unsigned DEFAULT NULL,
  `source` enum('ADMIN','SYSTEM','SHIPPING_WEBHOOK','CUSTOMER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_status_history_order` (`order_id`,`created_at`),
  CONSTRAINT `fk_order_status_history_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_no` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `status` enum('PENDING','CONFIRMED','PROCESSING','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','RETURN_REQUESTED','RETURNED','REFUNDED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `payment_status` enum('PENDING','PAID','FAILED','PARTIALLY_REFUNDED','REFUNDED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `subtotal` decimal(15,2) NOT NULL,
  `product_discount_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `coupon_id` bigint unsigned DEFAULT NULL,
  `coupon_code` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `coupon_discount_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `referral_reward_id` bigint unsigned DEFAULT NULL,
  `referral_discount_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `tax_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `shipping_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `grand_total` decimal(15,2) NOT NULL,
  `shipping_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shipping_phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shipping_line1` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shipping_line2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shipping_city_district` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shipping_state` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shipping_pincode` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `placed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelled_at` datetime DEFAULT NULL,
  `cancellation_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_order_no` (`order_no`),
  KEY `idx_orders_customer` (`customer_id`,`created_at`),
  KEY `idx_orders_status` (`status`),
  KEY `fk_orders_coupon` (`coupon_id`),
  KEY `fk_orders_referral_reward` (`referral_reward_id`),
  CONSTRAINT `fk_orders_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`),
  CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_orders_referral_reward` FOREIGN KEY (`referral_reward_id`) REFERENCES `referral_rewards` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `otp_verifications`;
CREATE TABLE `otp_verifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purpose` enum('SIGNUP','LOGIN','RESET_PASSWORD') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SIGNUP',
  `status` enum('PENDING','VERIFIED','EXPIRED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `attempt_count` tinyint unsigned NOT NULL DEFAULT '0',
  `max_attempts` tinyint unsigned NOT NULL DEFAULT '5',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  `verified_at` datetime DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_otp_verifications_phone_status` (`phone`,`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `payment_methods`;
CREATE TABLE `payment_methods` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_methods_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `payment_methods` (`id`, `code`, `name`, `sort_order`, `is_active`, `created_at`) VALUES ('1', 'CASH', 'Cash', '1', '1', '2026-10-06 23:04:30');
INSERT INTO `payment_methods` (`id`, `code`, `name`, `sort_order`, `is_active`, `created_at`) VALUES ('2', 'UPI', 'UPI', '2', '1', '2026-10-06 23:04:30');
INSERT INTO `payment_methods` (`id`, `code`, `name`, `sort_order`, `is_active`, `created_at`) VALUES ('3', 'CARD', 'Card', '3', '1', '2026-10-06 23:04:30');
INSERT INTO `payment_methods` (`id`, `code`, `name`, `sort_order`, `is_active`, `created_at`) VALUES ('4', 'NETBANKING', 'Net Banking', '4', '1', '2026-10-06 23:04:30');
INSERT INTO `payment_methods` (`id`, `code`, `name`, `sort_order`, `is_active`, `created_at`) VALUES ('5', 'CREDIT', 'Credit', '5', '1', '2026-10-06 23:04:30');
INSERT INTO `payment_methods` (`id`, `code`, `name`, `sort_order`, `is_active`, `created_at`) VALUES ('6', 'GPAY', 'Google Pay', '6', '1', '2026-10-06 23:05:20');

DROP TABLE IF EXISTS `permissions`;
CREATE TABLE `permissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permissions_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('1', 'pos.sell', 'Create a POS sale / invoice');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('2', 'pos.discount.apply', 'Apply a permitted discount at POS');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('3', 'pos.coupon.apply', 'Apply a permitted coupon at POS');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('4', 'pos.payment.accept', 'Accept payment at POS');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('5', 'pos.invoice.print', 'Print an invoice');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('6', 'pos.returns.process', 'Process a permitted sales return');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('7', 'pos.sales.view', 'View permitted sales');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('8', 'catalog.manage', 'Create/edit products, variants, categories, brands');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('9', 'pricing.manage', 'Change pricing master, MRP, wholesale price');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('10', 'inventory.adjust', 'Create stock adjustments');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('11', 'inventory.view', 'View inventory and stock movement reports');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('12', 'customers.manage', 'Create/edit customers and addresses');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('13', 'suppliers.manage', 'Create/edit suppliers');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('14', 'purchases.manage', 'Create/edit purchases and GRNs');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('15', 'coupons.manage', 'Create/edit coupons and discounts');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('16', 'orders.manage', 'Edit order items/price/status, process refunds');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('17', 'delivery.manage', 'Manage delivery assignment and status');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('18', 'reports.financial.view', 'View P&L, expenses, income, unrestricted reports');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('19', 'settings.manage', 'Change system settings, referral settings, roles/permissions');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('20', 'users.manage', 'Create/edit staff users and role assignments');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('21', 'audit.view', 'View audit logs');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('22', 'banners.manage', 'Create/edit banners and home page sections');
INSERT INTO `permissions` (`id`, `code`, `description`) VALUES ('23', 'payment_methods.manage', 'Create/edit payment methods');

DROP TABLE IF EXISTS `product_categories`;
CREATE TABLE `product_categories` (
  `product_id` bigint unsigned NOT NULL,
  `category_id` int unsigned NOT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `primary_flag` bigint unsigned GENERATED ALWAYS AS (if((`is_primary` = 1),`product_id`,NULL)) STORED,
  PRIMARY KEY (`product_id`,`category_id`),
  UNIQUE KEY `uq_product_categories_primary` (`primary_flag`),
  KEY `fk_product_categories_category` (`category_id`),
  CONSTRAINT `fk_product_categories_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`),
  CONSTRAINT `fk_product_categories_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `product_categories` (`product_id`, `category_id`, `is_primary`, `primary_flag`) VALUES ('1', '4', '1', '1');
INSERT INTO `product_categories` (`product_id`, `category_id`, `is_primary`, `primary_flag`) VALUES ('2', '3', '1', '2');
INSERT INTO `product_categories` (`product_id`, `category_id`, `is_primary`, `primary_flag`) VALUES ('3', '3', '1', '3');
INSERT INTO `product_categories` (`product_id`, `category_id`, `is_primary`, `primary_flag`) VALUES ('4', '3', '1', '4');
INSERT INTO `product_categories` (`product_id`, `category_id`, `is_primary`, `primary_flag`) VALUES ('5', '1', '1', '5');
INSERT INTO `product_categories` (`product_id`, `category_id`, `is_primary`, `primary_flag`) VALUES ('6', '3', '1', '6');

DROP TABLE IF EXISTS `product_images`;
CREATE TABLE `product_images` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `thumb_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_product_images_product` (`product_id`,`sort_order`),
  CONSTRAINT `fk_product_images_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `product_images` (`id`, `product_id`, `image_path`, `thumb_path`, `sort_order`, `is_primary`, `created_at`) VALUES ('1', '1', 'uploads/products/1/7422f9e573f5b67fb7e04957616237ae.webp', 'uploads/products/1/7422f9e573f5b67fb7e04957616237ae-thumb.webp', '0', '1', '2026-10-06 21:04:44');
INSERT INTO `product_images` (`id`, `product_id`, `image_path`, `thumb_path`, `sort_order`, `is_primary`, `created_at`) VALUES ('3', '4', 'uploads/products/4/d8ba7f6aa66c612ab4255a76cf23e11d.webp', 'uploads/products/4/d8ba7f6aa66c612ab4255a76cf23e11d-thumb.webp', '0', '1', '2026-10-06 22:50:12');
INSERT INTO `product_images` (`id`, `product_id`, `image_path`, `thumb_path`, `sort_order`, `is_primary`, `created_at`) VALUES ('4', '6', 'uploads/products/6/332478839fb0735b73007cc7375e254c.webp', 'uploads/products/6/332478839fb0735b73007cc7375e254c-thumb.webp', '0', '1', '2026-10-06 22:56:44');

DROP TABLE IF EXISTS `product_specifications`;
CREATE TABLE `product_specifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_product_specifications_product` (`product_id`,`sort_order`),
  CONSTRAINT `fk_product_specifications_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `product_specifications` (`id`, `product_id`, `name`, `value`, `sort_order`) VALUES ('1', '1', 'Material', '100% Cotton', '0');
INSERT INTO `product_specifications` (`id`, `product_id`, `name`, `value`, `sort_order`) VALUES ('2', '1', 'Fit', 'Regular', '1');

DROP TABLE IF EXISTS `product_stats`;
CREATE TABLE `product_stats` (
  `product_id` bigint unsigned NOT NULL,
  `units_sold_30d` int unsigned NOT NULL DEFAULT '0',
  `orders_30d` int unsigned NOT NULL DEFAULT '0',
  `wishlist_count` int unsigned NOT NULL DEFAULT '0',
  `view_count` int unsigned NOT NULL DEFAULT '0',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_id`),
  CONSTRAINT `fk_product_stats_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_subcategories`;
CREATE TABLE `product_subcategories` (
  `product_id` bigint unsigned NOT NULL,
  `subcategory_id` int unsigned NOT NULL,
  PRIMARY KEY (`product_id`,`subcategory_id`),
  KEY `fk_product_subcategories_subcategory` (`subcategory_id`),
  CONSTRAINT `fk_product_subcategories_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_product_subcategories_subcategory` FOREIGN KEY (`subcategory_id`) REFERENCES `subcategories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_variant_values`;
CREATE TABLE `product_variant_values` (
  `variant_id` bigint unsigned NOT NULL,
  `attribute_value_id` int unsigned NOT NULL,
  PRIMARY KEY (`variant_id`,`attribute_value_id`),
  KEY `fk_product_variant_values_value` (`attribute_value_id`),
  CONSTRAINT `fk_product_variant_values_value` FOREIGN KEY (`attribute_value_id`) REFERENCES `variant_attribute_values` (`id`),
  CONSTRAINT `fk_product_variant_values_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('1', '1');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('2', '1');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('6', '1');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('8', '1');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('3', '2');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('4', '2');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('1', '3');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('3', '3');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('6', '3');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('8', '3');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('9', '3');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('2', '4');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('4', '4');
INSERT INTO `product_variant_values` (`variant_id`, `attribute_value_id`) VALUES ('10', '4');

DROP TABLE IF EXISTS `product_variants`;
CREATE TABLE `product_variants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `sku` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `barcode` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mrp` decimal(15,2) NOT NULL,
  `retail_price` decimal(15,2) NOT NULL,
  `wholesale_price` decimal(15,2) DEFAULT NULL,
  `purchase_price` decimal(15,2) DEFAULT NULL,
  `min_selling_price` decimal(15,2) DEFAULT NULL,
  `weight_grams` decimal(10,2) DEFAULT NULL,
  `hsn_code_id` int unsigned DEFAULT NULL,
  `gst_rate_id` int unsigned DEFAULT NULL,
  `manufacturing_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `variant_description` text COLLATE utf8mb4_unicode_ci,
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_product_variants_sku` (`sku`),
  UNIQUE KEY `uq_product_variants_barcode` (`barcode`),
  KEY `idx_product_variants_product` (`product_id`),
  KEY `fk_product_variants_hsn` (`hsn_code_id`),
  KEY `fk_product_variants_gst` (`gst_rate_id`),
  CONSTRAINT `fk_product_variants_gst` FOREIGN KEY (`gst_rate_id`) REFERENCES `gst_rates` (`id`),
  CONSTRAINT `fk_product_variants_hsn` FOREIGN KEY (`hsn_code_id`) REFERENCES `hsn_codes` (`id`),
  CONSTRAINT `fk_product_variants_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_product_variants_prices` CHECK (((`mrp` >= 0) and (`retail_price` >= 0)))
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `product_variants` (`id`, `product_id`, `sku`, `barcode`, `mrp`, `retail_price`, `wholesale_price`, `purchase_price`, `min_selling_price`, `weight_grams`, `hsn_code_id`, `gst_rate_id`, `manufacturing_date`, `expiry_date`, `variant_description`, `is_default`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('1', '1', 'TSH-BLU-L', NULL, '999.00', '799.00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', 'ACTIVE', NULL, '2026-10-06 21:03:48', '2026-10-06 21:03:48');
INSERT INTO `product_variants` (`id`, `product_id`, `sku`, `barcode`, `mrp`, `retail_price`, `wholesale_price`, `purchase_price`, `min_selling_price`, `weight_grams`, `hsn_code_id`, `gst_rate_id`, `manufacturing_date`, `expiry_date`, `variant_description`, `is_default`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('2', '1', 'TSH-BLU-XL', NULL, '999.00', '799.00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', 'ACTIVE', NULL, '2026-10-06 21:03:48', '2026-10-06 21:03:48');
INSERT INTO `product_variants` (`id`, `product_id`, `sku`, `barcode`, `mrp`, `retail_price`, `wholesale_price`, `purchase_price`, `min_selling_price`, `weight_grams`, `hsn_code_id`, `gst_rate_id`, `manufacturing_date`, `expiry_date`, `variant_description`, `is_default`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('3', '1', 'TSH-ORA-L', NULL, '999.00', '799.00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', 'ACTIVE', NULL, '2026-10-06 21:03:48', '2026-10-06 21:03:48');
INSERT INTO `product_variants` (`id`, `product_id`, `sku`, `barcode`, `mrp`, `retail_price`, `wholesale_price`, `purchase_price`, `min_selling_price`, `weight_grams`, `hsn_code_id`, `gst_rate_id`, `manufacturing_date`, `expiry_date`, `variant_description`, `is_default`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('4', '1', 'TSH-ORA-XL', NULL, '999.00', '799.00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', 'ACTIVE', NULL, '2026-10-06 21:03:48', '2026-10-06 21:03:48');
INSERT INTO `product_variants` (`id`, `product_id`, `sku`, `barcode`, `mrp`, `retail_price`, `wholesale_price`, `purchase_price`, `min_selling_price`, `weight_grams`, `hsn_code_id`, `gst_rate_id`, `manufacturing_date`, `expiry_date`, `variant_description`, `is_default`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('5', '2', 'MUG-001', NULL, '299.00', '249.00', NULL, NULL, NULL, NULL, NULL, '4', NULL, NULL, NULL, '1', 'ACTIVE', NULL, '2026-10-06 21:15:29', '2026-10-06 21:15:29');
INSERT INTO `product_variants` (`id`, `product_id`, `sku`, `barcode`, `mrp`, `retail_price`, `wholesale_price`, `purchase_price`, `min_selling_price`, `weight_grams`, `hsn_code_id`, `gst_rate_id`, `manufacturing_date`, `expiry_date`, `variant_description`, `is_default`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('6', '4', 'HOOD-BLU-L', NULL, '1499.00', '1299.00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', 'ACTIVE', NULL, '2026-10-06 22:50:11', '2026-10-06 22:50:11');
INSERT INTO `product_variants` (`id`, `product_id`, `sku`, `barcode`, `mrp`, `retail_price`, `wholesale_price`, `purchase_price`, `min_selling_price`, `weight_grams`, `hsn_code_id`, `gst_rate_id`, `manufacturing_date`, `expiry_date`, `variant_description`, `is_default`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('7', '5', 'PLATE-001', NULL, '299.00', '249.00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '1', 'ACTIVE', NULL, '2026-10-06 22:52:06', '2026-10-06 22:52:06');
INSERT INTO `product_variants` (`id`, `product_id`, `sku`, `barcode`, `mrp`, `retail_price`, `wholesale_price`, `purchase_price`, `min_selling_price`, `weight_grams`, `hsn_code_id`, `gst_rate_id`, `manufacturing_date`, `expiry_date`, `variant_description`, `is_default`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('8', '6', 'COCOCO-BLU-L', NULL, '10.00', '12.00', NULL, '12.00', NULL, NULL, '2', '2', NULL, NULL, NULL, '0', 'ACTIVE', NULL, '2026-10-06 22:56:39', '2026-10-06 22:56:39');
INSERT INTO `product_variants` (`id`, `product_id`, `sku`, `barcode`, `mrp`, `retail_price`, `wholesale_price`, `purchase_price`, `min_selling_price`, `weight_grams`, `hsn_code_id`, `gst_rate_id`, `manufacturing_date`, `expiry_date`, `variant_description`, `is_default`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('9', '6', 'COCOCO-L', NULL, '0.00', '0.00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', 'ACTIVE', NULL, '2026-10-06 23:17:57', '2026-10-06 23:17:57');
INSERT INTO `product_variants` (`id`, `product_id`, `sku`, `barcode`, `mrp`, `retail_price`, `wholesale_price`, `purchase_price`, `min_selling_price`, `weight_grams`, `hsn_code_id`, `gst_rate_id`, `manufacturing_date`, `expiry_date`, `variant_description`, `is_default`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('10', '6', 'COCOCO-XL', NULL, '0.00', '0.00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', 'ACTIVE', NULL, '2026-10-06 23:17:59', '2026-10-06 23:17:59');

DROP TABLE IF EXISTS `products`;
CREATE TABLE `products` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(280) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brand_id` int unsigned DEFAULT NULL,
  `unit_id` int unsigned DEFAULT NULL,
  `hsn_code_id` int unsigned DEFAULT NULL,
  `gst_rate_id` int unsigned DEFAULT NULL,
  `short_description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `bullet_points` json DEFAULT NULL,
  `material` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `length_cm` decimal(10,2) DEFAULT NULL,
  `width_cm` decimal(10,2) DEFAULT NULL,
  `height_cm` decimal(10,2) DEFAULT NULL,
  `weight_grams` decimal(10,2) DEFAULT NULL,
  `manufacturer` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country_of_origin` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `manufacturing_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `expiry_applicable` tinyint(1) NOT NULL DEFAULT '0',
  `warranty_applicable` tinyint(1) NOT NULL DEFAULT '0',
  `warranty_period` int unsigned DEFAULT NULL,
  `warranty_unit` enum('DAYS','MONTHS','YEARS') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `warranty_description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `returnable` tinyint(1) NOT NULL DEFAULT '1',
  `return_window_days` int unsigned DEFAULT NULL,
  `replacement_available` tinyint(1) NOT NULL DEFAULT '0',
  `refund_available` tinyint(1) NOT NULL DEFAULT '1',
  `shipping_required` tinyint(1) NOT NULL DEFAULT '1',
  `cod_available` tinyint(1) NOT NULL DEFAULT '1',
  `tags` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `seo_keywords` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `og_image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_pos_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `is_ecommerce_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `is_trending` tinyint(1) NOT NULL DEFAULT '0',
  `is_deal` tinyint(1) NOT NULL DEFAULT '0',
  `show_discount` tinyint(1) NOT NULL DEFAULT '1',
  `is_best_seller_override` tinyint(1) DEFAULT NULL,
  `is_new_arrival_override` tinyint(1) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_slug` (`slug`),
  UNIQUE KEY `uq_products_product_code` (`product_code`),
  KEY `fk_products_brand` (`brand_id`),
  KEY `fk_products_unit` (`unit_id`),
  KEY `fk_products_hsn` (`hsn_code_id`),
  KEY `fk_products_gst` (`gst_rate_id`),
  FULLTEXT KEY `ft_products_search` (`name`,`tags`,`short_description`),
  CONSTRAINT `fk_products_brand` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`),
  CONSTRAINT `fk_products_gst` FOREIGN KEY (`gst_rate_id`) REFERENCES `gst_rates` (`id`),
  CONSTRAINT `fk_products_hsn` FOREIGN KEY (`hsn_code_id`) REFERENCES `hsn_codes` (`id`),
  CONSTRAINT `fk_products_unit` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `products` (`id`, `name`, `slug`, `product_code`, `brand_id`, `unit_id`, `hsn_code_id`, `gst_rate_id`, `short_description`, `description`, `bullet_points`, `material`, `length_cm`, `width_cm`, `height_cm`, `weight_grams`, `manufacturer`, `country_of_origin`, `manufacturing_date`, `expiry_date`, `expiry_applicable`, `warranty_applicable`, `warranty_period`, `warranty_unit`, `warranty_description`, `returnable`, `return_window_days`, `replacement_available`, `refund_available`, `shipping_required`, `cod_available`, `tags`, `meta_title`, `meta_description`, `seo_keywords`, `og_image_path`, `is_active`, `is_pos_enabled`, `is_ecommerce_enabled`, `is_featured`, `is_trending`, `is_deal`, `show_discount`, `is_best_seller_override`, `is_new_arrival_override`, `deleted_at`, `created_at`, `updated_at`) VALUES ('1', 'Cotton T-Shirt', 'cotton-t-shirt', 'TSH', NULL, NULL, NULL, NULL, NULL, NULL, '[\"Premium cotton\", \"Breathable fabric\", \"Machine washable\"]', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '0', NULL, NULL, NULL, '1', '7', '0', '1', '1', '1', 'tshirt cotton casual', NULL, NULL, NULL, NULL, '1', '1', '1', '0', '1', '0', '1', NULL, NULL, '2026-10-07 00:03:51', '2026-10-06 21:03:21', '2026-10-07 00:03:51');
INSERT INTO `products` (`id`, `name`, `slug`, `product_code`, `brand_id`, `unit_id`, `hsn_code_id`, `gst_rate_id`, `short_description`, `description`, `bullet_points`, `material`, `length_cm`, `width_cm`, `height_cm`, `weight_grams`, `manufacturer`, `country_of_origin`, `manufacturing_date`, `expiry_date`, `expiry_applicable`, `warranty_applicable`, `warranty_period`, `warranty_unit`, `warranty_description`, `returnable`, `return_window_days`, `replacement_available`, `refund_available`, `shipping_required`, `cod_available`, `tags`, `meta_title`, `meta_description`, `seo_keywords`, `og_image_path`, `is_active`, `is_pos_enabled`, `is_ecommerce_enabled`, `is_featured`, `is_trending`, `is_deal`, `show_discount`, `is_best_seller_override`, `is_new_arrival_override`, `deleted_at`, `created_at`, `updated_at`) VALUES ('2', 'Coffee Mug', 'coffee-mug', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"Ceramic, dishwasher safe\"]', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '0', NULL, NULL, NULL, '1', NULL, '0', '1', '1', '1', NULL, NULL, NULL, NULL, NULL, '1', '1', '1', '0', '0', '0', '1', NULL, NULL, NULL, '2026-10-06 21:15:28', '2026-10-06 21:15:28');
INSERT INTO `products` (`id`, `name`, `slug`, `product_code`, `brand_id`, `unit_id`, `hsn_code_id`, `gst_rate_id`, `short_description`, `description`, `bullet_points`, `material`, `length_cm`, `width_cm`, `height_cm`, `weight_grams`, `manufacturer`, `country_of_origin`, `manufacturing_date`, `expiry_date`, `expiry_applicable`, `warranty_applicable`, `warranty_period`, `warranty_unit`, `warranty_description`, `returnable`, `return_window_days`, `replacement_available`, `refund_available`, `shipping_required`, `cod_available`, `tags`, `meta_title`, `meta_description`, `seo_keywords`, `og_image_path`, `is_active`, `is_pos_enabled`, `is_ecommerce_enabled`, `is_featured`, `is_trending`, `is_deal`, `show_discount`, `is_best_seller_override`, `is_new_arrival_override`, `deleted_at`, `created_at`, `updated_at`) VALUES ('3', 'Test Steel Bottle', 'test-steel-bottle', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '8.00', '8.00', '25.00', '450.00', NULL, NULL, NULL, NULL, '0', '0', NULL, NULL, NULL, '1', NULL, '0', '1', '1', '0', NULL, 'Steel Bottle', 'A nice bottle', NULL, NULL, '1', '1', '1', '1', '0', '0', '1', NULL, NULL, NULL, '2026-10-06 22:44:08', '2026-10-06 22:44:08');
INSERT INTO `products` (`id`, `name`, `slug`, `product_code`, `brand_id`, `unit_id`, `hsn_code_id`, `gst_rate_id`, `short_description`, `description`, `bullet_points`, `material`, `length_cm`, `width_cm`, `height_cm`, `weight_grams`, `manufacturer`, `country_of_origin`, `manufacturing_date`, `expiry_date`, `expiry_applicable`, `warranty_applicable`, `warranty_period`, `warranty_unit`, `warranty_description`, `returnable`, `return_window_days`, `replacement_available`, `refund_available`, `shipping_required`, `cod_available`, `tags`, `meta_title`, `meta_description`, `seo_keywords`, `og_image_path`, `is_active`, `is_pos_enabled`, `is_ecommerce_enabled`, `is_featured`, `is_trending`, `is_deal`, `show_discount`, `is_best_seller_override`, `is_new_arrival_override`, `deleted_at`, `created_at`, `updated_at`) VALUES ('4', 'Cozy Hoodie', 'cozy-hoodie', 'HOOD', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '0', NULL, NULL, NULL, '1', NULL, '0', '1', '1', '1', NULL, NULL, NULL, NULL, NULL, '1', '1', '1', '0', '0', '0', '1', NULL, NULL, NULL, '2026-10-06 22:50:10', '2026-10-06 22:50:10');
INSERT INTO `products` (`id`, `name`, `slug`, `product_code`, `brand_id`, `unit_id`, `hsn_code_id`, `gst_rate_id`, `short_description`, `description`, `bullet_points`, `material`, `length_cm`, `width_cm`, `height_cm`, `weight_grams`, `manufacturer`, `country_of_origin`, `manufacturing_date`, `expiry_date`, `expiry_applicable`, `warranty_applicable`, `warranty_period`, `warranty_unit`, `warranty_description`, `returnable`, `return_window_days`, `replacement_available`, `refund_available`, `shipping_required`, `cod_available`, `tags`, `meta_title`, `meta_description`, `seo_keywords`, `og_image_path`, `is_active`, `is_pos_enabled`, `is_ecommerce_enabled`, `is_featured`, `is_trending`, `is_deal`, `show_discount`, `is_best_seller_override`, `is_new_arrival_override`, `deleted_at`, `created_at`, `updated_at`) VALUES ('5', 'Ceramic Plate', 'ceramic-plate', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '0', NULL, NULL, NULL, '1', NULL, '0', '1', '1', '1', NULL, NULL, NULL, NULL, NULL, '1', '1', '1', '0', '0', '0', '1', NULL, NULL, NULL, '2026-10-06 22:52:05', '2026-10-06 22:52:05');
INSERT INTO `products` (`id`, `name`, `slug`, `product_code`, `brand_id`, `unit_id`, `hsn_code_id`, `gst_rate_id`, `short_description`, `description`, `bullet_points`, `material`, `length_cm`, `width_cm`, `height_cm`, `weight_grams`, `manufacturer`, `country_of_origin`, `manufacturing_date`, `expiry_date`, `expiry_applicable`, `warranty_applicable`, `warranty_period`, `warranty_unit`, `warranty_description`, `returnable`, `return_window_days`, `replacement_available`, `refund_available`, `shipping_required`, `cod_available`, `tags`, `meta_title`, `meta_description`, `seo_keywords`, `og_image_path`, `is_active`, `is_pos_enabled`, `is_ecommerce_enabled`, `is_featured`, `is_trending`, `is_deal`, `show_discount`, `is_best_seller_override`, `is_new_arrival_override`, `deleted_at`, `created_at`, `updated_at`) VALUES ('6', 'coco cola', 'coco-cola', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '0', NULL, NULL, NULL, '1', NULL, '0', '1', '1', '1', NULL, NULL, NULL, NULL, NULL, '1', '1', '1', '0', '0', '0', '1', NULL, NULL, NULL, '2026-10-06 22:56:39', '2026-10-06 22:56:39');

DROP TABLE IF EXISTS `purchase_items`;
CREATE TABLE `purchase_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `purchase_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `variant_id` bigint unsigned NOT NULL,
  `sku_snapshot` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(15,3) NOT NULL,
  `returned_quantity` decimal(15,3) NOT NULL DEFAULT '0.000',
  `unit_cost` decimal(15,2) NOT NULL,
  `mrp` decimal(15,2) DEFAULT NULL,
  `discount_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `tax_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `line_total` decimal(15,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_purchase_items_purchase` (`purchase_id`),
  KEY `fk_purchase_items_product` (`product_id`),
  KEY `fk_purchase_items_variant` (`variant_id`),
  CONSTRAINT `fk_purchase_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_purchase_items_purchase` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_purchase_items_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`),
  CONSTRAINT `chk_purchase_items_returned` CHECK ((`returned_quantity` <= `quantity`))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `purchase_items` (`id`, `purchase_id`, `product_id`, `variant_id`, `sku_snapshot`, `quantity`, `returned_quantity`, `unit_cost`, `mrp`, `discount_amount`, `tax_amount`, `line_total`) VALUES ('1', '1', '2', '5', 'MUG-001', '1.000', '0.000', '150.00', NULL, '0.00', '27.00', '177.00');
INSERT INTO `purchase_items` (`id`, `purchase_id`, `product_id`, `variant_id`, `sku_snapshot`, `quantity`, `returned_quantity`, `unit_cost`, `mrp`, `discount_amount`, `tax_amount`, `line_total`) VALUES ('2', '2', '6', '8', 'COCOCO-BLU-L', '1.000', '0.000', '12.00', NULL, '0.00', '0.60', '12.60');

DROP TABLE IF EXISTS `purchase_return_items`;
CREATE TABLE `purchase_return_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `purchase_return_id` bigint unsigned NOT NULL,
  `purchase_item_id` bigint unsigned NOT NULL,
  `variant_id` bigint unsigned NOT NULL,
  `quantity` decimal(15,3) NOT NULL,
  `unit_cost` decimal(15,2) NOT NULL,
  `line_total` decimal(15,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_purchase_return_items_return` (`purchase_return_id`),
  KEY `fk_purchase_return_items_item` (`purchase_item_id`),
  KEY `fk_purchase_return_items_variant` (`variant_id`),
  CONSTRAINT `fk_purchase_return_items_item` FOREIGN KEY (`purchase_item_id`) REFERENCES `purchase_items` (`id`),
  CONSTRAINT `fk_purchase_return_items_return` FOREIGN KEY (`purchase_return_id`) REFERENCES `purchase_returns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_purchase_return_items_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `purchase_returns`;
CREATE TABLE `purchase_returns` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `purchase_return_no` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purchase_id` bigint unsigned NOT NULL,
  `supplier_id` bigint unsigned NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `grand_total` decimal(15,2) NOT NULL,
  `created_by` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_purchase_returns_no` (`purchase_return_no`),
  KEY `idx_purchase_returns_purchase` (`purchase_id`),
  KEY `fk_purchase_returns_supplier` (`supplier_id`),
  KEY `fk_purchase_returns_created_by` (`created_by`),
  CONSTRAINT `fk_purchase_returns_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_purchase_returns_purchase` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`id`),
  CONSTRAINT `fk_purchase_returns_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `purchases`;
CREATE TABLE `purchases` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `purchase_no` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplier_id` bigint unsigned NOT NULL,
  `status` enum('ACTIVE','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `subtotal` decimal(15,2) NOT NULL,
  `tax_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `grand_total` decimal(15,2) NOT NULL,
  `amount_paid` decimal(15,2) NOT NULL DEFAULT '0.00',
  `payment_method` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_status` enum('PAID','PARTIAL','UNPAID') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UNPAID',
  `purchase_date` date NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned NOT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `cancelled_by` bigint unsigned DEFAULT NULL,
  `cancellation_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_purchases_no` (`purchase_no`),
  KEY `idx_purchases_supplier` (`supplier_id`,`created_at`),
  KEY `fk_purchases_created_by` (`created_by`),
  KEY `fk_purchases_cancelled_by` (`cancelled_by`),
  CONSTRAINT `fk_purchases_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_purchases_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_purchases_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `purchases` (`id`, `purchase_no`, `supplier_id`, `status`, `subtotal`, `tax_total`, `grand_total`, `amount_paid`, `payment_method`, `payment_status`, `purchase_date`, `notes`, `created_by`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `created_at`, `updated_at`) VALUES ('1', 'PUR-20261006-9149', '1', 'ACTIVE', '150.00', '27.00', '177.00', '0.00', NULL, 'UNPAID', '2026-10-06', NULL, '1', NULL, NULL, NULL, '2026-10-06 21:45:49', '2026-10-06 21:45:49');
INSERT INTO `purchases` (`id`, `purchase_no`, `supplier_id`, `status`, `subtotal`, `tax_total`, `grand_total`, `amount_paid`, `payment_method`, `payment_status`, `purchase_date`, `notes`, `created_by`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `created_at`, `updated_at`) VALUES ('2', 'PUR-20261006-9268', '1', 'ACTIVE', '12.00', '0.60', '12.60', '200.00', NULL, 'PAID', '2026-10-06', NULL, '1', NULL, NULL, NULL, '2026-10-06 23:11:09', '2026-10-06 23:11:09');

DROP TABLE IF EXISTS `referral_codes`;
CREATE TABLE `referral_codes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `customer_id` bigint unsigned NOT NULL,
  `code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_referral_codes_customer` (`customer_id`),
  UNIQUE KEY `uq_referral_codes_code` (`code`),
  CONSTRAINT `fk_referral_codes_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `referral_codes` (`id`, `customer_id`, `code`, `created_at`) VALUES ('1', '1', 'SAMPLE10', '2026-10-06 17:59:48');

DROP TABLE IF EXISTS `referral_rewards`;
CREATE TABLE `referral_rewards` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `referral_id` bigint unsigned NOT NULL,
  `beneficiary_customer_id` bigint unsigned NOT NULL,
  `reward_side` enum('REFERRER','REFERRED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `discount_percent` decimal(5,2) NOT NULL,
  `discount_amount` decimal(15,2) DEFAULT NULL,
  `status` enum('PENDING','ELIGIBLE','APPLIED','CANCELLED','EXPIRED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `trigger_event` enum('SIGNUP','FIRST_ORDER','FIRST_DELIVERED_ORDER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `applied_order_id` bigint unsigned DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_referral_rewards_side` (`referral_id`,`reward_side`),
  KEY `idx_referral_rewards_beneficiary` (`beneficiary_customer_id`,`status`),
  CONSTRAINT `fk_referral_rewards_beneficiary` FOREIGN KEY (`beneficiary_customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_referral_rewards_referral` FOREIGN KEY (`referral_id`) REFERENCES `referrals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `referral_settings`;
CREATE TABLE `referral_settings` (
  `id` tinyint unsigned NOT NULL DEFAULT '1',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `referrer_discount_percent` decimal(5,2) NOT NULL DEFAULT '0.00',
  `referred_discount_percent` decimal(5,2) NOT NULL DEFAULT '0.00',
  `max_discount_amount` decimal(15,2) DEFAULT NULL,
  `min_order_amount` decimal(15,2) DEFAULT NULL,
  `first_order_only` tinyint(1) NOT NULL DEFAULT '1',
  `reward_trigger` enum('SIGNUP','FIRST_ORDER','FIRST_DELIVERED_ORDER') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FIRST_DELIVERED_ORDER',
  `referral_validity_days` int unsigned DEFAULT NULL,
  `referral_code_prefix` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_referral_settings_singleton` CHECK ((`id` = 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `referral_settings` (`id`, `is_enabled`, `referrer_discount_percent`, `referred_discount_percent`, `max_discount_amount`, `min_order_amount`, `first_order_only`, `reward_trigger`, `referral_validity_days`, `referral_code_prefix`, `updated_at`) VALUES ('1', '0', '0.00', '0.00', NULL, NULL, '1', 'FIRST_DELIVERED_ORDER', NULL, NULL, '2026-10-06 17:59:44');

DROP TABLE IF EXISTS `referrals`;
CREATE TABLE `referrals` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `referrer_customer_id` bigint unsigned NOT NULL,
  `referred_customer_id` bigint unsigned NOT NULL,
  `referral_code_id` bigint unsigned NOT NULL,
  `status` enum('PENDING','ELIGIBLE','APPLIED','CANCELLED','EXPIRED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_referrals_referred` (`referred_customer_id`),
  KEY `idx_referrals_referrer` (`referrer_customer_id`,`status`),
  KEY `fk_referrals_code` (`referral_code_id`),
  CONSTRAINT `fk_referrals_code` FOREIGN KEY (`referral_code_id`) REFERENCES `referral_codes` (`id`),
  CONSTRAINT `fk_referrals_referred` FOREIGN KEY (`referred_customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_referrals_referrer` FOREIGN KEY (`referrer_customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `refund_transactions`;
CREATE TABLE `refund_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `refund_id` bigint unsigned NOT NULL,
  `from_status` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `gateway_response` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_refund_transactions_refund` (`refund_id`,`created_at`),
  CONSTRAINT `fk_refund_transactions_refund` FOREIGN KEY (`refund_id`) REFERENCES `refunds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `refunds`;
CREATE TABLE `refunds` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `refund_no` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `order_id` bigint unsigned DEFAULT NULL,
  `invoice_id` bigint unsigned DEFAULT NULL,
  `customer_id` bigint unsigned DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` enum('CASH','UPI','CARD','NETBANKING','RAZORPAY','STORE_CREDIT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `gateway_refund_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` datetime DEFAULT NULL,
  `processed_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refunds_no` (`refund_no`),
  KEY `idx_refunds_order` (`order_id`),
  KEY `idx_refunds_invoice` (`invoice_id`),
  KEY `idx_refunds_status` (`status`),
  KEY `fk_refunds_customer` (`customer_id`),
  KEY `fk_refunds_processed_by` (`processed_by`),
  CONSTRAINT `fk_refunds_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_refunds_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`),
  CONSTRAINT `fk_refunds_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_refunds_processed_by` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_refunds_source` CHECK ((((`order_id` is not null) and (`invoice_id` is null)) or ((`order_id` is null) and (`invoice_id` is not null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `related_products`;
CREATE TABLE `related_products` (
  `product_id` bigint unsigned NOT NULL,
  `related_product_id` bigint unsigned NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`product_id`,`related_product_id`),
  KEY `fk_related_products_related` (`related_product_id`),
  CONSTRAINT `fk_related_products_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_related_products_related` FOREIGN KEY (`related_product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `role_permissions`;
CREATE TABLE `role_permissions` (
  `role_id` int unsigned NOT NULL,
  `permission_id` int unsigned NOT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `fk_role_permissions_permission` (`permission_id`),
  CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '1');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('2', '1');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '2');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('2', '2');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '3');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('2', '3');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '4');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('2', '4');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '5');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('2', '5');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '6');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('2', '6');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '7');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('2', '7');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '8');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '9');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '10');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '11');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '12');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '13');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '14');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '15');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '16');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '17');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '18');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '19');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '20');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '21');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '22');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('1', '23');

DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `roles` (`id`, `code`, `name`, `created_at`) VALUES ('1', 'ADMIN', 'Administrator', '2026-10-06 17:59:48');
INSERT INTO `roles` (`id`, `code`, `name`, `created_at`) VALUES ('2', 'CASHIER', 'Cashier', '2026-10-06 17:59:48');

DROP TABLE IF EXISTS `schema_migrations`;
CREATE TABLE `schema_migrations` (
  `filename` varchar(255) NOT NULL,
  `applied_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0001_access.sql', '2026-10-06 17:59:44');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0002_customers.sql', '2026-10-06 17:59:44');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0003_otp_and_referral.sql', '2026-10-06 17:59:45');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0004_catalog.sql', '2026-10-06 17:59:45');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0005_products.sql', '2026-10-06 17:59:45');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0006_variants.sql', '2026-10-06 17:59:46');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0007_inventory.sql', '2026-10-06 17:59:46');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0008_coupons.sql', '2026-10-06 17:59:47');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0009_carts.sql', '2026-10-06 17:59:47');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0010_orders.sql', '2026-10-06 17:59:47');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0011_invoices.sql', '2026-10-06 17:59:47');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0012_purchases.sql', '2026-10-06 17:59:48');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0013_delivery.sql', '2026-10-06 17:59:48');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0014_refunds.sql', '2026-10-06 17:59:48');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0015_product_enrichment.sql', '2026-10-06 20:53:35');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0016_banners.sql', '2026-10-06 21:50:33');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0017_product_shipping.sql', '2026-10-06 22:42:08');
INSERT INTO `schema_migrations` (`filename`, `applied_at`) VALUES ('0018_payment_methods.sql', '2026-10-06 23:04:31');

DROP TABLE IF EXISTS `stock_adjustment_items`;
CREATE TABLE `stock_adjustment_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `adjustment_id` bigint unsigned NOT NULL,
  `variant_id` bigint unsigned NOT NULL,
  `system_qty` decimal(15,3) NOT NULL,
  `counted_qty` decimal(15,3) NOT NULL,
  `difference_qty` decimal(15,3) GENERATED ALWAYS AS ((`counted_qty` - `system_qty`)) STORED,
  PRIMARY KEY (`id`),
  KEY `fk_stock_adjustment_items_adjustment` (`adjustment_id`),
  KEY `fk_stock_adjustment_items_variant` (`variant_id`),
  CONSTRAINT `fk_stock_adjustment_items_adjustment` FOREIGN KEY (`adjustment_id`) REFERENCES `stock_adjustments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stock_adjustment_items_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `stock_adjustment_items` (`id`, `adjustment_id`, `variant_id`, `system_qty`, `counted_qty`, `difference_qty`) VALUES ('1', '1', '5', '0.000', '50.000', '50.000');
INSERT INTO `stock_adjustment_items` (`id`, `adjustment_id`, `variant_id`, `system_qty`, `counted_qty`, `difference_qty`) VALUES ('2', '2', '5', '51.000', '45.000', '-6.000');
INSERT INTO `stock_adjustment_items` (`id`, `adjustment_id`, `variant_id`, `system_qty`, `counted_qty`, `difference_qty`) VALUES ('3', '3', '7', '0.000', '30.000', '30.000');
INSERT INTO `stock_adjustment_items` (`id`, `adjustment_id`, `variant_id`, `system_qty`, `counted_qty`, `difference_qty`) VALUES ('4', '4', '5', '45.000', '48.000', '3.000');
INSERT INTO `stock_adjustment_items` (`id`, `adjustment_id`, `variant_id`, `system_qty`, `counted_qty`, `difference_qty`) VALUES ('5', '5', '7', '30.000', '32.000', '2.000');
INSERT INTO `stock_adjustment_items` (`id`, `adjustment_id`, `variant_id`, `system_qty`, `counted_qty`, `difference_qty`) VALUES ('6', '6', '8', '0.000', '5.000', '5.000');

DROP TABLE IF EXISTS `stock_adjustments`;
CREATE TABLE `stock_adjustments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `adjustment_no` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `created_by` bigint unsigned NOT NULL,
  `approved_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stock_adjustments_no` (`adjustment_no`),
  KEY `fk_stock_adjustments_created_by` (`created_by`),
  KEY `fk_stock_adjustments_approved_by` (`approved_by`),
  CONSTRAINT `fk_stock_adjustments_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_stock_adjustments_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `stock_adjustments` (`id`, `adjustment_no`, `reason`, `status`, `created_by`, `approved_by`, `created_at`) VALUES ('1', 'ADJ-20261006211530-556', 'Opening stock', 'APPROVED', '1', NULL, '2026-10-06 21:15:30');
INSERT INTO `stock_adjustments` (`id`, `adjustment_no`, `reason`, `status`, `created_by`, `approved_by`, `created_at`) VALUES ('2', 'ADJ-20261006214636-796', 'Damaged stock count', 'APPROVED', '1', NULL, '2026-10-06 21:46:36');
INSERT INTO `stock_adjustments` (`id`, `adjustment_no`, `reason`, `status`, `created_by`, `approved_by`, `created_at`) VALUES ('3', 'ADJ-20261006225207-335', 'Opening stock', 'APPROVED', '1', NULL, '2026-10-06 22:52:07');
INSERT INTO `stock_adjustments` (`id`, `adjustment_no`, `reason`, `status`, `created_by`, `approved_by`, `created_at`) VALUES ('4', 'ADJ-20261006225759-409', 'Card UI test', 'APPROVED', '1', NULL, '2026-10-06 22:57:59');
INSERT INTO `stock_adjustments` (`id`, `adjustment_no`, `reason`, `status`, `created_by`, `approved_by`, `created_at`) VALUES ('5', 'ADJ-20261006225934-237', 'add', 'APPROVED', '1', NULL, '2026-10-06 22:59:34');
INSERT INTO `stock_adjustments` (`id`, `adjustment_no`, `reason`, `status`, `created_by`, `approved_by`, `created_at`) VALUES ('6', 'ADJ-20261006225955-380', 'h', 'APPROVED', '1', NULL, '2026-10-06 22:59:55');

DROP TABLE IF EXISTS `stock_reservations`;
CREATE TABLE `stock_reservations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `variant_id` bigint unsigned NOT NULL,
  `quantity` decimal(15,3) NOT NULL,
  `status` enum('ACTIVE','CONSUMED','RELEASED','EXPIRED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stock_reservations_order` (`order_id`),
  KEY `idx_stock_reservations_variant_status` (`variant_id`,`status`,`expires_at`),
  CONSTRAINT `fk_stock_reservations_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_stock_reservations_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `subcategories`;
CREATE TABLE `subcategories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(170) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subcategories_name` (`name`),
  UNIQUE KEY `uq_subcategories_slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `subcategories` (`id`, `name`, `slug`, `description`, `image_path`, `sort_order`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('1', 'kids', 'kids', NULL, NULL, '0', 'ACTIVE', NULL, '2026-10-06 21:21:22', '2026-10-06 21:21:22');
INSERT INTO `subcategories` (`id`, `name`, `slug`, `description`, `image_path`, `sort_order`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('2', 'clock', 'clock', NULL, NULL, '0', 'INACTIVE', '2026-10-07 00:03:41', '2026-10-07 00:03:35', '2026-10-07 00:03:41');

DROP TABLE IF EXISTS `suppliers`;
CREATE TABLE `suppliers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_person` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(190) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gstin` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_suppliers_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `suppliers` (`id`, `name`, `contact_person`, `phone`, `email`, `address`, `gstin`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('1', 'Test Supplier Co', NULL, NULL, NULL, NULL, NULL, 'ACTIVE', NULL, '2026-10-06 21:44:45', '2026-10-06 21:44:45');

DROP TABLE IF EXISTS `units`;
CREATE TABLE `units` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `short_code` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_units_name` (`name`),
  UNIQUE KEY `uq_units_short_code` (`short_code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `units` (`id`, `name`, `short_code`, `status`) VALUES ('1', 'Pieces', 'PCS', 'ACTIVE');
INSERT INTO `units` (`id`, `name`, `short_code`, `status`) VALUES ('2', 'Box', 'BOX', 'ACTIVE');
INSERT INTO `units` (`id`, `name`, `short_code`, `status`) VALUES ('3', 'Kilogram', 'KG', 'ACTIVE');
INSERT INTO `units` (`id`, `name`, `short_code`, `status`) VALUES ('4', 'Gram', 'GRAM', 'ACTIVE');
INSERT INTO `units` (`id`, `name`, `short_code`, `status`) VALUES ('5', 'Litre', 'LITRE', 'ACTIVE');
INSERT INTO `units` (`id`, `name`, `short_code`, `status`) VALUES ('6', 'Millilitre', 'ML', 'ACTIVE');
INSERT INTO `units` (`id`, `name`, `short_code`, `status`) VALUES ('7', 'Pack', 'PACK', 'ACTIVE');

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `role_id` int unsigned NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(190) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `google_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile_photo_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_phone` (`phone`),
  UNIQUE KEY `uq_users_google_id` (`google_id`),
  KEY `fk_users_role` (`role_id`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `users` (`id`, `role_id`, `name`, `email`, `phone`, `password_hash`, `google_id`, `profile_photo_path`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('1', '1', 'Admin', 'admin@example.com', NULL, '$2y$10$iGDT65XjolGEOgvERtNu4.tM/bYxLJouLrGEHuAV7cZiqyR.M4sLK', NULL, NULL, 'ACTIVE', NULL, '2026-10-06 17:59:48', '2026-10-06 17:59:48');
INSERT INTO `users` (`id`, `role_id`, `name`, `email`, `phone`, `password_hash`, `google_id`, `profile_photo_path`, `status`, `deleted_at`, `created_at`, `updated_at`) VALUES ('2', '2', 'Cashier', 'cashier@example.com', NULL, '$2y$10$gxQ91lt.4Jvbh7FxNbsor.xOTQiYp.LQjHjVRV/neS706XUiWp22G', NULL, NULL, 'ACTIVE', NULL, '2026-10-06 17:59:48', '2026-10-06 17:59:48');

DROP TABLE IF EXISTS `variant_attribute_values`;
CREATE TABLE `variant_attribute_values` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `attribute_id` int unsigned NOT NULL,
  `value` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color_hex` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_variant_attribute_values` (`attribute_id`,`value`),
  CONSTRAINT `fk_variant_attribute_values_attribute` FOREIGN KEY (`attribute_id`) REFERENCES `variant_attributes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=66 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('1', '1', 'Blue', '#0000FF', '0', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('2', '1', 'Orange', '#FFA500', '0', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('3', '2', 'L', NULL, '0', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('4', '2', 'XL', NULL, '0', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('5', '1', 'Red', '#FF0000', '1', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('6', '1', 'Dark Red', '#8B0000', '2', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('7', '1', 'Crimson', '#DC143C', '3', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('8', '1', 'Maroon', '#800000', '4', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('9', '1', 'Burgundy', '#800020', '5', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('10', '1', 'Coral', '#FF7F50', '6', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('11', '1', 'Pink', '#FFC0CB', '7', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('12', '1', 'Hot Pink', '#FF69B4', '8', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('13', '1', 'Rose', '#FF007F', '9', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('14', '1', 'Rose Gold', '#B76E79', '10', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('15', '1', 'Magenta', '#FF00FF', '11', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('16', '1', 'Fuchsia', '#FF00FF', '12', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('17', '1', 'Purple', '#800080', '13', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('18', '1', 'Violet', '#8A2BE2', '14', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('19', '1', 'Indigo', '#4B0082', '15', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('20', '1', 'Lavender', '#E6E6FA', '16', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('21', '1', 'Plum', '#DDA0DD', '17', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('22', '1', 'Navy', '#000080', '18', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('23', '1', 'Dark Blue', '#00008B', '19', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('24', '1', 'Royal Blue', '#4169E1', '20', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('26', '1', 'Sky Blue', '#87CEEB', '22', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('27', '1', 'Cyan', '#00FFFF', '23', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('28', '1', 'Teal', '#008080', '24', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('29', '1', 'Turquoise', '#40E0D0', '25', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('30', '1', 'Mint', '#98FF98', '26', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('31', '1', 'Emerald', '#50C878', '27', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('32', '1', 'Dark Green', '#006400', '28', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('33', '1', 'Green', '#008000', '29', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('34', '1', 'Olive', '#808000', '30', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('35', '1', 'Lime', '#00FF00', '31', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('36', '1', 'Yellow', '#FFFF00', '32', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('37', '1', 'Gold', '#FFD700', '33', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('38', '1', 'Amber', '#FFBF00', '34', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('39', '1', 'Mustard', '#FFDB58', '35', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('41', '1', 'Peach', '#FFDAB9', '37', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('42', '1', 'Beige', '#F5F5DC', '38', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('43', '1', 'Khaki', '#F0E68C', '39', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('44', '1', 'Tan', '#D2B48C', '40', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('45', '1', 'Brown', '#A52A2A', '41', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('46', '1', 'Dark Brown', '#654321', '42', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('47', '1', 'Chocolate', '#7B3F00', '43', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('48', '1', 'White', '#FFFFFF', '44', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('49', '1', 'Off-White', '#FAFAFA', '45', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('50', '1', 'Silver', '#C0C0C0', '46', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('51', '1', 'Grey', '#808080', '47', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('52', '1', 'Light Grey', '#D3D3D3', '48', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('53', '1', 'Charcoal', '#36454F', '49', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('54', '1', 'Black', '#000000', '50', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('55', '1', 'Multi-color', '#FF5722', '51', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('56', '1', 'Transparent', '#E0E0E0', '52', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('57', '2', 'XS', NULL, '1', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('58', '2', 'S', NULL, '2', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('59', '2', 'M', NULL, '3', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('62', '2', '2XL', NULL, '6', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('63', '2', '3XL', NULL, '7', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('64', '2', 'Free Size', NULL, '8', 'ACTIVE');
INSERT INTO `variant_attribute_values` (`id`, `attribute_id`, `value`, `color_hex`, `sort_order`, `status`) VALUES ('65', '2', 'Standard', NULL, '9', 'ACTIVE');

DROP TABLE IF EXISTS `variant_attributes`;
CREATE TABLE `variant_attributes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_variant_attributes_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `variant_attributes` (`id`, `name`, `sort_order`, `status`, `created_at`) VALUES ('1', 'Color', '0', 'ACTIVE', '2026-10-06 21:03:42');
INSERT INTO `variant_attributes` (`id`, `name`, `sort_order`, `status`, `created_at`) VALUES ('2', 'Size', '0', 'ACTIVE', '2026-10-06 21:03:43');

DROP TABLE IF EXISTS `variant_images`;
CREATE TABLE `variant_images` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `variant_id` bigint unsigned NOT NULL,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `thumb_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_variant_images_variant` (`variant_id`,`sort_order`),
  CONSTRAINT `fk_variant_images_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `variant_images` (`id`, `variant_id`, `image_path`, `thumb_path`, `sort_order`, `is_primary`, `created_at`) VALUES ('1', '1', 'uploads/variants/1/977f0c1f4939bc4437462ac9e91e9f7f.webp', 'uploads/variants/1/977f0c1f4939bc4437462ac9e91e9f7f-thumb.webp', '0', '1', '2026-10-06 21:05:46');
INSERT INTO `variant_images` (`id`, `variant_id`, `image_path`, `thumb_path`, `sort_order`, `is_primary`, `created_at`) VALUES ('2', '8', 'uploads/variants/8/fa66d70c5d7b50b8829c3d039ee6eb8a.webp', 'uploads/variants/8/fa66d70c5d7b50b8829c3d039ee6eb8a-thumb.webp', '0', '1', '2026-10-06 22:57:15');
INSERT INTO `variant_images` (`id`, `variant_id`, `image_path`, `thumb_path`, `sort_order`, `is_primary`, `created_at`) VALUES ('3', '8', 'uploads/variants/8/a3b66ac55db33527f6178dd594e1b498.webp', 'uploads/variants/8/a3b66ac55db33527f6178dd594e1b498-thumb.webp', '1', '0', '2026-10-06 22:57:34');

SET FOREIGN_KEY_CHECKS = 1;
