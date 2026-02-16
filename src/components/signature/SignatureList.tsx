import { useState, useEffect } from 'react'
import { useSignatureStore, type ConsentForm } from '../../store/useSignatureStore'
import { ArrowLeft, Search, ChevronLeft, ChevronRight } from 'lucide-react'

export function SignatureList() {
    const { signatureSearchResults, setSignatureSearchResults, setCurrentView, setSelectedSignatureId } = useSignatureStore()

    const [forms, setForms] = useState<ConsentForm[]>([])
    const [query, setQuery] = useState('')
    const [formId, setFormId] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        loadForms()
        doSearch(1)
    }, [])

    const loadForms = async () => {
        try {
            const data = await window.api.signature.getAllForms()
            setForms(data)
        } catch (err) {
            console.error('Failed to load forms:', err)
        }
    }

    const doSearch = async (p: number) => {
        setLoading(true)
        try {
            const results = await window.api.signature.search({
                query: query || undefined,
                formId: formId || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                page: p,
                limit: 20,
            })
            setSignatureSearchResults(results)
            setPage(p)
        } catch (err) {
            console.error('Search failed:', err)
        }
        setLoading(false)
    }

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        doSearch(1)
    }

    const viewDetail = (id: string) => {
        setSelectedSignatureId(id)
        setCurrentView('signatureDetail')
    }

    const { signatures, total, totalPages } = signatureSearchResults

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
                <button onClick={() => setCurrentView('dashboard')} className="p-1.5 hover:bg-gray-100 rounded-lg">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-xl font-bold text-gray-900">서명 기록</h1>
                <span className="text-sm text-gray-500">총 {total}건</span>
            </div>

            {/* Search Filters */}
            <form onSubmit={handleSearch} className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-gray-500 mb-1">검색</label>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="이름 또는 연락처"
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>
                </div>
                <div className="min-w-[160px]">
                    <label className="block text-xs text-gray-500 mb-1">동의서</label>
                    <select
                        value={formId}
                        onChange={e => setFormId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                        <option value="">전체</option>
                        {forms.map(f => (
                            <option key={f.id} value={f.id}>{f.title}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">시작일</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">종료일</label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                </div>
                <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    검색
                </button>
            </form>

            {/* Results Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">검색 중...</div>
                ) : signatures.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">검색 결과가 없습니다</div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-sm text-gray-500 border-b border-gray-200 bg-gray-50">
                                <th className="px-5 py-3 font-medium">고객명</th>
                                <th className="px-5 py-3 font-medium">연락처</th>
                                <th className="px-5 py-3 font-medium">동의서</th>
                                <th className="px-5 py-3 font-medium">서명일시</th>
                            </tr>
                        </thead>
                        <tbody>
                            {signatures.map(sig => (
                                <tr
                                    key={sig.id}
                                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                                    onClick={() => viewDetail(sig.id)}
                                >
                                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{sig.customerName}</td>
                                    <td className="px-5 py-3 text-sm text-gray-600">{sig.customerPhone}</td>
                                    <td className="px-5 py-3 text-sm text-gray-600">{sig.formTitle}</td>
                                    <td className="px-5 py-3 text-sm text-gray-500">
                                        {new Date(sig.signedAt).toLocaleString('ko-KR')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => doSearch(page - 1)}
                        disabled={page <= 1}
                        className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <span className="text-sm text-gray-600">
                        {page} / {totalPages}
                    </span>
                    <button
                        onClick={() => doSearch(page + 1)}
                        disabled={page >= totalPages}
                        className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            )}
        </div>
    )
}
