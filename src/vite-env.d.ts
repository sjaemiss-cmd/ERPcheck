/// <reference types="vite/client" />

interface ErpScheduleEvent {
    id: string
    title: string
    start: string | null
    end: string | null
    className?: string[] | string
}

interface Window {
    api: {
        erp: {
            login: (credentials: { id: string; password: string }) => Promise<boolean>
            getSchedule: (startDate: string, endDate: string) => Promise<ErpScheduleEvent[]>
            getResourceSchedule: (startDate: string, endDate: string) => Promise<(ErpScheduleEvent & { resourceId: string | null })[]>
            exportWeeklyReservations: (startDate: string, endDate: string) => Promise<{ jsonFilePath: string; csvFilePath: string; startDate: string; endDate: string; exportedAt: string; count: number }>
            getWeeklyReservationDetails: (
                startDate: string,
                endDate: string,
                options?: { refresh?: boolean }
            ) => Promise<{ startDate: string; endDate: string; fetchedAt: string; fromCache: boolean; count: number; items: any[] }>
            dumpBookingInfo: (
                id: string
            ) => Promise<{ filePath: string; parsedResourceId: string | null; selects: { id: string | null; name: string | null; value: string | null; selectedText: string | null; optionPreview: string[] }[] }>
            createReservation: (data: any) => Promise<boolean>
            getEducationByDate: (date?: string) => Promise<{ operationTime: string; students: { id: string; name: string; time: string; duration: number; status: 'pending' | 'done' | 'registered' | 'assigned' | 'completed' | 'absent'; type: string; generalMemo?: string; history?: { date: string; content: string }[]; index: number }[] }>
            getStudentDetail: (id: string) => Promise<{ generalMemo: string; history: any[] }>
            updateMemo: (id: string, memo: string, name: string, time: string, date?: string) => Promise<boolean>
            writeMemosBatch: (memoList: { index: number; text: string; id: string; name: string; time: string; date?: string }[]) => Promise<Record<number, boolean>>
            deleteHistory: (id: string, history: { date: string, content: string }) => Promise<boolean>
            updateHistory: (id: string, oldHistory: { date: string, content: string }, newHistory: { date: string, content: string }) => Promise<boolean>
            setHeadless: (headless: boolean) => Promise<boolean>
            fetchMembers: (options?: { months: number }) => Promise<boolean>
            registerToErp: (naverData: any) => Promise<boolean>
            syncNaver: (dryRun: boolean) => Promise<any[]>
            cancelReservation: (id: string, date: string) => Promise<boolean>
            markAbsent: (id: string, date: string) => Promise<boolean>
            unmarkAbsent: (id: string, date: string) => Promise<boolean>
            updateReservation: (
                id: string,
                date: string,
                updates: { newDate?: string; startTime?: string; endTime?: string; machineValue?: string; contents?: string }
            ) => Promise<boolean>
        }
        member: {
            list: () => Promise<any[]>
            save: (members: any[]) => Promise<boolean>
        }
        scraper: {
            naverLogin: () => Promise<boolean>
            kakaoLogin: () => Promise<boolean>
            getNaverBookings: () => Promise<any[]>
            getKakaoBookings: () => Promise<any[]>
        }
        settings: {
            saveCredentials: (creds: { id?: string; password?: string }) => Promise<boolean>
            getCredentials: () => Promise<{ id: string; password: string }>
        }
    }
}
