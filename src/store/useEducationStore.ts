import { create } from 'zustand'

export interface Student {
    id: string
    name: string
    domIdentifier?: string
    time: string
    duration: number
    status: 'pending' | 'done' | 'registered' | 'assigned' | 'completed' | 'absent'
    type: string
    generalMemo?: string
    history?: { date: string; content: string }[]
    index: number
}

interface EducationState {
    students: Student[]
    selectedId: string | null
    selectedDate: string // YYYY-MM-DD format
    operationTime: string
    loading: boolean
    isLoggedIn: boolean
    showBrowser: boolean
    // Key: Student ID, Value: Array of pending items
    pendingHistory: Record<string, { id: string; date: string; content: string }[]>

    setStudents: (students: Student[] | ((prev: Student[]) => Student[])) => void
    setSelectedId: (id: string | null) => void
    setSelectedDate: (date: string) => void
    setOperationTime: (time: string) => void
    setLoading: (loading: boolean) => void
    setIsLoggedIn: (isLoggedIn: boolean) => void
    setShowBrowser: (show: boolean) => void
    setPendingHistory: (history: Record<string, { id: string; date: string; content: string }[]> | ((prev: Record<string, { id: string; date: string; content: string }[]>) => Record<string, { id: string; date: string; content: string }[]>)) => void

    // Actions for easier manipulation
    addPendingHistory: (studentId: string, item: { id: string; date: string; content: string }) => void
    updatePendingHistory: (studentId: string, itemId: string, field: 'date' | 'content', value: string) => void
    deletePendingHistory: (studentId: string, itemId: string) => void
}

export const useEducationStore = create<EducationState>((set) => ({
    students: [],
    selectedId: null,
    selectedDate: new Date().toISOString().split('T')[0], // Default to today
    operationTime: '',
    loading: false,
    isLoggedIn: false,
    showBrowser: false,
    pendingHistory: {},

    setStudents: (students) => set((state) => ({
        students: typeof students === 'function' ? students(state.students) : students
    })),
    setSelectedId: (id) => set({ selectedId: id }),
    setSelectedDate: (date) => set({ selectedDate: date }),
    setOperationTime: (time) => set({ operationTime: time }),
    setLoading: (loading) => set({ loading }),
    setIsLoggedIn: (isLoggedIn) => set({ isLoggedIn }),
    setShowBrowser: (show) => set({ showBrowser: show }),
    setPendingHistory: (history) => set((state) => ({
        pendingHistory: typeof history === 'function' ? history(state.pendingHistory) : history
    })),

    addPendingHistory: (studentId, item) => set((state) => ({
        pendingHistory: {
            ...state.pendingHistory,
            [studentId]: [...(state.pendingHistory[studentId] || []), item]
        }
    })),
    updatePendingHistory: (studentId, itemId, field, value) => set((state) => {
        const studentItems = state.pendingHistory[studentId] || []
        return {
            pendingHistory: {
                ...state.pendingHistory,
                [studentId]: studentItems.map(item =>
                    item.id === itemId ? { ...item, [field]: value } : item
                )
            }
        }
    }),
    deletePendingHistory: (studentId, itemId) => set((state) => ({
        pendingHistory: {
            ...state.pendingHistory,
            [studentId]: (state.pendingHistory[studentId] || []).filter(item => item.id !== itemId)
        }
    })),
}))
