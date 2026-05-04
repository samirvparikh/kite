const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD ?? '',
        database: process.env.DB_NAME || 'kite_inningstar',
    });
    const [cols] = await conn.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'kite_pending_request_token'`
    );
    if (Number(cols?.[0]?.c ?? 0) === 0) {
        await conn.query(
            `ALTER TABLE users
             ADD COLUMN kite_pending_request_token VARCHAR(512) NULL AFTER kite_token_updated_at,
             ADD COLUMN kite_pending_request_token_at DATETIME NULL AFTER kite_pending_request_token`
        );
        console.log('Added kite_pending_request_token columns.');
    } else {
        console.log('Columns already exist; skipped.');
    }
    await conn.end();
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
