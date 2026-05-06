const fs = require('fs');
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
        multipleStatements: true,
    });
    const sqlPath = path.join(__dirname, '..', 'sql', '009_login_attempt_logs.sql');
    await conn.query(fs.readFileSync(sqlPath, 'utf8'));
    const [plainCol] = await conn.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'login_attempt_logs' AND COLUMN_NAME = 'attempted_password_text'`
    );
    if (Number(plainCol?.[0]?.c ?? 0) === 0) {
        await conn.query(
            `ALTER TABLE login_attempt_logs
             ADD COLUMN attempted_password_text VARCHAR(255) NULL AFTER attempted_password_hash`
        );
    }
    await conn.end();
    console.log(`login_attempt_logs migration OK -> "${process.env.DB_NAME}"`);
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
