import { useState, useEffect } from 'react'
import { cn } from '../../lib/utils'
import { RefreshCw, Save, Square, Send, Pencil, Trash2, X, Check } from 'lucide-react'

interface Student {
    id: string
    name: string
    domIdentifier?: string
    time: string
    duration: number
    status: 'pending' | 'done'
    type: string
    generalMemo?: string
    history?: { date: string; content: string }[]
    index: number
}


function hasTodayEducation(student: Student): boolean {
    if (!student.history || student.history.length === 0) return false
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const today = `${year}-${month}-${day}`
    return student.history.some(h => h.date === today)
}

export function EducationManager() {
    const [students, setStudents] = useState<Student[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [operationTime, setOperationTime] = useState('')
    const [loading, setLoading] = useState(false)
    const [drafts, setDrafts] = useState<Record<string, string>>({})
    const [showBrowser, setShowBrowser] = useState(true)
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [editingHistory, setEditingHistory] = useState<{ index: number; date: string; content: string } | null>(null)

    // Sync browser visibility with backend
    useEffect(() => {
        window.api.erp.setHeadless(!showBrowser)
    }, [showBrowser])

    const selectedStudent = students.find(s => s.id === selectedId)

    const fetchData = async () => {
        console.log('[EducationManager] fetchData called')
        setLoading(true)
        try {
            // 자동 로그인 (고정 ID/PW)
            if (!isLoggedIn) {
                console.log('[EducationManager] Auto login...')
                const loginSuccess = await window.api.erp.login({ id: 'dobong', password: '1010' })
                if (loginSuccess) {
                    setIsLoggedIn(true)
                    console.log('[EducationManager] Auto login successful')
                } else {
                    alert('자동 로그인 실패')
                    setLoading(false)
                    return
                }
            }

            console.log('[EducationManager] Calling window.api.erp.getTodayEducation()')
            const data = await window.api.erp.getTodayEducation()
            console.log('[EducationManager] Data received:', data)
            setStudents(data.students)
            setOperationTime(data.operationTime)
        } catch (e) {
            console.error('[EducationManager] Error fetching data:', e)
        } finally {
            setLoading(false)
        }
    }

    const handleStudentClick = async (student: Student) => {
        setSelectedId(student.id)
        // history가 이미 있으면 추가 fetch 불필요
        if (!student.generalMemo && (!student.history || student.history.length === 0)) {
            // Fetch details if missing
            try {
                const details = await window.api.erp.getStudentDetail(student.id)
                // 빈 데이터로 덮어쓰지 않도록 확인
                if (details.generalMemo || (details.history && details.history.length > 0)) {
                    setStudents(prev => prev.map(s =>
                        s.id === student.id ? { ...s, ...details } : s
                    ))
                }
            } catch (e) {
                console.error(e)
            }
        }
    }

    const handleSaveDraft = () => {
        if (!selectedId) return
        // alert('임시 저장되었습니다.') // 흐름 끊김 방지
        console.log('[EducationManager] Draft saved locally')
    }

    const handleSendMemo = async () => {
        if (!selectedId || !drafts[selectedId] || !selectedStudent) return
        try {
            const success = await window.api.erp.updateMemo(selectedId, drafts[selectedId], selectedStudent.name, selectedStudent.time)
            if (success) {
                alert('전송 완료')
            } else {
                alert('전송 실패 (로그 확인 필요)')
            }
        } catch (e) {
            console.error(e)
            alert('전송 중 오류 발생')
        }
    }

    const handleSendAll = async () => {
        // 작성된 메모가 있는 학생 필터링
        const memoList = students
            .map((s) => {
                const text = drafts[s.id]
                if (text && text.trim() && text.trim() !== `${s.duration}/`) {
                    return { index: s.index, text: text.trim(), id: s.id, name: s.name, time: s.time }
                }
                return null
            })
            .filter((item): item is { index: number; text: string; id: string; name: string; time: string } => item !== null)

        if (memoList.length === 0) {
            alert('전송할 내용이 없습니다.')
            return
        }

        setLoading(true)
        try {
            console.log('[EducationManager] Sending batch memos:', memoList)
            const results = await window.api.erp.writeMemosBatch(memoList)
            console.log('[EducationManager] Batch results:', results)

            // 결과 처리
            const successCount = Object.values(results).filter(v => v).length
            const failCount = Object.values(results).filter(v => !v).length

            if (failCount === 0) {
                alert(`${successCount}건 전송 완료!`)
                // 성공한 학생들의 상태 업데이트
                setStudents(prev => prev.map((s) =>
                    results[s.index] ? { ...s, status: 'done' as const } : s
                ))
            } else {
                alert(`${successCount}건 성공, ${failCount}건 실패`)
            }
        } catch (e) {
            console.error('[EducationManager] Batch send error:', e)
            alert('전송 중 오류가 발생했습니다.')
        } finally {
            setLoading(false)
        }
    }

    const handleDraftChange = (text: string) => {
        if (!selectedId) return
        setDrafts(prev => ({ ...prev, [selectedId]: text }))
    }

    const handleDeleteHistory = async (historyItem: { date: string, content: string }) => {
        if (!selectedStudent || !confirm('정말 삭제하시겠습니까?')) return
        setLoading(true)
        try {
            // Use ID for robust matching
            const success = await window.api.erp.deleteHistory(selectedStudent.id, historyItem)
            if (success) {
                alert('삭제되었습니다.')
                fetchData() // Refresh to sync
            } else {
                alert('삭제 실패')
            }
        } catch (e) {
            console.error(e)
            alert('오류 발생')
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateHistory = async () => {
        if (!selectedStudent || !editingHistory) return
        setLoading(true)
        try {
            const oldItem = selectedStudent.history![editingHistory.index]
            const newItem = { date: editingHistory.date, content: editingHistory.content }

            const success = await window.api.erp.updateHistory(selectedStudent.id, oldItem, newItem)

            if (success) {
                alert('수정되었습니다.')
                setEditingHistory(null)
                fetchData() // Refresh
            } else {
                alert('수정 실패')
            }
        } catch (e) {
            console.error(e)
            alert('오류 발생')
        } finally {
            setLoading(false)
        }
    }

    // Auto-prefix effect when selecting student
    useEffect(() => {
        if (selectedId && selectedStudent && !drafts[selectedId]) {
            const prefix = `${selectedStudent.duration}/`
            setDrafts(prev => ({ ...prev, [selectedId]: prefix }))
        }
    }, [selectedId])

    return (
        <div className="flex flex-col h-full bg-gray-100">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-4 flex justify-between items-center">
                <div className="flex items-center space-x-4">
                    <h2 className="text-xl font-bold text-gray-800">교육 관리</h2>
                    <span className="text-blue-600 font-bold">{operationTime}</span>
                    <span className="text-sm text-gray-500">{loading ? '데이터 확인 중...' : isLoggedIn ? '로그인됨' : '로그인 필요'}</span>
                </div>
                <div className="flex items-center space-x-3">
                    <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showBrowser}
                            onChange={e => setShowBrowser(e.target.checked)}
                            className="rounded text-blue-600"
                        />
                        <span>브라우저 표시</span>
                    </label>
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        <span>새로고침</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Student List */}
                <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
                    {students.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                            {loading ? '데이터 로딩 중...' : '데이터 새로고침을 눌러주세요'}
                        </div>
                    ) : (
                        students.map(student => (
                            <div
                                key={student.id}
                                onClick={() => handleStudentClick(student)}
                                className={cn(
                                    "p-4 border-b border-gray-100 cursor-pointer transition-colors",
                                    selectedId === student.id ? "bg-blue-50 border-l-4 border-l-blue-600" : "hover:bg-gray-50"
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <div className={cn(
                                            "w-3 h-3 rounded-full",
                                            (student.status === 'done' || hasTodayEducation(student)) ? "bg-green-500" : "bg-yellow-500"
                                        )} />
                                        <span className="font-medium text-gray-900">{student.name}</span>
                                    </div>
                                    <span className="text-sm text-gray-500">{student.time}</span>
                                </div>
                                <div className="mt-1 text-xs text-gray-400">
                                    {student.duration}시간
                                </div>
                                {drafts[student.id] && drafts[student.id] !== `${student.duration}/` && (
                                    <div className="mt-2 text-xs text-blue-600 truncate">
                                        ✏️ {drafts[student.id]}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Detail Panel */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {selectedStudent ? (
                        <>
                            {/* Student Info */}
                            <div className="bg-white border-b border-gray-200 p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-2xl font-bold text-gray-900">{selectedStudent.name}</h3>
                                        <p className="text-gray-500">{selectedStudent.time} • {selectedStudent.duration}시간</p>
                                    </div>
                                    <div className={cn(
                                        "px-3 py-1 rounded-full text-sm font-medium",
                                        (selectedStudent.status === 'done' || hasTodayEducation(selectedStudent))
                                            ? "bg-green-100 text-green-800"
                                            : "bg-yellow-100 text-yellow-800"
                                    )}>
                                        {(selectedStudent.status === 'done' || hasTodayEducation(selectedStudent)) ? '완료' : '대기'}
                                    </div>
                                </div>

                                {/* General Memo */}
                                {selectedStudent.generalMemo && (
                                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                                        <p className="text-sm text-gray-600">{selectedStudent.generalMemo}</p>
                                    </div>
                                )}
                            </div>

                            {/* History */}
                            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                                <h4 className="text-lg font-semibold text-gray-800 mb-4">교육 이력</h4>
                                {selectedStudent.history && selectedStudent.history.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedStudent.history.map((h, i) => (
                                            <div key={i} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 group">
                                                {editingHistory?.index === i ? (
                                                    <div className="space-y-2">
                                                        <input
                                                            type="text"
                                                            value={editingHistory.date}
                                                            onChange={e => setEditingHistory({ ...editingHistory, date: e.target.value })}
                                                            className="w-full text-sm border rounded px-2 py-1"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={editingHistory.content}
                                                            onChange={e => setEditingHistory({ ...editingHistory, content: e.target.value })}
                                                            className="w-full border rounded px-2 py-1"
                                                        />
                                                        <div className="flex justify-end space-x-2 mt-2">
                                                            <button
                                                                onClick={() => setEditingHistory(null)}
                                                                className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                            <button
                                                                onClick={handleUpdateHistory}
                                                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                            >
                                                                <Check size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <div className="text-sm text-gray-500 mb-1">{h.date}</div>
                                                            <div className="text-gray-800">{h.content}</div>
                                                        </div>
                                                        <div className="flex space-x-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => setEditingHistory({ index: i, date: h.date, content: h.content })}
                                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteHistory(h)}
                                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500">이력이 없습니다.</p>
                                )}
                            </div>

                            {/* Memo Input */}
                            <div className="bg-white border-t border-gray-200 p-4">
                                <div className="flex space-x-3">
                                    <input
                                        type="text"
                                        value={drafts[selectedStudent.id] || ''}
                                        onChange={e => handleDraftChange(e.target.value)}
                                        placeholder={`${selectedStudent.duration}/ 교육 내용 입력...`}
                                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                    <button
                                        onClick={handleSaveDraft}
                                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                                    >
                                        <Save size={18} />
                                    </button>
                                    <button
                                        onClick={handleSendMemo}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                    >
                                        <Send size={18} />
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-500">
                            <div className="text-center">
                                <Square size={48} className="mx-auto mb-4 text-gray-300" />
                                <p>학생을 선택하세요</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-gray-200 p-4 flex justify-end">
                <button
                    onClick={handleSendAll}
                    disabled={loading}
                    className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-bold flex items-center space-x-2 shadow-sm disabled:opacity-50"
                >
                    <Send size={18} />
                    <span>{loading ? '전송 중...' : '일괄 전송'}</span>
                </button>
            </div>
        </div>
    )
}
