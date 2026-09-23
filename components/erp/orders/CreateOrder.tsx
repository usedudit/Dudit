"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { useScrollToFirstError } from "@/hooks/use-scroll-to-first-error"
import { AnimatePresence } from "framer-motion"
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, AlertModal, ThreeDotsLoader, Input, MoneyInput, Combobox, Checkbox, ListItem, RadioButton, InfoCard, PercentageInput } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { useToast } from "@/components/ui/use-toast"
import { useNotification } from "@/hooks/use-notification"
import { usePermissions } from "@/lib/permission-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { getNextPlanTarget, isPlanLimitReachedError } from "@/lib/subscription/limit-upgrade"
import { createERPOrderAction, getOrderDetailsAction, updateERPOrderAction } from "@/app/actions/erp/orders"
import { validateCouponAction } from "@/app/actions/shared/coupons"
import { getPOSCustomerDetailsAction, createPOSCustomerAddressAction } from "@/app/actions/erp/pdv"
import SelectCustomerSheet from "../clientes/SelectCustomerSheet"
import SelectProductVariantSheet from "@/components/erp/pdv/SelectProductVariantSheet"
import { fetchPartnerProductsBucket, fetchPartnerServicesBucket } from "@/app/actions/erp/client-loaders"
import { useProductBucket } from "../hooks"
import { useRouter, useSearchParams } from "next/navigation"
import { useDebouncedRefresh } from "@/hooks/use-debounced-refresh"
import { useStore } from "@/lib/store-context"
import { useSidebar } from "@/lib/sidebar-context"
import PaymentModal, { PAYMENT_MODAL_HEADER_SUBTITLE } from "./PaymentModal"
import { useCSRFToken } from "@/hooks/use-csrf-token"
import {
    getFinanceAccountsAction,
    createFinanceAccountAction,
} from "@/app/actions/erp/finance-accounts"
import { normalizeBusinessInfo, isQuickMode } from "@/lib/business-info"
import { DEFAULT_SALES_SETTINGS, type SalesSettings } from "@/lib/sales/sales-settings-types"
import { createERPDeliveryAction, fetchDeliveryPeopleBucketAction } from "@/app/actions/erp/deliveries"
import { assignPlatformDriverToDeliveryAction, fetchAvailablePlatformDeliveryDriversAction, syncPlatformDriverForOrderAction } from "@/app/actions/erp/delivery-driver-assignments"
import { pickBankThenCashDefaultFinanceAccountId, type FinanceAccountType } from "@/lib/finance-utils"
import DefaultModal from "@/components/reusable/DefaultModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { TagIcon, MoneyIcon, FileIcon, TruckIcon } from "@/lib/icons"
import SelectCouponSheet from "@/components/erp/pdv/SelectCouponSheet"
import POSShippingSheet from "@/components/erp/pdv/POSShippingSheet"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import { computeItemDisplayPrice } from "@/lib/services/pricing-engine"
import type { PaymentBreakdownEntry } from "@/lib/payments/financial-engine"
import { getServiceCheckoutSettingsAction } from "@/app/actions/marketplace/service-checkout-settings"

// Tabs
import { OrderGeneralTab } from "./OrderGeneralTab"
import { AddressTab } from "./AddressTab"
import DeliveryDriverPickerSheet from "@/components/erp/deliveries/DeliveryDriverPickerSheet"
import { OrderObservationsTab } from "./OrderObservationsTab"
import { OrderAttachmentsTab } from "./OrderAttachmentsTab"
import { uploadAndSavePendingAttachments } from "@/lib/utils/attachment-uploader"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency } from "@/lib/utils"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { calculateOrderPricing, type PricingCoupon } from "@/lib/services/pricing-engine"
import { cleanOrderNotes } from "@/lib/orders/order-utils"

interface CreateOrderProps {
    onBack: () => void
    partnerId: string
    editOrderId?: string
}

type FinanceAccountOption = {
    id: string
    name: string
    type: string
    is_active: boolean
    is_default?: boolean
    integration_source?: string | null
}

type DeliveryPersonOption = {
    id: string
    fullName: string
    source?: "legacy" | "platform"
    vehicleType?: string | null
}

const REQUIRED_FIELDS = [
    { field: "productSearch", tab: "general" },
    { field: "manualItemNames", tab: "general" },
    { field: "manualItemPrices", tab: "general" },
    { field: "financeAccountId", tab: "general" },
    { field: "deliveryDate", tab: "delivery" },
    { field: "deliveryTime", tab: "delivery" },
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
    return parseFloat(t)
}

function formatCurrentLocalTime(date = new Date()) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

export function parseAddressString(addressStr: string) {
    if (!addressStr) return null;

    let zipCode = "";
    const zipMatch = addressStr.match(/\d{5}-?\d{3}/);
    if (zipMatch) {
        zipCode = zipMatch[0];
        addressStr = addressStr.replace(zipCode, "");
    }

    // clean up separators at ends
    addressStr = addressStr.trim().replace(/(^[,\-\s]+)|([,\-\s]+$)/g, "");

    const parts = addressStr.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return null;

    const street = parts[0] || "";
    let number = "";
    let complement = "";
    let neighborhood = "";
    let city = "";
    let state = "SP";

    // Identify city - state (usually the last part of parts)
    let cityStateIndex = -1;
    for (let i = parts.length - 1; i >= 1; i--) {
        if (parts[i].includes("-")) {
            const dashParts = parts[i].split("-").map(p => p.trim());
            // Check if second part looks like a state (2 letters)
            if (dashParts[dashParts.length - 1].length === 2) {
                state = dashParts[dashParts.length - 1].toUpperCase();
                city = dashParts.slice(0, -1).join("-").trim();
                cityStateIndex = i;
                break;
            }
        }
    }

    if (cityStateIndex === -1 && parts.length >= 2) {
        city = parts[parts.length - 1];
        cityStateIndex = parts.length - 1;
    }

    const middleParts = parts.slice(1, cityStateIndex > -1 ? cityStateIndex : undefined);

    if (middleParts.length === 1) {
        const part = middleParts[0];
        const parenMatch = part.match(/\(([^)]+)\)/);
        if (parenMatch) {
            complement = parenMatch[1].trim();
            number = part.replace(/\([^)]+\)/, "").trim();
        } else if (part.includes("-")) {
            const dashParts = part.split("-").map(p => p.trim());
            number = dashParts[0];
            neighborhood = dashParts.slice(1).join("-").trim();
        } else {
            // Check if part looks like house number (digits, S/N, km, etc.)
            const isNumberLike = /^\d+|^s\/n|^sn/i.test(part);
            if (isNumberLike) {
                number = part;
            } else {
                neighborhood = part;
                number = "S/N";
            }
        }
    } else if (middleParts.length >= 2) {
        const numPart = middleParts[0];
        const parenMatch = numPart.match(/\(([^)]+)\)/);
        if (parenMatch) {
            complement = parenMatch[1].trim();
            number = numPart.replace(/\([^)]+\)/, "").trim();
        } else {
            number = numPart;
        }

        const neighborhoodPart = middleParts[1];
        if (neighborhoodPart.includes("-")) {
            const dashParts = neighborhoodPart.split("-").map(p => p.trim());
            if (!complement) {
                complement = dashParts[0];
                neighborhood = dashParts.slice(1).join("-").trim();
            } else {
                neighborhood = neighborhoodPart;
            }
        } else {
            neighborhood = neighborhoodPart;
        }
    }

    if (!number || number.trim() === "" || number.toLowerCase() === neighborhood.toLowerCase()) {
        number = "S/N";
    }

    return {
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        zipCode
    };
}

function normalizeCustomerForCard(customer: any) {
    if (!customer) return null

    const primaryAddress =
        customer.address ||
        customer.addresses?.find((address: any) => address?.address_type === "primary" || address?.is_default) ||
        customer.addresses?.[0] ||
        null

    const billingAddress = customer.addresses?.find((address: any) => address?.address_type === "billing") || null

    const mapAddress = (address: any) => ({
        address_type: address.address_type || "primary",
        is_default: !!address.is_default,
        zipCode: address.zipCode || address.zip_code || "",
        street: address.street || "",
        number: address.number || "",
        complement: address.complement || "",
        neighborhood: address.neighborhood || "",
        city: address.city || "",
        state: address.state || address.uf || "",
        country: address.country || "BR",
    })

    return {
        id: customer.id,
        name: customer.name,
        email: customer.email || null,
        phone: customer.phone || null,
        image_url: customer.image_url || customer.avatar_url || customer.avatar || customer.imageUrl || null,
        addresses: [primaryAddress, billingAddress]
            .filter(Boolean)
            .map(mapAddress),
    }
}

export default function CreateOrder({ onBack, partnerId, editOrderId }: CreateOrderProps) {
    const { toast } = useToast()
    const { success: notifySuccess, error: notifyError, warning: notifyWarning } = useNotification()
    const { planSlug, role, hasSpecific, canRbac } = usePermissions()
    const canDiscount = hasSpecific("orders", "can_apply_discount")
    const { openPlanUpgrade } = usePlanUpgrade()
    const router = useRouter()
    const debouncedRefresh = useDebouncedRefresh()
    const csrfToken = useCSRFToken()
    const { selectedStore } = useStore()

    const { businessInfo: contextBusinessInfo } = usePermissions()
    const businessInfo = useMemo(() => normalizeBusinessInfo(contextBusinessInfo), [contextBusinessInfo])
    const salesSettings: SalesSettings = useMemo(() => ({
        ...DEFAULT_SALES_SETTINGS,
        ...((businessInfo as any)?.salesSettings || {}),
    }), [businessInfo])
    const isQuick = isQuickMode(businessInfo)

    // --- State ---
    const [isLoadingData, setIsLoadingData] = useState(!!editOrderId)
    const [draftOrderId] = useState(() => crypto.randomUUID())
    const orderId = editOrderId || draftOrderId

    const [stagedDocFiles, setStagedDocFiles] = useState<File[]>([])
    const [stagedImageFiles, setStagedImageFiles] = useState<(string | File)[]>([])

    const uploadStagedAttachments = async (targetOrderId: string) => {
        if (stagedDocFiles.length === 0 && stagedImageFiles.length === 0) return
        const res = await uploadAndSavePendingAttachments({
            partnerId,
            entityId: targetOrderId,
            entityType: "order",
            files: stagedDocFiles,
            images: stagedImageFiles,
        })
        if (!res.success && res.errors) {
            console.error("Aviso no upload de anexos do pedido:", res.errors)
        }
    }
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
    const [originalPaymentProvider, setOriginalPaymentProvider] = useState("")
    const [originalPaymentBreakdown, setOriginalPaymentBreakdown] = useState<PaymentBreakdownEntry[]>([])
    const [originalOrderSource, setOriginalOrderSource] = useState<string | null>(null)
    const [paymentMethodDiscountAmount, setPaymentMethodDiscountAmount] = useState(0)
    const [paymentMethodExtraAmount, setPaymentMethodExtraAmount] = useState(0)
    const [originalTotalAmount, setOriginalTotalAmount] = useState(0)
    const [originalSubtotal, setOriginalSubtotal] = useState(0)
    const [originalDiscountAmount, setOriginalDiscountAmount] = useState(0)
    const [originalCouponDiscountAmount, setOriginalCouponDiscountAmount] = useState(0)

    // Form State
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
    const [orderDate, setOrderDate] = useState(formatLocalISODate(new Date()))
    const [salesChannel, setSalesChannel] = useState("Manual")
    const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>("pickup")
    const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partially_paid' | 'unpaid'>("unpaid")
    const [originalDeliveryStatus, setOriginalDeliveryStatus] = useState('not_sent')
    const [deliveryStatus, setDeliveryStatus] = useState('not_sent')
    const [selectedDeliveryPersonId, setSelectedDeliveryPersonId] = useState("")
    const [platformDriver, setPlatformDriver] = useState<any>(null)
    const [deliveryDate, setDeliveryDate] = useState(formatLocalISODate(new Date()))
    const [deliveryTime, setDeliveryTime] = useState(formatCurrentLocalTime())
    const [financeAccounts, setFinanceAccounts] = useState<FinanceAccountOption[]>([])
    const [deliveryPeople, setDeliveryPeople] = useState<DeliveryPersonOption[]>([])
    const [isDriverSheetOpen, setIsDriverSheetOpen] = useState(false)
    const [financeAccountId, setFinanceAccountId] = useState("")

    // items
    const [items, setItems] = useState<any[]>([])

    // Instant product+services search (client-side bucket)
    const fetchCombinedBucket = useCallback(async () => {
        const [products, services] = await Promise.all([
            fetchPartnerProductsBucket(),
            fetchPartnerServicesBucket()
        ]);
        const mappedServices = services.map((s: any) => ({
            id: s.id,
            name: s.name,
            sku: 'SERVIÇO',
            gtin: null,
            price: s.price,
            promotional_price: s.promotional_price,
            category_id: s.category_id,
            stock: 0,
            allow_sell_without_stock: true,
            image: null,
            has_variants: false,
            unit: null,
            isService: true,
        }));
        return [...products, ...mappedServices];
    }, []);
    const productBucket = useProductBucket(fetchCombinedBucket, { pageSize: 10 })
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)

    const [orderPromotions, setOrderPromotions] = useState<any[]>([])
    const promotionsLoadedRef = useRef(false)

    useEffect(() => {
        if (!partnerId || promotionsLoadedRef.current) return
        promotionsLoadedRef.current = true
        listActivePromotionsForMarketplaceAction(partnerId).then(res => {
            if (Array.isArray(res)) setOrderPromotions(res)
        }).catch(() => { })
    }, [partnerId])

    // Financial
    const [shippingFee, setShippingFee] = useState("0")
    const [isCustomShipping, setIsCustomShipping] = useState(false)
    const [otherCosts, setOtherCosts] = useState("0")
    const [discountValue, setDiscountValue] = useState(0)
    const [discountType, setDiscountType] = useState<'fixed' | 'percentage' | 'coupon'>('fixed')
    const [couponCode, setCouponCode] = useState("")
    const [couponId, setCouponId] = useState<string | null>(null)
    const [couponDiscountAmount, setCouponDiscountAmount] = useState(0)
    const [couponPricingData, setCouponPricingData] = useState<PricingCoupon | null>(null)

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
    const [pendingZeroStockItem, setPendingZeroStockItem] = useState<{ product: any; isVariant?: boolean; force?: boolean; callback?: () => void } | null>(null)
    const [showZeroStockAlert, setShowZeroStockAlert] = useState(false)
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

    // Fluxos idênticos ao PDV (desconto + entrega)
    const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false)
    const [globalDiscountValue, setGlobalDiscountValue] = useState(0)
    const [globalDiscountType, setGlobalDiscountType] = useState<"fixed" | "percentage" | "coupon">("fixed")
    const [globalDiscountCouponCode, setGlobalDiscountCouponCode] = useState("")
    const [isCouponSheetOpen, setIsCouponSheetOpen] = useState(false)
    const [isApplyingCoupon, setIsApplyingCoupon] = useState(false)
    const percentagePresets = [5, 10, 15, 20]
    const [isShippingSheetOpen, setIsShippingSheetOpen] = useState(false)
    const [shippingCustomerDetails, setShippingCustomerDetails] = useState<any | null>(null)
    const [deliveryBreakdown, setDeliveryBreakdown] = useState<Record<string, unknown> | null>(null)
    const [customerSelectIntent, setCustomerSelectIntent] = useState<"default" | "shipping-preflight">("default")

    // --- Calculations ---
    const subtotal = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
    }, [items])

    const [depositSettings, setDepositSettings] = useState<{ depositEnabled: boolean; depositPercentage: number }>({
        depositEnabled: false,
        depositPercentage: 50,
    })

    useEffect(() => {
        if (!partnerId) return
        let active = true
        getServiceCheckoutSettingsAction(partnerId).then((res) => {
            if (active && res?.success && res?.settings) {
                setDepositSettings({
                    depositEnabled: Boolean(res.settings.depositEnabled),
                    depositPercentage: Number(res.settings.depositPercentage || 50),
                })
            }
        })
        return () => { active = false }
    }, [partnerId])

    const serviceSubtotal = useMemo(
        () => items.filter((item) => item.isService).reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
        [items],
    )
    const depositChargeAmount = useMemo(() => {
        if (!depositSettings.depositEnabled) return 0
        const pct = (depositSettings.depositPercentage || 50) / 100
        return Math.round(serviceSubtotal * pct * 100) / 100
    }, [serviceSubtotal, depositSettings])

    const hasWinningDiscount = useMemo(() => {
        return items.some((item) => {
            if (item.isManual) return false
            const original = Number(item.originalPrice ?? item.unitPrice)
            return item.unitPrice < original
        })
    }, [items])

    const discountAmount = useMemo(() => {
        if (discountType === 'percentage') {
            return (subtotal * discountValue) / 100
        }
        if (discountType === "coupon") return 0
        return discountValue
    }, [subtotal, discountValue, discountType])

    const pricingPreview = useMemo(() => calculateOrderPricing({
        items: items.map((item) => ({
            productId: item.productId || null,
            serviceId: null,
            unitPrice: Number(item.unitPrice || 0),
            quantity: Number(item.quantity || 0),
        })),
        shippingCost: parseFloat(shippingFee || "0"),
        additionalCosts: parseFloat(otherCosts || "0"),
        manualDiscount: discountAmount > 0 ? { type: "fixed", value: discountAmount } : null,
        coupon: couponPricingData,
        promotions: orderPromotions,
    }), [items, shippingFee, otherCosts, discountAmount, couponPricingData, orderPromotions])

    const effectiveCouponDiscountAmount = couponPricingData
        ? pricingPreview.couponDiscountAmount
        : couponDiscountAmount

    const totalAmount = useMemo(() => {
        return pricingPreview.finalTotal
    }, [pricingPreview])

    const remainingAmount = useMemo(() => {
        return Math.max(0, totalAmount - originalPaidAmount)
    }, [totalAmount, originalPaidAmount])

    const primaryActionLabel = editOrderId ? "Salvar" : "Finalizar Venda"
    const isPaidOrderLocked = Boolean(editOrderId && originalPaymentStatus === "paid")
    const isMarketplaceOrder = originalOrderSource === "Online Store"

    const isAlreadyPaid = Boolean(
        editOrderId && (
            originalPaymentStatus === "paid" ||
            remainingAmount <= 0.009 ||
            (originalPaidAmount >= totalAmount - 0.009 && totalAmount > 0)
        )
    )

    const isPaidOrder = originalPaymentStatus === 'paid' || originalPaymentStatus === 'partially_paid'
    const isDeliveredOrder = originalDeliveryStatus === 'delivered'
    const isMarketplaceLocked = isMarketplaceOrder && isPaidOrder

    const normalizeSalesChannel = useCallback((value?: string | null) => {
        if (!value) return "Manual"
        if (value === "Direct Sales") return "Manual"
        if (value === "Online Store") return "Loja Online"
        return value
    }, [])

    const currentOrderSignature = useMemo(() => {
        return JSON.stringify({
            items: items.map(i => ({ id: i.productId || i.id, qty: i.quantity, price: i.unitPrice, name: i.name })),
            customerId: selectedCustomer?.id || null,
            salesChannel,
            deliveryMethod,
            paymentStatus,
            deliveryStatus,
            deliveryDate,
            deliveryTime,
            financeAccountId,
            notes,
            shippingFee,
            otherCosts,
            discountValue,
            discountType,
            couponId
        })
    }, [items, selectedCustomer, salesChannel, deliveryMethod, paymentStatus, deliveryStatus, deliveryDate, deliveryTime, financeAccountId, notes, shippingFee, otherCosts, discountValue, discountType, couponId])

    const [initialSignature, setInitialSignature] = useState("")
    const signatureCaptured = useRef(false)

    useEffect(() => {
        if (!isLoadingData && !signatureCaptured.current) {
            setInitialSignature(currentOrderSignature)
            signatureCaptured.current = true
        }
    }, [isLoadingData, currentOrderSignature])

    const isDirty = useMemo(() => {
        if (!editOrderId) {
            return items.length > 0 || !!selectedCustomer || Number(discountValue) > 0 || Number(shippingFee) > 0 || !!notes.trim()
        }
        if (isLoadingData || !initialSignature) return false
        return currentOrderSignature !== initialSignature
    }, [editOrderId, items, selectedCustomer, discountValue, shippingFee, notes, isLoadingData, initialSignature, currentOrderSignature])

    const { showConfirmDialog, confirmNavigation, cancelNavigation } = useUnsavedChanges(isDirty && !isPaymentModalOpen && !isSaving)

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
                setSelectedCustomer(order.customers ? normalizeCustomerForCard(order.customers) : (order.buyer_id ? { id: order.buyer_id, name: order.customer_name } : null))
                setOrderDate(order.created_at.split('T')[0])
                setSalesChannel(normalizeSalesChannel(order.order_source))
                setOriginalOrderSource(order.order_source || null)
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
                setOriginalPaymentProvider(order.payment_provider || "")
                setOriginalPaymentBreakdown(loadedPaymentBreakdown)
                setDeliveryStatus(order.delivery_status || "not_sent")
                setOriginalDeliveryStatus(order.delivery_status || "not_sent")
                if (order.platform_driver) setPlatformDriver(order.platform_driver)
                if (order.platform_driver_id) setSelectedDeliveryPersonId(`platform:${order.platform_driver_id}`)
                setDeliveryDate(order.created_at.split('T')[0])
                setDeliveryTime(formatCurrentLocalTime(new Date(order.created_at)))
                setFinanceAccountId(order.finance_account_id || "")
                setNotes(cleanOrderNotes(order.notes))
                setShippingFee((order.delivery_fee || 0).toString())
                setOtherCosts((order.additional_costs || 0).toString())
                setDiscountValue(order.discount_value || 0)
                setDiscountType(order.discount_type || "fixed")
                setPaymentMethodDiscountAmount(Number(order.payment_method_discount_amount || 0))
                setPaymentMethodExtraAmount(Number(order.payment_method_extra_amount || 0))
                setOriginalTotalAmount(Number(order.total_amount || 0))
                setOriginalSubtotal(Number(order.subtotal_value || 0))
                setOriginalDiscountAmount(Number(order.discount_value || 0))
                setOriginalCouponDiscountAmount(Number(order.coupon_discount_amount || 0))
                const hasCoupon = !!order.coupon_id && !!order.coupons;
                const couponData = order.coupons;
                setCouponId(order.coupon_id || null);
                setCouponDiscountAmount(Number(order.coupon_discount_amount || 0));
                if (hasCoupon) {
                    setCouponCode(couponData.code || "");
                    setGlobalDiscountCouponCode(couponData.code || "");
                    setDiscountType("coupon");
                    setCouponPricingData({
                        id: couponData.id,
                        discountType: couponData.discount_type as any,
                        discountValue: Number(couponData.discount_value || 0),
                        maxDiscountValue: couponData.max_discount_value != null ? Number(couponData.max_discount_value) : null,
                        freeShipping: couponData.discount_type === "free_shipping" || !!couponData.free_shipping
                    });
                } else if (order.coupon_id) {
                    // Fallback mock
                    setCouponCode("");
                    setGlobalDiscountCouponCode("");
                    setDiscountType("coupon");
                    setCouponPricingData({
                        id: order.coupon_id,
                        discountType: "fixed",
                        discountValue: Number(order.coupon_discount_amount || 0),
                        maxDiscountValue: null,
                        freeShipping: false
                    });
                } else {
                    setCouponCode("");
                    setGlobalDiscountCouponCode("");
                    setDiscountType(order.discount_type || "fixed");
                    setCouponPricingData(null);
                }
                setInventoryAlreadyDeducted(Boolean(order.inventory_deducted))

                if (order.order_items) {
                    setItems((order.order_items as any[]).map((item: any) => ({
                        id: item.id || Math.random().toString(36).substr(2, 9),
                        productId: item.product_id,
                        variantId: item.variant_id || null,
                        name: item.product_name,
                        unitPrice: Number(item.product_price),
                        originalPrice: Number(item.products?.price || item.product_price),
                        hasDiscount: Number(item.product_price) < Number(item.products?.price || item.product_price),
                        quantity: Number(item.quantity),
                        sortOrder: Number(item.sort_order ?? 0),
                        image: item.product_variants?.image || item.products?.images?.[0] || item.image || item.product?.image || item.services?.images?.[0] || null,
                        sku: item.product_variants?.sku || item.sku || item.product?.sku || item.products?.sku || (item.services ? 'SERVIÇO' : ""),
                        stock: Number(item.product_variants?.stock_available ?? item.product_variants?.stock_quantity ?? item.products?.stock_available ?? item.products?.stock_quantity ?? 0),
                        allowSellWithoutStock: Boolean(item.products?.allow_sell_without_stock) || !!item.services || item.line_type === 'service_booking',
                        unit: item.products?.unit || item.product?.unit || null,
                        isEditing: false,
                        isManual: !item.product_id && item.line_type !== 'service_booking',
                        isService: !!item.services || item.sku === 'SERVIÇO' || item.products?.sku === 'SERVIÇO' || item.line_type === 'service_booking',
                        serviceId: item.service_id || null,
                        lineType: item.line_type || 'product',
                        fulfillmentMode: item.fulfillment_mode || null,
                    })))
                }

                if (order.delivery_address) {
                    const parsed = parseAddressString(order.delivery_address)
                    if (parsed) {
                        setCep(parsed.zipCode || "")
                        setStreet(parsed.street || "")
                        setNumber(parsed.number || "")
                        setComplement(parsed.complement || "")
                        setNeighborhood(parsed.neighborhood || "")
                        setCity(parsed.city || "")
                        setUf(parsed.state || "SP")
                        setNoNumber(parsed.number === "S/N")
                    }
                }
            } else {
                notifyError("Erro ao carregar pedido", res.error)
            }
            setIsLoadingData(false)
        }
        load()
    }, [editOrderId, partnerId, notifyError, normalizeSalesChannel])

    const searchParams = useSearchParams()
    useEffect(() => {
        if (!isLoadingData && editOrderId && searchParams?.get("payment") === "1") {
            if (isAlreadyPaid) {
                notifyWarning("Pedido já quitado", "Este pedido já foi totalmente pago e não permite novos pagamentos.")
                const params = new URLSearchParams(searchParams?.toString())
                params.delete("payment")
                const newQuery = params.toString() ? `?${params.toString()}` : ""
                router.replace(`/erp/pedidos${newQuery}`)
                setIsPaymentModalOpen(false)
                return
            }
            setIsPaymentModalOpen(true)
        }
    }, [isLoadingData, editOrderId, searchParams, isAlreadyPaid, notifyWarning, router])

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
        if (deliveryMethod !== "delivery" || deliveryPeople.length > 0) return
        async function loadDeliveryPeople() {
            const list = await fetchDeliveryPeopleBucketAction(partnerId).catch(() => [])
            setDeliveryPeople(list as any[])
        }
        void loadDeliveryPeople()
    }, [deliveryMethod, deliveryPeople.length, partnerId])

    useEffect(() => {
        if (financeAccountId || financeAccounts.length === 0) return
        const defaultOrderAccountId = pickBankThenCashDefaultFinanceAccountId(financeAccounts)
        if (defaultOrderAccountId) setFinanceAccountId(defaultOrderAccountId)
    }, [financeAccountId, financeAccounts])

    useEffect(() => {
        if (!isDiscountModalOpen) return
        setGlobalDiscountValue(discountValue)
        setGlobalDiscountType(discountType === "coupon" ? "coupon" : (discountType as any))
        setGlobalDiscountCouponCode(couponCode)
    }, [isDiscountModalOpen, discountValue, discountType, couponCode])

    const handleOpenShippingSheet = useCallback(async () => {
        if (selectedCustomer?.id) {
            const addr = selectedCustomer.addresses?.[0]
            setShippingCustomerDetails({
                id: selectedCustomer.id,
                name: selectedCustomer.name,
                email: selectedCustomer.email || null,
                phone: selectedCustomer.phone || null,
                address: addr ? {
                    zipCode: addr.zipCode || addr.zip_code || "",
                    street: addr.street || "",
                    number: addr.number || "",
                    complement: addr.complement || "",
                    neighborhood: addr.neighborhood || "",
                    city: addr.city || "",
                    state: addr.state || addr.uf || "",
                } : null,
            })
            setIsShippingSheetOpen(true)
            getPOSCustomerDetailsAction({ partnerId, customerId: selectedCustomer.id }).then(res => {
                if (res.success && res.data) setShippingCustomerDetails(res.data)
            })
            return
        }
        setCustomerSelectIntent("shipping-preflight")
        setIsCustomerSheetOpen(true)
    }, [selectedCustomer, partnerId])

    useEffect(() => {
        let active = true
        async function maybeAutoFillAddress() {
            if (deliveryMethod !== "delivery") return
            if (!selectedCustomer?.id) return

            const details = await getPOSCustomerDetailsAction({ partnerId, customerId: selectedCustomer.id })
            if (!active) return
            if (!details.success || !details.data) return

            setSelectedCustomer((prev: any) => normalizeCustomerForCard({ ...prev, ...details.data }))

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

    useEffect(() => {
        let active = true
        const allItemsAreServices = items.length > 0 && items.every((item) => Boolean(item.isService))
        if (deliveryMethod !== "delivery" || isCustomShipping || allItemsAreServices) {
            return
        }

        const hasStreet = !!street?.trim()
        const hasCity = !!city?.trim()
        const hasNeighborhood = !!neighborhood?.trim()
        const hasUf = !!uf?.trim()

        if (!hasStreet || !hasCity || !hasNeighborhood || !hasUf) {
            setShippingFee("0")
            setDeliveryBreakdown(null)
            return
        }

        const destinationAddress = `${street}, ${number || "S/N"} - ${neighborhood}, ${city} - ${uf}, ${cep}`

        const timer = setTimeout(async () => {
            const quote = await quoteDeliveryFeeAction({
                partnerId,
                storeId: selectedStore?.id || null,
                destinationAddress,
                orderSubtotal: subtotal,
                allowOutsideRadius: true,
            })
            if (!active) return

            if (quote.success) {
                const originalFee = Number(quote.breakdown?.originalFee ?? quote.fee ?? 0)
                const payer = quote.breakdown?.deliveryPayer === "seller" ? "seller" : "customer"
                const effectiveFee = payer === "seller" ? 0 : originalFee
                setShippingFee(String(Math.max(0, effectiveFee)))
                setDeliveryBreakdown(quote.breakdown ? { ...quote.breakdown, deliveryPayer: payer, originalFee, deliverySubsidy: payer === "seller" ? originalFee : 0 } : null)
            } else {
                setShippingFee("0")
                setDeliveryBreakdown(null)
            }
        }, 300)

        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [deliveryMethod, cep, street, number, neighborhood, city, uf, partnerId, isCustomShipping, selectedStore?.id])

    // --- Handlers ---
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const handleBack = useCallback(() => {
        if (isDirty) {
            setShowAlertModal(true)
        } else {
            onBack()
        }
    }, [isDirty, onBack])

    const { setHeaderOverride } = useSidebar()
    const pageTitle = editOrderId ? "Editar pedido" : "Novo pedido"

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [pageTitle, handleBack, setHeaderOverride])

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
                if (item.allowSellWithoutStock) {
                    existing.allowSellWithoutStock = true
                }
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
            if (entry.allowSellWithoutStock && salesSettings.allowNegativeStock !== false) continue
            if (entry.quantity > entry.stock) {
                if (salesSettings.allowNegativeStock === false) {
                    return `O produto "${entry.name}" não possui estoque suficiente (${entry.stock} disponíveis) e as configurações da empresa bloqueiam vendas com estoque negativo.`
                }
                return `A quantidade de "${entry.name}" está maior que o estoque disponível.`
            }
        }

        return null
    }, [inventoryAlreadyDeducted, salesSettings.allowNegativeStock])

    const proceedAddProduct = (product: any, forceBypass?: boolean) => {
        const pricing = computeItemDisplayPrice(Number(product.price || 0), product.promotional_price && Number(product.promotional_price) < Number(product.price || 0) ? Number(product.promotional_price) : null, orderPromotions, { productId: product.id, categoryId: product.category_id || undefined })
        const newItem = {
            id: Math.random().toString(36).substr(2, 9),
            productId: product.isService ? null : product.id,
            serviceId: product.isService ? product.id : (product.serviceId || null),
            lineType: product.isService ? 'service_booking' : (product.lineType || 'product'),
            name: product.name,
            unitPrice: pricing.bestPrice,
            originalPrice: Number(product.price || 0),
            hasDiscount: pricing.hasDiscount,
            quantity: 1,
            sortOrder: items.length,
            image: product.image,
            sku: product.sku,
            stock: Number(product.stock || 0),
            allowSellWithoutStock: forceBypass || product.isService ? true : Boolean(product.allow_sell_without_stock),
            unit: product.unit || null,
            isEditing: false,
            isManual: false,
            isService: Boolean(product.isService)
        }
        setItems([...items, newItem])
        setFieldErrors(prev => {
            const next = new Set(prev)
            next.delete("productSearch")
            return next
        })
        productBucket.setSearchQuery("")
    }

    const addProductToOrder = (product: any) => {
        if (product.has_variants) {
            setSelectedProductForVariant(product)
            setIsVariantSheetOpen(true)
        } else {
            if (!product.allow_sell_without_stock && Number(product.stock || 0) < 1) {
                if (salesSettings.allowNegativeStock === false) {
                    notifyError(`O produto "${product.name}" está sem estoque e as configurações da empresa não permitem vendas com estoque negativo.`)
                    return
                }
                setPendingZeroStockItem({ product, callback: () => proceedAddProduct(product, true) })
                setShowZeroStockAlert(true)
                return
            }
            proceedAddProduct(product, false)
        }
    }

    const handleVariantsConfirm = (selections: Array<{ variantId: string; qty: number }>) => {
        selections.forEach(sel => {
            const variant = selectedProductForVariant?.variants?.find((v: any) => String(v.id) === String(sel.variantId))
            if (!variant) return
            if (sel.qty > 0) {
                const cannotSell = !selectedProductForVariant.allow_sell_without_stock && sel.qty > Number(variant.stock || 0)

                const add = (forceBypass?: boolean) => {
                    const newItem = {
                        id: Math.random().toString(36).substr(2, 9),
                        productId: selectedProductForVariant.id,
                        variantId: variant.id,
                        name: `${selectedProductForVariant.name} - ${variant.name}`,
                        unitPrice: variant.price || selectedProductForVariant.price,
                        originalPrice: variant.price || selectedProductForVariant.price,
                        hasDiscount: false,
                        quantity: sel.qty,
                        sortOrder: items.length,
                        image: variant.image || selectedProductForVariant.image,
                        sku: variant.sku || selectedProductForVariant.sku,
                        stock: Number(variant.stock || 0),
                        allowSellWithoutStock: forceBypass ? true : Boolean(selectedProductForVariant.allow_sell_without_stock),
                        unit: selectedProductForVariant.unit || null,
                        isEditing: false,
                        isManual: false
                    }
                    setItems(prev => [...prev, newItem])
                    setFieldErrors(prev => {
                        const next = new Set(prev)
                        next.delete("productSearch")
                        return next
                    })
                }

                if (cannotSell) {
                    if (salesSettings.allowNegativeStock === false) {
                        notifyError(`A variação "${variant.name}" não possui estoque suficiente (${variant.stock || 0} disponíveis) e as configurações da empresa não permitem vendas com estoque negativo.`)
                        return
                    }
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
        setSelectedProductForVariant(null)
        productBucket.setSearchQuery("")
    }

    const updateItemField = (index: number, field: string, value: any) => {
        const targetItem = items[index]
        if (field === "unitPrice" && targetItem && !targetItem.isManual && salesSettings.allowCustomItemPrice === false) {
            notifyError("A alteração manual de preço unitário em itens cadastrados está desativada nas configurações de vendas.")
            return
        }
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
        const item = newItems[index]
        const maxQty = getItemMaxQuantity(item)
        if (maxQty !== undefined && normalizedQty > maxQty && !item.allowSellWithoutStock) {
            setPendingZeroStockItem({
                product: { name: item.name },
                callback: () => {
                    setItems(prev => {
                        const updated = [...prev]
                        updated[index] = { ...updated[index], quantity: normalizedQty, allowSellWithoutStock: true }
                        return updated
                    })
                }
            })
            setShowZeroStockAlert(true)
            return
        }
        item.quantity = normalizedQty
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
        setDeliveryMethod("pickup")
        setNotes("")
        setShippingFee("0")
        setOtherCosts("0")
        setDiscountValue(0)
        setCouponCode("")
        setCouponId(null)
        setCouponDiscountAmount(0)
        setCouponPricingData(null)
        setPaymentStatus("unpaid")
        setDeliveryStatus("not_sent")
        setSelectedDeliveryPersonId("")
        setDeliveryDate(formatLocalISODate(new Date()))
        setDeliveryTime(formatCurrentLocalTime())
        setFinanceAccountId("")
        setOriginalPaidAmount(0)
        setOriginalPaymentMethod("Não informado")
        setOriginalPaymentProvider("")
        setOriginalPaymentBreakdown([])
        setOriginalOrderSource(null)
        setInventoryAlreadyDeducted(false)
        setManualItemNameErrors(new Set())
        setManualItemPriceErrors(new Set())
        setFieldErrors(new Set())
        setCep("")
        setStreet("")
        setNumber("")
        setComplement("")
        setNeighborhood("")
        setCity("")
        setUf("SP")
        setNoNumber(false)
        setIsCustomShipping(false)
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

        if (salesSettings.maxDiscountPercent !== null && salesSettings.maxDiscountPercent < 100) {
            const totalDiscount = discountAmount + effectiveCouponDiscountAmount
            const effectiveDiscountPercent = subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0
            if (effectiveDiscountPercent > salesSettings.maxDiscountPercent + 0.01) {
                setActiveTab("general")
                setValidationMessage(`O desconto de ${effectiveDiscountPercent.toFixed(1)}% ultrapassa o limite máximo permitido (${salesSettings.maxDiscountPercent}%) configurado para as vendas da empresa.`)
                setShowValidationModal(true)
                return false
            }
        }

        if (!financeAccountId) {
            setFieldErrors(new Set(["financeAccountId"]))
            setActiveTab("general")
            setValidationMessage("Selecione a conta de recebimento da venda antes de salvar.")
            setShowValidationModal(true)
            return false
        }

        if (deliveryMethod === "delivery") {
            const hasStreet = !!street?.trim()
            const hasCity = !!city?.trim()
            const hasNeighborhood = !!neighborhood?.trim()
            const hasCep = !!cep?.trim()
            const hasState = !!uf?.trim()

            if (!hasStreet || !hasCity || !hasNeighborhood || !hasCep || !hasState) {
                setFieldErrors(prev => {
                    const next = new Set(prev)
                    if (!hasStreet) next.add("street")
                    if (!hasCity) next.add("city")
                    if (!hasNeighborhood) next.add("neighborhood")
                    if (!hasCep) next.add("cep")
                    if (!hasState) next.add("uf")
                    return next
                })
                setActiveTab("delivery")
                setValidationMessage("O endereço de entrega é obrigatório (CEP, Rua, Bairro, Cidade e Estado). Por favor, preencha todos os campos na aba de Entrega.")
                setShowValidationModal(true)
                return false
            }
        }

        if (deliveryMethod === "delivery" && (!deliveryDate || !deliveryTime)) {
            setFieldErrors(new Set(["deliveryDate", "deliveryTime"]))
            setActiveTab("delivery")
            setValidationMessage("Preencha a data e o horÃ¡rio de saÃ­da para criar a entrega automÃ¡tica.")
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

        if (editOrderId && originalPaidAmount > 0 && totalAmount < (originalPaidAmount - 0.009)) {
            setActiveTab("general")
            setValidationMessage(`O valor total do pedido (R$ ${totalAmount.toFixed(2)}) não pode ser menor que o crédito de troca já aplicado (R$ ${originalPaidAmount.toFixed(2)}).`)
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
        isPendingDelivery?: boolean
        paymentProvider?: string
        mpPaymentId?: string
        checkoutFulfillment?: Record<string, unknown> | null
    }) => {
        const finalPaymentStatus = paymentOverrides?.paymentStatus || paymentStatus;
        let finalDeliveryStatus = deliveryStatus;
        if (paymentOverrides?.isPendingDelivery) {
            finalDeliveryStatus = deliveryMethod === "pickup" ? "pickup_available" : "not_sent";
        } else if (paymentOverrides?.deliveryStatus) {
            finalDeliveryStatus = paymentOverrides.deliveryStatus;
        } else if (editOrderId) {
            finalDeliveryStatus = deliveryStatus;
        } else {
            finalDeliveryStatus = deliveryMethod === "pickup" ? "delivered" : deliveryStatus;
        }

        return {
            id: orderId,
            partnerId,
            storeId: selectedStore?.id,
            customerId: selectedCustomer?.id,
            customerName: selectedCustomer ? selectedCustomer.name : "Consumidor final",
            salesChannel,
            deliveryMethod,
            financeAccountId,
            paymentStatus: finalPaymentStatus,
            paymentMethod: paymentOverrides?.paymentMethod || (editOrderId ? originalPaymentMethod : "Método não definido"),
            paymentBreakdown: paymentOverrides?.paymentBreakdown || originalPaymentBreakdown,
            deliveryStatus: finalDeliveryStatus as any,
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
                productId: item.isService || item.serviceId ? null : item.productId,
                variantId: item.variantId,
                customName: item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                sortOrder: idx,
                serviceId: item.serviceId || (item.isService ? item.productId : null),
                lineType: item.isService || item.serviceId ? 'service_booking' : (item.lineType || 'product'),
                fulfillmentMode: item.fulfillmentMode || null,
                allowSellWithoutStock: Boolean(item.allowSellWithoutStock),
            })),
            subtotal,
            discountValue: discountAmount,
            discountType: 'fixed' as const,
            couponCode: couponCode || undefined,
            couponId,
            couponDiscountAmount: effectiveCouponDiscountAmount,
            shippingCost: parseFloat(shippingFee || "0"),
            additionalCosts: parseFloat(otherCosts || "0"),
            deliveryBreakdown: deliveryBreakdown || undefined,
            totalAmount,
            notes,
            csrf_token: csrfToken || undefined,
            paymentProvider: paymentOverrides?.paymentProvider || undefined,
            mpPaymentId: paymentOverrides?.mpPaymentId || undefined,
            checkoutFulfillment: paymentOverrides?.checkoutFulfillment || undefined,
        }
    }

    const handleSetCustomer = useCallback((val: any) => {
        if (val === null && couponId && couponPricingData?.customerScope === "specific") {
            setCouponId(null)
            setCouponCode("")
            setCouponDiscountAmount(0)
            setCouponPricingData(null)
            setDiscountType("fixed")
            setDiscountValue(0)
            notifyError("Cupom removido por ser específico para um ou mais clientes.")
        }
        setSelectedCustomer(val)
        if (val?.addresses?.[0]) {
            const addr = val.addresses[0]
            setCep(String(addr.zipCode || ""))
            setStreet(String(addr.street || ""))
            const isNoNum = addr.number === "S/N" || !String(addr.number || "").trim()
            setNumber(isNoNum ? "" : String(addr.number || ""))
            setNoNumber(isNoNum)
            setComplement(String(addr.complement || ""))
            setNeighborhood(String(addr.neighborhood || ""))
            setCity(String(addr.city || ""))
            setUf(String(addr.state || "SP"))
        }
    }, [couponId, couponPricingData, notifyError])

    const handleApplyCoupon = async (directCode?: string) => {
        const code = (directCode || couponCode).trim()
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
                setCouponPricingData(null)
                notifyError(result.errorMessage || "Cupom inválido.")
                return
            }
            setCouponId(result.couponId || null)
            setCouponDiscountAmount(Number(result.discountAmount || 0))
            setCouponPricingData(result.pricingCoupon || null)
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
        isPendingDelivery?: boolean
        paymentProvider?: string
        mpPaymentId?: string
        checkoutFulfillment?: Record<string, unknown> | null
    }) => {
        setIsSaving(true)
        try {
            const payload = buildOrderPayload(paymentOverrides)
            const result = editOrderId
                ? await updateERPOrderAction(editOrderId, payload)
                : await createERPOrderAction(payload)

            if (result.success) {
                const createdOrderId = 'orderId' in result ? result.orderId : undefined
                const targetOrderId = createdOrderId || editOrderId
                // Uploads do not depend on delivery creation. Running them in
                // parallel removes avoidable time from the payment modal.
                const attachmentPromise = targetOrderId
                    ? uploadStagedAttachments(targetOrderId)
                    : Promise.resolve()

                if (!editOrderId && payload.deliveryMethod === "delivery" && createdOrderId) {
                    const isPlatformDriver = selectedDeliveryPersonId.startsWith("platform:")
                    const platformDriverId = isPlatformDriver ? selectedDeliveryPersonId.slice("platform:".length) : null
                    const autoDeliveryResult = await createERPDeliveryAction({
                        partnerId,
                        orderIds: [createdOrderId],
                        deliveryPersonId: isPlatformDriver ? null : (selectedDeliveryPersonId || null),
                        status: payload.deliveryStatus as any,
                        startedAt: new Date(`${deliveryDate}T${deliveryTime}:00`).toISOString(),
                        notes: notes?.trim() || undefined,
                    })
                    await attachmentPromise

                    if (!autoDeliveryResult.success) {
                        notifyError("Pedido criado, mas a entrega automÃ¡tica falhou", autoDeliveryResult.error)
                    } else if (platformDriverId && autoDeliveryResult.deliveryId) {
                        const assignmentResult = await assignPlatformDriverToDeliveryAction({
                            partnerId,
                            deliveryId: autoDeliveryResult.deliveryId,
                            orderIds: [createdOrderId],
                            driverId: platformDriverId,
                            notes: notes?.trim() || undefined,
                        })
                        if (!assignmentResult.success) notifyError("Pedido criado, mas não foi possível atribuir o entregador Dudit", assignmentResult.error)
                    }
                } else if (editOrderId) {
                    const isPlatformDriver = selectedDeliveryPersonId.startsWith("platform:")
                    const [syncResult] = await Promise.all([
                        syncPlatformDriverForOrderAction({
                            partnerId,
                            orderId: editOrderId,
                            driverId: isPlatformDriver ? selectedDeliveryPersonId.slice("platform:".length) : null,
                            notes: notes?.trim() || undefined,
                        }),
                        attachmentPromise,
                    ])
                    if (!syncResult.success) notifyError("Pedido salvo, mas não foi possível atualizar o entregador Dudit", syncResult.error)
                } else {
                    await attachmentPromise
                }

                notifySuccess(editOrderId ? `Pedido atualizado com sucesso!` : `Pedido criado com sucesso!`)
                debouncedRefresh()
                if (editOrderId && !paymentOverrides?.paymentMethod) {
                    onBack()
                    return { success: true, orderId: editOrderId }
                }
                setWasSaleSuccessful(true)
                const returnedOrderNumber = 'orderNumber' in result ? result.orderNumber : undefined
                return { success: true, orderNumber: returnedOrderNumber, orderId: createdOrderId || editOrderId }
            }

            const errorMsg = result.error || (editOrderId ? "Erro ao atualizar pedido" : "Erro ao criar pedido")
            if (isPlanLimitReachedError(errorMsg)) {
                const target = getNextPlanTarget(planSlug)
                if (target) openPlanUpgrade(target)
                return { error: errorMsg }
            }
            notifyError(errorMsg)
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
        if (isAlreadyPaid) {
            notifyError("Ação bloqueada", "Este pedido já está totalmente pago e não aceita novos pagamentos.")
            return { error: "Pedido já está totalmente pago." }
        }
        return submitOrder({
            paymentStatus: paymentData.paymentStatus,
            paymentMethod: paymentData.paymentMethod,
            paymentBreakdown: paymentData.paymentBreakdown,
            paidAmount: paymentData.paidAmount,
            isPendingDelivery: paymentData.isPendingDelivery,
            paymentProvider: paymentData.paymentProvider,
            mpPaymentId: paymentData.mpPaymentId,
            checkoutFulfillment: paymentData.checkoutFulfillment || undefined,
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
        if (isAlreadyPaid) {
            notifyWarning("Pedido já quitado", "Este pedido já está totalmente pago e não permite novos pagamentos.")
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

    const { scrollToFirstError } = useScrollToFirstError({
        fieldErrors,
        REQUIRED_FIELDS,
        scrollContainerRef,
        activeTab,
        setActiveTab,
    })

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

    const deliveryPeopleOptions = useMemo(() => {
        const baseOptions = deliveryPeople.map((person) => ({
            value: person.id,
            label: `${person.source === "platform" ? "Dudit · " : ""}${person.fullName}${person.vehicleType ? ` · ${person.vehicleType}` : ""}`,
        }))

        if (platformDriver && !platformDriver.isPendingAcceptance && platformDriver.id !== "dudit_network") {
            const driverName = platformDriver.fullName || "Entregador Dudit"
            const vehicleType = platformDriver.vehicleType ? ` (${platformDriver.vehicleType})` : ""
            const optVal = `platform:${platformDriver.id}`
            if (!baseOptions.some(opt => opt.value === optVal)) {
                baseOptions.unshift({
                    value: optVal,
                    label: `Dudit · ${driverName}${vehicleType}`,
                })
            }
        } else if (selectedDeliveryPersonId === "platform:dudit_network" || platformDriver?.id === "dudit_network" || platformDriver?.isPendingAcceptance) {
            if (!baseOptions.some(opt => opt.value === "platform:dudit_network")) {
                baseOptions.unshift({
                    value: "platform:dudit_network",
                    label: "Dudit · Rede de Entregadores (Aguardando aceite)",
                })
            }
        } else if (selectedDeliveryPersonId?.startsWith("platform:")) {
            if (!baseOptions.some(opt => opt.value === selectedDeliveryPersonId)) {
                baseOptions.unshift({
                    value: selectedDeliveryPersonId,
                    label: "Dudit · Entregador Parceiro",
                })
            }
        }
        return baseOptions
    }, [deliveryPeople, selectedDeliveryPersonId, platformDriver])

    if (isLoadingData) {
        return (
            <div className="w-full h-full min-h-[500px] flex justify-center items-center">
                <ThreeDotsLoader />
            </div>
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
                                            <span className="hidden md:inline truncate">{editOrderId ? "Editar pedido" : "Novo pedido"}</span>
                                        </h1>
                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            {editOrderId ? "Atualize as informações da venda" : "Preencha as informações da nova venda"}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSaveOrder} disabled={isSaving} leftIcon={<SaveIcon size={18} />}>
                                            {isSaving ? "Salvando..." : primaryActionLabel}
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs Navigation */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="general">
                                            Dados gerais
                                            {getTabErrorCount("general") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                        </TabsTrigger>
                                        {!isPaidOrder && (
                                            <TabsTrigger value="payment" className="xl:hidden">
                                                Pagamento
                                            </TabsTrigger>
                                        )}
                                        {deliveryMethod === 'delivery' && (
                                            <TabsTrigger value="delivery">
                                                Entrega
                                                {getTabErrorCount("delivery") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                            </TabsTrigger>
                                        )}
                                        {!isQuick && (
                                            <TabsTrigger value="observations">
                                                Observações
                                                {getTabErrorCount("observations") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                            </TabsTrigger>
                                        )}
                                        <TabsTrigger value="attachments">
                                            Anexos
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <TabsContent value="general" className="mt-0">
                                <FadeIn key="general">
                                    <div>
                                        <OrderGeneralTab
                                            items={items}
                                            searchQuery={productBucket.searchQuery}
                                            isProductSearchOpen={isProductSearchOpen}
                                            isSearching={productBucket.isLoading}
                                            searchResults={productBucket.filteredResults}
                                            loadMoreProducts={productBucket.loadMore}
                                            hasMoreProducts={productBucket.hasMore}
                                            searchPromotions={orderPromotions}
                                            subtotal={isPaidOrder ? originalSubtotal : subtotal}
                                            discountAmount={isPaidOrder ? originalDiscountAmount : discountAmount}
                                            discountValue={discountValue}
                                            discountType={discountType}
                                            shippingFee={shippingFee}
                                            otherCosts={otherCosts}
                                            totalAmount={isPaidOrder ? originalTotalAmount : totalAmount}
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
                                            couponDiscountAmount={isPaidOrder ? originalCouponDiscountAmount : effectiveCouponDiscountAmount}
                                            onApplyCoupon={handleApplyCoupon}
                                            onOpenDiscount={canDiscount ? () => setIsDiscountModalOpen(true) : undefined}
                                            onOpenShipping={handleOpenShippingSheet}
                                            setSelectedCustomer={handleSetCustomer}
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
                                            handleSaveOrder={editOrderId ? handleSaveOrder : handleOpenPaymentModal}
                                            isQuickMode={isQuick}
                                            salesChannelOptions={salesChannelOptions}
                                            deliveryMethodOptions={deliveryMethodOptions}
                                            deliveryStatusOptions={deliveryStatusOptions}
                                            fieldErrors={fieldErrors}
                                            setFieldErrors={setFieldErrors}
                                            isMarketplaceOrder={isMarketplaceOrder}
                                            isMarketplaceLocked={isMarketplaceLocked}
                                            isPaidOrder={isPaidOrder}
                                            originalPaymentMethod={originalPaymentMethod}
                                            originalPaymentProvider={originalPaymentProvider}
                                            originalPaymentBreakdown={originalPaymentBreakdown}
                                            originalPaidAmount={originalPaidAmount}
                                            paymentMethodDiscountAmount={paymentMethodDiscountAmount}
                                            paymentMethodExtraAmount={paymentMethodExtraAmount}
                                            role={role}
                                        />
                                    </div>
                                </FadeIn>
                            </TabsContent>

                            {!isPaidOrder && (
                                <TabsContent value="payment" className="xl:hidden mt-0">
                                    <FadeIn key="payment">
                                        <div className="bg-white dark:bg-dark-surface flex flex-col gap-6">
                                            <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading leading-tight">Pagamento</h3>

                                            {(() => {
                                                const pendingSuffix = paymentStatus !== "paid" ? ` (${paymentStatus === "partially_paid" ? "Parcial" : "Pendente"})` : "";
                                                const paymentBreakdown = Array.isArray(originalPaymentBreakdown) && originalPaymentBreakdown.length > 0
                                                    ? originalPaymentBreakdown.filter((entry: any) => entry?.method)
                                                    : Number(originalPaidAmount || 0) > 0 && originalPaymentMethod
                                                        ? [{ method: originalPaymentMethod, amount: Number(originalPaidAmount || 0) }]
                                                        : [];
                                                const methodEntries = paymentBreakdown.filter((e: any) => e?.method);
                                                const paidMethodEntries = methodEntries.filter((e: any) => Number(e?.amountReceived ?? e?.amount ?? 0) > 0.009);
                                                const paidLabels = Array.from(new Set(paidMethodEntries.map((e: any) => String(e?.method || "").toLowerCase().trim()).filter(Boolean)));
                                                const friendlyMethod = paidLabels.length > 1
                                                    ? "Múltiplos meios"
                                                    : (() => {
                                                        const raw = (paidMethodEntries[0] || methodEntries[0])?.method || originalPaymentMethod;
                                                        return raw && raw !== "Não informado" ? formatPaymentMethodLabel(raw, null) : "";
                                                    })();
                                                const mpSuffix = originalPaymentProvider === "Mercado Pago" && friendlyMethod && friendlyMethod !== "Múltiplos meios" && !friendlyMethod.toLowerCase().includes("mercado pago") ? " (Mercado Pago)" : "";
                                                const paymentMethodLabel = `${friendlyMethod || "Não informado"}${mpSuffix}${pendingSuffix}`;
                                                const hasCoupon = Number(effectiveCouponDiscountAmount || 0) > 0;

                                                return isPaidOrder ? (
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between items-start text-[14px] gap-4">
                                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Método de Pagamento</span>
                                                            <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                                {paymentMethodLabel}
                                                            </span>
                                                        </div>

                                                        {paymentBreakdown.length > 1 && (
                                                            <div className="flex justify-between items-start text-[14px] gap-4">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valores por meio</span>
                                                                <div className="flex flex-col gap-1 text-right">
                                                                    {paymentBreakdown.map((entry: any, index: number) => {
                                                                        const received = Number(entry.amountReceived ?? entry.amount ?? 0);
                                                                        const baseAmount = Number(entry.amount || 0);
                                                                        const displayAmount = received > 0.009 ? received : baseAmount;
                                                                        return (
                                                                            <span key={`${entry.method}-${index}`} className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                                                {formatPaymentMethodLabel(entry.method, null)}: {formatCurrency(displayAmount)}
                                                                                {baseAmount > 0.009 && received > 0.009 && Math.abs(baseAmount - received) > 0.009
                                                                                    ? <span className="text-brand-muted font-normal"> (de {formatCurrency(baseAmount)})</span>
                                                                                    : null}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="flex justify-between items-start text-[14px] gap-4">
                                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor Original</span>
                                                            <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(subtotal)}</span>
                                                        </div>

                                                        <div className="flex justify-between items-start text-[14px] gap-4">
                                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Tipo de Entrega</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                                {deliveryMethod === "pickup" ? "Retirada no local" : "Entrega no endereço"}
                                                            </span>
                                                        </div>

                                                        {parseFloat(shippingFee || "0") > 0 && (
                                                            <div className="flex justify-between items-start text-[14px] gap-4">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor da Entrega</span>
                                                                <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(parseFloat(shippingFee))}</span>
                                                            </div>
                                                        )}

                                                        {parseFloat(otherCosts || "0") > 0 && (
                                                            <div className="flex justify-between items-start text-[14px] gap-4">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Outros Custos</span>
                                                                <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(parseFloat(otherCosts))}</span>
                                                            </div>
                                                        )}

                                                        {discountAmount > 0 && (
                                                            <div className="flex justify-between items-start text-[14px] gap-4">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Desconto do Pedido</span>
                                                                <span className="text-brand-green font-bold">- {formatCurrency(discountAmount)}</span>
                                                            </div>
                                                        )}

                                                        {effectiveCouponDiscountAmount > 0 && (
                                                            <div className="flex justify-between items-start text-[14px] gap-4">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Desconto por Cupom</span>
                                                                <span className="text-brand-green font-bold">- {formatCurrency(effectiveCouponDiscountAmount)}</span>
                                                            </div>
                                                        )}

                                                        {paymentMethodDiscountAmount > 0 && (
                                                            <div className="flex justify-between items-start text-[14px] gap-4">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Desconto do Método</span>
                                                                <span className="text-brand-green font-bold">- {formatCurrency(paymentMethodDiscountAmount)}</span>
                                                            </div>
                                                        )}

                                                        {(() => {
                                                            const hasDetailedFees = paymentBreakdown.some((e: any) => e.interestAmount !== undefined || e.feeAmount !== undefined || e.fixedFeeAmount !== undefined);
                                                            const feeFieldTotal = hasDetailedFees
                                                                ? paymentBreakdown.reduce((sum: number, e: any) => sum + Number(e.interestAmount || 0) + Number(e.feeAmount || 0) + Number(e.fixedFeeAmount || 0), 0)
                                                                : 0;
                                                            const extraAmount = hasDetailedFees
                                                                ? (feeFieldTotal > 0.009 ? paymentMethodExtraAmount : 0)
                                                                : paymentMethodExtraAmount;
                                                            return extraAmount > 0 ? (
                                                                <div className="flex justify-between items-start text-[14px] gap-4">
                                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Taxa do Método</span>
                                                                    <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(extraAmount)}</span>
                                                                </div>
                                                            ) : null;
                                                        })()}

                                                        <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                                            <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Total do Pedido</span>
                                                            <span className="font-bold text-2xl text-brand-dark dark:text-dark-heading tracking-tight">{formatCurrency(totalAmount)}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        <div className="grid grid-cols-1 gap-3">
                                                            {!isQuick && (
                                                                <>
                                                                    {canDiscount && (
                                                                        <ListItem
                                                                            icon={TagIcon}
                                                                            title="Aplicar desconto"
                                                                            description={hasCoupon || discountValue > 0 ? "Desconto e/ou cupom aplicado" : "Escolha o tipo e aplique no pedido"}
                                                                            onClick={isMarketplaceLocked ? undefined : () => setIsDiscountModalOpen(true)}
                                                                            className={`px-4 py-3 gap-4 ${isMarketplaceLocked ? 'opacity-50 pointer-events-none' : ''}`}
                                                                        />
                                                                    )}
                                                                    {deliveryMethod === "delivery" && (
                                                                        <ListItem
                                                                            icon={TruckIcon}
                                                                            title="Adicionar entrega"
                                                                            description="Define o valor da entrega do pedido"
                                                                            onClick={isMarketplaceLocked ? undefined : handleOpenShippingSheet}
                                                                            className={`px-4 py-3 gap-4 ${isMarketplaceLocked ? 'opacity-50 pointer-events-none' : ''}`}
                                                                        />
                                                                    )}
                                                                </>
                                                            )}
                                                            <MoneyInput
                                                                label="Outros Custos"
                                                                disabled={isMarketplaceLocked}
                                                                value={parseFloat(otherCosts || "0")}
                                                                onChange={(val) => setOtherCosts(val.toString())}
                                                            />
                                                        </div>

                                                        <div className="flex flex-col gap-3 mt-4 border-t border-dashed border-brand-border dark:border-dark-border pt-4">
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

                                                            {parseFloat(shippingFee || "0") > 0 && (
                                                                <div className="flex justify-between items-center text-[15px]">
                                                                    <span className="text-brand-inactive-text font-medium">Entrega</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                        {formatCurrency(parseFloat(shippingFee))}
                                                                    </span>
                                                                </div>
                                                            )}

                                                            {parseFloat(otherCosts || "0") > 0 && (
                                                                <div className="flex justify-between items-center text-[15px]">
                                                                    <span className="text-brand-inactive-text font-medium">Outros Custos</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                        {formatCurrency(parseFloat(otherCosts))}
                                                                    </span>
                                                                </div>
                                                            )}

                                                            <div className="border-t border-dashed border-brand-border dark:border-dark-border pt-4 mt-2">
                                                                <div className="flex justify-between items-end">
                                                                    <span className="text-xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">Total a Pagar</span>
                                                                    <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading leading-none tracking-tighter">
                                                                        {formatCurrency(totalAmount)}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <Button
                                                                size="lg"
                                                                className="w-full mt-6"
                                                                onClick={handleOpenPaymentModal}
                                                                disabled={isSaving}
                                                            >
                                                                Ir para Pagamento
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </FadeIn>
                                </TabsContent>
                            )}

                            <TabsContent value="delivery" className="mt-0">
                                <FadeIn key="delivery">
                                    <div>
                                        <AddressTab
                                            cep={cep}
                                            street={street}
                                            number={number}
                                            complement={complement}
                                            neighborhood={neighborhood}
                                            city={city}
                                            uf={uf}
                                            noNumber={noNumber}
                                            deliveryMethod={deliveryMethod}
                                            deliveryStatus={deliveryStatus}
                                            selectedDeliveryPersonId={selectedDeliveryPersonId}
                                            deliveryDate={deliveryDate}
                                            deliveryTime={deliveryTime}
                                            deliveryPeopleOptions={deliveryPeopleOptions}
                                            onOpenDeliveryDriverSheet={() => setIsDriverSheetOpen(true)}
                                            setDeliveryStatus={setDeliveryStatus}
                                            setSelectedDeliveryPersonId={setSelectedDeliveryPersonId}
                                            setDeliveryDate={setDeliveryDate}
                                            setDeliveryTime={setDeliveryTime}
                                            deliveryStatusOptions={deliveryStatusOptions}
                                            setCep={setCep}
                                            setStreet={setStreet}
                                            setNumber={setNumber}
                                            setComplement={setComplement}
                                            setNeighborhood={setNeighborhood}
                                            setCity={setCity}
                                            setUf={setUf}
                                            setNoNumber={setNoNumber}
                                            isMarketplaceOrder={isMarketplaceOrder}
                                            originalDeliveryStatus={originalDeliveryStatus}
                                            isMarketplaceLocked={isMarketplaceLocked}
                                            isPaidOrder={isPaidOrder}
                                            role={role}
                                        />
                                    </div>
                                </FadeIn>
                            </TabsContent>

                            <TabsContent value="observations" className="mt-0">
                                <FadeIn key="observations">
                                    <OrderObservationsTab
                                        notes={notes}
                                        setNotes={setNotes}
                                        disabled={!canRbac("orders.edit")}
                                    />
                                </FadeIn>
                            </TabsContent>

                            <TabsContent value="attachments" className="mt-0">
                                <FadeIn key="attachments">
                                    <OrderAttachmentsTab
                                        orderId={orderId}
                                        partnerId={partnerId}
                                        isEditing={true}
                                        readOnly={false}
                                        isNew={!editOrderId}
                                        stagedFiles={stagedDocFiles}
                                        onStagedFilesChange={setStagedDocFiles}
                                        stagedImages={stagedImageFiles}
                                        onStagedImagesChange={setStagedImageFiles}
                                    />
                                </FadeIn>
                            </TabsContent>
                        </div>
                    </div>
                </Tabs>

                <DeliveryDriverPickerSheet
                    isOpen={isDriverSheetOpen}
                    onClose={() => setIsDriverSheetOpen(false)}
                    partnerId={partnerId}
                    orderId={editOrderId || (orderId !== "new" ? orderId : undefined)}
                    orderNumber={editOrderId ? String(editOrderId).slice(0, 8) : undefined}
                    destinationAddress={street ? `${street}, ${number || "S/N"} - ${neighborhood}, ${city}` : undefined}
                    deliveryFee={Number(shippingFee) || 0}
                    onDeliveryRequested={() => {
                        setPlatformDriver({ id: "dudit_network", fullName: "Rede de Entregadores Dudit", isPlatformDriver: true })
                        setSelectedDeliveryPersonId("platform:dudit_network")
                    }}
                    onSelect={(driverId: string, driver?: any) => {
                        if (driver) setPlatformDriver(driver)
                        setSelectedDeliveryPersonId(driverId)
                    }}
                />

                <SelectCustomerSheet
                    isOpen={isCustomerSheetOpen}
                    onClose={() => {
                        if (isSaving) return
                        setIsCustomerSheetOpen(false)
                        setCustomerSelectIntent("default")
                    }}
                    onSelect={(customer) => {
                        const normalized = normalizeCustomerForCard(customer)
                        setSelectedCustomer(normalized)
                        setIsCustomerSheetOpen(false)
                        const isPreflight = customerSelectIntent === "shipping-preflight"
                        if (isPreflight) {
                            setCustomerSelectIntent("default")
                            const addr = normalized?.addresses?.[0]
                            setShippingCustomerDetails({
                                id: customer.id,
                                name: customer.name,
                                email: customer.email || null,
                                phone: customer.phone || null,
                                address: addr ? {
                                    zipCode: addr.zipCode || "",
                                    street: addr.street || "",
                                    number: addr.number || "",
                                    complement: addr.complement || "",
                                    neighborhood: addr.neighborhood || "",
                                    city: addr.city || "",
                                    state: addr.state || "",
                                } : null,
                            })
                            setIsShippingSheetOpen(true)
                        }
                        const primaryAddr = normalized?.addresses?.[0]
                        if (primaryAddr) {
                            setCep(String(primaryAddr.zipCode || ""))
                            setStreet(String(primaryAddr.street || ""))
                            const isNoNum = primaryAddr.number === "S/N" || !String(primaryAddr.number || "").trim()
                            setNumber(isNoNum ? "" : String(primaryAddr.number || ""))
                            setNoNumber(isNoNum)
                            setComplement(String(primaryAddr.complement || ""))
                            setNeighborhood(String(primaryAddr.neighborhood || ""))
                            setCity(String(primaryAddr.city || ""))
                            setUf(String(primaryAddr.state || "SP"))
                        }
                        getPOSCustomerDetailsAction({ partnerId, customerId: customer.id }).then(res => {
                            if (!res.success || !res.data) return
                            setShippingCustomerDetails(res.data)
                            setSelectedCustomer(normalizeCustomerForCard(res.data))
                            if (res.data?.address) {
                                const addr = res.data.address
                                setCep(String(addr.zipCode || ""))
                                setStreet(String(addr.street || ""))
                                const isNoNum = addr.number === "S/N" || !String(addr.number || "").trim()
                                setNumber(isNoNum ? "" : String(addr.number || ""))
                                setNoNumber(isNoNum)
                                setComplement(String(addr.complement || ""))
                                setNeighborhood(String(addr.neighborhood || ""))
                                setCity(String(addr.city || ""))
                                setUf(String(addr.state || "SP"))
                            }
                        })
                    }}
                    partnerId={partnerId}
                />

                <SelectProductVariantSheet
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
                    title="Sair sem salvar?"
                    description="Você tem alterações no pedido que ainda não foram salvas."
                    confirmText="Sair sem salvar"
                    cancelText="Continuar editando"
                    variant="warning"
                />

                {showConfirmDialog && (
                    <AlertModal
                        isOpen={showConfirmDialog}
                        onClose={cancelNavigation}
                        onConfirm={confirmNavigation}
                        title="Sair sem salvar?"
                        description="Você tem alterações no pedido que ainda não foram salvas."
                        confirmText="Sair sem salvar"
                        cancelText="Continuar editando"
                        variant="warning"
                    />
                )}

                <SavingStatusModal isOpen={isSaving && !isPaymentModalOpen} text="Salvando pedido..." />

                <AlertModal
                    isOpen={showValidationModal}
                    onClose={() => {
                        setShowValidationModal(false)
                        scrollToFirstError()
                    }}
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
                            discountAmount={discountAmount + effectiveCouponDiscountAmount}
                            headerSubtitle={PAYMENT_MODAL_HEADER_SUBTITLE}
                            amountDue={editOrderId ? remainingAmount : undefined}
                            existingPaidAmount={editOrderId ? originalPaidAmount : 0}
                            existingPaymentBreakdown={editOrderId ? originalPaymentBreakdown : []}
                            lockPaymentCompletion={isAlreadyPaid}
                            orderId={editOrderId || undefined}
                            isMarketplaceOrder={isMarketplaceOrder}
                            role={role}
                            originalPaymentMethod={originalPaymentMethod}
                            onConfirm={handleConfirmPayment}
                            deliveryMethod={deliveryMethod}
                            allowDepositCharge={depositSettings.depositEnabled && serviceSubtotal > 0.009 && !isMarketplaceOrder}
                            depositChargeAmount={depositChargeAmount}
                            depositPercentage={depositSettings.depositPercentage}
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
                            maxLength={150}
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
                                    if (globalDiscountType === "fixed" && globalDiscountValue > subtotal) {
                                        notifyError("O desconto não pode ser maior que o valor total do pedido.")
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

                <SelectCouponSheet
                    isOpen={isCouponSheetOpen}
                    onClose={() => setIsCouponSheetOpen(false)}
                    partnerId={partnerId}
                    subtotal={subtotal}
                    selectedCustomerId={selectedCustomer?.id || null}
                    appliedCouponId={couponId}
                    hasWinningDiscount={hasWinningDiscount}
                    onApplyCoupon={async (coupon) => {
                        setCouponCode(coupon.code)
                        await handleApplyCoupon(coupon.code)
                        setIsCouponSheetOpen(false)
                    }}
                    onRemoveCoupon={async () => {
                        setCouponId(null)
                        setCouponCode("")
                        setCouponDiscountAmount(0)
                        setCouponPricingData(null)
                        setDiscountType("fixed")
                        setDiscountValue(0)
                        notifySuccess("Cupom removido.")
                    }}
                />

                <POSShippingSheet
                    partnerId={partnerId}
                    storeId={selectedStore?.id || null}
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
                        if (details.success && details.data) {
                            setShippingCustomerDetails(details.data)
                            setSelectedCustomer((prev: any) => normalizeCustomerForCard({ ...prev, ...details.data }))
                        }

                        // Sincroniza diretamente os campos de endereço na aba de endereço da venda
                        if (payload.address) {
                            setCep(payload.address.zipCode || "")
                            setStreet(payload.address.street || "")
                            const isNoNum = payload.address.number === "S/N" || !String(payload.address.number || "").trim()
                            setNumber(isNoNum ? "" : payload.address.number || "")
                            setNoNumber(isNoNum)
                            setComplement(payload.address.complement || "")
                            setNeighborhood(payload.address.neighborhood || "")
                            setCity(payload.address.city || "")
                            setUf(payload.address.state || "SP")
                            setDeliveryMethod("delivery")
                        }

                        notifySuccess("Endereço cadastrado com sucesso.")
                    }}
                    onApply={({ shippingFee: fee, isCustom, breakdown }: any) => {
                        setShippingFee(String(Math.max(0, Number(fee || 0))))
                        setIsCustomShipping(!!isCustom)
                        setDeliveryBreakdown(breakdown || null)
                        setDeliveryMethod("delivery")
                        if (shippingCustomerDetails?.address) {
                            const addr = shippingCustomerDetails.address
                            setCep(String(addr.zipCode || ""))
                            setStreet(String(addr.street || ""))
                            const isNoNum = addr.number === "S/N" || !String(addr.number || "").trim()
                            setNumber(isNoNum ? "" : String(addr.number || ""))
                            setNoNumber(isNoNum)
                            setComplement(String(addr.complement || ""))
                            setNeighborhood(String(addr.neighborhood || ""))
                            setCity(String(addr.city || ""))
                            setUf(String(addr.state || "SP"))
                        }
                        setIsShippingSheetOpen(false)
                    }}
                />

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                    <Button
                        variant="outline"
                        onClick={handleBack}
                        disabled={isSaving}
                        className="flex-1 h-12"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSaveOrder}
                        disabled={isSaving}
                        className="flex-1 h-12"
                        leftIcon={<SaveIcon size={18} />}
                    >
                        {isSaving ? "Salvando..." : primaryActionLabel}
                    </Button>
                </div>
            </div>

            <AlertModal
                isOpen={showZeroStockAlert}
                onClose={() => setShowZeroStockAlert(false)}
                onConfirm={() => {
                    setShowZeroStockAlert(false)
                    pendingZeroStockItem?.callback?.()
                    setPendingZeroStockItem(null)
                }}
                title="Estoque insuficiente"
                message={`O produto "${pendingZeroStockItem?.product?.name || ''}" não possui estoque suficiente. Deseja continuar mesmo assim?`}
                confirmText="Continuar mesmo assim"
                cancelText="Cancelar"
                variant="warning"
            />
        </FadeIn>
    )
}
