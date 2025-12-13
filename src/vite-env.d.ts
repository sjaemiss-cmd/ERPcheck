/// <reference types="vite/client" />

interface Window {
    api: {
        erp: {
            login: (credentials: { id: string; password: string }) => Promise<boolean>
            getSchedule: (weeks: number) => Promise<any[]>
            createReservation: (data: any) => Promise<boolean>
            getTodayEducation: () => Promise<{ operationTime: string; students: { id: string; name: string; time: string; duration: number; status: 'pending' | 'done'; type: string; generalMemo?: string; history?: { date: string; content: string }[]; index: number }[] }>
            getStudentDetail: (id: string) => Promise<{ generalMemo: string; history: any[] }>
            updateMemo: (id: string, memo: string, name: string, time: string) => Promise<boolean>
            writeMemosBatch: (memoList: { index: number; text: string; id: string; name: string; time: string }[]) => Promise<Record<number, boolean>>
            deleteHistory: (id: string, history: { date: string, content: string }) => Promise<boolean>
            updateHistory: (id: string, oldHistory: { date: string, content: string }, newHistory: { date: string, content: string }) => Promise<boolean>
            setHeadless: (headless: boolean) => Promise<boolean>
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
