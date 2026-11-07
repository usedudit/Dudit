"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"
import confetti from "canvas-confetti"
import { CopyIcon, BoxIcon, CheckCircleIcon, PrinterIcon, CalendarIcon, CreditCardIcon } from "@/lib/icons"
import { Button, InfoCard, IconPlaceholder, Input, Spinner, Separator, Barcode } from "@/components/reusable"
import { useNotification } from "@/hooks/use-notification"
import { useRealtimeRecord } from "@/hooks/use-realtime-record"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { fetchJSONWithCSRF, clearCSRFTokenCache } from "@/lib/utils/fetch-with-csrf"
import { formatCurrency } from "@/lib/utils"
import type { MpAcceptedPaymentMethods } from "@/app/actions/mercadopago"
import { generateStaticPix } from "@/lib/utils/pix-generator"
import { installMercadoPagoZipInterceptor } from "@/lib/payments/mercadopago-zip-interceptor"
import QRCode from "qrcode"

interface OrderDetailItem {
    id: string
    name: string
    quantity: number
    price: number
    image?: string
    variant_id?: string
    variant_name?: string
    unit?: string | null
    itemType?: string | null
    bookingDate?: string | null
    bookingTime?: string | null
    staffName?: string | null
    bookingSummary?: string | null
    fulfillmentMode?: string | null
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
        storeAddress?: string | null
        partnerAddress?: string | null
        notes?: string
        cartItemIds?: string[]
        couponCode?: string | null
        couponDiscount?: number
        deliveryFee?: number
        storeId?: string | null
        checkoutPricing?: {
            subtotal: number
            couponDiscount: number
            paymentMethodDiscount: number
            paymentMethodInterest: number
            paymentMethodFee: number
            deliveryFee: number
            finalTotal: number
        }
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
    mpAcceptedPaymentMethods?: MpAcceptedPaymentMethods
    partnerPhone?: string | null
    pixKey?: string | null
    pixKeyType?: string | null
    payDepositOnly?: boolean
    returnPath?: string
}

function isValidOrderNumber(num?: string | null): boolean {
    if (!num) return false
    const clean = String(num).trim()
    if (!clean || clean.startsWith("temp-") || clean.startsWith("temp_")) return false
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return false
    return true
}

function formatItemQuantityUnit(quantity: number, rawUnit?: string | null): string {
    const clean = (rawUnit || "un").trim().toUpperCase().replace(/[.\s]/g, "")
    let unit = "un"
    switch (clean) {
        case "PC":
        case "PECA":
        case "PEÇA":
            unit = "pc"
            break
        case "UN":
        case "UNIDADE":
        case "UND":
            unit = "un"
            break
        case "KG":
        case "QUILO":
            unit = "kg"
            break
        case "LT":
        case "L":
        case "LITRO":
            unit = "L"
            break
        case "MT":
        case "M":
        case "METRO":
            unit = "m"
            break
        case "CX":
        case "CAIXA":
            unit = "cx"
            break
        case "PT":
        case "PCT":
        case "PACOTE":
            unit = "pct"
            break
        case "DZ":
        case "DUZIA":
        case "DÚZIA":
            unit = "dz"
            break
        default:
            unit = rawUnit ? rawUnit.trim().toLowerCase() : "un"
    }
    return `${quantity}${unit}`
}

function formatBookingDisplayDate(dateStr?: string | null): string {
    if (!dateStr) return ""
    if (dateStr.includes("/")) return dateStr
    const [year, month, day] = dateStr.split("-")
    if (year && month && day) {
        return `${day}/${month}/${year}`
    }
    return dateStr
}

export function PaymentWrapper({
    open, onClose, pixData: initialPixData, boletoData: initialBoletoData, orderId, amount,
    orderDetails, orderNumber, sellerName, buyerId,
    useMercadoPago = false, partnerId, mpPublicKey, userEmail, userName, userAddress,
    mpAcceptedPaymentMethods,
    partnerPhone, pixKey, pixKeyType, payDepositOnly, returnPath,
}: PixPaymentWrapperProps) {
    const { theme } = useTheme()
    const isDark = theme === "dark"
    const router = useRouter()
    const [copied, setCopied] = useState(false)
    const [isChecking, setIsChecking] = useState(false)
    const [paymentConfirmed, setPaymentConfirmed] = useState(false)
    const [isClosing, setIsClosing] = useState(false)
    const notification = useNotification()

    const [step, setStep] = useState<"brick" | "pix" | "boleto" | "success" | "error" | "mp_redirect" | "manual_pix" | "payment_failed">(
        !useMercadoPago && payDepositOnly && pixKey
            ? "manual_pix"
            : useMercadoPago && !initialPixData && !initialBoletoData
                ? "brick"
                : initialPixData
                    ? "pix"
                    : initialBoletoData
                        ? "boleto"
                        : "success"
    )
    const [actualOrderId, setActualOrderId] = useState<string | null>(null)
    const [actualOrderNumber, setActualOrderNumber] = useState<string | null>(null)
    const [fatalError, setFatalError] = useState<string | null>(null)
    const [pixData, setPixData] = useState(initialPixData)
    const [boletoData, setBoletoData] = useState(initialBoletoData)
    const [brickReady, setBrickReady] = useState(false)
    const [sdkLoaded, setSdkLoaded] = useState(false)
    const [brickError, setBrickError] = useState<string | null>(null)
    const [isProcessingBrick, setIsProcessingBrick] = useState(false)
    const [paymentFailedStatusDetail, setPaymentFailedStatusDetail] = useState<string | null>(null)
    const mpInstanceRef = useRef<any>(null)
    const bricksBuilderRef = useRef<any>(null)
    const brickIdRef = useRef<any>(null)
    const brickInitializedRef = useRef(false)
    const preferenceDataRef = useRef<any>(null)
    const [manualPixQrCode, setManualPixQrCode] = useState<string | null>(null)
    const [manualPixPayload, setManualPixPayload] = useState<string | null>(null)

    const resolvedOrderNumber = useMemo(() => {
        if (isValidOrderNumber(actualOrderNumber)) return String(actualOrderNumber).replace(/^#/, "")
        if (isValidOrderNumber(orderNumber)) return String(orderNumber).replace(/^#/, "")
        if (actualOrderId && !actualOrderId.startsWith("temp-")) return actualOrderId.slice(0, 8).toUpperCase()
        if (orderId && !orderId.startsWith("temp-")) return orderId.slice(0, 8).toUpperCase()
        return ""
    }, [actualOrderNumber, orderNumber, actualOrderId, orderId])

    const resolvedExistingOrderId = useMemo(() => {
        const id = actualOrderId || orderId
        return id && !id.startsWith("temp-") ? id : undefined
    }, [actualOrderId, orderId])

    useEffect(() => {
        const targetOrderId = actualOrderId || orderId
        if (!actualOrderNumber && targetOrderId && !targetOrderId.startsWith("temp-") && (!orderNumber || !isValidOrderNumber(orderNumber))) {
            fetch("/api/orders/sync-payment-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: targetOrderId }),
            })
                .then(res => res.json())
                .then(data => {
                    if (data.orderNumber) {
                        setActualOrderNumber(data.orderNumber)
                    }
                })
                .catch(() => { })
        }
    }, [orderId, actualOrderId, orderNumber, actualOrderNumber])

    useEffect(() => {
        if (initialPixData) {
            setPixData(initialPixData)
            setBoletoData(undefined)
            setStep("pix")
        } else if (initialBoletoData) {
            setBoletoData(initialBoletoData)
            setPixData(undefined)
            setStep("boleto")
        }
    }, [initialPixData, initialBoletoData])

    const handleClose = () => {
        setIsClosing(true)
        setTimeout(() => {
            setIsClosing(false)
            onClose()
            if (returnPath) {
                router.replace(returnPath)
            } else {
                router.back()
            }
        }, 300)
    }

    const handleFatalError = (message: string) => {
        setFatalError(message)
        // Destroy the Brick so it can't be reused
        if (brickIdRef.current) {
            try { brickIdRef.current.unmount() } catch { }
            brickIdRef.current = null
        }
        setBrickReady(false)
        brickInitializedRef.current = false
        setStep("error")
    }

    useEffect(() => {
        if (!open || !useMercadoPago) return

        installMercadoPagoZipInterceptor(partnerId)

        if (sdkLoaded) return

        // Carregar script de segurança do Mercado Pago para Device ID / Antifraude
        if (!document.getElementById("mp-security-script")) {
            const securityScript = document.createElement("script")
            securityScript.id = "mp-security-script"
            securityScript.src = "https://www.mercadopago.com/v2/security.js"
            securityScript.setAttribute("view", "checkout")
            securityScript.async = true
            document.body.appendChild(securityScript)
        }

        if ((window as any).MercadoPago) {
            setSdkLoaded(true)
            return
        }

        const script = document.createElement("script")
        script.id = "mp-js-v2-script"
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
        if (step === "manual_pix" && pixKey) {
            try {
                const payload = generateStaticPix(
                    pixKey,
                    amount,
                    sellerName || "Loja",
                    "",
                    "DUDIT",
                    pixKeyType
                )
                setManualPixPayload(payload)
                QRCode.toDataURL(payload, { width: 256, margin: 1 })
                    .then((url: string) => setManualPixQrCode(url))
                    .catch((err: any) => console.error("Error generating static QR code:", err))
            } catch (err) {
                console.error("Error generating static Pix:", err)
            }
        }
    }, [step, pixKey, amount, sellerName, pixKeyType])

    useEffect(() => {
        if (brickInitializedRef.current) return
        if (!open || !sdkLoaded || step !== "brick") return

        brickInitializedRef.current = true
        initializePaymentBrick()

        return () => {
            if (brickIdRef.current) {
                try {
                    brickIdRef.current.unmount()
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
            const mp = new (window as any).MercadoPago(mpPublicKey, {
                locale: "pt-BR",
                advancedFraudPrevention: true,
            })
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
                            id: p.id, name: p.name, price: p.price, quantity: p.quantity, variant_id: p.variant_id, service_id: (p as any).service_id,
                            itemType: p.itemType || null, fulfillmentMode: p.fulfillmentMode || null,
                        })),
                        partnerId,
                        buyerId,
                        couponCode: orderDetails.couponCode,
                        deliveryFee: orderDetails.deliveryFee,
                        deliveryType: orderDetails.deliveryType,
                        deliveryAddress: orderDetails.deliveryAddress,
                        cartItemIds: orderDetails.cartItemIds,
                        payDepositOnly,
                        storeId: orderDetails.storeId || undefined,
                        checkoutPricing: orderDetails.checkoutPricing,
                        existingOrderId: resolvedExistingOrderId,
                    },
                })
            } catch (err: any) {
                setBrickError(err?.message || "Erro ao preparar pagamento")
                return
            }

            preferenceDataRef.current = preferenceData

            const nameParts = (userName || "").split(" ")
            const brickAmount = Math.round((Number(preferenceData.total_amount || amount) + Number.EPSILON) * 100) / 100
            const brickController = await bricksBuilder.create("payment", "paymentBrick_modal_container", {
                initialization: {
                    amount: brickAmount,
                    preferenceId: preferenceData.preference_id,
                    redirectMode: "blank",
                    payer: {
                        firstName: nameParts[0] || "",
                        lastName: nameParts.slice(1).join(" ") || "",
                        email: userEmail || "",
                        ...(userAddress ? {
                            address: {
                                zipCode: userAddress.zipCode ? userAddress.zipCode.replace(/\D/g, "") : "",
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
                    ...(payDepositOnly ? {
                        paymentMethods: {
                            minInstallments: 1,
                            maxInstallments: 1,
                        },
                    } : {}),
                    visual: {
                        style: {
                            theme: "flat",
                            customVariables: isDark ? {
                                textPrimaryColor: "#f0f0f0",
                                textSecondaryColor: "#a1a1aa",
                                inputBackgroundColor: "#24252b",
                                formBackgroundColor: "#18181b",
                                baseColor: "#79c325",
                                baseColorFirstVariant: "#85d629",
                                baseColorSecondVariant: "#85d629",
                                errorColor: "#f04438",
                                successColor: "#79c325",
                                outlinePrimaryColor: "#3f3f46",
                                outlineSecondaryColor: "#3f3f46",
                                buttonTextColor: "#FFFFFF",
                                fontSizeExtraSmall: "12px",
                                fontSizeSmall: "14px",
                                fontSizeMedium: "15px",
                                fontSizeLarge: "17px",
                                fontSizeExtraLarge: "20px",
                                fontWeightNormal: "400",
                                fontWeightSemiBold: "600",
                                formInputsTextTransform: "none",
                                inputVerticalPadding: "12px",
                                inputHorizontalPadding: "16px",
                                inputBorderWidth: "1px",
                                inputFocusedBorderWidth: "1px",
                                inputFocusedBoxShadow: "0 0 0 3px rgba(5,150,105,0.3)",
                                inputErrorFocusedBoxShadow: "0 0 0 3px rgba(239,68,68,0.3)",
                                borderRadiusSmall: "6px",
                                borderRadiusMedium: "8px",
                                borderRadiusLarge: "12px",
                                formPadding: "16px",
                            } : {
                                textPrimaryColor: "#003229",
                                textSecondaryColor: "#6b7280",
                                inputBackgroundColor: "#FFFFFF",
                                formBackgroundColor: "#FFFFFF",
                                baseColor: "#79c325",
                                baseColorFirstVariant: "#85d629",
                                baseColorSecondVariant: "#85d629",
                                errorColor: "#f04438",
                                successColor: "#79c325",
                                outlinePrimaryColor: "#ebebeb",
                                outlineSecondaryColor: "#ebebeb",
                                buttonTextColor: "#FFFFFF",
                                fontSizeExtraSmall: "12px",
                                fontSizeSmall: "14px",
                                fontSizeMedium: "15px",
                                fontSizeLarge: "17px",
                                fontSizeExtraLarge: "20px",
                                fontWeightNormal: "400",
                                fontWeightSemiBold: "600",
                                formInputsTextTransform: "none",
                                inputVerticalPadding: "12px",
                                inputHorizontalPadding: "16px",
                                inputBorderWidth: "1px",
                                inputFocusedBorderWidth: "1px",
                                inputFocusedBoxShadow: "0 0 0 3px rgba(5,150,105,0.15)",
                                inputErrorFocusedBoxShadow: "0 0 0 3px rgba(239,68,68,0.15)",
                                borderRadiusSmall: "6px",
                                borderRadiusMedium: "8px",
                                borderRadiusLarge: "12px",
                                formPadding: "16px",
                            },
                        },
                        texts: {
                            formTitle: "",
                            formSubmit: "Pagar agora",
                        },
                        hidePaymentButton: false,
                        hideFormTitle: false,
                    },
                    paymentMethods: {
                        ticket: payDepositOnly ? [] : mpAcceptedPaymentMethods?.boleto === false ? [] : "all",
                        bankTransfer: mpAcceptedPaymentMethods?.pix === false ? [] : "all",
                        creditCard: mpAcceptedPaymentMethods?.credit_card === false ? [] : "all",
                        debitCard: mpAcceptedPaymentMethods?.debit_card === false ? [] : "all",
                        mercadoPago: payDepositOnly ? [] : (mpAcceptedPaymentMethods?.mercado_pago_wallet === false ? [] : "all"),
                        atm: payDepositOnly ? [] : mpAcceptedPaymentMethods?.boleto === false ? [] : "all",
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
            const resolvedFormData = formData?.formData || formData || {}
            const selectedPaymentMethod = formData?.selectedPaymentMethod || resolvedFormData?.selectedPaymentMethod || ""
            const isWalletPurchase =
                selectedPaymentMethod === "wallet_purchase" ||
                selectedPaymentMethod === "account_money" ||
                selectedPaymentMethod === "consumer_credits" ||
                selectedPaymentMethod === "onboarding_credits" ||
                (!resolvedFormData?.payment_method_id && !resolvedFormData?.token)

            const payloadFormData = {
                ...resolvedFormData,
                payment_method_id: resolvedFormData?.payment_method_id || (isWalletPurchase ? "wallet_purchase" : undefined),
            }

            const deviceId = (window as any).MP_DEVICE_SESSION_ID || null

            const doSubmit = async () => await fetchJSONWithCSRF<any>("/api/mercadopago/process-payment", {
                method: "POST",
                body: {
                    paymentFormData: payloadFormData,
                    isWalletPurchase: Boolean(isWalletPurchase),
                    selectedPaymentMethod: selectedPaymentMethod || (isWalletPurchase ? "wallet_purchase" : undefined),
                    preferenceId: preferenceDataRef.current?.preference_id,
                    initPoint: preferenceDataRef.current?.init_point,
                    deviceId,
                    items: orderDetails.items,
                    partnerId,
                    buyerId,
                    deliveryType: orderDetails.deliveryType,
                    deliveryAddress: orderDetails.deliveryAddress,
                    notes: orderDetails.notes,
                    cartItemIds: orderDetails.cartItemIds,
                    couponCode: orderDetails.couponCode,
                    deliveryFee: orderDetails.deliveryFee,
                    payDepositOnly,
                    storeId: orderDetails.storeId || undefined,
                    checkoutPricing: orderDetails.checkoutPricing,
                    existingOrderId: resolvedExistingOrderId,
                },
            })

            let responseData: any
            try {
                responseData = await doSubmit()
            } catch (err: any) {
                // Retry once with a freshly-fetched CSRF token, in case the
                // cached token diverged from the cookie (avoids "Token CSRF
                // inválido ou ausente" from an stale cache after inactivity).
                const msg = (err?.message || "").toLowerCase()
                if (msg.includes("csrf") || msg.includes("token")) {
                    clearCSRFTokenCache()
                    responseData = await doSubmit()
                } else {
                    throw err
                }
            }
            const status = responseData.paymentStatus || responseData.status
            const paymentMethod = responseData.paymentMethod || responseData.payment_method_id
            const isWallet = Boolean(responseData.isWalletPurchase || isWalletPurchase)

            if (responseData.orderId) setActualOrderId(responseData.orderId)
            if (responseData.orderNumber) setActualOrderNumber(responseData.orderNumber)

            if (isWallet) {
                setStep("mp_redirect")
                notification.info("Mercado Pago", "Conclua o pagamento na aba do Mercado Pago.")
            } else if (status === "approved") {
                setPaymentConfirmed(true)
                setStep("success")
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
                const isRedirectPayment = ["account_money", "consumer_credits", "mercadopago"].includes(paymentMethod)
                if (isRedirectPayment) {
                    setStep("mp_redirect")
                } else {
                    setStep("success")
                }
                notification.info("Pagamento em Análise", "Seu pagamento está sendo processado.")
            } else if (status === "rejected" || status === "payment_failed") {
                setPaymentFailedStatusDetail(responseData.statusDetail ?? null)
                setStep("payment_failed")
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

    const getRejectionMessage = (statusDetail: string | null): string => {
        if (!statusDetail) return "Seu pagamento foi recusado. Tente outro método de pagamento."
        const detailMap: Record<string, string> = {
            cc_rejected_insufficient_funds: "Saldo insuficiente no cartão. Tente outro cartão ou pague com Pix.",
            cc_rejected_other_reason: "Cartão recusado pela emissora. Verifique os dados ou tente outro cartão.",
            cc_rejected_high_risk: "Transação bloqueada por segurança. Tente outro cartão.",
            cc_rejected_blacklist: "Cartão bloqueado. Use outro método de pagamento.",
            cc_rejected_bad_verifier: "Falha na validação do cartão. Tente novamente ou use outro cartão.",
            cc_rejected_cannot_payment: "Não foi possível processar o pagamento. Tente outro cartão ou Pix.",
            cc_rejected_invalid_installments: "Parcelamento não suportado para este cartão.",
        }
        return detailMap[statusDetail] || "Pagamento recusado. Escolha outro método de pagamento."
    }

    const handleRecoveryPayment = async (method: "pix" | "boleto") => {
        const targetOrderId = actualOrderId || orderId
        if (!targetOrderId || targetOrderId.startsWith("temp-")) return

        try {
            setIsProcessingBrick(true)
            const responseData = await fetchJSONWithCSRF<any>("/api/checkout/recover-payment", {
                method: "POST",
                body: {
                    orderId: targetOrderId,
                    method,
                },
            })

            if (responseData.pixData?.qrCodeBase64 || responseData.pixData?.qrCode) {
                setPixData(responseData.pixData)
                setBoletoData(undefined)
                setStep("pix")
                notification.info("Aguardando Pagamento", "Realize o pagamento via Pix para confirmar o pedido.")
            } else if (responseData.boletoData?.barcode || responseData.boletoData?.ticketUrl) {
                setPixData(undefined)
                setBoletoData(responseData.boletoData)
                setStep("boleto")
                notification.info("Aguardando Pagamento", "Realize o pagamento do boleto para confirmar o pedido.")
            } else {
                setPaymentFailedStatusDetail(responseData.statusDetail ?? null)
                notification.error("Erro na recuperação", "Não foi possível gerar o pagamento alternativo. Tente novamente.")
            }
        } catch (error: any) {
            console.error("Erro na recuperação de pagamento:", error)
            if (error?.recoveryBlocked) {
                notification.error("Item indisponível", error.message || "Alguns itens não estão mais disponíveis.")
                router.replace("/checkout")
            } else {
                notification.error("Erro na recuperação", error.message || "Falha ao recuperar pagamento.")
            }
        } finally {
            setIsProcessingBrick(false)
        }
    }

    const handleRetryCard = () => {
        // Re-inicializa o Brick para tentar outro cartão
        setPaymentFailedStatusDetail(null)
        setBrickReady(false)
        brickInitializedRef.current = false
        if (brickIdRef.current) {
            try { brickIdRef.current.unmount() } catch { }
            brickIdRef.current = null
        }
        setStep("brick")
    }

    const handleCancelRecovery = () => {
        onClose()
        router.replace("/")
    }

    useEffect(() => {
        if (paymentConfirmed) {
            setStep("success")
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

    // Realtime: automatically confirms payment in < 80ms when Mercado Pago webhook updates the order
    const targetRealtimeId = actualOrderId || orderId
    useRealtimeRecord<{ situation?: string; payment_status?: string; order_number?: string }>({
        table: "orders",
        id: targetRealtimeId,
        enabled: open && !paymentConfirmed && Boolean(targetRealtimeId && !targetRealtimeId.startsWith("temp-")) && (step === "pix" || step === "boleto" || step === "mp_redirect"),
        onUpdate: (record) => {
            if (record?.situation === "paid" || record?.payment_status === "approved") {
                if (record.order_number) setActualOrderNumber(record.order_number)
                setPaymentConfirmed(true)
                setStep("success")
            }
        },
    })

    const lastCheckRef = useRef(0)

    const checkPaymentStatus = async (silent: boolean = false) => {
        const targetOrderId = actualOrderId || orderId
        if (!targetOrderId || targetOrderId.startsWith("temp-")) return
        const now = Date.now()

        if (now - lastCheckRef.current < 2500) return // trava 2.5s
        lastCheckRef.current = now

        if (isChecking) return
        if (!silent) setIsChecking(true)
        try {
            const response = await fetch("/api/orders/sync-payment-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: targetOrderId }),
            })

            if (response.ok) {
                const data = await response.json()
                // Se o status for pago (novo ou já vindo de webhook), confirma o pagamento
                if (data.newStatus === "paid" || data.paymentStatus === "approved") {
                    if (data.orderNumber) setActualOrderNumber(data.orderNumber)
                    setPaymentConfirmed(true)
                    setStep("success")
                } else if (!silent) {
                    // Notifica que ainda está pendente
                    notification.info("Aguardando Aprovação", "Seu pagamento ainda não foi confirmado pelo banco. Se você já pagou, aguarde uns instantes e tente novamente.")
                }
            } else if (!silent) {
                notification.error("Erro ao verificar", "Não conseguimos verificar o status do pagamento. Tente novamente em instantes.")
            }
        } catch (error) {
            console.error("Error checking payment status:", error)
            if (!silent) {
                notification.error("Erro de conexão", "Falha ao se comunicar com o servidor. Verifique sua rede e tente novamente.")
            }
        } finally {
            if (!silent) setIsChecking(false)
        }
    }

    // Auto-polling & Tab focus listener while waiting for Pix or MP Redirect payment
    useEffect(() => {
        const targetOrderId = actualOrderId || orderId
        if (!open || paymentConfirmed || !targetOrderId || targetOrderId.startsWith("temp-") || (step !== "pix" && step !== "mp_redirect")) return

        // 1. Gentle background poll every 3.5 seconds
        const pollInterval = setInterval(() => {
            void checkPaymentStatus(true)
        }, 3500)

        // 2. Check immediately when returning to tab (e.g. customer paid in banking app or MP tab and returned)
        const handleVisibilityOrFocus = () => {
            if (document.visibilityState === "visible") {
                void checkPaymentStatus(true)
            }
        }

        document.addEventListener("visibilitychange", handleVisibilityOrFocus)
        window.addEventListener("focus", handleVisibilityOrFocus)

        return () => {
            clearInterval(pollInterval)
            document.removeEventListener("visibilitychange", handleVisibilityOrFocus)
            window.removeEventListener("focus", handleVisibilityOrFocus)
        }
    }, [open, paymentConfirmed, orderId, actualOrderId, step])

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
            <header className="lg:flex flex-col w-full bg-brand-dark dark:bg-dark-surface border-b border-white/10 sticky top-0 z-50">
                <div className="w-full h-[68px] flex items-center justify-center max-w-[1300px] px-2 mx-auto gap-4">
                    <a href="/" className="cursor-pointer shrink-0 z-[110] pt-1">
                        <img
                            src="https://img.dudit.com.br/static/Logo.png"
                            alt="Dudit"
                            width={140}
                            height={40}
                            className="h-10 w-auto object-contain"
                        />
                    </a>
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
                                <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-8 h-8 object-contain" />
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
                            <p className="text-md text-brand-inactive-text dark:text-dark-body text-center max-w-md mb-4">
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
                                        <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(amount)}</span>
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
                                    <Input value={pixData?.qrCode || ""} readOnly onChange={() => { }} />
                                    <Button
                                        variant="outline"
                                        onClick={handleCopyQrCode}
                                        className="gap-2 shrink-0 h-[42px] w-[42px]"
                                    >
                                        {copied ? <CheckCircleIcon size={16} className="text-brand-green" /> : <CopyIcon size={16} />}
                                    </Button>
                                </div>

                                <InfoCard
                                    message="Assim que o banco confirmar, seu pedido será liberado automaticamente."
                                    color="orange"
                                    className="w-full"
                                />

                                <Button
                                    onClick={() => checkPaymentStatus(false)}
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
                                    <Button variant="link" onClick={handleClose} className="w-full">
                                        Voltar
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === "manual_pix" && (
                        <motion.div
                            key="manual_pix"
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
                            <p className="text-md text-brand-inactive-text dark:text-dark-body text-center max-w-md mb-4">
                                É rapidinho: escaneie o QR Code ou copie o código Pix e pague pelo app do seu banco.
                            </p>

                            {manualPixQrCode && (
                                <div className="mb-8 relative">
                                    <div className="w-64 h-64 p-2 bg-transparent flex items-center justify-center isolate">
                                        <img
                                            src={manualPixQrCode}
                                            alt="PIX QR Code"
                                            className="w-full h-full object-contain mix-blend-multiply"
                                        />
                                    </div>
                                    <div className="mt-4 flex flex-col items-center">
                                        <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(amount)}</span>
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">{orderNumber ? `Sinal - ${orderNumber}` : "Sinal / Entrada"}</span>
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
                                    <Input value={manualPixPayload || ""} readOnly onChange={() => { }} />
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            if (manualPixPayload) {
                                                navigator.clipboard.writeText(manualPixPayload)
                                                setCopied(true)
                                                notification.success("Código Pix copiado!", "Use a opção 'Pix Copia e Cola' no seu banco.")
                                                setTimeout(() => setCopied(false), 2000)
                                            }
                                        }}
                                        className="gap-2 shrink-0 h-[42px] w-[42px]"
                                    >
                                        {copied ? <CheckCircleIcon size={16} className="text-brand-green" /> : <CopyIcon size={16} />}
                                    </Button>
                                </div>

                                {partnerPhone && (
                                    <div className="mb-6">
                                        <InfoCard
                                            message={
                                                <div className="space-y-2">
                                                    <p>
                                                        Após realizar o pagamento, envie o comprovante para o WhatsApp do estabelecimento:
                                                    </p>
                                                    <p className="font-bold text-brand-dark dark:text-dark-heading text-base">
                                                        {formatBrazilPhone(partnerPhone)}
                                                    </p>
                                                    <a
                                                        href={`https://wa.me/${partnerPhone.replace(/\D/g, "")}?text=${encodeURIComponent('Olá! Segue o comprovante do sinal referente ao meu agendamento no valor de ' + formatCurrency(amount))}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-green hover:underline mt-1"
                                                    >
                                                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                                            <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 0 0 1.358 4.963L2 22l5.221-1.37a9.936 9.936 0 0 0 4.79 1.22h.004c5.505 0 9.988-4.478 9.989-9.985 0-2.669-1.038-5.176-2.927-7.067A9.924 9.924 0 0 0 12.012 2zm5.727 14.06c-.313.882-1.823 1.728-2.5 1.782-.678.055-1.347.33-4.354-.925-3.007-1.254-4.937-4.322-5.086-4.524-.15-.2-.1.2-.1-.2.036-.347.161-.595.281-.762.12-.167.241-.334.362-.501.121-.167.162-.278.243-.464.08-.186.04-.347-.02-.501-.06-.154-.523-1.282-.724-1.762-.19-.482-.397-.406-.547-.413l-.466-.008c-.161 0-.422.06-.643.3-.222.24-.845.827-.845 2.017s.866 2.338.986 2.502c.12.164 1.705 2.616 4.131 3.666 2.427 1.05 2.427.7 3.255.626.828-.074 1.831-.75 2.083-1.44a1.79 1.79 0 0 0 .125-.8c-.06-.108-.242-.167-.523-.306-.282-.14-1.666-.827-1.928-.921-.261-.093-.452-.14-.643.14-.19.28-.744.921-.913 1.11-.169.189-.338.212-.619.073-.281-.14-1.189-.44-2.264-1.397-.837-.746-1.401-1.666-1.565-1.947-.165-.281-.018-.432.123-.572.127-.126.282-.328.422-.493.14-.165.187-.281.282-.47.095-.187.047-.353-.023-.493-.07-.14-.547-1.319-.747-1.802zm-5.739 5.727z" />
                                                        </svg>
                                                        Enviar comprovante pelo WhatsApp
                                                    </a>
                                                </div>
                                            }
                                            color="orange"
                                            className="w-full"
                                        />
                                    </div>
                                )}

                                <Button
                                    onClick={() => {
                                        setPaymentConfirmed(true)
                                        notification.success("Reserva Concluída!", "Sua reserva foi criada como pendente de aprovação do sinal.")
                                    }}
                                    className="w-full my-6 h-12 flex items-center justify-center gap-2"
                                >
                                    Já enviei o comprovante
                                </Button>

                                <div className="flex flex-col gap-4">
                                    <Separator />
                                    <Button variant="link" onClick={handleClose} className="w-full">
                                        Acompanhar meus pedidos
                                    </Button>
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
                                <img src="https://img.dudit.com.br/static/icons/payments/Boleto.png" alt="Boleto" className="w-8 h-8 object-contain" />
                            </div>

                            <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading text-center mb-2">
                                Agora é só pagar seu Boleto
                            </h1>
                            <p className="text-md text-brand-inactive-text text-center max-w-md mb-8">
                                Use a linha digitável ou o código de barras para pagar pelo Internet Banking. Para pagar em banco, caixa eletrônico ou lotérica, basta imprimir o boleto.
                            </p>

                            <div className="w-full max-w-md">
                                {boletoData?.barcode && (
                                    <div className="mb-6">
                                        <Barcode
                                            value={boletoData.barcode}
                                            format="CODE128"
                                            width={1.5}
                                            height={60}
                                            displayValue={false}
                                            margin={10}
                                            className="w-full"
                                        />
                                    </div>
                                )}

                                <div className="mb-4">
                                    <div className="flex gap-2 w-full">
                                        <Input
                                            label="Código de barras do boleto"
                                            value={boletoData?.barcode || "Código não disponível"}
                                            variant="full-rounded"
                                            readOnly
                                            className="flex-1 h-[42px] px-3"
                                        />
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                if (boletoData?.barcode) {
                                                    navigator.clipboard.writeText(boletoData.barcode)
                                                    setCopied(true)
                                                    notification.success("Código copiado!", "Código de barras copiado para a área de transferência.")
                                                    setTimeout(() => setCopied(false), 2000)
                                                }
                                            }}
                                            className="shrink-0 h-[42px] w-[42px] flex items-center justify-center"
                                        >
                                            {copied ? <CheckCircleIcon size={16} className="text-brand-green" /> : <CopyIcon size={16} />}
                                        </Button>
                                        {boletoData?.ticketUrl && (
                                            <Button
                                                variant="outline"
                                                onClick={() => window.open(boletoData.ticketUrl, "_blank")}
                                                className="shrink-0 h-[42px] w-[42px] flex items-center justify-center"
                                                title="Imprimir Boleto"
                                            >
                                                <PrinterIcon size={16} />
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between mb-6 mt-4">
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Valor a pagar</span>
                                    <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(amount)}</span>
                                </div>

                                <InfoCard
                                    message="A aprovação pode levar de 1 a 2 dias úteis. Pagamentos realizados em fins de semana ou feriados serão analisados no próximo dia útil."
                                    color="orange"
                                    className="w-full mb-6"
                                />

                                <Button asChild className="w-full h-12 flex items-center justify-center font-semibold text-base py-0 px-0">
                                    <Link href="/pedidos" prefetch={false} className="w-full h-12">
                                        Ver Meus Pedidos
                                    </Link>
                                </Button>

                                <div className="flex flex-col gap-4 mt-6">
                                    <Separator />
                                    <Button variant="link" onClick={handleClose} className="w-full">
                                        Fechar
                                    </Button>
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
                                    title={`Pedido Confirmado! #${resolvedOrderNumber}`}
                                    subtitle="O vendedor já foi notificado e está preparando tudo para você. Não se preocupe, o Dino te avisa quando o pedido sair para entrega!"
                                />
                            </div>

                            <Separator className="mb-6" />

                            <div className="space-y-6 max-w-xl mx-auto mb-10">
                                <div>
                                    <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4 flex items-center gap-2">
                                        Itens do pedido
                                    </h3>
                                    <div className="space-y-3">
                                        {orderDetails.items.map((item, idx) => {
                                            const isService = item.itemType === "service" || item.itemType === "service_booking" || !!item.bookingDate || !!item.bookingSummary
                                            const bookingDateFormatted = formatBookingDisplayDate(item.bookingDate)
                                            return (
                                                <div key={idx} className="flex gap-3.5 items-center justify-between py-2 border-b border-brand-border dark:border-dark-border last:border-b-0">
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className="w-12 h-12 bg-white dark:bg-dark-border/50 border border-brand-border dark:border-dark-border rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                                                            <img
                                                                src={item.image || "https://img.dudit.com.br/static/Placeholder.png"}
                                                                alt={item.name}
                                                                className="w-full h-full object-contain rounded-full"
                                                            />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                {item.name}
                                                            </h4>
                                                            {item.variant_name && (
                                                                <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body block truncate">
                                                                    {item.variant_name}
                                                                </span>
                                                            )}
                                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">
                                                                {formatItemQuantityUnit(item.quantity, item.unit)} x {formatCurrency(item.price)}
                                                            </p>
                                                            {isService && (item.bookingSummary || (bookingDateFormatted && item.bookingTime)) && (
                                                                <div className="flex items-center gap-1.5 text-[11px] text-brand-green font-medium mt-0.5">
                                                                    <CalendarIcon size={12} className="shrink-0" />
                                                                    <span className="truncate">
                                                                        {item.bookingSummary || `Agendamento: ${bookingDateFormatted} às ${item.bookingTime}${item.staffName ? ` • ${item.staffName}` : ""}`}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0 pl-2">
                                                        <span className="font-semibold text-sm text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(item.quantity * item.price)}
                                                        </span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {(() => {
                                    const hasProducts = orderDetails.items.some(i => i.itemType !== "service" && i.itemType !== "service_booking" && !i.bookingDate)
                                    const hasServices = orderDetails.items.some(i => i.itemType === "service" || i.itemType === "service_booking" || !!i.bookingDate)
                                    const hasCustomerLocationService = orderDetails.items.some(i => (i.itemType === "service" || i.itemType === "service_booking" || !!i.bookingDate) && i.fulfillmentMode === "customer_location")
                                    const hasOnSiteService = orderDetails.items.some(i => (i.itemType === "service" || i.itemType === "service_booking" || !!i.bookingDate) && i.fulfillmentMode !== "customer_location")

                                    const storeAddr = orderDetails.storeAddress || orderDetails.partnerAddress || "No endereço do estabelecimento"
                                    const clientAddr = orderDetails.deliveryAddress || "Endereço cadastrado"

                                    const cards: Array<{ id: string; title: string; address: string }> = []

                                    if (hasProducts) {
                                        if (orderDetails.deliveryType === "pickup") {
                                            cards.push({
                                                id: "product-pickup",
                                                title: "Retirada no estabelecimento",
                                                address: storeAddr,
                                            })
                                        } else if (orderDetails.deliveryAddress) {
                                            cards.push({
                                                id: "product-delivery",
                                                title: "Endereço de Entrega",
                                                address: clientAddr,
                                            })
                                        }
                                    } else if (orderDetails.deliveryType === "delivery" && orderDetails.deliveryAddress && !hasServices) {
                                        cards.push({
                                            id: "generic-delivery",
                                            title: "Endereço de Entrega",
                                            address: clientAddr,
                                        })
                                    }

                                    if (hasCustomerLocationService && (!hasProducts || orderDetails.deliveryType !== "delivery")) {
                                        cards.push({
                                            id: "service-customer",
                                            title: "Local do atendimento no seu endereço",
                                            address: clientAddr,
                                        })
                                    }

                                    if (hasOnSiteService && (!hasProducts || orderDetails.deliveryType !== "pickup")) {
                                        cards.push({
                                            id: "service-onsite",
                                            title: "Local do atendimento no estabelecimento",
                                            address: storeAddr,
                                        })
                                    }

                                    if (cards.length === 0 && orderDetails.deliveryAddress) {
                                        cards.push({
                                            id: "fallback-delivery",
                                            title: orderDetails.deliveryType === "pickup" ? "Local de Retirada" : "Endereço de Entrega",
                                            address: orderDetails.deliveryType === "pickup" ? storeAddr : clientAddr,
                                        })
                                    }

                                    if (cards.length === 0) return null

                                    return (
                                        <>
                                            <Separator />
                                            <div className="space-y-3">
                                                {cards.map(card => (
                                                    <div
                                                        key={card.id}
                                                        className="flex items-center gap-3"
                                                    >
                                                        <img
                                                            src="https://img.dudit.com.br/static/Map.png"
                                                            alt={card.title}
                                                            className="w-11 h-11 object-cover rounded-full shrink-0"
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading leading-tight">
                                                                {card.title}
                                                            </p>
                                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 leading-snug">
                                                                {card.address}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )
                                })()}

                                <Separator />
                                <div className="flex items-center justify-between py-1">
                                    <span className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body">Total pago</span>
                                    <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(amount)}</span>
                                </div>
                            </div>

                            <div className="flex justify-center">
                                <Button asChild size="lg" className="w-full sm:w-auto px-10">
                                    <Link href="/pedidos" prefetch={false}>
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
                                title="Finalize no Mercado Pago"
                                subtitle="Uma nova aba foi aberta para você concluir com Saldo Mercado Pago ou Mercado Parcelado. Assim que você concluir, confirmaremos seu pedido automaticamente!"
                            />

                            <div className="w-full max-w-md flex flex-col gap-4 mt-6">
                                <div className="flex items-center justify-between p-4 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-border/20">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">Pedido</span>
                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">#{resolvedOrderNumber || "Processando"}</span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">Total</span>
                                        <span className="text-base font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(amount)}</span>
                                    </div>
                                </div>

                                <InfoCard
                                    message="Assim que você concluir o pagamento no Mercado Pago, esta tela atualizará automaticamente em tempo real."
                                    color="orange"
                                    className="w-full"
                                />

                                {preferenceDataRef.current?.init_point && (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            if (preferenceDataRef.current?.init_point) {
                                                window.open(preferenceDataRef.current.init_point, "_blank")
                                            }
                                        }}
                                        className="w-full h-11 flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                            <polyline points="15 3 21 3 21 9" />
                                            <line x1="10" y1="14" x2="21" y2="3" />
                                        </svg>
                                        Abrir Mercado Pago novamente
                                    </Button>
                                )}

                                <Button
                                    onClick={() => checkPaymentStatus(false)}
                                    disabled={isChecking}
                                    className="w-full h-12 flex items-center justify-center gap-2"
                                >
                                    {isChecking ? (
                                        <>
                                            <Spinner className="text-white mr-2" size={18} />
                                            Verificando pagamento...
                                        </>
                                    ) : (
                                        "Já paguei, verificar agora"
                                    )}
                                </Button>

                                <div className="flex flex-col gap-4 mt-2">
                                    <Separator />
                                    <Button asChild variant="link" className="w-full">
                                        <Link href="/pedidos" prefetch={false}>
                                            Acompanhar meus Pedidos
                                        </Link>
                                    </Button>
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

                    {step === "payment_failed" && (
                        <motion.div
                            key="payment-failed"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="bg-transparent overflow-hidden px-4 sm:px-0 flex flex-col items-center"
                        >
                            <IconPlaceholder
                                placeholderType="image"
                                imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                                imageAlt="Pagamento recusado"
                                title="Pagamento recusado"
                                subtitle={getRejectionMessage(paymentFailedStatusDetail)}
                            />

                            <div className="w-full max-w-md flex flex-col gap-3 mt-4">
                                <Button
                                    onClick={() => handleRecoveryPayment("pix")}
                                    disabled={isProcessingBrick}
                                    className="w-full h-12 flex items-center justify-center gap-2"
                                >
                                    {isProcessingBrick ? (
                                        <Spinner className="mr-2" size={16} />
                                    ) : (
                                        <img
                                            src="https://img.dudit.com.br/static/icons/payments/Pix.png"
                                            alt="Pix"
                                            className="w-5 h-5 object-contain shrink-0"
                                        />
                                    )}
                                    Pagar com Pix
                                </Button>
                                <Button
                                    onClick={() => handleRecoveryPayment("boleto")}
                                    disabled={isProcessingBrick}
                                    className="w-full h-12 flex items-center justify-center gap-2"
                                >
                                    {isProcessingBrick ? (
                                        <Spinner className="mr-2" size={16} />
                                    ) : (
                                        <img
                                            src="https://img.dudit.com.br/static/icons/payments/Boleto.png"
                                            alt="Boleto"
                                            className="w-5 h-5 object-contain shrink-0"
                                        />
                                    )}
                                    Pagar com Boleto
                                </Button>
                                <Button
                                    onClick={handleRetryCard}
                                    className="w-full h-12 flex items-center justify-center gap-2"
                                >
                                    <CreditCardIcon className="w-5 h-5 shrink-0" />
                                    Tentar outro cartão
                                </Button>
                                <Separator />
                                <Button
                                    variant="outline"
                                    onClick={handleCancelRecovery}
                                    className="w-full h-12"
                                >
                                    Ir para a loja
                                </Button>
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
