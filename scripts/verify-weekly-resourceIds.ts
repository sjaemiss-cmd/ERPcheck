import { ErpService } from '../electron/services/ErpService.ts'

function getWeekRangeYmd(base: Date) {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 Sun
  const weekStartsOn = 1 // Mon
  const diff = (day - weekStartsOn + 7) % 7
  const start = new Date(d)
  start.setDate(start.getDate() - diff)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)

  const fmt = (x: Date) => {
    const y = x.getFullYear()
    const m = String(x.getMonth() + 1).padStart(2, '0')
    const dd = String(x.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }

  return { startDate: fmt(start), endDate: fmt(end) }
}

async function main() {
  const service = new ErpService({ registerIpcHandlers: false })

  const erpId = process.env.ERP_ID || ''
  const erpPassword = process.env.ERP_PASSWORD || ''
  if (!erpId || !erpPassword) {
    throw new Error('Missing ERP credentials. Set ERP_ID and ERP_PASSWORD env vars.')
  }

  const loginOk = await service.login(erpId, erpPassword)
  if (!loginOk) {
    throw new Error('ERP login failed')
  }

  const { startDate, endDate } = getWeekRangeYmd(new Date())

  const res = await service.getWeeklyReservationDetails(startDate, endDate, { refresh: true })

  const total = res.items.length
  const nullCount = res.items.filter((i) => !i.resourceId).length
  const unassignedCount = res.items.filter((i) => i.resourceId === 'unassigned').length
  const dobongCount = res.items.filter((i) => typeof i.resourceId === 'string' && /^dobong-\d+$/.test(i.resourceId)).length
  const distinct = Array.from(new Set(res.items.map((i) => i.resourceId ?? null))).sort((a, b) => String(a).localeCompare(String(b)))

  const sample = res.items
    .filter((i) => !i.resourceId || i.resourceId === 'unassigned' || !/^dobong-\d+$/.test(i.resourceId))
    .slice(0, 10)
    .map((i) => ({ id: i.id, date: i.date, startTime: i.startTime, title: i.title, resourceId: i.resourceId }))

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    startDate,
    endDate,
    fetchedAt: res.fetchedAt,
    total,
    dobongCount,
    nullCount,
    unassignedCount,
    distinctResourceIds: distinct,
    problematicSample: sample,
  }, null, 2))
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})
