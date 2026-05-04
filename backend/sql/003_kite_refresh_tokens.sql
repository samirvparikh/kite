-- Deprecated: per-user refresh_tokens table removed.
-- Kite access_token, public_token, and refresh_token are stored on kite_global_session (id = 1).
-- Existing databases: restart the Node API so migrateKiteTokensToGlobalAndDropLegacy() runs.
SELECT 1;
