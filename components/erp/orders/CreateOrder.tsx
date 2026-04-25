"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, AlertModal, ThreeDotsLoader } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { useToast } from "@/components/ui/use-toast"
import { useNotification } from "@/hooks/use-notification"
import { createERPOrderAction, getOrderDetailsAction, updateERPOrderAction } from "@/app/actions/erp/orders"
import { validateCouponAction } from "@/app/actions/shared/coupons"
import { getPOSCustomerDetailsAction, createPOSCustomerAddressAction } from "@/app/actions/erp/pos"
import SelectCustomerSheet from "../clientes/SelectCustomerSheet"
import SelectVariantSheet from "../quotes/SelectVariantSheet"
import { fetchPartnerProductsBucket } from "@/app/actions/erp/client-loaders"
import { useProductBucket } from "../hooks"
import { useRouter } from "next/navigation"
import { useDebouncedRefresh } from "@/hooks/use-debounced-refresh"
import PaymentModal, { PAYMENT_MODAL_HEADER_SUBTITLE } from "./PaymentModal"
import { useCSRFToken } from "@/hooks/use-csrf-token"
import {
    createFinanceAccountAction,
    getFinanceAccountsAction,
} from "@/app/actions/erp/finance-accounts"
import { pickBankThenCashDefaultFinanceAccountId, type FinanceAccountType } from "@/lib/finance-utils"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Input, MoneyInput, Combobox, Checkbox, ListItem, RadioButton, InfoCard, PercentageInput, Button as ReusableButton } from "@/components/reusable"
import { TagIcon, MoneyIcon, FileIcon } from "@/lib/icons"
import SelectCouponSheet from "@/components/erp/pos/SelectCouponSheet"
import POSShippingSheet from "@/components/erp/pos/POSShippingSheet"

// Tabs
import { OrderGeneralTab } from "./OrderGeneralTab"
import { AddressTab } from "./AddressTab"
import { OrderObservationsTab } from "./OrderObservationsTab"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency } from "@/lib/utils"

interface CreateOrderProps {
    onBack: () => void
    partnerId: string
    editOrderId?: string
}

type PaymentBreakdownEntry = {
    method: string
    amount: number
}

type FinanceAccountOption = {
    id: string
    name: string
    type: string
    is_active: boolean
    is_default?: boolean
    integration_source?: string | null
}

const REQUIRED_FIELDS = [
    { field: "productSearch", tab: "general" },
    { field: "manualItemNames", tab: "general" },
    { field: "manualItemPrices", tab: "general" },
    { field: "financeAccountId", tab: "general" },
]

function formatLocalISODate(date: Date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
}

function parseMoneyInput(s: string): number {
    const t = String(s || "").trim().replace(",", ".")
    if (t === "") return 0
    const n = Number(t)
    return Number.isFinite(n) ? n : 0
}

export default function CreateOrder({ onBack, partnerId, editOrderId }: CreateOrderProps) {
    const { toast } = useToast()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const router = useRouter()
    const debouncedRefresh = useDebouncedRefresh()
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
    const [originalPaymentBreakdown, setOriginalPaymentBreakdown] = useState<PaymentBreakdownEntry[]>([])

    // Form State
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
    const [orderDate, setOrderDate] = useState(formatLocalISODate(new Date()))
    const [salesChannel, setSalesChannel] = useState("Manual")
    const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>("pickup")
    const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partially_paid' | 'unpaid'>("unpaid")
    const [deliveryStatus, setDeliveryStatus] = useState('not_sent')
    const [financeAccounts, setFinanceAccounts] = useState<FinanceAccountOption[]>([])
    const [financeAccountId, setFinanceAccountId] = useState("")

    // items
    const [items, setItems] = useState<any[]>([])

    // Instant product search (client-side bucket)
    const productBucket = useProductBucket(fetchPartnerProductsBucket)
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)

    // Financial
    const [shippingFee, setShippingFee] = useState("0")
    const [otherCosts, setOtherCosts] = useState("0")
    const [discountValue, setDiscountValue] = useState(0)
    const [discountType, setDiscountType] = useState<'fixed' | 'percentage' | 'coupon'>('fixed')
    const [couponCode, setCouponCode] = useState("")
    const [couponId, setCouponId] = useState<string | null>(null)
    const [couponDiscountAmount, setCouponDiscountAmount] = useState(0)

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
    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
    const [isSavingAccount, setIsSavingAccount] = useState(false)
    const [newAccountName, setNewAccountName] = useState("")
    const [newAccountType, setNewAccountType] = useState<FinanceAccountType>("cash")
    const [newAccountInitialBalance, setNewAccountInitialBalance] = useState(0)
    const [newAccountIsDefault, setNewAccountIsDefault] = useState(false)
    const [newAccountIsActive, setNewAccountIsActive] = useState(true)
    const isPaymentProcessing = isPaymentModalOpen && isSaving

    // Fluxos idênticos ao PDV (desconto + frete)
    const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false)
    const [globalDiscountValue, setGlobalDiscountValue] = useState(0)
    const [globalDiscountType, setGlobalDiscountType] = useState<"fixed" | "percentage" | "coupon">("fixed")
    const [globalDiscountCouponCode, setGlobalDiscountCouponCode] = useState("")
    const [isCouponSheetOpen, setIsCouponSheetOpen] = useState(false)
    const [isApplyingCoupon, setIsApplyingCoupon] = useState(false)
    const percentagePresets = [5, 10, 15, 20]
    const [isShippingSheetOpen, setIsShippingSheetOpen] = useState(false)
    const [shippingCustomerDetails, setShippingCustomerDetails] = useState<any | null>(null)
    const [customerSelectIntent, setCustomerSelectIntent] = useState<"default" | "shipping-preflight">("default")

    // --- Calculations ---
    const subtotal = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
    }, [items])

    const discountAmount = useMemo(() => {
        if (discountType === 'percentage') {
            return (subtotal * discountValue) / 100
        }
        if (discountType === "coupon") return 0
        return discountValue
    }, [subtotal, discountValue, discountType])

    const totalAmount = useMemo(() => {
        return subtotal - discountAmount - couponDiscountAmount + parseFloat(shippingFee || "0") + parseFloat(otherCosts || "0")
    }, [subtotal, discountAmount, couponDiscountAmount, shippingFee, otherCosts])

    const remainingAmount = useMemo(() => {
        return Math.max(0, totalAmount - originalPaidAmount)
    }, [totalAmount, originalPaidAmount])

    const primaryActionLabel = editOrderId ? "Salvar" : "Finalizar Venda"
    const isPaidOrderLocked = Boolean(editOrderId && originalPaymentStatus === "paid")

    const normalizeSalesChannel = useCallback((value?: string | null) => {
        if (!value) return "Manual"
        if (value === "Direct Sales") return "Manual"
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
                if (order?.situation === "cancelled") {
                    notifyError("Edição bloqueada", "Vendas canceladas não podem ser editadas.")
                    onBack()
                    return
                }
                setSelectedCustomer(order.buyer_id ? { id: order.buyer_id, name: order.customer_name } : null)
                setOrderDate(order.created_at.split('T')[0])
                setSalesChannel(normalizeSalesChannel(order.order_source))
                setDeliveryMethod(order.delivery_type as any || "pickup")
                const normalizedStatus = order.situation === "paid" ? "paid" : order.situation === "partially_paid" ? "partially_paid" : "unpaid"
                const loadedPaymentBreakdown = Array.isArray(order.payment_breakdown) && order.payment_breakdown.length > 0
                    ? order.payment_breakdown
                    : Number(order.paid_amount || 0) > 0 && order.payment_method
                        ? [{ method: order.payment_method, amount: Number(order.paid_amount || 0) }]
                        : []
                setPaymentStatus(normalizedStatus)
                setOriginalPaymentStatus(normalizedStatus)
                setOriginalPaidAmount(Number(order.paid_amount || 0))
                setOriginalPaymentMethod(order.payment_method || "Não informado")
                setOriginalPaymentBreakdown(loadedPaymentBreakdown)
                setDeliveryStatus(order.delivery_status || "not_sent")
                setFinanceAccountId(order.finance_account_id || "")
                setNotes(order.notes || "")
                setShippingFee((order.shipping_cost || 0).toString())
                setOtherCosts((order.additional_costs || 0).toString())
                setDiscountValue(order.discount_value || 0)
                setDiscountType(order.discount_type || "fixed")
                setCouponId(order.coupon_id || null)
                setCouponDiscountAmount(Number(order.discount_amount || 0))
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

    useEffect(() => {
        async function loadAccounts() {
            const res = await getFinanceAccountsAction(partnerId)
            if (!res.success || !res.data) return
            const active = (res.data.accounts || []).filter((acc: FinanceAccountOption) => acc.is_active)
            setFinanceAccounts(active)
        }
        loadAccounts()
    }, [partnerId])

    useEffect(() => {
        if (editOrderId || financeAccountId || financeAccounts.length === 0) return
        const defaultOrderAccountId = pickBankThenCashDefaultFinanceAccountId(financeAccounts)
        if (defaultOrderAccountId) setFinanceAccountId(defaultOrderAccountId)
    }, [editOrderId, financeAccountId, financeAccounts])

    useEffect(() => {
        if (!isDiscountModalOpen) return
        setGlobalDiscountValue(discountValue)
        setGlobalDiscountType(discountType === "coupon" ? "coupon" : (discountType as any))
        setGlobalDiscountCouponCode(couponCode)
    }, [isDiscountModalOpen, discountValue, discountType, couponCode])

    const openShippingSheetWithCustomer = useCallback(async (customerId: string) => {
        const details = await getPOSCustomerDetailsAction({ partnerId, customerId })
        if (details.success && details.data) {
            setShippingCustomerDetails(details.data)
        } else {
            setShippingCustomerDetails(null)
        }
        setIsShippingSheetOpen(true)
    }, [partnerId])

    const handleOpenShippingSheet = useCallback(async () => {
        if (selectedCustomer?.id) {
            await openShippingSheetWithCustomer(selectedCustomer.id)
            return
        }
        setCustomerSelectIntent("shipping-preflight")
        setIsCustomerSheetOpen(true)
    }, [openShippingSheetWithCustomer, selectedCustomer?.id])

    useEffect(() => {
        let active = true
        async function maybeAutoFillAddress() {
            if (deliveryMethod !== "delivery") return
            if (!selectedCustomer?.id) return

            const details = await getPOSCustomerDetailsAction({ partnerId, customerId: selectedCustomer.id })
            if (!active) return
            if (!details.success || !details.data) return

            const addr = details.data?.address || null
            if (!addr) return

            setCep((prev) => prev || String(addr.zipCode || ""))
            setStreet((prev) => prev || String(addr.street || ""))
            setNumber((prev) => prev || String(addr.number || ""))
            setComplement((prev) => prev || String(addr.complement || ""))
            setNeighborhood((prev) => prev || String(addr.neighborhood || ""))
            setCity((prev) => prev || String(addr.city || ""))
            setUf((prev) => prev || String(addr.state || "SP"))
            setNoNumber((prev) => prev || !String(addr.number || "").trim())
        }
        void maybeAutoFillAddress()
        return () => {
            active = false
        }
    }, [deliveryMethod, selectedCustomer?.id, partnerId])

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
        setOrderDate(formatLocalISODate(new Date()))
        setNotes("")
        setShippingFee("0")
        setOtherCosts("0")
        setDiscountValue(0)
        setCouponCode("")
        setCouponId(null)
        setCouponDiscountAmount(0)
        setPaymentStatus("unpaid")
        setDeliveryStatus("not_sent")
        setFinanceAccountId("")
        setOriginalPaidAmount(0)
        setOriginalPaymentMethod("Não informado")
        setOriginalPaymentBreakdown([])
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
        if (!financeAccountId) {
            setFieldErrors(new Set(["financeAccountId"]))
            setActiveTab("general")
            setValidationMessage("Selecione a conta de recebimento da venda antes de salvar.")
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
            debouncedRefresh()
            setWasSaleSuccessful(false)
            onBack()
        }
    }

    const buildOrderPayload = (paymentOverrides?: {
        paymentStatus?: 'paid' | 'partially_paid' | 'unpaid'
        paidAmount?: number
        paymentMethod?: string
        paymentBreakdown?: PaymentBreakdownEntry[]
        deliveryStatus?: string
    }) => {
        const finalPaymentStatus = paymentOverrides?.paymentStatus || paymentStatus;
        let finalDeliveryStatus = paymentOverrides?.deliveryStatus || deliveryStatus;
        if (
            !editOrderId &&
            paymentOverrides?.deliveryStatus === undefined &&
            finalPaymentStatus === 'paid' &&
            deliveryMethod === 'pickup' &&
            deliveryStatus === 'not_sent'
        ) {
            finalDeliveryStatus = 'delivered';
        }

        return {
            partnerId,
            customerId: selectedCustomer?.id,
            customerName: selectedCustomer ? selectedCustomer.name : "Consumidor final",
            salesChannel,
            deliveryMethod,
            financeAccountId,
            paymentStatus: finalPaymentStatus,
            paymentMethod: paymentOverrides?.paymentMethod || (editOrderId ? originalPaymentMethod : "pendente"),
            paymentBreakdown: paymentOverrides?.paymentBreakdown || originalPaymentBreakdown,
            deliveryStatus: deliveryMethod === "delivery" ? (finalDeliveryStatus as any) : undefined,
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
            couponCode: couponCode || undefined,
            couponId,
            couponDiscountAmount,
            shippingCost: parseFloat(shippingFee || "0"),
            additionalCosts: parseFloat(otherCosts || "0"),
            totalAmount,
            notes,
            csrf_token: csrfToken || undefined
        }
    }

    const handleApplyCoupon = async () => {
        const code = couponCode.trim()
        if (!code) {
            notifyError("Informe um código de cupom.")
            return
        }
        if (isApplyingCoupon) return
        setIsApplyingCoupon(true)
        const result = await validateCouponAction({
            partnerId,
            code,
            customerId: selectedCustomer?.id || null,
            subtotal,
            shippingCost: parseFloat(shippingFee || "0"),
            items: items.map((item) => ({ productId: item.productId || null })),
        })
        try {
            if (!result.valid) {
                setCouponId(null)
                setCouponDiscountAmount(0)
                notifyError(result.errorMessage || "Cupom inválido.")
                return
            }
            setCouponId(result.couponId || null)
            setCouponDiscountAmount(Number(result.discountAmount || 0))
            setDiscountType("coupon")
            notifySuccess("Cupom aplicado com sucesso.")
        } finally {
            setIsApplyingCoupon(false)
        }
    }

    const submitOrder = async (paymentOverrides?: {
        paymentStatus?: 'paid' | 'partially_paid' | 'unpaid'
        paidAmount?: number
        paymentMethod?: string
        paymentBreakdown?: PaymentBreakdownEntry[]
        deliveryStatus?: string
    }) => {
        setIsSaving(true)
        try {
            const payload = buildOrderPayload(paymentOverrides)
            const result = editOrderId
                ? await updateERPOrderAction(editOrderId, payload)
                : await createERPOrderAction(payload)

            if (result.success) {
                notifySuccess(editOrderId ? `Pedido atualizado com sucesso!` : `Pedido criado com sucesso!`)
                debouncedRefresh()
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
            paymentBreakdown: paymentData.paymentBreakdown,
            paidAmount: paymentData.paidAmount,
            deliveryStatus: paymentData.isPendingDelivery ? "not_sent" : undefined,
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
        { value: "Manual", label: "Manual" },
        { value: "Loja Online", label: "Loja Online" },
        { value: "WhatsApp", label: "WhatsApp" },
        { value: "Instagram", label: "Instagram" }
    ]

    const deliveryMethodOptions = [
        { value: "pickup", label: "Retirada pessoalmente" },
        { value: "delivery", label: "Entrega / Delivery" }
    ]

    const accountOptions = financeAccounts.map((account) => ({
        value: account.id,
        label: account.name,
    }))

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

                            {/* Back button - desktop only */}
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

                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
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
                                    {deliveryMethod === 'delivery' && (
                                        <TabsTrigger value="delivery">
                                            Entrega
                                            {getTabErrorCount("delivery") > 0 && <span className="ml-2 w-2 h-2 bg-red-500 rounded-full inline-block" />}
                                        </TabsTrigger>
                                    )}
                                    <TabsTrigger value="observations">
                                        Observações
                                        {getTabErrorCount("observations") > 0 && <span className="ml-2 w-2 h-2 bg-red-500 rounded-full inline-block" />}
                                    </TabsTrigger>
                                </TabsList>
                            </div>
                        </div>
                    </div>

                    <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                        <TabsContent value="general" className="mt-0">
                            <FadeIn key="general">
                                <div className={isPaidOrderLocked ? "pointer-events-none opacity-60" : ""}>
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
                                        financeAccountId={financeAccountId}
                                        accountOptions={accountOptions}
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
                                        couponCode={couponCode}
                                        setCouponCode={setCouponCode}
                                        couponDiscountAmount={couponDiscountAmount}
                                        onApplyCoupon={handleApplyCoupon}
                                        onOpenDiscount={() => setIsDiscountModalOpen(true)}
                                        onOpenShipping={handleOpenShippingSheet}
                                        setSelectedCustomer={setSelectedCustomer}
                                        setIsCustomerSheetOpen={setIsCustomerSheetOpen}
                                        setOrderDate={setOrderDate}
                                        setSalesChannel={setSalesChannel}
                                        setDeliveryMethod={setDeliveryMethod}
                                        setDeliveryStatus={setDeliveryStatus}
                                        setFinanceAccountId={setFinanceAccountId}
                                        onCreateAccount={() => {
                                            setNewAccountName("")
                                            setNewAccountType("cash")
                                            setNewAccountInitialBalance(0)
                                            setNewAccountIsDefault(
                                                !financeAccounts.some(
                                                    (acc) =>
                                                        acc.type === "cash" &&
                                                        (!acc.integration_source || acc.integration_source !== "mercadopago"),
                                                ),
                                            )
                                            setNewAccountIsActive(true)
                                            setIsAccountModalOpen(true)
                                        }}
                                        handleSaveOrder={handleOpenPaymentModal}
                                        salesChannelOptions={salesChannelOptions}
                                        deliveryMethodOptions={deliveryMethodOptions}
                                        deliveryStatusOptions={deliveryStatusOptions}
                                        fieldErrors={fieldErrors}
                                        setFieldErrors={setFieldErrors}
                                    />
                                </div>
                            </FadeIn>
                        </TabsContent>

                        <TabsContent value="delivery" className="mt-0">
                            <FadeIn key="delivery">
                                <div className={isPaidOrderLocked ? "pointer-events-none opacity-60" : ""}>
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
                                        deliveryStatus={deliveryStatus}
                                        setDeliveryStatus={setDeliveryStatus}
                                        deliveryStatusOptions={deliveryStatusOptions}
                                        setCep={setCep}
                                        setStreet={setStreet}
                                        setNumber={setNumber}
                                        setComplement={setComplement}
                                        setNeighborhood={setNeighborhood}
                                        setCity={setCity}
                                        setUf={setUf}
                                        setNoNumber={setNoNumber}
                                    />
                                </div>
                            </FadeIn>
                        </TabsContent>

                        <TabsContent value="observations" className="mt-0">
                            <FadeIn key="observations">
                                <OrderObservationsTab
                                    notes={notes}
                                    setNotes={setNotes}
                                />
                            </FadeIn>
                        </TabsContent>
                    </div>
                </div>

                <SelectCustomerSheet
                    isOpen={isCustomerSheetOpen}
                    onClose={() => {
                        if (isSaving) return
                        setIsCustomerSheetOpen(false)
                        setCustomerSelectIntent("default")
                    }}
                    onSelect={(customer) => {
                        setSelectedCustomer(customer)
                        setIsCustomerSheetOpen(false)
                        void (async () => {
                            const details = await getPOSCustomerDetailsAction({ partnerId, customerId: customer.id })
                            if (details.success && details.data) {
                                setShippingCustomerDetails(details.data)
                                if (deliveryMethod === "delivery" && details.data?.address) {
                                    const addr = details.data.address
                                    setCep(String(addr.zipCode || ""))
                                    setStreet(String(addr.street || ""))
                                    setNumber(String(addr.number || ""))
                                    setComplement(String(addr.complement || ""))
                                    setNeighborhood(String(addr.neighborhood || ""))
                                    setCity(String(addr.city || ""))
                                    setUf(String(addr.state || "SP"))
                                    setNoNumber(!String(addr.number || "").trim())
                                }
                            }
                        })()
                        if (customerSelectIntent === "shipping-preflight") {
                            setCustomerSelectIntent("default")
                            void openShippingSheetWithCustomer(customer.id)
                        }
                    }}
                    partnerId={partnerId}
                />

                <SelectVariantSheet
                    isOpen={isVariantSheetOpen}
                    onClose={() => {
                        if (isSaving) return
                        setIsVariantSheetOpen(false)
                    }}
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
                            onClose={() => {
                                if (isPaymentProcessing) return
                                handleClosePaymentModal()
                            }}
                            cart={items}
                            customer={selectedCustomer}
                            partnerId={partnerId}
                            shippingFee={parseFloat(shippingFee || "0")}
                            otherCosts={parseFloat(otherCosts || "0")}
                            discountAmount={discountAmount + couponDiscountAmount}
                            headerSubtitle={PAYMENT_MODAL_HEADER_SUBTITLE}
                            amountDue={editOrderId && remainingAmount > 0.009 ? remainingAmount : undefined}
                            existingPaidAmount={editOrderId ? originalPaidAmount : 0}
                            existingPaymentBreakdown={editOrderId ? originalPaymentBreakdown : []}
                            lockPaymentCompletion={Boolean(editOrderId && remainingAmount > 0.009)}
                            onConfirm={handleConfirmPayment}
                        />
                    )}
                </AnimatePresence>

                <DefaultModal
                    isOpen={isAccountModalOpen}
                    onClose={() => {
                        if (isSavingAccount) return
                        setIsAccountModalOpen(false)
                    }}
                    title="Nova conta"
                    footer={
                        <div className="flex justify-end gap-3 w-full">
                            <Button variant="outline" onClick={() => setIsAccountModalOpen(false)} disabled={isSavingAccount}>
                                Cancelar
                            </Button>
                            <Button
                                isLoading={isSavingAccount}
                                onClick={async () => {
                                    if (!newAccountName.trim()) {
                                        notifyError("Informe o nome da conta.")
                                        return
                                    }
                                    setIsSavingAccount(true)
                                    try {
                                        const initialBal = parseMoneyInput(String(newAccountInitialBalance ?? 0))
                                        const created = await createFinanceAccountAction({
                                            partnerId,
                                            name: newAccountName.trim(),
                                            type: newAccountType,
                                            initialBalance: initialBal,
                                            isDefault: newAccountIsDefault,
                                        })
                                        if (!created.success || !created.data) {
                                            notifyError(created.error || "Não foi possível criar a conta.")
                                            return
                                        }
                                        const refreshed = await getFinanceAccountsAction(partnerId)
                                        if (refreshed.success && refreshed.data) {
                                            const active = (refreshed.data.accounts || []).filter((acc: FinanceAccountOption) => acc.is_active)
                                            setFinanceAccounts(active)
                                        }
                                        setFinanceAccountId(created.data.id)
                                        setIsAccountModalOpen(false)
                                        notifySuccess("Conta criada com sucesso.")
                                    } finally {
                                        setIsSavingAccount(false)
                                    }
                                }}
                            >
                                Salvar
                            </Button>
                        </div>
                    }
                >
                    <div className="flex flex-col gap-4 p-4">
                        <Input
                            label="Nome"
                            placeholder="Ex: Caixa loja, Nubank, Banco Itaú"
                            value={newAccountName}
                            onChange={(e) => setNewAccountName(e.target.value)}
                        />
                        <Combobox
                            label="Tipo"
                            value={newAccountType}
                            onChange={(val) => {
                                const nextType = val as FinanceAccountType
                                setNewAccountType(nextType)
                                setNewAccountIsDefault(
                                    !financeAccounts.some(
                                        (acc) =>
                                            acc.type === nextType &&
                                            (!acc.integration_source || acc.integration_source !== "mercadopago"),
                                    ),
                                )
                            }}
                            options={[
                                { value: "cash", label: "Caixa" },
                                { value: "bank", label: "Conta bancária" },
                                { value: "wallet", label: "Carteira digital" },
                            ]}
                        />
                        <MoneyInput label="Saldo inicial" value={newAccountInitialBalance} onChange={setNewAccountInitialBalance} />
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                            O saldo inicial aberto será registrado como transação de ajuste. Para alterar o saldo depois, use
                            &quot;Ajustar saldo&quot; no menu da conta.
                        </p>
                        <Checkbox
                            id="order_new_account_is_default"
                            label="Conta padrão deste tipo (caixa, banco ou carteira)"
                            checked={newAccountIsDefault}
                            onChange={setNewAccountIsDefault}
                        />
                        <Checkbox
                            id="order_new_account_is_active"
                            label="Cadastro Ativo"
                            checked={newAccountIsActive}
                            onChange={setNewAccountIsActive}
                            className="mt-2"
                        />
                    </div>
                </DefaultModal>

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
                                className={`px-4 py-3 gap-4 ${globalDiscountType === "percentage" ? "border-brand-primary bg-brand-primary/5" : ""}`}
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
                                className={`px-4 py-3 gap-4 ${globalDiscountType === "fixed" ? "border-brand-primary bg-brand-primary/5" : ""}`}
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
                                className={`px-4 py-3 gap-4 ${globalDiscountType === "coupon" ? "border-brand-primary bg-brand-primary/5" : ""}`}
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
                                    {percentagePresets.map((preset) => (
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

                <SelectCouponSheet
                    isOpen={isCouponSheetOpen}
                    onClose={() => setIsCouponSheetOpen(false)}
                    partnerId={partnerId}
                    subtotal={subtotal}
                    selectedCustomerId={selectedCustomer?.id || null}
                    appliedCouponId={couponId}
                    onApplyCoupon={async (coupon) => {
                        setCouponCode(coupon.code)
                        await handleApplyCoupon()
                        setIsCouponSheetOpen(false)
                    }}
                    onRemoveCoupon={async () => {
                        setCouponId(null)
                        setCouponCode("")
                        setCouponDiscountAmount(0)
                        setDiscountType("fixed")
                        setDiscountValue(0)
                        notifySuccess("Cupom removido.")
                    }}
                />

                <POSShippingSheet
                    isOpen={isShippingSheetOpen}
                    onClose={() => setIsShippingSheetOpen(false)}
                    selectedCustomerId={selectedCustomer?.id || null}
                    customerDetails={shippingCustomerDetails}
                    currentShippingFee={parseFloat(shippingFee || "0")}
                    onCreateAddress={async (payload: any) => {
                        const result = await createPOSCustomerAddressAction({
                            partnerId,
                            customerId: payload.customerId,
                            address: payload.address,
                        })
                        if (!result.success) {
                            notifyError(result.error || "Não foi possível cadastrar o endereço.")
                            throw new Error(result.error || "Não foi possível cadastrar o endereço.")
                        }
                        const details = await getPOSCustomerDetailsAction({ partnerId, customerId: payload.customerId })
                        if (details.success && details.data) setShippingCustomerDetails(details.data)
                        notifySuccess("Endereço cadastrado com sucesso.")
                    }}
                    onApply={({ shippingFee: fee }: any) => {
                        setShippingFee(String(Math.max(0, Number(fee || 0))))
                        setIsShippingSheetOpen(false)
                    }}
                />

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
