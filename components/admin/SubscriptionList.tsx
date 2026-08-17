"use client"

import { useState, useTransition, useMemo, useCallback } from "react"
import { Button, Badge, Input, Tabs, TabsList, TabsTrigger, Pagination, IconPlaceholder, AlertModal } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import { toast } from "@/hooks/use-notification"
import {
    SearchIcon,
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
import { formatDate } from "@/lib/utils"

type SortKey = "store" | "partner" | "gateway" | "status" | "date"
type SortDirection = "asc" | "desc"

interface SubscriptionListProps {
    initialData?: CursorPaginatedResult<SubscriptionEntry>
    initialStats?: AdminSubscriptionStats
}

const ITEMS_PER_PAGE = 8

export default function SubscriptionList({ initialData, initialStats }: SubscriptionListProps) {
    const [subscriptions, setSubscriptions] = useState<SubscriptionEntry[]>(initialData?.data || [])
    const [stats, setStats] = useState<AdminSubscriptionStats | undefined>(initialStats)
    const [statusTab, setStatusTab] = useState("all")
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
                            onClick={() => toast.success("Exportação iniciada em segundo plano")}
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
                                badge={stats && <TabCountBadge count={stats.total} variant="gray" />}
                            >
                                Todas
                            </TabsTrigger>
                            <TabsTrigger
                                value="connected"
                                badge={stats && <TabCountBadge count={stats.connected} variant="green" />}
                            >
                                Conectadas
                            </TabsTrigger>
                            <TabsTrigger
                                value="disconnected"
                                badge={stats && <TabCountBadge count={stats.disconnected} variant="red" />}
                            >
                                Desconectadas
                            </TabsTrigger>
                            <TabsTrigger
                                value="suspended"
                                badge={stats && <TabCountBadge count={stats.suspended} variant="orange" />}
                            >
                                Suspensas
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {/* Controls (Search) */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 px-4 md:px-8">
                    <div className="w-full sm:w-80">
                        <Input
                            placeholder="Buscar loja ou Mercado Pago ID..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            prefix={<SearchIcon size={16} className="text-brand-inactive-text" />}
                        />
                    </div>
                </div>

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
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
                                {/* Desktop Table */}
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
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Data de Conexão {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
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
                                                            className="border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/40 dark:hover:bg-dark-border/20 transition-colors"
                                                        >
                                                            <td className="py-4 px-2 pl-6">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                                                                        <StoreIcon className="w-5 h-5 text-brand-inactive-text" />
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                            {sub.store_name || "Loja Parceira"}
                                                                        </span>
                                                                        <span className="text-xs text-brand-inactive-text">
                                                                            ID: {sub.partner_id.slice(0, 8)}...
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            <td className="py-4 px-2">
                                                                <span className="text-sm font-mono text-brand-dark dark:text-dark-heading">
                                                                    {sub.mp_user_id || "Não conectado"}
                                                                </span>
                                                            </td>

                                                            <td className="py-4 px-2 text-center">
                                                                <Badge variant={isSuspended ? "orange" : isConnected ? "green" : "red"}>
                                                                    {isSuspended ? "Suspenso" : isConnected ? "Conectado" : "Desconectado"}
                                                                </Badge>
                                                            </td>

                                                            <td className="py-4 px-2 text-xs text-brand-inactive-text">
                                                                {sub.created_at ? formatDate(sub.created_at) : "-"}
                                                            </td>

                                                            <td className="py-4 px-2 pr-6 text-center">
                                                                {isConnected ? (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => setDisconnectTarget(sub)}
                                                                        className="text-xs text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                                    >
                                                                        Desconectar
                                                                    </Button>
                                                                ) : (
                                                                    <span className="text-xs text-brand-inactive-text">-</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((sub) => {
                                        const isConnected = !!sub.mp_user_id
                                        return (
                                            <div key={sub.partner_id} className="py-4 flex flex-col gap-2.5">
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                            {sub.store_name || "Loja"}
                                                        </span>
                                                        <span className="text-xs text-brand-inactive-text truncate">
                                                            MP ID: {sub.mp_user_id || "Não conectado"}
                                                        </span>
                                                    </div>
                                                    <Badge variant={isConnected ? "green" : "red"}>
                                                        {isConnected ? "Conectado" : "Desconectado"}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                    <span>{sub.created_at ? formatDate(sub.created_at) : "-"}</span>
                                                    {isConnected && (
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
