import { useEffect, useState } from 'react'
import { useSignatureStore, type SignatureDetail as SignatureDetailType } from '../../store/useSignatureStore'
import { ArrowLeft, Printer, Trash2 } from 'lucide-react'

export function SignatureDetail() {
    const { selectedSignatureId, setCurrentView, setSelectedSignatureId } = useSignatureStore()
    const [detail, setDetail] = useState<SignatureDetailType | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (selectedSignatureId) {
            loadDetail()
        }
    }, [selectedSignatureId])

    const loadDetail = async () => {
        if (!selectedSignatureId) return
        setLoading(true)
        try {
            const data = await window.api.signature.getById(selectedSignatureId)
            setDetail(data)
        } catch (err) {
            console.error('Failed to load signature detail:', err)
        }
        setLoading(false)
    }

    const handleDelete = async () => {
        if (!detail) return
        if (!confirm(`${detail.customer_name}님의 서명을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return

        await window.api.signature.delete(detail.id)
        setSelectedSignatureId(null)
        setCurrentView('signatures')
    }

    const handlePrint = () => {
        window.print()
    }

    const handleBack = () => {
        setSelectedSignatureId(null)
        setCurrentView('signatures')
    }

    if (loading) {
        return (
            <div className="p-6 text-center text-gray-500">로딩 중...</div>
        )
    }

    if (!detail) {
        return (
            <div className="p-6 text-center text-gray-500">
                <p>서명을 찾을 수 없습니다.</p>
                <button
                    onClick={handleBack}
                    className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    목록으로
                </button>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-4 max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="p-1.5 hover:bg-gray-100 rounded-lg">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">서명 상세</h1>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handlePrint}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
                    >
                        <Printer size={16} />
                        인쇄
                    </button>
                    <button
                        onClick={handleDelete}
                        className="px-3 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-1.5"
                    >
                        <Trash2 size={16} />
                        삭제
                    </button>
                </div>
            </div>

            {/* Detail Card */}
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
                {/* Form Info */}
                <div className="p-5">
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">{detail.form_title}</h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-gray-500">약관 버전</span>
                            <p className="font-medium text-gray-900">v{detail.version_number}</p>
                        </div>
                        <div>
                            <span className="text-gray-500">서명일시</span>
                            <p className="font-medium text-gray-900">
                                {new Date(detail.signed_at + 'Z').toLocaleString('ko-KR')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Customer Info */}
                <div className="p-5">
                    <h3 className="text-sm font-medium text-gray-500 mb-3">고객 정보</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-gray-500">이름</span>
                            <p className="font-medium text-gray-900">{detail.customer_name}</p>
                        </div>
                        <div>
                            <span className="text-gray-500">연락처</span>
                            <p className="font-medium text-gray-900">{detail.customer_phone}</p>
                        </div>
                    </div>
                </div>

                {/* Agreed Content */}
                <div className="p-5">
                    <h3 className="text-sm font-medium text-gray-500 mb-3">동의 약관 내용 (서명 당시)</h3>
                    <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto border border-gray-200">
                        <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                            {detail.agreed_content}
                        </pre>
                    </div>
                </div>

                {/* Signature Image */}
                <div className="p-5">
                    <h3 className="text-sm font-medium text-gray-500 mb-3">서명</h3>
                    <div className="border border-gray-200 rounded-lg p-2 bg-white inline-block">
                        <img
                            src={detail.signature_image}
                            alt="서명 이미지"
                            className="max-w-full h-auto"
                            style={{ maxHeight: '200px' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
