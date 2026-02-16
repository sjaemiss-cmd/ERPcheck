import { useEffect } from 'react'
import { useSignatureStore, type ConsentForm } from '../../store/useSignatureStore'
import { ArrowLeft, Plus, Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'

export function FormList() {
    const { forms, setForms, setCurrentView, setSelectedFormId, loading, setLoading } = useSignatureStore()

    useEffect(() => {
        loadForms()
    }, [])

    const loadForms = async () => {
        setLoading(true)
        try {
            const data = await window.api.signature.getAllForms()
            setForms(data)
        } catch (err) {
            console.error('Failed to load forms:', err)
        }
        setLoading(false)
    }

    const handleToggle = async (id: string) => {
        await window.api.signature.toggleFormActive(id)
        loadForms()
    }

    const handleDelete = async (form: ConsentForm & { signatureCount?: number }) => {
        if (form.signatureCount && form.signatureCount > 0) {
            alert(`이 양식에 ${form.signatureCount}건의 서명이 있어 삭제할 수 없습니다. 비활성화를 이용해주세요.`)
            return
        }
        if (!confirm(`"${form.title}" 양식을 삭제하시겠습니까?`)) return

        const result = await window.api.signature.deleteForm(form.id)
        if (result.error) {
            alert(result.error)
        } else {
            loadForms()
        }
    }

    const handleEdit = (id: string) => {
        setSelectedFormId(id)
        setCurrentView('formEdit')
    }

    const handleCreate = () => {
        setSelectedFormId(null)
        setCurrentView('formEdit')
    }

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setCurrentView('dashboard')}
                        className="p-1.5 hover:bg-gray-100 rounded-lg"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">양식 관리</h1>
                </div>
                <button
                    onClick={handleCreate}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                    <Plus size={16} />
                    새 양식
                </button>
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">로딩 중...</div>
            ) : forms.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400">
                    <p className="mb-4">등록된 양식이 없습니다</p>
                    <button
                        onClick={handleCreate}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        첫 양식 만들기
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {forms.map(form => (
                        <div key={form.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-medium text-gray-900 truncate">{form.title}</h3>
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${form.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {form.isActive ? '활성' : '비활성'}
                                    </span>
                                </div>
                                <div className="mt-1 text-sm text-gray-500 flex gap-4">
                                    <span>버전 {form.versionCount || 0}</span>
                                    <span>서명 {form.signatureCount || 0}건</span>
                                    <span>수정일 {new Date(form.updatedAt).toLocaleDateString('ko-KR')}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 ml-4">
                                <button
                                    onClick={() => handleToggle(form.id)}
                                    className="p-2 hover:bg-gray-100 rounded-lg"
                                    title={form.isActive ? '비활성화' : '활성화'}
                                >
                                    {form.isActive ? <ToggleRight size={20} className="text-green-600" /> : <ToggleLeft size={20} className="text-gray-400" />}
                                </button>
                                <button
                                    onClick={() => handleEdit(form.id)}
                                    className="p-2 hover:bg-gray-100 rounded-lg"
                                    title="수정"
                                >
                                    <Edit2 size={18} className="text-gray-600" />
                                </button>
                                <button
                                    onClick={() => handleDelete(form)}
                                    className="p-2 hover:bg-gray-100 rounded-lg"
                                    title="삭제"
                                >
                                    <Trash2 size={18} className="text-red-500" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
