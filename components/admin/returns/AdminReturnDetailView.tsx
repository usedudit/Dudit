"use client"

import React, { useState, useEffect } from "react"
import {
    ChevronLeftIcon,
    ReturnIcon,
    StoreIcon,
    UserIcon,
    PackageIcon,
    ClockIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    AlertCircleIcon,
    FileIcon,
    MoneyIcon,
    ShareIcon,
    InfoIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    ThreeDotsLoader,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate, formatDateTime, formatFullDate } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"

interface AdminReturnDetailViewProps {
    detail: any
    onBack: () => void
}

export function AdminReturnDetailView({ detail, onBack }: AdminReturnDetailViewProps) {
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20)
        }
        window.addEventListener("scroll", handleScroll)
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    const request = detail?.request || detail
    const riskEvents = detail?.riskEvents || []
    const moderationActions = detail?.moderationActions || []
    const relatedReports = detail?.relatedReports || []

    const returnId = request?.id?.slice(0, 8) || "N/A"
    const isApproved = request?.status === "APPROVED" || request?.status === "approved" || request?.status === "completed"
    const isRejected = request?.status === "REJECTED" || request?.status === "rejected"
    const isPending = !isApproved && !isRejected

    const items = Array.isArray(request?.return_items) ? request.return_items : []
    const evidence = Array.isArray(request?.return_evidence) ? request.return_evidence : []
    const messages = Array.isArray(request?.return_messages) ? request.return_messages : []
    const events = Array.isArray(request?.return_events) ? request.return_events : []
    const store = request?.stores || {}

    return (
        <FadeIn className="flex flex-col w-full min-h-screen bg-white dark:bg-dark-background">
            {/* Sticky Header */}
            <div className={`sticky top-0 z-20 bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md border-b border-brand-border dark:border-dark-border transition-all duration-300 ${isScrolled ? "shadow-sm py-3 px-4 md:px-8" : "py-4 px-4 md:px-8"}`}>
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onBack}
                            className="p-2 -ml-2 text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading rounded-full"
                        >
                            <ChevronLeftIcon className="w-5 h-5" />
                        </Button>

                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                                    Solicitação #{returnId}
                                </h1>
                                <Badge variant={isApproved ? "green" : isRejected ? "red" : "orange"}>
                                    {request?.status || "Pendente"}
                                </Badge>
                                <Badge variant="blue">
                                    {request?.request_type === "exchange" ? "Troca" : "Devolução"}
                                </Badge>
                            </div>
                            <span className="text-xs text-brand-inactive-text mt-0.5">
                                Criado em {formatDateTime(request?.created_at)} • Pedido: #{request?.order_number_snapshot || request?.orders?.order_number || "-"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                navigator.clipboard.writeText(window.location.href)
                                toast.success("Link da solicitação copiado!")
                            }}
                            leftIcon={<ShareIcon size={16} />}
                        >
                            Compartilhar
                        </Button>
                    </div>
                </div>

                {/* Sub-Tabs */}
                <div className="max-w-7xl mx-auto mt-4">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                            <TabsTrigger value="general" icon={ReturnIcon}>
                                Geral & Itens
                            </TabsTrigger>
                            <TabsTrigger value="parties" icon={StoreIcon}>
                                Comprador & Loja
                            </TabsTrigger>
                            <TabsTrigger value="evidence" icon={FileIcon}>
                                Evidências & Mensagens ({evidence.length + messages.length})
                            </TabsTrigger>
                            <TabsTrigger value="timeline" icon={ClockIcon}>
                                Timeline ({events.length})
                            </TabsTrigger>
                            <TabsTrigger value="risk" icon={AlertCircleIcon}>
                                Risco & Auditoria ({riskEvents.length})
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            {/* Content Body */}
            <div className="max-w-7xl mx-auto w-full p-4 md:p-8 space-y-6">
                {activeTab === "general" && (
                    <div className="grid grid-cols-12 gap-6">
                        {/* Coluna Principal */}
                        <div className="col-span-12 lg:col-span-8 space-y-6">
                            {/* Itens solicitados */}
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm">
                                <div className="flex items-center justify-between pb-4 border-b border-brand-border dark:border-dark-border">
                                    <div className="flex items-center gap-2">
                                        <PackageIcon className="w-5 h-5 text-brand-inactive-text" />
                                        <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                            Itens da Solicitação ({items.length})
                                        </h2>
                                    </div>
                                </div>

                                <div className="divide-y divide-brand-border dark:divide-dark-border">
                                    {items.length === 0 ? (
                                        <p className="py-6 text-center text-sm text-brand-inactive-text">Nenhum item especificado.</p>
                                    ) : (
                                        items.map((item: any) => (
                                            <div key={item.id} className="py-4 flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                                                        <PackageIcon className="w-6 h-6 text-brand-inactive-text" />
                                                    </div>
                                                    <div className="min-w-0 flex flex-col">
                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                            {item.product_name_snapshot || "Produto"}
                                                        </span>
                                                        <span className="text-xs text-brand-inactive-text mt-0.5">
                                                            Qtd: <strong>{item.quantity || 1}</strong> • Condição: {item.condition || "Padrão"}
                                                        </span>
                                                        {item.reason && (
                                                            <span className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">
                                                                Motivo: {item.reason}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="text-right shrink-0">
                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                        {formatCurrency(Number(item.net_item_value_snapshot || 0))}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Motivo do Cliente */}
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-3">
                                <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                    Motivo informado pelo cliente
                                </h3>
                                <p className="text-sm text-brand-dark dark:text-dark-heading bg-brand-gray/50 dark:bg-dark-border/30 p-4 rounded-xl">
                                    {request?.customer_reason || request?.customer_details || "Nenhum detalhe adicional fornecido."}
                                </p>
                            </div>
                        </div>

                        {/* Coluna Lateral */}
                        <div className="col-span-12 lg:col-span-4 space-y-6">
                            {/* Resumo de Resolução */}
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                                <div className="flex items-center gap-2 pb-3 border-b border-brand-border dark:border-dark-border">
                                    <MoneyIcon className="w-5 h-5 text-brand-inactive-text" />
                                    <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                        Resolução & Valores
                                    </h2>
                                </div>

                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between text-brand-inactive-text">
                                        <span>Resolução Desejada</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                            {request?.desired_resolution || request?.approved_resolution || request?.resolution_type || "Reembolso"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-brand-inactive-text">
                                        <span>Reembolso solicitado</span>
                                        <span className="font-bold text-brand-green">
                                            {formatCurrency(Number(request?.refund_amount || 0))}
                                        </span>
                                    </div>
                                    {Number(request?.store_credit_amount || 0) > 0 && (
                                        <div className="flex justify-between text-brand-inactive-text">
                                            <span>Crédito em Loja</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(Number(request.store_credit_amount))}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-brand-inactive-text pt-2 border-t border-brand-border dark:border-dark-border">
                                        <span>Elegibilidade</span>
                                        <Badge variant="gray">{request?.eligibility_status || "Válido"}</Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Pedido Vinculado */}
                            {request?.order_id && (
                                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-3">
                                    <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                        Pedido Vinculado
                                    </h3>
                                    <p className="text-xs text-brand-inactive-text">
                                        Número: #{request?.order_number_snapshot || request?.orders?.order_number || "-"}
                                    </p>
                                    <Link
                                        href={`/ddt-admin/orders?search=${request.order_id}`}
                                        className="inline-block text-xs font-bold text-brand-green hover:underline"
                                    >
                                        Ver pedido completo →
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "parties" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Cliente */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                            <div className="flex items-center gap-2 pb-3 border-b border-brand-border dark:border-dark-border">
                                <UserIcon className="w-5 h-5 text-brand-inactive-text" />
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                    Dados do Cliente
                                </h2>
                            </div>

                            <div className="flex items-center gap-3">
                                <UserProfileImage
                                    fullName={request?.customer_name_snapshot || "Cliente"}
                                    className="w-12 h-12 text-lg shrink-0"
                                />
                                <div>
                                    <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading">
                                        {request?.customer_name_snapshot || "Consumidor"}
                                    </h3>
                                    <span className="text-xs text-brand-inactive-text">ID: {request?.customer_id || "-"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Loja */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                            <div className="flex items-center gap-2 pb-3 border-b border-brand-border dark:border-dark-border">
                                <StoreIcon className="w-5 h-5 text-brand-inactive-text" />
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                    Dados do Vendedor / Loja
                                </h2>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                                    {store.logo_url ? (
                                        <img src={getR2ImageUrl(store.logo_url)} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <StoreIcon className="w-6 h-6 text-brand-inactive-text" />
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading">
                                        {store.name || "Loja Parceira"}
                                    </h3>
                                    <span className="text-xs text-brand-inactive-text">
                                        Pontuação de Risco: <strong>{store.risk_score || 0} pts</strong>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "evidence" && (
                    <div className="space-y-6">
                        {/* Evidências */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                            <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                                Arquivos e Evidências Fotográficas ({evidence.length})
                            </h2>

                            {evidence.length === 0 ? (
                                <p className="text-sm text-brand-inactive-text py-4 text-center">Nenhuma evidência anexada.</p>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {evidence.map((ev: any) => (
                                        <a
                                            key={ev.id}
                                            href={getR2ImageUrl(ev.file_url)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group rounded-xl border border-brand-border dark:border-dark-border overflow-hidden bg-brand-gray dark:bg-dark-border/20 flex flex-col hover:shadow-md transition-all"
                                        >
                                            <div className="aspect-square flex items-center justify-center overflow-hidden">
                                                {ev.file_type?.startsWith("image") ? (
                                                    <img src={getR2ImageUrl(ev.file_url)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                ) : (
                                                    <FileIcon className="w-8 h-8 text-brand-inactive-text" />
                                                )}
                                            </div>
                                            <div className="p-2 text-xs truncate font-medium text-brand-dark dark:text-dark-heading">
                                                {ev.file_name || "Evidência"}
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Mensagens */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                            <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                                Mensagens Trocadas ({messages.length})
                            </h2>

                            {messages.length === 0 ? (
                                <p className="text-sm text-brand-inactive-text py-4 text-center">Nenhuma mensagem registrada.</p>
                            ) : (
                                <div className="space-y-3">
                                    {messages.map((m: any) => (
                                        <div key={m.id} className="p-3.5 bg-brand-gray dark:bg-dark-border/30 rounded-xl space-y-1">
                                            <div className="flex justify-between text-xs text-brand-inactive-text">
                                                <span className="font-bold">{m.sender_role || "Usuário"}</span>
                                                <span>{formatDateTime(m.created_at)}</span>
                                            </div>
                                            <p className="text-sm text-brand-dark dark:text-dark-heading">{m.message}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "timeline" && (
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                        <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                            Histórico de Eventos
                        </h2>

                        <div className="space-y-4">
                            {events.map((ev: any) => (
                                <div key={ev.id} className="flex items-start gap-3 border-l-2 border-brand-border dark:border-dark-border pl-4 py-1">
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                            {ev.message || ev.event_type}
                                        </p>
                                        <p className="text-xs text-brand-inactive-text">{formatDateTime(ev.created_at)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === "risk" && (
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-6">
                        <div>
                            <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                                Eventos de Risco & Moderação
                            </h2>
                            <div className="space-y-2 mt-3">
                                {riskEvents.length === 0 ? (
                                    <p className="text-sm text-brand-inactive-text">Nenhum evento de risco associado.</p>
                                ) : (
                                    riskEvents.map((e: any) => (
                                        <div key={e.id} className="p-3 bg-red-50 dark:bg-red-950/20 rounded-xl text-sm flex justify-between items-center">
                                            <span>+{e.points} pontos ({e.source_type})</span>
                                            <span className="text-xs text-brand-inactive-text">{formatDate(e.created_at)}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </FadeIn>
    )
}

export default AdminReturnDetailView
