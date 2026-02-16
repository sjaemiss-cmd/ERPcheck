import { useEffect } from 'react'
import { useSignatureStore } from '../../store/useSignatureStore'
import { FileText, PenTool, ClipboardList, Clock } from 'lucide-react'

export function SignatureDashboard() {
    const { stats, setStats, setCurrentView, setSelectedSignatureId, loading, setLoading } = useSignatureStore()

    useEffect(() => {
        loadStats()
    }, [])

    const loadStats = async () => {
        setLoading(true)
        try {
            const data = await window.api.signature.getStats()
            setStats(data)
        } catch (err) {
            console.error('Failed to load stats:', err)
        }
        setLoading(false)
    }

    const viewSignatureDetail = (id: string) => {
        setSelectedSignatureId(id)
        setCurrentView('signatureDetail')
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">전자서명</h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => setCurrentView('forms')}
                        className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                    >
                        <FileText size={16} />
                        양식 관리
                    </button>
                    <button
                        onClick={() => setCurrentView('sign')}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                        <PenTool size={16} />
                        서명 받기
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileText size={20} className="text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">동의서 양식</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.totalForms}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <ClipboardList size={20} className="text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">총 서명 수</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.totalSignatures}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Clock size={20} className="text-purple-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">오늘 서명</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.todaySignatures}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Signatures */}
            <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900">최근 서명</h2>
                    <button
                        onClick={() => setCurrentView('signatures')}
                        className="text-sm text-blue-600 hover:text-blue-700"
                    >
                        전체 보기
                    </button>
                </div>
                {loading ? (
                    <div className="p-8 text-center text-gray-500">로딩 중...</div>
                ) : stats.recentSignatures.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                        <PenTool size={32} className="mx-auto mb-2 opacity-50" />
                        <p>아직 서명 기록이 없습니다</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-sm text-gray-500 border-b border-gray-100">
                                <th className="px-5 py-3 font-medium">고객명</th>
                                <th className="px-5 py-3 font-medium">연락처</th>
                                <th className="px-5 py-3 font-medium">동의서</th>
                                <th className="px-5 py-3 font-medium">서명일시</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.recentSignatures.map(sig => (
                                <tr
                                    key={sig.id}
                                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                                    onClick={() => viewSignatureDetail(sig.id)}
                                >
                                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{sig.customer_name}</td>
                                    <td className="px-5 py-3 text-sm text-gray-600">{sig.customer_phone}</td>
                                    <td className="px-5 py-3 text-sm text-gray-600">{sig.form_title}</td>
                                    <td className="px-5 py-3 text-sm text-gray-500">
                                        {new Date(sig.signed_at + 'Z').toLocaleString('ko-KR')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
