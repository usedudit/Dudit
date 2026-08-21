"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { FadeIn } from "@/components/animations/FadeIn"
import { Badge, Button, DefaultModal } from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { useSidebar } from "@/lib/sidebar-context"
import { toast } from "@/hooks/use-notification"
import {
    confirmDeliveryPaymentReceivedAction,
    transitionMyDeliveryAssignmentAction,
} from "@/app/actions/delivery-drivers"
import {
    ChevronLeftIcon,
    TruckIcon,
    CheckCircleIcon,
    ClockIcon,
    AlertTriangleIcon,
    PhoneIcon,
    WhatsappIcon,
    MapPinIcon,
    StoreIcon,
    Package,
    MoneyIcon,
    CreditCardIcon,
    InfoIcon,
    ListIcon,
    HistoryIcon,
} from "@/lib/icons"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { statusConfig, type DeliveryAssignmentItem } from "./DeliveryAssignmentListRow"

const STEPS = [
    { key: "assigned", label: "Atribuída", icon: ClockIcon },
    { key: "accepted", label: "Aceita", icon: CheckCircleIcon },
    { key: "picked_up", label: "Retirada", icon: Package },
    { key: "out_for_delivery", label: "Em Rota", icon: TruckIcon },
    { key: "delivered", label: "Entregue", icon: CheckCircleIcon },
]

const NEXT_STATUS: Record<
    string,
    { status: "accepted" | "picked_up" | "out_for_delivery" | "delivered"; label: string; shortLabel: string }
> = {
    assigned: { status: "accepted", label: "Aceitar Entrega", shortLabel: "Aceitar" },
    accepted: { status: "picked_up", label: "Confirmar Retirada na Loja", shortLabel: "Confirmar Retirada" },
    picked_up: { status: "out_for_delivery", label: "Iniciar Rota para o Cliente", shortLabel: "Iniciar Rota" },
    out_for_delivery: { status: "delivered", label: "Confirmar Entrega ao Cliente", shortLabel: "Entregar" },
}

export default function DeliveryAssignmentDetail({
    assignment: initial,
    onBack,
}: {
    assignment: DeliveryAssignmentItem & {
        store_name?: string
        store_phone?: string
        store_address?: string
        store_logo_url?: string
        out_for_delivery_at?: string
        failed_at?: string
    }
    onBack?: () => void
}) {
    const router = useRouter()
    const { setHeaderOverride } = useSidebar()
    const [assignment, setAssignment] = useState<any>(initial)
    const [loading, setLoading] = useState(false)
    const [failureOpen, setFailureOpen] = useState(false)
    const [failureReason, setFailureReason] = useState("")

    const [activeTab, setActiveTab] = useState("resumo")

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const statusMeta = statusConfig[assignment.status] || {
        label: assignment.status,
        variant: "gray" as const,
        icon: (<ClockIcon size={12} />) as React.ReactElement<{ className?: string }>,
    }

    const orderNumberDisplay = assignment.order_number
        ? `#${assignment.order_number}`
        : `#${String(assignment.order_id).slice(0, 8)}`

    const cleanCustomerPhone = (assignment.customer_phone || "").replace(/\D/g, "")
    const cleanStorePhone = (assignment.store_phone || "").replace(/\D/g, "")

    const customerMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        assignment.delivery_address || ""
    )}`
    const customerWazeUrl = `https://waze.com/ul?q=${encodeURIComponent(assignment.delivery_address || "")}`
    const customerWhatsappUrl = cleanCustomerPhone ? `https://wa.me/55${cleanCustomerPhone}` : null

    const storeMapsUrl = assignment.store_address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.store_address)}`
        : null
    const storeWhatsappUrl = cleanStorePhone ? `https://wa.me/55${cleanStorePhone}` : null

    const pageTitle = `Pedido ${orderNumberDisplay}`

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBackClick,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [pageTitle, assignment.status])

    function handleBackClick() {
        if (onBack) {
            onBack()
        } else {
            router.push("/entregadores")
        }
    }

    const advance = async () => {
        const next = NEXT_STATUS[assignment.status]
        if (!next) return

        setLoading(true)
        const result = await transitionMyDeliveryAssignmentAction({
            assignmentId: assignment.assignment_id,
            status: next.status,
        })
        setLoading(false)

        if (!result.success) {
            toast.error(result.error || "Não foi possível avançar a entrega.")
            return
        }

        const now = new Date().toISOString()
        setAssignment((prev: any) => ({
            ...prev,
            status: next.status,
            accepted_at: next.status === "accepted" ? now : prev.accepted_at,
            picked_up_at: next.status === "picked_up" ? now : prev.picked_up_at,
            out_for_delivery_at: next.status === "out_for_delivery" ? now : prev.out_for_delivery_at,
            delivered_at: next.status === "delivered" ? now : prev.delivered_at,
        }))
        toast.success("Status da entrega atualizado com sucesso!")
    }

    const reportFailure = async () => {
        if (!failureReason.trim()) {
            toast.error("Por favor, informe o motivo do problema ou falha.")
            return
        }

        setLoading(true)
        const result = await transitionMyDeliveryAssignmentAction({
            assignmentId: assignment.assignment_id,
            status: "failed",
            failureReason,
        })
        setLoading(false)

        if (!result.success) {
            toast.error(result.error || "Não foi possível registrar a falha.")
            return
        }

        setAssignment((prev: any) => ({
            ...prev,
            status: "failed",
            failed_at: new Date().toISOString(),
        }))
        setFailureOpen(false)
        toast.success("Problema registrado na entrega.")
    }

    const confirmPayment = async () => {
        setLoading(true)
        const result = await confirmDeliveryPaymentReceivedAction(assignment.assignment_id)
        setLoading(false)

        if (!result.success) {
            toast.error(result.error || "Não foi possível confirmar o pagamento.")
            return
        }

        setAssignment((prev: any) => ({
            ...prev,
            payment_confirmed_at: result.data?.confirmed_at || new Date().toISOString(),
        }))
        toast.success("Recebimento em dinheiro confirmado com sucesso!")
    }

    const isCashPayment = /dinheiro|cash|money|especie/i.test(String(assignment.payment_method || ""))
    const currentStepIndex = STEPS.findIndex((s) => s.key === assignment.status)
    const isTerminalFailed = ["failed", "cancelled"].includes(assignment.status)

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBackClick} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="hidden md:inline truncate font-mono">{pageTitle}</span>
                                            <Badge variant={statusMeta.variant} icon={statusMeta.icon} className="shrink-0">
                                                {statusMeta.label}
                                            </Badge>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            {assignment.store_name || assignment.partner_name || "Loja"} • {assignment.assigned_at ? formatDate(assignment.assigned_at) : "Hoje"}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        {["assigned", "accepted", "picked_up", "out_for_delivery"].includes(assignment.status) && (
                                            <Button
                                                variant="outlinered"
                                                size="sm"
                                                onClick={() => setFailureOpen(true)}
                                                disabled={loading}
                                            >
                                                Informar Falha
                                            </Button>
                                        )}

                                        {NEXT_STATUS[assignment.status] && (
                                            <Button
                                                variant="default"
                                                size="sm"
                                                onClick={advance}
                                                disabled={loading}
                                                isLoading={loading}
                                                className="font-bold shadow-xs"
                                            >
                                                {NEXT_STATUS[assignment.status].label}
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="resumo" icon={InfoIcon}>
                                            Resumo
                                        </TabsTrigger>
                                        <TabsTrigger value="itens" icon={ListIcon}>
                                            Itens do Pedido
                                        </TabsTrigger>
                                        <TabsTrigger value="historico" icon={HistoryIcon}>
                                            Histórico
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <AnimatePresence mode="wait">
                                {activeTab === "resumo" && (
                                    <FadeIn key="resumo" className="block">
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                            {/* LEFT MAIN COLUMN (lg:col-span-8) */}
                                            <div className="lg:col-span-8 space-y-6">
                                                {/* STEPPER PROGRESS */}
                                                {!isTerminalFailed ? (
                                                    <div className="rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface overflow-x-auto">
                                                        <h2 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-5">
                                                            Progresso da Entrega
                                                        </h2>
                                                        <div className="flex items-center justify-between min-w-[480px] relative px-4">
                                                            {STEPS.map((step, idx) => {
                                                                const isPassed = currentStepIndex >= idx
                                                                const isCurrent = currentStepIndex === idx
                                                                const Icon = step.icon

                                                                return (
                                                                    <div key={step.key} className="flex-1 flex flex-col items-center relative group">
                                                                        {idx < STEPS.length - 1 && (
                                                                            <div
                                                                                className={`absolute top-4 left-1/2 w-full h-1 -z-0 transition-colors ${
                                                                                    currentStepIndex > idx
                                                                                        ? "bg-brand-green"
                                                                                        : "bg-gray-200 dark:bg-dark-border"
                                                                                }`}
                                                                            />
                                                                        )}

                                                                        <div
                                                                            className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-200 ${
                                                                                isCurrent
                                                                                    ? "bg-brand-green text-white ring-4 ring-brand-green/20"
                                                                                    : isPassed
                                                                                    ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                                                                                    : "bg-gray-100 dark:bg-dark-border text-gray-400"
                                                                            }`}
                                                                        >
                                                                            <Icon size={16} />
                                                                        </div>

                                                                        <span
                                                                            className={`text-xs mt-2 font-semibold text-center ${
                                                                                isCurrent
                                                                                    ? "text-brand-dark dark:text-dark-heading font-bold"
                                                                                    : isPassed
                                                                                    ? "text-emerald-700 dark:text-emerald-400"
                                                                                    : "text-brand-inactive-text"
                                                                            }`}
                                                                        >
                                                                            {step.label}
                                                                        </span>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>

                                                        {/* NEXT ACTION BANNER INSIDE CARD */}
                                                        {NEXT_STATUS[assignment.status] && (
                                                            <div className="mt-6 pt-5 border-t border-brand-border dark:border-dark-border flex flex-col sm:flex-row items-center justify-between gap-3 bg-brand-gray/40 dark:bg-dark-border/20 -mx-6 -mb-6 p-4 px-6 rounded-b-2xl">
                                                                <div className="text-xs text-brand-dark dark:text-dark-heading">
                                                                    <span className="font-bold">Próximo passo: </span>
                                                                    <span className="text-brand-inactive-text dark:text-dark-body">
                                                                        {NEXT_STATUS[assignment.status].label}
                                                                    </span>
                                                                </div>
                                                                <Button
                                                                    variant="default"
                                                                    size="sm"
                                                                    onClick={advance}
                                                                    disabled={loading}
                                                                    isLoading={loading}
                                                                    className="w-full sm:w-auto font-bold px-5"
                                                                >
                                                                    {NEXT_STATUS[assignment.status].label}
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5 dark:border-red-900/40 dark:bg-red-950/20 flex items-center gap-3">
                                                        <AlertTriangleIcon className="text-red-600 dark:text-red-400 shrink-0" size={24} />
                                                        <div>
                                                            <p className="font-bold text-sm text-red-800 dark:text-red-300">
                                                                {assignment.status === "failed" ? "Entrega com Falha/Problema" : "Entrega Cancelada"}
                                                            </p>
                                                            <p className="text-xs text-red-700/80 dark:text-red-400 mt-0.5">
                                                                Esta rota não está mais em andamento. Caso tenha dúvidas, entre em contato com o estabelecimento.
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* STORE CARD (LOCAL DE RETIRADA) */}
                                                <div className="rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface space-y-4">
                                                    <div className="flex items-center justify-between border-b border-brand-border dark:border-dark-border pb-3">
                                                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-green">
                                                            <StoreIcon size={16} />
                                                            <span>1. Local de Coleta (Estabelecimento)</span>
                                                        </div>
                                                        <span className="text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                                            Retirada
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                        <div className="space-y-1">
                                                            <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading">
                                                                {assignment.store_name || assignment.partner_name || "Estabelecimento Parceiro"}
                                                            </h3>
                                                            {assignment.store_address && (
                                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body flex items-start gap-1">
                                                                    <MapPinIcon size={14} className="shrink-0 text-brand-inactive-text mt-0.5" />
                                                                    <span>{assignment.store_address}</span>
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0">
                                                            {storeMapsUrl && (
                                                                <a
                                                                    href={storeMapsUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border text-xs font-bold text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border transition"
                                                                >
                                                                    <MapPinIcon size={13} className="text-red-500" />
                                                                    Rota Coleta
                                                                </a>
                                                            )}
                                                            {cleanStorePhone && (
                                                                <a
                                                                    href={`tel:${cleanStorePhone}`}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border text-xs font-bold text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border transition"
                                                                >
                                                                    <PhoneIcon size={13} className="text-brand-green" />
                                                                    Ligar
                                                                </a>
                                                            )}
                                                            {storeWhatsappUrl && (
                                                                <a
                                                                    href={storeWhatsappUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100 transition"
                                                                >
                                                                    <WhatsappIcon size={14} />
                                                                    WhatsApp
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* CUSTOMER CARD (LOCAL DE ENTREGA) */}
                                                <div className="rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface space-y-4">
                                                    <div className="flex items-center justify-between border-b border-brand-border dark:border-dark-border pb-3">
                                                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                                                            <MapPinIcon size={16} />
                                                            <span>2. Local de Entrega (Cliente)</span>
                                                        </div>
                                                        <span className="text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                                            Destino
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                        <div className="space-y-1">
                                                            <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading">
                                                                {assignment.customer_name || "Cliente"}
                                                            </h3>
                                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body flex items-start gap-1">
                                                                <MapPinIcon size={14} className="shrink-0 text-purple-500 mt-0.5" />
                                                                <span>{assignment.delivery_address || "Endereço não informado"}</span>
                                                            </p>
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                                            <a
                                                                href={customerMapsUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border text-xs font-bold text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border transition"
                                                            >
                                                                <MapPinIcon size={13} className="text-red-500" />
                                                                Maps
                                                            </a>
                                                            <a
                                                                href={customerWazeUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border text-xs font-bold text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border transition"
                                                            >
                                                                <TruckIcon size={13} className="text-blue-500" />
                                                                Waze
                                                            </a>
                                                            {cleanCustomerPhone && (
                                                                <a
                                                                    href={`tel:${cleanCustomerPhone}`}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border text-xs font-bold text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border transition"
                                                                >
                                                                    <PhoneIcon size={13} className="text-brand-green" />
                                                                    Ligar
                                                                </a>
                                                            )}
                                                            {customerWhatsappUrl && (
                                                                <a
                                                                    href={customerWhatsappUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100 transition"
                                                                >
                                                                    <WhatsappIcon size={14} />
                                                                    WhatsApp
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* RIGHT SIDEBAR COLUMN (lg:col-span-4) */}
                                            <div className="lg:col-span-4 space-y-6">
                                                {/* FINANCIAL / FEE CARD */}
                                                <div className="rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface space-y-4">
                                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-inactive-text border-b border-brand-border dark:border-dark-border pb-3">
                                                        <MoneyIcon size={16} className="text-brand-green" />
                                                        <span>Remuneração & Valores</span>
                                                    </div>

                                                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                                                        <span className="text-xs text-emerald-700 dark:text-emerald-400 font-bold">
                                                            Sua Taxa de Entrega
                                                        </span>
                                                        <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">
                                                            {formatCurrency(assignment.delivery_fee || 0)}
                                                        </p>
                                                    </div>

                                                    <div className="space-y-3 text-xs pt-1">
                                                        <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                            <span className="text-brand-inactive-text dark:text-dark-body">Valor do Pedido:</span>
                                                            <span className="font-bold text-sm">{formatCurrency(assignment.total_amount || 0)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                            <span className="text-brand-inactive-text dark:text-dark-body">Forma de Pagamento:</span>
                                                            <span className="font-semibold">{assignment.payment_method || "Não informada"}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                            <span className="text-brand-inactive-text dark:text-dark-body">Status do Pagamento:</span>
                                                            <span className="font-semibold">{assignment.payment_status || "Pendente"}</span>
                                                        </div>
                                                    </div>

                                                    {isCashPayment && (
                                                        <div className="pt-3 border-t border-brand-border dark:border-dark-border">
                                                            {assignment.payment_confirmed_at ? (
                                                                <div className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                                                                    ✓ Recebimento em dinheiro confirmado
                                                                </div>
                                                            ) : (
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={confirmPayment}
                                                                    disabled={loading}
                                                                    className="w-full text-xs font-bold"
                                                                >
                                                                    Confirmar Recebimento em Dinheiro
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* METADATA TIMELINE CARD */}
                                                <div className="rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface space-y-3 text-xs">
                                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-inactive-text border-b border-brand-border dark:border-dark-border pb-3">
                                                        <ClockIcon size={16} className="text-brand-green" />
                                                        <span>Histórico da Corrida</span>
                                                    </div>

                                                    <div className="space-y-2.5 pt-1 text-brand-inactive-text dark:text-dark-body">
                                                        {assignment.assigned_at && (
                                                            <div className="flex justify-between">
                                                                <span>Atribuída:</span>
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                                    {formatDateTime(assignment.assigned_at)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {assignment.accepted_at && (
                                                            <div className="flex justify-between">
                                                                <span>Aceita:</span>
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                                    {formatDateTime(assignment.accepted_at)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {assignment.picked_up_at && (
                                                            <div className="flex justify-between">
                                                                <span>Retirada:</span>
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                                    {formatDateTime(assignment.picked_up_at)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {assignment.out_for_delivery_at && (
                                                            <div className="flex justify-between">
                                                                <span>Em rota:</span>
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                                    {formatDateTime(assignment.out_for_delivery_at)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {assignment.delivered_at && (
                                                            <div className="flex justify-between">
                                                                <span>Entregue:</span>
                                                                <span className="font-semibold text-brand-green">
                                                                    {formatDateTime(assignment.delivered_at)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </FadeIn>
                                )}

                                {activeTab === "itens" && (
                                    <FadeIn key="itens" className="block">
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                            <div className="lg:col-span-8 space-y-6">
                                                <div className="rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface space-y-4">
                                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-inactive-text border-b border-brand-border dark:border-dark-border pb-3">
                                                        <Package size={16} className="text-brand-green" />
                                                        <span>Itens do Pedido ({assignment.items?.length || 0})</span>
                                                    </div>

                                                    {assignment.items && assignment.items.length > 0 ? (
                                                        <div className="divide-y divide-brand-border/60 dark:divide-dark-border/40">
                                                            {assignment.items.map((it: any, idx: number) => (
                                                                <div key={idx} className="py-2.5 flex items-center justify-between text-sm">
                                                                    <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                                        {it.quantity || 1}x {it.name || "Item"}
                                                                    </span>
                                                                    {it.price ? (
                                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                            {formatCurrency(it.price)}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-brand-inactive-text">Nenhum item listado.</p>
                                                    )}

                                                    <div className="flex items-center justify-between border-t border-brand-border dark:border-dark-border pt-3">
                                                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Total do Pedido</span>
                                                        <span className="text-lg font-extrabold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(assignment.total_amount || 0)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {assignment.notes && (
                                                    <div className="rounded-xl bg-amber-50/70 p-4 border border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-900/40 text-xs">
                                                        <span className="font-bold text-amber-800 dark:text-amber-300">
                                                            Instruções do Pedido:
                                                        </span>
                                                        <p className="mt-1 text-amber-900 dark:text-amber-200 leading-relaxed">{assignment.notes}</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="lg:col-span-4 space-y-6">
                                                <div className="rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface space-y-4">
                                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-inactive-text border-b border-brand-border dark:border-dark-border pb-3">
                                                        <CreditCardIcon size={16} className="text-brand-green" />
                                                        <span>Pagamento</span>
                                                    </div>

                                                    <div className="space-y-3 text-xs">
                                                        <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                            <span className="text-brand-inactive-text dark:text-dark-body">Forma:</span>
                                                            <span className="font-semibold">{assignment.payment_method || "Não informada"}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                            <span className="text-brand-inactive-text dark:text-dark-body">Status:</span>
                                                            <span className="font-semibold">{assignment.payment_status || "Pendente"}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                            <span className="text-brand-inactive-text dark:text-dark-body">Sua Taxa:</span>
                                                            <span className="font-bold text-brand-green">{formatCurrency(assignment.delivery_fee || 0)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </FadeIn>
                                )}

                                {activeTab === "historico" && (
                                    <FadeIn key="historico" className="block">
                                        <div className="rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface space-y-4">
                                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-inactive-text border-b border-brand-border dark:border-dark-border pb-3">
                                                <HistoryIcon size={16} className="text-brand-green" />
                                                <span>Linha do Tempo da Entrega</span>
                                            </div>

                                            <div className="space-y-0">
                                                {[
                                                    { label: "Atribuída", time: assignment.assigned_at, icon: ClockIcon, color: "text-brand-green bg-brand-green/10" },
                                                    { label: "Aceita", time: assignment.accepted_at, icon: CheckCircleIcon, color: "text-blue-500 bg-blue-500/10" },
                                                    { label: "Retirada no Local", time: assignment.picked_up_at, icon: Package, color: "text-purple-500 bg-purple-500/10" },
                                                    { label: "Em Rota de Entrega", time: assignment.out_for_delivery_at, icon: TruckIcon, color: "text-amber-500 bg-amber-500/10" },
                                                    { label: "Entregue", time: assignment.delivered_at, icon: CheckCircleIcon, color: "text-emerald-600 bg-emerald-500/10" },
                                                ].map((item, idx, arr) => {
                                                    const Icon = item.icon
                                                    const isLast = idx === arr.length - 1
                                                    return (
                                                        <div key={item.label} className="relative flex gap-4 pb-6">
                                                            {!isLast && (
                                                                <div className="absolute left-[15px] top-8 bottom-0 w-px bg-brand-border dark:bg-dark-border" />
                                                            )}
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${item.color}`}>
                                                                <Icon size={15} />
                                                            </div>
                                                            <div className="pt-1">
                                                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{item.label}</p>
                                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                                    {item.time ? formatDateTime(item.time) : "Pendente"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            {isTerminalFailed && (
                                                <div className="rounded-xl bg-red-50/70 p-4 border border-red-200/60 dark:bg-red-950/20 dark:border-red-900/40 text-xs">
                                                    <span className="font-bold text-red-800 dark:text-red-300">
                                                        {assignment.status === "failed" ? "Falha registrada" : "Entrega cancelada"}:
                                                    </span>
                                                    <p className="mt-1 text-red-700/80 dark:text-red-400">
                                                        {assignment.failure_reason || "Não informado."}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </FadeIn>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        {["assigned", "accepted", "picked_up", "out_for_delivery"].includes(assignment.status) ? (
                            <>
                                <Button
                                    variant="outlinered"
                                    onClick={() => setFailureOpen(true)}
                                    disabled={loading}
                                    className="flex-1 h-12"
                                >
                                    Informar Falha
                                </Button>
                                <Button
                                    onClick={advance}
                                    disabled={loading}
                                    isLoading={loading}
                                    className="flex-1 h-12"
                                >
                                    {NEXT_STATUS[assignment.status]?.shortLabel || "Avançar"}
                                </Button>
                            </>
                        ) : (
                            <Button
                                variant="outline"
                                onClick={handleBackClick}
                                className="flex-1 h-12"
                            >
                                Voltar para entregas
                            </Button>
                        )}
                    </div>
                </Tabs>

                {/* MODAL REPORT FAILURE */}
                <DefaultModal
                    isOpen={failureOpen}
                    onClose={() => setFailureOpen(false)}
                    title="Informar Problema na Entrega"
                    maxWidth="md"
                    footer={
                        <div className="flex items-center justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setFailureOpen(false)} disabled={loading}>
                                Cancelar
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={reportFailure}
                                disabled={loading || !failureReason.trim()}
                                isLoading={loading}
                            >
                                Confirmar Falha
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4 py-2">
                        <p className="text-xs text-brand-inactive-text">
                            Descreva com detalhes o que aconteceu para que o lojista e a plataforma possam dar andamento.
                        </p>
                        <textarea
                            value={failureReason}
                            onChange={(e) => setFailureReason(e.target.value)}
                            placeholder="Ex: Cliente ausente no endereço, endereço incorreto, veículo quebrou..."
                            className="w-full min-h-[110px] rounded-xl border border-brand-border bg-white p-3 text-sm text-brand-dark outline-none focus:border-brand-green dark:border-dark-border dark:bg-dark-surface dark:text-white"
                        />
                    </div>
                </DefaultModal>
            </div>
        </FadeIn>
    )
}