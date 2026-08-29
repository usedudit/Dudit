"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
// @ts-ignore
import QRCode from "qrcode"
import {
    DownloadIcon,
    PrinterIcon,
    CopyIcon,
    SparklesIcon,
    EyeIcon,
    StoreIcon,
    CheckCircleIcon,
    WhatsappIcon,
    InstagramIcon,
    QRCodeIcon,
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
        name: "Cavalete Clássico",
        tag: "Oficial Dudit",
        description: "O clássico Dino cavalete oficial com faixas de texto personalizadas.",
        iconLabel: "🦖",
        recommendedFor: "Balcão e calçada",
    },
    {
        id: "acrylic_table",
        name: "Display de Acrílico",
        tag: "Mais Popular",
        description: "Estilo display L de acrílico com instruções e parafusos decorativos.",
        iconLabel: "💎",
        recommendedFor: "Mesas e balcões de atendimento",
    },
    {
        id: "minimal_clean",
        name: "Minimalista Clean",
        tag: "Econômico",
        description: "Design moderno e limpo, perfeito para impressão em folha A4 ou A5.",
        iconLabel: "📄",
        recommendedFor: "Impressão em papel / porta-retrato",
    },
    {
        id: "dark_premium",
        name: "Totem Dark Neon",
        tag: "Moderno",
        description: "Visual noturno escuro com alto contraste e brilho neon.",
        iconLabel: "✨",
        recommendedFor: "Bares, barbearias e hamburguerias",
    },
]

const COLOR_THEMES = [
    { id: "emerald", name: "Verde Dudit", hex: "#10B981", lightHex: "#ECFDF5", darkHex: "#065F46" },
    { id: "slate", name: "Preto / Grafite", hex: "#1E293B", lightHex: "#F8FAFC", darkHex: "#0F172A" },
    { id: "blue", name: "Azul Royal", hex: "#2563EB", lightHex: "#EFF6FF", darkHex: "#1E40AF" },
    { id: "purple", name: "Roxo Neon", hex: "#8B5CF6", lightHex: "#F5F3FF", darkHex: "#5B21B6" },
    { id: "orange", name: "Laranja", hex: "#F97316", lightHex: "#FFF7ED", darkHex: "#C2410C" },
    { id: "rose", name: "Rosa Vibrante", hex: "#E11D48", lightHex: "#FFF1F2", darkHex: "#9F1239" },
]

export interface StorePlaqueModalProps {
    isOpen: boolean
    onClose: () => void
    profileUrl: string
    storeName: string
    storePhone?: string
    storeInstagram?: string
}

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

function drawCornerBrackets(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    bracketSize: number,
    thickness: number,
    color: string
) {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = thickness
    ctx.lineCap = "round"

    // Top-left
    ctx.beginPath()
    ctx.moveTo(x, y + bracketSize)
    ctx.lineTo(x, y)
    ctx.lineTo(x + bracketSize, y)
    ctx.stroke()

    // Top-right
    ctx.beginPath()
    ctx.moveTo(x + w - bracketSize, y)
    ctx.lineTo(x + w, y)
    ctx.lineTo(x + w, y + bracketSize)
    ctx.stroke()

    // Bottom-left
    ctx.beginPath()
    ctx.moveTo(x, y + h - bracketSize)
    ctx.lineTo(x, y + h)
    ctx.lineTo(x + bracketSize, y + h)
    ctx.stroke()

    // Bottom-right
    ctx.beginPath()
    ctx.moveTo(x + w - bracketSize, y + h)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x + w, y + h - bracketSize)
    ctx.stroke()

    ctx.restore()
}

function drawChromeScrew(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    ctx.save()
    // Shadow
    ctx.shadowColor = "rgba(0, 0, 0, 0.25)"
    ctx.shadowBlur = 6
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 3

    // Outer circle
    const grad = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius)
    grad.addColorStop(0, "#E2E8F0")
    grad.addColorStop(0.5, "#94A3B8")
    grad.addColorStop(1, "#475569")

    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.shadowColor = "transparent"

    // Inner rim
    ctx.strokeStyle = "#CBD5E1"
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Center screw slot
    ctx.strokeStyle = "#334155"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - radius * 0.5, y)
    ctx.lineTo(x + radius * 0.5, y)
    ctx.stroke()

    ctx.restore()
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
    const [selectedColor, setSelectedColor] = useState(COLOR_THEMES[0])
    
    const [headline, setHeadline] = useState(storeName || "Peça pelo WhatsApp")
    const [subtitle, setSubtitle] = useState("Aponte a câmera e faça seu pedido online")
    const [footerText, setFooterText] = useState(
        storeInstagram ? `@${storeInstagram.replace(/^@/, "")}` : storePhone ? `WhatsApp: ${storePhone}` : "Obrigado pela preferência!"
    )
    const [showSteps, setShowSteps] = useState(true)
    const [isRendering, setIsRendering] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [copiedLink, setCopiedLink] = useState(false)

    // Atualiza os textos default ao trocar o nome da loja
    useEffect(() => {
        if (storeName && (!headline || headline === "Peça pelo WhatsApp")) {
            setHeadline(storeName)
        }
    }, [storeName])

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(profileUrl)
            setCopiedLink(true)
            toast({ title: "Link copiado! 📋", description: "O link da sua vitrine foi copiado." })
            setTimeout(() => setCopiedLink(false), 2000)
        } catch {
            toast({ title: "Erro ao copiar link", variant: "destructive" })
        }
    }

    // Renderização do Canvas principal
    const renderCanvas = useCallback(async () => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        setIsRendering(true)

        try {
            // Gera o QR Code em alta definição localmente
            const qrDataUrl = await QRCode.toDataURL(profileUrl, {
                width: 900,
                margin: 1,
                color: {
                    dark: selectedTemplate === "dark_premium" ? "#0F172A" : "#000000",
                    light: "#FFFFFF",
                },
                errorCorrectionLevel: "H",
            })

            const qrImg = await loadImage(qrDataUrl)

            // Dimensões do Canvas HD (retrato A4/A5 proporcional)
            const W = 1200
            const H = 1600
            canvas.width = W
            canvas.height = H

            // Limpa o canvas
            ctx.clearRect(0, 0, W, H)

            // ========================================================
            // TEMPLATE 1: CAVALETE CLÁSSICO DUDIT (Mascote Original)
            // ========================================================
            if (selectedTemplate === "cavalete") {
                // Fundo neutro e moderno
                ctx.fillStyle = "#F1F5F9"
                ctx.fillRect(0, 0, W, H)

                // Carrega imagem do Dino com cavalete
                const dinoImg = await loadImage("/api/assets/qr-dino?mascot=qrdino")

                // Calcula escala para caber harmonicamente com margens
                const padTop = 150
                const padBottom = 160
                const availableHeight = H - padTop - padBottom
                const scale = Math.min(W / dinoImg.naturalWidth, availableHeight / dinoImg.naturalHeight)
                const dinoW = dinoImg.naturalWidth * scale
                const dinoH = dinoImg.naturalHeight * scale
                const dinoX = (W - dinoW) / 2
                const dinoY = padTop + (availableHeight - dinoH) / 2

                // Header Card no topo
                ctx.save()
                ctx.fillStyle = "#FFFFFF"
                ctx.shadowColor = "rgba(0, 0, 0, 0.08)"
                ctx.shadowBlur = 20
                ctx.shadowOffsetY = 6
                roundRect(ctx, 60, 30, W - 120, 100, 24)
                ctx.fill()
                ctx.restore()

                // Header Texts
                ctx.fillStyle = selectedColor.hex
                ctx.font = "bold 34px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillText(headline || storeName || "PEÇA PELO WHATSAPP", W / 2, 65)

                ctx.fillStyle = "#64748B"
                ctx.font = "500 20px sans-serif"
                ctx.fillText(subtitle || "Aponte a câmera e confira nossa vitrine online", W / 2, 100)

                // Desenha a imagem do Dino com Cavalete
                ctx.drawImage(dinoImg, dinoX, dinoY, dinoW, dinoH)

                // Posições exatas do espaço branco do cavalete no QRDino.png
                const QR_POS = {
                    x: 0.156,
                    y: 0.644,
                    width: 0.188,
                    height: 0.188,
                }
                const qrX = dinoX + dinoW * QR_POS.x
                const qrY = dinoY + dinoH * QR_POS.y
                const qrW = dinoW * QR_POS.width
                const qrH = dinoH * QR_POS.height

                // Desenha QR Code no cavalete
                ctx.drawImage(qrImg, qrX, qrY, qrW, qrH)

                // Footer Banner
                ctx.save()
                ctx.fillStyle = selectedColor.hex
                roundRect(ctx, 60, H - 120, W - 120, 80, 20)
                ctx.fill()

                ctx.fillStyle = "#FFFFFF"
                ctx.font = "bold 26px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillText(footerText || "Peça pelo WhatsApp • Dudit Vitrine", W / 2, H - 80)
                ctx.restore()
            }

            // ========================================================
            // TEMPLATE 2: DISPLAY ACRÍLICO DE BALCÃO
            // ========================================================
            else if (selectedTemplate === "acrylic_table") {
                // Fundo com visual de mesa/ambiente elegante
                const bgGrad = ctx.createLinearGradient(0, 0, W, H)
                bgGrad.addColorStop(0, "#F8FAFC")
                bgGrad.addColorStop(1, "#E2E8F0")
                ctx.fillStyle = bgGrad
                ctx.fillRect(0, 0, W, H)

                // Plaquinha Acrílica Principal
                const plaqueX = 70
                const plaqueY = 70
                const plaqueW = W - 140
                const plaqueH = H - 140

                // Sombra do acrílico
                ctx.save()
                ctx.shadowColor = "rgba(15, 23, 42, 0.15)"
                ctx.shadowBlur = 35
                ctx.shadowOffsetY = 15
                ctx.fillStyle = "#FFFFFF"
                roundRect(ctx, plaqueX, plaqueY, plaqueW, plaqueH, 36)
                ctx.fill()
                ctx.restore()

                // Borda de vidro/acrílico transparente
                ctx.save()
                ctx.strokeStyle = "rgba(203, 213, 225, 0.8)"
                ctx.lineWidth = 4
                roundRect(ctx, plaqueX, plaqueY, plaqueW, plaqueH, 36)
                ctx.stroke()
                ctx.restore()

                // Parafusos cromados nos 4 cantos da plaquinha
                drawChromeScrew(ctx, plaqueX + 35, plaqueY + 35, 14)
                drawChromeScrew(ctx, plaqueX + plaqueW - 35, plaqueY + 35, 14)
                drawChromeScrew(ctx, plaqueX + 35, plaqueY + plaqueH - 35, 14)
                drawChromeScrew(ctx, plaqueX + plaqueW - 35, plaqueY + plaqueH - 35, 14)

                // Tag Superior
                const tagW = 420
                const tagH = 50
                const tagX = (W - tagW) / 2
                const tagY = plaqueY + 50
                ctx.save()
                ctx.fillStyle = selectedColor.lightHex
                roundRect(ctx, tagX, tagY, tagW, tagH, 25)
                ctx.fill()
                ctx.strokeStyle = selectedColor.hex
                ctx.lineWidth = 2
                roundRect(ctx, tagX, tagY, tagW, tagH, 25)
                ctx.stroke()

                ctx.fillStyle = selectedColor.darkHex
                ctx.font = "bold 20px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillText("📱 CARDÁPIO & PEDIDOS DIGITAIS", W / 2, tagY + tagH / 2)
                ctx.restore()

                // Nome da Loja / Título
                ctx.fillStyle = "#0F172A"
                ctx.font = "bold 46px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "alphabetic"
                ctx.fillText(headline || storeName || "NOSSO CATÁLOGO ONLINE", W / 2, tagY + tagH + 65)

                // Subtítulo
                ctx.fillStyle = "#64748B"
                ctx.font = "500 24px sans-serif"
                ctx.fillText(subtitle || "Aponte a câmera do seu celular no QR Code", W / 2, tagY + tagH + 110)

                // Container do QR Code (Card Central)
                const cardSize = 580
                const cardX = (W - cardSize) / 2
                const cardY = tagY + tagH + 145

                ctx.save()
                ctx.fillStyle = "#F8FAFC"
                ctx.shadowColor = "rgba(0, 0, 0, 0.06)"
                ctx.shadowBlur = 20
                ctx.shadowOffsetY = 6
                roundRect(ctx, cardX, cardY, cardSize, cardSize, 32)
                ctx.fill()

                ctx.strokeStyle = "#E2E8F0"
                ctx.lineWidth = 2
                roundRect(ctx, cardX, cardY, cardSize, cardSize, 32)
                ctx.stroke()
                ctx.restore()

                // Desenha o QR Code centralizado dentro do card
                const qrPad = 40
                const qrActualSize = cardSize - qrPad * 2
                ctx.drawImage(qrImg, cardX + qrPad, cardY + qrPad, qrActualSize, qrActualSize)

                // Cantos de mira [ ] ao redor do QR Code
                drawCornerBrackets(ctx, cardX + 25, cardY + 25, cardSize - 50, cardSize - 50, 45, 6, selectedColor.hex)

                // Passo a passo ilustrado
                if (showSteps) {
                    const stepsY = cardY + cardSize + 45
                    const stepW = (plaqueW - 100) / 3
                    const steps = [
                        { num: "1", text: "Abra a câmera\ndo celular" },
                        { num: "2", text: "Aponte para o\nQR Code" },
                        { num: "3", text: "Faça seu pedido\nno WhatsApp" },
                    ]

                    steps.forEach((step, idx) => {
                        const sX = plaqueX + 50 + idx * stepW
                        ctx.save()
                        // Pill de fundo
                        ctx.fillStyle = "#F1F5F9"
                        roundRect(ctx, sX + 10, stepsY, stepW - 20, 80, 20)
                        ctx.fill()

                        // Círculo com número
                        ctx.fillStyle = selectedColor.hex
                        ctx.beginPath()
                        ctx.arc(sX + 45, stepsY + 40, 20, 0, Math.PI * 2)
                        ctx.fill()

                        ctx.fillStyle = "#FFFFFF"
                        ctx.font = "bold 20px sans-serif"
                        ctx.textAlign = "center"
                        ctx.textBaseline = "middle"
                        ctx.fillText(step.num, sX + 45, stepsY + 40)

                        // Texto do passo
                        ctx.fillStyle = "#334155"
                        ctx.font = "bold 17px sans-serif"
                        ctx.textAlign = "left"
                        const lines = step.text.split("\n")
                        ctx.fillText(lines[0], sX + 75, stepsY + 30)
                        ctx.font = "500 15px sans-serif"
                        ctx.fillStyle = "#64748B"
                        ctx.fillText(lines[1], sX + 75, stepsY + 52)
                        ctx.restore()
                    })
                }

                // Rodapé de Contato
                const footerY = plaqueY + plaqueH - 85
                ctx.save()
                ctx.fillStyle = selectedColor.hex
                roundRect(ctx, plaqueX + 50, footerY, plaqueW - 100, 60, 18)
                ctx.fill()

                ctx.fillStyle = "#FFFFFF"
                ctx.font = "bold 24px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillText(footerText || "Peça pelo WhatsApp • Dudit", W / 2, footerY + 30)
                ctx.restore()
            }

            // ========================================================
            // TEMPLATE 3: MINIMALISTA CLEAN (A4/A5 Elegante)
            // ========================================================
            else if (selectedTemplate === "minimal_clean") {
                // Fundo Branco Puro
                ctx.fillStyle = "#FFFFFF"
                ctx.fillRect(0, 0, W, H)

                // Moldura geométrica fina
                ctx.save()
                ctx.strokeStyle = selectedColor.hex
                ctx.lineWidth = 6
                roundRect(ctx, 40, 40, W - 80, H - 80, 28)
                ctx.stroke()

                ctx.strokeStyle = "#CBD5E1"
                ctx.lineWidth = 1.5
                ctx.setLineDash([8, 8])
                roundRect(ctx, 55, 55, W - 110, H - 110, 20)
                ctx.stroke()
                ctx.restore()

                // Header
                ctx.fillStyle = "#64748B"
                ctx.font = "bold 20px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "alphabetic"
                ctx.fillText("BEM-VINDO(A)", W / 2, 130)

                ctx.fillStyle = "#0F172A"
                ctx.font = "bold 52px sans-serif"
                ctx.fillText(headline || storeName || "PEÇA ONLINE", W / 2, 200)

                // Linha divisória fina com detalhe
                ctx.strokeStyle = selectedColor.hex
                ctx.lineWidth = 4
                ctx.beginPath()
                ctx.moveTo(W / 2 - 80, 230)
                ctx.lineTo(W / 2 + 80, 230)
                ctx.stroke()

                ctx.fillStyle = "#475569"
                ctx.font = "500 26px sans-serif"
                ctx.fillText(subtitle || "Escaneie o QR Code abaixo para ver o catálogo", W / 2, 285)

                // Card do QR Code Grande
                const qrBoxSize = 640
                const qrBoxX = (W - qrBoxSize) / 2
                const qrBoxY = 340

                ctx.save()
                ctx.fillStyle = "#FFFFFF"
                ctx.shadowColor = "rgba(0, 0, 0, 0.08)"
                ctx.shadowBlur = 25
                ctx.shadowOffsetY = 8
                roundRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 28)
                ctx.fill()

                ctx.strokeStyle = "#E2E8F0"
                ctx.lineWidth = 2
                roundRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 28)
                ctx.stroke()
                ctx.restore()

                // Desenha QR Code
                const innerPad = 40
                ctx.drawImage(
                    qrImg,
                    qrBoxX + innerPad,
                    qrBoxY + innerPad,
                    qrBoxSize - innerPad * 2,
                    qrBoxSize - innerPad * 2
                )

                // Selos de Benefício no estilo minimalista
                const badgesY = qrBoxY + qrBoxSize + 70
                const badgeItems = [
                    "✓ Sem precisar baixar app",
                    "✓ Cardápio & Preços Atualizados",
                    "✓ Direto no seu WhatsApp",
                ]

                badgeItems.forEach((text, i) => {
                    ctx.fillStyle = "#334155"
                    ctx.font = "bold 22px sans-serif"
                    ctx.textAlign = "center"
                    ctx.fillText(text, W / 2, badgesY + i * 45)
                })

                // Rodapé
                ctx.fillStyle = selectedColor.hex
                ctx.font = "bold 26px sans-serif"
                ctx.textAlign = "center"
                ctx.fillText(footerText || "Obrigado pela preferência!", W / 2, H - 100)
            }

            // ========================================================
            // TEMPLATE 4: TOTEM DARK NEON
            // ========================================================
            else if (selectedTemplate === "dark_premium") {
                // Fundo Escuro Profundo
                const darkGrad = ctx.createLinearGradient(0, 0, W, H)
                darkGrad.addColorStop(0, "#090D16")
                darkGrad.addColorStop(0.5, "#0F172A")
                darkGrad.addColorStop(1, "#020617")
                ctx.fillStyle = darkGrad
                ctx.fillRect(0, 0, W, H)

                // Efeito de Glow Radial no fundo com a cor de destaque
                const radGrad = ctx.createRadialGradient(W / 2, 700, 50, W / 2, 700, 600)
                radGrad.addColorStop(0, selectedColor.hex + "33") // 20% opacity
                radGrad.addColorStop(1, "transparent")
                ctx.fillStyle = radGrad
                ctx.fillRect(0, 0, W, H)

                // Moldura externa elegante
                ctx.save()
                ctx.strokeStyle = "rgba(255, 255, 255, 0.12)"
                ctx.lineWidth = 3
                roundRect(ctx, 45, 45, W - 90, H - 90, 32)
                ctx.stroke()
                ctx.restore()

                // Badge de Topo
                const bWidth = 380
                const bHeight = 48
                const bX = (W - bWidth) / 2
                const bY = 100
                ctx.save()
                ctx.fillStyle = "rgba(255, 255, 255, 0.08)"
                roundRect(ctx, bX, bY, bWidth, bHeight, 24)
                ctx.fill()
                ctx.strokeStyle = selectedColor.hex
                ctx.lineWidth = 2
                roundRect(ctx, bX, bY, bWidth, bHeight, 24)
                ctx.stroke()

                ctx.fillStyle = selectedColor.hex
                ctx.font = "bold 18px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillText("⚡ PEDIDO RÁPIDO NO CELULAR", W / 2, bY + bHeight / 2)
                ctx.restore()

                // Headline
                ctx.fillStyle = "#FFFFFF"
                ctx.font = "bold 50px sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "alphabetic"
                ctx.fillText(headline || storeName || "CARDÁPIO DIGITAL", W / 2, 230)

                // Subtitle
                ctx.fillStyle = "#94A3B8"
                ctx.font = "500 24px sans-serif"
                ctx.fillText(subtitle || "Aponte a câmera e escolha seus itens agora", W / 2, 280)

                // Card do QR Code com contraste puro
                const darkCardSize = 600
                const darkCardX = (W - darkCardSize) / 2
                const darkCardY = 340

                ctx.save()
                // Glow no card
                ctx.shadowColor = selectedColor.hex + "66"
                ctx.shadowBlur = 30
                ctx.fillStyle = "#FFFFFF"
                roundRect(ctx, darkCardX, darkCardY, darkCardSize, darkCardSize, 32)
                ctx.fill()
                ctx.restore()

                // QR Code
                const dPad = 40
                ctx.drawImage(
                    qrImg,
                    darkCardX + dPad,
                    darkCardY + dPad,
                    darkCardSize - dPad * 2,
                    darkCardSize - dPad * 2
                )

                // Cantos de mira Neon [ ]
                drawCornerBrackets(
                    ctx,
                    darkCardX + 20,
                    darkCardY + 20,
                    darkCardSize - 40,
                    darkCardSize - 40,
                    50,
                    8,
                    selectedColor.hex
                )

                // Badge de ação embaixo do QR Code
                const actionY = darkCardY + darkCardSize + 70
                ctx.save()
                ctx.fillStyle = "rgba(255, 255, 255, 0.06)"
                roundRect(ctx, 120, actionY, W - 240, 110, 24)
                ctx.fill()

                ctx.strokeStyle = "rgba(255, 255, 255, 0.15)"
                ctx.lineWidth = 1.5
                roundRect(ctx, 120, actionY, W - 240, 110, 24)
                ctx.stroke()

                ctx.fillStyle = "#FFFFFF"
                ctx.font = "bold 26px sans-serif"
                ctx.textAlign = "center"
                ctx.fillText("Sem filas • Peça no seu ritmo", W / 2, actionY + 45)

                ctx.fillStyle = selectedColor.hex
                ctx.font = "bold 22px sans-serif"
                ctx.fillText("Atendimento direto no WhatsApp", W / 2, actionY + 80)
                ctx.restore()

                // Footer
                ctx.fillStyle = "#E2E8F0"
                ctx.font = "bold 26px sans-serif"
                ctx.textAlign = "center"
                ctx.fillText(footerText || `@${storeName.replace(/\s+/g, "").toLowerCase()}`, W / 2, H - 90)
            }
        } catch (err) {
            console.error("Erro na renderização do canvas:", err)
        } finally {
            setIsRendering(false)
        }
    }, [
        profileUrl,
        selectedTemplate,
        selectedColor,
        headline,
        storeName,
        subtitle,
        footerText,
        showSteps,
    ])

    // Dispara renderização sempre que alterar template, cores ou textos
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                renderCanvas()
            }, 100)
            return () => clearTimeout(timer)
        }
    }, [isOpen, renderCanvas])

    // Download do arquivo PNG em alta resolução
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
                            title: "Plaquinha baixada com sucesso! 🎉",
                            description: "Arquivo em alta resolução pronto para impressão ou compartilhamento.",
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

    // Impressão direta formatada
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
                        @page {
                            size: A4 portrait;
                            margin: 0;
                        }
                        * {
                            box-sizing: border-box;
                        }
                        body {
                            margin: 0;
                            padding: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                            background: #ffffff;
                        }
                        img {
                            max-width: 90vw;
                            max-height: 90vh;
                            object-fit: contain;
                            display: block;
                        }
                        @media print {
                            body {
                                min-height: auto;
                            }
                            img {
                                max-width: 100%;
                                max-height: 100vh;
                                page-break-inside: avoid;
                            }
                        }
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
            title="Gerador de Plaquinhas & Posters QR Code"
            description="Personalize plaquinhas de balcão, totens e posters para seus clientes pedirem direto pelo celular."
            maxWidth="4xl"
        >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start py-2">
                {/* COLUNA ESQUERDA: Live Preview */}
                <div className="lg:col-span-6 flex flex-col items-center bg-brand-gray/60 dark:bg-dark-border/20 border border-brand-border dark:border-dark-border rounded-2xl p-4 gap-4">
                    <div className="flex items-center justify-between w-full px-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body">
                                Pré-visualização em Alta Resolução
                            </span>
                        </div>
                        {isRendering && (
                            <span className="text-xs text-brand-green font-medium animate-pulse">
                                Atualizando preview...
                            </span>
                        )}
                    </div>

                    {/* Canvas com scaling responsivo */}
                    <div className="w-full max-w-[340px] aspect-[3/4] bg-white dark:bg-dark-surface rounded-xl shadow-md border border-brand-border/80 dark:border-dark-border overflow-hidden flex items-center justify-center relative">
                        <canvas
                            ref={canvasRef}
                            className="w-full h-full object-contain"
                        />
                    </div>

                    {/* Botões de Ação Rápida no Preview */}
                    <div className="flex flex-col sm:flex-row items-center gap-2 w-full pt-1">
                        <Button
                            variant="default"
                            size="sm"
                            className="w-full flex-1 gap-2 rounded-full font-bold text-xs bg-brand-green hover:bg-brand-green/90 text-white"
                            onClick={handleDownload}
                            disabled={isDownloading || isRendering}
                        >
                            <DownloadIcon size={15} />
                            {isDownloading ? "Gerando PNG..." : "Baixar Plaquinha (PNG)"}
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

                {/* COLUNA DIREITA: Editor de Modelo e Textos */}
                <div className="lg:col-span-6 flex flex-col gap-5">
                    {/* Seletor de Modelo */}
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-brand-dark dark:text-dark-heading block mb-2.5">
                            1. Escolha o Modelo da Plaquinha
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

                    {/* Paleta de Cores do Tema */}
                    {selectedTemplate !== "cavalete" && (
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-brand-dark dark:text-dark-heading block mb-2">
                                2. Cor de Destaque
                            </label>
                            <div className="flex items-center gap-2 flex-wrap">
                                {COLOR_THEMES.map((theme) => {
                                    const isSelected = selectedColor.id === theme.id
                                    return (
                                        <button
                                            key={theme.id}
                                            type="button"
                                            onClick={() => setSelectedColor(theme)}
                                            className={cn(
                                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all cursor-pointer",
                                                isSelected
                                                    ? "border-brand-dark dark:border-white shadow-sm ring-1 ring-brand-dark font-bold"
                                                    : "border-brand-border dark:border-dark-border hover:border-brand-inactive-text"
                                            )}
                                        >
                                            <span
                                                className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0"
                                                style={{ backgroundColor: theme.hex }}
                                            />
                                            <span className="text-brand-dark dark:text-dark-heading">
                                                {theme.name}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Campos de Texto Personalizados */}
                    <div className="flex flex-col gap-3">
                        <label className="text-xs font-bold uppercase tracking-wider text-brand-dark dark:text-dark-heading block">
                            3. Textos Personalizados
                        </label>

                        <div>
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1 block">
                                Título Principal / Nome da Loja
                            </span>
                            <Input
                                value={headline}
                                onChange={(e) => setHeadline(e.target.value)}
                                placeholder="Ex: Nome da Loja ou Peça pelo WhatsApp"
                                maxLength={35}
                            />
                        </div>

                        <div>
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1 block">
                                Subtítulo / Instrução
                            </span>
                            <Input
                                value={subtitle}
                                onChange={(e) => setSubtitle(e.target.value)}
                                placeholder="Ex: Aponte a câmera e faça seu pedido online"
                                maxLength={60}
                            />
                        </div>

                        <div>
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1 block">
                                Rodapé / Contato ou Agradecimento
                            </span>
                            <Input
                                value={footerText}
                                onChange={(e) => setFooterText(e.target.value)}
                                placeholder="Ex: WhatsApp: (11) 99999-9999 ou @sualoja"
                                maxLength={45}
                            />
                        </div>

                        {selectedTemplate === "acrylic_table" && (
                            <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={showSteps}
                                    onChange={(e) => setShowSteps(e.target.checked)}
                                    className="w-4 h-4 rounded text-brand-green accent-brand-green"
                                />
                                <span className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                                    Exibir passo a passo ilustrado (1. Câmera ➔ 2. QR Code ➔ 3. Pedido)
                                </span>
                            </label>
                        )}
                    </div>
                </div>
            </div>
        </DefaultModal>
    )
}
