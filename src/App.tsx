import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { EducationManager } from './components/education/EducationManager'
import { Dashboard } from './components/dashboard/Dashboard'
import { ReservationCollector } from './components/reservation/ReservationCollector'
import Settings from './components/Settings'

function App() {
    const [currentTab, setCurrentTab] = useState<'dashboard' | 'education' | 'reservation' | 'settings'>('education')

    return (
        <div className="flex h-screen bg-gray-100">
            <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />
            <div className="flex-1 overflow-hidden">
                {currentTab === 'dashboard' && <Dashboard />}
                {currentTab === 'education' && <EducationManager />}
                {currentTab === 'reservation' && <ReservationCollector />}
                {currentTab === 'settings' && <Settings />}
            </div>
        </div>
    )
}

export default App
