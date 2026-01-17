import { WeeklyResourceTimeGrid } from './WeeklyResourceTimeGrid'

interface DashboardProps {
    isActive?: boolean
}

export function Dashboard({ isActive = true }: DashboardProps) {
    return (
        <div className="p-8 space-y-6">
            <h2 className="text-2xl font-bold">대시보드</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">금일 교육</h3>
                    <p className="text-3xl font-bold text-blue-600">0명</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">신규 예약</h3>
                    <p className="text-3xl font-bold text-green-600">0건</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">처리 대기</h3>
                    <p className="text-3xl font-bold text-orange-600">0건</p>
                </div>
            </div>
            
            <WeeklyResourceTimeGrid isActive={isActive} />
        </div>
    )
}
