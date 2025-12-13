export interface Student {
    id: string
    name: string
    time: string
    duration: number
    status: 'pending' | 'done'
    type: string // 1종, 2종, 도로 등
    generalMemo?: string
    history?: {
        date: string
        content: string
    }[]
    photo?: string
    index?: number
}

export interface DailyData {
    operationTime: string
    students: Student[]
}
