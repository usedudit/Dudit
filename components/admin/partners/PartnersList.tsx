"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { Button, Badge, IconPlaceholder, Pagination, AlertModal, ThreeDotsLoader } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import { AdminEnforcementModal } from "../AdminEnforcementModal"
import PartnerListRow from "./PartnerListRow"
import PartnersPageControls from "./PartnersPageControls"
import AdminPartnerDetailView from "./AdminPartnerDetailView"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { StoreIcon, ExportFileIcon, FilterIcon } from "@/lib/icons"
import type { EnforcementPartner, CursorPaginatedResult } from "@/lib/admin/types"
import {
    getPartners,
    suspendPartner,
    unsuspendPartner,
    suspendStore,
    unsuspendStore,
    toggleStoreShowcase,
    disableTenantAccess,
    enableTenantAccess,
    getAdminPartnerStats,
    type AdminPartnerStats,
} from "@/app/actions/admin/enforcement"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatDate } from "@/lib/utils"
import { toast } from "@/hooks/use-notification"
import { useEntityState } from "@/hooks/use-entity-state"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import {
    EMPTY_DATE_PERIOD,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"

type SortKey = "store" | "owner" | "risk" | "date" | "status"
type SortDirection = "asc" | "desc"

interface PartnersListProps {
    initialData: CursorPaginatedResult<EnforcementPartner>
    initialStats?: AdminPartnerStats
}

const ITEMS_PER_PAGE = 8

export default function PartnersList({ initialData, initialStats }: PartnersListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    const [statusTab, setStatusTab] = useState("all")
    const [isPending, startTransition] = useTransition()

    // Modals
    const [suspendStoreTarget, setSuspendStoreTarget] = useState<EnforcementPartner | null>(null)
    const [unsuspendStoreTarget, setUnsuspendStoreTarget] = useState<EnforcementPartner | null>(null)
    const [disableShowcaseTarget, setDisableShowcaseTarget] = useState<EnforcementPartner | null>(null)
    const [enableShowcaseTarget, setEnableShowcaseTarget] = useState<EnforcementPartner | null>(null)
    const [disableERPTarget, setDisableERPTarget] = useState<EnforcementPartner | null>(null)
    const [enableERPTarget, setEnableERPTarget] = useState<EnforcementPartner | null>(null)
    const [suspendPartnerTarget, setSuspendPartnerTarget] = useState<EnforcementPartner | null>(null)
    const [unsuspendPartnerTarget, setUnsuspendPartnerTarget] = useState<EnforcementPartner | null>(null)

    // Stats
    const [stats, setStats] = useState<AdminPartnerStats | undefined>(initialStats)

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Filters - DECLARED BEFORE useEntityPage
    const INITIAL_FILTERS = useMemo(() => ({
        storeName: "",
        ownerName: "",
        ownerEmail: "",
        datePeriod: { ...EMPTY_DATE_PERIOD } as DatePeriodFilterValue,
    }), [])

    const [filters, setFilters] = useState(INITIAL_FILTERS)

    const hasActiveQuery =
        statusTab !== "all" ||
        filters.storeName.trim().length > 0 ||
        filters.ownerName.trim().length > 0 ||
        filters.ownerEmail.trim().length > 0 ||
        isDatePeriodFilterActive(filters.datePeriod)

    const entityPage = useEntityPage<any, any, any>({
        entityType: "partners",
        partnerId: "admin",
        queryKey: ["admin-partners", statusTab, filters.storeName, filters.ownerName, filters.ownerEmail, filters.datePeriod],
        initialItems: [],
        initialNextCursor: null,
        initialHasMore: false,
        skipInitialData: true,
        enabled: hasActiveQuery,
        fetchPageFn: async ({ cursor }) => {
            const res = await getPartners(
                cursor,
                20,
                undefined,
                statusTab === "all" ? undefined : statusTab,
                filters.datePeriod.from || undefined,
                filters.datePeriod.to || undefined,
                {
                    storeName: filters.storeName.trim() || undefined,
                    ownerName: filters.ownerName.trim() || undefined,
                    ownerEmail: filters.ownerEmail.trim() || undefined,
                },
            )
            return { items: res.data || [], nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((p: any) => String(p?.id || ""), []),
        getDetailFn: async (id: string) => {
            return null
        },
        listToDetail: (item) => ({ ...item, __partial: true }),
        staleTime: 30_000,
    })

    const {
        items: partners,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isListLoading,
        entityState: epEntityState,
        openEntity: epOpenEntity,
        closeEntity: epCloseEntity,
        afterMutation,
    } = entityPage

    // Filter Sheet state
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    const handleMutation = useCallback(() => {
        afterMutation()
    }, [afterMutation])

    const handleConfirmSuspendStore = async ({ reason, durationDays, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        if (!suspendStoreTarget) return
        try {
            const res = await suspendStore(suspendStoreTarget.id, reason, durationDays, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success(`Loja suspensa com sucesso! ${res.caseId ? `Protocolo: ${res.caseId}` : ""}`)
                setSuspendStoreTarget(null)
                handleMutation()
            } else {
                toast.error(res.error || "Erro ao suspender loja")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    const handleConfirmUnsuspendStore = async ({ reason, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        if (!unsuspendStoreTarget) return
        try {
            const res = await unsuspendStore(unsuspendStoreTarget.id, reason, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success("Loja reativada com sucesso!")
                setUnsuspendStoreTarget(null)
                handleMutation()
            } else {
                toast.error(res.error || "Erro ao reativar loja")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    const handleConfirmDisableShowcase = async ({ reason, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        if (!disableShowcaseTarget) return
        try {
            const res = await toggleStoreShowcase(disableShowcaseTarget.id, false, reason, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success("Vitrine online desativada com sucesso!")
                setDisableShowcaseTarget(null)
                handleMutation()
            } else {
                toast.error(res.error || "Erro ao desativar vitrine online")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    const handleConfirmEnableShowcase = async ({ reason, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        if (!enableShowcaseTarget) return
        try {
            const res = await toggleStoreShowcase(enableShowcaseTarget.id, true, reason, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success("Vitrine online ativada com sucesso!")
                setEnableShowcaseTarget(null)
                handleMutation()
            } else {
                toast.error(res.error || "Erro ao ativar vitrine online")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    const handleConfirmDisableERP = async ({ reason, durationDays, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        if (!disableERPTarget) return
        try {
            const res = await disableTenantAccess(disableERPTarget.id, reason, durationDays, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success(`Acesso ao ERP desativado! ${res.caseId ? `Protocolo: ${res.caseId}` : ""}`)
                setDisableERPTarget(null)
                handleMutation()
            } else {
                toast.error(res.error || "Erro ao desativar ERP")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    const handleConfirmEnableERP = async ({ reason, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        if (!enableERPTarget) return
        try {
            const res = await enableTenantAccess(enableERPTarget.id, reason, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success("Acesso ao ERP restabelecido com sucesso!")
                setEnableERPTarget(null)
                handleMutation()
            } else {
                toast.error(res.error || "Erro ao reativar ERP")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    const handleConfirmSuspendPartner = async ({ reason, durationDays, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        if (!suspendPartnerTarget) return
        try {
            const res = await suspendPartner(suspendPartnerTarget.id, reason, durationDays, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success(`Parceiro e lojas suspensos! ${res.caseId ? `Protocolo: ${res.caseId}` : ""}`)
                setSuspendPartnerTarget(null)
                handleMutation()
            } else {
                toast.error(res.error || "Erro ao suspender parceiro")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    const handleConfirmUnsuspendPartner = async ({ reason, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        if (!unsuspendPartnerTarget) return
        try {
            const res = await unsuspendPartner(unsuspendPartnerTarget.id, reason, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success("Parceiro e lojas reativados com sucesso!")
                setUnsuspendPartnerTarget(null)
                handleMutation()
            } else {
                toast.error(res.error || "Erro ao reativar parceiro")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    // Pagination - DECLARED BEFORE useEffect
    const [page, setPage] = useState(1)
    useEffect(() => {
        setPage(1)
    }, [statusTab, filters])

    // In-memory sorting (search and status are done server-side)
    const sortedPartners = useMemo(() => {
        let result = [...(partners || [])]

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any = ""
                let bVal: any = ""
                switch (sortConfig.key) {
                    case "store":
                        aVal = (a.store_name || "").toLowerCase()
                        bVal = (b.store_name || "").toLowerCase()
                        break
                    case "owner":
                        aVal = (a.owner_name || "").toLowerCase()
                        bVal = (b.owner_name || "").toLowerCase()
                        break
                    case "risk":
                        aVal = Number(a.risk_score || 0)
                        bVal = Number(b.risk_score || 0)
                        break
                    case "date":
                        aVal = new Date(a.created_at).getTime()
                        bVal = new Date(b.created_at).getTime()
                        break
                    case "status":
                        aVal = a.suspended_at ? "suspended" : "active"
                        bVal = b.suspended_at ? "suspended" : "active"
                        break
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }

        return result
    }, [partners, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.ceil(sortedPartners.length / ITEMS_PER_PAGE) || 1
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return sortedPartners.slice(start, start + ITEMS_PER_PAGE)
    }, [sortedPartners, page])

    // If viewing detail of a specific partner via URL (?view=id)
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        return (
            <AdminPartnerDetailView
                storeId={entityState.entityId}
                onBack={closeEntity}
                onPartnerUpdated={handleMutation}
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
                            Lojas & Parceiros
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Monitore lojas credenciadas, pontuação de risco, conformidade e auditoria.
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
                <PartnersPageControls
                    statusTab={statusTab}
                    setStatusTab={setStatusTab}
                    onOpenFilter={() => setIsFilterSheetOpen(true)}
                    chips={
                        <>
                            {filters.storeName.trim() && (
                                <FilterChip
                                    label="Loja"
                                    value={filters.storeName.trim()}
                                    onRemove={() => setFilters((p) => ({ ...p, storeName: "" }))}
                                />
                            )}
                            {filters.ownerName.trim() && (
                                <FilterChip
                                    label="Proprietário"
                                    value={filters.ownerName.trim()}
                                    onRemove={() => setFilters((p) => ({ ...p, ownerName: "" }))}
                                />
                            )}
                            {filters.ownerEmail.trim() && (
                                <FilterChip
                                    label="E-mail"
                                    value={filters.ownerEmail.trim()}
                                    onRemove={() => setFilters((p) => ({ ...p, ownerEmail: "" }))}
                                />
                            )}
                        </>
                    }
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 lg:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {isListLoading ? (
                            <FadeIn key="loading" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : paginatedItems.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                    imageAlt="Nenhum parceiro"
                                    title={hasActiveQuery ? "Nenhuma loja encontrada" : "Busque lojas e parceiros usando os filtros"}
                                    subtitle={hasActiveQuery ? "Tente ajustar seus filtros de busca." : "Clique em Filtros e Busca para pesquisar por nome da loja, proprietário ou e-mail."}
                                    itemButton={hasActiveQuery ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setFilters(INITIAL_FILTERS)
                                            setStatusTab("all")
                                        },
                                        variant: "outline",
                                    } : {
                                        text: "Abrir Filtros",
                                        action: () => setIsFilterSheetOpen(true),
                                        variant: "outline",
                                    }}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((partner) => {
                                        const isSuspended = !!partner.suspended_at || !partner.is_active
                                        return (
                                            <div
                                                key={partner.id}
                                                className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                                onClick={() => openEntity("view", partner.id)}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                            {partner.store_name}
                                                        </span>
                                                        <span className="text-xs text-brand-inactive-text truncate">
                                                            {partner.owner_name || "Lojista"}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <Badge variant={partner.risk_score >= 50 ? "red" : partner.risk_score >= 25 ? "orange" : "gray"}>
                                                            {partner.risk_score || 0} pts
                                                        </Badge>
                                                        <Badge variant={isSuspended ? "red" : "green"}>
                                                            {isSuspended ? "Suspensa" : "Ativa"}
                                                        </Badge>
                                                        {partner.is_showcase_active === false && (
                                                            <Badge variant="orange">Vitrine Off</Badge>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                    <span>{formatDate(partner.created_at)}</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Desktop View: Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                    <th
                                                        onClick={() => handleSort("store")}
                                                        className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Loja {sortConfig?.key === "store" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("owner")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Proprietário {sortConfig?.key === "owner" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("date")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Cadastro {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("status")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Status {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Ações
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((partner) => (
                                                    <PartnerListRow
                                                        key={partner.id}
                                                        partner={partner}
                                                        isPending={isPending}
                                                        onView={() => openEntity("view", partner.id)}
                                                        onSuspendStore={() => setSuspendStoreTarget(partner)}
                                                        onUnsuspendStore={() => setUnsuspendStoreTarget(partner)}
                                                        onDisableShowcase={() => setDisableShowcaseTarget(partner)}
                                                        onEnableShowcase={() => setEnableShowcaseTarget(partner)}
                                                        onDisableERP={() => setDisableERPTarget(partner)}
                                                        onEnableERP={() => setEnableERPTarget(partner)}
                                                        onSuspendPartner={() => setSuspendPartnerTarget(partner)}
                                                        onUnsuspendPartner={() => setUnsuspendPartnerTarget(partner)}
                                                    />
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
                                            fixedUntil="lg"
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* 1. Modal: Suspender Loja (Apenas esta filial) */}
            {suspendStoreTarget && (
                <AdminEnforcementModal
                    isOpen={!!suspendStoreTarget}
                    onClose={() => setSuspendStoreTarget(null)}
                    onConfirm={handleConfirmSuspendStore}
                    actionType="suspend"
                    scope="store"
                    entityId={suspendStoreTarget.id}
                    entityName={suspendStoreTarget.store_name}
                    currentRiskScore={suspendStoreTarget.risk_score}
                />
            )}

            {/* 2. Modal: Reativar Loja (Apenas esta filial) */}
            {unsuspendStoreTarget && (
                <AdminEnforcementModal
                    isOpen={!!unsuspendStoreTarget}
                    onClose={() => setUnsuspendStoreTarget(null)}
                    onConfirm={handleConfirmUnsuspendStore}
                    actionType="unsuspend"
                    scope="store"
                    entityId={unsuspendStoreTarget.id}
                    entityName={unsuspendStoreTarget.store_name}
                    currentRiskScore={unsuspendStoreTarget.risk_score}
                />
            )}

            {/* 2b. Modal: Desativar Vitrine Online */}
            {disableShowcaseTarget && (
                <AdminEnforcementModal
                    isOpen={!!disableShowcaseTarget}
                    onClose={() => setDisableShowcaseTarget(null)}
                    onConfirm={handleConfirmDisableShowcase}
                    actionType="suspend"
                    scope="showcase"
                    entityId={disableShowcaseTarget.id}
                    entityName={disableShowcaseTarget.store_name}
                    currentRiskScore={disableShowcaseTarget.risk_score}
                />
            )}

            {/* 2c. Modal: Ativar Vitrine Online */}
            {enableShowcaseTarget && (
                <AdminEnforcementModal
                    isOpen={!!enableShowcaseTarget}
                    onClose={() => setEnableShowcaseTarget(null)}
                    onConfirm={handleConfirmEnableShowcase}
                    actionType="unsuspend"
                    scope="showcase"
                    entityId={enableShowcaseTarget.id}
                    entityName={enableShowcaseTarget.store_name}
                    currentRiskScore={enableShowcaseTarget.risk_score}
                />
            )}

            {/* 3. Modal: Desativar Acesso ao ERP */}
            {disableERPTarget && (
                <AdminEnforcementModal
                    isOpen={!!disableERPTarget}
                    onClose={() => setDisableERPTarget(null)}
                    onConfirm={handleConfirmDisableERP}
                    actionType="suspend"
                    scope="erp"
                    entityId={disableERPTarget.id}
                    entityName={disableERPTarget.store_name}
                    currentRiskScore={disableERPTarget.risk_score}
                />
            )}

            {/* 4. Modal: Reativar Acesso ao ERP */}
            {enableERPTarget && (
                <AdminEnforcementModal
                    isOpen={!!enableERPTarget}
                    onClose={() => setEnableERPTarget(null)}
                    onConfirm={handleConfirmEnableERP}
                    actionType="unsuspend"
                    scope="erp"
                    entityId={enableERPTarget.id}
                    entityName={enableERPTarget.store_name}
                    currentRiskScore={enableERPTarget.risk_score}
                />
            )}

            {/* 5. Modal: Suspender Parceiro Completo */}
            {suspendPartnerTarget && (
                <AdminEnforcementModal
                    isOpen={!!suspendPartnerTarget}
                    onClose={() => setSuspendPartnerTarget(null)}
                    onConfirm={handleConfirmSuspendPartner}
                    actionType="suspend"
                    scope="partner"
                    entityId={suspendPartnerTarget.id}
                    entityName={suspendPartnerTarget.store_name}
                    currentRiskScore={suspendPartnerTarget.risk_score}
                />
            )}

            {/* 6. Modal: Reativar Parceiro Completo */}
            {unsuspendPartnerTarget && (
                <AdminEnforcementModal
                    isOpen={!!unsuspendPartnerTarget}
                    onClose={() => setUnsuspendPartnerTarget(null)}
                    onConfirm={handleConfirmUnsuspendPartner}
                    actionType="unsuspend"
                    scope="partner"
                    entityId={unsuspendPartnerTarget.id}
                    entityName={unsuspendPartnerTarget.store_name}
                    currentRiskScore={unsuspendPartnerTarget.risk_score}
                />
            )}

            {/* Filter Sheet */}
            <FilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                sections={[
                    { id: "storeName", title: "Nome da Loja", type: "text", placeholder: "Buscar por nome da loja..." },
                    { id: "ownerName", title: "Nome do Proprietário", type: "text", placeholder: "Buscar por nome do proprietário..." },
                    { id: "ownerEmail", title: "E-mail do Proprietário", type: "text", inputType: "email", placeholder: "Buscar por e-mail..." },
                    { id: "datePeriod", title: "Data de Cadastro", type: "date-period" },
                ]}
                filters={filters}
                setFilters={setFilters}
                onClear={() => {
                    setFilters(INITIAL_FILTERS)
                    setIsFilterSheetOpen(false)
                }}
            />
        </FadeIn>
    )
}