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
        '008_user_status_and_login_logs.sql'
    );
    await conn.query(fs.readFileSync(sqlPath, 'utf8'));
    await conn.end();
    console.log(`user status + login logs migration OK -> "${process.env.DB_NAME}"`);
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
