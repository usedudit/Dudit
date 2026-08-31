"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
// @ts-ignore
import QRCode from "qrcode"
import {
    DownloadIcon,
    PrinterIcon,
    CopyIcon,
    StoreIcon,
} from "@/lib/icons"
import { DefaultModal, Button } from "@/components/reusable"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export type PlaqueTemplateId = "digital_card" | "cavalete"

interface PlaqueTemplate {
    id: PlaqueTemplateId
    name: string
    tag: string
    description: string
}

const TEMPLATES: PlaqueTemplate[] = [
    {
        id: "digital_card",
        name: "Card Digital",
        tag: "Mais Popular",
        description: "Card limpo com icone Dudit, logo e QR Code. Estilo profissional.",
    },
    {
        id: "cavalete",
        name: "Cavalete Dino",
        tag: "Oficial",
        description: "Dino com cavalete para divulgar sua vitrine.",
    },
]

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
    const [selectedTemplate, setSelectedTemplate] = useState<PlaqueTemplateId>("digital_card")
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
            const qrDataUrl = await QRCode.toDataURL(profileUrl, {
                width: 900,
                margin: 0,
                color: {
                    dark: "#000000",
                    light: "#FFFFFF",
                },
                errorCorrectionLevel: "H",
            })

            const qrImg = await loadImage(qrDataUrl)
            const iconImg = await loadImage("/api/assets/qr-dino?mascot=icon")

            const W = 1200
            const H = 1600
            canvas.width = W
            canvas.height = H
            ctx.clearRect(0, 0, W, H)

            if (selectedTemplate === "digital_card") {
                // ============================================================
                // TEMPLATE: CARD DIGITAL (estilo TripAdvisor - fundo branco)
                // ============================================================

                // Fundo branco
                ctx.fillStyle = "#FFFFFF"
                ctx.fillRect(0, 0, W, H)

                // Icon Dudit dentro de um quadrado verde arredondado (estilo TripAdvisor)
                const iconSize = 200
                const iconRadius = 40
                const iconBoxX = (W - iconSize) / 2
                const iconBoxY = 180

                // Quadrado verde atras do icone
                ctx.save()
                ctx.fillStyle = "#10B981"
                roundRect(ctx, iconBoxX, iconBoxY, iconSize, iconSize, iconRadius)
                ctx.fill()
                ctx.restore()

                // Icon Dudit branco dentro do quadrado
                const iconPad = 30
                ctx.save()
                ctx.filter = "brightness(10)"
                ctx.drawImage(iconImg, iconBoxX + iconPad, iconBoxY + iconPad, iconSize - iconPad * 2, iconSize - iconPad * 2)
                ctx.restore()

                // "dudit" texto verde abaixo do icone
                ctx.fillStyle = "#10B981"
                ctx.font = "bold 72px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "alphabetic"
                ctx.fillText("dudit", W / 2, iconBoxY + iconSize + 80)

                // Texto principal
                ctx.fillStyle = "#0F172A"
                ctx.font = "bold 56px sans-serif"
                ctx.fillText("Conheça nossa", W / 2, iconBoxY + iconSize + 180)
                ctx.fillText("vitrine online", W / 2, iconBoxY + iconSize + 250)

                // QR Code
                const qrSize = 480
                const qrX = (W - qrSize) / 2
                const qrY = iconBoxY + iconSize + 300
                ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

                // Texto abaixo do QR
                ctx.fillStyle = "#64748B"
                ctx.font = "500 30px sans-serif"
                ctx.textAlign = "center"
                ctx.fillText("Escaneie o QR Code", W / 2, qrY + qrSize + 55)

                // Linha divisoria fina
                ctx.save()
                ctx.strokeStyle = "#E2E8F0"
                ctx.lineWidth = 2
                ctx.beginPath()
                ctx.moveTo(W / 2 - 100, qrY + qrSize + 90)
                ctx.lineTo(W / 2 + 100, qrY + qrSize + 90)
                ctx.stroke()
                ctx.restore()

                // Nome da loja
                ctx.fillStyle = "#334155"
                ctx.font = "bold 36px sans-serif"
                ctx.fillText(storeName || "Sua Loja", W / 2, qrY + qrSize + 145)

                // Rodape
                ctx.fillStyle = "#94A3B8"
                ctx.font = "500 22px sans-serif"
                ctx.fillText("Powered by Dudit", W / 2, H - 80)
            }

            if (selectedTemplate === "cavalete") {
                // ============================================================
                // TEMPLATE: CAVALETE DINO (estilo card quadrado verde/branco)
                // ============================================================

                // Metade superior verde
                const greenHeight = H * 0.45
                ctx.fillStyle = "#10B981"
                ctx.fillRect(0, 0, W, greenHeight)

                // Metade inferior branca
                ctx.fillStyle = "#FFFFFF"
                ctx.fillRect(0, greenHeight, W, H - greenHeight)

                // Dino com cavalete
                const dinoImg = await loadImage("/api/assets/qr-dino?mascot=qrdino")

                const padTop = 40
                const padBottom = 40
                const availableHeight = greenHeight - padTop - padBottom
                const scale = Math.min((W * 0.6) / dinoImg.naturalWidth, availableHeight / dinoImg.naturalHeight)
                const dinoW = dinoImg.naturalWidth * scale
                const dinoH = dinoImg.naturalHeight * scale
                const dinoX = (W - dinoW) / 2
                const dinoY = padTop + (availableHeight - dinoH) / 2

                ctx.drawImage(dinoImg, dinoX, dinoY, dinoW, dinoH)

                // QR Code no cavalete
                const QR_POS = { x: 0.156, y: 0.644, width: 0.188, height: 0.188 }
                const qrX = dinoX + dinoW * QR_POS.x
                const qrY = dinoY + dinoH * QR_POS.y
                const qrW = dinoW * QR_POS.width
                const qrH = dinoH * QR_POS.height
                ctx.drawImage(qrImg, qrX, qrY, qrW, qrH)

                // Texto na area branca
                ctx.fillStyle = "#0F172A"
                ctx.font = "bold 48px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "alphabetic"
                ctx.fillText("Conheça nossa vitrine", W / 2, greenHeight + 120)

                ctx.fillStyle = "#64748B"
                ctx.font = "500 28px sans-serif"
                ctx.fillText("Escaneie o QR Code", W / 2, greenHeight + 180)

                // QR Code grande na area branca
                const bigQrSize = 420
                const bigQrX = (W - bigQrSize) / 2
                const bigQrY = greenHeight + 220
                ctx.drawImage(qrImg, bigQrX, bigQrY, bigQrSize, bigQrSize)

                // Nome da loja
                ctx.fillStyle = "#334155"
                ctx.font = "bold 34px sans-serif"
                ctx.fillText(storeName || "Sua Loja", W / 2, bigQrY + bigQrSize + 80)

                // Rodape
                ctx.fillStyle = "#94A3B8"
                ctx.font = "500 22px sans-serif"
                ctx.fillText("Powered by Dudit", W / 2, H - 60)
            }
        } catch (err) {
            console.error("Erro na renderização do canvas:", err)
        } finally {
            setIsRendering(false)
        }
    }, [profileUrl, selectedTemplate, storeName])

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
                        link.download = `vitrine-${selectedTemplate}-${cleanName}.png`
                        link.href = url
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                        setTimeout(() => URL.revokeObjectURL(url), 2000)
                        toast({
                            title: "Plaquinha baixada!",
                            description: "Arquivo em alta resolução pronto para impressão.",
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
    }, [selectedTemplate, storeName, toast])

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
                    <title>Imprimir - ${storeName || "Dudit"}</title>
                    <style>
                        @page { size: A4 portrait; margin: 0; }
                        * { box-sizing: border-box; }
                        body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #ffffff; }
                        img { max-width: 90vw; max-height: 90vh; object-fit: contain; display: block; }
                        @media print { body { min-height: auto; } img { max-width: 100%; max-height: 100vh; page-break-inside: avoid; } }
                    </style>
                </head>
                <body>
                    <img src="${dataUrl}" alt="Vitrine ${storeName}" onload="window.print(); window.close();" />
                </body>
            </html>
        `)
        printWindow.document.close()
    }, [storeName, toast])

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title="Gerador de Plaquinhas QR Code"
            description="Gere plaquinhas com o QR Code da sua vitrine para seus clientes pedirem pelo celular."
            maxWidth="4xl"
        >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start py-2">
                {/* Preview */}
                <div className="lg:col-span-6 flex flex-col items-center bg-brand-gray/60 dark:bg-dark-border/20 border border-brand-border dark:border-dark-border rounded-2xl p-4 gap-4">
                    <div className="flex items-center justify-between w-full px-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body">
                            Pré-visualização
                        </span>
                        {isRendering && (
                            <span className="text-xs text-brand-green font-medium animate-pulse">
                                Atualizando...
                            </span>
                        )}
                    </div>

                    <div className="w-full max-w-[340px] aspect-[3/4] bg-white dark:bg-dark-surface rounded-xl shadow-md border border-brand-border/80 dark:border-dark-border overflow-hidden flex items-center justify-center relative">
                        <canvas ref={canvasRef} className="w-full h-full object-contain" />
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-2 w-full pt-1">
                        <Button
                            variant="default"
                            size="sm"
                            className="w-full flex-1 gap-2 rounded-full font-bold text-xs bg-brand-green hover:bg-brand-green/90 text-white"
                            onClick={handleDownload}
                            disabled={isDownloading || isRendering}
                        >
                            <DownloadIcon size={15} />
                            {isDownloading ? "Gerando..." : "Baixar PNG"}
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto gap-2 rounded-full font-semibold text-xs border-brand-border dark:border-dark-border hover:bg-white dark:hover:bg-dark-surface"
                            onClick={handlePrint}
                            disabled={isRendering}
                        >
                            <PrinterIcon size={15} />
                            Imprimir
                        </Button>
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

                {/* Selecao de Modelo */}
                <div className="lg:col-span-6 flex flex-col gap-5">
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-brand-dark dark:text-dark-heading block mb-2.5">
                            Escolha o Modelo
                        </label>
                        <div className="grid grid-cols-1 gap-2.5">
                            {TEMPLATES.map((tmpl) => {
                                const isSelected = selectedTemplate === tmpl.id
                                return (
                                    <button
                                        key={tmpl.id}
                                        type="button"
                                        onClick={() => setSelectedTemplate(tmpl.id)}
                                        className={cn(
                                            "flex flex-col text-left p-4 rounded-xl border transition-all cursor-pointer",
                                            isSelected
                                                ? "border-brand-green bg-brand-green/5 dark:bg-brand-green/10 shadow-sm ring-1 ring-brand-green"
                                                : "border-brand-border dark:border-dark-border hover:border-brand-inactive-text/50 bg-white dark:bg-dark-surface"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                {tmpl.name}
                                            </span>
                                            <span
                                                className={cn(
                                                    "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight",
                                                    isSelected
                                                        ? "bg-brand-green text-white"
                                                        : "bg-brand-gray dark:bg-dark-border text-brand-inactive-text dark:text-dark-body"
                                                )}
                                            >
                                                {tmpl.tag}
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                            {tmpl.description}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Info da loja */}
                    <div className="bg-brand-green/5 dark:bg-brand-green/10 border border-brand-green/20 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <StoreIcon size={20} className="text-brand-green mt-0.5 shrink-0" />
                            <div>
                                <p className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                                    Vitrine: {storeName || "Sua Loja"}
                                </p>
                                <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-1">
                                    A plaquinha usa o link da sua vitrine no Dudit. Seus clientes escaneiam o QR Code e são redirecionados direto para sua loja online.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DefaultModal>
    )
}
