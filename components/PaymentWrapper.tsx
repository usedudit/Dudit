"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"
import { Copy, Package, MapPin, CheckCircle2, Printer } from "lucide-react"
import { Button, InfoCard, IconPlaceholder, Input, Spinner, Separator } from "@/components/reusable"
import { useNotification } from "@/hooks/use-notification"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import Link from "next/link"
import { fetchJSONWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { formatCurrency } from "@/lib/utils"

interface OrderDetailItem {
    id: string
    name: string
    quantity: number
    price: number
    image?: string
    variant_id?: string
}

interface PixPaymentWrapperProps {
    open: boolean
    onClose: () => void
    pixData?: {
        qrCode: string
        qrCodeBase64: string
    }
    boletoData?: {
        barcode: string
        ticketUrl: string
    }
    orderId: string
    amount: number
    orderDetails: {
        items: OrderDetailItem[]
        deliveryAddress?: string
        deliveryType: "delivery" | "pickup"
        notes?: string
        cartItemIds?: string[]
    }
    orderNumber?: string
    sellerName?: string
    buyerId?: string
    useMercadoPago?: boolean
    partnerId?: string
    mpPublicKey?: string
    userEmail?: string
    userName?: string
    userAddress?: {
        zipCode?: string
        streetName?: string
        streetNumber?: string
        neighborhood?: string
        city?: string
        federalUnit?: string
    }
}

export function PaymentWrapper({
    open, onClose, pixData: initialPixData, boletoData: initialBoletoData, orderId, amount,
    orderDetails, orderNumber, sellerName, buyerId,
    useMercadoPago = false, partnerId, mpPublicKey, userEmail, userName, userAddress
}: PixPaymentWrapperProps) {
    const [copied, setCopied] = useState(false)
    const [isChecking, setIsChecking] = useState(false)
    const [paymentConfirmed, setPaymentConfirmed] = useState(false)
    const [isClosing, setIsClosing] = useState(false)
    const notification = useNotification()

    const [step, setStep] = useState<"brick" | "pix" | "boleto" | "success" | "error" | "mp_redirect">(
        useMercadoPago && !initialPixData && !initialBoletoData ? "brick" : (initialPixData ? "pix" : initialBoletoData ? "boleto" : "success")
    )
    const [fatalError, setFatalError] = useState<string | null>(null)
    const [pixData, setPixData] = useState(initialPixData)
    const [boletoData, setBoletoData] = useState(initialBoletoData)
    const [brickReady, setBrickReady] = useState(false)
    const [sdkLoaded, setSdkLoaded] = useState(false)
    const [brickError, setBrickError] = useState<string | null>(null)
    const [isProcessingBrick, setIsProcessingBrick] = useState(false)
    const mpInstanceRef = useRef<any>(null)
    const bricksBuilderRef = useRef<any>(null)
    const brickIdRef = useRef<string | null>(null)
    const brickInitializedRef = useRef(false)

    const handleClose = () => {
        setIsClosing(true)
        setTimeout(() => {
            setIsClosing(false)
            onClose()
        }, 300)
    }

    const handleFatalError = (message: string) => {
        setFatalError(message)
        // Destroy the Brick so it can't be reused
        if (brickIdRef.current && bricksBuilderRef.current) {
            try { bricksBuilderRef.current.unmount(brickIdRef.current) } catch { }
            brickIdRef.current = null
        }
        setBrickReady(false)
        brickInitializedRef.current = false
        setStep("error")
    }

    useEffect(() => {
        if (!open || !useMercadoPago || sdkLoaded) return

        if ((window as any).MercadoPago) {
            setSdkLoaded(true)
            return
        }

        const script = document.createElement("script")
        script.src = "https://sdk.mercadopago.com/js/v2"
        script.async = true

        script.onload = () => {
            setSdkLoaded(true)
        }

        document.body.appendChild(script)

    }, [open, useMercadoPago, sdkLoaded])

    useEffect(() => {
        if (paymentConfirmed && step !== "success") {
            setStep("success")
        }
    }, [paymentConfirmed, step])

    useEffect(() => {
        if (brickInitializedRef.current) return
        if (!open || !sdkLoaded || step !== "brick") return

        brickInitializedRef.current = true
        initializePaymentBrick()

        return () => {
            if (brickIdRef.current && bricksBuilderRef.current) {
                try {
                    bricksBuilderRef.current.unmount(brickIdRef.current)
                } catch { }

                brickIdRef.current = null
                setBrickReady(false)
                brickInitializedRef.current = false
            }
        }
    }, [open, sdkLoaded, step])

    const initializePaymentBrick = async () => {
        if (typeof window === "undefined" || !(window as any).MercadoPago) {
            setBrickError("Erro ao carregar Mercado Pago.")
            return
        }
        try {
            if (!mpPublicKey) {
                setBrickError("Chave pública do Mercado Pago não configurada")
                return
            }
            const mp = new (window as any).MercadoPago(mpPublicKey)
            const bricksBuilder = mp.bricks()
            mpInstanceRef.current = mp
            bricksBuilderRef.current = bricksBuilder

            const container = document.getElementById("paymentBrick_modal_container")
            if (!container) return

            let preferenceData: any
            try {
                preferenceData = await fetchJSONWithCSRF<any>("/api/mercadopago/create-preference", {
                    method: "POST",
                    body: {
                        products: orderDetails.items.map(p => ({
                            id: p.id, name: p.name, price: p.price, quantity: p.quantity, variant_id: p.variant_id,
                        })),
                        partnerId,
                    },
                })
            } catch (err: any) {
                setBrickError(err?.message || "Erro ao preparar pagamento")
                return
            }

            const nameParts = (userName || "").split(" ")
            const brickController = await bricksBuilder.create("payment", "paymentBrick_modal_container", {
                initialization: {
                    amount: amount,
                    preferenceId: preferenceData.preference_id,
                    payer: {
                        firstName: nameParts[0] || "",
                        lastName: nameParts.slice(1).join(" ") || "",
                        email: userEmail || "",
                        ...(userAddress ? {
                            address: {
                                zipCode: userAddress.zipCode || "",
                                streetName: userAddress.streetName || "",
                                streetNumber: userAddress.streetNumber || "",
                                neighborhood: userAddress.neighborhood || "",
                                city: userAddress.city || "",
                                federalUnit: userAddress.federalUnit || "",
                            },
                        } : {}),
                    },
                },
                customization: {
                    visual: {
                        style: {
                            theme: "flat",
                            customVariables: {
                                textPrimaryColor: "#003d32", textSecondaryColor: "#6b7280",
                                inputBackgroundColor: "#FFFFFF", formBackgroundColor: "#FFFFFF",
                                baseColor: "#059669", baseColorFirstVariant: "#059669E6", baseColorSecondVariant: "#059669E6",
                                errorColor: "#f04438", successColor: "#059669",
                                outlinePrimaryColor: "#ebebeb", outlineSecondaryColor: "#ebebeb",
                                buttonTextColor: "#FFFFFF",
                                fontSizeExtraSmall: "12px", fontSizeSmall: "14px", fontSizeMedium: "15px",
                                fontSizeLarge: "17px", fontSizeExtraLarge: "20px",
                                fontWeightNormal: "400", fontWeightSemiBold: "600",
                                formInputsTextTransform: "none",
                                inputVerticalPadding: "12px", inputHorizontalPadding: "16px",
                                inputBorderWidth: "1px", inputFocusedBorderWidth: "1px",
                                inputFocusedBoxShadow: "0 0 0 3px rgba(5,150,105,0.15)",
                                inputErrorFocusedBoxShadow: "0 0 0 3px rgba(239,68,68,0.15)",
                                borderRadiusSmall: "6px", borderRadiusMedium: "8px", borderRadiusLarge: "12px",
                                formPadding: "16px",
                            },
                        },
                        texts: {
                            formTitle: "",
                            formSubmit: "Pagar",
                        },
                        hidePaymentButton: false,
                        hideFormTitle: false,
                    },
                    paymentMethods: {
                        ticket: "all", bankTransfer: "all", creditCard: "all",
                        debitCard: "all", mercadoPago: "all", atm: "all",
                    },
                },
                callbacks: {
                    onReady: () => setBrickReady(true),
                    onSubmit: async (formData: any) => await handleBrickSubmit(formData),
                    onError: (error: any) => setBrickError(error.message || "Erro ao processar pagamento"),
                },
            })
            brickIdRef.current = brickController
        } catch (err: any) {
            setBrickError(err.message || "Erro ao inicializar Payment Brick")
        }
    }

    const handleBrickSubmit = async (formData: any) => {
        setIsProcessingBrick(true)
        setBrickError(null)
        try {
            // Detect redirect-based MP methods (Mercado Pago wallet, Linha de Crédito, etc.)
            // These methods open a new tab on MP's site and don't return a payment_method_id
            const resolvedFormData = formData.formData || formData
            const paymentMethodId = resolvedFormData?.payment_method_id
            const isRedirectMethod = !paymentMethodId || ["account_money", "consumer_credits", "mercadopago"].includes(paymentMethodId)

            if (isRedirectMethod) {
                setStep("mp_redirect")
                setIsProcessingBrick(false)
                return
            }

            const responseData = await fetchJSONWithCSRF<any>("/api/mercadopago/process-payment", {
                method: "POST",
                body: {
                    paymentFormData: resolvedFormData,
                    items: orderDetails.items,
                    partnerId,
                    buyerId,
                    deliveryType: orderDetails.deliveryType,
                    deliveryAddress: orderDetails.deliveryAddress,
                    notes: orderDetails.notes,
                    cartItemIds: orderDetails.cartItemIds
                },
            })

            const status = responseData.paymentStatus || responseData.status
            const paymentMethod = responseData.paymentMethod || responseData.payment_method_id

            if (status === "approved") {
                setPaymentConfirmed(true)
                notification.success("Pagamento Aprovado!", "Seu pedido foi confirmado com sucesso.")
            } else if (status === "pending" && paymentMethod === "pix") {
                const pix = responseData.pixData
                if (pix?.qrCode && pix?.qrCodeBase64) {
                    setPixData({
                        qrCode: pix.qrCode,
                        qrCodeBase64: pix.qrCodeBase64,
                    })
                    setStep("pix")
                    notification.info("Aguardando Pagamento", "Realize o pagamento via Pix para confirmar o pedido.")
                } else {
                    setBrickError("Dados do Pix não retornados pelo provedor.")
                }
            } else if (status === "pending" && (paymentMethod === "bolbradesco" || paymentMethod === "boleto" || paymentMethod === "ticket")) {
                const boleto = responseData.boletoData
                if (boleto?.barcode || boleto?.ticketUrl) {
                    setBoletoData(boleto)
                    setStep("boleto")
                    notification.info("Aguardando Pagamento", "Realize o pagamento do boleto para confirmar o pedido.")
                } else {
                    setBrickError("Dados do Boleto não retornados pelo provedor.")
                }
            } else if (status === "in_process" || status === "pending") {
                setStep("success")
                notification.info("Pagamento em Análise", "Seu pagamento está sendo processado.")
            } else {
                handleFatalError(`Pagamento não aprovado. Status: ${status || "desconhecido"}`)
            }
        } catch (error: any) {
            console.error("Erro ao processar pagamento:", error)
            handleFatalError(error.message || "Falha ao processar o pagamento com o servidor.")
        } finally {
            setIsProcessingBrick(false)
        }
    }

    useEffect(() => {
        if (paymentConfirmed) {
            const duration = 2000
            const animationEnd = Date.now() + duration
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 200 }
            const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min

            const interval: any = setInterval(function () {
                const timeLeft = animationEnd - Date.now()
                if (timeLeft <= 0) return clearInterval(interval)
                const particleCount = 50 * (timeLeft / duration)
                confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } })
                confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } })
            }, 250)

            return () => clearInterval(interval)
        }
    }, [paymentConfirmed])

    const checkPaymentStatus = async () => {
        const lastCheckRef = useRef(0)

        const checkPaymentStatus = async () => {
            const now = Date.now()

            if (now - lastCheckRef.current < 3000) return // trava 3s
            lastCheckRef.current = now

            if (isChecking) return
            setIsChecking(true)
            try {
                const response = await fetch("/api/orders/sync-payment-status", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ orderId }),
                })

                if (response.ok) {
                    const data = await response.json()
                    // Se o status for pago (novo ou já vindo de webhook), confirma o pagamento
                    if (data.newStatus === "paid" || data.paymentStatus === "approved") {
                        setPaymentConfirmed(true)
                    } else {
                        // Notifica que ainda está pendente
                        notification.info("Aguardando Aprovação", "Seu pagamento ainda não foi confirmado pelo banco. Se você já pagou, aguarde uns instantes e tente novamente.")
                    }
                } else {
                    notification.error("Erro ao verificar", "Não conseguimos verificar o status do pagamento. Tente novamente em instantes.")
                }
            } catch (error) {
                console.error("Error checking payment status:", error)
                notification.error("Erro de conexão", "Falha ao se comunicar com o servidor. Verifique sua rede e tente novamente.")
            } finally {
                setIsChecking(false)
            }
        }
    }

    const handleCopyQrCode = () => {
        if (pixData?.qrCode) {
            navigator.clipboard.writeText(pixData.qrCode)
            setCopied(true)
            notification.success("Código Pix copiado!", "Use a opção 'Pix Copia e Cola' no seu banco.")
            setTimeout(() => setCopied(false), 2000)
        }
    }

    if (!open) return null

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isClosing ? 0 : 1 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-white dark:bg-dark-surface overflow-y-auto custom-scrollbar flex flex-col"
        >
            <header className="lg:flex flex-col w-full bg-brand-dark sticky top-0 z-50 shadow-md">
                <div className="w-full h-[68px] flex items-center justify-between max-w-[1300px] px-4 mx-auto gap-4">
                    <Link href="/" prefetch={false} className="cursor-pointer shrink-0 z-110 pt-1">
                        <img
                            src="https://img.dudit.com.br/static/Logo.png"
                            alt="Dudit"
                            width={140}
                            height={40}
                            className="h-10 w-auto object-contain"
                        />
                    </Link>
                    {!paymentConfirmed && (
                        <div className="flex items-center text-sm font-medium text-white tracking-wide">
                            {orderNumber && !orderNumber.includes('temp') ? (
                                <>Pedido #{orderNumber}</>
                            ) : (
                                <>Pedido em {sellerName || "Loja"}</>
                            )}
                        </div>
                    )}
                </div>
            </header>

            <div className="flex-1 container mx-auto px-4 max-w-[800px] w-full py-8 relative flex flex-col">
                <AnimatePresence mode="wait">
                    {step === "brick" && (
                        <motion.div
                            key="brick"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="bg-transparent overflow-hidden px-4 sm:px-0 flex flex-col items-center"
                        >
                            {/* Header igual ao step pix */}
                            <div className="w-16 h-16 bg-brand-gray dark:bg-dark-border/30 border border-brand-border dark:border-dark-border rounded-full flex justify-center items-center mb-6">
                                <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pagamento" className="w-8 h-8 object-contain" />
                            </div>

                            <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading text-center mb-2">
                                Finalizar Pagamento
                            </h1>
                            <p className="text-md text-brand-inactive-text text-center max-w-md">
                                Escolha a forma de pagamento e conclua seu pedido com segurança.
                            </p>

                            {/* Brick sem borda/sombra */}
                            <div className="w-full max-w-md">
                                <div id="paymentBrick_modal_container" className="min-h-[400px]" />

                                {(!brickReady && !brickError) && (
                                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                        <Spinner size={24} className="mb-4 text-brand-green" />
                                        <p className="text-sm">Carregando ambiente seguro de pagamento...</p>
                                    </div>
                                )}

                                {brickError && (
                                    <div className="w-full mt-2">
                                        <InfoCard message={brickError} color="red" />
                                    </div>
                                )}

                                <div className="flex flex-col gap-4">
                                    <Separator />
                                    <Button variant="link" onClick={handleClose} disabled={isProcessingBrick}>
                                        Cancelar e voltar
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === "pix" && (
                        <motion.div
                            key="pending"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="bg-transparent overflow-hidden px-4 sm:px-0 flex flex-col items-center"
                        >
                            <div className="w-16 h-16 bg-brand-gray dark:bg-dark-border/30 border border-brand-border dark:border-dark-border rounded-full flex justify-center items-center mb-6">
                                <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-8 h-8 object-contain" />
                            </div>

                            <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading text-center mb-2">
                                Agora é só pagar com Pix
                            </h1>
                            <p className="text-md text-brand-inactive-text text-center max-w-md mb-4">
                                É rapidinho: escaneie o QR Code ou copie o código Pix e pague pelo app do seu banco.
                            </p>

                            {pixData?.qrCodeBase64 && (
                                <div className="mb-8 relative">
                                    <div className="w-64 h-64 p-2 bg-transparent flex items-center justify-center isolate">
                                        <img
                                            src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                                            alt="PIX QR Code"
                                            className="w-full h-full object-contain mix-blend-multiply"
                                        />
                                        {isChecking && (
                                            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] rounded-[12px] flex flex-col items-center justify-center z-10 transition-all">
                                                <Spinner className="text-brand-green mb-2" size={18} />
                                                <span className="text-sm font-semibold text-brand-dark bg-white/90 px-3 py-1 rounded-full">Verificando...</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-4 flex flex-col items-center">
                                        <span className="text-2xl font-bold text-brand-dark">{formatCurrency(amount)}</span>
                                    </div>
                                </div>
                            )}

                            <div className="w-full max-w-md">
                                <div className="flex items-center gap-4 mb-6">
                                    <Separator className="flex-1" />
                                    <span className="text-xs text-brand-inactive-text">ou copie manualmente</span>
                                    <Separator className="flex-1" />
                                </div>

                                <div className="flex gap-2 w-full mb-6">
                                    <Input value={pixData?.qrCode || ""} onChange={() => { }} />
                                    <Button
                                        variant="outline"
                                        onClick={handleCopyQrCode}
                                        className="gap-2 shrink-0 h-[42px] w-[42px]"
                                    >
                                        {copied ? <CheckCircle2 size={16} className="text-brand-green" /> : <Copy size={16} />}
                                    </Button>
                                </div>

                                <InfoCard
                                    message="Assim que o banco confirmar, seu pedido será liberado automaticamente."
                                    color="orange"
                                    className="w-full"
                                />

                                <Button
                                    onClick={checkPaymentStatus}
                                    disabled={isChecking}
                                    className="w-full my-6 h-12 flex items-center justify-center gap-2"
                                >
                                    {isChecking ? (
                                        <>
                                            <Spinner className="text-brand-green mb-2" size={18} />
                                            Verificando...
                                        </>
                                    ) : (
                                        "Verificar pagamento"
                                    )}
                                </Button>

                                <div className="flex flex-col gap-4">
                                    <Separator />
                                    <button
                                        onClick={handleClose}
                                        className="w-full text-brand-inactive-text font-semibold hover:text-brand-dark transition-colors"
                                    >
                                        Voltar
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === "boleto" && (
                        <motion.div
                            key="boleto-pending"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="bg-transparent overflow-hidden px-4 sm:px-0 flex flex-col items-center"
                        >
                            <div className="w-16 h-16 bg-brand-gray dark:bg-dark-border/30 border border-brand-border dark:border-dark-border rounded-full flex justify-center items-center mb-6">
                                <img src="https://img.dudit.com.br/static/Logo.png" alt="Boleto" className="w-8 h-8 object-contain" />
                            </div>

                            <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading text-center mb-2">
                                Agora é só pagar seu Boleto
                            </h1>
                            <p className="text-md text-brand-inactive-text text-center max-w-md mb-8">
                                Use a linha digitável ou o código de barras para pagar pelo Internet Banking. Para pagar em banco, caixa eletrônico ou lotérica, basta imprimir o boleto.
                            </p>

                            <div className="w-full max-w-md">
                                <div className="flex gap-2 w-full mb-6 relative">
                                    <Input label="Linha digitável do boleto" value={boletoData?.barcode || "Linha digitável não disponível"} readOnly className="pr-2" onChange={() => { }} />
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            if (boletoData?.barcode) {
                                                navigator.clipboard.writeText(boletoData.barcode)
                                                setCopied(true)
                                                notification.success("Código copiado!", "Linha digitável copiada para a área de transferência.")
                                                setTimeout(() => setCopied(false), 2000)
                                            }
                                        }}
                                        className="gap-2 shrink-0 h-[42px] w-[42px]"
                                    >
                                        {copied ? <CheckCircle2 size={16} className="text-brand-green" /> : <Copy size={16} />}
                                    </Button>
                                    {boletoData?.ticketUrl && (
                                        <Button
                                            variant="outline"
                                            onClick={() => window.open(boletoData.ticketUrl, "_blank")}
                                            className="gap-2 shrink-0 h-[42px] w-[42px]"
                                            title="Imprimir Boleto"
                                        >
                                            <Printer size={16} />
                                        </Button>
                                    )}
                                </div>
                                <span className="text-2xl font-bold text-brand-dark">{formatCurrency(amount)}</span>

                                <InfoCard
                                    message="A aprovação pode levar de 1 a 2 dias úteis. Pagamentos realizados em fins de semana ou feriados serão analisados no próximo dia útil."
                                    color="orange"
                                    className="w-full mb-6"
                                />

                                <Button asChild className="w-full h-12 flex items-center justify-center font-semibold text-base py-0 px-0">
                                    <Link href="/my-orders" prefetch={false} className="w-full h-full flex items-center justify-center">
                                        Ver Meus Pedidos
                                    </Link>
                                </Button>

                                <div className="flex flex-col gap-4 mt-6">
                                    <Separator />
                                    <button
                                        onClick={handleClose}
                                        className="w-full text-brand-inactive-text font-semibold hover:text-brand-dark transition-colors"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === "success" && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="bg-transparent overflow-hidden px-4 sm:px-0 p-6 sm:p-10"
                        >
                            <div className="flex flex-col items-center mb-8">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/HappyDino.png"
                                    imageAlt="Sucesso"
                                    title={`Pedido Confirmado! #${orderNumber || orderId.slice(0, 8)}`}
                                    subtitle="O vendedor já foi notificado e está preparando tudo para você. Não se preocupe, o Dino te avisa quando o pedido sair para entrega!"
                                />
                            </div>

                            <Separator className="mb-6" />

                            <div className="space-y-6 max-w-xl mx-auto mb-10">
                                <div>
                                    <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4 flex items-center gap-2">
                                        <Package size={16} className="text-brand-inactive-text" /> Itens comprados
                                    </h3>
                                    <div className="space-y-4">
                                        {orderDetails.items.map((item, idx) => (
                                            <div key={idx} className="flex gap-4 items-center">
                                                <div className="w-12 h-12 bg-white border border-brand-border dark:border-dark-border rounded-lg flex items-center justify-center p-1 shrink-0">
                                                    <img src={item.image || "https://img.dudit.com.br/static/Placeholder.png"} alt={item.name} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">{item.name}</h4>
                                                    <p className="text-xs text-brand-inactive-text">{item.quantity}x {formatCurrency(item.price)}</p>
                                                </div>
                                                {formatCurrency(item.quantity * item.price)}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Separator />

                                {orderDetails.deliveryType === "delivery" && orderDetails.deliveryAddress && (
                                    <>
                                        <div>
                                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2 flex items-center gap-2">
                                                <MapPin size={16} className="text-brand-inactive-text" /> Endereço de Entrega
                                            </h3>
                                            <p className="text-sm text-brand-inactive-text leading-relaxed bg-brand-gray/30 dark:bg-dark-bg p-3 rounded-xl border border-brand-border dark:border-dark-border">
                                                {orderDetails.deliveryAddress}
                                            </p>
                                        </div>
                                        <Separator />
                                    </>
                                )}

                                <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(amount)}</span>
                            </div>

                            <div className="flex justify-center">
                                <Button asChild size="lg" className="w-full sm:w-auto px-10">
                                    <Link href="/my-orders" prefetch={false}>
                                        Ver Meus Pedidos
                                    </Link>
                                </Button>
                            </div>
                        </motion.div>
                    )}

                    {step === "mp_redirect" && (
                        <motion.div
                            key="mp-redirect"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="bg-transparent overflow-hidden px-4 sm:px-0 flex flex-col items-center"
                        >
                            <IconPlaceholder
                                placeholderType="image"
                                imageSrc="https://img.dudit.com.br/static/mascots/Aguarde.png"
                                imageAlt="Aguarde"
                                title="Finalize o pagamento pelo Mercado Pago"
                                subtitle="Uma nova aba foi aberta para você concluir o pagamento com segurança pelo Mercado Pago. Assim que tudo estiver certo, seu pedido será confirmado automaticamente!"
                            />

                            <div className="w-full max-w-md flex flex-col gap-4 mt-6">
                                <Button asChild className="w-full h-12">
                                    <Link href="/my-orders" prefetch={false}>
                                        Acompanhar meus Pedidos
                                    </Link>
                                </Button>
                                <Separator />
                                <button
                                    onClick={handleClose}
                                    className="w-full text-brand-inactive-text font-semibold hover:text-brand-dark transition-colors"
                                >
                                    Voltar
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === "error" && (
                        <motion.div
                            key="error"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="bg-transparent overflow-hidden px-4 sm:px-0 flex flex-col items-center"
                        >
                            <IconPlaceholder
                                placeholderType="image"
                                imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                                imageAlt="Erro"
                                title="Ops! Algo deu errado por aqui"
                                subtitle="Algo inesperado aconteceu. Tente novamente em alguns instantes."
                            />

                            {fatalError && (
                                <div className="w-full max-w-md mb-6">
                                    <InfoCard message={fatalError} color="red" />
                                </div>
                            )}

                            <div className="w-full max-w-md flex flex-col gap-4">
                                <Button onClick={handleClose} className="w-full h-12">
                                    Voltar e tentar novamente
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="shrink-0 mt-auto">
                <MarketplaceFooter />
            </div>
        </motion.div>
    )
}