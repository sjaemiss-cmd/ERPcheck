import { createClient, type Client, type InValue } from '@libsql/client'
import crypto from 'crypto'

// ---------- Types ----------

export interface ConsentForm {
    id: string
    title: string
    isActive: number
    createdAt: string
    updatedAt: string
}

export interface FormVersion {
    id: string
    formId: string
    versionNumber: number
    content: string
    createdAt: string
}

export interface ConsentFormWithVersions extends ConsentForm {
    versions: FormVersion[]
    signatureCount: number
}

export interface Signature {
    id: string
    formId: string
    formVersionId: string
    customerName: string
    customerPhone: string
    signatureImage: string
    agreedContent: string
    signedAt: string
    ipAddress: string | null
    formTitle?: string
}

export interface SignatureDetail extends Signature {
    formTitle: string
    versionNumber: number
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

    constructor() {
        this.db = createClient({
            url: process.env.TURSO_DATABASE_URL || 'libsql://signature-db-gosudobong.aws-ap-northeast-1.turso.io',
            authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzAxODU2NzcsImlkIjoiZThkNmY0MmItZDVjMC00ZGMzLTkxMWUtZjA5MzlkZmMyYjRjIiwicmlkIjoiYjI0YWU3N2QtYWU1NC00ODE0LTk5YjUtYjliMTkzNDNjMmUxIn0.1MwWCsmRAM8THeJWbfpFDxIr1DWWVcTAuevGFVJx88UJrg2dzj_b3BDFq__JE4XbnWQkBOs4PxweJVwWDloEAw',
        })
    }

    private generateId(): string {
        return crypto.randomBytes(12).toString('hex')
    }

    private row<T>(r: Record<string, unknown>): T {
        return r as unknown as T
    }

    // ========== Forms ==========

    async getActiveForms(): Promise<ConsentForm[]> {
        const res = await this.db.execute(
            'SELECT * FROM consent_forms WHERE isActive = 1 ORDER BY updatedAt DESC'
        )
        return res.rows.map(r => this.row<ConsentForm>(r as Record<string, unknown>))
    }

    async getAllForms(): Promise<(ConsentForm & { versionCount: number; signatureCount: number })[]> {
        const res = await this.db.execute(`
            SELECT cf.*,
                   (SELECT COUNT(*) FROM form_versions WHERE formId = cf.id) AS versionCount,
                   (SELECT COUNT(*) FROM signatures WHERE formId = cf.id) AS signatureCount
            FROM consent_forms cf
            ORDER BY cf.updatedAt DESC
        `)
        return res.rows.map(r => this.row<ConsentForm & { versionCount: number; signatureCount: number }>(r as Record<string, unknown>))
    }

    async getFormById(id: string): Promise<ConsentFormWithVersions | null> {
        const formRes = await this.db.execute({ sql: 'SELECT * FROM consent_forms WHERE id = ?', args: [id] })
        if (formRes.rows.length === 0) return null
        const form = this.row<ConsentForm>(formRes.rows[0] as Record<string, unknown>)

        const versionsRes = await this.db.execute({
            sql: 'SELECT * FROM form_versions WHERE formId = ? ORDER BY versionNumber DESC',
            args: [id],
        })
        const versions = versionsRes.rows.map(r => this.row<FormVersion>(r as Record<string, unknown>))

        const countRes = await this.db.execute({
            sql: 'SELECT COUNT(*) AS cnt FROM signatures WHERE formId = ?',
            args: [id],
        })
        const signatureCount = Number(countRes.rows[0].cnt)

        return { ...form, versions, signatureCount }
    }

    async createForm(title: string, content: string): Promise<ConsentForm> {
        const formId = this.generateId()
        const versionId = this.generateId()
        const now = new Date().toISOString()

        await this.db.batch([
            { sql: 'INSERT INTO consent_forms (id, title, isActive, createdAt, updatedAt) VALUES (?, ?, 1, ?, ?)', args: [formId, title, now, now] },
            { sql: 'INSERT INTO form_versions (id, formId, versionNumber, content, createdAt) VALUES (?, ?, 1, ?, ?)', args: [versionId, formId, content, now] },
        ], 'write')

        const res = await this.db.execute({ sql: 'SELECT * FROM consent_forms WHERE id = ?', args: [formId] })
        return this.row<ConsentForm>(res.rows[0] as Record<string, unknown>)
    }

    async updateForm(id: string, title: string, content: string): Promise<void> {
        const formRes = await this.db.execute({ sql: 'SELECT * FROM consent_forms WHERE id = ?', args: [id] })
        if (formRes.rows.length === 0) throw new Error('양식을 찾을 수 없습니다.')

        const versionRes = await this.db.execute({
            sql: 'SELECT * FROM form_versions WHERE formId = ? ORDER BY versionNumber DESC LIMIT 1',
            args: [id],
        })
        const latestVersion = versionRes.rows.length > 0 ? this.row<FormVersion>(versionRes.rows[0] as Record<string, unknown>) : null
        const contentChanged = latestVersion?.content !== content
        const now = new Date().toISOString()

        const stmts: { sql: string; args: InValue[] }[] = [
            { sql: 'UPDATE consent_forms SET title = ?, updatedAt = ? WHERE id = ?', args: [title, now, id] },
        ]

        if (contentChanged) {
            const nextVersion = (latestVersion?.versionNumber || 0) + 1
            const versionId = this.generateId()
            stmts.push({
                sql: 'INSERT INTO form_versions (id, formId, versionNumber, content, createdAt) VALUES (?, ?, ?, ?, ?)',
                args: [versionId, id, nextVersion, content, now],
            })
        }

        await this.db.batch(stmts, 'write')
    }

    async toggleFormActive(id: string): Promise<void> {
        const now = new Date().toISOString()
        await this.db.execute({
            sql: 'UPDATE consent_forms SET isActive = CASE WHEN isActive = 1 THEN 0 ELSE 1 END, updatedAt = ? WHERE id = ?',
            args: [now, id],
        })
    }

    async deleteForm(id: string): Promise<{ error?: string }> {
        const countRes = await this.db.execute({
            sql: 'SELECT COUNT(*) AS cnt FROM signatures WHERE formId = ?',
            args: [id],
        })
        const cnt = Number(countRes.rows[0].cnt)

        if (cnt > 0) {
            return { error: `이 양식에 ${cnt}건의 서명이 있어 삭제할 수 없습니다. 비활성화를 이용해주세요.` }
        }

        await this.db.batch([
            { sql: 'DELETE FROM form_versions WHERE formId = ?', args: [id] },
            { sql: 'DELETE FROM consent_forms WHERE id = ?', args: [id] },
        ], 'write')

        return {}
    }

    // ========== Signatures ==========

    async submitSignature(data: SubmitSignatureData): Promise<{ success: boolean; error?: string }> {
        const { formId, customerName, customerPhone, signatureData } = data

        if (!customerName.trim()) return { success: false, error: '이름을 입력해주세요.' }
        if (!customerPhone.trim()) return { success: false, error: '연락처를 입력해주세요.' }
        if (!signatureData) return { success: false, error: '서명을 해주세요.' }

        const formRes = await this.db.execute({
            sql: 'SELECT * FROM consent_forms WHERE id = ? AND isActive = 1',
            args: [formId],
        })
        if (formRes.rows.length === 0) return { success: false, error: '유효하지 않은 동의서입니다.' }

        const versionRes = await this.db.execute({
            sql: 'SELECT * FROM form_versions WHERE formId = ? ORDER BY versionNumber DESC LIMIT 1',
            args: [formId],
        })
        if (versionRes.rows.length === 0) return { success: false, error: '동의서 내용을 찾을 수 없습니다.' }

        const latestVersion = this.row<FormVersion>(versionRes.rows[0] as Record<string, unknown>)
        const sigId = this.generateId()
        const now = new Date().toISOString()

        await this.db.execute({
            sql: `INSERT INTO signatures (id, formId, formVersionId, customerName, customerPhone, signatureImage, agreedContent, signedAt)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [sigId, formId, latestVersion.id, customerName.trim(), customerPhone.trim(), signatureData, latestVersion.content, now],
        })

        return { success: true }
    }

    async getSignatureById(id: string): Promise<SignatureDetail | null> {
        const res = await this.db.execute({
            sql: `SELECT s.*, cf.title AS formTitle, fv.versionNumber
                  FROM signatures s
                  JOIN consent_forms cf ON cf.id = s.formId
                  JOIN form_versions fv ON fv.id = s.formVersionId
                  WHERE s.id = ?`,
            args: [id],
        })
        if (res.rows.length === 0) return null
        return this.row<SignatureDetail>(res.rows[0] as Record<string, unknown>)
    }

    async searchSignatures(params: SearchParams): Promise<{ signatures: Signature[]; total: number; totalPages: number }> {
        const { query, formId, startDate, endDate, page = 1, limit = 20 } = params

        const conditions: string[] = []
        const bindings: InValue[] = []

        if (query) {
            conditions.push('(s.customerName LIKE ? OR s.customerPhone LIKE ?)')
            bindings.push(`%${query}%`, `%${query}%`)
        }
        if (formId) {
            conditions.push('s.formId = ?')
            bindings.push(formId)
        }
        if (startDate) {
            conditions.push('s.signedAt >= ?')
            bindings.push(startDate)
        }
        if (endDate) {
            conditions.push('s.signedAt <= ?')
            bindings.push(endDate + 'T23:59:59')
        }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
        const offset = (page - 1) * limit

        const countRes = await this.db.execute({
            sql: `SELECT COUNT(*) AS cnt FROM signatures s ${where}`,
            args: bindings,
        })
        const total = Number(countRes.rows[0].cnt)

        const res = await this.db.execute({
            sql: `SELECT s.*, cf.title AS formTitle
                  FROM signatures s
                  JOIN consent_forms cf ON cf.id = s.formId
                  ${where}
                  ORDER BY s.signedAt DESC
                  LIMIT ? OFFSET ?`,
            args: [...bindings, limit, offset],
        })
        const signatures = res.rows.map(r => this.row<Signature>(r as Record<string, unknown>))

        return { signatures, total, totalPages: Math.ceil(total / limit) }
    }

    async deleteSignature(id: string): Promise<void> {
        await this.db.execute({ sql: 'DELETE FROM signatures WHERE id = ?', args: [id] })
    }

    // ========== Stats ==========

    async getStats(): Promise<SignatureStats> {
        const today = new Date().toISOString().split('T')[0]

        const [formsRes, sigsRes, todayRes, recentRes] = await this.db.batch([
            'SELECT COUNT(*) AS cnt FROM consent_forms',
            'SELECT COUNT(*) AS cnt FROM signatures',
            { sql: "SELECT COUNT(*) AS cnt FROM signatures WHERE date(signedAt) = ?", args: [today] },
            `SELECT s.*, cf.title AS formTitle
             FROM signatures s
             JOIN consent_forms cf ON cf.id = s.formId
             ORDER BY s.signedAt DESC
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
