const crypto = require('crypto');
const qs = require('qs');
const express = require('express');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();
const cors = require('cors');
const {
    loadNiftyNfoOptionIndex,
    pickExpiry,
    strikesWindow,
} = require('./niftyOptionsIndex');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        ok: true,
        service: 'inningstar-backend',
        hint: 'Open GET /api for API list. Restart server after pulling changes.',
    });
});

/** Smoke test: process up + optional DB ping (safe for uptime monitors; no secrets). */
app.get('/api/health', async (req, res) => {
    const payload = {
        ok: true,
        service: 'inningstar-backend',
        time: new Date().toISOString(),
        database: 'unknown',
    };
    try {
        await db.query('SELECT 1 AS health_check');
        payload.database = 'connected';
    } catch (e) {
        payload.ok = false;
        payload.database = 'error';
        payload.databaseError = e.message || String(e);
    }
    res.status(payload.ok ? 200 : 503).json(payload);
});

app.get('/api', (req, res) => {
    res.json({
        ok: true,
        endpoints: [
            'GET /api/health (process + MySQL ping)',
            'POST /api/auth/register',
            'GET /api/auth/registration-status (public: whether registration code is required)',
            'POST /api/auth/login',
            'POST /api/me/password { currentPassword, newPassword } (Bearer app JWT)',
            'POST /api/auth/change-password (legacy alias; same as /api/me/password)',
            'GET /api/auth/me',
            'GET /api/login',
            'GET /api/callback',
            'GET /login (legacy alias)',
            'GET /callback (legacy alias)',
            'GET /api/kite/user/profile',
            'GET /api/kite/user/margins',
            'GET /api/kite/portfolio/holdings',
            'GET /api/kite/portfolio/positions',
            'GET /api/market/nifty50-scanner?date=YYYY-MM-DD&type=sector|top-gainers|top-losers|5min-breakout (5min-breakout scans NSE EQ universe)',
            'GET /api/kite/quote?i=NSE:INFY&i=...',
            'GET /api/scan/nifty50-920-breakout?date=YYYY-MM-DD',
            'GET /api/scan/nifty50-930-breakout?date=YYYY-MM-DD',
            'GET /api/scan/nse-oi-momentum-breakout?date=YYYY-MM-DD',
            'GET /api/scan/nifty-option-bias?wings=5&expiry=YYYY-MM-DD (optional)',
            'GET /api/admin/users (admin: admin.users)',
            'GET /api/admin/users/:id (admin.users)',
            'GET /api/admin/users/:id/login-logs?limit=50 (admin.users)',
            'GET /api/admin/login-attempt-logs?limit=100 (admin.users)',
            'POST /api/admin/users { username, email, password, roleId?, status? } (admin.users)',
            'PATCH /api/admin/users/:id { roleId?, username?, email?, password?, status? } (admin.users)',
            'DELETE /api/admin/users/:id (admin.users)',
            'GET /api/admin/roles (admin.roles)',
            'GET /api/admin/permissions (admin.roles)',
            'PUT /api/admin/roles/:id/permissions { permissionIds: number[] } (admin.roles)',
            'GET /api/admin/settings (admin.settings)',
            'POST /api/admin/settings { fieldName, fieldValue } (admin.settings)',
            'PATCH /api/admin/settings/:id { fieldName?, fieldValue? } (admin.settings)',
            'DELETE /api/admin/settings/:id (admin.settings)',
        ],
        auth: 'Send header: Authorization: Bearer <app_token>. Legacy direct Kite token also supported. Zerodha access_token and refresh_token (if any) are stored once in table kite_global_session (id=1) for the whole app; renewed via Kite POST /session/refresh_token when the session is stale or after Kite API auth errors.',
    });
});

const API_KEY = process.env.API_KEY?.trim();
const JWT_SECRET = (process.env.JWT_SECRET || 'change-me-in-env').trim();
const AUTH_TOKEN_TTL = process.env.AUTH_TOKEN_TTL || '7d';
const FRONTEND_BASE_URL = (
    process.env.FRONTEND_BASE_URL ||
    process.env.FRONTEND_URL ||
    'http://127.0.0.1:5173'
).trim();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

/** 1 if shared Kite access_token is set (kite_global_session row id = 1). */
const SQL_EXPR_KITE_CONNECTED_GLOBAL = `IFNULL((SELECT CASE WHEN TRIM(IFNULL(g.kite_access_token,'')) != '' THEN 1 ELSE 0 END FROM kite_global_session g WHERE g.id = 1 LIMIT 1), 0)`;

/** Binds Kite OAuth round-trip to an app user when the browser cannot send Authorization on redirect. */
function createKiteOAuthState(userId) {
    const uid = Number(userId);
    if (!Number.isFinite(uid) || uid < 1) return null;
    const exp = Date.now() + 15 * 60 * 1000;
    const body = JSON.stringify({ userId: uid, exp });
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('hex');
    return Buffer.from(JSON.stringify({ userId: uid, exp, sig }), 'utf8').toString(
        'base64url'
    );
}

function verifyKiteOAuthState(state) {
    if (!state || typeof state !== 'string') return null;
    try {
        const json = JSON.parse(
            Buffer.from(String(state).trim(), 'base64url').toString('utf8')
        );
        if (!json || typeof json.exp !== 'number' || typeof json.sig !== 'string') {
            return null;
        }
        const uid = Number(json.userId);
        if (!Number.isFinite(uid) || uid < 1) return null;
        if (Date.now() > json.exp) return null;
        const body = JSON.stringify({ userId: uid, exp: json.exp });
        const expect = crypto
            .createHmac('sha256', JWT_SECRET)
            .update(body)
            .digest('hex');
        const a = Buffer.from(json.sig, 'hex');
        const b = Buffer.from(expect, 'hex');
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
        return uid;
    } catch {
        return null;
    }
}

const MYSQL_PORT = Number(process.env.DB_PORT || 3306);
const db = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'trading',
    port: Number.isFinite(MYSQL_PORT) ? MYSQL_PORT : 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

const PERMISSION_SEEDS = [
    ['Dashboard', 'menu.dashboard', 'Open Dashboard'],
    ['Positions', 'menu.positions', 'Open Positions'],
    ['Scanner', 'menu.scanner', 'Market scanner pages'],
    ['9:20 Breakout', 'menu.nifty920', 'NIFTY 9:20 breakout'],
    ['9:30 Breakout', 'menu.nifty930', 'NIFTY 9:30 breakout'],
    ['CE / PE bias', 'menu.optionbias', 'Option bias'],
    ['My Today Choice', 'menu.mytoday', 'My today choice'],
    ['Users', 'admin.users', 'Manage users and roles assignment'],
    ['Roles & permissions', 'admin.roles', 'Edit role permissions'],
    ['Settings', 'admin.settings', 'Key/value app settings and registration codes'],
];

/** Rows with this `field_name` are valid signup codes when at least one exists. */
const REGISTRATION_CODE_FIELD_NAME = 'registration_code';
const REGISTRATION_CODE_LENGTH = 6;
const REGISTRATION_CODE_SUPPORT =
    'Please contact support: samir@netsture.com';

async function ensureUsersRoleColumn() {
    const [cols] = await db.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role_id'`
    );
    const c = Number(cols?.[0]?.c ?? 0);
    if (c === 0) {
        await db.query(
            `ALTER TABLE users ADD COLUMN role_id BIGINT UNSIGNED NULL AFTER password_hash`
        );
    }
}

async function seedRbac() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS roles (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(64) NOT NULL,
            slug VARCHAR(32) NOT NULL UNIQUE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS permissions (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            slug VARCHAR(128) NOT NULL UNIQUE,
            description VARCHAR(255) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS role_permissions (
            role_id BIGINT UNSIGNED NOT NULL,
            permission_id BIGINT UNSIGNED NOT NULL,
            PRIMARY KEY (role_id, permission_id),
            CONSTRAINT rp_role_fk FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
            CONSTRAINT rp_perm_fk FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
        )
    `);

    await db.query(
        `INSERT IGNORE INTO roles (name, slug) VALUES ('Admin', 'admin'), ('User', 'user')`
    );

    for (const [name, slug, description] of PERMISSION_SEEDS) {
        await db.query(
            `INSERT IGNORE INTO permissions (name, slug, description) VALUES (?, ?, ?)`,
            [name, slug, description]
        );
    }

    const [adminRows] = await db.query(
        `SELECT id FROM roles WHERE slug = 'admin' LIMIT 1`
    );
    const [userRows] = await db.query(
        `SELECT id FROM roles WHERE slug = 'user' LIMIT 1`
    );
    const adminId = adminRows?.[0]?.id;
    const userId = userRows?.[0]?.id;
    if (!adminId || !userId) return;

    const [permRows] = await db.query(`SELECT id, slug FROM permissions`);
    const menuSlugs = new Set(
        PERMISSION_SEEDS.filter(([, s]) => s.startsWith('menu.')).map(([, s]) => s)
    );

    for (const p of permRows) {
        await db.query(
            `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
            [adminId, p.id]
        );
        if (menuSlugs.has(p.slug)) {
            await db.query(
                `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
                [userId, p.id]
            );
        }
    }
}

async function initDb() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL UNIQUE,
            email VARCHAR(191) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
            last_login_date DATETIME NULL,
            kite_user_id VARCHAR(64) NULL,
            kite_pending_request_token VARCHAR(512) NULL,
            kite_pending_request_token_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    await seedRbac();
    await ensureUsersRoleColumn();
    const [defRoleRows] = await db.query(
        `SELECT id FROM roles WHERE slug = 'user' LIMIT 1`
    );
    const defRid = defRoleRows?.[0]?.id;
    if (defRid) {
        await db.query(`UPDATE users SET role_id = ? WHERE role_id IS NULL`, [
            defRid,
        ]);
    }
    await ensureKiteGlobalSessionTable();
    await ensureUserPendingRequestTokenColumns();
    await ensureUserStatusAndLastLoginColumns();
    await ensureUsersTableEngineInnoDb();
    await ensureUserLoginLogsTable();
    await ensureLoginAttemptLogsTable();
    await migrateKiteTokensToGlobalAndDropLegacy();
    await ensureAppSettingsTable();
}

async function ensureAppSettingsTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            field_name VARCHAR(128) NOT NULL,
            field_value VARCHAR(2048) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_app_settings_name_value (field_name, field_value(122))
        )
    `);
}

async function ensureUserStatusAndLastLoginColumns() {
    const [statusCol] = await db.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status'`
    );
    if (Number(statusCol?.[0]?.c ?? 0) === 0) {
        await db.query(
            `ALTER TABLE users ADD COLUMN status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active' AFTER password_hash`
        );
    }

    const [lastLoginCol] = await db.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_login_date'`
    );
    if (Number(lastLoginCol?.[0]?.c ?? 0) === 0) {
        await db.query(
            `ALTER TABLE users ADD COLUMN last_login_date DATETIME NULL AFTER status`
        );
    }
}

async function ensureUserLoginLogsTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS user_login_logs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT UNSIGNED NOT NULL,
            login_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ip_address VARCHAR(64) NULL,
            user_agent VARCHAR(512) NULL,
            KEY idx_user_login_logs_user_id (user_id),
            KEY idx_user_login_logs_login_at (login_at),
            CONSTRAINT fk_user_login_logs_user_id
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
}

async function ensureLoginAttemptLogsTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS login_attempt_logs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            identifier VARCHAR(191) NOT NULL,
            attempted_password_hash VARCHAR(255) NOT NULL,
            attempted_password_text VARCHAR(255) NULL,
            login_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ip_address VARCHAR(64) NULL,
            user_agent VARCHAR(512) NULL,
            failure_reason VARCHAR(64) NOT NULL DEFAULT 'invalid_credentials',
            KEY idx_login_attempt_logs_identifier (identifier),
            KEY idx_login_attempt_logs_attempt_at (login_attempt_at)
        )
    `);
    const [plainCol] = await db.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'login_attempt_logs' AND COLUMN_NAME = 'attempted_password_text'`
    );
    if (Number(plainCol?.[0]?.c ?? 0) === 0) {
        await db.query(
            `ALTER TABLE login_attempt_logs
             ADD COLUMN attempted_password_text VARCHAR(255) NULL AFTER attempted_password_hash`
        );
    }
}

async function ensureUsersTableEngineInnoDb() {
    const [rows] = await db.query(
        `SELECT ENGINE FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
         LIMIT 1`
    );
    const engine = String(rows?.[0]?.ENGINE || '').toUpperCase();
    if (engine && engine !== 'INNODB') {
        await db.query(`ALTER TABLE users ENGINE=InnoDB`);
    }
}

async function logFailedLoginAttempt(req, identifier, password, reason) {
    try {
        const loginIp = getClientIp(req);
        const loginUserAgent =
            String(req.headers['user-agent'] || '').slice(0, 512) || null;
        const safeIdentifier = String(identifier || '').trim().slice(0, 191);
        const passwordHash = await bcrypt.hash(String(password || ''), 10);
        const failureReason = String(reason || 'invalid_credentials')
            .trim()
            .slice(0, 64);
        await db.query(
            `INSERT INTO login_attempt_logs
                (identifier, attempted_password_hash, attempted_password_text, ip_address, user_agent, failure_reason)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                safeIdentifier,
                passwordHash,
                String(password || '').slice(0, 255),
                loginIp,
                loginUserAgent,
                failureReason,
            ]
        );
    } catch (e) {
        console.error('failed login audit log:', e.message);
    }
}

async function ensureKiteGlobalSessionTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS kite_global_session (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            kite_user_id VARCHAR(64) NULL,
            kite_access_token VARCHAR(512) NULL,
            kite_public_token VARCHAR(512) NULL,
            refresh_token TEXT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    await db.query(`INSERT IGNORE INTO kite_global_session (id) VALUES (1)`);
}

/** One-time: move per-user Kite columns + refresh_tokens into kite_global_session, then drop legacy. */
async function migrateKiteTokensToGlobalAndDropLegacy() {
    const [colCheck] = await db.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
           AND COLUMN_NAME = 'kite_access_token'`
    );
    if (Number(colCheck?.[0]?.c ?? 0) === 0) {
        return;
    }

    try {
        await db.query(`
            UPDATE kite_global_session dest
            INNER JOIN (
                SELECT kite_access_token, kite_public_token, kite_user_id
                FROM users
                WHERE kite_access_token IS NOT NULL
                  AND TRIM(kite_access_token) != ''
                ORDER BY id DESC
                LIMIT 1
            ) src ON dest.id = 1
            SET dest.kite_access_token = COALESCE(
                    NULLIF(TRIM(dest.kite_access_token), ''),
                    src.kite_access_token
                ),
                dest.kite_public_token = COALESCE(
                    src.kite_public_token,
                    dest.kite_public_token
                ),
                dest.kite_user_id = COALESCE(
                    NULLIF(TRIM(src.kite_user_id), ''),
                    dest.kite_user_id
                )
        `);
    } catch (e) {
        console.error('migrate kite access to global:', e.message);
    }

    try {
        const [krOnly] = await db.query(
            `SELECT COUNT(*) AS c FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = 'kite_refresh_tokens'`
        );
        const [rtExistsPre] = await db.query(
            `SELECT COUNT(*) AS c FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = 'refresh_tokens'`
        );
        if (
            Number(krOnly?.[0]?.c ?? 0) > 0 &&
            Number(rtExistsPre?.[0]?.c ?? 0) === 0
        ) {
            await db.query(
                `RENAME TABLE kite_refresh_tokens TO refresh_tokens`
            );
        }
        const [tExists] = await db.query(
            `SELECT COUNT(*) AS c FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = 'refresh_tokens'`
        );
        if (Number(tExists?.[0]?.c ?? 0) > 0) {
            const [rrows] = await db.query(
                `SELECT refresh_token FROM refresh_tokens
                 WHERE refresh_token IS NOT NULL AND TRIM(refresh_token) != ''
                 ORDER BY updated_at DESC LIMIT 1`
            );
            const rt = rrows?.[0]?.refresh_token;
            if (rt) {
                await db.query(
                    `UPDATE kite_global_session SET refresh_token = ?
                     WHERE id = 1 AND (refresh_token IS NULL OR TRIM(refresh_token) = '')`,
                    [String(rt).trim()]
                );
            }
            await db.query(`DROP TABLE IF EXISTS refresh_tokens`);
        }
    } catch (e) {
        console.error('migrate refresh_tokens:', e.message);
    }

    for (const col of [
        'kite_access_token',
        'kite_public_token',
        'kite_token_updated_at',
    ]) {
        try {
            await db.query(`ALTER TABLE users DROP COLUMN \`${col}\``);
        } catch (_) {
            /* already dropped */
        }
    }
}

const KITE_REQUEST_TOKEN_TTL_MINUTES = Math.min(
    15,
    Math.max(
        1,
        parseInt(process.env.KITE_REQUEST_TOKEN_TTL_MINUTES || '5', 10) || 5
    )
);

async function ensureUserPendingRequestTokenColumns() {
    const [cols] = await db.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'kite_pending_request_token'`
    );
    if (Number(cols?.[0]?.c ?? 0) === 0) {
        await db.query(
            `ALTER TABLE users
             ADD COLUMN kite_pending_request_token VARCHAR(512) NULL AFTER kite_user_id,
             ADD COLUMN kite_pending_request_token_at DATETIME NULL AFTER kite_pending_request_token`
        );
    }
}

function istCalendarYmdIst(value) {
    if (value == null || value === '') return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function shouldRenewKiteAccessWithRefresh(lastUpdated, hasAccessToken) {
    if (!hasAccessToken) return true;
    const lastDay = istCalendarYmdIst(lastUpdated);
    const today = istCalendarYmdIst(new Date());
    return !lastDay || lastDay < today;
}

async function exchangeKiteSessionFromRequestToken(requestToken) {
    const rt = String(requestToken || '').trim();
    if (!rt || !API_KEY || !process.env.API_SECRET?.trim()) {
        throw new Error('Missing request_token or API credentials');
    }
    const apiKey = API_KEY.trim();
    const apiSecret = process.env.API_SECRET.trim();
    const checksum = crypto
        .createHash('sha256')
        .update(apiKey + rt + apiSecret)
        .digest('hex');
    const response = await axios.post(
        'https://api.kite.trade/session/token',
        qs.stringify({
            api_key: apiKey,
            request_token: rt,
            checksum,
        }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Kite-Version': '3',
            },
        }
    );
    return response.data?.data || null;
}

async function clearPendingKiteRequestToken(userId) {
    await db.query(
        `UPDATE users SET kite_pending_request_token = NULL, kite_pending_request_token_at = NULL WHERE id = ?`,
        [userId]
    );
}

async function renewKiteWithRefresh(refreshToken) {
    const rt = String(refreshToken || '').trim();
    if (!rt || !API_KEY || !process.env.API_SECRET?.trim()) return null;
    const apiKey = API_KEY.trim();
    const apiSecret = process.env.API_SECRET.trim();
    const checksum = crypto
        .createHash('sha256')
        .update(apiKey + rt + apiSecret)
        .digest('hex');
    try {
        const response = await axios.post(
            'https://api.kite.trade/session/refresh_token',
            qs.stringify({
                api_key: apiKey,
                refresh_token: rt,
                checksum,
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Kite-Version': '3',
                },
            }
        );
        return response.data?.data || response.data || null;
    } catch (e) {
        console.error(
            'Kite refresh_token renew failed:',
            e.response?.data || e.message
        );
        return null;
    }
}

/** Store Kite session on shared row (id=1) for all app users; clear this user's pending OAuth. */
async function persistKiteTokensForUser(userId, kiteData) {
    const access = String(kiteData.access_token || '').trim();
    if (!access) return;
    const pub = String(kiteData.public_token || '').trim();
    const uidK = String(kiteData.user_id || '').trim();
    const rt = String(kiteData.refresh_token || '').trim();
    const parts = [
        'kite_access_token = ?',
        'kite_public_token = ?',
        'kite_user_id = COALESCE(NULLIF(?, \'\'), kite_user_id)',
        'updated_at = CURRENT_TIMESTAMP',
    ];
    const params = [access, pub || null, uidK];
    if (rt) {
        parts.push('refresh_token = ?');
        params.push(rt);
    }
    await db.query(
        `UPDATE kite_global_session SET ${parts.join(', ')} WHERE id = 1`,
        params
    );
    if (userId > 0 && uidK) {
        await db.query(
            `UPDATE users SET kite_user_id = COALESCE(NULLIF(?, ''), kite_user_id) WHERE id = ?`,
            [uidK, userId]
        );
    }
    if (userId > 0) {
        await clearPendingKiteRequestToken(userId);
    }
}

/** After Kite returns 401/403, try Zerodha refresh_token → new access_token and persist globally. */
async function tryRefreshKiteAccessGlobal() {
    const [rows] = await db.query(
        `SELECT refresh_token FROM kite_global_session WHERE id = 1 LIMIT 1`
    );
    const refresh = rows?.[0]?.refresh_token;
    const rt = refresh ? String(refresh).trim() : '';
    if (!rt) return null;
    const renewed = await renewKiteWithRefresh(rt);
    if (renewed?.access_token) {
        await persistKiteTokensForUser(0, renewed);
        return String(renewed.access_token).trim();
    }
    return null;
}

/** Clear shared Kite credentials (all users must reconnect Zerodha). */
async function clearKiteTokensGlobal() {
    await db.query(
        `UPDATE kite_global_session
         SET kite_access_token = NULL,
             kite_public_token = NULL,
             refresh_token = NULL,
             kite_user_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`
    );
}

function kiteResponseLooksLikeBadToken(status, data) {
    if (status === 401) return true;
    if (status !== 403) return false;
    const blob =
        typeof data === 'string'
            ? data
            : JSON.stringify(data == null ? {} : data);
    return /token|authentication|credential|expired|invalid|session/i.test(blob);
}

function issueAppToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: AUTH_TOKEN_TTL });
}

function getBearerRaw(req) {
    const auth = req.headers.authorization;
    return auth && auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim().slice(0, 64);
    }
    const direct = String(req.ip || req.socket?.remoteAddress || '').trim();
    return direct ? direct.slice(0, 64) : null;
}

function toPublicUser(row) {
    if (!row) return null;
    const kc =
        row.kite_connected !== undefined && row.kite_connected !== null
            ? Boolean(Number(row.kite_connected))
            : Boolean(row.kite_access_token);
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        status: row.status || 'Active',
        lastLoginDate: row.last_login_date || null,
        kiteConnected: kc,
    };
}

async function hydrateAuthUser(req, _res, next) {
    req.authUser = null;
    req.kiteAccessToken = null;
    const bearer = getBearerRaw(req);
    if (!bearer) return next();
    try {
        const payload = jwt.verify(bearer, JWT_SECRET);
        if (!payload?.userId) return next();
        const [rows] = await db.query(
            `SELECT u.id, u.username, u.email, u.status,
                    u.kite_pending_request_token, u.kite_pending_request_token_at,
                    u.role_id, r.slug AS role_slug
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE u.id = ? LIMIT 1`,
            [payload.userId]
        );
        const row = rows?.[0] ?? null;
        if (!row) return next();
        const [gRows] = await db.query(
            `SELECT kite_access_token, refresh_token, updated_at
             FROM kite_global_session WHERE id = 1 LIMIT 1`
        );
        const g = gRows?.[0] ?? null;
        let permissions = [];
        const roleSlug = row.role_slug || 'user';
        if (roleSlug === 'admin') {
            const [pRows] = await db.query(`SELECT slug FROM permissions`);
            permissions = (pRows || []).map((p) => p.slug);
        } else if (row.role_id) {
            const [pRows] = await db.query(
                `SELECT p.slug FROM permissions p
                 INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = ?`,
                [row.role_id]
            );
            permissions = (pRows || []).map((p) => p.slug);
        }
        req.authUser = {
            id: row.id,
            username: row.username,
            email: row.email,
            status: row.status || 'Active',
            roleId: row.role_id,
            roleSlug,
            permissions,
        };
        let access = g?.kite_access_token
            ? String(g.kite_access_token).trim()
            : '';
        const pendingRt = row.kite_pending_request_token
            ? String(row.kite_pending_request_token).trim()
            : '';
        const pendingAt = row.kite_pending_request_token_at;
        let pendingFresh = false;
        if (pendingRt && pendingAt) {
            const t = new Date(pendingAt);
            if (!Number.isNaN(t.getTime())) {
                const ageMs = Date.now() - t.getTime();
                pendingFresh =
                    ageMs >= 0 &&
                    ageMs <= KITE_REQUEST_TOKEN_TTL_MINUTES * 60 * 1000;
            }
        }
        if (access && pendingRt) {
            await clearPendingKiteRequestToken(row.id);
        } else if (!access && pendingRt && pendingFresh) {
            try {
                const fromReq = await exchangeKiteSessionFromRequestToken(
                    pendingRt
                );
                if (fromReq?.access_token) {
                    await persistKiteTokensForUser(row.id, fromReq);
                    access = String(fromReq.access_token).trim();
                }
            } catch (e) {
                console.error(
                    'Kite request_token exchange (from DB) failed:',
                    e.response?.data || e.message
                );
            }
        } else if (pendingRt && !pendingFresh) {
            await clearPendingKiteRequestToken(row.id);
        }
        const refreshRaw = g?.refresh_token
            ? String(g.refresh_token).trim()
            : '';
        const hasRefresh = Boolean(refreshRaw);
        if (hasRefresh && API_KEY && process.env.API_SECRET?.trim()) {
            const needBecauseEmpty = !access;
            const needByIstDay =
                Boolean(access) &&
                shouldRenewKiteAccessWithRefresh(g.updated_at, true);
            if (needBecauseEmpty || needByIstDay) {
                const renewed = await renewKiteWithRefresh(refreshRaw);
                if (renewed?.access_token) {
                    await persistKiteTokensForUser(row.id, renewed);
                    access = String(renewed.access_token).trim();
                }
            }
        }
        req.kiteAccessToken = access || null;
    } catch {
        // Keep backward compatibility: raw Kite token in Authorization header.
    }
    return next();
}

function requireAuth(req, res, next) {
    if (!req.authUser) {
        return res.status(401).json({ error: 'Please login first' });
    }
    return next();
}

function requirePermission(...required) {
    return (req, res, next) => {
        if (!req.authUser) {
            return res.status(401).json({ error: 'Please login first' });
        }
        if (req.authUser.roleSlug === 'admin') return next();
        const ok = required.some((slug) =>
            req.authUser.permissions.includes(slug)
        );
        if (!ok) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        return next();
    };
}

async function handleChangePassword(req, res) {
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');
    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            error: 'currentPassword and newPassword are required',
        });
    }
    if (newPassword.length < 6) {
        return res
            .status(400)
            .json({ error: 'Password must be at least 6 characters' });
    }
    try {
        const [rows] = await db.query(
            'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
            [req.authUser.id]
        );
        const row = rows?.[0] ?? null;
        if (!row?.password_hash) {
            return res.status(401).json({ error: 'Please login first' });
        }
        const ok = await bcrypt.compare(currentPassword, row.password_hash);
        if (!ok) {
            return res
                .status(400)
                .json({ error: 'Current password is incorrect' });
        }
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [
            passwordHash,
            req.authUser.id,
        ]);
        return res.json({ ok: true });
    } catch (error) {
        console.error(error.message);
        return res.status(500).json({ error: 'Failed to update password' });
    }
}

function passwordChangeGetNotAllowed(_req, res) {
    res.status(405)
        .set('Allow', 'POST')
        .json({
            error: 'Method not allowed',
            hint: 'Use POST /api/me/password with JSON { currentPassword, newPassword } and Authorization: Bearer <app JWT>.',
        });
}

app.use(hydrateAuthUser);

app.get('/api/me/password', passwordChangeGetNotAllowed);
app.post('/api/me/password', requireAuth, handleChangePassword);
app.get('/api/auth/change-password', passwordChangeGetNotAllowed);
app.post('/api/auth/change-password', requireAuth, handleChangePassword);

app.get('/api/auth/registration-status', async (_req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS c FROM app_settings WHERE field_name = ?`,
            [REGISTRATION_CODE_FIELD_NAME]
        );
        const c = Number(rows?.[0]?.c ?? 0);
        return res.json({
            codesRequired: c > 0,
            registrationCodeField: REGISTRATION_CODE_FIELD_NAME,
            codeLength: REGISTRATION_CODE_LENGTH,
        });
    } catch (error) {
        console.error(error.message);
        return res
            .status(500)
            .json({ error: 'Failed to read registration settings' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const registrationCode = String(req.body?.code ?? '').trim();

    if (!username || !email || !password) {
        return res
            .status(400)
            .json({ error: 'username, email and password are required' });
    }
    if (password.length < 6) {
        return res
            .status(400)
            .json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const [codeCountRows] = await db.query(
            `SELECT COUNT(*) AS c FROM app_settings WHERE field_name = ?`,
            [REGISTRATION_CODE_FIELD_NAME]
        );
        const codesConfigured = Number(codeCountRows?.[0]?.c ?? 0) > 0;
        if (codesConfigured) {
            if (!registrationCode) {
                return res.status(400).json({
                    error: `Registration code is required (${REGISTRATION_CODE_LENGTH} characters). ${REGISTRATION_CODE_SUPPORT}`,
                });
            }
            if (registrationCode.length !== REGISTRATION_CODE_LENGTH) {
                return res.status(400).json({
                    error: `Registration code must be exactly ${REGISTRATION_CODE_LENGTH} characters. ${REGISTRATION_CODE_SUPPORT}`,
                });
            }
            const [matchRows] = await db.query(
                `SELECT id FROM app_settings
                 WHERE field_name = ?
                   AND CHAR_LENGTH(TRIM(field_value)) = ?
                   AND LOWER(TRIM(field_value)) = LOWER(?) LIMIT 1`,
                [
                    REGISTRATION_CODE_FIELD_NAME,
                    REGISTRATION_CODE_LENGTH,
                    registrationCode,
                ]
            );
            if (!matchRows?.length) {
                return res.status(400).json({
                    error: `Invalid registration code. ${REGISTRATION_CODE_SUPPORT}`,
                });
            }
        }

        const [existing] = await db.query(
            'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
            [username, email]
        );
        if (existing?.length) {
            return res
                .status(409)
                .json({ error: 'Username or email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const wantAdmin =
            ADMIN_EMAIL && email.toLowerCase() === ADMIN_EMAIL;
        const [rolePick] = await db.query(
            `SELECT id FROM roles WHERE slug = ? LIMIT 1`,
            [wantAdmin ? 'admin' : 'user']
        );
        const roleId = rolePick?.[0]?.id ?? null;
        const [result] = await db.query(
            'INSERT INTO users (username, email, password_hash, role_id) VALUES (?, ?, ?, ?)',
            [username, email, passwordHash, roleId]
        );
        const token = issueAppToken(result.insertId);
        const [rows] = await db.query(
            `SELECT u.id, u.username, u.email, ${SQL_EXPR_KITE_CONNECTED_GLOBAL} AS kite_connected
             FROM users u WHERE u.id = ? LIMIT 1`,
            [result.insertId]
        );
        return res.status(201).json({
            token,
            user: toPublicUser(rows?.[0] ?? null),
        });
    } catch (error) {
        console.error(error.message);
        return res.status(500).json({ error: 'Failed to register user' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const identifier = String(req.body?.identifier ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!identifier || !password) {
        return res.status(400).json({ error: 'identifier and password are required' });
    }
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.username, u.email, u.password_hash, u.role_id, u.status, u.last_login_date,
                    ${SQL_EXPR_KITE_CONNECTED_GLOBAL} AS kite_connected
             FROM users u WHERE u.email = ? OR u.username = ? LIMIT 1`,
            [identifier.toLowerCase(), identifier]
        );
        const row = rows?.[0] ?? null;
        if (!row) {
            await logFailedLoginAttempt(
                req,
                identifier,
                password,
                'user_not_found'
            );
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const ok = await bcrypt.compare(password, row.password_hash);
        if (!ok) {
            await logFailedLoginAttempt(
                req,
                identifier,
                password,
                'invalid_password'
            );
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (String(row.status || 'Active') !== 'Active') {
            await logFailedLoginAttempt(req, identifier, password, 'inactive_user');
            return res.status(403).json({
                error: 'User not active. Contact to samir@netsture.com',
            });
        }
        if (ADMIN_EMAIL && String(row.email || '').toLowerCase() === ADMIN_EMAIL) {
            const [arows] = await db.query(
                `SELECT id FROM roles WHERE slug = 'admin' LIMIT 1`
            );
            const adminRid = arows?.[0]?.id;
            if (adminRid && row.role_id !== adminRid) {
                await db.query(`UPDATE users SET role_id = ? WHERE id = ?`, [
                    adminRid,
                    row.id,
                ]);
                row.role_id = adminRid;
            }
        }
        const loginIp = getClientIp(req);
        const loginUserAgent = String(req.headers['user-agent'] || '').slice(0, 512) || null;
        await db.query(`UPDATE users SET last_login_date = NOW() WHERE id = ?`, [row.id]);
        await db.query(
            `INSERT INTO user_login_logs (user_id, ip_address, user_agent) VALUES (?, ?, ?)`,
            [row.id, loginIp, loginUserAgent]
        );
        row.last_login_date = new Date();
        const token = issueAppToken(row.id);
        return res.json({
            token,
            user: toPublicUser(row),
        });
    } catch (error) {
        console.error(error.message);
        return res.status(500).json({ error: 'Failed to login' });
    }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        const [rows] = await db.query(
                `SELECT u.id, u.username, u.email, u.status, u.last_login_date, r.slug AS role_slug, r.name AS role_name,
                    ${SQL_EXPR_KITE_CONNECTED_GLOBAL} AS kite_connected
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE u.id = ? LIMIT 1`,
            [req.authUser.id]
        );
        const row = rows?.[0] ?? null;
        if (!row) {
            return res.status(401).json({ error: 'Please login first' });
        }
        const base = toPublicUser(row);
        return res.json({
            user: {
                ...base,
                role: row.role_slug
                    ? { slug: row.role_slug, name: row.role_name }
                    : { slug: 'user', name: 'User' },
                permissions: req.authUser.permissions || [],
            },
        });
    } catch (error) {
        console.error(error.message);
        return res.status(500).json({ error: 'Failed to fetch user info' });
    }
});

app
    .route('/api/admin/users')
    .get(requireAuth, requirePermission('admin.users'), async (req, res) => {
        try {
            const [rows] = await db.query(
                `SELECT u.id, u.username, u.email, u.status, u.last_login_date, u.role_id, r.slug AS role_slug, r.name AS role_name,
                        ${SQL_EXPR_KITE_CONNECTED_GLOBAL} AS kite_connected
                 FROM users u
                 LEFT JOIN roles r ON r.id = u.role_id
                 ORDER BY u.id ASC`
            );
            const [roleRows] = await db.query(
                `SELECT id, name, slug FROM roles ORDER BY id ASC`
            );
            return res.json({ users: rows, roles: roleRows });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to list users' });
        }
    })
    .post(requireAuth, requirePermission('admin.users'), async (req, res) => {
        const username = String(req.body?.username ?? '').trim();
        const email = String(req.body?.email ?? '').trim().toLowerCase();
        const password = String(req.body?.password ?? '');
        const statusRaw = req.body?.status;
        let roleId = parseInt(String(req.body?.roleId ?? ''), 10);
        if (!username || !email || !password) {
            return res.status(400).json({
                error: 'username, email and password are required',
            });
        }
        if (password.length < 6) {
            return res.status(400).json({
                error: 'Password must be at least 6 characters',
            });
        }
        const status =
            statusRaw === undefined || statusRaw === null || String(statusRaw).trim() === ''
                ? 'Active'
                : String(statusRaw).trim();
        if (status !== 'Active' && status !== 'Inactive') {
            return res.status(400).json({ error: 'status must be Active or Inactive' });
        }
        if (!Number.isFinite(roleId) || roleId <= 0) {
            const [ur] = await db.query(
                `SELECT id FROM roles WHERE slug = 'user' LIMIT 1`
            );
            roleId = ur?.[0]?.id;
            if (!roleId) {
                return res.status(500).json({ error: 'Default role missing' });
            }
        }
        try {
            const [rrows] = await db.query(
                `SELECT id FROM roles WHERE id = ? LIMIT 1`,
                [roleId]
            );
            if (!rrows?.[0]) {
                return res.status(400).json({ error: 'Invalid role' });
            }
            const [existing] = await db.query(
                'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
                [username, email]
            );
            if (existing?.length) {
                return res
                    .status(409)
                    .json({ error: 'Username or email already exists' });
            }
            const passwordHash = await bcrypt.hash(password, 10);
            const [result] = await db.query(
                'INSERT INTO users (username, email, password_hash, status, role_id) VALUES (?, ?, ?, ?, ?)',
                [username, email, passwordHash, status, roleId]
            );
            const newId = result.insertId;
            const [rows] = await db.query(
                `SELECT u.id, u.username, u.email, u.status, u.last_login_date, u.role_id, r.slug AS role_slug, r.name AS role_name,
                        ${SQL_EXPR_KITE_CONNECTED_GLOBAL} AS kite_connected
                 FROM users u
                 LEFT JOIN roles r ON r.id = u.role_id
                 WHERE u.id = ? LIMIT 1`,
                [newId]
            );
            return res.status(201).json({ user: rows?.[0] });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to create user' });
        }
    });

app.get(
    '/api/admin/login-attempt-logs',
    requireAuth,
    requirePermission('admin.users'),
    async (req, res) => {
        const rawLimit = parseInt(String(req.query?.limit ?? '100'), 10);
        const limit = Number.isFinite(rawLimit)
            ? Math.min(Math.max(rawLimit, 1), 500)
            : 100;
        try {
            const [logs] = await db.query(
                `SELECT id, identifier, attempted_password_text, login_attempt_at, ip_address, user_agent, failure_reason
                 FROM login_attempt_logs
                 ORDER BY login_attempt_at DESC, id DESC
                 LIMIT ?`,
                [limit]
            );
            return res.json({ logs, limit });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to load login attempt logs' });
        }
    }
);

app.get(
    '/api/admin/users/:id',
    requireAuth,
    requirePermission('admin.users'),
    async (req, res) => {
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid user id' });
        }
        try {
            const [rows] = await db.query(
                `SELECT u.id, u.username, u.email, u.status, u.last_login_date, u.role_id, r.slug AS role_slug, r.name AS role_name,
                        ${SQL_EXPR_KITE_CONNECTED_GLOBAL} AS kite_connected
                 FROM users u
                 LEFT JOIN roles r ON r.id = u.role_id
                 WHERE u.id = ? LIMIT 1`,
                [id]
            );
            const row = rows?.[0] ?? null;
            if (!row) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.json({ user: row });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to load user' });
        }
    }
);

app.get(
    '/api/admin/users/:id/login-logs',
    requireAuth,
    requirePermission('admin.users'),
    async (req, res) => {
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        const rawLimit = parseInt(String(req.query?.limit ?? '50'), 10);
        const limit = Number.isFinite(rawLimit)
            ? Math.min(Math.max(rawLimit, 1), 200)
            : 50;

        try {
            const [users] = await db.query(
                `SELECT id, username, email FROM users WHERE id = ? LIMIT 1`,
                [id]
            );
            const user = users?.[0] ?? null;
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const [logs] = await db.query(
                `SELECT id, user_id, login_at, ip_address, user_agent
                 FROM user_login_logs
                 WHERE user_id = ?
                 ORDER BY login_at DESC, id DESC
                 LIMIT ?`,
                [id, limit]
            );

            return res.json({ user, logs, limit });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to load user login logs' });
        }
    }
);

app.patch(
    '/api/admin/users/:id',
    requireAuth,
    requirePermission('admin.users'),
    async (req, res) => {
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        const usernameRaw = req.body?.username;
        const emailRaw = req.body?.email;
        const passwordRaw = req.body?.password;
        const roleIdRaw = req.body?.roleId;
        const statusRaw = req.body?.status;

        const sets = [];
        const params = [];

        if (
            roleIdRaw !== undefined &&
            roleIdRaw !== null &&
            String(roleIdRaw).trim() !== ''
        ) {
            const roleId = parseInt(String(roleIdRaw), 10);
            if (!Number.isFinite(roleId) || roleId <= 0) {
                return res.status(400).json({ error: 'Invalid roleId' });
            }
            const [rrows] = await db.query(
                `SELECT id FROM roles WHERE id = ? LIMIT 1`,
                [roleId]
            );
            if (!rrows?.[0]) {
                return res.status(400).json({ error: 'Invalid role' });
            }
            sets.push('role_id = ?');
            params.push(roleId);
        }

        if (usernameRaw !== undefined) {
            const username = String(usernameRaw).trim();
            if (!username) {
                return res.status(400).json({ error: 'username cannot be empty' });
            }
            const [dup] = await db.query(
                'SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1',
                [username, id]
            );
            if (dup?.length) {
                return res.status(409).json({ error: 'Username already taken' });
            }
            sets.push('username = ?');
            params.push(username);
        }

        if (emailRaw !== undefined) {
            const email = String(emailRaw).trim().toLowerCase();
            if (!email) {
                return res.status(400).json({ error: 'email cannot be empty' });
            }
            const [dup] = await db.query(
                'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1',
                [email, id]
            );
            if (dup?.length) {
                return res.status(409).json({ error: 'Email already taken' });
            }
            sets.push('email = ?');
            params.push(email);
        }

        if (passwordRaw !== undefined && String(passwordRaw).length > 0) {
            if (String(passwordRaw).length < 6) {
                return res.status(400).json({
                    error: 'Password must be at least 6 characters',
                });
            }
            const passwordHash = await bcrypt.hash(String(passwordRaw), 10);
            sets.push('password_hash = ?');
            params.push(passwordHash);
        }

        if (statusRaw !== undefined) {
            const status = String(statusRaw).trim();
            if (status !== 'Active' && status !== 'Inactive') {
                return res.status(400).json({ error: 'status must be Active or Inactive' });
            }
            sets.push('status = ?');
            params.push(status);
        }

        if (sets.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        try {
            params.push(id);
            const [upd] = await db.query(
                `UPDATE users SET ${sets.join(', ')} WHERE id = ?`,
                params
            );
            if (upd.affectedRows === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            const [rows] = await db.query(
                `SELECT u.id, u.username, u.email, u.status, u.last_login_date, u.role_id, r.slug AS role_slug, r.name AS role_name,
                        ${SQL_EXPR_KITE_CONNECTED_GLOBAL} AS kite_connected
                 FROM users u
                 LEFT JOIN roles r ON r.id = u.role_id
                 WHERE u.id = ? LIMIT 1`,
                [id]
            );
            return res.json({ user: rows?.[0] });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to update user' });
        }
    }
);

app.delete(
    '/api/admin/users/:id',
    requireAuth,
    requirePermission('admin.users'),
    async (req, res) => {
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid user id' });
        }
        if (id === req.authUser.id) {
            return res
                .status(400)
                .json({ error: 'Cannot delete your own account' });
        }
        try {
            const [del] = await db.query(`DELETE FROM users WHERE id = ?`, [
                id,
            ]);
            if (del.affectedRows === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.json({ ok: true });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to delete user' });
        }
    }
);

app.get(
    '/api/admin/roles',
    requireAuth,
    requirePermission('admin.roles'),
    async (_req, res) => {
        try {
            const [rows] = await db.query(
                `SELECT r.id, r.name, r.slug,
                        (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count
                 FROM roles r ORDER BY r.id ASC`
            );
            return res.json({ roles: rows });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to list roles' });
        }
    }
);

app.get(
    '/api/admin/permissions',
    requireAuth,
    requirePermission('admin.roles'),
    async (_req, res) => {
        try {
            const [rows] = await db.query(
                `SELECT id, name, slug, description FROM permissions ORDER BY slug ASC`
            );
            return res.json({ permissions: rows });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to list permissions' });
        }
    }
);

app.get(
    '/api/admin/roles/:id/permissions',
    requireAuth,
    requirePermission('admin.roles'),
    async (req, res) => {
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid role id' });
        }
        try {
            const [rrows2] = await db.query(
                `SELECT id, name, slug FROM roles WHERE id = ? LIMIT 1`,
                [id]
            );
            const role = rrows2?.[0];
            if (!role) {
                return res.status(404).json({ error: 'Role not found' });
            }
            const [permRows] = await db.query(
                `SELECT p.id FROM permissions p
                 INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = ?`,
                [id]
            );
            return res.json({
                role,
                permissionIds: (permRows || []).map((p) => p.id),
            });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to load role' });
        }
    }
);

app.put(
    '/api/admin/roles/:id/permissions',
    requireAuth,
    requirePermission('admin.roles'),
    async (req, res) => {
        const id = parseInt(String(req.params.id), 10);
        const rawIds = req.body?.permissionIds;
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid role id' });
        }
        if (!Array.isArray(rawIds)) {
            return res.status(400).json({ error: 'permissionIds must be an array' });
        }
        const permissionIds = rawIds
            .map((x) => parseInt(String(x), 10))
            .filter((n) => Number.isFinite(n) && n > 0);
        const uniqueIds = [...new Set(permissionIds)];
        try {
            const [rrows3] = await db.query(
                `SELECT id, slug FROM roles WHERE id = ? LIMIT 1`,
                [id]
            );
            const role = rrows3?.[0];
            if (!role) {
                return res.status(404).json({ error: 'Role not found' });
            }
            if (role.slug === 'admin') {
                return res.status(400).json({
                    error: 'Admin role always has full access; it cannot be edited here.',
                });
            }
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                await conn.query(`DELETE FROM role_permissions WHERE role_id = ?`, [
                    id,
                ]);
                for (const pid of uniqueIds) {
                    await conn.query(
                        `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
                        [id, pid]
                    );
                }
                await conn.commit();
            } catch (e) {
                await conn.rollback();
                throw e;
            } finally {
                conn.release();
            }
            return res.json({ ok: true });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to update role' });
        }
    }
);

app.get(
    '/api/admin/settings',
    requireAuth,
    requirePermission('admin.settings'),
    async (_req, res) => {
        try {
            const [rows] = await db.query(
                `SELECT id, field_name, field_value, created_at, updated_at
                 FROM app_settings ORDER BY field_name ASC, id ASC`
            );
            return res.json({ settings: rows });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to list settings' });
        }
    }
);

app.post(
    '/api/admin/settings',
    requireAuth,
    requirePermission('admin.settings'),
    async (req, res) => {
        const fieldName = String(req.body?.fieldName ?? '').trim();
        const fieldValue = String(req.body?.fieldValue ?? '').trim();
        if (!fieldName || !fieldValue) {
            return res
                .status(400)
                .json({ error: 'fieldName and fieldValue are required' });
        }
        if (fieldName.length > 128 || fieldValue.length > 2048) {
            return res.status(400).json({ error: 'fieldName or fieldValue too long' });
        }
        try {
            const [result] = await db.query(
                `INSERT INTO app_settings (field_name, field_value) VALUES (?, ?)`,
                [fieldName, fieldValue]
            );
            const [rows] = await db.query(
                `SELECT id, field_name, field_value, created_at, updated_at
                 FROM app_settings WHERE id = ? LIMIT 1`,
                [result.insertId]
            );
            return res.status(201).json({ setting: rows?.[0] });
        } catch (error) {
            if (error && error.code === 'ER_DUP_ENTRY') {
                return res
                    .status(409)
                    .json({ error: 'A row with this field name and value already exists' });
            }
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to create setting' });
        }
    }
);

app.patch(
    '/api/admin/settings/:id',
    requireAuth,
    requirePermission('admin.settings'),
    async (req, res) => {
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid setting id' });
        }
        const rawName = req.body?.fieldName;
        const rawVal = req.body?.fieldValue;
        const sets = [];
        const params = [];
        if (rawName !== undefined) {
            const fieldName = String(rawName ?? '').trim();
            if (!fieldName) {
                return res.status(400).json({ error: 'fieldName cannot be empty' });
            }
            if (fieldName.length > 128) {
                return res.status(400).json({ error: 'fieldName too long' });
            }
            sets.push('field_name = ?');
            params.push(fieldName);
        }
        if (rawVal !== undefined) {
            const fieldValue = String(rawVal ?? '').trim();
            if (!fieldValue) {
                return res.status(400).json({ error: 'fieldValue cannot be empty' });
            }
            if (fieldValue.length > 2048) {
                return res.status(400).json({ error: 'fieldValue too long' });
            }
            sets.push('field_value = ?');
            params.push(fieldValue);
        }
        if (sets.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        try {
            params.push(id);
            const [upd] = await db.query(
                `UPDATE app_settings SET ${sets.join(', ')} WHERE id = ?`,
                params
            );
            if (upd.affectedRows === 0) {
                return res.status(404).json({ error: 'Setting not found' });
            }
            const [rows] = await db.query(
                `SELECT id, field_name, field_value, created_at, updated_at
                 FROM app_settings WHERE id = ? LIMIT 1`,
                [id]
            );
            return res.json({ setting: rows?.[0] });
        } catch (error) {
            if (error && error.code === 'ER_DUP_ENTRY') {
                return res
                    .status(409)
                    .json({ error: 'A row with this field name and value already exists' });
            }
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to update setting' });
        }
    }
);

app.delete(
    '/api/admin/settings/:id',
    requireAuth,
    requirePermission('admin.settings'),
    async (req, res) => {
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid setting id' });
        }
        try {
            const [del] = await db.query(`DELETE FROM app_settings WHERE id = ?`, [id]);
            if (del.affectedRows === 0) {
                return res.status(404).json({ error: 'Setting not found' });
            }
            return res.json({ ok: true });
        } catch (error) {
            console.error(error.message);
            return res.status(500).json({ error: 'Failed to delete setting' });
        }
    }
);

async function kiteGet(req, res, endpoint) {
    let accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({
            error: 'Kite API not connected. Please connect Zerodha from login page.',
            kiteReconnectRequired: true,
        });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }
    const apiKey = API_KEY.trim();
    const doReq = (tok) =>
        axios.get(`https://api.kite.trade/${endpoint}`, {
            headers: {
                'X-Kite-Version': '3',
                Authorization: `token ${apiKey}:${tok}`,
            },
        });
    try {
        const response = await doReq(accessToken);
        res.json(response.data);
    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        if (req.authUser?.id && kiteResponseLooksLikeBadToken(status, data)) {
            const newTok = await tryRefreshKiteAccessGlobal();
            if (newTok) {
                req.kiteAccessToken = newTok;
                try {
                    const response2 = await doReq(newTok);
                    return res.json(response2.data);
                } catch (e2) {
                    console.error(e2.response?.data || e2.message);
                    return res.status(e2.response?.status || 500).json(
                        e2.response?.data || { error: e2.message }
                    );
                }
            }
            await clearKiteTokensGlobal();
            return res.status(401).json({
                error: 'Kite session expired. Connect Zerodha from the login page again.',
                kiteReconnectRequired: true,
            });
        }
        console.error(error.response?.data || error.message);
        res.status(status || 500).json(data || { error: error.message });
    }
}

app.get('/api/kite/user/profile', (req, res) =>
    kiteGet(req, res, 'user/profile')
);
app.get('/api/kite/user/margins', (req, res) =>
    kiteGet(req, res, 'user/margins')
);
app.get('/api/kite/portfolio/holdings', (req, res) =>
    kiteGet(req, res, 'portfolio/holdings')
);
app.get('/api/kite/portfolio/positions', (req, res) =>
    kiteGet(req, res, 'portfolio/positions')
);

app.post('/api/kite/orders', async (req, res) => {
    let accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({
            error: 'Kite API not connected. Please connect Zerodha from login page.',
            kiteReconnectRequired: true,
        });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }
    const apiKey = API_KEY.trim();
    const tradingsymbol = String(req.body?.tradingsymbol ?? '').trim().toUpperCase();
    const exchange = String(req.body?.exchange ?? 'NSE').trim().toUpperCase();
    const qtyRaw = parseInt(String(req.body?.quantity ?? '1'), 10);
    const quantity = Number.isFinite(qtyRaw) ? Math.max(1, qtyRaw) : 1;
    const transaction_type = String(req.body?.transaction_type ?? 'BUY')
        .trim()
        .toUpperCase();

    if (!tradingsymbol) {
        return res.status(400).json({ error: 'Missing tradingsymbol' });
    }
    if (!['BUY', 'SELL'].includes(transaction_type)) {
        return res.status(400).json({ error: 'Invalid transaction_type' });
    }

    const payload = qs.stringify({
        exchange,
        tradingsymbol,
        transaction_type,
        quantity,
        product: 'MIS',
        order_type: 'MARKET',
        variety: 'regular',
        validity: 'DAY',
    });

    const doOrder = (tok) =>
        axios.post('https://api.kite.trade/orders/regular', payload, {
            headers: {
                'X-Kite-Version': '3',
                Authorization: `token ${apiKey}:${tok}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
    try {
        const response = await doOrder(accessToken);
        return res.json(response.data);
    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        if (req.authUser?.id && kiteResponseLooksLikeBadToken(status, data)) {
            const newTok = await tryRefreshKiteAccessGlobal();
            if (newTok) {
                req.kiteAccessToken = newTok;
                try {
                    const response2 = await doOrder(newTok);
                    return res.json(response2.data);
                } catch (e2) {
                    console.error(e2.response?.data || e2.message);
                    return res.status(e2.response?.status || 500).json(
                        e2.response?.data || { error: e2.message }
                    );
                }
            }
            await clearKiteTokensGlobal();
            return res.status(401).json({
                error: 'Kite session expired. Connect Zerodha from the login page again.',
                kiteReconnectRequired: true,
            });
        }
        console.error(error.response?.data || error.message);
        return res.status(status || 500).json(data || { error: error.message });
    }
});

function getBearerToken(req) {
    const fromUser = req.kiteAccessToken;
    if (fromUser) return fromUser;
    // App JWT in Authorization must never be sent to Kite as an access token.
    if (req.authUser) return null;
    return getBearerRaw(req);
}

function istDateString(d = new Date()) {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function istMinutesSinceMidnight(d = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(d);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const minute = parseInt(
        parts.find((p) => p.type === 'minute')?.value ?? '0',
        10
    );
    return hour * 60 + minute;
}

/** Pads YYYY-M-D to YYYY-MM-DD so string compare with istDateString() is correct. */
function normalizeCalendarYmd(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw.trim());
    if (!m) return null;
    const y = m[1];
    const mo = String(Number(m[2])).padStart(2, '0');
    const d = String(Number(m[3])).padStart(2, '0');
    return `${y}-${mo}-${d}`;
}

function formatIstHmsFromStamp(stamp) {
    const d = new Date(stamp);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(d);
    const h = (parts.find((p) => p.type === 'hour')?.value ?? '00').padStart(
        2,
        '0'
    );
    const mi = (parts.find((p) => p.type === 'minute')?.value ?? '00').padStart(
        2,
        '0'
    );
    const s = (parts.find((p) => p.type === 'second')?.value ?? '00').padStart(
        2,
        '0'
    );
    return `${h}:${mi}:${s}`;
}

/** Minutes from midnight in Asia/Kolkata (for matching 5m bar open times). */
function istMinuteOfDayFromStamp(stamp) {
    const d = new Date(stamp);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(d);
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const mi = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    return h * 60 + mi;
}

function parseOpenMinuteIst(timeStr) {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(timeStr).trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Try several Kite from/to shapes — past sessions often work reliably with
 * date-only (full day 5m) or a full-session window.
 */
async function fetchKite5MinuteCandlesForDay(
    accessToken,
    instrumentToken,
    ymd
) {
    const headers = {
        'X-Kite-Version': '3',
        Authorization: `token ${API_KEY}:${accessToken}`,
    };
    const attempts = [
        `instruments/historical/${instrumentToken}/5minute?from=${encodeURIComponent(ymd)}&to=${encodeURIComponent(ymd)}`,
        `instruments/historical/${instrumentToken}/5minute?from=${encodeURIComponent(`${ymd} 09:15:00`)}&to=${encodeURIComponent(`${ymd} 15:30:00`)}`,
        `instruments/historical/${instrumentToken}/5minute?from=${encodeURIComponent(`${ymd} 09:00:00`)}&to=${encodeURIComponent(`${ymd} 16:00:00`)}`,
    ];
    let lastErr;
    for (const path of attempts) {
        try {
            const histRes = await axios.get(`https://api.kite.trade/${path}`, {
                headers,
            });
            const candles = histRes.data?.data?.candles ?? [];
            if (candles.length) {
                candles.sort(
                    (a, b) =>
                        new Date(a[0]).getTime() - new Date(b[0]).getTime()
                );
                return candles;
            }
        } catch (e) {
            lastErr = e;
        }
    }
    if (lastErr) throw lastErr;
    return [];
}

function getCandleValue(candles, time, index) {
    for (const candle of candles) {
        const stamp = candle[0] ?? '';
        if (String(stamp).includes(time)) {
            return parseFloat(candle[index] ?? 0);
        }
    }
    return null;
}

function ohlcFromCandleRow(c) {
    const o = parseFloat(c[1]);
    const h = parseFloat(c[2]);
    const l = parseFloat(c[3]);
    const cl = parseFloat(c[4]);
    if (![o, h, l, cl].every((n) => Number.isFinite(n))) return null;
    return { open: o, high: h, low: l, close: cl };
}

/**
 * 5-minute bar that opens at `time` IST (e.g. 09:15:00). Matches substring in
 * stamp, full IST H:M:S, or minute-of-day (9:15 → 555, 9:30 → 570).
 */
function get5MinuteBarAt(candles, time) {
    if (!Array.isArray(candles)) return null;
    const want = /^\d{1,2}:\d{2}$/.test(time) ? `${time}:00` : time;
    const wantOpenMin = parseOpenMinuteIst(want);
    for (const c of candles) {
        const stamp = String(c[0] ?? '');
        if (stamp.includes(want) || stamp.includes(time)) {
            return ohlcFromCandleRow(c);
        }
    }
    for (const c of candles) {
        const ist = formatIstHmsFromStamp(c[0]);
        if (ist === want) {
            return ohlcFromCandleRow(c);
        }
    }
    if (wantOpenMin != null) {
        for (const c of candles) {
            const mod = istMinuteOfDayFromStamp(c[0]);
            if (mod === wantOpenMin) {
                return ohlcFromCandleRow(c);
            }
        }
    }
    return null;
}

/** Index of the 5m candle that opens at 09:15 IST (first regular session bar). */
function indexOfOpening915Bar(candles) {
    if (!Array.isArray(candles)) return -1;
    const wantMin = 9 * 60 + 15;
    for (let i = 0; i < candles.length; i++) {
        const mod = istMinuteOfDayFromStamp(candles[i][0]);
        if (mod === wantMin) return i;
    }
    return -1;
}

/**
 * After the first 5m bar, session range (subsequent bars ± today's LTP) must
 * have traded strictly above `firstHigh` and strictly below `firstLow`.
 */
function sessionBrokeBothSidesOfFirst5m(
    candles,
    firstBarIndex,
    firstHigh,
    firstLow,
    mergeLtp
) {
    let maxH = -Infinity;
    let minL = Infinity;
    for (let i = firstBarIndex + 1; i < candles.length; i++) {
        const o = ohlcFromCandleRow(candles[i]);
        if (!o) continue;
        maxH = Math.max(maxH, o.high);
        minL = Math.min(minL, o.low);
    }
    if (mergeLtp != null && Number.isFinite(mergeLtp)) {
        maxH = Math.max(maxH, mergeLtp);
        minL = Math.min(minL, mergeLtp);
    }
    if (!Number.isFinite(maxH) || !Number.isFinite(minL)) return false;
    return maxH > firstHigh && minL < firstLow;
}

const NIFTY50_SYMBOLS = [
    'ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK',
    'BAJAJ-AUTO', 'BAJFINANCE', 'BAJAJFINSV', 'BEL', 'BHARTIARTL',
    'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'ETERNAL',
    'GRASIM', 'HCLTECH', 'HDFCBANK', 'HDFCLIFE', 'HEROMOTOCO',
    'HINDALCO', 'HINDUNILVR', 'ICICIBANK', 'INDUSINDBK', 'INFY',
    'ITC', 'JIOFIN', 'JSWSTEEL', 'KOTAKBANK', 'LT',
    'M&M', 'MARUTI', 'NESTLEIND', 'NTPC', 'ONGC',
    'POWERGRID', 'RELIANCE', 'SBILIFE', 'SHRIRAMFIN', 'SBIN',
    'SUNPHARMA', 'TATACONSUM', 'TATAMOTORS', 'TATASTEEL', 'TCS',
    'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO', 'WIPRO',
];

/** Broad sector bucket per NIFTY50 symbol (for sector view aggregation) */
const NIFTY50_SECTOR = {
    ADANIENT: 'Metals',
    ADANIPORTS: 'Infra',
    APOLLOHOSP: 'Pharma',
    ASIANPAINT: 'FMCG',
    AXISBANK: 'Banking',
    'BAJAJ-AUTO': 'Auto',
    BAJFINANCE: 'Finance',
    BAJAJFINSV: 'Finance',
    BEL: 'IT',
    BHARTIARTL: 'Telecom',
    CIPLA: 'Pharma',
    COALINDIA: 'Energy',
    DRREDDY: 'Pharma',
    EICHERMOT: 'Auto',
    ETERNAL: 'Finance',
    GRASIM: 'Cement',
    HCLTECH: 'IT',
    HDFCBANK: 'Banking',
    HDFCLIFE: 'Finance',
    HEROMOTOCO: 'Auto',
    HINDALCO: 'Metals',
    HINDUNILVR: 'FMCG',
    ICICIBANK: 'Banking',
    INDUSINDBK: 'Banking',
    INFY: 'IT',
    ITC: 'FMCG',
    JIOFIN: 'Finance',
    JSWSTEEL: 'Metals',
    KOTAKBANK: 'Banking',
    LT: 'Infra',
    'M&M': 'Auto',
    MARUTI: 'Auto',
    NESTLEIND: 'FMCG',
    NTPC: 'Energy',
    ONGC: 'Energy',
    POWERGRID: 'Energy',
    RELIANCE: 'Energy',
    SBILIFE: 'Finance',
    SHRIRAMFIN: 'Finance',
    SBIN: 'Banking',
    SUNPHARMA: 'Pharma',
    TATACONSUM: 'FMCG',
    TATAMOTORS: 'Auto',
    TATASTEEL: 'Metals',
    TCS: 'IT',
    TECHM: 'IT',
    TITAN: 'FMCG',
    TRENT: 'Retail',
    ULTRACEMCO: 'Cement',
    WIPRO: 'IT',
};

function prevWeekdayIso(isoDateStr) {
    const [y, m, d] = isoDateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) {
        dt.setUTCDate(dt.getUTCDate() - 1);
    }
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

function candleDateKey(stamp) {
    const s = String(stamp);
    return s.length >= 10 ? s.slice(0, 10) : s;
}

function findDayCandle(candles, ymd) {
    if (!Array.isArray(candles)) return null;
    return (
        candles.find((c) => candleDateKey(c[0]) === ymd) ?? null
    );
}

function ymdToDmy(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? ''));
    if (!m) return '';
    return `${m[3]}-${m[2]}-${m[1]}`;
}

function normalizeCaText(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return '-';
    const u = s.toUpperCase();
    if (u.includes('DIVIDEND')) return 'DIV';
    if (u.includes('BONUS')) return 'BONUS';
    if (u.includes('SPLIT')) return 'SPLIT';
    if (u.includes('RIGHT')) return 'RIGHTS';
    return s.length > 20 ? `${s.slice(0, 20)}…` : s;
}

async function fetchNseCorporateActionsBySymbol(selectedDate, symbols) {
    const out = new Map();
    if (!Array.isArray(symbols) || symbols.length === 0) return out;
    const dmy = ymdToDmy(selectedDate);
    if (!dmy) return out;

    try {
        const home = await axios.get('https://www.nseindia.com', {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        const rawCookies = home.headers?.['set-cookie'];
        const cookieHeader = Array.isArray(rawCookies)
            ? rawCookies.map((c) => c.split(';')[0]).join('; ')
            : '';

        const apiUrl = `https://www.nseindia.com/api/corporates-corporateActions?index=equities&from_date=${encodeURIComponent(
            dmy
        )}&to_date=${encodeURIComponent(dmy)}`;
        const caRes = await axios.get(apiUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'application/json, text/plain, */*',
                Referer: 'https://www.nseindia.com/companies-listing/corporate-filings-actions',
                Cookie: cookieHeader,
            },
        });

        const rows = Array.isArray(caRes.data) ? caRes.data : caRes.data?.data;
        if (!Array.isArray(rows)) return out;

        const symbolSet = new Set(symbols);
        for (const r of rows) {
            const sym = String(r?.symbol ?? r?.sm_name ?? '').trim().toUpperCase();
            if (!sym || !symbolSet.has(sym)) continue;
            const purpose =
                r?.purpose ??
                r?.subject ??
                r?.desc ??
                r?.series ??
                '';
            out.set(sym, normalizeCaText(purpose));
        }
        return out;
    } catch {
        return out;
    }
}

function normalizeNseSymbol(raw) {
    return String(raw ?? '')
        .trim()
        .toUpperCase()
        .replace(/^NSE:/, '')
        .replace(/-EQ$/, '');
}

async function fetchNseJson(url, referer) {
    const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    const home = await axios.get('https://www.nseindia.com', {
        headers: {
            'User-Agent': ua,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    });
    const rawCookies = home.headers?.['set-cookie'];
    const cookieHeader = Array.isArray(rawCookies)
        ? rawCookies.map((c) => c.split(';')[0]).join('; ')
        : '';
    const res = await axios.get(url, {
        headers: {
            'User-Agent': ua,
            Accept: 'application/json, text/plain, */*',
            Referer: referer || 'https://www.nseindia.com/',
            Cookie: cookieHeader,
        },
        timeout: 20000,
    });
    return res.data;
}

function pickRows(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    return [];
}

function timePartFromCandleStamp(stamp) {
    const s = String(stamp ?? '');
    const tPos = s.indexOf('T');
    if (tPos >= 0 && s.length >= tPos + 9) return s.slice(tPos + 1, tPos + 9);
    if (s.length >= 19 && s[10] === ' ') return s.slice(11, 19);
    if (s.length >= 8) return s.slice(-8);
    return '';
}

function barsBetweenTimeInclusive(candles, fromTime, toTime) {
    if (!Array.isArray(candles)) return [];
    return candles.filter((c) => {
        const t = timePartFromCandleStamp(c?.[0]);
        return t >= fromTime && t <= toTime;
    });
}

function calcSessionOhlcvFrom5m(candles) {
    if (!Array.isArray(candles) || candles.length === 0) return null;
    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    let volume = 0;
    const open = parseFloat(candles[0]?.[1] ?? NaN);
    for (const c of candles) {
        const h = parseFloat(c?.[2] ?? NaN);
        const l = parseFloat(c?.[3] ?? NaN);
        const v = parseFloat(c?.[5] ?? NaN);
        if (Number.isFinite(h) && h > high) high = h;
        if (Number.isFinite(l) && l < low) low = l;
        if (Number.isFinite(v)) volume += v;
    }
    if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low)) {
        return null;
    }
    return { open, high, low, volume: Math.round(volume) };
}

async function fetchPrevCloseForDay(accessToken, instrumentToken, selectedDate) {
    const prev = prevWeekdayIso(selectedDate);
    const path = `instruments/historical/${instrumentToken}/day?from=${encodeURIComponent(prev)}&to=${encodeURIComponent(selectedDate)}`;
    const histRes = await axios.get(`https://api.kite.trade/${path}`, {
        headers: {
            'X-Kite-Version': '3',
            Authorization: `token ${API_KEY}:${accessToken}`,
        },
    });
    const candles = histRes.data?.data?.candles ?? [];
    const cPrev = findDayCandle(candles, prev);
    if (!cPrev) return null;
    const closePrev = parseFloat(cPrev[4] ?? NaN);
    return Number.isFinite(closePrev) ? closePrev : null;
}

function pctChangeFromQuotes(q) {
    const last = parseFloat(q.last_price ?? 0);
    const ch = parseFloat(q.change ?? q.net_change ?? 0);
    const prevClose = last - ch;
    const changePct =
        prevClose !== 0 && Number.isFinite(prevClose)
            ? (ch / prevClose) * 100
            : 0;
    return {
        last_price: last,
        change_rs: ch,
        change_pct: Number.isFinite(changePct) ? changePct : 0,
    };
}

async function fetchQuoteMap(accessToken) {
    const instruments = NIFTY50_SYMBOLS.map((s) => `NSE:${s}`);
    const q = instruments.map((i) => `i=${encodeURIComponent(i)}`).join('&');
    const quoteRes = await axios.get(`https://api.kite.trade/quote?${q}`, {
        headers: {
            'X-Kite-Version': '3',
            Authorization: `token ${API_KEY}:${accessToken}`,
        },
    });
    return quoteRes.data?.data ?? {};
}

async function fetchQuoteMapForSymbols(accessToken, symbols) {
    const out = {};
    const chunkSize = 250;
    for (let i = 0; i < symbols.length; i += chunkSize) {
        const batch = symbols.slice(i, i + chunkSize);
        const instruments = batch.map((s) => `NSE:${s}`);
        const q = instruments.map((k) => `i=${encodeURIComponent(k)}`).join('&');
        const quoteRes = await axios.get(`https://api.kite.trade/quote?${q}`, {
            headers: {
                'X-Kite-Version': '3',
                Authorization: `token ${API_KEY}:${accessToken}`,
            },
        });
        Object.assign(out, quoteRes.data?.data ?? {});
    }
    return out;
}

let NSE_EQ_UNIVERSE_CACHE = {
    atMs: 0,
    symbols: [],
};
let FNO_UNDERLYING_SYMBOLS_CACHE = {
    atMs: 0,
    symbols: [],
};

async function loadNseEqUniverse(accessToken) {
    const now = Date.now();
    if (
        Array.isArray(NSE_EQ_UNIVERSE_CACHE.symbols) &&
        NSE_EQ_UNIVERSE_CACHE.symbols.length > 0 &&
        now - NSE_EQ_UNIVERSE_CACHE.atMs < 15 * 60 * 1000
    ) {
        return NSE_EQ_UNIVERSE_CACHE.symbols;
    }
    const res = await axios.get('https://api.kite.trade/instruments', {
        headers: {
            'X-Kite-Version': '3',
            Authorization: `token ${API_KEY}:${accessToken}`,
        },
        responseType: 'text',
    });
    const csv = String(res.data ?? '');
    const lines = csv.split('\n');
    if (lines.length < 2) return [];
    const set = new Set();
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',');
        if (cols.length < 4) continue;
        const tradingsymbol = String(cols[2] ?? '').trim();
        const instrumentType = String(cols[cols.length - 3] ?? '').trim();
        const segment = String(cols[cols.length - 2] ?? '').trim();
        const exchange = String(cols[cols.length - 1] ?? '').trim();
        if (!tradingsymbol) continue;
        if (exchange !== 'NSE') continue;
        if (segment !== 'NSE') continue;
        if (instrumentType !== 'EQ') continue;
        set.add(tradingsymbol);
    }
    const symbols = [...set].sort();
    NSE_EQ_UNIVERSE_CACHE = { atMs: now, symbols };
    return symbols;
}

async function loadFnoUnderlyingSymbols(accessToken) {
    const now = Date.now();
    if (
        Array.isArray(FNO_UNDERLYING_SYMBOLS_CACHE.symbols) &&
        FNO_UNDERLYING_SYMBOLS_CACHE.symbols.length > 0 &&
        now - FNO_UNDERLYING_SYMBOLS_CACHE.atMs < 15 * 60 * 1000
    ) {
        return FNO_UNDERLYING_SYMBOLS_CACHE.symbols;
    }
    const res = await axios.get('https://api.kite.trade/instruments', {
        headers: {
            'X-Kite-Version': '3',
            Authorization: `token ${API_KEY}:${accessToken}`,
        },
        responseType: 'text',
    });
    const csv = String(res.data ?? '');
    const lines = csv.split('\n');
    if (lines.length < 2) return [];
    const set = new Set();
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',');
        if (cols.length < 12) continue;
        const name = String(cols[3] ?? '').trim();
        const instrumentType = String(cols[cols.length - 3] ?? '').trim();
        const segment = String(cols[cols.length - 2] ?? '').trim();
        const exchange = String(cols[cols.length - 1] ?? '').trim();
        if (!name) continue;
        if (exchange !== 'NFO') continue;
        if (segment !== 'NFO-FUT' && segment !== 'NFO-OPT') continue;
        if (
            instrumentType !== 'FUT' &&
            instrumentType !== 'CE' &&
            instrumentType !== 'PE'
        ) {
            continue;
        }
        set.add(name);
    }
    const symbols = [...set].sort();
    FNO_UNDERLYING_SYMBOLS_CACHE = { atMs: now, symbols };
    return symbols;
}

async function fetchHistoricalDayPair(accessToken, instrumentToken, sel, prev) {
    const path = `instruments/historical/${instrumentToken}/day?from=${encodeURIComponent(prev)}&to=${encodeURIComponent(sel)}`;
    const histRes = await axios.get(`https://api.kite.trade/${path}`, {
        headers: {
            'X-Kite-Version': '3',
            Authorization: `token ${API_KEY}:${accessToken}`,
        },
    });
    const candles = histRes.data?.data?.candles ?? [];
    const cPrev = findDayCandle(candles, prev);
    const cSel = findDayCandle(candles, sel);
    if (!cPrev || !cSel) return null;
    const closePrev = parseFloat(cPrev[4] ?? 0);
    const closeSel = parseFloat(cSel[4] ?? 0);
    if (!Number.isFinite(closePrev) || closePrev === 0) return null;
    const changeRs = closeSel - closePrev;
    const changePct = (changeRs / closePrev) * 100;
    return {
        last_price: closeSel,
        change_rs: changeRs,
        change_pct: Number.isFinite(changePct) ? changePct : 0,
    };
}

async function buildNifty50MarketRows(accessToken, selectedDate) {
    const todayIST = istDateString();
    const quoteMap = await fetchQuoteMap(accessToken);
    const rows = [];

    if (selectedDate === todayIST) {
        for (const symbol of NIFTY50_SYMBOLS) {
            const key = `NSE:${symbol}`;
            const q = quoteMap[key];
            if (!q) continue;
            const m = pctChangeFromQuotes(q);
            rows.push({
                symbol,
                exchange: 'NSE',
                last_price: m.last_price,
                change_pct: m.change_pct,
                change_rs: m.change_rs,
                sector: NIFTY50_SECTOR[symbol] ?? 'Others',
            });
        }
        return { source: 'quote', rows, quoteMap };
    }

    const prev = prevWeekdayIso(selectedDate);
    const concurrency = 8;
    const chunks = [];
    for (let i = 0; i < NIFTY50_SYMBOLS.length; i += concurrency) {
        chunks.push(NIFTY50_SYMBOLS.slice(i, i + concurrency));
    }

    for (const batch of chunks) {
        await Promise.all(
            batch.map(async (symbol) => {
                const key = `NSE:${symbol}`;
                const token = quoteMap[key]?.instrument_token;
                if (token == null || token === '') return;
                try {
                    const m = await fetchHistoricalDayPair(
                        accessToken,
                        token,
                        selectedDate,
                        prev
                    );
                    if (!m) return;
                    rows.push({
                        symbol,
                        exchange: 'NSE',
                        last_price: m.last_price,
                        change_pct: m.change_pct,
                        change_rs: m.change_rs,
                        sector: NIFTY50_SECTOR[symbol] ?? 'Others',
                    });
                } catch (e) {
                    console.error(symbol, e.message);
                }
            })
        );
    }

    return { source: 'historical', rows, quoteMap };
}

async function buildFnoMarketRows(accessToken, selectedDate) {
    const todayIST = istDateString();
    const quoteUniverse = await loadNseEqUniverse(accessToken);
    const fnoUnderlyingSymbols = await loadFnoUnderlyingSymbols(accessToken);
    const fnoSet = new Set(fnoUnderlyingSymbols);
    const symbols = quoteUniverse.filter((s) => fnoSet.has(s));
    const quoteMap = await fetchQuoteMapForSymbols(accessToken, symbols);
    const rows = [];

    if (selectedDate === todayIST) {
        for (const symbol of symbols) {
            const key = `NSE:${symbol}`;
            const q = quoteMap[key];
            if (!q) continue;
            const m = pctChangeFromQuotes(q);
            rows.push({
                symbol,
                exchange: 'NSE',
                last_price: m.last_price,
                change_pct: m.change_pct,
                change_rs: m.change_rs,
                sector: 'F&O',
            });
        }
        rows.sort((a, b) => b.change_pct - a.change_pct);
        return { source: 'quote', rows };
    }

    const prev = prevWeekdayIso(selectedDate);
    const concurrency = 8;
    const chunks = [];
    for (let i = 0; i < symbols.length; i += concurrency) {
        chunks.push(symbols.slice(i, i + concurrency));
    }

    for (const batch of chunks) {
        await Promise.all(
            batch.map(async (symbol) => {
                const key = `NSE:${symbol}`;
                const token = quoteMap[key]?.instrument_token;
                if (token == null || token === '') return;
                try {
                    const m = await fetchHistoricalDayPair(
                        accessToken,
                        token,
                        selectedDate,
                        prev
                    );
                    if (!m) return;
                    rows.push({
                        symbol,
                        exchange: 'NSE',
                        last_price: m.last_price,
                        change_pct: m.change_pct,
                        change_rs: m.change_rs,
                        sector: 'F&O',
                    });
                } catch (e) {
                    console.error(symbol, e.message);
                }
            })
        );
    }

    rows.sort((a, b) => b.change_pct - a.change_pct);
    return { source: 'historical', rows };
}

function aggregateSectorRows(marketRows) {
    const by = new Map();
    for (const r of marketRows) {
        const sector = NIFTY50_SECTOR[r.symbol] ?? 'Others';
        if (!by.has(sector)) {
            by.set(sector, { sum: 0, n: 0 });
        }
        const g = by.get(sector);
        g.sum += r.change_pct;
        g.n += 1;
    }
    const out = [];
    for (const [name, { sum, n }] of by.entries()) {
        out.push({
            name,
            stocks: n,
            change_pct: n > 0 ? sum / n : 0,
        });
    }
    out.sort((a, b) => b.change_pct - a.change_pct);
    return out;
}

/**
 * date=YYYY-MM-DD, type=sector|top-gainers|top-losers|5min-breakout|fno-stocks
 * Mounted at /api/market so full path is /api/market/nifty50-scanner
 */
const marketRouter = express.Router();
marketRouter.get('/nifty50-scanner', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({
            error: 'Kite API not connected. Please connect Zerodha from login page.',
        });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }

    const todayIST = istDateString();
    const rawQueryDate =
        typeof req.query.date === 'string' ? req.query.date.trim() : '';
    const selectedDate =
        normalizeCalendarYmd(rawQueryDate) || todayIST;
    const type = String(req.query.type ?? 'top-gainers');

    try {
        if (type === '5min-breakout') {
            const source = 'quote';
            const isTodayBreakout = selectedDate === todayIST;
            const breakoutRows = [];
            const breakdownRows = [];
            const errorRows = [];
            const universeModeRaw = String(req.query.universe ?? 'top-volume').trim().toLowerCase();
            const universeMode =
                universeModeRaw === 'nifty50'
                    ? 'nifty50'
                    : universeModeRaw === 'top-volume' || universeModeRaw === 'top'
                    ? 'top-volume'
                    : 'all';
            const maxSymbolsParam = parseInt(String(req.query.maxSymbols ?? ''), 10);
            const hasMaxSymbolsParam = Number.isFinite(maxSymbolsParam) && maxSymbolsParam > 0;
            const maxSymbols = hasMaxSymbolsParam
                ? Math.min(maxSymbolsParam, 1200)
                : universeMode === 'nifty50'
                ? NIFTY50_SYMBOLS.length
                : universeMode === 'top-volume'
                ? 400
                : 300;
            const universeSymbols = await loadNseEqUniverse(accessToken);
            const quoteAll = await fetchQuoteMapForSymbols(accessToken, universeSymbols);
            let scanSymbols = universeSymbols;
            if (universeMode === 'nifty50') {
                scanSymbols = NIFTY50_SYMBOLS.filter((s) => quoteAll[`NSE:${s}`]);
            } else if (universeMode === 'top-volume') {
                const ranked = universeSymbols
                    .map((s) => ({
                        symbol: s,
                        volume: parseFloat(quoteAll[`NSE:${s}`]?.volume ?? NaN),
                    }))
                    .filter((r) => Number.isFinite(r.volume) && r.volume > 0)
                    .sort((a, b) => b.volume - a.volume);
                const topN = maxSymbols;
                scanSymbols = ranked.slice(0, topN).map((r) => r.symbol);
            } else if (scanSymbols.length > maxSymbols) {
                scanSymbols = scanSymbols.slice(0, maxSymbols);
            }
            const bySymbol = new Map();
            for (const symbol of scanSymbols) {
                const q = quoteAll[`NSE:${symbol}`];
                if (!q) continue;
                const last = parseFloat(q?.last_price ?? NaN);
                const close = parseFloat(q?.ohlc?.close ?? NaN);
                const changeRs =
                    Number.isFinite(last) && Number.isFinite(close)
                        ? last - close
                        : 0;
                const changePct =
                    Number.isFinite(close) && close !== 0 && Number.isFinite(changeRs)
                        ? (changeRs / close) * 100
                        : 0;
                bySymbol.set(symbol, {
                    symbol,
                    exchange: 'NSE',
                    last_price: Number.isFinite(last) ? last : 0,
                    change_pct: Number.isFinite(changePct) ? changePct : 0,
                    change_rs: Number.isFinite(changeRs) ? changeRs : 0,
                    sector: 'Others',
                });
            }

            async function run5minBreakoutSymbol(symbol) {
                const key = `NSE:${symbol}`;
                const instrumentToken = quoteAll[key]?.instrument_token;
                if (instrumentToken == null || instrumentToken === '') {
                    errorRows.push({ symbol, reason: 'Instrument token not found' });
                    return;
                }

                let candles;
                try {
                    candles = await fetchKite5MinuteCandlesForDay(
                        accessToken,
                        instrumentToken,
                        selectedDate
                    );
                } catch (e) {
                    errorRows.push({
                        symbol,
                        reason: e.response?.data?.message || e.message || 'History error',
                    });
                    return;
                }
                if (!candles.length) {
                    errorRows.push({ symbol, reason: 'No 5-minute candles' });
                    return;
                }

                const idx915 = indexOfOpening915Bar(candles);
                if (idx915 < 0) {
                    errorRows.push({ symbol, reason: 'Missing 09:15 5-minute bar' });
                    return;
                }
                const bar915 = ohlcFromCandleRow(candles[idx915]);
                if (!bar915) {
                    errorRows.push({ symbol, reason: 'Invalid 09:15 bar OHLC' });
                    return;
                }

                let mergeLtp = null;
                if (isTodayBreakout) {
                    mergeLtp = parseFloat(quoteAll[key]?.last_price ?? '');
                    if (!Number.isFinite(mergeLtp)) mergeLtp = null;
                }

                let maxH = Number.NEGATIVE_INFINITY;
                let minL = Number.POSITIVE_INFINITY;
                let dayOpen = Number.NaN;
                let dayHigh = Number.NEGATIVE_INFINITY;
                let dayLow = Number.POSITIVE_INFINITY;
                let dayVolume = 0;
                for (let i = 0; i < candles.length; i++) {
                    const o = ohlcFromCandleRow(candles[i]);
                    if (!o) continue;
                    if (!Number.isFinite(dayOpen)) dayOpen = o.open;
                    dayHigh = Math.max(dayHigh, o.high);
                    dayLow = Math.min(dayLow, o.low);
                    if (i > idx915) {
                        maxH = Math.max(maxH, o.high);
                        minL = Math.min(minL, o.low);
                    }
                    const v = parseFloat(candles[i]?.[5] ?? NaN);
                    if (Number.isFinite(v)) dayVolume += v;
                }
                if (mergeLtp != null && Number.isFinite(mergeLtp)) {
                    maxH = Math.max(maxH, mergeLtp);
                    minL = Math.min(minL, mergeLtp);
                }

                const market = bySymbol.get(symbol);
                if (!market) return;
                const scanRef = Number.isFinite(mergeLtp) ? mergeLtp : market.last_price;
                const prevClose = market.last_price - market.change_rs;
                const valueLakhs =
                    Number.isFinite(dayVolume) && Number.isFinite(scanRef)
                        ? (dayVolume * scanRef) / 100000
                        : null;
                const base = {
                    symbol,
                    exchange: market.exchange,
                    last_price: market.last_price,
                    change_pct: market.change_pct,
                    change_rs: market.change_rs,
                    sector: market.sector,
                    first_5m_high: bar915.high,
                    first_5m_low: bar915.low,
                    prev_close: Number.isFinite(prevClose) ? prevClose : null,
                    open: Number.isFinite(dayOpen) ? dayOpen : null,
                    high: Number.isFinite(dayHigh) ? dayHigh : null,
                    low: Number.isFinite(dayLow) ? dayLow : null,
                    volume_shares: Number.isFinite(dayVolume) ? Math.round(dayVolume) : null,
                    value_lakhs: valueLakhs,
                    scan_ref: scanRef,
                };

                if (maxH > bar915.high) {
                    breakoutRows.push({
                        ...base,
                        side: 'breakout',
                        diff: scanRef - bar915.high,
                    });
                }
                if (minL < bar915.low) {
                    breakdownRows.push({
                        ...base,
                        side: 'breakdown',
                        diff: scanRef - bar915.low,
                    });
                }
            }

            const conc = 8;
            for (let i = 0; i < scanSymbols.length; i += conc) {
                const batch = scanSymbols.slice(i, i + conc);
                await Promise.all(batch.map((s) => run5minBreakoutSymbol(s)));
            }

            breakoutRows.sort((a, b) => b.diff - a.diff);
            breakdownRows.sort((a, b) => a.diff - b.diff);
            const stockRows = [...breakoutRows, ...breakdownRows];
            return res.json({
                date: selectedDate,
                source,
                sectorRows: [],
                stockRows,
                breakoutRows,
                breakdownRows,
                errorRows,
                totalSymbols: scanSymbols.length,
                universeMode,
                maxSymbols,
            });
        }

        if (type === 'fno-stocks') {
            const { source, rows } = await buildFnoMarketRows(
                accessToken,
                selectedDate
            );
            return res.json({
                date: selectedDate,
                source,
                sectorRows: [],
                stockRows: rows,
            });
        }

        const { source, rows: marketRows } =
            await buildNifty50MarketRows(accessToken, selectedDate);

        if (type === 'sector') {
            const sectorRows = aggregateSectorRows(marketRows);
            return res.json({
                date: selectedDate,
                source,
                sectorRows,
                stockRows: marketRows,
            });
        }

        let stockRows = [...marketRows];
        if (type === 'top-gainers') {
            stockRows.sort((a, b) => b.change_pct - a.change_pct);
        } else if (type === 'top-losers') {
            stockRows.sort((a, b) => a.change_pct - b.change_pct);
        }

        return res.json({
            date: selectedDate,
            source,
            sectorRows: [],
            stockRows,
        });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(error.response?.status || 500).json(
            error.response?.data || { error: error.message }
        );
    }
});
app.use('/api/market', marketRouter);

/** Multiple `i=` params like Kite quote API */
app.get('/api/kite/quote', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({
            error: 'Kite API not connected. Please connect Zerodha from login page.',
        });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }
    let instruments = req.query.i;
    if (!instruments) {
        return res.status(400).json({ error: 'Missing i parameter' });
    }
    const arr = Array.isArray(instruments) ? instruments : [instruments];
    const query = arr.map((i) => `i=${encodeURIComponent(i)}`).join('&');
    const url = `https://api.kite.trade/quote?${query}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'X-Kite-Version': '3',
                Authorization: `token ${API_KEY}:${accessToken}`,
            },
        });
        res.json(response.data);
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(error.response?.status || 500).json(
            error.response?.data || { error: error.message }
        );
    }
});

app.get('/api/kite/instruments/historical/:token/minute', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({
            error: 'Kite API not connected. Please connect Zerodha from login page.',
        });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }
    const { token } = req.params;
    const { from, to } = req.query;
    if (!from || !to) {
        return res.status(400).json({ error: 'Missing from or to' });
    }
    const path = `instruments/historical/${token}/minute?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    try {
        const response = await axios.get(`https://api.kite.trade/${path}`, {
            headers: {
                'X-Kite-Version': '3',
                Authorization: `token ${API_KEY}:${accessToken}`,
            },
        });
        res.json(response.data);
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(error.response?.status || 500).json(
            error.response?.data || { error: error.message }
        );
    }
});

app.get('/api/scan/nifty50-920-breakout', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({
            error: 'Kite API not connected. Please connect Zerodha from login page.',
        });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }

    const todayIST = istDateString();
    const rawQueryDate =
        typeof req.query.date === 'string' ? req.query.date.trim() : '';
    const selectedDate =
        normalizeCalendarYmd(rawQueryDate) || todayIST;
    const minutes = istMinutesSinceMidnight();
    const isAfterScanTime =
        selectedDate < todayIST ||
        (selectedDate === todayIST && minutes >= 9 * 60 + 21);

    if (!isAfterScanTime) {
        return res.json({
            isAfterScanTime: false,
            selectedDate,
            todayIST,
            scanRows: [],
            errorRows: [],
        });
    }

    const instruments = NIFTY50_SYMBOLS.map((s) => `NSE:${s}`);
    const q = instruments.map((i) => `i=${encodeURIComponent(i)}`).join('&');
    let quoteData = {};
    try {
        const quoteRes = await axios.get(`https://api.kite.trade/quote?${q}`, {
            headers: {
                'X-Kite-Version': '3',
                Authorization: `token ${API_KEY}:${accessToken}`,
            },
        });
        quoteData = quoteRes.data?.data ?? {};
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(error.response?.status || 500).json(
            error.response?.data || { error: error.message }
        );
    }

    const from = `${selectedDate} 09:15:00`;
    const to = `${selectedDate} 15:30:00`;
    const scanRows = [];
    const errorRows = [];
    const isToday = selectedDate === todayIST;

    for (const symbol of NIFTY50_SYMBOLS) {
        const instrumentKey = `NSE:${symbol}`;
        const instrumentToken = quoteData[instrumentKey]?.instrument_token;

        if (instrumentToken == null || instrumentToken === '') {
            errorRows.push({
                symbol,
                reason: 'Instrument token not found',
            });
            continue;
        }

        let history;
        try {
            const histPath = `instruments/historical/${instrumentToken}/minute?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            const histRes = await axios.get(
                `https://api.kite.trade/${histPath}`,
                {
                    headers: {
                        'X-Kite-Version': '3',
                        Authorization: `token ${API_KEY}:${accessToken}`,
                    },
                }
            );
            history = histRes.data;
        } catch (e) {
            errorRows.push({
                symbol,
                reason: e.response?.data?.message || e.message || 'History error',
            });
            continue;
        }

        const candles = history?.data?.candles ?? [];
        if (!candles.length) {
            errorRows.push({
                symbol,
                reason: 'No minute candles found',
            });
            continue;
        }

        const rangeBars = candles.filter((c) => {
            const t = String(c?.[0] ?? '').slice(11, 19);
            return t >= '09:15:00' && t <= '09:20:00';
        });
        if (!rangeBars.length) {
            errorRows.push({
                symbol,
                reason: 'Missing 09:15-09:20 candles',
            });
            continue;
        }
        const rangeHigh = Math.max(
            ...rangeBars.map((c) => parseFloat(c?.[2] ?? Number.NEGATIVE_INFINITY))
        );
        const rangeLow = Math.min(
            ...rangeBars.map((c) => parseFloat(c?.[3] ?? Number.POSITIVE_INFINITY))
        );
        if (!Number.isFinite(rangeHigh) || !Number.isFinite(rangeLow)) {
            errorRows.push({
                symbol,
                reason: 'Invalid 09:15-09:20 high/low',
            });
            continue;
        }

        let latestPrice = NaN;
        let priceSource = 'last_min_close';
        if (isToday) {
            latestPrice = parseFloat(quoteData[instrumentKey]?.last_price ?? NaN);
            priceSource = 'ltp';
        } else {
            latestPrice = parseFloat(candles[candles.length - 1]?.[4] ?? NaN);
        }
        if (!Number.isFinite(latestPrice)) {
            errorRows.push({
                symbol,
                reason: 'Invalid reference price',
            });
            continue;
        }

        if (latestPrice > rangeHigh || latestPrice < rangeLow) {
            const side = latestPrice > rangeHigh ? 'breakout' : 'breakdown';
            const close921 = getCandleValue(candles, '09:21:00', 4);
            const ref921 = side === 'breakout' ? rangeHigh : rangeLow;
            const pct921 =
                Number.isFinite(close921) && Number.isFinite(ref921) && ref921 !== 0
                    ? ((close921 - ref921) / ref921) * 100
                    : null;
            scanRows.push({
                symbol,
                high_920_range: rangeHigh,
                low_920_range: rangeLow,
                scan_ref: latestPrice,
                side,
                diff:
                    side === 'breakout'
                        ? latestPrice - rangeHigh
                        : latestPrice - rangeLow,
                price_source: priceSource,
                pct_921: pct921,
            });
        }
    }

    scanRows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    return res.json({
        isAfterScanTime: true,
        selectedDate,
        todayIST,
        scanRows,
        errorRows,
        totalSymbols: NIFTY50_SYMBOLS.length,
    });
});

/**
 * NIFTY 50 · 5-min candles: high of 09:15 bar, low of 09:30 bar vs LTP (today) or
 * last 5-min close (past dates).
 */
app.get('/api/scan/nifty50-930-breakout', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({
            error: 'Kite API not connected. Please connect Zerodha from login page.',
        });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }

    const todayIST = istDateString();
    const rawQueryDate =
        typeof req.query.date === 'string' ? req.query.date.trim() : '';
    const selectedDate =
        normalizeCalendarYmd(rawQueryDate) || todayIST;
    const minutes = istMinutesSinceMidnight();
    const isPastSession = selectedDate < todayIST;
    const isFutureSession = selectedDate > todayIST;
    const isAfterScanTime =
        isPastSession ||
        (selectedDate === todayIST && minutes >= 9 * 60 + 35);

    if (isFutureSession) {
        return res.json({
            isAfterScanTime: false,
            isFutureDate: true,
            selectedDate,
            todayIST,
            breakoutRows: [],
            breakdownRows: [],
            errorRows: [],
            totalSymbols: NIFTY50_SYMBOLS.length,
        });
    }

    if (!isAfterScanTime) {
        return res.json({
            isAfterScanTime: false,
            isFutureDate: false,
            selectedDate,
            todayIST,
            breakoutRows: [],
            breakdownRows: [],
            errorRows: [],
            totalSymbols: NIFTY50_SYMBOLS.length,
        });
    }

    const instruments = NIFTY50_SYMBOLS.map((s) => `NSE:${s}`);
    const q = instruments.map((i) => `i=${encodeURIComponent(i)}`).join('&');
    let quoteData = {};
    try {
        const quoteRes = await axios.get(`https://api.kite.trade/quote?${q}`, {
            headers: {
                'X-Kite-Version': '3',
                Authorization: `token ${API_KEY}:${accessToken}`,
            },
        });
        quoteData = quoteRes.data?.data ?? {};
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(error.response?.status || 500).json(
            error.response?.data || { error: error.message }
        );
    }

    const breakoutRows = [];
    const breakdownRows = [];
    const errorRows = [];
    const concurrency = 8;
    const isToday = selectedDate === todayIST;
    const caBySymbol = await fetchNseCorporateActionsBySymbol(
        selectedDate,
        NIFTY50_SYMBOLS
    );

    async function runSymbol(symbol) {
        const instrumentKey = `NSE:${symbol}`;
        const instrumentToken = quoteData[instrumentKey]?.instrument_token;

        if (instrumentToken == null || instrumentToken === '') {
            errorRows.push({
                symbol,
                reason: 'Instrument token not found',
            });
            return;
        }

        let candles;
        try {
            candles = await fetchKite5MinuteCandlesForDay(
                accessToken,
                instrumentToken,
                selectedDate
            );
        } catch (e) {
            errorRows.push({
                symbol,
                reason: e.response?.data?.message || e.message || 'History error',
            });
            return;
        }
        if (!candles.length) {
            errorRows.push({
                symbol,
                reason: 'No 5-minute candles',
            });
            return;
        }

        const rangeBars = barsBetweenTimeInclusive(candles, '09:15:00', '09:30:00');
        if (rangeBars.length === 0) {
            errorRows.push({
                symbol,
                reason: 'Missing 09:15-09:30 5-min bars',
            });
            return;
        }
        const rangeHigh = Math.max(
            ...rangeBars.map((c) => parseFloat(c?.[2] ?? Number.NEGATIVE_INFINITY))
        );
        const rangeLow = Math.min(
            ...rangeBars.map((c) => parseFloat(c?.[3] ?? Number.POSITIVE_INFINITY))
        );
        if (!Number.isFinite(rangeHigh) || !Number.isFinite(rangeLow)) {
            errorRows.push({
                symbol,
                reason: 'Invalid 09:15-09:30 high/low',
            });
            return;
        }

        const sessionOhlcv = calcSessionOhlcvFrom5m(candles);
        if (!sessionOhlcv) {
            errorRows.push({
                symbol,
                reason: 'Invalid session OHLC/volume',
            });
            return;
        }

        let latest_price;
        let priceSource;
        if (isToday) {
            const qrow = quoteData[instrumentKey];
            latest_price = parseFloat(qrow?.last_price ?? NaN);
            priceSource = 'ltp';
            if (!Number.isFinite(latest_price)) {
                errorRows.push({
                    symbol,
                    reason: 'No LTP in quote',
                });
                return;
            }
        } else {
            const lastC = candles[candles.length - 1];
            latest_price = parseFloat(lastC[4] ?? NaN);
            priceSource = 'last_5min_close';
            if (!Number.isFinite(latest_price)) {
                errorRows.push({
                    symbol,
                    reason: 'Invalid last candle close',
                });
                return;
            }
        }

        let prevClose = null;
        if (isToday) {
            const qrow = quoteData[instrumentKey] ?? {};
            const qClose = parseFloat(qrow?.ohlc?.close ?? NaN);
            if (Number.isFinite(qClose)) prevClose = qClose;
        } else {
            try {
                prevClose = await fetchPrevCloseForDay(
                    accessToken,
                    instrumentToken,
                    selectedDate
                );
            } catch {
                prevClose = null;
            }
        }

        const changePct =
            Number.isFinite(prevClose) && prevClose !== 0
                ? ((latest_price - prevClose) / prevClose) * 100
                : null;
        const valueLakhs =
            Number.isFinite(sessionOhlcv.volume) && Number.isFinite(latest_price)
                ? (sessionOhlcv.volume * latest_price) / 100000
                : null;

        const base = {
            symbol,
            high_915: rangeHigh,
            low_930: rangeLow,
            latest_price,
            price_source: priceSource,
            prev_close: prevClose,
            open: sessionOhlcv.open,
            high: sessionOhlcv.high,
            low: sessionOhlcv.low,
            volume_shares: sessionOhlcv.volume,
            value_lakhs: valueLakhs,
            ca: caBySymbol.get(symbol) ?? '-',
            scan_ref: latest_price,
            change_pct: changePct,
        };

        if (latest_price > rangeHigh) {
            breakoutRows.push({
                ...base,
                vs_high_915: latest_price - rangeHigh,
            });
        }
        if (latest_price < rangeLow) {
            breakdownRows.push({
                ...base,
                vs_low_930: latest_price - rangeLow,
            });
        }
    }

    for (let i = 0; i < NIFTY50_SYMBOLS.length; i += concurrency) {
        const batch = NIFTY50_SYMBOLS.slice(i, i + concurrency);
        await Promise.all(batch.map((symbol) => runSymbol(symbol)));
    }

    breakoutRows.sort((a, b) => b.vs_high_915 - a.vs_high_915);
    breakdownRows.sort((a, b) => a.vs_low_930 - b.vs_low_930);

    return res.json({
        isAfterScanTime: true,
        isPastSession,
        selectedDate,
        todayIST,
        breakoutRows,
        breakdownRows,
        errorRows,
        totalSymbols: NIFTY50_SYMBOLS.length,
    });
});

/**
 * NSE OI + momentum + 09:30 breakout shortlist.
 * date=YYYY-MM-DD (today or past sessions for breakout backfill).
 */
app.get('/api/scan/nse-oi-momentum-breakout', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({
            error: 'Kite API not connected. Please connect Zerodha from login page.',
        });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }

    const todayIST = istDateString();
    const rawQueryDate =
        typeof req.query.date === 'string' ? req.query.date.trim() : '';
    const selectedDate = normalizeCalendarYmd(rawQueryDate) || todayIST;
    const isToday = selectedDate === todayIST;
    const isFutureDate = selectedDate > todayIST;
    if (isFutureDate) {
        return res.json({
            selectedDate,
            todayIST,
            isFutureDate: true,
            candidates: [],
            finalPicks: [],
            meta: { oiSourceRows: 0, gainersRows: 0, losersRows: 0 },
        });
    }

    try {
        const [oiJson, gJson, lJson] = await Promise.all([
            fetchNseJson(
                'https://www.nseindia.com/api/live-analysis-oi-spurts-underlyings',
                'https://www.nseindia.com/market-data/oi-spurts'
            ),
            fetchNseJson(
                'https://www.nseindia.com/api/live-analysis-variations?index=gainers',
                'https://www.nseindia.com/market-data/top-gainers-losers'
            ),
            fetchNseJson(
                'https://www.nseindia.com/api/live-analysis-variations?index=loosers',
                'https://www.nseindia.com/market-data/top-gainers-losers'
            ),
        ]);

        const oiRowsRaw = pickRows(oiJson);
        const gainersRaw = pickRows(gJson);
        const losersRaw = pickRows(lJson);

        const oiRows = oiRowsRaw
            .map((r) => {
                const symbol = normalizeNseSymbol(
                    r?.symbol ?? r?.underlying ?? r?.name
                );
                const oiChangePct = parseFloat(
                    r?.pchangeinopeninterest ??
                        r?.pChangeInOI ??
                        r?.percChangeOI ??
                        r?.perChangeinOI ??
                        NaN
                );
                return { symbol, oiChangePct };
            })
            .filter((r) => r.symbol && Number.isFinite(r.oiChangePct));

        const gainers = gainersRaw
            .map((r) => ({
                symbol: normalizeNseSymbol(r?.symbol ?? r?.name),
                priceChangePct: parseFloat(
                    r?.pChange ?? r?.percentChange ?? r?.change ?? NaN
                ),
            }))
            .filter((r) => r.symbol && Number.isFinite(r.priceChangePct))
            .sort((a, b) => b.priceChangePct - a.priceChangePct)
            .slice(0, 3);

        const losers = losersRaw
            .map((r) => ({
                symbol: normalizeNseSymbol(r?.symbol ?? r?.name),
                priceChangePct: parseFloat(
                    r?.pChange ?? r?.percentChange ?? r?.change ?? NaN
                ),
            }))
            .filter((r) => r.symbol && Number.isFinite(r.priceChangePct))
            .sort((a, b) => a.priceChangePct - b.priceChangePct)
            .slice(0, 3);

        const oiBull = [...oiRows]
            .sort((a, b) => b.oiChangePct - a.oiChangePct)
            .slice(0, 5);
        const oiBear = [...oiRows]
            .sort((a, b) => a.oiChangePct - b.oiChangePct)
            .slice(0, 5);

        const gSet = new Set(gainers.map((x) => x.symbol));
        const lSet = new Set(losers.map((x) => x.symbol));
        const oiMap = new Map();
        for (const r of oiBull) oiMap.set(r.symbol, r.oiChangePct);
        for (const r of oiBear) oiMap.set(r.symbol, r.oiChangePct);
        for (const r of gainers) if (!oiMap.has(r.symbol)) oiMap.set(r.symbol, null);
        for (const r of losers) if (!oiMap.has(r.symbol)) oiMap.set(r.symbol, null);

        const symbols = [...oiMap.keys()];
        const quoteMap = await fetchQuoteMapForSymbols(accessToken, symbols);

        const candidates = [];
        const errorRows = [];
        for (const symbol of symbols) {
            const key = `NSE:${symbol}`;
            const token = quoteMap[key]?.instrument_token;
            if (token == null || token === '') {
                errorRows.push({ symbol, reason: 'Instrument token not found' });
                continue;
            }
            let candles;
            try {
                candles = await fetchKite5MinuteCandlesForDay(
                    accessToken,
                    token,
                    selectedDate
                );
            } catch (e) {
                errorRows.push({
                    symbol,
                    reason: e.response?.data?.message || e.message || 'History error',
                });
                continue;
            }
            if (!Array.isArray(candles) || candles.length === 0) continue;

            const rangeBars = barsBetweenTimeInclusive(candles, '09:15:00', '09:30:00');
            if (rangeBars.length === 0) continue;
            const rangeHigh = Math.max(...rangeBars.map((c) => parseFloat(c?.[2] ?? NaN)));
            const rangeLow = Math.min(...rangeBars.map((c) => parseFloat(c?.[3] ?? NaN)));
            if (!Number.isFinite(rangeHigh) || !Number.isFinite(rangeLow)) continue;

            let refPrice = NaN;
            if (isToday) {
                refPrice = parseFloat(quoteMap[key]?.last_price ?? NaN);
            } else {
                refPrice = parseFloat(candles[candles.length - 1]?.[4] ?? NaN);
            }
            if (!Number.isFinite(refPrice)) continue;

            const prevClose = isToday
                ? parseFloat(quoteMap[key]?.ohlc?.close ?? NaN)
                : await fetchPrevCloseForDay(accessToken, token, selectedDate).catch(() => null);
            const priceChangePct =
                prevClose && Number.isFinite(prevClose) && prevClose !== 0
                    ? ((refPrice - prevClose) / prevClose) * 100
                    : null;
            const session = calcSessionOhlcvFrom5m(candles);
            const volumeShares = session?.volume ?? null;

            let signal = 'WAIT';
            if (refPrice > rangeHigh) signal = 'BUY';
            else if (refPrice < rangeLow) signal = 'SELL';

            const inGainers = gSet.has(symbol);
            const inLosers = lSet.has(symbol);
            const oiChangePct = oiMap.get(symbol);
            const setup =
                inGainers && (oiChangePct ?? 0) > 0
                    ? 'Bullish Setup'
                    : inLosers && (oiChangePct ?? 0) < 0
                    ? 'Bearish Setup'
                    : 'Neutral';

            candidates.push({
                symbol,
                oiChangePct,
                priceChangePct,
                setup,
                signal,
                entry: signal === 'BUY' ? rangeHigh : signal === 'SELL' ? rangeLow : null,
                stopLoss:
                    signal === 'BUY' ? rangeLow : signal === 'SELL' ? rangeHigh : null,
                target: '5-20 points intraday',
                breakoutHigh: rangeHigh,
                breakoutLow: rangeLow,
                refPrice,
                volumeShares,
                inGainers,
                inLosers,
            });
        }

        const ranked = [...candidates].sort((a, b) => {
            const score = (x) => {
                let s = 0;
                if (x.signal !== 'WAIT') s += 5;
                if (x.inGainers || x.inLosers) s += 3;
                if (x.setup !== 'Neutral') s += 3;
                if (Number.isFinite(x.oiChangePct)) s += Math.min(4, Math.abs(x.oiChangePct) / 10);
                if (Number.isFinite(x.priceChangePct)) s += Math.min(3, Math.abs(x.priceChangePct) / 2);
                if (Number.isFinite(x.volumeShares) && x.volumeShares > 1000000) s += 2;
                return s;
            };
            return score(b) - score(a);
        });

        const finalPicks = ranked.filter((r) => r.signal !== 'WAIT').slice(0, 6);

        return res.json({
            selectedDate,
            todayIST,
            isFutureDate: false,
            candidates: ranked,
            finalPicks,
            errorRows,
            meta: {
                oiSourceRows: oiRows.length,
                gainersRows: gainersRaw.length,
                losersRows: losersRaw.length,
            },
        });
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(error.response?.status || 500).json(
            error.response?.data || { error: error.message }
        );
    }
});

/**
 * NIFTY index options (nearest / chosen expiry): ATM ± wings, CE & PE quotes,
 * simple directional bias from spot vs 09:15 5m bar or % change → Buy/Sell/Wait hints.
 */
app.get('/api/scan/nifty-option-bias', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({
            error: 'Kite API not connected. Please connect Zerodha from login page.',
        });
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }

    const headers = {
        'X-Kite-Version': '3',
        Authorization: `token ${API_KEY}:${accessToken}`,
    };

    const todayIST = istDateString();
    const wingsRaw = parseInt(String(req.query.wings ?? '5'), 10);
    const wings = Number.isFinite(wingsRaw)
        ? Math.min(12, Math.max(1, wingsRaw))
        : 5;
    const expiryOverride = normalizeCalendarYmd(
        typeof req.query.expiry === 'string' ? req.query.expiry : ''
    );

    let byExpiry;
    try {
        byExpiry = await loadNiftyNfoOptionIndex();
    } catch (e) {
        console.error(e.response?.data || e.message);
        return res.status(502).json({
            error: 'Failed to load instruments',
            detail: e.message,
        });
    }

    let availableExpiries = [...byExpiry.keys()]
        .filter((k) => k >= todayIST)
        .sort()
        .slice(0, 20);

    const expiry = pickExpiry(byExpiry, expiryOverride || '', todayIST);
    if (!expiry) {
        return res.status(502).json({ error: 'No NIFTY option expiries in index' });
    }
    if (!availableExpiries.includes(expiry)) {
        availableExpiries = [...availableExpiries, expiry].sort().slice(0, 20);
    }

    const strikeMap = byExpiry.get(expiry);
    if (!strikeMap?.size) {
        return res.status(502).json({ error: 'Empty strike map for expiry' });
    }

    const idxKey = 'NSE:NIFTY 50';
    let quoteIdx;
    try {
        const quoteRes = await axios.get(
            `https://api.kite.trade/quote?i=${encodeURIComponent(idxKey)}`,
            { headers }
        );
        quoteIdx = quoteRes.data?.data?.[idxKey];
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(error.response?.status || 502).json(
            error.response?.data || { error: error.message }
        );
    }

    const niftyLtp = parseFloat(quoteIdx?.last_price ?? NaN);
    const niftyCh = parseFloat(
        quoteIdx?.change ?? quoteIdx?.net_change ?? NaN
    );
    const indexToken = quoteIdx?.instrument_token;

    if (!Number.isFinite(niftyLtp)) {
        return res.status(502).json({ error: 'NIFTY 50 LTP unavailable' });
    }

    const prevClose =
        Number.isFinite(niftyCh) && Number.isFinite(niftyLtp)
            ? niftyLtp - niftyCh
            : niftyLtp;
    const changePct =
        prevClose !== 0 && Number.isFinite(prevClose) && Number.isFinite(niftyCh)
            ? (niftyCh / prevClose) * 100
            : null;

    const atm = Math.round(niftyLtp / 50) * 50;
    const strikes = strikesWindow(strikeMap, atm, wings);

    let bias = 'neutral';
    let biasDetail = '';

    if (indexToken != null && indexToken !== '') {
        try {
            const candles = await fetchKite5MinuteCandlesForDay(
                accessToken,
                indexToken,
                todayIST
            );
            const bar915 = get5MinuteBarAt(candles, '09:15:00');
            if (bar915) {
                if (niftyLtp > bar915.high) {
                    bias = 'bullish';
                    biasDetail = 'Spot above first 5m (09:15) high.';
                } else if (niftyLtp < bar915.low) {
                    bias = 'bearish';
                    biasDetail = 'Spot below first 5m (09:15) low.';
                } else {
                    bias = 'neutral';
                    biasDetail = 'Spot inside first 5m (09:15) range — either side possible.';
                }
            }
        } catch (_) {
            /* fall through to % change */
        }
    }

    if (!biasDetail) {
        if (changePct != null && changePct > 0.05) {
            bias = 'bullish';
            biasDetail = 'Index up vs prev. close (5m context unavailable).';
        } else if (changePct != null && changePct < -0.05) {
            bias = 'bearish';
            biasDetail = 'Index down vs prev. close (5m context unavailable).';
        } else {
            bias = 'neutral';
            biasDetail =
                changePct != null
                    ? 'Flat vs prev. close — watch both call and put sides.'
                    : 'Bias neutral — watch both sides.';
        }
    }

    if (!strikes.length) {
        return res.json({
            expiry,
            availableExpiries,
            todayIST,
            niftyLtp,
            niftyChange: Number.isFinite(niftyCh) ? niftyCh : null,
            changePct,
            atm,
            bias,
            biasDetail,
            calls: [],
            puts: [],
        });
    }

    const instKeys = [];
    for (const s of strikes) {
        const c = strikeMap.get(s);
        instKeys.push(`NFO:${c.ce.tradingsymbol}`);
        instKeys.push(`NFO:${c.pe.tradingsymbol}`);
    }
    const qUrl = `https://api.kite.trade/quote?${instKeys
        .map((k) => `i=${encodeURIComponent(k)}`)
        .join('&')}`;

    let qd = {};
    try {
        const oq = await axios.get(qUrl, { headers });
        qd = oq.data?.data ?? {};
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(error.response?.status || 502).json(
            error.response?.data || { error: error.message }
        );
    }

    function optRow(side, strike, instr, o) {
        const lp = parseFloat(o?.last_price ?? NaN);
        const oi = parseFloat(o?.oi ?? NaN);
        const vol = parseFloat(o?.volume ?? NaN);
        let indicator = 'Wait';
        let indicatorSide = 'neutral';
        if (side === 'call') {
            if (bias === 'bullish') {
                indicator = 'Buy';
                indicatorSide = 'buy';
            } else if (bias === 'bearish') {
                indicator = 'Sell';
                indicatorSide = 'sell';
            }
        } else {
            if (bias === 'bearish') {
                indicator = 'Buy';
                indicatorSide = 'buy';
            } else if (bias === 'bullish') {
                indicator = 'Sell';
                indicatorSide = 'sell';
            }
        }
        return {
            strike,
            tradingsymbol: instr.tradingsymbol,
            ltp: Number.isFinite(lp) ? lp : null,
            oi: Number.isFinite(oi) ? oi : null,
            volume: Number.isFinite(vol) ? vol : null,
            indicator,
            indicatorSide,
        };
    }

    const calls = [];
    const puts = [];
    for (const s of strikes) {
        const c = strikeMap.get(s);
        const ck = `NFO:${c.ce.tradingsymbol}`;
        const pk = `NFO:${c.pe.tradingsymbol}`;
        calls.push(optRow('call', s, c.ce, qd[ck]));
        puts.push(optRow('put', s, c.pe, qd[pk]));
    }

    return res.json({
        expiry,
        availableExpiries,
        todayIST,
        niftyLtp,
        niftyChange: Number.isFinite(niftyCh) ? niftyCh : null,
        changePct,
        atm,
        bias,
        biasDetail,
        calls,
        puts,
    });
});

// Step 1: Get Kite Connect login URL (no app JWT required — public OAuth entry).
function handleLogin(req, res) {
    if (!API_KEY) {
        return res.status(500).json({ error: 'API_KEY not configured' });
    }
    let loginUrl = `https://kite.trade/connect/login?api_key=${API_KEY}&v=3`;
    const kiteState =
        req.authUser?.id != null ? createKiteOAuthState(req.authUser.id) : null;
    if (kiteState) {
        loginUrl += `&state=${encodeURIComponent(kiteState)}`;
    }
    res.json({ url: loginUrl });
}
app.get('/api/login', handleLogin);
app.get('/login', handleLogin); // Backward-compatible alias.


// Step 2: Handle callback (exchange request_token)
async function handleCallback(req, res) {
    const request_token = req.query.request_token;
    const status = String(req.query.status || '').trim().toLowerCase();
    const action = String(req.query.action || '').trim().toLowerCase();

    // If Kite redirects user directly to backend callback URL, forward browser
    // to frontend callback so SPA can continue its normal dashboard flow.
    if (status === 'success' && action === 'login' && request_token) {
        const redirectUrl = new URL('/callback', FRONTEND_BASE_URL);
        redirectUrl.searchParams.set('request_token', String(request_token));
        redirectUrl.searchParams.set('status', 'success');
        const st = req.query.state;
        if (st) {
            redirectUrl.searchParams.set(
                'state',
                String(Array.isArray(st) ? st[0] : st)
            );
        }
        return res.redirect(302, redirectUrl.toString());
    }

    if (!request_token || !String(request_token).trim()) {
        return res.status(400).json({ error: 'request_token is required' });
    }
    const rt = String(request_token).trim();

    const rawState = req.query.state;
    const stateParam =
        typeof rawState === 'string'
            ? rawState
            : Array.isArray(rawState)
              ? rawState[0]
              : '';
    let callbackUserId = verifyKiteOAuthState(stateParam) || req.authUser?.id || null;

    if (callbackUserId) {
        await db.query(
            `UPDATE users SET kite_pending_request_token = ?, kite_pending_request_token_at = NOW() WHERE id = ?`,
            [rt, callbackUserId]
        );
    }

    try {
        const kiteData = await exchangeKiteSessionFromRequestToken(rt);

        let persistUserId = callbackUserId;
        if (!persistUserId && kiteData?.user_id) {
            const ku = String(kiteData.user_id).trim();
            if (ku) {
                const [m] = await db.query(
                    `SELECT id FROM users WHERE kite_user_id = ? LIMIT 1`,
                    [ku]
                );
                persistUserId = m?.[0]?.id ?? null;
            }
        }

        if (kiteData?.access_token) {
            // Always write to kite_global_session (id=1) so every app user gets Kite API access
            // from DB; persistUserId only controls pending clear + users.kite_user_id hint.
            await persistKiteTokensForUser(persistUserId || 0, kiteData);
        } else if (persistUserId) {
            await clearPendingKiteRequestToken(persistUserId);
        }

        res.json({
            access_token: kiteData.access_token,
            user: kiteData,
            kiteConnected: true,
        });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data || error.message });
    }
}
app.get('/api/callback', handleCallback);
app.get('/callback', handleCallback); // Backward-compatible alias.


app.get('/api/check-env', (req, res) => {
    res.json({
        api_key: process.env.API_KEY,
        api_secret: process.env.API_SECRET,
        length: process.env.API_KEY?.length,
        api_secret_length: process.env.API_SECRET?.length
    });
});

const PORT = Number(process.env.PORT) || 5000;
initDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log('Market scanner: GET /api/market/nifty50-scanner');
        });
    })
    .catch((error) => {
        console.error('Failed to initialize database:', error.message);
        process.exit(1);
    });