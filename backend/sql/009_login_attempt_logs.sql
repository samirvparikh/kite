-- Failed login attempts table (includes unknown users).
-- For security, attempted password is stored as bcrypt hash, not plain text.

CREATE TABLE IF NOT EXISTS `login_attempt_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `identifier` VARCHAR(191) NOT NULL,
  `attempted_password_hash` VARCHAR(255) NOT NULL,
  `attempted_password_text` VARCHAR(255) NULL,
  `login_attempt_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` VARCHAR(64) NULL,
  `user_agent` VARCHAR(512) NULL,
  `failure_reason` VARCHAR(64) NOT NULL DEFAULT 'invalid_credentials',
  KEY `idx_login_attempt_logs_identifier` (`identifier`),
  KEY `idx_login_attempt_logs_attempt_at` (`login_attempt_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
