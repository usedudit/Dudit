"use client"

import { useState, useTransition, useMemo, useCallback } from "react"
import Link from "next/link"
import {
    Button,
    Badge,
    Pagination,
    IconPlaceholder,
    AlertModal,
} from "@/components/reusable"
import SubscriptionsPageControls from "@/components/admin/subscriptions/SubscriptionsPageControls"
import { toast } from "@/hooks/use-notification"
import {
    ExportFileIcon,
    StoreIcon,
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
import { useMediaQuery } from "@/components/erp/hooks"
import { formatDate } from "@/lib/utils"

type SortKey = "store" | "partner" | "gateway" | "status" | "date"
type SortDirection = "asc" | "desc"

interface SubscriptionListProps {
    initialData?: CursorPaginatedResult<SubscriptionEntry>
    initialStats?: AdminSubscriptionStats
}

const ITEMS_PER_PAGE = 8

export default function SubscriptionList({ initialData, initialStats }: SubscriptionListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const [subscriptions, setSubscriptions] = useState<SubscriptionEntry[]>(initialData?.data || [])
    const [stats, setStats] = useState<AdminSubscriptionStats | undefined>(initialStats)
    const [statusTab, setStatusTab] = useState("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    const [disconnectTarget, setDisconnectTarget] = useState<SubscriptionEntry | null>(null)
    const [actionReason, setActionReason] = useState("")
    const [isPending, startTransition] = useTransition()

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    const refreshSubscriptions = useCallback(() => {
        startTransition(async () => {
            try {
                const [res, statsRes] = await Promise.all([
                    getSubscriptions(null, 100),
                    getAdminSubscriptionStats(),
                ])
                setSubscriptions(res.data || [])
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to refresh subscriptions:", err)
            }
        })
    }, [])

    const handleConfirmDisconnect = () => {
        if (!disconnectTarget) return
        startTransition(async () => {
            try {
                const res = await forceCancelSubscription(disconnectTarget.partner_id, actionReason || "Revogação administrativa de gateway", "admin-confirmed")
                if (res.success) {
                    toast.success("Conexão do gateway revogada!")
                    setDisconnectTarget(null)
                    setActionReason("")
                    refreshSubscriptions()
                } else {
                    toast.error(res.error || "Erro ao revogar gateway")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    // Instant in-memory filtering (0ms)
    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase()

        let result = subscriptions.filter(item => {
            // Determine status
            const isConnected = !!item.mp_user_id
            const isSuspended = !!item.suspended_at

            if (statusTab === "connected" && (!isConnected || isSuspended)) return false
            if (statusTab === "disconnected" && isConnected) return false
            if (statusTab === "suspended" && !isSuspended) return false

            // Search filter
            if (q) {
                const store = (item.store_name || "").toLowerCase()
                const partner = (item.partner_id || "").toLowerCase()
                const mp = (item.mp_user_id || "").toLowerCase()
                if (!store.includes(q) && !partner.includes(q) && !mp.includes(q)) {
                    return false
                }
            }

            return true
        })

        // In-memory sorting
        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any = ""
                let bVal: any = ""
                switch (sortConfig.key) {
                    case "store":
                        aVal = (a.store_name || "").toLowerCase()
                        bVal = (b.store_name || "").toLowerCase()
                        break
                    case "partner":
                        aVal = (a.partner_id || "").toLowerCase()
                        bVal = (b.partner_id || "").toLowerCase()
                        break
                    case "gateway":
                        aVal = (a.mp_user_id || "").toLowerCase()
                        bVal = (b.mp_user_id || "").toLowerCase()
                        break
                    case "status":
                        aVal = a.suspended_at ? "suspended" : a.mp_user_id ? "connected" : "disconnected"
                        bVal = b.suspended_at ? "suspended" : b.mp_user_id ? "connected" : "disconnected"
                        break
                    case "date":
                        aVal = new Date(a.created_at || 0).getTime()
                        bVal = new Date(b.created_at || 0).getTime()
                        break
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }

        return result
    }, [subscriptions, statusTab, search, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredItems.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredItems, page])

    // Reset to page 1 on filter/tab/search change
    useMemo(() => {
        setPage(1)
    }, [statusTab, search])

    const getStatusMeta = (sub: SubscriptionEntry) => {
        if (sub.suspended_at) return { label: "Suspenso", variant: "orange" as const }
        if (sub.mp_user_id) return { label: "Conectado", variant: "green" as const }
        return { label: "Desconectado", variant: "red" as const }
    }

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; } 
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
                .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

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
                            onClick={() => toast.success("Exportação iniciada em segundo plano")}
                            leftIcon={<ExportFileIcon size={18} />}
                        >
                            Exportar
                        </Button>
                    </div>
                </div>

                {/* Page Controls */}
                <SubscriptionsPageControls
                    activeTab={statusTab}
                    setActiveTab={setStatusTab}
                    search={search}
                    onSearchChange={setSearch}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    stats={stats}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 lg:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                    imageAlt="Nenhuma assinatura"
                                    title="Nenhuma assinatura encontrada"
                                    subtitle={search || statusTab !== "all" ? "Tente ajustar seus filtros de busca." : "Nenhuma conexão registrada nesta categoria."}
                                    itemButton={search || statusTab !== "all" ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setStatusTab("all")
                                        },
                                        variant: "outline",
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((sub) => {
                                        const statusMeta = getStatusMeta(sub)
                                        return (
                                            <div key={sub.partner_id} className="py-4 flex flex-col gap-2.5">
                                                <div className="flex justify-between items-start gap-2">
                                                    <Link
                                                        href={`/ddt-admin/partners?view=${sub.partner_id}`}
                                                        className="flex flex-col gap-0.5 min-w-0"
                                                    >
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading hover:text-brand-green truncate">
                                                            {sub.store_name || "Loja"}
                                                        </span>
                                                        <span className="text-xs text-brand-inactive-text truncate">
                                                            MP ID: {sub.mp_user_id || "Não conectado"}
                                                        </span>
                                                    </Link>
                                                    <Badge variant={statusMeta.variant}>
                                                        {statusMeta.label}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                    <span>{sub.created_at ? formatDate(sub.created_at) : "-"}</span>
                                                    {!!sub.mp_user_id && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => setDisconnectTarget(sub)}
                                                            className="text-xs text-red-600 border-red-200 py-1 h-auto"
                                                        >
                                                            Desconectar
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Desktop View: Grid */}
                                {viewMode === "grid" ? (
                                    <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {paginatedItems.map((sub) => {
                                            const statusMeta = getStatusMeta(sub)
                                            const isConnected = !!sub.mp_user_id
                                            return (
                                                <div
                                                    key={sub.partner_id}
                                                    className="bg-white dark:bg-dark-surface p-5 rounded-2xl border border-brand-border dark:border-dark-border hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all cursor-pointer flex flex-col justify-between gap-4"
                                                >
                                                    <div className="flex justify-between items-start gap-2">
                                                        <Link href={`/ddt-admin/partners?view=${sub.partner_id}`} className="flex items-center gap-3 min-w-0 group">
                                                            <div className="w-10 h-10 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                                                                <StoreIcon className="w-5 h-5 text-brand-inactive-text group-hover:text-brand-green transition-colors" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading group-hover:text-brand-green truncate">
                                                                    {sub.store_name || "Loja Parceira"}
                                                                </h3>
                                                                <p className="text-xs text-brand-inactive-text mt-0.5 truncate">
                                                                    ID: {sub.partner_id.slice(0, 8)}...
                                                                </p>
                                                            </div>
                                                        </Link>
                                                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                                                    </div>

                                                    <div className="text-xs space-y-1.5 text-brand-inactive-text border-t border-b border-brand-border/50 dark:border-dark-border/50 py-3">
                                                        <div className="flex justify-between">
                                                            <span>Mercado Pago ID</span>
                                                            <span className="font-mono truncate max-w-[130px]">{sub.mp_user_id || "-"}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>Conexão</span>
                                                            <span>{sub.created_at ? formatDate(sub.created_at) : "-"}</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-brand-inactive-text">Gateway</span>
                                                        {isConnected ? (
                                                            <Button
                                                                size="sm"
                                                                variant="outlinered"
                                                                className="text-xs h-8 px-2.5"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setDisconnectTarget(sub)
                                                                }}
                                                                disabled={isPending}
                                                            >
                                                                Desconectar
                                                            </Button>
                                                        ) : (
                                                            <span className="text-xs text-brand-inactive-text">-</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    /* Desktop View: Table */
                                    <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                        <div className="overflow-x-auto pb-4 custom-scrollbar">
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                        <th
                                                            onClick={() => handleSort("store")}
                                                            className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Loja / Parceiro {sortConfig?.key === "store" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("gateway")}
                                                            className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Mercado Pago ID {sortConfig?.key === "gateway" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("status")}
                                                            className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Status Split {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("date")}
                                                            className="py-3 px-2 w-36 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Data de Conexão {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th className="py-3 px-2 w-36 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                            Ações
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedItems.map((sub) => {
                                                        const isConnected = !!sub.mp_user_id
                                                        const isSuspended = !!sub.suspended_at
                                                        return (
                                                            <tr
                                                                key={sub.partner_id}
                                                                className="bg-white dark:bg-dark-background hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors"
                                                            >
                                                                <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                                                                    <Link
                                                                        href={`/ddt-admin/partners?view=${sub.partner_id}`}
                                                                        className="flex items-center gap-3 group cursor-pointer"
                                                                    >
                                                                        <div className="w-9 h-9 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                                                                            <StoreIcon className="w-5 h-5 text-brand-inactive-text group-hover:text-brand-green transition-colors" />
                                                                        </div>
                                                                        <div className="flex flex-col min-w-0">
                                                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight group-hover:text-brand-green transition-colors truncate max-w-[220px]">
                                                                                {sub.store_name || "Loja Parceira"}
                                                                            </span>
                                                                            <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                                                                                ID: {sub.partner_id.slice(0, 8)}...
                                                                            </span>
                                                                        </div>
                                                                    </Link>
                                                                </td>

                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                                                                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading font-mono">
                                                                        {sub.mp_user_id || "Não conectado"}
                                                                    </span>
                                                                </td>

                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                                                    <div className="flex justify-center">
                                                                        <Badge variant={isSuspended ? "orange" : isConnected ? "green" : "red"}>
                                                                            {isSuspended ? "Suspenso" : isConnected ? "Conectado" : "Desconectado"}
                                                                        </Badge>
                                                                    </div>
                                                                </td>

                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                                                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                                        {sub.created_at ? formatDate(sub.created_at) : "-"}
                                                                    </span>
                                                                </td>

                                                                <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                                                                    {isConnected ? (
                                                                        <Button
                                                                            variant="outlinered"
                                                                            size="sm"
                                                                            onClick={() => setDisconnectTarget(sub)}
                                                                            disabled={isPending}
                                                                            className="text-xs h-8 px-2.5"
                                                                        >
                                                                            Desconectar
                                                                        </Button>
                                                                    ) : (
                                                                        <span className="text-[13px] text-brand-inactive-text">-</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="pt-4">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                            fixedUntil="lg"
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Modal: Desconectar Gateway */}
            <AlertModal
                isOpen={!!disconnectTarget}
                onClose={() => {
                    setDisconnectTarget(null)
                    setActionReason("")
                }}
                onConfirm={handleConfirmDisconnect}
                title="Revogar Conexão de Pagamento"
                description={`Tem certeza que deseja revogar as credenciais do Mercado Pago da loja ${disconnectTarget?.store_name}? A loja não poderá mais receber pagamentos via split até reautorizar a conexão.`}
                confirmText="Revogar Acesso"
                variant="danger"
            />
        </FadeIn>
    )
}
