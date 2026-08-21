"use client"

import type React from "react"
import { useState, useEffect, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MapPinIcon, PlusIcon, XIcon, MoneyIcon, TagIcon, InfoIcon, FileTextIcon, ChevronLeftIcon, CheckCircleIcon, LockIcon, CrownIcon } from "@/lib/icons"
import { Button, Spinner, DefaultModal, CepInput, StateComboBox, RadioButton, ListItem, InfoCard, Separator, Badge, Tooltip, FormDropdown, NumberInputWithCheckbox, FormSection, MoneyInput, Tabs, TabsList, TabsTrigger, TabsContent, FormTextarea } from "@/components/reusable"
import { useNotification } from "@/hooks/use-notification"
import { Input } from "@/components/reusable"
import { getAddressesAction, createAddressAction } from "@/app/actions/shared/addresses"
import { useSupabase } from "@/providers/supabase-provider"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import Link from "next/link"
import { getStoreUrl, getServiceUrl } from "@/lib/utils/url-generator"
import { formatCurrency } from "@/lib/utils"
import { listApplicableMarketplaceCouponsAction, validateMarketplaceCouponAction } from "@/app/actions/shared/coupons"
import { useRouter } from "next/navigation"
import { PaymentWrapper } from "@/components/PaymentWrapper"
import { checkoutCartAction, updateCartItemFulfillmentModeAction, deleteCartItemsAction } from "@/app/actions/marketplace/cart"
import { prepareProductBuyNowCheckoutAction } from "@/app/actions/marketplace/cart-extensions"
import { createOrderAction } from "@/app/actions/marketplace/orders"
import { useCSRFToken, fetchCSRFTokenSingleton } from "@/hooks/use-csrf-token"
import { previewMarketplacePaymentAction } from "@/app/actions/marketplace/payment-preview"
import { invalidateCartCache } from "@/hooks/use-cart"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { hasDeliveryRatesConfigured } from "@/lib/delivery/fee"
import type { StorefrontPaymentMethod } from "@/app/actions/marketplace/storefront-payment-methods"
import type { MpAcceptedPaymentMethods } from "@/app/actions/mercadopago"
import { useMarketplaceCheckoutContext } from "@/hooks/use-marketplace-checkout-context"
import { validateMarketplaceCheckoutPayment } from "@/lib/commerce/validate-marketplace-checkout-payment"
import { CheckoutFulfillmentPanel } from "@/components/marketplace/checkout/CheckoutFulfillmentPanel"
import type { CheckoutRequirements } from "@/lib/commerce/checkout-requirements"
import { validateServiceBookingAvailabilityAction } from "@/app/actions/marketplace/services"
import { getMarketplaceCheckoutAmountsAction } from "@/app/actions/marketplace/checkout-amounts"
import type { MarketplaceCheckoutAmounts } from "@/lib/services/marketplace-checkout-amounts"

interface ProductItem {
    id: string
    name: string
    price: number
    quantity: number
    image?: string
    variant?: string
    availabilityValue?: number
    availabilityUnit?: string
}

const AVAILABLE_BRANDS = [
    { id: "visa", name: "Visa", image: "https://img.dudit.com.br/static/icons/payments/Visa.png" },
    { id: "mastercard", name: "Mastercard", image: "https://img.dudit.com.br/static/icons/payments/Mastercard.png" },
    { id: "elo", name: "Elo", image: "https://img.dudit.com.br/static/icons/payments/Elo.png" },
    { id: "american_express", name: "Amex", image: "https://img.dudit.com.br/static/icons/payments/Amex.png" },
    { id: "hipercard", name: "Hipercard", image: "https://img.dudit.com.br/static/icons/payments/Hipercard.png" },
    { id: "diners", name: "Diners", image: "https://img.dudit.com.br/static/icons/payments/Diners.png" },
]

export interface CheckoutSessionData {
    source: "cart" | "product" | "service"
    products: ProductItem[]
    partnerId: string
    storeId?: string
    partnerInfo: {
        address: any
        paymentMethods: string[]
        installmentsWithoutInterest?: number
        interestRatePercent?: number
        maxInstallments?: number
        pixDiscountPercent?: number
        mpConnected?: boolean
        mpPublicKey?: string
        store_name?: string
        openingHours?: any
    }
    cartItems?: {
        cartItemId: string
        productId?: string
        variantId?: string
        serviceId?: string
        recurringPlanId?: string
        itemType?: "product" | "service_booking" | "subscription"
        quantity: number
    }[]
    itemId?: string
    itemType?: "product" | "service"
    deliverySettings?: {
        base_fee: number | string
        is_delivery_enabled: boolean
    }
}

interface UserAddress {
    id: string
    street: string
    number: string
    complement: string | null
    neighborhood: string
    city: string
    state: string
    zip_code: string
    is_default: boolean
    latitude?: number | string | null
    longitude?: number | string | null
}

interface MarketplaceAvailableCoupon {
    id: string
    code: string
    discountType: "percentage" | "fixed" | "free_shipping"
    discountValue: number | null
    applyScope: "all" | "categories" | "products" | "services"
    minCartValue: number | null
    maxDiscountValue: number | null
    usageLimit: number | null
    usagePerCustomer: number | null
    firstPurchaseOnly: boolean | null
    customerScope: "all" | "specific" | null
    allowCombination?: boolean
    startsAt: string | null
    endsAt: string | null
    discountAmount: number
    freeShipping?: boolean
    partialApplicabilityWarning?: boolean
    blocked?: boolean
    errorMessage?: string
    eligibleItemsCount?: number
    totalItemsCount?: number
}

interface MarketplacePaymentPreview {
    success: true
    methodId: string
    methodName: string
    methodType: string
    maxInstallments: number
    feeBearer?: "merchant" | "customer"
    finalAmount: number
    interestAmount: number
    feeAmount: number
    fixedFeeAmount: number
    paymentMethodDiscountAmount: number
    installmentNumber: number
    installmentAmounts: number[]
    installmentOptions?: {
        installments: number
        installmentValue: number
        hasInterest: boolean
        totalInterest: number
        totalFee?: number
        fixedFee?: number
        feeBearer?: "merchant" | "customer"
        finalAmount: number
    }[]
}

type MarketplaceInstallmentOption = NonNullable<MarketplacePaymentPreview["installmentOptions"]>[number]

const formatCheckoutInstallmentOptionLabel = (opt: MarketplaceInstallmentOption) => {
    const installmentsCount = Math.max(1, Number(opt.installments || 1))
    const interestAmount = Number(opt.totalInterest || 0)
    const feeAmount = Number(opt.totalFee || 0)
    const pricingAmount = interestAmount + feeAmount
    const pricingName = interestAmount > 0.009 && feeAmount > 0.009
        ? "juros/taxa"
        : interestAmount > 0.009
            ? "juros"
            : "taxa"
    const pricingLabel = pricingAmount > 0.009
        ? ` · ${formatCurrency(pricingAmount)} ${opt.feeBearer !== "merchant" ? `de ${pricingName}` : `${pricingName} absorvida`}`
        : " sem juros"
    return `${installmentsCount}x de ${formatCurrency(opt.installmentValue)}${pricingLabel}`
}

const fadeVariants = {
    open: { opacity: 1, transition: { duration: 0.2 } },
    closed: { opacity: 0, transition: { duration: 0.2 } },
}

const getReadyDayLabel = (estimate: any) => {
    if (!estimate) return ""
    const now = new Date(estimate.now || Date.now())
    const readyAt = new Date(estimate.readyAt)

    const readyDate = new Date(readyAt.getFullYear(), readyAt.getMonth(), readyAt.getDate())
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const diffTime = readyDate.getTime() - nowDate.getTime()
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
        return "hoje"
    } else if (diffDays === 1) {
        return "amanhã"
    } else {
        const weekday = readyAt.toLocaleDateString("pt-BR", { weekday: "long" })
        return weekday.charAt(0).toUpperCase() + weekday.slice(1)
    }
}

export function CheckoutPageClient() {
    const { user } = useSupabase()
    const router = useRouter()
    const csrfToken = useCSRFToken()
    const [sessionData, setSessionData] = useState<CheckoutSessionData | null>(null)
    const [pageLoading, setPageLoading] = useState(true)
    const [userCredits, setUserCredits] = useState<any[]>([])
    const [loadingCredits, setLoadingCredits] = useState(false)
    const [availableStoreCredit, setAvailableStoreCredit] = useState<number>(0)
    const [useStoreCredit, setUseStoreCredit] = useState<boolean>(false)

    useEffect(() => {
        const fetchStoreCredit = async () => {
            const pId = sessionData?.partnerId
            if (!user?.id || !pId) return
            const { getMarketplaceCustomerStoreCreditAction } = await import("@/app/actions/marketplace/cart")
            const res = await getMarketplaceCustomerStoreCreditAction(pId)
            if (res.success && res.availableCredit > 0) {
                setAvailableStoreCredit(res.availableCredit)
                setUseStoreCredit(true)
            }
        }
        void fetchStoreCredit()
    }, [user?.id, sessionData?.partnerId])

    useEffect(() => {
        const fetchUserCredits = async () => {
            setLoadingCredits(true)
            const { getMySubscriptionCreditsAction } = await import("@/app/actions/marketplace/recurring-subscriptions")
            const res = await getMySubscriptionCreditsAction()
            setLoadingCredits(false)
            if (res.success) {
                setUserCredits(res.data || [])
            }
        }
        if (user?.id) {
            void fetchUserCredits()
        }
    }, [user?.id])

    useEffect(() => {
        const stored = sessionStorage.getItem("checkout_session")
        if (stored) {
            try {
                setSessionData(JSON.parse(stored))
            } catch {
                router.push("/")
            }
        } else {
            router.push("/")
        }
        setPageLoading(false)
    }, [router])

    const legacyCartHydrationRef = useRef(false)

    useEffect(() => {
        if (legacyCartHydrationRef.current || !sessionData || pageLoading || !user?.id) return
        const hasRealCartIds = (sessionData.cartItems || []).some(
            (item) => item.cartItemId && !String(item.cartItemId).startsWith("bump-"),
        )
        if (hasRealCartIds || sessionData.source !== "product") return

        const productId = sessionData.products?.[0]?.id || sessionData.itemId
        if (!productId || !sessionData.partnerId) return

        legacyCartHydrationRef.current = true
        let active = true
            ; (async () => {
                try {
                    const token = await fetchCSRFTokenSingleton() || ""
                    const prep = await prepareProductBuyNowCheckoutAction({
                        productId,
                        partnerId: sessionData.partnerId,
                        quantity: sessionData.products?.[0]?.quantity ?? 1,
                        csrf_token: token,
                    })
                    if (!active || "error" in prep || !prep.cartItemId) return

                    const updated: CheckoutSessionData = {
                        ...sessionData,
                        source: "cart",
                        cartItems: [{
                            cartItemId: prep.cartItemId,
                            itemType: "product",
                            productId,
                            quantity: sessionData.products?.[0]?.quantity ?? 1,
                        }],
                    }
                    setSessionData(updated)
                    sessionStorage.setItem("checkout_session", JSON.stringify(updated))
                } catch {
                    // Legacy session without cart line - checkout context stays disabled
                }
            })()

        return () => {
            active = false
        }
    }, [sessionData, pageLoading, user?.id])

    const formatPartnerAddress = (addr: any) => {
        if (!addr) return "Endereço não informado"
        if (typeof addr === "string") return addr
        return `${addr.street || ""}, ${addr.number || "S/N"} - ${addr.neighborhood || ""}, ${addr.city || ""} - ${addr.state || ""}`
    }

    const { error: notifyError, success: notifySuccess } = useNotification()
    const [isLoading, setIsLoading] = useState(false)
    const [deliveryError, setDeliveryError] = useState<string | null>(null)
    const [paymentError, setPaymentError] = useState<string | null>(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)

    const products = sessionData?.products || []
    const partnerId = sessionData?.partnerId || ""
    const storeId = sessionData?.storeId
    const partnerInfo = sessionData?.partnerInfo || { paymentMethods: [] } as any

    const cartItemIds = useMemo(
        () => (sessionData?.cartItems || []).map((item) => item.cartItemId).filter(Boolean),
        [sessionData?.cartItems],
    )

    const { checkoutContext, contextLoading, contextError } = useMarketplaceCheckoutContext({
        partnerId,
        cartItemIds,
        storeId,
        mpConnected: Boolean(partnerInfo?.mpConnected),
        enabled: Boolean(partnerId && cartItemIds.length > 0),
        refreshTrigger,
    })

    const requirements: CheckoutRequirements | undefined = checkoutContext?.requirements

    const serviceLines = useMemo(() => {
        return checkoutContext?.lines?.filter(l => l.lineKind === "service_booking") || []
    }, [checkoutContext?.lines])

    const hasSubscriptionCreditsForCheckout = useMemo(() => {
        if (serviceLines.length === 0) return false
        return serviceLines.every(line => {
            const name = line.baseName || line.displayName
            const match = userCredits.find(c =>
                c.itemName.toLowerCase() === name.toLowerCase() &&
                c.remainingCredits >= line.quantity &&
                (!c.expiresAt || new Date(c.expiresAt) > new Date())
            )
            return !!match
        })
    }, [serviceLines, userCredits])
    const [payDepositOnly, setPayDepositOnly] = useState(false)
    const [checkoutAmounts, setCheckoutAmounts] = useState<MarketplaceCheckoutAmounts | null>(null)
    const [checkoutAmountsLoading, setCheckoutAmountsLoading] = useState(false)
    const [showDepositChoiceModal, setShowDepositChoiceModal] = useState(false)
    const bypassDepositModalRef = useRef(false)
    const bypassSubmitRef = useRef(false)

    const handleFulfillmentModeChange = async (cartItemId: string, mode: "on_site" | "customer_location") => {
        try {
            const token = csrfToken || await fetchCSRFTokenSingleton() || ""
            const result = await updateCartItemFulfillmentModeAction(cartItemId, mode, token)
            if (result.success) {
                setRefreshTrigger(prev => prev + 1)
            } else {
                notifyError("Erro", result.error || "Não foi possível alterar a forma de atendimento.")
            }
        } catch (err) {
            notifyError("Erro", "Erro ao atualizar forma de atendimento.")
        }
    }
    const storeImage = checkoutContext?.store?.logo_url || partnerInfo?.store_avatar || partnerInfo?.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"
    const sellerName = checkoutContext?.store?.name || checkoutContext?.partner?.storeName || partnerInfo?.store_name || "Loja"

    const quantities = useMemo<Record<string, number>>(() => {
        const acc: Record<string, number> = {}

        for (const p of products) {
            acc[p.id] = p.quantity
        }

        for (const item of sessionData?.cartItems || []) {
            acc[item.cartItemId] = item.quantity
            const lineKey = item.productId || item.serviceId || item.recurringPlanId
            if (lineKey) acc[lineKey] = item.quantity
        }

        return acc
    }, [products, sessionData?.cartItems])

    const [userId, setUserId] = useState<string | null>(null)
    const [userName, setUserName] = useState<string>("")
    const [userEmail, setUserEmail] = useState<string>("")

    const [userAddresses, setUserAddresses] = useState<UserAddress[]>([])
    const [selectedAddressId, setSelectedAddressId] = useState<string>("")
    const selectedAddress = userAddresses.find(a => a.id === selectedAddressId)
    const [showAddressForm, setShowAddressForm] = useState(false)
    const [loadingAddresses, setLoadingAddresses] = useState(false)
    const [loadingCep, setLoadingCep] = useState(false)
    const [newAddressData, setNewAddressData] = useState({
        zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false,
        latitude: null as number | null, longitude: null as number | null
    })

    const [showAddressModal, setShowAddressModal] = useState(false)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [showOutsideRadiusModal, setShowOutsideRadiusModal] = useState(false)

    const [couponCode, setCouponCode] = useState("")
    const [couponDiscount, setCouponDiscount] = useState(0)
    const [availableCoupons, setAvailableCoupons] = useState<MarketplaceAvailableCoupon[]>([])
    const [couponListLoading, setCouponListLoading] = useState(false)
    const [showCouponModal, setShowCouponModal] = useState(false)
    const [selectedCouponId, setSelectedCouponId] = useState<string>("")
    const [couponError, setCouponError] = useState<string | null>(null)
    const [couponPartialWarning, setCouponPartialWarning] = useState(false)
    const [serviceAvailability, setServiceAvailability] = useState<Record<string, { available: boolean; checked: boolean }>>({})
    const [serviceAvailLoading, setServiceAvailLoading] = useState(false)

    const displayableCoupons = availableCoupons

    const [formData, setFormData] = useState({
        deliveryType: "delivery" as "delivery" | "pickup",
        deliveryAddress: "",
        paymentMethod: "",
        notes: "",
        installments: 1,
    })

    // Track previous address and deliveryType to detect changes and clear deliveryError
    const prevDeliveryAddressRef = useRef<string>(formData.deliveryAddress)
    const prevDeliveryTypeRef = useRef<string>(formData.deliveryType)

    // Clear deliveryError when address changes or switching to pickup
    useEffect(() => {
        if (prevDeliveryAddressRef.current !== formData.deliveryAddress) {
            prevDeliveryAddressRef.current = formData.deliveryAddress
            setDeliveryError(null)
            setShowOutsideRadiusModal(false)
        }
        if (prevDeliveryTypeRef.current !== formData.deliveryType) {
            prevDeliveryTypeRef.current = formData.deliveryType
            if (formData.deliveryType === "pickup") {
                setDeliveryError(null)
                setShowOutsideRadiusModal(false)
            }
        }
    }, [formData.deliveryAddress, formData.deliveryType])

    const [mobileStep, setMobileStep] = useState<1 | 2>(1)
    const [showReviewModal, setShowReviewModal] = useState(false)
    const [showNotesModal, setShowNotesModal] = useState(false)

    const [wantsChange, setWantsChange] = useState<boolean | null>(null)
    const [payWithAmount, setPayWithAmount] = useState<number | null>(null)
    const [showChangeModal, setShowChangeModal] = useState(false)
    const [tempWantsChange, setTempWantsChange] = useState<boolean | null>(null)
    const [tempPayWithAmount, setTempPayWithAmount] = useState("")

    const handleOpenChangeModal = () => {
        setTempWantsChange(wantsChange)
        setTempPayWithAmount(payWithAmount ? String(payWithAmount) : "")
        setShowChangeModal(true)
    }



    const [paymentOption, setPaymentOption] = useState<"traditional" | "mercadopago" | "subscription_credits" | null>(null)
    const [paymentPreview, setPaymentPreview] = useState<MarketplacePaymentPreview | null>(null)
    const [paymentPreviewLoading, setPaymentPreviewLoading] = useState(false)
    const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false)
    const [deliveryEnabled, setDeliveryEnabled] = useState(true)
    const [deliveryPlanEnabled, setDeliveryPlanEnabled] = useState(true)
    const [pickupEnabled, setPickupEnabled] = useState(true)
    const [deliveryFee, setDeliveryFee] = useState(0)
    const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null)
    const [deliveryBreakdown, setDeliveryBreakdown] = useState<Record<string, any> | null>(null)
    const [deliverySettings, setDeliverySettings] = useState<any>(null)
    const [storefrontMethods, setStorefrontMethods] = useState<StorefrontPaymentMethod[]>([])
    const [storefrontMethodsLoading, setStorefrontMethodsLoading] = useState(true)

    const [partnerProducts, setPartnerProducts] = useState<any[]>([])
    const [loadingBumps, setLoadingBumps] = useState(false)

    const bumpCandidates = useMemo(() => {
        const checkoutIds = new Set(products.map(p => p.id))
        return partnerProducts.filter((p: any) => {
            const isStock = (p.stock_available ?? p.stock_quantity ?? 0) > 0
            return isStock && !checkoutIds.has(p.id)
        })
    }, [partnerProducts, products])

    const handleAddBumpProduct = (p: any) => {
        if (!sessionData) return

        const newProductItem: ProductItem = {
            id: p.id,
            name: p.name,
            price: Number(p.promotional_price && p.promotional_price < p.price ? p.promotional_price : p.price),
            quantity: 1,
            image: p.images?.[0] || p.fallback_variant_image || "https://img.dudit.com.br/static/Placeholder.png",
            availabilityValue: p.availability_value,
            availabilityUnit: p.availability_unit
        }

        const updatedProducts = [...products, newProductItem]

        const updatedCartItems = sessionData.source === "cart"
            ? [...(sessionData.cartItems || [])]
            : products.map((item) => ({
                cartItemId: "bump-" + item.id,
                productId: item.id,
                variantId: item.variant || undefined,
                quantity: item.quantity
            }))

        updatedCartItems.push({
            cartItemId: "bump-" + p.id,
            productId: p.id,
            variantId: undefined,
            quantity: 1
        })

        const newSessionData: CheckoutSessionData = {
            ...sessionData,
            source: "cart",
            products: updatedProducts,
            cartItems: updatedCartItems
        }

        setSessionData(newSessionData)
        sessionStorage.setItem("checkout_session", JSON.stringify(newSessionData))
        notifySuccess("Produto adicionado", `${p.name} foi adicionado ao seu pedido!`)
    }


    useEffect(() => {
        if (formData.paymentMethod && formData.paymentMethod !== "mercadopago" && storefrontMethods.length > 0 && !storefrontMethods.some(m => m.id === formData.paymentMethod || m.type === formData.paymentMethod)) {
            setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
        }
    }, [storefrontMethods, formData.paymentMethod])

    // Auto-set paymentOption to "traditional" for non-MP stores (only if pickup payment is allowed or not in pickup mode)
    const pickupPolicyFromContext = checkoutContext?.partner?.pickupPaymentPolicy || "require_online_payment"
    const isPickupRequiringOnline = formData.deliveryType === "pickup" && pickupPolicyFromContext === "require_online_payment"
    useEffect(() => {
        if (checkoutContext?.partner?.orderFlow === "whatsapp") {
            setPaymentOption("traditional")
            return
        }
        if (!contextLoading && storefrontMethods.length > 0 && !partnerInfo.mpConnected && paymentOption === null && !isPickupRequiringOnline) {
            setPaymentOption("traditional")
        }
    }, [contextLoading, storefrontMethods, partnerInfo.mpConnected, paymentOption, isPickupRequiringOnline, checkoutContext?.partner?.orderFlow])

    useEffect(() => {
        if (checkoutContext?.deposit.available) {
            setPayDepositOnly(true)
        } else {
            setPayDepositOnly(false)
        }
    }, [checkoutContext?.deposit.available])

    // Show incompatible payment restrictions warning
    useEffect(() => {
        if (requirements?.hasIncompatiblePaymentRestrictions) {
            setPaymentError("Alguns itens deste pedido possuem restrições incompatíveis de pagamento. Finalize-os separadamente.")
        }
    }, [requirements?.hasIncompatiblePaymentRestrictions])

    // Sync all data from checkout context when it loads
    useEffect(() => {
        if (!checkoutContext) return
        if (checkoutContext.deliverySettings) {
            setDeliverySettings(checkoutContext.deliverySettings)
        }
        setDeliveryPlanEnabled(checkoutContext.delivery.planEnabled)
        setDeliveryEnabled(checkoutContext.delivery.partnerEnabled)
        setPickupEnabled(checkoutContext.delivery.pickupEnabled)

        const canDel = checkoutContext.delivery.planEnabled && checkoutContext.delivery.partnerEnabled
        const canPick = checkoutContext.delivery.pickupEnabled
        if (!canDel && canPick) {
            setFormData((prev) => ({ ...prev, deliveryType: "pickup" }))
        } else if (canDel && !canPick) {
            setFormData((prev) => ({ ...prev, deliveryType: "delivery" }))
        }

        if (checkoutContext.storefrontPaymentMethods.length > 0) {
            setStorefrontMethods(checkoutContext.storefrontPaymentMethods as any)
        }
        setStorefrontMethodsLoading(false)

        const addresses = checkoutContext.userAddresses as unknown as UserAddress[]
        if (addresses.length > 0) {
            setUserAddresses(addresses)
            const defaultAddress = addresses.find((a) => a.is_default)
            if (defaultAddress) {
                setSelectedAddressId(defaultAddress.id)
                const addressStr = buildAddressString(defaultAddress)
                setFormData((prev) => ({
                    ...prev,
                    deliveryAddress: addressStr,
                }))
            }
        }
        setLoadingAddresses(false)

        if (checkoutContext.mpAcceptedPaymentMethods) {
            setMpAcceptedPaymentMethods(checkoutContext.mpAcceptedPaymentMethods as any)
        }

        if (checkoutContext.partnerBumpProducts.length > 0) {
            setPartnerProducts(checkoutContext.partnerBumpProducts)
        }
        setLoadingBumps(false)
    }, [checkoutContext])

    const [openSections, setOpenSections] = useState({ delivery: true, payment: true, notes: false })
    const toggleSection = (key: keyof typeof openSections) =>
        setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

    // PIX modal state
    const [showPixModal, setShowPixModal] = useState(false)
    const [pixPaymentData, setPixPaymentData] = useState<any>(null)
    const [mpAcceptedPaymentMethods, setMpAcceptedPaymentMethods] = useState<MpAcceptedPaymentMethods | undefined>(undefined)

    useEffect(() => {
        if (user) {
            setUserId(user.id)
            setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário")
            setUserEmail(user.email || "")
        }
    }, [user])

    const loadUserAddresses = async () => {
        if (!userId) return
        setLoadingAddresses(true)
        try {
            const result = await getAddressesAction(userId, "user")
            if (result.addresses) {
                setUserAddresses(result.addresses as UserAddress[])
                const defaultAddress = (result.addresses as UserAddress[]).find((a: UserAddress) => a.is_default)
                if (defaultAddress) {
                    const addressStr = buildAddressString(defaultAddress)
                    setSelectedAddressId(defaultAddress.id)
                    setFormData(prev => ({
                        ...prev,
                        deliveryAddress: addressStr,
                        // Se houver endereço e a loja permitir entrega (verificado no outro effect), 
                        // o deliveryType será atualizado lá.
                    }))
                }
            }
        } catch (err) {
            console.error("Error loading addresses:", err)
        }
        setLoadingAddresses(false)
    }

    const buildAddressString = (a: UserAddress) =>
        `${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ""} - ${a.neighborhood}, ${a.city} - ${a.state}, ${a.zip_code}`

    const handleAddressSelect = (addressId: string) => {
        setSelectedAddressId(addressId)
        const address = userAddresses.find(a => a.id === addressId)
        if (address) setFormData(prev => ({ ...prev, deliveryAddress: buildAddressString(address) }))
    }

    const handleCepBlur = async () => {
        const cep = newAddressData.zipCode.replace(/\D/g, "")
        if (cep.length !== 8) return
        setLoadingCep(true)
        try {
            const response = await fetch(`/api/cep?cep=${cep}`)
            const data = await response.json()
            if (!data.erro && !data.error) {
                setNewAddressData(prev => ({
                    ...prev,
                    street: data.logradouro || prev.street,
                    number: data.numero || prev.number,
                    noNumber: data.numero ? data.numero === "S/N" : prev.noNumber,
                    neighborhood: data.bairro || prev.neighborhood,
                    city: data.localidade || data.municipio || prev.city,
                    state: data.uf || prev.state,
                    latitude: typeof data.latitude === "number" ? data.latitude : prev.latitude,
                    longitude: typeof data.longitude === "number" ? data.longitude : prev.longitude,
                }))
            }
        } catch (err) {
            console.error("Erro ao buscar CEP:", err)
        } finally {
            setLoadingCep(false)
        }
    }

    const handleSaveNewAddress = async () => {
        if (!userId) return
        const { zipCode, street, number, neighborhood, city, state, noNumber } = newAddressData
        const finalNumber = noNumber ? "S/N" : number
        if (!zipCode || !street || !finalNumber || !neighborhood || !city || !state) {
            setDeliveryError("Preencha todos os campos obrigatórios do endereço")
            return
        }
        setIsLoading(true)
        let token = csrfToken || await fetchCSRFTokenSingleton() || ""
        const result = await createAddressAction({
            entityId: userId, entityType: "user",
            street, number: finalNumber, complement: newAddressData.complement,
            neighborhood, city, state, zipCode,
            isDefault: userAddresses.length === 0,
            latitude: newAddressData.latitude ?? null,
            longitude: newAddressData.longitude ?? null,
            csrf_token: token,
        })
        if (result.error) {
            setDeliveryError(result.error)
        } else {
            await loadUserAddresses()
            if (result.address) {
                setSelectedAddressId(result.address.id)
                setFormData(prev => ({ ...prev, deliveryAddress: buildAddressString(result.address) }))
            }
            setShowAddressForm(false)
            setNewAddressData({ zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false, latitude: null, longitude: null })
        }
        setIsLoading(false)
    }

    const isPickup = formData.deliveryType === "pickup"
    const productDeliveryQuoteActive = Boolean(
        requirements?.showProductFulfillmentOptions &&
        requirements.showDeliverySection &&
        formData.deliveryType === "delivery" &&
        deliveryPlanEnabled &&
        deliveryEnabled,
    )
    const showDeliveryFeeRow = Boolean(requirements?.showProductFulfillmentOptions)
    const hasConfiguredDeliveryRates = useMemo(() => {
        if (deliveryBreakdown?.hasRatesConfigured !== undefined) {
            return Boolean(deliveryBreakdown.hasRatesConfigured)
        }
        return hasDeliveryRatesConfigured(deliverySettings)
    }, [deliveryBreakdown, deliverySettings])

    const totalAmount = useMemo(
        () => products.reduce((sum, p) => sum + p.price * (quantities[p.id] || p.quantity), 0),
        [products, quantities],
    )

    const orderSubtotal = useMemo(
        () => checkoutContext?.productsSubtotal !== undefined ? checkoutContext.productsSubtotal : totalAmount,
        [checkoutContext?.productsSubtotal, totalAmount],
    )
    const contextTotalSubtotal = useMemo(
        () => checkoutContext?.productsSubtotal !== undefined
            ? (checkoutContext.productsSubtotal || 0) + (checkoutContext.servicesSubtotal || 0) + (checkoutContext.subscriptionsSubtotal || 0)
            : totalAmount,
        [checkoutContext?.productsSubtotal, checkoutContext?.servicesSubtotal, checkoutContext?.subscriptionsSubtotal, totalAmount],
    )

    const depositAvailable = Boolean(checkoutContext?.deposit.available)
    const checkoutFullTotal = checkoutAmounts?.fullOrderTotal ?? 0
    const checkoutDepositChargeTotal = checkoutAmounts?.depositChargeTotal ?? 0
    const checkoutServiceDepositAmount = checkoutAmounts?.serviceDepositAmount ?? 0
    const checkoutChargeTotal = useMemo(() => {
        if (!checkoutAmounts) return contextTotalSubtotal + (showDeliveryFeeRow && !isPickup ? deliveryFee : 0)
        const usesDeposit = depositAvailable && payDepositOnly
        return usesDeposit ? checkoutAmounts.depositChargeTotal : checkoutAmounts.fullOrderTotal
    }, [checkoutAmounts, depositAvailable, payDepositOnly, contextTotalSubtotal, showDeliveryFeeRow, isPickup, deliveryFee])
    const checkoutDeliveryFee = checkoutAmounts?.deliveryFee ?? (showDeliveryFeeRow && !isPickup ? deliveryFee : 0)
    const checkoutAmountsReady = Boolean(checkoutAmounts && !checkoutAmountsLoading)
    const paymentTypeLabelMap: Record<string, string> = {
        pix: "Pix",
        credit_card: "Cartão de crédito",
        debit_card: "Cartão de débito",
        cash: "Dinheiro",
        other: "Outros",
    }
    const visibleStorefrontMethods = useMemo(() => {
        if (!requirements || requirements.allowPayOnDelivery || requirements.hasPayOnService) return storefrontMethods
        return storefrontMethods.filter((m) => m.type !== "cash")
    }, [storefrontMethods, requirements])

    // Usa métodos reais carregados do servidor; fallback para a sessão apenas durante o loading
    const paymentMethods = visibleStorefrontMethods.length > 0
        ? visibleStorefrontMethods.map((m) => ({
            value: m.id,
            label: paymentTypeLabelMap[m.type] || m.type,
        }))
        : (partnerInfo.paymentMethods?.length ? partnerInfo.paymentMethods : ["cash", "pix"])
            .map((method: any) => {
                const type = typeof method === "string" ? method : (method?.type || method?.payment_type || "cash")
                return {
                    value: type,
                    label: paymentTypeLabelMap[type] || type,
                }
            })
    const traditionalPaymentLabel = requirements?.hasPayOnService
        ? "Pagar no atendimento"
        : isPickup
            ? "Pagar na Retirada"
            : "Pagar na Entrega"

    const pickupRequiresOnlinePayment = checkoutContext?.partner?.orderFlow !== "whatsapp" && isPickup && (checkoutContext?.partner?.pickupPaymentPolicy || "require_online_payment") === "require_online_payment"
    const isOnlyServicesWithDeposit = Boolean(
        checkoutContext?.deposit.available &&
        requirements?.hasServiceLines &&
        !requirements?.hasProductLines &&
        !requirements?.hasSubscriptionLines
    )
    const showTraditionalPaymentOption = !checkoutContext?.deposit.available && (checkoutContext?.partner?.orderFlow === "whatsapp" || (!pickupRequiresOnlinePayment && !isOnlyServicesWithDeposit && Boolean(
        requirements?.allowPayOnDelivery ||
        requirements?.hasPayOnService ||
        requirements?.hasServiceLines ||
        (requirements?.hasProductLines && !requirements?.hasServiceLines),
    )))

    const schedulingLines = useMemo(
        () =>
            (checkoutContext?.lines || [])
                .filter((l) => l.lineKind === "service_booking" && l.bookingSummary)
                .map((l) => ({ name: l.displayName, summary: l.bookingSummary ?? null, lineId: l.lineId })),
        [checkoutContext?.lines],
    )

    useEffect(() => {
        const serviceLines = (checkoutContext?.lines || []).filter((l) => l.lineKind === "service_booking" && l.bookingMetadata)
        if (serviceLines.length === 0) return
        setServiceAvailLoading(true)
        const items = serviceLines.map((l) => ({
            partnerId: checkoutContext!.partner!.id,
            staffId: l.bookingMetadata!.staffId,
            date: l.bookingMetadata!.date,
            time: l.bookingMetadata!.time,
            durationMinutes: l.bookingMetadata!.durationMinutes,
            storeId: l.bookingMetadata!.storeId || null,
        }))
        validateServiceBookingAvailabilityAction(items).then((results) => {
            const map: Record<string, { available: boolean; checked: boolean }> = {}
            serviceLines.forEach((l, i) => {
                map[l.lineId] = { available: results[i]?.available ?? true, checked: true }
            })
            setServiceAvailability(map)
        }).finally(() => setServiceAvailLoading(false))
    }, [checkoutContext?.lines])

    const partnerAddressLabel = formatPartnerAddress(
        checkoutContext?.partner?.address || partnerInfo.address,
    )

    const showMobileFulfillmentStep = Boolean(
        requirements &&
        (
            requirements.showProductFulfillmentOptions ||
            requirements.showPartnerLocation ||
            requirements.showCustomerAddressSection ||
            requirements.showSchedulingSummary ||
            checkoutContext?.deposit.available
        ),
    )

    const mobileStep1Blocked = Boolean(
        contextLoading ||
        (requirements?.showCustomerAddressSection && !formData.deliveryAddress?.trim()) ||
        (productDeliveryQuoteActive &&
            (showAddressForm || !formData.deliveryAddress?.trim() || deliveryQuoteLoading || !!deliveryError)),
    )

    useEffect(() => {
        if (contextLoading || !requirements) return
        if (!showMobileFulfillmentStep) setMobileStep(2)
    }, [contextLoading, requirements, showMobileFulfillmentStep])

    const selectedStorefrontMethod = visibleStorefrontMethods.find((m) => m.id === formData.paymentMethod) || null
    const isCashPayment = paymentOption === "traditional" && (selectedStorefrontMethod ? selectedStorefrontMethod.type === "cash" : formData.paymentMethod === "cash")

    const renderFreeDeliveryProgressCard = () => {
        if (!deliverySettings || formData.deliveryType !== "delivery") return null

        const threshold = deliverySettings.freeDeliveryThreshold != null ? Number(deliverySettings.freeDeliveryThreshold) : 0
        if (threshold <= 0) return null

        const current = orderSubtotal
        const diff = Math.max(0, threshold - current)
        const isFree = diff <= 0
        const percentage = Math.min(100, (current / threshold) * 100)

        const storeUrl = checkoutContext?.store ? getStoreUrl(checkoutContext.store) : checkoutContext?.partner ? getStoreUrl(checkoutContext.partner) : "/"

        return (
            <div className="border border-brand-border dark:border-dark-border rounded-xl p-4 bg-brand-slate/10 dark:bg-dark-border/10 space-y-3 shadow-sm mb-6">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full">
                        Frete Grátis
                    </span>
                    {isFree ? (
                        <span className="text-xs font-semibold text-brand-green flex items-center gap-1">
                            <CheckCircleIcon size={14} className="fill-brand-green text-white shrink-0" /> Atingido
                        </span>
                    ) : (
                        <Link href={storeUrl} className="text-xs font-bold text-brand-green hover:underline">
                            Ver mais itens
                        </Link>
                    )}
                </div>

                <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-brand-dark dark:text-dark-heading leading-tight">
                        {isFree ? (
                            "Parabéns! Você ganhou entrega grátis nesta compra."
                        ) : (
                            <>
                                Falta <span className="font-bold text-brand-green">{formatCurrency(diff)}</span> para entrega grátis nesse vendedor
                            </>
                        )}
                    </p>
                    <div className="w-full h-2 bg-gray-200 dark:bg-dark-border/40 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-brand-green rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                        />
                    </div>
                </div>
            </div>
        )
    }

    const renderChangeSection = () => {
        if (!isCashPayment || isPickup) return null

        return (
            <div className="mt-4 flex items-center justify-between">
                <div className="text-xs">
                    {wantsChange ? (
                        <p className="text-brand-dark dark:text-dark-heading font-medium">
                            Troco para <strong className="font-bold">{formatCurrency(payWithAmount || 0)}</strong> (Troco: <span className="text-brand-green font-bold">{formatCurrency(Math.max(0, (payWithAmount || 0) - checkoutTotalToCharge))}</span>)
                        </p>
                    ) : wantsChange === false ? (
                        <p className="text-brand-inactive-text dark:text-dark-body">Não precisa de troco (valor exato)</p>
                    ) : (
                        <p className="text-amber-600 dark:text-amber-400 font-medium">Defina se precisa de troco</p>
                    )}
                </div>
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={handleOpenChangeModal}
                    className="!p-0 !h-auto text-xs font-semibold text-brand-green"
                >
                    {wantsChange !== null ? "Alterar" : "Definir"}
                </Button>
            </div>
        )
    }

    const shouldPreviewTraditionalPayment = Boolean(
        partnerId &&
        paymentOption === "traditional" &&
        formData.paymentMethod
    )
    const couponItems = useMemo(() => {
        return (sessionData?.source === "cart" && sessionData.cartItems?.length)
            ? sessionData.cartItems.map((item) => ({
                productId: item.itemType === "product" || !item.itemType ? item.productId : null,
                serviceId: item.itemType === "service_booking" ? (item.serviceId || item.productId) : null,
                recurringPlanId: item.itemType === "subscription" ? (item.recurringPlanId || item.productId) : null,
            }))
            : products.map((product) => (
                sessionData?.itemType === "service" || sessionData?.source === "service"
                    ? { serviceId: product.id }
                    : { productId: product.id }
            ));
    }, [products, sessionData])

    const couponItemsKey = useMemo(() => JSON.stringify(couponItems), [couponItems])

    const appliedCoupon = useMemo(
        () => availableCoupons.find((coupon) => coupon.code === couponCode) || null,
        [availableCoupons, couponCode]
    )
    const hasFreeDeliveryCoupon = Boolean(appliedCoupon?.freeShipping || appliedCoupon?.discountType === "free_shipping")



    // Effect 1: Checkout amounts + Delivery fee quote in a single unified call
    useEffect(() => {
        let active = true

        const timer = window.setTimeout(async () => {
            const destinationCoords = selectedAddress?.latitude && selectedAddress?.longitude
                ? { lat: Number(selectedAddress.latitude), lng: Number(selectedAddress.longitude) }
                : undefined

            // Checkout amounts (includes delivery fee calculation)
            if (cartItemIds.length && checkoutContext) {
                setCheckoutAmountsLoading(true)
                setDeliveryQuoteLoading(true)
                try {
                    const result = await getMarketplaceCheckoutAmountsAction({
                        cartItemIds,
                        deliveryType: formData.deliveryType === "pickup" ? "pickup" : "delivery",
                        deliveryAddress: formData.deliveryAddress || "",
                        destinationCoords,
                        couponCode: couponCode || null,
                        payDepositOnly,
                        depositPercent: checkoutContext.deposit?.percent ?? 50,
                        depositAvailable,
                    })
                    if (!active) return
                    if (result.success) {
                        setCheckoutAmounts(result.data)
                        setDeliveryError(null)
                        setDeliveryFee(Number(result.data.deliveryFee || 0))
                        setDeliveryDistanceKm(result.data.distanceKm != null ? Number(result.data.distanceKm) : null)
                        setDeliveryBreakdown((result.data.deliveryBreakdown as Record<string, any>) || null)
                    } else {
                        setCheckoutAmounts(null)
                        setDeliveryError(result.error)
                        if (result.error?.toLowerCase().includes("raio")) {
                            setShowOutsideRadiusModal(true)
                        }
                        setDeliveryFee(0)
                        setDeliveryDistanceKm(null)
                        setDeliveryBreakdown(null)
                    }
                } catch {
                    if (!active) return
                    setCheckoutAmounts(null)
                    setDeliveryError("Erro ao calcular valores do pedido.")
                } finally {
                    if (active) {
                        setCheckoutAmountsLoading(false)
                        setDeliveryQuoteLoading(false)
                    }
                }
            } else if (partnerId && formData.deliveryAddress && productDeliveryQuoteActive) {
                // Fallback for sessions without active cart lines
                setDeliveryQuoteLoading(true)
                try {
                    const quote = await quoteDeliveryFeeAction({
                        partnerId,
                        storeId,
                        destinationAddress: formData.deliveryAddress,
                        destinationCoords,
                        freeDeliveryCoupon: hasFreeDeliveryCoupon,
                        orderSubtotal,
                    })
                    if (!active) return
                    if (quote.success) {
                        setDeliveryError(null)
                        setDeliveryFee(Number(quote.fee || 0))
                        setDeliveryDistanceKm(Number(quote.distanceKm || 0))
                        setDeliveryBreakdown((quote.breakdown as Record<string, any>) || null)
                    } else {
                        setDeliveryError(quote.error)
                        if (quote.error?.toLowerCase().includes("raio")) {
                            setShowOutsideRadiusModal(true)
                        }
                        setDeliveryFee(0)
                        setDeliveryDistanceKm(quote.distanceKm != null ? Number(quote.distanceKm) : null)
                        setDeliveryBreakdown(null)
                    }
                } finally {
                    if (active) setDeliveryQuoteLoading(false)
                }
            } else {
                setDeliveryFee(0)
                setDeliveryDistanceKm(null)
                setDeliveryBreakdown(null)
                setDeliveryQuoteLoading(false)
                setCheckoutAmounts(null)
                setCheckoutAmountsLoading(false)
            }
        }, 120)

        return () => {
            active = false
            window.clearTimeout(timer)
        }
    }, [
        partnerId,
        formData.deliveryAddress,
        hasFreeDeliveryCoupon,
        productDeliveryQuoteActive,
        orderSubtotal,
        cartItemIds,
        checkoutContext,
        formData.deliveryType,
        couponCode,
        payDepositOnly,
        depositAvailable,
        refreshTrigger,
        selectedAddress,
    ])

    // Effect 2: Payment preview - ONLY recalculate on payment method/installments changes
    useEffect(() => {
        let active = true

        const timer = window.setTimeout(async () => {
            if (!active) return

            // Payment preview
            if (shouldPreviewTraditionalPayment) {
                setPaymentPreviewLoading(true)
                setPaymentError(null)
                const result = await previewMarketplacePaymentAction({
                    partnerId,
                    paymentMethodId: formData.paymentMethod,
                    originalAmount: checkoutChargeTotal,
                    installmentNumber: Math.max(1, Number(formData.installments || 1)),
                })
                if (!active) return
                if (result.success) {
                    setPaymentPreview(result)
                    setPaymentError(null)
                } else {
                    setPaymentPreview(null)
                    setPaymentError(result.error)
                }
                setPaymentPreviewLoading(false)
            } else {
                setPaymentPreview(null)
                setPaymentPreviewLoading(false)
                if (paymentOption !== "traditional") {
                    setPaymentError(null)
                }
            }
        }, 100)

        return () => {
            active = false
            window.clearTimeout(timer)
        }
    }, [
        partnerId,
        shouldPreviewTraditionalPayment,
        paymentOption,
        formData.paymentMethod,
        formData.installments,
        checkoutChargeTotal,
    ])

    useEffect(() => {
        if (!paymentPreview?.success) return

        const maxInstallments = Math.max(1, Number(paymentPreview.maxInstallments || 1))
        if (formData.installments > maxInstallments) {
            setFormData((prev) => ({ ...prev, installments: maxInstallments }))
        }
    }, [paymentPreview, formData.installments])


    const checkoutTotalToCharge = paymentOption === "traditional" && paymentPreview?.success
        ? Number(paymentPreview.finalAmount || checkoutChargeTotal)
        : checkoutChargeTotal

    const appliedStoreCredit = useMemo(() => {
        if (!useStoreCredit || availableStoreCredit <= 0) return 0
        return Math.min(availableStoreCredit, checkoutTotalToCharge)
    }, [useStoreCredit, availableStoreCredit, checkoutTotalToCharge])

    const remainingBalanceToCharge = useMemo(() => {
        return Math.max(0, Number((checkoutTotalToCharge - appliedStoreCredit).toFixed(2)))
    }, [checkoutTotalToCharge, appliedStoreCredit])

    const isFullyCoveredByStoreCredit = useMemo(() => {
        return useStoreCredit && availableStoreCredit > 0 && remainingBalanceToCharge <= 0.009
    }, [useStoreCredit, availableStoreCredit, remainingBalanceToCharge])
    const checkoutPricingSnapshot = useMemo(() => {
        const chargedBase = checkoutChargeTotal
        const methodDiscount = paymentOption === "traditional" && paymentPreview?.success
            ? Number(paymentPreview.paymentMethodDiscountAmount || 0)
            : 0
        const passesPaymentCostToCustomer = paymentOption === "traditional" && paymentPreview?.success && paymentPreview.feeBearer !== "merchant"
        const methodInterest = passesPaymentCostToCustomer
            ? Number(paymentPreview.interestAmount || 0)
            : 0
        const methodFee = passesPaymentCostToCustomer
            ? Number(paymentPreview.feeAmount || 0)
            : 0
        const methodFixedFee = passesPaymentCostToCustomer
            ? Number(paymentPreview.fixedFeeAmount || 0)
            : 0

        const snapshotSubtotal = checkoutAmounts
            ? (payDepositOnly && depositAvailable
                ? checkoutDepositChargeTotal - checkoutDeliveryFee + (checkoutAmounts.couponDiscountAmount || 0)
                : checkoutFullTotal - checkoutDeliveryFee + (checkoutAmounts.couponDiscountAmount || 0))
            : contextTotalSubtotal

        return {
            subtotal: snapshotSubtotal,
            couponDiscount: checkoutAmounts?.couponDiscountAmount ?? couponDiscount,
            paymentMethodDiscount: methodDiscount,
            paymentMethodInterest: methodInterest,
            paymentMethodFee: methodFee,
            paymentMethodFixedFee: methodFixedFee,
            deliveryFee: checkoutDeliveryFee,
            finalTotal: checkoutTotalToCharge,
        }
    }, [
        couponDiscount,
        paymentOption,
        paymentPreview,
        showDeliveryFeeRow,
        isPickup,
        deliveryFee,
        checkoutChargeTotal,
        checkoutTotalToCharge,
        payDepositOnly,
        depositAvailable,
        checkoutAmounts,
        checkoutFullTotal,
        checkoutDepositChargeTotal,
        checkoutDeliveryFee,
        contextTotalSubtotal,
    ])
    const preparationEstimate = useMemo(() => computeOrderPreparationEstimate({
        products: products.map((product) => ({
            availability_value: Number(product.availabilityValue || 0),
            availability_unit: product.availabilityUnit || "Minutos",
        })),
        openingHours: partnerInfo.openingHours || null,
        pickupWindowMinutes: 30,
        deliveryTimeEstimateMinutes: 0,
    }), [products, partnerInfo.openingHours])
    const pickupStartLabel = preparationEstimate
        ? preparationEstimate.readyAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : null
    const pickupEndLabel = preparationEstimate
        ? preparationEstimate.pickupWindowEnd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : null
    const paymentPreviewTooltipRows = paymentOption === "traditional" && paymentPreview?.success
        ? [
            { label: "Subtotal", value: formatCurrency(checkoutChargeTotal - checkoutDeliveryFee) },
            Number(paymentPreview.paymentMethodDiscountAmount || 0) > 0
                ? { label: "Desconto", value: `- ${formatCurrency(paymentPreview.paymentMethodDiscountAmount)}` }
                : null,
            paymentPreview.feeBearer !== "merchant" && Number(paymentPreview.interestAmount || 0) > 0
                ? { label: "Juros", value: `+ ${formatCurrency(paymentPreview.interestAmount)}` }
                : null,
            paymentPreview.feeBearer !== "merchant" && Number(paymentPreview.feeAmount || 0) > 0
                ? { label: "Taxa", value: `+ ${formatCurrency(paymentPreview.feeAmount)}` }
                : null,
            paymentPreview.feeBearer !== "merchant" && Number(paymentPreview.fixedFeeAmount || 0) > 0
                ? { label: "Custo do método", value: `+ ${formatCurrency(paymentPreview.fixedFeeAmount)}` }
                : null,
            { label: "Total a cobrar", value: formatCurrency(checkoutTotalToCharge), isTotal: true },
        ].filter(Boolean) as Array<{ label: string; value: string; isTotal?: boolean }>
        : []
    const paymentMethodPreviewBadge = paymentPreviewTooltipRows.length > 0 ? (
        <Tooltip
            text={(
                <div className="min-w-[220px] text-left">
                    <div className="mb-2 font-bold">Ajustes do método selecionado</div>
                    <div className="space-y-1.5">
                        {paymentPreviewTooltipRows.map((row) => (
                            <div
                                key={`${row.label}-${row.value}`}
                                className={`flex justify-between gap-3 ${row.isTotal ? "mt-2 border-t border-white/20 pt-2 font-bold dark:border-black/10" : ""}`}
                            >
                                <span className={row.isTotal ? "" : "text-white/70 dark:text-black/60"}>{row.label}</span>
                                <span className="font-semibold">{row.value}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 text-[11px] text-white/70 dark:text-black/60">
                        Valores configurados pelo vendedor para esse método.
                    </div>
                </div>
            )}
        >
            <span className="inline-flex">
                <Badge variant="gray" icon={<InfoIcon className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body" />} className="cursor-help px-2 border-0 bg-transparent" />
            </span>
        </Tooltip>
    ) : null
    const shouldShowInstallments = paymentOption === "traditional"
        && selectedStorefrontMethod?.type === "credit_card"
        && (Number(paymentPreview?.maxInstallments || selectedStorefrontMethod?.maxInstallments || 1) > 1)
    const hasUnavailableService = Object.values(serviceAvailability).some((s) => s.checked && !s.available)
    const disableCheckoutSubmit = isLoading || hasUnavailableService
        || (paymentOption === "traditional" && (paymentPreviewLoading || storefrontMethodsLoading || (!paymentPreview?.success && shouldPreviewTraditionalPayment)))
        || (productDeliveryQuoteActive && (deliveryQuoteLoading || !!deliveryError))

    const renderSummaryContent = (showSubmitButton = false) => (
        <>
            <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {checkoutContext?.lines && checkoutContext.lines.length > 0 ? (
                    <>
                        {checkoutContext.lines.some((l) => l.lineKind === "product") && (
                            <p className="text-xs font-bold uppercase text-brand-inactive-text dark:text-dark-body tracking-wide mb-2">Produtos</p>
                        )}
                        {checkoutContext.lines
                            .filter((l) => l.lineKind === "product")
                            .map((line) => (
                                <div
                                    key={line.lineId}
                                    className="group flex flex-row items-center gap-4 py-3 border-b border-brand-border/40 dark:border-dark-border/40 last:border-b-0"
                                >
                                    <div className="w-14 h-14 bg-white border border-brand-border dark:border-dark-border rounded-lg flex items-center justify-center shrink-0">
                                        <img
                                            src={line.imageUrl || "https://img.dudit.com.br/static/Placeholder.png"}
                                            alt={line.baseName || line.displayName}
                                            className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-brand-dark dark:text-dark-heading text-sm truncate">
                                            {line.baseName || line.displayName}
                                        </h4>
                                        {line.isGift && (
                                            <div className="mt-1">
                                                <Badge variant="green">Você ganhou este brinde</Badge>
                                            </div>
                                        )}
                                        {line.variantName && (
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                {line.variantName}
                                            </div>
                                        )}
                                        {Array.isArray(line.selectedAddons) && line.selectedAddons.length > 0 && (
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 space-y-0.5">
                                                {(() => {
                                                    const addons = line.selectedAddons || []
                                                    const groupsMap: Record<string, any[]> = {}
                                                    addons.forEach((a: any) => {
                                                        const gTitle = a.groupTitle || (addons.length === 1 ? "Complemento" : "Complementos")
                                                        if (!groupsMap[gTitle]) groupsMap[gTitle] = []
                                                        groupsMap[gTitle].push(a)
                                                    })
                                                    return Object.entries(groupsMap).map(([title, groupList], gIdx) => (
                                                        <div key={gIdx}>
                                                            {title}: <span className="font-medium text-brand-dark dark:text-dark-heading">{groupList.map((a: any) => `${a.optionName || a.name || a.title || "Adicional"}${(Number(a.price) || 0) > 0 ? ` (+${formatCurrency(Number(a.price))})` : ""}`).join(", ")}</span>
                                                        </div>
                                                    ))
                                                })()}
                                            </div>
                                        )}
                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                            Qtd: {line.quantity}
                                        </div>
                                    </div>
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading shrink-0 pr-1">
                                        {line.isGift ? (
                                            <div className="flex items-center gap-1.5 justify-end">
                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body line-through font-normal">{formatCurrency(line.originalPrice || 0)}</span>
                                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                            </div>
                                        ) : (
                                            formatCurrency(line.lineTotal)
                                        )}
                                    </div>
                                </div>
                            ))}
                        {checkoutContext.lines.some((l) => l.lineKind === "service_booking") && (
                            <p className="text-xs font-bold uppercase text-brand-inactive-text dark:text-dark-body tracking-wide pt-2 mb-2">Serviços</p>
                        )}
                        {checkoutContext.lines
                            .filter((l) => l.lineKind === "service_booking")
                            .map((line) => (
                                <div
                                    key={line.lineId}
                                    className="group flex flex-row items-center gap-4 py-3 border-b border-brand-border/40 dark:border-dark-border/40 last:border-b-0"
                                >
                                    <div className="w-14 h-14 bg-white border border-brand-border dark:border-dark-border rounded-lg flex items-center justify-center shrink-0">
                                        <img
                                            src={line.imageUrl || "https://img.dudit.com.br/static/Placeholder.png"}
                                            alt={line.baseName || line.displayName}
                                            className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-brand-dark dark:text-dark-heading text-sm truncate">
                                            {line.baseName || line.displayName}
                                        </h4>
                                        {line.isGift && (
                                            <div className="mt-1">
                                                <Badge variant="green">Você ganhou este brinde</Badge>
                                            </div>
                                        )}
                                        {line.bookingSummary && (
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                {line.bookingSummary}
                                            </div>
                                        )}
                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                            Qtd: {line.quantity}
                                        </div>
                                    </div>
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading shrink-0 pr-1">
                                        {line.isGift ? (
                                            <div className="flex items-center gap-1.5 justify-end">
                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body line-through font-normal">{formatCurrency(line.originalPrice || 0)}</span>
                                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                            </div>
                                        ) : (
                                            formatCurrency(line.lineTotal)
                                        )}
                                    </div>
                                    {serviceAvailability[line.lineId]?.checked && !serviceAvailability[line.lineId]?.available && (
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-brand-orange dark:text-orange-400 font-medium">
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0" />
                                            <span>Este horário não está mais disponível</span>
                                            <span className="text-brand-inactive-text/40 dark:text-dark-body/40">•</span>
                                            <button
                                                onClick={() => {
                                                    const service = { id: line.serviceId, name: line.baseName || line.displayName }
                                                    const p = checkoutContext?.partner
                                                    if (service.id && p) window.location.href = getServiceUrl(service, p)
                                                }}
                                                className="font-semibold text-brand-green hover:underline"
                                            >
                                                Remarcar
                                            </button>
                                            <span className="text-brand-inactive-text/40 dark:text-dark-body/40">•</span>
                                            <button
                                                onClick={async () => {
                                                    await deleteCartItemsAction([line.lineId])
                                                    window.location.reload()
                                                }}
                                                className="font-semibold text-brand-red hover:underline"
                                            >
                                                Remover
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        {checkoutContext.lines.some((l) => l.lineKind === "subscription") && (
                            <p className="text-xs font-bold uppercase text-brand-inactive-text dark:text-dark-body tracking-wide pt-2 mb-2">Assinaturas</p>
                        )}
                        {checkoutContext.lines
                            .filter((l) => l.lineKind === "subscription")
                            .map((line) => (
                                <div
                                    key={line.lineId}
                                    className="group flex flex-row items-center gap-4 py-3 border-b border-brand-border/40 dark:border-dark-border/40 last:border-b-0"
                                >
                                    <div className="w-14 h-14 bg-white border border-brand-border dark:border-dark-border rounded-lg flex items-center justify-center shrink-0">
                                        <img
                                            src={line.imageUrl || "https://img.dudit.com.br/static/Placeholder.png"}
                                            alt={line.baseName || line.displayName}
                                            className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-brand-dark dark:text-dark-heading text-sm truncate">
                                            {line.baseName || line.displayName}
                                        </h4>
                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                            Qtd: {line.quantity}
                                        </div>
                                    </div>
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading shrink-0 pr-1">
                                        {formatCurrency(line.lineTotal)}
                                    </div>
                                </div>
                            ))}
                    </>
                ) : (
                    products.map((item) => {
                        const itemImage = item.image || "https://img.dudit.com.br/static/Placeholder.png"
                        const qty = quantities[item.id] || item.quantity

                        return (
                            <div
                                key={item.id}
                                className="group flex flex-row items-center gap-4 py-3 border-b border-brand-border/40 dark:border-dark-border/40 last:border-b-0"
                            >
                                <div className="w-14 h-14 bg-white border border-brand-border dark:border-dark-border rounded-lg flex items-center justify-center shrink-0">
                                    <img src={itemImage} alt={item.name} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-brand-dark dark:text-dark-heading text-sm truncate">
                                        {item.name}
                                    </h4>
                                    {item.variant && (
                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                            {item.variant.includes(":") ? item.variant.split(":")[1].trim() : item.variant}
                                        </div>
                                    )}
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">
                                        {formatCurrency(item.price)}
                                    </div>
                                </div>
                                <div className="text-sm text-brand-inactive-text dark:text-dark-body shrink-0 pr-1">
                                    x{qty}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {(displayableCoupons.length > 0 || !!appliedCoupon || couponListLoading) && (
                <div className="mb-4 space-y-2">
                    <ListItem
                        icon={TagIcon}
                        title={appliedCoupon ? getCouponTitle(appliedCoupon) : "Escolha um cupom"}
                        titleClassName="text-sm"
                        description={appliedCoupon ? "Cupom aplicado" : (couponListLoading ? "Verificando cupons disponíveis..." : getCouponCountLabel(displayableCoupons.length))}
                        className="px-0 py-4 gap-4 border-y border-x-0 border-brand-border dark:border-dark-border !bg-transparent !rounded-none shadow-none hover:border-brand-border dark:hover:border-dark-border"
                        onClick={() => {
                            if (!couponListLoading && displayableCoupons.length > 0) {
                                setSelectedCouponId(appliedCoupon?.id || "")
                                setShowCouponModal(true)
                            }
                        }}
                        showChevron={!couponListLoading && displayableCoupons.length > 0 && !appliedCoupon}
                        right={
                            appliedCoupon ? (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleRemoveCoupon()
                                    }}
                                    className="text-xs font-semibold text-brand-red hover:text-red-600 flex items-center gap-1 shrink-0"
                                >
                                    <XIcon size={12} /> Remover
                                </button>
                            ) : couponListLoading ? (
                                <Spinner size={18} />
                            ) : undefined
                        }
                    />
                    {couponError && (
                        <p className="text-xs text-red-500">{couponError}</p>
                    )}
                    {couponPartialWarning && appliedCoupon && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            {appliedCoupon.eligibleItemsCount !== undefined && appliedCoupon.totalItemsCount !== undefined
                                ? `Desconto aplicado a ${appliedCoupon.eligibleItemsCount} de ${appliedCoupon.totalItemsCount} itens.`
                                : "Este cupom não se aplica a alguns itens da sacola. O desconto foi calculado apenas sobre os itens elegíveis."}
                        </p>
                    )}
                </div>
            )}

            <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                    <span>Subtotal</span>
                    <span className="text-brand-dark dark:text-dark-heading">{formatCurrency(contextTotalSubtotal)}</span>
                </div>
                {couponDiscount > 0 && (
                    <div className="flex justify-between text-sm font-medium text-brand-green">
                        <span>Desconto do cupom</span>
                        <span>-{formatCurrency(couponDiscount)}</span>
                    </div>
                )}
                {showDeliveryFeeRow && (
                    <div className="flex justify-between text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        <span>Entrega</span>
                        <span className={(isPickup || (deliveryFee === 0 && (hasFreeDeliveryCoupon || (deliveryBreakdown as any)?.isFreeByThreshold || deliverySettings?.deliveryPayer === "seller" || (deliveryBreakdown as any)?.deliveryPayer === "seller" || (hasConfiguredDeliveryRates && productDeliveryQuoteActive && !deliveryError && Boolean(formData.deliveryAddress))))) ? "text-brand-green font-semibold" : "text-brand-dark dark:text-dark-heading"}>
                            {isPickup
                                ? "Grátis"
                                : deliveryQuoteLoading
                                    ? "Calculando..."
                                    : (deliverySettings?.deliveryPayer === "seller" || (deliveryBreakdown as any)?.deliveryPayer === "seller")
                                        ? (
                                            <span className="flex items-center gap-1.5 justify-end">
                                                {(deliveryBreakdown as any)?.originalFee != null && Number((deliveryBreakdown as any).originalFee) > 0 && (
                                                    <span className="text-xs line-through text-brand-inactive-text dark:text-dark-body font-normal">
                                                        {formatCurrency(Number((deliveryBreakdown as any).originalFee))}
                                                    </span>
                                                )}
                                                <span className="text-brand-green font-semibold">Grátis (Pago pela loja)</span>
                                            </span>
                                        )
                                        : deliveryFee > 0
                                            ? formatCurrency(deliveryFee)
                                            : (hasFreeDeliveryCoupon || (deliveryBreakdown as any)?.isFreeByThreshold)
                                                ? "Grátis"
                                                : !productDeliveryQuoteActive || deliveryError || !formData.deliveryAddress || !hasConfiguredDeliveryRates
                                                    ? "A combinar"
                                                    : "Grátis"
                            }
                        </span>
                    </div>
                )}
                {showDeliveryFeeRow && !isPickup && deliveryBreakdown && (Number(deliveryBreakdown.distanceFee) > 0 || (deliveryBreakdown.timeAdjustmentTotal != null && Number(deliveryBreakdown.timeAdjustmentTotal) !== 0)) && (
                    <div className="space-y-1 text-xs text-brand-inactive-text dark:text-dark-body">
                        {Number(deliveryBreakdown.baseFee) > 0 && <div className="flex justify-between"><span>Taxa base</span><span>{formatCurrency(Number(deliveryBreakdown.baseFee))}</span></div>}
                        {Number(deliveryBreakdown.distanceFee) > 0 && <div className="flex justify-between"><span>Distância {deliveryDistanceKm != null ? `(${deliveryDistanceKm.toFixed(2)} km)` : ""}</span><span>{formatCurrency(Number(deliveryBreakdown.distanceFee))}</span></div>}
                        {deliveryBreakdown.timeAdjustmentTotal != null && Number(deliveryBreakdown.timeAdjustmentTotal) !== 0 && (
                            <div className="flex justify-between">
                                <span>Ajuste horário</span>
                                <span>{Number(deliveryBreakdown.timeAdjustmentTotal) > 0 ? `+${formatCurrency(Number(deliveryBreakdown.timeAdjustmentTotal))}` : formatCurrency(Number(deliveryBreakdown.timeAdjustmentTotal))}</span>
                            </div>
                        )}
                    </div>
                )}
                {isPickup && preparationEstimate && (preparationEstimate.preparationTimeMinutes > 0 || preparationEstimate.readyAt.getTime() > preparationEstimate.now.getTime()) && (
                    <InfoCard color="orange" message={`Retirada ${getReadyDayLabel(preparationEstimate)} entre ${pickupStartLabel} e ${pickupEndLabel}`} />
                )}
                {paymentOption === "traditional" && paymentPreviewLoading && (
                    <div className="flex items-center justify-between text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        <span>Calculando pagamento</span>
                        <Spinner size={16} />
                    </div>
                )}
                {paymentOption === "traditional" && paymentPreview?.success && Number(paymentPreview.paymentMethodDiscountAmount || 0) > 0 && (
                    <div className="flex justify-between text-sm font-medium text-brand-green">
                        <span className="flex items-center gap-2">
                            <span>Desconto do meio de pagamento</span>
                            {paymentMethodPreviewBadge}
                        </span>
                        <span>-{formatCurrency(paymentPreview.paymentMethodDiscountAmount)}</span>
                    </div>
                )}
                {paymentOption === "traditional" && paymentPreview?.success && paymentPreview.feeBearer !== "merchant" && Number(paymentPreview.interestAmount || 0) > 0 && (
                    <div className="flex justify-between text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        <span className="flex items-center gap-2">
                            <span>Juros</span>
                            {paymentMethodPreviewBadge}
                        </span>
                        <span>+{formatCurrency(paymentPreview.interestAmount)}</span>
                    </div>
                )}
                {paymentOption === "traditional" && paymentPreview?.success && paymentPreview.feeBearer !== "merchant" && Number(paymentPreview.feeAmount || 0) > 0 && (
                    <div className="flex justify-between text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        <span className="flex items-center gap-2">
                            <span>Taxas</span>
                            {paymentMethodPreviewBadge}
                        </span>
                        <span>+{formatCurrency(paymentPreview.feeAmount)}</span>
                    </div>
                )}
                {appliedStoreCredit > 0 && (
                    <div className="flex justify-between text-sm font-medium text-brand-green font-bold">
                        <span>Crédito em loja</span>
                        <span>-{formatCurrency(appliedStoreCredit)}</span>
                    </div>
                )}
            </div>

            <Separator className="mb-4" />

            <div className="flex flex-col gap-1 mb-4">
                <div className="flex justify-between items-end">
                    <span className="font-bold text-xl text-brand-dark dark:text-dark-heading">Total a cobrar</span>
                    <span className="font-bold text-xl text-brand-dark dark:text-dark-heading">{formatCurrency(remainingBalanceToCharge)}</span>
                </div>
                {appliedStoreCredit > 0 && (
                    <span className="text-xs text-brand-inactive-text dark:text-dark-body text-right">
                        (Total original: {formatCurrency(checkoutTotalToCharge)} · Crédito: -{formatCurrency(appliedStoreCredit)})
                    </span>
                )}
            </div>

            {showSubmitButton && (
                <Button
                    onClick={(e) => handleSubmit(e as any)}
                    disabled={disableCheckoutSubmit}
                    className="w-full h-[46px]"
                >
                    {isLoading
                        ? "Direcionando..."
                        : paymentPreviewLoading
                            ? "Calculando pagamento..."
                            : checkoutContext?.partner?.orderFlow === "whatsapp"
                                ? `Fazer pedido via WhatsApp • ${formatCurrency(checkoutTotalToCharge)}`
                                : `Finalizar pedido • ${formatCurrency(checkoutTotalToCharge)}`
                    }
                </Button>
            )}
        </>
    )

    const getCouponCountLabel = (count: number) => {
        if (count === 1) return "1 cupom disponível"
        return `${count} cupons disponíveis`
    }

    const getCouponTitle = (coupon: MarketplaceAvailableCoupon) => {
        if (coupon.freeShipping || coupon.discountType === "free_shipping") {
            return `${coupon.code} - Entrega grátis`
        }

        return `${coupon.code} - ${formatCurrency(coupon.discountAmount)} OFF`
    }

    const getCouponSubtitle = (coupon: MarketplaceAvailableCoupon) => {
        const requirements: string[] = []

        if (Number(coupon.minCartValue || 0) > 0) {
            requirements.push(`Pedido mínimo de ${formatCurrency(Number(coupon.minCartValue || 0))}`)
        }

        if (coupon.firstPurchaseOnly) {
            requirements.push("Somente na primeira compra")
        }

        return requirements.join(" • ")
    }

    const loadApplicableCoupons = async () => {
        if (!partnerId || !userId) {
            setAvailableCoupons([])
            return
        }

        setCouponListLoading(true)
        setCouponError(null)

        try {
            const result = await listApplicableMarketplaceCouponsAction({
                partnerId,
                customerId: userId,
                subtotal: totalAmount,
                items: couponItems,
            })

            if (!result.success) {
                setAvailableCoupons([])
                setCouponError(result.error || "Nao foi possivel carregar os cupons.")
                return
            }

            setAvailableCoupons(result.coupons)

            if (couponCode) {
                const stillApplicable = result.coupons.find((coupon) => coupon.code === couponCode)

                if (stillApplicable) {
                    setCouponDiscount(stillApplicable.discountAmount)
                    setSelectedCouponId(stillApplicable.id)
                    setCouponError(null)
                } else {
                    setCouponCode("")
                    setCouponDiscount(0)
                    setSelectedCouponId("")
                    setCouponError("O cupom aplicado não se encaixa mais neste pedido.")
                }
            }
        } catch (error) {
            console.error("Erro ao carregar cupons do marketplace:", error)
            setAvailableCoupons([])
            setCouponError("Nao foi possivel carregar os cupons.")
        } finally {
            setCouponListLoading(false)
        }
    }

    useEffect(() => {
        void loadApplicableCoupons()
    }, [partnerId, userId, totalAmount, couponItemsKey])

    const refreshCouponPartialWarning = async (code: string) => {
        if (!partnerId || !code.trim()) {
            setCouponPartialWarning(false)
            return
        }
        const result = await validateMarketplaceCouponAction({
            partnerId,
            code,
            customerId: userId,
            subtotal: totalAmount,
            shippingCost: isPickup ? 0 : deliveryFee,
            items: couponItems,
        })
        setCouponPartialWarning(Boolean(result.valid && result.partialApplicabilityWarning))
    }

    const handleApplySelectedCoupon = () => {
        const selectedCoupon = availableCoupons.find((coupon) => coupon.id === selectedCouponId)

        if (!selectedCoupon) {
            setCouponCode("")
            setCouponDiscount(0)
            setCouponError(null)
            setCouponPartialWarning(false)
            setShowCouponModal(false)
            return
        }

        setCouponCode(selectedCoupon.code)
        setCouponDiscount(selectedCoupon.discountAmount)
        setCouponError(null)
        void refreshCouponPartialWarning(selectedCoupon.code)
        setShowCouponModal(false)
    }

    const handleRemoveCoupon = () => {
        setCouponCode("")
        setCouponDiscount(0)
        setSelectedCouponId("")
        setCouponError(null)
        setCouponPartialWarning(false)
    }

    const formatBRDate = (dateStr: string) => {
        if (!dateStr) return ""
        const parts = dateStr.split("-")
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`
        }
        return dateStr
    }

    const buildWhatsAppMessage = () => {
        let msg = `Olá! Gostaria de fazer o seguinte pedido:\n\n`

        msg += `*👤 CLIENTE*\n`
        msg += `- Nome: ${userName || "Não informado"}\n\n`

        msg += `*📦 ITENS DO PEDIDO*\n`
        const lines = checkoutContext?.lines || []
        lines.forEach((line) => {
            const isGiftLabel = line.isGift ? `[BRINDE] ` : ""
            const variantLabel = line.variantName ? ` (${line.variantName})` : ""
            const priceLabel = line.unitPrice > 0 ? formatCurrency(line.unitPrice) : "Grátis"
            const totalLabel = line.lineTotal > 0 ? formatCurrency(line.lineTotal) : "Grátis"

            msg += `- ${line.quantity}x ${isGiftLabel}${line.displayName}${variantLabel} - ${priceLabel} (Total: ${totalLabel})\n`

            if (line.lineKind === "service_booking" && line.bookingMetadata) {
                const dateBR = formatBRDate(line.bookingMetadata.date)
                const locationLabel = line.fulfillmentMode === "on_site" ? "No estabelecimento" : "No endereço do cliente"
                msg += `  - Agendamento: ${dateBR} às ${line.bookingMetadata.time}\n`
                msg += `  - Local: ${locationLabel}\n`
                if (line.fulfillmentMode === "customer_location" && formData.deliveryAddress) {
                    msg += `  - Endereço do agendamento: ${formData.deliveryAddress}\n`
                }
            }
        })
        msg += `\n`

        msg += `*🛵 ENTREGA / RETIRADA*\n`
        if (formData.deliveryType === "delivery") {
            msg += `- Tipo: Entrega\n`
            msg += `- Endereço: ${formData.deliveryAddress || "Não informado"}\n`
        } else {
            msg += `- Tipo: Retirada no estabelecimento\n`
            if (checkoutContext?.partner?.address) {
                msg += `- Endereço para retirada: ${formatPartnerAddress(checkoutContext.partner.address)}\n`
            }
        }
        msg += `\n`

        msg += `*💳 PAGAMENTO*\n`
        const methodType = selectedStorefrontMethod ? (paymentTypeLabelMap[selectedStorefrontMethod.type] || selectedStorefrontMethod.type) : "Não informado"
        const installmentAmount = paymentPreview?.installmentAmounts?.[formData.installments - 1] || (checkoutTotalToCharge / formData.installments)
        const installmentText = formData.installments > 1
            ? ` (${formData.installments}x de ${formatCurrency(installmentAmount)})`
            : ""
        const changeText = isCashPayment && wantsChange && payWithAmount
            ? ` (Precisa de troco para ${formatCurrency(payWithAmount)})`
            : isCashPayment && wantsChange === false
                ? " (Não precisa de troco)"
                : ""
        msg += `- Meio de Pagamento: ${methodType}${installmentText}${changeText}\n\n`

        msg += `*💰 RESUMO FINANCEIRO*\n`
        const subtotal = (checkoutContext?.productsSubtotal || 0) + (checkoutContext?.servicesSubtotal || 0) + (checkoutContext?.subscriptionsSubtotal || 0)
        msg += `- Subtotal: ${formatCurrency(subtotal)}\n`
        if (couponCode) {
            msg += `- Cupom (${couponCode}): -${formatCurrency(couponDiscount)}\n`
        }
        if (paymentPreview?.success) {
            const methodDiscount = Number(paymentPreview.paymentMethodDiscountAmount || 0)
            const methodInterest = paymentPreview.feeBearer !== "merchant" ? Number(paymentPreview.interestAmount || 0) : 0
            const methodFee = paymentPreview.feeBearer !== "merchant" ? Number(paymentPreview.feeAmount || 0) : 0

            if (methodDiscount > 0) {
                msg += `- Desconto de Pagamento: -${formatCurrency(methodDiscount)}\n`
            }
            if (methodInterest > 0) {
                msg += `- Juros: +${formatCurrency(methodInterest)}\n`
            }
            if (methodFee > 0) {
                msg += `- Taxas: +${formatCurrency(methodFee)}\n`
            }
        }
        if (formData.deliveryType === "delivery") {
            const isFreeExplicit = hasFreeDeliveryCoupon || (deliveryBreakdown as any)?.isFreeByThreshold || deliverySettings?.deliveryPayer === "seller" || (deliveryBreakdown as any)?.deliveryPayer === "seller"
            const deliveryLabel = deliveryFee > 0
                ? formatCurrency(deliveryFee)
                : isFreeExplicit || (hasConfiguredDeliveryRates && deliveryFee === 0)
                    ? "Grátis"
                    : "A combinar"
            msg += `- Taxa de Entrega: ${deliveryLabel}\n`
        }
        msg += `- *Total do Pedido: ${formatCurrency(checkoutTotalToCharge)}*\n\n`

        if (formData.notes?.trim()) {
            msg += `*📝 OBSERVAÇÕES*\n`
            msg += `- ${formData.notes.trim()}\n`
        }

        return msg
    }

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        setDeliveryError(null)
        setPaymentError(null)
        setIsLoading(true)

        if (checkoutContext?.deposit.available && !bypassDepositModalRef.current) {
            setShowDepositChoiceModal(true)
            setIsLoading(false)
            return
        }
        bypassDepositModalRef.current = false

        if (cartItemIds.length > 0 && !checkoutAmountsReady) {
            notifyError("Aguarde", "Calculando valores do checkout. Tente novamente em instantes.")
            setIsLoading(false)
            return
        }

        if (isCashPayment && !isPickup) {
            if (wantsChange === null) {
                setPaymentError("Por favor, informe se precisa de troco.")
                setTempWantsChange(null)
                setTempPayWithAmount("")
                setShowChangeModal(true)
                setIsLoading(false)
                return
            }
            if (wantsChange && (!payWithAmount || payWithAmount < checkoutTotalToCharge)) {
                setPaymentError("O valor pago não pode ser menor que o total do pedido.")
                setTempWantsChange(true)
                setTempPayWithAmount(payWithAmount ? String(payWithAmount) : "")
                setShowChangeModal(true)
                setIsLoading(false)
                return
            }
        }

        if (requirements?.showCustomerAddressSection && !formData.deliveryAddress?.trim()) {
            setDeliveryError("Por favor, selecione ou cadastre um endereço para continuar.")
            setIsLoading(false)
            return
        }

        if (requirements?.hasIncompatiblePaymentRestrictions) {
            setPaymentError("Alguns itens deste pedido possuem restrições incompatíveis de pagamento. Finalize-os separadamente.")
            setIsLoading(false)
            return
        }

        // Check service booking availability before submitting
        const serviceLines = (checkoutContext?.lines || []).filter((l) => l.lineKind === "service_booking" && l.bookingMetadata)
        if (serviceLines.length > 0) {
            const availItems = serviceLines.map((l) => ({
                partnerId: checkoutContext!.partner!.id,
                staffId: l.bookingMetadata!.staffId,
                date: l.bookingMetadata!.date,
                time: l.bookingMetadata!.time,
                durationMinutes: l.bookingMetadata!.durationMinutes,
                storeId: l.bookingMetadata!.storeId || null,
            }))
            const availResults = await validateServiceBookingAvailabilityAction(availItems)
            const map: Record<string, { available: boolean; checked: boolean }> = {}
            serviceLines.forEach((l, i) => { map[l.lineId] = { available: availResults[i]?.available ?? true, checked: true } })
            setServiceAvailability(map)
            const anyUnavailable = availResults.some((r) => !r.available)
            if (anyUnavailable) {
                setPaymentError("Um ou mais serviços não estão mais disponíveis no horário selecionado. Remova ou remarque antes de continuar.")
                setIsLoading(false)
                return
            }
        }

        if (productDeliveryQuoteActive) {
            if (showAddressForm) {
                setDeliveryError("Por favor, salve o endereço antes de finalizar o pedido")
                setIsLoading(false)
                return
            }
            if (!formData.deliveryAddress) {
                setDeliveryError("Por favor, selecione um endereço de entrega")
                setIsLoading(false)
                return
            }
            if (deliveryQuoteLoading) {
                setDeliveryError("Aguarde o cálculo da taxa de entrega.")
                setIsLoading(false)
                return
            }
            if (deliveryError) {
                setDeliveryError(deliveryError)
                if (deliveryError.toLowerCase().includes("raio")) {
                    setShowOutsideRadiusModal(true)
                }
                setIsLoading(false)
                return
            }
        }

        if (requirements && paymentOption && paymentOption !== "subscription_credits" && !isFullyCoveredByStoreCredit) {
            const clientPayCheck = validateMarketplaceCheckoutPayment({
                requirements,
                paymentOption,
                paymentMethodType: selectedStorefrontMethod?.type || formData.paymentMethod,
                productDeliveryType: formData.deliveryType,
            })
            if (!clientPayCheck.valid) {
                setPaymentError(clientPayCheck.error)
                setIsLoading(false)
                return
            }
        }

        try {
            if (checkoutContext?.partner?.orderFlow === "whatsapp") {
                const message = buildWhatsAppMessage()
                const phone = checkoutContext?.partner?.phone || partnerInfo.phone
                let cleanPhone = phone ? phone.replace(/\D/g, "") : ""
                if (cleanPhone && !cleanPhone.startsWith("55") && cleanPhone.length <= 11) {
                    cleanPhone = "55" + cleanPhone
                }

                if (!cleanPhone) {
                    setPaymentError("O vendedor não possui um número de WhatsApp cadastrado para receber o pedido.")
                    setIsLoading(false)
                    return
                }

                if (sessionData?.source === "cart" && cartItemIds.length > 0) {
                    await deleteCartItemsAction(cartItemIds)
                }

                sessionStorage.removeItem("checkout_session")
                invalidateCartCache()

                const encodedText = encodeURIComponent(message)
                window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, "_blank")

                setIsLoading(false)
                router.push("/")
                return
            }

            if (isFullyCoveredByStoreCredit) {
                const token = csrfToken || await fetchCSRFTokenSingleton() || ""
                if (sessionData && sessionData.source === "cart") {
                    const items = sessionData.cartItems || []
                    const result = await checkoutCartAction(
                        items.map(item => {
                            const matchedLine = checkoutContext?.lines?.find(l => l.lineId === item.cartItemId);
                            return {
                                cartItemId: item.cartItemId,
                                productId: item.productId || "",
                                variantId: item.variantId,
                                quantity:
                                    quantities[item.cartItemId]
                                    || quantities[item.productId || item.serviceId || item.recurringPlanId || ""]
                                    || item.quantity,
                                fulfillmentMode: matchedLine?.fulfillmentMode || undefined,
                            }
                        }),
                        formData.deliveryType,
                        formData.deliveryAddress,
                        "Vale-compra",
                        1,
                        formData.notes,
                        couponCode || null,
                        false,
                        token,
                        false,
                        undefined,
                        payDepositOnly,
                        checkoutPricingSnapshot,
                        false,
                        storeId,
                        true,
                    )
                    if (result.error) throw new Error(result.error)
                    invalidateCartCache()
                    sessionStorage.removeItem("checkout_session")
                    notifySuccess("Pedido realizado!", "Seu pedido foi pago integralmente com seu crédito na loja.")
                    setIsLoading(false)
                    router.push("/minhas-compras")
                    return
                }
            }

            if (paymentOption === "subscription_credits") {
                // Subscription credits: create order as paid directly
                const token = csrfToken || await fetchCSRFTokenSingleton() || ""
                if (sessionData?.source === "cart") {
                    const items = sessionData.cartItems || []
                    const result = await checkoutCartAction(
                        items.map(item => {
                            const matchedLine = checkoutContext?.lines?.find(l => l.lineId === item.cartItemId)
                            return {
                                cartItemId: item.cartItemId,
                                productId: item.productId || "",
                                variantId: item.variantId,
                                quantity:
                                    quantities[item.cartItemId]
                                    || quantities[item.productId || item.serviceId || item.recurringPlanId || ""]
                                    || item.quantity,
                                fulfillmentMode: matchedLine?.fulfillmentMode || undefined,
                            }
                        }),
                        formData.deliveryType,
                        formData.deliveryAddress,
                        "Assinatura (Créditos)",
                        1,
                        formData.notes,
                        null,
                        false,
                        token,
                        false,
                        undefined,
                        false,
                        checkoutPricingSnapshot,
                        false,
                        storeId,
                    )
                    if (result.error) throw new Error(result.error)
                    invalidateCartCache()
                    sessionStorage.removeItem("checkout_session")
                    notifySuccess("Agendamento confirmado!", "Seus créditos de assinatura foram utilizados.")
                    setIsLoading(false)
                    router.push("/minhas-compras")
                } else {
                    const result = await createOrderAction({
                        itemId: sessionData?.itemId || products[0]?.id || "",
                        itemType: sessionData?.itemType || "product",
                        quantity: quantities[products[0]?.id] || products[0]?.quantity || 1,
                        totalAmount: 0,
                        deliveryType: formData.deliveryType,
                        deliveryAddress: formData.deliveryAddress,
                        paymentMethod: "Assinatura (Créditos)",
                        installments: 1,
                        notes: formData.notes,
                        partnerId: partnerId,
                        csrf_token: token,
                        couponCode: null,
                        wantsChange: false,
                        payWithAmount: undefined,
                        checkoutPricingSnapshot,
                    })
                    if ('error' in result && result.error) throw new Error(result.error)
                    sessionStorage.removeItem("checkout_session")
                    notifySuccess("Agendamento confirmado!", "Seus créditos de assinatura foram utilizados.")
                    setIsLoading(false)
                    router.push("/minhas-compras")
                }
                return
            } else if (paymentOption === "mercadopago") {
                const amount = checkoutChargeTotal
                setPixPaymentData({
                    orderId: "temp-" + Date.now(),
                    amount,
                    orderDetails: {
                        items: products.map(p => ({
                            id: p.id,
                            name: p.name,
                            price: p.price,
                            quantity: quantities[p.id] || p.quantity,
                            image: p.image || "",
                            variant_id: p.variant || ""
                        })),
                        deliveryType: formData.deliveryType,
                        deliveryAddress: formData.deliveryAddress,
                        notes: formData.notes,
                        couponCode: couponCode || null,
                        couponDiscount: couponDiscount,
                        deliveryFee: isPickup ? 0 : deliveryFee,
                        checkoutPricing: checkoutPricingSnapshot,
                        cartItemIds:
                            sessionData?.source === "cart"
                                ? (sessionData.cartItems || []).map((item) => item.cartItemId)
                                : undefined,
                    },
                    sellerName: sessionData?.partnerInfo?.store_name || "Loja",
                    mpPublicKey: sessionData?.partnerInfo?.mpPublicKey || "",
                    useMercadoPago: true,
                    partnerId: partnerId,
                    userEmail: userEmail,
                    userName: userName,
                    payDepositOnly: payDepositOnly,
                    partnerPhone: checkoutContext?.partner.phone || null,
                    pixKey: checkoutContext?.partner.pixKey || null,
                    pixKeyType: checkoutContext?.partner.pixKeyType || null,
                })
                setShowPixModal(true)
                setIsLoading(false)
                return
            } else {
                if (!formData.paymentMethod) {
                    setPaymentError("Por favor, selecione um meio de pagamento.")
                    setIsLoading(false)
                    return
                }
                if (paymentPreviewLoading) {
                    setPaymentError("Aguarde o cálculo do pagamento terminar antes de finalizar.")
                    setIsLoading(false)
                    return
                }
                if (!paymentPreview?.success) {
                    setPaymentError("Não foi possível calcular o valor final desse meio de pagamento.")
                    setIsLoading(false)
                    return
                }
                const isPickupPayment = isPickup && checkoutContext?.partner?.pickupPaymentPolicy === "allow_pickup_payment" && paymentOption === "traditional"
                const token = csrfToken || await fetchCSRFTokenSingleton() || ""
                if (sessionData && sessionData.source === "cart") {
                    const items = sessionData.cartItems || []
                    const result = await checkoutCartAction(
                        items.map(item => {
                            const matchedLine = checkoutContext?.lines?.find(l => l.lineId === item.cartItemId);
                            return {
                                cartItemId: item.cartItemId,
                                productId: item.productId || "",
                                variantId: item.variantId,
                                quantity:
                                    quantities[item.cartItemId]
                                    || quantities[item.productId || item.serviceId || item.recurringPlanId || ""]
                                    || item.quantity,
                                fulfillmentMode: matchedLine?.fulfillmentMode || undefined,
                            }
                        }),
                        formData.deliveryType,
                        formData.deliveryAddress,
                        formData.paymentMethod,
                        formData.installments,
                        formData.notes,
                        couponCode || null,
                        false,
                        token,
                        wantsChange || false,
                        payWithAmount || undefined,
                        payDepositOnly,
                        checkoutPricingSnapshot,
                        isPickupPayment,
                        storeId,
                        useStoreCredit && availableStoreCredit > 0,
                    )
                    if (result.error) throw new Error(result.error)
                    invalidateCartCache()
                    sessionStorage.removeItem("checkout_session")

                    setPixPaymentData({
                        orderId: (result as any).orderId,
                        orderNumber: (result as any).orderNumber,
                        amount: checkoutTotalToCharge,
                        orderDetails: {
                            items: products.map(p => ({
                                id: p.id,
                                name: p.name,
                                price: p.price,
                                quantity: quantities[p.id] || p.quantity,
                                image: p.image || "",
                                variant_id: p.variant || ""
                            })),
                            deliveryType: formData.deliveryType,
                            deliveryAddress: formData.deliveryAddress,
                            notes: formData.notes,
                            couponCode: couponCode || null,
                            couponDiscount: couponDiscount,
                            deliveryFee: showDeliveryFeeRow && !isPickup ? deliveryFee : 0,
                            checkoutPricing: checkoutPricingSnapshot,
                        },
                        sellerName: sessionData?.partnerInfo?.store_name || "Loja",
                        useMercadoPago: false,
                        partnerId: partnerId,
                        userEmail: userEmail,
                        userName: userName,
                        payDepositOnly: payDepositOnly,
                        partnerPhone: checkoutContext?.partner.phone || null,
                        pixKey: checkoutContext?.partner.pixKey || null,
                        pixKeyType: checkoutContext?.partner.pixKeyType || null,
                    })
                    setShowPixModal(true)
                    setIsLoading(false)
                } else {
                    const result = await createOrderAction({
                        itemId: sessionData?.itemId || products[0]?.id || "",
                        itemType: sessionData?.itemType || "product",
                        quantity: quantities[products[0]?.id] || products[0]?.quantity || 1,
                        totalAmount: checkoutChargeTotal,
                        deliveryType: formData.deliveryType,
                        deliveryAddress: formData.deliveryAddress,
                        paymentMethod: formData.paymentMethod,
                        installments: formData.installments,
                        notes: formData.notes,
                        partnerId: partnerId,
                        csrf_token: token,
                        couponCode: couponCode || null,
                        wantsChange: wantsChange || false,
                        payWithAmount: payWithAmount || undefined,
                        checkoutPricingSnapshot,
                    })
                    if ('error' in result && result.error) throw new Error(result.error)
                    const successResult = result as any
                    sessionStorage.removeItem("checkout_session")

                    setPixPaymentData({
                        orderId: successResult.orderId,
                        orderNumber: successResult.orderNumber,
                        amount: checkoutTotalToCharge,
                        orderDetails: {
                            items: products.map(p => ({
                                id: p.id,
                                name: p.name,
                                price: p.price,
                                quantity: quantities[p.id] || p.quantity,
                                image: p.image || "",
                                variant_id: p.variant || ""
                            })),
                            deliveryType: formData.deliveryType,
                            deliveryAddress: formData.deliveryAddress,
                            notes: formData.notes,
                            couponCode: couponCode || null,
                            couponDiscount: couponDiscount,
                            deliveryFee: isPickup ? 0 : deliveryFee,
                            checkoutPricing: checkoutPricingSnapshot,
                        },
                        sellerName: sessionData?.partnerInfo?.store_name || "Loja",
                        useMercadoPago: false,
                        partnerId: partnerId,
                        userEmail: userEmail,
                        userName: userName,
                        payDepositOnly: payDepositOnly,
                        partnerPhone: checkoutContext?.partner.phone || null,
                        pixKey: checkoutContext?.partner.pixKey || null,
                        pixKeyType: checkoutContext?.partner.pixKeyType || null,
                    })
                    setShowPixModal(true)
                    setIsLoading(false)
                }
            }
        } catch (err: any) {
            const msg = err.message || "Erro ao processar pedido"
            const systemKeywords = ["rls", "database", "server", "banco", "tabela", "processar pedido", "conexão"]
            const isSystemError = systemKeywords.some(key => msg.toLowerCase().includes(key))

            if (isSystemError) {
                notifyError("Erro do Sistema", msg)
            } else if (msg.toLowerCase().includes("endereço") || msg.toLowerCase().includes("entrega")) {
                setDeliveryError(msg)
            } else if (msg.toLowerCase().includes("pagamento") || msg.toLowerCase().includes("cartão") || msg.toLowerCase().includes("pix")) {
                setPaymentError(msg)
            } else {
                notifyError("Erro", msg)
            }
            setIsLoading(false)
        }
    }

    useEffect(() => {
        if (bypassSubmitRef.current) {
            bypassSubmitRef.current = false
            void handleSubmit()
        }
    }, [payDepositOnly, paymentOption, formData.paymentMethod])

    const handleSelectIntegral = () => {
        bypassDepositModalRef.current = true
        setShowDepositChoiceModal(false)
        if (payDepositOnly) {
            bypassSubmitRef.current = true
            setPayDepositOnly(false)
        } else {
            void handleSubmit()
        }
    }

    const handleSelectDeposit = () => {
        bypassDepositModalRef.current = true
        setShowDepositChoiceModal(false)

        if (!checkoutContext?.deposit.mpEnabled || !checkoutContext?.partner?.mpConnected) {
            setPaymentError("Pagamento do sinal disponível somente via Mercado Pago.")
            return
        }

        bypassSubmitRef.current = true
        setPaymentOption("mercadopago")
        setPayDepositOnly(true)
    }

    if (pageLoading || !sessionData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white dark:bg-dark-surface">
                <Spinner size={32} />
            </div>
        )
    }

    return (
        <>
            <div className="min-h-screen flex flex-col bg-white dark:bg-dark-surface">
                {/* Desktop Header */}
                <header className="hidden lg:flex flex-col w-full bg-brand-dark dark:bg-dark-surface border-b border-white/10 sticky top-0 z-50 shadow-md">
                    <div className="w-full h-[68px] flex items-center justify-between max-w-[1400px] px-2 mx-auto gap-4">
                        <Link href="/" prefetch={true} className="cursor-pointer shrink-0 z-[110] pt-1">
                            <img
                                src="https://img.dudit.com.br/static/Logo.png"
                                alt="Dudit"
                                width={140}
                                height={40}
                                className="h-10 w-auto object-contain"
                            />
                        </Link>
                        <div className="flex items-center gap-2 text-sm font-medium text-white tracking-wide">
                            🔒 Pagamento seguro
                        </div>
                    </div>
                </header>

                {/* Mobile/Tablet Header */}
                <header className="flex lg:hidden items-center justify-between px-4 py-3 bg-brand-dark sticky top-0 z-50 shadow-md">
                    <button
                        type="button"
                        onClick={() => {
                            if (mobileStep === 2) {
                                setMobileStep(1)
                            } else {
                                router.back()
                            }
                        }}
                        className="text-white p-1 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <ChevronLeftIcon size={24} />
                    </button>
                    <div className="flex items-center gap-2 max-w-[200px] truncate">
                        <img
                            src={storeImage}
                            alt={sellerName}
                            className="w-8 h-8 rounded-full object-cover border border-white/20 bg-white"
                        />
                        <span className="font-bold text-white text-sm truncate">{sellerName}</span>
                    </div>
                    <div className="w-8" />
                </header>

                <div className="container mx-auto px-4 lg:px-6 max-w-[1400px] w-full pt-6 md:pt-10 pb-32 md:pb-20 flex-1">
                    {/* Page Title (hidden on mobile, shown on desktop) */}
                    <div className="hidden lg:flex mb-8 flex-col md:flex-row md:items-center gap-4 w-full justify-start">
                        <div className="hidden md:flex">
                            <Button variant="filled" onClick={() => router.back()} className="w-10 h-10 p-0 flex items-center justify-center shrink-0">
                                <XIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>
                        <div className="text-left w-full">
                            <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center">Finalizar Compra</h1>
                            <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">Conclua seu pedido informando os dados de entrega e pagamento.</p>
                        </div>
                    </div>

                    {/* Desktop Two-Column Layout */}
                    <div className="hidden lg:grid grid-cols-12 gap-8 items-start">
                        {/* Left Column (dados do pedido) */}
                        <div className="col-span-8 space-y-6 pr-6">
                            {contextError && (
                                <InfoCard message={contextError} color="red" />
                            )}
                            {contextLoading && (
                                <div className="py-8 flex justify-center">
                                    <Spinner />
                                </div>
                            )}
                            {requirements && (
                                <CheckoutFulfillmentPanel
                                    requirements={requirements}
                                    deliveryType={formData.deliveryType}
                                    onDeliveryTypeChange={(type) => {
                                        setFormData((prev) => ({ ...prev, deliveryType: type }))
                                        if (type === "pickup" && pickupPolicyFromContext === "require_online_payment") {
                                            if (partnerInfo.mpConnected) {
                                                setPaymentOption("mercadopago")
                                                setFormData(prev => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
                                            } else {
                                                setPaymentOption(null)
                                                setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
                                            }
                                        } else if (type === "pickup" && partnerInfo.mpConnected) {
                                            setPaymentOption("mercadopago")
                                        }
                                    }}
                                    deliveryPlanEnabled={deliveryPlanEnabled}
                                    deliveryEnabled={deliveryEnabled}
                                    pickupEnabled={pickupEnabled}
                                    partnerAddressLabel={partnerAddressLabel}
                                    deliveryError={deliveryError}
                                    schedulingLines={schedulingLines}
                                    lines={checkoutContext?.lines || []}
                                    onFulfillmentModeChange={handleFulfillmentModeChange}
                                    addressProps={{
                                        loadingAddresses,
                                        userAddresses,
                                        selectedAddress,
                                        onOpenModal: () => setShowAddressModal(true),
                                        onOpenForm: () => setShowAddressForm(true),
                                    }}
                                />
                            )}

                            {/* PAGAMENTO */}
                            <FormSection hasSeparator title="Pagamento">
                                <div className="space-y-6">
                                    {availableStoreCredit > 0 && (
                                        <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 space-y-3 transition-all">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                                                        <TagIcon size={20} />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                            Crédito em Loja
                                                        </div>
                                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                            Você possui <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(availableStoreCredit)}</strong> disponível nesta loja.
                                                        </div>
                                                    </div>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={useStoreCredit}
                                                        onChange={(e) => setUseStoreCredit(e.target.checked)}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-dark-border peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-600 peer-checked:bg-emerald-500"></div>
                                                </label>
                                            </div>
                                            {useStoreCredit && (
                                                <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-900/40 text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1.5">
                                                    <CheckCircleIcon size={14} className="shrink-0" />
                                                    {appliedStoreCredit >= checkoutTotalToCharge ? (
                                                        <span>Seu crédito cobre 100% do valor do pedido. Nenhuma cobrança adicional será feita.</span>
                                                    ) : (
                                                        <span>Serão abatidos {formatCurrency(appliedStoreCredit)}. Selecione como pagar o saldo restante ({formatCurrency(remainingBalanceToCharge)}) abaixo.</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {hasSubscriptionCreditsForCheckout && (
                                        <ListItem
                                            icon={CrownIcon}
                                            title="Assinatura (Créditos)"
                                            description={`Usar créditos do seu plano · ${userCredits.filter(c => (!c.expiresAt || new Date(c.expiresAt) > new Date()) && c.remainingCredits > 0).map(c => `${c.itemName}: ${c.remainingCredits}`).join(", ")}`}
                                            className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                            onClick={() => {
                                                setPaymentOption("subscription_credits")
                                                setFormData(prev => ({ ...prev, paymentMethod: "subscription_credits", installments: 1 }))
                                            }}
                                            right={
                                                <RadioButton
                                                    name="paymentOptionDesktop"
                                                    value="subscription_credits"
                                                    checked={paymentOption === "subscription_credits"}
                                                    onChange={() => {
                                                        setPaymentOption("subscription_credits")
                                                        setFormData(prev => ({ ...prev, paymentMethod: "subscription_credits", installments: 1 }))
                                                    }}
                                                />
                                            }
                                        />
                                    )}
                                    {!partnerInfo.mpConnected && !storefrontMethods.length ? (
                                        <div className="flex items-center gap-3 py-2">
                                            <MoneyIcon className="w-12 h-12 p-2.5 rounded-xl bg-brand-slate dark:bg-dark-border/50 text-brand-inactive-text dark:text-dark-body shrink-0" />
                                            <div>
                                                <p className="text-md font-bold text-brand-dark dark:text-dark-heading">A combinar</p>
                                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">O pagamento será combinado diretamente com o vendedor.</p>
                                            </div>
                                        </div>
                                    ) : partnerInfo.mpConnected && checkoutContext?.partner.orderFlow !== "whatsapp" ? (
                                        <>
                                            <div className="space-y-1 mb-4">
                                                <ListItem
                                                    icon={<img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain" />}
                                                    title="Mercado Pago"
                                                    description={(() => {
                                                        const mp = mpAcceptedPaymentMethods
                                                        const enabled = []
                                                        if (mp?.pix === true) enabled.push("Pix")
                                                        if (mp?.credit_card === true) enabled.push("Cartão")
                                                        if (mp?.boleto === true) enabled.push("Boleto")
                                                        if (mp?.mercado_pago_wallet === true) enabled.push("Saldo MP")
                                                        return (enabled.length > 0 ? enabled.join(", ") : "Pagamento online") + "."
                                                    })()}
                                                    className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                                    onClick={() => setPaymentOption("mercadopago")}
                                                    right={
                                                        <RadioButton
                                                            name="paymentOptionDesktop"
                                                            value="mercadopago"
                                                            checked={paymentOption === "mercadopago"}
                                                            onChange={() => setPaymentOption("mercadopago")}
                                                        />
                                                    }
                                                />
                                                {paymentOption === "mercadopago" && checkoutContext?.deposit.available && (
                                                    <div className="ml-8 mt-1 mb-3 p-3 bg-brand-slate/50 dark:bg-dark-border/20 rounded-xl border border-brand-border/40 dark:border-dark-border/40 space-y-2">
                                                        <span className="block text-xs font-bold text-brand-dark dark:text-dark-heading mb-1">Opção de pagamento online:</span>
                                                        <label className="flex items-center gap-2 text-sm text-brand-dark dark:text-dark-heading cursor-pointer">
                                                            <RadioButton
                                                                name="mpPayModeDesktop"
                                                                value="full"
                                                                checked={!payDepositOnly}
                                                                onChange={() => setPayDepositOnly(false)}
                                                            />
                                                            <span>Pagar valor integral ({formatCurrency(checkoutFullTotal)})</span>
                                                        </label>
                                                        <label className="flex items-center gap-2 text-sm text-brand-dark dark:text-dark-heading cursor-pointer">
                                                            <RadioButton
                                                                name="mpPayModeDesktop"
                                                                value="deposit"
                                                                checked={payDepositOnly}
                                                                onChange={() => setPayDepositOnly(true)}
                                                            />
                                                            <span>Pagar sinal / entrada ({formatCurrency(checkoutDepositChargeTotal)})</span>
                                                        </label>
                                                    </div>
                                                )}
                                                {showTraditionalPaymentOption && (
                                                    <ListItem
                                                        icon={MoneyIcon}
                                                        title={traditionalPaymentLabel}
                                                        description={
                                                            requirements?.hasPayOnService
                                                                ? "Reserve e combine o pagamento com a loja."
                                                                : "Pague na entrega ou retirada."
                                                        }
                                                        className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                                        onClick={() => setPaymentOption("traditional")}
                                                        right={
                                                            <RadioButton
                                                                name="paymentOptionDesktop"
                                                                value="traditional"
                                                                checked={paymentOption === "traditional"}
                                                                onChange={() => setPaymentOption("traditional")}
                                                            />
                                                        }
                                                    />
                                                )}
                                                {paymentOption === "traditional" && checkoutContext?.deposit.available && (
                                                    <div className="ml-8 mt-2">
                                                        <InfoCard
                                                            message={`Para confirmar seu agendamento, é necessário pagar o sinal de ${checkoutContext.deposit.percent}% (${formatCurrency(checkoutContext.deposit.previewAmount)}) via Pix na tela seguinte.`}
                                                            color="orange"
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            <AnimatePresence mode="wait">
                                                {paymentOption === "traditional" && (
                                                    <motion.div
                                                        key="traditional"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="mb-4"
                                                    >
                                                        {deliveryError ? (
                                                            <InfoCard message="Corrija o endereço de entrega ou selecione Retirada no local antes de escolher a forma de pagamento." color="red" />
                                                        ) : (
                                                            <>
                                                                {!formData.paymentMethod ? (
                                                                    <ListItem
                                                                        icon={MoneyIcon}
                                                                        title="Selecione o meio de pagamento"
                                                                        description="Clique para escolher como deseja pagar"
                                                                        className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                                                        right={
                                                                            <Button variant="link" onClick={() => {
                                                                                if (deliveryError) {
                                                                                    setShowOutsideRadiusModal(true)
                                                                                } else {
                                                                                    setShowPaymentModal(true)
                                                                                }
                                                                            }}>Selecionar</Button>
                                                                        }
                                                                    />
                                                                ) : (
                                                                    <ListItem
                                                                        icon={
                                                                            selectedStorefrontMethod?.type === "pix" ? <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-5 h-5 object-contain" /> :
                                                                                selectedStorefrontMethod?.type === "credit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/CreditCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                                                    selectedStorefrontMethod?.type === "debit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/DebitCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                                                        MoneyIcon
                                                                        }
                                                                        title={selectedStorefrontMethod ? (paymentTypeLabelMap[selectedStorefrontMethod.type] || selectedStorefrontMethod.type) : "Carregando..."}
                                                                        description={
                                                                            selectedStorefrontMethod?.type === "pix" ? "Pagamento instantâneo via Pix" :
                                                                                selectedStorefrontMethod?.type.includes("card") ? "Pagamento com maquininha" :
                                                                                    wantsChange ? `Dinheiro (Troco para R$ ${payWithAmount?.toFixed(2).replace('.', ',')})` :
                                                                                        wantsChange === false ? "Dinheiro (Valor exato)" : "Pagamento em dinheiro"
                                                                        }
                                                                        className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                                                        right={
                                                                            <Button variant="link" onClick={() => {
                                                                                if (deliveryError) {
                                                                                    setShowOutsideRadiusModal(true)
                                                                                } else {
                                                                                    setShowPaymentModal(true)
                                                                                }
                                                                            }}>Trocar</Button>
                                                                        }
                                                                    />
                                                                )}
                                                                {renderChangeSection()}
                                                                {selectedStorefrontMethod?.cardBrand && (
                                                                    <div className="mt-4">
                                                                        <span className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Bandeiras aceitas</span>
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {selectedStorefrontMethod.cardBrand.split(/[;,]/).map(b => {
                                                                                const brand = AVAILABLE_BRANDS.find(ab => ab.id === b.trim())
                                                                                if (!brand) return null
                                                                                return (
                                                                                    <div key={brand.id} className="flex items-center gap-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border px-3 py-1.5 rounded-lg">
                                                                                        <img src={brand.image} alt={brand.name} className="w-5 h-5 object-contain opacity-90" />
                                                                                        <span className="text-xs font-medium text-brand-dark dark:text-dark-heading">{brand.name}</span>
                                                                                    </div>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {shouldShowInstallments && (
                                                                    <div className="mt-6">
                                                                        <FormDropdown
                                                                            label="Parcelas"
                                                                            value={String(formData.installments)}
                                                                            setValue={(value) => setFormData((prev) => ({ ...prev, installments: Number(value) }))}
                                                                            options={
                                                                                paymentPreview?.installmentOptions ? paymentPreview.installmentOptions.map(opt => ({
                                                                                    value: String(opt.installments),
                                                                                    label: formatCheckoutInstallmentOptionLabel(opt)
                                                                                })) : Array.from({ length: Number(paymentPreview?.maxInstallments || 1) }, (_, index) => {
                                                                                    const installmentNumber = index + 1
                                                                                    const installmentAmount = paymentPreview?.installmentAmounts?.[index]
                                                                                    return {
                                                                                        value: String(installmentNumber),
                                                                                        label: `${installmentNumber}x${installmentAmount ? ` de ${formatCurrency(installmentAmount)}` : ""}`
                                                                                    }
                                                                                })
                                                                            }
                                                                        />
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex gap-3 mb-6">
                                                <div className="w-1 rounded-full bg-brand-border dark:bg-dark-border shrink-0" />
                                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Este vendedor aceita apenas pagamentos diretos (Entrega ou Retirada).</p>
                                            </div>
                                            <div className="mb-6">
                                                {!formData.paymentMethod ? (
                                                    <ListItem
                                                        icon={MoneyIcon}
                                                        title="Selecione o meio de pagamento"
                                                        description="Clique para escolher como deseja pagar"
                                                        className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                                        right={
                                                            <Button variant="link" onClick={() => setShowPaymentModal(true)}>Selecionar</Button>
                                                        }
                                                    />
                                                ) : (
                                                    <ListItem
                                                        icon={
                                                            selectedStorefrontMethod?.type === "pix" ? <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-5 h-5 object-contain" /> :
                                                                selectedStorefrontMethod?.type === "credit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/CreditCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                                    selectedStorefrontMethod?.type === "debit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/DebitCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                                        MoneyIcon
                                                        }
                                                        title={selectedStorefrontMethod ? (paymentTypeLabelMap[selectedStorefrontMethod.type] || selectedStorefrontMethod.type) : "Carregando..."}
                                                        description={
                                                            selectedStorefrontMethod?.type === "pix" ? "Pagamento instantâneo via Pix" :
                                                                selectedStorefrontMethod?.type.includes("card") ? "Pagamento com maquininha" :
                                                                    wantsChange ? `Dinheiro (Troco para R$ ${payWithAmount?.toFixed(2).replace('.', ',')})` :
                                                                        wantsChange === false ? "Dinheiro (Valor exato)" : "Pagamento em dinheiro"
                                                        }
                                                        className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                                        right={
                                                            <Button variant="link" onClick={() => setShowPaymentModal(true)}>Trocar</Button>
                                                        }
                                                    />
                                                )}
                                                {renderChangeSection()}
                                                {selectedStorefrontMethod?.cardBrand && (
                                                    <div className="mt-4">
                                                        <span className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Bandeiras aceitas</span>
                                                        <div className="flex flex-wrap gap-2">
                                                            {selectedStorefrontMethod.cardBrand.split(/[;,]/).map(b => {
                                                                const brand = AVAILABLE_BRANDS.find(ab => ab.id === b.trim())
                                                                if (!brand) return null
                                                                return (
                                                                    <div key={brand.id} className="flex items-center gap-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border px-3 py-1.5 rounded-lg">
                                                                        <img src={brand.image} alt={brand.name} className="w-5 h-5 object-contain opacity-90" />
                                                                        <span className="text-xs font-medium text-brand-dark dark:text-dark-heading">{brand.name}</span>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                                {shouldShowInstallments && (
                                                    <div className="mt-6">
                                                        <FormDropdown
                                                            label="Parcelas"
                                                            value={String(formData.installments)}
                                                            setValue={(value) => setFormData((prev) => ({ ...prev, installments: Number(value) }))}
                                                            options={
                                                                paymentPreview?.installmentOptions ? paymentPreview.installmentOptions.map(opt => ({
                                                                    value: String(opt.installments),
                                                                    label: formatCheckoutInstallmentOptionLabel(opt)
                                                                })) : Array.from({ length: Number(paymentPreview?.maxInstallments || 1) }, (_, index) => {
                                                                    const installmentNumber = index + 1
                                                                    const installmentAmount = paymentPreview?.installmentAmounts?.[index]
                                                                    return {
                                                                        value: String(installmentNumber),
                                                                        label: `${installmentNumber}x${installmentAmount ? ` de ${formatCurrency(installmentAmount)}` : ""}`
                                                                    }
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {paymentError && (
                                        <div className="flex gap-3 mt-4 w-full">
                                            <InfoCard message={`${paymentError}`} color="red" />
                                        </div>
                                    )}
                                </div>
                            </FormSection>

                            {/* OBSERVAÇÕES */}
                            <FormSection hasSeparator title="Observações">
                                <ListItem
                                    icon={FileTextIcon}
                                    title="Observações"
                                    description={formData.notes ? formData.notes : "Adicionar observações ao pedido"}
                                    className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                    onClick={() => setShowNotesModal(true)}
                                    right={
                                        <Button variant="link" onClick={() => setShowNotesModal(true)}>
                                            {formData.notes ? "Alterar" : "Adicionar"}
                                        </Button>
                                    }
                                />
                            </FormSection>
                        </div>

                        {/* Right Column (resumo + order bump) */}
                        <div className="col-span-4 pl-12 border-l border-brand-border dark:border-dark-border space-y-6">
                            {renderFreeDeliveryProgressCard()}
                            <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface">
                                <div className="text-md bg-brand-gray/50 dark:bg-emerald-900/10 px-6 py-4 border-b border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading">
                                    Resumo do Pedido
                                </div>
                                <div className="p-6">
                                    {renderSummaryContent(true)}
                                </div>
                            </div>


                        </div>
                    </div>

                    {/* Mobile/Tablet Stage Flow Layout */}
                    <div className="block lg:hidden space-y-6">
                        {mobileStep === 1 && showMobileFulfillmentStep && (
                            <div className="space-y-6 pb-24">
                                {contextError && <InfoCard message={contextError} color="red" />}
                                {contextLoading ? (
                                    <div className="py-8 flex justify-center">
                                        <Spinner />
                                    </div>
                                ) : requirements ? (
                                    <>
                                        <CheckoutFulfillmentPanel
                                            requirements={requirements}
                                            deliveryType={formData.deliveryType}
                                            onDeliveryTypeChange={(type) => {
                                                setFormData((prev) => ({ ...prev, deliveryType: type }))
                                                if (type === "pickup" && pickupPolicyFromContext === "require_online_payment") {
                                                    if (partnerInfo.mpConnected) {
                                                        setPaymentOption("mercadopago")
                                                        setFormData(prev => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
                                                    } else {
                                                        setPaymentOption(null)
                                                        setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
                                                    }
                                                } else if (type === "pickup" && partnerInfo.mpConnected) {
                                                    setPaymentOption("mercadopago")
                                                }
                                            }}
                                            deliveryPlanEnabled={deliveryPlanEnabled}
                                            deliveryEnabled={deliveryEnabled}
                                            pickupEnabled={pickupEnabled}
                                            partnerAddressLabel={partnerAddressLabel}
                                            deliveryError={deliveryError}
                                            schedulingLines={schedulingLines}
                                            lines={checkoutContext?.lines || []}
                                            onFulfillmentModeChange={handleFulfillmentModeChange}
                                            addressProps={{
                                                loadingAddresses,
                                                userAddresses,
                                                selectedAddress,
                                                onOpenModal: () => setShowAddressModal(true),
                                                onOpenForm: () => setShowAddressForm(true),
                                            }}
                                        />

                                    </>
                                ) : null}

                                <div className="fixed bottom-0 left-0 right-0 p-2 z-[100] flex gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => router.back()}
                                        disabled={isLoading}
                                        className="flex-1 h-12 bg-transparent"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => setMobileStep(2)}
                                        disabled={mobileStep1Blocked}
                                        className="flex-1 h-12"
                                    >
                                        Continuar
                                    </Button>
                                </div>
                            </div>
                        )}

                        {mobileStep === 2 && (
                            <div className="space-y-6 pb-28">
                                {renderFreeDeliveryProgressCard()}
                                {/* Payment Selector */}
                                <FormSection title="Forma de Pagamento">
                                    {!partnerInfo.mpConnected && !storefrontMethods.length ? (
                                        <div className="flex items-center gap-3 py-2">
                                            <MoneyIcon className="w-12 h-12 p-2.5 rounded-xl bg-brand-slate dark:bg-dark-border/50 text-brand-inactive-text dark:text-dark-body shrink-0" />
                                            <div>
                                                <p className="text-md font-bold text-brand-dark dark:text-dark-heading">A combinar</p>
                                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">O pagamento será combinado diretamente com o vendedor.</p>
                                            </div>
                                        </div>
                                    ) : partnerInfo.mpConnected && checkoutContext?.partner.orderFlow !== "whatsapp" ? (
                                        <div className="space-y-1">
                                            <ListItem
                                                icon={<img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain" />}
                                                title="Mercado Pago"
                                                description={(() => {
                                                    const mp = mpAcceptedPaymentMethods
                                                    const enabled = []
                                                    if (mp?.pix === true) enabled.push("Pix")
                                                    if (mp?.credit_card === true) enabled.push("Cartão")
                                                    if (mp?.boleto === true) enabled.push("Boleto")
                                                    if (mp?.mercado_pago_wallet === true) enabled.push("Saldo MP")
                                                    return (enabled.length > 0 ? enabled.join(", ") : "Pagamento online") + "."
                                                })()}
                                                className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                                                onClick={() => setPaymentOption("mercadopago")}
                                                right={
                                                    <RadioButton
                                                        name="paymentOptionMobile"
                                                        value="mercadopago"
                                                        checked={paymentOption === "mercadopago"}
                                                        onChange={() => setPaymentOption("mercadopago")}
                                                    />
                                                }
                                            />
                                            {paymentOption === "mercadopago" && checkoutContext?.deposit.available && (
                                                <div className="ml-8 mt-1 mb-3 p-3 bg-brand-slate/50 dark:bg-dark-border/20 rounded-xl border border-brand-border/40 dark:border-dark-border/40 space-y-2">
                                                    <span className="block text-xs font-bold text-brand-dark dark:text-dark-heading mb-1">Opção de pagamento online:</span>
                                                    <label className="flex items-center gap-2 text-sm text-brand-dark dark:text-dark-heading cursor-pointer">
                                                        <RadioButton
                                                            name="mpPayModeMobile"
                                                            value="full"
                                                            checked={!payDepositOnly}
                                                            onChange={() => setPayDepositOnly(false)}
                                                        />
                                                        <span>Valor integral ({formatCurrency(checkoutFullTotal)})</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 text-sm text-brand-dark dark:text-dark-heading cursor-pointer">
                                                        <RadioButton
                                                            name="mpPayModeMobile"
                                                            value="deposit"
                                                            checked={payDepositOnly}
                                                            onChange={() => setPayDepositOnly(true)}
                                                        />
                                                        <span>Sinal / entrada ({formatCurrency(checkoutDepositChargeTotal)})</span>
                                                    </label>
                                                </div>
                                            )}
                                            {showTraditionalPaymentOption && (
                                                <ListItem
                                                    icon={MoneyIcon}
                                                    title={traditionalPaymentLabel}
                                                    description={
                                                        requirements?.hasPayOnService
                                                            ? "Reserve e combine o pagamento com a loja."
                                                            : "Pague ao receber ou retirar."
                                                    }
                                                    className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                                                    onClick={() => setPaymentOption("traditional")}
                                                    right={
                                                        <RadioButton
                                                            name="paymentOptionMobile"
                                                            value="traditional"
                                                            checked={paymentOption === "traditional"}
                                                            onChange={() => setPaymentOption("traditional")}
                                                        />
                                                    }
                                                />
                                            )}
                                            {paymentOption === "traditional" && checkoutContext?.deposit.available && (
                                                <div className="ml-8 mt-2">
                                                    <InfoCard
                                                        message={`Para confirmar seu agendamento, é necessário pagar o sinal de ${checkoutContext.deposit.percent}% (${formatCurrency(checkoutContext.deposit.previewAmount)}) via Pix na tela seguinte.`}
                                                        color="orange"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex gap-2.5 pb-2">
                                            <div className="w-1 rounded-full bg-brand-border dark:bg-dark-border shrink-0" />
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                {requirements?.hasPayOnService
                                                    ? "Pagamento direto com o vendedor (reserva / pagar no atendimento)."
                                                    : "Pagamento direto com o vendedor."}
                                            </p>
                                        </div>
                                    )}

                                    {paymentOption === "traditional" && (
                                        <div className="mt-2 border-t border-brand-border/40 dark:border-dark-border/40 pt-2">
                                            <ListItem
                                                icon={
                                                    selectedStorefrontMethod?.type === "pix" ? <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-5 h-5 object-contain" /> :
                                                        selectedStorefrontMethod?.type === "credit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/CreditCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                            selectedStorefrontMethod?.type === "debit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/DebitCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                                MoneyIcon
                                                }
                                                title={formData.paymentMethod ? (selectedStorefrontMethod ? (paymentTypeLabelMap[selectedStorefrontMethod.type] || selectedStorefrontMethod.type) : "Carregando...") : "Escolher meio de pagamento"}
                                                description={
                                                    !formData.paymentMethod ? "Clique para selecionar" :
                                                        selectedStorefrontMethod?.type === "pix" ? "Pagamento instantâneo via Pix" :
                                                            selectedStorefrontMethod?.type.includes("card") ? "Pagamento com maquininha" :
                                                                wantsChange ? `Dinheiro (Troco para R$ ${payWithAmount?.toFixed(2).replace('.', ',')})` :
                                                                    wantsChange === false ? "Dinheiro (Valor exato)" : "Pagamento em dinheiro"
                                                }
                                                className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                                                right={
                                                    <Button variant="link" size="sm" onClick={() => setShowPaymentModal(true)}>
                                                        {formData.paymentMethod ? "Trocar" : "Selecionar"}
                                                    </Button>
                                                }
                                            />
                                            {renderChangeSection()}
                                            {selectedStorefrontMethod?.cardBrand && (
                                                <div className="mt-3">
                                                    <span className="block text-xs font-bold text-brand-dark dark:text-dark-heading mb-2">Bandeiras aceitas</span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {selectedStorefrontMethod.cardBrand.split(/[;,]/).map(b => {
                                                            const brand = AVAILABLE_BRANDS.find(ab => ab.id === b.trim())
                                                            if (!brand) return null
                                                            return (
                                                                <div key={brand.id} className="flex items-center gap-1.5 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border px-2 py-1 rounded-lg">
                                                                    <img src={brand.image} alt={brand.name} className="w-4 h-4 object-contain animate-fade-in" />
                                                                    <span className="text-[10px] font-medium text-brand-dark dark:text-dark-heading">{brand.name}</span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                            {shouldShowInstallments && (
                                                <div className="mt-4">
                                                    <FormDropdown
                                                        label="Parcelas"
                                                        value={String(formData.installments)}
                                                        setValue={(value) => setFormData((prev) => ({ ...prev, installments: Number(value) }))}
                                                        options={
                                                            paymentPreview?.installmentOptions ? paymentPreview.installmentOptions.map(opt => ({
                                                                value: String(opt.installments),
                                                                label: formatCheckoutInstallmentOptionLabel(opt)
                                                            })) : Array.from({ length: Number(paymentPreview?.maxInstallments || 1) }, (_, index) => {
                                                                const installmentNumber = index + 1
                                                                const installmentAmount = paymentPreview?.installmentAmounts?.[index]
                                                                return {
                                                                    value: String(installmentNumber),
                                                                    label: `${installmentNumber}x${installmentAmount ? ` de ${formatCurrency(installmentAmount)}` : ""}`
                                                                }
                                                            })
                                                        }
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {paymentOption === "subscription_credits" && (
                                        <div className="mt-2 border-t border-brand-border/40 dark:border-dark-border/40 pt-2">
                                            <ListItem
                                                icon={CrownIcon}
                                                title="Assinatura (Créditos)"
                                                description="Pagamento via créditos do seu plano"
                                                className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                                                right={
                                                    <Button variant="link" size="sm" onClick={() => setShowPaymentModal(true)}>
                                                        Trocar
                                                    </Button>
                                                }
                                            />
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {userCredits.filter(c => (!c.expiresAt || new Date(c.expiresAt) > new Date()) && c.remainingCredits > 0).map((c, idx) => (
                                                    <span key={idx} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                                        {c.itemName}: {c.remainingCredits} restante{c.remainingCredits > 1 ? "s" : ""}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {paymentError && (
                                        <div className="flex gap-3 mt-4 w-full">
                                            <InfoCard message={`${paymentError}`} color="red" />
                                        </div>
                                    )}
                                </FormSection>

                                {/* Coupon Selector */}
                                {(displayableCoupons.length > 0 || !!appliedCoupon || couponListLoading) && (
                                    <FormSection title="Cupom de Desconto" hasSeparator>
                                        <ListItem
                                            icon={TagIcon}
                                            title={appliedCoupon ? getCouponTitle(appliedCoupon) : "Escolha um cupom"}
                                            description={appliedCoupon ? "Cupom aplicado" : (couponListLoading ? "Verificando cupons disponíveis..." : getCouponCountLabel(displayableCoupons.length))}
                                            className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                                            onClick={() => {
                                                if (!couponListLoading && displayableCoupons.length > 0) {
                                                    setSelectedCouponId(appliedCoupon?.id || "")
                                                    setShowCouponModal(true)
                                                }
                                            }}
                                            showChevron={!couponListLoading && displayableCoupons.length > 0 && !appliedCoupon}
                                            right={
                                                appliedCoupon ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleRemoveCoupon()
                                                        }}
                                                        className="text-xs font-semibold text-brand-red hover:text-red-600 flex items-center gap-1 shrink-0"
                                                    >
                                                        <XIcon size={12} /> Remover
                                                    </button>
                                                ) : couponListLoading ? (
                                                    <Spinner size={16} />
                                                ) : undefined
                                            }
                                        />
                                        {couponError && (
                                            <p className="text-xs text-red-500 mt-1">{couponError}</p>
                                        )}
                                        {couponPartialWarning && appliedCoupon && (
                                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                                {appliedCoupon.eligibleItemsCount !== undefined && appliedCoupon.totalItemsCount !== undefined
                                                    ? `Desconto aplicado a ${appliedCoupon.eligibleItemsCount} de ${appliedCoupon.totalItemsCount} itens.`
                                                    : "Cupom elegível apenas para alguns itens da sacola."}
                                            </p>
                                        )}
                                    </FormSection>
                                )}

                                {/* Totals Summary */}
                                <FormSection title="Resumo dos Valores" hasSeparator>
                                    <div className="space-y-2 text-sm text-brand-inactive-text dark:text-dark-body">
                                        <div className="flex justify-between">
                                            <span>Subtotal</span>
                                            <span className="text-brand-dark dark:text-dark-heading">{formatCurrency(contextTotalSubtotal)}</span>
                                        </div>
                                        {couponDiscount > 0 && (
                                            <div className="flex justify-between text-brand-green font-semibold">
                                                <span>Desconto do cupom</span>
                                                <span>-{formatCurrency(couponDiscount)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between">
                                            <span>Entrega</span>
                                            <span className={(isPickup || (deliveryFee === 0 && (hasFreeDeliveryCoupon || !productDeliveryQuoteActive))) ? "text-brand-green font-semibold" : "text-brand-dark dark:text-dark-heading"}>
                                                {isPickup
                                                    ? "Grátis"
                                                    : deliveryQuoteLoading
                                                        ? "Calculando..."
                                                        : deliveryFee > 0
                                                            ? formatCurrency(deliveryFee)
                                                            : hasFreeDeliveryCoupon
                                                                ? "Grátis"
                                                                : !productDeliveryQuoteActive || deliveryError || !formData.deliveryAddress
                                                                    ? "A combinar"
                                                                    : "Grátis"
                                                }
                                            </span>
                                        </div>
                                        {paymentOption === "traditional" && paymentPreview?.success && Number(paymentPreview.paymentMethodDiscountAmount || 0) > 0 && (
                                            <div className="flex justify-between text-brand-green font-semibold">
                                                <span>Desconto do pagamento</span>
                                                <span>-{formatCurrency(paymentPreview.paymentMethodDiscountAmount)}</span>
                                            </div>
                                        )}
                                        {paymentOption === "traditional" && paymentPreview?.success && paymentPreview.feeBearer !== "merchant" && Number(paymentPreview.interestAmount || 0) > 0 && (
                                            <div className="flex justify-between">
                                                <span>Juros</span>
                                                <span className="text-brand-dark dark:text-dark-heading">+{formatCurrency(paymentPreview.interestAmount)}</span>
                                            </div>
                                        )}
                                        {paymentOption === "traditional" && paymentPreview?.success && paymentPreview.feeBearer !== "merchant" && Number(paymentPreview.feeAmount || 0) > 0 && (
                                            <div className="flex justify-between">
                                                <span>Taxas</span>
                                                <span className="text-brand-dark dark:text-dark-heading">+{formatCurrency(paymentPreview.feeAmount)}</span>
                                            </div>
                                        )}
                                        {paymentOption === "traditional" && paymentPreview?.success && paymentPreview.feeBearer !== "merchant" && Number(paymentPreview.fixedFeeAmount || 0) > 0 && (
                                            <div className="flex justify-between">
                                                <span>Custos do método</span>
                                                <span className="text-brand-dark dark:text-dark-heading">+{formatCurrency(paymentPreview.fixedFeeAmount)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-base font-bold text-brand-dark dark:text-dark-heading pt-2 border-t border-brand-border/20">
                                            <span>Total</span>
                                            <span>{formatCurrency(checkoutTotalToCharge)}</span>
                                        </div>
                                    </div>
                                </FormSection>

                                {/* Observations */}
                                <FormSection title="Observações" hasSeparator>
                                    <ListItem
                                        icon={FileTextIcon}
                                        title="Observações"
                                        description={formData.notes ? formData.notes : "Adicionar observações ao pedido"}
                                        className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                                        onClick={() => setShowNotesModal(true)}
                                        right={
                                            <Button variant="link" size="sm" onClick={() => setShowNotesModal(true)}>
                                                {formData.notes ? "Alterar" : "Adicionar"}
                                            </Button>
                                        }
                                    />
                                </FormSection>

                                {/* Fixed Bottom Bar Step 2 */}
                                <div className="fixed bg-white dark:bg-dark-surface bottom-0 left-0 right-0 p-2 z-[100] flex gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setMobileStep(1)}
                                        disabled={isLoading}
                                        className="flex-1 h-12 bg-transparent"
                                    >
                                        Voltar
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            if (!paymentOption || (paymentOption === "traditional" && !formData.paymentMethod)) {
                                                notifyError("Erro de Pagamento", "Por favor, selecione uma forma de pagamento.")
                                                return
                                            }
                                            setShowReviewModal(true)
                                        }}
                                        disabled={disableCheckoutSubmit}
                                        className="flex-1 h-12"
                                    >
                                        {checkoutContext?.partner?.orderFlow === "whatsapp"
                                            ? `Fazer pedido via WhatsApp • ${formatCurrency(checkoutTotalToCharge)}`
                                            : `Finalizar • ${formatCurrency(checkoutTotalToCharge)}`
                                        }
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="shrink-0 mt-auto pb-[80px] lg:pb-0">
                    <MarketplaceFooter />
                </div>
            </div>

            {/* Custom Modals */}

            {/* Observations Modal */}
            <DefaultModal
                isOpen={showNotesModal}
                onClose={() => setShowNotesModal(false)}
                title="Observações do pedido"
                maxWidth="sm"
                footer={
                    <>
                        <Button variant="outline" onClick={() => setShowNotesModal(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={() => setShowNotesModal(false)}>
                            Confirmar
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <FormTextarea
                        label=""
                        placeholder="Ex: Tocar interfone, embalar para presente, detalhes da entrega..."
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        name="notes"
                        rows={4}
                        maxLength={500}
                        showCharacterCount
                    />
                </div>
            </DefaultModal>

            {/* Mobile Review Modal (Stage 3) */}
            <DefaultModal
                isOpen={showReviewModal}
                onClose={() => setShowReviewModal(false)}
                title="Revise o seu pedido"
                maxWidth="md"
                footer={
                    <div className="flex w-full gap-3">
                        <Button
                            variant="outline"
                            onClick={() => setShowReviewModal(false)}
                            disabled={isLoading}
                            className="flex-1 h-12"
                        >
                            Alterar pedido
                        </Button>
                        <Button
                            onClick={(e) => {
                                handleSubmit(e as any)
                                setShowReviewModal(false)
                            }}
                            disabled={disableCheckoutSubmit}
                            className="flex-1 h-12"
                        >
                            {isLoading
                                ? "Processando..."
                                : checkoutContext?.partner?.orderFlow === "whatsapp"
                                    ? "Fazer pedido via WhatsApp"
                                    : "Fazer pedido"
                            }
                        </Button>
                    </div>
                }
            >
                <div className="space-y-6">
                    <div className="space-y-4">
                        {formData.deliveryType === "delivery" && selectedAddress ? (
                            <div className="flex items-center gap-3 p-0 border-none bg-transparent shadow-none">
                                <img
                                    src="https://img.dudit.com.br/static/Map.png"
                                    alt="Mapa"
                                    className="w-10 h-10 object-cover rounded-xl shrink-0"
                                />
                                <div className="flex flex-col min-w-0">
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                        {selectedAddress.street}, {selectedAddress.number}
                                    </p>
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                        {selectedAddress.neighborhood} - {selectedAddress.city}/{selectedAddress.state}
                                    </p>
                                </div>
                            </div>
                        ) : formData.deliveryType === "pickup" ? (
                            <div className="flex items-start gap-3 p-0 border-none bg-transparent shadow-none">
                                <img
                                    src="https://img.dudit.com.br/static/Map.png"
                                    alt="Mapa"
                                    className="w-10 h-10 object-cover rounded-xl shrink-0"
                                />
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Local de Retirada</p>
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body whitespace-pre-line leading-snug">
                                        {formatPartnerAddress(partnerInfo.address)}
                                    </p>
                                    {preparationEstimate && (preparationEstimate.preparationTimeMinutes > 0 || preparationEstimate.readyAt.getTime() > preparationEstimate.now.getTime()) && (
                                        <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-1.5 font-medium">
                                            {getReadyDayLabel(preparationEstimate) === "hoje"
                                                ? `Pronto em ${preparationEstimate.readyInMinutes} min`
                                                : `Pronto ${getReadyDayLabel(preparationEstimate)} a partir das ${pickupStartLabel}`
                                            } • Retirar das {pickupStartLabel} às {pickupEndLabel}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-brand-inactive-text dark:text-dark-body">Endereço não selecionado</div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <ListItem
                            icon={
                                paymentOption === "mercadopago" ? <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain" /> :
                                    selectedStorefrontMethod?.type === "pix" ? <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-5 h-5 object-contain" /> :
                                        selectedStorefrontMethod?.type === "credit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/CreditCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                            selectedStorefrontMethod?.type === "debit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/DebitCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                MoneyIcon
                            }
                            title={paymentOption === "mercadopago" ? "Mercado Pago" : selectedStorefrontMethod ? (paymentTypeLabelMap[selectedStorefrontMethod.type] || selectedStorefrontMethod.type) : "Carregando..."}
                            description={
                                paymentOption === "mercadopago" ? (() => {
                                    const mp = mpAcceptedPaymentMethods
                                    const enabled = []
                                    if (mp?.pix === true) enabled.push("Pix")
                                    if (mp?.credit_card === true) enabled.push("Cartão")
                                    if (mp?.boleto === true) enabled.push("Boleto")
                                    if (mp?.mercado_pago_wallet === true) enabled.push("Saldo MP")
                                    return enabled.length > 0 ? enabled.join(", ") : "Pagamento online"
                                })() :
                                    selectedStorefrontMethod?.type === "pix" ? "Pagamento instantâneo via Pix" :
                                        selectedStorefrontMethod?.type.includes("card") ? `${formData.installments}x no Cartão` :
                                            wantsChange ? `Dinheiro (Troco para R$ ${payWithAmount?.toFixed(2).replace('.', ',')})` :
                                                wantsChange === false ? "Dinheiro (Valor exato)" : "Pagamento em dinheiro"
                            }
                            className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                            right={
                                <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(checkoutTotalToCharge)}</span>
                            }
                        />
                    </div>

                    {appliedCoupon && (
                        <div className="space-y-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body">Cupom Aplicado</p>
                            <ListItem
                                icon={TagIcon}
                                title={getCouponTitle(appliedCoupon)}
                                description="Desconto concedido"
                                className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                            />
                        </div>
                    )}
                </div>
            </DefaultModal>

            {/* Restored Custom Modals */}
            <DefaultModal
                isOpen={showCouponModal}
                onClose={() => setShowCouponModal(false)}
                title="Escolha um cupom"
                maxWidth="lg"
                footer={
                    <>
                        <Button variant="outline" onClick={() => setShowCouponModal(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleApplySelectedCoupon}
                            disabled={!selectedCouponId || availableCoupons.find(c => c.id === selectedCouponId)?.blocked}
                        >
                            Aplicar
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    {displayableCoupons.length > 0 ? (
                        displayableCoupons.map((coupon) => (
                            <ListItem
                                icon={TagIcon}
                                key={coupon.id}
                                title={getCouponTitle(coupon)}
                                description={
                                    coupon.blocked
                                        ? "Não aplicável aos itens atuais do pedido."
                                        : `${getCouponSubtitle(coupon)}${coupon.partialApplicabilityWarning ? " • Válido apenas para alguns itens do pedido." : " • Aplicável a todo o pedido."}`
                                }
                                className={`px-4 py-3 gap-4 border rounded-xl ${coupon.blocked
                                    ? "opacity-50 cursor-not-allowed border-brand-border dark:border-dark-border"
                                    : selectedCouponId === coupon.id
                                        ? "border-brand-green bg-green-50/30 dark:bg-green-900/10 cursor-pointer"
                                        : "border-brand-border dark:border-dark-border cursor-pointer"
                                    }`}
                                onClick={() => {
                                    if (!coupon.blocked) {
                                        setSelectedCouponId(coupon.id)
                                    }
                                }}
                                right={
                                    coupon.blocked ? (
                                        <LockIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body mr-1" />
                                    ) : (
                                        <RadioButton
                                            name="marketplace-coupon"
                                            value={coupon.id}
                                            checked={selectedCouponId === coupon.id}
                                            onChange={() => {
                                                setSelectedCouponId(coupon.id)
                                            }}
                                        />
                                    )
                                }
                            />
                        ))
                    ) : (
                        <InfoCard message="Nenhum cupom disponível para este pedido no momento." />
                    )}
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={showAddressForm}
                onClose={() => setShowAddressForm(false)}
                title="Adicionar novo endereço"
            >
                <div className="flex flex-col gap-4">
                    <div onBlur={handleCepBlur}>
                        <CepInput
                            value={newAddressData.zipCode}
                            onChange={(val) => setNewAddressData({ ...newAddressData, zipCode: val })}
                            disabled={loadingCep}
                        />
                    </div>
                    <div>
                        <Input
                            label="Rua/Avenida"
                            value={newAddressData.street}
                            onChange={(e) => setNewAddressData({ ...newAddressData, street: e.target.value })}
                            placeholder="Rua, Avenida, etc."
                            disabled={loadingCep}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <NumberInputWithCheckbox
                                label="Número"
                                number={newAddressData.number}
                                noNumber={newAddressData.noNumber}
                                onNumberChange={(val) => setNewAddressData({ ...newAddressData, number: val })}
                                onNoNumberChange={(checked) => setNewAddressData({ ...newAddressData, noNumber: checked, number: checked ? "S/N" : "" })}
                                placeholder="123"
                            />
                        </div>
                        <div>
                            <Input
                                label="Complemento"
                                value={newAddressData.complement}
                                onChange={(e) => setNewAddressData({ ...newAddressData, complement: e.target.value })}
                                placeholder="Apto, Bloco, etc."
                            />
                        </div>
                    </div>
                    <div>
                        <Input
                            label="Bairro"
                            value={newAddressData.neighborhood}
                            onChange={(e) => setNewAddressData({ ...newAddressData, neighborhood: e.target.value })}
                            disabled={loadingCep}
                            placeholder="Nome do bairro"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Input
                                label="Cidade"
                                value={newAddressData.city}
                                onChange={(e) => setNewAddressData({ ...newAddressData, city: e.target.value })}
                                disabled={loadingCep}
                                placeholder="Nome da cidade"
                            />
                        </div>
                        <div>
                            <StateComboBox
                                value={newAddressData.state}
                                onChange={(val) => setNewAddressData({ ...newAddressData, state: val })}
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleSaveNewAddress}
                        disabled={isLoading || loadingCep}
                        className="w-full mb-4"
                    >
                        {isLoading ? <Spinner className="mr-2" size={16} /> : null}
                        Salvar Endereço
                    </Button>
                </div>
            </DefaultModal>

            {pixPaymentData && (
                <PaymentWrapper
                    open={showPixModal}
                    onClose={() => { setShowPixModal(false); setPixPaymentData(null) }}
                    pixData={pixPaymentData.pixData}
                    orderId={pixPaymentData.orderId}
                    amount={pixPaymentData.amount}
                    orderDetails={pixPaymentData.orderDetails}
                    orderNumber={pixPaymentData.orderId}
                    sellerName={partnerInfo.storeName || partnerInfo.store_name}
                    useMercadoPago={pixPaymentData.useMercadoPago}
                    partnerId={pixPaymentData.partnerId}
                    mpPublicKey={pixPaymentData.mpPublicKey}
                    userEmail={pixPaymentData.userEmail}
                    userName={pixPaymentData.userName}
                    buyerId={userId!}
                    mpAcceptedPaymentMethods={mpAcceptedPaymentMethods}
                />
            )}

            <DefaultModal
                isOpen={showDepositChoiceModal && !!checkoutContext?.deposit}
                onClose={() => setShowDepositChoiceModal(false)}
                title="Escolha como deseja pagar"
                maxWidth="md"
            >
                <div className="space-y-6 py-2">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        Este estabelecimento permite pagar um sinal/entrada para confirmar o seu agendamento, restando o valor restante para ser pago presencialmente.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Option Sinal */}
                        <div
                            onClick={handleSelectDeposit}
                            className="cursor-pointer group flex flex-col justify-between p-5 rounded-2xl border-2 border-brand-green bg-brand-green/5 dark:bg-brand-green/10 hover:bg-brand-green/10 dark:hover:bg-brand-green/20 transition-all shadow-sm"
                        >
                            <div>
                                <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-green bg-brand-green/10 dark:bg-brand-green/20 rounded-full mb-3">
                                    Recomendado
                                </span>
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1">
                                    Pagar Sinal / Entrada
                                </h3>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">
                                    Pague apenas uma porcentagem agora para garantir sua reserva.
                                </p>
                            </div>
                            <div className="mt-4 pt-4 border-t border-brand-border/40 dark:border-dark-border/40">
                                <div className="flex justify-between items-baseline mb-1">
                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body">Pagar agora:</span>
                                    <span className="text-xl font-black text-brand-green">
                                        {formatCurrency(checkoutDepositChargeTotal || checkoutChargeTotal)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-baseline">
                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body">Saldo restante:</span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(checkoutAmounts?.remainingAfterDeposit ?? Math.max(0, checkoutFullTotal - checkoutDepositChargeTotal))}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Option Integral */}
                        <div
                            onClick={handleSelectIntegral}
                            className="cursor-pointer group flex flex-col justify-between p-5 rounded-2xl border-2 border-brand-border dark:border-dark-border hover:border-brand-dark dark:hover:border-dark-heading bg-transparent hover:bg-brand-slate/50 dark:hover:bg-dark-border/10 transition-all shadow-sm"
                        >
                            <div>
                                <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-inactive-text bg-brand-slate/80 dark:bg-dark-border/40 rounded-full mb-3">
                                    Integral
                                </span>
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1">
                                    Pagamento Integral
                                </h3>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">
                                    Pague o valor total do pedido agora e evite cobranças adicionais depois.
                                </p>
                            </div>
                            <div className="mt-4 pt-4 border-t border-brand-border/40 dark:border-dark-border/40">
                                <div className="flex justify-between items-baseline mb-1">
                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body">Pagar agora:</span>
                                    <span className="text-xl font-black text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(checkoutFullTotal || checkoutChargeTotal)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-baseline">
                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body">Pagar no atendimento:</span>
                                    <span className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body">R$ 0,00</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={showAddressModal}
                onClose={() => setShowAddressModal(false)}
                title="Seus Endereços"
                maxWidth="md"
            >
                <div className="space-y-3 pb-4">
                    {userAddresses.map((address) => (
                        <div
                            key={address.id}
                            onClick={() => {
                                handleAddressSelect(address.id)
                                setShowAddressModal(false)
                            }}
                            className={`flex items-start border py-4 rounded-xl transition-all cursor-pointer ${selectedAddressId === address.id
                                ? "border-brand-green bg-green-50/30 dark:bg-green-900/10"
                                : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                                }`}
                        >
                            <div className="mt-2.5 shrink-0 px-4">
                                <RadioButton
                                    name="addressSelect"
                                    value={address.id}
                                    checked={selectedAddressId === address.id}
                                    onChange={() => {
                                        handleAddressSelect(address.id)
                                        setShowAddressModal(false)
                                    }}
                                />
                            </div>
                            <div className="flex-1 pr-4">
                                <p className="font-bold text-sm text-brand-dark dark:text-dark-heading">{address.street}, {address.number}</p>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">{address.neighborhood} - {address.city}/{address.state}</p>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">CEP: {address.zip_code}</p>
                            </div>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => {
                            setShowAddressModal(false)
                            setShowAddressForm(true)
                        }}
                        className="w-full py-3 border border-dashed border-brand-border dark:border-dark-border rounded-xl text-sm font-medium text-brand-dark dark:text-dark-heading transition-colors flex items-center justify-center gap-2 mt-4"
                    >
                        <PlusIcon size={16} /> Adicionar outro endereço
                    </button>
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                title="Meio de Pagamento"
                maxWidth="md"
            >
                <div className="pb-4">
                    {(() => {
                        const pickupPolicy = checkoutContext?.partner?.pickupPaymentPolicy || "require_online_payment"
                        const canPayUponPickup = isPickup && pickupPolicy === "allow_pickup_payment"
                        const mustPayOnline = isPickup && pickupPolicy === "require_online_payment"
                        const showTraditionalTab = !isPickup || canPayUponPickup
                        const showMercadoPagoTab = partnerInfo.mpConnected
                        const hasAnyPaymentMethod = showMercadoPagoTab || storefrontMethods.length > 0

                        if (!hasAnyPaymentMethod) {
                            return (
                                <div className="p-6 text-center">
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                        O pagamento será combinado diretamente com o vendedor.
                                    </p>
                                </div>
                            )
                        }

                        if (mustPayOnline && !partnerInfo.mpConnected) {
                            return (
                                <div className="p-6 text-center">
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                        Retirada requer uma integração de pagamento online ativa.
                                    </p>
                                </div>
                            )
                        }

                        const traditionalTabLabel = canPayUponPickup ? "Pagar na Retirada" : "Pagar na Entrega"

                        return (
                            <Tabs defaultValue={paymentOption || (hasSubscriptionCreditsForCheckout ? "subscription_credits" : showMercadoPagoTab ? "mercadopago" : "traditional")} onValueChange={(val) => setPaymentOption(val as "traditional" | "mercadopago" | "subscription_credits")}>
                                {(showMercadoPagoTab || showTraditionalTab || hasSubscriptionCreditsForCheckout) ? (
                                    <TabsList className="mb-4">
                                        {hasSubscriptionCreditsForCheckout && <TabsTrigger value="subscription_credits">Usar Créditos</TabsTrigger>}
                                        {showMercadoPagoTab && <TabsTrigger value="mercadopago">Pagar Online</TabsTrigger>}
                                        {showTraditionalTab && <TabsTrigger value="traditional">{traditionalTabLabel}</TabsTrigger>}
                                    </TabsList>
                                ) : null}

                                {showMercadoPagoTab && (
                                    <TabsContent value="mercadopago" className="pt-2">
                                        <div
                                            onClick={() => {
                                                setPaymentOption("mercadopago")
                                                setFormData(prev => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
                                                setShowPaymentModal(false)
                                            }}
                                            className={`group rounded-2xl border p-4 transition-all cursor-pointer flex items-center gap-3 ${formData.paymentMethod === "mercadopago" ? "border-brand-green bg-green-50/30 dark:bg-green-900/10" : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-brand-dark/30 dark:hover:border-brand-gray/30"}`}
                                        >
                                            <div className="w-12 h-12 rounded-full bg-brand-slate dark:bg-dark-border/50 flex border border-brand-border dark:border-dark-border items-center justify-center shrink-0">
                                                <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading truncate">Mercado Pago</h3>
                                                <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-tight truncate">{(() => {
                                                    const mp = mpAcceptedPaymentMethods
                                                    const enabled = []
                                                    if (mp?.pix === true) enabled.push("Pix")
                                                    if (mp?.credit_card === true) enabled.push("Cartão")
                                                    if (mp?.boleto === true) enabled.push("Boleto")
                                                    if (mp?.mercado_pago_wallet === true) enabled.push("Saldo MP")
                                                    return enabled.length > 0 ? enabled.join(", ") : "Pagamento online"
                                                })()}</p>
                                            </div>
                                            <div className="shrink-0 ml-4">
                                                <RadioButton
                                                    name="paymentSelect"
                                                    value="mercadopago"
                                                    checked={formData.paymentMethod === "mercadopago"}
                                                    onChange={() => {
                                                        setPaymentOption("mercadopago")
                                                        setFormData(prev => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
                                                        setShowPaymentModal(false)
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </TabsContent>
                                )}

                                <TabsContent value="traditional" className="pt-2">
                                    <div className="space-y-3">
                                        {storefrontMethods.map((m) => {
                                            const icon = m.type === "pix" ? <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-5 h-5 object-contain" /> :
                                                m.type === "credit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/CreditCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                    m.type === "debit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/DebitCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                        <MoneyIcon className="text-brand-dark dark:text-dark-heading" />;

                                            const description = m.type === "pix" ? "Pagamento instantâneo via Pix" : m.type.includes("card") ? "Pagamento com maquininha" : "Pagamento em dinheiro";

                                            return (
                                                <div
                                                    key={m.id}
                                                    onClick={() => {
                                                        setPaymentOption("traditional")
                                                        setFormData(prev => ({ ...prev, paymentMethod: m.id, installments: 1 }))
                                                        setShowPaymentModal(false)
                                                        if (m.type === "cash" && !isPickup && wantsChange === null) {
                                                            setTempWantsChange(null)
                                                            setTempPayWithAmount("")
                                                            setShowChangeModal(true)
                                                        }
                                                    }}
                                                    className={`group rounded-2xl border transition-all cursor-pointer overflow-hidden ${formData.paymentMethod === m.id
                                                        ? "border-brand-green bg-green-50/30 dark:bg-green-900/10"
                                                        : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-brand-dark/30 dark:hover:border-brand-gray/30"
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3 p-4">
                                                        <div className="w-12 h-12 rounded-full bg-brand-slate dark:bg-dark-border/50 flex border border-brand-border dark:border-dark-border items-center justify-center shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-dark-border/90 transition-colors">
                                                            {icon}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading truncate">{paymentTypeLabelMap[m.type] || m.type}</h3>
                                                            <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-tight truncate">{description}</p>
                                                        </div>
                                                        <div className="shrink-0 ml-4">
                                                            <RadioButton
                                                                name="paymentSelect"
                                                                value={m.id}
                                                                checked={formData.paymentMethod === m.id}
                                                                onChange={() => {
                                                                    setPaymentOption("traditional")
                                                                    setFormData(prev => ({ ...prev, paymentMethod: m.id, installments: 1 }))
                                                                    setShowPaymentModal(false)
                                                                    if (m.type === "cash" && !isPickup && wantsChange === null) {
                                                                        setTempWantsChange(null)
                                                                        setTempPayWithAmount("")
                                                                        setShowChangeModal(true)
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    {m.type.includes("card") && m.cardBrand && (
                                                        <>
                                                            <Separator className="mx-4 my-0" />
                                                            <div className="px-4 py-3 flex flex-wrap gap-2">
                                                                {m.cardBrand.split(/[;,]/).map(b => {
                                                                    const brand = AVAILABLE_BRANDS.find(ab => ab.id === b.trim())
                                                                    if (!brand) return null
                                                                    return (
                                                                        <div key={brand.id} className="flex items-center justify-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border px-2 py-1 rounded-md">
                                                                            <img src={brand.image} alt={brand.name} className="h-4 w-auto object-contain opacity-90" />
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </TabsContent>

                                {hasSubscriptionCreditsForCheckout && (
                                    <TabsContent value="subscription_credits" className="pt-2">
                                        <div
                                            onClick={() => {
                                                setPaymentOption("subscription_credits")
                                                setFormData(prev => ({ ...prev, paymentMethod: "subscription_credits", installments: 1 }))
                                                setShowPaymentModal(false)
                                            }}
                                            className={`group rounded-2xl border p-4 transition-all cursor-pointer flex items-center gap-3 ${formData.paymentMethod === "subscription_credits" ? "border-amber-500 bg-amber-50/30 dark:bg-amber-900/10" : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-amber-400/50 dark:hover:border-amber-600/30"}`}
                                        >
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/30 flex border border-amber-300 dark:border-amber-700 items-center justify-center shrink-0">
                                                <CrownIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading truncate">Assinatura (Créditos)</h3>
                                                <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-tight truncate">Usar créditos do seu plano</p>
                                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                    {userCredits.filter(c => (!c.expiresAt || new Date(c.expiresAt) > new Date()) && c.remainingCredits > 0).map((c, idx) => (
                                                        <span key={idx} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                                            {c.itemName}: {c.remainingCredits} restante{c.remainingCredits > 1 ? 's' : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="shrink-0 ml-4">
                                                <RadioButton
                                                    name="paymentSelect"
                                                    value="subscription_credits"
                                                    checked={formData.paymentMethod === "subscription_credits"}
                                                    onChange={() => {
                                                        setPaymentOption("subscription_credits")
                                                        setFormData(prev => ({ ...prev, paymentMethod: "subscription_credits", installments: 1 }))
                                                        setShowPaymentModal(false)
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </TabsContent>
                                )}
                            </Tabs>
                        )
                    })()}
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={showOutsideRadiusModal}
                onClose={() => setShowOutsideRadiusModal(false)}
                title="Entrega Indisponível"
                maxWidth="sm"
            >
                <div className="flex flex-col items-center justify-center text-center p-4 pt-0">
                    <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
                        <MapPinIcon size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">
                        {partnerInfo.storeName || partnerInfo.store_name || "Este parceiro"} não entrega no endereço selecionado
                    </h3>
                    <p className="text-brand-inactive-text dark:text-dark-body mb-6">
                        Você gostaria de encontrar outro lugar que entregue neste endereço?
                    </p>
                    <div className="flex w-full gap-3">
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => setShowOutsideRadiusModal(false)}
                        >
                            Não
                        </Button>
                        <Button
                            className="flex-1"
                            onClick={() => router.push("/")}
                        >
                            Sim
                        </Button>
                    </div>
                </div>
            </DefaultModal>

            {/* New Cash Change Modal */}
            <DefaultModal
                isOpen={showChangeModal}
                onClose={() => setShowChangeModal(false)}
                title="Precisa de troco?"
                maxWidth="sm"
                footer={
                    <>
                        <Button type="button" variant="outline" onClick={() => setShowChangeModal(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                setWantsChange(tempWantsChange)
                                if (tempWantsChange === true) {
                                    setPayWithAmount(Number(tempPayWithAmount))
                                } else {
                                    setPayWithAmount(null)
                                }
                                setShowChangeModal(false)
                            }}
                            disabled={tempWantsChange === null || (tempWantsChange === true && (!tempPayWithAmount || Number(tempPayWithAmount) < checkoutTotalToCharge || isNaN(Number(tempPayWithAmount))))}
                        >
                            Confirmar
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-3">
                        <ListItem
                            title="Não preciso de troco"
                            description="Vou pagar com o valor exato"
                            className={`px-4 py-3 gap-4 border rounded-xl cursor-pointer ${tempWantsChange === false ? "border-brand-green bg-green-50/30 dark:bg-green-900/10" : "border-brand-border dark:border-dark-border"}`}
                            onClick={() => setTempWantsChange(false)}
                            right={
                                <RadioButton
                                    name="changeOption"
                                    value="no_change"
                                    checked={tempWantsChange === false}
                                    onChange={() => setTempWantsChange(false)}
                                />
                            }
                        />
                        <ListItem
                            title="Sim, preciso de troco"
                            description="Vou precisar de troco para outro valor"
                            className={`px-4 py-3 gap-4 border rounded-xl cursor-pointer ${tempWantsChange === true ? "border-brand-green bg-green-50/30 dark:bg-green-900/10" : "border-brand-border dark:border-dark-border"}`}
                            onClick={() => setTempWantsChange(true)}
                            right={
                                <RadioButton
                                    name="changeOption"
                                    value="needs_change"
                                    checked={tempWantsChange === true}
                                    onChange={() => setTempWantsChange(true)}
                                />
                            }
                        />
                    </div>

                    {tempWantsChange === true && (
                        <div className="mt-4 space-y-3 border-t border-brand-border/40 dark:border-dark-border/40 pt-4">
                            <MoneyInput
                                prefix="R$"
                                value={tempPayWithAmount}
                                onChange={(val) => setTempPayWithAmount(val ? String(val) : "")}
                                placeholder="Ex: 50,00"
                                className="w-full"
                            />
                            {tempPayWithAmount && !isNaN(Number(tempPayWithAmount)) && (
                                <div className="text-xs space-y-1">
                                    {Number(tempPayWithAmount) >= checkoutTotalToCharge ? (
                                        <p className="text-brand-inactive-text dark:text-dark-body">
                                            Troco estimado: <span className="text-brand-green font-bold">{formatCurrency(Number(tempPayWithAmount) - checkoutTotalToCharge)}</span>
                                        </p>
                                    ) : (
                                        <p className="text-red-500 font-semibold">
                                            O valor pago não pode ser menor que o total do pedido ({formatCurrency(checkoutTotalToCharge)})
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </DefaultModal>
        </>
    )
}
