import { useState, useEffect } from 'react'
import { Save, Eye, EyeOff, CheckCircle } from 'lucide-react'

export default function Settings() {
    const [id, setId] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [saved, setSaved] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadCredentials()
    }, [])

    const loadCredentials = async () => {
        try {
            const creds = await window.api.settings.getCredentials()
            setId(creds.id || '')
            setPassword(creds.password || '')
        } catch (err) {
            console.error('Failed to load credentials:', err)
        }
        setLoading(false)
    }

    const handleSave = async () => {
        await window.api.settings.saveCredentials({ id: id.trim(), password: password.trim() })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-500">로딩 중...</div>
    }

    return (
        <div className="p-8 max-w-2xl mx-auto space-y-6">
            <div className="flex flex-col space-y-2">
                <h2 className="text-2xl font-bold tracking-tight text-gray-900">설정</h2>
                <p className="text-gray-500">ERP 접속 정보 및 애플리케이션 설정을 관리합니다.</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
                <h3 className="text-lg font-semibold text-gray-900">ERP 로그인 정보</h3>

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">아이디</label>
                    <input
                        type="text"
                        value={id}
                        onChange={e => setId(e.target.value)}
                        placeholder="ERP 아이디 입력"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">비밀번호</label>
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="ERP 비밀번호 입력"
                            className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                    <button
                        onClick={handleSave}
                        disabled={!id.trim() || !password.trim()}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Save size={16} />
                        저장
                    </button>
                    {saved && (
                        <span className="text-sm text-green-600 flex items-center gap-1">
                            <CheckCircle size={16} />
                            저장되었습니다
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
