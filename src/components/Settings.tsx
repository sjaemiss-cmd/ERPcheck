import { useState, useEffect } from 'react'

import { Save, Lock, Loader2 } from 'lucide-react'

// Since we are not using shadcn/ui components (due to missing dependencies),
// I will implement a raw Tailwind version matching the vibe.

export default function Settings() {
    const [id, setId] = useState('')
    const [password, setPassword] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [statusMsg, setStatusMsg] = useState('')

    useEffect(() => {
        loadCredentials()
    }, [])

    const loadCredentials = async () => {
        try {
            const creds = await window.api.settings.getCredentials()
            if (creds.id) setId(creds.id)
            if (creds.password) setPassword(creds.password)
        } catch (e) {
            console.error('Failed to load credentials', e)
        }
    }

    const handleSave = async () => {
        setIsSaving(true)
        setStatusMsg('')
        try {
            await window.api.settings.saveCredentials({ id, password })
            setStatusMsg('저장되었습니다.')
            setTimeout(() => setStatusMsg(''), 3000)
        } catch (e) {
            console.error(e)
            setStatusMsg('저장 실패.')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="p-8 max-w-2xl mx-auto space-y-6">
            <div className="flex flex-col space-y-2">
                <h2 className="text-2xl font-bold tracking-tight text-gray-900">설정</h2>
                <p className="text-gray-500">ERP 접속 정보 및 애플리케이션 설정을 관리합니다.</p>
            </div>

            <div className="rounded-lg border bg-white text-card-foreground shadow-sm">
                <div className="flex flex-col space-y-1.5 p-6 border-b">
                    <h3 className="text-lg font-semibold leading-none tracking-tight flex items-center">
                        <Lock className="mr-2 h-4 w-4" /> ERP 로그인 정보
                    </h3>
                    <p className="text-sm text-gray-500">
                        자동 로그인을 위해 ERP 아이디와 비밀번호를 저장합니다. 정보는 로컬에 안전하게 저장됩니다.
                    </p>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="erp-id">
                            아이디
                        </label>
                        <input
                            id="erp-id"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="ERP 아이디 입력"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="erp-pw">
                            비밀번호
                        </label>
                        <input
                            id="erp-pw"
                            type="password"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="ERP 비밀번호 입력"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex items-center p-6 pt-0">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none bg-black text-white hover:bg-black/90 h-10 px-4 py-2 ml-auto"
                    >
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        저장하기
                    </button>
                </div>
                {statusMsg && (
                    <div className="px-6 pb-6">
                        <div className="p-3 bg-green-50 text-green-700 text-sm rounded-md flex items-center">
                            <span className="font-bold mr-2">✓</span> {statusMsg}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
