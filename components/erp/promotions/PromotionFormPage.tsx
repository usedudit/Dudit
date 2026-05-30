"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { ArrowLeftIcon, SaveIcon, InfoIcon, EditIcon, PlusIcon, TrashIcon } from "@/lib/icons"
import { Button, Input, Checkbox, Badge, Tabs, TabsList, TabsTrigger, IconPlaceholder, ActionsDropdown } from "@/components/reusable"
import { useToast } from "@/hooks/use-toast"
import {
  createCampaignAction,
  updateCampaignAction,
  createPromotionAction,
  updatePromotionAction,
  deletePromotionAction,
} from "@/app/actions/shared/promotions"
import SelectPromotionProductsSheet from "./SelectPromotionProductsSheet"
import SelectPromotionCategoriesSheet from "./SelectPromotionCategoriesSheet"
import { ChevronLeftIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"

const Div = (props: any) => React.createElement("div", props)
const P = (props: any) => React.createElement("p", props)
const Span = (props: any) => React.createElement("span", props)

interface PromotionFormPageProps {
  partnerId: string
  mode: "add" | "edit" | "details" | "duplicate"
  campaign?: any
  scopeData: { products: any[]; categories: any[]; customers: any[] }
  promotions: any[]
  onClose: () => void
}

export default function PromotionFormPage({
  partnerId,
  mode: initialMode,
  campaign,
  scopeData,
  promotions,
  onClose,
}: PromotionFormPageProps) {
  const { toast } = useToast()
  const [currentMode, setCurrentMode] = useState(initialMode)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("general")

  const isReadOnly = currentMode === "details"

  // Campaign Form State
  const [campName, setCampName] = useState("")
  const [campDesc, setCampDesc] = useState("")
  const [campScope, setCampScope] = useState<"all" | "specific">("all")
  const [campStarts, setCampStarts] = useState("")
  const [campEnds, setCampEnds] = useState("")
  const [campActive, setCampActive] = useState(true)
  const [campCustIds, setCampCustIds] = useState<string[]>([])
  const [custSearch, setCustSearch] = useState("")

  // Promotions for this campaign (either in DB or temporary in memory)
  const [localPromotions, setLocalPromotions] = useState<any[]>([])

  // Subform Rule State (for adding/editing a promotion inside the tab)
  const [editingRule, setEditingRule] = useState<any | null>(null)
  
  // Sheet states for selected products/categories in the rule subform
  const [editingRuleProductIds, setEditingRuleProductIds] = useState<string[]>([])
  const [editingRuleCategoryIds, setEditingRuleCategoryIds] = useState<string[]>([])
  const [isProductsSheetOpen, setIsProductsSheetOpen] = useState(false)
  const [isCategoriesSheetOpen, setIsCategoriesSheetOpen] = useState(false)

  // Sync initial mode
  useEffect(() => {
    setCurrentMode(initialMode)
  }, [initialMode])

  // Load data based on mode and campaign
  useEffect(() => {
    if ((currentMode === "edit" || currentMode === "details" || currentMode === "duplicate") && campaign) {
      setCampName(currentMode === "duplicate" ? `${campaign.name} (Cópia)` : campaign.name || "")
      setCampDesc(campaign.description || "")
      setCampScope(campaign.customer_scope || "all")
      setCampStarts(campaign.starts_at ? new Date(campaign.starts_at).toISOString().slice(0, 16) : "")
      setCampEnds(campaign.ends_at ? new Date(campaign.ends_at).toISOString().slice(0, 16) : "")
      setCampActive(campaign.is_active ?? true)
      setCampCustIds((campaign.campaign_customers || []).map((cc: any) => cc.customer_id))
      
      const campPromos = promotions.filter(p => p.campaign_id === campaign.id)
      if (currentMode === "duplicate") {
        setLocalPromotions(campPromos.map(p => ({
          ...p,
          id: `temp_${Math.random()}`,
          campaign_id: undefined,
          promotion_products: (p.promotion_products || []).map((prod: any) => prod.product_id || prod),
          promotion_categories: (p.promotion_categories || []).map((cat: any) => cat.category_id || cat),
        })))
      } else {
        setLocalPromotions(campPromos)
      }
    } else {
      setCampName("")
      setCampDesc("")
      setCampScope("all")
      setCampStarts("")
      setCampEnds("")
      setCampActive(true)
      setCampCustIds([])
      setLocalPromotions([])
    }
  }, [currentMode, campaign, promotions])

  // Update product/category selection sheets state when subform opens
  useEffect(() => {
    if (editingRule) {
      setEditingRuleProductIds(
        (editingRule.promotion_products || []).map((p: any) => p.product_id || p)
      )
      setEditingRuleCategoryIds(
        (editingRule.promotion_categories || []).map((c: any) => c.category_id || c)
      )
    } else {
      setEditingRuleProductIds([])
      setEditingRuleCategoryIds([])
    }
  }, [editingRule])

  // Filtered customer listing
  const filteredCustomers = useMemo(() => {
    const term = custSearch.toLowerCase().trim()
    if (!term) return scopeData.customers
    return scopeData.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.email && c.email.toLowerCase().includes(term))
    )
  }, [scopeData.customers, custSearch])

  // Save the overall Campaign + memory rules
  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!campName.trim()) {
      toast({ title: "Nome da campanha é obrigatório.", variant: "destructive" })
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        partnerId,
        name: campName,
        description: campDesc || null,
        customerScope: campScope,
        startsAt: campStarts ? new Date(campStarts).toISOString() : null,
        endsAt: campEnds ? new Date(campEnds).toISOString() : null,
        isActive: campActive,
        customerIds: campScope === "specific" ? campCustIds : [],
      }

      if (currentMode === "edit") {
        const res = await updateCampaignAction(campaign.id, payload)
        if (res.success) {
          toast({ title: "Campanha atualizada com sucesso." })
          onClose()
        } else {
          toast({ title: "Erro ao salvar campanha.", description: res.error, variant: "destructive" })
        }
      } else {
        // Mode is "add" or "duplicate"
        const res = await createCampaignAction(payload)
        if (res.success) {
          const newCampaignId = res.id

          // Save pending promotions (rules) in memory
          if (localPromotions.length > 0) {
            await Promise.all(localPromotions.map(promo => {
              const promoPayload = {
                partnerId,
                campaignId: newCampaignId,
                name: promo.name,
                description: promo.description || null,
                promotionType: promo.promotion_type,
                discountType: promo.promotion_type === "discount" ? promo.discount_type : null,
                discountValue: promo.promotion_type === "discount" ? Number(promo.discount_value) : null,
                maxDiscountAmount: promo.max_discount_amount !== "" && promo.max_discount_amount !== null ? Number(promo.max_discount_amount) : null,
                minSpendAmount: promo.min_spend_amount !== "" && promo.min_spend_amount !== null ? Number(promo.min_spend_amount) : null,
                giftProductId: promo.promotion_type === "gift" ? promo.gift_product_id : null,
                buyQuantity: promo.promotion_type === "buy_x_pay_y" ? Number(promo.buy_quantity) : null,
                payQuantity: promo.promotion_type === "buy_x_pay_y" ? Number(promo.pay_quantity) : null,
                priority: Number(promo.priority || 0),
                applyScope: promo.apply_scope,
                allowCouponCombination: promo.allow_coupon_combination,
                usageLimit: promo.usage_limit !== "" && promo.usage_limit !== null ? Number(promo.usage_limit) : null,
                usageLimitPerCustomer: promo.usage_limit_per_customer !== "" && promo.usage_limit_per_customer !== null ? Number(promo.usage_limit_per_customer) : null,
                isActive: promo.is_active,
                productIds: promo.apply_scope === "specific_products" ? (promo.promotion_products || []) : [],
                categoryIds: promo.apply_scope === "category" ? (promo.promotion_categories || []) : [],
              }
              return createPromotionAction(promoPayload)
            }))
          }

          toast({ title: "Campanha e regras salvas com sucesso." })
          onClose()
        } else {
          toast({ title: "Erro ao salvar campanha.", description: res.error, variant: "destructive" })
        }
      }
    } catch (err: any) {
      console.error(err)
      toast({ title: "Erro inesperado.", description: err.message, variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  // Handle saving a single rule in the subform
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingRule.name?.trim()) {
      toast({ title: "Nome da regra é obrigatório.", variant: "destructive" })
      return
    }

    // Logic constraints
    if (editingRule.promotion_type === "buy_x_pay_y") {
      if (!editingRule.buy_quantity || !editingRule.pay_quantity || Number(editingRule.buy_quantity) <= Number(editingRule.pay_quantity)) {
        toast({ title: "Erro", description: "Para Leve X Pague Y, a quantidade de compra deve ser maior que a quantidade paga.", variant: "destructive" })
        return
      }
    } else if (editingRule.promotion_type === "gift") {
      if (!editingRule.gift_product_id) {
        toast({ title: "Erro", description: "Selecione o produto de brinde.", variant: "destructive" })
        return
      }
    } else if (editingRule.promotion_type === "discount") {
      if (!editingRule.discount_type || !editingRule.discount_value) {
        toast({ title: "Erro", description: "Informe o tipo e valor de desconto.", variant: "destructive" })
        return
      }
    }

    const ruleData = {
      ...editingRule,
      promotion_products: editingRuleProductIds,
      promotion_categories: editingRuleCategoryIds,
    }

    if (currentMode === "edit") {
      // Direct Save to DB
      setIsSaving(true)
      const payload = {
        partnerId,
        campaignId: campaign.id,
        name: ruleData.name,
        description: ruleData.description || null,
        promotionType: ruleData.promotion_type,
        discountType: ruleData.promotion_type === "discount" ? ruleData.discount_type : null,
        discountValue: ruleData.promotion_type === "discount" ? Number(ruleData.discount_value) : null,
        maxDiscountAmount: ruleData.max_discount_amount !== "" && ruleData.max_discount_amount !== null ? Number(ruleData.max_discount_amount) : null,
        minSpendAmount: ruleData.min_spend_amount !== "" && ruleData.min_spend_amount !== null ? Number(ruleData.min_spend_amount) : null,
        giftProductId: ruleData.promotion_type === "gift" ? ruleData.gift_product_id : null,
        buyQuantity: ruleData.promotion_type === "buy_x_pay_y" ? Number(ruleData.buy_quantity) : null,
        payQuantity: ruleData.promotion_type === "buy_x_pay_y" ? Number(ruleData.pay_quantity) : null,
        priority: Number(ruleData.priority || 0),
        applyScope: ruleData.apply_scope,
        allowCouponCombination: ruleData.allow_coupon_combination,
        usageLimit: ruleData.usage_limit !== "" && ruleData.usage_limit !== null ? Number(ruleData.usage_limit) : null,
        usageLimitPerCustomer: ruleData.usage_limit_per_customer !== "" && ruleData.usage_limit_per_customer !== null ? Number(ruleData.usage_limit_per_customer) : null,
        isActive: ruleData.is_active,
        productIds: editingRuleProductIds,
        categoryIds: editingRuleCategoryIds,
      }

      let res
      if (ruleData.id && !ruleData.id.startsWith?.("temp_")) {
        res = await updatePromotionAction(ruleData.id, payload)
      } else {
        res = await createPromotionAction(payload)
      }

      setIsSaving(false)
      if (res.success) {
        toast({ title: "Regra salva com sucesso no banco." })
        // Reload promotions
        const { listPromotionsAction } = await import("@/app/actions/shared/promotions")
        const listRes = await listPromotionsAction(partnerId, campaign.id)
        if (listRes.success) {
          setLocalPromotions(listRes.data || [])
        }
        setEditingRule(null)
      } else {
        toast({ title: "Erro ao salvar regra.", description: res.error, variant: "destructive" })
      }
    } else {
      // Save locally in memory (creation or duplicate mode)
      const ruleToSave = {
        ...ruleData,
        id: ruleData.id || `temp_${Math.random()}`,
      }

      if (localPromotions.some(p => p.id === ruleToSave.id)) {
        setLocalPromotions(localPromotions.map(p => p.id === ruleToSave.id ? ruleToSave : p))
      } else {
        setLocalPromotions([...localPromotions, ruleToSave])
      }
      setEditingRule(null)
    }
  }

  const handleDeleteRule = async (rule: any) => {
    if (!confirm("Tem certeza que deseja excluir esta regra de promoção?")) return

    if (currentMode === "edit" && rule.id && !rule.id.startsWith?.("temp_")) {
      setIsSaving(true)
      const res = await deletePromotionAction(partnerId, rule.id)
      setIsSaving(false)
      if (res.success) {
        toast({ title: "Regra excluída com sucesso." })
        setLocalPromotions(localPromotions.filter((p) => p.id !== rule.id))
      } else {
        toast({ title: "Erro ao excluir regra.", description: res.error, variant: "destructive" })
      }
    } else {
      setLocalPromotions(localPromotions.filter((p) => p.id !== rule.id))
    }
  }

  const pageTitle = currentMode === "add" ? "Nova Campanha de Marketing"
    : currentMode === "duplicate" ? "Duplicar Campanha"
      : campName || "Campanha"

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden animate-fadeIn">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
        <div className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">
          
          {/* Sticky Header */}
          <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
            <div className="max-w-[1000px] mx-auto relative px-4 md:px-6 md:pt-4">
              
              {/* Back button */}
              <div className="absolute -left-12 top-7 h-full hidden xl:flex justify-center">
                <Button variant="filled" onClick={onClose} className="w-10 h-10 p-0 flex items-center justify-center">
                  <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                </Button>
              </div>

              {/* Title row */}
              <div className="flex items-start justify-between py-2 md:py-0">
                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                  <h1 className="font-bold text-xl md:text-3xl flex items-center gap-3">
                    <span className="truncate">{pageTitle}</span>
                    {currentMode === "edit" && (
                      <Badge variant="orange" icon={<EditIcon />} className="text-sm font-normal h-fit whitespace-nowrap px-2 py-0.5">
                        Editando
                      </Badge>
                    )}
                  </h1>
                  <div className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                    {currentMode === "add" && "Configure os critérios e datas de vigência da campanha."}
                    {currentMode === "duplicate" && "Configurações clonadas. Modifique o necessário antes de salvar."}
                    {currentMode === "details" && "Visualização dos detalhes e regras da campanha."}
                  </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  {isReadOnly ? (
                    <Button onClick={() => setCurrentMode("edit")} leftIcon={<EditIcon size={18} />}>
                      Editar
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSaveCampaign} disabled={isSaving} leftIcon={<SaveIcon size={18} />}>
                        {isSaving ? "Salvando..." : "Salvar"}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Tabs list */}
              <div className="w-full mt-4">
                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                  <TabsTrigger value="general">Dados gerais</TabsTrigger>
                  <TabsTrigger value="rules">Regras de promoção ({localPromotions.length})</TabsTrigger>
                </TabsList>
              </div>

            </div>
          </div>

          {/* Form Content */}
          <div className="px-4 py-6 max-w-[1000px] mx-auto min-h-[400px]">
            
            {/* General Settings Tab */}
            {activeTab === "general" && (
              <form onSubmit={handleSaveCampaign} className="space-y-6">
                <Input
                  label="Nome da Campanha"
                  name="campName"
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  required
                  disabled={isReadOnly}
                  placeholder="Ex: Dia dos Namorados"
                />

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Descrição</label>
                  <textarea
                    value={campDesc}
                    onChange={(e) => setCampDesc(e.target.value)}
                    disabled={isReadOnly}
                    placeholder="Descrição para controle interno ou exibição pública"
                    className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface min-h-[100px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Início da Vigência</label>
                    <input
                      type="datetime-local"
                      value={campStarts}
                      onChange={(e) => setCampStarts(e.target.value)}
                      disabled={isReadOnly}
                      className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Fim da Vigência</label>
                    <input
                      type="datetime-local"
                      value={campEnds}
                      onChange={(e) => setCampEnds(e.target.value)}
                      disabled={isReadOnly}
                      className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Público da Campanha</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="custScope"
                        checked={campScope === "all"}
                        onChange={() => setCampScope("all")}
                        disabled={isReadOnly}
                      />
                      Todos os Clientes
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="custScope"
                        checked={campScope === "specific"}
                        onChange={() => setCampScope("specific")}
                        disabled={isReadOnly}
                      />
                      Clientes Específicos
                    </label>
                  </div>
                </div>

                {campScope === "specific" && (
                  <div className="border border-brand-border dark:border-dark-border p-4 rounded-xl space-y-3">
                    <label className="text-xs font-bold uppercase text-brand-inactive-text">Selecionar Clientes elegíveis</label>
                    <input
                      type="text"
                      placeholder="Filtrar clientes por nome ou email..."
                      value={custSearch}
                      onChange={(e) => setCustSearch(e.target.value)}
                      disabled={isReadOnly}
                      className="w-full p-2.5 rounded-lg border border-brand-border dark:border-dark-border dark:bg-dark-surface text-sm"
                    />
                    <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                      {filteredCustomers.map((cust) => {
                        const isChecked = campCustIds.includes(cust.id)
                        return (
                          <label key={cust.id} className="flex items-center gap-3 text-sm p-1 hover:bg-brand-gray/30 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isReadOnly}
                              onChange={() => {
                                if (isChecked) {
                                  setCampCustIds(campCustIds.filter((id) => id !== cust.id))
                                } else {
                                  setCampCustIds([...campCustIds, cust.id])
                                }
                              }}
                            />
                            <div>
                              <p className="font-semibold text-brand-dark dark:text-dark-heading">{cust.name}</p>
                              {cust.email && <p className="text-xs text-brand-inactive-text">{cust.email}</p>}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    checked={campActive}
                    onChange={() => setCampActive(!campActive)}
                    disabled={isReadOnly}
                    label="Esta campanha está ativa e válida"
                  />
                </div>
              </form>
            )}

            {/* Rules Tab */}
            {activeTab === "rules" && (
              <div className="space-y-6">
                {editingRule ? (
                  /* Rule Sub-Form */
                  <form onSubmit={handleSaveRule} className="space-y-6 border border-brand-border dark:border-dark-border p-6 rounded-2xl bg-gray-50 dark:bg-dark-surface">
                    <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading border-b border-brand-border dark:border-dark-border pb-3">
                      {editingRule.id ? "Editar Regra de Promoção" : "Nova Regra de Promoção"}
                    </h3>

                    <Input
                      label="Nome da Regra de Promoção"
                      name="promName"
                      value={editingRule.name || ""}
                      onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                      required
                      placeholder="Ex: Desconto de 15% em Calçados"
                    />

                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading font-medium">Descrição (Opcional)</label>
                      <textarea
                        value={editingRule.description || ""}
                        onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                        placeholder="Ex: Válido para qualquer calçado da loja"
                        className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-white min-h-[80px]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Tipo de Promoção</label>
                        <select
                          value={editingRule.promotion_type || "discount"}
                          onChange={(e: any) => setEditingRule({ ...editingRule, promotion_type: e.target.value })}
                          className="w-full p-3 rounded-xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface dark:text-white"
                        >
                          <option value="discount">Desconto Direto (Fixo ou %)</option>
                          <option value="buy_x_pay_y">Leve X Pague Y (Ex: Leve 3 Pague 2)</option>
                          <option value="gift">Ganhar Brinde (Freebie)</option>
                          <option value="free_shipping">Frete Grátis</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Prioridade de Execução</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={editingRule.priority ?? 0}
                          onChange={(e) => setEditingRule({ ...editingRule, priority: parseInt(e.target.value) || 0 })}
                          className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-white"
                        />
                      </div>
                    </div>

                    {editingRule.promotion_type === "discount" && (
                      <div className="border border-brand-border dark:border-dark-border p-4 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white dark:bg-dark-border/20">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-brand-dark">Tipo de Desconto</label>
                          <select
                            value={editingRule.discount_type || "percentage"}
                            onChange={(e: any) => setEditingRule({ ...editingRule, discount_type: e.target.value })}
                            className="w-full p-2.5 rounded-lg border border-brand-border bg-white dark:border-dark-border text-sm"
                          >
                            <option value="percentage">Porcentagem (%)</option>
                            <option value="fixed">Valor Fixo (R$)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-brand-dark">Valor do Desconto</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            placeholder="10"
                            value={editingRule.discount_value ?? ""}
                            onChange={(e) => setEditingRule({ ...editingRule, discount_value: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                            className="w-full p-2.5 rounded-lg border border-brand-border dark:border-dark-border text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-brand-dark">Teto de Desconto (Opcional)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Ex: 50.00"
                            value={editingRule.max_discount_amount ?? ""}
                            onChange={(e) => setEditingRule({ ...editingRule, max_discount_amount: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                            className="w-full p-2.5 rounded-lg border border-brand-border dark:border-dark-border text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {editingRule.promotion_type === "buy_x_pay_y" && (
                      <div className="border border-brand-border dark:border-dark-border p-4 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white dark:bg-dark-border/20">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-brand-dark">Leve (Qtd a Comprar)</label>
                          <input
                            type="number"
                            min="2"
                            required
                            placeholder="3"
                            value={editingRule.buy_quantity ?? ""}
                            onChange={(e) => setEditingRule({ ...editingRule, buy_quantity: e.target.value === "" ? "" : parseInt(e.target.value) })}
                            className="w-full p-2.5 rounded-lg border border-brand-border dark:border-dark-border text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-brand-dark">Pague (Qtd a Pagar)</label>
                          <input
                            type="number"
                            min="1"
                            required
                            placeholder="2"
                            value={editingRule.pay_quantity ?? ""}
                            onChange={(e) => setEditingRule({ ...editingRule, pay_quantity: e.target.value === "" ? "" : parseInt(e.target.value) })}
                            className="w-full p-2.5 rounded-lg border border-brand-border dark:border-dark-border text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {editingRule.promotion_type === "gift" && (
                      <div className="border border-brand-border dark:border-dark-border p-4 rounded-xl space-y-1 bg-white dark:bg-dark-border/20">
                        <label className="text-xs font-bold text-brand-dark">Selecione o Brinde</label>
                        <select
                          value={editingRule.gift_product_id || ""}
                          onChange={(e) => setEditingRule({ ...editingRule, gift_product_id: e.target.value })}
                          required
                          className="w-full p-2.5 rounded-lg border border-brand-border bg-white dark:border-dark-border text-sm"
                        >
                          <option value="">Escolha o produto que será entregue de brinde...</option>
                          {scopeData.products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Mínimo de Compra (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={editingRule.min_spend_amount ?? ""}
                          onChange={(e) => setEditingRule({ ...editingRule, min_spend_amount: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                          className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Limite Global de Usos</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="Sem limite"
                          value={editingRule.usage_limit ?? ""}
                          onChange={(e) => setEditingRule({ ...editingRule, usage_limit: e.target.value === "" ? "" : parseInt(e.target.value) })}
                          className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Limite por Cliente</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="Sem limite"
                          value={editingRule.usage_limit_per_customer ?? ""}
                          onChange={(e) => setEditingRule({ ...editingRule, usage_limit_per_customer: e.target.value === "" ? "" : parseInt(e.target.value) })}
                          className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Escopo de Aplicação</label>
                      <select
                        value={editingRule.apply_scope || "entire_cart"}
                        onChange={(e: any) => setEditingRule({ ...editingRule, apply_scope: e.target.value })}
                        className="w-full p-3 rounded-xl border border-brand-border bg-white dark:border-dark-border"
                      >
                        <option value="entire_cart">Todo o Carrinho</option>
                        <option value="specific_products">Produtos Específicos</option>
                        <option value="category">Categorias Específicas</option>
                      </select>
                    </div>

                    {editingRule.apply_scope === "specific_products" && (
                      <div className="flex items-center gap-4 border border-brand-border dark:border-dark-border p-4 rounded-xl bg-white dark:bg-dark-border/20 justify-between">
                        <div>
                          <p className="text-sm font-semibold text-brand-dark">Produtos Selecionados</p>
                          <p className="text-xs text-brand-inactive-text">{editingRuleProductIds.length} produtos elegíveis vinculados.</p>
                        </div>
                        <Button variant="outline" type="button" onClick={() => setIsProductsSheetOpen(true)}>
                          Selecionar Produtos
                        </Button>
                      </div>
                    )}

                    {editingRule.apply_scope === "category" && (
                      <div className="flex items-center gap-4 border border-brand-border dark:border-dark-border p-4 rounded-xl bg-white dark:bg-dark-border/20 justify-between">
                        <div>
                          <p className="text-sm font-semibold text-brand-dark">Categorias Selecionadas</p>
                          <p className="text-xs text-brand-inactive-text">{editingRuleCategoryIds.length} categorias elegíveis vinculadas.</p>
                        </div>
                        <Button variant="outline" type="button" onClick={() => setIsCategoriesSheetOpen(true)}>
                          Selecionar Categorias
                        </Button>
                      </div>
                    )}

                    <div className="space-y-4 pt-2">
                      <Checkbox
                        checked={editingRule.allow_coupon_combination || false}
                        onChange={() => setEditingRule({ ...editingRule, allow_coupon_combination: !editingRule.allow_coupon_combination })}
                        label="Permitir uso combinado com cupons de desconto"
                      />
                      <Checkbox
                        checked={editingRule.is_active ?? true}
                        onChange={() => setEditingRule({ ...editingRule, is_active: !editingRule.is_active })}
                        label="Esta regra de promoção está ativa e disponível"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 border-t border-brand-border dark:border-dark-border pt-4">
                      <Button variant="outline" type="button" onClick={() => setEditingRule(null)}>
                        Voltar para lista
                      </Button>
                      <Button variant="filled" type="submit" disabled={isSaving}>
                        Salvar Regra
                      </Button>
                    </div>
                  </form>
                ) : (
                  /* Rules List View */
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading uppercase">Regras de Promoção vinculadas</h3>
                      {!isReadOnly && (
                        <Button onClick={() => setEditingRule({ is_active: true, priority: 0, promotion_type: 'discount', discount_type: 'percentage', apply_scope: 'entire_cart' })} leftIcon={<PlusIcon size={16} />}>
                          Nova Regra
                        </Button>
                      )}
                    </div>

                    {localPromotions.length > 0 ? (
                      <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="text-xs font-bold text-brand-inactive-text uppercase border-b border-brand-border dark:border-dark-border bg-gray-50 dark:bg-dark-border/20">
                              <th className="p-3 pl-6">Regra</th>
                              <th className="p-3">Tipo</th>
                              <th className="p-3 text-center">Prioridade</th>
                              <th className="p-3 text-center">Status</th>
                              {!isReadOnly && <th className="p-3 text-center pr-6">Ações</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {localPromotions.map((promo) => (
                              <tr key={promo.id} className="border-b border-brand-border dark:border-dark-border last:border-0 hover:bg-brand-gray/30 dark:hover:bg-dark-border/20">
                                <td className="p-3 pl-6 font-semibold text-brand-dark dark:text-dark-heading">
                                  {promo.name}
                                </td>
                                <td className="p-3 capitalize text-brand-inactive-text dark:text-dark-body">
                                  {promo.promotion_type === "gift" && "Brinde"}
                                  {promo.promotion_type === "buy_x_pay_y" && `Leve ${promo.buy_quantity} Pague ${promo.pay_quantity}`}
                                  {promo.promotion_type === "discount" && (
                                    promo.discount_type === "percentage" ? `${promo.discount_value}% Desconto` : `${formatCurrency(promo.discount_value)} Desconto`
                                  )}
                                  {promo.promotion_type === "free_shipping" && "Frete Grátis"}
                                </td>
                                <td className="p-3 text-center">
                                  <Badge variant="blue">{promo.priority || 0}</Badge>
                                </td>
                                <td className="p-3 text-center">
                                  <Badge variant={promo.is_active ? "green" : "gray"}>
                                    {promo.is_active ? "Ativo" : "Inativo"}
                                  </Badge>
                                </td>
                                {!isReadOnly && (
                                  <td className="p-3 text-center pr-6" onClick={(e) => e.stopPropagation()}>
                                    <ActionsDropdown
                                      onEdit={() => setEditingRule(promo)}
                                      onDelete={() => handleDeleteRule(promo)}
                                    />
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                        imageAlt="Sem regras"
                        title="Nenhuma regra cadastrada"
                        subtitle="Adicione regras para configurar os descontos oferecidos por esta campanha."
                        itemButton={!isReadOnly ? {
                          text: "Cadastrar Primeira Regra",
                          action: () => setEditingRule({ is_active: true, priority: 0, promotion_type: 'discount', discount_type: 'percentage', apply_scope: 'entire_cart' })
                        } : undefined}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </Tabs>

      {/* Conditional selector sheets */}
      <SelectPromotionProductsSheet
        isOpen={isProductsSheetOpen}
        onClose={() => setIsProductsSheetOpen(false)}
        products={scopeData.products}
        selectedIds={editingRuleProductIds}
        onToggle={(id) => {
          if (editingRuleProductIds.includes(id)) {
            setEditingRuleProductIds(editingRuleProductIds.filter((pId) => pId !== id))
          } else {
            setEditingRuleProductIds([...editingRuleProductIds, id])
          }
        }}
      />

      <SelectPromotionCategoriesSheet
        isOpen={isCategoriesSheetOpen}
        onClose={() => setIsCategoriesSheetOpen(false)}
        categories={scopeData.categories}
        selectedIds={editingRuleCategoryIds}
        onToggle={(id) => {
          if (editingRuleCategoryIds.includes(id)) {
            setEditingRuleCategoryIds(editingRuleCategoryIds.filter((cId) => cId !== id))
          } else {
            setEditingRuleCategoryIds([...editingRuleCategoryIds, id])
          }
        }}
      />
    </div>
  )
}
