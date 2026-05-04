-- Full app schema: users + Admin/User roles + shared Kite session.
-- Matches backend/server.js initDb() + seedRbac() after migrations.
-- DB name must match DB_NAME in backend/.env (see .env.example).
-- Create from CLI: cd backend && npm run db:create   (uses DB_* from .env; strips USE here)

CREATE DATABASE IF NOT EXISTS `kite_inningstar`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `kite_inningstar`;

-- ---------------------------------------------------------------------------
-- Roles: Admin (full access), User (menu access by role_permissions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(64) NOT NULL,
  `slug` VARCHAR(32) NOT NULL UNIQUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `roles` (`name`, `slug`) VALUES
  ('Admin', 'admin'),
  ('User', 'user');

-- ---------------------------------------------------------------------------
-- Permissions (sidebar + admin screens)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL,
  `slug` VARCHAR(128) NOT NULL UNIQUE,
  `description` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`name`, `slug`, `description`) VALUES
  ('Dashboard', 'menu.dashboard', 'Open Dashboard'),
  ('Positions', 'menu.positions', 'Open Positions'),
  ('Scanner', 'menu.scanner', 'Market scanner pages'),
  ('9:20 Breakout', 'menu.nifty920', 'NIFTY 9:20 breakout'),
  ('9:30 Breakout', 'menu.nifty930', 'NIFTY 9:30 breakout'),
  ('CE / PE bias', 'menu.optionbias', 'Option bias'),
  ('My Today Choice', 'menu.mytoday', 'My today choice'),
  ('Users', 'admin.users', 'Manage users and roles assignment'),
  ('Roles & permissions', 'admin.roles', 'Edit role permissions'),
  ('Settings', 'admin.settings', 'Key/value app settings and registration codes');

-- ---------------------------------------------------------------------------
-- role_permissions: Admin = all permissions; User = menu.* only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` BIGINT UNSIGNED NOT NULL,
  `permission_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  CONSTRAINT `rp_role_fk` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rp_perm_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.`slug` = 'admin';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
INNER JOIN `permissions` p ON p.`slug` LIKE 'menu.%'
WHERE r.`slug` = 'user';

-- ---------------------------------------------------------------------------
-- Shared Zerodha Kite session (one row, id = 1 — all app users use the same tokens)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `kite_global_session` (
  `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  `kite_user_id` VARCHAR(64) NULL,
  `kite_access_token` VARCHAR(512) NULL,
  `kite_public_token` VARCHAR(512) NULL,
  `refresh_token` TEXT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `kite_global_session` (`id`) VALUES (1);

-- ---------------------------------------------------------------------------
-- App settings (generic key/value; field_name = registration_code → signup codes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `app_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `field_name` VARCHAR(128) NOT NULL,
  `field_value` VARCHAR(2048) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_app_settings_name_value` (`field_name`, `field_value`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Users (app login + role_id; per-user pending OAuth request_token only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(64) NOT NULL UNIQUE,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role_id` BIGINT UNSIGNED NULL,
  `kite_user_id` VARCHAR(64) NULL,
  `kite_pending_request_token` VARCHAR(512) NULL,
  `kite_pending_request_token_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `users_role_id_idx` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- New users default to "User" role (application also sets this on register).
-- Optional: promote one account to Admin by email:
-- UPDATE users u INNER JOIN roles r ON r.slug = 'admin' SET u.role_id = r.id WHERE u.email = 'you@example.com';
