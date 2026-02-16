import { useState, useEffect } from 'react'
import { useSignatureStore, type ConsentForm, type ConsentFormWithVersions } from '../../store/useSignatureStore'
import SignaturePad from './SignaturePad'
import { ArrowLeft, Check } from 'lucide-react'

export function SignForm() {
    const { setCurrentView } = useSignatureStore()

    const [forms, setForms] = useState<ConsentForm[]>([])
    const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
    const [formDetail, setFormDetail] = useState<ConsentFormWithVersions | null>(null)
    const [customerName, setCustomerName] = useState('')
    const [customerPhone, setCustomerPhone] = useState('')
    const [signatureData, setSignatureData] = useState<string | null>(null)
    const [agreed, setAgreed] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        loadForms()
    }, [])

    useEffect(() => {
        if (selectedFormId) {
            loadFormDetail(selectedFormId)
        } else {
            setFormDetail(null)
        }
    }, [selectedFormId])

    const loadForms = async () => {
        try {
            const data = await window.api.signature.getActiveForms()
            setForms(data)
            if (data.length === 1) {
                setSelectedFormId(data[0].id)
            }
        } catch (err) {
            console.error('Failed to load forms:', err)
        }
    }

    const loadFormDetail = async (id: string) => {
        try {
            const data = await window.api.signature.getFormById(id)
            setFormDetail(data)
        } catch (err) {
            console.error('Failed to load form detail:', err)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (!selectedFormId || !signatureData || !agreed) return

        setSubmitting(true)
        try {
            const result = await window.api.signature.submit({
                formId: selectedFormId,
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                signatureData,
            })

            if (result.success) {
                setSuccess(true)
                setTimeout(() => {
                    resetForm()
                }, 3000)
            } else {
                setError(result.error || '서명 저장 중 오류가 발생했습니다.')
            }
        } catch (err) {
            console.error('Submit error:', err)
            setError('서명 저장 중 오류가 발생했습니다.')
        }
        setSubmitting(false)
    }

    const resetForm = () => {
        setCustomerName('')
        setCustomerPhone('')
        setSignatureData(null)
        setAgreed(false)
        setSuccess(false)
        setError('')
    }

    const canSubmit = selectedFormId && customerName.trim() && customerPhone.trim() && signatureData && agreed

    if (success) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Check size={40} className="text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-3">서명이 완료되었습니다</h2>
                    <p className="text-gray-600 mb-6">동의서 서명이 성공적으로 제출되었습니다.</p>
                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={resetForm}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            새 서명 받기
                        </button>
                        <button
                            onClick={() => setCurrentView('dashboard')}
                            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            대시보드로
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const latestVersion = formDetail?.versions[0]

    return (
        <div className="p-6 space-y-4 max-w-2xl mx-auto">
            <div className="flex items-center gap-3">
                <button onClick={() => setCurrentView('dashboard')} className="p-1.5 hover:bg-gray-100 rounded-lg">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-xl font-bold text-gray-900">서명 받기</h1>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Form Selection */}
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        동의서 선택 <span className="text-red-500">*</span>
                    </label>
                    {forms.length === 0 ? (
                        <p className="text-sm text-gray-400">활성화된 동의서가 없습니다. 양식 관리에서 먼저 생성해주세요.</p>
                    ) : (
                        <select
                            value={selectedFormId || ''}
                            onChange={e => setSelectedFormId(e.target.value || null)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        >
                            <option value="">동의서를 선택하세요</option>
                            {forms.map(form => (
                                <option key={form.id} value={form.id}>{form.title}</option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Terms Content */}
                {latestVersion && (
                    <div className="bg-white rounded-lg border border-gray-200 p-5">
                        <h2 className="text-sm font-medium text-gray-700 mb-3">약관 내용</h2>
                        <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto border border-gray-200">
                            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                                {latestVersion.content}
                            </pre>
                        </div>
                    </div>
                )}

                {/* Customer Info */}
                <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
                    <h2 className="text-sm font-medium text-gray-700">고객 정보</h2>
                    <div>
                        <label htmlFor="customer-name" className="block text-sm text-gray-600 mb-1">
                            이름 <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="customer-name"
                            type="text"
                            value={customerName}
                            onChange={e => setCustomerName(e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            placeholder="홍길동"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="customer-phone" className="block text-sm text-gray-600 mb-1">
                            연락처 <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="customer-phone"
                            type="tel"
                            value={customerPhone}
                            onChange={e => setCustomerPhone(e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            placeholder="010-1234-5678"
                            required
                        />
                    </div>
                </div>

                {/* Signature Pad */}
                {selectedFormId && (
                    <div className="bg-white rounded-lg border border-gray-200 p-5">
                        <h2 className="text-sm font-medium text-gray-700 mb-3">
                            서명 <span className="text-red-500">*</span>
                        </h2>
                        <SignaturePad onSignatureChange={setSignatureData} height={200} />
                    </div>
                )}

                {/* Agreement */}
                {selectedFormId && (
                    <div className="bg-white rounded-lg border border-gray-200 p-5">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={agreed}
                                onChange={e => setAgreed(e.target.checked)}
                                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">
                                위 약관 내용을 충분히 읽고 이해하였으며,{' '}
                                <strong className="text-gray-900">모든 내용에 동의합니다.</strong>
                            </span>
                        </label>
                    </div>
                )}

                {/* Submit */}
                <button
                    type="submit"
                    disabled={!canSubmit || submitting}
                    className="w-full py-3 text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {submitting ? (
                        <>
                            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            제출 중...
                        </>
                    ) : (
                        <>
                            <Check size={20} />
                            동의 및 제출
                        </>
                    )}
                </button>

                <p className="text-center text-xs text-gray-400">
                    서명은 법적 효력을 가지며 안전하게 보관됩니다
                </p>
            </form>
        </div>
    )
}
