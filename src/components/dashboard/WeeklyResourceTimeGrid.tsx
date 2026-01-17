import { useEffect, useMemo, useRef, useState } from 'react'
import {
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon,
    Loader2,
    Download,
    AlignJustify,
    RotateCw,
    X,
    Phone,
    User,
    FileText
} from 'lucide-react'
import {
    getWeekRange,
    minutesSinceDayStart,
    normalizeScheduleEvents,
    type ErpScheduleEventRaw,
    type ResourceTimeGridEvent
} from '../../lib/schedule/resourceTimeGrid'

// Constants for layout
const START_HOUR = 9
const END_HOUR = 22
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60
const PIXELS_PER_MINUTE = 1.2 // Adjust for zoom/height
const TOTAL_HEIGHT = TOTAL_MINUTES * PIXELS_PER_MINUTE
const COLUMN_WIDTH = 120 // Width of each resource column
const TIME_COL_WIDTH = 60

const RESOURCE_IDS = [
    'operating',
    'dobong-1',
    'dobong-2',
    'dobong-3',
    'dobong-5',
    'dobong-6',
    'dobong-7',
    'dobong-8',
    'dobong-9',
    'unassigned',
]

interface WeeklyResourceTimeGridProps {
    className?: string
    isActive?: boolean
}

interface WeeklyReservationDetail {
    id: string
    title: string
    date: string
    startTime: string | null
    endTime: string | null
    resourceId: string | null
    name: string | null
    phone: string | null
    status: 'registered' | 'assigned' | 'completed' | 'absent' | 'unknown'
    memo: string
    history: Array<{ date: string; content: string }>
    photo: string
}

interface WeeklyReservationDetailsResult {
    startDate: string
    endDate: string
    fetchedAt: string
    fromCache: boolean
    count: number
    items: WeeklyReservationDetail[]
}

export function WeeklyResourceTimeGrid({ className, isActive = true }: WeeklyResourceTimeGridProps) {
    const [currentDate, setCurrentDate] = useState(() => {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        return d
    })
    const [now, setNow] = useState(new Date())

    useEffect(() => {
        if (!isActive) return
        const timer = setInterval(() => setNow(new Date()), 60000) // Update every minute
        return () => clearInterval(timer)
    }, [isActive])

    const [events, setEvents] = useState<ResourceTimeGridEvent[]>([])
    const [loading, setLoading] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // Derived state for the week
    const weekData = useMemo(() => getWeekRange(currentDate, 1), [currentDate])
    const { startDate, endDate, days } = weekData

    const [isExporting, setIsExporting] = useState(false)

    const [showDetails, setShowDetails] = useState(false)
    const [details, setDetails] = useState<WeeklyReservationDetail[]>([])
    const [detailsMeta, setDetailsMeta] = useState<{ fetchedAt: string; fromCache: boolean } | null>(null)
    const [detailsLoading, setDetailsLoading] = useState(false)
    const [detailsError, setDetailsError] = useState<string | null>(null)

    const fetchDetails = async (forceRefresh: boolean = false) => {
        console.log('[WeeklyResourceTimeGrid] fetchDetails called', { startDate, endDate, forceRefresh })
        setDetailsLoading(true)
        setDetailsError(null)
        try {
            const res: WeeklyReservationDetailsResult = await window.api.erp.getWeeklyReservationDetails(
                startDate,
                endDate,
                { refresh: forceRefresh }
            )
            console.log('[WeeklyResourceTimeGrid] fetchDetails result:', res)
            setDetails(res.items || [])
            setDetailsMeta({ fetchedAt: res.fetchedAt, fromCache: res.fromCache })
        } catch (err) {
            console.error('[WeeklyResourceTimeGrid] Failed to fetch weekly reservation details:', err)
            setDetailsError('예약 상세를 불러오지 못했습니다.')
        } finally {
            setDetailsLoading(false)
        }
    }

    useEffect(() => {
        if (!showDetails) return
        fetchDetails(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showDetails, startDate, endDate])

    const handleExport = async () => {
        if (isExporting) return
        setIsExporting(true)
        try {
            const result = await window.api.erp.exportWeeklyReservations(startDate, endDate)
            alert(`주간 예약 내역이 저장되었습니다.\n\nJSON: ${result.jsonFilePath}\nCSV: ${result.csvFilePath}`)
        } catch (error) {
            console.error('Export failed:', error)
            alert('예약 저장 중 오류가 발생했습니다. 다시 시도해주세요.')
        } finally {
            setIsExporting(false)
        }
    }


    const getResourceLabel = (resId: string) => {
        if (resId === 'operating') return '운영'
        if (resId === 'dobong-9') return '상담'
        if (resId === 'dobong-5') return '4호'
        if (resId === 'dobong-6') return '5호'
        if (resId === 'unassigned') return '미배정'
        return `${resId.replace('dobong-', '')}호`
    }

    const buildEventsFromDetails = (items: WeeklyReservationDetail[]): ResourceTimeGridEvent[] => {
        console.log('[buildEventsFromDetails] Building events from', items.length, 'items')
        const result: ResourceTimeGridEvent[] = []
        const resourceIdCounts: Record<string, number> = {}

        for (const it of items) {
            if (!it.startTime) continue

            const start = new Date(`${it.date}T${it.startTime}:00`)
            if (Number.isNaN(start.getTime())) continue

            let end: Date
            if (it.endTime) {
                const e = new Date(`${it.date}T${it.endTime}:00`)
                end = Number.isNaN(e.getTime()) ? new Date(start.getTime() + 60 * 60 * 1000) : e
            } else {
                end = new Date(start.getTime() + 60 * 60 * 1000)
            }

            const cleanTitle = stripHtml(it.title || it.name || '')
            const isOperatingTime = cleanTitle === '운영' || cleanTitle.includes('운영')

            let resourceId = it.resourceId || 'unassigned'

            // Log first few items for debugging
            if (result.length < 5) {
                console.log('[buildEventsFromDetails] Item:', { id: it.id, title: it.title, cleanTitle, resourceId: it.resourceId, isOperatingTime })
            }

            // Map operating events to 'operating' column
            if (isOperatingTime) {
                resourceId = 'operating'
            } else {
                // For non-operating events, only show if there's an explicit resourceId mapping to our grid
                if (!resourceId || !RESOURCE_IDS.includes(resourceId)) {
                    resourceId = 'unassigned'
                }
            }

            if (!RESOURCE_IDS.includes(resourceId)) {
                resourceId = 'unassigned'
            }

            // Count resourceIds
            resourceIdCounts[resourceId] = (resourceIdCounts[resourceId] || 0) + 1

            result.push({
                id: it.id,
                title: cleanTitle,
                start,
                end,
                date: it.date,
                resourceId,
                raw: { id: it.id, title: it.title, start: it.startTime, end: it.endTime },
            })
        }

        console.log('[buildEventsFromDetails] Built', result.length, 'events')
        console.log('[buildEventsFromDetails] ResourceId distribution:', resourceIdCounts)
        return result
    }

    // Fetch data
    useEffect(() => {
        const fetchSchedule = async () => {
            console.log('[WeeklyResourceTimeGrid] fetchSchedule called', { startDate, endDate })
            setLoading(true)
            try {
                const raw: (ErpScheduleEventRaw & { resourceId?: string | null })[] = window.api.erp.getResourceSchedule
                    ? await window.api.erp.getResourceSchedule(startDate, endDate)
                    : await window.api.erp.getSchedule(startDate, endDate)

                console.log('[WeeklyResourceTimeGrid] Fetched raw events:', raw.length)

                const normalized = normalizeScheduleEvents(raw as ErpScheduleEventRaw[], new Set(days), 'unassigned')

                // Remap events for custom column layout
                const remapped = normalized.map(e => {
                    let rid = e.resourceId
                    if (e.title.includes('운영') || rid === 'dobong-4') {
                        rid = 'operating'
                    }
                    if (!RESOURCE_IDS.includes(rid)) {
                        rid = 'unassigned'
                    }
                    return { ...e, resourceId: rid }
                })

                const operatingFromSchedule = remapped.filter(e => e.resourceId === 'operating')

                // Only trust schedule data for seat columns if it already contains seat assignments.
                // But always preserve operating events from the schedule.
                const hasAssignedSeat = remapped.some(e => e.resourceId.startsWith('dobong-'))
                if (remapped.length > 0 && hasAssignedSeat) {
                    setEvents(remapped)
                    return
                }

                try {
                    // Fallback: fetch details (ERP has machine assignment info for seats)
                    console.log('[WeeklyResourceTimeGrid] Fetching weekly reservation details as fallback')
                    const detailsRes: WeeklyReservationDetailsResult = await window.api.erp.getWeeklyReservationDetails(
                        startDate,
                        endDate,
                        { refresh: true }
                    )

                    const detailEvents = buildEventsFromDetails(detailsRes.items || [])

                    // Merge: keep seat assignments from details, and overlay operating events from schedule.
                    const merged = new Map<string, ResourceTimeGridEvent>()
                    for (const e of detailEvents) merged.set(e.id, e)
                    for (const e of operatingFromSchedule) if (!merged.has(e.id)) merged.set(e.id, e)

                    setEvents(Array.from(merged.values()))
                } catch (e) {
                    console.error('[WeeklyResourceTimeGrid] Fallback details fetch failed:', e)
                    // If details fetch fails, show schedule data as best-effort.
                    setEvents(remapped)
                }
            } catch (err) {
                console.error('[WeeklyResourceTimeGrid] Failed to fetch schedule:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchSchedule()
    }, [startDate, endDate, days])


    // Navigation handlers
    const handlePrevWeek = () => {
        const newDate = new Date(currentDate)
        newDate.setDate(newDate.getDate() - 7)
        setCurrentDate(newDate)
    }

    const handleNextWeek = () => {
        const newDate = new Date(currentDate)
        newDate.setDate(newDate.getDate() + 7)
        setCurrentDate(newDate)
    }

    const handleToday = () => {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        setCurrentDate(d)
    }


    // Helper to position events
    const getEventStyle = (event: ResourceTimeGridEvent) => {
        const startMins = Math.max(0, minutesSinceDayStart(event.start) - (START_HOUR * 60))
        const endMins = Math.min(TOTAL_MINUTES, minutesSinceDayStart(event.end) - (START_HOUR * 60))
        const duration = Math.max(15, endMins - startMins) // Min duration visual 15m

        return {
            top: `${startMins * PIXELS_PER_MINUTE}px`,
            height: `${duration * PIXELS_PER_MINUTE}px`,
            left: '2px',
            right: '2px',
        }
    }

    // Helper to strip HTML tags
    const stripHtml = (html: string) => html.replace(/<[^>]*>?/gm, '')

    // Helper to determine event color based on license type
    const getEventColorStyles = (title: string, rawTitle?: string, resourceId?: string) => {
        const text = (title + (rawTitle || '')).replace(/\s/g, '') // remove spaces for safer matching

        // 1. Highest Priority: Review Note
        if (text.includes('리뷰노트')) {
            return {
                bg: 'bg-yellow-100 border-yellow-500 hover:bg-yellow-200',
                text: 'text-yellow-900',
                time: 'text-yellow-700'
            }
        }

        // 2. Operating Column
        if (resourceId === 'operating') {
            return {
                bg: 'bg-gray-200 border-gray-400 hover:bg-gray-300',
                text: 'text-gray-900',
                time: 'text-gray-700'
            }
        }

        // 3. License Types
        if (text.includes('1종수동')) {
            return {
                bg: 'bg-red-100 border-red-500 hover:bg-red-200',
                text: 'text-red-900',
                time: 'text-red-700'
            }
        }
        if (text.includes('1종자동')) {
            return {
                bg: 'bg-green-100 border-green-500 hover:bg-green-200',
                text: 'text-green-900',
                time: 'text-green-700'
            }
        }
        
        // 2종 is Blue, Default is Blue
        return {
            bg: 'bg-blue-100 border-blue-500 hover:bg-blue-200',
            text: 'text-blue-900',
            time: 'text-blue-700'
        }
    }

    // Filter events for a specific day and resource
    const getEventsForCell = (dateStr: string, resourceId: string) => {
        return events.filter(e => e.date === dateStr && e.resourceId === resourceId)
    }

    // Generate time slots for background
    const timeSlots = useMemo(() => {
        const slots: number[] = []
        for (let i = 0; i <= (END_HOUR - START_HOUR); i++) {
            slots.push(START_HOUR + i)
        }
        return slots
    }, [])


    return (
        <div className={`flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 h-[520px] md:h-[800px] ${className || ''}`}>
            {/* Header Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 md:p-4 border-b border-gray-200 bg-white rounded-t-xl z-10">
                <div className="flex items-center gap-3 overflow-x-auto">
                    <h2 className="text-base md:text-xl font-bold text-gray-800 flex items-center whitespace-nowrap">
                        <CalendarIcon className="w-5 h-5 mr-2 text-blue-600" />
                        주간 배차 현황
                    </h2>
                    <div className="text-xs md:text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-md whitespace-nowrap">
                        {startDate} ~ {endDate}
                    </div>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto flex-nowrap">

                    <button
                        type="button"
                        onClick={() => setShowDetails(v => !v)}
                        disabled={isExporting}
                        className={`
                            p-2 rounded-lg transition-colors border
                            ${showDetails
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            }
                            disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                        title="예약 상세 목록"
                    >
                        <AlignJustify className="w-5 h-5" />
                    </button>

                    <button
                        onClick={handleExport}
                        disabled={isExporting || loading}
                        className={`
                            flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border transition-all duration-200
                            ${isExporting || loading
                                ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                                : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 hover:shadow-sm'
                            }
                        `}
                    >
                        {isExporting ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Download className="w-4 h-4 mr-2" />
                        )}
                        {isExporting ? '저장 중...' : '주간 예약 저장'}
                    </button>

                    <div className="w-px h-6 bg-gray-200 mx-2" />

                    <button
                        onClick={handlePrevWeek}
                        disabled={isExporting}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={handleToday}
                        disabled={isExporting}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        오늘
                    </button>
                    <button
                        onClick={handleNextWeek}
                        disabled={isExporting}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

            </div>

            <div className="flex flex-1 overflow-hidden relative">
                {/* Grid */}
                <div ref={scrollContainerRef} className="flex-1 overflow-auto relative border-r border-gray-200">

                <div className="inline-block min-w-full relative">
                    {/* Grid Container */}
                    <div 
                        style={{ 
                            display: 'grid', 
                            gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(${days.length * RESOURCE_IDS.length}, ${COLUMN_WIDTH}px)` 
                        }}
                    >
                        {/* 1. Header: Days (Sticky) */}
                        <div className="sticky top-0 left-0 z-50 bg-gray-50 border-b border-r border-gray-200 h-10"></div>
                        {days.map((day) => (
                            <div 
                                key={day} 
                                className="sticky top-0 z-40 bg-gray-50 border-b border-r border-gray-300 text-center flex items-center justify-center font-bold text-gray-700 text-sm h-10 shadow-sm"
                                style={{ gridColumn: `span ${RESOURCE_IDS.length}` }}
                            >
                                {day}
                            </div>
                        ))}

                        {/* 2. Header: Resources (Sticky) */}
                        <div className="sticky top-10 left-0 z-50 bg-white border-b border-r border-gray-200 h-8 flex items-center justify-center text-xs text-gray-400">
                            Time
                        </div>
                        {days.map(day => (
                            RESOURCE_IDS.map((resId, resIndex) => (
                                <div 
                                    key={`${day}-${resId}`} 
                                    className={`sticky top-10 z-30 bg-white border-b border-r text-center flex items-center justify-center text-xs font-medium text-gray-600 h-8 truncate px-1 ${resIndex === RESOURCE_IDS.length - 1 ? 'border-gray-300' : 'border-gray-200'}`}
                                >
                                     {getResourceLabel(resId)}

                                </div>
                            ))
                        ))}

                        {/* 3. Body: Time Axis & Event Grid */}
                        
                        {/* Time Axis Column */}
                        <div className="relative border-r border-gray-200 bg-gray-50 sticky left-0 z-20" style={{ height: TOTAL_HEIGHT }}>
                            {timeSlots.map(hour => (
                                <div 
                                    key={hour} 
                                    className="absolute w-full text-right pr-2 text-xs text-gray-400 -mt-2"
                                    style={{ top: (hour - START_HOUR) * 60 * PIXELS_PER_MINUTE }}
                                >
                                    {hour}:00
                                </div>
                            ))}
                        </div>

                        {/* Resource Columns */}
                        {days.map(day => (
                            RESOURCE_IDS.map((resId, resIndex) => {
                                 const cellEvents = getEventsForCell(day, resId)
                                 const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
                                 const isToday = day === todayStr
                                 const isLastResource = resIndex === RESOURCE_IDS.length - 1

                                 // Calculate Red Line Position
                                 const currentMinutes = minutesSinceDayStart(now)
                                 const startMinutes = START_HOUR * 60
                                 const endMinutes = END_HOUR * 60
                                 const showCurrentTime = isToday && currentMinutes >= startMinutes && currentMinutes <= endMinutes
                                 const redLineTop = (currentMinutes - startMinutes) * PIXELS_PER_MINUTE

                                return (
                                    <div 
                                        key={`${day}-${resId}-body`} 
                                        className={`relative border-r ${isLastResource ? 'border-gray-300' : 'border-gray-100'} ${isToday ? 'bg-blue-50/30' : 'bg-white'}`}
                                        style={{ height: TOTAL_HEIGHT }}
                                    >
                                        {/* Horizontal Grid Lines */}
                                        {timeSlots.map(hour => (
                                            <div 
                                                key={hour}
                                                className="absolute w-full border-t border-gray-100"
                                                style={{ top: (hour - START_HOUR) * 60 * PIXELS_PER_MINUTE }}
                                            />
                                        ))}

                                        {/* Current Time Indicator (Red Line) */}
                                        {showCurrentTime && (
                                            <div 
                                                className="absolute w-full border-t-2 border-red-500 z-10 pointer-events-none"
                                                style={{ top: redLineTop }}
                                            />
                                        )}

                                         {/* Events */}
                                        {cellEvents.map(event => {
                                            const styles = getEventColorStyles(event.title, event.raw?.title, event.resourceId)
                                            const cleanTitle = stripHtml(event.title || event.raw?.title || '')
                                            const displayTitle = event.resourceId === 'operating' ? '운영' : cleanTitle

                                            return (
                                            <div
                                                key={event.id}
                                                className={`absolute border-l-4 text-xs p-1.5 overflow-hidden rounded-r-md cursor-pointer shadow-sm transition-all ${styles.bg}`}
                                                style={getEventStyle(event)}
                                                        title={`${displayTitle} (${event.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`}
                                                onClick={() => alert(`Event: ${cleanTitle}\nTime: ${event.start.toLocaleTimeString()} ~ ${event.end.toLocaleTimeString()}`)}
                                            >
                                                <div className={`font-bold truncate ${styles.text}`}>{displayTitle}</div>
                                                <div className={`truncate text-[10px] ${styles.time} font-medium`}>
                                                    {event.start.getHours()}:{String(event.start.getMinutes()).padStart(2, '0')}
                                                </div>
                                            </div>
                                        )})}
                                    </div>
                                )
                            })
                        ))}
                    </div>
                </div>

                {loading && (
                    <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-50">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                )}
                </div>

                {showDetails && (
                    <div className="w-full md:w-[400px] bg-white flex flex-col z-20">

                        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <AlignJustify className="w-4 h-4 text-gray-600" />
                                    <span className="font-semibold text-gray-700">예약 상세 ({details.length})</span>
                                </div>
                                {detailsMeta && (
                                    <div className="text-xs text-gray-500 mt-1">
                                        {detailsMeta.fromCache ? '캐시' : '실시간'} · {detailsMeta.fetchedAt}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => fetchDetails(true)}
                                    disabled={detailsLoading}
                                    className="p-2 rounded-md hover:bg-gray-200 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="새로고침"
                                >
                                    <RotateCw className={`w-4 h-4 ${detailsLoading ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowDetails(false)}
                                    className="p-2 rounded-md hover:bg-gray-200 text-gray-600"
                                    title="닫기"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
                            {detailsError && (
                                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                                    {detailsError}
                                </div>
                            )}

                            {detailsLoading && details.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                    <span className="text-sm">불러오는 중...</span>
                                </div>
                            ) : details.length === 0 ? (
                                <div className="text-center text-gray-400 py-10 text-sm">예약 내역이 없습니다.</div>
                            ) : (
                                details.map((item) => {
                                    const badge =
                                        item.status === 'registered'
                                            ? 'bg-blue-100 text-blue-700'
                                            : item.status === 'assigned'
                                                ? 'bg-green-100 text-green-700'
                                                : item.status === 'completed'
                                                    ? 'bg-yellow-100 text-yellow-800'
                                                    : item.status === 'absent'
                                                        ? 'bg-red-100 text-red-700'
                                                        : 'bg-gray-100 text-gray-600'

                                    return (
                                        <div key={item.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${badge}`}>{item.status}</span>
                                                <span className="text-xs text-gray-500 font-mono">
                                                    {item.date} {item.startTime || ''}~{item.endTime || ''}
                                                </span>
                                            </div>

                                            <div className="text-xs text-gray-500 mb-1">자원: {item.resourceId || '-'}</div>
                                            <div className="text-sm font-semibold text-gray-800 truncate" title={item.title}>
                                                {item.title}
                                            </div>

                                            <div className="mt-2 space-y-1">
                                                <div className="flex items-center text-sm text-gray-700">
                                                    <User className="w-3 h-3 mr-2 text-gray-400" />
                                                    <span className="truncate">{item.name || '-'}</span>
                                                </div>
                                                <div className="flex items-center text-sm text-gray-700">
                                                    <Phone className="w-3 h-3 mr-2 text-gray-400" />
                                                    <span className="truncate">{item.phone || '-'}</span>
                                                </div>
                                                {item.memo && (
                                                    <div className="flex items-start text-xs text-gray-600 mt-2 bg-yellow-50 p-2 rounded border border-yellow-100">
                                                        <FileText className="w-3 h-3 mr-2 mt-0.5 flex-shrink-0 text-yellow-700" />
                                                        <span className="line-clamp-2">{item.memo}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}


