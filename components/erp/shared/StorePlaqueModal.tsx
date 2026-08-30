"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
// @ts-ignore
import QRCode from "qrcode"
import {
    DownloadIcon,
    PrinterIcon,
    CopyIcon,
    EyeIcon,
    StoreIcon,
    CheckCircleIcon,
} from "@/lib/icons"
import { DefaultModal, Button, Input } from "@/components/reusable"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export type PlaqueTemplateId = "cavalete" | "acrylic_table" | "minimal_clean" | "dark_premium"

interface PlaqueTemplate {
    id: PlaqueTemplateId
    name: string
    tag: string
    description: string
    iconLabel: string
    recommendedFor: string
}

const TEMPLATES: PlaqueTemplate[] = [
    {
        id: "cavalete",
        name: "Cavalete Dudit",
        tag: "Oficial",
        description: "Dino com cavalete simples para divulgar sua vitrine.",
        iconLabel: "🦖",
        recommendedFor: "Balcão e calçada",
    },
    {
        id: "acrylic_table",
        name: "Display Digital",
        tag: "Mais Popular",
        description: "Estilo card limpo com logo Dudit e QR Code destacado.",
        iconLabel: "📱",
        recommendedFor: "Mesas e balcões",
    },
    {
        id: "minimal_clean",
        name: "Minimalista",
        tag: "Econômico",
        description: "Design clean para impressão A4 ou A5.",
        iconLabel: "📄",
        recommendedFor: "Impressão / porta-retrato",
    },
    {
        id: "dark_premium",
        name: "Totem Neon",
        tag: "Moderno",
        description: "Visual escuro com destaque neon para ambientes noturnos.",
        iconLabel: "✨",
        recommendedFor: "Bares e barbearias",
    },
]

const DUDIT_GREEN = "#10B981"
const DUDIT_DARK_GREEN = "#003229"
const DUDIT_LIGHT_GREEN = "#ECFDF5"

// Helpers para desenho no Canvas
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
    const [selectedTemplate, setSelectedTemplate] = useState<PlaqueTemplateId>("acrylic_table")
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
                margin: 1,
                color: {
                    dark: selectedTemplate === "dark_premium" ? "#FFFFFF" : "#000000",
                    light: selectedTemplate === "dark_premium" ? "#0F172A" : "#FFFFFF",
                },
                errorCorrectionLevel: "H",
            })

            const qrImg = await loadImage(qrDataUrl)
            const logoImg = await loadImage("/api/assets/qr-dino?mascot=logo")

            const W = 1200
            const H = 1600
            canvas.width = W
            canvas.height = H
            ctx.clearRect(0, 0, W, H)

            // ========================================================
            // TEMPLATE: CAVALETE DUDIT (Simples - Dino + Cavalete)
            // ========================================================
            if (selectedTemplate === "cavalete") {
                ctx.fillStyle = "#F8FAFC"
                ctx.fillRect(0, 0, W, H)

                const dinoImg = await loadImage("/api/assets/qr-dino?mascot=qrdino")

                const padTop = 120
                const padBottom = 140
                const availableHeight = H - padTop - padBottom
                const scale = Math.min(W / dinoImg.naturalWidth, availableHeight / dinoImg.naturalHeight)
                const dinoW = dinoImg.naturalWidth * scale
                const dinoH = dinoImg.naturalHeight * scale
                const dinoX = (W - dinoW) / 2
                const dinoY = padTop + (availableHeight - dinoH) / 2

                // Logo Dudit no topo
                const logoW = 200
                const logoH = (logoImg.naturalHeight / logoImg.naturalWidth) * logoW
                ctx.drawImage(logoImg, (W - logoW) / 2, 30, logoW, logoH)

                // Desenha Dino com cavalete
                ctx.drawImage(dinoImg, dinoX, dinoY, dinoW, dinoH)

                // QR Code no cavalete
                const QR_POS = { x: 0.156, y: 0.644, width: 0.188, height: 0.188 }
                const qrX = dinoX + dinoW * QR_POS.x
                const qrY = dinoY + dinoH * QR_POS.y
                const qrW = dinoW * QR_POS.width
                const qrH = dinoH * QR_POS.height
                ctx.drawImage(qrImg, qrX, qrY, qrW, qrH)

                // Texto simples abaixo do dino
                ctx.fillStyle = DUDIT_DARK_GREEN
                ctx.font = "bold 36px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillText("Conheça nossa vitrine online", W / 2, H - 100)

                ctx.fillStyle = "#64748B"
                ctx.font = "500 22px sans-serif"
                ctx.fillText("Escaneie o QR Code", W / 2, H - 55)
            }

            // ========================================================
            // TEMPLATE: DISPLAY DIGITAL (Estilo TripAdvisor com Logo Dudit)
            // ========================================================
            else if (selectedTemplate === "acrylic_table") {
                // Fundo branco limpo
                ctx.fillStyle = "#FFFFFF"
                ctx.fillRect(0, 0, W, H)

                // Card principal com borda verde
                const cardX = 80
                const cardY = 80
                const cardW = W - 160
                const cardH = H - 160
                const cardR = 32

                // Sombra suave
                ctx.save()
                ctx.shadowColor = "rgba(0, 0, 0, 0.08)"
                ctx.shadowBlur = 30
                ctx.shadowOffsetY = 10
                ctx.fillStyle = "#FFFFFF"
                roundRect(ctx, cardX, cardY, cardW, cardH, cardR)
                ctx.fill()
                ctx.restore()

                // Borda verde Dudit
                ctx.save()
                ctx.strokeStyle = DUDIT_GREEN
                ctx.lineWidth = 6
                roundRect(ctx, cardX, cardY, cardW, cardH, cardR)
                ctx.stroke()
                ctx.restore()

                // Logo Dudit centralizado no topo
                const logoW = 280
                const logoH = (logoImg.naturalHeight / logoImg.naturalWidth) * logoW
                const logoX = (W - logoW) / 2
                const logoY = cardY + 60
                ctx.drawImage(logoImg, logoX, logoY, logoW, logoH)

                // Texto principal
                ctx.fillStyle = "#0F172A"
                ctx.font = "bold 42px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "alphabetic"
                ctx.fillText("Conheça nossa vitrine", W / 2, logoY + logoH + 80)

                // Subtítulo
                ctx.fillStyle = "#64748B"
                ctx.font = "500 26px sans-serif"
                ctx.fillText("Escaneie o QR Code para ver nossos produtos", W / 2, logoY + logoH + 130)

                // Card do QR Code com borda verde
                const qrCardSize = 560
                const qrCardX = (W - qrCardSize) / 2
                const qrCardY = logoY + logoH + 170

                // Fundo verde claro
                ctx.save()
                ctx.fillStyle = DUDIT_LIGHT_GREEN
                roundRect(ctx, qrCardX, qrCardY, qrCardSize, qrCardSize, 28)
                ctx.fill()
                ctx.restore()

                // QR Code centralizado
                const qrPad = 50
                ctx.drawImage(qrImg, qrCardX + qrPad, qrCardY + qrPad, qrCardSize - qrPad * 2, qrCardSize - qrPad * 2)

                // Ícone do WhatsApp (emoji simples)
                ctx.fillStyle = "#25D366"
                ctx.font = "bold 48px sans-serif"
                ctx.textAlign = "center"
                ctx.fillText("💬", W / 2, qrCardY + qrCardSize + 70)

                // Texto de ação
                ctx.fillStyle = DUDIT_DARK_GREEN
                ctx.font = "bold 28px sans-serif"
                ctx.fillText("Peça pelo WhatsApp", W / 2, qrCardY + qrCardSize + 120)

                // Rodapé com nome da loja
                ctx.fillStyle = "#94A3B8"
                ctx.font = "500 22px sans-serif"
                ctx.fillText(storeName || "Sua Loja", W / 2, H - 130)

                // Linha decorativa verde
                ctx.save()
                ctx.strokeStyle = DUDIT_GREEN
                ctx.lineWidth = 4
                ctx.beginPath()
                ctx.moveTo(W / 2 - 60, H - 100)
                ctx.lineTo(W / 2 + 60, H - 100)
                ctx.stroke()
                ctx.restore()

                // Texto Dudit
                ctx.fillStyle = DUDIT_GREEN
                ctx.font = "bold 18px sans-serif"
                ctx.fillText("Powered by Dudit", W / 2, H - 70)
            }

            // ========================================================
            // TEMPLATE: MINIMALISTA (Clean para impressão)
            // ========================================================
            else if (selectedTemplate === "minimal_clean") {
                ctx.fillStyle = "#FFFFFF"
                ctx.fillRect(0, 0, W, H)

                // Moldura fina verde
                ctx.save()
                ctx.strokeStyle = DUDIT_GREEN
                ctx.lineWidth = 5
                roundRect(ctx, 40, 40, W - 80, H - 80, 24)
                ctx.stroke()
                ctx.restore()

                // Logo Dudit
                const logoW = 240
                const logoH = (logoImg.naturalHeight / logoImg.naturalWidth) * logoW
                ctx.drawImage(logoImg, (W - logoW) / 2, 100, logoW, logoH)

                // Título
                ctx.fillStyle = "#0F172A"
                ctx.font = "bold 48px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "alphabetic"
                ctx.fillText("Nossa Vitrine Online", W / 2, 250)

                // Linha divisória
                ctx.save()
                ctx.strokeStyle = DUDIT_GREEN
                ctx.lineWidth = 4
                ctx.beginPath()
                ctx.moveTo(W / 2 - 80, 280)
                ctx.lineTo(W / 2 + 80, 280)
                ctx.stroke()
                ctx.restore()

                // Subtítulo
                ctx.fillStyle = "#64748B"
                ctx.font = "500 26px sans-serif"
                ctx.fillText("Escaneie o QR Code para ver o catálogo", W / 2, 330)

                // Card QR Code
                const qrSize = 580
                const qrX = (W - qrSize) / 2
                const qrY = 380

                ctx.save()
                ctx.fillStyle = "#F8FAFC"
                ctx.shadowColor = "rgba(0, 0, 0, 0.06)"
                ctx.shadowBlur = 20
                ctx.shadowOffsetY = 6
                roundRect(ctx, qrX, qrY, qrSize, qrSize, 24)
                ctx.fill()
                ctx.restore()

                // QR Code
                const innerPad = 40
                ctx.drawImage(qrImg, qrX + innerPad, qrY + innerPad, qrSize - innerPad * 2, qrSize - innerPad * 2)

                // Benefícios
                const benefits = [
                    "✓ Sem precisar baixar app",
                    "✓ Catálogo e preços atualizados",
                    "✓ Direto no seu WhatsApp",
                ]

                const benefitsY = qrY + qrSize + 60
                benefits.forEach((text, i) => {
                    ctx.fillStyle = "#334155"
                    ctx.font = "bold 24px sans-serif"
                    ctx.textAlign = "center"
                    ctx.fillText(text, W / 2, benefitsY + i * 50)
                })

                // Rodapé
                ctx.fillStyle = "#94A3B8"
                ctx.font = "500 22px sans-serif"
                ctx.fillText(storeName || "Sua Loja", W / 2, H - 100)

                ctx.fillStyle = DUDIT_GREEN
                ctx.font = "bold 18px sans-serif"
                ctx.fillText("Powered by Dudit", W / 2, H - 60)
            }

            // ========================================================
            // TEMPLATE: TOTEM NEON (Dark premium com Dudit)
            // ========================================================
            else if (selectedTemplate === "dark_premium") {
                // Fundo escuro
                const darkGrad = ctx.createLinearGradient(0, 0, W, H)
                darkGrad.addColorStop(0, "#090D16")
                darkGrad.addColorStop(0.5, "#0F172A")
                darkGrad.addColorStop(1, "#020617")
                ctx.fillStyle = darkGrad
                ctx.fillRect(0, 0, W, H)

                // Glow verde
                const radGrad = ctx.createRadialGradient(W / 2, 800, 50, W / 2, 800, 600)
                radGrad.addColorStop(0, DUDIT_GREEN + "33")
                radGrad.addColorStop(1, "transparent")
                ctx.fillStyle = radGrad
                ctx.fillRect(0, 0, W, H)

                // Moldura externa
                ctx.save()
                ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"
                ctx.lineWidth = 3
                roundRect(ctx, 45, 45, W - 90, H - 90, 28)
                ctx.stroke()
                ctx.restore()

                // Logo Dudit (usando versão clara ou ícone)
                const logoW = 220
                const logoH = (logoImg.naturalHeight / logoImg.naturalWidth) * logoW
                // Para dark mode, desenha o logo com filtro brightness
                ctx.save()
                ctx.filter = "brightness(2) contrast(0.8)"
                ctx.drawImage(logoImg, (W - logoW) / 2, 80, logoW, logoH)
                ctx.restore()

                // Badge
                const bWidth = 360
                const bHeight = 46
                const bX = (W - bWidth) / 2
                const bY = 340
                ctx.save()
                ctx.fillStyle = "rgba(255, 255, 255, 0.06)"
                roundRect(ctx, bX, bY, bWidth, bHeight, 23)
                ctx.fill()
                ctx.strokeStyle = DUDIT_GREEN
                ctx.lineWidth = 2
                roundRect(ctx, bX, bY, bWidth, bHeight, 23)
                ctx.stroke()

                ctx.fillStyle = DUDIT_GREEN
                ctx.font = "bold 18px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillText("📱 VITRINE DIGITAL", W / 2, bY + bHeight / 2)
                ctx.restore()

                // Headline
                ctx.fillStyle = "#FFFFFF"
                ctx.font = "bold 48px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "alphabetic"
                ctx.fillText("Conheça nossos", W / 2, 440)
                ctx.fillText("produtos", W / 2, 500)

                // Subtitle
                ctx.fillStyle = "#94A3B8"
                ctx.font = "500 24px sans-serif"
                ctx.fillText("Escaneie o QR Code e veja tudo", W / 2, 560)

                // Card QR Code
                const darkCardSize = 540
                const darkCardX = (W - darkCardSize) / 2
                const darkCardY = 610

                ctx.save()
                ctx.shadowColor = DUDIT_GREEN + "44"
                ctx.shadowBlur = 25
                ctx.fillStyle = "#FFFFFF"
                roundRect(ctx, darkCardX, darkCardY, darkCardSize, darkCardSize, 28)
                ctx.fill()
                ctx.restore()

                // QR Code
                const dPad = 40
                ctx.drawImage(qrImg, darkCardX + dPad, darkCardY + dPad, darkCardSize - dPad * 2, darkCardSize - dPad * 2)

                // Ação
                const actionY = darkCardY + darkCardSize + 60
                ctx.save()
                ctx.fillStyle = "rgba(255, 255, 255, 0.05)"
                roundRect(ctx, 140, actionY, W - 280, 100, 20)
                ctx.fill()

                ctx.fillStyle = "#FFFFFF"
                ctx.font = "bold 26px sans-serif"
                ctx.textAlign = "center"
                ctx.fillText("Sem filas • Peça no seu ritmo", W / 2, actionY + 40)

                ctx.fillStyle = DUDIT_GREEN
                ctx.font = "bold 22px sans-serif"
                ctx.fillText("Direto pelo WhatsApp", W / 2, actionY + 75)
                ctx.restore()

                // Footer
                ctx.fillStyle = "#64748B"
                ctx.font = "500 22px sans-serif"
                ctx.textAlign = "center"
                ctx.fillText(storeName || "Sua Loja", W / 2, H - 80)

                ctx.fillStyle = DUDIT_GREEN
                ctx.font = "bold 16px sans-serif"
                ctx.fillText("Powered by Dudit", W / 2, H - 45)
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
                        link.download = `plaquinha-${selectedTemplate}-${cleanName}.png`
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
                    <title>Imprimir Plaquinha - ${storeName || "Dudit"}</title>
                    <style>
                        @page { size: A4 portrait; margin: 0; }
                        * { box-sizing: border-box; }
                        body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #ffffff; }
                        img { max-width: 90vw; max-height: 90vh; object-fit: contain; display: block; }
                        @media print { body { min-height: auto; } img { max-width: 100%; max-height: 100vh; page-break-inside: avoid; } }
                    </style>
                </head>
                <body>
                    <img src="${dataUrl}" alt="Plaquinha ${storeName}" onload="window.print(); window.close();" />
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
                            {isDownloading ? "Gerando PNG..." : "Baixar Plaquinha"}
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

                {/* Seleção de Modelo */}
                <div className="lg:col-span-6 flex flex-col gap-5">
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-brand-dark dark:text-dark-heading block mb-2.5">
                            Escolha o Modelo
                        </label>
                        <div className="grid grid-cols-2 gap-2.5">
                            {TEMPLATES.map((tmpl) => {
                                const isSelected = selectedTemplate === tmpl.id
                                return (
                                    <button
                                        key={tmpl.id}
                                        type="button"
                                        onClick={() => setSelectedTemplate(tmpl.id)}
                                        className={cn(
                                            "flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer relative",
                                            isSelected
                                                ? "border-brand-green bg-brand-green/5 dark:bg-brand-green/10 shadow-sm ring-1 ring-brand-green"
                                                : "border-brand-border dark:border-dark-border hover:border-brand-inactive-text/50 bg-white dark:bg-dark-surface"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xl">{tmpl.iconLabel}</span>
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
                                        <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                                            {tmpl.name}
                                        </span>
                                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body line-clamp-2 mt-0.5">
                                            {tmpl.description}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="bg-brand-green/5 dark:bg-brand-green/10 border border-brand-green/20 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <StoreIcon size={20} className="text-brand-green mt-0.5 shrink-0" />
                            <div>
                                <p className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                                    Sua vitrine: {storeName || "Sua Loja"}
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
