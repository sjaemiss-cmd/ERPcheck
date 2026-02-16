import { useRef, useState, useEffect, useCallback } from 'react'
import SignatureCanvas from 'react-signature-canvas'

interface SignaturePadProps {
    onSignatureChange?: (dataUrl: string | null) => void
    width?: number
    height?: number
}

export default function SignaturePad({
    onSignatureChange,
    width,
    height = 200,
}: SignaturePadProps) {
    const sigCanvas = useRef<SignatureCanvas>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [isEmpty, setIsEmpty] = useState(true)
    const [canvasWidth, setCanvasWidth] = useState(width || 400)

    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current && !width) {
                setCanvasWidth(containerRef.current.offsetWidth)
            }
        }

        updateSize()
        window.addEventListener('resize', updateSize)
        return () => window.removeEventListener('resize', updateSize)
    }, [width])

    const handleEnd = useCallback(() => {
        if (sigCanvas.current) {
            const hasSignature = !sigCanvas.current.isEmpty()
            setIsEmpty(!hasSignature)

            if (hasSignature && onSignatureChange) {
                const dataUrl = sigCanvas.current.toDataURL('image/png')
                onSignatureChange(dataUrl)
            } else if (onSignatureChange) {
                onSignatureChange(null)
            }
        }
    }, [onSignatureChange])

    const handleClear = () => {
        if (sigCanvas.current) {
            sigCanvas.current.clear()
            setIsEmpty(true)
            if (onSignatureChange) {
                onSignatureChange(null)
            }
        }
    }

    return (
        <div className="space-y-3">
            <div
                ref={containerRef}
                className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white relative"
                style={{ touchAction: 'none' }}
            >
                <SignatureCanvas
                    ref={sigCanvas}
                    canvasProps={{
                        width: canvasWidth,
                        height: height,
                        className: 'signature-canvas w-full',
                        style: { touchAction: 'none' },
                    }}
                    backgroundColor="rgb(255, 255, 255)"
                    penColor="#000000"
                    minWidth={0.5}
                    maxWidth={2.5}
                    onEnd={handleEnd}
                />

                {isEmpty && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <p className="text-gray-400 text-sm">이곳에 서명해 주세요</p>
                    </div>
                )}
            </div>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={handleClear}
                    disabled={isEmpty}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    지우기
                </button>
            </div>
        </div>
    )
}
