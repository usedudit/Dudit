"use client"

import type React from "react"
import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MapPinIcon, PlusIcon, XIcon, MoneyIcon, TagIcon, InfoIcon, FileTextIcon, ChevronLeftIcon, ChevronRightIcon, CheckCircleIcon, LockIcon, CrownIcon, TruckIcon, PackageIcon, WhatsappIcon } from "@/lib/icons"
import { Button, Spinner, DefaultModal, CepInput, StateComboBox, RadioButton, ListItem, InfoCard, Separator, Badge, Tooltip, FormDropdown, NumberInputWithCheckbox, FormSection, MoneyInput, Tabs, TabsList, TabsTrigger, TabsContent, FormTextarea, Checkbox } from "@/components/reusable"
import { useNotification } from "@/hooks/use-notification"
import { Input } from "@/components/reusable"
import { getAddressesAction, createAddressAction, setDefaultAddressAction } from "@/app/actions/shared/addresses"
import { useSupabase } from "@/providers/supabase-provider"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import Link from "next/link"
import { getServiceUrl } from "@/lib/utils/url-generator"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatDeliveryDaysRange } from "@/lib/utils"
import { listApplicableMarketplaceCouponsAction, validateMarketplaceCouponAction } from "@/app/actions/shared/coupons"
import { useRouter } from "next/navigation"
import { PaymentWrapper } from "@/components/PaymentWrapper"
import { checkoutCartAction, bulkUpdateFulfillmentModesAction, deleteCartItemsAction, type MarketplaceCheckoutDestinationAddress } from "@/app/actions/marketplace/cart"
import { prepareProductBuyNowCheckoutAction, addBumpProductToCartAction } from "@/app/actions/marketplace/cart-extensions"
import { createOrderAction } from "@/app/actions/marketplace/orders"
import { trackEvent } from "@/lib/analytics"
import { useCSRFToken, fetchCSRFTokenSingleton } from "@/hooks/use-csrf-token"
import { previewMarketplacePaymentAction } from "@/app/actions/marketplace/payment-preview"
import { invalidateCartCache } from "@/hooks/use-cart"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { hasDeliveryRatesConfigured } from "@/lib/delivery/fee"
import { notifyAddressUpdated, useAddressSync, DUDIT_ACTIVE_ADDRESS_STORAGE_KEY } from "@/lib/utils/address-sync"
import type { StorefrontPaymentMethod } from "@/app/actions/marketplace/storefront-payment-methods"
import type { MpAcceptedPaymentMethods } from "@/app/actions/mercadopago"
import { useMarketplaceCheckoutContext } from "@/hooks/use-marketplace-checkout-context"
import { validateMarketplaceCheckoutPayment } from "@/lib/commerce/validate-marketplace-checkout-payment"
import { CheckoutFulfillmentPanel } from "@/components/marketplace/checkout/CheckoutFulfillmentPanel"
import { CheckoutErrorScreen } from "@/components/marketplace/checkout/CheckoutErrorScreen"
import BottomSheet from "@/components/BottomSheet"
import { getCarrierBrandIcon } from "@/lib/utils/carrier-brand"
import type { CheckoutRequirements } from "@/lib/commerce/checkout-requirements"
import { validateServiceBookingAvailabilityAction } from "@/app/actions/marketplace/services"
import { getMarketplaceCheckoutAmountsAction } from "@/app/actions/marketplace/checkout-amounts"
import { quoteCarrierFreightAction } from "@/app/actions/marketplace/carrier-shipping"
import { extractPostalCodeFromAddress } from "@/lib/services/shipping/postal-code"
import type { CarrierFreightOption } from "@/lib/services/shipping/carrier-checkout"
import type { MarketplaceCheckoutAmounts } from "@/lib/services/marketplace-checkout-amounts"

// Reconstrói o endereço estruturado a partir da string montada por
// buildAddressString (`rua, número[, complemento] - bairro, cidade - UF, CEP`).
// Usado só como fallback quando não há um endereço selecionado; o snapshot
// garante que a etiqueta use exatamente o endereço preenchido no checkout.
function parseCheckoutAddressString(raw: string): MarketplaceCheckoutDestinationAddress | null {
    const text = String(raw || "").trim()
    if (!text) return null
    const zipMatch = text.match(/\d{5}-?\d{3}/)
    const postalCode = zipMatch ? zipMatch[0].replace(/\D/g, "") : ""
    if (!postalCode) return null
    const withoutZip = zipMatch ? text.replace(zipMatch[0], "") : text
    const parts = withoutZip.split(",").map((part) => part.trim()).filter(Boolean)
    if (parts.length < 2) return null

    const street = parts[0] || ""
    const cityStatePart = parts[parts.length - 1] || ""
    const cityState = cityStatePart.split("-").map((part) => part.trim()).filter(Boolean)
    const state = cityState.length >= 2 ? cityState[cityState.length - 1] : ""
    const city = cityState.length >= 2 ? cityState.slice(0, -1).join("-").trim() : cityStatePart

    const middle = parts.slice(1, parts.length - 1).join(", ")
    const dashIndex = middle.lastIndexOf(" - ")
    const numberPart = dashIndex >= 0 ? middle.slice(0, dashIndex) : middle
    const district = dashIndex >= 0 ? middle.slice(dashIndex + 3).trim() : ""
    const numberBits = numberPart.split(",").map((part) => part.trim()).filter(Boolean)
    const number = numberBits[0] || ""
    const complement = numberBits.slice(1).join(", ")

    if (!street || !city || !state) return null
    return {
        street,
        number: number || null,
        complement: complement || null,
        district: district || null,
        city,
        state: state.toUpperCase(),
        postalCode,
    }
}

// Cache em memória (client) dos totais do checkout. Server Actions não são
// deduplicadas pelo React, então alternar entrega/retirada ou voltar a um
// estado anterior (mesmo endereço/cupom/carrier) disparava a mesma cotação de
// novo. Guardar por assinatura de inputs torna essas repetições instantâneas.
const CHECKOUT_AMOUNTS_CACHE_MAX = 12
const checkoutAmountsCache = new Map<string, MarketplaceCheckoutAmounts>()

function rememberCheckoutAmounts(key: string, value: MarketplaceCheckoutAmounts) {
    checkoutAmountsCache.delete(key)
    checkoutAmountsCache.set(key, value)
    while (checkoutAmountsCache.size > CHECKOUT_AMOUNTS_CACHE_MAX) {
        const oldest = checkoutAmountsCache.keys().next().value
        if (oldest === undefined) break
        checkoutAmountsCache.delete(oldest)
    }
}

interface ProductItem {
    id: string
    name: string
    price: number
    quantity: number
    image?: string
    variant?: string
    availabilityValue?: number
    availabilityUnit?: string
    unit?: string | null
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
    carrierServiceId?: number | null
    carrierServicePrice?: number | null
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
    installmentFeeBearer?: "merchant" | "customer"
    finalAmount: number
    interestAmount: number
    installmentCostAmount?: number
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
        installmentFeeBearer?: "merchant" | "customer"
        finalAmount: number
    }[]
}

type PaymentPreviewResult = Awaited<ReturnType<typeof previewMarketplacePaymentAction>>
type CachedPaymentPreview = {
    promise: Promise<PaymentPreviewResult>
    expiresAt: number
}

type MarketplaceInstallmentOption = NonNullable<MarketplacePaymentPreview["installmentOptions"]>[number]

const formatCheckoutInstallmentOptionLabel = (opt: MarketplaceInstallmentOption) => {
    const installmentsCount = Math.max(1, Number(opt.installments || 1))
    const interestAmount = Number(opt.totalInterest || 0)
    const feeAmount = Number(opt.totalFee || 0)
    const pricingAmount = interestAmount + feeAmount
    const hasInterest = opt.hasInterest !== undefined ? opt.hasInterest : (pricingAmount > 0.009)
    const pricingLabel = hasInterest ? "" : " sem juros"
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
        let cancelled = false
        const fetchStoreCredit = async () => {
            const pId = sessionData?.partnerId
            if (!user?.id || !pId) {
                setAvailableStoreCredit(0)
                setUseStoreCredit(false)
                return
            }
            const { getMarketplaceCustomerStoreCreditAction } = await import("@/app/actions/marketplace/cart")
            const res = await getMarketplaceCustomerStoreCreditAction(pId)
            if (cancelled) return
            // Reset on store change: credit belongs to the partner/store being
            // checked out, so a previous balance must not leak into another one.
            const credit = res.success ? Math.max(0, Number(res.availableCredit || 0)) : 0
            setAvailableStoreCredit(credit)
            setUseStoreCredit(credit > 0)
        }
        void fetchStoreCredit()
        return () => {
            cancelled = true
        }
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
    const [checkoutError, setCheckoutError] = useState<string | null>(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)

    const products = sessionData?.products || []
    const partnerId = sessionData?.partnerId || ""
    const storeId = sessionData?.storeId
    const partnerInfo = sessionData?.partnerInfo || { paymentMethods: [] } as any

    const cartItemIds = useMemo(
        () => (sessionData?.cartItems || []).map((item) => item.cartItemId).filter(Boolean),
        [sessionData?.cartItems],
    )

    const [removedCartItems, setRemovedCartItems] = useState<Set<string>>(new Set())

    useEffect(() => {
        if (partnerId) {
            trackEvent("checkout_started", {
                partner_id: partnerId,
                store_id: storeId,
                source: sessionData?.source,
                items_count: products.length,
            })
        }
    }, [partnerId])

    const activeCartItemIds = useMemo(
        () => cartItemIds.filter((id) => !removedCartItems.has(id)),
        [cartItemIds, removedCartItems],
    )

    const { checkoutContext, contextLoading, contextError, patchLines } = useMarketplaceCheckoutContext({
        partnerId,
        cartItemIds: activeCartItemIds,
        storeId,
        mpConnected: Boolean(partnerInfo?.mpConnected),
        enabled: Boolean(partnerId && activeCartItemIds.length > 0),
        refreshTrigger,
    })

    const requirements: CheckoutRequirements | undefined = checkoutContext?.requirements
    const hasSubscription = Boolean(
        requirements?.hasSubscriptionLines ||
        checkoutContext?.lines?.some((l) => l.lineKind === "subscription") ||
        sessionData?.cartItems?.some((i) => i.itemType === "subscription")
    )

    // ── Gate do plano ────────────────────────────────────────────────────────
    // `mercadoPagoEnabled` é a feature paga do plano. Sem ela o checkout só
    // oferece os métodos manuais da loja ("a combinar", PIX, dinheiro) — o
    // comprador nunca deve ver a opção do Mercado Pago.
    const checkoutCapabilities = checkoutContext?.capabilities
    const mercadoPagoEnabled = checkoutCapabilities?.mercadoPagoEnabled ?? false
    const mpAvailable = Boolean(partnerInfo?.mpConnected) && mercadoPagoEnabled

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
    const submitInFlightRef = useRef(false)
    const paymentPreviewRequestsRef = useRef<Map<string, CachedPaymentPreview>>(new Map())

    const handleBulkFulfillmentModesSave = async (changes: Array<{ cartItemId: string; mode: "on_site" | "customer_location" }>) => {
        try {
            const token = csrfToken || await fetchCSRFTokenSingleton() || ""
            const result = await bulkUpdateFulfillmentModesAction(changes, token)
            if (result.success) {
                patchLines((lines) => {
                    const updated = lines.map((line) => {
                        const change = changes.find((c) => c.cartItemId === line.lineId)
                        if (change) {
                            return { ...line, fulfillmentMode: change.mode }
                        }
                        return line
                    })
                    return updated
                })
                setDeliveryError((prev) => {
                    if (!prev) return prev
                    const normalized = prev.toLowerCase()
                    if (normalized.includes("atendimento") || normalized.includes("raio")) return null
                    return prev
                })
            } else {
                notifyError("Erro", result.error || "Não foi possível salvar as formas de atendimento.")
            }
        } catch (err) {
            notifyError("Erro", "Erro ao salvar formas de atendimento.")
        }
    }
    const storeImageRaw = checkoutContext?.store?.logo_url || partnerInfo?.store_avatar || partnerInfo?.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"
    const storeImage = getR2ImageUrl(storeImageRaw)
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
    // Chaves estáveis para as dependências dos efeitos de cotação - evitam
    // recálculo quando só a identidade de objetos/arrays muda (contexto
    // carregado de novo, lista de endereços reconstruída), não o conteúdo.
    const activeCartItemIdsKey = useMemo(() => activeCartItemIds.join(","), [activeCartItemIds])
    const selectedAddressKey = selectedAddress
        ? `${selectedAddress.id}:${selectedAddress.latitude ?? ""}:${selectedAddress.longitude ?? ""}:${selectedAddress.zip_code ?? ""}`
        : ""
    const checkoutContextKey = checkoutContext
        ? `${checkoutContext.store?.id || ""}:${checkoutContext.partner?.id || ""}:${checkoutContext.deposit?.percent ?? ""}:${checkoutContext.deposit?.available ? 1 : 0}:${(checkoutContext.lines || []).map((line) => `${line.lineId}:${line.fulfillmentMode || ""}`).join("|")}`
        : ""
    const [showAddressForm, setShowAddressForm] = useState(false)
    const [addressFormError, setAddressFormError] = useState<string | null>(null)
    const [loadingAddresses, setLoadingAddresses] = useState(false)
    const [loadingCep, setLoadingCep] = useState(false)
    const [newAddressData, setNewAddressData] = useState({
        zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false,
        addressType: "casa", isDefault: false,
        latitude: null as number | null, longitude: null as number | null
    })

    const [showAddressModal, setShowAddressModal] = useState(false)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [showOutsideRadiusModal, setShowOutsideRadiusModal] = useState(false)
    const [showServiceUnavailableModal, setShowServiceUnavailableModal] = useState(false)

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

    const displayableCoupons = useMemo(() => availableCoupons.filter((c) => !c.blocked), [availableCoupons])

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
    const [showItemsSheet, setShowItemsSheet] = useState(false)

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
    const [shippingEnabled, setShippingEnabled] = useState(false)
    const [deliveryFee, setDeliveryFee] = useState(0)
    const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null)
    const [deliveryBreakdown, setDeliveryBreakdown] = useState<Record<string, any> | null>(null)
    const [deliverySettings, setDeliverySettings] = useState<any>(null)

    // Carrier freight (SuperFrete) - fallback when own delivery radius has no coverage
    const [carrierOptions, setCarrierOptions] = useState<CarrierFreightOption[]>([])
    const [selectedCarrierServiceId, setSelectedCarrierServiceId] = useState<number | null>(null)
    const [carrierQuoteLoading, setCarrierQuoteLoading] = useState(false)
    const carrierQuoteKeyRef = useRef<string | null>(null)
    const [carrierError, setCarrierError] = useState<string | null>(null)
    const [carrierReason, setCarrierReason] = useState<string | null>(null)

    // Frete próprio não conseguiu cotar o endereço (fora do raio, entrega
    // desativada, erro de cotação...). Estado persistente por endereço: quando a
    // transportadora assume, o total passa a ter sucesso, então não dá para
    // inferir "sem cobertura" pelo erro - guardamos o estado.
    const [ownDeliveryBlocked, setOwnDeliveryBlocked] = useState(false)

    const raioNoCoverage = Boolean(deliveryError && deliveryError.toLowerCase().includes("raio"))
    // Envio nacional só entra quando a loja tem transportadora conectada e
    // algum item do pedido aceita "shipping" (requirements.showShippingOption).
    const carrierAllowed = shippingEnabled && Boolean(requirements?.showShippingOption)
    const carrierSectionVisible = formData.deliveryType === "delivery" && carrierAllowed && (raioNoCoverage || ownDeliveryBlocked)

    const destinationCep = useMemo(() => {
        if (formData.deliveryType !== "delivery") return ""
        const zip = (selectedAddress?.zip_code || "").replace(/\D/g, "")
        if (zip.length === 8) return zip
        return extractPostalCodeFromAddress(formData.deliveryAddress)
    }, [formData.deliveryType, selectedAddress?.zip_code, formData.deliveryAddress])

    // Reset carrier state whenever the destination CEP changes
    useEffect(() => {
        setCarrierOptions([])
        setSelectedCarrierServiceId(null)
        carrierQuoteKeyRef.current = null
        setCarrierError(null)
        setCarrierReason(null)
        // Limpa o estado de frete próprio/carrier do CEP anterior; sem isso um
        // "raio"/"A combinar" do CEP anterior ficava travado até o próximo quote
        // esporadamente falhar, e a taxa não recalculava ao trocar o endereço.
        setDeliveryError(null)
        setOwnDeliveryBlocked(false)
        setDeliveryFee(0)
        setDeliveryDistanceKm(null)
        setDeliveryBreakdown(null)
    }, [destinationCep])

    // Quote carrier options IN PARALLEL with the own-delivery quote. Antes
    // este efeito esperava o erro "raio" - serializando frete próprio
    // (geocoding) + SuperFrete + uma segunda rodada de totais em 10-15s.
    // Agora as opções chegam junto com o "raio", tornando a seleção imediata.
    // NOTE: the dedupe key lives in a ref (not state) so this effect never
    // re-runs on its own updates - otherwise the cleanup below would cancel
    // the in-flight request and discard its results.
    useEffect(() => {
        if (formData.deliveryType !== "delivery" || !carrierAllowed || !partnerId || !destinationCep || !mpAvailable) return
        const productItems = products.map((p: any) => ({
            productId: p.product_id || p.id,
            quantity: Math.max(1, Number(p.quantity || 1)),
        }))
        const itemsDedupe = productItems.map((p: any) => `${p.productId}:${p.quantity}`).sort().join(",")
        const dedupeKey = `${partnerId}:${destinationCep}:${itemsDedupe}`
        if (carrierQuoteKeyRef.current === dedupeKey) return
        let active = true
        let completed = false
        carrierQuoteKeyRef.current = dedupeKey
        setCarrierQuoteLoading(true)
            ; (async () => {
                try {
                    const res = await quoteCarrierFreightAction({
                        partnerId,
                        toPostalCode: destinationCep,
                        items: productItems,
                    })
                    if (!active) return
                    if (res.success && res.options.length > 0) {
                        setCarrierOptions(res.options)
                        setCarrierError(null)
                        setCarrierReason(null)
                    } else {
                        setCarrierOptions([])
                        setSelectedCarrierServiceId(null)
                        setCarrierError(!res.success ? res.error : "Nenhuma transportadora disponível para este endereço.")
                        setCarrierReason(!res.success ? res.reason : "no_options")
                    }
                } catch {
                    if (!active) return
                    setCarrierError("Não foi possível calcular o frete agora.")
                    setCarrierReason("quote_failed")
                } finally {
                    completed = true
                    if (active) setCarrierQuoteLoading(false)
                }
            })()
        return () => {
            active = false
            if (!completed) {
                carrierQuoteKeyRef.current = null
                setCarrierQuoteLoading(false)
            }
        }
    }, [destinationCep, partnerId, formData.deliveryType, mpAvailable, carrierAllowed, products])

    const handleCarrierSelect = (opt: CarrierFreightOption) => {
        setSelectedCarrierServiceId(opt.serviceId)
        setDeliveryFee(Number(opt.price))
        setDeliveryDistanceKm(null)
        setDeliveryBreakdown({
            source: "superfrete",
            carrier: "SuperFrete",
            serviceId: opt.serviceId,
            serviceName: opt.serviceName,
            companyName: opt.companyName,
            deliveryMinDays: opt.deliveryMinDays,
            deliveryMaxDays: opt.deliveryMaxDays,
            toPostalCode: destinationCep,
        })
        setDeliveryError(null)
    }

    // Apply carrier options once own delivery reports no coverage.
    // Runs independently of the fetch effect so it works whether the options
    // arrive before or after the failure - no visible gap/flash.
    useEffect(() => {
        if (!carrierSectionVisible) return
        if (carrierQuoteLoading) return
        if (carrierOptions.length > 0) {
            if (selectedCarrierServiceId == null) {
                // Prefere o serviço que o comprador já escolheu (sacola ou checkout
                // anterior) - nunca reseta para a opção mais barata, evitando que a
                // etiqueta/valor mude no fechamento do pedido.
                const prefId = sessionData?.carrierServiceId ? Number(sessionData.carrierServiceId) : null
                const preferred = prefId ? carrierOptions.find(o => o.serviceId === prefId) : null
                handleCarrierSelect(preferred || carrierOptions[0])
            }
            setShowOutsideRadiusModal(false)
        } else if (carrierError && carrierReason === "no_options") {
            // Modal de "Entrega Indisponível" só quando realmente não há
            // opção de transporte. Motivos de configuração (plano, CEP de
            // origem, erro de cotação) ficam visíveis no card inline.
            setShowOutsideRadiusModal(true)
        }
        // handleCarrierSelect é recriado a cada render; o efeito só reage ao
        // estado do fluxo de cotação.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deliveryError, carrierQuoteLoading, carrierOptions, carrierError, carrierReason, selectedCarrierServiceId, sessionData?.carrierServiceId])
    const [storefrontMethods, setStorefrontMethods] = useState<StorefrontPaymentMethod[]>([])
    const [storefrontMethodsLoading, setStorefrontMethodsLoading] = useState(true)

    const [partnerProducts, setPartnerProducts] = useState<any[]>([])
    const [loadingBumps, setLoadingBumps] = useState(false)
    const [addingBumpId, setAddingBumpId] = useState<string | null>(null)

    const bumpCandidates = useMemo(() => {
        const checkoutProductIds = new Set(
            [
                ...(sessionData?.products || []).map((item) => item.id),
                ...(sessionData?.cartItems || []).map((item) => item.productId),
            ].filter(Boolean)
        )
        return partnerProducts.filter((p: any) => {
            const isStock = (p.stock_available ?? p.stock_quantity ?? 0) > 0
            return isStock && !checkoutProductIds.has(p.id)
        })
    }, [partnerProducts, sessionData?.cartItems, sessionData?.products])

    const handleAddBumpProduct = async (p: any) => {
        if (!sessionData || addingBumpId) return
        setAddingBumpId(p.id)
        try {
            const result = await addBumpProductToCartAction({
                productId: p.id,
                partnerId,
                storeId,
                csrf_token: csrfToken || undefined,
            })
            if (result.error) {
                notifyError("Erro", result.error)
                return
            }
            const realCartItemId = result.cartItemId!

            const newProductItem: ProductItem = {
                id: p.id,
                name: p.name,
                price: Number(p.promotional_price && p.promotional_price < p.price ? p.promotional_price : p.price),
                quantity: 1,
                image: p.images?.[0] || p.fallback_variant_image || "https://img.dudit.com.br/static/Placeholder.png",
                availabilityValue: p.availability_value,
                availabilityUnit: p.availability_unit
            }

            // Order bump nunca deve multiplicar/duplicar: se o produto já está no
            // pedido, apenas garante a presença, sem somar quantidade.
            const alreadyInProducts = products.some((item) => item.id === p.id)
            const updatedProducts = alreadyInProducts ? products : [...products, newProductItem]

            const baseCartItems = sessionData.source === "cart"
                ? [...(sessionData.cartItems || [])]
                : products.map((item) => ({
                    cartItemId: "bump-" + item.id,
                    productId: item.id,
                    variantId: item.variant || undefined,
                    quantity: item.quantity
                }))

            const alreadyInCart = baseCartItems.some((item) => item.productId === p.id && !item.variantId)
            const updatedCartItems = alreadyInCart
                ? baseCartItems
                : [...baseCartItems, {
                    cartItemId: realCartItemId,
                    productId: p.id,
                    variantId: undefined,
                    quantity: 1
                }]

            const newSessionData: CheckoutSessionData = {
                ...sessionData,
                source: "cart",
                products: updatedProducts,
                cartItems: updatedCartItems
            }

            setSessionData(newSessionData)
            sessionStorage.setItem("checkout_session", JSON.stringify(newSessionData))
            setRefreshTrigger(prev => prev + 1)
            notifySuccess("Produto adicionado", `${p.name} foi adicionado ao seu pedido!`)
        } catch {
            notifyError("Erro", "Não foi possível adicionar o produto. Tente novamente.")
        } finally {
            setAddingBumpId(null)
        }
    }


    useEffect(() => {
        if (formData.paymentMethod && formData.paymentMethod !== "mercadopago" && storefrontMethods.length > 0 && !storefrontMethods.some(m => m.id === formData.paymentMethod || m.type === formData.paymentMethod)) {
            setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
        }
    }, [storefrontMethods, formData.paymentMethod])

    // Auto-set paymentOption to "traditional" for non-MP stores (only if pickup payment is allowed or not in pickup mode)
    const rawPickupPolicy = checkoutContext?.partner?.pickupPaymentPolicy || "require_online_payment"
    // Loja que exige pagamento online na retirada, mas não pode cobrar online
    // agora (plano sem Mercado Pago ou loja sem MP conectado): exigir online
    // deixaria o pedido sem nenhuma forma de pagamento. Nesse caso o pagamento
    // é combinado na retirada (manual), em vez de travar o checkout no fim.
    const canPayOnline = mpAvailable
    const pickupPolicyFromContext =
        !canPayOnline && rawPickupPolicy === "require_online_payment"
            ? "allow_pickup_payment"
            : rawPickupPolicy
    const isPickupRequiringOnline = formData.deliveryType === "pickup" && pickupPolicyFromContext === "require_online_payment"
    const isWhatsappFlow = checkoutContext?.partner?.orderFlow === "whatsapp"
    // Default "true" até o contexto chegar: o servidor é a fonte autoritativa do
    // bloqueio (fluxo/cota) e um submit precoce não pode virar WhatsApp por engano.
    const checkoutViaDudit = checkoutCapabilities?.checkoutViaDudit ?? true
    const couponsEnabled = checkoutCapabilities?.couponsEnabled ?? false
    // A transportadora só existe no fluxo de entrega. Sem esse guard, uma
    // seleção antiga de frete continuava valendo após trocar para retirada e
    // prendia o checkout no Mercado Pago (regra exclusiva da transportadora).
    const carrierDeliveryActive = formData.deliveryType === "delivery"
        && Boolean(selectedCarrierServiceId)
        && carrierOptions.length > 0
    const selectedCarrierOption = selectedCarrierServiceId != null
        ? carrierOptions.find((o) => o.serviceId === selectedCarrierServiceId) || null
        : null
    // Modo carrier: frete próprio sem cobertura ("fora do raio" ou erro) ou
    // transportadora já selecionada. Enquanto isso, o checkout mostra apenas
    // Mercado Pago. Quando Pedidos estão desativados, nem a transportadora
    // libera pagamento online: o fluxo é sempre WhatsApp.
    const carrierCheckoutEngaged = checkoutViaDudit
        && formData.deliveryType === "delivery"
        && (carrierDeliveryActive || carrierSectionVisible)
    // Enquanto aguarda a cotação da transportadora, esconde o erro (sem flash)
    // - a seção de transportadora mostra o estado de cálculo.
    const carrierResolving = carrierQuoteLoading || carrierOptions.length > 0
    const displayDeliveryError = carrierSectionVisible && carrierResolving ? null : deliveryError
    const activeCheckoutError = checkoutError
        || displayDeliveryError
        || paymentError
        || (!checkoutContext && contextError ? contextError : null)
    // Frete próprio voltou a cobrir o endereço (ou nunca saiu dele) → desfaz a
    // seleção de transportadora. Sem isso ela "grudava" após um momento de
    // indisponibilidade e o pedido seguia por transportadora mesmo com entrega
    // padrão disponível.
    useEffect(() => {
        if (carrierSectionVisible) return
        if (selectedCarrierServiceId == null) return
        setSelectedCarrierServiceId(null)
    }, [carrierSectionVisible, selectedCarrierServiceId])

    // Auto-seleciona a única forma de pagamento disponível para não exigir um
    // clique desnecessário do comprador (ex.: loja só com Mercado Pago conectado).
    useEffect(() => {
        if (paymentOption !== null) return
        if (isWhatsappFlow) return
        const mpAvail = mpAvailable && (!isWhatsappFlow || carrierCheckoutEngaged)
        if (mpAvail && storefrontMethods.length === 0 && !carrierCheckoutEngaged) {
            setPaymentOption("mercadopago")
            setFormData((prev) => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
            return
        }
        if (storefrontMethods.length === 1 && !mpAvailable && !carrierCheckoutEngaged && !isPickupRequiringOnline) {
            setPaymentOption("traditional")
            setFormData((prev) => ({ ...prev, paymentMethod: storefrontMethods[0].id, installments: 1 }))
        }
    }, [paymentOption, mpAvailable, storefrontMethods, isWhatsappFlow, carrierCheckoutEngaged, isPickupRequiringOnline])

    useEffect(() => {
        if (checkoutContext?.partner?.orderFlow === "whatsapp") {
            // Só força o modo manual quando nada foi escolhido ainda - nunca
            // sobrescrever uma seleção explícita (ex.: créditos de assinatura).
            // Com entrega por transportadora ativa, o pagamento é online (MP).
            if (paymentOption === null && !carrierCheckoutEngaged) setPaymentOption("traditional")
            return
        }
        if (!contextLoading && storefrontMethods.length > 0 && !mpAvailable && paymentOption === null && !isPickupRequiringOnline) {
            setPaymentOption("traditional")
        }
    }, [contextLoading, storefrontMethods, mpAvailable, paymentOption, isPickupRequiringOnline, checkoutContext?.partner?.orderFlow, carrierCheckoutEngaged])

    // Entrega por transportadora (SuperFrete) deve ser paga online via Mercado Pago
    // - em qualquer fluxo (inclusive WhatsApp, onde sem transportadora o pedido
    // continua fechado no chat com pagamento manual). O corte de cotação já exige
    // mpConnected. "Engaged" cobre também o período em que o frete próprio ainda
    // não retornou (raio) - assim os métodos manuais não piscam antes do cálculo.
    useEffect(() => {
        if (carrierCheckoutEngaged) {
            if (paymentOption === "traditional" || paymentOption === null) {
                setPaymentOption("mercadopago")
                setFormData(prev => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
            }
            return
        }
        // Saiu do modo carrier (ex.: endereço trocou e o frete próprio cobre):
        // no fluxo WhatsApp sem transportadora selecionada, volta ao modo manual.
        // Carrinho com assinatura fica no Mercado Pago (cobrança recorrente).
        if (isWhatsappFlow && selectedCarrierServiceId == null && paymentOption === "mercadopago" && !requirements?.hasSubscriptionLines) {
            setPaymentOption("traditional")
            setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
        }
    }, [carrierCheckoutEngaged, paymentOption, isWhatsappFlow, selectedCarrierServiceId, requirements?.hasSubscriptionLines])

    // Assinatura: o pagamento é recorrente pelo Mercado Pago - deixa o MP já
    // selecionado para o comprador não precisar escolher a forma de pagamento.
    const mpOptionAvailable = mpAvailable && (!isWhatsappFlow || carrierCheckoutEngaged)
    useEffect(() => {
        if (!requirements?.hasSubscriptionLines || !mpOptionAvailable) return
        if (paymentOption !== null || contextLoading) return
        setPaymentOption("mercadopago")
        setFormData(prev => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
    }, [requirements?.hasSubscriptionLines, mpOptionAvailable, paymentOption, contextLoading])

    useEffect(() => {
        if (checkoutContext?.deposit.available) {
            setPayDepositOnly(true)
        } else {
            setPayDepositOnly(false)
        }
    }, [checkoutContext?.deposit.available])

    // Troca entrega ↔ retirada. Ao sair da entrega por transportadora, desfaz a
    // seleção de frete e devolve o checkout de retirada ao fluxo manual quando
    // a loja permite pagamento na retirada.
    const handleDeliveryTypeChange = (type: "delivery" | "pickup") => {
        const wasCarrierFlow = carrierCheckoutEngaged
        setFormData((prev) => ({ ...prev, deliveryType: type }))

        if (type !== "delivery") {
            setSelectedCarrierServiceId(null)
        }

        if (type !== "pickup") return

        if (pickupPolicyFromContext === "require_online_payment") {
            if (mpAvailable) {
                setPaymentOption("mercadopago")
                setFormData(prev => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
            } else {
                setPaymentOption(null)
                setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
            }
            return
        }

        // Retirada com pagamento permitido não herda o Mercado Pago obrigatório
        // da transportadora (o MP só era exigido porque o frete era por carrier).
        if (wasCarrierFlow && paymentOption === "mercadopago" && !requirements?.hasSubscriptionLines) {
            setPaymentOption("traditional")
            setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
        }
    }

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
        setShippingEnabled(Boolean(checkoutContext.delivery.shippingEnabled))

        const canDel = (checkoutContext.delivery.planEnabled && checkoutContext.delivery.partnerEnabled) || Boolean(checkoutContext.delivery.shippingEnabled)
        const canPick = checkoutContext.delivery.pickupEnabled
        if (!canDel && canPick) {
            setFormData((prev) => ({ ...prev, deliveryType: "pickup" }))
        } else if (canDel && !canPick) {
            setFormData((prev) => ({ ...prev, deliveryType: "delivery" }))
        }

        // Carrinho só de assinatura: o comprador escolheu o modo de recebimento
        // na página do plano (gravado em cart_items.fulfillment_mode). Respeita
        // a escolha em vez de cair no padrão do delivery config da loja.
        const ctxLines = Array.isArray(checkoutContext.lines) ? checkoutContext.lines : []
        const subLines = ctxLines.filter((l: any) => l.lineKind === "subscription")
        if (subLines.length > 0 && subLines.length === ctxLines.length) {
            const chosenMode = subLines.find((l: any) => l.fulfillmentMode === "pickup" || l.fulfillmentMode === "delivery")?.fulfillmentMode
            if (chosenMode === "pickup" || chosenMode === "delivery") {
                setFormData((prev) => ({ ...prev, deliveryType: chosenMode }))
            }
        }

        // Carrinho só de serviços: o atendimento é no estabelecimento (on_site -> pickup)
        // ou no endereço do cliente (customer_location -> delivery). Se não há atendimento
        // a domicílio, define como pickup para não ficar com deliveryType = "delivery" indevidamente.
        const reqs = checkoutContext.requirements
        const isOnlyServicesInContext = Boolean(reqs?.hasServiceLines) && !reqs?.hasProductLines && !reqs?.hasSubscriptionLines
        if (isOnlyServicesInContext) {
            const hasCustomerLoc = ctxLines.some((l: any) => l.lineKind === "service_booking" && l.fulfillmentMode === "customer_location")
            setFormData((prev) => ({ ...prev, deliveryType: hasCustomerLoc ? "delivery" : "pickup" }))
        }

        if (checkoutContext.storefrontPaymentMethods.length > 0) {
            setStorefrontMethods(checkoutContext.storefrontPaymentMethods as any)
        }
        setStorefrontMethodsLoading(false)

        const rawAddresses = checkoutContext.userAddresses
        const addresses = (Array.isArray(rawAddresses) ? rawAddresses : (rawAddresses as any)?.data || []) as unknown as UserAddress[]
        if (addresses && addresses.length > 0) {
            setUserAddresses(prev => {
                if (prev.length > 0) {
                    const existingIds = new Set(prev.map(a => a.id))
                    const additions = addresses.filter(a => !existingIds.has(a.id))
                    return additions.length > 0 ? [...prev, ...additions] : prev
                }
                return addresses
            })
            setSelectedAddressId(prevId => {
                if (prevId) return prevId
                // Respeita o endereço ativo escolhido na sacola/PDP (localStorage)
                // antes de cair no endereço padrão - senão o checkout re-cotava o
                // frete para o padrão e trocava a transportadora pela taxa base.
                const storedActiveId = typeof window !== "undefined"
                    ? localStorage.getItem(DUDIT_ACTIVE_ADDRESS_STORAGE_KEY)
                    : null
                const activeAddress = storedActiveId
                    ? addresses.find((a) => a.id === storedActiveId)
                    : undefined
                const chosen = activeAddress || addresses.find((a) => a.is_default) || addresses[0]
                if (chosen) {
                    const addressStr = buildAddressString(chosen)
                    setFormData((prev) => ({
                        ...prev,
                        deliveryAddress: addressStr,
                    }))
                    return chosen.id
                }
                return prevId
            })
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
        if (!user) return
        setUserId(user.id)
        setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário")
        setUserEmail(user.email || "")
    }, [user])

    // The checkout context already contains the user's addresses. Only use the
    // legacy action as a fallback after context loading failed/was skipped;
    // otherwise the first render used to issue the same address query twice.
    useEffect(() => {
        if (!user?.id || contextLoading || checkoutContext || userAddresses.length > 0) return
        void loadUserAddresses(undefined, user.id)
    }, [user?.id, contextLoading, checkoutContext, userAddresses.length])

    const loadUserAddresses = async (targetSelectedId?: string, overrideUserId?: string) => {
        const targetUserId = overrideUserId || userId || user?.id
        if (!targetUserId) return
        setLoadingAddresses(true)
        try {
            const result = await getAddressesAction(targetUserId, "user")
            if (result.addresses) {
                const list = result.addresses as UserAddress[]
                setUserAddresses(list)

                const storedActiveId = typeof window !== "undefined" ? localStorage.getItem(DUDIT_ACTIVE_ADDRESS_STORAGE_KEY) : null
                const activeId = targetSelectedId || selectedAddressId || storedActiveId
                const matchSelected = list.find((a) => a.id === activeId)
                const defaultAddress = list.find((a) => a.is_default)
                const chosen = matchSelected || defaultAddress || list[0]

                if (chosen) {
                    setSelectedAddressId(chosen.id)
                    setFormData(prev => ({
                        ...prev,
                        deliveryAddress: buildAddressString(chosen),
                    }))
                }
            }
        } catch (err) {
            console.error("Error loading addresses:", err)
        } finally {
            setLoadingAddresses(false)
        }
    }

    useAddressSync(useCallback((updatedId?: string) => {
        void loadUserAddresses(updatedId)
    }, [userId]))

    const buildAddressString = (a: UserAddress) =>
        `${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ""} - ${a.neighborhood}, ${a.city} - ${a.state}, ${a.zip_code}`

    const handleAddressSelect = (addressId: string) => {
        setSelectedAddressId(addressId)
        const address = userAddresses.find(a => a.id === addressId)
        notifyAddressUpdated(addressId, address)
        if (address) setFormData(prev => ({ ...prev, deliveryAddress: buildAddressString(address) }))
    }

    const handleSaveNewAddress = async () => {
        if (!userId) return
        const { zipCode, street, number, neighborhood, city, state, noNumber, addressType } = newAddressData
        const finalNumber = noNumber ? "S/N" : number
        if (!zipCode || !street || !finalNumber || !neighborhood || !city || !state) {
            setAddressFormError("Preencha todos os campos obrigatórios do endereço.")
            return
        }
        setIsLoading(true)
        setAddressFormError(null)
        try {
            let token = csrfToken || await fetchCSRFTokenSingleton() || ""
            const result = await createAddressAction({
                entityId: userId,
                entityType: "user",
                street,
                number: finalNumber,
                complement: newAddressData.complement,
                neighborhood,
                city,
                state,
                zipCode,
                isDefault: newAddressData.isDefault || userAddresses.length === 0,
                addressType,
                latitude: newAddressData.latitude ?? null,
                longitude: newAddressData.longitude ?? null,
                csrf_token: token,
            })
            if (result.error) {
                setAddressFormError(result.error)
            } else if (result.address) {
                const savedAddr = result.address as UserAddress

                // Atualizar estado local imediatamente para refletir na UI sem reload
                setUserAddresses(prev => {
                    const withoutSaved = prev.filter(a => a.id !== savedAddr.id)
                    if (savedAddr.is_default || prev.length === 0) {
                        return [savedAddr, ...withoutSaved.map(a => ({ ...a, is_default: false }))]
                    }
                    return [savedAddr, ...withoutSaved]
                })

                setSelectedAddressId(savedAddr.id)
                notifyAddressUpdated(savedAddr.id, savedAddr, (result as any)?.citySlug)
                setFormData(prev => ({ ...prev, deliveryAddress: buildAddressString(savedAddr) }))

                setShowAddressForm(false)
                setNewAddressData({ zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false, addressType: "casa", isDefault: false, latitude: null, longitude: null })
                setDeliveryError(null)
                setAddressFormError(null)

                // Atualizar contexto e carregar do servidor em background
                setRefreshTrigger(prev => prev + 1)
                void loadUserAddresses(savedAddr.id)
            }
        } catch (err) {
            setAddressFormError("Erro ao salvar endereço. Tente novamente.")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetDefaultAddress = async (addrId: string) => {
        if (!userId) return
        try {
            const token = csrfToken || await fetchCSRFTokenSingleton() || ""
            const result = await setDefaultAddressAction(addrId, "user", userId, token)
            if (!result.error) {
                setUserAddresses(prev => prev.map(a => ({ ...a, is_default: a.id === addrId })))
                const target = userAddresses.find(a => a.id === addrId)
                notifyAddressUpdated(addrId, target, (result as any)?.citySlug)
            }
        } catch (err) {
            console.error("Erro ao definir endereço padrão no checkout:", err)
        }
    }

    const isPickup = formData.deliveryType === "pickup"
    const productDeliveryQuoteActive = Boolean(
        requirements?.showProductFulfillmentOptions &&
        requirements.showDeliverySection &&
        formData.deliveryType === "delivery" &&
        deliveryPlanEnabled &&
        deliveryEnabled,
    )
    // Serviço a domicílio cobra taxa de deslocamento (entra no deliveryFee
    // calculado pelo servidor), então também precisa da linha no resumo.
    const hasCustomerLocationService = Boolean(
        checkoutContext?.lines?.some((l) => l.lineKind === "service_booking" && l.fulfillmentMode === "customer_location"),
    )
    // Assinaturas também exibem a linha de frete (o total do servidor já
    // inclui o frete resolvido pela política do plano).
    const showDeliveryFeeRow = Boolean(requirements?.showProductFulfillmentOptions)
        || Boolean(requirements?.hasSubscriptionLines)
        || hasCustomerLocationService
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
    const appliedCoupon = useMemo(
        () => availableCoupons.find((coupon) => coupon.code === couponCode) || null,
        [availableCoupons, couponCode]
    )
    const hasFreeDeliveryCoupon = Boolean(appliedCoupon?.freeShipping || appliedCoupon?.discountType === "free_shipping")
    const checkoutFullTotal = checkoutAmounts?.fullOrderTotal ?? 0
    const checkoutDepositChargeTotal = checkoutAmounts?.depositChargeTotal ?? 0
    const checkoutServiceDepositAmount = checkoutAmounts?.serviceDepositAmount ?? 0
    const checkoutChargeTotal = useMemo(() => {
        if (!checkoutAmounts) return contextTotalSubtotal + (showDeliveryFeeRow && !isPickup && !hasFreeDeliveryCoupon ? deliveryFee : 0)
        const usesDeposit = depositAvailable && payDepositOnly
        return usesDeposit ? checkoutAmounts.depositChargeTotal : checkoutAmounts.fullOrderTotal
    }, [checkoutAmounts, depositAvailable, payDepositOnly, contextTotalSubtotal, showDeliveryFeeRow, isPickup, deliveryFee, hasFreeDeliveryCoupon])
    const checkoutDeliveryFee = checkoutAmounts?.deliveryFee ?? (showDeliveryFeeRow && !isPickup && !hasFreeDeliveryCoupon ? deliveryFee : 0)
    // Frete exibido no resumo: para carrinho só de assinatura a cotação
    // client-side não existe (a política vem do plano) - usa o total do servidor.
    const subscriptionOnlyCart = Boolean(requirements?.hasSubscriptionLines) && !requirements?.hasProductLines && !requirements?.hasServiceLines
    const summaryDeliveryFee = subscriptionOnlyCart ? (checkoutAmounts?.deliveryFee ?? deliveryFee) : deliveryFee
    // Frete grátis (cupom, valor mínimo atingido ou loja que paga) - vale para o
    // frete próprio e para a transportadora; usado para riscar o valor original
    // e mostrar "Grátis".
    const deliveryFree = summaryDeliveryFee === 0 && !isPickup && (
        hasFreeDeliveryCoupon ||
        Boolean((deliveryBreakdown as any)?.isFreeByThreshold) ||
        (deliveryBreakdown as any)?.deliveryPayer === "seller" ||
        deliverySettings?.deliveryPayer === "seller"
    )
    // Carrinho com assinatura: assinaturas recorrentes só aceitam cartão de
    // crédito no Mercado Pago (Pix volta apenas no fallback payment_failed).
    const mpPaymentMethodsForCart: MpAcceptedPaymentMethods | undefined = useMemo(() => {
        if (!mpAcceptedPaymentMethods || !requirements?.hasSubscriptionLines) return mpAcceptedPaymentMethods
        return {
            credit_card: true,
            debit_card: false,
            pix: false,
            boleto: false,
            mercado_pago_wallet: false,
        }
    }, [mpAcceptedPaymentMethods, requirements?.hasSubscriptionLines])
    const checkoutAmountsReady = Boolean(checkoutAmounts && !checkoutAmountsLoading)
    const paymentTypeLabelMap: Record<string, string> = {
        pix: "Pix",
        credit_card: "Cartão de crédito",
        debit_card: "Cartão de débito",
        cash: "Dinheiro",
        store_credit: "Vale-compra",
        "vale-compra": "Vale-compra",
        "vale_compra": "Vale-compra",
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
    const isOnlyServices = requirements?.hasServiceLines && !requirements?.hasProductLines && !requirements?.hasSubscriptionLines

    const traditionalPaymentLabel = requirements?.hasPayOnService
        ? "Pagar no atendimento"
        : isOnlyServices
            ? "Pagar na conclusão"
            : isPickup
                ? "Pagar na Retirada"
                : "Pagar na Entrega"

    const pickupRequiresOnlinePayment = checkoutContext?.partner?.orderFlow !== "whatsapp" && isPickup && pickupPolicyFromContext === "require_online_payment"
    const isOnlyServicesWithDeposit = Boolean(
        checkoutContext?.deposit.available &&
        requirements?.hasServiceLines &&
        !requirements?.hasProductLines &&
        !requirements?.hasSubscriptionLines
    )

    const hasUnavailableServices = useMemo(() => {
        return Object.values(serviceAvailability).some(
            (s) => s.checked && !s.available
        )
    }, [serviceAvailability])

    const unavailableServiceLines = useMemo(() => {
        return (checkoutContext?.lines || []).filter((l) => {
            if (l.lineKind !== "service_booking") return false
            const avail = serviceAvailability[l.lineId]
            return avail && avail.checked && !avail.available
        })
    }, [checkoutContext?.lines, serviceAvailability])

    const showTraditionalPaymentOption = !checkoutContext?.deposit.available && (checkoutContext?.partner?.orderFlow === "whatsapp" || (!pickupRequiresOnlinePayment && !isOnlyServicesWithDeposit && Boolean(
        requirements?.allowPayOnDelivery ||
        requirements?.hasPayOnService ||
        requirements?.hasServiceLines ||
        (requirements?.hasProductLines && !requirements?.hasServiceLines),
    )))
    // Entrega por transportadora exige pagamento online (Mercado Pago) - oculta a
    // opção manual em qualquer fluxo enquanto a transportadora estiver ativa.
    const showManualPaymentOption = showTraditionalPaymentOption && !carrierCheckoutEngaged

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

    const checkoutItemCount = useMemo(() => {
        if (checkoutContext?.lines && checkoutContext.lines.length > 0) {
            return checkoutContext.lines.reduce((sum, l) => sum + (Number(l.quantity) || 1), 0)
        }
        return products.reduce((sum, p) => sum + (quantities[p.id] || p.quantity || 1), 0)
    }, [checkoutContext?.lines, products, quantities])

    const renderItemsShortcutButton = () => (
        <button
            type="button"
            onClick={() => setShowItemsSheet(true)}
            className="flex w-full items-center justify-between rounded-full border border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-border/50 px-1 py-1 text-left"
        >
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-dark text-white">
                    <PackageIcon className="h-4 w-4" />
                </div>
                <span className="font-bold text-brand-dark dark:text-dark-heading">Itens do Pedido ({checkoutItemCount})</span>
            </div>
            <ChevronRightIcon className="mr-2 h-5 w-5 text-brand-inactive-text dark:text-dark-body" />
        </button>
    )

    const renderReviewLocations = () => {
        const lines = checkoutContext?.lines || []
        const hasProducts = lines.some((l) => l.lineKind === "product") || Boolean(requirements?.showProductFulfillmentOptions)
        const serviceLines = lines.filter((l) => l.lineKind === "service_booking")
        const anyServiceOnSite = serviceLines.some((l) => l.fulfillmentMode === "on_site" || !l.fulfillmentMode)
        const anyServiceCustomerAddress = serviceLines.some((l) => l.fulfillmentMode === "customer_location")
        const selectedCarrier = selectedCarrierServiceId != null
            ? carrierOptions.find((o) => o.serviceId === selectedCarrierServiceId) || null
            : null

        const rows: React.ReactNode[] = []

        if (hasProducts) {
            if (formData.deliveryType === "pickup") {
                rows.push(
                    <div key="product-pickup" className="flex items-start gap-3">
                        <img src="https://img.dudit.com.br/static/Map.png" alt="Mapa" className="w-10 h-10 object-cover rounded-full shrink-0" />
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Local de Retirada</p>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body whitespace-pre-line leading-snug">{partnerAddressLabel}</p>
                            {preparationEstimate && (preparationEstimate.preparationTimeMinutes > 0 || preparationEstimate.readyAt.getTime() > preparationEstimate.now.getTime()) && (
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1.5">
                                    {getReadyDayLabel(preparationEstimate) === "hoje"
                                        ? `Pronto em ${preparationEstimate.readyInMinutes} min`
                                        : `Pronto ${getReadyDayLabel(preparationEstimate)} a partir das ${pickupStartLabel}`} • Retirar das {pickupStartLabel} às {pickupEndLabel}
                                </p>
                            )}
                        </div>
                    </div>,
                )
            } else if (selectedCarrier) {
                rows.push(
                    <div key="product-carrier" className="flex items-center gap-3">
                        <img
                            src={getCarrierBrandIcon(selectedCarrier.companyName, selectedCarrier.serviceName)}
                            alt={selectedCarrier.companyName || "Transportadora"}
                            className="w-10 h-10 object-contain rounded-full shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {selectedCarrier.companyName ? `${selectedCarrier.companyName} - ${selectedCarrier.serviceName}` : selectedCarrier.serviceName}
                            </p>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                {formatDeliveryDaysRange(selectedCarrier.deliveryMinDays, selectedCarrier.deliveryMaxDays)}
                            </p>
                            {selectedAddress && (
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                    {selectedAddress.street}, {selectedAddress.number}{selectedAddress.neighborhood ? ` - ${selectedAddress.neighborhood}` : ""}
                                </p>
                            )}
                        </div>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading shrink-0">
                            {!deliveryQuoteLoading && summaryDeliveryFee === 0 ? (
                                <span className="flex items-center gap-1.5">
                                    <span className="line-through text-brand-inactive-text dark:text-dark-body font-normal">{formatCurrency(Number(selectedCarrier.price))}</span>
                                    <span className="text-brand-green">Grátis</span>
                                </span>
                            ) : formatCurrency(Number(selectedCarrier.price))}
                        </span>
                    </div>,
                )
            } else if (selectedAddress) {
                rows.push(
                    <div key="product-delivery" className="flex items-center gap-3">
                        <img src="https://img.dudit.com.br/static/Map.png" alt="Mapa" className="w-10 h-10 object-cover rounded-full shrink-0" />
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Endereço de entrega</p>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">{selectedAddress.street}, {selectedAddress.number}</p>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">{selectedAddress.neighborhood} - {selectedAddress.city}/{selectedAddress.state}</p>
                        </div>
                    </div>,
                )
            } else {
                rows.push(
                    <div key="product-tbd" className="flex items-center gap-3">
                        <img src="https://img.dudit.com.br/static/Map.png" alt="Mapa" className="w-10 h-10 object-cover rounded-full shrink-0" />
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">A combinar</p>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-tight whitespace-normal break-words">O vendedor entrará em contato para combinar a entrega.</p>
                        </div>
                    </div>,
                )
            }
        }

        if (anyServiceOnSite) {
            rows.push(
                <div key="service-onsite" className="flex items-start gap-3">
                    <img src="https://img.dudit.com.br/static/Map.png" alt="Mapa" className="w-10 h-10 object-cover rounded-full shrink-0" />
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Local do atendimento no estabelecimento</p>
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-tight whitespace-normal break-words">{partnerAddressLabel}</p>
                    </div>
                </div>,
            )
        }

        if (anyServiceCustomerAddress) {
            rows.push(
                <div key="service-customer" className="flex items-start gap-3">
                    <img src="https://img.dudit.com.br/static/Map.png" alt="Mapa" className="w-10 h-10 object-cover rounded-full shrink-0" />
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Seu endereço para o atendimento</p>
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                            {selectedAddress ? `${selectedAddress.street}, ${selectedAddress.number}${selectedAddress.neighborhood ? ` - ${selectedAddress.neighborhood}` : ""}` : "Endereço não selecionado"}
                        </p>
                    </div>
                </div>,
            )
        }

        if (rows.length === 0) {
            return <div className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum local de atendimento definido.</div>
        }

        return <div className="space-y-4">{rows}</div>
    }

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
        if (!requirements?.hasProductLines) return null

        const threshold = deliverySettings.freeDeliveryThreshold != null ? Number(deliverySettings.freeDeliveryThreshold) : 0
        if (threshold <= 0) return null

        const current = orderSubtotal
        const diff = Math.max(0, threshold - current)
        const isFree = diff <= 0
        const percentage = Math.min(100, (current / threshold) * 100)

        return (
            <div className="flex items-center gap-4 p-4 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                <div className="w-12 h-12 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0">
                    <TruckIcon className="text-brand-green" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                            Entrega Grátis
                        </p>
                        {isFree ? (
                            <span className="text-xs font-bold text-brand-green flex items-center gap-1">
                                <CheckCircleIcon size={16} className="text-brand-green" /> Atingido
                            </span>
                        ) : (
                            <span className="text-xs font-bold text-brand-green">{percentage.toFixed(0)}%</span>
                        )}
                    </div>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                        {isFree ? (
                            "Parabéns! Você ganhou entrega grátis."
                        ) : (
                            <>Falta <strong className="text-brand-green">{formatCurrency(diff)}</strong> para entrega grátis</>
                        )}
                    </p>
                    {!isFree && (
                        <div className="w-full bg-brand-gray dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-2">
                            <div
                                className="bg-brand-green h-full rounded-full transition-all duration-300"
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                    )}
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
                            Troco para <strong className="font-bold">{formatCurrency(payWithAmount || 0)}</strong> (Troco: <span className="text-brand-green font-bold">{formatCurrency(Math.max(0, (payWithAmount || 0) - remainingBalanceToCharge))}</span>)
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
        formData.paymentMethod &&
        formData.paymentMethod !== "mercadopago"
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

    // Effect 1: Checkout amounts + Delivery fee quote in a single unified call
    useEffect(() => {
        let active = true

        const timer = window.setTimeout(async () => {
            // Wait for the context to hydrate the default address before the
            // first authoritative pricing run. Pickup does not need an address.
            if (contextLoading || (productDeliveryQuoteActive && !formData.deliveryAddress)) {
                return
            }

            const destinationCoords = selectedAddress?.latitude && selectedAddress?.longitude
                ? { lat: Number(selectedAddress.latitude), lng: Number(selectedAddress.longitude) }
                : undefined

            // Checkout amounts (includes delivery fee calculation)
            if (activeCartItemIds.length && checkoutContext) {
                const deliveryTypeForQuote = formData.deliveryType === "pickup" ? "pickup" : "delivery"
                const amountsCacheKey = JSON.stringify([
                    activeCartItemIds,
                    deliveryTypeForQuote,
                    formData.deliveryAddress || "",
                    destinationCoords?.lat ?? null,
                    destinationCoords?.lng ?? null,
                    couponCode || null,
                    payDepositOnly,
                    checkoutContext.deposit?.percent ?? 50,
                    depositAvailable,
                    selectedCarrierServiceId || null,
                    destinationCep || null,
                    checkoutContextKey,
                ])
                const cachedAmounts = checkoutAmountsCache.get(amountsCacheKey)
                if (cachedAmounts) {
                    setCheckoutAmounts(cachedAmounts)
                    setDeliveryError(null)
                    setDeliveryFee(Number(cachedAmounts.deliveryFee || 0))
                    setDeliveryDistanceKm(cachedAmounts.distanceKm != null ? Number(cachedAmounts.distanceKm) : null)
                    setDeliveryBreakdown((cachedAmounts.deliveryBreakdown as Record<string, any>) || null)
                    if ((cachedAmounts.deliveryBreakdown as any)?.source !== "superfrete") setOwnDeliveryBlocked(false)
                    setCheckoutAmountsLoading(false)
                    setDeliveryQuoteLoading(false)
                    return
                }
                setCheckoutAmountsLoading(true)
                setDeliveryQuoteLoading(true)
                try {
                    const result = await getMarketplaceCheckoutAmountsAction({
                        cartItemIds: activeCartItemIds,
                        deliveryType: deliveryTypeForQuote,
                        deliveryAddress: formData.deliveryAddress || "",
                        destinationCoords,
                        couponCode: couponCode || null,
                        payDepositOnly,
                        depositPercent: checkoutContext.deposit?.percent ?? 50,
                        depositAvailable,
                        carrierServiceId: selectedCarrierServiceId || undefined,
                        destinationPostalCode: destinationCep || undefined,
                        cacheVariant: checkoutContextKey,
                    })
                    if (!active) return
                    if (result.success) {
                        rememberCheckoutAmounts(amountsCacheKey, result.data)
                        setCheckoutAmounts(result.data)
                        setDeliveryError(null)
                        setDeliveryFee(Number(result.data.deliveryFee || 0))
                        setDeliveryDistanceKm(result.data.distanceKm != null ? Number(result.data.distanceKm) : null)
                        setDeliveryBreakdown((result.data.deliveryBreakdown as Record<string, any>) || null)
                        if ((result.data.deliveryBreakdown as any)?.source !== "superfrete") setOwnDeliveryBlocked(false)
                    } else {
                        setCheckoutAmounts(null)
                        setDeliveryError(result.error)
                        setOwnDeliveryBlocked(true)
                        if (result.error?.toLowerCase().includes("raio") && !destinationCep) {
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
                    setOwnDeliveryBlocked(true)
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
                        setOwnDeliveryBlocked(false)
                    } else if (
                        Boolean(quote.error) &&
                        selectedCarrierServiceId &&
                        carrierOptions.length > 0
                    ) {
                        // Own delivery has no coverage → apply selected carrier freight
                        const opt = carrierOptions.find(o => o.serviceId === selectedCarrierServiceId) || carrierOptions[0]
                        setDeliveryError(null)
                        setOwnDeliveryBlocked(true)
                        setDeliveryFee(Number(opt.price))
                        setDeliveryDistanceKm(null)
                        setDeliveryBreakdown({
                            source: "superfrete",
                            carrier: "SuperFrete",
                            serviceId: opt.serviceId,
                            serviceName: opt.serviceName,
                            companyName: opt.companyName,
                            deliveryMinDays: opt.deliveryMinDays,
                            deliveryMaxDays: opt.deliveryMaxDays,
                            toPostalCode: destinationCep,
                        })
                    } else {
                        setDeliveryError(quote.error)
                        setOwnDeliveryBlocked(true)
                        if (quote.error?.toLowerCase().includes("raio") && !destinationCep) {
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
                setOwnDeliveryBlocked(false)
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
        activeCartItemIdsKey,
        checkoutContextKey,
        formData.deliveryType,
        couponCode,
        payDepositOnly,
        depositAvailable,
        refreshTrigger,
        selectedAddressKey,
        selectedCarrierServiceId,
        destinationCep,
    ])

    // Effect 2: Payment preview - ONLY recalculate on payment method/installments changes
    useEffect(() => {
        let active = true

        const timer = window.setTimeout(async () => {
            if (!active) return

            // Payment preview
            if (shouldPreviewTraditionalPayment) {
                if (checkoutChargeTotal <= 0 && activeCartItemIds.length > 0) {
                    setPaymentPreviewLoading(true)
                    setPaymentError(null)
                    setPaymentPreview(null)
                    return
                }
                setPaymentPreviewLoading(true)
                setPaymentError(null)
                const previewInput = {
                    partnerId,
                    paymentMethodId: formData.paymentMethod,
                    originalAmount: checkoutChargeTotal,
                    installmentNumber: Math.max(1, Number(formData.installments || 1)),
                }
                const previewKey = JSON.stringify(previewInput)
                const now = Date.now()
                for (const [requestKey, request] of paymentPreviewRequestsRef.current) {
                    if (request.expiresAt <= now) paymentPreviewRequestsRef.current.delete(requestKey)
                }
                let cachedRequest = paymentPreviewRequestsRef.current.get(previewKey)
                if (!cachedRequest || cachedRequest.expiresAt <= now) {
                    if (cachedRequest) paymentPreviewRequestsRef.current.delete(previewKey)
                    const promise = previewMarketplacePaymentAction(previewInput)
                    cachedRequest = { promise, expiresAt: now + 5_000 }
                    paymentPreviewRequestsRef.current.set(previewKey, cachedRequest)
                    promise.catch(() => {
                        const current = paymentPreviewRequestsRef.current.get(previewKey)
                        if (current?.promise === promise) paymentPreviewRequestsRef.current.delete(previewKey)
                    })
                }
                const result = await cachedRequest.promise
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
        activeCartItemIds.length,
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

    const destinationCoords = useMemo(() => {
        if (!selectedAddress?.latitude || !selectedAddress?.longitude) return null
        return { lat: Number(selectedAddress.latitude), lng: Number(selectedAddress.longitude) }
    }, [selectedAddress?.latitude, selectedAddress?.longitude])

    const checkoutPricingSnapshot = useMemo(() => {
        const chargedBase = checkoutChargeTotal
        const methodDiscount = paymentOption === "traditional" && paymentPreview?.success
            ? Number(paymentPreview.paymentMethodDiscountAmount || 0)
            : 0
        const isCustomerFeeBearer = (paymentPreview?.feeBearer || "merchant") !== "merchant"
        const isCustomerInstallmentFeeBearer = (paymentPreview?.installmentFeeBearer || "merchant") !== "merchant"
        const interestAmount = Number(paymentPreview?.interestAmount || 0)
        const installmentCostAmount = Number(paymentPreview?.installmentCostAmount || 0)
        const fixedInterestAmount = Math.max(0, interestAmount - installmentCostAmount)
        const customerInterest = (isCustomerFeeBearer ? fixedInterestAmount : 0)
            + (isCustomerInstallmentFeeBearer ? installmentCostAmount : 0)
        const customerFee = isCustomerFeeBearer ? Number(paymentPreview?.feeAmount || 0) : 0
        const customerFixedFee = isCustomerFeeBearer ? Number(paymentPreview?.fixedFeeAmount || 0) : 0

        const snapshotSubtotal = checkoutAmounts
            ? (payDepositOnly && depositAvailable
                ? checkoutDepositChargeTotal - checkoutDeliveryFee + (checkoutAmounts.couponDiscountAmount || 0)
                : checkoutFullTotal - checkoutDeliveryFee + (checkoutAmounts.couponDiscountAmount || 0))
            : contextTotalSubtotal

        const destinationAddressSnapshot: MarketplaceCheckoutDestinationAddress | null =
            formData.deliveryType === "delivery"
                ? (selectedAddress
                    ? {
                        street: selectedAddress.street || "",
                        number: selectedAddress.number || null,
                        complement: selectedAddress.complement || null,
                        district: selectedAddress.neighborhood || null,
                        city: selectedAddress.city || "",
                        state: selectedAddress.state || "",
                        postalCode: (selectedAddress.zip_code || "").replace(/\D/g, "") || null,
                    }
                    : parseCheckoutAddressString(formData.deliveryAddress))
                : null

        return {
            subtotal: snapshotSubtotal,
            couponDiscount: checkoutAmounts?.couponDiscountAmount ?? couponDiscount,
            paymentMethodDiscount: methodDiscount,
            paymentMethodInterest: customerInterest,
            paymentMethodFee: customerFee,
            paymentMethodFixedFee: customerFixedFee,
            deliveryFee: checkoutDeliveryFee,
            finalTotal: checkoutTotalToCharge,
            carrierServiceId: selectedCarrierServiceId,
            destinationPostalCode: destinationCep || null,
            destinationCoords: destinationCoords || null,
            destinationAddress: destinationAddressSnapshot,
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
        destinationCoords,
        checkoutAmounts,
        checkoutFullTotal,
        checkoutDepositChargeTotal,
        checkoutDeliveryFee,
        contextTotalSubtotal,
        selectedCarrierServiceId,
        destinationCep,
        selectedAddress,
        formData.deliveryType,
        formData.deliveryAddress,
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
        ? (() => {
            const isCustomerFeeBearer = (paymentPreview.feeBearer || "merchant") !== "merchant"
            const isCustomerInstallmentFeeBearer = (paymentPreview.installmentFeeBearer || "merchant") !== "merchant"
            const interestAmount = Number(paymentPreview.interestAmount || 0)
            const installmentCostAmount = Number(paymentPreview.installmentCostAmount || 0)
            const fixedInterestAmount = Math.max(0, interestAmount - installmentCostAmount)
            const customerInterest = (isCustomerFeeBearer ? fixedInterestAmount : 0)
                + (isCustomerInstallmentFeeBearer ? installmentCostAmount : 0)
            return [
                { label: "Subtotal", value: formatCurrency(checkoutChargeTotal - checkoutDeliveryFee) },
                Number(paymentPreview.paymentMethodDiscountAmount || 0) >= 0.01
                    ? { label: "Desconto", value: `- ${formatCurrency(paymentPreview.paymentMethodDiscountAmount)}` }
                    : null,
                customerInterest >= 0.01
                    ? { label: "Juros", value: `+ ${formatCurrency(customerInterest)}` }
                    : null,
                isCustomerFeeBearer && Number(paymentPreview.feeAmount || 0) >= 0.01
                    ? { label: "Taxa", value: `+ ${formatCurrency(paymentPreview.feeAmount)}` }
                    : null,
                isCustomerFeeBearer && Number(paymentPreview.fixedFeeAmount || 0) >= 0.01
                    ? { label: "Custo do método", value: `+ ${formatCurrency(paymentPreview.fixedFeeAmount)}` }
                    : null,
                { label: "Total a cobrar", value: formatCurrency(checkoutTotalToCharge), isTotal: true },
            ].filter(Boolean) as Array<{ label: string; value: string; isTotal?: boolean }>
        })()
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

    const renderOrderBumpSection = () => {
        // Assinatura é um fluxo próprio: sem order bump ("aproveite e leve").
        if (requirements?.hasSubscriptionLines || !bumpCandidates.length) return null
        const bump = bumpCandidates[0]
        const imgUrl = bump.images?.[0] ? getR2ImageUrl(bump.images[0]) : "https://img.dudit.com.br/static/Placeholder.png"
        const isAdding = addingBumpId === bump.id
        return (
            <FormSection title="Aproveite e leve junto!">
                <ListItem
                    icon={
                        <img
                            src={imgUrl}
                            alt={bump.name}
                            className="w-full h-full object-contain rounded-full"
                        />
                    }
                    title={bump.name}
                    description={formatCurrency(Number(bump.promotional_price && bump.promotional_price < bump.price ? bump.promotional_price : bump.price))}
                    onClick={() => handleAddBumpProduct(bump)}
                    right={
                        isAdding ? (
                            <Spinner size={16} />
                        ) : (
                            <Button variant="link" size="sm" onClick={(e) => { e.stopPropagation(); handleAddBumpProduct(bump) }}>
                                Adicionar
                            </Button>
                        )
                    }
                    className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                />
            </FormSection>
        )
    }

    const renderSummaryContent = (showSubmitButton = false) => (
        <>
            <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {checkoutContext?.lines && checkoutContext.lines.length > 0 ? (
                    <>
                        {checkoutContext.lines.some((l) => l.lineKind === "product") && (
                            <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mb-2">Produtos</p>
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
                            <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-bodymb-2">Serviços</p>
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

                                </div>
                            ))}
                        {checkoutContext.lines.some((l) => l.lineKind === "subscription") && (
                            <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body pt-2 mb-2">Assinaturas</p>
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

            {!hasSubscription && couponsEnabled && (displayableCoupons.length > 0 || !!appliedCoupon || couponListLoading) && (
                <div className="mb-4 space-y-2">
                    <ListItem
                        icon={TagIcon}
                        title={appliedCoupon ? getCouponTitle(appliedCoupon) : "Escolha um cupom"}
                        titleClassName="text-sm"
                        description={
                            appliedCoupon
                                ? "Cupom aplicado"
                                : couponListLoading
                                    ? "Verificando cupons disponíveis..."
                                    : getCouponCountLabel(displayableCoupons.length)
                        }
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
                        <span>{hasCustomerLocationService && !requirements?.showProductFulfillmentOptions && !requirements?.hasSubscriptionLines ? "Deslocamento" : "Entrega"}</span>
                        <span className={(isPickup || (summaryDeliveryFee === 0 && (hasFreeDeliveryCoupon || (subscriptionOnlyCart && !deliveryQuoteLoading) || (deliveryBreakdown as any)?.isFreeByThreshold || deliverySettings?.deliveryPayer === "seller" || (deliveryBreakdown as any)?.deliveryPayer === "seller" || (hasConfiguredDeliveryRates && productDeliveryQuoteActive && !deliveryError && Boolean(formData.deliveryAddress))))) ? "text-brand-green font-semibold" : "text-brand-dark dark:text-dark-heading"}>
                            {isPickup
                                ? "Grátis"
                                : deliveryQuoteLoading && selectedCarrierServiceId == null
                                    ? "Calculando..."
                                    : (summaryDeliveryFee === 0 && (deliverySettings?.deliveryPayer === "seller" || (deliveryBreakdown as any)?.deliveryPayer === "seller" || hasFreeDeliveryCoupon || (deliveryBreakdown as any)?.isFreeByThreshold))
                                        ? (
                                            <span className="flex items-center gap-1.5 justify-end">
                                                {(deliveryBreakdown as any)?.originalFee != null && Number((deliveryBreakdown as any).originalFee) > 0 && (
                                                    <span className="line-through text-brand-inactive-text dark:text-dark-body font-normal">{formatCurrency(Number((deliveryBreakdown as any).originalFee))} | </span>
                                                )}
                                                <span className="text-brand-green font-semibold">Grátis</span>
                                            </span>
                                        )
                                        : summaryDeliveryFee > 0
                                            ? formatCurrency(summaryDeliveryFee)
                                            : subscriptionOnlyCart
                                                ? "Grátis"
                                                : !productDeliveryQuoteActive || deliveryError || !formData.deliveryAddress || !hasConfiguredDeliveryRates
                                                    ? "A combinar"
                                                    : "Grátis"
                            }
                        </span>
                    </div>
                )}
                {showDeliveryFeeRow && !isPickup && summaryDeliveryFee > 0 && deliveryBreakdown && (Number(deliveryBreakdown.distanceFee) > 0 || Number((deliveryBreakdown as any).serviceTravelFee) > 0 || (deliveryBreakdown.timeAdjustmentTotal != null && Number(deliveryBreakdown.timeAdjustmentTotal) !== 0)) && (
                    <div className="space-y-1 text-xs text-brand-inactive-text dark:text-dark-body">
                        {Number(deliveryBreakdown.baseFee) > 0 && <div className="flex justify-between"><span>Taxa base</span><span>{formatCurrency(Number(deliveryBreakdown.baseFee))}</span></div>}
                        {Number(deliveryBreakdown.distanceFee) > 0 && <div className="flex justify-between"><span>Distância {deliveryDistanceKm != null ? `(${deliveryDistanceKm.toFixed(2)} km)` : ""}</span><span>{formatCurrency(Number(deliveryBreakdown.distanceFee))}</span></div>}
                        {Number((deliveryBreakdown as any).serviceTravelFee) > 0 && (
                            <div className="flex justify-between">
                                <span>Deslocamento{(deliveryBreakdown as any).serviceTravelDistanceKm != null ? ` (${Number((deliveryBreakdown as any).serviceTravelDistanceKm).toFixed(2)} km)` : ""}</span>
                                <span>{formatCurrency(Number((deliveryBreakdown as any).serviceTravelFee))}</span>
                            </div>
                        )}
                        {deliveryBreakdown.timeAdjustmentTotal != null && Number(deliveryBreakdown.timeAdjustmentTotal) !== 0 && (
                            <div className="flex justify-between">
                                <span>Ajuste horário</span>
                                <span>{Number(deliveryBreakdown.timeAdjustmentTotal) > 0 ? `+${formatCurrency(Number(deliveryBreakdown.timeAdjustmentTotal))}` : formatCurrency(Number(deliveryBreakdown.timeAdjustmentTotal))}</span>
                            </div>
                        )}
                    </div>
                )}
                {isPickup && Boolean(requirements?.hasProductLines) && preparationEstimate && (preparationEstimate.preparationTimeMinutes > 0 || preparationEstimate.readyAt.getTime() > preparationEstimate.now.getTime()) && (
                    <InfoCard color="orange" message={`Retirada ${getReadyDayLabel(preparationEstimate)} entre ${pickupStartLabel} e ${pickupEndLabel}`} />
                )}
                {paymentOption === "traditional" && paymentPreviewLoading && (
                    <div className="flex items-center justify-between text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        <span>Calculando pagamento</span>
                        <Spinner size={16} />
                    </div>
                )}
                {paymentOption === "traditional" && paymentPreview?.success && Number(paymentPreview.paymentMethodDiscountAmount || 0) >= 0.01 && (
                    <div className="flex justify-between text-sm font-medium text-brand-green">
                        <span className="flex items-center gap-2">
                            <span>Desconto do meio de pagamento</span>
                            {paymentMethodPreviewBadge}
                        </span>
                        <span>-{formatCurrency(paymentPreview.paymentMethodDiscountAmount)}</span>
                    </div>
                )}
                {paymentOption === "traditional" && paymentPreview?.success && checkoutPricingSnapshot.paymentMethodInterest >= 0.01 && (
                    <div className="flex justify-between text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        <span className="flex items-center gap-2">
                            <span>Juros</span>
                            {paymentMethodPreviewBadge}
                        </span>
                        <span>+{formatCurrency(checkoutPricingSnapshot.paymentMethodInterest)}</span>
                    </div>
                )}
                {paymentOption === "traditional" && paymentPreview?.success && paymentPreview.feeBearer !== "merchant" && Number(paymentPreview.feeAmount || 0) >= 0.01 && (
                    <div className="flex justify-between text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        <span className="flex items-center gap-2">
                            <span>Taxas</span>
                            {paymentMethodPreviewBadge}
                        </span>
                        <span>+{formatCurrency(paymentPreview.feeAmount)}</span>
                    </div>
                )}
                {paymentOption === "traditional" && paymentPreview?.success && paymentPreview.feeBearer !== "merchant" && Number(paymentPreview.fixedFeeAmount || 0) >= 0.01 && (
                    <div className="flex justify-between text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        <span className="flex items-center gap-2">
                            <span>Custos do método</span>
                            {paymentMethodPreviewBadge}
                        </span>
                        <span>+{formatCurrency(paymentPreview.fixedFeeAmount)}</span>
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
                            : (!checkoutViaDudit || (isWhatsappFlow && paymentOption !== "mercadopago"))
                                ? `Fazer pedido via WhatsApp - ${formatCurrency(checkoutTotalToCharge)}`
                                : `Finalizar pedido - ${formatCurrency(checkoutTotalToCharge)}`
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
        const effectivePartnerId = partnerId || checkoutContext?.partner?.id
        const effectiveUserId = userId || user?.id
        if (!effectivePartnerId || !effectiveUserId || !couponsEnabled || hasSubscription) {
            setAvailableCoupons([])
            return
        }

        setCouponListLoading(true)
        setCouponError(null)

        try {
            const result = await listApplicableMarketplaceCouponsAction({
                partnerId: effectivePartnerId,
                customerId: effectiveUserId,
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
                const stillApplicable = result.coupons.find((coupon) => coupon.code === couponCode && !coupon.blocked)

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
    }, [partnerId, checkoutContext?.partner?.id, userId, user?.id, totalAmount, couponItemsKey, couponsEnabled, hasSubscription])

    // Pedido de assinatura / plano recorrente ou cupons desativados: limpa qualquer código
    // aplicado para não enviá-lo ao checkout nem exibi-lo no resumo/WhatsApp.
    useEffect(() => {
        if (couponsEnabled && !hasSubscription) return
        setAvailableCoupons([])
        setCouponCode("")
        setCouponDiscount(0)
        setSelectedCouponId("")
        setCouponError(null)
        setCouponPartialWarning(false)
        setShowCouponModal(false)
    }, [couponsEnabled, hasSubscription])

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
        const selectedCoupon = displayableCoupons.find((coupon) => coupon.id === selectedCouponId)

        if (!selectedCoupon || selectedCoupon.blocked) {
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
            if (selectedCarrierOption) {
                const carrierLabel = selectedCarrierOption.companyName
                    ? `${selectedCarrierOption.companyName} - ${selectedCarrierOption.serviceName}`
                    : selectedCarrierOption.serviceName
                msg += `- Transportadora: ${carrierLabel}\n`
                msg += `- Frete: ${formatCurrency(Number(selectedCarrierOption.price))} (${formatDeliveryDaysRange(selectedCarrierOption.deliveryMinDays, selectedCarrierOption.deliveryMaxDays)})\n`
            }
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
            const isCustomerFeeBearer = (paymentPreview.feeBearer || "merchant") !== "merchant"
            const isCustomerInstallmentFeeBearer = (paymentPreview.installmentFeeBearer || "merchant") !== "merchant"
            const interestAmount = Number(paymentPreview.interestAmount || 0)
            const installmentCostAmount = Number(paymentPreview.installmentCostAmount || 0)
            const fixedInterestAmount = Math.max(0, interestAmount - installmentCostAmount)
            const methodInterest = (isCustomerFeeBearer ? fixedInterestAmount : 0)
                + (isCustomerInstallmentFeeBearer ? installmentCostAmount : 0)
            const methodFee = isCustomerFeeBearer ? Number(paymentPreview.feeAmount || 0) : 0

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

    // Fallback padrão: quando o limite mensal do vendedor esgotou (pedidos/agendamentos),
    // o cliente continua o atendimento pelo WhatsApp do vendedor em vez de ser bloqueado.
    const redirectToSellerWhatsApp = async (reason: string): Promise<boolean> => {
        const phone = checkoutContext?.partner?.phone || partnerInfo.phone
        let cleanPhone = phone ? phone.replace(/\D/g, "") : ""
        if (cleanPhone && !cleanPhone.startsWith("55") && cleanPhone.length <= 11) {
            cleanPhone = "55" + cleanPhone
        }
        if (!cleanPhone) return false

        if (sessionData?.source === "cart" && activeCartItemIds.length > 0) {
            await deleteCartItemsAction(activeCartItemIds)
        }
        sessionStorage.removeItem("checkout_session")
        invalidateCartCache()

        const message = `${buildWhatsAppMessage()}\n*⚠️ Motivo:* ${reason}`
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, "_blank")
        notifyError("Continuar pelo WhatsApp", `${reason} Fomos direcionados ao WhatsApp do vendedor para concluir o atendimento.`)
        setIsLoading(false)
        router.push("/")
        return true
    }

    // Motivo neutro exibido ao comprador: nunca menciona plano, cota ou upgrade.
    const fallbackReason = (result: any) =>
        result?.whatsappCode === "APPOINTMENT_LIMIT_REACHED"
            ? "A loja está atendendo os agendamentos pelo WhatsApp no momento."
            : "A loja está atendendo os pedidos pelo WhatsApp no momento."

    const handleSubmit = async (e?: React.FormEvent) => {
        if (submitInFlightRef.current) return
        submitInFlightRef.current = true
        try {
            await handleSubmitInternal(e)
        } finally {
            submitInFlightRef.current = false
        }
    }

    const handleSubmitInternal = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        // Sem o contexto não dá para saber se o pedido fecha pela Dudit ou pelo
        // WhatsApp: espera o carregamento em vez de decidir no escuro.
        if (contextLoading) return
        // Preserva o erro já calculado (raio/deslocamento) antes de limpar o
        // estado: o resumo precisa continuar exibindo o motivo do bloqueio.
        const existingDeliveryError = deliveryError
        setDeliveryError(null)
        setPaymentError(null)
        setCheckoutError(null)
        setIsLoading(true)

        // Erro de entrega/deslocamento já calculado (ex.: serviço fora do raio
        // de atendimento): bloqueia antes de qualquer cobrança. Carrinhos com
        // frete próprio de produto já caem no bloqueio mais abaixo (com o modal
        // de raio), então aqui cobrimos os fluxos sem cotação de produto.
        if (existingDeliveryError && !productDeliveryQuoteActive && !(carrierSectionVisible && selectedCarrierServiceId)) {
            setDeliveryError(existingDeliveryError)
            setIsLoading(false)
            return
        }

        if (checkoutContext?.deposit.available && !bypassDepositModalRef.current) {
            setShowDepositChoiceModal(true)
            setIsLoading(false)
            return
        }
        bypassDepositModalRef.current = false

        if (activeCartItemIds.length > 0 && !checkoutAmountsReady) {
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
            if (wantsChange && (!payWithAmount || payWithAmount < remainingBalanceToCharge)) {
                setPaymentError("O valor pago não pode ser menor que o saldo restante do pedido.")
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

        if (requirements?.hasIncompatibleFulfillmentMix) {
            setDeliveryError("Este pedido mistura itens que só podem ser retirados com itens que só podem ser enviados. Ajuste os itens para continuar.")
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
                const carrierCoversError = Boolean(
                    carrierSectionVisible && selectedCarrierServiceId,
                )
                if (!carrierCoversError) {
                    setDeliveryError(deliveryError)
                    if (deliveryError.toLowerCase().includes("raio")) {
                        setShowOutsideRadiusModal(true)
                    }
                    setIsLoading(false)
                    return
                }
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
            // Fluxo WhatsApp só fecha o pedido no chat quando o pagamento é manual -
            // com Mercado Pago (ex.: entrega por transportadora) segue o fluxo normal
            // de preferência/pagamento online.
            if (!checkoutViaDudit || (isWhatsappFlow && paymentOption !== "mercadopago")) {
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

                if (sessionData?.source === "cart" && activeCartItemIds.length > 0) {
                    await deleteCartItemsAction(activeCartItemIds)
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
                                fulfillmentMode: item.productId ? (formData.deliveryType === "delivery" ? "delivery" : "pickup") : (matchedLine?.fulfillmentMode || undefined),
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
                    if (result.error) {
                        if ((result as any).whatsappFallback && await redirectToSellerWhatsApp(fallbackReason(result))) return
                        throw new Error(result.error)
                    }
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
                                fulfillmentMode: item.productId ? (formData.deliveryType === "delivery" ? "delivery" : "pickup") : (matchedLine?.fulfillmentMode || undefined),
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
                    if (result.error) {
                        if ((result as any).whatsappFallback && await redirectToSellerWhatsApp(fallbackReason(result))) return
                        throw new Error(result.error)
                    }
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
                    if ('error' in result && result.error) {
                        if ((result as any).whatsappFallback && await redirectToSellerWhatsApp(fallbackReason(result))) return
                        throw new Error(result.error)
                    }
                    sessionStorage.removeItem("checkout_session")
                    notifySuccess("Agendamento confirmado!", "Seus créditos de assinatura foram utilizados.")
                    setIsLoading(false)
                    router.push("/minhas-compras")
                }
                return
            }

            const buildOrderDetailsItems = () => {
                if (sessionData?.source === "cart" && checkoutContext?.lines?.length) {
                    return checkoutContext.lines.map((line) => {
                        const matchedCartItem = sessionData?.cartItems?.find((ci) => ci.cartItemId === line.lineId)
                        const resolvedProductId = line.productId || matchedCartItem?.productId || line.serviceId || matchedCartItem?.serviceId || line.lineId
                        const resolvedVariantId = line.variantId || matchedCartItem?.variantId || undefined
                        const resolvedServiceId = line.serviceId || matchedCartItem?.serviceId || undefined
                        return {
                            id: resolvedProductId,
                            name: line.displayName,
                            price: line.unitPrice,
                            quantity: line.quantity,
                            image: line.imageUrl || "",
                            variant_id: resolvedVariantId,
                            variant_name: line.variantName || undefined,
                            service_id: resolvedServiceId,
                            unit: (line as any).unit || null,
                            itemType: line.lineKind,
                            bookingDate: line.bookingMetadata?.date || null,
                            bookingTime: line.bookingMetadata?.time || null,
                            staffName: line.bookingMetadata?.staffName || null,
                            bookingSummary: line.bookingSummary || null,
                            fulfillmentMode: line.fulfillmentMode || (formData.deliveryType === "delivery" ? "delivery" : "pickup"),
                        }
                    })
                }
                const isServiceSession = sessionData?.itemType === "service" || sessionData?.source === "service"
                return products.map((p) => {
                    const matchedLine = checkoutContext?.lines?.find(
                        (l) => l.lineId === p.id || (p as any).cartItemId === l.lineId,
                    )
                    const resolvedServiceId = matchedLine?.serviceId
                        || (isServiceSession ? ((p as any).serviceId || p.id) : undefined)
                    return {
                        id: p.id,
                        name: p.name,
                        price: Number(p.price || matchedLine?.unitPrice || 0),
                        quantity: quantities[p.id] || p.quantity,
                        image: p.image || matchedLine?.imageUrl || "",
                        variant_id: p.variant || matchedLine?.variantId || "",
                        variant_name: matchedLine?.variantName || undefined,
                        service_id: resolvedServiceId,
                        unit: p.unit || (matchedLine as any)?.unit || null,
                        itemType: matchedLine?.lineKind || (isServiceSession ? "service_booking" : "product"),
                        bookingDate: matchedLine?.bookingMetadata?.date || null,
                        bookingTime: matchedLine?.bookingMetadata?.time || null,
                        staffName: matchedLine?.bookingMetadata?.staffName || null,
                        bookingSummary: matchedLine?.bookingSummary || null,
                        fulfillmentMode:
                            matchedLine?.fulfillmentMode ||
                            (isServiceSession ? "on_site" : (formData.deliveryType === "delivery" ? "delivery" : "pickup")),
                    }
                })
            }

            const activeAddress = selectedAddress || (userAddresses && userAddresses.length > 0 ? userAddresses[0] : null)
            const resolvedUserAddress = activeAddress ? {
                zipCode: activeAddress.zip_code?.replace(/\D/g, "") || "",
                streetName: activeAddress.street || "",
                streetNumber: activeAddress.number || "",
                neighborhood: activeAddress.neighborhood || "",
                city: activeAddress.city || "",
                federalUnit: activeAddress.state || "",
            } : (newAddressData.zipCode ? {
                zipCode: newAddressData.zipCode.replace(/\D/g, ""),
                streetName: newAddressData.street || "",
                streetNumber: newAddressData.number || "",
                neighborhood: newAddressData.neighborhood || "",
                city: newAddressData.city || "",
                federalUnit: newAddressData.state || "",
            } : undefined)

            if (paymentOption === "mercadopago") {
                const tempOrderId = "temp-" + Date.now()
                const amount = checkoutChargeTotal
                const cartItemIds = sessionData?.source === "cart"
                    ? (sessionData.cartItems || []).map((item: any) => item.cartItemId).filter(Boolean)
                    : undefined

                setPixPaymentData({
                    orderId: tempOrderId,
                    orderNumber: undefined,
                    amount,
                    orderDetails: {
                        items: buildOrderDetailsItems(),
                        deliveryType: formData.deliveryType,
                        deliveryAddress: formData.deliveryAddress,
                        storeAddress: partnerAddressLabel,
                        notes: formData.notes,
                        couponCode: couponCode || null,
                        couponDiscount: couponDiscount,
                        deliveryFee: isPickup ? 0 : checkoutDeliveryFee,
                        checkoutPricing: checkoutPricingSnapshot,
                        cartItemIds: cartItemIds,
                        storeId: storeId || checkoutContext?.store?.id || sessionData?.storeId || undefined,
                    },
                    sellerName: sessionData?.partnerInfo?.store_name || "Loja",
                    mpPublicKey: sessionData?.partnerInfo?.mpPublicKey || "",
                    useMercadoPago: true,
                    partnerId: partnerId,
                    userEmail: userEmail,
                    userName: userName,
                    userAddress: resolvedUserAddress,
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
                                fulfillmentMode: item.productId ? (formData.deliveryType === "delivery" ? "delivery" : "pickup") : (matchedLine?.fulfillmentMode || undefined),
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
                    if (result.error) {
                        if ((result as any).whatsappFallback && await redirectToSellerWhatsApp(fallbackReason(result))) return
                        throw new Error(result.error)
                    }
                    invalidateCartCache()
                    sessionStorage.removeItem("checkout_session")

                    setPixPaymentData({
                        orderId: (result as any).orderId,
                        orderNumber: (result as any).orderNumber,
                        amount: Math.max(0, Number((result as any).amountDue ?? remainingBalanceToCharge)),
                        orderDetails: {
                            items: buildOrderDetailsItems(),
                            deliveryType: formData.deliveryType,
                            deliveryAddress: formData.deliveryAddress,
                            storeAddress: partnerAddressLabel,
                            notes: formData.notes,
                            couponCode: couponCode || null,
                            couponDiscount: couponDiscount,
                            deliveryFee: showDeliveryFeeRow && !isPickup && !hasFreeDeliveryCoupon ? checkoutDeliveryFee : 0,
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
                        useStoreCredit: useStoreCredit && availableStoreCredit > 0,
                    })
                    if ('error' in result && result.error) {
                        if ((result as any).whatsappFallback && await redirectToSellerWhatsApp(fallbackReason(result))) return
                        throw new Error(result.error)
                    }
                    const successResult = result as any
                    sessionStorage.removeItem("checkout_session")

                    trackEvent("order_submitted", {
                        order_id: successResult.orderId,
                        order_number: successResult.orderNumber,
                        partner_id: partnerId,
                        store_id: storeId,
                        amount: checkoutChargeTotal,
                        payment_method: formData.paymentMethod,
                        delivery_type: formData.deliveryType,
                        items_count: products.length,
                    })

                    setPixPaymentData({
                        orderId: successResult.orderId,
                        orderNumber: successResult.orderNumber,
                        amount: Math.max(0, Number(successResult.amountDue ?? remainingBalanceToCharge)),
                        orderDetails: {
                            items: buildOrderDetailsItems(),
                            deliveryType: formData.deliveryType,
                            deliveryAddress: formData.deliveryAddress,
                            storeAddress: partnerAddressLabel,
                            notes: formData.notes,
                            couponCode: couponCode || null,
                            couponDiscount: couponDiscount,
                            deliveryFee: isPickup ? 0 : checkoutDeliveryFee,
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
            trackEvent("checkout_failed", {
                partner_id: partnerId,
                store_id: storeId,
                payment_method: formData.paymentMethod,
                error_type: isSystemError ? "system" : "validation",
            })
            setCheckoutError(msg)

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
        if (!formData.paymentMethod) return
        trackEvent("payment_method_selected", {
            payment_method: formData.paymentMethod,
            partner_id: partnerId,
            store_id: storeId,
        })
    }, [formData.paymentMethod, partnerId, storeId])

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
        setFormData(prev => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
        setPayDepositOnly(true)
    }

    if (pageLoading || !sessionData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white dark:bg-dark-surface">
                <Spinner size={32} />
            </div>
        )
    }

    if (activeCheckoutError) {
        return (
            <CheckoutErrorScreen
                message={activeCheckoutError}
                onRetry={() => {
                    setCheckoutError(null)
                    setDeliveryError(null)
                    setPaymentError(null)
                    if (window.history.length > 1) {
                        router.back()
                        return
                    }
                    setRefreshTrigger((prev) => prev + 1)
                }}
            />
        )
    }

    // Cota mensal de pedidos do plano esgotada: o pedido não pode ser criado
    // pela Dudit. Nem mostramos o formulário — o comprador continua o
    // atendimento pelo WhatsApp da loja, com o resumo do pedido na mensagem.
    if (checkoutContext && !contextLoading && checkoutCapabilities?.ordersLimitReached) {
        const limitReason = "A loja está atendendo os pedidos pelo WhatsApp no momento."
        return (
            <div className="min-h-screen flex items-center justify-center bg-white dark:bg-dark-surface px-4">
                <div className="w-full max-w-md rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 text-center space-y-4">
                    <img
                        src={storeImage}
                        alt={sellerName}
                        className="w-16 h-16 rounded-full object-cover mx-auto border border-brand-border dark:border-dark-border bg-white"
                    />
                    <h1 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{sellerName}</h1>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        {limitReason} Continue por lá para combinar entrega e pagamento.
                    </p>
                    <div className="flex flex-col gap-2 pt-2">
                        <Button
                            className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white"
                            onClick={() => { void redirectToSellerWhatsApp(limitReason) }}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <WhatsappIcon size={20} className="fill-white" />
                                Continuar no WhatsApp
                            </span>
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => router.push("/")}>
                            Voltar para a loja
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <>
            <div className="min-h-screen flex flex-col bg-white dark:bg-dark-surface">
                {/* Desktop Header */}
                <header className="hidden lg:flex flex-col w-full bg-brand-dark dark:bg-dark-surface border-b border-white/10 sticky top-0 z-50 shadow-md">
                    <div className="w-full h-[68px] flex items-center justify-between max-w-[1400px] px-2 mx-auto gap-4">
                        <Link href="/" prefetch={false} className="cursor-pointer shrink-0 z-[110] pt-1">
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
                            {checkoutContext && !checkoutViaDudit && (
                                <InfoCard
                                    color="yellow"
                                    title="Atendimento pelo WhatsApp"
                                    message="Esta loja está com o checkout da Dudit desativado. Revise o pedido e finalize pelo WhatsApp do vendedor — os detalhes da entrega e do pagamento serão enviados na mensagem."
                                />
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
                                    onDeliveryTypeChange={handleDeliveryTypeChange}
                                    partnerId={partnerId}
                                    deliveryPlanEnabled={deliveryPlanEnabled}
                                    deliveryEnabled={deliveryEnabled}
                                    pickupEnabled={pickupEnabled}
                                    shippingEnabled={shippingEnabled}
                                    partnerAddressLabel={partnerAddressLabel}
                                    deliveryError={displayDeliveryError}
                                    carrierOptions={carrierSectionVisible ? carrierOptions : []}
                                    selectedCarrierServiceId={selectedCarrierServiceId}
                                    carrierQuoteLoading={carrierSectionVisible && carrierQuoteLoading}
                                    carrierError={carrierSectionVisible && !carrierQuoteLoading ? carrierError : null}
                                    onSelectCarrier={handleCarrierSelect}
                                    deliveryFree={deliveryFree}
                                    schedulingLines={schedulingLines}
                                    lines={checkoutContext?.lines || []}
                                    onFulfillmentModesSave={handleBulkFulfillmentModesSave}
                                    deliveryAddress={formData.deliveryAddress || ""}
                                    destinationCoords={selectedAddress?.latitude && selectedAddress?.longitude
                                        ? { lat: Number(selectedAddress.latitude), lng: Number(selectedAddress.longitude) }
                                        : undefined}
                                    addressProps={{
                                        loadingAddresses,
                                        userAddresses,
                                        selectedAddress,
                                        onOpenModal: () => setShowAddressModal(true),
                                        onOpenForm: () => setShowAddressForm(true),
                                    }}
                                    ownDeliveryFee={deliveryFee}
                                    ownDeliveryDistanceKm={deliveryDistanceKm}
                                    ownDeliveryBreakdown={deliveryBreakdown}
                                    ownDeliveryQuoteLoading={deliveryQuoteLoading}
                                    ownDeliveryError={displayDeliveryError}
                                />
                            )}

                            {/* PAGAMENTO */}
                            <FormSection hasSeparator title="Pagamento">
                                <div className="space-y-6">
                                    {availableStoreCredit > 0 && (
                                        <div className="p-4 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface space-y-3 transition-all">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-brand-green/10 flex items-center justify-center shrink-0">
                                                        <TagIcon size={18} className="text-brand-green" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                            Crédito em Loja
                                                        </div>
                                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                            Você possui <strong className="text-brand-green">{formatCurrency(availableStoreCredit)}</strong> disponível nesta loja.
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
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-dark-border peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-600 peer-checked:bg-brand-green"></div>
                                                </label>
                                            </div>
                                            {useStoreCredit && (
                                                <div className="pt-2 border-t border-brand-border/40 dark:border-dark-border/40 text-xs text-brand-green font-medium flex items-center gap-1.5">
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
                                    {!mpAvailable && !storefrontMethods.length ? (
                                        <ListItem
                                            icon={MoneyIcon}
                                            title="A combinar"
                                            description="O pagamento será combinado diretamente com o vendedor."
                                            className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                        />
                                    ) : mpAvailable && (checkoutContext?.partner.orderFlow !== "whatsapp" || carrierCheckoutEngaged) ? (
                                        <>
                                            <div className="space-y-1 mb-4">
                                                <ListItem
                                                    icon={<img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain" />}
                                                    title="Mercado Pago"
                                                    description={(() => {
                                                        const mp = mpPaymentMethodsForCart
                                                        const enabled = []
                                                        if (mp?.pix === true) enabled.push("Pix")
                                                        if (mp?.credit_card === true) enabled.push("Cartão")
                                                        if (mp?.boleto === true && !payDepositOnly) enabled.push("Boleto")
                                                        if (mp?.mercado_pago_wallet === true) enabled.push("Saldo MP")
                                                        return (enabled.length > 0 ? enabled.join(", ") : "Pagamento online") + "."
                                                    })()}
                                                    className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                                    onClick={() => {
                                                        setPaymentOption("mercadopago")
                                                        setFormData(prev => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
                                                    }}
                                                    right={
                                                        <RadioButton
                                                            name="paymentOptionDesktop"
                                                            value="mercadopago"
                                                            checked={paymentOption === "mercadopago"}
                                                            onChange={() => {
                                                                setPaymentOption("mercadopago")
                                                                setFormData(prev => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
                                                            }}
                                                        />
                                                    }
                                                />

                                                {showManualPaymentOption && (
                                                    <ListItem
                                                        icon={MoneyIcon}
                                                        title={traditionalPaymentLabel}
                                                        description={
                                                            requirements?.hasPayOnService
                                                                ? "Reserve e combine o pagamento com a loja."
                                                                : "Pague na entrega ou retirada."
                                                        }
                                                        className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                                        onClick={() => {
                                                            if (requirements?.showCustomerAddressSection && !formData.deliveryAddress?.trim()) {
                                                                setDeliveryError("Selecione ou cadastre um endereço para continuar.")
                                                                return
                                                            }
                                                            setPaymentOption("traditional")
                                                            if (formData.paymentMethod === "mercadopago") {
                                                                setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
                                                            }
                                                        }}
                                                        right={
                                                            <RadioButton
                                                                name="paymentOptionDesktop"
                                                                value="traditional"
                                                                checked={paymentOption === "traditional"}
                                                                onChange={() => {
                                                                    if (requirements?.showCustomerAddressSection && !formData.deliveryAddress?.trim()) {
                                                                        setDeliveryError("Selecione ou cadastre um endereço para continuar.")
                                                                        return
                                                                    }
                                                                    setPaymentOption("traditional")
                                                                    if (formData.paymentMethod === "mercadopago") {
                                                                        setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
                                                                    }
                                                                }}
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
                                                            <InfoCard title="Endereço indisponível" message={deliveryError} color="red" />
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
                                                                                        selectedStorefrontMethod?.type === "store_credit" || selectedStorefrontMethod?.type === "vale-compra" || selectedStorefrontMethod?.type === "vale_compra" ? <img src="https://img.dudit.com.br/static/icons/payments/Voucher.png" alt="Vale-compra" className="w-5 h-5 object-contain" /> :
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
                                                                            }}>Alterar</Button>
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
                                            {showManualPaymentOption ? (
                                                <div className="space-y-1 mb-4">
                                                    <ListItem
                                                        icon={MoneyIcon}
                                                        title={traditionalPaymentLabel}
                                                        description={
                                                            requirements?.hasPayOnService
                                                                ? "Reserve e combine o pagamento com a loja."
                                                                : "Pague na entrega ou retirada."
                                                        }
                                                        className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                                        onClick={() => {
                                                            if (requirements?.showCustomerAddressSection && !formData.deliveryAddress?.trim()) {
                                                                setDeliveryError("Selecione ou cadastre um endereço para continuar.")
                                                                return
                                                            }
                                                            setPaymentOption("traditional")
                                                            if (formData.paymentMethod === "mercadopago") {
                                                                setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
                                                            }
                                                        }}
                                                        right={
                                                            <RadioButton
                                                                name="paymentOptionDesktop"
                                                                value="traditional"
                                                                checked={paymentOption === "traditional"}
                                                                onChange={() => {
                                                                    if (requirements?.showCustomerAddressSection && !formData.deliveryAddress?.trim()) {
                                                                        setDeliveryError("Selecione ou cadastre um endereço para continuar.")
                                                                        return
                                                                    }
                                                                    setPaymentOption("traditional")
                                                                    if (formData.paymentMethod === "mercadopago") {
                                                                        setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
                                                                    }
                                                                }}
                                                            />
                                                        }
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex gap-3 mb-6">
                                                    <div className="w-1 rounded-full bg-brand-border dark:bg-dark-border shrink-0" />
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">Este vendedor aceita apenas pagamentos diretos (Entrega ou Retirada).</p>
                                                </div>
                                            )}
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
                                                                        selectedStorefrontMethod?.type === "store_credit" || selectedStorefrontMethod?.type === "vale-compra" || selectedStorefrontMethod?.type === "vale_compra" ? <img src="https://img.dudit.com.br/static/icons/payments/Voucher.png" alt="Vale-compra" className="w-5 h-5 object-contain" /> :
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
                                                            <Button variant="link" onClick={() => setShowPaymentModal(true)}>Alterar</Button>
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
                                <div className="text-md bg-brand-gray dark:bg-dark-border/50 px-6 py-4 border-b border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading">
                                    Resumo do Pedido
                                </div>
                                <div className="p-6">
                                    {renderSummaryContent(true)}
                                </div>
                            </div>

                            {renderOrderBumpSection()}

                        </div>
                    </div>

                    {/* Mobile/Tablet Stage Flow Layout */}
                    <div className="block lg:hidden space-y-6">
                        {renderItemsShortcutButton()}
                        {mobileStep === 1 && showMobileFulfillmentStep && (
                            <div className="space-y-6 pb-24">
                                {contextError && <InfoCard message={contextError} color="red" />}
                                {checkoutContext && !checkoutViaDudit && (
                                    <InfoCard
                                        color="yellow"
                                        title="Atendimento pelo WhatsApp"
                                        message="Esta loja está com o checkout da Dudit desativado. Revise o pedido e finalize pelo WhatsApp do vendedor — os detalhes da entrega e do pagamento serão enviados na mensagem."
                                    />
                                )}
                                {contextLoading ? (
                                    <div className="py-8 flex justify-center">
                                        <Spinner />
                                    </div>
                                ) : requirements ? (
                                    <>
                                        <CheckoutFulfillmentPanel
                                            requirements={requirements}
                                            deliveryType={formData.deliveryType}
                                            onDeliveryTypeChange={handleDeliveryTypeChange}
                                            partnerId={partnerId}
                                            deliveryPlanEnabled={deliveryPlanEnabled}
                                            deliveryEnabled={deliveryEnabled}
                                            pickupEnabled={pickupEnabled}
                                            shippingEnabled={shippingEnabled}
                                            partnerAddressLabel={partnerAddressLabel}
                                            deliveryError={displayDeliveryError}
                                            carrierOptions={carrierSectionVisible ? carrierOptions : []}
                                            selectedCarrierServiceId={selectedCarrierServiceId}
                                            carrierQuoteLoading={carrierSectionVisible && carrierQuoteLoading}
                                            carrierError={carrierSectionVisible && !carrierQuoteLoading ? carrierError : null}
                                            onSelectCarrier={handleCarrierSelect}
                                            deliveryFree={deliveryFree}
                                            schedulingLines={schedulingLines}
                                            lines={checkoutContext?.lines || []}
                                            onFulfillmentModesSave={handleBulkFulfillmentModesSave}
                                            deliveryAddress={formData.deliveryAddress || ""}
                                            destinationCoords={selectedAddress?.latitude && selectedAddress?.longitude
                                                ? { lat: Number(selectedAddress.latitude), lng: Number(selectedAddress.longitude) }
                                                : undefined}
                                            addressProps={{
                                                loadingAddresses,
                                                userAddresses,
                                                selectedAddress,
                                                onOpenModal: () => setShowAddressModal(true),
                                                onOpenForm: () => setShowAddressForm(true),
                                            }}
                                            ownDeliveryFee={deliveryFee}
                                            ownDeliveryDistanceKm={deliveryDistanceKm}
                                            ownDeliveryBreakdown={deliveryBreakdown}
                                            ownDeliveryQuoteLoading={deliveryQuoteLoading}
                                            ownDeliveryError={displayDeliveryError}
                                        />

                                    </>
                                ) : null}

                                <div className="fixed bottom-0 left-0 right-0 p-2 z-[100] bg-white dark:bg-dark-surface border-t dark:border-white/10 flex gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={() => router.back()}
                                        disabled={isLoading}
                                        className="flex-1 h-12"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
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
                                {hasUnavailableServices && (
                                    <InfoCard
                                        message="Alguns horários não estão mais disponíveis."
                                        color="orange"
                                        bottomElement={
                                            <Button
                                                variant="link"
                                                onClick={() => setShowServiceUnavailableModal(true)}
                                            >
                                                Ver detalhes
                                            </Button>
                                        }
                                    />
                                )}
                                {renderFreeDeliveryProgressCard()}
                                {availableStoreCredit > 0 && (
                                    <div className="p-4 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-brand-green/10 flex items-center justify-center shrink-0">
                                                    <TagIcon size={18} className="text-brand-green" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                        Crédito em Loja
                                                    </div>
                                                    <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                        Você possui <strong className="text-brand-green">{formatCurrency(availableStoreCredit)}</strong> disponível
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
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-dark-border peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-600 peer-checked:bg-brand-green"></div>
                                            </label>
                                        </div>
                                        {useStoreCredit && (
                                            <div className="pt-2 border-t border-brand-border/40 dark:border-dark-border/40 text-xs text-brand-green font-medium flex items-center gap-1.5">
                                                <CheckCircleIcon size={14} className="shrink-0" />
                                                {appliedStoreCredit >= checkoutTotalToCharge ? (
                                                    <span>Seu crédito cobre 100% do pedido.</span>
                                                ) : (
                                                    <span>Abatido {formatCurrency(appliedStoreCredit)}. Pague o restante ({formatCurrency(remainingBalanceToCharge)}) abaixo.</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {/* Order Bump (não aparece em carrinho de assinatura) */}
                                {!requirements?.hasSubscriptionLines && bumpCandidates.length > 0 && (() => {
                                    const bump = bumpCandidates[0]
                                    const imgUrl = bump.images?.[0] ? getR2ImageUrl(bump.images[0]) : "https://img.dudit.com.br/static/Placeholder.png"
                                    const isAdding = addingBumpId === bump.id
                                    return (
                                        <FormSection title="Aproveite e leve junto!">
                                            <ListItem
                                                icon={
                                                    <img
                                                        src={imgUrl}
                                                        alt={bump.name}
                                                        className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-full"
                                                    />
                                                }
                                                title={bump.name}
                                                description={formatCurrency(Number(bump.promotional_price && bump.promotional_price < bump.price ? bump.promotional_price : bump.price))}
                                                onClick={() => handleAddBumpProduct(bump)}
                                                right={
                                                    isAdding ? (
                                                        <Spinner size={16} />
                                                    ) : (
                                                        <Button variant="link" size="sm" onClick={(e) => { e.stopPropagation(); handleAddBumpProduct(bump) }}>
                                                            Adicionar
                                                        </Button>
                                                    )
                                                }
                                                className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                                            />
                                        </FormSection>
                                    )
                                })()}

                                {/* Payment Selector */}
                                <FormSection title="Forma de Pagamento">
                                    {!mpAvailable && !storefrontMethods.length ? (
                                        <ListItem
                                            icon={MoneyIcon}
                                            title="A combinar"
                                            description="O pagamento será combinado diretamente com o vendedor."
                                            className="!border-none !bg-transparent !shadow-none !px-0 py-3 hover:!bg-transparent hover:!border-none"
                                        />
                                    ) : mpAvailable && (checkoutContext?.partner.orderFlow !== "whatsapp" || carrierCheckoutEngaged) ? (
                                        <div className="space-y-1">
                                            <ListItem
                                                icon={<img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain" />}
                                                title="Mercado Pago"
                                                description={(() => {
                                                    const mp = mpPaymentMethodsForCart
                                                    const enabled = []
                                                    if (mp?.pix === true) enabled.push("Pix")
                                                    if (mp?.credit_card === true) enabled.push("Cartão")
                                                    if (mp?.boleto === true && !payDepositOnly) enabled.push("Boleto")
                                                    if (mp?.mercado_pago_wallet === true) enabled.push("Saldo MP")
                                                    return (enabled.length > 0 ? enabled.join(", ") : "Pagamento online") + "."
                                                })()}
                                                className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                                                onClick={() => {
                                                    setPaymentOption("mercadopago")
                                                    setFormData(prev => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
                                                }}
                                                right={
                                                    <RadioButton
                                                        name="paymentOptionMobile"
                                                        value="mercadopago"
                                                        checked={paymentOption === "mercadopago"}
                                                        onChange={() => {
                                                            setPaymentOption("mercadopago")
                                                            setFormData(prev => ({ ...prev, paymentMethod: "mercadopago", installments: 1 }))
                                                        }}
                                                    />
                                                }
                                            />

                                            {showManualPaymentOption && (
                                                <ListItem
                                                    icon={MoneyIcon}
                                                    title={traditionalPaymentLabel}
                                                    description={
                                                        requirements?.hasPayOnService
                                                            ? "Reserve e combine o pagamento com a loja."
                                                            : "Pague ao receber ou retirar."
                                                    }
                                                    className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                                                    onClick={() => {
                                                        if (requirements?.showCustomerAddressSection && !formData.deliveryAddress?.trim()) {
                                                            setDeliveryError("Selecione ou cadastre um endereço para continuar.")
                                                            return
                                                        }
                                                        setPaymentOption("traditional")
                                                        if (formData.paymentMethod === "mercadopago") {
                                                            setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
                                                        }
                                                    }}
                                                    right={
                                                        <RadioButton
                                                            name="paymentOptionMobile"
                                                            value="traditional"
                                                            checked={paymentOption === "traditional"}
                                                            onChange={() => {
                                                                if (requirements?.showCustomerAddressSection && !formData.deliveryAddress?.trim()) {
                                                                    setDeliveryError("Selecione ou cadastre um endereço para continuar.")
                                                                    return
                                                                }
                                                                setPaymentOption("traditional")
                                                                if (formData.paymentMethod === "mercadopago") {
                                                                    setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
                                                                }
                                                            }}
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
                                        showManualPaymentOption ? (
                                            <div className="space-y-1">
                                                <ListItem
                                                    icon={MoneyIcon}
                                                    title={traditionalPaymentLabel}
                                                    description={
                                                        requirements?.hasPayOnService
                                                            ? "Reserve e combine o pagamento com a loja."
                                                            : "Pague ao receber ou retirar."
                                                    }
                                                    className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                                                    onClick={() => {
                                                        if (requirements?.showCustomerAddressSection && !formData.deliveryAddress?.trim()) {
                                                            setDeliveryError("Selecione ou cadastre um endereço para continuar.")
                                                            return
                                                        }
                                                        setPaymentOption("traditional")
                                                        if (formData.paymentMethod === "mercadopago") {
                                                            setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
                                                        }
                                                    }}
                                                    right={
                                                        <RadioButton
                                                            name="paymentOptionMobile"
                                                            value="traditional"
                                                            checked={paymentOption === "traditional"}
                                                            onChange={() => {
                                                                if (requirements?.showCustomerAddressSection && !formData.deliveryAddress?.trim()) {
                                                                    setDeliveryError("Selecione ou cadastre um endereço para continuar.")
                                                                    return
                                                                }
                                                                setPaymentOption("traditional")
                                                                if (formData.paymentMethod === "mercadopago") {
                                                                    setFormData(prev => ({ ...prev, paymentMethod: "", installments: 1 }))
                                                                }
                                                            }}
                                                        />
                                                    }
                                                />
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
                                        )
                                    )}

                                    {paymentOption === "traditional" && (
                                        <div className="mt-2 border-t border-brand-border/40 dark:border-dark-border/40 pt-2">
                                            <ListItem
                                                icon={
                                                    selectedStorefrontMethod?.type === "pix" ? <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-5 h-5 object-contain" /> :
                                                        selectedStorefrontMethod?.type === "credit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/CreditCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                            selectedStorefrontMethod?.type === "debit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/DebitCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                                selectedStorefrontMethod?.type === "store_credit" || selectedStorefrontMethod?.type === "vale-compra" || selectedStorefrontMethod?.type === "vale_compra" ? <img src="https://img.dudit.com.br/static/icons/payments/Voucher.png" alt="Vale-compra" className="w-5 h-5 object-contain" /> :
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
                                                        {formData.paymentMethod ? "Alterar" : "Selecionar"}
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
                                                        Alterar
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
                                {!hasSubscription && couponsEnabled && (displayableCoupons.length > 0 || !!appliedCoupon || couponListLoading) && (
                                    <FormSection title="Cupom de Desconto" hasSeparator>
                                        <ListItem
                                            icon={TagIcon}
                                            title={appliedCoupon ? getCouponTitle(appliedCoupon) : "Escolha um cupom"}
                                            description={
                                                appliedCoupon
                                                    ? "Cupom aplicado"
                                                    : couponListLoading
                                                        ? "Verificando cupons disponíveis..."
                                                        : getCouponCountLabel(displayableCoupons.length)
                                            }
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
                                                    : deliveryQuoteLoading && selectedCarrierServiceId == null
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
                                        {paymentOption === "traditional" && paymentPreview?.success && Number(paymentPreview.paymentMethodDiscountAmount || 0) >= 0.01 && (
                                            <div className="flex justify-between text-brand-green font-semibold">
                                                <span>Desconto do pagamento</span>
                                                <span>-{formatCurrency(paymentPreview.paymentMethodDiscountAmount)}</span>
                                            </div>
                                        )}
                                        {paymentOption === "traditional" && paymentPreview?.success && checkoutPricingSnapshot.paymentMethodInterest >= 0.01 && (
                                            <div className="flex justify-between">
                                                <span>Juros</span>
                                                <span className="text-brand-dark dark:text-dark-heading">+{formatCurrency(checkoutPricingSnapshot.paymentMethodInterest)}</span>
                                            </div>
                                        )}
                                        {paymentOption === "traditional" && paymentPreview?.success && paymentPreview.feeBearer !== "merchant" && Number(paymentPreview.feeAmount || 0) >= 0.01 && (
                                            <div className="flex justify-between">
                                                <span>Taxas</span>
                                                <span className="text-brand-dark dark:text-dark-heading">+{formatCurrency(paymentPreview.feeAmount)}</span>
                                            </div>
                                        )}
                                        {paymentOption === "traditional" && paymentPreview?.success && paymentPreview.feeBearer !== "merchant" && Number(paymentPreview.fixedFeeAmount || 0) >= 0.01 && (
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
                                        {(!checkoutViaDudit || (isWhatsappFlow && paymentOption !== "mercadopago"))
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
                                : (!checkoutViaDudit || (isWhatsappFlow && paymentOption !== "mercadopago"))
                                    ? "Fazer pedido via WhatsApp"
                                    : "Fazer pedido"
                            }
                        </Button>
                    </div>
                }
            >
                <div className="space-y-6">
                    <div className="space-y-4">
                        {renderReviewLocations()}
                    </div>

                    <div className="space-y-4">
                        <ListItem
                            icon={
                                paymentOption === "mercadopago" ? <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain" /> :
                                    selectedStorefrontMethod?.type === "pix" ? <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-5 h-5 object-contain" /> :
                                        selectedStorefrontMethod?.type === "credit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/CreditCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                            selectedStorefrontMethod?.type === "debit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/DebitCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                selectedStorefrontMethod?.type === "store_credit" || selectedStorefrontMethod?.type === "vale-compra" || selectedStorefrontMethod?.type === "vale_compra" ? <img src="https://img.dudit.com.br/static/icons/payments/Voucher.png" alt="Vale-compra" className="w-5 h-5 object-contain" /> :
                                                    MoneyIcon
                            }
                            title={paymentOption === "mercadopago" ? "Mercado Pago" : selectedStorefrontMethod ? (paymentTypeLabelMap[selectedStorefrontMethod.type] || selectedStorefrontMethod.type) : "Carregando..."}
                            description={
                                paymentOption === "mercadopago" ? (() => {
                                    const mp = mpPaymentMethodsForCart
                                    const enabled = []
                                    if (mp?.pix === true) enabled.push("Pix")
                                    if (mp?.credit_card === true) enabled.push("Cartão")
                                    if (mp?.boleto === true && !payDepositOnly) enabled.push("Boleto")
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

            {/* Order Items Sheet (mobile/tablet) */}
            <BottomSheet
                isOpen={showItemsSheet}
                onClose={() => setShowItemsSheet(false)}
            >
                <div className="space-y-5 px-1 pb-2">
                    <div>
                        <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Itens do Pedido</h3>
                        <p className="mt-1 text-sm text-brand-inactive-text dark:text-dark-body">{checkoutItemCount} item(ns) no pedido</p>
                    </div>
                    {renderSummaryContent(false)}
                </div>
            </BottomSheet>

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
                            disabled={!selectedCouponId || !displayableCoupons.some(c => c.id === selectedCouponId)}
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
                                description={`${getCouponSubtitle(coupon)}${coupon.partialApplicabilityWarning ? " Válido apenas para alguns itens do pedido." : " Aplicável a todo o pedido."}`}
                                className={`px-4 py-3 gap-4 border rounded-xl cursor-pointer ${selectedCouponId === coupon.id
                                    ? "border-brand-green bg-green-50/30 dark:bg-green-900/10"
                                    : "border-brand-border dark:border-dark-border"
                                    }`}
                                onClick={() => {
                                    setSelectedCouponId(coupon.id)
                                }}
                                right={
                                    <RadioButton
                                        name="marketplace-coupon"
                                        value={coupon.id}
                                        checked={selectedCouponId === coupon.id}
                                        onChange={() => {
                                            setSelectedCouponId(coupon.id)
                                        }}
                                    />
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
                onClose={() => {
                    setShowAddressForm(false)
                    setAddressFormError(null)
                }}
                title="Adicionar novo endereço"
            >
                <div className="flex flex-col gap-4">
                    {addressFormError && (
                        <InfoCard message={addressFormError} color="red" />
                    )}
                    <div>
                        <CepInput
                            value={newAddressData.zipCode}
                            onChange={(val) => {
                                setNewAddressData(prev => ({ ...prev, zipCode: val }))
                                if (addressFormError) setAddressFormError(null)
                            }}
                            onAddressFetched={(addr) => {
                                setNewAddressData(prev => ({
                                    ...prev,
                                    street: addr.street || prev.street,
                                    number: addr.number || prev.number,
                                    noNumber: addr.number ? addr.number === "S/N" : prev.noNumber,
                                    neighborhood: addr.neighborhood || prev.neighborhood,
                                    city: addr.city || prev.city,
                                    state: addr.state || prev.state,
                                    latitude: addr.latitude ?? prev.latitude,
                                    longitude: addr.longitude ?? prev.longitude,
                                }))
                                setAddressFormError(null)
                            }}
                            onLoadingChange={setLoadingCep}
                        />
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                        {[
                            { value: "casa", label: "Casa" },
                            { value: "trabalho", label: "Trabalho" },
                            { value: "outro", label: "Outro" },
                        ].map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setNewAddressData(prev => ({ ...prev, addressType: opt.value }))}
                                className={`px-4 py-1.5 rounded-full text-[13px] font-medium border transition-all ${newAddressData.addressType === opt.value
                                    ? "bg-brand-green text-white border-brand-green"
                                    : "bg-white text-brand-inactive-text border-gray-200 hover:border-gray-300 dark:bg-dark-surface dark:text-dark-body dark:border-dark-border dark:hover:border-dark-border"
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <div>
                        <Input
                            label="Rua/Avenida"
                            value={newAddressData.street}
                            onChange={(e) => setNewAddressData(prev => ({ ...prev, street: e.target.value }))}
                            placeholder="Rua, Avenida, etc."
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <NumberInputWithCheckbox
                                label="Número"
                                number={newAddressData.number}
                                noNumber={newAddressData.noNumber}
                                onNumberChange={(val) => setNewAddressData(prev => ({ ...prev, number: val }))}
                                onNoNumberChange={(checked) => setNewAddressData(prev => ({ ...prev, noNumber: checked, number: checked ? "S/N" : "" }))}
                                placeholder="123"
                            />
                        </div>
                        <div>
                            <Input
                                label="Complemento"
                                value={newAddressData.complement}
                                onChange={(e) => setNewAddressData(prev => ({ ...prev, complement: e.target.value }))}
                                placeholder="Apto, Bloco, etc."
                            />
                        </div>
                    </div>
                    <div>
                        <Input
                            label="Bairro"
                            value={newAddressData.neighborhood}
                            onChange={(e) => setNewAddressData(prev => ({ ...prev, neighborhood: e.target.value }))}
                            placeholder="Nome do bairro"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Input
                                label="Cidade"
                                value={newAddressData.city}
                                onChange={(e) => setNewAddressData(prev => ({ ...prev, city: e.target.value }))}
                                placeholder="Nome da cidade"
                            />
                        </div>
                        <div>
                            <StateComboBox
                                value={newAddressData.state}
                                onChange={(val) => setNewAddressData(prev => ({ ...prev, state: val }))}
                            />
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-brand-dark dark:text-dark-heading cursor-pointer pt-1">
                        <Checkbox
                            label="Definir como endereço padrão"
                            checked={newAddressData.isDefault || userAddresses.length === 0}
                            disabled={userAddresses.length === 0}
                            onChange={(checked) => setNewAddressData(prev => ({ ...prev, isDefault: checked }))}
                        />
                    </label>

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
                    boletoData={pixPaymentData.boletoData}
                    orderId={pixPaymentData.orderId}
                    amount={pixPaymentData.amount}
                    orderDetails={pixPaymentData.orderDetails}
                    orderNumber={pixPaymentData.orderNumber || pixPaymentData.orderId}
                    sellerName={partnerInfo.storeName || partnerInfo.store_name}
                    useMercadoPago={pixPaymentData.useMercadoPago}
                    partnerId={pixPaymentData.partnerId}
                    mpPublicKey={pixPaymentData.mpPublicKey}
                    userEmail={pixPaymentData.userEmail}
                    userName={pixPaymentData.userName}
                    userAddress={pixPaymentData.userAddress}
                    buyerId={userId!}
                    mpAcceptedPaymentMethods={mpPaymentMethodsForCart}
                    partnerPhone={pixPaymentData.partnerPhone}
                    pixKey={pixPaymentData.pixKey}
                    pixKeyType={pixPaymentData.pixKeyType}
                    payDepositOnly={pixPaymentData.payDepositOnly}
                    returnPath="/pedidos"
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

                    <div className="grid grid-cols-2 gap-4">
                        {/* Option Sinal */}
                        <div
                            onClick={handleSelectDeposit}
                            className="cursor-pointer group flex flex-col justify-between p-5 rounded-2xl border border-brand-green bg-brand-green/5 dark:bg-brand-green/10 hover:bg-brand-green/10 dark:hover:bg-brand-green/20 transition-all"
                        >
                            <div>
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1">
                                    Sinal / Entrada
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
                            className="cursor-pointer group flex flex-col justify-between p-5 rounded-2xl border border-brand-border dark:border-dark-border hover:border-brand-dark dark:hover:border-dark-heading bg-transparent hover:bg-brand-slate/50 dark:hover:bg-dark-border/10 transition-all"
                        >
                            <div>
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
                            className={`flex items-start border px-4 py-3 rounded-xl transition-all cursor-pointer ${selectedAddressId === address.id
                                ? "border-brand-green bg-green-50/30 dark:bg-green-900/10"
                                : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                                }`}
                        >
                            <div className="flex-1 pr-4">
                                <div className="flex items-center gap-2">
                                    <p className="font-bold text-sm text-brand-dark dark:text-dark-heading">{address.street}, {address.number}</p>
                                    {address.is_default ? (
                                        <span className="text-[10px] uppercase font-bold text-brand-green bg-brand-green/10 px-1.5 py-0.5 rounded shrink-0">
                                            Padrão
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            title="Definir como endereço padrão (reflete no ERP de todas as lojas)"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleSetDefaultAddress(address.id)
                                            }}
                                            className="text-[11px] font-medium text-brand-green hover:underline ml-auto shrink-0"
                                        >
                                            Tornar padrão
                                        </button>
                                    )}
                                </div>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">{address.neighborhood} - {address.city}/{address.state}</p>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">CEP: {address.zip_code}</p>
                            </div>
                            <div className="mt-2.5 shrink-0 pl-4">
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
                        const pickupPolicy = pickupPolicyFromContext
                        const isWhatsappTabFlow = checkoutContext?.partner?.orderFlow === "whatsapp"
                        const canPayUponPickup = isPickup && pickupPolicy === "allow_pickup_payment"
                        const mustPayOnline = isPickup && pickupPolicy === "require_online_payment"
                        // Entrega por transportadora exige Mercado Pago (sem tab
                        // manual) em qualquer fluxo - incluindo enquanto o frete
                        // próprio ainda reporta "fora do raio" (engaged). Sem
                        // transportadora, o fluxo WhatsApp fica apenas com o
                        // pagamento manual.
                        const showTraditionalTab = !carrierCheckoutEngaged && (isWhatsappTabFlow || !isPickup || canPayUponPickup)
                        const showMercadoPagoTab = mpAvailable && (!isWhatsappTabFlow || carrierCheckoutEngaged)
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

                        if (mustPayOnline && !mpAvailable && !isWhatsappTabFlow) {
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
                            <Tabs defaultValue={paymentOption || (hasSubscriptionCreditsForCheckout ? "subscription_credits" : showMercadoPagoTab ? "mercadopago" : "traditional")} onValueChange={(val) => {
                                setPaymentOption(val as "traditional" | "mercadopago" | "subscription_credits")
                                // Mantém formData.paymentMethod consistente com a tab ativa -
                                // evita preview de pagamento com "mercadopago" em modo tradicional.
                                setFormData(prev => {
                                    if (val === "mercadopago") return { ...prev, paymentMethod: "mercadopago", installments: 1 }
                                    if (val === "traditional" && prev.paymentMethod === "mercadopago") return { ...prev, paymentMethod: "", installments: 1 }
                                    return prev
                                })
                            }}>
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
                                                    const mp = mpPaymentMethodsForCart
                                                    const enabled = []
                                                    if (mp?.pix === true) enabled.push("Pix")
                                                    if (mp?.credit_card === true) enabled.push("Cartão")
                                                    if (mp?.boleto === true && !payDepositOnly) enabled.push("Boleto")
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
                                        {visibleStorefrontMethods.map((m) => {
                                            const icon = m.type === "pix" ? <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-5 h-5 object-contain" /> :
                                                m.type === "credit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/CreditCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                    m.type === "debit_card" ? <img src="https://img.dudit.com.br/static/icons/payments/DebitCard.png" alt="Cartão" className="w-5 h-5 object-contain" /> :
                                                        m.type === "store_credit" || m.type === "vale-compra" || m.type === "vale_compra" ? <img src="https://img.dudit.com.br/static/icons/payments/Voucher.png" alt="Vale-compra" className="w-5 h-5 object-contain" /> :
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

            <DefaultModal
                isOpen={showServiceUnavailableModal}
                onClose={() => setShowServiceUnavailableModal(false)}
                title="Horários Indisponíveis"
                maxWidth="lg"
            >
                <div className="space-y-4">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        Os seguintes horários não estão mais disponíveis. Você pode remarcar ou remover os serviços:
                    </p>
                    {unavailableServiceLines.map((line) => {
                        const service = { id: line.serviceId, name: line.baseName || line.displayName }
                        const p = checkoutContext?.partner
                        return (
                            <div key={line.lineId} className="flex items-center justify-between p-3 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface gap-3">
                                <div>
                                    <p className="font-bold text-brand-dark dark:text-dark-heading">{line.displayName}</p>
                                    {line.bookingSummary && (
                                        <p className="text-sm text-brand-inactive-text mt-0.5">{line.bookingSummary}</p>
                                    )}
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            if (service.id && p) window.location.href = getServiceUrl(service, p)
                                        }}
                                    >
                                        Remarcar
                                    </Button>
                                    <Button
                                        variant="outlinered"
                                        size="sm"
                                        onClick={async () => {
                                            await deleteCartItemsAction([line.lineId])
                                            setRemovedCartItems((prev) => new Set(prev).add(line.lineId))
                                            setShowServiceUnavailableModal(false)
                                        }}
                                    >
                                        Remover
                                    </Button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </DefaultModal>

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
                            disabled={tempWantsChange === null || (tempWantsChange === true && (!tempPayWithAmount || Number(tempPayWithAmount) < remainingBalanceToCharge || isNaN(Number(tempPayWithAmount))))}
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
                                    {Number(tempPayWithAmount) >= remainingBalanceToCharge ? (
                                        <p className="text-brand-inactive-text dark:text-dark-body">
                                            Troco estimado: <span className="text-brand-green font-bold">{formatCurrency(Number(tempPayWithAmount) - remainingBalanceToCharge)}</span>
                                        </p>
                                    ) : (
                                        <p className="text-red-500 font-semibold">
                                            O valor pago não pode ser menor que o saldo restante do pedido ({formatCurrency(remainingBalanceToCharge)})
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
