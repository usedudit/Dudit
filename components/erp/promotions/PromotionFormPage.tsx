"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { SaveIcon, EditIcon, PlusIcon, TrashIcon, SearchIcon, UserIcon, Package, WrenchIcon } from "@/lib/icons"
import { Button, Input, Checkbox, Badge, Tabs, TabsList, TabsTrigger, FormDropdown, FormTextarea, FormRadioGroup, DatePicker, FormSection, Pagination, Separator, MoneyInput, PercentageInput, IconPlaceholder } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { useToast } from "@/hooks/use-toast"
import { useSidebar } from "@/lib/sidebar-context"
import {
    createCampaignAction,
    updateCampaignAction,
    createPromotionAction,
    updatePromotionAction,
} from "@/app/actions/shared/promotions"
import SelectPromotionProductsSheet from "./SelectPromotionProductsSheet"
import SelectPromotionCategoriesSheet from "./SelectPromotionCategoriesSheet"
import SelectPromotionServicesSheet from "./SelectPromotionServicesSheet"
import SelectPromotionGiftSheet from "./SelectPromotionGiftSheet"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
import { ChevronLeftIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { AnimatePresence } from "framer-motion"

const parseNumberField = (val: any): number | null => {
    if (val === undefined || val === null || val === "") return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
}

function getAutoPromotionName(
    campName: string,
    type: string,
    discountType?: string,
    discountValue?: number,
    buyQuantity?: number,
    payQuantity?: number
) {
    const base = campName || "Promoção";
    if (type === "gift") return `${base} - Brinde`;
    if (type === "buy_x_pay_y") return `${base} - Leve ${buyQuantity || 0} Pague ${payQuantity || 0}`;
    if (type === "discount") {
        const valStr = discountType === "percentage" ? `${discountValue || 0}%` : `R$ ${discountValue || 0}`;
        return `${base} - Desconto de ${valStr}`;
    }
    return base;
}

interface PromotionFormPageProps {
    partnerId: string
    mode: "add" | "edit" | "details" | "duplicate"
    campaign?: any
    scopeData: { products: any[]; services: any[]; categories: any[]; serviceCategories: any[]; customers: any[] }
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
    const { setHeaderOverride } = useSidebar()
    const [currentMode, setCurrentMode] = useState(initialMode)
    const [isSaving, setIsSaving] = useState(false)
    const [activeTab, setActiveTab] = useState("general")

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

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

    // Subform Rule State (for adding/editing a promotion inside the tab)
    const [editingRule, setEditingRule] = useState<any | null>(null)

    // Sheet states for selected products/categories/services in the rule subform
    const [editingRuleProductIds, setEditingRuleProductIds] = useState<string[]>([])
    const [editingRuleCategoryIds, setEditingRuleCategoryIds] = useState<string[]>([])
    const [editingRuleServiceIds, setEditingRuleServiceIds] = useState<string[]>([])
    const [isProductsSheetOpen, setIsProductsSheetOpen] = useState(false)
    const [isCategoriesSheetOpen, setIsCategoriesSheetOpen] = useState(false)
    const [isServicesSheetOpen, setIsServicesSheetOpen] = useState(false)
    const [isGiftSheetOpen, setIsGiftSheetOpen] = useState(false)
    const [isCustomersSheetOpen, setIsCustomersSheetOpen] = useState(false)

    // Pagination & Search states for selected items lists
    const [scopeSearch, setScopeSearch] = useState("")
    const [scopePage, setScopePage] = useState(1)

    const pageTitle = useMemo(() => {
        return currentMode === "add" ? "Nova Campanha de Marketing"
            : currentMode === "duplicate" ? "Duplicar Campanha"
                : campName || "Campanha"
    }, [currentMode, campName])

    const handleBack = useCallback(() => {
        onClose()
    }, [onClose])

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [pageTitle, handleBack, setHeaderOverride])

    const lastCampaignIdRef = useRef<string | undefined>(undefined)
    const lastModeRef = useRef<string | undefined>(undefined)

    // Sync initial mode
    useEffect(() => {
        setCurrentMode(initialMode)
    }, [initialMode])

    // Load data based on mode and campaign
    useEffect(() => {
        const campaignId = campaign?.id
        const isNewCampaign = campaignId !== lastCampaignIdRef.current || currentMode !== lastModeRef.current
        if (isNewCampaign) {
            lastCampaignIdRef.current = campaignId
            lastModeRef.current = currentMode

            if ((currentMode === "edit" || currentMode === "details" || currentMode === "duplicate") && campaign) {
                setCampName(currentMode === "duplicate" ? `${campaign.name} (Cópia)` : campaign.name || "")
                setCampDesc(campaign.description || "")
                setCampScope(campaign.customer_scope || "all")
                setCampStarts(campaign.starts_at ? new Date(campaign.starts_at).toISOString().slice(0, 16) : "")
                setCampEnds(campaign.ends_at ? new Date(campaign.ends_at).toISOString().slice(0, 16) : "")
                setCampActive(campaign.is_active ?? true)
                setCampCustIds((campaign.campaign_customers || []).map((cc: any) => cc.customer_id))

                const campPromos = promotions.filter(p => p.campaign_id === campaign.id)
                let initialPromos = []
                if (currentMode === "duplicate") {
                    initialPromos = campPromos.map(p => ({
                        ...p,
                        id: `temp_${Math.random()}`,
                        campaign_id: undefined,
                        promotion_products: (p.promotion_products || []).map((prod: any) => prod.product_id || prod),
                        promotion_categories: (p.promotion_categories || []).map((cat: any) => cat.category_id || cat),
                        promotion_services: (p.promotion_services || []).map((serv: any) => serv.service_id || serv),
                    }))
                } else {
                    initialPromos = campPromos
                }
                if (initialPromos.length > 0) {
                    setEditingRule(initialPromos[0])
                } else {
                    setEditingRule({ is_active: true, priority: 0, promotion_type: 'discount', discount_type: 'percentage', apply_scope: 'entire_cart' })
                }
            } else if (currentMode === "add") {
                setCampName("")
                setCampDesc("")
                setCampScope("all")
                setCampStarts("")
                setCampEnds("")
                setCampActive(true)
                setCampCustIds([])
                setEditingRule({ is_active: true, priority: 0, promotion_type: 'discount', discount_type: 'percentage', apply_scope: 'entire_cart' })
            }
        }
    }, [currentMode, campaign, promotions])

    // Reset selected lists pagination and search when active scope changes
    useEffect(() => {
        setScopeSearch("")
        setScopePage(1)
    }, [editingRule?.apply_scope, editingRule?.id])

    // Update product/category/services selection sheets state when subform opens
    useEffect(() => {
        if (editingRule) {
            setEditingRuleProductIds(
                (editingRule.promotion_products || []).map((p: any) => p.product_id || p)
            )
            setEditingRuleCategoryIds(
                (editingRule.promotion_categories || []).map((c: any) => c.category_id || c)
            )
            setEditingRuleServiceIds(
                (editingRule.promotion_services || []).map((s: any) => s.service_id || s)
            )
        } else {
            setEditingRuleProductIds([])
            setEditingRuleCategoryIds([])
            setEditingRuleServiceIds([])
        }
    }, [editingRule])

    // Save the overall Campaign + memory rules
    const handleSaveCampaign = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!campName.trim()) {
            toast({ title: "Nome da campanha é obrigatório.", variant: "destructive" })
            return
        }

        // Validate the promotion rule (since there is only one rule, it's always editingRule)
        if (editingRule) {
            if (editingRule.promotion_type === "buy_x_pay_y") {
                if (!editingRule.buy_quantity || !editingRule.pay_quantity || Number(editingRule.buy_quantity) <= Number(editingRule.pay_quantity)) {
                    toast({ title: "Erro", description: "Para Leve X Pague Y, a quantidade de compra deve ser maior que a quantidade paga.", variant: "destructive" })
                    return
                }
            } else if (editingRule.promotion_type === "gift") {
                if (!editingRule.gift_product_id && !editingRule.gift_service_id) {
                    toast({ title: "Erro", description: "Selecione o brinde.", variant: "destructive" })
                    return
                }
            } else if (editingRule.promotion_type === "discount") {
                if (!editingRule.discount_type || !editingRule.discount_value) {
                    toast({ title: "Erro", description: "Informe o tipo e valor de desconto.", variant: "destructive" })
                    return
                }
                if (editingRule.discount_type === "fixed" && !editingRule.min_spend_amount) {
                    toast({ title: "Erro", description: "Para desconto de valor fixo (R$), informe o valor mínimo de compra.", variant: "destructive" })
                    return
                }
            }
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
                // 1. Save Campaign details
                const res = await updateCampaignAction(campaign.id, payload)
                if (!res.success) {
                    toast({ title: "Erro ao salvar campanha.", description: res.error, variant: "destructive" })
                    setIsSaving(false)
                    return
                }

                // 2. Save Rule details
                if (editingRule) {
                    const generatedName = getAutoPromotionName(
                        campName,
                        editingRule.promotion_type,
                        editingRule.discount_type,
                        editingRule.discount_value,
                        editingRule.buy_quantity,
                        editingRule.pay_quantity
                    )
                    const promoPayload = {
                        partnerId,
                        campaignId: campaign.id,
                        name: generatedName,
                        description: null,
                        promotionType: editingRule.promotion_type,
                        discountType: editingRule.promotion_type === "discount" ? editingRule.discount_type : null,
                        discountValue: editingRule.promotion_type === "discount" ? parseNumberField(editingRule.discount_value) : null,
                        maxDiscountAmount: parseNumberField(editingRule.max_discount_amount),
                        minSpendAmount: parseNumberField(editingRule.min_spend_amount),
                        giftProductId: editingRule.promotion_type === "gift" && editingRule.gift_product_id ? editingRule.gift_product_id : null,
                        giftServiceId: editingRule.promotion_type === "gift" && editingRule.gift_service_id ? editingRule.gift_service_id : null,
                        buyQuantity: editingRule.promotion_type === "buy_x_pay_y" ? parseNumberField(editingRule.buy_quantity) : null,
                        payQuantity: editingRule.promotion_type === "buy_x_pay_y" ? parseNumberField(editingRule.pay_quantity) : null,
                        priority: Number(editingRule.priority || 0),
                        applyScope: editingRule.apply_scope,
                        allowCouponCombination: !!editingRule.allow_coupon_combination,
                        usageLimit: parseNumberField(editingRule.usage_limit),
                        usageLimitPerCustomer: parseNumberField(editingRule.usage_limit_per_customer),
                        isActive: editingRule.is_active ?? true,
                        productIds: editingRule.apply_scope === "specific_products" ? editingRuleProductIds : [],
                        categoryIds: editingRule.apply_scope === "category" ? editingRuleCategoryIds : [],
                        serviceIds: editingRule.apply_scope === "specific_services" ? editingRuleServiceIds : [],
                    }

                    let promoRes
                    if (editingRule.id && !editingRule.id.toString().startsWith("temp_")) {
                        promoRes = await updatePromotionAction(editingRule.id, promoPayload)
                    } else {
                        promoRes = await createPromotionAction(promoPayload)
                    }

                    if (!promoRes.success) {
                        toast({ title: "Campanha salva, mas erro ao salvar a regra de promoção.", description: promoRes.error, variant: "destructive" })
                        setIsSaving(false)
                        return
                    }
                }

                toast({ title: "Campanha e regra salvas com sucesso." })
                onClose()
            } else {
                // Mode is "add" or "duplicate"
                const res = await createCampaignAction(payload)
                if (res.success) {
                    const newCampaignId = res.id

                    // Create Rule details
                    if (editingRule) {
                        const generatedName = getAutoPromotionName(
                            campName,
                            editingRule.promotion_type,
                            editingRule.discount_type,
                            editingRule.discount_value,
                            editingRule.buy_quantity,
                            editingRule.pay_quantity
                        )
                        const promoPayload = {
                            partnerId,
                            campaignId: newCampaignId,
                            name: generatedName,
                            description: null,
                            promotionType: editingRule.promotion_type,
                            discountType: editingRule.promotion_type === "discount" ? editingRule.discount_type : null,
                            discountValue: editingRule.promotion_type === "discount" ? parseNumberField(editingRule.discount_value) : null,
                            maxDiscountAmount: parseNumberField(editingRule.max_discount_amount),
                            minSpendAmount: parseNumberField(editingRule.min_spend_amount),
                            giftProductId: editingRule.promotion_type === "gift" && editingRule.gift_product_id ? editingRule.gift_product_id : null,
                            giftServiceId: editingRule.promotion_type === "gift" && editingRule.gift_service_id ? editingRule.gift_service_id : null,
                            buyQuantity: editingRule.promotion_type === "buy_x_pay_y" ? parseNumberField(editingRule.buy_quantity) : null,
                            payQuantity: editingRule.promotion_type === "buy_x_pay_y" ? parseNumberField(editingRule.pay_quantity) : null,
                            priority: Number(editingRule.priority || 0),
                            applyScope: editingRule.apply_scope,
                            allowCouponCombination: !!editingRule.allow_coupon_combination,
                            usageLimit: parseNumberField(editingRule.usage_limit),
                            usageLimitPerCustomer: parseNumberField(editingRule.usage_limit_per_customer),
                            isActive: editingRule.is_active ?? true,
                            productIds: editingRule.apply_scope === "specific_products" ? editingRuleProductIds : [],
                            categoryIds: editingRule.apply_scope === "category" ? editingRuleCategoryIds : [],
                            serviceIds: editingRule.apply_scope === "specific_services" ? editingRuleServiceIds : [],
                        }
                        const promoRes = await createPromotionAction(promoPayload)
                        if (!promoRes.success) {
                            console.error("Failed to save promotion rule:", promoRes.error)
                            toast({
                                title: "Campanha criada, mas a regra falhou ao salvar.",
                                description: promoRes.error,
                                variant: "destructive"
                            })
                            setIsSaving(false)
                            return
                        }
                    }

                    toast({ title: "Campanha e regra salvas com sucesso." })
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

    // Selected products selectors & filters
    const selectedProducts = useMemo(() => {
        return scopeData.products.filter(p => editingRuleProductIds.includes(p.id))
    }, [scopeData.products, editingRuleProductIds])

    const filteredSelectedProducts = useMemo(() => {
        const term = scopeSearch.toLowerCase().trim()
        if (!term) return selectedProducts
        return selectedProducts.filter((p: any) =>
            p.name.toLowerCase().includes(term) ||
            (p.sku && p.sku.toLowerCase().includes(term))
        )
    }, [selectedProducts, scopeSearch])

    const paginatedSelectedProducts = useMemo(() => {
        const start = (scopePage - 1) * 5
        return filteredSelectedProducts.slice(start, start + 5)
    }, [filteredSelectedProducts, scopePage])

    const totalProductPages = Math.ceil(filteredSelectedProducts.length / 5)

    // Selected categories selectors & filters
    const selectedCategories = useMemo(() => {
        const allCats = [...scopeData.categories, ...(scopeData.serviceCategories || [])]
        return allCats.filter(c => editingRuleCategoryIds.includes(c.id))
    }, [scopeData.categories, scopeData.serviceCategories, editingRuleCategoryIds])

    const filteredSelectedCategories = useMemo(() => {
        const term = scopeSearch.toLowerCase().trim()
        if (!term) return selectedCategories
        return selectedCategories.filter((c: any) => c.name.toLowerCase().includes(term))
    }, [selectedCategories, scopeSearch])

    const paginatedSelectedCategories = useMemo(() => {
        const start = (scopePage - 1) * 5
        return filteredSelectedCategories.slice(start, start + 5)
    }, [filteredSelectedCategories, scopePage])

    const totalCategoryPages = Math.ceil(filteredSelectedCategories.length / 5)

    // Selected services selectors & filters
    const selectedServices = useMemo(() => {
        return (scopeData.services || []).filter(s => editingRuleServiceIds.includes(s.id))
    }, [scopeData.services, editingRuleServiceIds])

    const filteredSelectedServices = useMemo(() => {
        const term = scopeSearch.toLowerCase().trim()
        if (!term) return selectedServices
        return selectedServices.filter((s: any) =>
            s.name.toLowerCase().includes(term) ||
            (s.sku && s.sku.toLowerCase().includes(term))
        )
    }, [selectedServices, scopeSearch])

    const paginatedSelectedServices = useMemo(() => {
        const start = (scopePage - 1) * 5
        return filteredSelectedServices.slice(start, start + 5)
    }, [filteredSelectedServices, scopePage])

    const totalServicePages = Math.ceil(filteredSelectedServices.length / 5)

    const SidebarCard = ({ children, className = "", hasTopStrip = false }: { children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
        <div className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
            {hasTopStrip && <div className="absolute top-0 left-0 w-full h-[3px] bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
            {children}
        </div>
    )

    const renderSelectedProductsList = () => {
        return (
            <FormSection hasSeparator title="Produtos Específicos Elegíveis">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                        <div className="w-full sm:w-72">
                            <Input
                                name="scopeSearch"
                                placeholder="Buscar nos selecionados..."
                                value={scopeSearch}
                                onChange={(e) => {
                                    setScopeSearch(e.target.value)
                                    setScopePage(1)
                                }}
                                className="mb-0"
                                variant="full-rounded"
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                label=""
                            />
                        </div>
                    </div>

                    {filteredSelectedProducts.length > 0 ? (
                        <>
                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-hidden bg-white dark:bg-dark-surface">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 rounded-l-lg">Produto</th>
                                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">SKU</th>
                                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">Categoria</th>
                                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">Preço</th>
                                            <th className="p-3 font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center pr-6 w-20 rounded-r-lg">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedSelectedProducts.map((prod) => (
                                            <tr key={prod.id} className="border-b border-brand-border dark:border-dark-border last:border-0 hover:bg-brand-gray/35 dark:hover:bg-dark-border/20 transition-colors">
                                                <td className="p-3 pl-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
                                                            <img
                                                                src={getR2ImageUrl(prod.image, "thumbnail")}
                                                                alt=""
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{prod.name}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-brand-inactive-text dark:text-dark-body">{prod.sku || "-"}</td>
                                                <td className="p-3 text-brand-inactive-text dark:text-dark-body">{prod.category || "-"}</td>
                                                <td className="p-3 font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(prod.price)}</td>
                                                <td className="p-3 text-center pr-6" onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        variant="outlinered"
                                                        size="icon"
                                                        onClick={() => setEditingRuleProductIds(editingRuleProductIds.filter(id => id !== prod.id))}
                                                        className="h-8 w-8"
                                                    >
                                                        <TrashIcon size={16} />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile/Tablet List */}
                            <div className="md:hidden border border-brand-border dark:border-dark-border rounded-xl p-4 bg-white dark:bg-dark-surface space-y-3">
                                {paginatedSelectedProducts.map((prod, idx) => (
                                    <React.Fragment key={prod.id}>
                                        {idx > 0 && <Separator className="my-2" />}
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
                                                    <img
                                                        src={getR2ImageUrl(prod.image, "thumbnail")}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{prod.name}</p>
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                                        {prod.sku ? `SKU: ${prod.sku}` : "Sem SKU"} • {formatCurrency(prod.price)}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setEditingRuleProductIds(editingRuleProductIds.filter(id => id !== prod.id))}
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50 border-0 h-8 w-8 shrink-0"
                                            >
                                                <TrashIcon size={16} />
                                            </Button>
                                        </div>
                                    </React.Fragment>
                                ))}
                            </div>

                            {/* Pagination */}
                            {totalProductPages > 1 && (
                                <div className="flex justify-center pt-2">
                                    <Pagination
                                        currentPage={scopePage}
                                        totalPages={totalProductPages}
                                        onPageChange={setScopePage}
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <IconPlaceholder
                            icon={Package}
                            title="Nenhum produto selecionado"
                            subtitle="Selecione produtos para a promoção."
                            itemButton={{
                                text: "Selecionar Produtos",
                                action: () => setIsProductsSheetOpen(true),
                                variant: "outline",
                                className: "h-9 text-sm"
                            }}
                        />
                    )}
                </div>
            </FormSection>
        )
    }

    const renderSelectedCategoriesList = () => {
        return (
            <FormSection title="Categorias Específicas Elegíveis">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                        <div className="w-full sm:w-72">
                            <Input
                                name="scopeSearch"
                                placeholder="Buscar nos selecionados..."
                                value={scopeSearch}
                                onChange={(e) => {
                                    setScopeSearch(e.target.value)
                                    setScopePage(1)
                                }}
                                className="mb-0"
                                variant="full-rounded"
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                label=""
                            />
                        </div>
                    </div>

                    {filteredSelectedCategories.length > 0 ? (
                        <>
                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-hidden rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border">
                                            <th className="p-3 pl-6 font-semibold text-gray-500 dark:text-dark-body">Categoria</th>
                                            <th className="p-3 font-semibold text-gray-500 dark:text-dark-body text-center pr-6 w-20">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedSelectedCategories.map((cat) => (
                                            <tr key={cat.id} className="border-b border-brand-border dark:border-dark-border last:border-0 hover:bg-brand-gray/35 dark:hover:bg-dark-border/20 transition-colors">
                                                <td className="p-3 pl-6 font-bold text-brand-dark dark:text-dark-heading">{cat.name}</td>
                                                <td className="p-3 text-center pr-6" onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() => setEditingRuleCategoryIds(editingRuleCategoryIds.filter(id => id !== cat.id))}
                                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 border-0 h-8 w-8"
                                                    >
                                                        <TrashIcon size={16} />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile/Tablet List */}
                            <div className="md:hidden border border-brand-border dark:border-dark-border rounded-xl p-4 bg-white dark:bg-dark-surface space-y-3">
                                {paginatedSelectedCategories.map((cat, idx) => (
                                    <React.Fragment key={cat.id}>
                                        {idx > 0 && <Separator className="my-2" />}
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{cat.name}</p>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setEditingRuleCategoryIds(editingRuleCategoryIds.filter(id => id !== cat.id))}
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50 border-0 h-8 w-8 shrink-0"
                                            >
                                                <TrashIcon size={16} />
                                            </Button>
                                        </div>
                                    </React.Fragment>
                                ))}
                            </div>

                            {/* Pagination */}
                            {totalCategoryPages > 1 && (
                                <div className="flex justify-center pt-2">
                                    <Pagination
                                        currentPage={scopePage}
                                        totalPages={totalCategoryPages}
                                        onPageChange={setScopePage}
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <IconPlaceholder
                            icon={Package}
                            title="Nenhuma categoria selecionada"
                            subtitle="Selecione categorias para a promoção."
                            itemButton={{
                                text: "Selecionar Categorias",
                                action: () => setIsCategoriesSheetOpen(true),
                                variant: "outline",
                                className: "h-9 text-sm"
                            }}
                        />
                    )}
                </div>
            </FormSection>
        )
    }

    const renderSelectedServicesList = () => {
        return (
            <FormSection title="Serviços Específicos Elegíveis">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                        <div className="w-full sm:w-72">
                            <Input
                                name="scopeSearch"
                                placeholder="Buscar nos selecionados..."
                                value={scopeSearch}
                                onChange={(e) => {
                                    setScopeSearch(e.target.value)
                                    setScopePage(1)
                                }}
                                className="mb-0"
                                variant="full-rounded"
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                label=""
                            />
                        </div>
                    </div>

                    {filteredSelectedServices.length > 0 ? (
                        <>
                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-hidden rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border">
                                            <th className="p-3 pl-6 font-semibold text-gray-500 dark:text-dark-body">Serviço</th>
                                            <th className="p-3 font-semibold text-gray-500 dark:text-dark-body">SKU</th>
                                            <th className="p-3 font-semibold text-gray-500 dark:text-dark-body">Categoria</th>
                                            <th className="p-3 font-semibold text-gray-500 dark:text-dark-body">Preço</th>
                                            <th className="p-3 font-semibold text-gray-500 dark:text-dark-body text-center pr-6 w-20">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedSelectedServices.map((serv) => (
                                            <tr key={serv.id} className="border-b border-brand-border dark:border-dark-border last:border-0 hover:bg-brand-gray/35 dark:hover:bg-dark-border/20 transition-colors">
                                                <td className="p-3 pl-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
                                                            <img
                                                                src={getR2ImageUrl(serv.image, "thumbnail")}
                                                                alt=""
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{serv.name}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-brand-inactive-text dark:text-dark-body">{serv.sku || "-"}</td>
                                                <td className="p-3 text-brand-inactive-text dark:text-dark-body">{serv.category || "-"}</td>
                                                <td className="p-3 font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(serv.price)}</td>
                                                <td className="p-3 text-center pr-6" onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() => setEditingRuleServiceIds(editingRuleServiceIds.filter(id => id !== serv.id))}
                                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 border-0 h-8 w-8"
                                                    >
                                                        <TrashIcon size={16} />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile/Tablet List */}
                            <div className="md:hidden border border-brand-border dark:border-dark-border rounded-xl p-4 bg-white dark:bg-dark-surface space-y-3">
                                {paginatedSelectedServices.map((serv, idx) => (
                                    <React.Fragment key={serv.id}>
                                        {idx > 0 && <Separator className="my-2" />}
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
                                                    <img
                                                        src={getR2ImageUrl(serv.image, "thumbnail")}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{serv.name}</p>
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                                        {serv.sku ? `SKU: ${serv.sku}` : "Sem SKU"} • {formatCurrency(serv.price)}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setEditingRuleServiceIds(editingRuleServiceIds.filter(id => id !== serv.id))}
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50 border-0 h-8 w-8 shrink-0"
                                            >
                                                <TrashIcon size={16} />
                                            </Button>
                                        </div>
                                    </React.Fragment>
                                ))}
                            </div>

                            {/* Pagination */}
                            {totalServicePages > 1 && (
                                <div className="flex justify-center pt-2">
                                    <Pagination
                                        currentPage={scopePage}
                                        totalPages={totalServicePages}
                                        onPageChange={setScopePage}
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <IconPlaceholder
                            icon={WrenchIcon}
                            title="Nenhum serviço selecionado"
                            subtitle="Selecione serviços para a promoção."
                            itemButton={{
                                text: "Selecionar Serviços",
                                action: () => setIsServicesSheetOpen(true),
                                variant: "outline",
                                className: "h-9 text-sm"
                            }}
                        />
                    )}
                </div>
            </FormSection>
        )
    }

    const renderSelectedCustomersList = () => {
        const selectedCustomers = scopeData.customers.filter((c: any) => campCustIds.includes(c.id))
        const searched = custSearch.trim()
            ? selectedCustomers.filter((c: any) =>
                c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
                String(c.email || "").toLowerCase().includes(custSearch.toLowerCase())
            )
            : selectedCustomers

        return (
            <FormSection title="Clientes Elegíveis">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                        <div className="w-full sm:w-72">
                            <Input
                                name="custSearch"
                                placeholder="Buscar nos selecionados..."
                                value={custSearch}
                                onChange={(e) => setCustSearch(e.target.value)}
                                className="mb-0"
                                variant="full-rounded"
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                label=""
                            />
                        </div>
                        <Button variant="outline" type="button" onClick={() => setIsCustomersSheetOpen(true)} leftIcon={<PlusIcon size={16} />}>
                            Selecionar Clientes
                        </Button>
                    </div>

                    {searched.length > 0 ? (
                        <div className="border border-brand-border dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface divide-y divide-brand-border dark:divide-dark-border">
                            {searched.map((cust: any) => (
                                <div key={cust.id} className="flex items-center justify-between gap-3 p-3.5">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                            <UserIcon size={16} className="text-brand-inactive-text" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{cust.name}</p>
                                            {cust.email && <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">{cust.email}</p>}
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setCampCustIds(campCustIds.filter((id: string) => id !== cust.id))}
                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 border-0 h-8 w-8 shrink-0"
                                    >
                                        <TrashIcon size={16} />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : campCustIds.length === 0 ? (
                        <div className="text-center py-8 border border-dashed border-brand-border dark:border-dark-border rounded-xl bg-gray-50/50 dark:bg-dark-surface/30">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum cliente selecionado.</p>
                        </div>
                    ) : (
                        <div className="text-center py-8 border border-dashed border-brand-border dark:border-dark-border rounded-xl bg-gray-50/50 dark:bg-dark-surface/30">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum cliente corresponde à busca.</p>
                        </div>
                    )}
                </div>
            </FormSection>
        )
    }

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="truncate">{pageTitle}</span>
                                            {currentMode === "edit" && (
                                                <Badge variant="orange" icon={<EditIcon />} className="text-sm font-normal h-fit whitespace-nowrap px-2 py-0.5">
                                                    Editando
                                                </Badge>
                                            )}
                                        </h1>
                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            {currentMode === "add" && "Configure os critérios e datas de vigência da campanha."}
                                            {currentMode === "duplicate" && "Configurações clonadas. Modifique o necessário antes de salvar."}
                                            {currentMode === "details" && "Visualização dos detalhes e regras da campanha."}
                                            {currentMode === "edit" && "Edite os dados e regras da campanha."}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
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
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="general">Dados gerais</TabsTrigger>
                                        <TabsTrigger value="rules">Regra de promoção</TabsTrigger>
                                    </TabsList>
                                </div>

                            </div>
                        </div>

                        {/* Form Content */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <AnimatePresence mode="wait">
                                {/* General Settings Tab */}
                                {activeTab === "general" && (
                                    <FadeIn key="general" className="block">
                                        <form onSubmit={handleSaveCampaign} className="grid grid-cols-12 gap-y-8 lg:gap-y-0">
                                            {/* Left Column */}
                                            <div className="col-span-12 lg:col-span-8 lg:pr-12 space-y-6">
                                                <FormSection title="Pedido Origem">
                                                    <Input
                                                        label="Nome da Campanha"
                                                        name="campName"
                                                        value={campName}
                                                        onChange={(e) => setCampName(e.target.value)}
                                                        required
                                                        disabled={isReadOnly}
                                                        placeholder="Ex: Dia dos Namorados"
                                                    />

                                                    <FormTextarea
                                                        label="Descrição"
                                                        name="campDesc"
                                                        value={campDesc}
                                                        onChange={(e) => setCampDesc(e.target.value)}
                                                        disabled={isReadOnly}
                                                        placeholder="Descrição para controle interno ou exibição pública"
                                                    />

                                                    <FormRadioGroup
                                                        label="Público da Campanha"
                                                        name="custScope"
                                                        value={campScope}
                                                        onChange={(val) => setCampScope(val as "all" | "specific")}
                                                        disabled={isReadOnly}
                                                        options={[
                                                            { value: "all", label: "Todos os Clientes" },
                                                            { value: "specific", label: "Clientes Específicos" }
                                                        ]}
                                                    />

                                                    {campScope === "specific" && renderSelectedCustomersList()}
                                                </FormSection>
                                            </div>

                                            {/* Right Column */}
                                            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                                <SidebarCard hasTopStrip>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Duração da Campanha</h3>
                                                    <div className="space-y-5">
                                                        <DatePicker
                                                            label="Início da Vigência"
                                                            value={campStarts}
                                                            onChange={(d) => setCampStarts(d.toISOString())}
                                                        />
                                                        <DatePicker
                                                            label="Fim da Vigência"
                                                            value={campEnds}
                                                            onChange={(d) => setCampEnds(d.toISOString())}
                                                        />

                                                        <div className="flex items-center gap-2">
                                                            <Checkbox
                                                                checked={campActive}
                                                                onChange={() => setCampActive(!campActive)}
                                                                disabled={isReadOnly}
                                                                label="Esta campanha está ativa e válida"
                                                            />
                                                        </div>
                                                    </div>
                                                </SidebarCard>
                                            </div>
                                        </form>
                                    </FadeIn>
                                )}

                                {/* Rules Tab */}
                                {activeTab === "rules" && (
                                    <FadeIn key="rules" className="block">
                                        <div className="space-y-6">
                                            {editingRule && (
                                                /* Rule Form in Two Columns */
                                                <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 animate-fadeIn">

                                                    {/* Left Column: Rule configuration */}
                                                    <div className="col-span-12 lg:col-span-8 lg:pr-12 space-y-6">
                                                        <FormSection title={editingRule.id && !editingRule.id.toString().startsWith("temp_") ? "Editar Regra de Promoção" : "Nova Regra de Promoção"}>
                                                            {/* Tipo de Promoção */}
                                                            <FormDropdown
                                                                label="Tipo de Promoção"
                                                                value={editingRule.promotion_type || "discount"}
                                                                setValue={(val) => setEditingRule({ ...editingRule, promotion_type: val })}
                                                                options={[
                                                                    { value: "discount", label: "Desconto Direto (Fixo ou %)" },
                                                                    { value: "buy_x_pay_y", label: "Leve X Pague Y (Ex: Leve 3 Pague 2)" },
                                                                    { value: "gift", label: "Ganhar Brinde (Freebie)" }
                                                                ]}
                                                            />

                                                            {/* Conditional configurations based on promotion type */}
                                                            {editingRule.promotion_type === "discount" && (
                                                                <>
                                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                                                        <FormDropdown
                                                                            label="Tipo de Desconto"
                                                                            value={editingRule.discount_type || "percentage"}
                                                                            setValue={(val) => setEditingRule({ ...editingRule, discount_type: val })}
                                                                            options={[
                                                                                { value: "percentage", label: "Porcentagem (%)" },
                                                                                { value: "fixed", label: "Valor Fixo (R$)" }
                                                                            ]}
                                                                        />
                                                                        {editingRule.discount_type === "percentage" ? (
                                                                            <PercentageInput
                                                                                label="Valor do Desconto"
                                                                                name="discount_value"
                                                                                required
                                                                                placeholder="10"
                                                                                value={editingRule.discount_value ?? ""}
                                                                                onChange={(val) => setEditingRule({ ...editingRule, discount_value: val })}
                                                                            />
                                                                        ) : (
                                                                            <MoneyInput
                                                                                label="Valor do Desconto"
                                                                                name="discount_value"
                                                                                required
                                                                                placeholder="10.00"
                                                                                value={editingRule.discount_value ?? ""}
                                                                                onChange={(val) => setEditingRule({ ...editingRule, discount_value: val })}
                                                                            />
                                                                        )}
                                                                        <MoneyInput
                                                                            label="Teto de Desconto (Opcional)"
                                                                            name="max_discount_amount"
                                                                            placeholder="50.00"
                                                                            value={editingRule.max_discount_amount ?? ""}
                                                                            onChange={(val) => setEditingRule({ ...editingRule, max_discount_amount: val })}
                                                                        />
                                                                    </div>
                                                                </>
                                                            )}

                                                            {editingRule.promotion_type === "buy_x_pay_y" && (
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                                    <Input
                                                                        label="Leve (Qtd a Comprar)"
                                                                        name="buy_quantity"
                                                                        type="number"
                                                                        min="2"
                                                                        required
                                                                        placeholder="3"
                                                                        value={editingRule.buy_quantity ?? ""}
                                                                        onChange={(e) => setEditingRule({ ...editingRule, buy_quantity: e.target.value === "" ? "" : parseInt(e.target.value) })}
                                                                    />
                                                                    <Input
                                                                        label="Pague (Qtd a Pagar)"
                                                                        name="pay_quantity"
                                                                        type="number"
                                                                        min="1"
                                                                        required
                                                                        placeholder="2"
                                                                        value={editingRule.pay_quantity ?? ""}
                                                                        onChange={(e) => setEditingRule({ ...editingRule, pay_quantity: e.target.value === "" ? "" : parseInt(e.target.value) })}
                                                                    />
                                                                </div>
                                                            )}

                                                            {editingRule.promotion_type === "gift" && (
                                                                <FormSection title="Brinde">
                                                                    <div className="flex flex-col gap-4">
                                                                        <div className="flex justify-end">
                                                                            <Button variant="outline" type="button" onClick={() => setIsGiftSheetOpen(true)} leftIcon={<PlusIcon size={16} />}>
                                                                                Selecionar Brinde
                                                                            </Button>
                                                                        </div>

                                                                        {(() => {
                                                                            const giftProdId = editingRule.gift_product_id
                                                                            const giftServId = editingRule.gift_service_id
                                                                            const selectedGiftProduct = giftProdId ? scopeData.products.find(p => p.id === giftProdId) : null
                                                                            const selectedGiftService = giftServId ? scopeData.services.find(s => s.id === giftServId) : null
                                                                            const selectedItem = selectedGiftProduct || selectedGiftService
                                                                            const giftTypeText = selectedGiftProduct ? "Produto" : selectedGiftService ? "Serviço" : ""

                                                                            if (!selectedItem) {
                                                                                return (
                                                                                    <div className="text-center py-8 border border-dashed border-brand-border dark:border-dark-border rounded-xl bg-gray-50/50 dark:bg-dark-surface/30">
                                                                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum brinde selecionado.</p>
                                                                                    </div>
                                                                                )
                                                                            }

                                                                            return (
                                                                                <div className="border border-brand-border dark:border-dark-border rounded-xl p-4 bg-white dark:bg-dark-surface">
                                                                                    <div className="flex items-center justify-between gap-3">
                                                                                        <div className="flex items-center gap-3 min-w-0">
                                                                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
                                                                                                <img
                                                                                                    src={getR2ImageUrl(selectedItem.image, "thumbnail")}
                                                                                                    alt=""
                                                                                                    className="w-full h-full object-cover"
                                                                                                />
                                                                                            </div>
                                                                                            <div className="min-w-0">
                                                                                                <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{selectedItem.name}</p>
                                                                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                                                                                    {giftTypeText} • {formatCurrency(selectedItem.price || 0)}
                                                                                                </p>
                                                                                            </div>
                                                                                        </div>
                                                                                        <Button
                                                                                            variant="outline"
                                                                                            size="icon"
                                                                                            onClick={() => setEditingRule({
                                                                                                ...editingRule,
                                                                                                gift_product_id: null,
                                                                                                gift_service_id: null
                                                                                            })}
                                                                                            className="text-red-500 hover:text-red-600 hover:bg-red-50 border-0 h-8 w-8 shrink-0"
                                                                                        >
                                                                                            <TrashIcon size={16} />
                                                                                        </Button>
                                                                                    </div>
                                                                                </div>
                                                                            )
                                                                        })()}
                                                                    </div>
                                                                </FormSection>
                                                            )}

                                                            {/* Escopo de Aplicação */}
                                                            <FormDropdown
                                                                label="Escopo de Aplicação"
                                                                value={editingRule.apply_scope || "entire_cart"}
                                                                setValue={(val) => setEditingRule({ ...editingRule, apply_scope: val })}
                                                                options={[
                                                                    { value: "entire_cart", label: "Toda a Sacola" },
                                                                    { value: "specific_products", label: "Produtos Específicos" },
                                                                    { value: "category", label: "Categorias Específicas" },
                                                                    ...(scopeData.services && scopeData.services.length > 0 ? [{ value: "specific_services", label: "Serviços Específicos" }] : [])
                                                                ]}
                                                            />

                                                            {editingRule.apply_scope === "specific_products" && renderSelectedProductsList()}
                                                            {editingRule.apply_scope === "category" && renderSelectedCategoriesList()}
                                                            {editingRule.apply_scope === "specific_services" && renderSelectedServicesList()}
                                                        </FormSection>
                                                    </div>

                                                    {/* Right Column: Rule limits and status */}
                                                    <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                                                        <SidebarCard hasTopStrip={true}>
                                                            <h3 className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-5">Limitações</h3>
                                                            <div className="space-y-4">
                                                                <Input
                                                                    label="Prioridade de Execução"
                                                                    name="priority"
                                                                    type="number"
                                                                    placeholder="0"
                                                                    value={editingRule.priority ?? 0}
                                                                    onChange={(e) => setEditingRule({ ...editingRule, priority: parseInt(e.target.value) || 0 })}
                                                                />
                                                                <MoneyInput
                                                                    label="Mínimo de Compra (R$)"
                                                                    name="min_spend_amount"
                                                                    placeholder="0.00"
                                                                    value={editingRule.min_spend_amount ?? ""}
                                                                    onChange={(val) => setEditingRule({ ...editingRule, min_spend_amount: val })}
                                                                />
                                                                <Input
                                                                    label="Limite Global de Usos"
                                                                    name="usage_limit"
                                                                    type="number"
                                                                    min="0"
                                                                    placeholder="Sem limite"
                                                                    value={editingRule.usage_limit ?? ""}
                                                                    onChange={(e) => setEditingRule({ ...editingRule, usage_limit: e.target.value === "" ? "" : parseInt(e.target.value) })}
                                                                />
                                                                <Input
                                                                    label="Limite de Usos por Cliente"
                                                                    name="usage_limit_per_customer"
                                                                    type="number"
                                                                    min="0"
                                                                    placeholder="Sem limite"
                                                                    value={editingRule.usage_limit_per_customer ?? ""}
                                                                    onChange={(e) => setEditingRule({ ...editingRule, usage_limit_per_customer: e.target.value === "" ? "" : parseInt(e.target.value) })}
                                                                />
                                                            </div>
                                                        </SidebarCard>

                                                        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border mb-6 transition-colors">
                                                            <h3 className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-4">Configuração e Status</h3>
                                                            <div className="space-y-4">
                                                                <Checkbox
                                                                    checked={editingRule.allow_coupon_combination || false}
                                                                    onChange={() => setEditingRule({ ...editingRule, allow_coupon_combination: !editingRule.allow_coupon_combination })}
                                                                    label="Permitir uso combinado com cupons de desconto"
                                                                />
                                                                <Checkbox
                                                                    checked={editingRule.is_active ?? true}
                                                                    onChange={() => setEditingRule({ ...editingRule, is_active: !editingRule.is_active })}
                                                                    label="Regra ativa e disponível"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </FadeIn>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        {isReadOnly ? (
                            <Button
                                onClick={() => setCurrentMode("edit")}
                                className="flex-1 h-12"
                                leftIcon={<EditIcon size={18} />}
                            >
                                Editar
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={onClose}
                                    disabled={isSaving}
                                    className="flex-1 h-12"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleSaveCampaign}
                                    disabled={isSaving}
                                    className="flex-1 h-12"
                                    leftIcon={<SaveIcon size={18} />}
                                >
                                    {isSaving ? "Salvando..." : "Salvar"}
                                </Button>
                            </>
                        )}
                    </div>
                </Tabs >

                {/* Conditional selector sheets */}
                < SelectPromotionProductsSheet
                    isOpen={isProductsSheetOpen}
                    onClose={() => setIsProductsSheetOpen(false)
                    }
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

                < SelectPromotionCategoriesSheet
                    isOpen={isCategoriesSheetOpen}
                    onClose={() => setIsCategoriesSheetOpen(false)}
                    categories={scopeData.categories}
                    serviceCategories={scopeData.serviceCategories || []}
                    selectedIds={editingRuleCategoryIds}
                    onToggle={(id) => {
                        if (editingRuleCategoryIds.includes(id)) {
                            setEditingRuleCategoryIds(editingRuleCategoryIds.filter((cId) => cId !== id))
                        } else {
                            setEditingRuleCategoryIds([...editingRuleCategoryIds, id])
                        }
                    }}
                />

                <SelectPromotionServicesSheet
                    isOpen={isServicesSheetOpen}
                    onClose={() => setIsServicesSheetOpen(false)}
                    services={scopeData.services}
                    selectedIds={editingRuleServiceIds}
                    onToggle={(id) => {
                        if (editingRuleServiceIds.includes(id)) {
                            setEditingRuleServiceIds(editingRuleServiceIds.filter((sId) => sId !== id))
                        } else {
                            setEditingRuleServiceIds([...editingRuleServiceIds, id])
                        }
                    }}
                />

                <SelectPromotionGiftSheet
                    isOpen={isGiftSheetOpen}
                    onClose={() => setIsGiftSheetOpen(false)}
                    products={scopeData.products}
                    services={scopeData.services}
                    selectedId={editingRule?.gift_product_id || editingRule?.gift_service_id || null}
                    onSelect={(id, type) => {
                        setEditingRule({
                            ...editingRule,
                            gift_product_id: type === "product" ? id : null,
                            gift_service_id: type === "service" ? id : null
                        })
                    }}
                />

                <SelectCustomerSheet
                    isOpen={isCustomersSheetOpen}
                    onClose={() => setIsCustomersSheetOpen(false)}
                    partnerId={partnerId}
                    selectedCustomerIds={campCustIds}
                    onSelect={(customer) => {
                        if (campCustIds.includes(customer.id)) {
                            setCampCustIds(campCustIds.filter((cId) => cId !== customer.id))
                        } else {
                            setCampCustIds([...campCustIds, customer.id])
                        }
                    }}
                />

            </div >
        </FadeIn >
    )
}
