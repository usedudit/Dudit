"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, AlertModal, ThreeDotsLoader } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { useToast } from "@/components/ui/use-toast"
import { useNotification } from "@/hooks/use-notification"
import { createERPOrderAction, getOrderDetailsAction, updateERPOrderAction } from "@/app/actions/erp/orders"
import SelectCustomerSheet from "../clientes/SelectCustomerSheet"
import SelectVariantSheet from "../quotes/SelectVariantSheet"
import { fetchPartnerProductsBucket } from "@/app/actions/erp/client-loaders"
import { useProductBucket } from "../hooks"
import { useRouter } from "next/navigation"
import PaymentModal from "./PaymentModal"
import { useCSRFToken } from "@/hooks/use-csrf-token"

// Tabs
import { OrderGeneralTab } from "./OrderGeneralTab"
import { AddressTab } from "./AddressTab"
import { OrderObservationsTab } from "./OrderObservationsTab"
import { FadeIn } from "@/components/animations/FadeIn"

interface CreateOrderProps {
    onBack: () => void
    partnerId: string
    editOrderId?: string
}

const REQUIRED_FIELDS = [
    { field: "productSearch", tab: "general" },
    { field: "manualItemNames", tab: "general" },
    { field: "manualItemPrices", tab: "general" },
]

export default function CreateOrder({ onBack, partnerId, editOrderId }: CreateOrderProps) {
    const { toast } = useToast()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const router = useRouter()
    const csrfToken = useCSRFToken()

    // --- State ---
    const [isLoadingData, setIsLoadingData] = useState(!!editOrderId)
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())
    const [manualItemNameErrors, setManualItemNameErrors] = useState<Set<number>>(new Set())
    const [manualItemPriceErrors, setManualItemPriceErrors] = useState<Set<number>>(new Set())
    const [inventoryAlreadyDeducted, setInventoryAlreadyDeducted] = useState(false)
    const [originalPaymentStatus, setOriginalPaymentStatus] = useState<'paid' | 'partially_paid' | 'unpaid'>("unpaid")
    const [originalPaidAmount, setOriginalPaidAmount] = useState(0)
    const [originalPaymentMethod, setOriginalPaymentMethod] = useState("Não informado")

    // Form State
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
    const [salesChannel, setSalesChannel] = useState("Venda Direta")
    const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>("pickup")
    const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partially_paid' | 'unpaid'>("unpaid")
    const [deliveryStatus, setDeliveryStatus] = useState('not_sent')

    // items
    const [items, setItems] = useState<any[]>([])

    // Instant product search (client-side bucket)
    const productBucket = useProductBucket(fetchPartnerProductsBucket)
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)

    // Financial
    const [shippingFee, setShippingFee] = useState("0")
    const [otherCosts, setOtherCosts] = useState("0")
    const [discountValue, setDiscountValue] = useState(0)
    const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed')

    // Address / Delivery
    const [cep, setCep] = useState("")
    const [street, setStreet] = useState("")
    const [number, setNumber] = useState("")
    const [complement, setComplement] = useState("")
    const [neighborhood, setNeighborhood] = useState("")
    const [city, setCity] = useState("")
    const [uf, setUf] = useState("SP")
    const [noNumber, setNoNumber] = useState(false)

    // Observações
    const [notes, setNotes] = useState("")

    // Modals
    const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false)
    const [isVariantSheetOpen, setIsVariantSheetOpen] = useState(false)
    const [selectedProductForVariant, setSelectedProductForVariant] = useState<any>(null)
    const [showAlertModal, setShowAlertModal] = useState(false)
    const [showValidationModal, setShowValidationModal] = useState(false)
    const [validationMessage, setValidationMessage] = useState("")
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [wasSaleSuccessful, setWasSaleSuccessful] = useState(false)

    // --- Calculations ---
    const subtotal = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
    }, [items])

    const discountAmount = useMemo(() => {
        if (discountType === 'percentage') {
            return (subtotal * discountValue) / 100
        }
        return discountValue
    }, [subtotal, discountValue, discountType])

    const totalAmount = useMemo(() => {
        return subtotal - discountAmount + parseFloat(shippingFee || "0") + parseFloat(otherCosts || "0")
    }, [subtotal, discountAmount, shippingFee, otherCosts])

    const remainingAmount = useMemo(() => {
        return Math.max(0, totalAmount - originalPaidAmount)
    }, [totalAmount, originalPaidAmount])

    const primaryActionLabel = editOrderId ? "Salvar" : "Finalizar Venda"

    const normalizeSalesChannel = useCallback((value?: string | null) => {
        if (!value) return "Venda Direta"
        if (value === "Direct Sales") return "Venda Direta"
        if (value === "Online Store") return "Loja Online"
        return value
    }, [])

    // --- Effects ---
    useEffect(() => {
        if (!editOrderId) return
        async function load() {
            setIsLoadingData(true)
            const res = await getOrderDetailsAction(editOrderId!, partnerId)
            if (res.success && res.data) {
                const order = res.data
                setSelectedCustomer(order.buyer_id ? { id: order.buyer_id, name: order.customer_name } : null)
                setOrderDate(order.created_at.split('T')[0])
                setSalesChannel(normalizeSalesChannel(order.order_source))
                setDeliveryMethod(order.delivery_type as any || "pickup")
                const normalizedStatus = order.situation === "paid" ? "paid" : order.situation === "partially_paid" ? "partially_paid" : "unpaid"
                setPaymentStatus(normalizedStatus)
                setOriginalPaymentStatus(normalizedStatus)
                setOriginalPaidAmount(Number(order.paid_amount || 0))
                setOriginalPaymentMethod(order.payment_method || "Não informado")
                setDeliveryStatus(order.delivery_status || "not_sent")
                setNotes(order.notes || "")
                setShippingFee((order.shipping_cost || 0).toString())
                setOtherCosts((order.additional_costs || 0).toString())
                setDiscountValue(order.discount_value || 0)
                setDiscountType(order.discount_type || "fixed")
                setInventoryAlreadyDeducted(Boolean(order.inventory_deducted))

                if (order.order_items) {
                    setItems(order.order_items.map((item: any) => ({
                        id: item.id || Math.random().toString(36).substr(2, 9),
                        productId: item.product_id,
                        variantId: item.variant_id || null,
                        name: item.product_name,
                        unitPrice: Number(item.product_price),
                        quantity: Number(item.quantity),
                        sortOrder: Number(item.sort_order ?? 0),
                        image: item.product_variants?.image || item.products?.images?.[0] || item.image || item.product?.image || null,
                        sku: item.product_variants?.sku || item.sku || item.product?.sku || item.products?.sku || "",
                        stock: Number(item.product_variants?.stock_available ?? item.product_variants?.stock_quantity ?? item.products?.stock_available ?? item.products?.stock_quantity ?? 0),
                        allowSellWithoutStock: Boolean(item.products?.allow_sell_without_stock),
                        isEditing: false,
                        isManual: !item.product_id
                    })))
                }

                if (order.delivery_address) {
                    // try to parse if possible, or just dump to street, but complex logic can be brittle.
                    // string format: "street, number (complement), neighborhood, city - state, zipcode"
                    // we'll leave it empty for forms right now as splitting perfectly is hard and might overwrite
                    const addressParts = order.delivery_address.split(',')
                    if (addressParts.length >= 4) {
                        setStreet(addressParts[0].trim())
                        // rudimentary extraction just so fields aren't completely blank
                    }
                }
            } else {
                notifyError("Erro ao carregar pedido", res.error)
            }
            setIsLoadingData(false)
        }
        load()
    }, [editOrderId, partnerId, notifyError, normalizeSalesChannel])

    // --- Handlers ---
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const handleBack = () => {
        if (items.length > 0 || selectedCustomer) {
            setShowAlertModal(true)
        } else {
            onBack()
        }
    }

    const getItemMaxQuantity = useCallback((item: any) => {
        if (!item || item.isManual || item.allowSellWithoutStock) return undefined
        if (inventoryAlreadyDeducted) {
            return Math.max(0, Number(item.stock ?? 0) + Number(item.quantity ?? 0))
        }
        return Math.max(0, Number(item.stock ?? 0))
    }, [inventoryAlreadyDeducted])

    const validateStockAvailability = useCallback((targetItems: any[]) => {
        if (inventoryAlreadyDeducted) return null
        const stockMap = new Map<string, { name: string; quantity: number; stock: number; allowSellWithoutStock: boolean }>()

        for (const item of targetItems) {
            if (!item?.productId || item.isManual) continue
            const key = item.variantId ? `variant:${item.variantId}` : `product:${item.productId}`
            const existing = stockMap.get(key)

            if (existing) {
                existing.quantity += Number(item.quantity || 0)
                continue
            }

            stockMap.set(key, {
                name: item.name || "Produto",
                quantity: Number(item.quantity || 0),
                stock: Number(item.stock ?? 0),
                allowSellWithoutStock: Boolean(item.allowSellWithoutStock),
            })
        }

        for (const entry of stockMap.values()) {
            if (entry.allowSellWithoutStock) continue
            if (entry.quantity > entry.stock) {
                return `A quantidade de "${entry.name}" está maior que o estoque disponível.`
            }
        }

        return null
    }, [inventoryAlreadyDeducted])

    const addProductToOrder = (product: any) => {
        if (product.has_variants) {
            setSelectedProductForVariant(product)
            setIsVariantSheetOpen(true)
        } else {
            if (!product.allow_sell_without_stock && Number(product.stock || 0) < 1) {
                notifyError(`"${product.name}" está sem estoque disponível.`)
                return
            }
            const newItem = {
                id: Math.random().toString(36).substr(2, 9),
                productId: product.id,
                name: product.name,
                unitPrice: product.price,
                quantity: 1,
                sortOrder: items.length,
                image: product.image,
                sku: product.sku,
                stock: Number(product.stock || 0),
                allowSellWithoutStock: Boolean(product.allow_sell_without_stock),
                isEditing: false,
                isManual: false
            }
            setItems([...items, newItem])
            setFieldErrors(prev => {
                const next = new Set(prev)
                next.delete("productSearch")
                return next
            })
            productBucket.setSearchQuery("")
        }
    }

    const handleVariantsConfirm = (variants: any[]) => {
        const newItems: any[] = []
        variants.forEach(variant => {
            if (variant.qty > 0) {
                if (!selectedProductForVariant.allow_sell_without_stock && variant.qty > Number(variant.stock || 0)) {
                    return
                }
                const newItem = {
                    id: Math.random().toString(36).substr(2, 9),
                    productId: selectedProductForVariant.id,
                    variantId: variant.id,
                    name: `${selectedProductForVariant.name} - ${variant.name}`,
                    unitPrice: variant.price || selectedProductForVariant.price,
                    quantity: variant.qty,
                    sortOrder: items.length + newItems.length,
                    image: variant.image || selectedProductForVariant.image,
                    sku: variant.sku || selectedProductForVariant.sku,
                    stock: Number(variant.stock || 0),
                    allowSellWithoutStock: Boolean(selectedProductForVariant.allow_sell_without_stock),
                    isEditing: false,
                    isManual: false
                }
                newItems.push(newItem)
            }
        })
        if (newItems.length > 0) {
            setItems([...items, ...newItems])
            setFieldErrors(prev => {
                const next = new Set(prev)
                next.delete("productSearch")
                return next
            })
        }
        setIsVariantSheetOpen(false)
        productBucket.setSearchQuery("")
    }

    const updateItemField = (index: number, field: string, value: any) => {
        const newItems = [...items]
        newItems[index][field] = value
        setItems(newItems)
        if (field === "name") {
            setManualItemNameErrors(prev => {
                if (!prev.has(index)) return prev
                const next = new Set(prev)
                if (String(value || "").trim()) next.delete(index)
                return next
            })
            setFieldErrors(prev => {
                if (!prev.has("manualItemNames")) return prev
                const hasInvalidManualItems = newItems.some((item) => item.isManual && !String(item.name || "").trim())
                if (hasInvalidManualItems) return prev
                const next = new Set(prev)
                next.delete("manualItemNames")
                return next
            })
        }
    }

    const updateItemPrice = (index: number, price: number) => {
        const newItems = [...items]
        newItems[index].unitPrice = price
        setItems(newItems)
        setManualItemPriceErrors(prev => {
            if (!prev.has(index)) return prev
            const next = new Set(prev)
            if (Number(price || 0) > 0) next.delete(index)
            return next
        })
        setFieldErrors(prev => {
            if (!prev.has("manualItemPrices")) return prev
            const hasInvalidManualPrices = newItems.some((item) => item.isManual && Number(item.unitPrice || 0) <= 0)
            if (hasInvalidManualPrices) return prev
            const next = new Set(prev)
            next.delete("manualItemPrices")
            return next
        })
    }

    const updateItemQty = (index: number, qty: number) => {
        const newItems = [...items]
        const normalizedQty = Math.max(1, Number(qty || 1))
        const maxQty = getItemMaxQuantity(newItems[index])
        if (maxQty !== undefined && normalizedQty > maxQty) {
            notifyError(`A quantidade de "${newItems[index].name}" está maior que o estoque disponível.`)
            newItems[index].quantity = Math.max(1, maxQty)
        } else {
            newItems[index].quantity = normalizedQty
        }
        setItems(newItems)
    }

    const toggleItemEdit = (index: number, isEditing: boolean) => {
        const newItems = [...items]
        if (isEditing && !newItems[index]?.isManual) return
        newItems[index].isEditing = isEditing
        setItems(newItems)
    }

    const addBlankItem = () => {
        const newItem = {
            id: Math.random().toString(36).substr(2, 9),
            name: "",
            unitPrice: 0,
            quantity: 1,
            sortOrder: items.length,
            isEditing: true,
            sku: "",
            isManual: true
        }
        setItems([...items, newItem])
        setFieldErrors(prev => {
            const next = new Set(prev)
            next.delete("productSearch")
            return next
        })
    }

    const removeItem = (index: number) => {
        const newItems = [...items]
        newItems.splice(index, 1)
        setItems(newItems)
        setManualItemNameErrors(new Set())
        setManualItemPriceErrors(new Set())
        setFieldErrors(prev => {
            if (!prev.has("manualItemNames")) return prev
            const hasInvalidManualItems = newItems.some((item) => item.isManual && !String(item.name || "").trim())
            if (hasInvalidManualItems) return prev
            const next = new Set(prev)
            next.delete("manualItemNames")
            return next
        })
    }

    const resetForm = () => {
        setItems([])
        setSelectedCustomer(null)
        setOrderDate(new Date().toISOString().split('T')[0])
        setNotes("")
        setShippingFee("0")
        setOtherCosts("0")
        setDiscountValue(0)
        setPaymentStatus("unpaid")
        setDeliveryStatus("not_sent")
        setInventoryAlreadyDeducted(false)
        setManualItemNameErrors(new Set())
        setManualItemPriceErrors(new Set())
        setFieldErrors(new Set())
        setActiveTab("general")
    }

    const validateOrderBeforeSubmit = () => {
        if (items.length === 0) {
            setFieldErrors(new Set(["productSearch"]))
            notifyError("Adicione pelo menos um item ao pedido.")
            return false
        }

        const invalidManualIndexes = new Set<number>()
        const invalidManualPriceIndexes = new Set<number>()
        items.forEach((item, index) => {
            if (item.isManual && !String(item.name || "").trim()) {
                invalidManualIndexes.add(index)
            }
            if (item.isManual && Number(item.unitPrice || 0) <= 0) {
                invalidManualPriceIndexes.add(index)
            }
        })

        if (invalidManualIndexes.size > 0) {
            setManualItemNameErrors(invalidManualIndexes)
            setFieldErrors(new Set(["manualItemNames"]))
            setActiveTab("general")
            setValidationMessage("Preencha o nome dos itens adicionados manualmente antes de salvar a venda.")
            setShowValidationModal(true)
            return false
        }

        if (invalidManualPriceIndexes.size > 0) {
            setManualItemPriceErrors(invalidManualPriceIndexes)
            setFieldErrors(new Set(["manualItemPrices"]))
            setActiveTab("general")
            setValidationMessage("Preencha o preço dos itens adicionados manualmente antes de salvar a venda.")
            setShowValidationModal(true)
            return false
        }

        if (items.some((item) => Number(item.quantity || 0) <= 0)) {
            setActiveTab("general")
            setValidationMessage("Todos os itens precisam ter quantidade mínima de 1.")
            setShowValidationModal(true)
            return false
        }

        if (totalAmount <= 0) {
            setActiveTab("general")
            setValidationMessage("A venda não pode ser salva com valor total zerado.")
            setShowValidationModal(true)
            return false
        }

        const stockValidationMessage = validateStockAvailability(items)
        if (stockValidationMessage) {
            setFieldErrors(new Set(["productSearch"]))
            setActiveTab("general")
            setValidationMessage(stockValidationMessage)
            setShowValidationModal(true)
            return false
        }

        setManualItemNameErrors(new Set())
        setManualItemPriceErrors(new Set())
        setFieldErrors(new Set())
        return true
    }

    const handleClosePaymentModal = () => {
        setIsPaymentModalOpen(false)
        if (wasSaleSuccessful) {
            resetForm()
            router.refresh()
            setWasSaleSuccessful(false)
            onBack()
        }
    }

    const buildOrderPayload = (paymentOverrides?: { paymentStatus?: 'paid' | 'partially_paid' | 'unpaid'; paidAmount?: number; paymentMethod?: string }) => ({
        partnerId,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer ? selectedCustomer.name : "Consumidor final",
        salesChannel,
        deliveryMethod,
        paymentStatus: paymentOverrides?.paymentStatus || paymentStatus,
        paymentMethod: paymentOverrides?.paymentMethod || (editOrderId ? originalPaymentMethod : "pendente"),
        deliveryStatus: deliveryStatus as any,
        paidAmount: paymentOverrides?.paidAmount,
        address: deliveryMethod === 'delivery' ? {
            zipCode: cep,
            street,
            number,
            complement,
            neighborhood,
            city,
            state: uf
        } : undefined,
        items: items.map((item, idx) => ({
            productId: item.productId,
            variantId: item.variantId,
            customName: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            sortOrder: idx
        })),
        subtotal,
        discountValue: discountAmount,
        discountType: 'fixed' as const,
        shippingCost: parseFloat(shippingFee || "0"),
        additionalCosts: parseFloat(otherCosts || "0"),
        totalAmount,
        notes,
        csrf_token: csrfToken || undefined
    })

    const submitOrder = async (paymentOverrides?: { paymentStatus?: 'paid' | 'partially_paid' | 'unpaid'; paidAmount?: number; paymentMethod?: string }) => {
        setIsSaving(true)
        try {
            const payload = buildOrderPayload(paymentOverrides)
            const result = editOrderId
                ? await updateERPOrderAction(editOrderId, payload)
                : await createERPOrderAction(payload)

            if (result.success) {
                notifySuccess(editOrderId ? `Pedido atualizado com sucesso!` : `Pedido criado com sucesso!`)
                router.refresh()
                if (editOrderId && !paymentOverrides?.paymentMethod) {
                    onBack()
                    return { success: true }
                }
                setWasSaleSuccessful(true)
                const returnedOrderNumber = 'orderNumber' in result ? result.orderNumber : undefined
                return { success: true, orderNumber: returnedOrderNumber }
            }

            notifyError(result.error || (editOrderId ? "Erro ao atualizar pedido" : "Erro ao criar pedido"))
            return { error: result.error }
        } catch (error) {
            notifyError("Erro ao processar pedido")
            return { error: "Erro de processamento" }
        } finally {
            setIsSaving(false)
        }
    }

    const handleConfirmPayment = async (paymentData: any) => {
        if (!validateOrderBeforeSubmit()) {
            return { error: "Sem itens" }
        }
        return submitOrder({
            paymentStatus: paymentData.paymentStatus,
            paymentMethod: paymentData.paymentMethod,
            paidAmount: paymentData.paidAmount,
        })
    }

    const handleDirectSaveOrder = async () => {
        if (!validateOrderBeforeSubmit()) {
            return
        }
        await submitOrder({
            paymentStatus,
            paidAmount: originalPaidAmount,
        })
    }

    const handleOpenPaymentModal = async () => {
        if (!validateOrderBeforeSubmit()) {
            return
        }
        setIsPaymentModalOpen(true)
    }

    const handleSaveOrder = async () => {
        if (!validateOrderBeforeSubmit()) {
            return
        }
        if (editOrderId) {
            await handleDirectSaveOrder()
            return
        }
        setIsPaymentModalOpen(true)
    }

    const getTabErrorCount = useCallback((tab: string) => {
        return REQUIRED_FIELDS.filter(({ field, tab: fieldTab }) => fieldTab === tab && fieldErrors.has(field)).length
    }, [fieldErrors])

    const salesChannelOptions = [
        { value: "Venda Direta", label: "Venda Direta" },
        { value: "Loja Online", label: "Loja Online" },
        { value: "WhatsApp", label: "WhatsApp" },
        { value: "Instagram", label: "Instagram" }
    ]

    const deliveryMethodOptions = [
        { value: "pickup", label: "Retirada pessoalmente" },
        { value: "delivery", label: "Entrega / Delivery" }
    ]

    const statusOptions = [
        { value: "unpaid", label: "Não pago", color: "brand-red" },
        { value: "paid", label: "Pago", color: "brand-green" },
        { value: "partially_paid", label: "Parcialmente Pago", color: "brand-orange" }
    ]

    const deliveryStatusOptions = [
        { value: "not_sent", label: "Não enviado" },
        { value: "preparing", label: "Preparando" },
        { value: "sent", label: "Enviado" },
        { value: "delivered", label: "Entregue" },
        { value: "pickup_available", label: "Disponível para retirada" },
        { value: "delivery_failed", label: "Entrega não realizada" }
    ]

    if (isLoadingData) {
        return (
            <div className="w-full h-full min-h-[500px] flex justify-center items-center">
                <ThreeDotsLoader />
            </div>
        )
    }

    return (
        <FadeIn>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-screen bg-white dark:bg-dark-background overflow-hidden relative">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-10">

                    {/* --- STICKY HEADER --- */}
                    <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                            {/* Back button — desktop only */}
                            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title and Actions */}
                            <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="hidden md:inline truncate">{editOrderId ? "Editar Pedido" : "Novo Pedido"}</span>
                                    </h1>
                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        {editOrderId ? "Atualize as informações da venda" : "Preencha as informações da nova venda"}
                                    </div>
                                </div>

                                <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                                    <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                        Cancelar
                                    </Button>
                                    <Button onClick={handleSaveOrder} disabled={isSaving}>
                                        <SaveIcon className="w-5 h-5 mr-2" />
                                        {isSaving ? "Salvando..." : primaryActionLabel}
                                    </Button>
                                </div>
                            </div>

                            {/* Tabs Navigation */}
                            <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                    <TabsTrigger value="general">
                                        Dados gerais
                                        {getTabErrorCount("general") > 0 && <span className="ml-2 w-2 h-2 bg-red-500 rounded-full inline-block" />}
                                    </TabsTrigger>
                                    {deliveryMethod === 'delivery' && <TabsTrigger value="delivery">Entrega</TabsTrigger>}
                                    <TabsTrigger value="observations">Observações</TabsTrigger>
                                </TabsList>
                            </div>
                        </div>
                    </div>

                    <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                        <TabsContent value="general" className="mt-0">
                            <OrderGeneralTab
                                items={items}
                                searchQuery={productBucket.searchQuery}
                                isProductSearchOpen={isProductSearchOpen}
                                isSearching={productBucket.isLoading}
                                searchResults={productBucket.filteredResults}
                                subtotal={subtotal}
                                discountAmount={discountAmount}
                                discountValue={discountValue}
                                discountType={discountType}
                                shippingFee={shippingFee}
                                otherCosts={otherCosts}
                                totalAmount={totalAmount}
                                selectedCustomer={selectedCustomer}
                                orderDate={orderDate}
                                salesChannel={salesChannel}
                                deliveryMethod={deliveryMethod}
                                paymentStatus={paymentStatus}
                                deliveryStatus={deliveryStatus}
                                remainingPaymentAmount={editOrderId ? remainingAmount : 0}
                                manualItemNameErrors={manualItemNameErrors}
                                manualItemPriceErrors={manualItemPriceErrors}
                                isSaving={isSaving}
                                setSearchQuery={productBucket.setSearchQuery}
                                setIsProductSearchOpen={setIsProductSearchOpen}
                                onSearchFocus={productBucket.loadBucket}
                                addProductToOrder={addProductToOrder}
                                updateItemField={updateItemField}
                                updateItemPrice={updateItemPrice}
                                updateItemQty={updateItemQty}
                                resolveItemQuantityMax={getItemMaxQuantity}
                                toggleItemEdit={toggleItemEdit}
                                removeItem={removeItem}
                                addBlankItem={addBlankItem}
                                setShippingFee={setShippingFee}
                                setOtherCosts={setOtherCosts}
                                setDiscountValue={setDiscountValue}
                                setDiscountType={setDiscountType}
                                setSelectedCustomer={setSelectedCustomer}
                                setIsCustomerSheetOpen={setIsCustomerSheetOpen}
                                setOrderDate={setOrderDate}
                                setSalesChannel={setSalesChannel}
                                setDeliveryMethod={setDeliveryMethod}
                                setPaymentStatus={setPaymentStatus}
                                setDeliveryStatus={setDeliveryStatus}
                                handleSaveOrder={handleOpenPaymentModal}
                                salesChannelOptions={salesChannelOptions}
                                deliveryMethodOptions={deliveryMethodOptions}
                                statusOptions={statusOptions}
                                deliveryStatusOptions={deliveryStatusOptions}
                                fieldErrors={fieldErrors}
                                setFieldErrors={setFieldErrors}
                            />
                        </TabsContent>

                        <TabsContent value="delivery" className="mt-0">
                            <AddressTab
                                cep={cep}
                                street={street}
                                number={number}
                                complement={complement}
                                neighborhood={neighborhood}
                                city={city}
                                uf={uf}
                                noNumber={noNumber}
                                selectedCustomer={selectedCustomer}
                                setCep={setCep}
                                setStreet={setStreet}
                                setNumber={setNumber}
                                setComplement={setComplement}
                                setNeighborhood={setNeighborhood}
                                setCity={setCity}
                                setUf={setUf}
                                setNoNumber={setNoNumber}
                            />
                        </TabsContent>

                        <TabsContent value="observations" className="mt-0">
                            <OrderObservationsTab
                                notes={notes}
                                setNotes={setNotes}
                            />
                        </TabsContent>
                    </div>
                </div>

                <SelectCustomerSheet
                    isOpen={isCustomerSheetOpen}
                    onClose={() => setIsCustomerSheetOpen(false)}
                    onSelect={(customer) => {
                        setSelectedCustomer(customer)
                        setIsCustomerSheetOpen(false)
                    }}
                    partnerId={partnerId}
                />

                <SelectVariantSheet
                    isOpen={isVariantSheetOpen}
                    onClose={() => setIsVariantSheetOpen(false)}
                    product={selectedProductForVariant}
                    onConfirm={handleVariantsConfirm}
                />

                <AlertModal
                    isOpen={showAlertModal}
                    onClose={() => setShowAlertModal(false)}
                    onConfirm={() => {
                        setShowAlertModal(false)
                        onBack()
                    }}
                    title="Descartar alterações?"
                    description="Se você sair agora, todas as informações preenchidas serão perdidas. Tem certeza que deseja descartar?"
                    confirmText="Descartar"
                    variant="warning"
                />

                <AlertModal
                    isOpen={showValidationModal}
                    onClose={() => setShowValidationModal(false)}
                    title="Campos obrigatórios pendentes"
                    message={validationMessage || "Revise os campos obrigatórios antes de salvar a venda."}
                    confirmText="Ok, entendi"
                    variant="warning"
                />
                <AnimatePresence>
                    {isPaymentModalOpen && (
                        <PaymentModal
                            isOpen={isPaymentModalOpen}
                            onClose={handleClosePaymentModal}
                            cart={items}
                            customer={selectedCustomer}
                            partnerId={partnerId}
                            shippingFee={parseFloat(shippingFee || "0")}
                            otherCosts={parseFloat(otherCosts || "0")}
                            discountAmount={discountAmount}
                            amountDue={editOrderId && remainingAmount > 0.009 ? remainingAmount : undefined}
                            existingPaidAmount={editOrderId ? originalPaidAmount : 0}
                            lockPaymentCompletion={Boolean(editOrderId && remainingAmount > 0.009)}
                            onConfirm={handleConfirmPayment}
                        />
                    )}
                </AnimatePresence>

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
                    <Button
                        variant="outline"
                        onClick={handleBack}
                        disabled={isSaving}
                        className="flex-1"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSaveOrder}
                        disabled={isSaving}
                        className="flex-1"
                    >
                        <SaveIcon className="w-4 h-4 mr-2" />
                        {isSaving ? "Salvando..." : primaryActionLabel}
                    </Button>
                </div>
            </Tabs>
        </FadeIn>
    )
}
