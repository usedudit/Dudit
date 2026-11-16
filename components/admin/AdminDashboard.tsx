"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
    Activity,
    CheckCircle2,
    Users,
    ArrowRight,
} from "lucide-react"
import {
    ShieldIcon,
    AlertCircleIcon,
    ReturnIcon,
    WrenchIcon,
    FileTextIcon,
    TagIcon,
    VideoIcon,
    PackageIcon,
    CreditCardIcon,
    ShoppingCartIcon,
    GridIcon,
    AnalyticsIcon,
} from "@/lib/icons"
import { HorizontalKPICard, type KPIItem } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import { RecentActivities } from "@/components/erp/dashboard/RightColumn"
import { IconPlaceholder } from "@/components/reusable"
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

function formatLogToActivity(log: AuditLogRow) {
    const action = (log.action_type || (log as any).action || "") as string
    const meta = (log.metadata || {}) as Record<string, any>
    const adminUser = log.admin_name || log.admin_email?.split("@")[0] || "DUDIT"

    let title = ""
    let description = ""
    let icon = "package"

    if (action === "moderation.approve" || action === "PRODUCT_APPROVE") {
        title = "Produto approved"
        description = meta.reason || meta.admin_reason || "Aprovou o produto na moderação."
        icon = "package"
    } else if (action === "moderation.remove_image") {
        title = "Produto atualizado"
        const count = meta.removed_count || 1
        description = meta.reason || `Removeu ${count} imagem(ns) na moderação.`
        icon = "package"
    } else if (action === "moderation.reject" || action === "PRODUCT_REJECT") {
        title = "Produto rejeitado"
        description = meta.reason || meta.admin_reason || "Rejeitou o produto na moderação."
        icon = "package"
    } else if (action === "moderation.edit_field") {
        title = "Produto atualizado"
        description = meta.reason || "Editou campos do produto na moderação."
        icon = "package"
    } else if (action.startsWith("recurring_subscription") || action.includes("subscription")) {
        title = action.replace(/_/g, " ")
        description = meta.reason || meta.note || meta.summary || "vendedor registrou entrega de item(ns) usando créditos da assinatura"
        icon = "file"
    } else if (action.startsWith("catalog.")) {
        title = action.replace(/_/g, " ")
        description = meta.reason || meta.summary || "Atualização de catálogo de produtos/serviços."
        icon = "package"
    } else if (action === "user.ban" || action === "USER_BAN") {
        title = "Usuário banido"
        description = meta.reason || meta.admin_reason || "Usuário suspenso por violação dos termos."
        icon = "user"
    } else if (action === "user.unban" || action === "USER_UNBAN") {
        title = "Usuário reativado"
        description = meta.reason || "Acesso de usuário restaurado pelo suporte."
        icon = "user"
    } else if (action === "partner.suspend" || action === "PARTNER_SUSPEND") {
        title = "Loja suspensa"
        description = meta.reason || "Operação da loja suspensa preventivamente."
        icon = "user"
    } else if (action === "service_order.update" || action === "SERVICE_ORDER_UPDATE") {
        title = "Ordem de Serviço"
        description = meta.reason || meta.status || "Status da OS alterado pelo administrador."
        icon = "wrench"
    } else if (action === "quote.update" || action === "QUOTE_UPDATE") {
        title = "Orçamento comercial"
        description = meta.reason || meta.status || "Orçamento atualizado pela administração."
        icon = "file"
    } else if (action === "promotion.update" || action === "PROMOTION_UPDATE") {
        title = "Promoção / Cupom"
        description = meta.reason || "Configurações da promoção alteradas."
        icon = "tag"
    } else if (action === "community_video.update" || action === "COMMUNITY_VIDEO_UPDATE") {
        title = "Vídeo da Comunidade"
        description = meta.reason || "Moderação de vídeo curto realizada."
        icon = "file"
    } else if (action === "order.update" || action === "ORDER_UPDATE") {
        title = "Pedido alterado"
        description = meta.reason || "Status ou itens do pedido alterados."
        icon = "cart"
    } else if (action === "return.update" || action === "RETURN_UPDATE") {
        title = "Disputa de devolução"
        description = meta.reason || "Intermediação de devolução/estorno realizada."
        icon = "cart"
    } else {
        const actionMeta = ACTION_LABELS[action]
        title = actionMeta?.label || action.replace(/[._]/g, " ")
        description = meta.reason || meta.admin_reason || meta.note || meta.summary || ""
        if (log.target_type === "service_order") icon = "wrench"
        else if (log.target_type === "quote" || log.target_type === "subscription") icon = "file"
        else if (log.target_type === "promotion") icon = "tag"
        else if (log.target_type === "order" || log.target_type === "return_request") icon = "cart"
        else if (log.target_type === "user" || log.target_type === "partner") icon = "user"
        else icon = "package"
    }

    const logDate = new Date(log.created_at)
    const timeStr = !isNaN(logDate.getTime())
        ? logDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : "00:00"

    return {
        id: log.id,
        date: log.created_at,
        time: timeStr,
        user: adminUser.toUpperCase(),
        title,
        description,
        entityRef: log.target_name || "",
        icon,
    }
}

export default function AdminDashboard({ stats: serverStats }: AdminDashboardProps) {
    const router = useRouter()

    const pendingModeration = serverStats?.pendingModeration ?? 0
    const pendingReports = serverStats?.pendingReports ?? 0
    const pendingReturns = serverStats?.pendingReturns ?? 0
    const openOS = serverStats?.openServiceOrders ?? 0
    const openQuotes = serverStats?.openQuotes ?? 0
    const activeSubs = serverStats?.activeSubscriptions ?? 0
    const bannedUsers = serverStats?.bannedUsers ?? 0
    const recentLogs = serverStats?.recentAuditLogs || []

    const totalUrgentAttention = pendingModeration + pendingReports + pendingReturns

    const kpiItems: KPIItem[] = [
        {
            title: "Moderação Pendente",
            value: pendingModeration,
            href: "/ddt-admin/moderation",
            icon: ShieldIcon,
            badgeText: pendingModeration > 0 ? "Ação requerida" : "Em dia",
            badgeVariant: pendingModeration > 0 ? "orange" : "green",
        },
        {
            title: "Denúncias Ativas",
            value: pendingReports,
            href: "/ddt-admin/reports",
            icon: AlertCircleIcon,
            badgeText: pendingReports > 0 ? "Ação requerida" : "Zero denúncias",
            badgeVariant: pendingReports > 0 ? "red" : "green",
        },
        {
            title: "Trocas & Devoluções",
            value: pendingReturns,
            href: "/ddt-admin/returns",
            icon: ReturnIcon,
            badgeText: pendingReturns > 0 ? "Em andamento" : "Resolvidas",
            badgeVariant: pendingReturns > 0 ? "orange" : "green",
        },
        {
            title: "Ordens de Serviço",
            value: openOS,
            href: "/ddt-admin/ordens-de-servico",
            icon: WrenchIcon,
            badgeText: "Em andamento",
            badgeVariant: "blue",
        },
        {
            title: "Orçamentos Abertos",
            value: openQuotes,
            href: "/ddt-admin/orcamentos",
            icon: FileTextIcon,
            badgeText: "Aguardando",
            badgeVariant: "blue",
        },
    ]

    const quickActions = [
        {
            title: "Ordens de Serviço",
            description: "Gerenciar OS abertas por lojas, status técnico e links públicos",
            href: "/ddt-admin/ordens-de-servico",
            icon: WrenchIcon,
        },
        {
            title: "Orçamentos",
            description: "Visualizar propostas comerciais, portais públicos e edições",
            href: "/ddt-admin/orcamentos",
            icon: FileTextIcon,
        },
        {
            title: "Vídeos da Comunidade",
            description: "Feed de vídeos curtos compartilhados por lojistas e moderação",
            href: "/ddt-admin/videos",
            icon: VideoIcon,
        },
        {
            title: "Campanhas & Cupons",
            description: "Promoções ativas de parceiros e cupons em circulação",
            href: "/ddt-admin/promocoes",
            icon: TagIcon,
        },
        {
            title: "Catálogo de Produtos",
            description: "Itens cadastrados em todas as lojas parceiras, estoque e preços",
            href: "/ddt-admin/catalog/products",
            icon: PackageIcon,
        },
        {
            title: "Planos Recorrentes",
            description: "Planos e mensalidades oferecidos pelas lojas a clientes finais",
            href: "/ddt-admin/catalog/plans",
            icon: CreditCardIcon,
        },
        {
            title: "Pedidos do Marketplace",
            description: "Visão consolidada de todas as vendas, remessas e status",
            href: "/ddt-admin/orders",
            icon: ShoppingCartIcon,
        },
        {
            title: "Faturamento & Reembolsos",
            description: "Métricas financeiras globais e solicitações de estorno",
            href: "/ddt-admin/billing",
            icon: Activity,
        },
    ]

    const formattedActivities = recentLogs.map(formatLogToActivity)

    return (
        <div className="w-full space-y-6 p-4 md:p-8 max-w-[1700px] mx-auto pb-12">
            {/* Header */}
            <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-col gap-2 pt-1">
                    <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                        Visão Geral
                    </h1>
                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                        Monitoramento global da plataforma, marketplace e ecossistema ERP
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/ddt-admin/analytics">
                        <Button variant="outline" className="flex items-center gap-2 text-sm font-semibold border-brand-green/30 text-brand-green hover:bg-brand-green/10">
                            <AnalyticsIcon size={16} /> Analytics & Métricas
                        </Button>
                    </Link>
                </div>
            </header>

            {/* Row 1: KPI Horizontal Card */}
            <div className="w-full">
                <HorizontalKPICard items={kpiItems} />
            </div>

            {/* Row 2: Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                {/* Left Column (8 cols) */}
                <div className="lg:col-span-8 space-y-6">
                    {/* Precisa de Atenção */}
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1 min-h-[260px] flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                    <AlertCircleIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                </div>
                                <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                    Precisa de Atenção {totalUrgentAttention > 0 && `(${totalUrgentAttention})`}
                                </h3>
                            </div>
                            {totalUrgentAttention > 0 && (
                                <span className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-[#fce6e5] text-[#cc4745] dark:bg-red-950/40 dark:text-red-400">
                                    {totalUrgentAttention} pendência{totalUrgentAttention > 1 ? "s" : ""}
                                </span>
                            )}
                        </div>

                        {totalUrgentAttention === 0 ? (
                            <IconPlaceholder
                                title="Tudo em dia!"
                                subtitle="Não há itens na fila de moderação, denúncias ou disputas de devolução pendentes."
                                className="flex-1 py-8"
                            />
                        ) : (
                            <div className="overflow-x-auto -mx-6 px-6">
                                <table className="w-full text-left">
                                    <tbody>
                                        {pendingModeration > 0 && (
                                            <tr
                                                onClick={() => router.push("/ddt-admin/moderation")}
                                                className="border-b border-brand-border dark:border-dark-border last:border-b-0 h-[72px] cursor-pointer transition-colors hover:bg-brand-green-light/5 dark:hover:bg-dark-border/20"
                                            >
                                                <td className="pl-2 align-top pt-3">
                                                    <div className="flex items-start gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                                            <ShieldIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-0.5">
                                                                Moderação Pendente ({pendingModeration})
                                                            </div>
                                                            <div className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                                Existem {pendingModeration} item(ns) na fila aguardando validação ou revisão manual.
                                                            </div>
                                                        </div>
                                                        <div className="pt-1 shrink-0">
                                                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-green-secondary text-brand-green">
                                                                Moderar
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {pendingReports > 0 && (
                                            <tr
                                                onClick={() => router.push("/ddt-admin/reports")}
                                                className="border-b border-brand-border dark:border-dark-border last:border-b-0 h-[72px] cursor-pointer transition-colors hover:bg-brand-green-light/5 dark:hover:bg-dark-border/20"
                                            >
                                                <td className="pl-2 align-top pt-3">
                                                    <div className="flex items-start gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                                            <AlertCircleIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-0.5">
                                                                Denúncias de Usuários ou Lojas ({pendingReports})
                                                            </div>
                                                            <div className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                                Existem {pendingReports} denúncia(s) pendente(s) de análise de conformidade.
                                                            </div>
                                                        </div>
                                                        <div className="pt-1 shrink-0">
                                                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-green-secondary text-brand-green">
                                                                Analisar
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {pendingReturns > 0 && (
                                            <tr
                                                onClick={() => router.push("/ddt-admin/returns")}
                                                className="border-b border-brand-border dark:border-dark-border last:border-b-0 h-[72px] cursor-pointer transition-colors hover:bg-brand-green-light/5 dark:hover:bg-dark-border/20"
                                            >
                                                <td className="pl-2 align-top pt-3">
                                                    <div className="flex items-start gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                                            <ReturnIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-0.5">
                                                                Disputas de Trocas e Reembolsos ({pendingReturns})
                                                            </div>
                                                            <div className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                                {pendingReturns} solicitação(ões) de devolução requerem intermediação do suporte.
                                                            </div>
                                                        </div>
                                                        <div className="pt-1 shrink-0">
                                                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-green-secondary text-brand-green">
                                                                Ver Devoluções
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Operações do Ecossistema */}
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                <GridIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">
                                    Operações do Ecossistema
                                </h3>
                                <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
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
                                        className="p-4 rounded-[18px] border border-brand-border dark:border-dark-border hover:bg-brand-green-light/10 dark:hover:bg-dark-border/20 transition-all flex flex-col justify-between group"
                                    >
                                        <div>
                                            <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0 mb-3 group-hover:scale-105 transition-transform">
                                                <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
                                            </div>
                                            <h4 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors">
                                                {action.title}
                                            </h4>
                                            <p className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body mt-1 line-clamp-2 leading-relaxed">
                                                {action.description}
                                            </p>
                                        </div>
                                        <div className="mt-4 flex items-center text-[12px] font-bold text-brand-inactive-text dark:text-dark-body group-hover:text-brand-green transition-colors gap-1">
                                            <span>Acessar</span>
                                            <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>

                    {/* Status dos Serviços */}
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                    <Activity size={18} className="text-brand-dark dark:text-dark-heading" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">
                                        Status dos Serviços
                                    </h3>
                                    <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                                        Monitoramento da infraestrutura, integrações e segurança
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-brand-green-secondary text-brand-green text-xs font-bold self-start sm:self-center">
                                <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
                                Todos os sistemas online
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-4 rounded-[18px] border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface flex flex-col justify-between">
                                <div className="flex items-center gap-2 text-brand-green font-bold text-sm mb-2">
                                    <CheckCircle2 size={16} /> Mercado Pago
                                </div>
                                <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{activeSubs} Lojas</div>
                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Split de pagamentos ativo</div>
                            </div>
                            <div className="p-4 rounded-[18px] border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface flex flex-col justify-between">
                                <div className="flex items-center gap-2 text-brand-green font-bold text-sm mb-2">
                                    <CheckCircle2 size={16} /> Banco & RLS
                                </div>
                                <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Operacional</div>
                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Supabase PostgreSQL 15</div>
                            </div>
                            <div className="p-4 rounded-[18px] border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface flex flex-col justify-between">
                                <div className="flex items-center gap-2 text-brand-dark dark:text-dark-heading font-bold text-sm mb-2">
                                    <Users size={16} /> Segurança & Contas
                                </div>
                                <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{bannedUsers} Bloqueados</div>
                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Contas restritas por moderação</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column (4 cols) */}
                <div className="lg:col-span-4 space-y-6">
                    <RecentActivities
                        activities={formattedActivities}
                        moreHref="/ddt-admin/audit"
                        limit={8}
                    />
                </div>
            </div>
        </div>
    )
}
