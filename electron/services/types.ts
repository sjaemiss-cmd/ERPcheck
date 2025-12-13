export interface Student {
    id: string
    name: string
    domIdentifier?: string
    time: string
    duration: number
    status: 'pending' | 'done' | 'registered' | 'assigned' | 'completed' // Updated status types
    type: string // 1종, 2종, 도로 등
    generalMemo?: string
    history?: {
        date: string
        content: string
    }[]
    photo?: string
    index?: number
    memo?: string // Added for compatibility
}

export interface EducationData {
    id: string
    name: string
    status: 'registered' | 'assigned' | 'completed'
    time: string
    memo: string
    history: { date: string; content: string }[]
    photo: string
}

export interface DailyData {
    operationTime: string
    students: Student[]
}
