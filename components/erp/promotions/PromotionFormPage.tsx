"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { SaveIcon, EditIcon, PlusIcon, TrashIcon, SearchIcon, XIcon, CheckCircleIcon, TagIcon, ArrowUpDownIcon } from "@/lib/icons"
import { Button, Input, Checkbox, Badge, Tabs, TabsList, TabsTrigger, IconPlaceholder, ActionsDropdown, FormDropdown, FormTextarea, FormRadioGroup, DatePicker, FormSection, SelectionBanner, Pagination, Separator } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { useToast } from "@/hooks/use-toast"
import { useSidebar } from "@/lib/sidebar-context"
import {
    createCampaignAction,
    updateCampaignAction,
    createPromotionAction,
    updatePromotionAction,
    deletePromotionAction,
    listPromotionsAction,
} from "@/app/actions/shared/promotions"
import SelectPromotionProductsSheet from "./SelectPromotionProductsSheet"
import SelectPromotionCategoriesSheet from "./SelectPromotionCategoriesSheet"
import SelectPromotionServicesSheet from "./SelectPromotionServicesSheet"
import { Switch } from "@/components/reusable/Switch"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import { ChevronLeftIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { AnimatePresence } from "framer-motion"

const Div = (props: any) => React.createElement("div", props)
const P = (props: any) => React.createElement("p", props)
const Span = (props: any) => React.createElement("span", props)

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
    if (type === "free_shipping") return `${base} - Frete Grátis`;
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
    scopeData: { products: any[]; services: any[]; categories: any[]; customers: any[] }
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

    // Promotions for this campaign (either in DB or temporary in memory)
    const [localPromotions, setLocalPromotions] = useState<any[]>([])

    // Subform Rule State (for adding/editing a promotion inside the tab)
    const [editingRule, setEditingRule] = useState<any | null>(null)

    // Sheet states for selected products/categories/services in the rule subform
    const [editingRuleProductIds, setEditingRuleProductIds] = useState<string[]>([])
    const [editingRuleCategoryIds, setEditingRuleCategoryIds] = useState<string[]>([])
    const [editingRuleServiceIds, setEditingRuleServiceIds] = useState<string[]>([])
    const [isProductsSheetOpen, setIsProductsSheetOpen] = useState(false)
    const [isCategoriesSheetOpen, setIsCategoriesSheetOpen] = useState(false)
    const [isServicesSheetOpen, setIsServicesSheetOpen] = useState(false)

    // Pagination & Search states for selected items lists
    const [scopeSearch, setScopeSearch] = useState("")
    const [scopePage, setScopePage] = useState(1)

    // Rules listing pagination, search & bulk selection states
    const [ruleSearch, setRuleSearch] = useState("")
    const [ruleStatusFilter, setRuleStatusFilter] = useState<"all" | "active" | "inactive">("all")
    const [ruleTypeFilter, setRuleTypeFilter] = useState<"all" | string>("all")
    const [rulePage, setRulePage] = useState(1)
    const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set())
    const [ruleSortConfig, setRuleSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)

    const pageTitle = useMemo(() => {
        return currentMode === "add" ? "Nova Campanha de Marketing"
            : currentMode === "duplicate" ? "Duplicar Campanha"
                : campName || "Campanha"
    }, [currentMode, campName])

    const handleBack = useCallback(() => {
        if (editingRule) {
            setEditingRule(null)
        } else {
            onClose()
        }
    }, [editingRule, onClose])

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
                if (currentMode === "duplicate") {
                    setLocalPromotions(campPromos.map(p => ({
                        ...p,
                        id: `temp_${Math.random()}`,
                        campaign_id: undefined,
                        promotion_products: (p.promotion_products || []).map((prod: any) => prod.product_id || prod),
                        promotion_categories: (p.promotion_categories || []).map((cat: any) => cat.category_id || cat),
                        promotion_services: (p.promotion_services || []).map((serv: any) => serv.service_id || serv),
                    })))
                } else {
                    setLocalPromotions(campPromos)
                }
            } else if (currentMode === "add") {
                setCampName("")
                setCampDesc("")
                setCampScope("all")
                setCampStarts("")
                setCampEnds("")
                setCampActive(true)
                setCampCustIds([])
                setLocalPromotions([])
            }
        }
    }, [currentMode, campaign, promotions])

    // Reset selected lists pagination and search when active scope changes
    useEffect(() => {
        setScopeSearch("")
        setScopePage(1)
    }, [editingRule?.apply_scope, editingRule?.id])

    // Reset bulk selection when filters or campaign rules change
    useEffect(() => {
        setSelectedRuleIds(new Set())
    }, [ruleSearch, ruleStatusFilter, ruleTypeFilter, localPromotions])

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
                        const results = await Promise.all(localPromotions.map(promo => {
                            const generatedName = getAutoPromotionName(
                                campName,
                                promo.promotion_type,
                                promo.discount_type,
                                promo.discount_value,
                                promo.buy_quantity,
                                promo.pay_quantity
                            )
                            const promoPayload = {
                                partnerId,
                                campaignId: newCampaignId,
                                name: generatedName,
                                description: null,
                                promotionType: promo.promotion_type,
                                discountType: promo.promotion_type === "discount" ? promo.discount_type : null,
                                discountValue: promo.promotion_type === "discount" ? parseNumberField(promo.discount_value) : null,
                                maxDiscountAmount: parseNumberField(promo.max_discount_amount),
                                minSpendAmount: parseNumberField(promo.min_spend_amount),
                                giftProductId: promo.promotion_type === "gift" ? promo.gift_product_id : null,
                                buyQuantity: promo.promotion_type === "buy_x_pay_y" ? parseNumberField(promo.buy_quantity) : null,
                                payQuantity: promo.promotion_type === "buy_x_pay_y" ? parseNumberField(promo.pay_quantity) : null,
                                priority: Number(promo.priority || 0),
                                applyScope: promo.apply_scope,
                                allowCouponCombination: !!promo.allow_coupon_combination,
                                usageLimit: parseNumberField(promo.usage_limit),
                                usageLimitPerCustomer: parseNumberField(promo.usage_limit_per_customer),
                                isActive: promo.is_active ?? true,
                                productIds: promo.apply_scope === "specific_products" ? (promo.promotion_products || []) : [],
                                categoryIds: promo.apply_scope === "category" ? (promo.promotion_categories || []) : [],
                                serviceIds: promo.apply_scope === "specific_services" ? (promo.promotion_services || []) : [],
                            }
                            return createPromotionAction(promoPayload)
                        }))

                        const failures = results.filter(r => !r.success)
                        if (failures.length > 0) {
                            console.error("Failed to save some promotion rules:", failures)
                            toast({
                                title: "Campanha criada, mas algumas regras falharam ao salvar.",
                                description: failures.map(f => f.error).join(", "),
                                variant: "destructive"
                            })
                        } else {
                            toast({ title: "Campanha e regras salvas com sucesso." })
                        }
                    } else {
                        toast({ title: "Campanha salva com sucesso." })
                    }
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

        const generatedName = getAutoPromotionName(
            campName,
            editingRule.promotion_type,
            editingRule.discount_type,
            editingRule.discount_value,
            editingRule.buy_quantity,
            editingRule.pay_quantity
        )

        const ruleData = {
            ...editingRule,
            name: generatedName,
            description: null,
            promotion_products: editingRuleProductIds,
            promotion_categories: editingRuleCategoryIds,
            promotion_services: editingRuleServiceIds,
        }

        if (currentMode === "edit") {
            // Direct Save to DB
            setIsSaving(true)
            const payload = {
                partnerId,
                campaignId: campaign.id,
                name: ruleData.name,
                description: null,
                promotionType: ruleData.promotion_type,
                discountType: ruleData.promotion_type === "discount" ? ruleData.discount_type : null,
                discountValue: ruleData.promotion_type === "discount" ? parseNumberField(ruleData.discount_value) : null,
                maxDiscountAmount: parseNumberField(ruleData.max_discount_amount),
                minSpendAmount: parseNumberField(ruleData.min_spend_amount),
                giftProductId: ruleData.promotion_type === "gift" ? ruleData.gift_product_id : null,
                buyQuantity: ruleData.promotion_type === "buy_x_pay_y" ? parseNumberField(ruleData.buy_quantity) : null,
                payQuantity: ruleData.promotion_type === "buy_x_pay_y" ? parseNumberField(ruleData.pay_quantity) : null,
                priority: Number(ruleData.priority || 0),
                applyScope: ruleData.apply_scope,
                allowCouponCombination: !!ruleData.allow_coupon_combination,
                usageLimit: parseNumberField(ruleData.usage_limit),
                usageLimitPerCustomer: parseNumberField(ruleData.usage_limit_per_customer),
                isActive: ruleData.is_active ?? true,
                productIds: editingRuleProductIds,
                categoryIds: editingRuleCategoryIds,
                serviceIds: editingRuleServiceIds,
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

    const handleToggleRuleStatus = async (id: string, active: boolean) => {
        setIsSaving(true)
        try {
            if (currentMode === "edit") {
                const promo = localPromotions.find(p => p.id === id)
                if (promo && !id.startsWith("temp_")) {
                    const payload = {
                        partnerId,
                        campaignId: campaign.id,
                        name: promo.name,
                        description: promo.description,
                        promotionType: promo.promotion_type,
                        discountType: promo.discount_type,
                        discountValue: parseNumberField(promo.discount_value),
                        maxDiscountAmount: parseNumberField(promo.max_discount_amount),
                        minSpendAmount: parseNumberField(promo.min_spend_amount),
                        giftProductId: promo.gift_product_id,
                        buyQuantity: parseNumberField(promo.buy_quantity),
                        payQuantity: parseNumberField(promo.buy_quantity) && parseNumberField(promo.pay_quantity),
                        priority: Number(promo.priority || 0),
                        applyScope: promo.apply_scope,
                        allowCouponCombination: !!promo.allow_coupon_combination,
                        usageLimit: parseNumberField(promo.usage_limit),
                        usageLimitPerCustomer: parseNumberField(promo.usage_limit_per_customer),
                        isActive: active,
                        productIds: (promo.promotion_products || []).map((p: any) => p.product_id || p),
                        categoryIds: (promo.promotion_categories || []).map((c: any) => c.category_id || c),
                        serviceIds: (promo.promotion_services || []).map((s: any) => s.service_id || s),
                    }
                    const res = await updatePromotionAction(id, payload)
                    if (res.success) {
                        toast({ title: "Status da regra atualizado com sucesso." })
                    } else {
                        toast({ title: "Erro ao atualizar status.", description: res.error, variant: "destructive" })
                    }
                    const listRes = await listPromotionsAction(partnerId, campaign.id)
                    if (listRes.success) {
                        setLocalPromotions(listRes.data || [])
                    }
                }
            } else {
                setLocalPromotions(localPromotions.map(promo =>
                    promo.id === id ? { ...promo, is_active: active } : promo
                ))
                toast({ title: "Status da regra atualizado localmente." })
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
        return selectedProducts.filter(p =>
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
        return scopeData.categories.filter(c => editingRuleCategoryIds.includes(c.id))
    }, [scopeData.categories, editingRuleCategoryIds])

    const filteredSelectedCategories = useMemo(() => {
        const term = scopeSearch.toLowerCase().trim()
        if (!term) return selectedCategories
        return selectedCategories.filter(c => c.name.toLowerCase().includes(term))
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
        return selectedServices.filter(s =>
            s.name.toLowerCase().includes(term) ||
            (s.sku && s.sku.toLowerCase().includes(term))
        )
    }, [selectedServices, scopeSearch])

    const paginatedSelectedServices = useMemo(() => {
        const start = (scopePage - 1) * 5
        return filteredSelectedServices.slice(start, start + 5)
    }, [filteredSelectedServices, scopePage])

    const totalServicePages = Math.ceil(filteredSelectedServices.length / 5)

    // Rules filtering & pagination logic
    const filteredRules = useMemo(() => {
        const list = localPromotions.filter(promo => {
            const term = ruleSearch.toLowerCase().trim()
            if (term) {
                const nameMatch = promo.name?.toLowerCase().includes(term)
                const descMatch = promo.description?.toLowerCase().includes(term)
                if (!nameMatch && !descMatch) return false
            }
            if (ruleStatusFilter === "active" && !promo.is_active) return false
            if (ruleStatusFilter === "inactive" && promo.is_active) return false
            if (ruleTypeFilter !== "all" && promo.promotion_type !== ruleTypeFilter) return false
            return true
        })

        if (ruleSortConfig) {
            list.sort((a, b) => {
                let aVal = a[ruleSortConfig.key]
                let bVal = b[ruleSortConfig.key]

                if (ruleSortConfig.key === "priority") {
                    aVal = Number(aVal) || 0
                    bVal = Number(bVal) || 0
                } else if (ruleSortConfig.key === "is_active") {
                    aVal = aVal ? 1 : 0
                    bVal = bVal ? 1 : 0
                } else {
                    aVal = String(aVal || "").toLowerCase()
                    bVal = String(bVal || "").toLowerCase()
                }

                if (aVal === bVal) return 0
                const comp = aVal < bVal ? -1 : 1
                return ruleSortConfig.direction === "asc" ? comp : -comp
            })
        }

        return list
    }, [localPromotions, ruleSearch, ruleStatusFilter, ruleTypeFilter, ruleSortConfig])

    const handleSortRule = (key: string) => {
        setRuleSortConfig(prev => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "asc" }
        })
    }

    const rulesPerPage = 8
    const paginatedRules = useMemo(() => {
        const start = (rulePage - 1) * rulesPerPage
        return filteredRules.slice(start, start + rulesPerPage)
    }, [filteredRules, rulePage])

    const totalRulePages = Math.ceil(filteredRules.length / rulesPerPage)

    const handleSelectAllRules = (checked: boolean) => {
        if (checked) {
            setSelectedRuleIds(new Set(paginatedRules.map(r => r.id)))
        } else {
            setSelectedRuleIds(new Set())
        }
    }

    const handleSelectRuleRow = (id: string) => {
        setSelectedRuleIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const handleBulkToggleStatus = async (activate: boolean) => {
        const ids = Array.from(selectedRuleIds)
        if (ids.length === 0) return

        setIsSaving(true)
        try {
            if (currentMode === "edit") {
                let hasError = false
                let lastError = ""
                for (const id of ids) {
                    const promo = localPromotions.find(p => p.id === id)
                    if (promo && !id.startsWith("temp_")) {
                        const payload = {
                            partnerId,
                            campaignId: campaign.id,
                            name: promo.name,
                            description: promo.description,
                            promotionType: promo.promotion_type,
                            discountType: promo.discount_type,
                            discountValue: parseNumberField(promo.discount_value),
                            maxDiscountAmount: parseNumberField(promo.max_discount_amount),
                            minSpendAmount: parseNumberField(promo.min_spend_amount),
                            giftProductId: promo.gift_product_id,
                            buyQuantity: parseNumberField(promo.buy_quantity),
                            payQuantity: parseNumberField(promo.pay_quantity),
                            priority: Number(promo.priority || 0),
                            applyScope: promo.apply_scope,
                            allowCouponCombination: !!promo.allow_coupon_combination,
                            usageLimit: parseNumberField(promo.usage_limit),
                            usageLimitPerCustomer: parseNumberField(promo.usage_limit_per_customer),
                            isActive: activate,
                            productIds: (promo.promotion_products || []).map((p: any) => p.product_id || p),
                            categoryIds: (promo.promotion_categories || []).map((c: any) => c.category_id || c),
                            serviceIds: (promo.promotion_services || []).map((s: any) => s.service_id || s),
                        }
                        const res = await updatePromotionAction(id, payload)
                        if (!res.success) {
                            hasError = true
                            lastError = res.error || ""
                        }
                    }
                }
                if (hasError) {
                    toast({ title: "Erro ao atualizar status de algumas regras.", description: lastError, variant: "destructive" })
                } else {
                    toast({ title: `Regras ${activate ? "ativadas" : "desativadas"} com sucesso.` })
                }
                const listRes = await listPromotionsAction(partnerId, campaign.id)
                if (listRes.success) {
                    setLocalPromotions(listRes.data || [])
                }
            } else {
                setLocalPromotions(localPromotions.map(promo =>
                    ids.includes(promo.id) ? { ...promo, is_active: activate } : promo
                ))
                toast({ title: `Regras ${activate ? "ativadas" : "desativadas"} localmente.` })
            }
            setSelectedRuleIds(new Set())
        } catch (err: any) {
            console.error(err)
            toast({ title: "Erro inesperado.", description: err.message, variant: "destructive" })
        } finally {
            setIsSaving(false)
        }
    }

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedRuleIds)
        if (ids.length === 0) return
        if (!confirm(`Deseja excluir as ${ids.length} regras selecionadas?`)) return

        setIsSaving(true)
        try {
            if (currentMode === "edit") {
                let hasError = false
                let lastError = ""
                for (const id of ids) {
                    if (!id.startsWith("temp_")) {
                        const res = await deletePromotionAction(partnerId, id)
                        if (!res.success) {
                            hasError = true
                            lastError = res.error || ""
                        }
                    }
                }
                if (hasError) {
                    toast({ title: "Algumas regras não puderam ser excluídas.", description: lastError, variant: "destructive" })
                } else {
                    toast({ title: "Regras excluídas com sucesso." })
                }
                const listRes = await listPromotionsAction(partnerId, campaign.id)
                if (listRes.success) {
                    setLocalPromotions(listRes.data || [])
                }
            } else {
                setLocalPromotions(localPromotions.filter(p => !ids.includes(p.id)))
                toast({ title: "Regras excluídas localmente." })
            }
            setSelectedRuleIds(new Set())
        } catch (err: any) {
            console.error(err)
            toast({ title: "Erro inesperado.", description: err.message, variant: "destructive" })
        } finally {
            setIsSaving(false)
        }
    }

    const SidebarCard = ({ children, className = "", hasTopStrip = false }: { children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
        <div className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
            {hasTopStrip && <div className="absolute top-0 left-0 w-full h-[3px] bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
            {children}
        </div>
    )

    const renderSelectedProductsList = () => {
        return (
            <FormSection title="Produtos Específicos Elegíveis">
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
                        <Button variant="outline" type="button" onClick={() => setIsProductsSheetOpen(true)} leftIcon={<PlusIcon size={16} />}>
                            Selecionar Produtos
                        </Button>
                    </div>

                    {filteredSelectedProducts.length > 0 ? (
                        <>
                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-hidden rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border">
                                            <th className="p-3 pl-6 font-semibold text-gray-500 dark:text-dark-body">Produto</th>
                                            <th className="p-3 font-semibold text-gray-500 dark:text-dark-body">SKU</th>
                                            <th className="p-3 font-semibold text-gray-500 dark:text-dark-body">Categoria</th>
                                            <th className="p-3 font-semibold text-gray-500 dark:text-dark-body">Preço</th>
                                            <th className="p-3 font-semibold text-gray-500 dark:text-dark-body text-center pr-6 w-20">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedSelectedProducts.map((prod) => (
                                            <tr key={prod.id} className="border-b border-brand-border dark:border-dark-border last:border-0 hover:bg-brand-gray/35 dark:hover:bg-dark-border/20 transition-colors">
                                                <td className="p-3 pl-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
                                                            <img
                                                                src={prod.image || "https://img.dudit.com.br/static/placeholder.png"}
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
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() => setEditingRuleProductIds(editingRuleProductIds.filter(id => id !== prod.id))}
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
                                {paginatedSelectedProducts.map((prod, idx) => (
                                    <React.Fragment key={prod.id}>
                                        {idx > 0 && <Separator className="my-2" />}
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
                                                    <img
                                                        src={prod.image || "https://img.dudit.com.br/static/placeholder.png"}
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
                        <div className="text-center py-8 border border-dashed border-brand-border dark:border-dark-border rounded-xl bg-gray-50/50 dark:bg-dark-surface/30">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum produto selecionado ou correspondente à busca.</p>
                        </div>
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
                        <Button variant="outline" type="button" onClick={() => setIsCategoriesSheetOpen(true)} leftIcon={<PlusIcon size={16} />}>
                            Selecionar Categorias
                        </Button>
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
                        <div className="text-center py-8 border border-dashed border-brand-border dark:border-dark-border rounded-xl bg-gray-50/50 dark:bg-dark-surface/30">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhuma categoria selecionada ou correspondente à busca.</p>
                        </div>
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
                        <Button variant="outline" type="button" onClick={() => setIsServicesSheetOpen(true)} leftIcon={<PlusIcon size={16} />}>
                            Selecionar Serviços
                        </Button>
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
                                                                src={serv.image || "https://img.dudit.com.br/static/placeholder.png"}
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
                                                        src={serv.image || "https://img.dudit.com.br/static/placeholder.png"}
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
                        <div className="text-center py-8 border border-dashed border-brand-border dark:border-dark-border rounded-xl bg-gray-50/50 dark:bg-dark-surface/30">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum serviço selecionado ou correspondente à busca.</p>
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
                        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
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
                                        <TabsTrigger value="rules">Regras de promoção ({localPromotions.length})</TabsTrigger>
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

                                                    {campScope === "specific" && (
                                                        <div className="border border-brand-border dark:border-dark-border p-4 rounded-xl space-y-3 bg-white dark:bg-dark-surface">
                                                            <label className="text-xs font-bold uppercase text-brand-inactive-text">Selecionar Clientes elegíveis</label>
                                                            <input
                                                                type="text"
                                                                placeholder="Filtrar clientes por nome ou email..."
                                                                value={custSearch}
                                                                onChange={(e) => setCustSearch(e.target.value)}
                                                                disabled={isReadOnly}
                                                                className="w-full bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg py-2.5 px-4 text-sm focus:ring-brand-green focus:border-brand-green dark:focus:ring-brand-green dark:focus:border-brand-green focus:outline-none text-brand-dark dark:text-dark-heading placeholder:text-brand-dark/70 dark:placeholder:text-dark-heading/70 transition-colors disabled:bg-brand-gray dark:disabled:bg-dark-border/30"
                                                            />
                                                            <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                                                {filteredCustomers.map((cust) => {
                                                                    const isChecked = campCustIds.includes(cust.id)
                                                                    return (
                                                                        <label key={cust.id} className="flex items-center gap-3 text-sm p-1.5 hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 rounded cursor-pointer transition-colors">
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
                                                                                className="text-brand-green focus:ring-brand-green border-brand-border dark:border-dark-border rounded"
                                                                            />
                                                                            <div>
                                                                                <p className="font-semibold text-brand-dark dark:text-dark-heading">{cust.name}</p>
                                                                                {cust.email && <p className="text-xs text-brand-inactive-text dark:text-dark-body">{cust.email}</p>}
                                                                            </div>
                                                                        </label>
                                                                    )
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
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
                                            {editingRule ? (
                                                /* Rule Sub-Form in Two Columns */
                                                <form onSubmit={handleSaveRule} className="grid grid-cols-12 gap-y-8 lg:gap-y-0 animate-fadeIn">

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
                                                                    { value: "gift", label: "Ganhar Brinde (Freebie)" },
                                                                    { value: "free_shipping", label: "Frete Grátis" }
                                                                ]}
                                                            />

                                                            {/* Conditional configurations based on promotion type */}
                                                            {editingRule.promotion_type === "discount" && (
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
                                                                    <Input
                                                                        label="Valor do Desconto"
                                                                        name="discount_value"
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0.01"
                                                                        required
                                                                        placeholder="10"
                                                                        value={editingRule.discount_value ?? ""}
                                                                        onChange={(e) => setEditingRule({ ...editingRule, discount_value: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                                                                    />
                                                                    <Input
                                                                        label="Teto de Desconto (Opcional)"
                                                                        name="max_discount_amount"
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        placeholder="Ex: 50.00"
                                                                        value={editingRule.max_discount_amount ?? ""}
                                                                        onChange={(e) => setEditingRule({ ...editingRule, max_discount_amount: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                                                                    />
                                                                </div>
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
                                                                <FormDropdown
                                                                    label="Selecione o Brinde"
                                                                    value={editingRule.gift_product_id || ""}
                                                                    setValue={(val) => setEditingRule({ ...editingRule, gift_product_id: val })}
                                                                    options={[
                                                                        { value: "", label: "Escolha o produto que será entregue de brinde..." },
                                                                        ...scopeData.products.map(p => ({ value: p.id, label: `${p.name} (${formatCurrency(p.price)})` }))
                                                                    ]}
                                                                />
                                                            )}

                                                            {/* Escopo de Aplicação */}
                                                            <FormDropdown
                                                                label="Escopo de Aplicação"
                                                                value={editingRule.apply_scope || "entire_cart"}
                                                                setValue={(val) => setEditingRule({ ...editingRule, apply_scope: val })}
                                                                options={[
                                                                    { value: "entire_cart", label: "Todo o Carrinho" },
                                                                    { value: "specific_products", label: "Produtos Específicos" },
                                                                    { value: "category", label: "Categorias Específicas" },
                                                                    ...(scopeData.services && scopeData.services.length > 0 ? [{ value: "specific_services", label: "Serviços Específicos" }] : [])
                                                                ]}
                                                            />

                                                            {editingRule.apply_scope === "specific_products" && renderSelectedProductsList()}
                                                            {editingRule.apply_scope === "category" && renderSelectedCategoriesList()}
                                                            {editingRule.apply_scope === "specific_services" && renderSelectedServicesList()}
                                                        </FormSection>

                                                        {/* Right Column: Rule limits and status */}
                                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                                                            <h3 className="hidden lg:block text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 pb-2 border-b border-transparent invisible">
                                                                Limitações e Status
                                                            </h3>

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
                                                                    <Input
                                                                        label="Mínimo de Compra (R$)"
                                                                        name="min_spend_amount"
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        placeholder="0.00"
                                                                        value={editingRule.min_spend_amount ?? ""}
                                                                        onChange={(e) => setEditingRule({ ...editingRule, min_spend_amount: e.target.value === "" ? "" : parseFloat(e.target.value) })}
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

                                                            {/* Desktop sub-form Actions */}
                                                            <div className="hidden md:flex items-center justify-end gap-3 border-t border-brand-border dark:border-dark-border pt-4">
                                                                <Button variant="outline" type="button" onClick={() => setEditingRule(null)}>
                                                                    Voltar para lista
                                                                </Button>
                                                                <Button variant="filled" type="submit" disabled={isSaving}>
                                                                    Salvar Regra
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </form>
                                            ) : (
                                                /* Redesigned Rules List View */
                                                <div className="space-y-4">
                                                    {localPromotions.length === 0 ? (
                                                        <div className="space-y-6">
                                                            <div className="flex flex-col items-center justify-center text-center py-12 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                                                                <IconPlaceholder
                                                                    icon={TagIcon}
                                                                    title="Não há regras de promoção"
                                                                    subtitle="Adicione descontos, brindes ou frete grátis a esta campanha."
                                                                    itemButton={!isReadOnly ? {
                                                                        text: "Adicionar regra",
                                                                        action: () => setEditingRule({ is_active: true, priority: 0, promotion_type: 'discount', discount_type: 'percentage', apply_scope: 'entire_cart' }),
                                                                        variant: "outline"
                                                                    } : undefined}
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="max-w-[1300px] mx-auto pb-20 relative">
                                                            {/* Header Section */}
                                                            <div className="flex justify-between items-center mb-4">
                                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                                                    Regras de Promoção ({filteredRules.length})
                                                                </h3>
                                                                {!isReadOnly && (
                                                                    <Button variant="link" onClick={() => setEditingRule({ is_active: true, priority: 0, promotion_type: 'discount', discount_type: 'percentage', apply_scope: 'entire_cart' })} className="flex items-center hidden md:flex">
                                                                        + Nova Regra
                                                                    </Button>
                                                                )}
                                                            </div>

                                                            {/* Search & Actions Control Bar */}
                                                            {/* Mobile Header Row */}
                                                            <div className="md:hidden flex flex-col gap-2 w-full mb-4">
                                                                <div className="flex items-center gap-2 w-full">
                                                                    <div className="flex-1 min-w-0">
                                                                        <Input
                                                                            name="ruleSearch"
                                                                            placeholder="Buscar regras..."
                                                                            value={ruleSearch}
                                                                            onChange={(e) => {
                                                                                setRuleSearch(e.target.value)
                                                                                setRulePage(1)
                                                                            }}
                                                                            className="h-[42px] w-full"
                                                                            variant="full-rounded"
                                                                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                                                                        />
                                                                    </div>
                                                                    {!isReadOnly && (
                                                                        <div className="flex-none">
                                                                            <Button
                                                                                onClick={() => setEditingRule({ is_active: true, priority: 0, promotion_type: 'discount', discount_type: 'percentage', apply_scope: 'entire_cart' })}
                                                                                className="w-[42px] h-[42px] p-0 flex items-center justify-center rounded-full bg-brand-green hover:bg-brand-green/90 text-white shadow-sm"
                                                                            >
                                                                                <PlusIcon className="w-5 h-5" strokeWidth={3} />
                                                                            </Button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <div className="flex-1">
                                                                        <FormDropdown
                                                                            label=""
                                                                            value={ruleStatusFilter}
                                                                            setValue={(val) => {
                                                                                setRuleStatusFilter(val as any)
                                                                                setRulePage(1)
                                                                            }}
                                                                            options={[
                                                                                { value: "all", label: "Todos os status" },
                                                                                { value: "active", label: "Ativos" },
                                                                                { value: "inactive", label: "Inativos" }
                                                                            ]}
                                                                        />
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <FormDropdown
                                                                            label=""
                                                                            value={ruleTypeFilter}
                                                                            setValue={(val) => {
                                                                                setRuleTypeFilter(val)
                                                                                setRulePage(1)
                                                                            }}
                                                                            options={[
                                                                                { value: "all", label: "Todos os tipos" },
                                                                                { value: "discount", label: "Desconto Direto" },
                                                                                { value: "buy_x_pay_y", label: "Leve X Pague Y" },
                                                                                { value: "gift", label: "Ganhar Brinde" },
                                                                                { value: "free_shipping", label: "Frete Grátis" }
                                                                            ]}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Desktop Search Bar */}
                                                            <div className="hidden md:flex items-center w-full gap-4 mb-4">
                                                                <div className="w-80">
                                                                    <Input
                                                                        name="ruleSearch"
                                                                        placeholder="Buscar regras..."
                                                                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                                                        value={ruleSearch}
                                                                        onChange={(e) => {
                                                                            setRuleSearch(e.target.value)
                                                                            setRulePage(1)
                                                                        }}
                                                                        className="h-[42px]"
                                                                        variant="full-rounded"
                                                                    />
                                                                </div>
                                                                <div className="w-48">
                                                                    <FormDropdown
                                                                        label=""
                                                                        value={ruleStatusFilter}
                                                                        setValue={(val) => {
                                                                            setRuleStatusFilter(val as any)
                                                                            setRulePage(1)
                                                                        }}
                                                                        options={[
                                                                            { value: "all", label: "Todos os status" },
                                                                            { value: "active", label: "Ativos" },
                                                                            { value: "inactive", label: "Inativos" }
                                                                        ]}
                                                                    />
                                                                </div>
                                                                <div className="w-52">
                                                                    <FormDropdown
                                                                        label=""
                                                                        value={ruleTypeFilter}
                                                                        setValue={(val) => {
                                                                            setRuleTypeFilter(val)
                                                                            setRulePage(1)
                                                                        }}
                                                                        options={[
                                                                            { value: "all", label: "Todos os tipos" },
                                                                            { value: "discount", label: "Desconto Direto" },
                                                                            { value: "buy_x_pay_y", label: "Leve X Pague Y" },
                                                                            { value: "gift", label: "Ganhar Brinde" },
                                                                            { value: "free_shipping", label: "Frete Grátis" }
                                                                        ]}
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Selection Banner */}
                                                            <SelectionBanner
                                                                selectedCount={selectedRuleIds.size}
                                                                totalCount={filteredRules.length}
                                                                onSelectAll={() => setSelectedRuleIds(new Set(filteredRules.map(v => v.id)))}
                                                                onClearSelection={() => setSelectedRuleIds(new Set())}
                                                                itemName="regras"
                                                                singularItemName="regra"
                                                            />

                                                            {/* Table / Grid Container */}
                                                            <div className="w-full bg-white dark:bg-dark-surface rounded-xl border border-transparent dark:border-dark-border/20 overflow-hidden">
                                                                {/* Mobile Layout */}
                                                                <div className="md:hidden divide-y divide-brand-border dark:divide-dark-border">
                                                                    {paginatedRules.map((promo, idx) => (
                                                                        <div key={promo.id} className="p-4 flex items-center gap-3">
                                                                            {!isReadOnly && (
                                                                                <div className="shrink-0">
                                                                                    <Checkbox
                                                                                        checked={selectedRuleIds.has(promo.id)}
                                                                                        onChange={() => handleSelectRuleRow(promo.id)}
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                <TagIcon size={18} className="text-brand-primary" />
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <span className="block truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                                    {promo.promotion_type === "gift" && "Ganhar Brinde"}
                                                                                    {promo.promotion_type === "buy_x_pay_y" && `Leve ${promo.buy_quantity} Pague ${promo.pay_quantity}`}
                                                                                    {promo.promotion_type === "discount" && (
                                                                                        promo.discount_type === "percentage" ? `${promo.discount_value}% Desconto` : `${formatCurrency(promo.discount_value)} Desconto`
                                                                                    )}
                                                                                    {promo.promotion_type === "free_shipping" && "Frete Grátis"}
                                                                                </span>
                                                                                <span className="block text-xs font-semibold text-brand-primary dark:text-dark-body truncate">
                                                                                    {promo.name || "Regra sem nome"} • Prioridade {promo.priority || 0}
                                                                                </span>
                                                                                <span className="block text-[11px] text-brand-inactive-text dark:text-dark-body truncate">
                                                                                    Escopo: {promo.apply_scope === "entire_cart" && "Todo o Carrinho"}
                                                                                    {promo.apply_scope === "specific_products" && "Produtos Específicos"}
                                                                                    {promo.apply_scope === "category" && "Categorias Específicas"}
                                                                                    {promo.apply_scope === "specific_services" && "Serviços Específicos"}
                                                                                </span>
                                                                            </div>
                                                                            <div className="shrink-0 flex items-center gap-2">
                                                                                {!isReadOnly && (
                                                                                    <ActionsDropdown
                                                                                        onEdit={() => setEditingRule(promo)}
                                                                                        onDelete={() => handleDeleteRule(promo)}
                                                                                    />
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                {/* Desktop Table View */}
                                                                <div className="hidden md:block">
                                                                    <table className="w-full text-left border-separate border-spacing-0">
                                                                        <thead>
                                                                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                                {!isReadOnly && (
                                                                                    <th className="py-3 px-6 w-12 bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border sticky left-0 z-20">
                                                                                        <Checkbox
                                                                                            checked={selectedRuleIds.size === paginatedRules.length && paginatedRules.length > 0}
                                                                                            onChange={handleSelectAllRules}
                                                                                            className="bg-white dark:bg-dark-background"
                                                                                        />
                                                                                    </th>
                                                                                )}
                                                                                <th className="py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSortRule("promotion_type")}>
                                                                                    <div className="flex items-center gap-1">
                                                                                        <span>Regra</span>
                                                                                        <ArrowUpDownIcon className="w-3.5 h-3.5" />
                                                                                    </div>
                                                                                </th>
                                                                                <th className="py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSortRule("apply_scope")}>
                                                                                    <div className="flex items-center gap-1">
                                                                                        <span>Escopo</span>
                                                                                        <ArrowUpDownIcon className="w-3.5 h-3.5" />
                                                                                    </div>
                                                                                </th>
                                                                                <th className="py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border cursor-pointer hover:bg-gray-200 transition-colors text-center" onClick={() => handleSortRule("priority")}>
                                                                                    <div className="flex items-center justify-center gap-1">
                                                                                        <span>Prioridade</span>
                                                                                        <ArrowUpDownIcon className="w-3.5 h-3.5" />
                                                                                    </div>
                                                                                </th>
                                                                                <th className="py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border cursor-pointer hover:bg-gray-200 transition-colors text-center" onClick={() => handleSortRule("is_active")}>
                                                                                    <div className="flex items-center justify-center gap-1">
                                                                                        <span>Status</span>
                                                                                        <ArrowUpDownIcon className="w-3.5 h-3.5" />
                                                                                    </div>
                                                                                </th>
                                                                                {!isReadOnly && (
                                                                                    <th className="py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border text-center w-28">
                                                                                        Ações
                                                                                    </th>
                                                                                )}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {paginatedRules.map((promo) => (
                                                                                <tr key={promo.id} className="group hover:bg-brand-gray/30 transition-colors bg-white dark:bg-dark-background border-b border-brand-border last:border-0">
                                                                                    {!isReadOnly && (
                                                                                        <td className="py-4 px-6 border-b border-brand-border w-12">
                                                                                            <Checkbox
                                                                                                checked={selectedRuleIds.has(promo.id)}
                                                                                                onChange={() => handleSelectRuleRow(promo.id)}
                                                                                            />
                                                                                        </td>
                                                                                    )}
                                                                                    <td className="py-4 px-6 border-b border-brand-border">
                                                                                        <div className="flex items-center gap-3">
                                                                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                                <TagIcon size={18} className="text-brand-primary" />
                                                                                            </div>
                                                                                            <div className="flex flex-col text-left">
                                                                                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5">
                                                                                                    {promo.promotion_type === "gift" && "Ganhar Brinde"}
                                                                                                    {promo.promotion_type === "buy_x_pay_y" && `Leve ${promo.buy_quantity} Pague ${promo.pay_quantity}`}
                                                                                                    {promo.promotion_type === "discount" && (
                                                                                                        promo.discount_type === "percentage" ? `${promo.discount_value}% de Desconto` : `${formatCurrency(promo.discount_value)} de Desconto`
                                                                                                    )}
                                                                                                    {promo.promotion_type === "free_shipping" && "Frete Grátis"}
                                                                                                </span>
                                                                                                <span className="text-xs text-brand-inactive-text">
                                                                                                    {promo.name || "Regra sem nome"}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="py-4 px-6 border-b border-brand-border">
                                                                                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                                                            {promo.apply_scope === "entire_cart" && "Todo o Carrinho"}
                                                                                            {promo.apply_scope === "specific_products" && "Produtos Específicos"}
                                                                                            {promo.apply_scope === "category" && "Categorias Específicas"}
                                                                                            {promo.apply_scope === "specific_services" && "Serviços Específicos"}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="py-4 px-6 border-b border-brand-border text-center">
                                                                                        <Badge variant="blue">{promo.priority || 0}</Badge>
                                                                                    </td>
                                                                                    <td className="py-4 px-6 border-b border-brand-border text-center">
                                                                                        <div className="flex justify-center">
                                                                                            {isReadOnly ? (
                                                                                                <Badge variant={promo.is_active ? "green" : "gray"}>
                                                                                                    {promo.is_active ? "Ativo" : "Inativo"}
                                                                                                </Badge>
                                                                                            ) : (
                                                                                                <Switch
                                                                                                    checked={!!promo.is_active}
                                                                                                    onCheckedChange={(checked) => !isSaving && handleToggleRuleStatus(promo.id, checked)}
                                                                                                    className={isSaving ? "opacity-50 pointer-events-none" : ""}
                                                                                                />
                                                                                            )}
                                                                                        </div>
                                                                                    </td>
                                                                                    {!isReadOnly && (
                                                                                        <td className="py-4 px-6 border-b border-brand-border text-center">
                                                                                            <div className="flex justify-center">
                                                                                                <ActionsDropdown
                                                                                                    onEdit={() => setEditingRule(promo)}
                                                                                                    onDelete={() => handleDeleteRule(promo)}
                                                                                                />
                                                                                            </div>
                                                                                        </td>
                                                                                    )}
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>

                                                            {/* Pagination */}
                                                            {totalRulePages > 1 && (
                                                                <div className="flex justify-center pt-4">
                                                                    <Pagination
                                                                        currentPage={rulePage}
                                                                        totalPages={totalRulePages}
                                                                        onPageChange={setRulePage}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
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
                        {editingRule ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => setEditingRule(null)}
                                    disabled={isSaving}
                                    className="flex-1 h-12"
                                >
                                    Voltar
                                </Button>
                                <Button
                                    onClick={handleSaveRule}
                                    disabled={isSaving}
                                    className="flex-1 h-12"
                                    leftIcon={<SaveIcon size={16} />}
                                >
                                    Salvar Regra
                                </Button>
                            </>
                        ) : isReadOnly ? (
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

                {!isReadOnly && (
                    <FloatingActionBar
                        selectedCount={selectedRuleIds.size}
                        onClearSelection={() => setSelectedRuleIds(new Set())}
                    >
                        <Button
                            variant="ghost"
                            onClick={() => handleBulkToggleStatus(
                                !localPromotions.filter(p => selectedRuleIds.has(p.id)).every(p => p.is_active)
                            )}
                            leftIcon={<CheckCircleIcon className="w-4 h-4" />}
                            className="h-10 px-3"
                        >
                            {localPromotions.filter(p => selectedRuleIds.has(p.id)).every(p => p.is_active) ? "Desativar" : "Ativar"}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={handleBulkDelete}
                            leftIcon={<TrashIcon className="w-4 h-4" />}
                            className="h-10 px-3 text-brand-red"
                        >
                            Excluir
                        </Button>
                    </FloatingActionBar>
                )}
            </div >
        </FadeIn >
    )
}
