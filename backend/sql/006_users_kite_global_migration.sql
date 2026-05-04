-- ---------------------------------------------------------------------------
-- Shared Zerodha session + app users (Gujarati summary / English)
-- ---------------------------------------------------------------------------
-- એક વાર Kite/Zerodha login પછી access_token DB માં kite_global_session (id=1) પર
-- સેવ થાય છે. એપમાં કોઈ પણ user login કરે ત્યારે backend એ જ token વડે Kite API
-- ચલાવે છે. token invalid થાય ત્યારે ફરીથી એક વાર Zerodha login થી global row
-- અપડેટ થાય અને બધા users ને સાચો data મળે.
-- One Zerodha login updates row id=1; all logged-in app users reuse that token
-- for Kite calls until it expires — then login with Zerodha again to refresh DB.
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

-- users: per-user fields used with Kite OAuth (no per-user access_token; see Node initDb)
--   kite_user_id — optional hint after a user completes connect (matching Zerodha user_id)
--   kite_pending_request_token / _at — short-lived request_token before exchange
