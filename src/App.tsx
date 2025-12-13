import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { EducationManager } from './components/education/EducationManager'
import { Dashboard } from './components/dashboard/Dashboard'

function App() {
    const [currentTab, setCurrentTab] = useState<'dashboard' | 'education' | 'reservation' | 'settings'>('education')

    return (
        <div className="flex h-screen bg-gray-100">
            <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />
            <div className="flex-1 overflow-hidden">
                {currentTab === 'dashboard' && <Dashboard />}
                {currentTab === 'education' && <EducationManager />}
                {currentTab === 'reservation' && (
                    <div className="p-8">
                        <h2 className="text-2xl font-bold mb-4">예약 수집</h2>
                        <p className="text-gray-500">준비 중입니다...</p>
                    </div>
                )}
                {currentTab === 'settings' && (
                    <div className="p-8">
                        <h2 className="text-2xl font-bold mb-4">설정</h2>
                        <p className="text-gray-500">준비 중입니다...</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default App
