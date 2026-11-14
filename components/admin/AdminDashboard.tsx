"use client"

import React from "react"
import Link from "next/link"
import {
    ShieldAlert,
    Users,
    Activity,
    AlertTriangle,
    CheckCircle2,
    Clock,
    ArrowRight,
    TrendingUp,
    Wrench,
    FileSpreadsheet,
    Tag,
    Video,
    Package,
    Store,
    RotateCcw,
    ShoppingBag,
    CreditCard,
    Check
} from "lucide-react"
import { Badge, type BadgeVariant } from "@/components/reusable/Badge"
import Button from "@/components/reusable/Button"
import type { AdminDashboardStats, AuditLogRow } from "@/lib/admin/types"

interface AdminDashboardProps {
    stats?: AdminDashboardStats | null
}

const ACTION_LABELS: Record<string, { label: string; color: "green" | "red" | "orange" | "blue" | "purple" | "gray" }> = {
    PRODUCT_APPROVE: { label: "Produto Aprovado", color: "green" },
    PRODUCT_REJECT: { label: "Produto Rejeitado", color: "red" },
    PRODUCT_FLAG: { label: "Produto Sinalizado", color: "orange" },
    SERVICE_ORDER_UPDATE: { label: "OS Atualizada", color: "blue" },
    QUOTE_UPDATE: { label: "Orçamento Atualizado", color: "blue" },
    PROMOTION_UPDATE: { label: "Promoção Alterada", color: "purple" },
    COMMUNITY_VIDEO_UPDATE: { label: "Vídeo Moderado", color: "purple" },
    USER_BAN: { label: "Usuário Banido", color: "red" },
    USER_UNBAN: { label: "Usuário Desbloqueado", color: "green" },
    PARTNER_SUSPEND: { label: "Loja Suspensa", color: "red" },
    PARTNER_REACTIVATE: { label: "Loja Reativada", color: "green" },
    ORDER_STATUS_OVERRIDE: { label: "Pedido Alterado", color: "blue" },
    ORDER_REFUND: { label: "Reembolso Emitido", color: "orange" },
    RETURN_DISPUTE_DECIDE: { label: "Disputa Resolvida", color: "orange" },
}

function formatRelativeTime(dateString: string): string {
    const diff = Date.now() - new Date(dateString).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return "Agora mesmo"
    if (minutes < 60) return `Há ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `Há ${hours} h`
    const days = Math.floor(hours / 24)
    if (days === 1) return "Ontem"
    if (days < 30) return `Há ${days} dias`
    return new Date(dateString).toLocaleDateString("pt-BR")
}

export default function AdminDashboard({ stats: serverStats }: AdminDashboardProps) {
    const pendingModeration = serverStats?.pendingModeration ?? 0
    const pendingReports = serverStats?.pendingReports ?? 0
    const pendingReturns = serverStats?.pendingReturns ?? 0
    const openOS = serverStats?.openServiceOrders ?? 0
    const openQuotes = serverStats?.openQuotes ?? 0
    const activeSubs = serverStats?.activeSubscriptions ?? 0
    const bannedUsers = serverStats?.bannedUsers ?? 0
    const recentLogs = serverStats?.recentAuditLogs || []

    const totalUrgentAttention = pendingModeration + pendingReports + pendingReturns

    const kpiCards: Array<{
        label: string
        value: number
        href: string
        icon: React.ComponentType<{ size?: number; className?: string }>
        badge: string
        badgeVariant: BadgeVariant
        color: string
        bg: string
        border: string
    }> = [
        {
            label: "Moderação Pendente",
            value: pendingModeration,
            href: "/ddt-admin/moderation",
            icon: ShieldAlert,
            badge: pendingModeration > 0 ? "Ação requerida" : "Em dia",
            badgeVariant: pendingModeration > 0 ? "orange" : "green",
            color: "text-amber-600 dark:text-amber-400",
            bg: "bg-amber-50 dark:bg-amber-900/20",
            border: "border-amber-200 dark:border-amber-900/30",
        },
        {
            label: "Denúncias Ativas",
            value: pendingReports,
            href: "/ddt-admin/reports",
            icon: AlertTriangle,
            badge: pendingReports > 0 ? "Ação requerida" : "Zero denúncias",
            badgeVariant: pendingReports > 0 ? "red" : "green",
            color: "text-red-600 dark:text-red-400",
            bg: "bg-red-50 dark:bg-red-900/20",
            border: "border-red-200 dark:border-red-900/30",
        },
        {
            label: "Trocas & Devoluções",
            value: pendingReturns,
            href: "/ddt-admin/returns",
            icon: RotateCcw,
            badge: pendingReturns > 0 ? "Em andamento" : "Resolvidas",
            badgeVariant: pendingReturns > 0 ? "orange" : "green",
            color: "text-brand-orange dark:text-orange-400",
            bg: "bg-orange-50 dark:bg-orange-900/20",
            border: "border-orange-200 dark:border-orange-900/30",
        },
        {
            label: "Ordens de Serviço",
            value: openOS,
            href: "/ddt-admin/ordens-de-servico",
            icon: Wrench,
            badge: "Em andamento",
            badgeVariant: "blue",
            color: "text-blue-600 dark:text-blue-400",
            bg: "bg-blue-50 dark:bg-blue-900/20",
            border: "border-blue-200 dark:border-blue-900/30",
        },
        {
            label: "Orçamentos Abertos",
            value: openQuotes,
            href: "/ddt-admin/orcamentos",
            icon: FileSpreadsheet,
            badge: "Aguardando",
            badgeVariant: "cyan",
            color: "text-cyan-600 dark:text-cyan-400",
            bg: "bg-cyan-50 dark:bg-cyan-900/20",
            border: "border-cyan-200 dark:border-cyan-900/30",
        },
        {
            label: "Lojas Integradas MP",
            value: activeSubs,
            href: "/ddt-admin/subscriptions",
            icon: Store,
            badge: "Ativas",
            badgeVariant: "green",
            color: "text-emerald-600 dark:text-emerald-400",
            bg: "bg-emerald-50 dark:bg-emerald-900/20",
            border: "border-emerald-200 dark:border-emerald-900/30",
        },
    ]

    const quickActions = [
        {
            title: "Ordens de Serviço",
            description: "Gerenciar OS abertas por lojas, status técnico e links públicos",
            href: "/ddt-admin/ordens-de-servico",
            icon: Wrench,
            color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20",
        },
        {
            title: "Orçamentos",
            description: "Visualizar propostas comerciais, portais públicos e edições",
            href: "/ddt-admin/orcamentos",
            icon: FileSpreadsheet,
            color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20",
        },
        {
            title: "Vídeos da Comunidade",
            description: "Feed de vídeos curtos compartilhados por lojistas e moderação",
            href: "/ddt-admin/videos",
            icon: Video,
            color: "text-purple-600 bg-purple-50 dark:bg-purple-900/20",
        },
        {
            title: "Campanhas & Cupons",
            description: "Promoções ativas de parceiros e cupons em circulação",
            href: "/ddt-admin/promocoes",
            icon: Tag,
            color: "text-pink-600 bg-pink-50 dark:bg-pink-900/20",
        },
        {
            title: "Catálogo de Produtos",
            description: "Itens cadastrados em todas as lojas, estoque e preços",
            href: "/ddt-admin/catalog/products",
            icon: Package,
            color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20",
        },
        {
            title: "Planos Recorrentes",
            description: "Planos e mensalidades oferecidos pelas lojas a clientes finais",
            href: "/ddt-admin/catalog/plans",
            icon: CreditCard,
            color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20",
        },
        {
            title: "Pedidos do Marketplace",
            description: "Visão consolidada de todas as vendas, remessas e status",
            href: "/ddt-admin/orders",
            icon: ShoppingBag,
            color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20",
        },
        {
            title: "Faturamento & Reembolsos",
            description: "Métricas financeiras globais e solicitações de estorno",
            href: "/ddt-admin/billing",
            icon: Activity,
            color: "text-green-600 bg-green-50 dark:bg-green-900/20",
        },
    ]

    return (
        <div className="p-6 md:p-8 max-w-[1700px] mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[28px] md:text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none mb-2">
                        Visão Geral do Dudit
                    </h1>
                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                        Monitoramento em tempo real do marketplace, ERP das lojas parceiras e trilha de auditoria.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/ddt-admin/analytics">
                        <Button variant="outline" className="flex items-center gap-2 text-sm font-semibold border-brand-green/30 text-brand-green hover:bg-brand-green/10">
                            <TrendingUp size={16} /> Analytics & Métricas
                        </Button>
                    </Link>
                </div>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
                {kpiCards.map((stat, index) => {
                    const Icon = stat.icon
                    return (
                        <Link
                            key={index}
                            href={stat.href}
                            className={`bg-white dark:bg-dark-surface rounded-2xl p-4 md:p-5 border ${stat.border} hover:shadow-md transition-all group flex flex-col justify-between`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className={`w-9 h-9 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center shrink-0`}>
                                    <Icon size={18} />
                                </div>
                                <Badge variant={stat.badgeVariant}>
                                    {stat.badge}
                                </Badge>
                            </div>
                            <div>
                                <h3 className="text-brand-inactive-text dark:text-dark-body text-xs font-semibold uppercase tracking-wider mb-1 line-clamp-1">
                                    {stat.label}
                                </h3>
                                <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors">
                                    {stat.value}
                                </p>
                            </div>
                        </Link>
                    )
                })}
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content Area (Left: 2 Cols) */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Action Required Section */}
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                        <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border flex items-center justify-between bg-gray-50/50 dark:bg-dark-surface/50">
                            <div className="flex items-center gap-2.5 font-bold text-brand-dark dark:text-dark-heading">
                                <AlertTriangle size={18} className="text-brand-orange" />
                                <span>Pendências Operacionais</span>
                            </div>
                            <Badge variant={totalUrgentAttention > 0 ? "orange" : "green"}>
                                {totalUrgentAttention > 0 ? `${totalUrgentAttention} pendências` : "Nenhuma pendência"}
                            </Badge>
                        </div>

                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {totalUrgentAttention === 0 ? (
                                <div className="p-8 text-center flex flex-col items-center justify-center">
                                    <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-900/20 text-brand-green flex items-center justify-center mb-3">
                                        <Check size={24} />
                                    </div>
                                    <h4 className="font-bold text-brand-dark dark:text-dark-heading text-base">Tudo em dia!</h4>
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body max-w-md mt-1">
                                        Não há itens na fila de moderação, denúncias ou disputas de devolução pendentes de ação administrativa.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {pendingModeration > 0 && (
                                        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                                            <div className="flex items-start gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                                                    <ShieldAlert size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                        Produtos / Serviços Aguardando Moderação
                                                    </h4>
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                        Existem <span className="font-semibold text-amber-700 dark:text-amber-400">{pendingModeration}</span> item(ns) na fila aguardando validação ou revisão manual.
                                                    </p>
                                                </div>
                                            </div>
                                            <Link href="/ddt-admin/moderation" className="shrink-0">
                                                <Button variant="outline" className="text-xs font-semibold border-amber-300 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                                                    Moderar Agora
                                                </Button>
                                            </Link>
                                        </div>
                                    )}

                                    {pendingReports > 0 && (
                                        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                                            <div className="flex items-start gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                                                    <AlertTriangle size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                        Denúncias de Usuários ou Lojas
                                                    </h4>
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                        Existem <span className="font-semibold text-red-600 dark:text-red-400">{pendingReports}</span> denúncia(s) pendente(s) de análise de conformidade.
                                                    </p>
                                                </div>
                                            </div>
                                            <Link href="/ddt-admin/reports" className="shrink-0">
                                                <Button variant="outline" className="text-xs font-semibold border-red-300 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                                                    Analisar Denúncias
                                                </Button>
                                            </Link>
                                        </div>
                                    )}

                                    {pendingReturns > 0 && (
                                        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                                            <div className="flex items-start gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-brand-orange dark:text-orange-400 flex items-center justify-center shrink-0 mt-0.5">
                                                    <RotateCcw size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                        Disputas de Trocas e Reembolsos
                                                    </h4>
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                        <span className="font-semibold text-brand-orange">{pendingReturns}</span> solicitação(ões) de devolução requerem intermediação do suporte.
                                                    </p>
                                                </div>
                                            </div>
                                            <Link href="/ddt-admin/returns" className="shrink-0">
                                                <Button variant="outline" className="text-xs font-semibold border-orange-300 dark:border-orange-900/50 text-brand-orange hover:bg-orange-50 dark:hover:bg-orange-900/20">
                                                    Ver Devoluções
                                                </Button>
                                            </Link>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Quick Access to Ecosystem Operations */}
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h3 className="font-bold text-brand-dark dark:text-dark-heading text-lg">
                                    Operações do Ecossistema
                                </h3>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                    Acesso rápido aos fluxos de trabalho do marketplace e dos ERPs das lojas parceiras
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            {quickActions.map((action, i) => {
                                const Icon = action.icon
                                return (
                                    <Link
                                        key={i}
                                        href={action.href}
                                        className="group p-4 rounded-xl border border-brand-border dark:border-dark-border hover:border-brand-green/40 hover:bg-brand-green/[0.02] dark:hover:bg-dark-surface transition-all flex flex-col justify-between"
                                    >
                                        <div>
                                            <div className={`w-10 h-10 rounded-xl ${action.color} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                                                <Icon size={20} />
                                            </div>
                                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors">
                                                {action.title}
                                            </h4>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 line-clamp-2 leading-relaxed">
                                                {action.description}
                                            </p>
                                        </div>
                                        <div className="mt-4 flex items-center text-xs font-semibold text-brand-inactive-text group-hover:text-brand-green transition-colors gap-1">
                                            <span>Acessar</span>
                                            <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>

                    {/* Infrastructure Status */}
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                        <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border flex items-center justify-between">
                            <h3 className="font-bold text-brand-dark dark:text-dark-heading">Status dos Serviços</h3>
                            <span className="text-xs text-brand-green font-semibold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
                                Todos os sistemas online
                            </span>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-4 rounded-xl border border-green-200 dark:border-green-900/30 bg-green-50/50 dark:bg-green-900/10">
                                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold mb-2">
                                    <CheckCircle2 size={16} /> Mercado Pago
                                </div>
                                <div className="text-xl font-bold text-brand-dark dark:text-dark-heading">{activeSubs} Lojas</div>
                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Split de pagamentos ativo</div>
                            </div>
                            <div className="p-4 rounded-xl border border-green-200 dark:border-green-900/30 bg-green-50/50 dark:bg-green-900/10">
                                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold mb-2">
                                    <CheckCircle2 size={16} /> Banco & RLS
                                </div>
                                <div className="text-xl font-bold text-brand-dark dark:text-dark-heading">Operacional</div>
                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Supabase PostgreSQL 15</div>
                            </div>
                            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-900/10">
                                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold mb-2">
                                    <Users size={16} /> Moderação & Bloqueios
                                </div>
                                <div className="text-xl font-bold text-brand-dark dark:text-dark-heading">{bannedUsers} Bloqueados</div>
                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Segurança de contas</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column (Audit Feed) */}
                <div className="space-y-8">
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                        <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border flex items-center justify-between">
                            <h3 className="font-bold text-brand-dark dark:text-dark-heading">Ações Administrativas</h3>
                            <Link href="/ddt-admin/audit" className="text-xs font-semibold text-brand-green hover:underline">
                                Ver todas
                            </Link>
                        </div>
                        <div className="p-6">
                            {recentLogs.length === 0 ? (
                                <div className="text-center py-8 text-brand-inactive-text text-sm">
                                    Nenhum log recente registrado.
                                </div>
                            ) : (
                                <div className="relative border-l border-brand-border dark:border-dark-border ml-3 space-y-6">
                                    {recentLogs.slice(0, 8).map((log: AuditLogRow) => {
                                        const actionMeta = ACTION_LABELS[log.action_type] || {
                                            label: log.action_type.replace(/_/g, " "),
                                            color: "gray" as const,
                                        }
                                        const adminDisplay = log.admin_name || log.admin_email || "Admin Dudit"
                                        const reason = (log.metadata as any)?.reason || (log.metadata as any)?.admin_reason

                                        return (
                                            <div key={log.id} className="relative pl-6">
                                                <div className="absolute -left-[13px] top-1 w-6 h-6 rounded-full bg-white dark:bg-dark-surface border-2 border-brand-border dark:border-dark-border flex items-center justify-center">
                                                    <Clock size={11} className="text-brand-inactive-text" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs font-bold text-brand-dark dark:text-dark-heading line-clamp-1">
                                                            {adminDisplay}
                                                        </span>
                                                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body shrink-0 ml-2">
                                                            {formatRelativeTime(log.created_at)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Badge variant={actionMeta.color}>
                                                            {actionMeta.label}
                                                        </Badge>
                                                    </div>
                                                    {log.target_name && (
                                                        <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                                                            Alvo: <span className="text-brand-dark dark:text-dark-heading">{log.target_name}</span>
                                                        </p>
                                                    )}
                                                    {reason && (
                                                        <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-1 bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-800 italic line-clamp-2">
                                                            &ldquo;{reason}&rdquo;
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            <Link href="/ddt-admin/audit" className="block mt-6">
                                <Button variant="ghost" className="w-full text-xs font-semibold flex items-center justify-center gap-2 border border-brand-border dark:border-dark-border">
                                    Abrir Histórico Completo de Auditoria <ArrowRight size={13} />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
