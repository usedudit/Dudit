"use client"

import { useState, useTransition, useMemo, useEffect, useCallback } from "react"
import { Button, Badge, Input, Tabs, TabsList, TabsTrigger, Pagination, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import DestructiveActionModal from "@/components/admin/DestructiveActionModal"
import { toast } from "@/hooks/use-notification"
import {
    SearchIcon,
    CreditCardIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    AlertTriangleIcon,
    ExportFileIcon,
    StoreIcon,
    ShieldIcon,
} from "@/lib/icons"
import type { SubscriptionEntry, CursorPaginatedResult } from "@/lib/admin/types"
import {
    getSubscriptions,
    getAdminSubscriptionStats,
    forceCancelSubscription,
    type AdminSubscriptionStats,
} from "@/app/actions/admin/subscriptions"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { formatDate } from "@/lib/utils"

interface SubscriptionListProps {
    initialData?: CursorPaginatedResult<SubscriptionEntry>
    initialStats?: AdminSubscriptionStats
}

export default function SubscriptionList({ initialData, initialStats }: SubscriptionListProps) {
    const [subscriptions, setSubscriptions] = useState<SubscriptionEntry[]>(initialData?.data || [])
    const [stats, setStats] = useState<AdminSubscriptionStats | undefined>(initialStats)
    const [statusTab, setStatusTab] = useState("all")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const itemsPerPage = 12

    const [disconnectTarget, setDisconnectTarget] = useState<SubscriptionEntry | null>(null)
    const [isLoading, setIsLoading] = useState(!initialData)
    const [isPending, startTransition] = useTransition()

    const fetchSubscriptions = useCallback(() => {
        setIsLoading(true)
        startTransition(async () => {
            try {
                const [res, statsRes] = await Promise.all([
                    getSubscriptions(null, 100, statusTab === "all" ? undefined : statusTab),
                    getAdminSubscriptionStats(),
                ])
                setSubscriptions(res.data || [])
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to fetch subscriptions:", err)
                toast.error("Erro ao carregar assinaturas")
            } finally {
                setIsLoading(false)
            }
        })
    }, [statusTab])

    useEffect(() => {
        fetchSubscriptions()
        setPage(1)
    }, [fetchSubscriptions])

    const handleConfirmDisconnect = (reason: string) => {
        if (!disconnectTarget) return
        startTransition(async () => {
            try {
                const res = await forceCancelSubscription(disconnectTarget.partner_id, reason, "admin-confirmed")
                if (res.success) {
                    toast.success("Conexão do gateway revogada!")
                    setDisconnectTarget(null)
                    fetchSubscriptions()
                } else {
                    toast.error(res.error || "Erro ao revogar gateway")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    // Filter by search
    const filteredItems = useMemo(() => {
        return subscriptions.filter(item => {
            if (!search) return true
            const q = search.toLowerCase()
            return (
                item.store_name?.toLowerCase().includes(q) ||
                item.partner_id?.toLowerCase().includes(q) ||
                item.mp_user_id?.toLowerCase().includes(q)
            )
        })
    }, [subscriptions, search])

    // Pagination
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage)
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return filteredItems.slice(start, start + itemsPerPage)
    }, [filteredItems, page])

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                {/* Desktop Header */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Assinaturas & Gateways
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Monitore conexões de split e pagamento do Mercado Pago de cada vendedor parceiro.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={() => toast.success("Exportação iniciada")}
                            leftIcon={<ExportFileIcon size={18} />}
                        >
                            Exportar
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mb-6 px-4 md:px-8">
                    <Tabs value={statusTab} onValueChange={setStatusTab}>
                        <TabsList className="px-0">
                            <TabsTrigger
                                value="all"
                                icon={CreditCardIcon}
                                badge={stats && <TabCountBadge count={stats.total} variant="gray" />}
                            >
                                Todos
                            </TabsTrigger>
                            <TabsTrigger
                                value="connected"
                                icon={CheckCircleIcon}
                                badge={stats && <TabCountBadge count={stats.connected} variant="green" />}
                            >
                                Conectados
                            </TabsTrigger>
                            <TabsTrigger
                                value="disconnected"
                                icon={CancelCircleIcon}
                                badge={stats && <TabCountBadge count={stats.disconnected} variant="yellow" />}
                            >
                                Desconectados
                            </TabsTrigger>
                            <TabsTrigger
                                value="suspended"
                                icon={AlertTriangleIcon}
                                badge={stats && <TabCountBadge count={stats.suspended} variant="red" />}
                            >
                                Suspensos
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {/* Search Bar */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full px-4 md:px-8 mb-6">
                    <div className="w-full sm:w-96">
                        <Input
                            placeholder="Buscar por loja ou ID de parceiro..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            variant="full-rounded"
                            className="h-[42px]"
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 && !isLoading ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemLojas.png"
                                    imageAlt="Nenhum parceiro"
                                    title="Nenhuma assinatura encontrada"
                                    subtitle={search ? "Tente ajustar sua busca." : "Nenhum parceiro cadastrado nesta categoria."}
                                    itemButton={search ? {
                                        text: "Limpar Busca",
                                        action: () => setSearch(""),
                                        variant: "outline"
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : isLoading ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[400px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Desktop Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">Loja / Parceiro</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Gateway Mercado Pago</th>
                                                    <th className="py-3 px-2 w-36 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Conectado em</th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Status MP</th>
                                                    <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Acesso ERP</th>
                                                    <th className="py-3 px-2 w-28 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((sub) => (
                                                    <tr
                                                        key={sub.partner_id}
                                                        className="group hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 transition-colors"
                                                    >
                                                        <td className="py-3 px-2 pl-6 border-b border-brand-border dark:border-dark-border">
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{sub.store_name}</span>
                                                                <span className="text-xs text-brand-inactive-text font-mono truncate">{sub.partner_id}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-2 border-b border-brand-border dark:border-dark-border">
                                                            {sub.mp_user_id ? (
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs font-mono font-bold text-brand-dark dark:text-dark-heading">ID: {sub.mp_user_id}</span>
                                                                    <span className="text-[11px] text-brand-inactive-text">{sub.mp_live_mode ? "Ambiente Produção" : "Sandbox / Teste"}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-brand-inactive-text">Não conectado</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-2 border-b border-brand-border dark:border-dark-border text-center">
                                                            <span className="text-xs text-brand-inactive-text">
                                                                {sub.mp_connected_at ? formatDate(sub.mp_connected_at) : "—"}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-2 border-b border-brand-border dark:border-dark-border text-center">
                                                            <Badge variant={sub.mp_user_id ? "green" : "orange"}>
                                                                {sub.mp_user_id ? "Conectado" : "Pendente"}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-3 px-2 border-b border-brand-border dark:border-dark-border text-center">
                                                            <Badge variant={sub.erp_disabled ? "red" : "green"}>
                                                                {sub.erp_disabled ? "Bloqueado" : "Ativo"}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-3 px-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                                                            {sub.mp_user_id && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setDisconnectTarget(sub)}
                                                                    className="text-xs font-bold text-red-500 hover:text-red-600"
                                                                >
                                                                    Desconectar
                                                                </Button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="pt-4">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Modal de Desconexão */}
            <DestructiveActionModal
                isOpen={!!disconnectTarget}
                onClose={() => setDisconnectTarget(null)}
                onConfirm={handleConfirmDisconnect}
                title="Desconectar Gateway Mercado Pago"
                description="O parceiro deixará de receber pagamentos divididos até reconectar sua conta."
                entityName={disconnectTarget?.store_name || disconnectTarget?.partner_id || ""}
                consequences={[
                    "Invalidação de tokens do Mercado Pago salvos",
                    "Pausa nos repasses automáticos de comissão",
                    "Registro obrigatório no Audit Log",
                ]}
                confirmText="Confirmar Desconexão"
                isPending={isPending}
            />
        </FadeIn>
    )
}
