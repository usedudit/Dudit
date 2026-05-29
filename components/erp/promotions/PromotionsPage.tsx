"use client"

import React, { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { PlusIcon, SearchIcon, TagIcon, SparklesIcon, TrashIcon, EditIcon, EyeIcon, PlayIcon, InfoIcon } from "@/lib/icons"
import { Button, Input, IconPlaceholder, Badge } from "@/components/reusable"
import { useToast } from "@/hooks/use-toast"
import {
  listCampaignsAction,
  listPromotionsAction,
  deleteCampaignAction,
  deletePromotionAction,
  togglePromotionStatusAction,
  simulatePromotionsAction,
  getPromotionScopeDataAction,
} from "@/app/actions/shared/promotions"
import { formatCurrency } from "@/lib/utils/formatters"
import PromotionFormPage from "./PromotionFormPage"
import PromotionDetailPage from "./PromotionDetailPage"

const Div = (props: any) => React.createElement("div", props)
const H2 = (props: any) => React.createElement("h2", props)
const H3 = (props: any) => React.createElement("h3", props)
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
  const [activeTab, setActiveTab] = useState<"list" | "simulator">("list")
  const [campaigns, setCampaigns] = useState<any[]>(initialCampaigns)
  const [promotions, setPromotions] = useState<any[]>(initialPromotions)
  const [search, setSearch] = useState("")
  
  // UI views: "list", "create_campaign", "edit_campaign", "create_promotion", "edit_promotion", "view_promotion"
  const [viewMode, setViewMode] = useState<"list" | "create_campaign" | "edit_campaign" | "create_promotion" | "edit_promotion" | "view_promotion">("list")
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [selectedPromotionId, setSelectedPromotionId] = useState<string | null>(null)
  
  // Scope data for selector sheets
  const [scopeData, setScopeData] = useState<{ products: any[]; categories: any[]; customers: any[] }>({
    products: [],
    categories: [],
    customers: [],
  })
  const [isLoadingScope, setIsLoadingScope] = useState(false)

  // Simulator State
  const [simCart, setSimCart] = useState<Array<{ product: any; quantity: number }>>([])
  const [simCoupon, setSimCoupon] = useState("")
  const [simShipping, setSimShipping] = useState<number>(0)
  const [simResult, setSimResult] = useState<any>(null)
  const [isSimulating, setIsSimulating] = useState(false)

  useEffect(() => {
    async function loadScope() {
      setIsLoadingScope(true)
      try {
        const res = await getPromotionScopeDataAction(partnerId)
        if (res.success) {
          setScopeData({
            products: res.products || [],
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

  const refreshData = async () => {
    try {
      const campRes = await listCampaignsAction(partnerId, { page: 1, limit: 100 })
      if (campRes.success) {
        setCampaigns(campRes.data || [])
      }
      const pRes = await listPromotionsAction(partnerId)
      if (pRes.success) {
        setPromotions(pRes.data || [])
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta campanha? Todas as promoções vinculadas serão excluídas.")) return
    const res = await deleteCampaignAction(partnerId, id)
    if (res.success) {
      toast({ title: "Campanha excluída com sucesso." })
      refreshData()
    } else {
      toast({ title: "Erro ao excluir campanha.", description: res.error, variant: "destructive" })
    }
  }

  const handleDeletePromotion = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta regra de promoção?")) return
    const res = await deletePromotionAction(partnerId, id)
    if (res.success) {
      toast({ title: "Promoção excluída com sucesso." })
      refreshData()
    } else {
      toast({ title: "Erro ao excluir promoção.", description: res.error, variant: "destructive" })
    }
  }

  const handleTogglePromoStatus = async (id: string, currentStatus: boolean) => {
    const res = await togglePromotionStatusAction(partnerId, id, !currentStatus)
    if (res.success) {
      toast({ title: `Promoção ${!currentStatus ? "ativada" : "desativada"} com sucesso.` })
      refreshData()
    } else {
      toast({ title: "Erro ao atualizar status.", description: res.error, variant: "destructive" })
    }
  }

  const handleRunSimulation = async () => {
    if (simCart.length === 0) {
      toast({ title: "Adicione pelo menos um item ao carrinho da simulação." })
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

  const filteredCampaigns = useMemo(() => {
    const term = search.toLowerCase().trim()
    if (!term) return campaigns
    return campaigns.filter(c => c.name.toLowerCase().includes(term) || (c.description && c.description.toLowerCase().includes(term)))
  }, [campaigns, search])

  // Stats Card Calculations
  const stats = useMemo(() => {
    const activeCamp = campaigns.filter(c => c.is_active).length
    const activePromo = promotions.filter(p => p.is_active).length
    return {
      activeCamp,
      activePromo,
      totalCamp: campaigns.length,
      totalPromo: promotions.length,
    }
  }, [campaigns, promotions])

  if (viewMode === "create_campaign" || viewMode === "edit_campaign" || viewMode === "create_promotion" || viewMode === "edit_promotion") {
    return (
      <PromotionFormPage
        partnerId={partnerId}
        mode={viewMode}
        campaignId={selectedCampaignId}
        promotionId={selectedPromotionId}
        campaigns={campaigns}
        scopeData={scopeData}
        onClose={() => {
          setViewMode("list")
          refreshData()
        }}
      />
    )
  }

  if (viewMode === "view_promotion" && selectedPromotionId) {
    const promo = promotions.find(p => p.id === selectedPromotionId)
    const campaign = campaigns.find(c => c.id === promo?.campaign_id)
    return (
      <PromotionDetailPage
        partnerId={partnerId}
        promotion={promo}
        campaign={campaign}
        scopeData={scopeData}
        onClose={() => setViewMode("list")}
      />
    )
  }

  return (
    <Div className="space-y-6">
      {/* Plan limit barrier */}
      {planGate && (
        <Div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900/30 dark:bg-yellow-900/10 dark:text-yellow-200 flex items-start gap-3">
          <InfoIcon className="h-5 w-5 shrink-0 mt-0.5" />
          <Div>
            <P className="font-bold">Aviso de Limitação de Plano</P>
            <P>{planGate.message}</P>
          </Div>
        </Div>
      )}

      {/* Tabs Menu */}
      <Div className="flex border-b border-brand-border dark:border-dark-border">
        <button
          onClick={() => setActiveTab("list")}
          className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 -mb-[2px] ${activeTab === "list" ? "border-brand-primary text-brand-primary dark:text-brand-primary" : "border-transparent text-brand-inactive-text hover:text-brand-dark"}`}
        >
          Campanhas e Regras
        </button>
        <button
          onClick={() => setActiveTab("simulator")}
          className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 -mb-[2px] ${activeTab === "simulator" ? "border-brand-primary text-brand-primary dark:text-brand-primary" : "border-transparent text-brand-inactive-text hover:text-brand-dark"}`}
        >
          Simulador de Promoções
        </button>
      </Div>

      {activeTab === "list" ? (
        <Div className="space-y-6 animate-fadeIn">
          {/* Stats Bar */}
          <Div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Div className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface">
              <P className="text-xs font-semibold text-brand-inactive-text uppercase">Campanhas Ativas</P>
              <P className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-2">{stats.activeCamp} / {stats.totalCamp}</P>
            </Div>
            <Div className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface">
              <P className="text-xs font-semibold text-brand-inactive-text uppercase">Regras de Promoção Ativas</P>
              <P className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-2">{stats.activePromo} / {stats.totalPromo}</P>
            </Div>
            <Div className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface">
              <P className="text-xs font-semibold text-brand-inactive-text uppercase">Brindes Disponíveis</P>
              <P className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-2">
                {promotions.filter(p => p.promotion_type === "gift" && p.is_active).length}
              </P>
            </Div>
            <Div className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface">
              <P className="text-xs font-semibold text-brand-inactive-text uppercase">Combinação com Cupons</P>
              <P className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-2">
                {promotions.filter(p => p.allow_coupon_combination && p.is_active).length}
              </P>
            </Div>
          </Div>

          {/* Action Header */}
          <Div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <Div className="relative max-w-sm flex-1">
              <Input
                label=""
                name="campaignSearch"
                placeholder="Buscar campanhas..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                className="mb-0"
              />
            </Div>
            <Div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedCampaignId(null)
                  setViewMode("create_campaign")
                }}
                disabled={Boolean(planGate)}
              >
                Nova Campanha
              </Button>
              <Button
                variant="filled"
                onClick={() => {
                  setSelectedPromotionId(null)
                  setViewMode("create_promotion")
                }}
                disabled={Boolean(planGate) || campaigns.length === 0}
              >
                <PlusIcon className="mr-2 h-4 w-4" /> Nova Regra de Promoção
              </Button>
            </Div>
          </Div>

          {/* Campaign List */}
          <Div className="space-y-4">
            {filteredCampaigns.length > 0 ? (
              filteredCampaigns.map((camp) => {
                const campPromos = promotions.filter(p => p.campaign_id === camp.id)
                return (
                  <Div
                    key={camp.id}
                    className="rounded-2xl border border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface shadow-sm space-y-4 hover:shadow-md transition-shadow"
                  >
                    <Div className="flex items-start justify-between flex-wrap gap-2">
                      <Div>
                        <Div className="flex items-center gap-2">
                          <H3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{camp.name}</H3>
                          <Badge variant={camp.is_active ? "green" : "gray"}>
                            {camp.is_active ? "Ativa" : "Rascunho/Inativa"}
                          </Badge>
                          <Badge variant="blue" className="text-xs">
                            Público: {camp.customer_scope === "specific" ? "Segmentado" : "Geral"}
                          </Badge>
                        </Div>
                        {camp.description && (
                          <P className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">{camp.description}</P>
                        )}
                        <Div className="text-xs text-brand-inactive-text dark:text-dark-body mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          {camp.starts_at && <Span>Início: {new Date(camp.starts_at).toLocaleDateString()}</Span>}
                          {camp.ends_at && <Span>Fim: {new Date(camp.ends_at).toLocaleDateString()}</Span>}
                          {!camp.starts_at && !camp.ends_at && <Span>Sem período de vigência definido (Indeterminado)</Span>}
                        </Div>
                      </Div>
                      <Div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedCampaignId(camp.id)
                            setViewMode("edit_campaign")
                          }}
                        >
                          <EditIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-500 hover:bg-red-50"
                          onClick={() => handleDeleteCampaign(camp.id)}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </Div>
                    </Div>

                    {/* Promotions rules under this Campaign */}
                    <Div className="border-t border-brand-border dark:border-dark-border pt-4">
                      <H3 className="text-xs font-bold uppercase text-brand-inactive-text tracking-wider mb-3">Regras de Promoção da Campanha ({campPromos.length})</H3>
                      {campPromos.length > 0 ? (
                        <Div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="text-xs font-bold text-brand-inactive-text uppercase border-b border-brand-border dark:border-dark-border pb-2">
                                <th className="py-2">Regra</th>
                                <th className="py-2">Tipo</th>
                                <th className="py-2">Prioridade</th>
                                <th className="py-2">Escopo</th>
                                <th className="py-2">Status</th>
                                <th className="py-2 text-center">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {campPromos.map((promo) => (
                                <tr key={promo.id} className="border-b border-brand-border dark:border-dark-border last:border-0 hover:bg-brand-gray/30 dark:hover:bg-dark-border/20">
                                  <td className="py-3 font-semibold text-brand-dark dark:text-dark-heading">{promo.name}</td>
                                  <td className="py-3 capitalize">
                                    {promo.promotion_type === "gift" && "Brinde"}
                                    {promo.promotion_type === "buy_x_pay_y" && `Leve ${promo.buy_quantity} Pague ${promo.pay_quantity}`}
                                    {promo.promotion_type === "discount" && (
                                      promo.discount_type === "percentage" ? `${promo.discount_value}% Desconto` : `${formatCurrency(promo.discount_value)} Desconto`
                                    )}
                                    {promo.promotion_type === "free_shipping" && "Frete Grátis"}
                                  </td>
                                  <td className="py-3">
                                    <Badge variant="blue">{promo.priority || 0}</Badge>
                                  </td>
                                  <td className="py-3 capitalize text-xs">
                                    {promo.apply_scope === "entire_cart" && "Carrinho Inteiro"}
                                    {promo.apply_scope === "specific_products" && "Produtos Específicos"}
                                    {promo.apply_scope === "category" && "Categorias Específicas"}
                                  </td>
                                  <td className="py-3">
                                    <button
                                      onClick={() => handleTogglePromoStatus(promo.id, promo.is_active)}
                                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                                        promo.is_active
                                          ? "bg-green-100 text-green-800 hover:bg-green-200"
                                          : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                                      }`}
                                    >
                                      {promo.is_active ? "Ativo" : "Inativo"}
                                    </button>
                                  </td>
                                  <td className="py-3 text-center">
                                    <Div className="flex justify-center items-center gap-2">
                                      <button
                                        onClick={() => {
                                          setSelectedPromotionId(promo.id)
                                          setViewMode("view_promotion")
                                        }}
                                        className="p-1 hover:text-brand-primary"
                                        title="Ver Detalhes"
                                      >
                                        <EyeIcon className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setSelectedPromotionId(promo.id)
                                          setViewMode("edit_promotion")
                                        }}
                                        className="p-1 hover:text-brand-primary"
                                        title="Editar Regra"
                                      >
                                        <EditIcon className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeletePromotion(promo.id)}
                                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                                        title="Excluir Regra"
                                      >
                                        <TrashIcon className="h-4 w-4" />
                                      </button>
                                    </Div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </Div>
                      ) : (
                        <P className="text-sm text-brand-inactive-text py-2">Sem regras cadastradas para esta campanha.</P>
                      )}
                    </Div>
                  </Div>
                )
              })
            ) : (
              <IconPlaceholder
                icon={SparklesIcon}
                title="Nenhuma campanha encontrada"
                subtitle="Crie uma nova campanha e configure suas regras de promoção."
              />
            )}
          </Div>
        </Div>
      ) : (
        /* Simulator View */
        <Div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Simulator Controls */}
          <Div className="lg:col-span-2 space-y-6">
            <Div className="rounded-2xl border border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface shadow-sm space-y-4">
              <H3 className="text-md font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                <SparklesIcon className="text-brand-primary h-5 w-5" /> Montar Carrinho de Simulação
              </H3>

              {/* Product selector dropdown */}
              <Div className="space-y-2">
                <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Adicionar Produto ao Carrinho</label>
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

              {/* Cart List */}
              <Div className="space-y-3">
                <H3 className="text-xs font-bold uppercase text-brand-inactive-text">Itens no Carrinho ({simCart.length})</H3>
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
                  <P className="text-sm text-brand-inactive-text py-4">O carrinho de simulação está vazio.</P>
                )}
              </Div>

              {/* Additional Mock Fields */}
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
                  <label className="text-xs font-semibold text-brand-dark dark:text-dark-heading">Valor do Frete</label>
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

              {/* Simulation Button */}
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

          {/* Simulation Output */}
          <Div className="lg:col-span-1">
            <Div className="rounded-2xl border border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface shadow-sm space-y-6 h-full flex flex-col justify-between">
              <Div className="space-y-4">
                <H3 className="text-md font-bold text-brand-dark dark:text-dark-heading">Resultado da Simulação</H3>

                {simResult ? (
                  <Div className="space-y-4">
                    {/* Bill break-down */}
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
                        <Span className="text-brand-inactive-text">Frete</Span>
                        <Span className={simResult.freeShippingApplied ? "line-through text-brand-inactive-text" : "font-semibold"}>
                          {formatCurrency(simResult.shipping)}
                        </Span>
                      </Div>

                      {simResult.freeShippingApplied && (
                        <Div className="flex justify-between text-green-600 font-semibold text-xs">
                          <Span>Frete Grátis Aplicado</Span>
                          <Span>Grátis</Span>
                        </Div>
                      )}
                    </Div>

                    <Div className="flex justify-between text-lg font-bold text-brand-dark dark:text-dark-heading border-b border-brand-border dark:border-dark-border pb-4">
                      <Span>Total Final</Span>
                      <Span className="text-brand-primary">{formatCurrency(simResult.finalTotal)}</Span>
                    </Div>

                    {/* Applied Rules / Gifts */}
                    <Div className="space-y-3">
                      <H3 className="text-xs font-bold uppercase text-brand-inactive-text">Promoções Aplicadas ({simResult.appliedPromotionIds.length})</H3>
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
                      <H3 className="text-xs font-bold uppercase text-brand-inactive-text">Brindes Conquistados ({simResult.appliedGiftProductIds.length})</H3>
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
                    <P className="text-sm">Configure o carrinho de teste e clique em "Executar Simulação" para ver os resultados.</P>
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
      )}
    </Div>
  )
}
