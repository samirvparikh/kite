/**
 * Ensures table kite_global_session exists (shared Zerodha tokens for all app users).
 * Uses backend/sql/006_users_kite_global_migration.sql and DB_* from backend/.env.
 *
 *   cd backend && npm run db:migrate-kite-global
 */
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
    const sqlPath = path.join(
        __dirname,
        '..',
        'sql',
        '006_users_kite_global_migration.sql'
    );
    await conn.query(fs.readFileSync(sqlPath, 'utf8'));
    await conn.end();
    console.log(`kite_global_session OK → "${process.env.DB_NAME}"`);
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
