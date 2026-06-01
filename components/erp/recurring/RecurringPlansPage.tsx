"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useEntityPage } from "@/hooks/use-entity-page"

// Reusable Components
import {
  Button,
  IconPlaceholder,
  ThreeDotsLoader,
  Pagination,
} from "@/components/reusable"

// Specific Page components
import NewRecurringPlanPage from "./NewRecurringPlanPage"
import PlanPageControls from "./PlanPageControls"
import PlanGridCard from "./PlanGridCard"
import PlanListRow from "./PlanListRow"

// Icons & Utils
import {
  PlusIcon
} from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { listRecurringPlansAction } from "@/app/actions/erp/recurring-plans"
import type { RecurringPlan } from "@/lib/types/recurring"
import { getRecurringFrequencyLabel } from "@/lib/types/recurring"
import { formatFullDate } from "@/lib/utils"

type SortKey = "name" | "frequency" | "status"
type SortDirection = "asc" | "desc"

const COLUMNS = [
  { id: "name", label: "Plano", align: "left" as const, width: "350px" },
  { id: "frequency", label: "Frequência", align: "left" as const, width: "250px" },
  { id: "status", label: "Status", align: "center" as const, width: "150px" },
  { id: "actions", label: "Ações", align: "center" as const, width: "100px" },
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

  // Actions
  const handleAddPlan = () => openEntity("create")
  const handleEditPlan = (plan: any) => openEntity("edit", plan.id)
  const handleDetailsPlan = (plan: any) => openEntity("view", plan.id)

  const statusVariant = (status: string) => {
    if (status === "active") return "green" as const
    if (status === "inactive") return "orange" as const
    return "gray" as const
  }

  const statusLabel = (status: string) => {
    if (status === "active") return "Ativo"
    if (status === "inactive") return "Inativo"
    return "Arquivado"
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
            className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300"
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
                              canManage={canManage}
                              onEdit={handleEditPlan}
                              onDetails={handleDetailsPlan}
                            />
                          ))}
                        </div>
                      ) : (
                        /* Desktop List Layout */
                        <div className="w-full overflow-hidden rounded-xl border border-brand-border dark:border-dark-border relative">
                          <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                          <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                          <div className="overflow-x-auto pb-2 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                            <table className="w-full text-left border-separate border-spacing-0 min-w-[800px]">
                              <thead>
                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                  {COLUMNS.map((col) => (
                                    <th
                                      key={col.id}
                                      className="py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border"
                                      style={{ width: col.width }}
                                    >
                                      <div className={`flex items-center ${col.align === "center" ? "justify-center" : "justify-start"}`}>
                                        {col.label}
                                      </div>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {paginated.map((plan: RecurringPlan) => (
                                  <PlanListRow
                                    key={plan.id}
                                    plan={plan}
                                    columns={COLUMNS}
                                    canManage={canManage}
                                    onEdit={handleEditPlan}
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
    </>
  )
}
