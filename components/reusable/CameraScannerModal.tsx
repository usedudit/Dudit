"use client"

import React, { useEffect, useRef, useState } from "react"
import { DefaultModal, Button, Spinner, IconPlaceholder } from "@/components/reusable"
import { XIcon, CameraIcon } from "@/lib/icons"
import { playBeepSound, vibrateMobile } from "@/lib/utils/barcode"

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
    const [hasPermission, setHasPermission] = useState<boolean | null>(null)
    const [loading, setLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const scannerRef = useRef<any>(null)
    const elementId = "html5-qrcode-scanner-viewport"

    useEffect(() => {
        if (!isOpen) return

        let isMounted = true
        let html5QrcodeInstance: any = null

        // Lazy load html5-qrcode to prevent SSR reference errors
        import("html5-qrcode")
            .then(async ({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
                if (!isMounted) return

                try {
                    // Check if navigator.mediaDevices is supported (HTTPS check)
                    if (typeof window === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        throw new Error(
                            "O acesso à câmera requer uma conexão segura (HTTPS) ou localhost. Se estiver testando no celular, certifique-se de usar HTTPS ou localhost, ou configure seu navegador para confiar nesta origem."
                        )
                    }

                    // Request permission explicitly using standard API first
                    let stream: MediaStream | null = null
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ video: true })
                        // Stop the stream tracks immediately so html5-qrcode can use the camera
                        stream.getTracks().forEach(track => track.stop())
                    } catch (mediaErr: any) {
                        console.error("Camera permission request failed:", mediaErr)
                        if (mediaErr.name === "NotAllowedError" || mediaErr.name === "PermissionDeniedError") {
                            throw new Error("Permissão de acesso à câmera negada. Por favor, ative a permissão de câmera nas configurações do navegador.")
                        } else if (mediaErr.name === "NotFoundError" || mediaErr.name === "DevicesNotFoundError") {
                            throw new Error("Nenhuma câmera encontrada no dispositivo.")
                        } else {
                            throw new Error(`Erro ao acessar a câmera: ${mediaErr.message || mediaErr}`)
                        }
                    }

                    // Check for camera availability
                    const devices = await Html5Qrcode.getCameras()
                    if (!devices || devices.length === 0) {
                        throw new Error("Nenhuma câmera encontrada no dispositivo.")
                    }

                    setHasPermission(true)
                    setLoading(false)

                    // Create standard camera instance
                    html5QrcodeInstance = new Html5Qrcode(elementId)
                    scannerRef.current = html5QrcodeInstance

                    const formats = [
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8,
                        Html5QrcodeSupportedFormats.UPC_A,
                        Html5QrcodeSupportedFormats.UPC_E,
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.QR_CODE,
                    ]

                    await html5QrcodeInstance.start(
                        { facingMode: "environment" },
                        {
                            fps: 15,
                            qrbox: (width: number, height: number) => {
                                // Optimal rectangle for barcode scanning
                                const w = Math.min(width * 0.85, 300)
                                const h = Math.min(height * 0.45, 140)
                                return { width: w, height: h }
                            },
                            formatsToSupport: formats,
                        },
                        (decodedText: string) => {
                            // On success
                            playBeepSound()
                            vibrateMobile()
                            onScan(decodedText)
                            onClose()
                        },
                        (error: any) => {
                            // Verbose frame-by-frame errors can be ignored
                        }
                    )
                } catch (err: any) {
                    console.error("Camera scanner initialization failed:", err)
                    if (isMounted) {
                        setHasPermission(false)
                        setLoading(false)
                        setErrorMessage(err.message || "Permissão de câmera negada ou erro ao iniciar.")
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
                            } catch (e) {
                                // Ignore clearing errors
                            }
                        })
                        .catch((err: any) => {
                            console.error("Error stopping html5-qrcode scanner:", err)
                        })
                }
            }
        }
    }, [isOpen, onScan, onClose])

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title="Escanear Código de Barras"
            maxWidth="md"
        >
            <div className="flex flex-col items-center justify-center p-2 pt-4 pb-6 space-y-6">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body text-center max-w-sm">
                    Aponte a câmera do celular para o código de barras do produto. Posicione o código dentro da marcação central.
                </p>

                <div className="relative w-full aspect-[4/3] max-w-sm rounded-2xl border border-brand-border dark:border-dark-border bg-black overflow-hidden flex items-center justify-center">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 text-white space-y-3">
                            <Spinner size={32} className="text-brand-primary" />
                            <span className="text-xs font-semibold">Iniciando câmera...</span>
                        </div>
                    )}

                    {errorMessage && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
                            <IconPlaceholder
                                icon={CameraIcon}
                                title="Acesso à câmera negado"
                                subtitle={errorMessage}
                                itemButton={{
                                    text: "Fechar",
                                    action: onClose,
                                    variant: "outline"
                                }}
                            />
                        </div>
                    )}

                    {/* Viewport where html5-qrcode will mount */}
                    <div id={elementId} className="w-full h-full object-cover" />

                    {/* Retro scanning laser overlay line */}
                    {!loading && !errorMessage && (
                        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-0.5 bg-brand-red animate-pulse pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.8)] z-10" />
                    )}
                </div>
            </div>
        </DefaultModal>
    )
}
