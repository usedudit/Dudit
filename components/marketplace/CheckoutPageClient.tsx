"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    MapPinIcon, PlusIcon, Package, XIcon, ChevronUpIcon, ChevronDownIcon,
    TruckIcon, MoneyIcon, TagIcon, StoreIcon, InfoIcon,
} from "@/lib/icons"
import { Button, Spinner, IconPlaceholder, DefaultModal, CepInput, StateComboBox, RadioButton, ListItem, InfoCard, Separator, Badge, Tooltip, FormDropdown } from "@/components/reusable"
import { useNotification } from "@/hooks/use-notification"
import { Input } from "@/components/reusable"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAddressesAction, createAddressAction } from "@/app/actions/shared/addresses"
import { useSupabase } from "@/providers/supabase-provider"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"
import { listApplicableMarketplaceCouponsAction } from "@/app/actions/shared/coupons"
import { useRouter } from "next/navigation"
import { PaymentWrapper } from "@/components/PaymentWrapper"
import { checkoutCartAction } from "@/app/actions/marketplace/cart"
import { createOrderAction } from "@/app/actions/marketplace/orders"
import { previewMarketplacePaymentAction } from "@/app/actions/marketplace/payment-preview"
import { invalidateCartCache } from "@/hooks/use-cart"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { getPartnerDeliveryConfigAction, quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { getStorefrontPaymentMethodsAction, type StorefrontPaymentMethod } from "@/app/actions/marketplace/storefront-payment-methods"

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
    cartItems?: { cartItemId: string, productId: string, variantId?: string, quantity: number }[]
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

function SectionHeader({
    title,
    isOpen,
    onClick,
}: {
    title: string
    isOpen: boolean
    onClick: () => void
}) {
    return (
        <div
            onClick={onClick}
            className="px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-gray cursor-pointer"
        >
            <div className="flex items-center gap-3">
                <span className="text-md font-bold text-brand-dark dark:text-dark-heading">
                    {title}
                </span>
            </div>
            <div className="text-brand-dark dark:text-dark-heading">
                {isOpen ? <ChevronUpIcon size={20} /> : <ChevronDownIcon size={20} />}
            </div>
        </div>
    )
}

export function CheckoutPageClient() {
    const { user } = useSupabase()
    const router = useRouter()
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

    const quantities = useMemo<Record<string, number>>(() => {
        const acc: Record<string, number> = {}

        for (const p of products) {
            acc[p.id] = p.quantity
        }

        return acc
    }, [products])

    const [userId, setUserId] = useState<string | null>(null)
    const [userName, setUserName] = useState<string>("")
    const [userEmail, setUserEmail] = useState<string>("")

    const [userAddresses, setUserAddresses] = useState<UserAddress[]>([])
    const [selectedAddressId, setSelectedAddressId] = useState<string>("")
    const [showAddressForm, setShowAddressForm] = useState(false)
    const [loadingAddresses, setLoadingAddresses] = useState(false)
    const [loadingCep, setLoadingCep] = useState(false)
    const [newAddressData, setNewAddressData] = useState({
        zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "",
    })

    const [couponCode, setCouponCode] = useState("")
    const [couponDiscount, setCouponDiscount] = useState(0)
    const [availableCoupons, setAvailableCoupons] = useState<MarketplaceAvailableCoupon[]>([])
    const [couponListLoading, setCouponListLoading] = useState(false)
    const [showCouponModal, setShowCouponModal] = useState(false)
    const [selectedCouponId, setSelectedCouponId] = useState<string>("")
    const [couponError, setCouponError] = useState<string | null>(null)

    const [formData, setFormData] = useState({
        deliveryType: "pickup" as "delivery" | "pickup",
        deliveryAddress: "",
        paymentMethod: partnerInfo.paymentMethods?.[0] || "cash",
        notes: "",
        installments: 1,
    })



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
        const { zipCode, street, number, neighborhood, city, state } = newAddressData
        if (!zipCode || !street || !number || !neighborhood || !city || !state) {
            setDeliveryError("Preencha todos os campos obrigatórios do endereço")
            return
        }
        setIsLoading(true)
        let csrfToken = ""
        try {
            const csrfRes = await fetch("/api/csrf-token")
            const csrfData = await csrfRes.json()
            csrfToken = csrfData.token || ""
        } catch {
            notifyError("Erro de Segurança", "Erro ao validar segurança. Recarregue a página.")
            setIsLoading(false)
            return
        }
        const result = await createAddressAction({
            entityId: userId, entityType: "user",
            street, number, complement: newAddressData.complement,
            neighborhood, city, state, zipCode,
            isDefault: userAddresses.length === 0,
            csrf_token: csrfToken,
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
            setNewAddressData({ zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" })
        }
        setIsLoading(false)
    }

    const isPickup = formData.deliveryType === "pickup"
    const canUseDelivery = deliveryPlanEnabled && deliveryEnabled

    // Auto-switch to delivery mode when user has a saved address AND delivery is enabled
    useEffect(() => {
        if (canUseDelivery && selectedAddressId && formData.deliveryAddress) {
            setFormData((prev) => prev.deliveryType === "pickup" ? { ...prev, deliveryType: "delivery" } : prev)
        }
    }, [canUseDelivery, selectedAddressId, formData.deliveryAddress])

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
    const shouldPreviewTraditionalPayment = Boolean(
        partnerId &&
        paymentOption === "traditional" &&
        formData.paymentMethod
    )
    const couponItems = useMemo(
        () =>
            products.map((product) => (
                sessionData?.itemType === "service" || sessionData?.source === "service"
                    ? { serviceId: product.id }
                    : { productId: product.id }
            )),
        [products, sessionData?.itemType, sessionData?.source]
    )
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
                <Badge variant="gray" icon={<InfoIcon className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body" />} className="cursor-help">
                    Método da loja
                </Badge>
            </span>
        </Tooltip>
    ) : null
    const shouldShowInstallments = paymentOption === "traditional"
        && selectedStorefrontMethod?.type === "credit_card"
        && (Number(paymentPreview?.maxInstallments || selectedStorefrontMethod?.maxInstallments || 1) > 1)
    const disableCheckoutSubmit = isLoading
        || (paymentOption === "traditional" && (paymentPreviewLoading || storefrontMethodsLoading || (!paymentPreview?.success && shouldPreviewTraditionalPayment)))
        || (!isPickup && (deliveryQuoteLoading || !!deliveryError))

    const getCouponCountLabel = (count: number) => {
        if (count === 1) return "1 cupom disponível"
        return `${count} cupons disponíveis`
    }

    const getCouponTitle = (coupon: MarketplaceAvailableCoupon) => {
        if (coupon.freeShipping || coupon.discountType === "free_shipping") {
            return `${coupon.code} - Entrega gratis`
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
                    setCouponError("O cupom aplicado nao se encaixa mais neste pedido.")
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

    const handleApplySelectedCoupon = () => {
        const selectedCoupon = availableCoupons.find((coupon) => coupon.id === selectedCouponId)

        if (!selectedCoupon) {
            setCouponCode("")
            setCouponDiscount(0)
            setCouponError(null)
            setShowCouponModal(false)
            return
        }

        setCouponCode(selectedCoupon.code)
        setCouponDiscount(selectedCoupon.discountAmount)
        setCouponError(null)
        setShowCouponModal(false)
    }

    const handleRemoveCoupon = () => {
        setCouponCode("")
        setCouponDiscount(0)
        setSelectedCouponId("")
        setCouponError(null)
    }

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        setDeliveryError(null)
        setPaymentError(null)
        setIsLoading(true)
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
                const { token } = await fetch("/api/csrf-token").then((r) => r.json())
                if (sessionData?.source === "cart") {
                    const items = sessionData.cartItems || []
                    const result = await checkoutCartAction(
                        items.map(item => ({
                            cartItemId: item.cartItemId,
                            productId: item.productId,
                            variantId: item.variantId,
                            quantity: quantities[item.productId] || item.quantity
                        })),
                        formData.deliveryType,
                        formData.deliveryAddress,
                        formData.paymentMethod,
                        formData.installments,
                        formData.notes,
                        couponCode || null,
                        false,
                        token
                    )
                    if (result.error) throw new Error(result.error)
                    invalidateCartCache()
                    sessionStorage.removeItem("checkout_session")
                    notifySuccess("Pedido realizado", "Seu pedido foi criado com sucesso!")
                    router.push("/pedidos")
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
                    })
                    if (result.error) throw new Error(result.error)
                    sessionStorage.removeItem("checkout_session")
                    notifySuccess("Pedido realizado", `Número: ${result.orderNumber}`)
                    router.push("/pedidos")
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
                <header className="lg:flex flex-col w-full bg-brand-dark sticky top-0 z-50 shadow-md">
                    <div className="w-full h-[68px] flex items-center justify-between max-w-[1300px] px-2 mx-auto gap-4">
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

                <div className="container mx-auto px-4 lg:px-6 max-w-[1300px] w-full pt-6 md:pt-10 pb-32 md:pb-20">
                    <div className="mb-8 flex flex-col md:flex-row md:items-center gap-4 w-full justify-start">
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

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                        <div className="lg:col-span-8 space-y-4">

                            {/* ENTREGA */}
                            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl overflow-hidden">
                                <SectionHeader title="Entrega" isOpen={openSections.delivery} onClick={() => toggleSection("delivery")} />
                                <AnimatePresence initial={false}>
                                    {openSections.delivery && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                            <div className="p-6 space-y-6">
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
                                                                        name="deliveryType"
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
                                                                    name="deliveryType"
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

                                                <AnimatePresence>
                                                    {isPickup && (
                                                        <motion.div key="pickup" initial="closed" animate="open" exit="closed" variants={fadeVariants}>
                                                            {/* FIX 1: Small square map image inline beside address text, no border wrapper */}
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
                                                            ) : userAddresses.length > 0 ? (
                                                                <div className="space-y-3">
                                                                    {userAddresses.map((address) => (
                                                                        <div
                                                                            key={address.id}
                                                                            onClick={() => handleAddressSelect(address.id)}
                                                                            className={`flex items-start border py-4 rounded-xl transition-all cursor-pointer ${selectedAddressId === address.id
                                                                                ? "border-brand-green bg-green-50/30 dark:bg-green-900/10"
                                                                                : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                                                                                }`}
                                                                        >
                                                                            <div className="mt-2.5 shrink-0">
                                                                                <RadioButton
                                                                                    name="addressSelect"
                                                                                    value={address.id}
                                                                                    checked={selectedAddressId === address.id}
                                                                                    onChange={() => handleAddressSelect(address.id)}
                                                                                />
                                                                            </div>
                                                                            <div className="flex-1">
                                                                                <p className="font-bold text-sm text-brand-dark dark:text-dark-heading">{address.street}, {address.number}</p>
                                                                                <p className="text-sm text-brand-inactive-text mt-0.5">{address.neighborhood} - {address.city}/{address.state}</p>
                                                                                <p className="text-xs text-brand-inactive-text mt-1">CEP: {address.zip_code}</p>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                    {!showAddressForm && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setShowAddressForm(true)}
                                                                            className="w-full py-3 border border-dashed border-brand-border dark:border-dark-border rounded-xl text-sm font-medium text-brand-dark dark:text-dark-heading transition-colors flex items-center justify-center gap-2"
                                                                        >
                                                                            <PlusIcon size={16} /> Adicionar outro endereço
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col items-center border-t border-brand-border pt-6">
                                                                    <div className="flex flex-col items-center border-brand-border pt-6">
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
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* PAGAMENTO */}
                            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl overflow-hidden">
                                <SectionHeader title="Pagamento" isOpen={openSections.payment} onClick={() => toggleSection("payment")} />
                                <AnimatePresence initial={false}>
                                    {openSections.payment && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                            <div className="p-6">
                                                {partnerInfo.mpConnected ? (
                                                    <>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                                            <ListItem
                                                                icon={<img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-6 h-6" />}
                                                                title="Mercado Pago"
                                                                description="Pague com cartão, Pix ou saldo MP."
                                                                className={`px-4 py-3 gap-4 ${paymentOption === "mercadopago" ? "border-brand-green dark:border-brand-green" : ""}`}
                                                                onClick={() => setPaymentOption("mercadopago")}
                                                                right={
                                                                    <RadioButton
                                                                        name="paymentOption"
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
                                                                    description="Combine o pagamento na entrega ou retirada."
                                                                    className={`px-4 py-3 gap-4 ${paymentOption === "traditional" ? "border-brand-green dark:border-brand-green" : ""}`}
                                                                    onClick={() => setPaymentOption("traditional")}
                                                                    right={
                                                                        <RadioButton
                                                                            name="paymentOption"
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
                                                                    className="mb-6"
                                                                >
                                                                    <Label className="mb-3 block">Selecione o método</Label>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                                                        {paymentMethods.map((method: any) => (
                                                                            <ListItem
                                                                                key={method.value}
                                                                                title={method.label}
                                                                                className={`px-4 py-3 gap-4 ${formData.paymentMethod === method.value ? "border-brand-green dark:border-brand-green bg-brand-green/5" : ""}`}
                                                                                onClick={() => setFormData({ ...formData, paymentMethod: method.value, installments: 1 })}
                                                                                right={
                                                                                    <RadioButton
                                                                                        name="paymentMethod"
                                                                                        value={method.value}
                                                                                        checked={formData.paymentMethod === method.value}
                                                                                        onChange={() => setFormData({ ...formData, paymentMethod: method.value, installments: 1 })}
                                                                                    />
                                                                                }
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                    {selectedStorefrontMethod?.cardBrand && (
                                                                        <div className="mt-4">
                                                                            <span className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Bandeiras aceitas</span>
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {selectedStorefrontMethod.cardBrand.split(',').map(b => {
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
                                                                                        label: `${opt.installments}x de ${formatCurrency(opt.installmentValue)} ${opt.hasInterest ? "com juros" : "sem juros"}`
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
                                                            <Label className="mb-3 block">Selecione o método</Label>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                                                {paymentMethods.map((method: any) => (
                                                                    <ListItem
                                                                        key={method.value}
                                                                        title={method.label}
                                                                        className={`px-4 py-3 gap-4 ${formData.paymentMethod === method.value ? "border-brand-green dark:border-brand-green bg-brand-green/5" : ""}`}
                                                                        onClick={() => setFormData({ ...formData, paymentMethod: method.value, installments: 1 })}
                                                                        right={
                                                                            <RadioButton
                                                                                name="paymentMethod"
                                                                                value={method.value}
                                                                                checked={formData.paymentMethod === method.value}
                                                                                onChange={() => setFormData({ ...formData, paymentMethod: method.value, installments: 1 })}
                                                                            />
                                                                        }
                                                                    />
                                                                ))}
                                                            </div>
                                                            {selectedStorefrontMethod?.cardBrand && (
                                                                <div className="mt-4">
                                                                    <span className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Bandeiras aceitas</span>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {selectedStorefrontMethod.cardBrand.split(',').map(b => {
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
                                                                                label: `${opt.installments}x de ${formatCurrency(opt.installmentValue)} ${opt.hasInterest ? "com juros" : "sem juros"}`
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
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* OBSERVAÇÕES */}
                            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl overflow-hidden">
                                <SectionHeader title="Observações" isOpen={openSections.notes} onClick={() => toggleSection("notes")} />
                                <AnimatePresence initial={false}>
                                    {openSections.notes && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                            <div className="p-6">
                                                <Textarea
                                                    id="notes-cw"
                                                    placeholder="Ex: Tocar interfone, embalar para presente, detalhes da entrega..."
                                                    value={formData.notes}
                                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                                    className="resize-none"
                                                    rows={3}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div className="lg:col-span-4 space-y-4">
                            <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface">
                                <div className="text-md bg-brand-gray px-6 py-4 border-b border-brand-border font-bold text-brand-dark">
                                    Resumo do Pedido
                                </div>
                                <div className="p-6">
                                    <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                        {products.map((item) => (
                                            <div key={item.id} className="flex gap-3">
                                                <div className="w-16 h-16 bg-gray-100 border border-brand-border dark:border-dark-border rounded-lg overflow-hidden shrink-0">
                                                    {item.image ? (
                                                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <Package size={24} className="text-gray-300" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-brand-dark dark:text-dark-heading text-sm mb-0.5 line-clamp-2">{item.name}</h4>
                                                    {item.variant && (
                                                        <p className="text-xs text-brand-inactive-text mb-1">
                                                            {item.variant.includes(":") ? (
                                                                <>
                                                                    {item.variant.split(":")[0]}: <span className="font-medium text-brand-dark">{item.variant.split(":")[1]}</span>
                                                                </>
                                                            ) : item.variant}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-brand-inactive-text font-medium">Qtd: {quantities[item.id] || item.quantity}</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">{formatCurrency(item.price * (quantities[item.id] || item.quantity))}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mb-4 space-y-2">
                                        <ListItem
                                            icon={TagIcon}
                                            title={appliedCoupon ? getCouponTitle(appliedCoupon) : "Escolha um cupom"}
                                            titleClassName="text-sm"
                                            description={appliedCoupon ? "Cupom aplicado" : (couponListLoading ? "Verificando cupons disponíveis..." : getCouponCountLabel(availableCoupons.length))}
                                            className={`px-4 py-3 gap-4 ${appliedCoupon ? "border-brand-green dark:border-brand-green" : ""}`}
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
                                                <div className="flex justify-between"><span>Taxa base</span><span>{formatCurrency(deliveryBreakdown.baseFee)}</span></div>
                                                <div className="flex justify-between"><span>Distância {deliveryDistanceKm != null ? `(${deliveryDistanceKm.toFixed(2)} km)` : ""}</span><span>{formatCurrency(deliveryBreakdown.distanceFee)}</span></div>
                                                <div className="flex justify-between"><span>Ajuste horário</span><span>{formatCurrency(deliveryBreakdown.timeAdjustmentTotal)}</span></div>
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
                                            <div className="flex justify-between text-sm font-medium text-brand-orange">
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

                                    <Button
                                        onClick={(e) => handleSubmit(e as any)}
                                        disabled={disableCheckoutSubmit}
                                        className="w-full h-[46px]"
                                    >
                                        {isLoading ? "Processando..." : paymentPreviewLoading ? "Calculando pagamento..." : `Finalizar pedido • ${formatCurrency(checkoutTotalToCharge)}`}
                                    </Button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="shrink-0 mt-auto pb-[80px] lg:pb-0">
                    <MarketplaceFooter />
                </div>

                <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 z-[110] lg:hidden">
                    <div className="flex gap-3">
                        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading} className="flex-1 h-12 bg-transparent">
                            Voltar
                        </Button>
                        <Button
                            onClick={(e) => handleSubmit(e as any)}
                            disabled={disableCheckoutSubmit}
                            className={`flex-2 h-12 ${isLoading ? "opacity-80" : ""}`}
                        >
                            {isLoading ? "Processando..." : paymentPreviewLoading ? "Calculando pagamento..." : `Finalizar pedido • ${formatCurrency(checkoutTotalToCharge)}`}
                        </Button>
                    </div>
                </div>
            </div>

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
                                className={`px-4 py-3 gap-4 ${selectedCouponId === coupon.id ? "border-brand-green dark:border-brand-green" : ""}`}
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
                title="Adicionar Novo Endereço"
            >
                <div className="flex flex-col gap-4">
                    <div onBlur={handleCepBlur}>
                        <CepInput
                            label="CEP"
                            value={newAddressData.zipCode}
                            onChange={(val) => setNewAddressData({ ...newAddressData, zipCode: val })}
                            disabled={loadingCep}
                        />
                    </div>
                    <div>
                        <Input
                            label="Logradouro"
                            value={newAddressData.street}
                            onChange={(e) => setNewAddressData({ ...newAddressData, street: e.target.value })}
                            placeholder="Ex: Rua das Flores"
                            disabled={loadingCep}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Input
                                label="Número"
                                value={newAddressData.number}
                                onChange={(e) => setNewAddressData({ ...newAddressData, number: e.target.value })}
                                placeholder="123"
                            />
                        </div>
                        <div>
                            <Input
                                label="Complemento"
                                value={newAddressData.complement}
                                onChange={(e) => setNewAddressData({ ...newAddressData, complement: e.target.value })}
                                placeholder="Apto, Sala..."
                            />
                        </div>
                    </div>
                    <div>
                        <Input
                            label="Bairro"
                            value={newAddressData.neighborhood}
                            onChange={(e) => setNewAddressData({ ...newAddressData, neighborhood: e.target.value })}
                            disabled={loadingCep}
                            placeholder="Bairro"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Input
                                label="Cidade"
                                value={newAddressData.city}
                                onChange={(e) => setNewAddressData({ ...newAddressData, city: e.target.value })}
                                disabled={loadingCep}
                                placeholder="Cidade"
                            />
                        </div>
                        <div>
                            <StateComboBox
                                label="Estado"
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
        </>
    )
}
