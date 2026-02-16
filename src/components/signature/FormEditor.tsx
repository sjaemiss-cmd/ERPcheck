import { useState, useEffect } from 'react'
import { useSignatureStore } from '../../store/useSignatureStore'
import { ArrowLeft, Save } from 'lucide-react'

export function FormEditor() {
    const { selectedFormId, setCurrentView, setSelectedFormId } = useSignatureStore()
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const isEditing = !!selectedFormId

    useEffect(() => {
        if (selectedFormId) {
            loadForm()
        }
    }, [selectedFormId])

    const loadForm = async () => {
        if (!selectedFormId) return
        setLoading(true)
        try {
            const form = await window.api.signature.getFormById(selectedFormId)
            if (form) {
                setTitle(form.title)
                const latestVersion = form.versions[0]
                setContent(latestVersion?.content || '')
            }
        } catch (err) {
            console.error('Failed to load form:', err)
        }
        setLoading(false)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (!title.trim()) {
            setError('제목을 입력해주세요.')
            return
        }
        if (content.trim().length < 10) {
            setError('약관 내용은 10자 이상이어야 합니다.')
            return
        }

        setLoading(true)
        try {
            if (isEditing) {
                await window.api.signature.updateForm(selectedFormId!, title.trim(), content.trim())
            } else {
                await window.api.signature.createForm(title.trim(), content.trim())
            }
            setSelectedFormId(null)
            setCurrentView('forms')
        } catch (err) {
            console.error('Failed to save form:', err)
            setError('양식 저장 중 오류가 발생했습니다.')
        }
        setLoading(false)
    }

    const handleBack = () => {
        setSelectedFormId(null)
        setCurrentView('forms')
    }

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
                <button onClick={handleBack} className="p-1.5 hover:bg-gray-100 rounded-lg">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-xl font-bold text-gray-900">
                    {isEditing ? '양식 수정' : '새 양식 만들기'}
                </h1>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
                    <div>
                        <label htmlFor="form-title" className="block text-sm font-medium text-gray-700 mb-1">
                            제목 <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="form-title"
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            placeholder="동의서 제목"
                            maxLength={100}
                        />
                    </div>

                    <div>
                        <label htmlFor="form-content" className="block text-sm font-medium text-gray-700 mb-1">
                            약관 내용 <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            id="form-content"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono leading-relaxed"
                            rows={16}
                            placeholder="약관 내용을 입력하세요..."
                        />
                        <p className="mt-1 text-xs text-gray-400">
                            {isEditing && '내용 변경 시 새 버전이 자동으로 생성됩니다. 기존 서명의 약관 내용은 보존됩니다.'}
                        </p>
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={handleBack}
                        className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        취소
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        <Save size={16} />
                        {loading ? '저장 중...' : isEditing ? '수정 완료' : '양식 생성'}
                    </button>
                </div>
            </form>
        </div>
    )
}
