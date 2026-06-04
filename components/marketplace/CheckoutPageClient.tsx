"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MapPinIcon, PlusIcon, XIcon, TruckIcon, MoneyIcon, TagIcon, StoreIcon, InfoIcon, FileTextIcon, ChevronLeftIcon } from "@/lib/icons"
import { Button, Spinner, IconPlaceholder, DefaultModal, CepInput, StateComboBox, RadioButton, ListItem, InfoCard, Separator, Badge, Tooltip, FormDropdown, NumberInputWithCheckbox, FormSection } from "@/components/reusable"
import { useNotification } from "@/hooks/use-notification"
import { Input } from "@/components/reusable"
import { Textarea } from "@/components/ui/textarea"
import { getAddressesAction, createAddressAction } from "@/app/actions/shared/addresses"
import { useSupabase } from "@/providers/supabase-provider"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"
import { listApplicableMarketplaceCouponsAction, validateCouponAction } from "@/app/actions/shared/coupons"
import { useRouter } from "next/navigation"
import { PaymentWrapper } from "@/components/PaymentWrapper"
import { checkoutCartAction } from "@/app/actions/marketplace/cart"
import { createOrderAction } from "@/app/actions/marketplace/orders"
import { useCSRFToken } from "@/hooks/use-csrf-token"
import { previewMarketplacePaymentAction } from "@/app/actions/marketplace/payment-preview"
import { invalidateCartCache } from "@/hooks/use-cart"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { getPartnerDeliveryConfigAction, quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { getStorefrontPaymentMethodsAction, type StorefrontPaymentMethod } from "@/app/actions/marketplace/storefront-payment-methods"
import { getPartnerOrderBumps } from "@/app/actions/marketplace/partners"

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
    startsAt: string | null
    endsAt: string | null
    discountAmount: number
    freeShipping?: boolean
}

interface MarketplacePaymentPreview {
    success: true
    methodId: string
    methodName: string
    methodType: string
    maxInstallments: number
    finalAmount: number
    interestAmount: number
    feeAmount: number
    paymentMethodDiscountAmount: number
    installmentNumber: number
    installmentAmounts: number[]
    installmentOptions?: {
        installments: number
        installmentValue: number
        hasInterest: boolean
        totalInterest: number
        finalAmount: number
    }[]
}

const fadeVariants = {
    open: { opacity: 1, transition: { duration: 0.2 } },
    closed: { opacity: 0, transition: { duration: 0.2 } },
}

export function CheckoutPageClient() {
    const { user } = useSupabase()
    const router = useRouter()
    const csrfToken = useCSRFToken()
    const [sessionData, setSessionData] = useState<CheckoutSessionData | null>(null)
    const [pageLoading, setPageLoading] = useState(true)

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

    const formatPartnerAddress = (addr: any) => {
        if (!addr) return "Endereço não informado"
        if (typeof addr === "string") return addr
        return `${addr.street || ""}, ${addr.number || "S/N"} - ${addr.neighborhood || ""}, ${addr.city || ""} - ${addr.state || ""}`
    }

    const { error: notifyError, success: notifySuccess } = useNotification()
    const [isLoading, setIsLoading] = useState(false)
    const [deliveryError, setDeliveryError] = useState<string | null>(null)
    const [paymentError, setPaymentError] = useState<string | null>(null)

    const products = sessionData?.products || []
    const partnerId = sessionData?.partnerId || ""
    const partnerInfo = sessionData?.partnerInfo || { paymentMethods: [] } as any
    const storeImage = partnerInfo?.store_avatar || partnerInfo?.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"
    const sellerName = partnerInfo?.store_name || "Loja"

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
        zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false
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

    const [formData, setFormData] = useState({
        deliveryType: "delivery" as "delivery" | "pickup",
        deliveryAddress: "",
        paymentMethod: partnerInfo.paymentMethods?.[0] || "cash",
        notes: "",
        installments: 1,
    })

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



    const [paymentOption, setPaymentOption] = useState<"traditional" | "mercadopago">("traditional")
    const [paymentPreview, setPaymentPreview] = useState<MarketplacePaymentPreview | null>(null)
    const [paymentPreviewLoading, setPaymentPreviewLoading] = useState(false)
    const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false)
    const [deliveryEnabled, setDeliveryEnabled] = useState(true)
    const [deliveryPlanEnabled, setDeliveryPlanEnabled] = useState(true)
    const [deliveryFee, setDeliveryFee] = useState(0)
    const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null)
    const [deliveryBreakdown, setDeliveryBreakdown] = useState<{
        baseFee: number
        distanceFee: number
        timeAdjustmentTotal: number
    } | null>(null)
    const [deliverySettings, setDeliverySettings] = useState<any>(null)
    const [storefrontMethods, setStorefrontMethods] = useState<StorefrontPaymentMethod[]>([])
    const [storefrontMethodsLoading, setStorefrontMethodsLoading] = useState(true)

    const [partnerProducts, setPartnerProducts] = useState<any[]>([])
    const [loadingBumps, setLoadingBumps] = useState(false)

    useEffect(() => {
        if (!partnerId) return
        let active = true
        setLoadingBumps(true)
        getPartnerOrderBumps(partnerId)
            .then((res) => {
                if (!active) return
                if (res) {
                    setPartnerProducts(res)
                }
            })
            .catch((err) => {
                console.error("Error fetching order bump products:", err)
            })
            .finally(() => {
                if (active) setLoadingBumps(false)
            })
        return () => {
            active = false
        }
    }, [partnerId])

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
        if (storefrontMethods.length > 0 && !storefrontMethods.some(m => m.id === formData.paymentMethod)) {
            setFormData(prev => ({ ...prev, paymentMethod: storefrontMethods[0].id }))
        }
    }, [storefrontMethods, formData.paymentMethod])


    useEffect(() => {
        if (sessionData) {
            setFormData(prev => ({ ...prev, paymentMethod: partnerInfo.paymentMethods?.[0] || "cash" }))
            setPaymentOption(partnerInfo.mpConnected ? "mercadopago" : "traditional")
        }
    }, [sessionData])

    useEffect(() => {
        let active = true
        if (!partnerId) return
            ; (async () => {
                const config = await getPartnerDeliveryConfigAction(partnerId)
                if (!active || !config.success) return
                setDeliveryPlanEnabled(config.capability.deliveryEnabled)
                setDeliveryEnabled(Boolean(config.settings.isDeliveryEnabled))
                setDeliverySettings(config.settings)
                if (!config.capability.deliveryEnabled || !config.settings.isDeliveryEnabled) {
                    setFormData((prev) => ({ ...prev, deliveryType: "pickup" }))
                }
            })()
        return () => { active = false }
    }, [partnerId])

    // Carrega métodos de pagamento reais do vendedor
    useEffect(() => {
        let active = true
        if (!partnerId) return
        setStorefrontMethodsLoading(true)
            ; (async () => {
                const result = await getStorefrontPaymentMethodsAction(partnerId)
                if (!active) return
                if (result.success && result.methods.length > 0) {
                    setStorefrontMethods(result.methods)
                    // Se o método atual não está entre os disponíveis, seleciona o primeiro
                    const availableTypes = result.methods.map((m) => m.type)
                    if (!availableTypes.includes(formData.paymentMethod as any)) {
                        setFormData((prev) => ({ ...prev, paymentMethod: result.methods[0].type, installments: 1 }))
                    }
                }
                setStorefrontMethodsLoading(false)
            })()
        return () => { active = false }
    }, [partnerId])

    const [openSections, setOpenSections] = useState({ delivery: true, payment: true, notes: false })
    const toggleSection = (key: keyof typeof openSections) =>
        setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

    // PIX modal state
    const [showPixModal, setShowPixModal] = useState(false)
    const [pixPaymentData, setPixPaymentData] = useState<any>(null)

    useEffect(() => {
        if (user) {
            setUserId(user.id)
            setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário")
            setUserEmail(user.email || "")
        }
    }, [user])

    useEffect(() => {
        if (userId) loadUserAddresses()
    }, [userId])

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
        let token = csrfToken || ""
        if (!token) {
            try {
                const csrfRes = await fetch("/api/csrf-token")
                const csrfData = await csrfRes.json()
                token = csrfData.token || ""
            } catch {
                notifyError("Erro de Segurança", "Erro ao validar segurança. Recarregue a página.")
                setIsLoading(false)
                return
            }
        }
        const result = await createAddressAction({
            entityId: userId, entityType: "user",
            street, number: finalNumber, complement: newAddressData.complement,
            neighborhood, city, state, zipCode,
            isDefault: userAddresses.length === 0,
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
            setNewAddressData({ zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false })
        }
        setIsLoading(false)
    }

    const isPickup = formData.deliveryType === "pickup"
    const canUseDelivery = deliveryPlanEnabled && deliveryEnabled



    const totalAmount = products.reduce((sum, p) => sum + p.price * (quantities[p.id] || p.quantity), 0)
    const checkoutBaseTotal = Math.max(0, totalAmount - couponDiscount)
    const checkoutTotalWithDelivery = checkoutBaseTotal + (isPickup ? 0 : deliveryFee)
    const paymentTypeLabelMap: Record<string, string> = {
        pix: "Pix",
        credit_card: "Cartão de crédito",
        debit_card: "Cartão de débito",
        cash: "Dinheiro",
        other: "Outros",
    }
    // Usa métodos reais carregados do servidor; fallback para a sessão apenas durante o loading
    const paymentMethods = storefrontMethods.length > 0
        ? storefrontMethods.map((m) => ({
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
    const traditionalPaymentLabel = isPickup ? "Pagar na Retirada" : "Pagar na Entrega"
    const selectedStorefrontMethod = storefrontMethods.find((m) => m.id === formData.paymentMethod) || null
    const isCashPayment = paymentOption === "traditional" && (selectedStorefrontMethod ? selectedStorefrontMethod.type === "cash" : formData.paymentMethod === "cash")

    const renderChangeSection = () => {
        if (!isCashPayment || isPickup) return null

        return (
            <div className="mt-3 pl-8 flex items-center justify-between bg-brand-gray/30 dark:bg-dark-border/20 p-3 rounded-xl border border-brand-border/40 dark:border-dark-border/40">
                <div className="text-xs">
                    {wantsChange ? (
                        <p className="text-brand-dark dark:text-dark-heading font-medium">
                            Troco para <strong className="font-bold">{formatCurrency(payWithAmount || 0)}</strong> (Troco: <span className="text-brand-green font-bold">{formatCurrency(Math.max(0, (payWithAmount || 0) - checkoutTotalToCharge))}</span>)
                        </p>
                    ) : wantsChange === false ? (
                        <p className="text-brand-inactive-text">Não precisa de troco (valor exato)</p>
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
        if (sessionData?.source === "cart" && sessionData.cartItems?.length) {
            return sessionData.cartItems.map((item) => ({
                productId: item.itemType === "product" || !item.itemType ? item.productId : null,
                serviceId: item.itemType === "service_booking" ? (item.serviceId || item.productId) : null,
                recurringPlanId: item.itemType === "subscription" ? (item.recurringPlanId || item.productId) : null,
            }))
        }
        return products.map((product) => (
            sessionData?.itemType === "service" || sessionData?.source === "service"
                ? { serviceId: product.id }
                : { productId: product.id }
        ))
    }, [products, sessionData])
    const appliedCoupon = useMemo(
        () => availableCoupons.find((coupon) => coupon.code === couponCode) || null,
        [availableCoupons, couponCode]
    )
    const hasFreeDeliveryCoupon = Boolean(appliedCoupon?.freeShipping || appliedCoupon?.discountType === "free_shipping")

    useEffect(() => {
        let active = true
        if (!partnerId || isPickup || !formData.deliveryAddress || !canUseDelivery) {
            setDeliveryFee(0)
            setDeliveryDistanceKm(null)
            setDeliveryBreakdown(null)
            setDeliveryQuoteLoading(false)
            return
        }
        setDeliveryQuoteLoading(true)
        const timer = window.setTimeout(async () => {
            const quote = await quoteDeliveryFeeAction({
                partnerId,
                destinationAddress: formData.deliveryAddress,
                freeDeliveryCoupon: hasFreeDeliveryCoupon,
            })
            if (!active) return
            if (quote.success) {
                setDeliveryError(null)
                setDeliveryFee(Number(quote.fee || 0))
                setDeliveryDistanceKm(Number(quote.distanceKm || 0))
                setDeliveryBreakdown({
                    baseFee: Number(quote.breakdown.baseFee || 0),
                    distanceFee: Number(quote.breakdown.distanceFee || 0),
                    timeAdjustmentTotal: Number(quote.breakdown.timeAdjustmentTotal || 0),
                })
            } else {
                setDeliveryError(quote.error)
                if (quote.error?.toLowerCase().includes("raio")) {
                    setShowOutsideRadiusModal(true)
                }
                // Fallback to baseFee from server config
                const baseFee = Number(deliverySettings?.baseFee || 0)
                setDeliveryFee(baseFee)
                setDeliveryDistanceKm(null)
                setDeliveryBreakdown(null)
            }
            setDeliveryQuoteLoading(false)
        }, 250)
        return () => {
            active = false
            window.clearTimeout(timer)
        }
    }, [partnerId, isPickup, formData.deliveryAddress, hasFreeDeliveryCoupon, canUseDelivery])

    useEffect(() => {
        let active = true

        if (!shouldPreviewTraditionalPayment) {
            setPaymentPreview(null)
            setPaymentPreviewLoading(false)
            if (paymentOption !== "traditional") {
                setPaymentError(null)
            }
            return
        }

        setPaymentPreviewLoading(true)
        setPaymentError(null)

        const timer = window.setTimeout(async () => {
            const result = await previewMarketplacePaymentAction({
                partnerId,
                paymentMethodId: formData.paymentMethod,
                originalAmount: checkoutTotalWithDelivery,
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
        }, 180)

        return () => {
            active = false
            window.clearTimeout(timer)
        }
    }, [
        shouldPreviewTraditionalPayment,
        partnerId,
        paymentOption,
        formData.paymentMethod,
        formData.installments,
        checkoutTotalWithDelivery,
        isPickup,
        deliveryFee,
    ])

    useEffect(() => {
        if (!paymentPreview?.success) return

        const maxInstallments = Math.max(1, Number(paymentPreview.maxInstallments || 1))
        if (formData.installments > maxInstallments) {
            setFormData((prev) => ({ ...prev, installments: maxInstallments }))
        }
    }, [paymentPreview, formData.installments])

    useEffect(() => {
        if (isCashPayment && !isPickup && wantsChange === null && !showChangeModal) {
            setTempWantsChange(null)
            setTempPayWithAmount("")
            setShowChangeModal(true)
        }
    }, [isCashPayment, isPickup, wantsChange, showChangeModal])

    const checkoutTotalToCharge = paymentOption === "traditional" && paymentPreview?.success
        ? Number(paymentPreview.finalAmount || checkoutTotalWithDelivery)
        : checkoutTotalWithDelivery
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
            { label: "Subtotal", value: formatCurrency(checkoutBaseTotal) },
            Number(paymentPreview.paymentMethodDiscountAmount || 0) > 0
                ? { label: "Desconto", value: `- ${formatCurrency(paymentPreview.paymentMethodDiscountAmount)}` }
                : null,
            Number(paymentPreview.interestAmount || 0) > 0
                ? { label: "Juros", value: `+ ${formatCurrency(paymentPreview.interestAmount)}` }
                : null,
            Number(paymentPreview.feeAmount || 0) > 0
                ? { label: "Taxa", value: `+ ${formatCurrency(paymentPreview.feeAmount)}` }
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
    const disableCheckoutSubmit = isLoading
        || (paymentOption === "traditional" && (paymentPreviewLoading || storefrontMethodsLoading || (!paymentPreview?.success && shouldPreviewTraditionalPayment)))
        || (!isPickup && (deliveryQuoteLoading || !!deliveryError))

    const renderSummaryContent = (showSubmitButton = false) => (
        <>
            <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {products.map((item) => {
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
                                    <div className="text-xs text-brand-inactive-text mt-0.5">
                                        {item.variant.includes(":") ? item.variant.split(":")[1].trim() : item.variant}
                                    </div>
                                )}
                                <div className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">
                                    {formatCurrency(item.price)}
                                </div>
                            </div>
                            <div className="text-sm text-brand-inactive-text shrink-0 pr-1">
                                x{qty}
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="mb-4 space-y-2">
                <ListItem
                    icon={TagIcon}
                    title={appliedCoupon ? getCouponTitle(appliedCoupon) : "Escolha um cupom"}
                    titleClassName="text-sm"
                    description={appliedCoupon ? "Cupom aplicado" : (couponListLoading ? "Verificando cupons disponíveis..." : getCouponCountLabel(availableCoupons.length))}
                    className="px-0 py-4 gap-4 border-y border-x-0 border-brand-border dark:border-dark-border !bg-transparent !rounded-none shadow-none hover:border-brand-border dark:hover:border-dark-border"
                    onClick={() => {
                        if (!couponListLoading && availableCoupons.length > 0) {
                            setSelectedCouponId(appliedCoupon?.id || "")
                            setShowCouponModal(true)
                        }
                    }}
                    showChevron={!couponListLoading && availableCoupons.length > 0 && !appliedCoupon}
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
                        Este cupom não se aplica a alguns itens do seu carrinho. O desconto foi calculado apenas sobre os itens elegíveis.
                    </p>
                )}
            </div>

            <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm font-medium text-brand-inactive-text">
                    <span>Subtotal</span>
                    <span className="text-brand-dark dark:text-dark-heading">{formatCurrency(totalAmount)}</span>
                </div>
                {couponDiscount > 0 && (
                    <div className="flex justify-between text-sm font-medium text-brand-green">
                        <span>Desconto do cupom</span>
                        <span>-{formatCurrency(couponDiscount)}</span>
                    </div>
                )}
                <div className="flex justify-between text-sm font-medium text-brand-inactive-text">
                    <span>Entrega</span>
                    <span className={(isPickup || (deliveryFee === 0 && (hasFreeDeliveryCoupon || !canUseDelivery))) ? "text-brand-green font-semibold" : "text-brand-dark dark:text-dark-heading"}>
                        {isPickup
                            ? "Grátis"
                            : deliveryQuoteLoading
                                ? "Calculando..."
                                : deliveryFee > 0
                                    ? formatCurrency(deliveryFee)
                                    : hasFreeDeliveryCoupon
                                        ? "Grátis"
                                        : !canUseDelivery || deliveryError || !formData.deliveryAddress
                                            ? "A combinar"
                                            : "Grátis"
                        }
                    </span>
                </div>
                {!isPickup && deliveryBreakdown && (
                    <div className="space-y-1 text-xs text-brand-inactive-text">
                        {deliveryBreakdown.baseFee > 0 && <div className="flex justify-between"><span>Taxa base</span><span>{formatCurrency(deliveryBreakdown.baseFee)}</span></div>}
                        {deliveryBreakdown.distanceFee > 0 && <div className="flex justify-between"><span>Distância {deliveryDistanceKm != null ? `(${deliveryDistanceKm.toFixed(2)} km)` : ""}</span><span>{formatCurrency(deliveryBreakdown.distanceFee)}</span></div>}
                        {deliveryBreakdown.timeAdjustmentTotal > 0 && <div className="flex justify-between"><span>Ajuste horário</span><span>{formatCurrency(deliveryBreakdown.timeAdjustmentTotal)}</span></div>}
                    </div>
                )}
                {isPickup && preparationEstimate && preparationEstimate.preparationTimeMinutes > 0 && (
                    <div className="text-xs text-brand-inactive-text">
                        Retirada entre {pickupStartLabel} e {pickupEndLabel}
                    </div>
                )}
                {paymentOption === "traditional" && paymentPreviewLoading && (
                    <div className="flex items-center justify-between text-sm font-medium text-brand-inactive-text">
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
                {paymentOption === "traditional" && paymentPreview?.success && Number(paymentPreview.interestAmount || 0) > 0 && (
                    <div className="flex justify-between text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        <span className="flex items-center gap-2">
                            <span>Juros</span>
                            {paymentMethodPreviewBadge}
                        </span>
                        <span>+{formatCurrency(paymentPreview.interestAmount)}</span>
                    </div>
                )}
                {paymentOption === "traditional" && paymentPreview?.success && Number(paymentPreview.feeAmount || 0) > 0 && (
                    <div className="flex justify-between text-sm font-medium text-brand-inactive-text">
                        <span className="flex items-center gap-2">
                            <span>Taxas</span>
                            {paymentMethodPreviewBadge}
                        </span>
                        <span>+{formatCurrency(paymentPreview.feeAmount)}</span>
                    </div>
                )}
            </div>

            <Separator className="mb-4" />

            <div className="flex justify-between items-end mb-4">
                <span className="font-bold text-xl text-brand-dark dark:text-dark-heading">Total a cobrar</span>
                <span className="font-bold text-xl text-brand-dark dark:text-dark-heading">{formatCurrency(checkoutTotalToCharge)}</span>
            </div>

            {showSubmitButton && (
                <Button
                    onClick={(e) => handleSubmit(e as any)}
                    disabled={disableCheckoutSubmit}
                    className="w-full h-[46px]"
                >
                    {isLoading ? "Processando..." : paymentPreviewLoading ? "Calculando pagamento..." : `Finalizar pedido • ${formatCurrency(checkoutTotalToCharge)}`}
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
    }, [partnerId, userId, totalAmount, couponItems])

    const refreshCouponPartialWarning = async (code: string) => {
        if (!partnerId || !code.trim()) {
            setCouponPartialWarning(false)
            return
        }
        const result = await validateCouponAction({
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

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        setDeliveryError(null)
        setPaymentError(null)
        setIsLoading(true)

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

        if (formData.deliveryType === "delivery") {
            if (!canUseDelivery) {
                setDeliveryError("Entrega indisponível para este plano ou loja.")
                setIsLoading(false)
                return
            }
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
        }

        try {
            if (paymentOption === "mercadopago") {
                const amount = checkoutTotalWithDelivery
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
                    userName: userName
                })
                setShowPixModal(true)
                setIsLoading(false)
                return
            } else {
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
                const token = csrfToken || await fetch("/api/csrf-token").then((r) => r.json()).then((d) => d.token || "")
                if (sessionData?.source === "cart") {
                    const items = sessionData.cartItems || []
                    const result = await checkoutCartAction(
                        items.map(item => ({
                            cartItemId: item.cartItemId,
                            productId: item.productId || "",
                            variantId: item.variantId,
                            quantity:
                                quantities[item.cartItemId]
                                || quantities[item.productId || item.serviceId || item.recurringPlanId || ""]
                                || item.quantity,
                        })),
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
                    )
                    if (result.error) throw new Error(result.error)
                    invalidateCartCache()
                    sessionStorage.removeItem("checkout_session")

                    setPixPaymentData({
                        orderId: result.orderId,
                        orderNumber: result.orderNumber,
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
                        },
                        sellerName: sessionData?.partnerInfo?.store_name || "Loja",
                        useMercadoPago: false,
                        partnerId: partnerId,
                        userEmail: userEmail,
                        userName: userName
                    })
                    setShowPixModal(true)
                    setIsLoading(false)
                } else {
                    const result = await createOrderAction({
                        itemId: sessionData?.itemId || products[0]?.id || "",
                        itemType: sessionData?.itemType || "product",
                        quantity: quantities[products[0]?.id] || products[0]?.quantity || 1,
                        totalAmount: checkoutTotalWithDelivery,
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
                    })
                    if (result.error) throw new Error(result.error)
                    sessionStorage.removeItem("checkout_session")

                    setPixPaymentData({
                        orderId: result.orderId,
                        orderNumber: result.orderNumber,
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
                        },
                        sellerName: sessionData?.partnerInfo?.store_name || "Loja",
                        useMercadoPago: false,
                        partnerId: partnerId,
                        userEmail: userEmail,
                        userName: userName
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
                <header className="hidden lg:flex flex-col w-full bg-brand-dark sticky top-0 z-50 shadow-md">
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
                    <div className="text-xs text-white/80 font-medium">
                        Etapa {mobileStep}/2
                    </div>
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
                            <p className="text-md text-brand-inactive-text mt-1">Conclua seu pedido informando os dados de entrega e pagamento.</p>
                        </div>
                    </div>

                    {/* Desktop Two-Column Layout */}
                    <div className="hidden lg:grid grid-cols-12 gap-8 items-start">
                        {/* Left Column (dados do pedido) */}
                        <div className="col-span-8 space-y-6 pr-6">
                            {/* ENTREGA */}
                            <FormSection title="Entrega">
                                <div className="space-y-6">
                                    <div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {canUseDelivery && (
                                                <ListItem
                                                    icon={TruckIcon}
                                                    title="Entrega"
                                                    description="Receba em casa"
                                                    className={`px-4 py-3 gap-4 ${formData.deliveryType === "delivery" ? "border-brand-green dark:border-brand-green" : ""}`}
                                                    onClick={() => setFormData({ ...formData, deliveryType: "delivery" })}
                                                    right={
                                                        <RadioButton
                                                            name="deliveryTypeDesktop"
                                                            value="delivery"
                                                            checked={!isPickup}
                                                            onChange={() => setFormData({ ...formData, deliveryType: "delivery" })}
                                                        />
                                                    }
                                                />
                                            )}
                                            <ListItem
                                                icon={StoreIcon}
                                                title="Retirada no local"
                                                description="Retire imediatamente"
                                                className={`px-4 py-3 gap-4 ${isPickup ? "border-brand-green dark:border-brand-green" : ""}`}
                                                onClick={() => {
                                                    setFormData({ ...formData, deliveryType: "pickup" })
                                                    if (partnerInfo.mpConnected) setPaymentOption("mercadopago")
                                                }}
                                                right={
                                                    <RadioButton
                                                        name="deliveryTypeDesktop"
                                                        value="pickup"
                                                        checked={isPickup}
                                                        onChange={() => {
                                                            setFormData({ ...formData, deliveryType: "pickup" })
                                                            if (partnerInfo.mpConnected) setPaymentOption("mercadopago")
                                                        }}
                                                    />
                                                }
                                            />
                                        </div>
                                    </div>

                                    <AnimatePresence mode="wait">
                                        {isPickup && (
                                            <motion.div key="pickup" initial="closed" animate="open" exit="closed" variants={fadeVariants}>
                                                <div className="flex items-stretch gap-3">
                                                    <img
                                                        src="https://img.dudit.com.br/static/Map.png"
                                                        alt="Mapa do local"
                                                        className="w-12 h-12 object-cover rounded-xl shrink-0"
                                                    />
                                                    <div className="flex flex-col justify-center">
                                                        <p className="text-md font-bold text-brand-dark dark:text-dark-heading">Local de Retirada</p>
                                                        <p className="text-sm text-brand-inactive-text">{formatPartnerAddress(partnerInfo.address)}</p>
                                                        {preparationEstimate && preparationEstimate.preparationTimeMinutes > 0 && (
                                                            <p className="text-xs text-brand-inactive-text mt-1">
                                                                Pronto em {preparationEstimate.readyInMinutes} minutos • Retirar a partir de {pickupStartLabel}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                        {!isPickup && (
                                            <motion.div key="delivery" initial="closed" animate="open" exit="closed" variants={fadeVariants}>
                                                {loadingAddresses ? (
                                                    <div className="py-8 text-center text-sm text-gray-400">Carregando endereços...</div>
                                                ) : userAddresses.length > 0 && selectedAddress ? (
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex items-stretch gap-3">
                                                            <img
                                                                src="https://img.dudit.com.br/static/Map.png"
                                                                alt="Endereço de entrega"
                                                                className="w-12 h-12 object-cover rounded-xl shrink-0"
                                                            />
                                                            <div className="flex flex-col justify-center">
                                                                <p className="text-md font-bold text-brand-dark dark:text-dark-heading">Endereço de Entrega</p>
                                                                <p className="text-sm text-brand-inactive-text">{selectedAddress.street}, {selectedAddress.number}</p>
                                                            </div>
                                                        </div>
                                                        <Button variant="link" onClick={() => setShowAddressModal(true)}>Trocar</Button>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center border-t border-brand-border dark:border-dark-border pt-6">
                                                        <IconPlaceholder
                                                            icon={MapPinIcon}
                                                            title="Nenhum endereço cadastrado"
                                                            subtitle="Adicione um endereço para receber sua entrega."
                                                            itemButton={{
                                                                text: "Cadastrar Endereço",
                                                                action: () => setShowAddressForm(true),
                                                                variant: "outline"
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {deliveryError && (
                                        <div className="flex gap-3 mt-4 w-full">
                                            <InfoCard message={`${deliveryError}`} color="red" />
                                        </div>
                                    )}
                                </div>
                            </FormSection>

                            {/* PAGAMENTO */}
                            <FormSection hasSeparator title="Pagamento">
                                <div className="space-y-6">
                                    {partnerInfo.mpConnected ? (
                                        <>
                                            <div className="space-y-1 mb-4">
                                                <ListItem
                                                    icon={<img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain" />}
                                                    title="Mercado Pago"
                                                    description="Pague com cartão, Pix ou saldo MP."
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
                                                {(!isPickup || !partnerInfo.mpConnected) && (
                                                    <ListItem
                                                        icon={MoneyIcon}
                                                        title={traditionalPaymentLabel}
                                                        description="Pague na entrega ou retirada."
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
                                                                            label: `${opt.installments}x de ${formatCurrency(opt.installmentValue)}${opt.hasInterest ? "" : " sem juros"}`
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
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex gap-3 mb-6">
                                                <div className="w-1 rounded-full bg-brand-border dark:bg-dark-border shrink-0" />
                                                <p className="text-sm text-brand-inactive-text">Este vendedor aceita apenas pagamentos diretos (Entrega ou Retirada).</p>
                                            </div>
                                            <div className="mb-6">
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
                                                                    label: `${opt.installments}x de ${formatCurrency(opt.installmentValue)}${opt.hasInterest ? "" : " sem juros"}`
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
                            <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface">
                                <div className="text-md bg-brand-gray/50 dark:bg-emerald-900/10 px-6 py-4 border-b border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading">
                                    Resumo do Pedido
                                </div>
                                <div className="p-6">
                                    {renderSummaryContent(true)}
                                </div>
                            </div>

                            {/* ORDER BUMP SECTION (Desktop) */}
                            {bumpCandidates.length > 0 && (
                                <div className="border border-brand-border dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="text-sm">✨</span>
                                        <div>
                                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                Adicionar Oferta Especial
                                            </h3>
                                            <p className="text-[11px] text-brand-inactive-text">
                                                Aproveite e leve também este produto da loja com entrega única!
                                            </p>
                                        </div>
                                    </div>
                                    {bumpCandidates.slice(0, 1).map((p: any) => {
                                        const img = p.images?.[0] || p.fallback_variant_image || "https://img.dudit.com.br/static/Placeholder.png"
                                        const basePrice = Number(p.price)
                                        const promoPrice = p.promotional_price ? Number(p.promotional_price) : 0
                                        const price = (promoPrice > 0 && promoPrice < basePrice) ? promoPrice : basePrice

                                        return (
                                            <div
                                                key={p.id}
                                                className="flex items-center gap-3 p-3 border border-brand-border dark:border-dark-border rounded-lg bg-brand-slate/10 dark:bg-dark-border/10 animate-fade-in"
                                            >
                                                <div className="w-12 h-12 bg-white border border-brand-border dark:border-dark-border rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                                                    <img src={img} alt={p.name} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-brand-dark dark:text-dark-heading text-xs truncate">
                                                        {p.name}
                                                    </h4>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        {promoPrice > 0 && promoPrice < basePrice && (
                                                            <span className="text-[10px] line-through text-brand-inactive-text">
                                                                {formatCurrency(basePrice)}
                                                            </span>
                                                        )}
                                                        <span className="text-xs font-bold text-brand-green">
                                                            {formatCurrency(price)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => handleAddBumpProduct(p)}
                                                    className="h-7 text-[11px] font-bold px-2.5 shrink-0"
                                                >
                                                    Adicionar
                                                </Button>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mobile/Tablet Stage Flow Layout */}
                    <div className="block lg:hidden space-y-6">
                        {mobileStep === 1 && (
                            <div className="space-y-6 pb-24">
                                <div className="space-y-4">
                                    <h3 className="text-md font-bold text-brand-dark dark:text-dark-heading">Opção de Envio</h3>
                                    <div className="grid grid-cols-2 gap-2 bg-brand-slate/20 dark:bg-dark-border/40 p-1 rounded-xl">
                                        {canUseDelivery && (
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, deliveryType: "delivery" })}
                                                className={`py-2 px-3 text-sm font-semibold rounded-lg transition-all ${
                                                    formData.deliveryType === "delivery"
                                                        ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading shadow-sm"
                                                        : "text-brand-inactive-text"
                                                }`}
                                            >
                                                Entrega
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFormData({ ...formData, deliveryType: "pickup" })
                                                if (partnerInfo.mpConnected) setPaymentOption("mercadopago")
                                            }}
                                            className={`py-2 px-3 text-sm font-semibold rounded-lg transition-all ${
                                                formData.deliveryType === "pickup"
                                                    ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading shadow-sm"
                                                    : "text-brand-inactive-text"
                                            }`}
                                            style={!canUseDelivery ? { gridColumn: "span 2" } : undefined}
                                        >
                                            Retirada no local
                                        </button>
                                    </div>
                                </div>

                                {formData.deliveryType === "delivery" ? (
                                    <div className="space-y-4">
                                        {loadingAddresses ? (
                                            <div className="py-8 text-center text-sm text-gray-400">Carregando endereços...</div>
                                        ) : userAddresses.length > 0 && selectedAddress ? (
                                            <div className="flex items-center justify-between w-full p-4 border border-brand-border dark:border-dark-border rounded-xl bg-brand-slate/10 dark:bg-dark-border/10">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <MapPinIcon className="w-5 h-5 text-brand-green shrink-0" />
                                                    <div className="flex flex-col min-w-0">
                                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                            {selectedAddress.street}, {selectedAddress.number}
                                                        </p>
                                                        <p className="text-xs text-brand-inactive-text truncate">
                                                            {selectedAddress.neighborhood} - {selectedAddress.city}/{selectedAddress.state}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button variant="link" size="sm" onClick={() => setShowAddressModal(true)}>
                                                    Trocar
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center p-6 border border-dashed border-brand-border dark:border-dark-border rounded-xl">
                                                <p className="text-sm text-brand-inactive-text mb-4 text-center">Nenhum endereço selecionado</p>
                                                <Button variant="outline" size="sm" onClick={() => setShowAddressForm(true)}>
                                                    Adicionar endereço
                                                </Button>
                                            </div>
                                        )}

                                        {/* Static delivery fee display */}
                                        {!deliveryQuoteLoading && !deliveryError && formData.deliveryAddress && (
                                            <div className="flex justify-between items-center py-3 border-t border-brand-border dark:border-dark-border">
                                                <span className="text-sm font-medium text-brand-inactive-text">Taxa de entrega</span>
                                                <span className={`text-sm font-bold ${deliveryFee > 0 ? "text-brand-dark dark:text-dark-heading" : "text-brand-green font-semibold"}`}>
                                                    {deliveryFee > 0 ? formatCurrency(deliveryFee) : "Grátis"}
                                                </span>
                                            </div>
                                        )}

                                        {deliveryError && (
                                            <InfoCard message={deliveryError} color="red" />
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-3 p-4 border border-brand-border dark:border-dark-border rounded-xl bg-brand-slate/10 dark:bg-dark-border/10">
                                        <img
                                            src="https://img.dudit.com.br/static/Map.png"
                                            alt="Mapa"
                                            className="w-12 h-12 object-cover rounded-lg shrink-0"
                                        />
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Local de Retirada</p>
                                            <p className="text-xs text-brand-inactive-text whitespace-pre-line leading-snug">
                                                {formatPartnerAddress(partnerInfo.address)}
                                            </p>
                                            {preparationEstimate && preparationEstimate.preparationTimeMinutes > 0 && (
                                                <p className="text-[11px] text-brand-inactive-text mt-1.5 font-medium">
                                                    Pronto em {preparationEstimate.readyInMinutes} min • Retirar das {pickupStartLabel} às {pickupEndLabel}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ORDER BUMP SECTION (Mobile) */}
                                {bumpCandidates.length > 0 && (
                                    <div className="border border-brand-border dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface p-4 mt-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-sm">✨</span>
                                            <div>
                                                <h3 className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                                                    Adicionar Oferta Especial
                                                </h3>
                                                <p className="text-[10px] text-brand-inactive-text">
                                                    Aproveite e leve também este produto da loja!
                                                </p>
                                            </div>
                                        </div>
                                        {bumpCandidates.slice(0, 1).map((p: any) => {
                                            const img = p.images?.[0] || p.fallback_variant_image || "https://img.dudit.com.br/static/Placeholder.png"
                                            const basePrice = Number(p.price)
                                            const promoPrice = p.promotional_price ? Number(p.promotional_price) : 0
                                            const price = (promoPrice > 0 && promoPrice < basePrice) ? promoPrice : basePrice

                                            return (
                                                <div
                                                    key={p.id}
                                                    className="flex items-center gap-2.5 p-2.5 border border-brand-border dark:border-dark-border rounded-lg bg-brand-slate/10 dark:bg-dark-border/10"
                                                >
                                                    <div className="w-10 h-10 bg-white border border-brand-border dark:border-dark-border rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                                                        <img src={img} alt={p.name} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-bold text-brand-dark dark:text-dark-heading text-[11px] truncate">
                                                            {p.name}
                                                        </h4>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            {promoPrice > 0 && promoPrice < basePrice && (
                                                                <span className="text-[9px] line-through text-brand-inactive-text">
                                                                    {formatCurrency(basePrice)}
                                                                </span>
                                                            )}
                                                            <span className="text-[11px] font-bold text-brand-green">
                                                                {formatCurrency(price)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => handleAddBumpProduct(p)}
                                                        className="h-6 text-[10px] font-bold px-2 shrink-0"
                                                    >
                                                        Adicionar
                                                    </Button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {/* Bottom Bar Step 1 */}
                                <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 z-[100] flex gap-3">
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
                                        disabled={formData.deliveryType === "delivery" && (!formData.deliveryAddress || !!deliveryError || deliveryQuoteLoading)}
                                        className="flex-1 h-12"
                                    >
                                        Continuar
                                    </Button>
                                </div>
                            </div>
                        )}

                        {mobileStep === 2 && (
                            <div className="space-y-6 pb-28">
                                {/* Payment Selector */}
                                <div className="space-y-4">
                                    <h3 className="text-md font-bold text-brand-dark dark:text-dark-heading">Forma de Pagamento</h3>
                                    {partnerInfo.mpConnected ? (
                                        <div className="space-y-1">
                                            <ListItem
                                                icon={<img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain" />}
                                                title="Mercado Pago"
                                                description="Cartão, Pix ou saldo MP."
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
                                            {(!isPickup || !partnerInfo.mpConnected) && (
                                                <ListItem
                                                    icon={MoneyIcon}
                                                    title={traditionalPaymentLabel}
                                                    description="Pague ao receber ou retirar."
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
                                        </div>
                                    ) : (
                                        <div className="flex gap-2.5 pb-2">
                                            <div className="w-1 rounded-full bg-brand-border dark:bg-dark-border shrink-0" />
                                            <p className="text-xs text-brand-inactive-text">Pagamento direto com o vendedor (Entrega ou Retirada).</p>
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
                                                title={selectedStorefrontMethod ? (paymentTypeLabelMap[selectedStorefrontMethod.type] || selectedStorefrontMethod.type) : "Carregando..."}
                                                description={
                                                    selectedStorefrontMethod?.type === "pix" ? "Pagamento instantâneo via Pix" :
                                                    selectedStorefrontMethod?.type.includes("card") ? "Pagamento com maquininha" :
                                                    wantsChange ? `Dinheiro (Troco para R$ ${payWithAmount?.toFixed(2).replace('.', ',')})` :
                                                    wantsChange === false ? "Dinheiro (Valor exato)" : "Pagamento em dinheiro"
                                                }
                                                className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                                                right={
                                                    <Button variant="link" size="sm" onClick={() => setShowPaymentModal(true)}>Trocar</Button>
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
                                                                label: `${opt.installments}x de ${formatCurrency(opt.installmentValue)}${opt.hasInterest ? "" : " sem juros"}`
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

                                    {paymentError && (
                                        <div className="flex gap-3 mt-4 w-full">
                                            <InfoCard message={`${paymentError}`} color="red" />
                                        </div>
                                    )}
                                </div>

                                {/* Coupon Selector */}
                                <div className="border-t border-brand-border/40 dark:border-dark-border/40 pt-4">
                                    <ListItem
                                        icon={TagIcon}
                                        title={appliedCoupon ? getCouponTitle(appliedCoupon) : "Escolha um cupom"}
                                        titleClassName="text-sm"
                                        description={appliedCoupon ? "Cupom aplicado" : (couponListLoading ? "Verificando cupons disponíveis..." : getCouponCountLabel(availableCoupons.length))}
                                        className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                                        onClick={() => {
                                            if (!couponListLoading && availableCoupons.length > 0) {
                                                setSelectedCouponId(appliedCoupon?.id || "")
                                                setShowCouponModal(true)
                                            }
                                        }}
                                        showChevron={!couponListLoading && availableCoupons.length > 0 && !appliedCoupon}
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
                                            Cupom elegível apenas para alguns itens do carrinho.
                                        </p>
                                    )}
                                </div>

                                {/* Observations */}
                                <div className="border-t border-brand-border/40 dark:border-dark-border/40 pt-4">
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
                                </div>

                                {/* Totals Summary */}
                                <div className="border-t border-brand-border/40 dark:border-dark-border/40 pt-4 space-y-2 text-sm text-brand-inactive-text">
                                    <div className="flex justify-between">
                                        <span>Subtotal</span>
                                        <span className="text-brand-dark dark:text-dark-heading">{formatCurrency(totalAmount)}</span>
                                    </div>
                                    {couponDiscount > 0 && (
                                        <div className="flex justify-between text-brand-green font-semibold">
                                            <span>Desconto do cupom</span>
                                            <span>-{formatCurrency(couponDiscount)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span>Entrega</span>
                                        <span className={(isPickup || (deliveryFee === 0 && (hasFreeDeliveryCoupon || !canUseDelivery))) ? "text-brand-green font-semibold" : "text-brand-dark dark:text-dark-heading"}>
                                            {isPickup ? "Grátis" : deliveryFee > 0 ? formatCurrency(deliveryFee) : "Grátis"}
                                        </span>
                                    </div>
                                    {paymentOption === "traditional" && paymentPreview?.success && Number(paymentPreview.paymentMethodDiscountAmount || 0) > 0 && (
                                        <div className="flex justify-between text-brand-green font-semibold">
                                            <span>Desconto do pagamento</span>
                                            <span>-{formatCurrency(paymentPreview.paymentMethodDiscountAmount)}</span>
                                        </div>
                                    )}
                                    {paymentOption === "traditional" && paymentPreview?.success && Number(paymentPreview.interestAmount || 0) > 0 && (
                                        <div className="flex justify-between">
                                            <span>Juros</span>
                                            <span className="text-brand-dark dark:text-dark-heading">+{formatCurrency(paymentPreview.interestAmount)}</span>
                                        </div>
                                    )}
                                    {paymentOption === "traditional" && paymentPreview?.success && Number(paymentPreview.feeAmount || 0) > 0 && (
                                        <div className="flex justify-between">
                                            <span>Taxas</span>
                                            <span className="text-brand-dark dark:text-dark-heading">+{formatCurrency(paymentPreview.feeAmount)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-base font-bold text-brand-dark dark:text-dark-heading pt-2 border-t border-brand-border/20">
                                        <span>Total</span>
                                        <span>{formatCurrency(checkoutTotalToCharge)}</span>
                                    </div>
                                </div>

                                {/* Fixed Bottom Bar Step 2 */}
                                <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 z-[100]">
                                    <Button
                                        type="button"
                                        onClick={() => setShowReviewModal(true)}
                                        disabled={disableCheckoutSubmit}
                                        className="w-full h-12"
                                    >
                                        Revisar pedido • {formatCurrency(checkoutTotalToCharge)}
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
                    <p className="text-xs text-brand-inactive-text">
                        Adicione instruções especiais para a preparação ou entrega do seu pedido.
                    </p>
                    <Textarea
                        placeholder="Ex: Tocar interfone, embalar para presente, detalhes da entrega..."
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="resize-none"
                        rows={4}
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
                            className="flex-1 bg-transparent"
                        >
                            Alterar pedido
                        </Button>
                        <Button
                            onClick={(e) => {
                                handleSubmit(e as any)
                                setShowReviewModal(false)
                            }}
                            disabled={disableCheckoutSubmit}
                            className="flex-1"
                        >
                            {isLoading ? "Processando..." : "Fazer pedido"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-6">
                    <div className="space-y-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">Destino</p>
                        {formData.deliveryType === "delivery" ? (
                            <ListItem
                                icon={MapPinIcon}
                                title="Endereço de entrega"
                                description={formData.deliveryAddress}
                                className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                            />
                        ) : (
                            <ListItem
                                icon={StoreIcon}
                                title="Retirada no local"
                                description={formatPartnerAddress(partnerInfo.address)}
                                className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                            />
                        )}
                    </div>

                    <div className="space-y-4 border-t border-brand-border/40 dark:border-dark-border/40 pt-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">Pagamento</p>
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
                                paymentOption === "mercadopago" ? "Cartão, Pix ou saldo MP" :
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
                        <div className="space-y-4 border-t border-brand-border/40 dark:border-dark-border/40 pt-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">Cupom Aplicado</p>
                            <ListItem
                                icon={TagIcon}
                                title={getCouponTitle(appliedCoupon)}
                                description="Desconto concedido"
                                className="!border-none !bg-transparent !shadow-none !px-0 py-2 hover:!bg-transparent hover:!border-none"
                            />
                        </div>
                    )}

                    <div className="space-y-4 border-t border-brand-border/40 dark:border-dark-border/40 pt-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">Itens</p>
                        <div className="max-h-[200px] overflow-y-auto space-y-3 pr-2">
                            {products.map((item) => {
                                const qty = quantities[item.id] || item.quantity
                                return (
                                    <div key={item.id} className="flex justify-between items-center text-sm py-1">
                                        <span className="text-brand-dark dark:text-dark-heading truncate max-w-[200px] font-medium">
                                            {item.name} <span className="text-xs text-brand-inactive-text">x{qty}</span>
                                        </span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(item.price * qty)}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
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
                        <Button onClick={handleApplySelectedCoupon} disabled={!selectedCouponId}>
                            Aplicar
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    {availableCoupons.length > 0 ? (
                        availableCoupons.map((coupon) => (
                            <ListItem
                                icon={TagIcon}
                                key={coupon.id}
                                title={getCouponTitle(coupon)}
                                description={getCouponSubtitle(coupon)}
                                className={`px-4 py-3 gap-4 border rounded-xl cursor-pointer ${selectedCouponId === coupon.id ? "border-brand-green bg-green-50/30 dark:bg-green-900/10" : "border-brand-border dark:border-dark-border"}`}
                                onClick={() => setSelectedCouponId(coupon.id)}
                                right={
                                    <RadioButton
                                        name="marketplace-coupon"
                                        value={coupon.id}
                                        checked={selectedCouponId === coupon.id}
                                        onChange={() => setSelectedCouponId(coupon.id)}
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
                    sellerName={partnerInfo.store_name}
                    useMercadoPago={pixPaymentData.useMercadoPago}
                    partnerId={pixPaymentData.partnerId}
                    mpPublicKey={pixPaymentData.mpPublicKey}
                    userEmail={pixPaymentData.userEmail}
                    userName={pixPaymentData.userName}
                    buyerId={userId!}
                />
            )}

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
                                <p className="text-sm text-brand-inactive-text mt-0.5">{address.neighborhood} - {address.city}/{address.state}</p>
                                <p className="text-xs text-brand-inactive-text mt-1">CEP: {address.zip_code}</p>
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
                <div className="space-y-3 pb-4">
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
                                    setFormData(prev => ({ ...prev, paymentMethod: m.id, installments: 1 }))
                                    setShowPaymentModal(false)
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
                                                setFormData(prev => ({ ...prev, paymentMethod: m.id, installments: 1 }))
                                                setShowPaymentModal(false)
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
            </DefaultModal>

            <DefaultModal
                isOpen={showOutsideRadiusModal}
                onClose={() => setShowOutsideRadiusModal(false)}
                title="Endereço Indisponível"
                maxWidth="sm"
            >
                <div className="flex flex-col items-center justify-center text-center p-4 pt-0">
                    <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
                        <MapPinIcon size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">
                        {partnerInfo.store_name || "Este parceiro"} não entrega no endereço selecionado
                    </h3>
                    <p className="text-brand-inactive-text mb-6">
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
                        <Button variant="outline" onClick={() => setShowChangeModal(false)}>
                            Cancelar
                        </Button>
                        <Button
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
                    <p className="text-sm text-brand-inactive-text">
                        Como você vai pagar o pedido em dinheiro na entrega?
                    </p>
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
                            <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading">
                                Pagar com (R$)
                            </label>
                            <Input
                                type="number"
                                step="0.01"
                                min={checkoutTotalToCharge}
                                value={tempPayWithAmount}
                                onChange={(e) => setTempPayWithAmount(e.target.value)}
                                placeholder="Ex: 50,00"
                                className="w-full"
                            />
                            {tempPayWithAmount && !isNaN(Number(tempPayWithAmount)) && (
                                <div className="text-xs space-y-1">
                                    {Number(tempPayWithAmount) >= checkoutTotalToCharge ? (
                                        <p className="text-brand-inactive-text">
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
