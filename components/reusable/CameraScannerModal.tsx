"use client"

import React, { useEffect, useRef, useState } from "react"
import { DefaultModal, Spinner, IconPlaceholder } from "@/components/reusable"
import { CameraIcon } from "@/lib/icons"
import { playBeepSound, vibrateMobile } from "@/lib/utils/barcode"
import { Zap } from "lucide-react"

interface CameraScannerModalProps {
    isOpen: boolean
    onClose: () => void
    onScan: (barcode: string) => void
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
    isOpen,
    onClose,
    onScan,
}) => {
    const [loading, setLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [hasTorch, setHasTorch] = useState(false)
    const [torchOn, setTorchOn] = useState(false)
    const [isScannedSuccess, setIsScannedSuccess] = useState(false)
    const scannerRef = useRef<any>(null)
    const hasScannedRef = useRef(false)
    const elementId = "html5-qrcode-scanner-viewport"

    useEffect(() => {
        if (!isOpen) return

        let isMounted = true
        let html5QrcodeInstance: any = null
        hasScannedRef.current = false
        setIsScannedSuccess(false)
        setLoading(true)
        setErrorMessage(null)
        setHasTorch(false)
        setTorchOn(false)

        // Lazy load html5-qrcode to prevent SSR reference errors
        import("html5-qrcode")
            .then(async ({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
                if (!isMounted) return

                try {
                    // Check if navigator.mediaDevices is supported (HTTPS check)
                    if (typeof window === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        throw new Error(
                            "O acesso à câmera requer uma conexão segura (HTTPS) ou localhost. Se estiver testando no celular, certifique-se de usar HTTPS ou localhost."
                        )
                    }

                    // Check for camera availability
                    const devices = await Html5Qrcode.getCameras()
                    if (!devices || devices.length === 0) {
                        throw new Error("Nenhuma câmera encontrada no dispositivo.")
                    }

                    if (!isMounted) return
                    setLoading(false)

                    const formats = [
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8,
                        Html5QrcodeSupportedFormats.UPC_A,
                        Html5QrcodeSupportedFormats.UPC_E,
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.CODE_39,
                        Html5QrcodeSupportedFormats.QR_CODE,
                    ]

                    // Create camera instance with hardware BarcodeDetector acceleration
                    html5QrcodeInstance = new Html5Qrcode(elementId, {
                        formatsToSupport: formats,
                        verbose: false,
                        experimentalFeatures: {
                            useBarCodeDetectorIfSupported: true,
                        },
                    })
                    scannerRef.current = html5QrcodeInstance

                    await html5QrcodeInstance.start(
                        { facingMode: "environment" },
                        {
                            fps: 20,
                            aspectRatio: 1.333333,
                            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                                // Optimal rectangle for standard barcode scanning (EAN/UPC/Code128)
                                const w = Math.min(Math.floor(viewfinderWidth * 0.85), 320)
                                const h = Math.min(Math.floor(viewfinderHeight * 0.45), 150)
                                return { width: Math.max(w, 60), height: Math.max(h, 60) }
                            },
                        },
                        (decodedText: string) => {
                            if (!isMounted || hasScannedRef.current) return
                            hasScannedRef.current = true
                            setIsScannedSuccess(true)
                            playBeepSound()
                            vibrateMobile()

                            // Short 160ms visual confirmation before closing
                            setTimeout(() => {
                                onScan(decodedText)
                                onClose()
                            }, 160)
                        },
                        () => {
                            // Suppress verbose frame-by-frame decoding errors
                        }
                    )

                    if (!isMounted) {
                        if (html5QrcodeInstance?.isScanning) {
                            html5QrcodeInstance.stop().catch(() => {}).then(() => {
                                try { html5QrcodeInstance.clear() } catch {}
                            })
                        }
                        return
                    }

                    // Detect flashlight (torch) capability
                    try {
                        const stream = (html5QrcodeInstance as any)?.localMediaStream as MediaStream | undefined
                        const track = stream?.getVideoTracks?.()[0]
                        const capabilities = (track as any)?.getCapabilities?.()
                        if (capabilities?.torch) {
                            setHasTorch(true)
                        }
                    } catch {
                        // Torch not supported on this device/browser
                    }
                } catch (err: any) {
                    const message = err.message || String(err)
                    const isPermissionError = (
                        err.name === "NotAllowedError" ||
                        err.name === "PermissionDeniedError" ||
                        message.includes("NotAllowedError") ||
                        message.includes("Permission denied") ||
                        message.includes("permission") ||
                        message.includes("Permissão")
                    )
                    const isNoCameraError = (
                        message.includes("Nenhuma câmera") ||
                        err.name === "NotFoundError" ||
                        err.name === "DevicesNotFoundError" ||
                        message.includes("NotFoundError")
                    )
                    if (isPermissionError) {
                        console.warn("Camera permission denied (handled warning)")
                    } else if (isNoCameraError) {
                        console.warn("No camera device found on this system (handled warning)")
                    } else {
                        console.error("Camera scanner initialization failed:", err)
                    }
                    if (isMounted) {
                        setLoading(false)
                        if (isPermissionError) {
                            setErrorMessage("Permissão de acesso à câmera negada. Por favor, ative a permissão de câmera nas configurações do navegador.")
                        } else if (isNoCameraError) {
                            setErrorMessage("Nenhuma câmera encontrada no dispositivo.")
                        } else {
                            setErrorMessage(err.message || "Permissão de câmera negada ou erro ao iniciar.")
                        }
                    }
                }
            })
            .catch((err) => {
                console.error("Failed to load html5-qrcode dynamically:", err)
                if (isMounted) {
                    setLoading(false)
                    setErrorMessage("Falha ao carregar o módulo de escaneamento.")
                }
            })

        return () => {
            isMounted = false
            if (html5QrcodeInstance) {
                if (html5QrcodeInstance.isScanning) {
                    html5QrcodeInstance
                        .stop()
                        .then(() => {
                            try {
                                html5QrcodeInstance.clear()
                            } catch {}
                        })
                        .catch((err: any) => {
                            console.error("Error stopping html5-qrcode scanner:", err)
                        })
                }
            }
        }
    }, [isOpen, onScan, onClose])

    const toggleTorch = async () => {
        try {
            const stream = (scannerRef.current as any)?.localMediaStream as MediaStream | undefined
            const track = stream?.getVideoTracks?.()[0]
            if (track) {
                const nextState = !torchOn
                await (track as any).applyConstraints({
                    advanced: [{ torch: nextState }]
                })
                setTorchOn(nextState)
            }
        } catch (e) {
            console.warn("Torch toggle failed:", e)
        }
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title="Escanear Código de Barras"
            maxWidth="md"
        >
            <div className="flex flex-col items-center justify-center p-2 pt-3 pb-6 space-y-4">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body text-center max-w-sm">
                    Aponte a câmera para o código de barras do produto. Posicione o código dentro da marcação central.
                </p>

                <div className="relative w-full aspect-[4/3] max-w-sm rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden flex items-center justify-center bg-black shadow-inner">
                    {/* Scoped CSS to completely eliminate html5-qrcode's ugly default border shaders and style the video */}
                    <style jsx global>{`
                        #html5-qrcode-scanner-viewport {
                            width: 100% !important;
                            height: 100% !important;
                            border: none !important;
                            position: relative !important;
                            display: flex !important;
                            align-items: center !important;
                            justify-content: center !important;
                            background: #000 !important;
                            overflow: hidden !important;
                        }
                        #html5-qrcode-scanner-viewport video {
                            width: 100% !important;
                            height: 100% !important;
                            object-fit: cover !important;
                            border-radius: 1rem !important;
                        }
                        #html5-qrcode-scanner-viewport #qr-shaded-region {
                            display: none !important;
                        }
                        #html5-qrcode-scanner-viewport #qr-shaded-region > div {
                            display: none !important;
                        }
                    `}</style>

                    {loading && (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center space-y-3 bg-white/95 dark:bg-dark-surface/95">
                            <Spinner size={32} className="text-brand-primary" />
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                Iniciando câmera...
                            </span>
                        </div>
                    )}

                    {errorMessage && (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white dark:bg-dark-surface p-4">
                            <IconPlaceholder
                                icon={CameraIcon}
                                title="Acesso à câmera negado"
                                subtitle={errorMessage}
                                itemButton={{
                                    text: "Fechar",
                                    action: onClose,
                                    variant: "outline",
                                }}
                            />
                        </div>
                    )}

                    {/* Viewport where html5-qrcode will mount */}
                    <div id={elementId} className="w-full h-full object-cover" />

                    {/* Flashlight button if supported */}
                    {hasTorch && !loading && !errorMessage && (
                        <button
                            type="button"
                            onClick={toggleTorch}
                            className={`absolute top-3 right-3 z-30 p-2.5 rounded-full backdrop-blur-md transition-all shadow-md ${
                                torchOn
                                    ? "bg-amber-400 text-black shadow-amber-400/40 scale-105"
                                    : "bg-black/55 text-white hover:bg-black/75 hover:scale-105"
                            }`}
                            title={torchOn ? "Desativar lanterna" : "Ativar lanterna"}
                        >
                            <Zap size={16} className={torchOn ? "fill-current" : ""} />
                        </button>
                    )}

                    {/* Modern pixel-perfect viewfinder overlay */}
                    {!loading && !errorMessage && (
                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-20">
                            {/* Frame target box */}
                            <div
                                className={`relative w-[82%] max-w-[290px] h-[135px] rounded-2xl flex items-center justify-center transition-transform duration-200 ${
                                    isScannedSuccess ? "scale-105" : ""
                                }`}
                            >
                                {/* Darkened vignette backdrop outside the scan window */}
                                <div className="absolute inset-0 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.50)] pointer-events-none" />

                                {/* 4 Clean, Symmetrical Modern Corner Brackets */}
                                {/* Top-Left */}
                                <div
                                    className={`absolute -top-[1.5px] -left-[1.5px] w-7 h-7 border-t-[3.5px] border-l-[3.5px] rounded-tl-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] transition-colors duration-200 ${
                                        isScannedSuccess ? "border-emerald-400" : "border-white"
                                    }`}
                                />
                                {/* Top-Right */}
                                <div
                                    className={`absolute -top-[1.5px] -right-[1.5px] w-7 h-7 border-t-[3.5px] border-r-[3.5px] rounded-tr-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] transition-colors duration-200 ${
                                        isScannedSuccess ? "border-emerald-400" : "border-white"
                                    }`}
                                />
                                {/* Bottom-Left */}
                                <div
                                    className={`absolute -bottom-[1.5px] -left-[1.5px] w-7 h-7 border-b-[3.5px] border-l-[3.5px] rounded-bl-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] transition-colors duration-200 ${
                                        isScannedSuccess ? "border-emerald-400" : "border-white"
                                    }`}
                                />
                                {/* Bottom-Right */}
                                <div
                                    className={`absolute -bottom-[1.5px] -right-[1.5px] w-7 h-7 border-b-[3.5px] border-r-[3.5px] rounded-br-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] transition-colors duration-200 ${
                                        isScannedSuccess ? "border-emerald-400" : "border-white"
                                    }`}
                                />

                                {/* Centered Red Scanning Laser Line */}
                                <div
                                    className={`absolute inset-x-2 top-1/2 -translate-y-1/2 h-[2px] transition-all duration-200 pointer-events-none z-10 ${
                                        isScannedSuccess
                                            ? "bg-emerald-400 shadow-[0_0_12px_#34d399,0_0_4px_#34d399]"
                                            : "bg-red-500 shadow-[0_0_10px_#ef4444,0_0_4px_#ef4444] animate-pulse"
                                    }`}
                                />

                                {/* Subtle glowing center sweep effect */}
                                {!isScannedSuccess && (
                                    <div className="absolute inset-x-2 h-6 top-1/2 -translate-y-1/2 bg-gradient-to-b from-red-500/15 via-red-500/5 to-transparent pointer-events-none" />
                                )}
                            </div>

                            {/* Center guidance badge */}
                            <div className="mt-4 px-3 py-1 rounded-full bg-black/65 backdrop-blur-md text-white/95 text-xs font-medium tracking-wide flex items-center gap-1.5 shadow-md">
                                <span>{isScannedSuccess ? "Código identificado!" : "Alinhe o código de barras no centro"}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </DefaultModal>
    )
}
