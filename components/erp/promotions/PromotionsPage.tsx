"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Button,
  Input,
  IconPlaceholder,
  Badge,
  Checkbox,
  Tabs,
  TabsList,
  TabsTrigger,
  Pagination,
  SelectionBanner,
  AlertModal,
  SavingStatusModal,
  ThreeDotsLoader,
  ActionsDropdown
} from "@/components/reusable"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import { useToast } from "@/hooks/use-toast"
import { useMediaQuery } from "@/components/erp/hooks"
import { useEntityPage } from "@/hooks/use-entity-page"
import {
  listCampaignsAction,
  listPromotionsAction,
  deleteCampaignAction,
  simulatePromotionsAction,
  getPromotionScopeDataAction,
} from "@/app/actions/shared/promotions"
import { formatCurrency } from "@/lib/utils/formatters"
import PromotionFormPage from "./PromotionFormPage"
import { PlusIcon, SearchIcon, TagIcon, SparklesIcon, TrashIcon, EditIcon, EyeIcon, PlayIcon, InfoIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"

const Div = (props: any) => React.createElement("div", props)
const P = (props: any) => React.createElement("p", props)
const Span = (props: any) => React.createElement("span", props)

export default function PromotionsPage({
  partnerId,
  partner,
  initialCampaigns = [],
  initialPromotions = [],
  initialTotal = 0,
  planGate,
}: {
  partnerId: string
  partner?: any
  initialCampaigns: any[]
  initialPromotions: any[]
  initialTotal: number
  planGate?: any
}) {
  const { toast } = useToast()
  const isMobile = useMediaQuery("(max-width: 767px)")
  const [activeTab, setActiveTab] = useState<"list" | "simulator">("list")

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
      const res = await listCampaignsAction(partnerId, { page: 1, limit: 100 })
      if (!res.success) throw new Error(res.error || "Erro ao carregar campanhas.")
      return { items: res.data || [], nextCursor: null, hasMore: false }
    },
    dedupeKey: useCallback((c: any) => String(c?.id || ""), []),
    getDetailFn: async (id: string) => {
      const res = await listCampaignsAction(partnerId, { page: 1, limit: 100 })
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
  const [scopeData, setScopeData] = useState<{ products: any[]; services: any[]; categories: any[]; customers: any[] }>({
    products: [],
    services: [],
    categories: [],
    customers: [],
  })
  const [isLoadingScope, setIsLoadingScope] = useState(false)
  const [page, setPage] = useState(1)
  const itemsPerPage = 8

  // Selection & Bulk states
  const [selection, setSelection] = useState({ ids: new Set<string>() })
  const [campaignToDelete, setCampaignToDelete] = useState<any | null>(null)
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [isProcessingAction, setIsProcessingAction] = useState(false)

  // Simulator State
  const [simCart, setSimCart] = useState<Array<{ product: any; quantity: number }>>([])
  const [simCoupon, setSimCoupon] = useState("")
  const [simShipping, setSimShipping] = useState<number>(0)
  const [simResult, setSimResult] = useState<any>(null)
  const [isSimulating, setIsSimulating] = useState(false)

  const refreshPromotions = async () => {
    const res = await listPromotionsAction(partnerId)
    if (res.success) {
      setPromotions(res.data || [])
    }
  }

  // Load scope data for forms and simulator
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
            customers: res.customers || [],
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

  // Filter & Paginate campaigns
  const filteredCampaigns = useMemo(() => {
    const term = debouncedSearch.toLowerCase().trim()
    if (!term) return campaigns
    return campaigns.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (c.description && c.description.toLowerCase().includes(term))
    )
  }, [campaigns, debouncedSearch])

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

  const handleRunSimulation = async () => {
    if (simCart.length === 0) {
      toast({ title: "Adicione pelo menos um item à sacola de simulação." })
      return
    }
    setIsSimulating(true)
    try {
      const res = await simulatePromotionsAction(partnerId, {
        items: simCart.map(item => ({
          productId: item.product.id,
          categoryId: item.product.categoryId,
          quantity: item.quantity,
          unitPrice: item.product.price,
        })),
        couponCode: simCoupon,
        shippingCost: Number(simShipping),
      })
      if (res.success) {
        setSimResult(res.result)
      } else {
        toast({ title: "Falha na simulação.", description: res.error, variant: "destructive" })
      }
    } catch (err) {
      console.error(err)
      toast({ title: "Erro inesperado na simulação." })
    } finally {
      setIsSimulating(false)
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
          isLoadingDetail ? (
            <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
              <ThreeDotsLoader />
            </div>
          ) : (
            <PromotionFormPage
              key="form"
              partnerId={partnerId}
              mode={formMode as any}
              campaign={formCampaign}
              scopeData={scopeData}
              promotions={promotions}
              onClose={() => {
                closeEntity()
                afterMutation()
                refreshPromotions()
              }}
            />
          )
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
                <div className="mx-4 md:mx-8 mb-4">
                  <Div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900/30 dark:bg-yellow-900/10 dark:text-yellow-200 flex items-start gap-3">
                    <InfoIcon className="h-5 w-5 shrink-0 mt-0.5" />
                    <Div>
                      <P className="font-bold">Aviso de Limitação de Plano</P>
                      <P>{planGate.message}</P>
                    </Div>
                  </Div>
                </div>
              )}

              {/* Tabs */}
              <div className="mb-6 px-4 md:px-8 flex-none">
                <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)}>
                  <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                    <TabsTrigger value="list" icon={TagIcon}>
                      Campanhas e Regras
                    </TabsTrigger>
                    <TabsTrigger value="simulator" icon={SparklesIcon}>
                      Simulador de Promoções
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {activeTab === "list" ? (
                <>
                  {/* Page Controls */}
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                    <div className="hidden md:flex items-center w-full gap-4">
                      <div className="w-80">
                        <Input
                          name="search"
                          placeholder="Buscar campanhas..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="h-[42px]"
                          variant="full-rounded"
                          prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                          label=""
                        />
                      </div>
                    </div>

                    <div className="md:hidden flex items-center gap-2 w-full">
                      <div className="flex-1 min-w-0">
                        <Input
                          name="search"
                          placeholder="Buscar..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="h-[42px] w-full"
                          variant="full-rounded"
                          prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                          label=""
                        />
                      </div>
                      <Button
                        onClick={() => openEntity('create')}
                        className="w-[42px] h-[42px] p-0 flex items-center justify-center shrink-0"
                      >
                        <PlusIcon size={18} />
                      </Button>
                    </div>
                  </div>

                  {/* List and Table Content */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                    {campaigns.length === 0 ? (
                      <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/Estoque.png"
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
                          action: () => setSearch("")
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

                        {isMobile ? (
                          <div className="flex flex-col border-b border-brand-border dark:border-dark-border">
                            {paginatedCampaigns.map((camp: any) => {
                              const isSelected = selection.ids.has(camp.id)
                              const campPromos = promotions.filter(p => p.campaign_id === camp.id)
                              return (
                                <div
                                  key={camp.id}
                                  className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 cursor-pointer flex items-center gap-4"
                                  onClick={() => openEntity('view', camp.id)}
                                >
                                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                                    <div className="flex justify-between items-start">
                                      <div className="flex flex-col min-w-0 pr-1">
                                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                          {camp.name}
                                        </h3>
                                        <span className="flex items-center text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate">
                                          {camp.customer_scope === "specific" ? "Segmentado" : "Público Geral"}
                                        </span>
                                      </div>
                                      <Badge variant={camp.is_active ? 'green' : 'gray'} className="shrink-0 text-[10px] h-5 px-1.5">
                                        {camp.is_active ? "Ativo" : "Inativo"}
                                      </Badge>
                                    </div>
                                    <div className="flex justify-between items-center mt-1">
                                      <span className="text-[14px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                        {campPromos.length} regra{campPromos.length !== 1 && 's'}
                                      </span>
                                      <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                          {camp.starts_at ? new Date(camp.starts_at).toLocaleDateString() : "Sem início"}
                                        </span>
                                        <Checkbox checked={isSelected} onChange={() => {
                                          setSelection(p => {
                                            const s = new Set(p.ids)
                                            s.has(camp.id) ? s.delete(camp.id) : s.add(camp.id)
                                            return { ids: s }
                                          })
                                        }} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
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
                                        checked={selection.ids.size === paginatedCampaigns.length && paginatedCampaigns.length > 0}
                                        onChange={(checked) => {
                                          setSelection({ ids: checked ? new Set(paginatedCampaigns.map(x => x.id)) : new Set() })
                                        }}
                                        className="bg-white dark:bg-dark-background"
                                      />
                                    </th>
                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">Campanha</th>
                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">Vigência</th>
                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">Público</th>
                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">Regras</th>
                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center">Status</th>
                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center rounded-r-lg">Ações</th>
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
                                            {camp.description && <span className="text-xs text-brand-inactive-text dark:text-dark-body truncate max-w-[250px]">{camp.description}</span>}
                                          </div>
                                        </td>
                                        <td className="p-2 border-b border-brand-border dark:border-dark-border text-[13px] text-brand-inactive-text dark:text-dark-body">
                                          {camp.starts_at ? new Date(camp.starts_at).toLocaleDateString() : 'Indeterminado'}
                                          {camp.ends_at ? ` a ${new Date(camp.ends_at).toLocaleDateString()}` : ''}
                                        </td>
                                        <td className="p-2 border-b border-brand-border dark:border-dark-border">
                                          <Badge variant="blue" className="text-xs">
                                            {camp.customer_scope === "specific" ? "Segmentado" : "Geral"}
                                          </Badge>
                                        </td>
                                        <td className="p-2 border-b border-brand-border dark:border-dark-border text-[13px] font-semibold text-brand-dark dark:text-dark-heading">
                                          {campPromos.length} regra{campPromos.length !== 1 && 's'}
                                        </td>
                                        <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                          <Badge variant={camp.is_active ? "green" : "gray"}>
                                            {camp.is_active ? "Ativa" : "Rascunho/Inativa"}
                                          </Badge>
                                        </td>
                                        <td className="p-2 border-b border-brand-border dark:border-dark-border text-center" onClick={(e) => e.stopPropagation()}>
                                          <ActionsDropdown
                                            onView={() => openEntity('view', camp.id)}
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
              ) : (
                /* Simulator Tab */
                <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8 custom-scrollbar">
                  <Div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                    <Div className="lg:col-span-2 space-y-6">
                      <Div className="rounded-2xl border border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface shadow-sm space-y-4">
                        <h3 className="text-md font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                          <SparklesIcon className="text-brand-primary h-5 w-5" /> Montar Sacola de Simulação
                        </h3>

                        <Div className="space-y-2">
                          <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Adicionar Produto à Sacola</label>
                          <select
                            onChange={(e) => {
                              if (!e.target.value) return
                              const prod = scopeData.products.find(p => p.id === e.target.value)
                              if (prod) {
                                const existing = simCart.find(item => item.product.id === prod.id)
                                if (existing) {
                                  setSimCart(simCart.map(item => item.product.id === prod.id ? { ...item, quantity: item.quantity + 1 } : item))
                                } else {
                                  setSimCart([...simCart, { product: prod, quantity: 1 }])
                                }
                              }
                              e.target.value = ""
                            }}
                            className="w-full p-3 rounded-xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface dark:text-white"
                          >
                            <option value="">Selecione um produto...</option>
                            {scopeData.products.map(p => (
                              <option key={p.id} value={p.id}>{p.name} - {formatCurrency(p.price)}</option>
                            ))}
                          </select>
                        </Div>

                        <Div className="space-y-3">
                          <h3 className="text-xs font-bold uppercase text-brand-inactive-text">Itens na Sacola ({simCart.length})</h3>
                          {simCart.length > 0 ? (
                            <Div className="space-y-2">
                              {simCart.map((item, idx) => (
                                <Div key={idx} className="flex items-center justify-between border border-brand-border dark:border-dark-border p-3 rounded-xl">
                                  <Div>
                                    <P className="font-semibold text-sm text-brand-dark dark:text-dark-heading">{item.product.name}</P>
                                    <P className="text-xs text-brand-inactive-text">{formatCurrency(item.product.price)} x {item.quantity}</P>
                                  </Div>
                                  <Div className="flex items-center gap-3">
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => {
                                        const val = Math.max(1, parseInt(e.target.value) || 1)
                                        setSimCart(simCart.map((it, i) => i === idx ? { ...it, quantity: val } : it))
                                      }}
                                      className="w-16 p-1 text-center rounded border border-brand-border dark:border-dark-border dark:bg-dark-surface"
                                    />
                                    <button
                                      onClick={() => setSimCart(simCart.filter((_, i) => i !== idx))}
                                      className="text-red-500 hover:bg-red-50 p-1.5 rounded"
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  </Div>
                                </Div>
                              ))}
                            </Div>
                          ) : (
                            <P className="text-sm text-brand-inactive-text py-4">A sacola de simulação está vazia.</P>
                          )}
                        </Div>

                        <Div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Div className="space-y-1">
                            <label className="text-xs font-semibold text-brand-dark dark:text-dark-heading">Cupom (Opcional)</label>
                            <input
                              type="text"
                              placeholder="DIGITEOCUPOM"
                              value={simCoupon}
                              onChange={e => setSimCoupon(e.target.value.toUpperCase())}
                              className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface uppercase"
                            />
                          </Div>
                          <Div className="space-y-1">
                            <label className="text-xs font-semibold text-brand-dark dark:text-dark-heading">Valor da Entrega</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="0.00"
                              value={simShipping}
                              onChange={e => setSimShipping(Math.max(0, parseFloat(e.target.value) || 0))}
                              className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface"
                            />
                          </Div>
                        </Div>

                        <Button
                          variant="filled"
                          className="w-full h-12"
                          onClick={handleRunSimulation}
                          isLoading={isSimulating}
                        >
                          <PlayIcon className="mr-2 h-5 w-5" /> Executar Simulação
                        </Button>
                      </Div>
                    </Div>

                    <Div className="lg:col-span-1">
                      <Div className="rounded-2xl border border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface shadow-sm space-y-6 h-full flex flex-col justify-between">
                        <Div className="space-y-4">
                          <h3 className="text-md font-bold text-brand-dark dark:text-dark-heading">Resultado da Simulação</h3>

                          {simResult ? (
                            <Div className="space-y-4">
                              <Div className="space-y-2 text-sm border-b border-brand-border dark:border-dark-border pb-4">
                                <Div className="flex justify-between">
                                  <Span className="text-brand-inactive-text">Subtotal</Span>
                                  <Span className="font-semibold">{formatCurrency(simResult.subtotal)}</Span>
                                </Div>

                                {simResult.promotionSavings > 0 && (
                                  <Div className="flex justify-between text-green-600">
                                    <Span>Promoção Produto (Original vs Promo)</Span>
                                    <Span>-{formatCurrency(simResult.promotionSavings)}</Span>
                                  </Div>
                                )}

                                {simResult.promotionDiscountAmount > 0 && (
                                  <Div className="flex justify-between text-green-600 font-bold">
                                    <Span>Desconto Campanhas</Span>
                                    <Span>-{formatCurrency(simResult.promotionDiscountAmount)}</Span>
                                  </Div>
                                )}

                                {simResult.couponDiscountAmount > 0 && (
                                  <Div className="flex justify-between text-green-600">
                                    <Span>Desconto Cupom</Span>
                                    <Span>-{formatCurrency(simResult.couponDiscountAmount)}</Span>
                                  </Div>
                                )}

                                {simResult.manualDiscountAmount > 0 && (
                                  <Div className="flex justify-between text-green-600">
                                    <Span>Desconto Manual</Span>
                                    <Span>-{formatCurrency(simResult.manualDiscountAmount)}</Span>
                                  </Div>
                                )}

                                <Div className="flex justify-between">
                                  <Span className="text-brand-inactive-text">Entrega</Span>
                                  <Span className={simResult.freeShippingApplied ? "line-through text-brand-inactive-text" : "font-semibold"}>
                                    {formatCurrency(simResult.shipping)}
                                  </Span>
                                </Div>

                                {simResult.freeShippingApplied && (
                                  <Div className="flex justify-between text-green-600 font-semibold text-xs">
                                    <Span>Entrega Grátis Aplicada</Span>
                                    <Span>Grátis</Span>
                                  </Div>
                                )}
                              </Div>

                              <Div className="flex justify-between text-lg font-bold text-brand-dark dark:text-dark-heading border-b border-brand-border dark:border-dark-border pb-4">
                                <Span>Total Final</Span>
                                <Span className="text-brand-primary">{formatCurrency(simResult.finalTotal)}</Span>
                              </Div>

                              <Div className="space-y-3">
                                <h3 className="text-xs font-bold uppercase text-brand-inactive-text">Promoções Aplicadas ({simResult.appliedPromotionIds.length})</h3>
                                {simResult.appliedPromotionIds.length > 0 ? (
                                  <Div className="flex flex-wrap gap-2">
                                    {simResult.appliedPromotionIds.map((pId: string) => {
                                      const p = promotions.find(promo => promo.id === pId)
                                      return (
                                        <Badge key={pId} variant="green">
                                          {p?.name || "Regra Aplicada"}
                                        </Badge>
                                      )
                                    })}
                                  </Div>
                                ) : (
                                  <P className="text-xs text-brand-inactive-text">Nenhuma regra de campanha foi qualificada.</P>
                                )}
                              </Div>

                              <Div className="space-y-3 pt-2">
                                <h3 className="text-xs font-bold uppercase text-brand-inactive-text">Brindes Conquistados ({simResult.appliedGiftProductIds.length})</h3>
                                {simResult.appliedGiftProductIds.length > 0 ? (
                                  <Div className="space-y-1">
                                    {simResult.appliedGiftProductIds.map((gId: string, idx: number) => {
                                      const prod = scopeData.products.find(p => p.id === gId)
                                      return (
                                        <Div key={idx} className="text-xs text-green-700 bg-green-50 p-2 rounded-lg border border-green-200 flex items-center gap-2">
                                          <SparklesIcon size={14} />
                                          <Span className="font-semibold">{prod?.name || "Brinde Especial"}</Span>
                                        </Div>
                                      )
                                    })}
                                  </Div>
                                ) : (
                                  <P className="text-xs text-brand-inactive-text">Nenhum brinde conquistado nesta compra.</P>
                                )}
                              </Div>
                            </Div>
                          ) : (
                            <Div className="text-center py-12 text-brand-inactive-text">
                              <PlayIcon className="mx-auto h-12 w-12 opacity-30 mb-2" />
                              <P className="text-sm">Configure a sacola de teste e clique em "Executar Simulação" para ver os resultados.</P>
                            </Div>
                          )}
                        </Div>
                        {simResult && (
                          <Button variant="outline" className="w-full mt-4" onClick={() => setSimResult(null)}>
                            Limpar Simulação
                          </Button>
                        )}
                      </Div>
                    </Div>
                  </Div>
                </div>
              )}
            </div>
          </FadeIn>
        )}
      </AnimatePresence>

      <FloatingActionBar selectedCount={selection.ids.size} onClearSelection={() => setSelection({ ids: new Set() })}>
        <Button
          variant="ghost"
          size="sm"
          className="text-brand-red gap-2 font-bold px-3 hover:bg-red-50 hover:text-brand-red dark:hover:bg-red-900/20"
          onClick={() => setShowBulkDeleteModal(true)}
        >
          <TrashIcon size={16} /> Excluir Selecionados
        </Button>
      </FloatingActionBar>

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

      <SavingStatusModal isOpen={isProcessingAction} text="Processando..." />
    </>
  )
}
