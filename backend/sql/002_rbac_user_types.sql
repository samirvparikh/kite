-- Migration: add Admin / User roles and permissions to an EXISTING database
-- that already has a `users` table from an older 001_users.sql (without RBAC).
--
-- Apply using your DB_NAME from backend/.env:
--   npm run db:migrate-rbac
-- Or in phpMyAdmin: select the database (e.g. kite_inningstar), then import this file.
--
-- Order: roles → permissions → role_permissions → add users.role_id → backfill.

CREATE TABLE IF NOT EXISTS `roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(64) NOT NULL,
  `slug` VARCHAR(32) NOT NULL UNIQUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL,
  `slug` VARCHAR(128) NOT NULL UNIQUE,
  `description` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` BIGINT UNSIGNED NOT NULL,
  `permission_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  CONSTRAINT `rp_role_fk` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rp_perm_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `roles` (`name`, `slug`) VALUES
  ('Admin', 'admin'),
  ('User', 'user');

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

-- Add role_id only if missing (ignore error Duplicate column on re-import)
SET @db := DATABASE();
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role_id'
    ),
    'SELECT ''role_id already present'' AS note',
    'ALTER TABLE `users` ADD COLUMN `role_id` BIGINT UNSIGNED NULL AFTER `password_hash`, ADD KEY `users_role_id_fk` (`role_id`)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Optional FK (fails if invalid role_id rows exist — run UPDATE below first on old data)
-- ALTER TABLE `users` ADD CONSTRAINT `users_role_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE SET NULL;

UPDATE `users` u
SET u.`role_id` = (SELECT r.`id` FROM `roles` r WHERE r.`slug` = 'user' LIMIT 1)
WHERE u.`role_id` IS NULL;
