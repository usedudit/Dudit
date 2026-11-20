"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useMediaQuery } from "@/components/erp/hooks"
import { useToast } from "@/hooks/use-toast"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useNotification } from "@/hooks/use-notification"
import {
    EMPTY_DATE_PERIOD,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"

// Reusable Components
import {
    Button,
    IconPlaceholder,
    ThreeDotsLoader,
    Pagination,
    Checkbox,
    SelectionBanner,
    AlertModal,
} from "@/components/reusable"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"

// Specific Page components from ERP
import NewRecurringPlanPage from "@/components/erp/recurring/NewRecurringPlanPage"
import PlanDetailPage from "@/components/erp/recurring/PlanDetailPage"
import PlanPageControls from "@/components/erp/recurring/PlanPageControls"
import PlanGridCard from "@/components/erp/recurring/PlanGridCard"
import PlanListRow from "@/components/erp/recurring/PlanListRow"

// Icons & Utils
import {
    PlusIcon,
    ArrowUpDownIcon,
    TrashIcon,
    RepeatIcon,
} from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { ERPDetailLoading } from "@/components/erp/shared/ERPDetailLoading"
import type { RecurringPlan } from "@/lib/types/recurring"
import { getRecurringFrequencyLabel, getRecurringBillingModeLabel } from "@/lib/types/recurring"
import FilterSheet, { type FilterSectionConfig } from "@/components/reusable/FilterSheet"
import FilterChip from "@/components/reusable/FilterChip"
import {
    listAdminCatalogPlans,
    getAdminCatalogPlanDetail,
    updateAdminRecurringPlan,
    deleteAdminRecurringPlan,
} from "@/app/actions/admin/catalog"
import { useAdminActionModal } from "@/components/admin/AdminActionModal"
import { diffChangedFields } from "@/lib/admin/changed-fields"
import { PermissionProvider } from "@/lib/permission-context"
import { ROUTE_PERMISSION_PRESETS } from "@/lib/permissions/route-permissions"
import { StoreProvider } from "@/lib/store-context"

type PlanFilters = { frequency: string[]; billing: string[]; price: { min: string; max: string } }

const EMPTY_PLAN_FILTERS: PlanFilters = { frequency: [], billing: [], price: { min: "", max: "" } }

const PLAN_FREQUENCY_LABELS: Record<string, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
  custom: "Personalizada",
}

const PLAN_BILLING_LABELS: Record<string, string> = {
  auto_mercado_pago: "Mercado Pago",
  manual: "Manual",
}

const PLAN_FILTER_SECTIONS: FilterSectionConfig[] = [
  {
    id: "frequency",
    title: "Frequência",
    type: "checkbox-list",
    options: ["daily", "weekly", "monthly", "yearly", "custom"],
    optionLabels: PLAN_FREQUENCY_LABELS,
  },
  {
    id: "billing",
    title: "Cobrança",
    type: "checkbox-list",
    options: ["auto_mercado_pago", "manual"],
    optionLabels: PLAN_BILLING_LABELS,
  },
  {
    id: "price",
    title: "Preço",
    type: "range",
    rangeConfig: {
      minKey: "min",
      maxKey: "max",
      minPlaceholder: "Preço mínimo",
      maxPlaceholder: "Preço máximo",
    },
  },
  {
    id: "datePeriod",
    title: "Data de Criação",
    type: "date-period",
  },
]

const PlanFilterChips = ({
  filters,
  onClear,
}: {
  filters: PlanFilters
  onClear: (key: keyof PlanFilters) => void
}) => {
  const priceValue =
    filters.price.min || filters.price.max
      ? [
          filters.price.min ? `a partir de R$ ${filters.price.min}` : null,
          filters.price.max ? `até R$ ${filters.price.max}` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : ""

  return (
    <AnimatePresence>
      {filters.frequency.length > 0 && (
        <FilterChip
          key="frequency"
          label="Frequência"
          value={filters.frequency.map((v) => PLAN_FREQUENCY_LABELS[v] || v).join(", ")}
          onRemove={() => onClear("frequency")}
        />
      )}
      {filters.billing.length > 0 && (
        <FilterChip
          key="billing"
          label="Cobrança"
          value={filters.billing.map((v) => PLAN_BILLING_LABELS[v] || v).join(", ")}
          onRemove={() => onClear("billing")}
        />
      )}
      {priceValue && (
        <FilterChip
          key="price"
          label="Preço"
          value={priceValue}
          onRemove={() => onClear("price")}
        />
      )}
    </AnimatePresence>
  )
}

type SortKey = "name" | "seller" | "frequency" | "billing" | "startDate" | "endDate" | "status"
type SortDirection = "asc" | "desc"

type PlanColumn = {
    id: string
    label: string
    align?: "left" | "center" | "right"
    width?: string
    sortable: boolean
    key?: SortKey
}

const COLUMNS: PlanColumn[] = [
    { id: "name", label: "Plano", align: "left" as const, width: "280px", sortable: true, key: "name" },
    { id: "seller", label: "Vendedor", align: "left" as const, width: "180px", sortable: true, key: "seller" },
    { id: "frequency", label: "Frequência", align: "left" as const, width: "140px", sortable: true, key: "frequency" },
    { id: "billing", label: "Cobrança", align: "left" as const, width: "160px", sortable: true, key: "billing" },
    { id: "startDate", label: "Início", align: "left" as const, width: "120px", sortable: true, key: "startDate" },
    { id: "endDate", label: "Fim", align: "left" as const, width: "120px", sortable: true, key: "endDate" },
    { id: "status", label: "Status", align: "center" as const, width: "120px", sortable: true, key: "status" },
    { id: "actions", label: "Ações", align: "center" as const, width: "100px", sortable: false },
]

interface PlansListProps {
    initialItems: any[]
}

export default function PlansList({ initialItems = [] }: PlansListProps) {
    const { toast } = useToast()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const { modal: actionModal, runAction } = useAdminActionModal()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")

    // useEntityPage Hook for managing URL state and query caching
    const entityPage = useEntityPage<any, any, string>({
        entityType: "recurring_plans",
        partnerId: "admin",
        queryKey: ["admin", "recurring_plans", debouncedSearch, filters.datePeriod],
        initialItems,
        initialNextCursor: null,
        initialHasMore: false,
        skipInitialData: debouncedSearch.length > 0 || isDatePeriodFilterActive(filters.datePeriod),
        fetchPageFn: async () => {
            const res = await listAdminCatalogPlans({ 
                limit: 100, 
                search: debouncedSearch || undefined,
                // TODO: Add date filters when server action supports them
            })
            if (!res.success || !res.data) throw new Error((res as any).error || "Erro ao carregar planos.")
            return { items: res.data.items, nextCursor: null, hasMore: res.data.hasMore }
        },
        dedupeKey: useCallback((p: any) => String(p?.id || ""), []),
        getDetailFn: async (id: string) => {
            const res = await getAdminCatalogPlanDetail(id)
            if (res.success && res.data) {
                return {
                    ...res.data.plan,
                    store: res.data.store,
                    partner: res.data.partner,
                    audit_events: res.data.auditEvents || [],
                }
            }
            return null
        },
        listToDetail: (item: any) => item,
    })

    const {
        items: rawPlans,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isListLoading,
        entityState,
        openEntity,
        closeEntity,
        currentEntity,
        afterMutation,
        queryClient,
        search,
        setSearch,
        debouncedSearch,
    } = entityPage

    const handleMutation = useCallback(() => {
        afterMutation()
        queryClient.invalidateQueries({ queryKey: ["admin", "recurring_plans"] })
    }, [afterMutation, queryClient])

    // Local states
    const [viewMode, setViewMode] = useState<"list" | "grid">(isTablet ? "grid" : "list")
    const [activeTab, setActiveTab] = useState<"Todos" | "Ativo" | "Inativo" | "Arquivado">("Todos")
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [filters, setFilters] = useState<PlanFilters & { datePeriod: DatePeriodFilterValue }>({
        ...EMPTY_PLAN_FILTERS,
        datePeriod: { ...EMPTY_DATE_PERIOD },
    })
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "name",
        direction: "asc",
    })
    const [page, setPage] = useState(1)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Table Scroll indicator logic
    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState({
            left: scrollLeft > 0,
            right: scrollLeft < scrollWidth - clientWidth - 2,
        })
    }, [])

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => window.removeEventListener("resize", checkScroll)
    }, [checkScroll, viewMode, rawPlans])

    // Modals
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [itemToDelete, setItemToDelete] = useState<any | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // Sync viewMode on breakpoint change
    useEffect(() => {
        if (isTablet && viewMode !== "grid") {
            setViewMode("grid")
        }
    }, [isTablet, viewMode])

    // Reset pagination when search/filter/tab changes
    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, activeTab, filters.datePeriod])

    // Selected plan for detail/edit
    const selectedPlan = useMemo(() => {
        if (!entityState.isOpen || !entityState.entityId) return null
        if (currentEntity && currentEntity.id === entityState.entityId) return currentEntity
        return rawPlans.find((p: any) => p.id === entityState.entityId) || null
    }, [entityState.isOpen, entityState.entityId, currentEntity, rawPlans])

    // Filter logic
    const filteredPlans = useMemo(() => {
        return rawPlans.filter((plan: any) => {
            if (activeTab === "Ativo" && plan.status !== "active") return false
            if (activeTab === "Inativo" && plan.status !== "inactive") return false
            if (activeTab === "Arquivado" && plan.status !== "archived") return false

            // Date period filter (client-side for now, server-side when supported)
            if (isDatePeriodFilterActive(filters.datePeriod)) {
                const { startYmd, endYmd } = resolveDatePeriodBounds(filters.datePeriod)
                if (startYmd || endYmd) {
                    const planDate = plan.created_at ? plan.created_at.slice(0, 10) : ""
                    if (planDate) {
                        if (startYmd && planDate < startYmd) return false
                        if (endYmd && planDate > endYmd) return false
                    }
                }
            }

            if (filters.frequency.length > 0 && !filters.frequency.includes(plan.frequencyType)) {
                return false
            }

            if (filters.billing.length > 0 && !filters.billing.includes(plan.billingMode)) {
                return false
            }

            if (filters.price.min || filters.price.max) {
                const totalPrice = (plan.items || []).reduce(
                    (acc: number, item: any) => acc + (Number(item.unitPrice || 0) * Number(item.quantity || 1)),
                    0
                )
                if (filters.price.min && totalPrice < Number(filters.price.min)) return false
                if (filters.price.max && totalPrice > Number(filters.price.max)) return false
            }

            return true
        })
    }, [rawPlans, activeTab, filters])

    // Sort logic
    const sortedPlans = useMemo(() => {
        if (!sortConfig) return filteredPlans

        return [...filteredPlans].sort((a: any, b: any) => {
            let aVal: any = a[sortConfig.key]
            let bVal: any = b[sortConfig.key]

            if (sortConfig.key === "name") {
                aVal = a.name?.toLowerCase() || ""
                bVal = b.name?.toLowerCase() || ""
            } else if (sortConfig.key === "seller") {
                aVal = (a.partner_name || a.store_name || "").toLowerCase()
                bVal = (b.partner_name || b.store_name || "").toLowerCase()
            } else if (sortConfig.key === "startDate") {
                aVal = new Date(a.startDate).getTime() || 0
                bVal = new Date(b.startDate).getTime() || 0
            } else if (sortConfig.key === "endDate") {
                aVal = a.endDate ? new Date(a.endDate).getTime() : Infinity
                bVal = b.endDate ? new Date(b.endDate).getTime() : Infinity
            }

            if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1
            if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1
            return 0
        })
    }, [filteredPlans, sortConfig])

    // Pagination
    const itemsPerPage = 8
    const totalPages = Math.ceil(sortedPlans.length / itemsPerPage)
    const paginated = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return sortedPlans.slice(start, start + itemsPerPage)
    }, [sortedPlans, page, itemsPerPage])

    // Tab counts
    const tabCounts = useMemo(() => {
        const Todos = rawPlans.length
        const Ativo = rawPlans.filter((p: any) => p.status === "active").length
        const Inativo = rawPlans.filter((p: any) => p.status === "inactive").length
        const Arquivado = rawPlans.filter((p: any) => p.status === "archived").length
        return { Todos, Ativo, Inativo, Arquivado }
    }, [rawPlans])

    const handleSelectRow = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }, [])

    const handleAddPlan = () => openEntity("create")
    const handleEditPlan = (plan: any) => openEntity("edit", plan.id)
    const handleDetailsPlan = (plan: any) => openEntity("view", plan.id)

    const handleDeleteTrigger = (plan: any) => {
        setItemToDelete(plan)
        setIsDeleteModalOpen(true)
    }

    const handleDeleteConfirm = async () => {
        if (!itemToDelete) return
        const result = await runAction({
            title: "Excluir plano recorrente",
            description: `Plano "${itemToDelete.name}" (${itemToDelete.partner_name || "Loja"}). O time do vendedor será notificado.`,
            requireReason: true,
            confirmLabel: "Excluir",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const res = await deleteAdminRecurringPlan(itemToDelete.id, {
                    reason: payload.reason,
                    riskScore: payload.riskScore,
                    notifySeller: payload.notifySeller,
                })
                return res.success ? { success: true } : { success: false, error: res.error }
            },
        })
        if (result.success) {
            notifySuccess("Plano recorrente excluído pela administração!")
            setSelectedIds(prev => {
                const next = new Set(prev)
                next.delete(itemToDelete.id)
                return next
            })
            handleMutation()
        }
        setIsDeleteModalOpen(false)
        setItemToDelete(null)
    }

    // Admin save override handler for plans
    const handleAdminSavePlan = async (payload: any): Promise<{ success?: boolean; error?: string; cancelled?: boolean } | void> => {
        if (!selectedPlan) return
        const changedFields = diffChangedFields(selectedPlan, payload)
        const result = await runAction({
            title: "Salvar alterações no Plano Recorrente",
            description: `Plano "${selectedPlan.name}" (${selectedPlan.partner_name || "Loja"})`,
            changedFields,
            force: true,
            confirmLabel: "Salvar",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (actionPayload) => {
                const res: any = await updateAdminRecurringPlan(
                    { ...payload, planId: selectedPlan.id, partnerId: selectedPlan.partnerId || selectedPlan.partner_id },
                    {
                        reason: actionPayload.reason || null,
                        riskScore: actionPayload.riskScore,
                        notifySeller: actionPayload.notifySeller,
                        changedFields,
                    }
                )
                if (res?.success) return { success: true }
                return { success: false, error: res?.error || "Erro ao salvar o plano." }
            },
        })

        if (result.cancelled) return { cancelled: true }
        if (result.success) {
            notifySuccess("Plano atualizado com sucesso pela administração!")
            closeEntity()
            handleMutation()
            return { success: true }
        }
        notifyError(result.error || "Erro ao salvar plano")
        return { success: false, error: result.error }
    }

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "asc" }
        })
    }

    const isViewing = entityState.isOpen && entityState.action === "view"
    const isEditing = entityState.isOpen && entityState.action === "edit"
    const isCreating = entityState.isOpen && entityState.action === "create"

    const activePartnerId = selectedPlan?.partnerId || selectedPlan?.partner_id || "admin"
    const activeStore = selectedPlan?.store || selectedPlan?.stores || null

    return (
        <>
            <AnimatePresence mode="wait">
                {entityState.isOpen && (isViewing || isEditing || isCreating) ? (
                    <FadeIn key="form" className="w-full h-full">
                        {!isCreating && !selectedPlan ? (
                            isListLoading ? (
                                <ERPDetailLoading />
                            ) : (
                                <div className="flex flex-col items-center justify-center gap-4 h-full min-h-[200px] bg-white dark:bg-dark-background">
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                        imageAlt="Plano não encontrado"
                                        title="Plano não encontrado"
                                        subtitle="Este plano não está disponível na sua lista atual."
                                    />
                                    <Button variant="outline" onClick={() => closeEntity()}>
                                        Voltar para a lista
                                    </Button>
                                </div>
                            )
                        ) : isViewing && selectedPlan ? (
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
                                    activeStoreId={selectedPlan?.store_id || activeStore?.id || null}
                                >
                                    <PlanDetailPage
                                        key={`plan-detail-${selectedPlan.id}`}
                                        partnerId={activePartnerId}
                                        plan={selectedPlan}
                                        onBack={() => closeEntity()}
                                        canManage={true}
                                        onEdit={(plan) => openEntity("edit", plan.id)}
                                        onDelete={handleDeleteTrigger}
                                    />
                                </StoreProvider>
                            </PermissionProvider>
                        ) : isEditing && selectedPlan ? (
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
                                    activeStoreId={selectedPlan?.store_id || activeStore?.id || null}
                                >
                                    <NewRecurringPlanPage
                                        partnerId={activePartnerId}
                                        plan={selectedPlan}
                                        onBack={() => closeEntity()}
                                        onSuccess={() => {
                                            closeEntity()
                                            handleMutation()
                                        }}
                                        onSave={handleAdminSavePlan}
                                    />
                                </StoreProvider>
                            </PermissionProvider>
                        ) : null}
                    </FadeIn>
                ) : (
                    <FadeIn key="list" className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                        {/* Desktop Header */}
                        <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8 pt-4">
                            <div className="flex flex-col gap-2 pt-1">
                                <div className="flex items-center gap-3">
                                    <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                        Planos Recorrentes
                                    </h1>
                                </div>
                                <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                    Gerencie todos os planos recorrentes cadastrados pelos vendedores na plataforma.
                                </p>
                            </div>
                        </div>

                        {/* Page Controls */}
                        <PlanPageControls
                            activeTab={activeTab}
                            setActiveTab={setActiveTab}
                            tabCounts={tabCounts}
                            viewMode={viewMode}
                            onViewModeChange={setViewMode}
                            search={search}
                            onSearchChange={setSearch}
                            onAddPlan={handleAddPlan}
                            canManage={false}
                            onOpenFilter={() => setIsFilterOpen(true)}
                            hasActiveFilters={Boolean(
                                filters.frequency.length > 0 ||
                                filters.billing.length > 0 ||
                                filters.price.min ||
                                filters.price.max ||
                                isDatePeriodFilterActive(filters.datePeriod)
                            )}
                            chips={
                                <PlanFilterChips
                                    filters={filters}
                                    onClear={(key) =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            [key]: key === "price" ? { min: "", max: "" } : key === "datePeriod" ? { ...EMPTY_DATE_PERIOD } : [],
                                        }))
                                    }
                                />
                            }
                        />

                        {/* Selection Banner */}
                        <div className="px-4 md:px-8">
                            <SelectionBanner
                                selectedCount={selectedIds.size}
                                totalCount={filteredPlans.length}
                                onSelectAll={() => setSelectedIds(new Set(filteredPlans.map((p: any) => p.id)))}
                                onClearSelection={() => setSelectedIds(new Set())}
                                itemName="planos"
                                singularItemName="plano"
                            />
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-8">
                            {paginated.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-12 text-center min-h-[350px]">
                                    <IconPlaceholder
                                        icon={RepeatIcon}
                                        containerSize="w-16 h-16 mb-2"
                                        iconSize="w-6 h-6"
                                        title="Nenhum plano recorrente encontrado"
                                        subtitle="Não encontramos planos recorrentes para os filtros selecionados."
                                    />
                                </div>
                            ) : viewMode === "grid" ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {paginated.map((plan: any) => (
                                        <PlanGridCard
                                            key={plan.id}
                                            plan={plan}
                                            selected={selectedIds.has(plan.id)}
                                            onSelect={() => handleSelectRow(plan.id)}
                                            canManage={true}
                                            onEdit={handleEditPlan}
                                            onDelete={handleDeleteTrigger}
                                            onDetails={handleDetailsPlan}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="w-full overflow-hidden rounded-xl relative">
                                    <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                    <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                    <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1100px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    {/* Checkbox Column */}
                                                    <th className="py-3 pl-6 pr-3 w-12 bg-brand-gray dark:bg-dark-border/50 rounded-l-lg">
                                                        <Checkbox
                                                            checked={paginated.length > 0 && paginated.every((p: any) => selectedIds.has(p.id))}
                                                            onChange={() => {
                                                                const allSelected = paginated.every((p: any) => selectedIds.has(p.id))
                                                                setSelectedIds(prev => {
                                                                    const next = new Set(prev)
                                                                    paginated.forEach((p: any) => allSelected ? next.delete(p.id) : next.add(p.id))
                                                                    return next
                                                                })
                                                            }}
                                                            className="bg-white dark:bg-dark-background"
                                                        />
                                                    </th>
                                                    {COLUMNS.map((col) => {
                                                        const isSorted = sortConfig?.key === col.key
                                                        const isLast = col.id === COLUMNS[COLUMNS.length - 1].id
                                                        return (
                                                            <th
                                                                key={col.id}
                                                                className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${col.sortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""} ${isLast ? "rounded-r-lg" : ""}`}
                                                                style={{ width: col.width }}
                                                                onClick={() => {
                                                                    if (!col.sortable || !col.key) return
                                                                    handleSort(col.key as SortKey)
                                                                }}
                                                            >
                                                                <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                    <span>{col.label}</span>
                                                                    {col.sortable && (
                                                                        <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                                                            <ArrowUpDownIcon
                                                                                size={14}
                                                                                className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100 block" : "text-brand-inactive-text hidden group-hover:block opacity-40"} ${isSorted && sortConfig?.direction === "desc" ? "rotate-180" : ""}`}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </th>
                                                        )
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginated.map((plan: any) => (
                                                    <PlanListRow
                                                        key={plan.id}
                                                        plan={plan}
                                                        columns={COLUMNS}
                                                        canManage={true}
                                                        selected={selectedIds.has(plan.id)}
                                                        onSelect={handleSelectRow}
                                                        onEdit={handleEditPlan}
                                                        onDelete={handleDeleteTrigger}
                                                        onDetails={handleDetailsPlan}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex justify-center pt-6">
                                    <Pagination
                                        currentPage={page}
                                        totalPages={totalPages}
                                        onPageChange={setPage}
                                    />
                                </div>
                            )}
                        </div>
                    </FadeIn>
                )}
            </AnimatePresence>

            {/* Filter Sheet */}
            <FilterSheet
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                sections={PLAN_FILTER_SECTIONS}
                filters={filters}
                setFilters={setFilters as any}
                onClear={() => setFilters(EMPTY_PLAN_FILTERS)}
            />

            {/* Delete Confirmation Modal */}
            <AlertModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeleteConfirm}
                title="Excluir Plano Recorrente"
                description={`Tem certeza que deseja excluir o plano "${itemToDelete?.name}"? Esta ação não pode ser desfeita.`}
                confirmText="Excluir"
                cancelText="Cancelar"
                isLoading={isDeleting}
            />

            {/* Admin Action Modal */}
            {actionModal}
        </>
    )
}
