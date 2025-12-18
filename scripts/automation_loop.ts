// import { LlmService } from '../electron/services/LlmService.ts'
// import { ErpService } from '../electron/services/ErpService.ts'
import type { ReservationData, Customer } from '../electron/services/types.ts'

interface LlmAnalysisResult {
    isBooking: boolean
    name: string
    date: string | null
    time: string | null
    course: string | null
    reply: string
    requiresManualCheck: boolean
}

// Mock LlmService
class MockLlmService {
    async analyzeMessage(text: string, _profileName: string, _date: string): Promise<LlmAnalysisResult> {
        console.log(`[MockLlm] Analyzing: "${text}"`)
        return {
            isBooking: true,
            name: '홍길동',
            date: '2025-12-19', // Mock tomorrow
            time: '14:00',
            course: '1종보통',
            reply: '네, 내일 2시 1종보통 예약 도와드리겠습니다.',
            requiresManualCheck: false
        }
    }
}

// Mock ErpService
class MockErpService {
    async searchCustomer(name: string): Promise<Customer[]> {
        console.log(`[MockErp] Searching for ${name}`)
        if (name === '홍길동') {
            return [{
                id: '12345',
                name: '홍길동',
                phone: '010-1234-5678'
            }]
        }
        return []
    }

    async checkDuplicate(customer: Customer, date: string): Promise<boolean> {
        console.log(`[MockErp] Checking duplicate for ${customer.name} on ${date}`)
        return false
    }

    async registerReservation(data: ReservationData): Promise<boolean> {
        console.log(`[MockErp] Registering reservation:`, data)
        return true
    }
}

async function main() {
    const llmService = new MockLlmService()
    const erpService = new MockErpService()

    // Mock Chat Message
    // "Tomorrow 2pm" relative to today
    const chatMessage = "내일 오후 2시 1종보통 예약하고 싶어요. 이름은 홍길동입니다."
    const currentDate = new Date().toISOString().split('T')[0]

    console.log(`[Automation] Processing message: "${chatMessage}"`)

    // 1. LLM Analysis
    try {
        const analysis = await llmService.analyzeMessage(chatMessage, "홍길동", currentDate)
        console.log('[Automation] LLM Analysis:', analysis)

        if (!analysis.isBooking) {
            console.log('[Automation] Not a booking request.')
            return
        }

        if (analysis.requiresManualCheck) {
            console.log('[Automation] Requires manual check:', analysis.reply)
            return
        }

        if (!analysis.name || !analysis.date || !analysis.time) {
            console.log('[Automation] Missing info:', analysis)
            return
        }

        // 2. ERP Search
        console.log(`[Automation] Searching for customer: ${analysis.name}`)
        const customers = await erpService.searchCustomer(analysis.name)

        let customerId = ''
        if (customers.length === 0) {
            console.log('[Automation] Customer not found. Will register as new (or handle manually).')
            // For now, we might skip or try to register as new if supported
        } else if (customers.length === 1) {
            customerId = customers[0].id
            console.log(`[Automation] Found customer: ${customers[0].name} (${customerId})`)
        } else {
            console.log('[Automation] Multiple customers found. Manual check required.')
            return
        }

        // 3. Check Duplicate
        if (customerId) {
            const isDuplicate = await erpService.checkDuplicate(customers[0], analysis.date!)
            if (isDuplicate) {
                console.log('[Automation] Duplicate reservation detected.')
                return
            }
        }

        // 4. Register Reservation
        const reservationData: ReservationData = {
            customerId: customerId,
            name: analysis.name,
            date: analysis.date!,
            time: analysis.time!,
            duration: 1, // Default or parsed from course
            type: analysis.course || '1종보통' // Default
        }

        console.log('[Automation] Registering reservation:', reservationData)

        const success = await erpService.registerReservation(reservationData)
        console.log('[Automation] Registration result:', success)

    } catch (e) {
        console.error('[Automation] Error:', e)
    }
}

main().catch(console.error)
