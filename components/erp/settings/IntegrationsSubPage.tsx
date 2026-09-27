"use client"

import React, { useState, useRef, useCallback, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button, InfoCard, DefaultModal, ListItem, Badge, FormSection, IconPlaceholder, AlertModal, SavingStatusModal, Input } from "@/components/reusable"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import { Switch } from "@/components/reusable/Switch"
import { CheckCircleIcon, ChevronLeftIcon, ArrowLeftRightIcon, XIcon, InfoIcon, QRCodeIcon } from "@/lib/icons"
import {
    disconnectMercadoPagoAction,
    getMercadoPagoStatusAction,
    updateMpAcceptedPaymentMethodsAction,
    type MpAcceptedPaymentMethods,
} from "@/app/actions/mercadopago"
import {
    getSuperFreteStatusAction,
    connectSuperFreteAction,
    disconnectSuperFreteAction,
    setupSuperFreteWebhookAction,
    saveSuperFreteConfigAction,
    type SuperFreteStatus,
    type SuperFreteConfig,
} from "@/app/actions/shipping/superfrete"
import type { SuperFreteServiceId } from "@/lib/services/shipping/superfrete"
import {
    getWhatsappIntegrationAction,
    disconnectWhatsappAction,
    connectEvolutionAction,
    disconnectEvolutionAction,
    getEvolutionStatusAction,
    isEvolutionConfiguredAction,
    resetEvolutionPairingStatusAction,
    type WhatsappConnectionView,
} from "@/app/actions/whatsapp"
import { WhatsappConnectButton } from "@/components/erp/integrations/WhatsappConnectButton"
import { FadeIn } from "@/components/animations/FadeIn"
import { motion, AnimatePresence } from "framer-motion"
import { getSubscriptionStatusAction } from "@/app/actions/erp/subscriptions"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { toast } from "@/hooks/use-notification"

// ─── Integration Card (same style as IntegrationsPage.tsx) ───────────────────

export const IntegrationCard = ({
    name,
    description,
    status,
    colorClass,
    icon: Icon,
    children,
}: {
    name: string
    description: string
    status: "connected" | "disconnected"
    colorClass: string
    icon: any
    children: React.ReactNode
}) => (
    <div className="border border-brand-border dark:border-dark-border rounded-xl p-5 flex flex-col h-full bg-white dark:bg-dark-surface transition-all">
        <div className="flex justify-between items-start mb-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white ${colorClass}`}>
                <Icon size={24} />
            </div>
            {status === "connected" ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircleIcon size={12} />
                    Conectado
                </span>
            ) : (
                <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    Desconectado
                </span>
            )}
        </div>
        <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-2">{name}</h3>
        <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-6 flex-1">{description}</p>
        {children}
    </div>
)

const DEFAULT_MP_ACCEPTED_PAYMENT_METHODS: MpAcceptedPaymentMethods = {
    credit_card: true,
    debit_card: true,
    pix: true,
    boleto: true,
    mercado_pago_wallet: true,
}

// ─── Mercado Pago icon ────────────────────────────────────────────────────────

export const IntegrationsSubPage = ({
    partner,
    mpConnected,
    superfreteConnected,
    onBack,
}: {
    partner: any
    mpConnected: boolean
    superfreteConnected: boolean
    onBack: () => void
}) => {
    const searchParams = useSearchParams()
    const [isLoading, setIsLoading] = useState(false)
    const [isCheckingPlan, setIsCheckingPlan] = useState(true)
    const [planSlug, setPlanSlug] = useState<string>("free")
    const { openPlanUpgrade } = usePlanUpgrade()

    const [activeModal, setActiveModal] = useState<"info" | "knowMore" | "permissions" | "mpConfig" | "superfreteConfig" | null>(null)
    const [knowMoreStep, setKnowMoreStep] = useState(0)

    // Accepted payment methods state
    const [acceptedMethods, setAcceptedMethods] = useState<MpAcceptedPaymentMethods>(DEFAULT_MP_ACCEPTED_PAYMENT_METHODS)
    const [isLoadingMethods, setIsLoadingMethods] = useState(false)
    const [isSavingMethods, setIsSavingMethods] = useState<string | null>(null)

    // SuperFrete integration state
    const [sfStatus, setSfStatus] = useState<SuperFreteStatus | null>(null)
    const [sfIsLoading, setSfIsLoading] = useState(false)
    const [sfActiveTab, setSfActiveTab] = useState<"connect" | "settings">("connect")
    const [sfTokenInput, setSfTokenInput] = useState("")
    const [sfOriginCep, setSfOriginCep] = useState("")
    const [sfDefaultHeight, setSfDefaultHeight] = useState("10")
    const [sfDefaultWidth, setSfDefaultWidth] = useState("10")
    const [sfDefaultLength, setSfDefaultLength] = useState("10")
    const [sfDefaultWeight, setSfDefaultWeight] = useState("0.5")
    const [sfInsuranceValue, setSfInsuranceValue] = useState("")
    const [sfOwnHand, setSfOwnHand] = useState(false)
    const [sfReceipt, setSfReceipt] = useState(false)
    const [sfServices, setSfServices] = useState<SuperFreteServiceId[]>([1, 2])
    const [sfIsConnecting, setSfIsConnecting] = useState(false)

    // WhatsApp integration state
    const [waConnection, setWaConnection] = useState<WhatsappConnectionView | null>(null)
    const [waIsLoading, setWaIsLoading] = useState(false)
    const [waActiveModal, setWaActiveModal] = useState<"info" | "knowMore" | null>(null)
    const [waKnowMoreStep, setWaKnowMoreStep] = useState(0)

    // WhatsApp Evolution modal state
    const [evoModalOpen, setEvoModalOpen] = useState(false)
    const [evoStatus, setEvoStatus] = useState<string>("disconnected")
    const [evoQrCode, setEvoQrCode] = useState<string | null>(null)
    const [evoPhoneNumber, setEvoPhoneNumber] = useState<string | null>(null)
    const [evoIsLoading, setEvoIsLoading] = useState(false)
    const [evoConfigured, setEvoConfigured] = useState<boolean | null>(null)
    const [evoConnection, setEvoConnection] = useState<WhatsappConnectionView | null>(null)
    const evoStatusRef = useRef(evoStatus)
    const evoPairingInitiated = useRef(false)

    useEffect(() => { evoStatusRef.current = evoStatus }, [evoStatus])

    useEffect(() => {
        return () => {
            if (evoStatusRef.current === "qr_pending" || evoStatusRef.current === "connecting") {
                resetEvolutionPairingStatusAction().catch(() => {})
            }
        }
    }, [])

    useEffect(() => {
        if (!evoModalOpen) return
        isEvolutionConfiguredAction().then((res) => {
            if (res.success && res.data) setEvoConfigured(res.data.configured)
        })
        const fetchStatus = async () => {
            const res = await getWhatsappIntegrationAction()
            if (res.success && res.data) {
                const evo = res.data.allConnections?.find((c) => c.provider === "evolution") || null
                setEvoConnection(evo)
                if (evo) {
                    setEvoStatus(evo.status)
                    setEvoPhoneNumber(evo.phoneNumber)
                } else {
                    setEvoStatus("disconnected")
                    setEvoPhoneNumber(null)
                }
            }
        }
        fetchStatus()
    }, [evoModalOpen])

    useEffect(() => {
        if (evoConnection?.phoneNumber) setEvoPhoneNumber(evoConnection.phoneNumber)
    }, [evoConnection])

    useEffect(() => {
        if (evoConnection) {
            const isPairingActive = evoPairingInitiated.current &&
                (evoStatus === "connected" || evoStatus === "qr_pending" || evoStatus === "connecting")
            if (!isPairingActive) setEvoStatus(evoConnection.status)
        }
    }, [evoConnection, evoStatus])

    useEffect(() => {
        if (!evoModalOpen || (evoStatus !== "qr_pending" && evoStatus !== "connecting")) return
        const startTime = Date.now()
        const interval = setInterval(async () => {
            if (Date.now() - startTime > 5 * 60 * 1000) {
                clearInterval(interval)
                setEvoStatus("disconnected")
                setEvoQrCode(null)
                toast.error("Tempo limite de pareamento atingido.")
                return
            }
            const res = await getEvolutionStatusAction()
            if (res.success && res.data) {
                setEvoStatus(res.data.status)
                if (res.data.status === "connected") {
                    setEvoQrCode(null)
                    if (res.data.phoneNumber) setEvoPhoneNumber(res.data.phoneNumber)
                    toast.success("WhatsApp conectado com sucesso!")
                    const refresh = await getWhatsappIntegrationAction()
                    if (refresh.success && refresh.data) {
                        setEvoConnection(refresh.data.allConnections?.find((c) => c.provider === "evolution") || null)
                    }
                    setTimeout(async () => {
                        const r2 = await getWhatsappIntegrationAction()
                        if (r2.success && r2.data) setEvoConnection(r2.data.allConnections?.find((c) => c.provider === "evolution") || null)
                    }, 3000)
                } else if (res.data.qrCode) {
                    setEvoQrCode(res.data.qrCode)
                }
                if (res.data.phoneNumber) setEvoPhoneNumber(res.data.phoneNumber)
            }
        }, 5000)
        return () => clearInterval(interval)
    }, [evoStatus, evoModalOpen])

    const handleEvoConnect = async () => {
        setEvoIsLoading(true)
        evoPairingInitiated.current = true
        try {
            const res = await connectEvolutionAction()
            if (!res.success) { toast.error(res.error); return }
            setEvoStatus(res.data.status)
            setEvoQrCode(res.data.qrCode)
            if (res.data.status === "connected") toast.success("WhatsApp conectado com sucesso!")
            const refresh = await getWhatsappIntegrationAction()
            if (refresh.success && refresh.data) {
                setEvoConnection(refresh.data.allConnections?.find((c) => c.provider === "evolution") || null)
            }
        } finally { setEvoIsLoading(false) }
    }

    const handleEvoCancel = async () => {
        setEvoIsLoading(true)
        try {
            const res = await resetEvolutionPairingStatusAction()
            if (res.success) {
                setEvoStatus("disconnected")
                setEvoQrCode(null)
                const refresh = await getWhatsappIntegrationAction()
                if (refresh.success && refresh.data) {
                    setEvoConnection(refresh.data.allConnections?.find((c) => c.provider === "evolution") || null)
                }
            }
        } finally { setEvoIsLoading(false) }
    }

    const handleEvoDisconnect = async () => {
        setEvoIsLoading(true)
        try {
            const res = await disconnectEvolutionAction()
            if (!res.success) { toast.error(res.error); return }
            toast.success("WhatsApp desconectado")
            setEvoStatus("disconnected")
            setEvoQrCode(null)
            setEvoPhoneNumber(null)
            setEvoConnection(null)
        } finally { setEvoIsLoading(false) }
    }

    const handleEvoModalClose = () => {
        if (evoStatusRef.current === "qr_pending" || evoStatusRef.current === "connecting") {
            resetEvolutionPairingStatusAction().catch(() => {})
        }
        setEvoStatus("disconnected")
        setEvoQrCode(null)
        setEvoModalOpen(false)
    }

    // Confirm modal states
    const [confirmEvoDisconnectOpen, setConfirmEvoDisconnectOpen] = useState(false)
    const [confirmWaDisconnectOpen, setConfirmWaDisconnectOpen] = useState(false)
    const [confirmMpDisconnectOpen, setConfirmMpDisconnectOpen] = useState(false)

    const [provider] = useState<"meta">("meta")

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const fetchWaStatus = useCallback(async () => {
        try {
            const res = await getWhatsappIntegrationAction()
            if (res.success && res.data) {
                setWaConnection(res.data.connection)
            }
        } catch (err) {
            console.error("Error fetching WA status:", err)
        }
    }, [])

    const handleWaConnectClick = () => {
        if (!hasMinimumPlan(planSlug, "escalar")) {
            openPlanUpgrade("escalar")
            return
        }
        setWaActiveModal("info")
    }

    const handleDisconnectWa = async () => {
        setWaIsLoading(true)
        try {
            const result = await disconnectWhatsappAction(provider)
            if (!result.success) {
                toast.error(`Erro: ${result.error}`)
            } else {
                toast.success("WhatsApp desconectado com sucesso")
                await fetchWaStatus()
            }
        } catch (err) {
            toast.error("Erro inesperado ao desconectar")
        } finally {
            setWaIsLoading(false)
        }
    }

    const handleBack = useCallback(() => onBack(), [onBack])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const checkPlan = useCallback(async () => {
        try {
            const res = await getSubscriptionStatusAction()
            if (res.success && res.data) {
                setPlanSlug(res.data.plan.slug)
            }
        } catch (err) {
            console.error("Error checking plan:", err)
        } finally {
            setIsCheckingPlan(false)
        }
    }, [])

    const fetchMpAcceptedMethods = useCallback(async () => {
        if (!mpConnected) return
        setIsLoadingMethods(true)
        try {
            const res = await getMercadoPagoStatusAction()
            if ('acceptedPaymentMethods' in res && res.acceptedPaymentMethods) {
                setAcceptedMethods(res.acceptedPaymentMethods)
            }
        } catch (err) {
            console.error("Error fetching accepted methods:", err)
        } finally {
            setIsLoadingMethods(false)
        }
    }, [mpConnected])

    const handleToggleMethod = async (key: keyof MpAcceptedPaymentMethods) => {
        const updated = { ...acceptedMethods, [key]: !acceptedMethods[key] }
        setAcceptedMethods(updated)
        setIsSavingMethods(key)
        try {
            const res = await updateMpAcceptedPaymentMethodsAction(updated)
            if (res.error) {
                toast.error(`Erro ao salvar: ${res.error}`)
                setAcceptedMethods(acceptedMethods) // rollback
            }
        } catch (err) {
            toast.error("Erro ao salvar configuração")
            setAcceptedMethods(acceptedMethods) // rollback
        } finally {
            setIsSavingMethods(null)
        }
    }

    const fetchSfStatus = useCallback(async () => {
        if (!hasMinimumPlan(planSlug, "escalar")) return
        try {
            const res = await getSuperFreteStatusAction()
            if (res.success) {
                setSfStatus(res.data)
                const cfg = res.data.config
                if (cfg) {
                    if (cfg.originCep) setSfOriginCep(cfg.originCep)
                    if (cfg.height !== undefined) setSfDefaultHeight(String(cfg.height))
                    if (cfg.width !== undefined) setSfDefaultWidth(String(cfg.width))
                    if (cfg.length !== undefined) setSfDefaultLength(String(cfg.length))
                    if (cfg.weight !== undefined) setSfDefaultWeight(String(cfg.weight))
                    if (cfg.insuranceValue !== undefined) setSfInsuranceValue(String(cfg.insuranceValue))
                    if (cfg.ownHand !== undefined) setSfOwnHand(cfg.ownHand)
                    if (cfg.receipt !== undefined) setSfReceipt(cfg.receipt)
                    if (cfg.services && cfg.services.length > 0) setSfServices(cfg.services)
                }
            }
        } catch (err) {
            console.error("Error fetching SuperFrete status:", err)
        }
    }, [planSlug])

    const handleSfConnect = async () => {
        if (!hasMinimumPlan(planSlug, "escalar")) {
            openPlanUpgrade("escalar")
            return
        }
        setSfIsConnecting(true)
        try {
            const res = await connectSuperFreteAction({
                token: sfTokenInput,
                webhookSecret: crypto.randomUUID(),
            })
            if (res.success) {
                toast.success("SuperFrete conectado com sucesso!")
                if (res.balance !== undefined) {
                    toast.success(`Saldo atual: R$ ${Number(res.balance).toFixed(2)}`)
                }
                setActiveModal(null)
                await fetchSfStatus()
            } else {
                toast.error(res.error || "Erro ao conectar SuperFrete")
            }
        } catch (err: any) {
            toast.error(`Erro: ${err.message}`)
        } finally {
            setSfIsConnecting(false)
        }
    }

    const handleSfDisconnect = async () => {
        setSfIsLoading(true)
        try {
            const res = await disconnectSuperFreteAction()
            if (res.success) {
                toast.success("SuperFrete desconectado")
                setSfStatus({ connected: false, webhookConfigured: false, planAllowed: true })
            } else {
                toast.error(res.error || "Erro ao desconectar SuperFrete")
            }
        } catch (err) {
            toast.error("Erro inesperado")
        } finally {
            setSfIsLoading(false)
        }
    }

    useEffect(() => {
        checkPlan()
        fetchWaStatus()
        fetchMpAcceptedMethods()
        fetchSfStatus()
    }, [checkPlan, fetchWaStatus, fetchMpAcceptedMethods, fetchSfStatus])

    const handleConnectClick = () => {
        if (!hasMinimumPlan(planSlug, "crescer")) {
            openPlanUpgrade("crescer")
            return
        }
        setActiveModal("info")
    }

    const handleStartOAuth = async () => {
        if (!hasMinimumPlan(planSlug, "crescer")) {
            setActiveModal(null)
            openPlanUpgrade("crescer")
            return
        }
        setIsLoading(true)
        try {
            window.location.href = "/api/mercadopago/oauth/start"
        } catch (err) {
            toast.error("Erro ao iniciar conexão com Mercado Pago. Tente novamente.")
            setIsLoading(false)
        }
    }

    const handleDisconnect = async () => {
        setIsLoading(true)
        const result = await disconnectMercadoPagoAction()

        if (result.error) {
            toast.error(`Erro: ${result.error}`)
        } else {
            toast.success("Mercado Pago desconectado com sucesso.")
            window.location.reload()
        }
        setIsLoading(false)
    }

    const KNOW_MORE_STEPS = [
        {
            title: "O que é o Mercado Pago?",
            description: "O Mercado Pago é uma solução de pagamentos simples e completa pra você vender com mais facilidade.\n\nCom ele, seus clientes podem pagar sem precisar ter conta ou finalizar a compra direto na sua loja, de forma rápida e segura.\n\nTudo isso com vários meios de pagamento em um só lugar.",
        },
        {
            title: "Como funciona o Mercado Pago?",
            description: "A integração é bem rápida e prática. Em poucos minutos, você já pode começar a vender.\n\nDá pra oferecer parcelamento em até 12x no cartão, além de aceitar Pix, boleto e débito.\n\nE quem já tem conta no Mercado Pago consegue pagar ainda mais rápido e até parcelar sem cartão.",
        },
        {
            title: "Funcionalidades do Mercado Pago",
            list: [
                "Pagamento com cartão, Pix, boleto e débito",
                "Parcelamento em até 12x",
                "Parcelamento sem cartão (pra quem tem conta Mercado Pago)",
                "Compra Garantida para mais segurança nas compras",
            ],
        },
        {
            title: "Por que usar o Mercado Pago?",
            list: [
                "🔒 Mais segurança com sistema antifraude sempre atualizado",
                "💳 Várias formas de pagamento pra facilitar a vida do cliente",
                "💰 Possibilidade de crédito para o seu negócio",
                "⚡ Pagamento rápido, sem complicação",
            ],
        },
    ]

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="hidden md:inline truncate">Integrações</span>
                                    </h1>
                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        Conecte seu negócio com ferramentas externas e meios de pagamento.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                        {searchParams.get("mp_connected") === "true" && (
                            <InfoCard
                                message="Mercado Pago conectado com sucesso! Agora você pode receber pagamentos online."
                                color="green"
                                className="mb-6"
                            />
                        )}

                        {searchParams.get("mp_error") && (
                            <InfoCard
                                message={`Erro ao conectar Mercado Pago: ${searchParams.get("mp_error")}`}
                                color="red"
                                className="mb-6"
                            />
                        )}

                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Pagamentos</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="border border-brand-border dark:border-dark-border rounded-2xl p-5 bg-white dark:bg-dark-surface flex flex-col justify-between transition-all">
                                <div>
                                    <div className="flex gap-4 items-start">
                                        <img
                                            src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png"
                                            alt="Mercado Pago"
                                            className="w-12 h-12 rounded-xl object-contain shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-[17px] leading-tight">Mercado Pago</span>
                                                {mpConnected ? (
                                                    <Badge variant="green"></Badge>
                                                ) : !hasMinimumPlan(planSlug, "crescer") ? (
                                                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 cursor-pointer" onClick={() => openPlanUpgrade("crescer")}>
                                                        <img src={planStarIconForTarget("crescer")!} alt="" className="w-3.5 h-3.5 object-contain" />
                                                        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Crescer</span>
                                                    </div>
                                                ) : (
                                                    <Badge variant="gray"></Badge>
                                                )}
                                            </div>
                                            <a
                                                href="https://www.mercadopago.com.br"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-brand-blue dark:text-blue-400 hover:underline w-max mt-1 font-medium block"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                mercadopago.com.br
                                            </a>
                                        </div>
                                    </div>
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-4 leading-relaxed font-normal">
                                        Conecte sua conta para receber pagamentos online com split automático. Aceite cartões, PIX e boleto.
                                    </p>
                                </div>

                                <div className="mt-4">
                                    <hr className="my-4 border-brand-border dark:border-dark-border" />
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex justify-start gap-2">
                                            <Button
                                                variant="link"
                                                onClick={() => {
                                                    setKnowMoreStep(0)
                                                    setActiveModal("knowMore")
                                                }}
                                            >
                                                Saber mais
                                            </Button>
                                            {mpConnected && (
                                                <Button
                                                    variant="link"
                                                    onClick={() => setActiveModal("mpConfig")}
                                                >
                                                    Configurar
                                                </Button>
                                            )}
                                        </div>
                                        <Switch
                                            checked={mpConnected}
                                            onCheckedChange={(checked) => {
                                                if (isLoading || isCheckingPlan) return
                                                if (checked) {
                                                    handleConnectClick()
                                                } else {
                                                    setConfirmMpDisconnectOpen(true)
                                                }
                                            }}
                                            className={isLoading || isCheckingPlan ? "opacity-50 cursor-not-allowed" : ""}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <DefaultModal
                            isOpen={activeModal === "mpConfig"}
                            onClose={() => setActiveModal(null)}
                            title="Meios de pagamento aceitos"
                            maxWidth="md"
                        >
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-4">
                                Escolha quais meios de pagamento online seus clientes podem usar no checkout.
                            </p>
                            <div className="space-y-4">
                                {([
                                    { key: "credit_card" as const, label: "Cartão de Crédito", icon: "https://img.dudit.com.br/static/icons/payments/CreditCard.png", description: "Visa, Mastercard, Elo e mais" },
                                    { key: "debit_card" as const, label: "Cartão de Débito", icon: "https://img.dudit.com.br/static/icons/payments/DebitCard.png", description: "Débito online" },
                                    { key: "pix" as const, label: "Pix", icon: "https://img.dudit.com.br/static/icons/payments/Pix.png", description: "Transferência instantânea" },
                                    { key: "boleto" as const, label: "Boleto Bancário", icon: "https://img.dudit.com.br/static/icons/payments/Boleto.png", description: "Pagamento em até 3 dias úteis" },
                                    { key: "mercado_pago_wallet" as const, label: "Saldo Mercado Pago", icon: "https://img.dudit.com.br/static/icons/payments/MercadoPago.png", description: "Saldo MP e parcelamento sem cartão" },
                                ]).map((method, index, arr) => (
                                    <React.Fragment key={method.key}>
                                        <div
                                            className="flex items-center gap-3 py-2 transition-colors"
                                        >
                                            <img
                                                src={method.icon}
                                                alt={method.label}
                                                className="w-8 h-8 object-contain shrink-0 rounded-md"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading block">{method.label}</span>
                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body">{method.description}</span>
                                            </div>
                                            <Switch
                                                checked={acceptedMethods[method.key]}
                                                onCheckedChange={() => handleToggleMethod(method.key)}
                                                className={isSavingMethods === method.key ? "opacity-50 pointer-events-none" : ""}
                                            />
                                        </div>
                                        {index < arr.length - 1 && <hr className="border-brand-border dark:border-dark-border" />}
                                    </React.Fragment>
                                ))}
                            </div>
                        </DefaultModal>

                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 mt-10">Mensagens</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="border border-brand-border dark:border-dark-border rounded-2xl p-5 bg-white dark:bg-dark-surface flex flex-col justify-between transition-all">
                                <div>
                                    <div className="flex gap-4 items-start">
                                        <img
                                            src="https://img.dudit.com.br/static/icons/WhatsApp.png"
                                            alt="WhatsApp"
                                            className="w-12 h-12 rounded-xl object-contain shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-[17px] leading-tight block">
                                                    WhatsApp Business
                                                </span>
                                                {evoStatus === "connected" ? (
                                                    <Badge variant="green"></Badge>
                                                ) : !hasMinimumPlan(planSlug, "escalar") ? (
                                                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 cursor-pointer" onClick={() => openPlanUpgrade("escalar")}>
                                                        <img src={planStarIconForTarget("escalar")!} alt="" className="w-3.5 h-3.5 object-contain" />
                                                        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Escalar</span>
                                                    </div>
                                                ) : (
                                                    <Badge variant="gray"></Badge>
                                                )}
                                            </div>
                                            {evoPhoneNumber ? (
                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 block font-medium">
                                                    {formatBrazilPhone(evoPhoneNumber)}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 block font-medium">
                                                    WhatsApp Business
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-4 leading-relaxed font-normal">
                                        Conecte o número do seu negócio para enviar mensagens automáticas de agendamentos, pedidos e entregas.
                                    </p>
                                </div>
                                <div className="mt-4">
                                    <hr className="my-4 border-brand-border dark:border-dark-border" />
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-start gap-2">
                                            <Button
                                                variant="link"
                                                onClick={() => {
                                                    setWaKnowMoreStep(0)
                                                    setWaActiveModal("knowMore")
                                                }}
                                            >
                                                Saber mais
                                            </Button>
                                            <Button
                                                variant="link"
                                                onClick={() => {
                                                    if (!hasMinimumPlan(planSlug, "escalar")) {
                                                        openPlanUpgrade("escalar")
                                                        return
                                                    }
                                                    setEvoModalOpen(true)
                                                }}
                                            >
                                                Configurar
                                            </Button>
                                        </div>
                                        <Switch
                                            checked={evoStatus === "connected"}
                                            onCheckedChange={(checked) => {
                                                if (evoIsLoading || isCheckingPlan) return
                                                if (checked) {
                                                    if (!hasMinimumPlan(planSlug, "escalar")) {
                                                        openPlanUpgrade("escalar")
                                                        return
                                                    }
                                                    setEvoModalOpen(true)
                                                } else {
                                                    setConfirmEvoDisconnectOpen(true)
                                                }
                                            }}
                                            className={evoIsLoading || isCheckingPlan ? "opacity-50 cursor-not-allowed" : ""}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 mt-10">Logística</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="border border-brand-border dark:border-dark-border rounded-2xl p-5 bg-white dark:bg-dark-surface flex flex-col justify-between transition-all">
                                <div>
                                    <div className="flex gap-4 items-start">
                                        <img
                                            src="https://img.dudit.com.br/static/icons/payments/SuperFrete.png"
                                            alt="SuperFrete"
                                            className="w-12 h-12 rounded-xl object-contain shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-[17px] leading-tight block">
                                                    SuperFrete
                                                </span>
                                                {(sfStatus?.connected || superfreteConnected) ? (
                                                    <Badge variant="green"></Badge>
                                                ) : !hasMinimumPlan(planSlug, "escalar") ? (
                                                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 cursor-pointer" onClick={() => openPlanUpgrade("escalar")}>
                                                        <img src={planStarIconForTarget("escalar")!} alt="" className="w-3.5 h-3.5 object-contain" />
                                                        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Escalar</span>
                                                    </div>
                                                ) : (
                                                    <Badge variant="gray"></Badge>
                                                )}
                                            </div>
                                            {(sfStatus?.email || sfStatus?.balance !== undefined) && (
                                                <div className="mt-1">
                                                    {sfStatus?.email && (
                                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body block font-medium">
                                                            {sfStatus.email}
                                                        </span>
                                                    )}
                                                    {sfStatus?.balance !== undefined && (
                                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body block font-medium">
                                                            Saldo: R$ {Number(sfStatus.balance).toFixed(2)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-4 leading-relaxed font-normal">
                                        Conecte sua conta para gerar etiquetas de frete nacional com Correios, JadLog e mais.
                                    </p>
                                </div>

                                <div className="mt-4">
                                    <hr className="my-4 border-brand-border dark:border-dark-border" />
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex justify-start gap-2">
                                            <Button
                                                variant="link"
                                                onClick={() => {
                                                    setSfActiveTab("connect")
                                                    setActiveModal("superfreteConfig")
                                                }}
                                            >
                                                Saber mais
                                            </Button>
                                            {(sfStatus?.connected || superfreteConnected) && (
                                                <Button
                                                    variant="link"
                                                    onClick={() => {
                                                        setSfActiveTab("settings")
                                                        setActiveModal("superfreteConfig")
                                                    }}
                                                >
                                                    Configurar
                                                </Button>
                                            )}
                                        </div>
                                        <Switch
                                            checked={sfStatus?.connected || superfreteConnected}
                                            onCheckedChange={(checked) => {
                                                if (sfIsLoading || isCheckingPlan) return
                                                if (checked) {
                                                    setSfActiveTab("connect")
                                                    setActiveModal("superfreteConfig")
                                                } else {
                                                    handleSfDisconnect()
                                                }
                                            }}
                                            className={sfIsLoading || isCheckingPlan ? "opacity-50 cursor-not-allowed" : ""}
                                        />
                                        </div>
                                    </div>
                                </div>
                        </div>
                    </div>
                </div>

                {/* SuperFrete Configuration Modal */}
                <DefaultModal
                    isOpen={activeModal === "superfreteConfig"}
                    onClose={() => setActiveModal(null)}
                    title="SuperFrete"
                    maxWidth="lg"
                >
                    <div className="flex gap-4 mb-6 border-b border-brand-border dark:border-dark-border">
                        <button
                            onClick={() => setSfActiveTab("connect")}
                            className={`pb-2 px-1 text-sm font-medium transition-colors ${
                                sfActiveTab === "connect"
                                    ? "text-brand-blue dark:text-blue-400 border-b-2 border-brand-blue dark:border-blue-400"
                                    : "text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:text-dark-heading"
                            }`}
                        >
                            Conectar
                        </button>
                        <button
                            onClick={() => {
                                if (sfStatus?.connected || superfreteConnected) {
                                    setSfActiveTab("settings")
                                }
                            }}
                            className={`pb-2 px-1 text-sm font-medium transition-colors ${
                                sfActiveTab === "settings"
                                    ? "text-brand-blue dark:text-blue-400 border-b-2 border-brand-blue dark:border-blue-400"
                                    : "text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:text-dark-heading"
                            }`}
                            disabled={!(sfStatus?.connected || superfreteConnected)}
                        >
                            Configurações
                        </button>
                    </div>

                    {sfActiveTab === "connect" && (
                        <div className="space-y-4">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                Conecte sua conta SuperFrete informando o token de API gerado em https://sandbox.superfrete.com/#/integrations
                            </p>
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl p-4">
                                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-2">
                                    Como obter o token:
                                </p>
                                <ol className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-decimal list-inside">
                                    <li>Acesse sandbox.superfrete.com/#/integrations</li>
                                    <li>Clique em "Desenvolvedores" → "Integrar"</li>
                                    <li>Copie o token gerado e cole abaixo</li>
                                </ol>
                            </div>
                            <Input
                                label="Token de API SuperFrete"
                                placeholder="Cole seu token aqui..."
                                value={sfTokenInput}
                                onChange={(e) => setSfTokenInput(e.target.value)}
                                variant="full-rounded"
                            />
                            {sfStatus?.balance !== undefined && (
                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/40 rounded-xl p-3">
                                    <p className="text-xs text-green-700 dark:text-green-400">
                                        Saldo atual na carteira: R$ {Number(sfStatus.balance).toFixed(2)}
                                    </p>
                                </div>
                            )}
                            <div className="flex gap-3 pt-2">
                                <Button variant="outline" className="flex-1" onClick={() => setActiveModal(null)}>
                                    Cancelar
                                </Button>
                                <Button
                                    className="flex-1"
                                    disabled={sfIsConnecting || !sfTokenInput.trim()}
                                    isLoading={sfIsConnecting}
                                    onClick={handleSfConnect}
                                >
                                    {sfIsConnecting ? "Conectando..." : "Conectar"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {sfActiveTab === "settings" && (
                        <div className="space-y-4">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                Configure as preferências padrão para geração de etiquetas.
                            </p>

                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="CEP de origem"
                                    placeholder="00000-000"
                                    value={sfOriginCep}
                                    onChange={(e) => setSfOriginCep(e.target.value)}
                                    variant="full-rounded"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Altura (cm)"
                                    type="number"
                                    placeholder="10"
                                    value={sfDefaultHeight}
                                    onChange={(e) => setSfDefaultHeight(e.target.value)}
                                    variant="full-rounded"
                                />
                                <Input
                                    label="Largura (cm)"
                                    type="number"
                                    placeholder="10"
                                    value={sfDefaultWidth}
                                    onChange={(e) => setSfDefaultWidth(e.target.value)}
                                    variant="full-rounded"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Comprimento (cm)"
                                    type="number"
                                    placeholder="10"
                                    value={sfDefaultLength}
                                    onChange={(e) => setSfDefaultLength(e.target.value)}
                                    variant="full-rounded"
                                />
                                <Input
                                    label="Peso (kg)"
                                    type="number"
                                    placeholder="0.5"
                                    value={sfDefaultWeight}
                                    onChange={(e) => setSfDefaultWeight(e.target.value)}
                                    variant="full-rounded"
                                />
                            </div>

                            <Input
                                label="Valor do seguro (R$)"
                                type="number"
                                placeholder="0"
                                value={sfInsuranceValue}
                                onChange={(e) => setSfInsuranceValue(e.target.value)}
                                variant="full-rounded"
                            />
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                Valor declarado da encomenda para seguro. Deixe 0 para desativar.
                            </p>

                            <div className="flex items-center justify-between py-2">
                                <div>
                                    <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                        Mão própria
                                    </span>
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                        Garantir que a encomenda seja entregue apenas ao destinatário autorizado.
                                    </p>
                                </div>
                                <Switch
                                    checked={sfOwnHand}
                                    onCheckedChange={setSfOwnHand}
                                />
                            </div>

                            <div className="flex items-center justify-between py-2">
                                <div>
                                    <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                        Aviso de recebimento
                                    </span>
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                        Solicitar confirmação de recebimento do destinatário.
                                    </p>
                                </div>
                                <Switch
                                    checked={sfReceipt}
                                    onCheckedChange={setSfReceipt}
                                />
                            </div>

                            <div className="border-t border-brand-border dark:border-dark-border pt-4">
                                <p className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-3">
                                    Serviços de frete
                                </p>
                                <div className="space-y-2">
                                    {[
                                        { id: 1 as SuperFreteServiceId, label: "PAC" },
                                        { id: 2 as SuperFreteServiceId, label: "SEDEX" },
                                        { id: 17 as SuperFreteServiceId, label: "Mini Envios" },
                                        { id: 3 as SuperFreteServiceId, label: "JadLog" },
                                        { id: 31 as SuperFreteServiceId, label: "Loggi" },
                                        { id: 33 as SuperFreteServiceId, label: "J&T" },
                                    ].map((svc) => (
                                        <div key={svc.id} className="flex items-center justify-between py-2">
                                            <span className="text-sm text-brand-dark dark:text-dark-heading">
                                                {svc.label}
                                            </span>
                                            <Switch
                                                checked={sfServices.includes(svc.id)}
                                                onCheckedChange={(checked) => {
                                                    if (checked) {
                                                        setSfServices([...sfServices, svc.id])
                                                    } else {
                                                        setSfServices(sfServices.filter((s) => s !== svc.id))
                                                    }
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
                                <Button variant="outline" className="flex-1" onClick={() => setActiveModal(null)}>
                                    Cancelar
                                </Button>
                                <Button
                                    className="flex-1"
                                    onClick={async () => {
                                        const res = await saveSuperFreteConfigAction({
                                            originCep: sfOriginCep,
                                            height: Number(sfDefaultHeight),
                                            width: Number(sfDefaultWidth),
                                            length: Number(sfDefaultLength),
                                            weight: Number(sfDefaultWeight),
                                            insuranceValue: Number(sfInsuranceValue || "0"),
                                            ownHand: sfOwnHand,
                                            receipt: sfReceipt,
                                            services: sfServices,
                                        })
                                        if (res.success) {
                                            toast.success("Configurações salvas!")
                                            if (sfStatus?.webhookConfigured !== true) {
                                                await setupSuperFreteWebhookAction()
                                            }
                                            await fetchSfStatus()
                                            setActiveModal(null)
                                        } else {
                                            toast.error(res.error || "Erro ao salvar configurações")
                                        }
                                    }}
                                >
                                    Salvar
                                </Button>
                            </div>
                        </div>
                    )}
                </DefaultModal>
                <DefaultModal
                    isOpen={waActiveModal === "info"}
                    onClose={() => setWaActiveModal(null)}
                    title="Conectar ao WhatsApp Business"
                    maxWidth="md"
                >
                    <div className="flex flex-col">
                        {/* Header with Icons */}
                        <div className="bg-brand-gray dark:bg-dark-border/50 rounded-2xl p-10 flex items-center justify-center gap-8 mb-8 relative group">
                            <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:-rotate-3">
                                <img src="https://img.dudit.com.br/static/Icon.png" alt="Dudit" className="w-full h-full object-contain" />
                            </div>

                            <div className="flex flex-col items-center gap-1">
                                <div className="w-12 h-6 bg-white dark:bg-dark-surface rounded-full flex items-center justify-center border border-brand-border/50 dark:border-dark-border/50">
                                    <ArrowLeftRightIcon size={14} className="text-brand-dark dark:text-dark-heading" />
                                </div>
                            </div>

                            <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:rotate-3">
                                <img src="https://img.dudit.com.br/static/icons/WhatsApp.png" alt="WhatsApp" className="w-full h-full object-contain" />
                            </div>
                        </div>

                        <div className="px-2 text-center md:text-left">
                            <p className="text-[15px] text-brand-inactive-text dark:text-dark-body mb-2 leading-relaxed">
                                Conecte o número do seu negócio para enviar mensagens automáticas de agendamentos, pedidos, entregas e orçamentos direto para o WhatsApp do cliente.
                            </p>

                            <Button
                                variant="link"
                                onClick={() => {
                                    setWaKnowMoreStep(0)
                                    setWaActiveModal("knowMore")
                                }}
                                className="flex items-center gap-2 mb-4 px-0"
                            >
                                <InfoIcon size={14} />
                                Saber mais sobre essa integração
                            </Button>

                            <div className="flex flex-col md:flex-row gap-3">
                                <Button variant="outline" className="flex-1 h-[46px]" onClick={() => setWaActiveModal(null)}>
                                    Cancelar
                                </Button>
                                <WhatsappConnectButton
                                    className="flex-1 h-[46px]"
                                    planSlug={planSlug}
                                    requiredPlan="escalar"
                                    onSuccess={async () => {
                                        setWaActiveModal(null)
                                        await fetchWaStatus()
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </DefaultModal>

                {/* 2. WhatsApp Know More Modal */}
                <DefaultModal
                    isOpen={waActiveModal === "knowMore"}
                    onClose={() => setWaActiveModal("info")}
                    title="O que é o WhatsApp API?"
                    maxWidth="lg"
                >
                    <div className="flex flex-col min-h-[500px]">
                        <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl flex items-center justify-center relative group">
                            <img src="https://img.dudit.com.br/static/banners/WhatsappLogo.png" alt="" className="w-full h-full object-contain" />
                        </div>

                        <div className="p-8 flex-1 flex flex-col">
                            <div className="mb-8">
                                <div className="flex gap-2">
                                    {[0, 1, 2].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            layout
                                            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= waKnowMoreStep ? "bg-brand-green" : "bg-brand-gray dark:bg-dark-border"
                                                }`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={waKnowMoreStep}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex-1"
                                >
                                    {waKnowMoreStep === 0 && (
                                        <div>
                                            <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-4 leading-tight">
                                                O que é a integração do WhatsApp?
                                            </h3>
                                            <p className="text-md text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                                Envie lembretes de agendamentos, confirmações de pedidos, atualizações de logística e orçamentos automaticamente para seus clientes pelo WhatsApp.
                                            </p>
                                            <p className="text-md text-brand-inactive-text dark:text-dark-body leading-relaxed mt-4">
                                                Com isso, você melhora a comunicação com seu cliente, reduz o no-show em agendamentos e aumenta a conversão de vendas.
                                            </p>
                                        </div>
                                    )}

                                    {waKnowMoreStep === 1 && (
                                        <div>
                                            <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-4 leading-tight">
                                                Como funciona?
                                            </h3>
                                            <p className="text-md text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                                Usamos a API oficial da nuvem do WhatsApp (Meta Cloud API). As mensagens são enviadas de forma instantânea e segura, direto do número oficial do seu negócio.
                                            </p>
                                            <p className="text-md text-brand-inactive-text dark:text-dark-body leading-relaxed mt-4">
                                                Toda a infraestrutura é escalável e gerenciada diretamente pelo provedor oficial, sem riscos de bloqueio por spam de envios manuais.
                                            </p>
                                        </div>
                                    )}

                                    {waKnowMoreStep === 2 && (
                                        <div>
                                            <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-4 leading-tight">
                                                Como configurar?
                                            </h3>
                                            <p className="text-md text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                                Clique em <strong>Conectar WhatsApp</strong> e autorize com sua conta Meta. A Dudit configura tudo automaticamente - você não precisa acessar o painel de desenvolvedor nem copiar tokens.
                                            </p>
                                            <p className="text-md text-brand-inactive-text dark:text-dark-body leading-relaxed mt-4">
                                                Após conectar, sincronize os modelos de mensagem aprovados na sua conta para validar as automações do sistema.
                                            </p>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>

                            <div className="flex flex-col md:flex-row gap-3 mt-8">
                                <Button
                                    variant="outline"
                                    disabled={waKnowMoreStep === 0}
                                    onClick={() => setWaKnowMoreStep(prev => prev - 1)}
                                    className="flex-1 h-[46px]"
                                >
                                    Anterior
                                </Button>

                                {waKnowMoreStep === 2 ? (
                                    <Button
                                        className="flex-1 h-[46px]"
                                        onClick={() => {
                                            if (!hasMinimumPlan(planSlug, "escalar")) {
                                                setWaActiveModal(null)
                                                openPlanUpgrade("escalar")
                                                return
                                            }
                                            setWaActiveModal("info")
                                        }}
                                    >
                                        Entendido
                                    </Button>
                                ) : (
                                    <Button
                                        className="flex-1 h-[46px]"
                                        onClick={() => setWaKnowMoreStep(prev => prev + 1)}
                                    >
                                        Próximo
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </DefaultModal>

                {/* WhatsApp Evolution Modal */}
                <DefaultModal
                    isOpen={evoModalOpen}
                    onClose={handleEvoModalClose}
                    title={evoStatus === "connected" ? "Integração WhatsApp" : "Conectar WhatsApp"}
                    maxWidth="md"
                >
                    {evoConfigured === false && (
                        <div className="text-center py-8">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                Integração Evolution API não disponível. As variáveis de ambiente não estão configuradas no servidor.
                            </p>
                        </div>
                    )}
                    {evoConfigured === null && (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-6 h-6 border-2 border-brand-border border-t-brand-dark rounded-full animate-spin" />
                        </div>
                    )}
                    {evoConfigured === true && (
                        <>
                            {evoStatus === "connected" && (
                                <div className="flex flex-col gap-4">
                                    <ListItem
                                        className="border-none bg-transparent hover:border-none p-0 cursor-default pointer-events-none"
                                        icon={<img src="https://img.dudit.com.br/static/icons/WhatsApp.png" alt="WhatsApp" className="object-contain" />}
                                        title={formatBrazilPhone(evoPhoneNumber || "") || "WhatsApp Conectado"}
                                        description={
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge variant="green">Conectado</Badge>
                                            </div>
                                        }
                                    />
                                    <Button variant="destructive" onClick={() => setConfirmEvoDisconnectOpen(true)} disabled={evoIsLoading} className="w-full h-[42px]">
                                        Desconectar WhatsApp
                                    </Button>
                                </div>
                            )}
                            {(evoStatus === "disconnected" || evoStatus === "error" || evoStatus === "pending") && !evoQrCode && (
                                <div className="flex flex-col items-center text-center">
                                    <IconPlaceholder
                                        icon={QRCodeIcon}
                                        title="WhatsApp Desconectado"
                                        subtitle="Conecte seu WhatsApp para habilitar o envio de notificações e lembretes."
                                        buttons={[{
                                            text: evoIsLoading ? "Conectando..." : "Conectar WhatsApp",
                                            action: handleEvoConnect,
                                            disabled: evoIsLoading,
                                            className: "w-full max-w-xs"
                                        }]}
                                    />
                                </div>
                            )}
                            {((evoStatus === "qr_pending" || evoStatus === "connecting") || evoQrCode) && evoStatus !== "connected" && (
                                <div className="flex flex-col items-center text-center">
                                    <IconPlaceholder
                                        icon={QRCodeIcon}
                                        title="Escaneie o QR Code"
                                        subtitle="Abra o WhatsApp > Aparelhos Conectados > Conectar um Aparelho"
                                    />
                                    {evoQrCode ? (
                                        <div className="mt-6 bg-white p-4 rounded-2xl">
                                            <img
                                                src={evoQrCode.startsWith("data:") ? evoQrCode : `data:image/png;base64,${evoQrCode}`}
                                                alt="QR Code"
                                                className="w-56 h-56 object-contain mx-auto"
                                            />
                                        </div>
                                    ) : (
                                        <div className="mt-8 flex flex-col items-center justify-center gap-3 py-8">
                                            <div className="w-8 h-8 border-2 border-brand-border border-t-brand-dark rounded-full animate-spin" />
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">Gerando QR Code...</p>
                                        </div>
                                    )}
                                    <div className="flex gap-3 mt-6 w-full max-w-xs justify-center">
                                        <Button variant="outline" onClick={handleEvoCancel} disabled={evoIsLoading} className="flex-1 h-12">
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleEvoConnect} disabled={evoIsLoading} className="flex-1 h-12">
                                            Regerar QR
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </DefaultModal>

                {/* 1. Connection Info Modal */}
                <DefaultModal
                    isOpen={activeModal === "info"}
                    onClose={() => setActiveModal(null)}
                    title="Conectar ao Mercado Pago"
                    maxWidth="md"
                >
                    <div className="flex flex-col">
                        {/* Header with Icons */}
                        <div className="bg-brand-gray dark:bg-dark-border/50 rounded-2xl p-10 flex items-center justify-center gap-8 mb-8 relative group">
                            <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:-rotate-3">
                                <img src="https://img.dudit.com.br/static/Icon.png" alt="Dudit" className="w-full h-full object-contain" />
                            </div>

                            <div className="flex flex-col items-center gap-1">
                                <div className="w-12 h-6 bg-white dark:bg-dark-surface rounded-full flex items-center justify-center border border-brand-border/50 dark:border-dark-border/50">
                                    <ArrowLeftRightIcon size={14} className="text-brand-dark dark:text-dark-heading" />
                                </div>
                            </div>

                            <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:rotate-3">
                                <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-full h-full object-contain" />
                            </div>
                        </div>

                        <div className="px-2 text-center md:text-left">
                            <p className="text-[15px] text-brand-inactive-text dark:text-dark-body mb-2 leading-relaxed">
                                Venda de forma profissional aceitando as principais formas de pagamento do mercado com integração automática.
                            </p>

                            <Button
                                variant="link"
                                onClick={() => {
                                    setKnowMoreStep(0)
                                    setActiveModal("knowMore")
                                }}
                                className="flex items-center gap-2 mb-4 px-0"
                            >
                                <InfoIcon size={14} />
                                Saber mais sobre essa integração
                            </Button>

                            <div className="flex flex-col md:flex-row gap-3">
                                <Button variant="outline" className="flex-1 h-[46px]" onClick={() => setActiveModal(null)}>
                                    Cancelar
                                </Button>
                                <Button
                                    className="flex-1 h-[46px]"
                                    onClick={() => {
                                        if (!hasMinimumPlan(planSlug, "crescer")) {
                                            setActiveModal(null)
                                            openPlanUpgrade("crescer")
                                            return
                                        }
                                        setActiveModal("permissions")
                                    }}
                                >
                                    Conectar agora
                                </Button>
                            </div>
                        </div>
                    </div>
                </DefaultModal>

                {/* 2. Know More Modal (Multi-step) */}
                <DefaultModal
                    isOpen={activeModal === "knowMore"}
                    onClose={() => setActiveModal("info")}
                    title="O que é o Mercado Pago?"
                    maxWidth="lg"
                >
                    <div className="flex flex-col min-h-[500px]">
                        {/* Banner */}
                        <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl flex items-center justify-center relative group">
                            <img src="https://img.dudit.com.br/static/banners/MercadoPago.png" alt="" className="w-full h-full object-contain" />
                        </div>

                        <div className="p-8 flex-1 flex flex-col">
                            <div className="mb-8">
                                <div className="flex gap-2">
                                    {KNOW_MORE_STEPS.map((_, i) => (
                                        <motion.div
                                            key={i}
                                            layout
                                            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= knowMoreStep ? "bg-brand-green" : "bg-brand-gray dark:bg-dark-border"
                                                }`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={knowMoreStep}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex-1"
                                >
                                    <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-4 leading-tight">
                                        {KNOW_MORE_STEPS[knowMoreStep].title}
                                    </h3>

                                    {KNOW_MORE_STEPS[knowMoreStep].description && (
                                        <p className="text-md text-brand-inactive-text dark:text-dark-body leading-relaxed whitespace-pre-wrap">
                                            {KNOW_MORE_STEPS[knowMoreStep].description}
                                        </p>
                                    )}

                                    {KNOW_MORE_STEPS[knowMoreStep].list && (
                                        <ul className="space-y-4 mt-6">
                                            {KNOW_MORE_STEPS[knowMoreStep].list.map((item, i) => (
                                                <li key={i} className="flex items-start gap-3 text-md text-brand-inactive-text dark:text-dark-body">
                                                    <span className="flex shrink-0 items-center justify-center text-md">
                                                        ●
                                                    </span>
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </motion.div>
                            </AnimatePresence>

                            <div className="flex flex-col md:flex-row gap-3 mt-8">
                                <Button
                                    variant="outline"
                                    disabled={knowMoreStep === 0}
                                    onClick={() => setKnowMoreStep(prev => prev - 1)}
                                    className="flex-1 h-[46px]"
                                >
                                    Anterior
                                </Button>

                                {knowMoreStep === KNOW_MORE_STEPS.length - 1 ? (
                                    <Button
                                        className="flex-1 h-[46px]"
                                        onClick={() => {
                                            if (!hasMinimumPlan(planSlug, "crescer")) {
                                                setActiveModal(null)
                                                openPlanUpgrade("crescer")
                                                return
                                            }
                                            setActiveModal("info")
                                        }}
                                    >
                                        Entendido
                                    </Button>
                                ) : (
                                    <Button
                                        className="flex-1 h-[46px]"
                                        onClick={() => setKnowMoreStep(prev => prev + 1)}
                                    >
                                        Próximo
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </DefaultModal>

                {/* 3. Permissions Modal */}
                <DefaultModal
                    isOpen={activeModal === "permissions"}
                    onClose={() => setActiveModal("info")}
                    title="Permissões do Aplicativo"
                    maxWidth="lg"
                >
                    <div className="flex flex-col">
                        <div className="bg-brand-gray dark:bg-dark-border/50 rounded-2xl flex items-center justify-center relative group">
                            <img src="https://img.dudit.com.br/static/banners/MercadoPago.png" alt="" className="w-full h-full object-contain" />
                        </div>

                        <div className="p-8">

                            <div className="space-y-6 mb-8">
                                <InfoCard
                                    message="Antes de instalar, é importante dar uma olhada nas permissões do aplicativo e concordar com elas para ativar na sua loja."
                                    color="green"
                                />
                                <div className="flex flex-col gap-6">
                                    <div className="space-y-2">
                                        <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Sobre os dados da sua loja</h4>
                                        <p className="text-[14px] text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                            O aplicativo terá acesso apenas para leitura dos seus produtos e categorias (ou seja, não poderá alterar essas informações).
                                        </p>
                                        <p className="text-[14px] text-brand-inactive-text dark:text-dark-body leading-relaxed mt-2">
                                            Também poderá gerenciar dados relacionados a fornecedores e transações de pagamento.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Sobre os dados dos seus clientes</h4>
                                        <p className="text-[14px] text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                            O app poderá criar, editar e excluir informações de vendas na sua loja.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Outras permissões</h4>
                                        <p className="text-[14px] text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                            Pode adicionar componentes em JavaScript para melhorar o funcionamento da sua loja.
                                        </p>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-brand-border dark:border-dark-border">
                                    <p className="text-[13px] text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                        Ao conectar, você concorda com a{" "}
                                        <a
                                            href="https://www.mercadopago.com.br/privacidade"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-brand-green font-bold hover:underline"
                                        >
                                            política de privacidade do aplicativo
                                        </a>. Se quiser, pode desconectar o aplicativo a qualquer momento.
                                    </p>
                                    <InfoCard
                                        message="Importante: a plataforma não é responsável pelo funcionamento do aplicativo, então é sempre bom avaliar antes de instalar, ok?"
                                        color="orange"
                                        className="mt-4"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col-reverse md:flex-row gap-3">
                                <Button variant="outline" className="flex-1 h-[46px]" onClick={() => setActiveModal("info")}>
                                    Cancelar
                                </Button>
                                <Button
                                    className="flex-1 h-[46px]"
                                    onClick={handleStartOAuth}
                                    isLoading={isLoading}
                                >
                                    Aceitar e Conectar
                                </Button>
                            </div>
                        </div>
                    </div>
                </DefaultModal>

                {/* Confirm Disconnect WhatsApp Evolution */}
                <AlertModal
                    isOpen={confirmEvoDisconnectOpen}
                    onClose={() => setConfirmEvoDisconnectOpen(false)}
                    onConfirm={() => {
                        setConfirmEvoDisconnectOpen(false)
                        handleEvoDisconnect()
                    }}
                    title="Desconectar WhatsApp"
                    message="Tem certeza que deseja desconectar o WhatsApp (Evolution)?"
                    confirmText="Desconectar"
                    variant="danger"
                    isDestructive
                />

                {/* Confirm Disconnect WhatsApp */}
                <AlertModal
                    isOpen={confirmWaDisconnectOpen}
                    onClose={() => setConfirmWaDisconnectOpen(false)}
                    onConfirm={() => {
                        setConfirmWaDisconnectOpen(false)
                        handleDisconnectWa()
                    }}
                    title="Desconectar WhatsApp"
                    message="Tem certeza que deseja desconectar o WhatsApp? Suas mensagens automáticas deixarão de ser enviadas."
                    confirmText="Desconectar"
                    variant="danger"
                    isDestructive
                />

                {/* Confirm Disconnect Mercado Pago */}
                <AlertModal
                    isOpen={confirmMpDisconnectOpen}
                    onClose={() => setConfirmMpDisconnectOpen(false)}
                    onConfirm={() => {
                        setConfirmMpDisconnectOpen(false)
                        handleDisconnect()
                    }}
                    title="Desconectar Mercado Pago"
                    message="Tem certeza que deseja desconectar sua conta do Mercado Pago? Você não poderá mais receber pagamentos online."
                    confirmText="Desconectar"
                    variant="danger"
                    isDestructive
                />

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                    <Button
                        variant="outline"
                        onClick={handleBack}
                        className="flex-1 h-12"
                    >
                        Voltar
                    </Button>
                </div>
            </div>

            <SavingStatusModal isOpen={isSavingMethods !== null || isLoading} text="Salvando configurações..." />
        </FadeIn>
    )
}
