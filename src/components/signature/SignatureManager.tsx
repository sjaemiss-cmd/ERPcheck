import { useSignatureStore } from '../../store/useSignatureStore'
import { SignatureDashboard } from './SignatureDashboard'
import { FormList } from './FormList'
import { FormEditor } from './FormEditor'
import { SignForm } from './SignForm'
import { SignatureList } from './SignatureList'
import { SignatureDetail } from './SignatureDetail'

export function SignatureManager() {
    const currentView = useSignatureStore(s => s.currentView)

    return (
        <div className="h-full flex flex-col">
            {currentView === 'dashboard' && <SignatureDashboard />}
            {currentView === 'forms' && <FormList />}
            {currentView === 'formEdit' && <FormEditor />}
            {currentView === 'sign' && <SignForm />}
            {currentView === 'signatures' && <SignatureList />}
            {currentView === 'signatureDetail' && <SignatureDetail />}
        </div>
    )
}
