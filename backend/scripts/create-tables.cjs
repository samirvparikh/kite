/**
 * Creates database + all application tables (roles, permissions, users, kite_global_session, …).
 * Uses backend/sql/001_users.sql and DB_* from backend/.env (password only; no default DB required).
 *
 *   cd backend && npm run db:create
 *
 * Safe to re-run: uses CREATE TABLE IF NOT EXISTS / INSERT IGNORE where applicable.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
    const host = process.env.DB_HOST || '127.0.0.1';
    const port = Number(process.env.DB_PORT || 3306);
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD ?? '';

    const sqlPath = path.join(__dirname, '..', 'sql', '001_users.sql');
    let sql = fs.readFileSync(sqlPath, 'utf8');
    sql = sql.replace(/^\s*CREATE\s+DATABASE\b[\s\S]*?;/gim, '');
    sql = sql.replace(/^\s*USE\s+`[^`]+`\s*;\s*/gim, '');

    const rawName = (process.env.DB_NAME || 'kite_inningstar').trim();
    const dbName = /^[a-zA-Z0-9_]+$/.test(rawName) ? rawName : 'kite_inningstar';

    const rootConn = await mysql.createConnection({
        host,
        port,
        user,
        password,
        multipleStatements: true,
    });
    await rootConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await rootConn.end();

    const conn = await mysql.createConnection({
        host,
        port,
        user,
        password,
        database: dbName,
        multipleStatements: true,
    });
    await conn.query(sql);
    await conn.end();
    console.log(`Tables created (or already present) in database "${dbName}".`);
    console.log('Start the API with: npm start');
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
