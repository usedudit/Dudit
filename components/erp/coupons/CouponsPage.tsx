"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import { Button, Checkbox, IconPlaceholder, ThreeDotsLoader, AlertModal } from "@/components/reusable"
import { ArrowUpDownIcon, ExportFileIcon, PlusIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { useToast } from "@/hooks/use-toast"
import {
    createCouponAction,
    deleteCouponAction,
    getCouponCustomersAction,
    getCouponLinkedItemsAction,
    getCouponScopeDataAction,
    listCouponsAction,
    toggleCouponStatusAction,
    updateCouponAction,
} from "@/app/actions/shared/coupons"
import CouponPageControls from "./CouponPageControls"
import CouponGridCard from "./CouponGridCard"
import CouponListItem from "./CouponListRow"
import CouponFormPage from "./CouponFormPage"
import CouponDetailPage from "./CouponDetailPage"
import {
    CouponFormState,
    CouponRelations,
    CouponRow,
    CouponScopeData,
    DEFAULT_COUPON_FORM,
    EMPTY_COUPON_RELATIONS,
    EMPTY_SCOPE_DATA,
    getCouponApplyScopeLabel,
    getCouponPrimaryMeta,
    getCouponUsageCount,
    mapCouponToForm,
} from "@/lib/types/coupon"
import { FadeIn } from "@/components/animations/FadeIn"
import { usePermissions } from "@/lib/permission-context"

type FilterState = {
    discountType: string[]
    applyScope: string[]
    customerScope: string[]
    automaticOnly: boolean
}

type SortKey = "coupon" | "scope" | "usage" | "validity" | "status"
type SortDirection = "asc" | "desc"
type ActiveTab = "Todos" | "Ativos" | "Inativos" | "Automaticos"
type WrapperMode = "list" | "create" | "edit" | "view"

const ITEMS_PER_PAGE = 8

const INITIAL_FILTERS: FilterState = {
    discountType: [],
    applyScope: [],
    customerScope: [],
    automaticOnly: false,
}

const COLUMNS: { id: SortKey | "actions"; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "coupon", label: "Cupom", align: "left", width: "280px" },
    { id: "scope", label: "Escopo", align: "left", width: "220px" },
    { id: "usage", label: "Uso", align: "left", width: "180px" },
    { id: "validity", label: "Validade", align: "left", width: "220px" },
    { id: "status", label: "Status", align: "right", width: "240px" },
    { id: "actions", label: "Acoes", align: "right", width: "220px" },
]
export default function CouponsPage({
    partnerId,
    initialCoupons,
    initialTotal,
}: {
    partnerId: string
    initialCoupons: CouponRow[]
    initialTotal: number
}) {
    const { toast } = useToast()
    const { canCreate, canEdit, canDelete } = usePermissions()
    const isMobile = useMediaQuery("(max-width: 767px)")

    const canCreateCoupons = canCreate("marketing_coupons")
    const canEditCoupons = canEdit("marketing_coupons")
    const canDeleteCoupons = canDelete("marketing_coupons")

    const [coupons, setCoupons] = useState<CouponRow[]>(initialCoupons || [])
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [activeTab, setActiveTab] = useState<ActiveTab>("Todos")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "validity",
        direction: "desc",
    })
    const [wrapperMode, setWrapperMode] = useState<WrapperMode>("list")
    const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null)
    const [form, setForm] = useState<CouponFormState>(DEFAULT_COUPON_FORM)
    const [scopeData, setScopeData] = useState<CouponScopeData>(EMPTY_SCOPE_DATA)
    const [relations, setRelations] = useState<CouponRelations>(EMPTY_COUPON_RELATIONS)
    const [isLoadingPage, setIsLoadingPage] = useState(false)
    const [isLoadingScope, setIsLoadingScope] = useState(false)
    const [isLoadingRelations, setIsLoadingRelations] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [couponToDelete, setCouponToDelete] = useState<CouponRow | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [actionModal, setActionModal] = useState<{ open: boolean; text: string }>({ open: false, text: "" })

    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })
    const totalCoupons = initialTotal ?? initialCoupons.length

    const effectiveViewMode = isMobile ? "grid" : viewMode
    const selectedCoupon = useMemo(
        () => coupons.find((coupon) => coupon.id === selectedCouponId) || null,
        [coupons, selectedCouponId],
    )

    const filterSections: FilterSectionConfig[] = useMemo(
        () => [
            { id: "discountType", title: "Tipo de desconto", type: "checkbox-list", options: ["Percentual", "Valor fixo", "Frete gratis"] },
            { id: "applyScope", title: "Escopo do catalogo", type: "checkbox-list", options: ["Todos os itens", "Categorias especificas", "Produtos especificos", "Servicos especificos"] },
            { id: "customerScope", title: "Clientes", type: "checkbox-list", options: ["Todos os clientes", "Clientes especificos"] },
            { id: "automaticOnly", title: "Automacao", type: "switch", switchLabel: "Mostrar apenas cupons automaticos" },
        ],
        [],
    )

    const resetRelations = useCallback(() => {
        setRelations(EMPTY_COUPON_RELATIONS)
    }, [])

    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState((prev) => {
            const next = {
                left: scrollLeft > 0,
                right: scrollLeft < scrollWidth - clientWidth - 2,
            }
            if (prev.left === next.left && prev.right === next.right) return prev
            return next
        })
    }, [])

    useEffect(() => {
        const timeout = setTimeout(() => setDebouncedSearch(search), 350)
        return () => clearTimeout(timeout)
    }, [search])

    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, filters, activeTab])

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => window.removeEventListener("resize", checkScroll)
    }, [checkScroll, effectiveViewMode, coupons])

    useEffect(() => {
        const handleReset = () => {
            setWrapperMode("list")
            setSelectedCouponId(null)
            resetRelations()
        }
        window.addEventListener("erp-sidebar-reset", handleReset)
        return () => window.removeEventListener("erp-sidebar-reset", handleReset)
    }, [resetRelations])

    const ensureScopeData = useCallback(async () => {
        if (
            scopeData.products.length > 0 ||
            scopeData.services.length > 0 ||
            scopeData.categories.length > 0 ||
            scopeData.customers.length > 0
        ) {
            return scopeData
        }

        setIsLoadingScope(true)
        try {
            const result = await getCouponScopeDataAction(partnerId)
            if (!result.success) {
                throw new Error("Nao foi possivel carregar os dados de escopo.")
            }

            const nextScopeData: CouponScopeData = {
                products: result.products || [],
                services: result.services || [],
                categories: result.categories || [],
                customers: result.customers || [],
            }
            setScopeData(nextScopeData)
            return nextScopeData
        } finally {
            setIsLoadingScope(false)
        }
    }, [partnerId, scopeData])

    const loadRelations = useCallback(
        async (couponId: string) => {
            setIsLoadingRelations(true)
            try {
                const availableScope = await ensureScopeData()
                const [linkedItemsResult, customersResult] = await Promise.all([
                    getCouponLinkedItemsAction(partnerId, couponId),
                    getCouponCustomersAction(partnerId, couponId),
                ])

                if (!linkedItemsResult.success || !customersResult.success) {
                    throw new Error("Nao foi possivel carregar os vinculos do cupom.")
                }

                const categoryIds = (linkedItemsResult.categoryIds || []) as string[]
                const productIds = (linkedItemsResult.productIds || []) as string[]
                const serviceIds = (linkedItemsResult.serviceIds || []) as string[]
                const customerIds = (customersResult.data || []) as string[]

                const nextRelations: CouponRelations = {
                    categoryIds,
                    productIds,
                    serviceIds,
                    customerIds,
                    categories: availableScope.categories.filter((item) => categoryIds.includes(item.id)),
                    products: availableScope.products.filter((item) => productIds.includes(item.id)),
                    services: availableScope.services.filter((item) => serviceIds.includes(item.id)),
                    customers: availableScope.customers.filter((item) => customerIds.includes(item.id)),
                }

                setRelations(nextRelations)
                return nextRelations
            } finally {
                setIsLoadingRelations(false)
            }
        },
        [ensureScopeData, partnerId],
    )

    const refreshCoupons = useCallback(async () => {
        setIsLoadingPage(true)
        try {
            const result = await listCouponsAction(partnerId, { page: 1, limit: 100 })
            if (!result.success) {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
                return
            }
            setCoupons(result.data || [])
        } finally {
            setIsLoadingPage(false)
        }
    }, [partnerId, toast])

    const openCreate = useCallback(async () => {
        resetRelations()
        setForm(DEFAULT_COUPON_FORM)
        setSelectedCouponId(null)
        setWrapperMode("create")
        try {
            await ensureScopeData()
        } catch (error) {
            toast({
                title: "Erro",
                description: error instanceof Error ? error.message : "Falha ao carregar dados do cupom.",
                variant: "destructive",
            })
        }
    }, [ensureScopeData, resetRelations, toast])

    const openEdit = useCallback(
        async (coupon: CouponRow) => {
            setSelectedCouponId(coupon.id)
            setForm(mapCouponToForm(coupon))
            setWrapperMode("edit")
            try {
                await loadRelations(coupon.id)
            } catch (error) {
                toast({
                    title: "Erro",
                    description: error instanceof Error ? error.message : "Falha ao carregar dados do cupom.",
                    variant: "destructive",
                })
            }
        },
        [loadRelations, toast],
    )

    const openDetails = useCallback(
        async (coupon: CouponRow) => {
            setSelectedCouponId(coupon.id)
            setWrapperMode("view")
            try {
                await loadRelations(coupon.id)
            } catch (error) {
                toast({
                    title: "Erro",
                    description: error instanceof Error ? error.message : "Falha ao carregar detalhes do cupom.",
                    variant: "destructive",
                })
            }
        },
        [loadRelations, toast],
    )

    const handleBackToList = useCallback(() => {
        setWrapperMode("list")
        setSelectedCouponId(null)
        resetRelations()
    }, [resetRelations])

    const handleToggleStatus = useCallback(
        async (coupon: CouponRow) => {
            const result = await toggleCouponStatusAction(partnerId, coupon.id, !coupon.is_active)
            if (!result.success) {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
                return
            }
            toast({
                title: "Status atualizado",
                description: coupon.is_active ? "Cupom desativado com sucesso." : "Cupom ativado com sucesso.",
            })
            await refreshCoupons()
        },
        [partnerId, refreshCoupons, toast],
    )

    const handleDelete = useCallback((coupon: CouponRow) => {
        setCouponToDelete(coupon)
    }, [])

    const handleSelectRow = useCallback((id: string) => {
        setSelection((prev) => {
            const next = new Set(prev.ids)
            next.has(id) ? next.delete(id) : next.add(id)
            return { ids: next }
        })
    }, [])

    const confirmDelete = useCallback(async () => {
        if (!couponToDelete) return
        setIsDeleting(true)
        setActionModal({ open: true, text: "Excluindo cupom..." })
        try {
            const result = await deleteCouponAction(partnerId, couponToDelete.id)
            if (!result.success) {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
                return
            }
            toast({ title: "Cupom excluido", description: `${couponToDelete.code} foi removido.` })
            if (selectedCouponId === couponToDelete.id) {
                handleBackToList()
            }
            setSelection((prev) => {
                const next = new Set(prev.ids)
                next.delete(couponToDelete.id)
                return { ids: next }
            })
            setCouponToDelete(null)
            await refreshCoupons()
        } finally {
            setIsDeleting(false)
            setActionModal({ open: false, text: "" })
        }
    }, [couponToDelete, handleBackToList, partnerId, refreshCoupons, selectedCouponId, toast])

    const setSelectedProductIds = useCallback((value: React.SetStateAction<string[]>) => {
        setRelations((prev) => {
            const productIds = typeof value === "function" ? value(prev.productIds) : value
            return { ...prev, productIds, products: scopeData.products.filter((item) => productIds.includes(item.id)) }
        })
    }, [scopeData.products])

    const setSelectedServiceIds = useCallback((value: React.SetStateAction<string[]>) => {
        setRelations((prev) => {
            const serviceIds = typeof value === "function" ? value(prev.serviceIds) : value
            return { ...prev, serviceIds, services: scopeData.services.filter((item) => serviceIds.includes(item.id)) }
        })
    }, [scopeData.services])

    const setSelectedCategoryIds = useCallback((value: React.SetStateAction<string[]>) => {
        setRelations((prev) => {
            const categoryIds = typeof value === "function" ? value(prev.categoryIds) : value
            return { ...prev, categoryIds, categories: scopeData.categories.filter((item) => categoryIds.includes(item.id)) }
        })
    }, [scopeData.categories])

    const setSelectedCustomerIds = useCallback((value: React.SetStateAction<string[]>) => {
        setRelations((prev) => {
            const customerIds = typeof value === "function" ? value(prev.customerIds) : value
            return { ...prev, customerIds, customers: scopeData.customers.filter((item) => customerIds.includes(item.id)) }
        })
    }, [scopeData.customers])

    const saveCoupon = useCallback(async () => {
        const payload = {
            partnerId,
            code: form.code.trim().toUpperCase(),
            discountType: form.discountType,
            discountValue: form.discountType === "free_shipping" ? null : Number(form.discountValue || 0),
            applyScope: form.applyScope,
            allowCombination: Boolean(form.allowCombination),
            minCartValue: Number(form.minCartValue || 0),
            maxDiscountValue: form.maxDiscountEnabled ? Number(form.maxDiscountValue || 0) : null,
            usageLimit: form.usageLimitEnabled ? Number(form.usageLimit || 0) : null,
            usagePerCustomer: form.usagePerCustomerEnabled ? Number(form.usagePerCustomer || 0) : null,
            firstPurchaseOnly: Boolean(form.firstPurchaseOnly),
            startsAt: form.unlimitedDate || !form.startsAt ? null : new Date(form.startsAt).toISOString(),
            endsAt: form.unlimitedDate || !form.endsAt ? null : new Date(form.endsAt).toISOString(),
            isActive: Boolean(form.isActive),
            customerScope: form.customerScope,
            isAutomatic: Boolean(form.isAutomatic),
            productIds: form.applyScope === "products" ? relations.productIds : [],
            categoryIds: form.applyScope === "categories" ? relations.categoryIds : [],
            serviceIds: form.applyScope === "services" ? relations.serviceIds : [],
            customerIds: form.customerScope === "specific" ? relations.customerIds : [],
        }

        if (!payload.code) {
            toast({ title: "Validacao", description: "Informe o codigo do cupom.", variant: "destructive" })
            return
        }

        if (payload.discountType === "percentage" && Number(payload.discountValue || 0) > 100) {
            toast({ title: "Validacao", description: "O percentual maximo permitido e 100%.", variant: "destructive" })
            return
        }

        if (payload.discountType === "fixed" && Number(payload.discountValue || 0) <= 0) {
            toast({ title: "Validacao", description: "Informe um valor fixo maior que zero.", variant: "destructive" })
            return
        }

        if (payload.customerScope === "specific" && payload.customerIds.length === 0) {
            toast({ title: "Validacao", description: "Selecione ao menos um cliente para esse publico.", variant: "destructive" })
            return
        }

        if (payload.applyScope === "categories" && payload.categoryIds.length === 0) {
            toast({ title: "Validacao", description: "Selecione ao menos uma categoria.", variant: "destructive" })
            return
        }

        if (payload.applyScope === "products" && payload.productIds.length === 0) {
            toast({ title: "Validacao", description: "Selecione ao menos um produto.", variant: "destructive" })
            return
        }

        if (payload.applyScope === "services" && payload.serviceIds.length === 0) {
            toast({ title: "Validacao", description: "Selecione ao menos um servico.", variant: "destructive" })
            return
        }

        setIsSaving(true)
        setActionModal({ open: true, text: selectedCouponId ? "Salvando alteracoes..." : "Criando cupom..." })
        try {
            const result = selectedCouponId
                ? await updateCouponAction(selectedCouponId, payload)
                : await createCouponAction(payload)

            if (!result.success) {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
                return
            }

            toast({
                title: "Sucesso",
                description: selectedCouponId ? "Cupom atualizado com sucesso." : "Cupom criado com sucesso.",
            })

            await refreshCoupons()
            setWrapperMode("list")
            setSelectedCouponId(null)
            setForm(DEFAULT_COUPON_FORM)
            resetRelations()
        } finally {
            setIsSaving(false)
            setActionModal({ open: false, text: "" })
        }
    }, [form, partnerId, refreshCoupons, relations, resetRelations, selectedCouponId, toast])

    const filteredCoupons = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase()

        const mapped = coupons.filter((coupon) => {
            const searchMatch =
                !term ||
                coupon.code.toLowerCase().includes(term) ||
                getCouponPrimaryMeta(coupon).toLowerCase().includes(term)

            const tabMatch =
                activeTab === "Todos" ||
                (activeTab === "Ativos" && coupon.is_active) ||
                (activeTab === "Inativos" && !coupon.is_active) ||
                (activeTab === "Automaticos" && coupon.is_automatic)

            const typeLabel = coupon.discount_type === "percentage"
                ? "Percentual"
                : coupon.discount_type === "fixed"
                    ? "Valor fixo"
                    : "Frete gratis"

            const scopeLabel = getCouponApplyScopeLabel(coupon.apply_scope)
            const customerLabel = coupon.customer_scope === "specific" ? "Clientes especificos" : "Todos os clientes"

            const typeMatch = filters.discountType.length === 0 || filters.discountType.includes(typeLabel)
            const scopeMatch = filters.applyScope.length === 0 || filters.applyScope.includes(scopeLabel)
            const customerScopeMatch = filters.customerScope.length === 0 || filters.customerScope.includes(customerLabel)
            const automaticMatch = !filters.automaticOnly || coupon.is_automatic

            return searchMatch && tabMatch && typeMatch && scopeMatch && customerScopeMatch && automaticMatch
        })

        if (!sortConfig) return mapped

        return [...mapped].sort((left, right) => {
            let a: string | number = ""
            let b: string | number = ""

            switch (sortConfig.key) {
                case "coupon":
                    a = left.code
                    b = right.code
                    break
                case "scope":
                    a = getCouponApplyScopeLabel(left.apply_scope)
                    b = getCouponApplyScopeLabel(right.apply_scope)
                    break
                case "usage":
                    a = getCouponUsageCount(left)
                    b = getCouponUsageCount(right)
                    break
                case "validity":
                    a = left.ends_at ? new Date(left.ends_at).getTime() : Number.MAX_SAFE_INTEGER
                    b = right.ends_at ? new Date(right.ends_at).getTime() : Number.MAX_SAFE_INTEGER
                    break
                case "status":
                    a = left.is_active ? 1 : 0
                    b = right.is_active ? 1 : 0
                    break
            }

            if (a === b) return 0
            const comparison = a < b ? -1 : 1
            return sortConfig.direction === "asc" ? comparison : -comparison
        })
    }, [activeTab, coupons, debouncedSearch, filters, sortConfig])

    const totalPages = Math.max(1, Math.ceil(filteredCoupons.length / ITEMS_PER_PAGE))
    const paginatedCoupons = filteredCoupons.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

    const hasActiveFilters =
        filters.discountType.length > 0 ||
        filters.applyScope.length > 0 ||
        filters.customerScope.length > 0 ||
        filters.automaticOnly ||
        debouncedSearch.length > 0

    return (
        <>
            <AnimatePresence mode="wait">
                {wrapperMode === "create" || wrapperMode === "edit" ? (
                    <CouponFormPage
                        key="form"
                        mode={wrapperMode}
                        coupon={selectedCoupon}
                        form={form}
                        setForm={setForm}
                        scopeData={scopeData}
                        relations={relations}
                        setSelectedProductIds={setSelectedProductIds}
                        setSelectedServiceIds={setSelectedServiceIds}
                        setSelectedCategoryIds={setSelectedCategoryIds}
                        setSelectedCustomerIds={setSelectedCustomerIds}
                        onBack={handleBackToList}
                        onSave={saveCoupon}
                        isSaving={isSaving}
                        isLoadingScope={isLoadingScope || isLoadingRelations}
                    />
                ) : wrapperMode === "view" && selectedCoupon ? (
                    <CouponDetailPage
                        key="detail"
                        coupon={selectedCoupon}
                        relations={relations}
                        onBack={handleBackToList}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onToggleStatus={handleToggleStatus}
                        isLoadingRelations={isLoadingRelations}
                    />
                ) : (
                    <FadeIn key="list">
                        <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
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
                                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                                    <div className="flex flex-col gap-2 pt-1">
                                        <div className="flex items-center gap-3">
                                            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                                Cupons
                                            </h1>
                                        </div>
                                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                            Gerencie cupons, regras promocionais e escopos de aplicacao.
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <Button variant="outline" leftIcon={<ExportFileIcon size={18} />}>
                                            Exportar
                                        </Button>
                                        <Button onClick={openCreate} leftIcon={<PlusIcon size={18} />}>
                                            Novo Cupom
                                        </Button>
                                    </div>
                                </div>

                                <CouponPageControls
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    search={search}
                                    onSearchChange={setSearch}
                                    onOpenFilter={() => setModals((prev) => ({ ...prev, filter: true }))}
                                    filters={filters}
                                    setFilters={setFilters}
                                    viewMode={effectiveViewMode}
                                    onViewModeChange={setViewModeState}
                                    hasActiveFilters={hasActiveFilters}
                                    onAddCoupon={canCreateCoupons ? openCreate : undefined}
                                />

                                <div className="flex-1 min-h-[420px]">
                                    <AnimatePresence mode="wait">
                                        {isLoadingPage ? (
                                            <FadeIn key="loading" className="h-[420px] flex items-center justify-center">
                                                <ThreeDotsLoader />
                                            </FadeIn>
                                        ) : filteredCoupons.length === 0 ? (
                                            <FadeIn key="empty" className="h-[600px] flex items-center justify-center px-4 md:px-8">
                                                <IconPlaceholder
                                                    placeholderType="image"
                                                    imageSrc={hasActiveFilters ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png" : "https://img.dudit.com.br/static/mascots/Cupons.png"}
                                                    imageAlt="Nenhum cupom encontrado"
                                                    title={hasActiveFilters ? "Nenhum cupom encontrado" : "Nenhum cupom cadastrado"}
                                                    subtitle={hasActiveFilters ? "Tente ajustar seus filtros ou termos de busca." : "Comece criando seu primeiro cupom promocional."}
                                                    itemButton={canCreateCoupons ? { text: "Criar cupom", action: openCreate } : undefined}
                                                />
                                            </FadeIn>
                                        ) : (
                                            <FadeIn
                                                key={`${effectiveViewMode}-${activeTab}-${debouncedSearch}`}
                                                className="w-full"
                                            >
                                                {effectiveViewMode === "grid" ? (
                                                    <div className="px-4 md:px-8 pb-6">
                                                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                            <AnimatePresence>
                                                                {paginatedCoupons.map((coupon) => (
                                                                    <CouponGridCard
                                                                        key={coupon.id}
                                                                        coupon={coupon}
                                                                        selected={selection.ids.has(coupon.id)}
                                                                        onSelect={() => handleSelectRow(coupon.id)}
                                                                        onDetails={openDetails}
                                                                        onEdit={canEditCoupons ? openEdit : undefined}
                                                                        onToggleStatus={canEditCoupons ? handleToggleStatus : undefined}
                                                                        onDelete={canDeleteCoupons ? handleDelete : undefined}
                                                                    />
                                                                ))}
                                                            </AnimatePresence>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="px-4 md:px-8 pb-6">
                                                        <div className="relative">
                                                            <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                                            <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                                            <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                                                <table className="w-full text-left border-separate border-spacing-0 min-w-[1380px]">
                                                                    <thead>
                                                                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 rounded-l-lg pl-6 w-12">
                                                                                <Checkbox
                                                                                    checked={paginatedCoupons.length > 0 && paginatedCoupons.every((coupon) => selection.ids.has(coupon.id))}
                                                                                    onChange={() => {
                                                                                        const allSelected = paginatedCoupons.every((coupon) => selection.ids.has(coupon.id))
                                                                                        setSelection((prev) => {
                                                                                            const next = new Set(prev.ids)
                                                                                            if (allSelected) {
                                                                                                paginatedCoupons.forEach((coupon) => next.delete(coupon.id))
                                                                                            } else {
                                                                                                paginatedCoupons.forEach((coupon) => next.add(coupon.id))
                                                                                            }
                                                                                            return { ids: next }
                                                                                        })
                                                                                    }}
                                                                                />
                                                                            </th>
                                                                            {COLUMNS.map((column, index) => {
                                                                                const isSortable = column.id !== "actions"
                                                                                const isSorted = sortConfig?.key === column.id
                                                                                const isLast = index === COLUMNS.length - 1

                                                                                return (
                                                                                    <th
                                                                                        key={column.id}
                                                                                        className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"} ${isSortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""} ${isLast ? "rounded-r-lg pr-6" : ""}`}
                                                                                        style={{ width: column.width }}
                                                                                        onClick={() => {
                                                                                            if (!isSortable) return
                                                                                            setSortConfig((prev) => ({
                                                                                                key: column.id as SortKey,
                                                                                                direction: prev?.key === column.id && prev.direction === "asc" ? "desc" : "asc",
                                                                                            }))
                                                                                        }}
                                                                                    >
                                                                                        <div className={`flex items-center gap-1.5 ${column.align === "right" ? "justify-end" : column.align === "center" ? "justify-center" : ""}`}>
                                                                                            {column.label}
                                                                                            {isSortable && (
                                                                                                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                                                                                    <ArrowUpDownIcon
                                                                                                        size={14}
                                                                                                        className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100" : "text-brand-inactive-text opacity-0 group-hover:opacity-40"} ${isSorted && sortConfig?.direction === "desc" ? "rotate-180" : ""}`}
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
                                                                        {paginatedCoupons.map((coupon) => (
                                                                            <CouponListItem
                                                                                key={coupon.id}
                                                                                coupon={coupon}
                                                                                columns={COLUMNS}
                                                                                selected={selection.ids.has(coupon.id)}
                                                                                onSelect={handleSelectRow}
                                                                                onDetails={openDetails}
                                                                                onEdit={canEditCoupons ? openEdit : undefined}
                                                                                onToggleStatus={canEditCoupons ? handleToggleStatus : undefined}
                                                                                onDelete={canDeleteCoupons ? handleDelete : undefined}
                                                                            />
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </FadeIn>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                            </div>
                        </div>
                    </FadeIn>
                )}
            </AnimatePresence>

            <FilterSheet
                isOpen={modals.filter}
                onClose={() => setModals((prev) => ({ ...prev, filter: false }))}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => setFilters(INITIAL_FILTERS)}
            />

            <AlertModal
                title="Excluir cupom"
                description={couponToDelete ? `Tem certeza que deseja excluir o cupom ${couponToDelete.code}? Esta acao nao pode ser desfeita.` : ""}
                isOpen={!!couponToDelete}
                onClose={() => setCouponToDelete(null)}
                onConfirm={confirmDelete}
                confirmText="Excluir"
                cancelText="Cancelar"
                isDestructive
                isLoading={isDeleting}
            />

            <AnimatePresence>
                {actionModal.open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-[2px]"
                    >
                        <div className="bg-white dark:bg-dark-surface rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-6 max-w-sm w-full mx-4">
                            <img src="https://img.dudit.com.br/static/mascots/Aguarde.png" alt="Aguarde" className="w-36 h-36 object-contain" />
                            <p className="text-lg font-semibold text-brand-dark dark:text-dark-heading text-center leading-tight">{actionModal.text}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
