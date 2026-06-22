"use client"

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react"
import {
    Button, Input, FormSection, DatePicker, ThreeDotsLoader, Tabs, TabsList, TabsTrigger, Badge, IconPlaceholder,
    FormDropdown, TimePicker, MoneyInput, PercentageInput, ListItem, RadioButton, InfoCard, DefaultModal
} from "@/components/reusable"
import CustomerCard from "@/components/reusable/CustomerCard"
import Pagination from "@/components/reusable/Pagination"
import QuantitySelector from "@/components/reusable/QuantitySelector"
import { ChevronLeftIcon, SaveIcon, PlusIcon, TrashIcon, WrenchIcon, PackageIcon, UserIcon, TagIcon, MoneyIcon, FileIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import {
    createServiceOrderAction,
    updateServiceOrderAction,
    addServicesToOrderAction,
    addProductsToOrderAction,
    syncServiceOrderServicesAction,
    syncServiceOrderProductsAction,
} from "@/app/actions/erp/service-orders"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
import SelectServiceSheet from "./SelectServiceSheet"
import SelectProductSheet from "./SelectProductSheet"
import SelectCouponSheet from "@/components/erp/pdv/SelectCouponSheet"
import { validateCouponAction } from "@/app/actions/shared/coupons"
import { getTeamMembers } from "@/app/actions/erp/team"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"

interface ServiceOrderFormProps {
    partnerId: string
    onBack: () => void
    onSaved: (data?: any) => void
    editData?: any
}

const REQUIRED_FIELDS = [
    { field: "title", tab: "general" },
    { field: "assignedUserId", tab: "general" },
    { field: "services", tab: "general" },
    { field: "services", tab: "services" },
]



export default function ServiceOrderForm({ partnerId, onBack, onSaved, editData }: ServiceOrderFormProps) {
    const { toast } = useToast()
    const [activeTab, setActiveTab] = useState("general")
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())

    const getTabErrorCount = useCallback((tab: string) => {
        return REQUIRED_FIELDS.filter(({ field, tab: fieldTab }) => fieldTab === tab && fieldErrors.has(field)).length
    }, [fieldErrors])
    const [title, setTitle] = useState(editData?.title || "")
    const [description, setDescription] = useState(editData?.description || "")
    const [internalNotes, setInternalNotes] = useState(editData?.internal_notes || "")
    const [customerId, setCustomerId] = useState(editData?.customer_id || "")
    const [customerName, setCustomerName] = useState(editData?.customer_snapshot?.name || "")
    const [selectedCustomer, setSelectedCustomer] = useState<any>(editData?.customer_snapshot || null)
    const [expectedDate, setExpectedDate] = useState(editData?.expected_completion_date || "")
    const [assignedUserId, setAssignedUserId] = useState(editData?.assigned_user_id || "")

    // Custom OS fields
    const [priority, setPriority] = useState(editData?.priority || "media")
    const [estimatedHours, setEstimatedHours] = useState(editData?.estimated_hours != null ? String(editData.estimated_hours) : "")
    const [expectedCompletionTime, setExpectedCompletionTime] = useState(editData?.expected_completion_time || "")
    const [teamMembers, setTeamMembers] = useState<any[]>([])

    // Financial fields matching CreateOrder / pdv
    const [discountValue, setDiscountValue] = useState(editData?.discount_value || 0)
    const [discountType, setDiscountType] = useState<'fixed' | 'percentage' | 'coupon'>(editData?.discount_type || 'fixed')
    const [couponCode, setCouponCode] = useState(editData?.coupon_code || "")
    const [couponId, setCouponId] = useState<string | null>(editData?.coupon_id || null)
    const [couponDiscountAmount, setCouponDiscountAmount] = useState(editData?.coupon_discount_amount || 0)
    const [couponPricingData, setCouponPricingData] = useState<any>(null)
    const [otherCosts, setOtherCosts] = useState(editData?.other_costs || 0)

    // Modals for discounts
    const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false)
    const [isCouponSheetOpen, setIsCouponSheetOpen] = useState(false)
    const [globalDiscountValue, setGlobalDiscountValue] = useState(0)
    const [globalDiscountType, setGlobalDiscountType] = useState<"fixed" | "percentage" | "coupon">("fixed")
    const [globalDiscountCouponCode, setGlobalDiscountCouponCode] = useState("")
    const [isApplyingCoupon, setIsApplyingCoupon] = useState(false)

    const [services, setServices] = useState<any[]>(editData?.services || [])
    const [products, setProducts] = useState<any[]>(editData?.products || [])
    const [saving, setSaving] = useState(false)
    const [showCustomerSheet, setShowCustomerSheet] = useState(false)
    const [showServiceSheet, setShowServiceSheet] = useState(false)
    const [showProductSheet, setShowProductSheet] = useState(false)

    const [servicesPage, setServicesPage] = useState(1)
    const servicesItemsPerPage = 5
    const totalServicesPages = Math.ceil(services.length / servicesItemsPerPage)
    const paginatedServices = services.slice((servicesPage - 1) * servicesItemsPerPage, servicesPage * servicesItemsPerPage)

    const [productsPage, setProductsPage] = useState(1)
    const productsItemsPerPage = 5
    const totalProductsPages = Math.ceil(products.length / productsItemsPerPage)
    const paginatedProducts = products.slice((productsPage - 1) * productsItemsPerPage, productsPage * productsItemsPerPage)

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5)
        }
    }, [])

    // Load team members
    useEffect(() => {
        async function loadTeam() {
            try {
                const res = await getTeamMembers()
                if (res.members) {
                    setTeamMembers(res.members)
                }
            } catch (err) {
                console.error("Erro ao carregar equipe:", err)
            }
        }
        loadTeam()
    }, [])

    useEffect(() => {
        if (title.trim()) {
            setFieldErrors(prev => {
                if (prev.has("title")) {
                    const next = new Set(prev)
                    next.delete("title")
                    return next
                }
                return prev
            })
        }
    }, [title])

    useEffect(() => {
        if (assignedUserId) {
            setFieldErrors(prev => {
                if (prev.has("assignedUserId")) {
                    const next = new Set(prev)
                    next.delete("assignedUserId")
                    return next
                }
                return prev
            })
        }
    }, [assignedUserId])

    useEffect(() => {
        if (services.length > 0) {
            setFieldErrors(prev => {
                if (prev.has("services")) {
                    const next = new Set(prev)
                    next.delete("services")
                    return next
                }
                return prev
            })
        }
    }, [services])

    // Load coupon pricing data if editData has it
    useEffect(() => {
        if (editData?.coupon_id) {
            setCouponPricingData({
                id: editData.coupon_id,
                discountType: editData.discount_type || "fixed",
                discountValue: Number(editData.discount_value || 0),
                maxDiscountValue: null,
                freeShipping: false
            })
        }
    }, [editData])

    // Sync global discount states for modal
    useEffect(() => {
        if (!isDiscountModalOpen) return
        setGlobalDiscountValue(discountValue)
        setGlobalDiscountType(discountType === "coupon" ? "coupon" : discountType)
        setGlobalDiscountCouponCode(couponCode)
    }, [isDiscountModalOpen, discountValue, discountType, couponCode])

    // Pricing engine calculations
    const pricingItems = useMemo(() => {
        const list: any[] = []
        services.forEach(s => {
            list.push({
                serviceId: s.service_id || s.id,
                unitPrice: Number(s.service_price !== undefined ? s.service_price : (s.price || 0)),
                quantity: Number(s.quantity || 1),
            })
        })
        products.forEach(p => {
            list.push({
                productId: p.product_id || p.id,
                unitPrice: Number(p.unit_price !== undefined ? p.unit_price : (p.price || 0)),
                quantity: Number(p.quantity || 1),
            })
        })
        return list
    }, [services, products])

    const subtotal = useMemo(() => {
        const totalS = services.reduce((sum, s) => sum + (Number(s.service_price !== undefined ? s.service_price : (s.price || 0)) * (s.quantity || 1)), 0)
        const totalP = products.reduce((sum, p) => sum + (Number(p.unit_price !== undefined ? p.unit_price : (p.price || 0)) * (p.quantity || 1)), 0)
        return totalS + totalP
    }, [services, products])

    const discountAmount = useMemo(() => {
        if (discountType === 'percentage') {
            return (subtotal * discountValue) / 100
        }
        if (discountType === "coupon") return 0
        return discountValue
    }, [subtotal, discountValue, discountType])

    const pricingPreview = useMemo(() => {
        return calculateOrderPricing({
            items: pricingItems,
            shippingCost: 0,
            additionalCosts: Number(otherCosts || 0),
            manualDiscount: discountAmount > 0 ? { type: "fixed", value: discountAmount } : null,
            coupon: couponPricingData,
        })
    }, [pricingItems, otherCosts, discountAmount, couponPricingData])

    const effectiveCouponDiscountAmount = couponPricingData
        ? pricingPreview.couponDiscountAmount
        : couponDiscountAmount

    const totalAmount = useMemo(() => {
        return pricingPreview.finalTotal
    }, [pricingPreview])

    const handleApplyCoupon = async () => {
        if (!couponCode.trim()) {
            toast({ description: "Informe o código do cupom." })
            return
        }
        setIsApplyingCoupon(true)
        try {
            const res = await validateCouponAction({
                partnerId,
                code: couponCode.trim().toUpperCase(),
                subtotal,
                customerId: customerId || null,
            })
            if (res.valid && res.pricingCoupon) {
                const c = res.pricingCoupon
                setCouponId(c.id)
                setCouponDiscountAmount(Number(res.discountAmount || 0))
                setDiscountType("coupon")
                setDiscountValue(0)
                setCouponPricingData({
                    id: c.id,
                    discountType: c.discountType as any,
                    discountValue: c.discountValue != null ? Number(c.discountValue) : null,
                    maxDiscountValue: c.maxDiscountValue != null ? Number(c.maxDiscountValue) : null,
                    freeShipping: c.freeShipping || false
                })
                toast({ description: "Cupom aplicado com sucesso!" })
            } else {
                toast({ description: res.errorMessage || "Cupom inválido." })
                setCouponCode("")
            }
        } finally {
            setIsApplyingCoupon(false)
        }
    }

    const handleSave = async () => {
        const newErrors = new Set<string>()
        if (!title.trim()) {
            newErrors.add("title")
        }
        if (!assignedUserId) {
            newErrors.add("assignedUserId")
        }
        if (services.length === 0) {
            newErrors.add("services")
        }

        if (newErrors.size > 0) {
            setFieldErrors(newErrors)
            toast({ description: "Por favor, preencha os campos obrigatórios." })
            setActiveTab("general")
            return
        }

        setSaving(true)

        const payload = {
            title: title.trim(),
            description: description.trim() || "",
            internal_notes: internalNotes.trim() || "",
            customer_id: customerId || null,
            expected_completion_date: expectedDate || null,
            assigned_user_id: assignedUserId || null,
            priority,
            estimated_hours: estimatedHours ? Number(estimatedHours) : null,
            expected_completion_time: expectedCompletionTime || null,
            discount_value: discountValue,
            discount_type: discountType,
            coupon_id: couponId,
            coupon_code: couponCode || null,
            coupon_discount_amount: effectiveCouponDiscountAmount,
            other_costs: Number(otherCosts || 0),
        }

        if (editData) {
            // 1. Update OS details
            const res = await updateServiceOrderAction(partnerId, editData.id, payload)

            if (!res.success) {
                toast({ description: res.error || "Erro ao atualizar OS" })
                setSaving(false)
                return
            }

            // 2. Sync services
            const svcRes = await syncServiceOrderServicesAction(
                partnerId,
                editData.id,
                services.map((s: any) => ({
                    service_id: s.isManual ? null : (s.service_id || s.id || null),
                    service_name: s.service_name || s.name || "Serviço avulso",
                    service_price: Number(s.service_price !== undefined ? s.service_price : (s.price || 0)),
                    quantity: Number(s.quantity || 1)
                }))
            )
            if (!svcRes.success) {
                toast({ description: svcRes.error || "Erro ao atualizar serviços" })
            }

            // 3. Sync products
            const prodRes = await syncServiceOrderProductsAction(
                partnerId,
                editData.id,
                products.map((p: any) => ({
                    product_id: p.isManual ? null : (p.product_id || p.id || null),
                    product_name: p.product_name || p.name || "Produto avulso",
                    unit_price: Number(p.unit_price !== undefined ? p.unit_price : (p.price || 0)),
                    quantity: Number(p.quantity || 1),
                    variant_id: p.variant_id || null
                }))
            )
            if (!prodRes.success) {
                toast({ description: prodRes.error || "Erro ao atualizar produtos" })
            }

            toast({ description: `OS #${editData.order_number} atualizada com sucesso!` })
            onSaved(res.data)
        } else {
            // Create OS
            const res = await createServiceOrderAction(partnerId, {
                ...payload,
                payment_status: "unpaid",
                paid_amount: 0,
            })

            if (!res.success) {
                toast({ description: res.error || "Erro ao criar OS" })
                setSaving(false)
                return
            }

            const orderId = res.data.id

            // Add services after creation
            if (services.length > 0) {
                const svcRes = await addServicesToOrderAction(
                    partnerId,
                    orderId,
                    services.map((s: any) => ({
                        service_id: s.isManual ? null : (s.service_id || s.id || null),
                        service_name: s.service_name || s.name || "Serviço avulso",
                        service_price: Number(s.service_price !== undefined ? s.service_price : (s.price || 0)),
                        quantity: Number(s.quantity || 1)
                    }))
                )
                if (!svcRes.success) {
                    toast({ description: "OS criada, mas erro ao adicionar serviços" })
                }
            }

            // Add products after creation
            if (products.length > 0) {
                const prodRes = await addProductsToOrderAction(
                    partnerId,
                    orderId,
                    products.map((p: any) => ({
                        product_id: p.isManual ? null : (p.product_id || p.id || null),
                        product_name: p.product_name || p.name || "Produto avulso",
                        unit_price: Number(p.unit_price !== undefined ? p.unit_price : (p.price || 0)),
                        quantity: Number(p.quantity || 1),
                        variant_id: p.variant_id || null
                    }))
                )
                if (!prodRes.success) {
                    toast({ description: "OS criada, mas erro ao adicionar produtos" })
                }
            }

            toast({ description: `OS #${res.orderNumber} criada com sucesso!` })
            onSaved(res.data)
        }
        setSaving(false)
    }

    const handleSelectCustomer = (customer: any) => {
        setCustomerId(customer.id)
        setCustomerName(customer.name)
        setSelectedCustomer(customer)
        setShowCustomerSheet(false)
    }

    const handleAddService = (svc: any) => {
        setServices((prev) => {
            if (prev.some((s) => (s.service_id || s.id) === svc.id)) return prev
            setServicesPage(1)
            return [...prev, {
                ...svc,
                service_id: svc.id,
                quantity: 1,
                service_price: svc.price,
                service_name: svc.name,
                isManual: false
            }]
        })
    }

    const handleRemoveService = (id: string) => {
        setServices((prev) => {
            const next = prev.filter((s) => (s.service_id || s.id) !== id)
            const nextTotalPages = Math.ceil(next.length / servicesItemsPerPage)
            if (servicesPage > nextTotalPages && nextTotalPages > 0) {
                setServicesPage(nextTotalPages)
            }
            return next
        })
    }

    const handleAddProduct = (prod: any) => {
        setProducts((prev) => {
            if (prev.some((p) => (p.product_id || p.id) === prod.id)) return prev
            setProductsPage(1)
            return [...prev, {
                ...prod,
                product_id: prod.id,
                quantity: 1,
                unit_price: prod.price,
                product_name: prod.name,
                isManual: false
            }]
        })
    }

    const handleRemoveProduct = (id: string) => {
        setProducts((prev) => {
            const next = prev.filter((p) => (p.product_id || p.id) !== id)
            const nextTotalPages = Math.ceil(next.length / productsItemsPerPage)
            if (productsPage > nextTotalPages && nextTotalPages > 0) {
                setProductsPage(nextTotalPages)
            }
            return next
        })
    }

    const addBlankService = () => {
        const newService = {
            id: Math.random().toString(36).substr(2, 9),
            service_id: null,
            service_name: "",
            service_price: 0,
            quantity: 1,
            isManual: true,
            isEditing: true
        }
        setServices(prev => [...prev, newService])
        setServicesPage(1)
    }

    const addBlankProduct = () => {
        const newProduct = {
            id: Math.random().toString(36).substr(2, 9),
            product_id: null,
            product_name: "",
            unit_price: 0,
            quantity: 1,
            isManual: true,
            isEditing: true
        }
        setProducts(prev => [...prev, newProduct])
        setProductsPage(1)
    }

    const updateServiceField = (indexInAll: number, field: string, value: any) => {
        setServices(prev => {
            const next = [...prev]
            next[indexInAll] = { ...next[indexInAll], [field]: value }
            return next
        })
    }

    const updateProductField = (indexInAll: number, field: string, value: any) => {
        setProducts(prev => {
            const next = [...prev]
            next[indexInAll] = { ...next[indexInAll], [field]: value }
            return next
        })
    }

    const pageTitle = editData ? `Editar OS #${editData.order_number}` : "Nova Ordem de Serviço"
    const dateCreated = editData
        ? new Date(editData.created_at).toLocaleDateString("pt-BR")
        : ""

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
                                    <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="hidden md:inline truncate">{pageTitle}</span>
                                        </h1>
                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            {editData ? `Criada em ${dateCreated}` : "Preencha as informações da nova ordem de serviço"}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <Button onClick={handleSave} disabled={saving} leftIcon={<SaveIcon size={18} />}>
                                            {saving ? "Salvando..." : editData ? "Salvar" : "Criar OS"}
                                        </Button>
                                    </div>

                                    {/* Tabs Navigation */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">
                                                Dados gerais
                                                {getTabErrorCount("general") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                            </TabsTrigger>
                                            <TabsTrigger value="notes">
                                                Observações
                                                {getTabErrorCount("notes") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                            </TabsTrigger>
                                            <TabsTrigger value="services">
                                                Serviços
                                                {getTabErrorCount("services") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                            </TabsTrigger>
                                            <TabsTrigger value="products">
                                                Produtos
                                                {getTabErrorCount("products") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                            </TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="px-4 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <AnimatePresence mode="wait">
                                {activeTab === "general" && (
                                    <FadeIn key="general" className="grid grid-cols-12 gap-y-8 md:gap-y-0 w-full">
                                        {/* Left Column (Main Form fields) */}
                                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-6">
                                            <FormSection title="Título">
                                                <Input
                                                    placeholder="Ex: Manutenção de ar condicionado"
                                                    value={title}
                                                    onChange={(e) => setTitle(e.target.value)}
                                                    error={fieldErrors.has("title")}
                                                    errorMessage={fieldErrors.has("title") ? "O título é obrigatório" : undefined}
                                                />
                                            </FormSection>

                                            <FormSection title="Descrição">
                                                <textarea
                                                    className="w-full min-h-[120px] px-3 py-2 text-sm rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:ring-2 focus:ring-brand-green resize-y"
                                                    placeholder="Descreva o serviço a ser realizado..."
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                />
                                            </FormSection>

                                            <FormSection title="Agendamento e Responsabilidade">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <DatePicker
                                                        label="Data prevista de conclusão"
                                                        value={expectedDate}
                                                        onChange={setExpectedDate}
                                                        placeholder="Selecionar data"
                                                    />

                                                    <TimePicker
                                                        label="Hora prevista para conclusão"
                                                        value={expectedCompletionTime}
                                                        onChange={(time) => setExpectedCompletionTime(time)}
                                                        placeholder="14:30"
                                                    />

                                                    <FormDropdown
                                                        label="Prioridade"
                                                        value={priority}
                                                        setValue={(val) => setPriority(val)}
                                                        options={[
                                                            { value: "baixa", label: "Baixa" },
                                                            { value: "media", label: "Média" },
                                                            { value: "alta", label: "Alta" },
                                                            { value: "urgente", label: "Urgente" },
                                                        ]}
                                                    />

                                                    <FormDropdown
                                                        label="Responsável Técnico"
                                                        value={assignedUserId}
                                                        setValue={(val) => setAssignedUserId(val)}
                                                        options={teamMembers.map(m => ({
                                                            value: m.userId,
                                                            label: m.fullName || m.email || "Sem Nome",
                                                        }))}
                                                        placeholder="Selecione um responsável"
                                                        error={fieldErrors.has("assignedUserId")}
                                                        errorMessage={fieldErrors.has("assignedUserId") ? "Selecione um responsável" : undefined}
                                                    />

                                                    <Input
                                                        label="Tempo Estimado (horas)"
                                                        placeholder="Ex: 2.5"
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        value={estimatedHours}
                                                        onChange={(e) => setEstimatedHours(e.target.value)}
                                                    />
                                                </div>
                                            </FormSection>
                                        </div>

                                        {/* Right Column (Sidebar Card with Client Card and Totals) */}
                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                                            <div>
                                                {selectedCustomer ? (
                                                    <CustomerCard
                                                        customer={selectedCustomer}
                                                        onRemove={() => {
                                                            setCustomerId("")
                                                            setCustomerName("")
                                                            setSelectedCustomer(null)
                                                        }}
                                                    />
                                                ) : (
                                                    <div
                                                        className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-8 flex flex-col items-center justify-center text-center relative overflow-hidden mb-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border/40 transition-colors"
                                                        onClick={() => setShowCustomerSheet(true)}
                                                    >
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>
                                                        <IconPlaceholder
                                                            icon={UserIcon}
                                                            title="Nenhum cliente selecionado"
                                                            subtitle="Selecione um cliente para vincular à ordem de serviço."
                                                            itemButton={{
                                                                text: "Selecionar Cliente",
                                                                action: () => setShowCustomerSheet(true),
                                                                variant: "outline",
                                                                className: "rounded-full px-8"
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Totals & Payment Section */}
                                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 space-y-6">
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                                    Pagamento
                                                </h3>

                                                <div className="space-y-4">
                                                    <ListItem
                                                        icon={TagIcon}
                                                        title="Aplicar desconto"
                                                        description={couponId || discountValue > 0 ? "Desconto e/ou cupom aplicado" : "Escolha o tipo e aplique na OS"}
                                                        onClick={() => setIsDiscountModalOpen(true)}
                                                        className="px-4 py-3 gap-4 cursor-pointer border border-brand-border dark:border-dark-border rounded-xl"
                                                    />

                                                    <MoneyInput
                                                        label="Outros Custos"
                                                        value={otherCosts}
                                                        onChange={(val) => setOtherCosts(val)}
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-3 pt-2">
                                                    <div className="flex justify-between items-center text-[15px]">
                                                        <span className="text-brand-inactive-text font-medium">Subtotal</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(subtotal)}
                                                        </span>
                                                    </div>

                                                    {discountAmount > 0 && (
                                                        <div className="flex justify-between items-center text-[15px]">
                                                            <span className="text-brand-inactive-text font-medium">Desconto</span>
                                                            <span className="font-bold text-brand-green">
                                                                -{formatCurrency(discountAmount)}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {effectiveCouponDiscountAmount > 0 && (
                                                        <div className="flex justify-between items-center text-[15px]">
                                                            <span className="text-brand-inactive-text font-medium">Cupom aplicado</span>
                                                            <span className="font-bold text-brand-green">
                                                                -{formatCurrency(effectiveCouponDiscountAmount)}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {otherCosts > 0 && (
                                                        <div className="flex justify-between items-center text-[15px]">
                                                            <span className="text-brand-inactive-text font-medium">Outros Custos</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                {formatCurrency(otherCosts)}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className="border-t border-dashed border-brand-border dark:border-dark-border pt-4 mt-2">
                                                        <div className="flex justify-between items-end">
                                                            <span className="text-xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">Total Geral</span>
                                                            <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading leading-none tracking-tighter">
                                                                {formatCurrency(totalAmount)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </FadeIn>
                                )}

                                {activeTab === "notes" && (
                                    <FadeIn key="notes" className="space-y-6 w-full max-w-[800px]">
                                        <FormSection title="Observações internas">
                                            <textarea
                                                className="w-full min-h-[150px] px-3 py-2 text-sm rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:ring-2 focus:ring-brand-green resize-y"
                                                placeholder="Anotações internas (não visíveis ao cliente)..."
                                                value={internalNotes}
                                                onChange={(e) => setInternalNotes(e.target.value)}
                                            />
                                        </FormSection>
                                    </FadeIn>
                                )}

                                {activeTab === "services" && (
                                    <FadeIn key="services" className="space-y-6 w-full">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Serviços da OS</h2>
                                            <div className="flex items-center gap-3">
                                                <Button variant="link" onClick={addBlankService} className="gap-2 h-auto py-0 text-brand-primary">
                                                    <PlusIcon size={14} strokeWidth={3} />
                                                    Adicionar serviço manual
                                                </Button>
                                                <Button variant="link" onClick={() => setShowServiceSheet(true)} className="gap-2 h-auto py-0 text-brand-primary">
                                                    <PlusIcon size={14} strokeWidth={3} />
                                                    Adicionar da lista
                                                </Button>
                                            </div>
                                        </div>

                                        {services.length === 0 ? (
                                            <div className="w-full flex flex-col items-center justify-center py-12">
                                                <IconPlaceholder
                                                    icon={WrenchIcon}
                                                    title="Nenhum serviço adicionado"
                                                    subtitle="Adicione serviços para vincular a esta ordem de serviço."
                                                    itemButton={{
                                                        text: "Adicionar serviço",
                                                        action: () => setShowServiceSheet(true),
                                                        variant: "outline",
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                {/* --- SERVICES TABLE (Desktop) --- */}
                                                <div className="hidden md:block w-full overflow-x-auto pb-4 custom-scrollbar mb-4">
                                                    <table className="w-full text-left border-separate border-spacing-0">
                                                        <thead>
                                                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                <th className="py-3 pl-6 pr-4 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg">Serviço</th>
                                                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-44">Preço Unit.</th>
                                                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36">Qtd.</th>
                                                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-right w-36">Total</th>
                                                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-24 rounded-r-lg">Ações</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {paginatedServices.map((svc: any, paginatedIdx: number) => {
                                                                const index = (servicesPage - 1) * servicesItemsPerPage + paginatedIdx
                                                                const unitPrice = svc.price || svc.service_price || 0
                                                                const qty = svc.quantity || 1
                                                                return (
                                                                    <tr key={svc.service_id || svc.id || index} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                                                        <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                                                            <div className="flex items-center gap-3">
                                                                                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                    <WrenchIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                                                </div>
                                                                                {svc.isManual || !svc.service_id ? (
                                                                                    <Input
                                                                                        value={svc.service_name || svc.name || ""}
                                                                                        onChange={(e: any) => updateServiceField(index, "service_name", e.target.value)}
                                                                                        placeholder="Nome do serviço manual..."
                                                                                        className="mb-0"
                                                                                    />
                                                                                ) : (
                                                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                                                        {svc.name || svc.service_name}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-left font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                            <div className="w-[120px]">
                                                                                <MoneyInput
                                                                                    value={unitPrice}
                                                                                    onChange={(val) => updateServiceField(index, "service_price", val)}
                                                                                    className="mb-0"
                                                                                />
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-center font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                            <div className="flex justify-center">
                                                                                <QuantitySelector
                                                                                    value={qty}
                                                                                    onChange={(val) => updateServiceField(index, "quantity", val)}
                                                                                    size="md"
                                                                                />
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-right font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                                            {formatCurrency(unitPrice * qty)}
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                                            <div className="flex justify-center">
                                                                                <button
                                                                                    onClick={() => handleRemoveService(svc.service_id || svc.id)}
                                                                                    className="w-8 h-8 flex items-center justify-center rounded-full text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                                                                >
                                                                                    <TrashIcon size={14} />
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* --- SERVICES LIST (Mobile) --- */}
                                                <div className="md:hidden flex flex-col gap-4 mb-4">
                                                    {paginatedServices.map((svc: any, paginatedIdx: number) => {
                                                        const index = (servicesPage - 1) * servicesItemsPerPage + paginatedIdx
                                                        const unitPrice = svc.price || svc.service_price || 0
                                                        const qty = svc.quantity || 1
                                                        return (
                                                            <div key={svc.service_id || svc.id || index} className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-4">
                                                                <div className="flex items-start gap-4">
                                                                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                        <WrenchIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0 text-left space-y-2">
                                                                        {svc.isManual || !svc.service_id ? (
                                                                            <Input
                                                                                value={svc.service_name || svc.name || ""}
                                                                                onChange={(e: any) => updateServiceField(index, "service_name", e.target.value)}
                                                                                placeholder="Nome do serviço manual..."
                                                                                className="mb-0"
                                                                            />
                                                                        ) : (
                                                                            <div className="font-bold text-[14px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                                                {svc.name || svc.service_name}
                                                                            </div>
                                                                        )}
                                                                        <div className="flex items-center gap-4 mt-2">
                                                                            <QuantitySelector
                                                                                value={qty}
                                                                                onChange={(val) => updateServiceField(index, "quantity", val)}
                                                                                size="sm"
                                                                            />
                                                                            <div className="flex-1 max-w-[140px]">
                                                                                <MoneyInput
                                                                                    value={unitPrice}
                                                                                    onChange={(val) => updateServiceField(index, "service_price", val)}
                                                                                    className="mb-0"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading pt-1">
                                                                            Total: {formatCurrency(unitPrice * qty)}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleRemoveService(svc.service_id || svc.id)}
                                                                        className="w-8 h-8 flex items-center justify-center rounded-full text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                                                    >
                                                                        <TrashIcon size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>

                                                {/* Pagination */}
                                                <Pagination
                                                    currentPage={servicesPage}
                                                    totalPages={totalServicesPages}
                                                    onPageChange={setServicesPage}
                                                />
                                            </>
                                        )}
                                    </FadeIn>
                                )}

                                {activeTab === "products" && (
                                    <FadeIn key="products" className="space-y-6 w-full">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Produtos da OS</h2>
                                            <div className="flex items-center gap-3">
                                                <Button variant="link" onClick={addBlankProduct} className="gap-2 h-auto py-0 text-brand-primary">
                                                    <PlusIcon size={14} strokeWidth={3} />
                                                    Adicionar produto manual
                                                </Button>
                                                <Button variant="link" onClick={() => setShowProductSheet(true)} className="gap-2 h-auto py-0 text-brand-primary">
                                                    <PlusIcon size={14} strokeWidth={3} />
                                                    Adicionar da lista
                                                </Button>
                                            </div>
                                        </div>

                                        {products.length === 0 ? (
                                            <div className="w-full flex flex-col items-center justify-center py-12">
                                                <IconPlaceholder
                                                    icon={PackageIcon}
                                                    title="Nenhum produto adicionado"
                                                    subtitle="Adicione produtos para vincular a esta ordem de serviço."
                                                    itemButton={{
                                                        text: "Adicionar produto",
                                                        action: () => setShowProductSheet(true),
                                                        variant: "outline",
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                {/* --- PRODUCTS TABLE (Desktop) --- */}
                                                <div className="hidden md:block w-full overflow-x-auto pb-4 custom-scrollbar mb-4">
                                                    <table className="w-full text-left border-separate border-spacing-0">
                                                        <thead>
                                                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                <th className="py-3 pl-6 pr-4 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg">Produto</th>
                                                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-44">Preço Unit.</th>
                                                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36">Qtd.</th>
                                                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-right w-36">Total</th>
                                                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-24 rounded-r-lg">Ações</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {paginatedProducts.map((prod: any, paginatedIdx: number) => {
                                                                const index = (productsPage - 1) * productsItemsPerPage + paginatedIdx
                                                                const unitPrice = prod.price || prod.unit_price || 0
                                                                const qty = prod.quantity || 1
                                                                return (
                                                                    <tr key={prod.product_id || prod.id || index} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                                                        <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                                                            <div className="flex items-center gap-3">
                                                                                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                    <PackageIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                                                </div>
                                                                                {prod.isManual || !prod.product_id ? (
                                                                                    <Input
                                                                                        value={prod.product_name || prod.name || ""}
                                                                                        onChange={(e: any) => updateProductField(index, "product_name", e.target.value)}
                                                                                        placeholder="Nome do produto manual..."
                                                                                        className="mb-0"
                                                                                    />
                                                                                ) : (
                                                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                                                        {prod.name || prod.product_name}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-left font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                            <div className="w-[120px]">
                                                                                <MoneyInput
                                                                                    value={unitPrice}
                                                                                    onChange={(val) => updateProductField(index, "unit_price", val)}
                                                                                    className="mb-0"
                                                                                />
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-center font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                            <div className="flex justify-center">
                                                                                <QuantitySelector
                                                                                    value={qty}
                                                                                    onChange={(val) => updateProductField(index, "quantity", val)}
                                                                                    size="md"
                                                                                />
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-right font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                                            {formatCurrency(unitPrice * qty)}
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                                            <div className="flex justify-center">
                                                                                <button
                                                                                    onClick={() => handleRemoveProduct(prod.product_id || prod.id)}
                                                                                    className="w-8 h-8 flex items-center justify-center rounded-full text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                                                                >
                                                                                    <TrashIcon size={14} />
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* --- PRODUCTS LIST (Mobile) --- */}
                                                <div className="md:hidden flex flex-col gap-4 mb-4">
                                                    {paginatedProducts.map((prod: any, paginatedIdx: number) => {
                                                        const index = (productsPage - 1) * productsItemsPerPage + paginatedIdx
                                                        const unitPrice = prod.price || prod.unit_price || 0
                                                        const qty = prod.quantity || 1
                                                        return (
                                                            <div key={prod.product_id || prod.id || index} className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-4">
                                                                <div className="flex items-start gap-4">
                                                                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                        <PackageIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0 text-left space-y-2">
                                                                        {prod.isManual || !prod.product_id ? (
                                                                            <Input
                                                                                value={prod.product_name || prod.name || ""}
                                                                                onChange={(e: any) => updateProductField(index, "product_name", e.target.value)}
                                                                                placeholder="Nome do produto manual..."
                                                                                className="mb-0"
                                                                            />
                                                                        ) : (
                                                                            <div className="font-bold text-[14px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                                                {prod.name || prod.product_name}
                                                                            </div>
                                                                        )}
                                                                        <div className="flex items-center gap-4 mt-2">
                                                                            <QuantitySelector
                                                                                value={qty}
                                                                                onChange={(val) => updateProductField(index, "quantity", val)}
                                                                                size="sm"
                                                                            />
                                                                            <div className="flex-1 max-w-[140px]">
                                                                                <MoneyInput
                                                                                    value={unitPrice}
                                                                                    onChange={(val) => updateProductField(index, "unit_price", val)}
                                                                                    className="mb-0"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading pt-1">
                                                                            Total: {formatCurrency(unitPrice * qty)}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleRemoveProduct(prod.product_id || prod.id)}
                                                                        className="w-8 h-8 flex items-center justify-center rounded-full text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                                                    >
                                                                        <TrashIcon size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>

                                                {/* Pagination */}
                                                <Pagination
                                                    currentPage={productsPage}
                                                    totalPages={totalProductsPages}
                                                    onPageChange={setProductsPage}
                                                />
                                            </>
                                        )}
                                    </FadeIn>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        <Button variant="outline" onClick={onBack} disabled={saving} className="flex-1 h-12">
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={saving} className="flex-1 h-12" leftIcon={<SaveIcon size={18} />}>
                            {saving ? "Salvando..." : editData ? "Salvar" : "Criar OS"}
                        </Button>
                    </div>
                </Tabs>
            </div>

            <SelectCustomerSheet
                isOpen={showCustomerSheet}
                onClose={() => setShowCustomerSheet(false)}
                onSelect={handleSelectCustomer}
                partnerId={partnerId}
            />

            <SelectServiceSheet
                open={showServiceSheet}
                onOpenChange={setShowServiceSheet}
                onSelect={handleAddService}
                partnerId={partnerId}
            />

            <SelectProductSheet
                open={showProductSheet}
                onOpenChange={setShowProductSheet}
                onSelect={handleAddProduct}
                partnerId={partnerId}
            />

            <SelectCouponSheet
                isOpen={isCouponSheetOpen}
                onClose={() => setIsCouponSheetOpen(false)}
                partnerId={partnerId}
                subtotal={subtotal}
                selectedCustomerId={customerId || null}
                appliedCouponId={couponId}
                hasWinningDiscount={false}
                onApplyCoupon={async (coupon) => {
                    setCouponCode(coupon.code)
                    setIsApplyingCoupon(true)
                    try {
                        const res = await validateCouponAction({
                            partnerId,
                            code: coupon.code.trim().toUpperCase(),
                            subtotal,
                            customerId: customerId || null,
                        })
                        if (res.valid && res.pricingCoupon) {
                            const c = res.pricingCoupon
                            setCouponId(c.id)
                            setCouponDiscountAmount(Number(res.discountAmount || 0))
                            setDiscountType("coupon")
                            setDiscountValue(0)
                            setCouponPricingData({
                                id: c.id,
                                discountType: c.discountType as any,
                                discountValue: c.discountValue != null ? Number(c.discountValue) : null,
                                maxDiscountValue: c.maxDiscountValue != null ? Number(c.maxDiscountValue) : null,
                                freeShipping: c.freeShipping || false
                            })
                            toast({ description: "Cupom aplicado com sucesso!" })
                        } else {
                            toast({ description: res.errorMessage || "Cupom inválido." })
                            setCouponCode("")
                        }
                    } finally {
                        setIsApplyingCoupon(false)
                    }
                    setIsCouponSheetOpen(false)
                }}
                onRemoveCoupon={async () => {
                    setCouponId(null)
                    setCouponCode("")
                    setCouponDiscountAmount(0)
                    setCouponPricingData(null)
                    setDiscountType("fixed")
                    setDiscountValue(0)
                    toast({ description: "Cupom removido." })
                }}
            />

            <DefaultModal
                isOpen={isDiscountModalOpen}
                onClose={() => setIsDiscountModalOpen(false)}
                title="Aplicar Desconto"
                footer={
                    <div className="flex w-full items-center gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setIsDiscountModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            className="flex-1"
                            isLoading={isApplyingCoupon}
                            onClick={async () => {
                                if (globalDiscountType === "coupon") {
                                    setIsDiscountModalOpen(false)
                                    setIsCouponSheetOpen(true)
                                    return
                                }
                                setDiscountType(globalDiscountType)
                                setDiscountValue(globalDiscountValue)
                                setCouponId(null)
                                setCouponDiscountAmount(0)
                                setCouponPricingData(null)
                                setCouponCode("")
                                setIsDiscountModalOpen(false)
                            }}
                        >
                            Aplicar
                        </Button>
                    </div>
                }
            >
                <div className="space-y-6 pt-2">
                    <InfoCard color="green" title="Valor total de itens" message={formatCurrency(subtotal)} />
                    <div className="grid grid-cols-1 gap-3">
                        <ListItem
                            onClick={() => setGlobalDiscountType("percentage")}
                            icon={TagIcon}
                            title="Porcentagem"
                            description="Aplica um desconto percentual sobre o subtotal"
                            className={`px-4 py-3 gap-4 cursor-pointer border rounded-xl ${globalDiscountType === "percentage" ? "border-brand-primary bg-brand-primary/5" : "border-brand-border dark:border-dark-border"}`}
                            right={
                                <RadioButton
                                    name="globalDiscountType"
                                    value="percentage"
                                    checked={globalDiscountType === "percentage"}
                                    onChange={() => setGlobalDiscountType("percentage")}
                                />
                            }
                        />
                        <ListItem
                            onClick={() => setGlobalDiscountType("fixed")}
                            icon={MoneyIcon}
                            title="Valor fixo"
                            description="Aplica um valor fixo de desconto em reais"
                            className={`px-4 py-3 gap-4 cursor-pointer border rounded-xl ${globalDiscountType === "fixed" ? "border-brand-primary bg-brand-primary/5" : "border-brand-border dark:border-dark-border"}`}
                            right={
                                <RadioButton
                                    name="globalDiscountType"
                                    value="fixed"
                                    checked={globalDiscountType === "fixed"}
                                    onChange={() => setGlobalDiscountType("fixed")}
                                />
                            }
                        />
                        <ListItem
                            onClick={() => setGlobalDiscountType("coupon")}
                            icon={FileIcon}
                            title="Cupom"
                            description="Utiliza um cupom de desconto pré-cadastrado"
                            className={`px-4 py-3 gap-4 cursor-pointer border rounded-xl ${globalDiscountType === "coupon" ? "border-brand-primary bg-brand-primary/5" : "border-brand-border dark:border-dark-border"}`}
                            right={
                                <RadioButton
                                    name="globalDiscountType"
                                    value="coupon"
                                    checked={globalDiscountType === "coupon"}
                                    onChange={() => setGlobalDiscountType("coupon")}
                                />
                            }
                        />
                    </div>
                    {globalDiscountType === "fixed" && (
                        <MoneyInput
                            label="Desconto do pedido"
                            value={globalDiscountValue}
                            onChange={(value: number) => setGlobalDiscountValue(value)}
                        />
                    )}
                    {globalDiscountType === "percentage" && (
                        <div className="space-y-3">
                            <PercentageInput
                                label="Porcentagem a ser aplicada"
                                value={globalDiscountValue}
                                onChange={(value: number) => setGlobalDiscountValue(value)}
                            />
                            <div className="flex flex-wrap gap-3">
                                {[5, 10, 15, 20].map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setGlobalDiscountValue(preset)}
                                        className="h-12 min-w-[72px] rounded-xl border border-transparent bg-gray-100 px-5 text-sm font-bold text-brand-dark transition-colors hover:border-brand-border hover:bg-gray-200 dark:bg-dark-border/30 dark:text-dark-heading dark:hover:bg-dark-border/50"
                                    >
                                        {preset}%
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {globalDiscountType === "coupon" && (
                        <div className="space-y-2">
                            <InfoCard
                                color="gray"
                                title="Cupom de desconto"
                                message="Selecione um cupom na lista de cupons cadastrados."
                            />
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => {
                                    setIsDiscountModalOpen(false)
                                    setIsCouponSheetOpen(true)
                                }}
                            >
                                Ver cupons cadastrados
                            </Button>
                        </div>
                    )}
                </div>
            </DefaultModal>
        </FadeIn>
    )
}
