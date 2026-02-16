import { createClient, type Client, type InValue } from '@libsql/client'
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
    private db: Client
    private ready: Promise<void>

    constructor() {
        const dbPath = path.join(app.getPath('userData'), 'signature.db')
        this.db = createClient({ url: `file:${dbPath}` })
        this.ready = this.initTables()
    }

    private async initTables() {
        await this.db.batch([
            `CREATE TABLE IF NOT EXISTS consent_forms (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS form_versions (
                id TEXT PRIMARY KEY,
                form_id TEXT NOT NULL REFERENCES consent_forms(id) ON DELETE CASCADE,
                version_number INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(form_id, version_number)
            )`,
            `CREATE TABLE IF NOT EXISTS signatures (
                id TEXT PRIMARY KEY,
                form_id TEXT NOT NULL REFERENCES consent_forms(id) ON DELETE RESTRICT,
                form_version_id TEXT NOT NULL REFERENCES form_versions(id) ON DELETE RESTRICT,
                customer_name TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                signature_image TEXT NOT NULL,
                agreed_content TEXT NOT NULL,
                signed_at TEXT DEFAULT (datetime('now')),
                ip_address TEXT
            )`,
            `CREATE INDEX IF NOT EXISTS idx_signatures_form_id ON signatures(form_id)`,
            `CREATE INDEX IF NOT EXISTS idx_signatures_signed_at ON signatures(signed_at)`,
            `CREATE INDEX IF NOT EXISTS idx_signatures_customer_name ON signatures(customer_name)`,
        ], 'write')
    }

    private generateId(): string {
        return crypto.randomBytes(12).toString('hex')
    }

    private row<T>(r: Record<string, unknown>): T {
        return r as unknown as T
    }

    // ========== Forms ==========

    async getActiveForms(): Promise<ConsentForm[]> {
        await this.ready
        const res = await this.db.execute(
            'SELECT * FROM consent_forms WHERE is_active = 1 ORDER BY updated_at DESC'
        )
        return res.rows.map(r => this.row<ConsentForm>(r as Record<string, unknown>))
    }

    async getAllForms(): Promise<(ConsentForm & { version_count: number; signature_count: number })[]> {
        await this.ready
        const res = await this.db.execute(`
            SELECT cf.*,
                   (SELECT COUNT(*) FROM form_versions WHERE form_id = cf.id) AS version_count,
                   (SELECT COUNT(*) FROM signatures WHERE form_id = cf.id) AS signature_count
            FROM consent_forms cf
            ORDER BY cf.updated_at DESC
        `)
        return res.rows.map(r => this.row<ConsentForm & { version_count: number; signature_count: number }>(r as Record<string, unknown>))
    }

    async getFormById(id: string): Promise<ConsentFormWithVersions | null> {
        await this.ready
        const formRes = await this.db.execute({ sql: 'SELECT * FROM consent_forms WHERE id = ?', args: [id] })
        if (formRes.rows.length === 0) return null
        const form = this.row<ConsentForm>(formRes.rows[0] as Record<string, unknown>)

        const versionsRes = await this.db.execute({
            sql: 'SELECT * FROM form_versions WHERE form_id = ? ORDER BY version_number DESC',
            args: [id],
        })
        const versions = versionsRes.rows.map(r => this.row<FormVersion>(r as Record<string, unknown>))

        const countRes = await this.db.execute({
            sql: 'SELECT COUNT(*) AS cnt FROM signatures WHERE form_id = ?',
            args: [id],
        })
        const signatureCount = Number(countRes.rows[0].cnt)

        return { ...form, versions, signature_count: signatureCount }
    }

    async createForm(title: string, content: string): Promise<ConsentForm> {
        await this.ready
        const formId = this.generateId()
        const versionId = this.generateId()

        await this.db.batch([
            { sql: 'INSERT INTO consent_forms (id, title) VALUES (?, ?)', args: [formId, title] },
            { sql: 'INSERT INTO form_versions (id, form_id, version_number, content) VALUES (?, ?, 1, ?)', args: [versionId, formId, content] },
        ], 'write')

        const res = await this.db.execute({ sql: 'SELECT * FROM consent_forms WHERE id = ?', args: [formId] })
        return this.row<ConsentForm>(res.rows[0] as Record<string, unknown>)
    }

    async updateForm(id: string, title: string, content: string): Promise<void> {
        await this.ready
        const formRes = await this.db.execute({ sql: 'SELECT * FROM consent_forms WHERE id = ?', args: [id] })
        if (formRes.rows.length === 0) throw new Error('양식을 찾을 수 없습니다.')

        const versionRes = await this.db.execute({
            sql: 'SELECT * FROM form_versions WHERE form_id = ? ORDER BY version_number DESC LIMIT 1',
            args: [id],
        })
        const latestVersion = versionRes.rows.length > 0 ? this.row<FormVersion>(versionRes.rows[0] as Record<string, unknown>) : null
        const contentChanged = latestVersion?.content !== content

        const stmts: { sql: string; args: InValue[] }[] = [
            { sql: "UPDATE consent_forms SET title = ?, updated_at = datetime('now') WHERE id = ?", args: [title, id] },
        ]

        if (contentChanged) {
            const nextVersion = (latestVersion?.version_number || 0) + 1
            const versionId = this.generateId()
            stmts.push({
                sql: 'INSERT INTO form_versions (id, form_id, version_number, content) VALUES (?, ?, ?, ?)',
                args: [versionId, id, nextVersion, content],
            })
        }

        await this.db.batch(stmts, 'write')
    }

    async toggleFormActive(id: string): Promise<void> {
        await this.ready
        await this.db.execute({
            sql: "UPDATE consent_forms SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?",
            args: [id],
        })
    }

    async deleteForm(id: string): Promise<{ error?: string }> {
        await this.ready
        const countRes = await this.db.execute({
            sql: 'SELECT COUNT(*) AS cnt FROM signatures WHERE form_id = ?',
            args: [id],
        })
        const cnt = Number(countRes.rows[0].cnt)

        if (cnt > 0) {
            return { error: `이 양식에 ${cnt}건의 서명이 있어 삭제할 수 없습니다. 비활성화를 이용해주세요.` }
        }

        await this.db.batch([
            { sql: 'DELETE FROM form_versions WHERE form_id = ?', args: [id] },
            { sql: 'DELETE FROM consent_forms WHERE id = ?', args: [id] },
        ], 'write')

        return {}
    }

    // ========== Signatures ==========

    async submitSignature(data: SubmitSignatureData): Promise<{ success: boolean; error?: string }> {
        await this.ready
        const { formId, customerName, customerPhone, signatureData } = data

        if (!customerName.trim()) return { success: false, error: '이름을 입력해주세요.' }
        if (!customerPhone.trim()) return { success: false, error: '연락처를 입력해주세요.' }
        if (!signatureData) return { success: false, error: '서명을 해주세요.' }

        const formRes = await this.db.execute({
            sql: 'SELECT * FROM consent_forms WHERE id = ? AND is_active = 1',
            args: [formId],
        })
        if (formRes.rows.length === 0) return { success: false, error: '유효하지 않은 동의서입니다.' }

        const versionRes = await this.db.execute({
            sql: 'SELECT * FROM form_versions WHERE form_id = ? ORDER BY version_number DESC LIMIT 1',
            args: [formId],
        })
        if (versionRes.rows.length === 0) return { success: false, error: '동의서 내용을 찾을 수 없습니다.' }

        const latestVersion = this.row<FormVersion>(versionRes.rows[0] as Record<string, unknown>)
        const sigId = this.generateId()

        await this.db.execute({
            sql: `INSERT INTO signatures (id, form_id, form_version_id, customer_name, customer_phone, signature_image, agreed_content)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [sigId, formId, latestVersion.id, customerName.trim(), customerPhone.trim(), signatureData, latestVersion.content],
        })

        return { success: true }
    }

    async getSignatureById(id: string): Promise<SignatureDetail | null> {
        await this.ready
        const res = await this.db.execute({
            sql: `SELECT s.*, cf.title AS form_title, fv.version_number
                  FROM signatures s
                  JOIN consent_forms cf ON cf.id = s.form_id
                  JOIN form_versions fv ON fv.id = s.form_version_id
                  WHERE s.id = ?`,
            args: [id],
        })
        if (res.rows.length === 0) return null
        return this.row<SignatureDetail>(res.rows[0] as Record<string, unknown>)
    }

    async searchSignatures(params: SearchParams): Promise<{ signatures: Signature[]; total: number; totalPages: number }> {
        await this.ready
        const { query, formId, startDate, endDate, page = 1, limit = 20 } = params

        const conditions: string[] = []
        const bindings: InValue[] = []

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

        const countRes = await this.db.execute({
            sql: `SELECT COUNT(*) AS cnt FROM signatures s ${where}`,
            args: bindings,
        })
        const total = Number(countRes.rows[0].cnt)

        const res = await this.db.execute({
            sql: `SELECT s.*, cf.title AS form_title
                  FROM signatures s
                  JOIN consent_forms cf ON cf.id = s.form_id
                  ${where}
                  ORDER BY s.signed_at DESC
                  LIMIT ? OFFSET ?`,
            args: [...bindings, limit, offset],
        })
        const signatures = res.rows.map(r => this.row<Signature>(r as Record<string, unknown>))

        return { signatures, total, totalPages: Math.ceil(total / limit) }
    }

    async deleteSignature(id: string): Promise<void> {
        await this.ready
        await this.db.execute({ sql: 'DELETE FROM signatures WHERE id = ?', args: [id] })
    }

    // ========== Stats ==========

    async getStats(): Promise<SignatureStats> {
        await this.ready
        const [formsRes, sigsRes, todayRes, recentRes] = await this.db.batch([
            'SELECT COUNT(*) AS cnt FROM consent_forms',
            'SELECT COUNT(*) AS cnt FROM signatures',
            "SELECT COUNT(*) AS cnt FROM signatures WHERE date(signed_at) = date('now')",
            `SELECT s.*, cf.title AS form_title
             FROM signatures s
             JOIN consent_forms cf ON cf.id = s.form_id
             ORDER BY s.signed_at DESC
             LIMIT 5`,
        ])

        return {
            totalForms: Number(formsRes.rows[0].cnt),
            totalSignatures: Number(sigsRes.rows[0].cnt),
            todaySignatures: Number(todayRes.rows[0].cnt),
            recentSignatures: recentRes.rows.map(r => this.row<Signature>(r as Record<string, unknown>)),
        }
    }
}
