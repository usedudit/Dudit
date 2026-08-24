"use client"

import React, { useState, useTransition, useMemo, useCallback, useEffect } from "react"
import {
    Button,
    Badge,
    Pagination,
    IconPlaceholder,
    AlertModal,
    DefaultModal,
} from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { toast } from "@/hooks/use-notification"
import { PlusIcon, TruckIcon, MailIcon } from "@/lib/icons"
import {
    listDeliveryDriversAdminAction,
    updateDeliveryDriverAdminAction,
    getDeliveryDriverStatsAdminAction,
    listDeliveryDriverInvitationsAdminAction,
    revokeDeliveryDriverInvitationAdminAction,
    resendDeliveryDriverInvitationAdminAction,
} from "@/app/actions/admin/delivery-drivers"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { formatDate, formatDateTime } from "@/lib/utils"
import { useMediaQuery } from "@/components/erp/hooks"
import { useEntityState } from "@/hooks/use-entity-state"
import DeliveryDriversPageControls, {
    type DriverFilterState,
    INITIAL_DRIVER_FILTERS,
} from "./delivery-drivers/DeliveryDriversPageControls"
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
        pendingInvites?: number
    }
}

const ITEMS_PER_PAGE = 8

export default function DeliveryDriversManager({ initialData, initialStats }: DeliveryDriversManagerProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    const [drivers, setDrivers] = useState<any[]>(initialData?.items || [])
    const [invites, setInvites] = useState<any[]>([])
    const [stats, setStats] = useState(initialStats)
    const [statusTab, setStatusTab] = useState("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<DriverFilterState>(INITIAL_DRIVER_FILTERS)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
    const [isPending, startTransition] = useTransition()

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Toggle Modal
    const [toggleTarget, setToggleTarget] = useState<any | null>(null)
    const [revokeTarget, setRevokeTarget] = useState<any | null>(null)

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
                const [res, statsRes, invitesRes] = await Promise.all([
                    listDeliveryDriversAdminAction({ limit: 50 }),
                    getDeliveryDriverStatsAdminAction(),
                    listDeliveryDriverInvitationsAdminAction({ limit: 50 }),
                ])
                if (res.success) {
                    setDrivers(res.items || [])
                }
                if (invitesRes.success) {
                    setInvites(invitesRes.items || [])
                }
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to refresh delivery drivers:", err)
            }
        })
    }, [])

    useEffect(() => {
        // Load initial invites and fresh stats
        listDeliveryDriverInvitationsAdminAction({ limit: 50 })
            .then((res) => {
                if (res.success) setInvites(res.items || [])
            })
            .catch(() => {})
        getDeliveryDriverStatsAdminAction().then(setStats).catch(() => {})
    }, [])

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

    const handleRevokeInvite = () => {
        if (!revokeTarget) return
        startTransition(async () => {
            try {
                const res = await revokeDeliveryDriverInvitationAdminAction(revokeTarget.id)
                if (res.success) {
                    toast.success("Convite revogado com sucesso.")
                    setRevokeTarget(null)
                    refreshDrivers()
                } else {
                    toast.error(res.error || "Erro ao revogar convite.")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado.")
            }
        })
    }

    const handleResendInvite = (inviteId: string) => {
        startTransition(async () => {
            try {
                const res = await resendDeliveryDriverInvitationAdminAction(inviteId)
                if (res.success) {
                    toast.success("Convite reenviado por e-mail com novo link de 7 dias!")
                    refreshDrivers()
                } else {
                    toast.error(res.error || "Erro ao reenviar convite.")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado.")
            }
        })
    }

    const handleCopyInviteLink = (inviteId: string) => {
        // Build link or trigger action
        toast.success("Link do convite pronto para o entregador!")
    }

    // Filter Options
    const cityOptions = useMemo(() => {
        const set = new Set<string>()
        drivers.forEach((d) => { if (d.city) set.add(d.city) })
        return Array.from(set)
    }, [drivers])

    const filterSections: FilterSectionConfig[] = [
        ...(cityOptions.length > 0
            ? [{ id: "city", title: "Cidades", type: "checkbox-list" as const, options: cityOptions }]
            : []),
        { id: "vehicleType", title: "Tipo de Veículo", type: "checkbox-list" as const, options: ["Moto", "Carro"] },
        { id: "status", title: "Status", type: "checkbox-list" as const, options: ["Ativo", "Inativo", "Disponível", "Offline"] },
    ]

    const hasActiveFilters =
        search !== "" ||
        filters.city.length > 0 ||
        filters.vehicleType.length > 0 ||
        filters.status.length > 0

    // Filtered Drivers List
    const filteredDrivers = useMemo(() => {
        const term = search.trim().toLowerCase()

        let result = drivers.filter((d) => {
            // Tab filter
            if (statusTab === "active" && !d.is_active) return false
            if (statusTab === "inactive" && d.is_active) return false
            if (statusTab === "available" && (!d.is_active || d.availability_status !== "available")) return false
            if (statusTab === "offline" && d.is_active && d.availability_status === "available") return false

            // City Filter
            if (filters.city.length > 0 && !filters.city.includes(d.city)) return false

            // Vehicle Filter
            if (filters.vehicleType.length > 0) {
                const match = filters.vehicleType.some((v) => v.toLowerCase() === d.vehicle_type?.toLowerCase())
                if (!match) return false
            }

            // Status Filter
            if (filters.status.length > 0) {
                const isAct = filters.status.includes("Ativo") && d.is_active
                const isDisp = filters.status.includes("Disponível") && d.availability_status === "available"
                const isOff = filters.status.includes("Offline") && d.availability_status === "offline"
                const isNotAct = filters.status.includes("Inativo") && !d.is_active
                if (!isAct && !isDisp && !isOff && !isNotAct) return false
            }

            // Search filter
            if (term) {
                const name = String(d.profile?.full_name || "").toLowerCase()
                const email = String(d.email || "").toLowerCase()
                const phone = String(d.profile?.phone || "").replace(/\D/g, "")
                const city = String(d.city || "").toLowerCase()
                const qPhone = term.replace(/\D/g, "")

                const matchText = name.includes(term) || email.includes(term) || city.includes(term)
                const matchPhone = qPhone && phone.includes(qPhone)
                if (!matchText && !matchPhone) return false
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
                        aVal = (a.profile?.full_name || a.email || "").toLowerCase()
                        bVal = (b.profile?.full_name || b.email || "").toLowerCase()
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
    }, [drivers, statusTab, search, filters, sortConfig])

    // Filtered Invites List
    const filteredInvites = useMemo(() => {
        const term = search.trim().toLowerCase()
        return invites.filter((inv) => {
            if (!term) return true
            const name = String(inv.full_name || "").toLowerCase()
            const email = String(inv.email || "").toLowerCase()
            const phone = String(inv.phone || "").replace(/\D/g, "")
            const city = String(inv.city || "").toLowerCase()
            const qPhone = term.replace(/\D/g, "")
            return name.includes(term) || email.includes(term) || city.includes(term) || (qPhone && phone.includes(qPhone))
        })
    }, [invites, search])

    const isShowingInvites = statusTab === "invites"
    const activeList = isShowingInvites ? filteredInvites : filteredDrivers

    // Pagination
    const totalPages = Math.max(1, Math.ceil(activeList.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return activeList.slice(start, start + ITEMS_PER_PAGE)
    }, [activeList, page])

    // Reset pagination on filter changes
    useMemo(() => {
        setPage(1)
    }, [statusTab, search, filters])

    // Detail View Sub-page
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        return (
            <AdminDeliveryDriverDetailView
                driverId={entityState.entityId}
                onBack={closeEntity}
                onDriverUpdated={refreshDrivers}
            />
        )
    }

    // Create / Invite Sub-page
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
                            Gerencie os entregadores cadastrados, disponibilidade, rotas e convites enviados.
                        </p>
                    </div>

                    <Button onClick={() => openEntity("create")} leftIcon={<PlusIcon size={16} />}>
                        Novo Entregador
                    </Button>
                </div>

                {/* Controls (Tabs + Search + Filters) */}
                <DeliveryDriversPageControls
                    activeTab={statusTab}
                    setActiveTab={setStatusTab}
                    search={search}
                    onSearchChange={setSearch}
                    onOpenFilter={() => setIsFilterSheetOpen(true)}
                    filters={filters}
                    setFilters={setFilters}
                    hasActiveFilters={hasActiveFilters}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    stats={stats}
                />

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-6 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {activeList.length === 0 ? (
                            <FadeIn key="empty" className="w-full">
                                <IconPlaceholder
                                    icon={isShowingInvites ? MailIcon : TruckIcon}
                                    title={isShowingInvites ? "Nenhum convite encontrado" : "Nenhum entregador encontrado"}
                                    subtitle={hasActiveFilters ? "Tente ajustar seus termos de busca ou filtros." : isShowingInvites ? "Você ainda não enviou nenhum convite para entregador." : "Nenhum entregador cadastrado nesta categoria."}
                                    itemButton={isShowingInvites ? {
                                        text: "Convidar Novo Entregador",
                                        action: () => openEntity("create"),
                                    } : hasActiveFilters ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setFilters(INITIAL_DRIVER_FILTERS)
                                            setStatusTab("all")
                                        },
                                        variant: "outline",
                                    } : {
                                        text: "Cadastrar Entregador",
                                        action: () => openEntity("create"),
                                    }}
                                />
                            </FadeIn>
                        ) : isShowingInvites ? (
                            /* INVITES TABLE / VIEW */
                            <FadeIn key="invites-list" className="w-full space-y-4">
                                {/* Mobile Invites View */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((inv: any) => {
                                        const isUsed = !!inv.used_at
                                        const isRevoked = !!inv.revoked_at
                                        const isExpired = !isUsed && !isRevoked && new Date(inv.expires_at) < new Date()
                                        const isPendingInvite = !isUsed && !isRevoked && !isExpired

                                        return (
                                            <div key={inv.id} className="py-4 flex flex-col gap-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="font-bold text-sm text-brand-dark dark:text-dark-heading">{inv.full_name}</p>
                                                        <p className="text-xs text-brand-inactive-text">{inv.email}</p>
                                                    </div>
                                                    <Badge variant={isUsed ? "green" : isRevoked ? "red" : isExpired ? "gray" : "orange"}>
                                                        {isUsed ? "Aceito" : isRevoked ? "Revogado" : isExpired ? "Expirado" : "Pendente"}
                                                    </Badge>
                                                </div>

                                                <div className="flex justify-between items-center text-xs text-brand-inactive-text">
                                                    <span>{inv.city} • {inv.vehicle_type === "moto" ? "Moto" : "Carro"}</span>
                                                    <span>{formatDate(inv.created_at)}</span>
                                                </div>

                                                {isPendingInvite && (
                                                    <div className="flex items-center gap-2 pt-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="text-xs flex-1"
                                                            onClick={() => handleResendInvite(inv.id)}
                                                            disabled={isPending}
                                                        >
                                                            Reenviar E-mail
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            className="text-xs"
                                                            onClick={() => setRevokeTarget(inv)}
                                                            disabled={isPending}
                                                        >
                                                            Revogar
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Desktop Invites View */}
                                {viewMode === "grid" ? (
                                    <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {paginatedItems.map((inv: any) => {
                                            const isUsed = !!inv.used_at
                                            const isRevoked = !!inv.revoked_at
                                            const isExpired = !isUsed && !isRevoked && new Date(inv.expires_at) < new Date()
                                            const isPendingInvite = !isUsed && !isRevoked && !isExpired

                                            return (
                                                <div
                                                    key={inv.id}
                                                    className="bg-white dark:bg-dark-surface p-5 rounded-2xl border border-brand-border dark:border-dark-border hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all flex flex-col justify-between gap-4"
                                                >
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="min-w-0">
                                                            <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                                                                {inv.full_name}
                                                            </h3>
                                                            <p className="text-xs text-brand-inactive-text mt-0.5 truncate">{inv.email}</p>
                                                        </div>
                                                        <Badge variant={isUsed ? "green" : isRevoked ? "red" : isExpired ? "gray" : "orange"}>
                                                            {isUsed ? "Aceito" : isRevoked ? "Revogado" : isExpired ? "Expirado" : "Pendente"}
                                                        </Badge>
                                                    </div>

                                                    <div className="text-xs space-y-1.5 text-brand-inactive-text border-t border-b border-brand-border/50 dark:border-dark-border/50 py-3">
                                                        <div className="flex justify-between">
                                                            <span>Veículo</span>
                                                            <span>{inv.vehicle_type === "moto" ? "Moto" : "Carro"}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>Cidade</span>
                                                            <span className="truncate max-w-[120px]">{inv.city || "-"}</span>
                                                        </div>
                                                    </div>

                                                    {isPendingInvite && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="text-xs flex-1"
                                                                onClick={() => handleResendInvite(inv.id)}
                                                                disabled={isPending}
                                                            >
                                                                Reenviar
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outlinered"
                                                                className="text-xs"
                                                                onClick={() => setRevokeTarget(inv)}
                                                                disabled={isPending}
                                                            >
                                                                Revogar
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                        <div className="overflow-x-auto pb-4 custom-scrollbar">
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                        <th className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                            Entregador Convidado
                                                        </th>
                                                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                            Contato
                                                        </th>
                                                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                            Localização
                                                        </th>
                                                        <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                            Veículo
                                                        </th>
                                                        <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                            Enviado em
                                                        </th>
                                                        <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                            Status
                                                        </th>
                                                        <th className="py-3 px-2 w-44 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                            Ações
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedItems.map((inv: any) => {
                                                        const isUsed = !!inv.used_at
                                                        const isRevoked = !!inv.revoked_at
                                                        const isExpired = !isUsed && !isRevoked && new Date(inv.expires_at) < new Date()
                                                        const isPendingInvite = !isUsed && !isRevoked && !isExpired

                                                        return (
                                                            <tr
                                                                key={inv.id}
                                                                className="bg-white dark:bg-dark-background hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors"
                                                            >
                                                                <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                                                                    <div className="flex flex-col min-w-0">
                                                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                                            {inv.full_name}
                                                                        </span>
                                                                        <span className="text-[11px] font-medium text-brand-inactive-text opacity-70 truncate">
                                                                            {inv.email}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                                                                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                        {inv.phone || "—"}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                                                                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                                        {inv.city}{inv.neighborhood ? ` (${inv.neighborhood})` : ""}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                                                    <div className="flex justify-center">
                                                                        <Badge variant={inv.vehicle_type === "moto" ? "purple" : "blue"}>
                                                                            {inv.vehicle_type === "moto" ? "Moto" : "Carro"}
                                                                        </Badge>
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                                                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                                        {formatDate(inv.created_at)}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                                                    <div className="flex justify-center">
                                                                        <Badge variant={isUsed ? "green" : isRevoked ? "red" : isExpired ? "gray" : "orange"}>
                                                                            {isUsed ? "Aceito" : isRevoked ? "Revogado" : isExpired ? "Expirado" : "Pendente"}
                                                                        </Badge>
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                                                                    {isPendingInvite ? (
                                                                        <div className="flex items-center justify-center gap-2 action-btn" onClick={(e) => e.stopPropagation()}>
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                className="text-xs px-2.5 h-8"
                                                                                onClick={() => handleResendInvite(inv.id)}
                                                                                disabled={isPending}
                                                                                title="Reenviar e-mail de convite"
                                                                            >
                                                                                Reenviar
                                                                            </Button>
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outlinered"
                                                                                className="text-xs px-2.5 h-8"
                                                                                onClick={() => setRevokeTarget(inv)}
                                                                                disabled={isPending}
                                                                                title="Revogar convite"
                                                                            >
                                                                                Revogar
                                                                            </Button>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[13px] text-brand-inactive-text">—</span>
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
                            </FadeIn>
                        ) : (
                            /* DRIVERS LIST / TABLE VIEW */
                            <FadeIn key="drivers-list" className="w-full space-y-4">
                                {/* Mobile Drivers Cards */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((driver: any) => (
                                        <div
                                            key={driver.user_id}
                                            className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                            onClick={() => openEntity("view", driver.user_id)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <UserProfileImage
                                                    fullName={driver.profile?.full_name || driver.email || "Entregador"}
                                                    className="w-10 h-10 text-xs shrink-0"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                        {driver.profile?.full_name || "Sem Nome"}
                                                    </p>
                                                    <p className="text-xs text-brand-inactive-text truncate">{driver.email}</p>
                                                </div>
                                                <Badge variant={driver.is_active ? "green" : "gray"}>
                                                    {driver.is_active ? "Ativo" : "Inativo"}
                                                </Badge>
                                            </div>

                                            <div className="flex justify-between items-center text-xs text-brand-inactive-text pt-1">
                                                <span>{driver.city} • {driver.vehicle_type === "moto" ? "Moto" : "Carro"}</span>
                                                <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                    {driver.availability_status === "available" ? "Disponível" : "Offline"}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop Drivers View */}
                                {viewMode === "grid" ? (
                                    <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {paginatedItems.map((driver: any) => (
                                            <div
                                                key={driver.user_id}
                                                onClick={() => openEntity("view", driver.user_id)}
                                                className="bg-white dark:bg-dark-surface p-5 rounded-2xl border border-brand-border dark:border-dark-border hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all cursor-pointer flex flex-col justify-between gap-4"
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <UserProfileImage
                                                            fullName={driver.profile?.full_name || driver.email || "Entregador"}
                                                            className="w-10 h-10 text-xs shrink-0"
                                                        />
                                                        <div className="min-w-0">
                                                            <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                                                                {driver.profile?.full_name || "Sem Nome"}
                                                            </h3>
                                                            <p className="text-xs text-brand-inactive-text mt-0.5 truncate">{driver.email}</p>
                                                        </div>
                                                    </div>
                                                    <Badge variant={driver.is_active ? "green" : "gray"}>
                                                        {driver.is_active ? "Ativo" : "Inativo"}
                                                    </Badge>
                                                </div>

                                                <div className="text-xs space-y-1.5 text-brand-inactive-text border-t border-b border-brand-border/50 dark:border-dark-border/50 py-3">
                                                    <div className="flex justify-between">
                                                        <span>Cidade</span>
                                                        <span className="truncate max-w-[120px]">{driver.city || "-"}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span>Veículo</span>
                                                        <Badge variant={driver.vehicle_type === "moto" ? "purple" : "blue"}>
                                                            {driver.vehicle_type === "moto" ? "Moto" : "Carro"}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Cadastro</span>
                                                        <span>{formatDate(driver.created_at)}</span>
                                                    </div>
                                                </div>

                                                <div className="flex justify-between items-center">
                                                    <Badge variant={driver.availability_status === "available" ? "green" : "gray"}>
                                                        {driver.availability_status === "available" ? "Disponível" : "Offline"}
                                                    </Badge>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-xs h-8 px-2.5"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setToggleTarget(driver)
                                                        }}
                                                    >
                                                        {driver.is_active ? "Desativar" : "Ativar"}
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                        <div className="overflow-x-auto pb-4 custom-scrollbar">
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                        <th
                                                            onClick={() => handleSort("name")}
                                                            className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Entregador {sortConfig?.key === "name" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                            Contato
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("city")}
                                                            className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Localização {sortConfig?.key === "city" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("vehicle")}
                                                            className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Veículo {sortConfig?.key === "vehicle" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                            Disponibilidade
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("status")}
                                                            className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Status {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th className="py-3 px-2 w-44 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                            Ações
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedItems.map((driver: any) => (
                                                        <tr
                                                            key={driver.user_id}
                                                            className="bg-white dark:bg-dark-background hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors cursor-pointer"
                                                            onClick={() => openEntity("view", driver.user_id)}
                                                        >
                                                            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                                                                <div className="flex items-center gap-3">
                                                                    <UserProfileImage
                                                                        fullName={driver.profile?.full_name || driver.email || "Entregador"}
                                                                        className="w-9 h-9 text-xs shrink-0"
                                                                    />
                                                                    <div className="flex flex-col min-w-0">
                                                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                                            {driver.profile?.full_name || "Sem Nome"}
                                                                        </span>
                                                                        <span className="text-[11px] font-medium text-brand-inactive-text opacity-70 truncate">
                                                                            {driver.email}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                                                                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                    {driver.profile?.phone || "—"}
                                                                </span>
                                                            </td>
                                                            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                                                                <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                                    {driver.city}{driver.neighborhood ? ` (${driver.neighborhood})` : ""}
                                                                </span>
                                                            </td>
                                                            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                                                <div className="flex justify-center">
                                                                    <Badge variant={driver.vehicle_type === "moto" ? "purple" : "blue"}>
                                                                        {driver.vehicle_type === "moto" ? "Moto" : "Carro"}
                                                                    </Badge>
                                                                </div>
                                                            </td>
                                                            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                                                <div className="flex justify-center">
                                                                    <Badge variant={driver.availability_status === "available" ? "green" : "gray"}>
                                                                        {driver.availability_status === "available" ? "Disponível" : "Offline"}
                                                                    </Badge>
                                                                </div>
                                                            </td>
                                                            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                                                <div className="flex justify-center">
                                                                    <Badge variant={driver.is_active ? "green" : "gray"}>
                                                                        {driver.is_active ? "Ativo" : "Inativo"}
                                                                    </Badge>
                                                                </div>
                                                            </td>
                                                            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                                                                <div className="flex items-center justify-center gap-2 action-btn" onClick={(e) => e.stopPropagation()}>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="text-xs h-8 px-2.5"
                                                                        onClick={() => openEntity("view", driver.user_id)}
                                                                    >
                                                                        Detalhes
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant={driver.is_active ? "outlinered" : "outline"}
                                                                        className="text-xs h-8 px-2.5"
                                                                        onClick={() => setToggleTarget(driver)}
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
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>

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
                </div>
            </div>

            {/* Filter Drawer */}
            <FilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => {
                    setFilters(INITIAL_DRIVER_FILTERS)
                    setIsFilterSheetOpen(false)
                }}
            />

            {/* Toggle Status Modal */}
            <AlertModal
                isOpen={!!toggleTarget}
                onClose={() => setToggleTarget(null)}
                onConfirm={handleConfirmToggle}
                title={toggleTarget?.is_active ? "Desativar Entregador" : "Ativar Entregador"}
                description={`Tem certeza que deseja ${toggleTarget?.is_active ? "desativar" : "ativar"} o cadastro de ${toggleTarget?.profile?.full_name || toggleTarget?.email}?`}
                confirmText={toggleTarget?.is_active ? "Desativar" : "Ativar"}
                cancelText="Cancelar"
                variant={toggleTarget?.is_active ? "danger" : "success"}
            />

            {/* Revoke Invite Modal */}
            <AlertModal
                isOpen={!!revokeTarget}
                onClose={() => setRevokeTarget(null)}
                onConfirm={handleRevokeInvite}
                title="Revogar Convite"
                description={`Tem certeza que deseja revogar o convite enviado para ${revokeTarget?.full_name} (${revokeTarget?.email})? O link deixará de funcionar imediatamente.`}
                confirmText="Revogar Convite"
                cancelText="Cancelar"
                variant="danger"
            />
        </FadeIn>
    )
}
