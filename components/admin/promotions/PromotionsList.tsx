"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Button,
    Input,
    IconPlaceholder,
    Badge,
    Checkbox,
    Pagination,
    SelectionBanner,
    AlertModal,
    SavingStatusModal,
    ThreeDotsLoader,
    ActionsDropdown,
} from "@/components/reusable"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import FilterChip from "@/components/reusable/FilterChip"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { useToast } from "@/hooks/use-toast"
import { useMediaQuery } from "@/components/erp/hooks"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import {
    getAdminCampaigns,
    getAdminCampaignDetail,
    updateAdminCampaign,
    deleteAdminCampaign,
    toggleAdminCampaignsStatus,
    getAdminPromotionScopeData,
    type AdminCampaignStats,
} from "@/app/actions/admin/promotions"
import { formatCurrency } from "@/lib/utils/formatters"
import {
    EMPTY_DATE_PERIOD,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"
import PromotionFormPage from "@/components/erp/promotions/PromotionFormPage"
import PromotionGridCard from "@/components/erp/promotions/PromotionGridCard"
import PromotionPageControls from "@/components/erp/promotions/PromotionPageControls"
import { usePartnerTimezone } from "@/lib/store-context"
import {
    PlusIcon,
    SearchIcon,
    TagIcon,
    TrashIcon,
    EditIcon,
    EyeIcon,
    FilterIcon,
    ListIcon,
    GridIcon,
    ArrowUpDownIcon,
    BlockedIcon,
    CheckCircleIcon,
} from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { useAdminActionModal } from "@/components/admin/AdminActionModal"
import { diffChangedFields } from "@/lib/admin/changed-fields"
import { PermissionProvider } from "@/lib/permission-context"
import { ROUTE_PERMISSION_PRESETS } from "@/lib/permissions/route-permissions"
import { StoreProvider } from "@/lib/store-context"

const getPromotionTypeLabel = (rule: any) => {
    if (!rule) return "Sem regras"
    switch (rule.promotion_type) {
        case "discount": return "Desconto Direto"
        case "buy_x_pay_y": return "Leve X Pague Y"
        case "gift": return "Ganhar Brinde"
        case "free_shipping": return "Frete Grátis"
        default: return rule.promotion_type || "Outro"
    }
}

const getApplyScopeLabel = (scope: string) => {
    switch (scope) {
        case "entire_cart": return "Toda a Sacola"
        case "specific_products": return "Produtos Específicos"
        case "category": return "Categorias Específicas"
        case "specific_services": return "Serviços Específicos"
        default: return "Toda a Sacola"
    }
}

const formatRuleDetails = (rule: any) => {
    if (!rule) return { above: "Sem limites de uso", below: "-" }
    let above = "Sem limites de uso"
    const globalLimit = rule.usage_limit
    const customerLimit = rule.usage_limit_per_customer
    if (globalLimit && customerLimit) {
        above = `Global: ${globalLimit} | Por cliente: ${customerLimit}`
    } else if (globalLimit) {
        above = `Limite global: ${globalLimit}`
    } else if (customerLimit) {
        above = `Limite por cliente: ${customerLimit}`
    }

    let below = ""
    if (rule.promotion_type === "discount") {
        const isPercent = rule.discount_type === "percentage"
        const formatCurrencyLocal = (val: any) => {
            if (val === undefined || val === null) return ""
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
        }
        const valStr = isPercent
            ? `${rule.discount_value}% Desc.`
            : `${formatCurrencyLocal(rule.discount_value)} Desc.`
        const maxStr = rule.max_discount_amount
            ? ` - Max ${formatCurrencyLocal(rule.max_discount_amount)}`
            : ""
        below = `${valStr}${maxStr}`
    } else if (rule.promotion_type === "buy_x_pay_y") {
        below = `Leve ${rule.buy_quantity} Pague ${rule.pay_quantity}`
    } else if (rule.promotion_type === "gift") {
        below = `1 Brinde`
    } else if (rule.promotion_type === "free_shipping") {
        below = `Frete isento`
    }

    if (rule.min_spend_amount) {
        const formatCurrencyLocal = (val: any) => {
            if (val === undefined || val === null) return ""
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
        }
        below += ` - Min ${formatCurrencyLocal(rule.min_spend_amount)}`
    }

    return { above, below }
}

interface PromotionsListProps {
    initialData: any[]
    initialStats?: AdminCampaignStats
    initialTotal?: number
}

export default function PromotionsList({
    initialData = [],
    initialStats,
    initialTotal = 0,
}: PromotionsListProps) {
    const { toast } = useToast()
    const tz = usePartnerTimezone()
    const { modal: actionModal, runAction } = useAdminActionModal()
    const isTabletOrMobile = useMediaQuery("(max-width: 1024px)")

    const [scopeData, setScopeData] = useState<{
        products: any[]
        services: any[]
        categories: any[]
        serviceCategories: any[]
        customers: any[]
        stores?: { id: string; name: string; isActive: boolean }[]
    }>({ products: [], services: [], categories: [], serviceCategories: [], customers: [], stores: [] })

    useEffect(() => {
        getAdminPromotionScopeData().then((data) => {
            if (data) setScopeData(data)
        }).catch(console.error)
    }, [])

    const [activeTab, setActiveTab] = useState<string>("all")

    // Local search state - DECLARED BEFORE useEntityPage
    const { search, setSearch, debouncedSearch } = useDebouncedSearch()

    // Filters - DECLARED BEFORE useEntityPage
    const [filters, setFilters] = useState<{
        status: string[]
        datePeriod: DatePeriodFilterValue
    }>({
        status: [],
        datePeriod: { ...EMPTY_DATE_PERIOD },
    })

    const isDefaultView = activeTab === "all" && !isDatePeriodFilterActive(filters.datePeriod)

    const entityPage = useEntityPage<any, any, any>({
        entityType: "campaigns",
        partnerId: "admin",
        queryKey: ["admin-campaigns", activeTab, debouncedSearch, filters.datePeriod],
        initialItems: initialData,
        initialNextCursor: null,
        initialHasMore: false,
        skipInitialData: !isDefaultView,
        search: debouncedSearch,
        setSearch,
        fetchPageFn: async ({ cursor }) => {
            const res = await getAdminCampaigns(cursor, 100, {
                isActive: activeTab === "active" ? "active" : activeTab === "inactive" ? "inactive" : undefined,
                search: debouncedSearch || undefined,
                startDate: filters.datePeriod.from || undefined,
                endDate: filters.datePeriod.to || undefined,
            })
            return { items: res.data || [], nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((c: any) => String(c?.id || ""), []),
        getDetailFn: async (id: string) => {
            const data = await getAdminCampaignDetail(id)
            return data || null
        },
        listToDetail: (item) => ({ ...item, __partial: true }),
        staleTime: 30_000,
    })

    const {
        items: campaigns,
        entityState,
        openEntity,
        closeEntity,
        currentEntity,
        afterMutation,
        queryClient,
    } = entityPage

    const handleMutation = useCallback(() => {
        afterMutation()
        queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] })
    }, [afterMutation, queryClient])

    // Extract all promotions flat array from campaigns
    const promotions = useMemo(() => {
        const list: any[] = []
        for (const c of campaigns || []) {
            if (Array.isArray(c.promotions)) {
                list.push(...c.promotions)
            }
        }
        return list
    }, [campaigns])

    const [viewMode, setViewModeState] = useState<"list" | "grid">(isTabletOrMobile ? "grid" : "list")
    const effectiveViewMode = isTabletOrMobile ? "grid" : viewMode

    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({
        key: "created_at",
        direction: "desc",
    })
    const [page, setPage] = useState(1)
    const itemsPerPage = 20

    const [selection, setSelection] = useState<{ ids: Set<string> }>({ ids: new Set() })
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

    const filterSections: FilterSectionConfig[] = useMemo(() => {
        return [
            {
                id: "status",
                title: "Status da Campanha",
                type: "checkbox-list",
                options: ["active", "inactive"],
                optionLabels: { active: "Ativa", inactive: "Inativa" },
            },
            {
                id: "datePeriod",
                title: "Período de Vigência",
                type: "date-period",
            },
        ]
    }, [])

    const hasActiveFilters = useMemo(() => {
        return (
            (filters.status && filters.status.length > 0) ||
            isDatePeriodFilterActive(filters.datePeriod)
        )
    }, [filters])

    const filteredCampaigns = useMemo(() => {
        let result = [...(campaigns || [])]

        if (filters.status && filters.status.length > 0) {
            result = result.filter(c => {
                const statusKey = c.is_active ? "active" : "inactive"
                return filters.status.includes(statusKey)
            })
        }

        if (sortConfig) {
            result.sort((a, b) => {
                let valA = a[sortConfig.key]
                let valB = b[sortConfig.key]
                if (sortConfig.key === "name") {
                    valA = (valA || "").toLowerCase()
                    valB = (valB || "").toLowerCase()
                }
                if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1
                if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1
                return 0
            })
        }

        return result
    }, [campaigns, filters.status, sortConfig])

    const totalPages = Math.ceil(filteredCampaigns.length / itemsPerPage)
    const paginatedCampaigns = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return filteredCampaigns.slice(start, start + itemsPerPage)
    }, [filteredCampaigns, page, itemsPerPage])

    const counts = useMemo(() => {
        let active = 0
        let inactive = 0
        for (const c of campaigns || []) {
            if (c.is_active) active++
            else inactive++
        }
        return {
            all: (campaigns || []).length,
            active,
            inactive,
        }
    }, [campaigns])

    const handleDeleteCampaign = async (camp: any) => {
        const result = await runAction({
            title: "Excluir campanha",
            description: `Campanha "${camp.name}" (${camp.store_name || camp.stores?.name || "Loja"}). O time do vendedor será notificado.`,
            requireReason: true,
            confirmLabel: "Excluir",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const res = await deleteAdminCampaign(camp.id, {
                    reason: payload.reason,
                    riskScore: payload.riskScore,
                    notifySeller: payload.notifySeller,
                })
                return res.success ? { success: true } : { success: false, error: res.error }
            },
        })
        if (result.success) {
            toast({ title: "Campanha excluída pela administração." })
            handleMutation()
        }
    }

    const handleAdminSaveCampaign = async (payload: any, originalCampaign: any): Promise<{ success: boolean; error?: string }> => {
        const changedFields = diffChangedFields(originalCampaign, payload)
        const result = await runAction({
            title: "Salvar alterações na Campanha",
            description: `Campanha "${originalCampaign.name}" (${originalCampaign.store_name || originalCampaign.stores?.name || "Loja"})`,
            changedFields,
            force: true,
            confirmLabel: "Salvar",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (actionPayload) => {
                const res = await updateAdminCampaign(originalCampaign.id, payload, {
                    reason: actionPayload.reason || null,
                    riskScore: actionPayload.riskScore,
                    notifySeller: actionPayload.notifySeller,
                    changedFields,
                })
                if (res.success) return { success: true }
                return { success: false, error: res.error || "Erro ao salvar campanha" }
            },
        })
        if (result.cancelled) return { success: false }
        if (result.success) {
            toast({ title: "Campanha atualizada com sucesso pela administração!" })
            handleMutation()
            return { success: true }
        }
        return { success: false, error: result.error }
    }

    const formMode = useMemo(() => {
        if (!entityState.isOpen) return null
        switch (entityState.action) {
            case 'view': return 'details'
            case 'edit': return 'edit'
            case 'create': return 'add'
            case 'duplicate': return 'duplicate'
            default: return null
        }
    }, [entityState])

    const formCampaign = useMemo(() => {
        if (!entityState.isOpen || entityState.action === 'create') return null
        return currentEntity || (campaigns || []).find(c => c.id === entityState.entityId) || null
    }, [entityState, currentEntity, campaigns])

    const activePartnerId = formCampaign?.partner_id || formCampaign?.stores?.partner_id || "admin"
    const activeStore = formCampaign?.stores || null

    return (
        <>
            <AnimatePresence mode="wait">
                {entityState.isOpen && formMode ? (
                    <FadeIn key="form" className="w-full h-full">
                        <PermissionProvider
                            role="OWNER"
                            routePermissions={ROUTE_PERMISSION_PRESETS.OWNER}
                            partnerId={activePartnerId}
                            businessInfo={{}}
                            planSlug="escalar"
                        >
                            <StoreProvider
                                partnerId={activePartnerId}
                                initialStores={activeStore ? [activeStore] : []}
                                activeStoreId={formCampaign?.store_id || activeStore?.id || null}
                            >
                                <PromotionFormPage
                                    partnerId={activePartnerId}
                                    mode={formMode as any}
                                    campaign={formCampaign}
                                    scopeData={scopeData}
                                    promotions={promotions}
                                    storeId={formCampaign?.store_id || null}
                                    onBack={() => {
                                        closeEntity()
                                        handleMutation()
                                    }}
                                    onSaveOverride={handleAdminSaveCampaign}
                                />
                            </StoreProvider>
                        </PermissionProvider>
                    </FadeIn>
                ) : (
                    <FadeIn key="list" className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                        <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                            {/* Desktop Header */}
                            <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                                <div className="flex flex-col gap-2 pt-1">
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                            Campanhas & Promoções
                                        </h1>
                                    </div>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                        Gerencie todas as campanhas e regras de desconto criadas pelos vendedores na plataforma.
                                    </p>
                                </div>
                            </div>

                            {/* Controls */}
                            <PromotionPageControls
                                search={search}
                                onSearchChange={setSearch}
                                onOpenFilter={() => setIsFilterSheetOpen(true)}
                                filters={filters}
                                setFilters={setFilters}
                                viewMode={viewMode}
                                onViewModeChange={(m) => setViewModeState(m)}
                                hasActiveFilters={hasActiveFilters}
                                onAddCampaign={() => openEntity("create")}
                            />

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-8 px-4 md:px-8">
                                {paginatedCampaigns.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-12 text-center min-h-[350px]">
                                        <IconPlaceholder
                                            icon={TagIcon}
                                            containerSize="w-16 h-16 mb-2"
                                            iconSize="w-6 h-6"
                                            title="Nenhuma campanha encontrada"
                                            subtitle="Não encontramos campanhas para os filtros selecionados."
                                        />
                                    </div>
                                ) : effectiveViewMode === "grid" ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                        {paginatedCampaigns.map((camp: any) => {
                                            const isSelected = selection.ids.has(camp.id)
                                            const campPromos = promotions.filter(p => p.campaign_id === camp.id)
                                            return (
                                                <PromotionGridCard
                                                    key={camp.id}
                                                    campaign={camp}
                                                    campaignPromotions={campPromos}
                                                    selected={isSelected}
                                                    onSelect={() => {
                                                        setSelection(p => {
                                                            const s = new Set(p.ids)
                                                            s.has(camp.id) ? s.delete(camp.id) : s.add(camp.id)
                                                            return { ids: s }
                                                        })
                                                    }}
                                                    onDetails={() => openEntity('view', camp.id)}
                                                    onEdit={() => openEntity('edit', camp.id)}
                                                    onDelete={() => handleDeleteCampaign(camp)}
                                                />
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="w-full overflow-hidden rounded-xl relative">
                                        <div className="overflow-x-auto pb-4 custom-scrollbar">
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[900px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                        <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                                                            <Checkbox
                                                                checked={paginatedCampaigns.length > 0 && paginatedCampaigns.every(x => selection.ids.has(x.id))}
                                                                onChange={(checked) => {
                                                                    setSelection({ ids: checked ? new Set(paginatedCampaigns.map(x => x.id)) : new Set() })
                                                                }}
                                                                className="bg-white dark:bg-dark-background"
                                                            />
                                                        </th>

                                                        <th
                                                            className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors"
                                                            onClick={() => {
                                                                setSortConfig((prev) => ({
                                                                    key: "name",
                                                                    direction: prev?.key === "name" && prev.direction === "asc" ? "desc" : "asc",
                                                                }))
                                                            }}
                                                        >
                                                            <div className="flex items-center gap-1.5">
                                                                Campanha
                                                                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                                                    <ArrowUpDownIcon
                                                                        size={14}
                                                                        className={`transition-all duration-200 ${sortConfig?.key === "name" ? "text-brand-dark dark:text-dark-heading opacity-100" : "text-brand-inactive-text opacity-0 group-hover:opacity-40"} ${sortConfig?.key === "name" && sortConfig?.direction === "desc" ? "rotate-180" : ""}`}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </th>

                                                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">
                                                            Vendedor
                                                        </th>

                                                        <th
                                                            className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors"
                                                            onClick={() => {
                                                                setSortConfig((prev) => ({
                                                                    key: "starts_at",
                                                                    direction: prev?.key === "starts_at" && prev.direction === "asc" ? "desc" : "asc",
                                                                }))
                                                            }}
                                                        >
                                                            <div className="flex items-center gap-1.5">
                                                                Vigência
                                                                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                                                    <ArrowUpDownIcon
                                                                        size={14}
                                                                        className={`transition-all duration-200 ${sortConfig?.key === "starts_at" ? "text-brand-dark dark:text-dark-heading opacity-100" : "text-brand-inactive-text opacity-0 group-hover:opacity-40"} ${sortConfig?.key === "starts_at" && sortConfig?.direction === "desc" ? "rotate-180" : ""}`}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </th>

                                                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">
                                                            Escopo
                                                        </th>

                                                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">
                                                            Regras
                                                        </th>

                                                        <th
                                                            className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors"
                                                            onClick={() => {
                                                                setSortConfig((prev) => ({
                                                                    key: "is_active",
                                                                    direction: prev?.key === "is_active" && prev.direction === "asc" ? "desc" : "asc",
                                                                }))
                                                            }}
                                                        >
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                Status
                                                                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                                                    <ArrowUpDownIcon
                                                                        size={14}
                                                                        className={`transition-all duration-200 ${sortConfig?.key === "is_active" ? "text-brand-dark dark:text-dark-heading opacity-100" : "text-brand-inactive-text opacity-0 group-hover:opacity-40"} ${sortConfig?.key === "is_active" && sortConfig?.direction === "desc" ? "rotate-180" : ""}`}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </th>

                                                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center rounded-r-lg">
                                                            Ações
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedCampaigns.map((camp: any) => {
                                                        const isSelected = selection.ids.has(camp.id)
                                                        const campPromos = promotions.filter(p => p.campaign_id === camp.id)
                                                        return (
                                                            <tr
                                                                key={camp.id}
                                                                className="group hover:bg-brand-gray dark:hover:bg-dark-border/20 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                                                                onClick={() => openEntity('view', camp.id)}
                                                            >
                                                                <td className="py-3 pl-6 pr-0 border-b border-brand-border dark:border-dark-border w-14" onClick={(e) => e.stopPropagation()}>
                                                                    <Checkbox
                                                                        checked={isSelected}
                                                                        onChange={() => {
                                                                            setSelection(p => {
                                                                                const s = new Set(p.ids)
                                                                                s.has(camp.id) ? s.delete(camp.id) : s.add(camp.id)
                                                                                return { ids: s }
                                                                            })
                                                                        }}
                                                                    />
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border">
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">{camp.name}</span>
                                                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body truncate max-w-[250px] font-semibold mt-0.5">
                                                                            {getPromotionTypeLabel(campPromos[0])}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border">
                                                                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate max-w-[180px] block" title={camp.store_name || camp.stores?.name || camp.partner_name || "—"}>
                                                                        {camp.store_name || camp.stores?.name || camp.partner_name || "—"}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border">
                                                                    {camp.starts_at && camp.ends_at ? (
                                                                        <div className="flex flex-col text-[13px] text-brand-inactive-text dark:text-dark-body">
                                                                            <span>{new Date(camp.starts_at).toLocaleDateString("pt-BR", { timeZone: tz })}</span>
                                                                            <span className="text-xs text-gray-400">{new Date(camp.ends_at).toLocaleDateString("pt-BR", { timeZone: tz })}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[13px] text-brand-inactive-text dark:text-dark-body">Indeterminado</span>
                                                                    )}
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border">
                                                                    <div className="flex flex-col text-[13px]">
                                                                        <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                                            Público: {camp.customer_scope === "specific" ? "Segmentado" : "Geral"}
                                                                        </span>
                                                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                                            Abrangência: {getApplyScopeLabel(campPromos[0]?.apply_scope || "entire_cart")}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border">
                                                                    {(() => {
                                                                        const details = formatRuleDetails(campPromos[0])
                                                                        return (
                                                                            <div className="flex flex-col text-[13px]">
                                                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body font-normal">{details.above}</span>
                                                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5">{details.below}</span>
                                                                            </div>
                                                                        )
                                                                    })()}
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                                                    <Badge variant={camp.is_active ? "green" : "gray"}>
                                                                        {camp.is_active ? "Ativa" : "Inativa"}
                                                                    </Badge>
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center" onClick={(e) => e.stopPropagation()}>
                                                                    <ActionsDropdown
                                                                        onEdit={() => openEntity('edit', camp.id)}
                                                                        onDuplicate={() => openEntity('duplicate', camp.id)}
                                                                        onDelete={() => handleDeleteCampaign(camp)}
                                                                    />
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {totalPages > 1 && (
                                    <div className="flex justify-center pt-6">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={(p) => setPage(p)}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </FadeIn>
                )}
            </AnimatePresence>

            {/* Filter Sheet */}
            <FilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => {
                    setFilters({ status: [], datePeriod: { ...EMPTY_DATE_PERIOD } })
                    setPage(1)
                }}
            />

            {/* Admin Action Modal */}
            {actionModal}
        </>
    )
}