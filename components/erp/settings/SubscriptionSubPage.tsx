"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/reusable"
import { Input as FormInput } from "@/components/reusable/Input"
import {
    CheckCircleIcon,
    ChevronLeftIcon,
    AlertTriangleIcon,
    XIcon,
} from "@/lib/icons"
import {
    Crown,
    Zap,
    Loader2,
    ArrowUpRight,
    ShieldCheck,
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
import { buildFeaturesDisplay, getHardcodedPlan } from "@/lib/subscription/feature-labels"

function formatLimitValue(val: number | string): string {
    if (val === "unlimited" || val === -1) return "Ilimitado"
    return String(val)
}

function buildLimitsDisplay(limits: Record<string, any>): string[] {
    const lines: string[] = []
    if (limits.items != null) {
        const v = formatLimitValue(limits.items)
        lines.push(v === "Ilimitado" ? "Itens ilimitados" : `Até ${v} itens`)
    }
    if (limits.images_per_item != null) {
        lines.push(`Até ${limits.images_per_item} imagens por item`)
    }
    if (limits.monthly_orders != null) {
        const v = formatLimitValue(limits.monthly_orders)
        lines.push(v === "Ilimitado" ? "Pedidos ilimitados" : `Até ${v} pedidos/mês`)
    }
    if (limits.monthly_appointments != null) {
        const v = formatLimitValue(limits.monthly_appointments)
        lines.push(v === "Ilimitado" ? "Agendamentos ilimitados" : `Até ${v} agendamentos/mês`)
    }
    if (limits.monthly_quotes != null) {
        const v = formatLimitValue(limits.monthly_quotes)
        lines.push(v === "Ilimitado" ? "Orçamentos ilimitados" : `Até ${v} orçamentos/mês`)
    }
    if (limits.monthly_service_orders != null) {
        const v = formatLimitValue(limits.monthly_service_orders)
        lines.push(v === "Ilimitado" ? "Ordens de serviço ilimitadas" : `Até ${v} ordens de serviço/mês`)
    }
    if (limits.users != null) {
        const v = formatLimitValue(limits.users)
        lines.push(v === "Ilimitado" ? "Usuários ilimitados" : `Até ${v} ${Number(limits.users) === 1 ? "usuário" : "usuários"}`)
    }
    return lines
}

// Removed local formatPrice in favor of formatCurrency

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
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-green text-white text-xs font-bold py-1.5 px-4 rounded-full flex items-center gap-1.5 whitespace-nowrap shadow-sm">
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
    <div className="flex justify-center mb-10">
        <div className="bg-brand-gray dark:bg-dark-surface p-1 rounded-2xl border border-brand-border dark:border-dark-border flex items-center shadow-sm">
            <button
                onClick={() => onChange("monthly")}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${value === "monthly"
                    ? "bg-white dark:bg-zinc-800 text-brand-dark dark:text-dark-heading shadow-md"
                    : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
                    }`}
            >
                Mensal
            </button>
            <button
                onClick={() => onChange("annually")}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 flex items-center gap-2 ${value === "annually"
                    ? "bg-white dark:bg-zinc-800 text-brand-dark dark:text-dark-heading shadow-md"
                    : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
                    }`}
            >
                Anual
                <span className="bg-brand-green/10 text-brand-green text-[10px] px-2 py-0.5 rounded-full">
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
    } | null
    usage: Record<string, number>
}

export const SubscriptionSubPage = ({ onBack }: { onBack: () => void }) => {
    const [plans, setPlans] = useState<any[]>([])
    const [subData, setSubData] = useState<SubscriptionData | null>(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

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
    const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">("annually")

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
            loadData()
        } catch {
            toast.error("Erro inesperado. Tente novamente.")
        } finally {
            setActionLoading(null)
        }
    }

    // ─── Render ────────────────────────────────────────────────────────────

    const currentPlanSlug = subData?.plan?.slug || "free"
    const currentPlanPrice = subData?.plan?.price ?? 0
    const hasActivePaidSub = subData?.subscription &&
        ["active", "trialing", "past_due"].includes(subData.subscription.status) &&
        currentPlanSlug !== "free"

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">
                    {/* Sticky Header */}
                    <div className={`sticky top-0 z-30 w-full bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out ${isScrolled ? "py-2 md:py-3" : ""}`}>
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-1/2 -translate-y-1/2 h-full hidden xl:flex items-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
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
                                        Gerencie sua assinatura e visualize o histórico de pagamentos.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                        {/* Current Plan Info Bar */}
                        {!loading && subData && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-8 p-4 rounded-2xl border border-brand-green/20 bg-brand-green/5 dark:bg-brand-green/10 flex flex-col md:flex-row md:items-center justify-between gap-4"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-brand-green/10 flex items-center justify-center">
                                        <Crown size={20} className="text-brand-green" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                            Plano {getHardcodedPlan(subData.plan.slug).name}
                                        </p>
                                        <p className="text-xs text-brand-inactive-text">
                                            {subData.subscription?.status === "active" && "Ativo"}
                                            {subData.subscription?.status === "trialing" && "Período de teste"}
                                            {subData.subscription?.status === "past_due" && "Pagamento pendente"}
                                            {subData.subscription?.cancel_at_period_end && " · Cancelamento agendado"}
                                            {!subData.subscription && "Plano gratuito"}
                                            {subData.subscription?.current_period_end && (
                                                <> · Renova em {formatDate(subData.subscription.current_period_end)}</>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                {hasActivePaidSub && !subData.subscription?.cancel_at_period_end && (
                                    <Button
                                        variant="outline"
                                        className="text-red-500 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20 text-sm"
                                        onClick={() => setCancelModal(true)}
                                    >
                                        Cancelar assinatura
                                    </Button>
                                )}
                            </motion.div>
                        )}

                        {/* Billing Toggle */}
                        <BillingToggle value={billingCycle} onChange={setBillingCycle} />

                        {/* Plans Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12 items-stretch">
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
                                            onAction={() => handlePlanAction(plan)}
                                        />
                                    )
                                })
                            )}
                        </div>

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
                                    <FormInput
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
                                            Recursos exclusivos do plano atual podem ficar indisponíveis após o downgrade. Verifique se seus dados estão dentro dos limites do novo plano.
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

                        {/* ─── Cancel Subscription Dialog ──────────────────────── */}
                        <Dialog
                            open={cancelModal}
                            onOpenChange={(open) => {
                                if (!open && !actionLoading) setCancelModal(false)
                            }}
                        >
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2 text-red-600">
                                        <XIcon size={20} />
                                        Cancelar assinatura
                                    </DialogTitle>
                                    <DialogDescription>
                                        Tem certeza? Ao cancelar sua assinatura do plano <strong>{subData?.plan.name}</strong>, você voltará para o plano Grátis e perderá acesso aos recursos premium.
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="py-2">
                                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-300">
                                        <AlertTriangleIcon size={14} className="shrink-0 mt-0.5" />
                                        <span>
                                            Esta ação não pode ser desfeita instantaneamente. Para reativar, será necessário criar uma nova assinatura.
                                        </span>
                                    </div>
                                </div>

                                <DialogFooter>
                                    <Button
                                        variant="outline"
                                        onClick={() => setCancelModal(false)}
                                        disabled={!!actionLoading}
                                    >
                                        Não, manter plano
                                    </Button>
                                    <Button
                                        className="bg-red-600 text-white hover:bg-red-700"
                                        onClick={handleCancel}
                                        disabled={!!actionLoading}
                                    >
                                        {actionLoading === "cancel" ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin mr-2" />
                                                Cancelando...
                                            </>
                                        ) : (
                                            "Sim, cancelar assinatura"
                                        )}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </div>

            {/* Mobile Bottom Action Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                <Button
                    variant="outline"
                    onClick={handleBack}
                    className="flex-1 h-12 font-bold"
                >
                    Voltar
                </Button>
            </div>
        </FadeIn>
    )
}
