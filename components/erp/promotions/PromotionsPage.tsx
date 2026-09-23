"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
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
  ActionsDropdown
} from "@/components/reusable"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import FilterChip from "@/components/reusable/FilterChip"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { useToast } from "@/hooks/use-toast"
import { useMediaQuery } from "@/components/erp/hooks"
import { useEntityPage } from "@/hooks/use-entity-page"
import {
  listCampaignsAction,
  listPromotionsAction,
  deleteCampaignAction,
  getPromotionScopeDataAction,
  toggleCampaignsStatusAction,
  bulkUpdateCampaignsAction
} from "@/app/actions/shared/promotions"
import { formatCurrency } from "@/lib/utils/formatters"
import {
  EMPTY_DATE_PERIOD,
  resolveDatePeriodBounds,
  ymdInBounds,
  msToBrazilYmd,
  isDatePeriodFilterActive,
  type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"
import PromotionFormPage from "./PromotionFormPage"
import PromotionGridCard from "./PromotionGridCard"
import PromotionBulkEditModal from "./PromotionBulkEditModal"
import PromotionPageControls from "./PromotionPageControls"
import { usePartnerTimezone } from "@/lib/store-context"
import {
  PlusIcon,
  SearchIcon,
  TagIcon,
  TrashIcon,
  EditIcon,
  EyeIcon,
  InfoIcon,
  FilterIcon,
  ListIcon,
  GridIcon,
  ArrowUpDownIcon,
  BlockedIcon,
  CheckCircleIcon
} from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"

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

export default function PromotionsPage({
  partnerId,
  partner,
  initialCampaigns = [],
  initialPromotions = [],
  initialTotal = 0,
  storeId,
  planGate,
}: {
  partnerId: string
  partner?: any
  initialCampaigns: any[]
  initialPromotions: any[]
  initialTotal: number
  storeId?: string | null
  planGate?: any
}) {
  const { toast } = useToast()
  const tz = usePartnerTimezone()
  const { openPlanUpgrade } = usePlanUpgrade()
  const isMobile = useMediaQuery("(max-width: 767px)")
  const isTabletOrMobile = useMediaQuery("(max-width: 1024px)")

  const queryKey = useMemo(() => ["erp", "promotions", partnerId] as const, [partnerId])

  // ── Entity Page Hook (URL state + cache + list) ──────────
  const entityPage = useEntityPage<any, any, any>({
    entityType: 'promotions',
    partnerId,
    queryKey,
    initialItems: initialCampaigns,
    initialNextCursor: null,
    initialHasMore: false,
    fetchPageFn: async () => {
      const res = await listCampaignsAction(partnerId, { page: 1, limit: 100, storeId })
      if (!res.success) throw new Error(res.error || "Erro ao carregar campanhas.")
      return { items: res.data || [], nextCursor: null, hasMore: false }
    },
    dedupeKey: useCallback((c: any) => String(c?.id || ""), []),
    getDetailFn: async (id: string) => {
      const res = await listCampaignsAction(partnerId, { page: 1, limit: 100, storeId })
      if (res.success) {
        return res.data?.find((c: any) => c.id === id) || null
      }
      return null
    },
    listToDetail: useCallback((item: any) => item, []),
  })

  const {
    items: campaigns,
    entityState,
    openEntity,
    closeEntity,
    isViewing,
    isEditing,
    isCreating,
    isDuplicating,
    currentEntity,
    isLoadingDetail,
    search,
    setSearch,
    debouncedSearch,
    afterMutation,
  } = entityPage

  const [promotions, setPromotions] = useState<any[]>(initialPromotions)
  const [scopeData, setScopeData] = useState<{ products: any[]; services: any[]; categories: any[]; serviceCategories: any[]; customers: any[]; stores?: { id: string; name: string; isActive: boolean }[] }>({
    products: [],
    services: [],
    categories: [],
    serviceCategories: [],
    customers: [],
    stores: [],
  })
  const [isLoadingScope, setIsLoadingScope] = useState(false)
  const [page, setPage] = useState(1)
  const itemsPerPage = 8

  // Selection & Bulk states
  const [selection, setSelection] = useState({ ids: new Set<string>() })
  const [campaignToDelete, setCampaignToDelete] = useState<any | null>(null)
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [isProcessingAction, setIsProcessingAction] = useState(false)

  // New States
  const [viewMode, setViewModeState] = useState<"list" | "grid">(isTabletOrMobile ? "grid" : "list")
  const effectiveViewMode = isTabletOrMobile ? "grid" : viewMode
  const [filters, setFilters] = useState<{
    status: string[]
    datePeriod: DatePeriodFilterValue
  }>({
    status: [],
    datePeriod: { ...EMPTY_DATE_PERIOD }
  })
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false)
  const [bulkStatusToApply, setBulkStatusToApply] = useState(true)

  const refreshPromotions = async () => {
    const res = await listPromotionsAction(partnerId, undefined, storeId)
    if (res.success) {
      setPromotions(res.data || [])
    }
  }

  // Load scope data
  useEffect(() => {
    async function loadScope() {
      setIsLoadingScope(true)
      try {
        const res = await getPromotionScopeDataAction(partnerId)
        if (res.success) {
          setScopeData({
            products: res.products || [],
            services: res.services || [],
            categories: res.categories || [],
            serviceCategories: (res as any).serviceCategories || [],
            customers: res.customers || [],
            stores: (res as any).stores || [],
          })
        }
      } catch (err) {
        console.error("Error loading scope data:", err)
      } finally {
        setIsLoadingScope(false)
      }
    }
    loadScope()
  }, [partnerId])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, filters])

  const hasActiveFilters = useMemo(() => {
    return filters.status.length > 0 || isDatePeriodFilterActive(filters.datePeriod) || search.trim().length > 0
  }, [filters, search])

  const filterSections = useMemo<FilterSectionConfig[]>(() => {
    return [
      {
        id: "status",
        title: "Status da Campanha",
        type: "checkbox-list",
        options: ["Ativa", "Inativa"],
      },
      {
        id: "datePeriod",
        title: "Período de Vigência",
        type: "date-period",
      },
    ]
  }, [])

  // Filter & Paginate campaigns
  const filteredCampaigns = useMemo(() => {
    let result = campaigns

    // 1. Search term filter
    const term = debouncedSearch.toLowerCase().trim()
    if (term) {
      result = result.filter(c =>
        c.name.toLowerCase().includes(term) ||
        (c.description && c.description.toLowerCase().includes(term))
      )
    }

    // 2. Status filter
    if (filters.status.length > 0) {
      result = result.filter(c => {
        const statusStr = c.is_active ? "Ativa" : "Inativa"
        return filters.status.includes(statusStr)
      })
    }

    // 3. Date period filter
    if (isDatePeriodFilterActive(filters.datePeriod)) {
      const { startYmd, endYmd } = resolveDatePeriodBounds(filters.datePeriod)
      result = result.filter(c => {
        if (!c.starts_at) return false
        const campDateYmd = msToBrazilYmd(new Date(c.starts_at).getTime())
        return ymdInBounds(campDateYmd, startYmd, endYmd)
      })
    }

    // 4. Sort
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        let aVal: any = a[sortConfig.key]
        let bVal: any = b[sortConfig.key]

        if (sortConfig.key === 'starts_at') {
          aVal = a.starts_at ? new Date(a.starts_at).getTime() : 0
          bVal = b.starts_at ? new Date(b.starts_at).getTime() : 0
        } else if (sortConfig.key === 'apply_scope') {
          const promoA = promotions.find(p => p.campaign_id === a.id)
          const promoB = promotions.find(p => p.campaign_id === b.id)
          aVal = promoA?.apply_scope || ""
          bVal = promoB?.apply_scope || ""
        }

        if (aVal === bVal) return 0
        const comparison = aVal < bVal ? -1 : 1
        return sortConfig.direction === 'asc' ? comparison : -comparison
      })
    }

    return result
  }, [campaigns, debouncedSearch, filters, sortConfig, promotions])

  const totalPages = Math.ceil(filteredCampaigns.length / itemsPerPage)
  const paginatedCampaigns = useMemo(() => {
    return filteredCampaigns.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  }, [filteredCampaigns, page, itemsPerPage])

  // Stats Card Calculations
  const stats = useMemo(() => {
    const activeCamp = campaigns.filter((c: any) => c.is_active).length
    const activePromo = promotions.filter((p: any) => p.is_active).length
    return {
      activeCamp,
      activePromo,
      totalCamp: campaigns.length,
      totalPromo: promotions.length,
    }
  }, [campaigns, promotions])

  const handleDeleteCampaign = (campaign: any) => {
    setCampaignToDelete(campaign)
  }

  const confirmSingleDelete = async () => {
    if (!campaignToDelete) return
    setIsProcessingAction(true)
    const res = await deleteCampaignAction(partnerId, campaignToDelete.id)
    setIsProcessingAction(false)
    if (res.success) {
      toast({ title: "Campanha excluída com sucesso." })
      setSelection(p => {
        const nextIds = new Set(p.ids)
        nextIds.delete(campaignToDelete.id)
        return { ...p, ids: nextIds }
      })
      afterMutation()
      refreshPromotions()
      setCampaignToDelete(null)
    } else {
      toast({ title: "Erro ao excluir campanha.", description: res.error, variant: "destructive" })
    }
  }

  const confirmBulkDelete = async () => {
    const ids = Array.from(selection.ids)
    if (ids.length === 0) return
    setIsProcessingAction(true)
    let hasError = false
    let lastError = ""
    for (const id of ids) {
      const res = await deleteCampaignAction(partnerId, id)
      if (!res.success) {
        hasError = true
        lastError = res.error || ""
      }
    }
    setIsProcessingAction(false)
    setShowBulkDeleteModal(false)
    if (hasError) {
      toast({ title: "Algumas campanhas não puderam ser excluídas.", description: lastError, variant: "destructive" })
    } else {
      toast({ title: "Campanhas excluídas com sucesso." })
    }
    setSelection({ ids: new Set() })
    afterMutation()
    refreshPromotions()
  }

  const handleBulkStatusChange = async () => {
    const ids = Array.from(selection.ids)
    if (ids.length === 0) return
    setIsProcessingAction(true)
    const res = await toggleCampaignsStatusAction(partnerId, ids, bulkStatusToApply)
    setIsProcessingAction(false)
    setShowBulkStatusModal(false)
    if (res.success) {
      toast({ title: "Status atualizado com sucesso." })
      setSelection({ ids: new Set() })
      afterMutation()
      refreshPromotions()
    } else {
      toast({ title: "Erro ao atualizar status.", description: res.error, variant: "destructive" })
    }
  }

  const handleBulkEditApply = async (fields: any) => {
    const ids = Array.from(selection.ids)
    if (ids.length === 0) return
    setIsProcessingAction(true)
    const res = await bulkUpdateCampaignsAction(partnerId, ids, fields)
    setIsProcessingAction(false)
    if (res.success) {
      toast({ title: "Campanhas atualizadas com sucesso." })
      setSelection({ ids: new Set() })
      afterMutation()
      refreshPromotions()
    } else {
      toast({ title: "Erro ao atualizar campanhas.", description: res.error, variant: "destructive" })
    }
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
    return currentEntity || campaigns.find(c => c.id === entityState.entityId) || null
  }, [entityState, currentEntity, campaigns])

  return (
    <>
      <AnimatePresence mode="wait">
        {entityState.isOpen && formMode ? (
          <FadeIn key="form" className="w-full h-full">
            <PromotionFormPage
              partnerId={partnerId}
              mode={formMode as any}
              campaign={formCampaign}
              scopeData={scopeData}
              promotions={promotions}
              storeId={storeId}
              onBack={() => {
                closeEntity()
                afterMutation()
                refreshPromotions()
              }}
            />
          </FadeIn>
        ) : (
          <FadeIn key="list" className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
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
                  <div className="flex items-center gap-3">
                    <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                      Campanhas e Promoções
                    </h1>
                  </div>
                  <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                    Gerencie suas campanhas de marketing e regras de promoção.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={() => openEntity('create')} leftIcon={<PlusIcon size={18} />}>
                    Nova Campanha
                  </Button>
                </div>
              </div>

              {planGate && (
                <div className="flex flex-col items-center justify-center text-center min-h-[400px] px-4">
                  <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Campanhas.png"
                    imageAlt="Recurso bloqueado"
                    title="Campanhas e Promoções"
                    subtitle="Crie campanhas de marketing e promoções para aumentar suas vendas. Disponível nos planos Crescer e Escalar."
                    itemButton={{
                      text: "Fazer upgrade",
                      action: () => openPlanUpgrade(planGate.requiredPlanSlug)
                    }}
                  />
                </div>
              )}

               {!planGate && (
                 <>
                   {/* Page Controls */}
                   <PromotionPageControls
                     search={search}
                     onSearchChange={setSearch}
                     onOpenFilter={() => setIsFilterSheetOpen(true)}
                     filters={filters}
                     setFilters={setFilters}
                     viewMode={viewMode}
                     onViewModeChange={(mode) => setViewModeState(mode)}
                     hasActiveFilters={hasActiveFilters}
                     onAddCampaign={() => openEntity('create')}
                   />

                      {/* List and Table Content */}
                      <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                        {campaigns.length === 0 ? (
                          <IconPlaceholder
                            placeholderType="image"
                            imageSrc="https://img.dudit.com.br/static/mascots/Campanhas.png"
                            imageAlt="Sem campanhas"
                            title="Nenhuma campanha cadastrada"
                            subtitle="Crie campanhas de marketing para oferecer descontos e brindes."
                            itemButton={{
                              text: "Cadastrar Nova Campanha",
                              action: () => openEntity('create')
                            }}
                          />
                        ) : filteredCampaigns.length === 0 ? (
                          <IconPlaceholder
                            placeholderType="image"
                            imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                            imageAlt="Nenhuma campanha encontrada"
                            title="Nenhuma campanha encontrada"
                            subtitle="Ajuste os termos de busca."
                            itemButton={{
                              text: "Limpar filtros",
                              action: () => {
                                setSearch("")
                                setFilters({ status: [], datePeriod: { ...EMPTY_DATE_PERIOD } })
                              }
                            }}
                          />
                        ) : (
                          <>
                            <SelectionBanner
                              selectedCount={selection.ids.size}
                              totalCount={filteredCampaigns.length}
                              onSelectAll={() => setSelection({ ids: new Set(filteredCampaigns.map(c => c.id)) })}
                              onClearSelection={() => setSelection({ ids: new Set() })}
                              itemName="campanhas"
                              singularItemName="campanha"
                            />

                            {effectiveViewMode === "grid" ? (
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

                                        {/* Campanha column (sortable) */}
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

                                        {/* Vigência column (sortable) */}
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

                                        {/* Escopo column */}
                                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">
                                          Escopo
                                        </th>

                                        {/* Regras column */}
                                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">
                                          Regras
                                        </th>

                                        {/* Status column (sortable) */}
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

                                        {/* Ações column */}
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
                                              <Checkbox checked={isSelected} onChange={() => {
                                                setSelection(p => {
                                                  const s = new Set(p.ids)
                                                  s.has(camp.id) ? s.delete(camp.id) : s.add(camp.id)
                                                  return { ids: s }
                                                })
                                              }} />
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
                          </>
                        )}
                      </div>

                      {totalPages > 1 && (
                        <div className="flex-none py-4">
                          <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            onPageChange={setPage}
                          />
                        </div>
                      )}
                    </>
                  )}
            </div>
          </FadeIn>
        )}
      </AnimatePresence>

      <FloatingActionBar
        selectedCount={selection.ids.size}
        onClearSelection={() => setSelection({ ids: new Set() })}
      >
        <Button
          variant="ghost"
          onClick={() => setShowBulkEditModal(true)}
          leftIcon={<EditIcon size={18} />}
          className="h-10 px-3"
        >
          Ações em massa
        </Button>

        <Button
          variant="ghost"
          onClick={() => {
            const allInactive = paginatedCampaigns.filter(c => selection.ids.has(c.id)).every(c => !c.is_active)
            setBulkStatusToApply(allInactive)
            setShowBulkStatusModal(true)
          }}
          leftIcon={
            paginatedCampaigns.filter(c => selection.ids.has(c.id)).every(c => !c.is_active)
              ? <CheckCircleIcon size={18} />
              : <BlockedIcon size={18} />
          }
          className="h-10 px-3"
        >
          {paginatedCampaigns.filter(c => selection.ids.has(c.id)).every(c => !c.is_active) ? "Ativar" : "Desativar"}
        </Button>

        <Button
          variant="ghostred"
          onClick={() => setShowBulkDeleteModal(true)}
          leftIcon={<TrashIcon size={18} />}
          className="h-10 px-3"
        >
          Excluir
        </Button>
      </FloatingActionBar>

      <PromotionBulkEditModal
        isOpen={showBulkEditModal}
        onClose={() => setShowBulkEditModal(false)}
        selectedCount={selection.ids.size}
        partnerId={partnerId}
        scopeData={scopeData}
        onApply={handleBulkEditApply}
      />

      <AlertModal
        isOpen={showBulkStatusModal}
        onClose={() => setShowBulkStatusModal(false)}
        onConfirm={handleBulkStatusChange}
        title="Atualizar Status"
        description={`Tem certeza que deseja ${bulkStatusToApply ? "ativar" : "desativar"} ${selection.ids.size} campanha(s)?`}
        confirmText="Confirmar"
        variant="warning"
      />

      <AlertModal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        title="Excluir Campanhas"
        description={`Tem certeza que deseja excluir ${selection.ids.size} campanha(s)? Todas as regras de promoção vinculadas serão excluídas. Esta ação não pode ser desfeita.`}
        confirmText="Sim, excluir"
        variant="danger"
        onConfirm={confirmBulkDelete}
      />

      <AlertModal
        isOpen={!!campaignToDelete}
        onClose={() => setCampaignToDelete(null)}
        title="Excluir Campanha"
        description={`Tem certeza que deseja excluir a campanha "${campaignToDelete?.name}"? Todas as regras de promoção vinculadas serão excluídas. Esta ação não pode ser desfeita.`}
        confirmText="Sim, excluir"
        variant="danger"
        onConfirm={confirmSingleDelete}
      />

      <FilterSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        sections={filterSections}
        filters={filters}
        setFilters={setFilters}
        onClear={() => setFilters({ status: [], datePeriod: { ...EMPTY_DATE_PERIOD } })}
      />

      <SavingStatusModal isOpen={isProcessingAction} text="Processando..." />
    </>
  )
}
