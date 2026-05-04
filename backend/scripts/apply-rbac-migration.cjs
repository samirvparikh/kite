/**
 * Applies backend/sql/002_rbac_user_types.sql using DB_* from backend/.env.
 * Run from repo: cd backend && npm run db:migrate-rbac
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
    const database = process.env.DB_NAME || 'kite_inningstar';

    const sqlPath = path.join(__dirname, '..', 'sql', '002_rbac_user_types.sql');
    let sql = fs.readFileSync(sqlPath, 'utf8');
    sql = sql.replace(/^\s*USE\s+`[^`]+`\s*;\s*/gim, '');

    const conn = await mysql.createConnection({
        host,
        port,
        user,
        password,
        database,
        multipleStatements: true,
    });

    await conn.query(sql);
    await conn.end();
    console.log(`RBAC migration OK → database "${database}"`);
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
