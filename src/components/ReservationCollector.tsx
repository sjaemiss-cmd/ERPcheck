import { useState } from 'react'
import { Loader2, RefreshCw, CheckCircle, LogIn, Send } from 'lucide-react'



interface Booking {
    source: 'Naver' | 'Kakao'
    name: string
    status: string // '신청', '확정', 'Unknown'
    dateStr: string
    product: string
    option: string
    request: string
    phone: string
    durationMin: number
    raw_data?: string
    // Frontend state
    syncStatus?: 'idle' | 'processing' | 'success' | 'error'
}

export default function ReservationCollector() {
    const [bookings, setBookings] = useState<Booking[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [statusMsg, setStatusMsg] = useState('')

    const handleNaverLogin = async () => {
        setIsLoading(true)
        setStatusMsg('네이버 로그인 창을 열었습니다. 로그인 후 닫아주세요.')
        await window.api.scraper.naverLogin()
        setIsLoading(false)
    }

    const handleKakaoLogin = async () => {
        setIsLoading(true)
        setStatusMsg('카카오 로그인 창을 열었습니다. 로그인 후 닫아주세요.')
        await window.api.scraper.kakaoLogin()
        setIsLoading(false)
    }

    const handleCollect = async () => {
        setIsLoading(true)
        setStatusMsg('예약 데이터 수집 중...')
        setBookings([])

        try {
            const naverData = await window.api.scraper.getNaverBookings()
            const kakaoData = await window.api.scraper.getKakaoBookings()

            // Merge and sort? For now just merge
            const merged = [...naverData, ...kakaoData]
            setBookings(merged)

            setStatusMsg(`수집 완료: 총 ${merged.length}건`)
        } catch (e) {
            console.error(e)
            setStatusMsg('수집 중 오류 발생')
        } finally {
            setIsLoading(false)
        }
    }

    const handleRegister = async (booking: Booking, index: number) => {
        const newBookings = [...bookings]
        newBookings[index].syncStatus = 'processing'
        setBookings(newBookings)

        // Quick Parser for "YY. MM. DD.(Day) AM/PM H:MM"
        let date = ''
        let startTime = ''
        let endTime = ''

        try {
            const clean = booking.dateStr.replace(/\(.\)/, '').trim()
            const parts = clean.split(' ')

            if (parts.length >= 5) {
                const y = '20' + parts[0].replace('.', '')
                const m = parts[1].replace('.', '').padStart(2, '0')
                const d = parts[2].replace('.', '').padStart(2, '0')
                date = `${y}-${m}-${d}`

                const ampm = parts[3]
                let time = parts[4]
                let [h, min] = time.split(':').map(Number)

                if (ampm === '오후' && h !== 12) h += 12
                if (ampm === '오전' && h === 12) h = 0

                startTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`

                const startTotalMin = h * 60 + min
                const endTotalMin = startTotalMin + booking.durationMin
                const endH = Math.floor(endTotalMin / 60)
                const endMin = endTotalMin % 60
                endTime = `${String(endH).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`
            }
        } catch (e) {
            console.error('Date parse error', e)
        }

        if (!date || !startTime) {
            newBookings[index].syncStatus = 'error'
            setBookings(newBookings)
            alert('날짜/시간 파싱 실패: ' + booking.dateStr)
            return
        }

        const payload = {
            date,
            start_time: startTime,
            end_time: endTime,
            name: booking.name,
            phone: booking.phone,
            product: booking.product,
            option: booking.option,
            request: booking.request
        }

        const success = await window.api.erp.createReservation(payload)

        const finalBookings = [...bookings]
        finalBookings[index].syncStatus = success ? 'success' : 'error'
        setBookings(finalBookings)
    }

    return (
        <div className="p-8 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900">예약 수집</h2>
                    <p className="text-gray-500">네이버/카카오 예약을 수집하고 ERP에 등록합니다.</p>
                </div>
                <div className="flex space-x-2">
                    <button
                        onClick={handleNaverLogin}
                        disabled={isLoading}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none border border-input hover:bg-zinc-100 h-10 px-4 py-2"
                    >
                        <LogIn className="mr-2 h-4 w-4" /> 네이버 로그인
                    </button>
                    <button
                        onClick={handleKakaoLogin}
                        disabled={isLoading}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none border border-input hover:bg-zinc-100 h-10 px-4 py-2"
                    >
                        <LogIn className="mr-2 h-4 w-4" /> 카카오 로그인
                    </button>
                    <button
                        onClick={handleCollect}
                        disabled={isLoading}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none bg-black text-white hover:bg-black/90 h-10 px-4 py-2"
                    >
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        예약 가져오기
                    </button>
                </div>
            </div>

            {statusMsg && (
                <div className="bg-slate-100 p-3 rounded-md text-sm text-slate-600 border border-slate-200">
                    {statusMsg}
                </div>
            )}

            <div className="rounded-lg border bg-white text-card-foreground shadow-sm">
                <div className="flex flex-col space-y-1.5 p-6">
                    <h3 className="text-2xl font-semibold leading-none tracking-tight">수집 내역 ({bookings.length})</h3>
                </div>
                <div className="p-6 pt-0">
                    <div className="rounded-md border">
                        <table className="w-full caption-bottom text-sm">
                            <thead className="[&_tr]:border-b">
                                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[100px]">출처</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">이름</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">날짜/시간</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">상품/옵션</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">상태</th>
                                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">작업</th>
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                                {bookings.length === 0 ? (
                                    <tr className="border-b transition-colors hover:bg-muted/50">
                                        <td colSpan={6} className="p-4 align-middle h-24 text-center text-muted-foreground">
                                            데이터가 없습니다.
                                        </td >
                                    </tr>
                                ) : (
                                    bookings.map((item, i) => (
                                        <tr key={i} className="border-b transition-colors hover:bg-zinc-50">
                                            <td className="p-4 align-middle">
                                                {item.source === 'Naver' ? (
                                                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-green-500 text-white hover:bg-green-500/80">Naver</span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-yellow-400 text-black hover:bg-yellow-400/80">Kakao</span>
                                                )}
                                            </td>
                                            <td className="p-4 align-middle font-medium">{item.name}</td>
                                            <td className="p-4 align-middle">{item.dateStr}</td>
                                            <td className="p-4 align-middle">
                                                <div className="text-sm">{item.product}</div>
                                                <div className="text-xs text-gray-500">{item.option}</div>
                                            </td>
                                            <td className="p-4 align-middle">
                                                {item.syncStatus === 'success' ? (
                                                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-blue-500 text-blue-500">등록완료</span>
                                                ) : item.syncStatus === 'error' ? (
                                                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-red-500 text-white hover:bg-red-500/80">실패</span>
                                                ) : (
                                                    <span className="text-sm text-slate-500">{item.status}</span>
                                                )}
                                            </td>
                                            <td className="p-4 align-middle text-right">
                                                <button
                                                    disabled={isLoading || item.syncStatus === 'processing' || item.syncStatus === 'success'}
                                                    onClick={() => handleRegister(item, i)}
                                                    className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none h-9 px-3 ${item.syncStatus === 'success'
                                                        ? "hover:bg-transparent"
                                                        : "bg-black text-white hover:bg-black/90"
                                                        }`}
                                                >
                                                    {item.syncStatus === 'processing' ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : item.syncStatus === 'success' ? (
                                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                                    ) : (
                                                        <>
                                                            <Send className="mr-2 h-3 w-3" /> 등록
                                                        </>
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
