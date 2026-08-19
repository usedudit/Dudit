"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FadeIn } from "@/components/animations/FadeIn"
import { Badge, Button, DefaultModal } from "@/components/reusable"
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
} from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
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
    { status: "accepted" | "picked_up" | "out_for_delivery" | "delivered"; label: string }
> = {
    assigned: { status: "accepted", label: "Aceitar Entrega" },
    accepted: { status: "picked_up", label: "Confirmar Retirada no Estabelecimento" },
    picked_up: { status: "out_for_delivery", label: "Iniciar Rota de Entrega" },
    out_for_delivery: { status: "delivered", label: "Concluir e Marcar como Entregue" },
}

export default function DeliveryAssignmentDetail({
    assignment: initial,
}: {
    assignment: DeliveryAssignmentItem
}) {
    const router = useRouter()
    const [assignment, setAssignment] = useState<DeliveryAssignmentItem>(initial)
    const [loading, setLoading] = useState(false)
    const [failureOpen, setFailureOpen] = useState(false)
    const [failureReason, setFailureReason] = useState("")

    const statusMeta = statusConfig[assignment.status] || {
        label: assignment.status,
        variant: "gray" as const,
        icon: (<ClockIcon size={12} />) as React.ReactElement<{ className?: string }>,
    }

    const orderNumberDisplay = assignment.order_number
        ? `#${assignment.order_number}`
        : `#${String(assignment.order_id).slice(0, 8)}`

    const cleanPhone = (assignment.customer_phone || "").replace(/\D/g, "")
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        assignment.delivery_address || ""
    )}`
    const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(assignment.delivery_address || "")}`
    const whatsappUrl = cleanPhone ? `https://wa.me/55${cleanPhone}` : null

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

        setAssignment((prev) => ({
            ...prev,
            status: next.status,
            delivered_at: next.status === "delivered" ? new Date().toISOString() : prev.delivered_at,
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

        setAssignment((prev) => ({
            ...prev,
            status: "failed",
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

        setAssignment((prev) => ({
            ...prev,
            payment_confirmed_at: result.data?.confirmed_at || new Date().toISOString(),
        }))
        toast.success("Recebimento em dinheiro confirmado com sucesso!")
    }

    const isCashPayment = /dinheiro|cash|money|especie/i.test(String(assignment.payment_method || ""))

    // Step index
    const currentStepIndex = STEPS.findIndex((s) => s.key === assignment.status)
    const isTerminalFailed = ["failed", "cancelled"].includes(assignment.status)

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full max-w-5xl pt-4 px-4 md:px-8 pb-16 flex flex-col gap-6">
                {/* TOP BREADCRUMB / BACK */}
                <div className="flex items-center justify-between">
                    <Link
                        href="/entregadores/entregas"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-inactive-text hover:text-brand-green transition-colors"
                    >
                        <ChevronLeftIcon size={18} />
                        <span>Voltar para Minhas Entregas</span>
                    </Link>
                </div>

                {/* MAIN ORDER HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-xs font-semibold text-brand-inactive-text">
                            <StoreIcon size={14} />
                            <span>{assignment.partner_name || "Loja Parceira"}</span>
                            {assignment.assigned_at && (
                                <>
                                    <span>•</span>
                                    <span>Atribuído em {formatDate(assignment.assigned_at)}</span>
                                </>
                            )}
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark dark:text-dark-heading font-mono">
                            Pedido {orderNumberDisplay}
                        </h1>
                    </div>

                    <div className="flex items-center gap-3">
                        <Badge variant={statusMeta.variant} icon={statusMeta.icon} className="px-3 py-1.5 text-sm">
                            {statusMeta.label}
                        </Badge>
                    </div>
                </div>

                {/* PROGRESS STEPPER (IF NOT CANCELLED/FAILED) */}
                {!isTerminalFailed ? (
                    <div className="rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface overflow-x-auto">
                        <p className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-4">
                            Progresso da Entrega
                        </p>
                        <div className="flex items-center justify-between min-w-[500px] relative">
                            {STEPS.map((step, idx) => {
                                const isPassed = currentStepIndex >= idx
                                const isCurrent = currentStepIndex === idx
                                const Icon = step.icon

                                return (
                                    <div key={step.key} className="flex-1 flex flex-col items-center relative group">
                                        {/* Connector line */}
                                        {idx < STEPS.length - 1 && (
                                            <div
                                                className={`absolute top-4 left-1/2 w-full h-1 -z-0 transition-colors ${
                                                    currentStepIndex > idx
                                                        ? "bg-brand-green"
                                                        : "bg-gray-200 dark:bg-dark-border"
                                                }`}
                                            />
                                        )}

                                        {/* Step Circle */}
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

                                        {/* Label */}
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
                    </div>
                ) : (
                    <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5 dark:border-red-900/40 dark:bg-red-950/20 flex items-center gap-3">
                        <AlertTriangleIcon className="text-red-600 dark:text-red-400 shrink-0" size={24} />
                        <div>
                            <p className="font-bold text-sm text-red-800 dark:text-red-300">
                                {assignment.status === "failed" ? "Entrega com Falha/Problema" : "Entrega Cancelada"}
                            </p>
                            <p className="text-xs text-red-700/80 dark:text-red-400 mt-0.5">
                                Esta rota não está mais em andamento. Caso tenha dúvidas, contate o lojista parceiro.
                            </p>
                        </div>
                    </div>
                )}

                {/* DETAILS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* CUSTOMER & DESTINATION CARD */}
                    <div className="rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-4">
                                <MapPinIcon size={15} className="text-brand-green" />
                                <span>Cliente e Destino</span>
                            </div>

                            <div className="flex items-center gap-3 mb-4">
                                <UserProfileImage
                                    fullName={assignment.customer_name || "Cliente"}
                                    className="h-12 w-12 text-base"
                                />
                                <div>
                                    <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading">
                                        {assignment.customer_name}
                                    </h3>
                                    <p className="text-xs text-brand-inactive-text">
                                        {assignment.customer_phone || "Telefone não informado"}
                                    </p>
                                </div>
                            </div>

                            {/* DESTINATION ADDRESS */}
                            <div className="rounded-xl bg-brand-gray/80 dark:bg-dark-border/40 p-4 mb-4">
                                <p className="text-xs font-semibold text-brand-inactive-text mb-1">
                                    Endereço de Entrega
                                </p>
                                <p className="text-sm font-medium text-brand-dark dark:text-dark-heading leading-relaxed">
                                    {assignment.delivery_address || "Endereço não informado"}
                                </p>
                            </div>
                        </div>

                        {/* QUICK MAPS / CONTACT ACTIONS */}
                        <div className="grid grid-cols-2 gap-2 pt-2">
                            <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand-border bg-white py-2.5 px-3 text-xs font-semibold text-brand-dark hover:bg-brand-gray dark:border-dark-border dark:bg-dark-surface dark:text-dark-heading transition-colors"
                            >
                                <MapPinIcon size={14} className="text-red-500" />
                                Google Maps
                            </a>

                            <a
                                href={wazeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand-border bg-white py-2.5 px-3 text-xs font-semibold text-brand-dark hover:bg-brand-gray dark:border-dark-border dark:bg-dark-surface dark:text-dark-heading transition-colors"
                            >
                                <TruckIcon size={14} className="text-blue-500" />
                                Waze
                            </a>

                            {cleanPhone && (
                                <a
                                    href={`tel:${cleanPhone}`}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand-border bg-white py-2.5 px-3 text-xs font-semibold text-brand-dark hover:bg-brand-gray dark:border-dark-border dark:bg-dark-surface dark:text-dark-heading transition-colors"
                                >
                                    <PhoneIcon size={14} className="text-emerald-600" />
                                    Ligar
                                </a>
                            )}

                            {whatsappUrl && (
                                <a
                                    href={whatsappUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 text-emerald-700 py-2.5 px-3 text-xs font-semibold hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 transition-colors"
                                >
                                    <WhatsappIcon size={15} />
                                    WhatsApp
                                </a>
                            )}
                        </div>
                    </div>

                    {/* FINANCIAL & VALUES CARD */}
                    <div className="rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-4">
                                <MoneyIcon size={15} className="text-brand-green" />
                                <span>Valores e Pagamento</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="rounded-xl border border-brand-border bg-brand-gray/50 p-4 dark:border-dark-border dark:bg-dark-border/20">
                                    <span className="text-xs text-brand-inactive-text font-medium">
                                        Total do Pedido
                                    </span>
                                    <p className="text-xl font-bold text-brand-dark dark:text-dark-heading mt-1">
                                        {formatCurrency(assignment.total_amount || 0)}
                                    </p>
                                </div>

                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                                        Sua Taxa de Entrega
                                    </span>
                                    <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                                        {formatCurrency(assignment.delivery_fee || 0)}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm text-brand-dark dark:text-dark-heading">
                                <div className="flex items-center justify-between py-2 border-b border-brand-border/60 dark:border-dark-border/40">
                                    <span className="text-brand-inactive-text text-xs">Forma de Pagamento</span>
                                    <span className="font-semibold text-xs">
                                        {assignment.payment_method || "Não informada"}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-brand-border/60 dark:border-dark-border/40">
                                    <span className="text-brand-inactive-text text-xs">Status do Pagamento</span>
                                    <span className="font-semibold text-xs">
                                        {assignment.payment_status || "Pendente"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* CASH COLLECTION CONFIRMATION */}
                        {isCashPayment && (
                            <div className="mt-4 pt-3 border-t border-brand-border dark:border-dark-border">
                                {assignment.payment_confirmed_at ? (
                                    <div className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                                        ✓ Recebimento em dinheiro confirmado
                                    </div>
                                ) : (
                                    <Button
                                        variant="outline"
                                        onClick={confirmPayment}
                                        disabled={loading}
                                        className="w-full text-xs font-semibold"
                                    >
                                        Confirmar Recebimento em Dinheiro
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ITEMS & NOTES CARD */}
                {assignment.items && assignment.items.length > 0 && (
                    <div className="rounded-2xl border border-brand-border bg-white p-6 shadow-xs dark:border-dark-border dark:bg-dark-surface">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-4">
                            <Package size={15} className="text-brand-green" />
                            <span>Itens do Pedido ({assignment.items.length})</span>
                        </div>

                        <div className="divide-y divide-brand-border/60 dark:divide-dark-border/40">
                            {assignment.items.map((it, idx) => (
                                <div key={idx} className="py-2.5 flex items-center justify-between text-sm">
                                    <span className="font-medium text-brand-dark dark:text-dark-heading">
                                        {it.quantity || 1}x {it.name || "Item"}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {assignment.notes && (
                            <div className="mt-4 rounded-xl bg-amber-50/70 p-4 border border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-900/40 text-xs">
                                <span className="font-bold text-amber-800 dark:text-amber-300">
                                    Observações do Pedido:
                                </span>
                                <p className="mt-1 text-amber-900 dark:text-amber-200">{assignment.notes}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ACTION WORKFLOW FOOTER */}
                <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
                    {["assigned", "accepted", "picked_up", "out_for_delivery"].includes(assignment.status) && (
                        <Button
                            variant="outlinered"
                            onClick={() => setFailureOpen(true)}
                            disabled={loading}
                        >
                            Informar Problema / Falha
                        </Button>
                    )}

                    {NEXT_STATUS[assignment.status] && (
                        <Button
                            onClick={advance}
                            disabled={loading}
                            isLoading={loading}
                            className="w-full sm:w-auto px-6 py-3 text-base shadow-sm"
                        >
                            {NEXT_STATUS[assignment.status].label}
                        </Button>
                    )}
                </div>

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
                            Descreva com detalhes o que aconteceu para que o lojista e o suporte possam dar andamento.
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
