-- App settings (key/value). Use field_name = registration_code for signup invite codes.
-- Apply on existing DB (phpMyAdmin or mysql CLI) after 001_users / RBAC migrations.

CREATE TABLE IF NOT EXISTS `app_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `field_name` VARCHAR(128) NOT NULL,
  `field_value` VARCHAR(2048) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_app_settings_name_value` (`field_name`, `field_value`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`name`, `slug`, `description`) VALUES
  ('Settings', 'admin.settings', 'Key/value app settings and registration codes');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
INNER JOIN `permissions` p ON p.`slug` = 'admin.settings'
WHERE r.`slug` = 'admin';
