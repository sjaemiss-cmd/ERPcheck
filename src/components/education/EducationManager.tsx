import { useState, useEffect } from 'react'
import { cn } from '../../lib/utils'
import { RefreshCw, Square, Send, Pencil, Trash2, X, Check, Plus, ChevronLeft, ChevronRight, Calendar, Clock, UserX, UserCheck, Ban } from 'lucide-react'
import { useEducationStore, type Student } from '../../store/useEducationStore'

// Helper to check if the selected date has education history
function hasEducationOnDate(student: Student, targetDate: string): boolean {
    if (!student.history || student.history.length === 0) return false
    return student.history.some(h => h.date === targetDate)
}

export function EducationManager() {
    // Local UI state
    const [editingHistory, setEditingHistory] = useState<{ index: number; date: string; content: string } | null>(null)
    const [isUpdatingReservation, setIsUpdatingReservation] = useState(false)
    const [updateForm, setUpdateForm] = useState({ startTime: '', endTime: '', machine: '' })


    // Global Store State
    const {
        students, setStudents,
        selectedId, setSelectedId,
        selectedDate, setSelectedDate,
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

    const fetchData = async (targetDate?: string) => {
        const dateToFetch = targetDate || selectedDate
        console.log(`[EducationManager] fetchData called for date: ${dateToFetch}`)
        setLoading(true)
        try {
            // Auto Login - Only if not already tracked as logged in
            // OR if we want to ensure session is alive.
            if (!isLoggedIn) {
                console.log('[EducationManager] Auto login...')
                const creds = await window.api.settings.getCredentials().catch(() => ({ id: '', password: '' }))
                const loginSuccess = await window.api.erp.login({ id: creds.id, password: creds.password })
                if (loginSuccess) {
                    setIsLoggedIn(true)
                    console.log('[EducationManager] Auto login successful')
                } else {
                    alert('ERP 로그인 실패: 설정에서 아이디/비밀번호를 저장해주세요.')
                    setLoading(false)
                    return
                }
            }

            console.log(`[EducationManager] Calling window.api.erp.getEducationByDate(${dateToFetch})`)
            const data = await window.api.erp.getEducationByDate(dateToFetch)
            console.log('[EducationManager] Data received:', data)
            setStudents(data.students)
            setOperationTime(data.operationTime)
        } catch (e) {
            console.error('[EducationManager] Error fetching data:', e)
        } finally {
            setLoading(false)
        }
    }

    // Date navigation helpers
    const changeDate = (days: number) => {
        const current = new Date(selectedDate)
        current.setDate(current.getDate() + days)
        const newDate = current.toISOString().split('T')[0]
        setSelectedDate(newDate)
        setStudents([]) // Clear students when date changes
        setSelectedId(null)
        fetchData(newDate)
    }

    const goToToday = () => {
        const today = new Date().toISOString().split('T')[0]
        setSelectedDate(today)
        setStudents([])
        setSelectedId(null)
        fetchData(today)
    }

    // Initial Fetch on Mount (ONLY if empty)
    useEffect(() => {
        if (students.length === 0) {
            fetchData(selectedDate)
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

    const ensureLoggedIn = async () => {
        if (isLoggedIn) return true
        const creds = await window.api.settings.getCredentials()
        const ok = await window.api.erp.login({ id: creds.id, password: creds.password })
        setIsLoggedIn(ok)
        return ok
    }

    const initUpdateForm = () => {
        if (!selectedStudent) return
        const start = selectedStudent.time
        const [h, m] = start.split(':').map(Number)
        const endH = (h + (selectedStudent.duration || 1)) % 24
        const end = `${String(endH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
        setUpdateForm({ startTime: start, endTime: end, machine: '' })
        setIsUpdatingReservation(true)
    }

    const refreshAfterReservationAction = async () => {
        const data = await window.api.erp.getEducationByDate(selectedDate)
        setStudents(data.students)
    }

    const handleReservationCancel = async () => {
        if (!selectedStudent) return
        if (!confirm('예약을 취소(삭제)하시겠습니까?')) return
        setLoading(true)
        try {
            if (!(await ensureLoggedIn())) {
                alert('ERP 로그인 실패')
                return
            }
            const ok = await window.api.erp.cancelReservation(selectedStudent.id, selectedDate)
            if (!ok) {
                alert('예약 취소 실패')
                return
            }
            await refreshAfterReservationAction()
            alert('예약이 취소(삭제)되었습니다.')
        } catch (e) {
            console.error(e)
            alert('오류 발생')
        } finally {
            setLoading(false)
        }
    }

    const handleReservationAbsent = async () => {
        if (!selectedStudent) return
        if (!confirm('결석 처리하시겠습니까?')) return
        setLoading(true)
        try {
            if (!(await ensureLoggedIn())) {
                alert('ERP 로그인 실패')
                return
            }
            const ok = await window.api.erp.markAbsent(selectedStudent.id, selectedDate)
            if (!ok) {
                alert('결석 처리 실패')
                return
            }
            await refreshAfterReservationAction()
            alert('결석 처리되었습니다.')
        } catch (e) {
            console.error(e)
            alert('오류 발생')
        } finally {
            setLoading(false)
        }
    }

    const handleReservationUnmarkAbsent = async () => {
        if (!selectedStudent) return
        if (!confirm('결석 처리를 취소하시겠습니까?')) return
        setLoading(true)
        try {
            if (!(await ensureLoggedIn())) {
                alert('ERP 로그인 실패')
                return
            }
            const ok = await window.api.erp.unmarkAbsent(selectedStudent.id, selectedDate)
            if (!ok) {
                alert('결석 취소 실패')
                return
            }
            await refreshAfterReservationAction()
            alert('결석 처리가 취소되었습니다.')
        } catch (e) {
            console.error(e)
            alert('오류 발생')
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateSubmit = async () => {
        if (!selectedStudent) return
        if (!updateForm.startTime || !updateForm.endTime) {
            alert('시작/종료 시간을 입력하세요.')
            return
        }

        setLoading(true)
        try {
            if (!(await ensureLoggedIn())) {
                alert('ERP 로그인 실패')
                return
            }

            const updates = {
                startTime: updateForm.startTime,
                endTime: updateForm.endTime,
                machineValue: updateForm.machine ? updateForm.machine : undefined
            }

            const ok = await window.api.erp.updateReservation(selectedStudent.id, selectedDate, updates)
            if (!ok) {
                alert('예약 수정 실패')
                return
            }

            setIsUpdatingReservation(false)
            await refreshAfterReservationAction()
            alert('예약이 수정되었습니다.')
        } catch (e) {
            console.error(e)
            alert('오류 발생')
        } finally {
            setLoading(false)
        }
    }

    const handleAddHistory = () => {
        if (!selectedId || !selectedStudent) return

        const newItem = {
            id: Date.now().toString(), // Temporary ID for React key
            date: selectedDate,
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
            const data = await window.api.erp.getEducationByDate(selectedDate)
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
                const data = await window.api.erp.getEducationByDate(selectedDate)
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
                const data = await window.api.erp.getEducationByDate(selectedDate)
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
            <div className="bg-white border-b border-gray-200 p-4">
                <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                        <h2 className="text-xl font-bold text-gray-800">교육일지</h2>
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
                            onClick={() => fetchData()}
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
                {/* Date Selector */}
                <div className="flex items-center space-x-3 mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center space-x-1">
                        <button
                            onClick={() => changeDate(-1)}
                            disabled={loading}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                            title="이전 날"
                        >
                            <ChevronLeft size={20} className="text-gray-600" />
                        </button>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => {
                                const newDate = e.target.value
                                setSelectedDate(newDate)
                                setStudents([])
                                setSelectedId(null)
                                fetchData(newDate)
                            }}
                            disabled={loading}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <button
                            onClick={() => changeDate(1)}
                            disabled={loading}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                            title="다음 날"
                        >
                            <ChevronRight size={20} className="text-gray-600" />
                        </button>
                    </div>
                    <button
                        onClick={goToToday}
                        disabled={loading}
                        className="flex items-center space-x-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                        <Calendar size={16} />
                        <span>오늘</span>
                    </button>
                    {operationTime && (
                        <span className="text-blue-600 font-bold ml-2">운영 시간: {operationTime}</span>
                    )}
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
                                                (student.status === 'done' || hasEducationOnDate(student, selectedDate)) ? "bg-green-500" : "bg-yellow-500"
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

                                {/* Reservation Actions */}
                                <div className="mt-6 pt-6 border-t border-gray-100">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">예약 관리</h4>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={initUpdateForm}
                                            disabled={loading}
                                            className="flex items-center space-x-1 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors text-sm"
                                        >
                                            <Clock size={16} className="text-blue-500" />
                                            <span>시간/기기 변경</span>
                                        </button>
                                        <button
                                            onClick={handleReservationAbsent}
                                            disabled={loading}
                                            className="flex items-center space-x-1 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition-colors text-sm"
                                        >
                                            <UserX size={16} className="text-orange-500" />
                                            <span>결석 처리</span>
                                        </button>
                                        <button
                                            onClick={handleReservationUnmarkAbsent}
                                            disabled={loading}
                                            className="flex items-center space-x-1 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-green-50 hover:border-green-200 hover:text-green-700 transition-colors text-sm"
                                        >
                                            <UserCheck size={16} className="text-green-500" />
                                            <span>결석 취소</span>
                                        </button>
                                        <button
                                            onClick={handleReservationCancel}
                                            disabled={loading}
                                            className="flex items-center space-x-1 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors text-sm ml-auto"
                                        >
                                            <Ban size={16} className="text-red-500" />
                                            <span>예약 취소(삭제)</span>
                                        </button>
                                    </div>

                                    {isUpdatingReservation && (
                                        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 animate-in slide-in-from-top-2">
                                            <div className="flex justify-between items-center mb-3">
                                                <span className="text-sm font-bold text-gray-700">예약 정보 수정</span>
                                                <button onClick={() => setIsUpdatingReservation(false)} className="text-gray-400 hover:text-gray-600">
                                                    <X size={16} />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 mb-3">
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">시작 시간</label>
                                                    <input
                                                        type="time"
                                                        value={updateForm.startTime}
                                                        onChange={e => setUpdateForm({ ...updateForm, startTime: e.target.value })}
                                                        className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">종료 시간</label>
                                                    <input
                                                        type="time"
                                                        value={updateForm.endTime}
                                                        onChange={e => setUpdateForm({ ...updateForm, endTime: e.target.value })}
                                                        className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                                    />
                                                </div>
                                            </div>
                                            <div className="mb-3">
                                                <label className="block text-xs text-gray-500 mb-1">기기 (선택)</label>
                                                <input
                                                    type="text"
                                                    value={updateForm.machine}
                                                    onChange={e => setUpdateForm({ ...updateForm, machine: e.target.value })}
                                                    placeholder="기기명 입력"
                                                    className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            </div>
                                            <div className="flex justify-end space-x-2">
                                                <button
                                                    onClick={() => setIsUpdatingReservation(false)}
                                                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded"
                                                >
                                                    취소
                                                </button>
                                                <button
                                                    onClick={handleUpdateSubmit}
                                                    className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded shadow-sm"
                                                >
                                                    수정 완료
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
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
        </div >
    )
}
