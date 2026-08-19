"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { Button, Badge, DefaultModal, AlertModal, InfoCard, Input } from "@/components/reusable"
import Portal from "@/components/Portal"
import {
    CheckCircleIcon,
    ChevronLeftIcon,
    AlertTriangleIcon,
    XIcon,
} from "@/lib/icons"
import {
    Zap,
    Loader2,
    ArrowUpRight,
    ShieldCheck,
    QrCode,
} from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "@/hooks/use-notification"
import {
    listPlansAction,
    getSubscriptionStatusAction,
    createSubscriptionAction,
    cancelSubscriptionAction,
    upgradeSubscriptionAction,
} from "@/app/actions/erp/subscriptions"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getHardcodedPlan } from "@/lib/subscription/feature-labels"
import { BillingPage } from "@/components/billing/BillingPage"

// ─── Plan Card ─────────────────────────────────────────────────────────────

interface PlanCardProps {
    name: string
    slug: string
    objective: string
    price: number
    features: string[]
    limits: string[]
    popular: boolean
    isCurrent: boolean
    isDowngrade: boolean
    isLoading: boolean
    billingCycle: "monthly" | "annually"
    onAction: () => void
}

const PlanCard: React.FC<PlanCardProps> = ({
    name,
    slug,
    objective,
    price,
    features,
    limits,
    popular,
    isCurrent,
    isDowngrade,
    isLoading,
    billingCycle,
    onAction,
}) => {
    // Calculate display price
    const displayPrice = billingCycle === "annually" ? price * 0.8 : price
    const showTwelveInstallments = billingCycle === "annually" && price > 0

    // Dynamic features header
    let featuresHeader = "Itens inclusos"
    if (slug === "crescer") featuresHeader = "Tudo do Começar e mais:"
    else if (slug === "escalar") featuresHeader = "Tudo do Crescer e mais:"
    else if (slug === "profissional") featuresHeader = "Tudo do Escalar e mais:"

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`rounded-3xl p-6 flex flex-col h-full relative transition-all duration-300 bg-white dark:bg-dark-surface ${popular
                ? "border-2 border-brand-green z-10"
                : "border border-brand-border dark:border-dark-border"
                }`}
        >
            {popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-green text-white text-xs font-bold py-1.5 px-4 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                    Mais popular
                </div>
            )}

            {/* Header */}
            <div className="mb-6 pt-2">
                <h3 className="text-brand-inactive-text dark:text-dark-body text-md font-medium mb-1">
                    {name}
                </h3>

                <div className="mb-4">
                    {showTwelveInstallments && <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">12x de</span>}
                    <div className="flex items-baseline gap-1 mt-1">
                        <span className={`${price > 0 ? "text-2xl" : "text-xl"} font-bold text-brand-dark dark:text-dark-heading`}>
                            {price > 0 ? formatCurrency(displayPrice) : "Grátis"}
                        </span>
                        {price > 0 && <span className="text-sm text-brand-inactive-text">/mês</span>}
                    </div>
                </div>

                <Button
                    variant={popular ? "default" : "outline"}
                    className="w-full h-12"
                    onClick={onAction}
                    disabled={isLoading || isCurrent}
                >
                    {isLoading ? (
                        <Loader2 size={18} className="animate-spin mr-2" />
                    ) : isCurrent ? (
                        "Plano Atual"
                    ) : isDowngrade ? (
                        "Fazer downgrade"
                    ) : price === 0 ? (
                        "Começar"
                    ) : (
                        "Assinar"
                    )}
                </Button>

                <p className="text-center text-xs text-brand-inactive-text mt-3">
                    Cancele quando quiser
                </p>
            </div>

            <div className="w-full h-px bg-brand-border dark:bg-dark-border mb-6" />

            {/* Features */}
            <div className="flex-1 space-y-6">
                <div>
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">{featuresHeader}</p>
                    <ul className="space-y-3.5">
                        {features.map((feature, i) => (
                            <li key={`feat-${i}`} className="flex items-start gap-3 text-sm">
                                <CheckCircleIcon size={16} className="text-brand-green mt-0.5 shrink-0" />
                                <span className="text-brand-dark/80 dark:text-dark-body">{feature}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Limits at the bottom */}
            <div className="mt-8 pt-6 border-t border-brand-border dark:border-dark-border">
                <ul className="space-y-2.5">
                    {limits.map((limit, i) => (
                        <li key={`limit-${i}`} className="flex items-center gap-2.5 text-xs">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-green/40 shrink-0" />
                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">{limit}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </motion.div>
    )
}

// ─── Skeleton ──────────────────────────────────────────────────────────────

const PlanCardSkeleton = () => (
    <div className="rounded-3xl p-8 border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-4" />
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-8" />
        <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
                <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            ))}
        </div>
        <div className="h-11 bg-gray-200 dark:bg-gray-700 rounded-lg mt-10" />
    </div>
)

// ─── Billing Toggle ────────────────────────────────────────────────────────

const BillingToggle = ({ value, onChange }: { value: "monthly" | "annually", onChange: (v: "monthly" | "annually") => void }) => (
    <div className="flex justify-center mb-8">
        <div className="bg-brand-gray dark:bg-dark-surface p-1 rounded-2xl border border-brand-border dark:border-dark-border flex items-center">
            <button
                type="button"
                onClick={() => onChange("monthly")}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${value === "monthly"
                    ? "bg-white dark:bg-zinc-800 text-brand-dark dark:text-dark-heading"
                    : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
                    }`}
            >
                Mensal
            </button>
            <button
                type="button"
                onClick={() => onChange("annually")}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 flex items-center gap-2 ${value === "annually"
                    ? "bg-white dark:bg-zinc-800 text-brand-dark dark:text-dark-heading"
                    : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
                    }`}
            >
                Anual
                <span className="bg-brand-green/10 text-brand-green text-[10px] px-2 py-0.5 rounded-full font-extrabold">
                    20% OFF
                </span>
            </button>
        </div>
    </div>
)

// ─── Main Component ────────────────────────────────────────────────────────

interface SubscriptionData {
    plan: {
        id: string
        name: string
        slug: string
        price: number
        limits: Record<string, any>
        features: string[]
    }
    subscription: {
        id: string
        status: string
        billing_email: string | null
        current_period_start: string | null
        current_period_end: string | null
        cancel_at_period_end: boolean
        pending_plan_id: string | null
        trial_end: string | null
        payment_provider: string
        next_payment_date?: string | null
    } | null
    next_invoice?: {
        purchase_id: string | null
        invoice_id: string | null
        invoice_number: string | null
        due_date: string | null
        period_start: string | null
        period_end: string | null
        amount: number
        status: string | null
    } | null
    usage: Record<string, number>
    partner_id?: string
}

export const SubscriptionSubPage = ({ partnerId, onBack }: { partnerId?: string; onBack: () => void }) => {
    const [plans, setPlans] = useState<any[]>([])
    const [subData, setSubData] = useState<SubscriptionData | null>(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const effectivePartnerId = partnerId || subData?.partner_id

    // Wrapper state for Upgrade Plan
    const [plansOpen, setPlansOpen] = useState(false)
    const [plansVisible, setPlansVisible] = useState(false)
    const [plansAnimating, setPlansAnimating] = useState(false)

    useEffect(() => {
        if (plansOpen) {
            setPlansVisible(true)
            const id = setTimeout(() => setPlansAnimating(true), 50)
            return () => clearTimeout(id)
        }
        setPlansAnimating(false)
        const id = setTimeout(() => setPlansVisible(false), 200)
        return () => clearTimeout(id)
    }, [plansOpen])

    // Modal states
    const [subscribeModal, setSubscribeModal] = useState<{ open: boolean; planId: string; planName: string }>({
        open: false,
        planId: "",
        planName: "",
    })
    const [billingEmail, setBillingEmail] = useState("")
    const [emailError, setEmailError] = useState("")

    const [downgradeModal, setDowngradeModal] = useState<{ open: boolean; planId: string; planName: string }>({
        open: false,
        planId: "",
        planName: "",
    })

    const [cancelModal, setCancelModal] = useState(false)
    const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
    const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">("annually")

    // Manual payment modal for past_due subscriptions
    const [manualPaymentModal, setManualPaymentModal] = useState<{
        open: boolean
        loading: boolean
        paymentId: string | null
        pixQrCode: string | null
        pixQrCodeBase64: string | null
        ticketUrl: string | null
        amount: number
        error: string | null
        polling: boolean
    }>({
        open: false,
        loading: false,
        paymentId: null,
        pixQrCode: null,
        pixQrCodeBase64: null,
        ticketUrl: null,
        amount: 0,
        error: null,
        polling: false,
    })

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleBack = useCallback(() => onBack(), [onBack])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    // ─── Load Data ─────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [plansRes, statusRes] = await Promise.all([
                listPlansAction(),
                getSubscriptionStatusAction(),
            ])

            if (plansRes.success && plansRes.data) {
                // Sort by sort_order
                const sorted = [...plansRes.data].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                setPlans(sorted)
            }

            if (statusRes.success && statusRes.data) {
                setSubData(statusRes.data)
                // Pre-fill billing email
                if (statusRes.data.subscription?.billing_email) {
                    setBillingEmail(statusRes.data.subscription.billing_email)
                }
            }
        } catch {
            toast.error("Erro ao carregar dados do plano")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    // ─── Handlers ──────────────────────────────────────────────────────────

    const handlePlanAction = (plan: any) => {
        if (!subData) return
        const currentPlan = subData.plan
        const isCurrentPlan = currentPlan.id === plan.id

        if (isCurrentPlan) return

        const hasActiveSub = subData.subscription &&
            ["active", "trialing", "past_due"].includes(subData.subscription.status)

        if (!hasActiveSub || currentPlan.slug === "free") {
            // No active paid subscription: new subscription flow
            setSubscribeModal({ open: true, planId: plan.id, planName: plan.name })
        } else {
            // Has active subscription: upgrade or downgrade
            const currentPrice = currentPlan.price
            const newPrice = plan.price

            if (newPrice > currentPrice) {
                // Upgrade - go through subscribe modal for new MP preapproval
                setSubscribeModal({ open: true, planId: plan.id, planName: plan.name })
            } else {
                // Downgrade - confirm scheduling
                setDowngradeModal({ open: true, planId: plan.id, planName: plan.name })
            }
        }
    }

    const handleSubscribe = async () => {
        const email = billingEmail.trim().toLowerCase()
        if (!email || !email.includes("@") || !email.includes(".")) {
            setEmailError("Por favor, informe um email válido.")
            return
        }
        setEmailError("")
        setActionLoading(subscribeModal.planId)

        try {
            const hasActiveSub = subData?.subscription &&
                ["active", "trialing", "past_due"].includes(subData.subscription.status) &&
                subData.plan.slug !== "free"

            let result

            if (hasActiveSub) {
                // Upgrade flow
                result = await upgradeSubscriptionAction(subscribeModal.planId)
            } else {
                // New subscription flow
                result = await createSubscriptionAction(subscribeModal.planId, email)
            }

            if (!result.success) {
                toast.error(result.error)
                return
            }

            const data = result.data

            // If there's an initPoint (MP payment link), redirect
            if (data?.initPoint) {
                toast.success("Redirecionando para o pagamento...")
                window.location.href = data.initPoint
                return
            }

            // Free plan or direct activation
            toast.success(data?.message || "Plano ativado com sucesso!")
            setSubscribeModal({ open: false, planId: "", planName: "" })
            loadData()
        } catch {
            toast.error("Erro inesperado. Tente novamente.")
        } finally {
            setActionLoading(null)
        }
    }

    const handleDowngrade = async () => {
        setActionLoading(downgradeModal.planId)

        try {
            const result = await upgradeSubscriptionAction(downgradeModal.planId)

            if (!result.success) {
                toast.error(result.error)
                return
            }

            toast.success(result.data?.message || "Downgrade agendado para o próximo ciclo.")
            setDowngradeModal({ open: false, planId: "", planName: "" })
            loadData()
        } catch {
            toast.error("Erro inesperado. Tente novamente.")
        } finally {
            setActionLoading(null)
        }
    }

    const handleCancel = async () => {
        setActionLoading("cancel")

        try {
            const result = await cancelSubscriptionAction()

            if (!result.success) {
                toast.error(result.error)
                return
            }

            toast.success(result.data?.message || "Assinatura cancelada com sucesso.")
            setCancelModal(false)
            setCancelConfirmOpen(false)
            loadData()
        } catch {
            toast.error("Erro inesperado. Tente novamente.")
        } finally {
            setActionLoading(null)
        }
    }

    // ─── Manual Payment for Past Due ──────────────────────────────────────────
    const handleGenerateManualPayment = async () => {
        if (!subData?.subscription?.id) return

        setManualPaymentModal({
            open: true,
            loading: true,
            paymentId: null,
            pixQrCode: null,
            pixQrCodeBase64: null,
            ticketUrl: null,
            amount: currentPlanPrice,
            error: null,
            polling: false,
        })

        try {
            const response = await fetch(`/api/billing/subscriptions/${subData.subscription.id}/manual-payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            })

            const data = await response.json()

            if (!response.ok || !data.success) {
                throw new Error(data.error || "Erro ao gerar pagamento")
            }

            setManualPaymentModal((prev) => ({
                ...prev,
                loading: false,
                paymentId: data.paymentId,
                pixQrCode: data.pix?.qrCode || null,
                pixQrCodeBase64: data.pix?.qrCodeBase64 || null,
                ticketUrl: data.pix?.ticketUrl || null,
                amount: data.amount,
                polling: true,
            }))

            // Start polling for payment status
            startPaymentPolling(data.paymentId)

        } catch (err: any) {
            setManualPaymentModal((prev) => ({
                ...prev,
                loading: false,
                error: err.message || "Erro ao gerar pagamento. Tente novamente.",
            }))
        }
    }

    const startPaymentPolling = (paymentId: string) => {
        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/mercadopago/subscription-payment/${paymentId}`)
                const data = await response.json()

                if (data.success && data.status === "approved") {
                    clearInterval(pollInterval)
                    setManualPaymentModal((prev) => ({ ...prev, polling: false }))
                    toast.success("Pagamento aprovado! Assinatura reativada.")
                    loadData()
                } else if (data.success && ["rejected", "cancelled", "expired"].includes(data.status)) {
                    clearInterval(pollInterval)
                    setManualPaymentModal((prev) => ({
                        ...prev,
                        polling: false,
                        error: `Pagamento ${data.status === "rejected" ? "recusado" : "cancelado"}. Tente novamente.`,
                    }))
                }
            } catch {
                // Ignore polling errors
            }
        }, 5000)

        // Stop polling after 15 minutes
        setTimeout(() => clearInterval(pollInterval), 15 * 60 * 1000)

        // Cleanup on modal close
        const originalClose = setManualPaymentModal
        setManualPaymentModal((prev) => {
            if (!prev.open && prev.polling) {
                clearInterval(pollInterval)
            }
            return prev
        })
    }

    const closeManualPaymentModal = () => {
        setManualPaymentModal({
            open: false,
            loading: false,
            paymentId: null,
            pixQrCode: null,
            pixQrCodeBase64: null,
            ticketUrl: null,
            amount: 0,
            error: null,
            polling: false,
        })
    }

    // ─── Render ────────────────────────────────────────────────────────────

    const currentPlanSlug = subData?.plan?.slug || "free"
    const currentPlanPrice = subData?.plan?.price ?? 0
    const hasActivePaidSub = subData?.subscription &&
        ["active", "trialing", "past_due"].includes(subData.subscription.status) &&
        currentPlanSlug !== "free"

    const nextInvoice = subData?.next_invoice ?? null
    const nextInvoiceDate = nextInvoice?.due_date
        ?? subData?.subscription?.next_payment_date
        ?? subData?.subscription?.current_period_end
        ?? (subData?.subscription?.status === "trialing" ? subData.subscription.trial_end : null)

    const nextInvoiceStatusVariant = (status: string | null | undefined): "green" | "orange" | "red" | "gray" => {
        if (status === "completed" || status === "approved") return "green"
        if (status === "pending" || status === "processing") return "orange"
        if (status === "failed" || status === "rejected" || status === "cancelled") return "red"
        return "gray"
    }

    const nextInvoiceStatusLabel = (status: string | null | undefined) => {
        if (status === "completed") return "Paga"
        if (status === "pending") return "Pendente"
        if (status === "processing") return "Processando"
        if (status === "failed") return "Falhou"
        if (status === "cancelled") return "Cancelada"
        return null
    }

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="truncate">Minha Assinatura</span>
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        Gerencie seu plano atual e acompanhe o histórico de faturas.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">

                        {/* Top 2 Cards: Current Plan & Next Invoices (Equal Size & Side-by-Side) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10 items-stretch">

                            {/* Card 1: Current Plan */}
                            <div className="rounded-3xl p-6 md:p-8 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border flex flex-col justify-between relative">
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                            Plano atual
                                        </span>
                                        {subData?.subscription?.status === "active" && (
                                            <span className="bg-brand-green/10 text-brand-green text-xs font-bold px-3 py-1 rounded-full">
                                                Ativo
                                            </span>
                                        )}
                                        {subData?.subscription?.status === "past_due" && (
                                            <span className="bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-xs font-bold px-3 py-1 rounded-full">
                                                Atrasado
                                            </span>
                                        )}
                                        {subData?.subscription?.status === "trialing" && (
                                            <span className="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 text-xs font-bold px-3 py-1 rounded-full">
                                                Trial
                                            </span>
                                        )}
                                    </div>

                                    <h2 className="text-2xl md:text-3xl font-extrabold text-brand-dark dark:text-dark-heading mb-2">
                                        {subData ? `Plano ${getHardcodedPlan(subData.plan.slug).name}` : "Carregando..."}
                                    </h2>

                                    <p className="text-xs md:text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed mb-6">
                                        {subData ? getHardcodedPlan(subData.plan.slug).objective || "Recursos essenciais para gerenciar e impulsionar seu negócio." : "..."}
                                    </p>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-brand-border dark:border-dark-border mt-auto">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-2xl md:text-3xl font-extrabold text-brand-dark dark:text-dark-heading">
                                            {subData ? (currentPlanPrice > 0 ? formatCurrency(currentPlanPrice) : "Grátis") : "..."}
                                        </span>
                                        {currentPlanPrice > 0 && (
                                            <span className="text-xs text-brand-inactive-text font-normal">/mês</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {hasActivePaidSub && !subData?.subscription?.cancel_at_period_end && (
                                            <>
                                                {subData?.subscription?.status === "past_due" && (
                                                    <Button
                                                        variant="default"
                                                        className="bg-red-500 text-white hover:bg-red-600 text-xs md:text-sm h-11 px-4 font-semibold"
                                                        onClick={handleGenerateManualPayment}
                                                        disabled={manualPaymentModal.loading}
                                                    >
                                                        {manualPaymentModal.loading ? (
                                                            <>
                                                                <Loader2 size={16} className="animate-spin mr-2" />
                                                                Gerando PIX...
                                                            </>
                                                        ) : (
                                                            "Pagar fatura atrasada"
                                                        )}
                                                    </Button>
                                                )}
                                                {subData?.subscription?.status !== "past_due" && (
                                                    <Button
                                                        variant="outline"
                                                        className="text-red-500 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20 text-xs md:text-sm h-11 px-4 font-semibold"
                                                        onClick={() => setCancelModal(true)}
                                                    >
                                                        Cancelar Plano
                                                    </Button>
                                                )}
                                            </>
                                        )}

                                        <Button
                                            variant="default"
                                            className="bg-brand-green text-white hover:bg-brand-green/90 text-xs md:text-sm font-bold h-11 px-6"
                                            onClick={() => setPlansOpen(true)}
                                        >
                                            Alterar Plano
                                        </Button>
                                    </div>
                                </div>

                                {nextInvoiceDate && hasActivePaidSub && (
                                    <div className="mt-5 pt-4 border-t border-brand-border dark:border-dark-border flex items-center justify-between text-xs md:text-sm">
                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">
                                            {subData?.subscription?.cancel_at_period_end ? "Acesso até" : "Renova em"}
                                        </span>
                                        <span className={`font-bold ${subData?.subscription?.cancel_at_period_end ? "text-red-500" : "text-brand-dark dark:text-dark-heading"}`}>
                                            {formatDate(nextInvoiceDate)}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Card 2: Próxima Fatura */}
                            <div className="rounded-3xl p-6 md:p-8 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border flex flex-col justify-between relative">
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                            Próxima fatura
                                        </span>
                                        {nextInvoiceStatusLabel(nextInvoice?.status) && (
                                            <Badge variant={nextInvoiceStatusVariant(nextInvoice?.status)}>
                                                {nextInvoiceStatusLabel(nextInvoice?.status)}
                                            </Badge>
                                        )}
                                    </div>

                                    <h2 className="text-3xl md:text-4xl font-extrabold text-brand-dark dark:text-dark-heading mb-6">
                                        {subData ? (currentPlanPrice > 0 ? formatCurrency(nextInvoice?.amount ?? currentPlanPrice) : "R$ 0,00") : "..."}
                                    </h2>
                                </div>

                                <div className="space-y-3 pt-6 border-t border-brand-border dark:border-dark-border mt-auto">
                                    <div className="flex items-center justify-between text-xs md:text-sm">
                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Fatura</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                            {nextInvoice?.invoice_number || "A gerar"}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between text-xs md:text-sm">
                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Plano</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                            {subData ? `Plano ${getHardcodedPlan(subData.plan.slug).name}` : "-"}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between text-xs md:text-sm">
                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Vencimento</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                            {nextInvoiceDate ? formatDate(nextInvoiceDate) : "-"}
                                        </span>
                                    </div>

                                    {subData?.subscription?.cancel_at_period_end && nextInvoiceDate && (
                                        <div className="flex items-center justify-between text-xs md:text-sm">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Acesso até</span>
                                            <span className="font-bold text-red-500">
                                                {formatDate(nextInvoiceDate)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Billing History Section */}
                        <div className="mb-10">
                            <h3 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading mb-4 px-1">
                                Histórico de Faturas
                            </h3>
                            <BillingPage initialPartnerId={effectivePartnerId} showTitle={false} />
                        </div>
                    </div>
                </div>

                {/* ─── Upgrade Plan Wrapper (full-screen, like print modals) ─── */}
                {plansVisible && (
                    <Portal>
                        <div
                            className={`fixed inset-0 z-[130] flex flex-col bg-black/60 transition-opacity duration-200 ${plansAnimating ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                        >
                            <div className="relative flex flex-col w-full h-full bg-white dark:bg-dark-background">
                                {/* Header */}
                                <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                                    <h2 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading">
                                        Planos de Assinatura
                                    </h2>
                                    <Button variant="filled" onClick={() => setPlansOpen(false)} className="w-10 h-10 p-0 flex items-center justify-center shrink-0">
                                        <XIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Content */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    <div className="px-4 md:px-6 py-6 max-w-[1300px] mx-auto">
                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body text-center mb-6">
                                            Escolha o plano ideal para as necessidades do seu negócio. Cancele ou altere a qualquer momento.
                                        </p>

                                        {/* Billing Toggle */}
                                        <BillingToggle value={billingCycle} onChange={setBillingCycle} />

                                        {/* Plans Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch my-6">
                                            {loading ? (
                                                <>
                                                    <PlanCardSkeleton />
                                                    <PlanCardSkeleton />
                                                    <PlanCardSkeleton />
                                                </>
                                            ) : (
                                                plans.map((plan) => {
                                                    const isCurrent = subData?.plan?.id === plan.id
                                                    const isDowngrade = plan.price < currentPlanPrice && currentPlanSlug !== "free"
                                                    const isPopular = plan.slug === "crescer"

                                                    return (
                                                        <PlanCard
                                                            key={plan.id}
                                                            slug={plan.slug}
                                                            name={getHardcodedPlan(plan.slug).name}
                                                            objective={getHardcodedPlan(plan.slug).objective}
                                                            price={plan.price}
                                                            features={getHardcodedPlan(plan.slug).features}
                                                            limits={getHardcodedPlan(plan.slug).limits}
                                                            popular={isPopular}
                                                            isCurrent={isCurrent}
                                                            isDowngrade={isDowngrade}
                                                            isLoading={actionLoading === plan.id}
                                                            billingCycle={billingCycle}
                                                            onAction={() => {
                                                                setPlansOpen(false)
                                                                handlePlanAction(plan)
                                                            }}
                                                        />
                                                    )
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Portal>
                )}

                {/* ─── Subscribe Dialog ─────────────────────────────────── */}
                <Dialog
                    open={subscribeModal.open}
                    onOpenChange={(open) => {
                        if (!open && !actionLoading) setSubscribeModal({ open: false, planId: "", planName: "" })
                    }}
                >
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Zap size={20} className="text-brand-green" />
                                Assinar {subscribeModal.planName}
                            </DialogTitle>
                            <DialogDescription>
                                Insira seu email de faturamento para prosseguir. Você será redirecionado para o Mercado Pago para finalizar o pagamento de forma segura.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="py-4 space-y-4">
                            <Input
                                label="Email de faturamento"
                                name="billing_email"
                                type="email"
                                placeholder="seuemail@exemplo.com"
                                value={billingEmail}
                                onChange={(e) => {
                                    setBillingEmail(e.target.value)
                                    setEmailError("")
                                }}
                                className="mb-0"
                            />
                            {emailError && (
                                <p className="text-sm text-red-500 flex items-center gap-1">
                                    <AlertTriangleIcon size={14} /> {emailError}
                                </p>
                            )}

                            <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 dark:bg-zinc-900/50 text-xs text-brand-inactive-text">
                                <ShieldCheck size={14} className="text-brand-green shrink-0 mt-0.5" />
                                <span>
                                    Pagamento processado com segurança pelo Mercado Pago. Seus dados financeiros nunca passam pela Dudit.
                                </span>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setSubscribeModal({ open: false, planId: "", planName: "" })}
                                disabled={!!actionLoading}
                            >
                                Cancelar
                            </Button>
                            <Button
                                className="bg-brand-green text-white hover:bg-brand-green/90"
                                onClick={handleSubscribe}
                                disabled={!!actionLoading}
                            >
                                {actionLoading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin mr-2" />
                                        Processando...
                                    </>
                                ) : (
                                    <>
                                        <ArrowUpRight size={16} className="mr-2" />
                                        Ir para o pagamento
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* ─── Downgrade Confirmation Dialog ────────────────────── */}
                <Dialog
                    open={downgradeModal.open}
                    onOpenChange={(open) => {
                        if (!open && !actionLoading) setDowngradeModal({ open: false, planId: "", planName: "" })
                    }}
                >
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <AlertTriangleIcon size={20} className="text-amber-500" />
                                Confirmar downgrade
                            </DialogTitle>
                            <DialogDescription>
                                Você está rebaixando seu plano para <strong>{downgradeModal.planName}</strong>. A mudança será aplicada no final do ciclo de faturamento atual. Até lá, você continua com todos os recursos do plano atual.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="py-2">
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300">
                                <AlertTriangleIcon size={14} className="shrink-0 mt-0.5" />
                                <span>
                                    Recursos exclusivos do plano atual podem ficar indisponíveis após o downgrade. Produtos, serviços e clientes que excederem os limites do novo plano serão arquivados (nunca excluídos) e você poderá reativá-los a qualquer momento.
                                </span>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setDowngradeModal({ open: false, planId: "", planName: "" })}
                                disabled={!!actionLoading}
                            >
                                Manter plano atual
                            </Button>
                            <Button
                                className="bg-amber-500 text-white hover:bg-amber-600"
                                onClick={handleDowngrade}
                                disabled={!!actionLoading}
                            >
                                {actionLoading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin mr-2" />
                                        Agendando...
                                    </>
                                ) : (
                                    "Confirmar downgrade"
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* ─── Cancel Subscription Modal (DefaultModal) ─────────── */}
                <DefaultModal
                    isOpen={cancelModal}
                    onClose={() => {
                        if (!actionLoading) setCancelModal(false)
                    }}
                    title="Cancelar assinatura"
                >
                    <div className="space-y-5 py-2">
                        <InfoCard
                            title="Acesso garantido até o fim do ciclo"
                            message={`Ao cancelar a renovação, você continuará com acesso total aos recursos do plano ${subData?.plan?.name || "atual"} até ${nextInvoiceDate ? formatDate(nextInvoiceDate) : "o fim do período pago"}. Nenhuma nova cobrança será realizada. Após essa data, sua conta migrará para o plano Grátis e produtos/serviços excedentes serão arquivados (nunca excluídos).`}
                        />

                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                            <Button
                                variant="outline"
                                className="flex-1 h-12"
                                onClick={() => setCancelModal(false)}
                                disabled={!!actionLoading}
                            >
                                Manter meu plano
                            </Button>
                            <Button
                                variant="destructive"
                                className="flex-1 h-12"
                                onClick={() => {
                                    setCancelModal(false)
                                    setCancelConfirmOpen(true)
                                }}
                                disabled={!!actionLoading}
                            >
                                Cancelar renovação
                            </Button>
                        </div>
                    </div>
                </DefaultModal>

                {/* ─── Cancel Subscription Confirmation (AlertModal) ────── */}
                <AlertModal
                    isOpen={cancelConfirmOpen}
                    onClose={() => setCancelConfirmOpen(false)}
                    onConfirm={handleCancel}
                    title="Confirmar cancelamento"
                    message="Tem certeza que deseja cancelar a renovação? Nenhuma nova cobrança será feita e você manterá o acesso total aos recursos do seu plano até o fim do ciclo vigente."
                    variant="danger"
                    confirmText="Sim, cancelar renovação"
                    cancelText="Não, manter plano"
                    isLoading={actionLoading === "cancel"}
                    disabled={!!actionLoading}
                />

                {/* ─── Manual Payment Modal (PIX QR Code) ─────────────────── */}
                <Dialog
                    open={manualPaymentModal.open}
                    onOpenChange={(open) => {
                        if (!open) closeManualPaymentModal()
                    }}
                >
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <QrCode size={20} className="text-brand-green" />
                                Pagar fatura atrasada
                            </DialogTitle>
                            <DialogDescription>
                                Escaneie o QR Code abaixo com seu app do banco para pagar via PIX. A assinatura será reativada automaticamente após a confirmação do pagamento.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="py-4 space-y-4">
                            {manualPaymentModal.error && (
                                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                                    <AlertTriangleIcon size={14} /> {manualPaymentModal.error}
                                </div>
                            )}

                            {manualPaymentModal.loading ? (
                                <div className="flex flex-col items-center gap-4 py-8">
                                    <Loader2 size={32} className="animate-spin text-brand-green" />
                                    <p className="text-brand-inactive-text dark:text-dark-body text-center">
                                        Gerando QR Code PIX...
                                    </p>
                                </div>
                            ) : manualPaymentModal.pixQrCodeBase64 ? (
                                <div className="space-y-4">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="relative">
                                            <img
                                                src={`data:image/png;base64,${manualPaymentModal.pixQrCodeBase64}`}
                                                alt="QR Code PIX"
                                                className="w-64 h-64 rounded-lg border border-brand-border dark:border-dark-border"
                                            />
                                        </div>
                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body text-center">
                                            Valor: <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(manualPaymentModal.amount)}</span>
                                        </p>
                                    </div>

                                    {manualPaymentModal.pixQrCode && (
                                        <div className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-900/50">
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-1">Código PIX (copia e cola)</p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={manualPaymentModal.pixQrCode}
                                                    className="flex-1 text-xs font-mono bg-white dark:bg-zinc-800 border border-brand-border dark:border-dark-border rounded px-2 py-1"
                                                />
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(manualPaymentModal.pixQrCode || "")
                                                        toast.success("Código PIX copiado!")
                                                    }}
                                                >
                                                    Copiar
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {manualPaymentModal.ticketUrl && (
                                        <Button
                                            variant="outline"
                                            className="w-full"
                                            onClick={() => window.open(manualPaymentModal.ticketUrl!, "_blank")}
                                        >
                                            Abrir no Mercado Pago
                                        </Button>
                                    )}

                                    {manualPaymentModal.polling && (
                                        <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-brand-green/10 dark:bg-brand-green/20">
                                            <Loader2 size={16} className="animate-spin text-brand-green" />
                                            <span className="text-sm font-medium text-brand-green dark:text-brand-green">
                                                Aguardando pagamento... Verificando a cada 5 segundos
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4 py-8 text-center">
                                    <AlertTriangleIcon size={32} className="text-amber-500" />
                                    <p className="text-brand-inactive-text dark:text-dark-body">
                                        Não foi possível gerar o QR Code. Tente novamente.
                                    </p>
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={closeManualPaymentModal}
                                disabled={manualPaymentModal.loading}
                            >
                                Fechar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </FadeIn>
    )
}
