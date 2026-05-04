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

    const [adminRows] = await conn.query(
        `SELECT id FROM roles WHERE slug = 'admin' LIMIT 1`
    );
    const adminId = adminRows?.[0]?.id;
    if (!adminId) {
        console.error('Admin role not found. Run: npm run db:migrate-rbac');
        process.exit(1);
    }

    const [users] = await conn.query(
        `SELECT id, username, email, role_id FROM users
         WHERE LOWER(username) LIKE ?
            OR LOWER(email) LIKE ?`,
        ['%samir%', '%samir%']
    );

    if (!users?.length) {
        console.error('No user found with username or email containing "samir".');
        process.exit(1);
    }

    for (const u of users) {
        await conn.query(`UPDATE users SET role_id = ? WHERE id = ?`, [
            adminId,
            u.id,
        ]);
        console.log(
            `Set admin: id=${u.id} username=${u.username} email=${u.email}`
        );
    }

    await conn.end();
    console.log('Done. Log out and log in again (or refresh) so the app loads Admin permissions.');
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
