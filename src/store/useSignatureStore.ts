import { create } from 'zustand'

export type SignatureView = 'dashboard' | 'forms' | 'formEdit' | 'sign' | 'signatures' | 'signatureDetail'

export interface ConsentForm {
    id: string
    title: string
    isActive: number
    createdAt: string
    updatedAt: string
    versionCount?: number
    signatureCount?: number
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

export interface SignatureStats {
    totalForms: number
    totalSignatures: number
    todaySignatures: number
    recentSignatures: Signature[]
}

interface SignatureState {
    currentView: SignatureView
    forms: ConsentForm[]
    selectedFormId: string | null
    selectedForm: ConsentFormWithVersions | null
    signatureSearchResults: { signatures: Signature[]; total: number; totalPages: number }
    selectedSignatureId: string | null
    selectedSignature: SignatureDetail | null
    stats: SignatureStats
    loading: boolean

    setCurrentView: (view: SignatureView) => void
    setForms: (forms: ConsentForm[]) => void
    setSelectedFormId: (id: string | null) => void
    setSelectedForm: (form: ConsentFormWithVersions | null) => void
    setSignatureSearchResults: (results: { signatures: Signature[]; total: number; totalPages: number }) => void
    setSelectedSignatureId: (id: string | null) => void
    setSelectedSignature: (sig: SignatureDetail | null) => void
    setStats: (stats: SignatureStats) => void
    setLoading: (loading: boolean) => void
}

export const useSignatureStore = create<SignatureState>((set) => ({
    currentView: 'dashboard',
    forms: [],
    selectedFormId: null,
    selectedForm: null,
    signatureSearchResults: { signatures: [], total: 0, totalPages: 0 },
    selectedSignatureId: null,
    selectedSignature: null,
    stats: { totalForms: 0, totalSignatures: 0, todaySignatures: 0, recentSignatures: [] },
    loading: false,

    setCurrentView: (view) => set({ currentView: view }),
    setForms: (forms) => set({ forms }),
    setSelectedFormId: (id) => set({ selectedFormId: id }),
    setSelectedForm: (form) => set({ selectedForm: form }),
    setSignatureSearchResults: (results) => set({ signatureSearchResults: results }),
    setSelectedSignatureId: (id) => set({ selectedSignatureId: id }),
    setSelectedSignature: (sig) => set({ selectedSignature: sig }),
    setStats: (stats) => set({ stats }),
    setLoading: (loading) => set({ loading }),
}))
