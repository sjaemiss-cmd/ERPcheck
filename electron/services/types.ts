export interface Student {
    id: string
    name: string
    domIdentifier?: string
    time: string
    duration: number
    status: 'pending' | 'done' | 'registered' | 'assigned' | 'completed' | 'absent' // Updated status types
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
    status: 'registered' | 'assigned' | 'completed' | 'absent'
    time: string
    memo: string
    history: { date: string; content: string }[]
    photo: string
}

export interface DailyData {
    operationTime: string
    students: Student[]
}

export interface Customer {
    id: string
    name: string
    phone: string
    goods?: string
    remainingTime?: string
    testDate?: string
    finalPass?: string
    branch?: string
    joinDate?: string
}

export interface ReservationData {
    customerId: string
    name: string
    date: string // YYYY-MM-DD
    time: string // HH:mm
    duration: number // hours
    type: string // 1종, 2종, etc.
}

export interface ErpScheduleEvent {
    id: string
    title: string
    start: string | null
    end: string | null
    className?: string[] | string
}

export interface ErpScheduleEventWithResource extends ErpScheduleEvent {
    resourceId: string | null
}

export interface WeeklyReservationHistoryItem {
    date: string
    content: string
}

export interface WeeklyReservationDetail {
    id: string
    title: string
    date: string // YYYY-MM-DD
    start: string | null // ISO datetime
    end: string | null // ISO datetime
    startTime: string | null // HH:mm
    endTime: string | null // HH:mm
    resourceId: string | null
    name: string | null
    phone: string | null
    status: 'registered' | 'assigned' | 'completed' | 'absent' | 'unknown'
    memo: string
    history: WeeklyReservationHistoryItem[]
    photo: string
}

export interface WeeklyReservationExportResult {
    jsonFilePath: string
    csvFilePath: string
    startDate: string
    endDate: string
    exportedAt: string // ISO
    count: number
}

export interface WeeklyReservationDetailsResult {
    startDate: string
    endDate: string
    fetchedAt: string // ISO
    fromCache: boolean
    count: number
    items: WeeklyReservationDetail[]
}
