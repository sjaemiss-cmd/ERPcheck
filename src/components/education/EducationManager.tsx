import { useState, useEffect } from 'react'
import { cn } from '../../lib/utils'
import { RefreshCw, Square, Send, Pencil, Trash2, X, Check, Plus } from 'lucide-react'
import { useEducationStore } from '../../store/useEducationStore'

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

// Helper to check if today is in history
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
    // Local UI state
    const [editingHistory, setEditingHistory] = useState<{ index: number; date: string; content: string } | null>(null)

    // Global Store State
    const {
        students, setStudents,
        selectedId, setSelectedId,
        operationTime, setOperationTime,
        loading, setLoading,
        isLoggedIn, setIsLoggedIn,
        showBrowser, setShowBrowser,
        pendingHistory, setPendingHistory,
        addPendingHistory,
        updatePendingHistory,
        deletePendingHistory
    } = useEducationStore()

    // Sync browser visibility with backend
    useEffect(() => {
        // Only call if changed or on mount? 
        // Ideally we should sync this whenever the component mounts to ensure 
        // backend state matches store state, or when store changes.
        window.api.erp.setHeadless(!showBrowser)
    }, [showBrowser])

    const selectedStudent = students.find(s => s.id === selectedId)

    const fetchData = async () => {
        console.log('[EducationManager] fetchData called')
        setLoading(true)
        try {
            // Auto Login - Only if not already tracked as logged in
            // OR if we want to ensure session is alive.
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

    // Initial Fetch on Mount (ONLY if empty)
    useEffect(() => {
        if (students.length === 0) {
            fetchData()
        }
    }, [])

    const handleStudentClick = async (student: Student) => {
        setSelectedId(student.id)
        if (!student.generalMemo && (!student.history || student.history.length === 0)) {
            try {
                const details = await window.api.erp.getStudentDetail(student.id)
                if (details.generalMemo || (details.history && details.history.length > 0)) {
                    // Note: setStudents in store expects specific type, casting if needed or ensuring type match
                    // We need to pass a function to update specific student
                    setStudents((prev) => prev.map(s =>
                        s.id === student.id ? { ...s, ...details } as Student : s
                    ))
                }
            } catch (e) {
                console.error(e)
            }
        }
    }

    const handleAddHistory = () => {
        if (!selectedId || !selectedStudent) return

        const today = new Date().toISOString().split('T')[0]
        const newItem = {
            id: Date.now().toString(), // Temporary ID for React key
            date: today,
            content: `${selectedStudent.duration}/ `
        }

        addPendingHistory(selectedId, newItem)
    }

    const handlePendingChange = (tempId: string, field: 'date' | 'content', value: string) => {
        if (!selectedId) return
        updatePendingHistory(selectedId, tempId, field, value)
    }

    const handleDeletePending = (tempId: string) => {
        if (!selectedId) return
        deletePendingHistory(selectedId, tempId)
    }

    const handleSendAll = async () => {
        // Collect all pending items across all students
        const allPendingItems: { index: number; text: string; id: string; name: string; time: string; date: string }[] = []

        students.forEach(s => {
            const pending = pendingHistory[s.id]
            if (pending && pending.length > 0) {
                pending.forEach(p => {
                    if (p.content.trim() && p.content.trim() !== `${s.duration}/`) {
                        allPendingItems.push({
                            index: s.index,
                            text: p.content,
                            id: s.id,
                            name: s.name,
                            time: s.time,
                            date: p.date
                        })
                    }
                })
            }
        })

        if (allPendingItems.length === 0) {
            alert('전송할 내용이 없습니다.')
            return
        }

        if (!confirm(`총 ${allPendingItems.length}건의 이력을 전송하시겠습니까?`)) return

        setLoading(true)
        try {
            console.log('[EducationManager] Sending batch memos:', allPendingItems)
            const results = await window.api.erp.writeMemosBatch(allPendingItems)
            console.log('[EducationManager] Batch results:', results)

            // Clear successful pending items
            setPendingHistory({})

            // Refresh Data
            const data = await window.api.erp.getTodayEducation()
            setStudents(data.students)

            alert('전송 완료되었습니다.')
        } catch (e) {
            console.error('[EducationManager] Batch send error:', e)
            alert('전송 중 오류가 발생했습니다.')
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteHistory = async (historyItem: { date: string, content: string }) => {
        if (!selectedStudent || !confirm('정말 삭제하시겠습니까?')) return
        setLoading(true)
        try {
            const success = await window.api.erp.deleteHistory(selectedStudent.id, historyItem)
            if (success) {
                alert('삭제되었습니다.')
                // Force refresh to ensure data is in sync, store will update via setStudents inside fetchData
                const data = await window.api.erp.getTodayEducation()
                setStudents(data.students)
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
                // Force refresh
                const data = await window.api.erp.getTodayEducation()
                setStudents(data.students)
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

    return (
        <div className="flex flex-col h-full bg-gray-100">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-4 flex justify-between items-center">
                <div className="flex items-center space-x-4">
                    <h2 className="text-xl font-bold text-gray-800">교육 관리</h2>
                    <span className="text-blue-600 font-bold">{operationTime}</span>
                    <span className="text-sm text-gray-500">{loading ? '작업 중...' : isLoggedIn ? '온라인' : '오프라인'}</span>
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
                    <button
                        onClick={handleSendAll}
                        disabled={loading}
                        className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                        <Send size={16} />
                        <span>일괄 전송</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Student List */}
                <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
                    {students.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                            {loading ? '데이터 로딩 중...' : '데이터 없음 (새로고침 필요)'}
                        </div>
                    ) : (
                        students.map(student => {
                            const pendingCount = pendingHistory[student.id]?.length || 0
                            return (
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
                                    <div className="mt-1 flex justify-between items-center">
                                        <span className="text-xs text-gray-400">{student.duration}시간</span>
                                        {pendingCount > 0 && (
                                            <span className="text-xs font-bold text-blue-600">
                                                +{pendingCount} 작성 중
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

                {/* Detail Panel */}
                <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
                    {selectedStudent ? (
                        <div className="flex-1 flex flex-col overflow-y-auto p-6">
                            {/* Student Header */}
                            <div className="bg-white p-6 rounded-xl shadow-sm mb-6">
                                <h3 className="text-2xl font-bold text-gray-900">{selectedStudent.name}</h3>
                                <div className="flex items-center space-x-2 mt-2 text-gray-500">
                                    <span>{selectedStudent.time}</span>
                                    <span>•</span>
                                    <span>{selectedStudent.duration}시간 과정</span>
                                </div>
                                {selectedStudent.generalMemo && (
                                    <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                                        {selectedStudent.generalMemo}
                                    </div>
                                )}
                            </div>

                            {/* History List */}
                            <div className="space-y-4 mb-6">
                                <h4 className="font-bold text-gray-700 flex items-center">
                                    <span className="mr-2">교육 이력</span>
                                    <span className="text-sm font-normal text-gray-400">({selectedStudent.history?.length || 0}건)</span>
                                </h4>

                                {/* Existing History */}
                                {selectedStudent.history?.map((h, i) => (
                                    <div key={i} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 group">
                                        {editingHistory?.index === i ? (
                                            <div className="space-y-3">
                                                <input
                                                    type="date"
                                                    value={editingHistory.date}
                                                    onChange={e => setEditingHistory({ ...editingHistory, date: e.target.value })}
                                                    className="block w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                                />
                                                <input
                                                    type="text"
                                                    value={editingHistory.content}
                                                    onChange={e => setEditingHistory({ ...editingHistory, content: e.target.value })}
                                                    className="block w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                                />
                                                <div className="flex justify-end space-x-2">
                                                    <button onClick={() => setEditingHistory(null)} className="p-2 text-gray-500 hover:bg-gray-100 rounded">
                                                        <X size={16} />
                                                    </button>
                                                    <button onClick={handleUpdateHistory} className="p-2 text-green-600 hover:bg-green-50 rounded">
                                                        <Check size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="text-sm font-medium text-blue-600 mb-1">{h.date}</div>
                                                    <div className="text-gray-800">{h.content}</div>
                                                </div>
                                                <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => setEditingHistory({ index: i, date: h.date, content: h.content })} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button onClick={() => handleDeleteHistory(h)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* Pending History (Drafts) */}
                                {pendingHistory[selectedStudent.id]?.map((item) => (
                                    <div key={item.id} className="bg-blue-50 p-4 rounded-lg border border-blue-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">New Draft</span>
                                            <button onClick={() => handleDeletePending(item.id)} className="text-gray-400 hover:text-red-500">
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            <input
                                                type="date"
                                                value={item.date}
                                                onChange={(e) => handlePendingChange(item.id, 'date', e.target.value)}
                                                className="block w-full text-sm border-gray-300 rounded bg-white focus:ring-blue-500 focus:border-blue-500"
                                            />
                                            <input
                                                type="text"
                                                value={item.content}
                                                onChange={(e) => handlePendingChange(item.id, 'content', e.target.value)}
                                                placeholder="교육 내용을 입력하세요..."
                                                className="block w-full border-gray-300 rounded bg-white focus:ring-blue-500 focus:border-blue-500"
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Add Button */}
                            <button
                                onClick={handleAddHistory}
                                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center space-x-2 font-medium"
                            >
                                <Plus size={20} />
                                <span>교육 이력 추가</span>
                            </button>

                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-500">
                            <div className="text-center">
                                <Square size={48} className="mx-auto mb-4 text-gray-300" />
                                <p>학생을 선택하여 교육 이력을 관리하세요</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
