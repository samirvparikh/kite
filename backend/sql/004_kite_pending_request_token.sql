-- Pending Kite OAuth request_token (short TTL; exchanged for access_token via /session/token).
-- Applied automatically on backend start (initDb). Optional manual import.

ALTER TABLE `users`
  ADD COLUMN `kite_pending_request_token` VARCHAR(512) NULL AFTER `kite_user_id`,
  ADD COLUMN `kite_pending_request_token_at` DATETIME NULL AFTER `kite_pending_request_token`;
