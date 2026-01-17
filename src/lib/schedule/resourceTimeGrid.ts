export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface ErpScheduleEventRaw {
    id: string
    title: string
    start: string | null
    end: string | null
    className?: string[] | string
    resourceId?: string | null
}

export interface Resource {
    id: string
    title: string
}

export interface ResourceTimeGridEvent {
    id: string
    title: string
    start: Date
    end: Date
    date: string // YYYY-MM-DD (local)
    resourceId: string
    raw: ErpScheduleEventRaw
}

export interface WeekRange {
    startDate: string // YYYY-MM-DD
    endDate: string // YYYY-MM-DD
    days: string[] // YYYY-MM-DD[]
}

export function formatLocalDate(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

export function getWeekRange(baseDate: Date, weekStartsOn: WeekStartsOn = 1): WeekRange {
    const base = new Date(baseDate)
    base.setHours(0, 0, 0, 0)

    const dayOfWeek = base.getDay() // 0=Sun..6=Sat
    const diff = (dayOfWeek - weekStartsOn + 7) % 7

    const start = new Date(base)
    start.setDate(start.getDate() - diff)

    const days: string[] = []
    for (let i = 0; i < 7; i++) {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        days.push(formatLocalDate(d))
    }

    const end = new Date(start)
    end.setDate(start.getDate() + 6)

    return {
        startDate: formatLocalDate(start),
        endDate: formatLocalDate(end),
        days,
    }
}

export function parseResourceIdFromErpEvent(event: ErpScheduleEventRaw): string | null {
    if (event.resourceId) {
        const m = event.resourceId.match(/\bdobong-(\d+)\b/i)
        if (m) {
            const n = Number(m[1])
            if (Number.isFinite(n) && n >= 1 && n <= 9) return `dobong-${n}`
        }
        return event.resourceId
    }

    const fromTitle = event.title.match(/\bdobong-(\d+)\b/i)
    if (fromTitle) {
        const n = Number(fromTitle[1])
        if (Number.isFinite(n) && n >= 1 && n <= 9) return `dobong-${n}`
        return fromTitle[0].toLowerCase()
    }

    const className = event.className
    if (Array.isArray(className)) {
        for (const c of className) {
            const m = c.match(/\bdobong-(\d+)\b/i)
            if (m) {
                const n = Number(m[1])
                if (Number.isFinite(n) && n >= 1 && n <= 9) return `dobong-${n}`
                return m[0].toLowerCase()
            }
        }
    } else if (typeof className === 'string') {
        const m = className.match(/\bdobong-(\d+)\b/i)
        if (m) {
            const n = Number(m[1])
            if (Number.isFinite(n) && n >= 1 && n <= 9) return `dobong-${n}`
            return m[0].toLowerCase()
        }
    }

    return null
}

export function minutesSinceDayStart(date: Date): number {
    return date.getHours() * 60 + date.getMinutes()
}

export function clamp(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n))
}

export function buildDefaultDobongResources(): Resource[] {
    return Array.from({ length: 9 }, (_, i) => ({
        id: `dobong-${i + 1}`,
        title: `dobong-${i + 1}`,
    }))
}

function inferEndFromTitle(start: Date, title: string): Date | null {
    const m = title.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/)
    if (!m) return null

    const [, _startHm, endHm] = m
    const [eh, em] = endHm.split(':').map(Number)
    if (!Number.isFinite(eh) || !Number.isFinite(em)) return null

    const end = new Date(start)
    end.setHours(eh, em, 0, 0)

    // Handle overnight edge case
    if (end.getTime() <= start.getTime()) {
        end.setDate(end.getDate() + 1)
    }

    return end
}

export function normalizeScheduleEvents(
    raw: ErpScheduleEventRaw[],
    daysSet: Set<string>,
    fallbackResourceId = 'unassigned'
): ResourceTimeGridEvent[] {
    const events: ResourceTimeGridEvent[] = []

    for (const e of raw) {
        if (!e.start) continue

        const start = new Date(e.start)
        if (Number.isNaN(start.getTime())) continue

        let end: Date
        if (e.end) {
            const parsedEnd = new Date(e.end)
            if (Number.isNaN(parsedEnd.getTime())) continue
            end = parsedEnd
        } else {
            end = inferEndFromTitle(start, e.title) ?? new Date(start.getTime() + 60 * 60 * 1000)
        }

        const date = formatLocalDate(start)
        if (!daysSet.has(date)) continue

        const resourceId = parseResourceIdFromErpEvent(e) ?? fallbackResourceId

        events.push({
            id: e.id,
            title: e.title,
            start,
            end,
            date,
            resourceId,
            raw: e,
        })
    }

    return events
}
