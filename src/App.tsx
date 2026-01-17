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
                <div className={currentTab === 'dashboard' ? 'h-full w-full overflow-auto' : 'hidden'}>
                    <Dashboard isActive={currentTab === 'dashboard'} />
                </div>
                <div className={currentTab === 'education' ? 'h-full w-full' : 'hidden'}>
                    <EducationManager />
                </div>
                <div className={currentTab === 'reservation' ? 'h-full w-full' : 'hidden'}>
                    <ReservationCollector />
                </div>
                <div className={currentTab === 'settings' ? 'h-full w-full overflow-auto' : 'hidden'}>
                    <Settings />
                </div>
            </div>
        </div>
    )
}

export default App
