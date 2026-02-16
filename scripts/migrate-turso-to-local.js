/**
 * Turso 클라우드 DB → 로컬 SQLite(signature.db) 마이그레이션 스크립트
 * @libsql/client로 양쪽 모두 접근 (better-sqlite3 Electron 버전 충돌 회피)
 *
 * Usage: node scripts/migrate-turso-to-local.js
 */

const { createClient } = require('@libsql/client');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Turso 접속
const turso = createClient({
    url: 'libsql://signature-db-gosudobong.aws-ap-northeast-1.turso.io',
    authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzAxODU2NzcsImlkIjoiZThkNmY0MmItZDVjMC00ZGMzLTkxMWUtZjA5MzlkZmMyYjRjIiwicmlkIjoiYjI0YWU3N2QtYWU1NC00ODE0LTk5YjUtYjliMTkzNDNjMmUxIn0.1MwWCsmRAM8THeJWbfpFDxIr1DWWVcTAuevGFVJx88UJrg2dzj_b3BDFq__JE4XbnWQkBOs4PxweJVwWDloEAw'
});

// 로컬 SQLite (libsql로 접근)
const userDataPath = path.join(os.homedir(), '.config', 'operation-master');
fs.mkdirSync(userDataPath, { recursive: true });
const dbPath = path.join(userDataPath, 'signature.db');
console.log('Local DB path:', dbPath);

const local = createClient({ url: `file:${dbPath}` });

const formatDate = (isoStr) => {
    if (!isoStr) return null;
    return isoStr.replace('T', ' ').replace(/\.\d+\+.*$/, '');
};

async function migrate() {
    // 1. Turso에서 데이터 가져오기
    console.log('\n--- Fetching from Turso ---');
    const forms = await turso.execute('SELECT * FROM consent_forms');
    console.log(`Forms: ${forms.rows.length}`);

    const versions = await turso.execute('SELECT * FROM form_versions');
    console.log(`Versions: ${versions.rows.length}`);

    const signatures = await turso.execute('SELECT * FROM signatures');
    console.log(`Signatures: ${signatures.rows.length}`);

    // 2. 로컬 테이블 생성
    await local.execute(`
        CREATE TABLE IF NOT EXISTS consent_forms (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
    await local.execute(`
        CREATE TABLE IF NOT EXISTS form_versions (
            id TEXT PRIMARY KEY,
            form_id TEXT NOT NULL REFERENCES consent_forms(id) ON DELETE CASCADE,
            version_number INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(form_id, version_number)
        )
    `);
    await local.execute(`
        CREATE TABLE IF NOT EXISTS signatures (
            id TEXT PRIMARY KEY,
            form_id TEXT NOT NULL REFERENCES consent_forms(id) ON DELETE RESTRICT,
            form_version_id TEXT NOT NULL REFERENCES form_versions(id) ON DELETE RESTRICT,
            customer_name TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            signature_image TEXT NOT NULL,
            agreed_content TEXT NOT NULL,
            signed_at TEXT DEFAULT (datetime('now')),
            ip_address TEXT
        )
    `);

    // 3. 데이터 삽입
    console.log('\n--- Inserting into local DB ---');

    // Forms
    for (const f of forms.rows) {
        await local.execute({
            sql: 'INSERT OR REPLACE INTO consent_forms (id, title, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            args: [f.id, f.title, f.isActive ? 1 : 0, formatDate(f.createdAt), formatDate(f.updatedAt)]
        });
    }
    console.log(`Inserted ${forms.rows.length} forms`);

    // Versions
    for (const v of versions.rows) {
        await local.execute({
            sql: 'INSERT OR REPLACE INTO form_versions (id, form_id, version_number, content, created_at) VALUES (?, ?, ?, ?, ?)',
            args: [v.id, v.formId, v.versionNumber, v.content, formatDate(v.createdAt)]
        });
    }
    console.log(`Inserted ${versions.rows.length} versions`);

    // Signatures
    for (const s of signatures.rows) {
        await local.execute({
            sql: 'INSERT OR REPLACE INTO signatures (id, form_id, form_version_id, customer_name, customer_phone, signature_image, agreed_content, signed_at, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            args: [s.id, s.formId, s.formVersionId, s.customerName, s.customerPhone, s.signatureImage, s.agreedContent, formatDate(s.signedAt), s.ipAddress]
        });
    }
    console.log(`Inserted ${signatures.rows.length} signatures`);

    // 4. 확인
    const fc = await local.execute('SELECT COUNT(*) AS cnt FROM consent_forms');
    const vc = await local.execute('SELECT COUNT(*) AS cnt FROM form_versions');
    const sc = await local.execute('SELECT COUNT(*) AS cnt FROM signatures');

    console.log('\n--- Verification ---');
    console.log(`Local DB forms: ${fc.rows[0].cnt}`);
    console.log(`Local DB versions: ${vc.rows[0].cnt}`);
    console.log(`Local DB signatures: ${sc.rows[0].cnt}`);
    console.log('\nMigration complete!');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
