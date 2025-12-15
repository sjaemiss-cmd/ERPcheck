import { useState, useEffect } from 'react'
import { Users, Search, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Member {
    id: string
    name: string
    phone: string
    status: string
    registerDate: string
    memo: string
    birthDate: string
    courseType: string
}

export function MemberManager() {
    const [members, setMembers] = useState<Member[]>([])
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [isSyncing, setIsSyncing] = useState(false)
    const [lastSynced, setLastSynced] = useState<string | null>(null)

    useEffect(() => {
        loadMembers()
    }, [])

    const loadMembers = async () => {
        try {
            const data = await window.api.member.list()
            if (data && Array.isArray(data)) {
                setMembers(data)
                // Optionally set last synced time if data was loaded
                // For now, only set it after an explicit sync
            }
        } catch (error) {
            console.error('Failed to load members:', error)
        }
    }

    // Refined logic for handleSync based on realized backend behavior:
    const handleSyncWithSave = async () => {
        if (isSyncing) return
        setIsSyncing(true)
        try {
            const fetchedMembers = await window.api.erp.fetchMembers({ months: 3 })
            // Check if fetchedMembers is array (success) or boolean (failure/headless issue)?
            // Types needs verification. ErpService.fetchMembers returns Promise<Member[]>.

            if (Array.isArray(fetchedMembers)) {
                await window.api.member.save(fetchedMembers)
                setMembers(fetchedMembers)
                setLastSynced(new Date().toLocaleString())
            }
        } catch (error) {
            console.error('Failed to sync members:', error)
        } finally {
            setIsSyncing(false)
        }
    }

    const filteredMembers = members.filter(m =>
        m.name?.includes(searchTerm) || m.phone?.includes(searchTerm)
    )

    const selectedMember = members.find(m => m.id === selectedMemberId)

    return (
        <div className="flex flex-col h-full bg-gray-100">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-4 flex justify-between items-center">
                <div className="flex items-center space-x-4">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Users className="text-blue-600" />
                        회원 관리
                    </h2>
                    <span className="text-sm text-gray-500">총 {members.length}명</span>
                    {lastSynced && <span className="text-xs text-gray-400">최근 동기화: {lastSynced}</span>}
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={handleSyncWithSave}
                        disabled={isSyncing}
                        className={cn(
                            "flex items-center space-x-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors",
                            isSyncing && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <RefreshCw size={16} className={cn(isSyncing && "animate-spin")} />
                        <span>{isSyncing ? '동기화 중...' : '동기화'}</span>
                    </button>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="이름 또는 전화번호 검색"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-64"
                        />
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Member List */}
                <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
                    {filteredMembers.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            {isSyncing ? '데이터 불러오는 중...' : '검색 결과가 없습니다.'}
                        </div>
                    ) : (
                        filteredMembers.map(member => (
                            <div
                                key={member.id}
                                onClick={() => setSelectedMemberId(member.id)}
                                className={cn(
                                    "p-4 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50",
                                    selectedMemberId === member.id && "bg-blue-50 border-l-4 border-l-blue-600"
                                )}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="font-medium text-gray-900">{member.name}</div>
                                        <div className="text-sm text-gray-500 mt-1">{member.phone}</div>
                                    </div>
                                    <span className={cn(
                                        "px-2 py-0.5 text-xs rounded-full",
                                        member.status === '정상' ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                                    )}>
                                        {member.status}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Detail Panel */}
                <div className="flex-1 bg-gray-50 p-6 overflow-y-auto">
                    {selectedMember ? (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-900">{selectedMember.name}</h3>
                                    <p className="text-gray-500 mt-1">가입일: {selectedMember.registerDate}</p>
                                </div>
                                <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                                    수정하기
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-6 mb-6">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">연락처</label>
                                    <div className="text-gray-900 font-medium">{selectedMember.phone}</div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">상태</label>
                                    <div className="flex items-center">
                                        <span className={cn(
                                            "w-2.5 h-2.5 rounded-full mr-2",
                                            selectedMember.status === 'active' ? "bg-green-500" : "bg-gray-400"
                                        )} />
                                        <span className="text-gray-900 font-medium">
                                            {selectedMember.status === 'active' ? '활동중' : '비활동'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">메모</label>
                                <div className="bg-gray-50 rounded-lg p-4 text-gray-700 min-h-[100px]">
                                    {selectedMember.memo || "메모가 없습니다."}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <Users size={48} className="mb-4 opacity-20" />
                            <p>회원을 선택하여 상세 정보를 확인하세요.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
