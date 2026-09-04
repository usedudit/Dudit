"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
// @ts-ignore
import QRCode from "qrcode"
import {
    DownloadIcon,
    PrinterIcon,
    CopyIcon,
} from "@/lib/icons"
import { DefaultModal, Button, InfoCard, ListItem, RadioButton } from "@/components/reusable"
import { useToast } from "@/hooks/use-toast"

export type PlaqueTemplateId = "cavalete"

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
}

const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => resolve(img)
        img.onerror = (e) => reject(e)
        img.src = src
    })
}

export interface StorePlaqueModalProps {
    isOpen: boolean
    onClose: () => void
    profileUrl: string
    storeName: string
    storePhone?: string
    storeInstagram?: string
}

export function StorePlaqueModal({
    isOpen,
    onClose,
    profileUrl,
    storeName,
    storePhone = "",
    storeInstagram = "",
}: StorePlaqueModalProps) {
    const { toast } = useToast()
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [backgroundStyle, setBackgroundStyle] = useState<"transparent" | "light_gray">("transparent")
    const [isRendering, setIsRendering] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [copiedLink, setCopiedLink] = useState(false)

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(profileUrl)
            setCopiedLink(true)
            toast({ title: "Link copiado!", description: "O link da sua vitrine foi copiado." })
            setTimeout(() => setCopiedLink(false), 2000)
        } catch {
            toast({ title: "Erro ao copiar link", variant: "destructive" })
        }
    }

    const renderCanvas = useCallback(async () => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        setIsRendering(true)

        try {
            // QR Code em alta definição
            const qrDataUrl = await QRCode.toDataURL(profileUrl, {
                width: 456,
                margin: 0,
                color: {
                    dark: "#000000",
                    light: "#FFFFFF",
                },
                errorCorrectionLevel: "M",
            })

            const qrImg = await loadImage(qrDataUrl)

            let dinoImg: HTMLImageElement
            try {
                dinoImg = await loadImage("/images/dino-cavalete.png")
            } catch {
                dinoImg = await loadImage("/api/assets/qr-dino?mascot=cavalete")
            }

            const W = 1024
            const H = 1024
            canvas.width = W
            canvas.height = H
            ctx.clearRect(0, 0, W, H)

            // Fundo da imagem: se cinza clarinho, preenche com #F3F4F6 para contrastar com os contornos brancos
            if (backgroundStyle === "light_gray") {
                ctx.fillStyle = "#F3F4F6"
                ctx.fillRect(0, 0, W, H)
            }
            // Se transparente, não preenche nada (mantém PNG 100% transparente)

            // Ilustração do mascote Dino com o cavalete
            ctx.drawImage(dinoImg, 0, 0, W, H)

            // Espaço branco do cavalete:
            // Limites exatos medidos na ilustração:
            // left: 220, top: 531, width: 248, height: 246 (centro: x=344, y=654)
            ctx.save()
            ctx.fillStyle = "#FFFFFF"
            roundRect(ctx, 220, 531, 248, 246, 22)
            ctx.fill()
            ctx.restore()

            // Desenha o QR Code centralizado com margem interna de segurança
            // qrSize: 228, qrX: 230, qrY: 540
            ctx.drawImage(qrImg, 230, 540, 228, 228)
        } catch (err) {
            console.error("Erro na renderização do canvas:", err)
        } finally {
            setIsRendering(false)
        }
    }, [profileUrl, backgroundStyle])

    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                renderCanvas()
            }, 100)
            return () => clearTimeout(timer)
        }
    }, [isOpen, renderCanvas])

    const handleDownload = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        setIsDownloading(true)
        try {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const url = URL.createObjectURL(blob)
                        const link = document.createElement("a")
                        const cleanName = (storeName || "loja").replace(/[\s/\\?%*:|"<>]+/g, "-").toLowerCase()
                        const styleSuffix = backgroundStyle === "transparent" ? "transparente" : "cinza"
                        link.download = `placa-dino-${cleanName}-${styleSuffix}.png`
                        link.href = url
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                        setTimeout(() => URL.revokeObjectURL(url), 2000)
                        toast({
                            title: "Placa baixada!",
                            description: "Imagem em alta resolução salva com sucesso.",
                        })
                    }
                    setIsDownloading(false)
                },
                "image/png",
                1.0
            )
        } catch (err) {
            console.error("Erro ao baixar:", err)
            toast({ title: "Erro ao gerar arquivo", variant: "destructive" })
            setIsDownloading(false)
        }
    }, [backgroundStyle, storeName, toast])

    const handlePrint = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const dataUrl = canvas.toDataURL("image/png")
        const printWindow = window.open("", "_blank")
        if (!printWindow) {
            toast({
                title: "Bloqueador de pop-ups ativo",
                description: "Permita pop-ups para abrir a tela de impressão.",
                variant: "destructive",
            })
            return
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Imprimir Placa Dino - ${storeName || "Dudit"}</title>
                    <style>
                        @page { size: A4 portrait; margin: 10mm; }
                        * { box-sizing: border-box; }
                        body {
                            margin: 0;
                            padding: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                            background: #ffffff;
                        }
                        .print-container {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            width: 100%;
                            height: 100%;
                        }
                        img {
                            max-width: 90vw;
                            max-height: 85vh;
                            object-fit: contain;
                            display: block;
                        }
                        @media print {
                            body { min-height: auto; }
                            img { max-width: 100%; max-height: 90vh; page-break-inside: avoid; }
                        }
                    </style>
                </head>
                <body>
                    <div class="print-container">
                        <img src="${dataUrl}" alt="Placa Dino ${storeName}" onload="window.print(); window.close();" />
                    </div>
                </body>
            </html>
        `)
        printWindow.document.close()
    }, [storeName, toast])

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title="Placa com QR Code da Loja"
            description="Placa oficial com o Dino e o QR Code da sua vitrine para colocar no balcão ou nas mesas."
            maxWidth="3xl"
        >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center py-2">
                {/* Preview */}
                <div className="md:col-span-6 flex flex-col items-center bg-brand-gray/60 dark:bg-dark-border/20 border border-brand-border dark:border-dark-border rounded-2xl p-4 gap-3.5">
                    <div className="flex items-center justify-between w-full px-2">
                        <span className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Pré-visualização
                        </span>
                        {isRendering && (
                            <span className="text-xs text-brand-green font-medium animate-pulse">
                                Gerando QR...
                            </span>
                        )}
                    </div>

                    <div className="w-full max-w-[320px] aspect-square bg-[#F1F5F9] dark:bg-[#1E293B] rounded-2xl border border-brand-border/80 dark:border-dark-border overflow-hidden flex items-center justify-center relative">
                        <canvas ref={canvasRef} className="w-full h-full object-contain" />
                    </div>

                    <div className="flex items-center justify-between w-full px-2 text-[11px] text-brand-inactive-text dark:text-dark-body border-t border-brand-border/60 dark:border-dark-border/40 pt-2.5">
                        <span className="truncate max-w-[200px] font-mono">{profileUrl}</span>
                        <button
                            type="button"
                            onClick={copyLink}
                            className="text-brand-green hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        >
                            <CopyIcon size={12} />
                            {copiedLink ? "Copiado!" : "Copiar link"}
                        </button>
                    </div>
                </div>

                {/* Opções e Ações */}
                <div className="md:col-span-6 flex flex-col gap-4">
                    {/* Estilo do Fundo */}
                    <div>
                        <label className="text-sm text-brand-dark dark:text-dark-heading block mb-2">
                            Fundo da Imagem
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <ListItem
                                className="px-4 py-3"
                                title="Sem Fundo (PNG)"
                                onClick={() => setBackgroundStyle("transparent")}
                                right={
                                    <RadioButton
                                        name="backgroundStyle"
                                        value="transparent"
                                        checked={backgroundStyle === "transparent"}
                                        onChange={() => setBackgroundStyle("transparent")}
                                    />
                                }
                            />
                            <ListItem
                                className="px-4 py-3"
                                title="Cinza Claro (JPEG)"
                                onClick={() => setBackgroundStyle("light_gray")}
                                right={
                                    <RadioButton
                                        name="backgroundStyle"
                                        value="light_gray"
                                        checked={backgroundStyle === "light_gray"}
                                        onChange={() => setBackgroundStyle("light_gray")}
                                    />
                                }
                            />
                        </div>
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex flex-col gap-2 pt-1">
                        <Button
                            className="w-full"
                            onClick={handleDownload}
                            disabled={isDownloading || isRendering}
                            leftIcon={<DownloadIcon size={18} />}
                        >
                            {isDownloading ? "Gerando arquivo..." : "Baixar Imagem em Alta Resolução"}
                        </Button>

                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={handlePrint}
                            disabled={isRendering}
                            leftIcon={<PrinterIcon size={18} />}
                        >
                            Imprimir para Balcão / Mesa
                        </Button>
                    </div>

                    {/* Dica de Uso */}
                    <InfoCard title="Dica para o seu balcão" message="Imprima em papel couchê ou fotográfico (180g+) e coloque em um display de acrílico no balcão ou nas mesas para seus clientes escanearem." />
                </div>
            </div>
        </DefaultModal>
    )
}
