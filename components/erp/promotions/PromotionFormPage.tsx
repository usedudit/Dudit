"use client"

import React, { useState, useEffect } from "react"
import { ArrowLeftIcon, SaveIcon, InfoIcon } from "@/lib/icons"
import { Button, Input, Checkbox } from "@/components/reusable"
import { useToast } from "@/hooks/use-toast"
import {
  createCampaignAction,
  updateCampaignAction,
  createPromotionAction,
  updatePromotionAction,
} from "@/app/actions/shared/promotions"
import SelectPromotionProductsSheet from "./SelectPromotionProductsSheet"
import SelectPromotionCategoriesSheet from "./SelectPromotionCategoriesSheet"

const Div = (props: any) => React.createElement("div", props)
const H2 = (props: any) => React.createElement("h2", props)
const P = (props: any) => React.createElement("p", props)

export default function PromotionFormPage({
  partnerId,
  mode,
  campaignId,
  promotionId,
  campaigns = [],
  scopeData,
  onClose,
}: {
  partnerId: string
  mode: "create_campaign" | "edit_campaign" | "create_promotion" | "edit_promotion"
  campaignId?: string | null
  promotionId?: string | null
  campaigns: any[]
  scopeData: { products: any[]; categories: any[]; customers: any[] }
  onClose: () => void
}) {
  const { toast } = useToast()
  const isCampaignMode = mode.includes("campaign")
  const [isSaving, setIsSaving] = useState(false)

  // Campaign Form State
  const [campName, setCampName] = useState("")
  const [campDesc, setCampDesc] = useState("")
  const [campScope, setCampScope] = useState<"all" | "specific">("all")
  const [campStarts, setCampStarts] = useState("")
  const [campEnds, setCampEnds] = useState("")
  const [campActive, setCampActive] = useState(true)
  const [campCustIds, setCampCustIds] = useState<string[]>([])
  const [custSearch, setCustSearch] = useState("")

  // Promotion Form State
  const [promCampaignId, setPromCampaignId] = useState("")
  const [promName, setPromName] = useState("")
  const [promDesc, setPromDesc] = useState("")
  const [promType, setPromType] = useState<"gift" | "buy_x_pay_y" | "discount" | "free_shipping">("discount")
  const [promDiscountType, setPromDiscountType] = useState<"percentage" | "fixed">("percentage")
  const [promDiscountValue, setPromDiscountValue] = useState<number | "">("")
  const [promMaxDiscount, setPromMaxDiscount] = useState<number | "">("")
  const [promMinSpend, setPromMinSpend] = useState<number | "">("")
  const [promGiftProductId, setPromGiftProductId] = useState("")
  const [promBuyQty, setPromBuyQty] = useState<number | "">("")
  const [promPayQty, setPromPayQty] = useState<number | "">("")
  const [promPriority, setPromPriority] = useState<number>(0)
  const [promApplyScope, setPromApplyScope] = useState<"specific_products" | "category" | "entire_cart">("entire_cart")
  const [promAllowCoupon, setPromAllowCoupon] = useState(false)
  const [promUsageLimit, setPromUsageLimit] = useState<number | "">("")
  const [promUsageLimitPerCust, setPromUsageLimitPerCust] = useState<number | "">("")
  const [promActive, setPromActive] = useState(true)
  const [promProductIds, setPromProductIds] = useState<string[]>([])
  const [promCategoryIds, setPromCategoryIds] = useState<string[]>([])

  // Modal selector triggers
  const [isProductsSheetOpen, setIsProductsSheetOpen] = useState(false)
  const [isCategoriesSheetOpen, setIsCategoriesSheetOpen] = useState(false)

  // Populate data if Editing
  useEffect(() => {
    if (isCampaignMode && campaignId) {
      const camp = campaigns.find((c) => c.id === campaignId)
      if (camp) {
        setCampName(camp.name || "")
        setCampDesc(camp.description || "")
        setCampScope(camp.customer_scope || "all")
        setCampStarts(camp.starts_at ? new Date(camp.starts_at).toISOString().slice(0, 16) : "")
        setCampEnds(camp.ends_at ? new Date(camp.ends_at).toISOString().slice(0, 16) : "")
        setCampActive(camp.is_active ?? true)
        setCampCustIds((camp.campaign_customers || []).map((cc: any) => cc.customer_id))
      }
    } else if (!isCampaignMode && promotionId) {
      async function loadPromoDetails() {
        const { listPromotionsAction } = await import("@/app/actions/shared/promotions")
        const res = await listPromotionsAction(partnerId)
        if (res.success) {
          const promo = res.data.find((p: any) => p.id === promotionId)
          if (promo) {
            setPromCampaignId(promo.campaign_id || "")
            setPromName(promo.name || "")
            setPromDesc(promo.description || "")
            setPromType(promo.promotion_type)
            setPromDiscountType(promo.discount_type || "percentage")
            setPromDiscountValue(promo.discount_value ?? "")
            setPromMaxDiscount(promo.max_discount_amount ?? "")
            setPromMinSpend(promo.min_spend_amount ?? "")
            setPromGiftProductId(promo.gift_product_id || "")
            setPromBuyQty(promo.buy_quantity ?? "")
            setPromPayQty(promo.pay_quantity ?? "")
            setPromPriority(promo.priority ?? 0)
            setPromApplyScope(promo.apply_scope)
            setPromAllowCoupon(promo.allow_coupon_combination ?? false)
            setPromUsageLimit(promo.usage_limit ?? "")
            setPromUsageLimitPerCust(promo.usage_limit_per_customer ?? "")
            setPromActive(promo.is_active ?? true)
            setPromProductIds((promo.promotion_products || []).map((p: any) => p.product_id))
            setPromCategoryIds((promo.promotion_categories || []).map((c: any) => c.category_id))
          }
        }
      }
      loadPromoDetails()
    }
  }, [mode, campaignId, promotionId, campaigns, isCampaignMode, partnerId])

  // Filtered customer listing for specific campaign selection
  const filteredCustomers = scopeData.customers.filter(
    (c) =>
      c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(custSearch.toLowerCase()))
  )

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      if (isCampaignMode) {
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

        const res =
          mode === "create_campaign"
            ? await createCampaignAction(payload)
            : await updateCampaignAction(campaignId!, payload)

        if (res.success) {
          toast({ title: mode === "create_campaign" ? "Campanha criada com sucesso." : "Campanha atualizada com sucesso." })
          onClose()
        } else {
          toast({ title: "Erro ao salvar campanha.", description: res.error, variant: "destructive" })
        }
      } else {
        const payload = {
          partnerId,
          campaignId: promCampaignId,
          name: promName,
          description: promDesc || null,
          promotionType: promType,
          discountType: promType === "discount" ? promDiscountType : null,
          discountValue: promType === "discount" ? Number(promDiscountValue) : null,
          maxDiscountAmount: promMaxDiscount !== "" ? Number(promMaxDiscount) : null,
          minSpendAmount: promMinSpend !== "" ? Number(promMinSpend) : null,
          giftProductId: promType === "gift" ? promGiftProductId : null,
          buyQuantity: promType === "buy_x_pay_y" ? Number(promBuyQty) : null,
          payQuantity: promType === "buy_x_pay_y" ? Number(promPayQty) : null,
          priority: Number(promPriority),
          applyScope: promApplyScope,
          allowCouponCombination: promAllowCoupon,
          usageLimit: promUsageLimit !== "" ? Number(promUsageLimit) : null,
          usageLimitPerCustomer: promUsageLimitPerCust !== "" ? Number(promUsageLimitPerCust) : null,
          isActive: promActive,
          productIds: promApplyScope === "specific_products" ? promProductIds : [],
          categoryIds: promApplyScope === "category" ? promCategoryIds : [],
        }

        const res =
          mode === "create_promotion"
            ? await createPromotionAction(payload)
            : await updatePromotionAction(promotionId!, payload)

        if (res.success) {
          toast({ title: mode === "create_promotion" ? "Regra de promoção criada." : "Regra de promoção atualizada." })
          onClose()
        } else {
          toast({ title: "Erro ao salvar regra.", description: res.error, variant: "destructive" })
        }
      }
    } catch (err: any) {
      console.error(err)
      toast({ title: "Erro inesperado.", description: err.message, variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Div className="space-y-6 max-w-4xl mx-auto bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border shadow-sm">
      {/* Header */}
      <Div className="flex items-center justify-between border-b border-brand-border dark:border-dark-border pb-4">
        <Div className="flex items-center gap-3">
          <Button variant="outline" onClick={onClose} size="icon">
            <ArrowLeftIcon className="h-5 w-5" />
          </Button>
          <Div>
            <H2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
              {mode === "create_campaign" && "Nova Campanha de Marketing"}
              {mode === "edit_campaign" && "Editar Campanha"}
              {mode === "create_promotion" && "Nova Regra de Promoção"}
              {mode === "edit_promotion" && "Editar Regra de Promoção"}
            </H2>
            <P className="text-xs text-brand-inactive-text">Preencha os critérios da campanha e regras de descontos.</P>
          </Div>
        </Div>
      </Div>

      <form onSubmit={handleSave} className="space-y-6">
        {isCampaignMode ? (
          /* Campaign Creation Form */
          <Div className="space-y-4">
            <Input
              label="Nome da Campanha"
              name="campName"
              value={campName}
              onChange={(e) => setCampName(e.target.value)}
              required
              placeholder="Ex: Campanha de Dia dos Namorados"
            />

            <Div className="space-y-1">
              <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Descrição</label>
              <textarea
                value={campDesc}
                onChange={(e) => setCampDesc(e.target.value)}
                placeholder="Ex: Ganhe brindes e frete grátis em compras acima de R$300"
                className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface min-h-[100px]"
              />
            </Div>

            <Div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Div className="space-y-1">
                <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Data de Início (Vigência)</label>
                <input
                  type="datetime-local"
                  value={campStarts}
                  onChange={(e) => setCampStarts(e.target.value)}
                  className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface"
                />
              </Div>
              <Div className="space-y-1">
                <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Data de Fim (Vigência)</label>
                <input
                  type="datetime-local"
                  value={campEnds}
                  onChange={(e) => setCampEnds(e.target.value)}
                  className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface"
                />
              </Div>
            </Div>

            <Div className="space-y-2">
              <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Público Alvo (Segmentação)</label>
              <Div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="custScope"
                    checked={campScope === "all"}
                    onChange={() => setCampScope("all")}
                  />
                  Todos os Clientes
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="custScope"
                    checked={campScope === "specific"}
                    onChange={() => setCampScope("specific")}
                  />
                  Clientes Específicos (Segmentado)
                </label>
              </Div>
            </Div>

            {campScope === "specific" && (
              <Div className="border border-brand-border dark:border-dark-border p-4 rounded-xl space-y-3">
                <label className="text-xs font-bold uppercase text-brand-inactive-text">Selecionar Clientes elegíveis</label>
                <input
                  type="text"
                  placeholder="Filtrar clientes por nome ou email..."
                  value={custSearch}
                  onChange={(e) => setCustSearch(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-brand-border dark:border-dark-border dark:bg-dark-surface text-sm"
                />
                <Div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {filteredCustomers.map((cust) => {
                    const isChecked = campCustIds.includes(cust.id)
                    return (
                      <label key={cust.id} className="flex items-center gap-3 text-sm p-1 hover:bg-brand-gray/30 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setCampCustIds(campCustIds.filter((id) => id !== cust.id))
                            } else {
                              setCampCustIds([...campCustIds, cust.id])
                            }
                          }}
                        />
                        <Div>
                          <P className="font-semibold">{cust.name}</P>
                          {cust.email && <P className="text-xs text-brand-inactive-text">{cust.email}</P>}
                        </Div>
                      </label>
                    )
                  })}
                </Div>
              </Div>
            )}

            <Div className="flex items-center gap-2 pt-2">
              <Checkbox
                checked={campActive}
                onChange={() => setCampActive(!campActive)}
                label="Esta campanha está ativa e válida"
              />
            </Div>
          </Div>
        ) : (
          /* Promotion Creation Form */
          <Div className="space-y-4">
            <Div className="space-y-1">
              <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Vincular à Campanha</label>
              <select
                value={promCampaignId}
                onChange={(e) => setPromCampaignId(e.target.value)}
                required
                className="w-full p-3 rounded-xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface dark:text-white"
              >
                <option value="">Selecione a campanha mãe...</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.is_active ? "" : "(Inativa)"}
                  </option>
                ))}
              </select>
            </Div>

            <Input
              label="Nome da Regra de Promoção"
              name="promName"
              value={promName}
              onChange={(e) => setPromName(e.target.value)}
              required
              placeholder="Ex: Leve 3 Pague 2 de Camisetas"
            />

            <Div className="space-y-1">
              <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Descrição da Promoção (Opcional)</label>
              <textarea
                value={promDesc}
                onChange={(e) => setPromDesc(e.target.value)}
                placeholder="Ex: Ao comprar 3 itens de vestuário, o item mais barato sai de graça!"
                className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface min-h-[80px]"
              />
            </Div>

            <Div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Div className="space-y-1">
                <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Tipo de Promoção</label>
                <select
                  value={promType}
                  onChange={(e: any) => setPromType(e.target.value)}
                  className="w-full p-3 rounded-xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface dark:text-white"
                >
                  <option value="discount">Desconto Direto (Fixo ou %)</option>
                  <option value="buy_x_pay_y">Leve X Pague Y (Ex: Leve 3 Pague 2)</option>
                  <option value="gift">Ganhar Brinde (Spend-based Freebie)</option>
                  <option value="free_shipping">Frete Grátis</option>
                </select>
              </Div>
              <Div className="space-y-1">
                <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Prioridade de Execução</label>
                <input
                  type="number"
                  placeholder="0"
                  value={promPriority}
                  onChange={(e) => setPromPriority(parseInt(e.target.value) || 0)}
                  className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface"
                />
                <P className="text-xs text-brand-inactive-text">Regras com maior prioridade são calculadas primeiro.</P>
              </Div>
            </Div>

            {/* Render conditional inputs based on promotion type */}
            {promType === "discount" && (
              <Div className="border border-brand-border dark:border-dark-border p-4 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fadeIn">
                <Div className="space-y-1">
                  <label className="text-xs font-bold text-brand-dark">Tipo de Desconto</label>
                  <select
                    value={promDiscountType}
                    onChange={(e: any) => setPromDiscountType(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface dark:text-white text-sm"
                  >
                    <option value="percentage">Porcentagem (%)</option>
                    <option value="fixed">Valor Fixo (R$)</option>
                  </select>
                </Div>
                <Div className="space-y-1">
                  <label className="text-xs font-bold text-brand-dark">Valor do Desconto</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="10"
                    value={promDiscountValue}
                    onChange={(e) => setPromDiscountValue(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-lg border border-brand-border dark:border-dark-border dark:bg-dark-surface text-sm"
                  />
                </Div>
                <Div className="space-y-1">
                  <label className="text-xs font-bold text-brand-dark">Desconto Máximo Capped (Opcional)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 50.00"
                    value={promMaxDiscount}
                    onChange={(e) => setPromMaxDiscount(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-lg border border-brand-border dark:border-dark-border dark:bg-dark-surface text-sm"
                  />
                </Div>
              </Div>
            )}

            {promType === "buy_x_pay_y" && (
              <Div className="border border-brand-border dark:border-dark-border p-4 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fadeIn">
                <Div className="space-y-1">
                  <label className="text-xs font-bold text-brand-dark">Leve (Quantidade para Comprar)</label>
                  <input
                    type="number"
                    min="2"
                    required
                    placeholder="3"
                    value={promBuyQty}
                    onChange={(e) => setPromBuyQty(e.target.value === "" ? "" : parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-lg border border-brand-border dark:border-dark-border dark:bg-dark-surface text-sm"
                  />
                </Div>
                <Div className="space-y-1">
                  <label className="text-xs font-bold text-brand-dark">Pague (Quantidade para Pagar)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="2"
                    value={promPayQty}
                    onChange={(e) => setPromPayQty(e.target.value === "" ? "" : parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-lg border border-brand-border dark:border-dark-border dark:bg-dark-surface text-sm"
                  />
                </Div>
              </Div>
            )}

            {promType === "gift" && (
              <Div className="border border-brand-border dark:border-dark-border p-4 rounded-xl space-y-1 animate-fadeIn">
                <label className="text-xs font-bold text-brand-dark">Selecione o Brinde (Gift Product)</label>
                <select
                  value={promGiftProductId}
                  onChange={(e) => setPromGiftProductId(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-lg border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface dark:text-white text-sm"
                >
                  <option value="">Escolha o produto que será entregue de brinde...</option>
                  {scopeData.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Estoque: {p.isActive === false ? "Inativo" : "Disponível"})
                    </option>
                  ))}
                </select>
              </Div>
            )}

            <Div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Div className="space-y-1">
                <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Valor Mínimo de Compra</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={promMinSpend}
                  onChange={(e) => setPromMinSpend(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                  className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface"
                />
                <P className="text-xs text-brand-inactive-text">O gatilho de gastos para aplicar.</P>
              </Div>
              <Div className="space-y-1">
                <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Limite Global de Usos</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Sem limite"
                  value={promUsageLimit}
                  onChange={(e) => setPromUsageLimit(e.target.value === "" ? "" : parseInt(e.target.value) || 0)}
                  className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface"
                />
              </Div>
              <Div className="space-y-1">
                <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Limite de Usos por Cliente</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Sem limite"
                  value={promUsageLimitPerCust}
                  onChange={(e) => setPromUsageLimitPerCust(e.target.value === "" ? "" : parseInt(e.target.value) || 0)}
                  className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border dark:bg-dark-surface"
                />
              </Div>
            </Div>

            <Div className="space-y-2">
              <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Escopo de Aplicação</label>
              <select
                value={promApplyScope}
                onChange={(e: any) => setPromApplyScope(e.target.value)}
                className="w-full p-3 rounded-xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface dark:text-white"
              >
                <option value="entire_cart">Todo o Carrinho (Geral)</option>
                <option value="specific_products">Produtos Específicos</option>
                <option value="category">Categorias Específicas</option>
              </select>
            </Div>

            {promApplyScope === "specific_products" && (
              <Div className="flex items-center gap-4 border border-brand-border dark:border-dark-border p-4 rounded-xl justify-between">
                <Div>
                  <P className="text-sm font-semibold">Produtos Selecionados</P>
                  <P className="text-xs text-brand-inactive-text">{promProductIds.length} produtos elegíveis vinculados.</P>
                </Div>
                <Button variant="outline" type="button" onClick={() => setIsProductsSheetOpen(true)}>
                  Selecionar Produtos
                </Button>
              </Div>
            )}

            {promApplyScope === "category" && (
              <Div className="flex items-center gap-4 border border-brand-border dark:border-dark-border p-4 rounded-xl justify-between">
                <Div>
                  <P className="text-sm font-semibold">Categorias Selecionadas</P>
                  <P className="text-xs text-brand-inactive-text">{promCategoryIds.length} categorias elegíveis vinculadas.</P>
                </Div>
                <Button variant="outline" type="button" onClick={() => setIsCategoriesSheetOpen(true)}>
                  Selecionar Categorias
                </Button>
              </Div>
            )}

            <Div className="space-y-4 pt-2">
              <Checkbox
                checked={promAllowCoupon}
                onChange={() => setPromAllowCoupon(!promAllowCoupon)}
                label="Permitir uso combinado com cupons de desconto"
              />
              <Checkbox
                checked={promActive}
                onChange={() => setPromActive(!promActive)}
                label="Esta regra de promoção está ativa e disponível para cálculo"
              />
            </Div>
          </Div>
        )}

        {/* Form buttons */}
        <Div className="flex items-center justify-end gap-3 border-t border-brand-border dark:border-dark-border pt-4">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="filled" type="submit" isLoading={isSaving}>
            <SaveIcon className="mr-2 h-4 w-4" /> Salvar Alterações
          </Button>
        </Div>
      </form>

      {/* Product Selection Sheet */}
      <SelectPromotionProductsSheet
        isOpen={isProductsSheetOpen}
        onClose={() => setIsProductsSheetOpen(false)}
        products={scopeData.products}
        selectedIds={promProductIds}
        onToggle={(id) => {
          if (promProductIds.includes(id)) {
            setPromProductIds(promProductIds.filter((pId) => pId !== id))
          } else {
            setPromProductIds([...promProductIds, id])
          }
        }}
      />

      {/* Category Selection Sheet */}
      <SelectPromotionCategoriesSheet
        isOpen={isCategoriesSheetOpen}
        onClose={() => setIsCategoriesSheetOpen(false)}
        categories={scopeData.categories}
        selectedIds={promCategoryIds}
        onToggle={(id) => {
          if (promCategoryIds.includes(id)) {
            setPromCategoryIds(promCategoryIds.filter((cId) => cId !== id))
          } else {
            setPromCategoryIds([...promCategoryIds, id])
          }
        }}
      />
    </Div>
  )
}
