"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useNotification } from "@/hooks/use-notification"

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

// Specific Page components
import NewRecurringPlanPage from "./NewRecurringPlanPage"
import PlanPageControls from "./PlanPageControls"
import PlanGridCard from "./PlanGridCard"
import PlanListRow from "./PlanListRow"

// Icons & Utils
import {
    PlusIcon,
    ArrowUpDownIcon,
    TrashIcon,
} from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { listRecurringPlansAction, deleteRecurringPlanAction } from "@/app/actions/erp/recurring-plans"
import type { RecurringPlan } from "@/lib/types/recurring"
import { getRecurringFrequencyLabel } from "@/lib/types/recurring"
import { formatFullDate } from "@/lib/utils"

type SortKey = "name" | "frequency" | "status"
type SortDirection = "asc" | "desc"

const COLUMNS = [
    { id: "name", label: "Plano", align: "left" as const, width: "350px", sortable: true, key: "name" },
    { id: "frequency", label: "Frequência", align: "left" as const, width: "250px", sortable: true, key: "frequency" },
    { id: "status", label: "Status", align: "center" as const, width: "150px", sortable: true, key: "status" },
    { id: "actions", label: "Ações", align: "center" as const, width: "100px", sortable: false },
]

export default function RecurringPlansPage({
    partnerId,
    initialPlans = [],
    initialHasMore,
    initialNextCursor,
}: {
    partnerId: string
    initialPlans: RecurringPlan[]
    initialHasMore: boolean
    initialNextCursor: string | null
}) {
    const { toast } = useToast()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const { canCreate, canEdit } = usePermissions()
    const canManage = canCreate("recurring_plans") || canEdit("recurring_plans")

    const queryKey = useMemo(() => ["erp", "recurring_plans", partnerId] as const, [partnerId])

    // useEntityPage Hook for managing URL state and query caching
    const entityPage = useEntityPage<any, any, string>({
        entityType: "recurring_plans",
        partnerId,
        queryKey,
        initialItems: initialPlans,
        initialNextCursor,
        initialHasMore,
        fetchPageFn: async ({ cursor }) => {
            const res = await listRecurringPlansAction(partnerId, { cursor })
            if (!res.success || !res.data) throw new Error(res.error || "Erro ao carregar planos.")
            return { items: res.data.items, nextCursor: res.data.nextCursor, hasMore: res.data.hasMore }
        },
        dedupeKey: useCallback((p: any) => String(p?.id || ""), []),
        getDetailFn: async (_id: string) => null,
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
        isViewing,
        isCreating,
        isEditing,
        currentEntity,
        isLoadingDetail,
        search,
        setSearch,
        debouncedSearch,
        afterMutation,
    } = entityPage

    // Reset entity view when sidebar resets
    useEffect(() => {
        const handleReset = () => closeEntity()
        window.addEventListener("erp-sidebar-reset", handleReset)
        return () => window.removeEventListener("erp-sidebar-reset", handleReset)
    }, [closeEntity])

    // UI States
    const [activeTab, setActiveTab] = useState<"Todos" | "Ativo" | "Inativo" | "Arquivado">("Todos")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [page, setPage] = useState(1)
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)

    // Selection states
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [itemToDelete, setItemToDelete] = useState<any | null>(null)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const observerTarget = useRef<HTMLDivElement>(null)
    const itemsPerPage = 8

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })

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

    // Filter plans based on search & active tab
    const filteredPlans = useMemo(() => {
        if (!rawPlans) return []

        const term = debouncedSearch.toLowerCase()

        const filtered = rawPlans
            .filter((p: any) => {
                const nameMatch = (p.name || "").toLowerCase().includes(term)
                const descMatch = (p.description || "").toLowerCase().includes(term)
                return nameMatch || descMatch
            })
            .filter((p: any) => {
                let tabMatch = true
                if (activeTab === "Ativo") tabMatch = p.status === "active"
                else if (activeTab === "Inativo") tabMatch = p.status === "inactive"
                else if (activeTab === "Arquivado") tabMatch = p.status === "archived"
                return tabMatch
            })

        const result = [...filtered]

        if (sortConfig) {
            const { key, direction } = sortConfig
            result.sort((a, b) => {
                let aVal = ""
                let bVal = ""

                if (key === "name") {
                    aVal = a.name || ""
                    bVal = b.name || ""
                } else if (key === "frequency") {
                    aVal = getRecurringFrequencyLabel(a.frequencyType, a.frequencyInterval)
                    bVal = getRecurringFrequencyLabel(b.frequencyType, b.frequencyInterval)
                } else if (key === "status") {
                    aVal = a.status || ""
                    bVal = b.status || ""
                }

                if (aVal === bVal) return 0
                const comparison = aVal < bVal ? -1 : 1
                return direction === "asc" ? comparison : -comparison
            })
        }

        return result
    }, [rawPlans, debouncedSearch, activeTab, sortConfig])

    const totalPages = Math.ceil(filteredPlans.length / itemsPerPage)
    const paginated = filteredPlans.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    const selectedPlan = useMemo(() => {
        if (!entityState.entityId) return null
        if (currentEntity) return currentEntity
        return rawPlans.find((p) => p.id === entityState.entityId) || null
    }, [entityState.entityId, currentEntity, rawPlans])

    useEffect(() => {
        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage])

    const hasPlans = rawPlans?.length > 0

    // Selection handlers
    const handleSelectAll = useCallback(() => {
        setSelectedIds(prev =>
            prev.size === paginated.length && paginated.length > 0
                ? new Set()
                : new Set(paginated.map(p => p.id))
        )
    }, [paginated])

    const handleSelectRow = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }, [])

    // Actions
    const handleAddPlan = () => openEntity("create")
    const handleEditPlan = (plan: any) => openEntity("edit", plan.id)
    const handleDetailsPlan = (plan: any) => openEntity("view", plan.id)

    const handleSharePlan = (plan: any) => {
        const shareUrl = `${window.location.origin}/erp/plans?view=${plan.id}`
        navigator.clipboard.writeText(shareUrl)
            .then(() => {
                notifySuccess("Link do plano copiado para a área de transferência!")
            })
            .catch((err) => {
                console.error("Erro ao copiar link: ", err)
                notifyError("Erro ao copiar o link.")
            })
    }

    const handleDeleteTrigger = (plan: any) => {
        setItemToDelete(plan)
        setIsDeleteModalOpen(true)
    }

    const handleDeleteConfirm = async () => {
        if (!itemToDelete) return
        setIsDeleting(true)
        try {
            const res = await deleteRecurringPlanAction(partnerId, itemToDelete.id)
            if (res.success) {
                notifySuccess("Plano recorrente excluído com sucesso!")
                setSelectedIds(prev => {
                    const next = new Set(prev)
                    next.delete(itemToDelete.id)
                    return next
                })
                afterMutation()
            } else {
                notifyError(res.error || "Erro ao excluir plano.")
            }
        } catch (e) {
            console.error(e)
            notifyError("Erro interno ao excluir.")
        } finally {
            setIsDeleting(false)
            setIsDeleteModalOpen(false)
            setItemToDelete(null)
        }
    }

    const handleBulkDeleteConfirm = async () => {
        setIsDeleting(true)
        try {
            let count = 0
            for (const id of Array.from(selectedIds)) {
                const res = await deleteRecurringPlanAction(partnerId, id)
                if (res.success) count++
            }
            notifySuccess(`${count} planos recorrentes excluídos com sucesso!`)
            setSelectedIds(new Set())
            afterMutation()
        } catch (e) {
            console.error(e)
            notifyError("Ocorreu um erro na exclusão em lote.")
        } finally {
            setIsDeleting(false)
            setIsBulkDeleteModalOpen(false)
        }
    }

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "asc" }
        })
    }

    return (
        <>
            <AnimatePresence mode="wait">
                {entityState.isOpen && (isViewing || isEditing || isCreating) ? (
                    isLoadingDetail ? (
                        <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                            <ThreeDotsLoader />
                        </div>
                    ) : (
                        <NewRecurringPlanPage
                            key="form"
                            partnerId={partnerId}
                            plan={selectedPlan}
                            onBack={() => closeEntity()}
                            onSuccess={() => {
                                afterMutation()
                                closeEntity()
                            }}
                        />
                    )
                ) : (
                    <FadeIn
                        key="list"
                        className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300 relative"
                    >
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

                            {/* Header */}
                            <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                                <div className="flex flex-col gap-2 pt-1">
                                    <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                        Planos Recorrentes
                                    </h1>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                        Configure planos que geram pedidos e agendamentos automaticamente.
                                    </p>
                                </div>

                                {canManage && (
                                    <Button onClick={handleAddPlan} leftIcon={<PlusIcon size={18} />}>
                                        Novo plano
                                    </Button>
                                )}
                            </div>

                            {/* Controls & Search */}
                            {hasPlans && (
                                <PlanPageControls
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    search={search}
                                    onSearchChange={setSearch}
                                    onAddPlan={handleAddPlan}
                                    viewMode={viewMode}
                                    onViewModeChange={setViewModeState}
                                    canManage={canManage}
                                />
                            )}

                            {/* Selection Banner */}
                            <div className="px-4 md:px-8">
                                <SelectionBanner
                                    selectedCount={selectedIds.size}
                                    totalCount={filteredPlans.length}
                                    onSelectAll={() => setSelectedIds(new Set(filteredPlans.map(p => p.id)))}
                                    onClearSelection={() => setSelectedIds(new Set())}
                                    itemName="planos"
                                    singularItemName="plano"
                                />
                            </div>

                            {/* Listing Content */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                                <AnimatePresence mode="wait">
                                    {isListLoading ? (
                                        <FadeIn key="loading" className="flex items-center justify-center min-h-[400px]">
                                            <ThreeDotsLoader />
                                        </FadeIn>
                                    ) : !hasPlans ? (
                                        <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/Estoque.png"
                                                imageAlt="Sem planos"
                                                title="Você ainda não tem planos"
                                                subtitle="Crie planos de recorrência para vender produtos ou agendar serviços de forma programada."
                                                itemButton={canManage ? {
                                                    text: "Criar Primeiro Plano",
                                                    action: handleAddPlan,
                                                } : undefined}
                                            />
                                        </FadeIn>
                                    ) : paginated.length === 0 ? (
                                        <FadeIn key="empty-results" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                imageAlt="Nenhum plano encontrado"
                                                title="Nenhum plano encontrado"
                                                subtitle="Ajuste os filtros de busca para encontrar o que procura."
                                                itemButton={{
                                                    text: "Limpar busca",
                                                    action: () => setSearch(""),
                                                    variant: "outline"
                                                }}
                                            />
                                        </FadeIn>
                                    ) : (
                                        <FadeIn key={activeTab + viewMode} className="w-full">
                                            {isMobile || viewMode === "grid" ? (
                                                /* Grid & Mobile Layout */
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                    {paginated.map((plan: RecurringPlan) => (
                                                        <PlanGridCard
                                                            key={plan.id}
                                                            plan={plan}
                                                            selected={selectedIds.has(plan.id)}
                                                            onSelect={() => handleSelectRow(plan.id)}
                                                            canManage={canManage}
                                                            onEdit={handleEditPlan}
                                                            onShare={handleSharePlan}
                                                            onDelete={handleDeleteTrigger}
                                                            onDetails={handleDetailsPlan}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                /* Desktop List Layout */
                                                <div className="w-full overflow-hidden rounded-xl border border-transparent dark:border-dark-border/20 bg-white dark:bg-dark-surface relative">
                                                    <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                                    <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                                    <div className="overflow-x-auto pb-2 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[800px]">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    {/* Checkbox Column */}
                                                                    <th className="py-3 px-6 w-12 bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border sticky left-0 z-20">
                                                                        <Checkbox
                                                                            checked={selectedIds.size === paginated.length && paginated.length > 0}
                                                                            onChange={handleSelectAll}
                                                                            className="bg-white dark:bg-dark-background"
                                                                        />
                                                                    </th>
                                                                    {COLUMNS.map((col) => {
                                                                        const isSorted = sortConfig?.key === col.key
                                                                        return (
                                                                            <th
                                                                                key={col.id}
                                                                                className={`py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border relative ${col.sortable ? "cursor-pointer hover:bg-gray-200 dark:hover:bg-dark-border transition-colors select-none group" : ""}`}
                                                                                style={{ width: col.width }}
                                                                                onClick={() => col.sortable && col.key && handleSort(col.key as SortKey)}
                                                                            >
                                                                                <div className={`flex items-center gap-1 ${col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                                    <span>{col.label}</span>
                                                                                    {col.sortable && (
                                                                                        <ArrowUpDownIcon className={`w-3.5 h-3.5 transition-all duration-200 ${isSorted ? "text-brand-primary block" : "text-gray-400 hidden group-hover:block opacity-40"}`} />
                                                                                    )}
                                                                                </div>
                                                                            </th>
                                                                        )
                                                                    })}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {paginated.map((plan: RecurringPlan) => (
                                                                    <PlanListRow
                                                                        key={plan.id}
                                                                        plan={plan}
                                                                        selected={selectedIds.has(plan.id)}
                                                                        onSelect={handleSelectRow}
                                                                        columns={COLUMNS}
                                                                        canManage={canManage}
                                                                        onEdit={handleEditPlan}
                                                                        onShare={handleSharePlan}
                                                                        onDelete={handleDeleteTrigger}
                                                                        onDetails={handleDetailsPlan}
                                                                    />
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </FadeIn>
                                    )}
                                </AnimatePresence>
                                {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
                            </div>

                            {hasPlans && paginated.length > 0 && (
                                <Pagination
                                    currentPage={page}
                                    totalPages={totalPages}
                                    onPageChange={(p) => {
                                        setPage(p)
                                        if (p === totalPages && hasNextPage && !isFetchingNextPage) {
                                            void fetchNextPage()
                                        }
                                    }}
                                />
                            )}
                        </div>
                    </FadeIn>
                )}
            </AnimatePresence>

            {/* Floating Action Bar */}
            <FloatingActionBar selectedCount={selectedIds.size} onClearSelection={() => setSelectedIds(new Set())}>
                <Button
                    variant="ghost"
                    onClick={() => setIsBulkDeleteModalOpen(true)}
                    leftIcon={<TrashIcon className="w-4 h-4" />}
                    className="h-10 px-3 text-brand-red"
                >
                    Excluir
                </Button>
            </FloatingActionBar>

            {/* Alert Modals */}
            <AlertModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeleteConfirm}
                title="Excluir Plano Recorrente?"
                message={`Tem certeza que deseja excluir o plano "${itemToDelete?.name || ""}"? Esta ação também removerá as configurações vinculadas e não pode ser desfeita.`}
                confirmText={isDeleting ? "Excluindo..." : "Excluir"}
                variant="danger"
                icon={<TrashIcon />}
            />

            <AlertModal
                isOpen={isBulkDeleteModalOpen}
                onClose={() => setIsBulkDeleteModalOpen(false)}
                onConfirm={handleBulkDeleteConfirm}
                title="Excluir planos em lote"
                message={`Tem certeza que deseja excluir definitivamente os ${selectedIds.size} planos selecionados? Esta ação é irreversível.`}
                confirmText={isDeleting ? "Excluindo..." : "Excluir Selecionados"}
                variant="danger"
            />
        </>
    )
}
