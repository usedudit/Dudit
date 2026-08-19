"use client"

import React, { useState, useTransition, useMemo, useCallback, useEffect } from "react"
import {
    Button,
    Badge,
    Input,
    Tabs,
    TabsList,
    TabsTrigger,
    Pagination,
    IconPlaceholder,
    AlertModal,
} from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import { toast } from "@/hooks/use-notification"
import {
    SearchIcon,
    ExportFileIcon,
    PlusIcon,
    TruckIcon,
} from "@/lib/icons"
import {
    listDeliveryDriversAdminAction,
    updateDeliveryDriverAdminAction,
    getDeliveryDriverStatsAdminAction,
} from "@/app/actions/admin/delivery-drivers"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { formatDate } from "@/lib/utils"
import { useEntityState } from "@/hooks/use-entity-state"
import { AdminDeliveryDriverInviteView } from "./delivery-drivers/AdminDeliveryDriverInviteView"
import { AdminDeliveryDriverDetailView } from "./delivery-drivers/AdminDeliveryDriverDetailView"

type SortKey = "name" | "city" | "vehicle" | "status" | "date"
type SortDirection = "asc" | "desc"

interface DeliveryDriversManagerProps {
    initialData: {
        items: any[]
        hasMore: boolean
        nextCursor: string | null
    }
    initialStats?: {
        total: number
        active: number
        inactive: number
        available: number
        offline: number
    }
}

const ITEMS_PER_PAGE = 8

export default function DeliveryDriversManager({ initialData, initialStats }: DeliveryDriversManagerProps) {
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    const [drivers, setDrivers] = useState<any[]>(initialData?.items || [])
    const [stats, setStats] = useState(initialStats)
    const [statusTab, setStatusTab] = useState("all")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [isPending, startTransition] = useTransition()

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Toggle Modal
    const [toggleTarget, setToggleTarget] = useState<any | null>(null)

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    const refreshDrivers = useCallback(() => {
        startTransition(async () => {
            try {
                const [res, statsRes] = await Promise.all([
                    listDeliveryDriversAdminAction({ limit: 50 }),
                    getDeliveryDriverStatsAdminAction(),
                ])
                if (res.success) {
                    setDrivers(res.items || [])
                }
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to refresh delivery drivers:", err)
            }
        })
    }, [])

    useEffect(() => {
        if (!initialStats) {
            getDeliveryDriverStatsAdminAction().then(setStats).catch(() => {})
        }
    }, [initialStats])

    const handleConfirmToggle = () => {
        if (!toggleTarget) return
        startTransition(async () => {
            try {
                const res = await updateDeliveryDriverAdminAction({
                    driverId: toggleTarget.user_id,
                    city: toggleTarget.city,
                    neighborhood: toggleTarget.neighborhood,
                    vehicleType: toggleTarget.vehicle_type,
                    isActive: !toggleTarget.is_active,
                    notes: toggleTarget.notes || undefined,
                })
                if (res.success) {
                    toast.success(toggleTarget.is_active ? "Entregador desativado." : "Entregador ativado.")
                    setToggleTarget(null)
                    refreshDrivers()
                } else {
                    toast.error(res.error || "Erro ao atualizar status.")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado.")
            }
        })
    }

    // In-memory instant filter (0ms)
    const filteredDrivers = useMemo(() => {
        const q = search.trim().toLowerCase()

        let result = drivers.filter((d) => {
            // Status Tab
            if (statusTab === "active" && !d.is_active) return false
            if (statusTab === "inactive" && d.is_active) return false
            if (statusTab === "available" && (!d.is_active || d.availability_status !== "available")) return false
            if (statusTab === "offline" && (d.is_active && d.availability_status === "available")) return false

            // Search
            if (q) {
                const name = String(d.profile?.full_name || "").toLowerCase()
                const email = String(d.email || "").toLowerCase()
                const phone = String(d.profile?.phone || "").toLowerCase()
                const city = String(d.city || "").toLowerCase()
                const neighborhood = String(d.neighborhood || "").toLowerCase()

                if (!name.includes(q) && !email.includes(q) && !phone.includes(q) && !city.includes(q) && !neighborhood.includes(q)) {
                    return false
                }
            }

            return true
        })

        // Sorting
        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any = ""
                let bVal: any = ""
                switch (sortConfig.key) {
                    case "name":
                        aVal = (a.profile?.full_name || "").toLowerCase()
                        bVal = (b.profile?.full_name || "").toLowerCase()
                        break
                    case "city":
                        aVal = (a.city || "").toLowerCase()
                        bVal = (b.city || "").toLowerCase()
                        break
                    case "vehicle":
                        aVal = (a.vehicle_type || "").toLowerCase()
                        bVal = (b.vehicle_type || "").toLowerCase()
                        break
                    case "status":
                        aVal = a.is_active ? 1 : 0
                        bVal = b.is_active ? 1 : 0
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
    }, [drivers, statusTab, search, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredDrivers.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredDrivers, page])

    // Reset page on filter/search change
    useMemo(() => {
        setPage(1)
    }, [statusTab, search])

    // Sub-view: Create / Invite (URL: ?create=true)
    if (entityState.isOpen && entityState.action === "create") {
        return (
            <AdminDeliveryDriverInviteView
                onBack={closeEntity}
                onSuccess={() => {
                    closeEntity()
                    refreshDrivers()
                }}
            />
        )
    }

    // Sub-view: Detail (URL: ?view=[driverId])
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        return (
            <AdminDeliveryDriverDetailView
                driverId={entityState.entityId}
                onBack={closeEntity}
                onDriverUpdated={refreshDrivers}
            />
        )
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
                            Entregadores
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie os entregadores credenciados da plataforma, convites e áreas de atuação.
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
                        <Button
                            variant="filled"
                            onClick={() => openEntity("create")}
                            leftIcon={<PlusIcon size={18} />}
                        >
                            Novo Entregador
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
                                Todos
                            </TabsTrigger>
                            <TabsTrigger
                                value="active"
                                badge={stats && <TabCountBadge count={stats.active} variant="green" />}
                            >
                                Ativos
                            </TabsTrigger>
                            <TabsTrigger
                                value="inactive"
                                badge={stats && <TabCountBadge count={stats.inactive} variant="red" />}
                            >
                                Inativos
                            </TabsTrigger>
                            <TabsTrigger
                                value="available"
                                badge={stats && <TabCountBadge count={stats.available} variant="blue" />}
                            >
                                Disponíveis
                            </TabsTrigger>
                            <TabsTrigger
                                value="offline"
                                badge={stats && <TabCountBadge count={stats.offline} variant="gray" />}
                            >
                                Offline
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {/* Search & Actions Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 px-4 md:px-8">
                    <div className="w-full sm:w-80">
                        <Input
                            placeholder="Buscar por nome, email, telefone..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            prefix={<SearchIcon size={16} className="text-brand-inactive-text" />}
                        />
                    </div>
                    <div className="sm:hidden">
                        <Button
                            variant="filled"
                            onClick={() => openEntity("create")}
                            leftIcon={<PlusIcon size={18} />}
                            className="w-full"
                        >
                            Novo Entregador
                        </Button>
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
                                    imageAlt="Nenhum entregador"
                                    title="Nenhum entregador encontrado"
                                    subtitle={search || statusTab !== "all" ? "Tente ajustar seus filtros de busca." : "Nenhum entregador credenciado nesta categoria."}
                                    itemButton={search || statusTab !== "all" ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setStatusTab("all")
                                        },
                                        variant: "outline",
                                    } : {
                                        text: "Convidar Primeiro Entregador",
                                        action: () => openEntity("create"),
                                        variant: "filled",
                                    }}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Desktop View: Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                    <th
                                                        onClick={() => handleSort("name")}
                                                        className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Entregador / Nome {sortConfig?.key === "name" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("city")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Localização {sortConfig?.key === "city" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("vehicle")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Veículo {sortConfig?.key === "vehicle" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Disponibilidade
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("status")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Status {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("date")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Cadastro {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Ações
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((driver) => (
                                                    <tr
                                                        key={driver.user_id}
                                                        className="border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/40 dark:hover:bg-dark-border/20 transition-colors"
                                                    >
                                                        <td className="py-4 px-2 pl-6">
                                                            <div
                                                                className="flex items-center gap-3 cursor-pointer group"
                                                                onClick={() => openEntity("view", driver.user_id)}
                                                            >
                                                                <UserProfileImage
                                                                    fullName={driver.profile?.full_name || "Entregador"}
                                                                    imageUrl={driver.profile?.avatar_url}
                                                                    className="w-10 h-10 text-base shrink-0"
                                                                />
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors truncate">
                                                                        {driver.profile?.full_name || "Entregador"}
                                                                    </span>
                                                                    <span className="text-xs text-brand-inactive-text truncate">
                                                                        {driver.email || driver.profile?.phone || "Sem e-mail"}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        <td className="py-4 px-2">
                                                            <div className="flex flex-col text-sm">
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                                    {driver.city}
                                                                </span>
                                                                <span className="text-xs text-brand-inactive-text">
                                                                    {driver.neighborhood}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        <td className="py-4 px-2">
                                                            <span className="text-sm font-medium text-brand-dark dark:text-dark-heading capitalize">
                                                                {driver.vehicle_type === "moto" ? "Motocicleta" : "Automóvel"}
                                                            </span>
                                                        </td>

                                                        <td className="py-4 px-2 text-center">
                                                            <Badge variant={driver.availability_status === "available" ? "blue" : "gray"}>
                                                                {driver.availability_status === "available" ? "Disponível" : "Offline"}
                                                            </Badge>
                                                        </td>

                                                        <td className="py-4 px-2 text-center">
                                                            <Badge variant={driver.is_active ? "green" : "red"}>
                                                                {driver.is_active ? "Ativo" : "Inativo"}
                                                            </Badge>
                                                        </td>

                                                        <td className="py-4 px-2 text-xs text-brand-inactive-text">
                                                            {formatDate(driver.created_at)}
                                                        </td>

                                                        <td className="py-4 px-2 pr-6 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => openEntity("view", driver.user_id)}
                                                                >
                                                                    Detalhes
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => setToggleTarget(driver)}
                                                                    className={driver.is_active ? "text-red-600 border-red-200 hover:bg-red-50" : "text-brand-green border-brand-green/30 hover:bg-brand-green/10"}
                                                                >
                                                                    {driver.is_active ? "Desativar" : "Ativar"}
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Mobile View: Cards */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((driver) => (
                                        <div
                                            key={driver.user_id}
                                            className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                            onClick={() => openEntity("view", driver.user_id)}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <UserProfileImage
                                                        fullName={driver.profile?.full_name || "Entregador"}
                                                        imageUrl={driver.profile?.avatar_url}
                                                        className="w-10 h-10 text-base shrink-0"
                                                    />
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                            {driver.profile?.full_name || "Entregador"}
                                                        </span>
                                                        <span className="text-xs text-brand-inactive-text truncate">
                                                            {driver.city} • {driver.vehicle_type}
                                                        </span>
                                                    </div>
                                                </div>
                                                <Badge variant={driver.is_active ? "green" : "red"}>
                                                    {driver.is_active ? "Ativo" : "Inativo"}
                                                </Badge>
                                            </div>

                                            <div className="flex items-center justify-between text-xs text-brand-inactive-text pt-1">
                                                <span>{formatDate(driver.created_at)}</span>
                                                <span className="font-semibold text-brand-green">Ver detalhes →</span>
                                            </div>
                                        </div>
                                    ))}
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

            {/* Modal: Ativar/Desativar */}
            <AlertModal
                isOpen={!!toggleTarget}
                onClose={() => setToggleTarget(null)}
                onConfirm={handleConfirmToggle}
                title={toggleTarget?.is_active ? "Desativar Entregador" : "Ativar Entregador"}
                description={
                    toggleTarget?.is_active
                        ? `Tem certeza que deseja desativar o cadastro de ${toggleTarget?.profile?.full_name || toggleTarget?.email}? O entregador não receberá novas corridas.`
                        : `Deseja reativar o acesso de ${toggleTarget?.profile?.full_name || toggleTarget?.email}?`
                }
                confirmText={toggleTarget?.is_active ? "Desativar" : "Ativar"}
                variant={toggleTarget?.is_active ? "danger" : "success"}
            />
        </FadeIn>
    )
}
