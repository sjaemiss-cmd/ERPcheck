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
    const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())

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

            // User must login manually if not already. 
            // We can ask user confirmation or just try fetching.
            // ScraperService.getNaverBookings launches browser if needed.

            setStatusMessage('예약 목록 스크래핑 중...')
            const bookings = await window.api.scraper.getNaverBookings()

            const parsed: Reservation[] = bookings.map((b: any) => {
                // Parse Date "2024. 12. 18. (수) 오후 4:00" -> YYYY-MM-DD, HH:mm
                // This parsing logic depends on Naver's exact format.
                // Let's assume ScraperService returns raw strings, we need robust parsing.
                // Actually ScraperService returns 'dateStr' like "2024. 12. 18. (수) 16:00"

                let date = ''
                let startTime = ''
                let endTime = ''

                try {
                    // Regex for "2024. 12. 18. (수) 16:00" or "2024. 12. 18. (수) 오후 4:00"
                    // Simple approach: Extract numbers
                    const parts = b.dateStr.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/)
                    if (parts) {
                        date = `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`
                    }

                    // Time
                    // If "16:00"
                    const timeMatch = b.dateStr.match(/(\d{1,2}):(\d{2})/)
                    if (timeMatch) {
                        let h = parseInt(timeMatch[1])
                        const m = timeMatch[2]
                        if (b.dateStr.includes('오후') && h < 12) h += 12
                        if (b.dateStr.includes('오전') && h === 12) h = 0
                        startTime = `${String(h).padStart(2, '0')}:${m}`
                    }
                } catch (e) { console.error('Date parse error', b.dateStr) }

                // Calculate End Time based on duration
                if (startTime && b.durationMin) {
                    const [h, m] = startTime.split(':').map(Number)
                    const endD = new Date(2000, 0, 1, h, m + b.durationMin)
                    endTime = `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`
                }

                return {
                    source: 'Naver',
                    name: b.name,
                    date: date,
                    startTime: startTime,
                    endTime: endTime,
                    product: b.product,
                    option: b.option,
                    phone: b.phone,
                    request: b.request,
                    status: 'New' // Default, will update after compare
                }
            })

            // Filter invalid dates
            const valid = parsed.filter(p => p.date && p.startTime)
            setNaverReservations(valid)
            setStatusMessage(`네이버 예약 ${valid.length}건 수집 완료`)

            // Auto-trigger ERP fetch if we have data
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

    const loadMockData = () => {
        const today = new Date().toISOString().split('T')[0]
        const mockData: Reservation[] = [
            {
                source: 'Naver',
                name: '테스트유저',
                date: today,
                startTime: '14:00',
                endTime: '15:00',
                product: '1시간 이용권',
                option: '기본',
                phone: '010-1234-5678',
                request: '테스트 예약입니다.',
                status: 'New'
            },
            {
                source: 'Naver',
                name: '중복유저',
                date: today,
                startTime: '16:00',
                endTime: '17:00',
                product: '2종 시간제',
                option: '6시간',
                phone: '010-9876-5432',
                request: '이미 등록된 유저 테스트',
                status: 'New'
            }
        ]
        setNaverReservations(mockData)
        setMergedList(mockData) // Also update the display list
        setStatusMessage('테스트 데이터 로드됨')
    }

    const fetchErpAndCompare = async (currentNaverList: Reservation[]) => {
        setLoading(true)
        setStatusMessage('ERP 데이터 대조 중...')
        try {
            // Fetch 2 weeks range
            const today = new Date()
            const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)

            const sDate = today.toISOString().split('T')[0]
            const eDate = twoWeeksLater.toISOString().split('T')[0]

            const erpData = await window.api.erp.getSchedule(sDate, eDate)
            // setErpReservations(erpData)

            // Compare
            const compared = currentNaverList.map(naver => {
                // Logic: Same Name AND Same Date AND (Similar Time OR Overlap)
                // Simple: Same Name + Same Date
                const dup = erpData.find((e: any) => {
                    // ERP event start format: "2024-12-18T16:00:00"
                    if (!e.start) return false
                    const eDate = e.start.split('T')[0]
                    // const eTime = e.start.split('T')[1]?.substring(0, 5) // HH:mm

                    // Name match (fuzzy?)
                    const nameMatch = e.title.includes(naver.name)
                    const dateMatch = eDate === naver.date

                    // Time match (optional but good for strictness)
                    // Let's rely on Name + Date for now as primary key
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

    const handleRegister = async () => {
        const targets = mergedList.filter((_, i) => selectedItems.has(i))
        if (targets.length === 0) return

        if (!confirm(`${targets.length}건의 예약을 ERP에 등록하시겠습니까?`)) return

        setLoading(true)
        setStatusMessage('ERP 등록 진행 중...')

        let successCount = 0
        const newMerged = [...mergedList]

        for (const item of targets) {
            try {
                const success = await window.api.erp.createReservation({
                    date: item.date,
                    start_time: item.startTime,
                    end_time: item.endTime,
                    name: item.name,
                    phone: item.phone,
                    product: item.product,
                    option: item.option,
                    request: item.request
                })

                if (success) {
                    successCount++
                    // Update status locally
                    const idx = mergedList.indexOf(item)
                    if (idx !== -1) {
                        newMerged[idx].status = 'Registered'
                    }
                }
            } catch (e) {
                console.error(`Failed to register ${item.name}`, e)
            }
        }

        setMergedList(newMerged)
        setSelectedItems(new Set()) // Clear selection
        setStatusMessage(`${successCount}건 등록 완료`)
        setLoading(false)
    }

    const toggleSelect = (index: number) => {
        const newSet = new Set(selectedItems)
        if (newSet.has(index)) newSet.delete(index)
        else newSet.add(index)
        setSelectedItems(newSet)
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
                <div className="flex space-x-3">
                    <span className="flex items-center text-sm text-gray-600 mr-4">
                        {loading && <RefreshCw className="animate-spin mr-2 h-4 w-4" />}
                        {statusMessage}
                    </span>
                    <button
                        onClick={fetchNaver}
                        disabled={loading}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        <RefreshCw size={16} />
                        네이버 수집
                    </button>
                    <button
                        onClick={loadMockData}
                        disabled={loading}
                        className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 flex items-center gap-2"
                    >
                        <span>테스트 데이터</span>
                    </button>
                    <button
                        onClick={() => fetchErpAndCompare(naverReservations)}
                        disabled={loading || naverReservations.length === 0}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        <Check size={16} />
                        ERP 대조
                    </button>
                </div>
            </div>

            {/* Data Grid */}
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0">
                            <tr>
                                <th className="p-4 w-10">
                                    <input type="checkbox" disabled />
                                </th>
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
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.has(idx)}
                                                onChange={() => toggleSelect(idx)}
                                                disabled={item.status === 'Registered'}
                                                className="rounded text-blue-600 focus:ring-blue-500"
                                            />
                                        </td>
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
                <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                    <div className="text-sm text-gray-500">
                        선택됨: {selectedItems.size}건
                    </div>
                    <button
                        onClick={handleRegister}
                        disabled={selectedItems.size === 0 || loading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium shadow-sm flex items-center gap-2"
                    >
                        <span>선택 항목 등록하기</span>
                        <ArrowRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    )
}
