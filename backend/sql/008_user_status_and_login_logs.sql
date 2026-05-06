-- Add user status + last login date, and store each successful login in logs.
-- Safe to run on existing databases.

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `status` ENUM('Active','Inactive') NOT NULL DEFAULT 'Active' AFTER `password_hash`,
  ADD COLUMN IF NOT EXISTS `last_login_date` DATETIME NULL AFTER `status`;

-- Required for FK support on old installs where users table is MyISAM.
ALTER TABLE `users` ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `user_login_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `login_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` VARCHAR(64) NULL,
  `user_agent` VARCHAR(512) NULL,
  KEY `idx_user_login_logs_user_id` (`user_id`),
  KEY `idx_user_login_logs_login_at` (`login_at`),
  CONSTRAINT `fk_user_login_logs_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
