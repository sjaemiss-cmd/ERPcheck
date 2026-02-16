import { Home, BookOpen, Calendar, PenTool, Settings } from 'lucide-react'
import logo from '../../assets/logo.png'

interface SidebarProps {
    currentTab: 'dashboard' | 'education' | 'reservation' | 'signature' | 'settings'
    onTabChange: (tab: 'dashboard' | 'education' | 'reservation' | 'signature' | 'settings') => void
}

export function Sidebar({ currentTab, onTabChange }: SidebarProps) {
    const menuItems = [
        { id: 'dashboard' as const, label: '대시보드', icon: Home },
        { id: 'education' as const, label: '교육일지', icon: BookOpen },
        { id: 'reservation' as const, label: '예약 수집', icon: Calendar },
        { id: 'signature' as const, label: '전자서명', icon: PenTool },
        { id: 'settings' as const, label: '설정', icon: Settings },
    ]

    return (
        <div className="w-64 bg-slate-800 text-white flex flex-col">
            <div className="p-4 border-b border-slate-700 flex items-center justify-center">
                <img src={logo} alt="Logo" className="h-12 object-contain" />
            </div>
            <nav className="flex-1 p-4 space-y-2">
                {menuItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center space-x-3 ${currentTab === item.id
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-slate-700 text-slate-300'
                            }`}
                    >
                        <item.icon size={20} />
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>
            <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
                v1.0.0
            </div>
        </div>
    )
}
