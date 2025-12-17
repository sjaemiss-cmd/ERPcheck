import { useState } from 'react'
import { Calendar, RefreshCw, Check, ArrowRight } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Reservation {
    source: 'Naver' | 'Kakao' | 'ERP'
    id?: string
    name: string
    date: string // YYYY-MM-DD
    startTime: string // HH:mm
    endTime: string // HH:mm
    product?: string
    option?: string
    phone?: string
    request?: string
    status: 'New' | 'Registered' | 'Conflict'
    erpEventId?: string // If registered/conflict, link to ERP event
}

export function ReservationCollector() {
    const [naverReservations, setNaverReservations] = useState<Reservation[]>([])
    // const [erpReservations, setErpReservations] = useState<any[]>([])
    const [mergedList, setMergedList] = useState<Reservation[]>([])
    const [loading, setLoading] = useState(false)
    const [statusMessage, setStatusMessage] = useState('')
    const [dryRun, setDryRun] = useState(true)

    const handleAutoSync = async () => {
        setLoading(true)
        setStatusMessage(`자동 동기화 시작 (DryRun: ${dryRun})...`)
        try {
            // 1. Force Login Check
            const loggedIn = await window.api.scraper.naverLogin()
            if (!loggedIn) {
                alert('네이버 로그인에 실패했습니다. 수동으로 로그인해주세요.')
                setLoading(false)
                return
            }

            // 2. Sync
            const results = await window.api.erp.syncNaver(dryRun)

            // 3. Show Results (Optional: update list with results)
            console.log('Sync Results:', results)
            setStatusMessage(`동기화 완료: ${results.length}건 처리됨`)

            alert(`동기화 완료!\n총 ${results.length}건 처리되었습니다.\n(DryRun: ${dryRun ? 'ON' : 'OFF'})`)

        } catch (e) {
            console.error(e)
            setStatusMessage('동기화 실패')
            alert('동기화 중 오류가 발생했습니다.')
        } finally {
            setLoading(false)
        }
    }

    const fetchNaver = async () => {
        setLoading(true)
        setStatusMessage('네이버 예약 정보를 가져오는 중...')
        try {
            // 1. Login Check (ScraperService handles browser launch)
            const loginResult = await window.api.scraper.naverLogin()
            if (!loginResult) {
                alert('네이버 로그인 창을 열 수 없습니다.')
                setLoading(false)
                return
            }

            setStatusMessage('예약 목록 스크래핑 중...')
            const bookings = await window.api.scraper.getNaverBookings()

            const parsed: Reservation[] = bookings.map((b: any) => {
                // Parse Date "2024. 12. 18. (수) 오후 4:00" -> YYYY-MM-DD, HH:mm
                // Scraper returns 'date_string'
                const rawDate = b.date_string || ''
                let date = ''
                let startTime = ''
                let endTime = ''

                try {
                    const parts = rawDate.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/)
                    if (parts) {
                        date = `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`
                    }

                    const timeMatch = rawDate.match(/(\d{1,2}):(\d{2})/)
                    if (timeMatch) {
                        let h = parseInt(timeMatch[1])
                        const m = timeMatch[2]
                        if (rawDate.includes('오후') && h < 12) h += 12
                        if (rawDate.includes('오전') && h === 12) h = 0
                        startTime = `${String(h).padStart(2, '0')}:${m}`
                    }
                } catch (e) {
                    console.error('Date parse error', rawDate)
                }

                if (startTime && !endTime && b.durationMin) {
                    const [h, m] = startTime.split(':').map(Number)
                    const endD = new Date(2000, 0, 1, h, m + b.durationMin)
                    endTime = `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`
                } else if (startTime && !endTime) {
                    const [h, m] = startTime.split(':').map(Number)

                    // Consultation Check (30 mins)
                    const p = b.product || ''
                    if (p.includes('이용문의') || p.includes('상담')) {
                        const endD = new Date(2000, 0, 1, h, m + 30) // 30 min add
                        endTime = `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`
                    } else {
                        // Default 1 Hour
                        const endH = h + 1
                        endTime = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                    }
                }

                return {
                    source: 'Naver',
                    name: b.user_name || 'Unknown',
                    date: date,
                    startTime: startTime,
                    endTime: endTime,
                    product: b.product,
                    option: b.options,
                    phone: b.user_phone,
                    request: b.request,
                    status: 'New'
                }
            })

            const valid = parsed.filter(p => p.date && p.startTime)
            setNaverReservations(valid)
            setMergedList(valid)
            setStatusMessage(`네이버 예약 ${valid.length}건 수집 완료`)

            if (valid.length > 0) {
                fetchErpAndCompare(valid)
            }

        } catch (e) {
            console.error(e)
            setStatusMessage('오류 발생')
        } finally {
            setLoading(false)
        }
    }



    const fetchErpAndCompare = async (currentNaverList: Reservation[]) => {
        setLoading(true)
        setStatusMessage('ERP 데이터 대조 중...')
        try {
            const today = new Date()
            const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)

            const sDate = today.toISOString().split('T')[0]
            const eDate = twoWeeksLater.toISOString().split('T')[0]

            const erpData = await window.api.erp.getSchedule(sDate, eDate)

            const compared = currentNaverList.map(naver => {
                const dup = erpData.find((e: any) => {
                    if (!e.start) return false
                    const eDate = e.start.split('T')[0]
                    const nameMatch = e.title.includes(naver.name)
                    const dateMatch = eDate === naver.date
                    return nameMatch && dateMatch
                })

                if (dup) {
                    return { ...naver, status: 'Registered', erpEventId: dup.id } as Reservation
                }
                return naver
            })

            setMergedList(compared)
            setStatusMessage('대조 완료')

        } catch (e) {
            console.error(e)
            setStatusMessage('ERP 대조 실패')
        } finally {
            setLoading(false)
        }
    }



    return (
        <div className="flex flex-col h-full bg-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Calendar className="text-blue-600" />
                        예약 수집 및 등록
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">네이버 예약을 수집하여 ERP에 등록합니다.</p>
                </div>
                <div className="flex items-center space-x-3">
                    <span className="flex items-center text-sm text-gray-600 mr-4">
                        {loading && <RefreshCw className="animate-spin mr-2 h-4 w-4" />}
                        {statusMessage}
                    </span>

                    {/* New UI Controls */}
                    <div className="flex items-center bg-white p-2 rounded-lg border border-gray-300 mr-2">
                        <input
                            type="checkbox"
                            id="dryRun"
                            checked={dryRun}
                            onChange={(e) => setDryRun(e.target.checked)}
                            className="mr-2 h-4 w-4 text-blue-600 rounded"
                        />
                        <label htmlFor="dryRun" className="text-sm font-medium text-gray-700 cursor-pointer select-none">
                            테스트 모드 (저장안함)
                        </label>
                    </div>

                    <button
                        onClick={handleAutoSync}
                        disabled={loading}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        <RefreshCw size={16} />
                        자동 동기화 (One-Click)
                    </button>

                    <div className="h-6 w-px bg-gray-300 mx-2"></div>

                    <button
                        onClick={fetchNaver}
                        disabled={loading}
                        className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                    >
                        <span>단순 수집 (결과 확인용)</span>
                    </button>
                </div>
            </div>

            {/* Data Grid */}
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0">
                            <tr>

                                <th className="p-4">상태</th>
                                <th className="p-4">예약자</th>
                                <th className="p-4">날짜/시간</th>
                                <th className="p-4">상품/옵션</th>
                                <th className="p-4">요청사항</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {mergedList.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center text-gray-400">
                                        수집된 데이터가 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                mergedList.map((item, idx) => (
                                    <tr key={idx} className={cn(
                                        "hover:bg-gray-50 transition-colors",
                                        item.status === 'Registered' ? "bg-gray-50 opacity-70" : "bg-white"
                                    )}>

                                        <td className="p-4">
                                            {item.status === 'New' && <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">신규</span>}
                                            {item.status === 'Registered' && <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs font-bold">등록됨</span>}
                                            {item.status === 'Conflict' && <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">중복/충돌</span>}
                                        </td>
                                        <td className="p-4 font-medium text-gray-900">
                                            {item.name}
                                            {item.phone && <div className="text-xs text-gray-400">{item.phone}</div>}
                                        </td>
                                        <td className="p-4">
                                            <div className="font-medium">{item.date}</div>
                                            <div className="text-gray-500">{item.startTime} ~ {item.endTime}</div>
                                        </td>
                                        <td className="p-4 text-gray-600">
                                            <div>{item.product}</div>
                                            <div className="text-xs text-gray-400">{item.option}</div>
                                        </td>
                                        <td className="p-4 text-gray-500 max-w-xs truncate" title={item.request}>
                                            {item.request}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Action */}

            </div>
        </div>
    )
}
