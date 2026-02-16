import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import crypto from 'crypto'

// ---------- Types ----------

export interface ConsentForm {
    id: string
    title: string
    is_active: number
    created_at: string
    updated_at: string
}

export interface FormVersion {
    id: string
    form_id: string
    version_number: number
    content: string
    created_at: string
}

export interface ConsentFormWithVersions extends ConsentForm {
    versions: FormVersion[]
    signature_count: number
}

export interface Signature {
    id: string
    form_id: string
    form_version_id: string
    customer_name: string
    customer_phone: string
    signature_image: string
    agreed_content: string
    signed_at: string
    ip_address: string | null
    form_title?: string
}

export interface SignatureDetail extends Signature {
    form_title: string
    version_number: number
}

export interface SubmitSignatureData {
    formId: string
    customerName: string
    customerPhone: string
    signatureData: string
}

export interface SearchParams {
    query?: string
    formId?: string
    startDate?: string
    endDate?: string
    page?: number
    limit?: number
}

export interface SignatureStats {
    totalForms: number
    totalSignatures: number
    todaySignatures: number
    recentSignatures: Signature[]
}

// ---------- Service ----------

export class SignatureService {
    private db: Database.Database

    constructor() {
        const dbPath = path.join(app.getPath('userData'), 'signature.db')
        this.db = new Database(dbPath)
        this.db.pragma('journal_mode = WAL')
        this.db.pragma('foreign_keys = ON')
        this.initTables()
    }

    private initTables() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS consent_forms (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS form_versions (
                id TEXT PRIMARY KEY,
                form_id TEXT NOT NULL REFERENCES consent_forms(id) ON DELETE CASCADE,
                version_number INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(form_id, version_number)
            );

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
            );

            CREATE INDEX IF NOT EXISTS idx_signatures_form_id ON signatures(form_id);
            CREATE INDEX IF NOT EXISTS idx_signatures_signed_at ON signatures(signed_at);
            CREATE INDEX IF NOT EXISTS idx_signatures_customer_name ON signatures(customer_name);
        `)
    }

    private generateId(): string {
        return crypto.randomBytes(12).toString('hex')
    }

    // ========== Forms ==========

    getActiveForms(): ConsentForm[] {
        return this.db.prepare(
            'SELECT * FROM consent_forms WHERE is_active = 1 ORDER BY updated_at DESC'
        ).all() as ConsentForm[]
    }

    getAllForms(): (ConsentForm & { version_count: number; signature_count: number })[] {
        return this.db.prepare(`
            SELECT cf.*,
                   (SELECT COUNT(*) FROM form_versions WHERE form_id = cf.id) AS version_count,
                   (SELECT COUNT(*) FROM signatures WHERE form_id = cf.id) AS signature_count
            FROM consent_forms cf
            ORDER BY cf.updated_at DESC
        `).all() as (ConsentForm & { version_count: number; signature_count: number })[]
    }

    getFormById(id: string): ConsentFormWithVersions | null {
        const form = this.db.prepare('SELECT * FROM consent_forms WHERE id = ?').get(id) as ConsentForm | undefined
        if (!form) return null

        const versions = this.db.prepare(
            'SELECT * FROM form_versions WHERE form_id = ? ORDER BY version_number DESC'
        ).all(id) as FormVersion[]

        const signatureCount = this.db.prepare(
            'SELECT COUNT(*) AS cnt FROM signatures WHERE form_id = ?'
        ).get(id) as { cnt: number }

        return { ...form, versions, signature_count: signatureCount.cnt }
    }

    createForm(title: string, content: string): ConsentForm {
        const formId = this.generateId()
        const versionId = this.generateId()

        const insertForm = this.db.prepare(
            'INSERT INTO consent_forms (id, title) VALUES (?, ?)'
        )
        const insertVersion = this.db.prepare(
            'INSERT INTO form_versions (id, form_id, version_number, content) VALUES (?, ?, 1, ?)'
        )

        this.db.transaction(() => {
            insertForm.run(formId, title)
            insertVersion.run(versionId, formId, content)
        })()

        return this.db.prepare('SELECT * FROM consent_forms WHERE id = ?').get(formId) as ConsentForm
    }

    updateForm(id: string, title: string, content: string): void {
        const form = this.db.prepare('SELECT * FROM consent_forms WHERE id = ?').get(id) as ConsentForm | undefined
        if (!form) throw new Error('양식을 찾을 수 없습니다.')

        const latestVersion = this.db.prepare(
            'SELECT * FROM form_versions WHERE form_id = ? ORDER BY version_number DESC LIMIT 1'
        ).get(id) as FormVersion | undefined

        const contentChanged = latestVersion?.content !== content

        this.db.transaction(() => {
            this.db.prepare(
                "UPDATE consent_forms SET title = ?, updated_at = datetime('now') WHERE id = ?"
            ).run(title, id)

            if (contentChanged) {
                const nextVersion = (latestVersion?.version_number || 0) + 1
                const versionId = this.generateId()
                this.db.prepare(
                    'INSERT INTO form_versions (id, form_id, version_number, content) VALUES (?, ?, ?, ?)'
                ).run(versionId, id, nextVersion, content)
            }
        })()
    }

    toggleFormActive(id: string): void {
        this.db.prepare(
            "UPDATE consent_forms SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?"
        ).run(id)
    }

    deleteForm(id: string): { error?: string } {
        const sigCount = this.db.prepare(
            'SELECT COUNT(*) AS cnt FROM signatures WHERE form_id = ?'
        ).get(id) as { cnt: number }

        if (sigCount.cnt > 0) {
            return { error: `이 양식에 ${sigCount.cnt}건의 서명이 있어 삭제할 수 없습니다. 비활성화를 이용해주세요.` }
        }

        this.db.transaction(() => {
            this.db.prepare('DELETE FROM form_versions WHERE form_id = ?').run(id)
            this.db.prepare('DELETE FROM consent_forms WHERE id = ?').run(id)
        })()

        return {}
    }

    // ========== Signatures ==========

    submitSignature(data: SubmitSignatureData): { success: boolean; error?: string } {
        const { formId, customerName, customerPhone, signatureData } = data

        if (!customerName.trim()) return { success: false, error: '이름을 입력해주세요.' }
        if (!customerPhone.trim()) return { success: false, error: '연락처를 입력해주세요.' }
        if (!signatureData) return { success: false, error: '서명을 해주세요.' }

        const form = this.db.prepare(
            'SELECT * FROM consent_forms WHERE id = ? AND is_active = 1'
        ).get(formId) as ConsentForm | undefined

        if (!form) return { success: false, error: '유효하지 않은 동의서입니다.' }

        const latestVersion = this.db.prepare(
            'SELECT * FROM form_versions WHERE form_id = ? ORDER BY version_number DESC LIMIT 1'
        ).get(formId) as FormVersion | undefined

        if (!latestVersion) return { success: false, error: '동의서 내용을 찾을 수 없습니다.' }

        const sigId = this.generateId()

        this.db.prepare(`
            INSERT INTO signatures (id, form_id, form_version_id, customer_name, customer_phone, signature_image, agreed_content)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(sigId, formId, latestVersion.id, customerName.trim(), customerPhone.trim(), signatureData, latestVersion.content)

        return { success: true }
    }

    getSignatureById(id: string): SignatureDetail | null {
        return this.db.prepare(`
            SELECT s.*, cf.title AS form_title, fv.version_number
            FROM signatures s
            JOIN consent_forms cf ON cf.id = s.form_id
            JOIN form_versions fv ON fv.id = s.form_version_id
            WHERE s.id = ?
        `).get(id) as SignatureDetail | null
    }

    searchSignatures(params: SearchParams): { signatures: Signature[]; total: number; totalPages: number } {
        const { query, formId, startDate, endDate, page = 1, limit = 20 } = params

        const conditions: string[] = []
        const bindings: unknown[] = []

        if (query) {
            conditions.push('(s.customer_name LIKE ? OR s.customer_phone LIKE ?)')
            bindings.push(`%${query}%`, `%${query}%`)
        }

        if (formId) {
            conditions.push('s.form_id = ?')
            bindings.push(formId)
        }

        if (startDate) {
            conditions.push('s.signed_at >= ?')
            bindings.push(startDate)
        }

        if (endDate) {
            conditions.push('s.signed_at <= ?')
            bindings.push(endDate + ' 23:59:59')
        }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
        const offset = (page - 1) * limit

        const total = (this.db.prepare(
            `SELECT COUNT(*) AS cnt FROM signatures s ${where}`
        ).get(...bindings) as { cnt: number }).cnt

        const signatures = this.db.prepare(`
            SELECT s.*, cf.title AS form_title
            FROM signatures s
            JOIN consent_forms cf ON cf.id = s.form_id
            ${where}
            ORDER BY s.signed_at DESC
            LIMIT ? OFFSET ?
        `).all(...bindings, limit, offset) as Signature[]

        return {
            signatures,
            total,
            totalPages: Math.ceil(total / limit),
        }
    }

    deleteSignature(id: string): void {
        this.db.prepare('DELETE FROM signatures WHERE id = ?').run(id)
    }

    // ========== Stats ==========

    getStats(): SignatureStats {
        const totalForms = (this.db.prepare('SELECT COUNT(*) AS cnt FROM consent_forms').get() as { cnt: number }).cnt
        const totalSignatures = (this.db.prepare('SELECT COUNT(*) AS cnt FROM signatures').get() as { cnt: number }).cnt
        const todaySignatures = (this.db.prepare(
            "SELECT COUNT(*) AS cnt FROM signatures WHERE date(signed_at) = date('now')"
        ).get() as { cnt: number }).cnt

        const recentSignatures = this.db.prepare(`
            SELECT s.*, cf.title AS form_title
            FROM signatures s
            JOIN consent_forms cf ON cf.id = s.form_id
            ORDER BY s.signed_at DESC
            LIMIT 5
        `).all() as Signature[]

        return { totalForms, totalSignatures, todaySignatures, recentSignatures }
    }
}
