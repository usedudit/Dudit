"use client"

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react"
import {
    Button, Input, FormSection, DatePicker, ThreeDotsLoader, Tabs, TabsList, TabsTrigger, Badge, IconPlaceholder,
    FormDropdown, TimePicker, MoneyInput, PercentageInput, ListItem, RadioButton, InfoCard, DefaultModal, HourInput, FormTextarea,
    Tooltip
} from "@/components/reusable"
import CustomerCard from "@/components/reusable/CustomerCard"
import Pagination from "@/components/reusable/Pagination"
import QuantitySelector from "@/components/reusable/QuantitySelector"
import { ChevronLeftIcon, SaveIcon, PlusIcon, TrashIcon, WrenchIcon, PackageIcon, UserIcon, TagIcon, MoneyIcon, FileIcon, CheckCircleIcon, EditIcon, SearchIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/reusable/UnsavedChangesDialog"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence, motion } from "framer-motion"
import { useProductBucket, type ProductBucketItem } from "../hooks"
import { fetchPartnerServicesBucket, fetchPartnerProductsBucket, type PartnerServiceBucketItem } from "@/app/actions/erp/client-loaders"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import {
    createServiceOrderAction,
    updateServiceOrderAction,
    addServicesToOrderAction,
    addProductsToOrderAction,
    syncServiceOrderServicesAction,
    syncServiceOrderProductsAction,
    saveServiceOrderSpecificationsAction,
    getPresignedUploadUrlAction,
    saveAttachmentAction,
    deleteAttachmentAction,
} from "@/app/actions/erp/service-orders"
import SpecificationsTab from "./SpecificationsTab"
import AttachmentsTab from "./AttachmentsTab"
import { SERVICE_ORDER_STATUS_META } from "@/lib/types/service-order"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
import SelectServiceSheet from "./SelectServiceSheet"
import SelectProductSheet from "./SelectProductSheet"
import SelectCouponSheet from "@/components/erp/pdv/SelectCouponSheet"
import { validateCouponAction } from "@/app/actions/shared/coupons"
import { getTeamMembers } from "@/app/actions/erp/team"
import { calculateOrderPricing, computeItemDisplayPrice } from "@/lib/services/pricing-engine"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import SelectProductVariantSheet from "@/components/erp/pdv/SelectProductVariantSheet"
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import AlertModal from "@/components/reusable/AlertModal"
import { Package } from "@/lib/icons"

interface ServiceOrderFormProps {
    partnerId: string
    onBack: () => void
    onSaved: (data?: any) => void
    editData?: any
}

const REQUIRED_FIELDS = [
    { field: "title", tab: "general" },
    { field: "customerId", tab: "general" },
    { field: "assignedUserId", tab: "general" },
    { field: "services", tab: "general" },
    { field: "services", tab: "services" },
]

const getLocalDateString = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

const getLocalTimeString = (d: Date) => {
    const hours = String(d.getHours()).padStart(2, "0")
    const minutes = String(d.getMinutes()).padStart(2, "0")
    return `${hours}:${minutes}`
}



export default function ServiceOrderForm({ partnerId, onBack, onSaved, editData }: ServiceOrderFormProps) {
    const { toast } = useToast()
    const [activeTab, setActiveTab] = useState("general")
    const isLocked = editData?.payment_status === "paid" || editData?.payment_status === "partially_paid"

    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())

    const [services, setServices] = useState<any[]>(() => {
        if (!editData?.services) return []
        return editData.services.map((s: any) => ({
            ...s,
            isManual: s.service_id === null || s.service_id === undefined,
            isEditing: false
        }))
    })
    const [products, setProducts] = useState<any[]>(() => {
        if (!editData?.products) return []
        return editData.products.map((p: any) => ({
            ...p,
            isManual: p.product_id === null || p.product_id === undefined,
            isEditing: false
        }))
    })

    const getTabErrorCount = useCallback((tab: string) => {
        let count = 0
        if (tab === "general") {
            if (fieldErrors.has("title")) count++
            if (fieldErrors.has("customerId")) count++
            if (fieldErrors.has("assignedUserId")) count++
            if (fieldErrors.has("services")) count++
        } else if (tab === "services") {
            if (fieldErrors.has("services")) count++
            if (fieldErrors.has("servicesName")) count++
            if (fieldErrors.has("servicesPrice")) count++
        } else if (tab === "products") {
            if (fieldErrors.has("productsName")) count++
            if (fieldErrors.has("productsPrice")) count++
        }
        return count
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
    const [status, setStatus] = useState(editData?.status || "aberta")
    const [priority, setPriority] = useState(editData?.priority || "baixa")
    const [estimatedHours, setEstimatedHours] = useState(editData?.estimated_hours ?? 0)
    const [expectedCompletionTime, setExpectedCompletionTime] = useState(editData?.expected_completion_time || "")
    const [openingDate, setOpeningDate] = useState(() => {
        if (editData?.created_at) {
            return getLocalDateString(new Date(editData.created_at))
        }
        return getLocalDateString(new Date())
    })
    const [openingTime, setOpeningTime] = useState(() => {
        if (editData?.created_at) {
            return getLocalTimeString(new Date(editData.created_at))
        }
        return getLocalTimeString(new Date())
    })
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



    const initialSnapshot = useMemo(() => JSON.stringify({
        title: editData?.title || "",
        description: editData?.description || "",
        internalNotes: editData?.internal_notes || "",
        customerId: editData?.customer_id || "",
        assignedUserId: editData?.assigned_user_id || "",
        status: editData?.status || "aberta",
        priority: editData?.priority || "baixa",
        estimatedHours: editData?.estimated_hours ?? 0,
        expectedCompletionTime: editData?.expected_completion_time || "",
        openingDate: editData?.created_at ? getLocalDateString(new Date(editData.created_at)) : getLocalDateString(new Date()),
        openingTime: editData?.created_at ? getLocalTimeString(new Date(editData.created_at)) : getLocalTimeString(new Date()),
        discountValue: editData?.discount_value || 0,
        discountType: editData?.discount_type || 'fixed',
        couponCode: editData?.coupon_code || "",
        otherCosts: editData?.other_costs || 0,
        services: editData?.services || [],
        products: editData?.products || [],
    }), [editData])

    const currentSnapshot = useMemo(() => JSON.stringify({
        title,
        description,
        internalNotes,
        customerId,
        assignedUserId,
        status,
        priority,
        estimatedHours,
        expectedCompletionTime,
        openingDate,
        openingTime,
        discountValue,
        discountType,
        couponCode,
        otherCosts,
        services,
        products,
    }), [title, description, internalNotes, customerId, assignedUserId, status, priority, estimatedHours, expectedCompletionTime, openingDate, openingTime, discountValue, discountType, couponCode, otherCosts, services, products])

    const servicesBucket = useProductBucket<PartnerServiceBucketItem>(fetchPartnerServicesBucket, { pageSize: 10 })
    const productsBucket = useProductBucket<ProductBucketItem>(fetchPartnerProductsBucket, { pageSize: 10 })

    const serviceSearchRef = useRef<HTMLDivElement>(null)
    const productSearchRef = useRef<HTMLDivElement>(null)
    const [isServiceSearchOpen, setIsServiceSearchOpen] = useState(false)
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (serviceSearchRef.current && !serviceSearchRef.current.contains(event.target as Node)) {
                setIsServiceSearchOpen(false)
            }
            if (productSearchRef.current && !productSearchRef.current.contains(event.target as Node)) {
                setIsProductSearchOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])
    const [attachments, setAttachments] = useState<any[]>(editData?.attachments || [])
    const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<string[]>([])
    const [saving, setSaving] = useState(false)

    const isDirty = !saving && currentSnapshot !== initialSnapshot
    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)
    const handleBack = useCallback(() => handleNavigation(onBack), [handleNavigation, onBack])

    const [showCustomerSheet, setShowCustomerSheet] = useState(false)
    const [showServiceSheet, setShowServiceSheet] = useState(false)
    const [showProductSheet, setShowProductSheet] = useState(false)

    const [selectedProductForVariant, setSelectedProductForVariant] = useState<any>(null)
    const [isVariantSheetOpen, setIsVariantSheetOpen] = useState(false)
    const [activePromotions, setActivePromotions] = useState<any[]>([])

    // Zero-stock confirm modal states
    const [pendingZeroStockItem, setPendingZeroStockItem] = useState<{ product: any; isVariant?: boolean; force?: boolean; callback?: () => void } | null>(null)
    const [showZeroStockAlert, setShowZeroStockAlert] = useState(false)

    useEffect(() => {
        if (!partnerId) return
        listActivePromotionsForMarketplaceAction(partnerId).then(res => {
            if (Array.isArray(res)) setActivePromotions(res)
        }).catch(() => { })
    }, [partnerId])

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
    const pendingSpecsRef = useRef<{ name: string; value: string }[] | null>(null)

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
        if (customerId) {
            setFieldErrors(prev => {
                if (prev.has("customerId")) {
                    const next = new Set(prev)
                    next.delete("customerId")
                    return next
                }
                return prev
            })
        }
    }, [customerId])

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
        if (!customerId) {
            newErrors.add("customerId")
        }
        if (!assignedUserId) {
            newErrors.add("assignedUserId")
        }
        if (services.length === 0) {
            newErrors.add("services")
        }
        const hasEmptyService = services.some(s => s.isManual && (!s.service_name || s.service_name.trim() === ""))
        if (hasEmptyService) {
            newErrors.add("servicesName")
        }
        const hasEmptyServicePrice = services.some(s => s.isManual && (!s.service_price || Number(s.service_price) <= 0))
        if (hasEmptyServicePrice) {
            newErrors.add("servicesPrice")
        }
        const hasEmptyProduct = products.some(p => p.isManual && (!p.product_name || p.product_name.trim() === ""))
        if (hasEmptyProduct) {
            newErrors.add("productsName")
        }
        const hasEmptyProductPrice = products.some(p => p.isManual && (!p.unit_price || Number(p.unit_price) <= 0))
        if (hasEmptyProductPrice) {
            newErrors.add("productsPrice")
        }

        if (newErrors.size > 0) {
            setFieldErrors(newErrors)
            if (hasEmptyService || hasEmptyProduct) {
                toast({ description: "Por favor, preencha o nome de todos os itens manuais." })
            } else if (hasEmptyServicePrice || hasEmptyProductPrice) {
                toast({ description: "Por favor, preencha o preço de todos os itens manuais." })
            } else {
                toast({ description: "Por favor, preencha os campos obrigatórios." })
            }
            if (hasEmptyService || hasEmptyServicePrice) {
                setActiveTab("services")
            } else if (hasEmptyProduct || hasEmptyProductPrice) {
                setActiveTab("products")
            } else {
                setActiveTab("general")
            }
            return
        }

        setSaving(true)

        const [year, month, day] = openingDate.split("-").map(Number)
        const [hour, minute] = openingTime.split(":").map(Number)
        const localDate = new Date(year, month - 1, day, hour, minute, 0)
        const createdAt = localDate.toISOString()

        const payload = {
            title: title.trim(),
            description: description.trim() || "",
            internal_notes: internalNotes.trim() || "",
            customer_id: customerId || null,
            expected_completion_date: expectedDate || null,
            assigned_user_id: assignedUserId || null,
            status,
            priority,
            estimated_hours: estimatedHours || null,
            expected_completion_time: expectedCompletionTime || null,
            discount_value: discountValue,
            discount_type: discountType,
            coupon_id: couponId,
            coupon_code: couponCode || null,
            coupon_discount_amount: effectiveCouponDiscountAmount,
            other_costs: Number(otherCosts || 0),
            created_at: editData ? undefined : createdAt,
        }

        let orderId = editData?.id || ""
        let success = false
        let savedData = null

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
                    service_id: s.isManual ? null : (s.service_id || null),
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
                    product_id: p.isManual ? null : (p.product_id || null),
                    product_name: p.product_name || p.name || "Produto avulso",
                    unit_price: Number(p.unit_price !== undefined ? p.unit_price : (p.price || 0)),
                    quantity: Number(p.quantity || 1),
                    variant_id: p.variant_id || null
                }))
            )
            if (!prodRes.success) {
                toast({ description: prodRes.error || "Erro ao atualizar produtos" })
            }

            success = true
            savedData = res.data
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

            orderId = res.data.id

            // Add services after creation
            if (services.length > 0) {
                const svcRes = await addServicesToOrderAction(
                    partnerId,
                    orderId,
                    services.map((s: any) => ({
                        service_id: s.isManual ? null : (s.service_id || null),
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
                        product_id: p.isManual ? null : (p.product_id || null),
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

            // Save specifications after creation
            if (pendingSpecsRef.current) {
                await saveServiceOrderSpecificationsAction(partnerId, orderId, pendingSpecsRef.current)
                pendingSpecsRef.current = null
            }

            success = true
            savedData = res.data
        }

        if (success && orderId) {
            // Process attachment deletions
            if (deletedAttachmentIds.length > 0) {
                await Promise.all(deletedAttachmentIds.map(async (id) => {
                    try {
                        await deleteAttachmentAction(partnerId, id, orderId)
                    } catch (err) {
                        console.error("Erro ao deletar anexo:", err)
                    }
                }))
            }

            // Process new attachment uploads
            const newAttachments = attachments.filter(att => att.file instanceof File)
            if (newAttachments.length > 0) {
                await Promise.all(newAttachments.map(async (att) => {
                    try {
                        const file = att.file
                        const urlRes = await getPresignedUploadUrlAction(
                            partnerId, "serviceOrderAttachments", file.name, file.type, file.size
                        )
                        if (!urlRes.success) throw new Error(urlRes.error || "Erro ao gerar URL")

                        const uploadRes = await fetch(urlRes.uploadUrl, {
                            method: "PUT",
                            headers: { "Content-Type": file.type },
                            body: file,
                        })
                        if (!uploadRes.ok) throw new Error("Erro ao fazer upload para R2")

                        const saveRes = await saveAttachmentAction(
                            partnerId, orderId, urlRes.key, file.name, file.type, file.size, att.category || "normal"
                        )
                        if (!saveRes.success) throw new Error(saveRes.error || "Erro ao salvar anexo")
                    } catch (err: any) {
                        console.error("Erro ao fazer upload de anexo:", err)
                        toast({ description: `Erro ao fazer upload de ${att.file_name || att.file?.name}` })
                    }
                }))
            }

            if (editData) {
                toast({ description: `OS #${editData.order_number} atualizada com sucesso!` })
            } else {
                toast({ description: `OS criada com sucesso!` })
            }
            onSaved(savedData)
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

            const pricing = computeItemDisplayPrice(
                Number(svc.price || 0),
                svc.promotional_price && Number(svc.promotional_price) < Number(svc.price || 0) ? Number(svc.promotional_price) : null,
                activePromotions,
                { serviceId: svc.id, categoryId: svc.category_id || undefined }
            )

            return [...prev, {
                ...svc,
                service_id: svc.id,
                quantity: 1,
                service_price: pricing.bestPrice,
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

    const proceedAddProduct = (product: any, force?: boolean) => {
        setProducts((prev) => {
            const prodId = product.id
            if (prev.some((p) => (p.product_id || p.id) === prodId)) return prev
            setProductsPage(1)

            const pricing = computeItemDisplayPrice(
                Number(product.price || 0),
                product.promotional_price && Number(product.promotional_price) < Number(product.price || 0) ? Number(product.promotional_price) : null,
                activePromotions,
                { productId: product.id, categoryId: product.category_id || undefined }
            )

            return [...prev, {
                ...product,
                product_id: product.id,
                quantity: 1,
                unit_price: pricing.bestPrice,
                product_name: product.name,
                isManual: false,
                allowSellWithoutStock: force ? true : Boolean(product.allow_sell_without_stock),
            }]
        })
    }

    const handleAddProduct = (prod: any, force?: boolean) => {
        if (prod.has_variants || (prod.variants && prod.variants.length > 0)) {
            setSelectedProductForVariant(prod)
            setIsVariantSheetOpen(true)
        } else {
            if (!force && !prod.allow_sell_without_stock && Number(prod.stock || 0) < 1) {
                setPendingZeroStockItem({ product: prod, callback: () => proceedAddProduct(prod, true) })
                setShowZeroStockAlert(true)
                return
            }
            proceedAddProduct(prod, force)
        }
    }

    const handleVariantsConfirm = (selections: Array<{ variantId: string; qty: number }>) => {
        const newProducts: any[] = []
        selections.forEach(sel => {
            const variant = selectedProductForVariant?.variants?.find((v: any) => String(v.id) === String(sel.variantId))
            if (!variant) return
            if (sel.qty > 0) {
                const cannotSell = !selectedProductForVariant.allow_sell_without_stock && sel.qty > Number(variant.stock || 0)

                const add = (forceBypass?: boolean) => {
                    setProducts(prev => {
                        if (prev.some(p => p.product_id === selectedProductForVariant.id && p.variant_id === variant.id)) return prev

                        const pricing = computeItemDisplayPrice(
                            Number(variant.price || 0),
                            null,
                            activePromotions,
                            { productId: selectedProductForVariant.id, categoryId: selectedProductForVariant.category_id || undefined }
                        )

                        return [...prev, {
                            ...selectedProductForVariant,
                            product_id: selectedProductForVariant.id,
                            variant_id: variant.id,
                            product_name: `${selectedProductForVariant.name} - ${variant.name}`,
                            quantity: sel.qty,
                            unit_price: pricing.bestPrice,
                            isManual: false,
                            image: variant.image || selectedProductForVariant.image,
                            sku: variant.sku || selectedProductForVariant.sku,
                            stock: Number(variant.stock || 0),
                            allowSellWithoutStock: forceBypass ? true : Boolean(selectedProductForVariant.allow_sell_without_stock),
                        }]
                    })
                }

                if (cannotSell) {
                    setPendingZeroStockItem({
                        product: { ...selectedProductForVariant, name: `${selectedProductForVariant.name} - ${variant.name}` },
                        isVariant: true,
                        callback: () => add(true)
                    })
                    setShowZeroStockAlert(true)
                } else {
                    add(false)
                }
            }
        })
        setIsVariantSheetOpen(false)
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
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
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
                                        {!isLocked && (
                                            <Button onClick={handleSave} disabled={saving} leftIcon={<SaveIcon size={18} />}>
                                                {saving ? "Salvando..." : editData ? "Salvar" : "Criar OS"}
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Tabs Navigation */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="general">
                                            Dados gerais
                                            {getTabErrorCount("general") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                        </TabsTrigger>
                                        <TabsTrigger value="services">
                                            Serviços
                                            {getTabErrorCount("services") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                        </TabsTrigger>
                                        <TabsTrigger value="products">
                                            Produtos
                                            {getTabErrorCount("products") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                        </TabsTrigger>
                                        <TabsTrigger value="specifications">
                                            Especificações
                                        </TabsTrigger>
                                        <TabsTrigger value="attachments">
                                            Anexos
                                        </TabsTrigger>
                                        <TabsTrigger value="notes">
                                            Observações
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="px-4 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            {isLocked && (
                                <div className="mb-6">
                                    <InfoCard
                                        title="Ordem de Serviço Bloqueada"
                                        message="Esta Ordem de Serviço possui pagamentos registrados (Parcialmente Paga ou Paga) e não pode mais ser alterada."
                                        color="orange"
                                    />
                                </div>
                            )}
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
                                                    disabled={isLocked}
                                                    error={fieldErrors.has("title")}
                                                    errorMessage={fieldErrors.has("title") ? "O título é obrigatório" : undefined}
                                                />
                                            </FormSection>

                                            <FormSection title="Descrição">
                                                <textarea
                                                    className="w-full min-h-[120px] px-3 py-2 text-sm rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:ring-2 focus:ring-brand-green resize-y disabled:opacity-50"
                                                    placeholder="Descreva o serviço a ser realizado..."
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    disabled={isLocked}
                                                />
                                            </FormSection>

                                            <FormSection title="Agendamento e Responsabilidade">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <DatePicker
                                                        label="Data de abertura"
                                                        value={openingDate}
                                                        onChange={setOpeningDate}
                                                        disabled={isLocked}
                                                        placeholder="Data de hoje"
                                                    />

                                                    <TimePicker
                                                        label="Hora de abertura"
                                                        value={openingTime}
                                                        onChange={(time) => setOpeningTime(time)}
                                                        disabled={isLocked}
                                                        placeholder="Agora"
                                                    />

                                                    <DatePicker
                                                        label="Data prevista de conclusão"
                                                        value={expectedDate}
                                                        onChange={setExpectedDate}
                                                        disabled={isLocked}
                                                        placeholder="Selecionar data"
                                                    />

                                                    <TimePicker
                                                        label="Hora prevista para conclusão"
                                                        value={expectedCompletionTime}
                                                        onChange={(time) => setExpectedCompletionTime(time)}
                                                        disabled={isLocked}
                                                        placeholder="14:30"
                                                    />

                                                    <FormDropdown
                                                        label="Status"
                                                        value={status}
                                                        setValue={(val) => setStatus(val)}
                                                        disabled={isLocked}
                                                        options={Object.entries(SERVICE_ORDER_STATUS_META).map(([value, meta]) => ({
                                                            value,
                                                            label: meta.label,
                                                        }))}
                                                    />

                                                    <FormDropdown
                                                        label="Prioridade"
                                                        value={priority}
                                                        setValue={(val) => setPriority(val)}
                                                        disabled={isLocked}
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
                                                        disabled={isLocked}
                                                        options={teamMembers.map(m => ({
                                                            value: m.userId,
                                                            label: m.fullName || m.email || "Sem Nome",
                                                        }))}
                                                        placeholder="Selecione um responsável"
                                                        error={fieldErrors.has("assignedUserId")}
                                                        errorMessage={fieldErrors.has("assignedUserId") ? "Selecione um responsável" : undefined}
                                                    />

                                                    <HourInput
                                                        label="Tempo Estimado (horas)"
                                                        placeholder="0h 0m"
                                                        value={estimatedHours}
                                                        onChange={(val) => setEstimatedHours(val)}
                                                        disabled={isLocked}
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
                                                        onRemove={isLocked ? undefined : () => {
                                                            setCustomerId("")
                                                            setCustomerName("")
                                                            setSelectedCustomer(null)
                                                        }}
                                                    />
                                                ) : (
                                                    <div
                                                        className={`bg-white dark:bg-dark-surface rounded-2xl border p-8 flex flex-col items-center justify-center text-center relative overflow-hidden mb-6 cursor-pointer transition-colors ${fieldErrors.has("customerId")
                                                            ? "border-brand-red dark:border-brand-red-dark"
                                                            : "border-brand-border dark:border-dark-border"
                                                            }`}
                                                        onClick={isLocked ? undefined : () => setShowCustomerSheet(true)}
                                                    >
                                                        <div className={`absolute top-0 left-0 w-full h-1 ${fieldErrors.has("customerId") ? "bg-brand-red" : "bg-brand-dark dark:bg-dark-border"
                                                            }`}></div>
                                                        <IconPlaceholder
                                                            icon={UserIcon}
                                                            title="Nenhum cliente selecionado"
                                                            subtitle="Selecione um cliente para vincular à ordem de serviço."
                                                            itemButton={isLocked ? undefined : {
                                                                text: "Selecionar Cliente",
                                                                action: () => setShowCustomerSheet(true),
                                                                variant: "outline",
                                                                className: "rounded-full px-8"
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 space-y-6">
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                                    Pagamento
                                                </h3>

                                                <div className="space-y-4">
                                                    <ListItem
                                                        icon={TagIcon}
                                                        title="Aplicar desconto"
                                                        description={couponId || discountValue > 0 ? "Desconto e/ou cupom aplicado" : "Escolha o tipo e aplique na OS"}
                                                        onClick={isLocked ? undefined : () => setIsDiscountModalOpen(true)}
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
                                        <FormTextarea
                                            label="Observações internas"
                                            placeholder="Anotações internas (não visíveis ao cliente)..."
                                            value={internalNotes}
                                            onChange={(e) => setInternalNotes(e.target.value)}
                                            name="internalNotes"
                                        />
                                    </FadeIn>
                                )}

                                {activeTab === "services" && (
                                    <FadeIn key="services" className="space-y-6 w-full">
                                        <div className="flex items-center justify-between mb-4">
                                            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Serviços da OS</h2>
                                        </div>

                                        <div ref={serviceSearchRef} className="relative mb-6">
                                            <Input
                                                label=""
                                                name="serviceSearch"
                                                placeholder={isLocked ? "OS bloqueada para edições" : "Buscar serviços para adicionar..."}
                                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                                disabled={isLocked}
                                                value={servicesBucket.searchQuery}
                                                onChange={(e) => {
                                                    servicesBucket.setSearchQuery(e.target.value)
                                                    setIsServiceSearchOpen(true)
                                                }}
                                                onFocus={() => {
                                                    setIsServiceSearchOpen(true)
                                                    servicesBucket.loadBucket()
                                                }}
                                                variant="full-rounded"
                                            />

                                            <AnimatePresence>
                                                {isServiceSearchOpen && servicesBucket.searchQuery && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: 5 }}
                                                        className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-xl z-[9999] max-h-72 overflow-y-auto custom-scrollbar"
                                                        onScroll={(e) => {
                                                            const target = e.currentTarget
                                                            if (target.scrollHeight - target.scrollTop - target.clientHeight < 20) {
                                                                servicesBucket.loadMore()
                                                            }
                                                        }}
                                                    >
                                                        {servicesBucket.isLoading ? (
                                                            <ThreeDotsLoader />
                                                        ) : servicesBucket.filteredResults.length > 0 ? (
                                                            servicesBucket.filteredResults.map(svc => (
                                                                <div
                                                                    key={svc.id}
                                                                    onClick={() => {
                                                                        handleAddService(svc)
                                                                        servicesBucket.setSearchQuery("")
                                                                        setIsServiceSearchOpen(false)
                                                                    }}
                                                                    className="flex items-center gap-4 p-3.5 hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0 transition-colors"
                                                                >
                                                                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/50 overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                                                                        {svc.image ? (
                                                                            <img
                                                                                src={getR2ImageUrl(svc.image, "thumbnail")}
                                                                                alt=""
                                                                                className="w-full h-full object-cover"
                                                                            />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center">
                                                                                <WrenchIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{svc.name}</div>
                                                                    </div>
                                                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{(() => { const pr = computeItemDisplayPrice(Number(svc.price || 0), (svc as any).promotional_price && Number((svc as any).promotional_price) < Number(svc.price || 0) ? Number((svc as any).promotional_price) : null, activePromotions, { serviceId: svc.id }); return (<div className="flex items-center gap-1.5">{pr.referencePrice && <span className="text-xs text-brand-inactive-text line-through">{formatCurrency(pr.referencePrice)}</span>}<span className="text-sm font-bold">{formatCurrency(pr.bestPrice)}</span>{pr.badgeVariant === "blue" && <Badge variant="blue" icon={null} className="whitespace-nowrap">-{pr.discountPercent}%</Badge>}{pr.badgeVariant === "orange" && <Badge variant="orange" icon={null} className="whitespace-nowrap">-{pr.discountPercent}%</Badge>}</div>) })()}</div>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="p-4 text-center text-sm text-brand-inactive-text">Nenhum serviço encontrado.</div>
                                                        )}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        {services.length === 0 ? (
                                            <div className="w-full flex-col flex items-center justify-center py-12">
                                                <IconPlaceholder
                                                    icon={WrenchIcon}
                                                    title="Nenhum serviço adicionado"
                                                    subtitle="Busque serviços no campo acima ou adicione um serviço avulso manualmente."
                                                    itemButton={isLocked ? undefined : {
                                                        text: "Adicionar serviço manual",
                                                        action: addBlankService,
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
                                                                const unitPrice = svc.service_price !== undefined ? svc.service_price : (svc.price || 0)
                                                                const qty = svc.quantity || 1
                                                                const hasNameError = !svc.service_name || svc.service_name.trim() === ""
                                                                return (
                                                                    <tr key={svc.service_id || svc.id || index} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                                                        <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                                                            <div className="flex items-center gap-3">
                                                                                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                                                                    {svc.image ? (
                                                                                        <img
                                                                                            src={getR2ImageUrl(svc.image, "thumbnail")}
                                                                                            alt=""
                                                                                            className="w-full h-full object-cover"
                                                                                        />
                                                                                    ) : (
                                                                                        <WrenchIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                                                    )}
                                                                                </div>
                                                                                {svc.isEditing ? (
                                                                                    <div className="mb-0 flex-1">
                                                                                        <Input
                                                                                            value={svc.service_name || ""}
                                                                                            onChange={(e: any) => updateServiceField(index, "service_name", e.target.value)}
                                                                                            placeholder="Nome do serviço manual..."
                                                                                            className="mb-0"
                                                                                            error={hasNameError}
                                                                                            errorMessage={hasNameError ? "Nome obrigatório" : undefined}
                                                                                        />
                                                                                    </div>
                                                                                ) : (
                                                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                                                        {svc.service_name || "Serviço sem nome"}
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
                                                                                    disabled={isLocked}
                                                                                />
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-center font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                            <div className="flex justify-center">
                                                                                <QuantitySelector
                                                                                    value={qty}
                                                                                    onChange={(val) => updateServiceField(index, "quantity", val)}
                                                                                    size="md"
                                                                                    disabled={isLocked}
                                                                                />
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-right font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                                            {formatCurrency(unitPrice * qty)}
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                                            <div className="flex justify-center gap-2">
                                                                                {svc.isEditing ? (
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            if (svc.service_name && svc.service_name.trim() !== '') {
                                                                                                updateServiceField(index, "isEditing", false)
                                                                                            }
                                                                                        }}
                                                                                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-green-50 dark:hover:bg-green-900/10 text-brand-green transition-colors"
                                                                                        title="Confirmar"
                                                                                    >
                                                                                        <CheckCircleIcon size={18} />
                                                                                    </button>
                                                                                ) : svc.isManual ? (
                                                                                    <button
                                                                                        onClick={isLocked ? undefined : () => updateServiceField(index, "isEditing", true)}
                                                                                         disabled={isLocked}
                                                                                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                                                        title="Editar"
                                                                                    >
                                                                                        <EditIcon size={18} />
                                                                                    </button>
                                                                                ) : null}
                                                                                <button
                                                                                    onClick={isLocked ? undefined : () => handleRemoveService(svc.service_id || svc.id)}
                                                                                     disabled={isLocked}
                                                                                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/10 text-brand-red transition-colors"
                                                                                    title="Remover"
                                                                                >
                                                                                    <TrashIcon size={18} />
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
                                                        const unitPrice = svc.service_price !== undefined ? svc.service_price : (svc.price || 0)
                                                        const qty = svc.quantity || 1
                                                        const hasNameError = !svc.service_name || svc.service_name.trim() === ""
                                                        return (
                                                            <div key={svc.service_id || svc.id || index} className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-4">
                                                                <div className="flex items-start gap-4">
                                                                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                                                        {svc.image ? (
                                                                            <img
                                                                                src={getR2ImageUrl(svc.image, "thumbnail")}
                                                                                alt=""
                                                                                className="w-full h-full object-cover"
                                                                            />
                                                                        ) : (
                                                                            <WrenchIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0 text-left space-y-2">
                                                                        {svc.isEditing ? (
                                                                            <div className="mb-0 flex-1">
                                                                                <Input
                                                                                    value={svc.service_name || ""}
                                                                                    onChange={(e: any) => updateServiceField(index, "service_name", e.target.value)}
                                                                                    placeholder="Nome do serviço manual..."
                                                                                    className="mb-0"
                                                                                    error={hasNameError}
                                                                                    errorMessage={hasNameError ? "Nome obrigatório" : undefined}
                                                                                />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="font-bold text-[14px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                                                {svc.service_name || "Serviço sem nome"}
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
                                                                                    disabled={isLocked}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading pt-1">
                                                                            Total: {formatCurrency(unitPrice * qty)}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-col gap-2">
                                                                        {svc.isEditing ? (
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (svc.service_name && svc.service_name.trim() !== '') {
                                                                                        updateServiceField(index, "isEditing", false)
                                                                                    }
                                                                                }}
                                                                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-green-50 dark:hover:bg-green-900/10 text-brand-green transition-colors"
                                                                            >
                                                                                <CheckCircleIcon size={14} />
                                                                            </button>
                                                                        ) : svc.isManual ? (
                                                                            <button
                                                                                onClick={isLocked ? undefined : () => updateServiceField(index, "isEditing", true)}
                                                                                         disabled={isLocked}
                                                                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark transition-colors"
                                                                            >
                                                                                <EditIcon size={14} />
                                                                            </button>
                                                                        ) : null}
                                                                        <button
                                                                            onClick={isLocked ? undefined : () => handleRemoveService(svc.service_id || svc.id)}
                                                                                     disabled={isLocked}
                                                                            className="w-8 h-8 flex items-center justify-center rounded-full text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                                                        >
                                                                            <TrashIcon size={14} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>

                                                {/* Add Item Link at the bottom of the list */}
                                                <Button
                                                    type="button"
                                                    variant="link"
                                                    onClick={addBlankService}
                                                    className="pl-0 mt-2"
                                                    disabled={isLocked}
                                                >
                                                    <PlusIcon size={14} strokeWidth={3} />
                                                    Adicionar serviço manual
                                                </Button>

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
                                        <div className="flex items-center justify-between mb-4">
                                            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Produtos da OS</h2>
                                        </div>

                                        <div ref={productSearchRef} className="relative mb-6">
                                            <Input
                                                label=""
                                                name="productSearch"
                                                placeholder={isLocked ? "OS bloqueada para edições" : "Buscar produtos para adicionar..."}
                                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                                disabled={isLocked}
                                                value={productsBucket.searchQuery}
                                                onChange={(e) => {
                                                    productsBucket.setSearchQuery(e.target.value)
                                                    setIsProductSearchOpen(true)
                                                }}
                                                onFocus={() => {
                                                    setIsProductSearchOpen(true)
                                                    productsBucket.loadBucket()
                                                }}
                                                variant="full-rounded"
                                            />

                                            <AnimatePresence>
                                                {isProductSearchOpen && productsBucket.searchQuery && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: 5 }}
                                                        className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-xl z-[9999] max-h-72 overflow-y-auto custom-scrollbar"
                                                        onScroll={(e) => {
                                                            const target = e.currentTarget
                                                            if (target.scrollHeight - target.scrollTop - target.clientHeight < 20) {
                                                                productsBucket.loadMore()
                                                            }
                                                        }}
                                                    >
                                                        {productsBucket.isLoading ? (
                                                            <ThreeDotsLoader />
                                                        ) : productsBucket.filteredResults.length > 0 ? (
                                                            productsBucket.filteredResults.map(prod => (
                                                                <div
                                                                    key={prod.id}
                                                                    onClick={() => {
                                                                        handleAddProduct(prod)
                                                                        productsBucket.setSearchQuery("")
                                                                        setIsProductSearchOpen(false)
                                                                    }}
                                                                    className="flex items-center gap-4 p-3.5 hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0 transition-colors"
                                                                >
                                                                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/50 overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                                                                        <img src={getR2ImageUrl(prod.image, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"} alt={prod.name} className="w-full h-full object-cover rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{prod.name}</div>
                                                                        <div className="text-[11px] font-medium text-brand-inactive-text mt-0.5 tracking-wider uppercase truncate">{prod.sku}</div>
                                                                    </div>
                                                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{(() => { const pr = computeItemDisplayPrice(Number(prod.price || 0), (prod as any).promotional_price && Number((prod as any).promotional_price) < Number(prod.price || 0) ? Number((prod as any).promotional_price) : null, activePromotions, { productId: prod.id, categoryId: (prod as any).category_id || undefined }); return (<div className="flex items-center gap-1.5">{pr.referencePrice && <span className="text-xs text-brand-inactive-text line-through">{formatCurrency(pr.referencePrice)}</span>}<span className="text-sm font-bold">{formatCurrency(pr.bestPrice)}</span>{pr.badgeVariant === "blue" && <Badge variant="blue" icon={null} className="whitespace-nowrap">-{pr.discountPercent}%</Badge>}{pr.badgeVariant === "orange" && <Badge variant="orange" icon={null} className="whitespace-nowrap">-{pr.discountPercent}%</Badge>}</div>) })()}</div>
                                                                        <div className="text-xs font-bold text-white bg-brand-dark dark:bg-brand-green px-2 py-1 rounded-md whitespace-nowrap">
                                                                            {prod.stock} em estoque
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="p-4 text-center text-sm text-brand-inactive-text">Nenhum produto encontrado.</div>
                                                        )}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        {products.length === 0 ? (
                                            <div className="w-full flex-col flex items-center justify-center py-12">
                                                <IconPlaceholder
                                                    icon={PackageIcon}
                                                    title="Nenhum produto adicionado"
                                                    subtitle="Busque produtos no campo acima ou adicione um produto avulso manualmente."
                                                    itemButton={isLocked ? undefined : {
                                                        text: "Adicionar produto manual",
                                                        action: addBlankProduct,
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
                                                                const unitPrice = prod.unit_price !== undefined ? prod.unit_price : (prod.price || 0)
                                                                const qty = prod.quantity || 1
                                                                const hasNameError = !prod.product_name || prod.product_name.trim() === ""
                                                                return (
                                                                    <tr key={prod.product_id || prod.id || index} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                                                        <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                                                            <div className="flex items-center gap-3">
                                                                                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                                                                    {(() => {
                                                                                        const img = prod.image || (prod.images && prod.images.length > 0 ? prod.images[0] : null)
                                                                                        if (img) {
                                                                                            return (
                                                                                                <img
                                                                                                    src={getR2ImageUrl(img, "thumbnail")}
                                                                                                    alt=""
                                                                                                    className="w-full h-full object-cover"
                                                                                                />
                                                                                            )
                                                                                        }
                                                                                        return <PackageIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                                                    })()}
                                                                                </div>
                                                                                {prod.isEditing ? (
                                                                                    <div className="mb-0 flex-1">
                                                                                        <Input
                                                                                            value={prod.product_name || ""}
                                                                                            onChange={(e: any) => updateProductField(index, "product_name", e.target.value)}
                                                                                            placeholder="Nome do produto manual..."
                                                                                            className="mb-0"
                                                                                            error={hasNameError}
                                                                                            errorMessage={hasNameError ? "Nome obrigatório" : undefined}
                                                                                        />
                                                                                    </div>
                                                                                ) : (
                                                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                                                        {prod.product_name || "Produto sem nome"}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                                            <div className="w-[140px]">
                                                                                <MoneyInput
                                                                                    value={unitPrice}
                                                                                    onChange={(val) => updateProductField(index, "unit_price", val)}
                                                                                    className="mb-0"
                                                                                    disabled={isLocked}
                                                                                />
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-center font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                            <div className="flex justify-center items-center gap-1.5">
                                                                                <QuantitySelector
                                                                                    value={qty}
                                                                                    onChange={(val) => updateProductField(index, "quantity", val)}
                                                                                    size="md"
                                                                                    disabled={isLocked}
                                                                                />
                                                                                {!prod.isManual && Number(prod.stock || 0) <= 0 && (
                                                                                    <Tooltip text="Produto sem estoque disponível no momento">
                                                                                        <Badge
                                                                                            variant="orange"
                                                                                            icon={<Package size={14} />}
                                                                                            className="shrink-0"
                                                                                        />
                                                                                    </Tooltip>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-right font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                                            {formatCurrency(unitPrice * qty)}
                                                                        </td>
                                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                                            <div className="flex justify-center gap-2">
                                                                                {prod.isEditing ? (
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            if (prod.product_name && prod.product_name.trim() !== '') {
                                                                                                updateProductField(index, "isEditing", false)
                                                                                            }
                                                                                        }}
                                                                                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-green-50 dark:hover:bg-green-900/10 text-brand-green transition-colors"
                                                                                        title="Confirmar"
                                                                                    >
                                                                                        <CheckCircleIcon size={18} />
                                                                                    </button>
                                                                                ) : prod.isManual ? (
                                                                                    <button
                                                                                        onClick={isLocked ? undefined : () => updateProductField(index, "isEditing", true)}
                                                                                         disabled={isLocked}
                                                                                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                                                        title="Editar"
                                                                                    >
                                                                                        <EditIcon size={18} />
                                                                                    </button>
                                                                                ) : null}
                                                                                <button
                                                                                    onClick={isLocked ? undefined : () => handleRemoveProduct(prod.product_id || prod.id)}
                                                                                    disabled={isLocked}
                                                                                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/10 text-brand-red transition-colors"
                                                                                    title="Remover"
                                                                                >
                                                                                    <TrashIcon size={18} />
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
                                                        const unitPrice = prod.unit_price !== undefined ? prod.unit_price : (prod.price || 0)
                                                        const qty = prod.quantity || 1
                                                        const hasNameError = !prod.product_name || prod.product_name.trim() === ""
                                                        return (
                                                            <div key={prod.product_id || prod.id || index} className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-4">
                                                                <div className="flex items-start gap-4">
                                                                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                                                        {(() => {
                                                                            const img = prod.image || (prod.images && prod.images.length > 0 ? prod.images[0] : null)
                                                                            if (img) {
                                                                                return (
                                                                                    <img
                                                                                        src={getR2ImageUrl(img, "thumbnail")}
                                                                                        alt=""
                                                                                        className="w-full h-full object-cover"
                                                                                    />
                                                                                )
                                                                            }
                                                                            return <PackageIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                                        })()}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0 text-left space-y-2">
                                                                        {prod.isEditing ? (
                                                                            <div className="mb-0 flex-1">
                                                                                <Input
                                                                                    value={prod.product_name || ""}
                                                                                    onChange={(e: any) => updateProductField(index, "product_name", e.target.value)}
                                                                                    placeholder="Nome do produto manual..."
                                                                                    className="mb-0"
                                                                                    error={hasNameError}
                                                                                    errorMessage={hasNameError ? "Nome obrigatório" : undefined}
                                                                                />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="font-bold text-[14px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                                                {prod.product_name || "Produto sem nome"}
                                                                            </div>
                                                                        )}
                                                                        <div className="flex items-center gap-4 mt-2">
                                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                                <QuantitySelector
                                                                                    value={qty}
                                                                                    onChange={(val) => updateProductField(index, "quantity", val)}
                                                                                    size="sm"
                                                                                />
                                                                                {!prod.isManual && Number(prod.stock || 0) <= 0 && (
                                                                                    <Tooltip text="Produto sem estoque disponível no momento">
                                                                                        <Badge
                                                                                            variant="orange"
                                                                                            icon={<Package size={12} />}
                                                                                            className="shrink-0"
                                                                                        />
                                                                                    </Tooltip>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex-1 max-w-[140px]">
                                                                                <MoneyInput
                                                                                    value={unitPrice}
                                                                                    onChange={(val) => updateProductField(index, "unit_price", val)}
                                                                                    className="mb-0"
                                                                                    disabled={isLocked}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading pt-1">
                                                                            Total: {formatCurrency(unitPrice * qty)}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-col gap-2">
                                                                        {prod.isEditing ? (
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (prod.product_name && prod.product_name.trim() !== '') {
                                                                                        updateProductField(index, "isEditing", false)
                                                                                    }
                                                                                }}
                                                                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-green-50 dark:hover:bg-green-900/10 text-brand-green transition-colors"
                                                                            >
                                                                                <CheckCircleIcon size={14} />
                                                                            </button>
                                                                        ) : prod.isManual ? (
                                                                            <button
                                                                                onClick={isLocked ? undefined : () => updateProductField(index, "isEditing", true)}
                                                                                         disabled={isLocked}
                                                                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark transition-colors"
                                                                            >
                                                                                <EditIcon size={14} />
                                                                            </button>
                                                                        ) : null}
                                                                        <button
                                                                            onClick={isLocked ? undefined : () => handleRemoveProduct(prod.product_id || prod.id)}
                                                                                    disabled={isLocked}
                                                                            className="w-8 h-8 flex items-center justify-center rounded-full text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                                                        >
                                                                            <TrashIcon size={14} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>

                                                {/* Add Item Link at the bottom of the list */}
                                                <Button
                                                    type="button"
                                                    variant="link"
                                                    onClick={addBlankProduct}
                                                    className="pl-0 mt-2"
                                                >
                                                    <PlusIcon size={14} strokeWidth={3} />
                                                    Adicionar produto manual
                                                </Button>

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

                                {activeTab === "specifications" && (
                                    <FadeIn key="specifications" className="space-y-6 w-full">
                                        <SpecificationsTab
                                            partnerId={partnerId}
                                            serviceOrderId={editData?.id || ""}
                                            specifications={editData?.specifications || []}
                                            isEditing={true}
                                            onSave={async (specs) => {
                                                if (editData?.id) {
                                                    const res = await saveServiceOrderSpecificationsAction(partnerId, editData.id, specs)
                                                    if (!res.success) throw new Error(res.error)
                                                } else {
                                                    pendingSpecsRef.current = specs
                                                }
                                            }}
                                        />
                                    </FadeIn>
                                )}

                                {activeTab === "attachments" && (
                                    <FadeIn key="attachments" className="space-y-6 w-full">
                                        <AttachmentsTab
                                            partnerId={partnerId}
                                            serviceOrderId={editData?.id || ""}
                                            attachments={attachments}
                                            isEditing={true}
                                            onChange={(newAtts, deletedIds) => {
                                                setAttachments(newAtts)
                                                if (deletedIds && deletedIds.length > 0) {
                                                    setDeletedAttachmentIds(prev => [
                                                        ...prev,
                                                        ...deletedIds.filter(id => !prev.includes(id))
                                                    ])
                                                }
                                            }}
                                        />
                                    </FadeIn>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        <Button variant="outline" onClick={handleBack} disabled={saving} className="flex-1 h-12">
                            {isLocked ? "Voltar" : "Cancelar"}
                        </Button>
                        {!isLocked && (
                            <Button onClick={handleSave} disabled={saving} className="flex-1 h-12" leftIcon={<SaveIcon size={18} />}>
                                {saving ? "Salvando..." : editData ? "Salvar" : "Criar OS"}
                            </Button>
                        )}
                    </div>
                </Tabs>
            </div>

            <SelectCustomerSheet
                isOpen={showCustomerSheet}
                onClose={() => setShowCustomerSheet(false)}
                onSelect={handleSelectCustomer}
                partnerId={partnerId}
                selectedCustomerId={customerId || undefined}
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
                        <div className="space-y-2 border-t pt-6">
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

            <UnsavedChangesDialog
                open={showConfirmDialog}
                onConfirm={confirmNavigation}
                onCancel={cancelNavigation}
            />

            <SelectProductVariantSheet
                isOpen={isVariantSheetOpen}
                onClose={() => setIsVariantSheetOpen(false)}
                product={selectedProductForVariant}
                onConfirm={handleVariantsConfirm}
            />

            <AlertModal
                isOpen={showZeroStockAlert}
                onClose={() => setShowZeroStockAlert(false)}
                onConfirm={() => {
                    setShowZeroStockAlert(false)
                    pendingZeroStockItem?.callback?.()
                    setPendingZeroStockItem(null)
                }}
                title="Produto sem estoque"
                message={`O produto "${pendingZeroStockItem?.product?.product_name || pendingZeroStockItem?.product?.name || ''}" está sem estoque. Deseja adicionar mesmo assim?`}
                confirmText="Adicionar"
                variant="warning"
            />

            <SavingStatusModal isOpen={saving} text="Salvando ordem de serviço..." />
        </FadeIn>
    )
}
