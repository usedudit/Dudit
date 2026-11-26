"use client"

import React, { useEffect, useRef, useState } from "react"
import { DefaultModal, Spinner, IconPlaceholder } from "@/components/reusable"
import { CameraIcon } from "@/lib/icons"
import { playBeepSound, vibrateMobile } from "@/lib/utils/barcode"
import { Zap, ZoomIn, ZoomOut } from "lucide-react"

interface CameraScannerModalProps {
    isOpen: boolean
    onClose: () => void
    onScan: (barcode: string) => void
}

const SUPPORTED_FORMATS = [
    "ean_13",
    "ean_8",
    "upc_a",
    "upc_e",
    "code_128",
    "code_39",
    "itf",
    "qr_code",
] as const

type BarcodeDetectorLike = {
    detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>
}

async function createBarcodeDetector(): Promise<BarcodeDetectorLike> {
    // 1. Prefer native hardware-accelerated BarcodeDetector when available and supporting EAN-13
    const NativeDetector = typeof window !== "undefined" ? (window as any).BarcodeDetector : undefined
    if (NativeDetector && typeof NativeDetector.getSupportedFormats === "function") {
        try {
            const nativeFormats: string[] = await NativeDetector.getSupportedFormats()
            const formats = SUPPORTED_FORMATS.filter((f) => nativeFormats.includes(f))
            if (formats.includes("ean_13") && formats.includes("code_128")) {
                return new NativeDetector({ formats })
            }
        } catch {
            // Fall through to ZXing-C++ WASM ponyfill
        }
    }

    // 2. Fallback to ZXing-C++ WebAssembly ponyfill (works on iOS Safari, Firefox, Desktop, etc.)
    const { BarcodeDetector: PonyfillDetector, setZXingModuleOverrides } = await import(
        "barcode-detector/ponyfill"
    )
    setZXingModuleOverrides({
        locateFile: (path: string, prefix: string) => {
            if (path.endsWith(".wasm")) {
                return "/wasm/zxing_reader.wasm"
            }
            return prefix + path
        },
    })
    return new PonyfillDetector({
        formats: [...SUPPORTED_FORMATS],
    })
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
    const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null)
    const [isZoomed, setIsZoomed] = useState(false)
    const [isScannedSuccess, setIsScannedSuccess] = useState(false)

    const videoRef = useRef<HTMLVideoElement | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const hasScannedRef = useRef(false)

    // Keep latest callbacks in refs so parent re-renders NEVER restart the camera stream
    const onScanRef = useRef(onScan)
    const onCloseRef = useRef(onClose)
    onScanRef.current = onScan
    onCloseRef.current = onClose

    useEffect(() => {
        if (!isOpen) return

        let isMounted = true
        let scanTimer: ReturnType<typeof setTimeout> | null = null
        let closeTimer: ReturnType<typeof setTimeout> | null = null

        hasScannedRef.current = false
        setIsScannedSuccess(false)
        setLoading(true)
        setErrorMessage(null)
        setHasTorch(false)
        setTorchOn(false)
        setZoomRange(null)
        setIsZoomed(false)

        const stopStream = () => {
            if (scanTimer) {
                clearTimeout(scanTimer)
                scanTimer = null
            }
            if (closeTimer) {
                clearTimeout(closeTimer)
                closeTimer = null
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => {
                    try {
                        track.stop()
                    } catch {
                        // ignore
                    }
                })
                streamRef.current = null
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null
            }
        }

        const startCamera = async () => {
            try {
                if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
                    throw new Error(
                        "O acesso à câmera requer uma conexão segura (HTTPS) ou localhost. Se estiver testando no celular, certifique-se de usar HTTPS ou localhost."
                    )
                }

                // Request HD rear camera + initialize detector in parallel
                const [stream, detector] = await Promise.all([
                    navigator.mediaDevices
                        .getUserMedia({
                            video: {
                                facingMode: { ideal: "environment" },
                                width: { ideal: 1920, min: 640 },
                                height: { ideal: 1080, min: 480 },
                            },
                            audio: false,
                        })
                        .catch(async (firstErr) => {
                            // Fallback for devices that reject HD constraints
                            if (firstErr?.name === "OverconstrainedError" || firstErr?.name === "ConstraintNotSatisfiedError") {
                                return navigator.mediaDevices.getUserMedia({
                                    video: { facingMode: "environment" },
                                    audio: false,
                                })
                            }
                            throw firstErr
                        }),
                    createBarcodeDetector(),
                ])

                if (!isMounted) {
                    stream.getTracks().forEach((t) => t.stop())
                    return
                }

                streamRef.current = stream
                const video = videoRef.current
                if (!video) {
                    stopStream()
                    return
                }

                video.srcObject = stream
                await video.play()

                if (!isMounted) {
                    stopStream()
                    return
                }

                // Apply continuous autofocus and inspect torch/zoom capabilities
                const track = stream.getVideoTracks()[0]
                if (track) {
                    try {
                        const capabilities = (track as any).getCapabilities?.()
                        if (capabilities?.torch) {
                            setHasTorch(true)
                        }
                        if (
                            capabilities?.zoom &&
                            typeof capabilities.zoom.min === "number" &&
                            typeof capabilities.zoom.max === "number" &&
                            capabilities.zoom.max >= 1.8
                        ) {
                            setZoomRange({ min: capabilities.zoom.min, max: capabilities.zoom.max })
                        }
                        if (Array.isArray(capabilities?.focusMode) && capabilities.focusMode.includes("continuous")) {
                            await (track as any).applyConstraints({
                                advanced: [{ focusMode: "continuous" }],
                            })
                        }
                    } catch {
                        // Device/browser does not expose advanced track constraints
                    }
                }

                setLoading(false)

                // Reusable offscreen canvas for consistent cross-browser decoding (iOS Safari, Android, Desktop)
                const canvas = document.createElement("canvas")
                const ctx = canvas.getContext("2d", { willReadFrequently: true })

                const scanFrame = async () => {
                    if (!isMounted || hasScannedRef.current) return

                    const currentVideo = videoRef.current
                    if (
                        currentVideo &&
                        currentVideo.readyState >= 2 &&
                        currentVideo.videoWidth > 0 &&
                        currentVideo.videoHeight > 0 &&
                        ctx
                    ) {
                        try {
                            // Cap canvas width at 1280px for crisp 1D bars without slowing down WASM
                            const maxDim = 1280
                            const scale = Math.min(1, maxDim / Math.max(currentVideo.videoWidth, currentVideo.videoHeight))
                            const targetW = Math.round(currentVideo.videoWidth * scale)
                            const targetH = Math.round(currentVideo.videoHeight * scale)

                            if (canvas.width !== targetW || canvas.height !== targetH) {
                                canvas.width = targetW
                                canvas.height = targetH
                            }

                            ctx.drawImage(currentVideo, 0, 0, targetW, targetH)
                            const results = await detector.detect(canvas)

                            if (!isMounted || hasScannedRef.current) return

                            const matched = results.find((r) => typeof r.rawValue === "string" && r.rawValue.trim().length > 0)
                            if (matched?.rawValue) {
                                const code = matched.rawValue.trim()
                                hasScannedRef.current = true
                                setIsScannedSuccess(true)
                                playBeepSound()
                                vibrateMobile()

                                closeTimer = setTimeout(() => {
                                    if (!isMounted) return
                                    onScanRef.current(code)
                                    onCloseRef.current()
                                }, 160)
                                return
                            }
                        } catch {
                            // Ignore transient frame decode errors
                        }
                    }

                    if (isMounted && !hasScannedRef.current) {
                        scanTimer = setTimeout(scanFrame, 90)
                    }
                }

                scanTimer = setTimeout(scanFrame, 120)
            } catch (err: any) {
                stopStream()
                const message = err?.message || String(err)
                const isPermissionError =
                    err?.name === "NotAllowedError" ||
                    err?.name === "PermissionDeniedError" ||
                    message.includes("NotAllowedError") ||
                    message.includes("Permission denied") ||
                    message.includes("permission") ||
                    message.includes("Permissão")
                const isNoCameraError =
                    message.includes("Nenhuma câmera") ||
                    err?.name === "NotFoundError" ||
                    err?.name === "DevicesNotFoundError" ||
                    message.includes("NotFoundError")

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
                        setErrorMessage(
                            "Permissão de acesso à câmera negada. Por favor, ative a permissão de câmera nas configurações do navegador."
                        )
                    } else if (isNoCameraError) {
                        setErrorMessage("Nenhuma câmera encontrada no dispositivo.")
                    } else {
                        setErrorMessage(err?.message || "Erro ao iniciar a câmera.")
                    }
                }
            }
        }

        void startCamera()

        return () => {
            isMounted = false
            stopStream()
        }
    }, [isOpen])

    const toggleTorch = async () => {
        try {
            const track = streamRef.current?.getVideoTracks?.()[0]
            if (track) {
                const nextState = !torchOn
                await (track as any).applyConstraints({
                    advanced: [{ torch: nextState }],
                })
                setTorchOn(nextState)
            }
        } catch (e) {
            console.warn("Torch toggle failed:", e)
        }
    }

    const toggleZoom = async () => {
        try {
            const track = streamRef.current?.getVideoTracks?.()[0]
            if (track && zoomRange) {
                const nextZoomed = !isZoomed
                const targetZoom = nextZoomed
                    ? Math.min(2, zoomRange.max)
                    : Math.max(1, zoomRange.min)
                await (track as any).applyConstraints({
                    advanced: [{ zoom: targetZoom }],
                })
                setIsZoomed(nextZoomed)
            }
        } catch (e) {
            console.warn("Zoom toggle failed:", e)
        }
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title="Escanear Código de Barras"
            maxWidth="md"
        >
            <div className="flex flex-col items-center justify-center p-2 pt-3 pb-4 space-y-3">
                <div className="relative w-full aspect-[4/3] max-w-sm rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden flex items-center justify-center bg-black shadow-inner">
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
                                title="Acesso à câmera indisponível"
                                subtitle={errorMessage}
                                itemButton={{
                                    text: "Fechar",
                                    action: onClose,
                                    variant: "outline",
                                }}
                            />
                        </div>
                    )}

                    {/* Live camera video */}
                    <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        className="w-full h-full object-cover"
                    />

                    {/* Camera controls (zoom & flashlight) */}
                    {!loading && !errorMessage && (hasTorch || zoomRange) && (
                        <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
                            {zoomRange && (
                                <button
                                    type="button"
                                    onClick={toggleZoom}
                                    className={`p-2.5 rounded-full backdrop-blur-md transition-all shadow-md flex items-center justify-center ${
                                        isZoomed
                                            ? "bg-brand-primary text-white scale-105"
                                            : "bg-black/55 text-white hover:bg-black/75 hover:scale-105"
                                    }`}
                                    title={isZoomed ? "Voltar para 1x" : "Aproximar (2x)"}
                                >
                                    {isZoomed ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
                                </button>
                            )}
                            {hasTorch && (
                                <button
                                    type="button"
                                    onClick={toggleTorch}
                                    className={`p-2.5 rounded-full backdrop-blur-md transition-all shadow-md ${
                                        torchOn
                                            ? "bg-amber-400 text-black shadow-amber-400/40 scale-105"
                                            : "bg-black/55 text-white hover:bg-black/75 hover:scale-105"
                                    }`}
                                    title={torchOn ? "Desativar lanterna" : "Ativar lanterna"}
                                >
                                    <Zap size={16} className={torchOn ? "fill-current" : ""} />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Modern viewfinder overlay */}
                    {!loading && !errorMessage && (
                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-20">
                            <div
                                className={`relative w-[84%] max-w-[300px] h-[140px] rounded-2xl flex items-center justify-center transition-transform duration-200 ${
                                    isScannedSuccess ? "scale-105" : ""
                                }`}
                            >
                                {/* Darkened vignette backdrop outside the scan window */}
                                <div className="absolute inset-0 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] pointer-events-none" />

                                {/* 4 Clean Corner Brackets */}
                                <div
                                    className={`absolute -top-[1.5px] -left-[1.5px] w-7 h-7 border-t-[3.5px] border-l-[3.5px] rounded-tl-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] transition-colors duration-200 ${
                                        isScannedSuccess ? "border-emerald-400" : "border-white"
                                    }`}
                                />
                                <div
                                    className={`absolute -top-[1.5px] -right-[1.5px] w-7 h-7 border-t-[3.5px] border-r-[3.5px] rounded-tr-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] transition-colors duration-200 ${
                                        isScannedSuccess ? "border-emerald-400" : "border-white"
                                    }`}
                                />
                                <div
                                    className={`absolute -bottom-[1.5px] -left-[1.5px] w-7 h-7 border-b-[3.5px] border-l-[3.5px] rounded-bl-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] transition-colors duration-200 ${
                                        isScannedSuccess ? "border-emerald-400" : "border-white"
                                    }`}
                                />
                                <div
                                    className={`absolute -bottom-[1.5px] -right-[1.5px] w-7 h-7 border-b-[3.5px] border-r-[3.5px] rounded-br-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] transition-colors duration-200 ${
                                        isScannedSuccess ? "border-emerald-400" : "border-white"
                                    }`}
                                />

                                {/* Centered Scanning Laser Line */}
                                <div
                                    className={`absolute inset-x-2 top-1/2 -translate-y-1/2 h-[2px] transition-all duration-200 pointer-events-none z-10 ${
                                        isScannedSuccess
                                            ? "bg-emerald-400 shadow-[0_0_12px_#34d399,0_0_4px_#34d399]"
                                            : "bg-red-500 shadow-[0_0_10px_#ef4444,0_0_4px_#ef4444] animate-pulse"
                                    }`}
                                />

                                {!isScannedSuccess && (
                                    <div className="absolute inset-x-2 h-6 top-1/2 -translate-y-1/2 bg-gradient-to-b from-red-500/15 via-red-500/5 to-transparent pointer-events-none" />
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {!loading && !errorMessage && (
                    <p className="text-xs text-center text-brand-inactive-text dark:text-dark-body px-2">
                        Posicione o código de barras a cerca de 15 cm da câmera com boa iluminação.
                    </p>
                )}
            </div>
        </DefaultModal>
    )
}
