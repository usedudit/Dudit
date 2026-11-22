"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion"
import { useSupabase } from "@/providers/supabase-provider"
import { ShareIcon, ChevronRightIcon, ChevronLeftIcon, ChevronDownIcon, MapPinIcon, CheckIcon, CheckCircleIcon, XIcon, TruckIcon, FlagIcon, PlusIcon, WhatsappIcon } from "@/lib/icons"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { Button, Input, CepInput, Spinner, InfoCard, DefaultModal, FormSection, FormDropdown, Separator, RadioButton, NumberInputWithCheckbox } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { isStoreOpen } from "@/lib/utils/opening-hours"
import { ShareModal } from "./ShareModal"
import { StorePoliciesModal } from "./StorePoliciesModal"
import { ReportModal } from "./ReportModal"
import { SponsoredAdDetailSlot } from "@/components/marketplace/ads/SponsoredAdsSlot"
import type { SponsoredAd } from "@/lib/ads/types"
import { UserProfileImage, getAvatarColor, getBannerUrlByColor } from "@/lib/utils/UserProfileImage"
import { getDefaultBannerSeeded } from "@/lib/utils/banner"
import { useNotification } from "@/hooks/use-notification"
import { useModalLayer } from "@/lib/modal-stack"
import { getAddressesAction, createAddressAction, updateAddressAction } from "@/app/actions/shared/addresses"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { addSubscriptionToCartAction, checkCanUserBuyFromStoreAction } from "@/app/actions/marketplace/cart-extensions"
import { invalidateCartCache } from "@/hooks/use-cart"
import { getStoreUrl, getPlanUrl, formatCityStateSlug } from "@/lib/utils/url-generator"
import { fetchCSRFTokenSingleton } from "@/hooks/use-csrf-token"
import { normalizeFulfillmentModes } from "@/lib/commerce/capabilities"

interface PlanDetailsPageClientProps {
    plan: any
    currentUserId?: string | null
    userProfile?: any
    cartCount?: number
    hideHeaderAndFooter?: boolean
    sponsoredAd?: SponsoredAd | null
    /** Fluxo configurado pelo vendedor (whatsapp ou dudit). */
    orderFlow?: "whatsapp" | "dudit"
}

const PLACEHOLDER = "https://img.dudit.com.br/static/Placeholder.png"

const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
}

export function PlanDetailsPageClient({
    plan,
    currentUserId: initialUserId,
    userProfile,
    cartCount,
    hideHeaderAndFooter = false,
    sponsoredAd = null,
    orderFlow = "dudit",
}: PlanDetailsPageClientProps) {
    const router = useRouter()
    const { user, supabase } = useSupabase()
    const { success: notifySuccess, error: notifyError } = useNotification()

    const [userId, setUserId] = useState<string | null | undefined>(initialUserId || user?.id)
    const [submitting, setSubmitting] = useState(false)
    const [deliveryType, setDeliveryType] = useState<"pickup" | "delivery">("pickup")
    const [showShareModal, setShowShareModal] = useState(false)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [showResponsibilityModal, setShowResponsibilityModal] = useState(false)
    const [showPoliciesModal, setShowPoliciesModal] = useState(false)
    const [showReportModal, setShowReportModal] = useState(false)
    const [showAddressModal, setShowAddressModal] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [expandedAccordion, setExpandedAccordion] = useState<string | null>(null)
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

    // Modalidades aceitas pelo plano (entrega/retirada). Sem delivery o plano
    // nunca cobra frete e o cliente so' pode retirar.
    const planModes = useMemo(
        () => normalizeFulfillmentModes(plan?.fulfillmentModes ?? plan?.fulfillment_modes, ["delivery", "pickup"]),
        [plan],
    )
    const acceptsDelivery = planModes.includes("delivery")
    const acceptsPickup = planModes.includes("pickup")

    useEffect(() => {
        if (!acceptsDelivery && acceptsPickup) setDeliveryType("pickup")
        if (acceptsDelivery && !acceptsPickup) setDeliveryType("delivery")
    }, [acceptsDelivery, acceptsPickup])

    // Image gallery states
    const [activeImgIndex, setActiveImgIndex] = useState(0)
    const [slideDirection, setSlideDirection] = useState<1 | -1>(1)
    const [isLightboxOpen, setIsLightboxOpen] = useState(false)
    const [lightboxActiveImg, setLightboxActiveImg] = useState(0)
    const lightboxJustOpened = useRef(false)
    const touchStartX = useRef(0)
    const galleryContainerRef = useRef<HTMLDivElement>(null)

    // z-index dinâmico: o viewer de imagens em tela cheia abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isLightboxOpen)

    const zoomOriginX = useMotionValue(50)
    const zoomOriginY = useMotionValue(50)
    const zoomScale = useMotionValue(1)
    const smoothScale = useSpring(zoomScale, { stiffness: 180, damping: 22 })
    const transformOrigin = useTransform([zoomOriginX, zoomOriginY], ([x, y]) => `${x}% ${y}%`)

    // Address states
    const [userAddresses, setUserAddresses] = useState<any[]>([])
    const [selectedAddressId, setSelectedAddressId] = useState<string>("")
    const selectedAddress = userAddresses.find(a => a.id === selectedAddressId)
    const [showAddressForm, setShowAddressForm] = useState(false)
    const [loadingAddresses, setLoadingAddresses] = useState(false)
    const [loadingCep, setLoadingCep] = useState(false)
    const [planDeliveryFee, setPlanDeliveryFee] = useState<number | null>(null)
    const [newAddressData, setNewAddressData] = useState({
        zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false,
        addressType: "casa", isDefault: false,
        latitude: null as number | null, longitude: null as number | null
    })

    const partner = useMemo(() => {
        const p = plan.partners || {}
        const store = plan.stores || p.stores || p.store
        const address = store?.addresses?.[0] || p.addresses?.[0] || {}
        const realPartnerId = p.id || plan.partner_id || plan.partnerId || "1"
        const storeId = store?.id || p.store_id || plan.store_id || realPartnerId
        const storeName = store?.name || p?.name || p?.storeName || "Vendedor da Dudit"
        const isShowcaseActive = (store?.is_showcase_active ?? p.is_showcase_active ?? plan.is_showcase_active ?? true) !== false
        const acceptOrdersWhenClosed = (store?.accept_orders_when_closed ?? p.accept_orders_when_closed ?? plan.accept_orders_when_closed ?? true) !== false
        const timezone = store?.timezone || plan.timezone || "America/Sao_Paulo"

        return {
            isShowcaseActive,
            acceptOrdersWhenClosed,
            timezone,
            id: realPartnerId,
            short_id: store?.short_id || p.short_id || plan.store_short_id || p?.store?.short_id,
            slug: store?.slug || p.slug,
            store_id: storeId,
            name: storeName,
            partner_id: realPartnerId,
            user_id: p.user_id,
            store_name: storeName,
            city: address?.city || store?.city || p.city || "Brasil",
            state: address?.state || store?.state || p.state || "BR",
            store_image_url: store?.logo_url || p.store_image_url || null,
            store_avatar: store?.logo_url || p.store_image_url || p.store_avatar || "https://img.dudit.com.br/static/Placeholder.png",
            banner_url: store?.banner_url || p.banner_url || null,
            rating: store?.rating ?? p.rating ?? 0,
            vendas_totais: store?.vendas_totais ?? p.vendas_totais ?? 0,
            created_at: store?.created_at || p.created_at,
            phone: store?.phone || p.phone || null,
            opening_hours: store?.opening_hours || p.opening_hours || plan.opening_hours || null,
            addresses: store?.addresses || p.addresses || [],
            mp_user_id: p.mp_user_id || null,
            mp_public_key: p.mp_public_key || null,
        }
    }, [plan])

    const isStoreOpenNow = useMemo(() => {
        return isStoreOpen(partner.opening_hours, undefined, partner.timezone)
    }, [partner.opening_hours, partner.timezone])

    const isClosedAndBlocking = partner.acceptOrdersWhenClosed === false && !isStoreOpenNow

    const recurringSaleAvailable = (plan as any).saleViaDudit !== false
    const planWhatsappUrl = useMemo(() => {
        const rawPhone = (plan as any).whatsappPhone || partner.phone
        const cleanPhone = rawPhone ? String(rawPhone).replace(/\D/g, "") : ""
        const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : cleanPhone.length >= 10 ? `55${cleanPhone}` : cleanPhone
        if (!formattedPhone) return null
        const msg = encodeURIComponent(`Olá! Vi o plano "${plan.name}" na Dudit e gostaria de assinar pelo WhatsApp.`)
        return `https://wa.me/${formattedPhone}?text=${msg}`
    }, [plan, partner.phone])

    const planImages = useMemo(() => {
        const imgs = (plan.images || []).filter((img: any) => typeof img === "string" && img.trim()).map((img: string) => getR2ImageUrl(img))
        return imgs.length > 0 ? imgs : [PLACEHOLDER]
    }, [plan.images])

    const galleryItems = useMemo(() => {
        return planImages.map((src: string) => ({ type: "image" as const, src }))
    }, [planImages])

    const [canBuyState, setCanBuyState] = useState<{ canBuy: boolean; isOwner: boolean; isTeamMember: boolean; reason?: string }>(() => {
        const isOwner = !!(userId && partner?.user_id && userId === partner.user_id)
        return {
            canBuy: !isOwner,
            isOwner,
            isTeamMember: false,
            reason: isOwner ? "Você não pode assinar seus próprios planos." : undefined,
        }
    })

    useEffect(() => {
        if (!partner?.partner_id && !partner?.id && !plan?.partner_id) return
        const targetPartnerId = plan?.partner_id || partner.partner_id || partner.id
        const targetStoreId = plan?.store_id || partner.store_id || partner.id
        checkCanUserBuyFromStoreAction(targetPartnerId, targetStoreId).then(res => {
            setCanBuyState(res)
        })
    }, [userId, partner?.partner_id, partner?.id, partner?.store_id, plan?.partner_id, plan?.store_id])

    const isPlanOwner = !canBuyState.canBuy
    const isTeamMember = canBuyState.isTeamMember

    useEffect(() => {
        setIsMounted(true)
        if (user?.id) {
            setUserId(user.id)
        }
    }, [user])

    useEffect(() => {
        if (userId) {
            loadUserAddresses()
        } else {
            setUserAddresses([])
            setSelectedAddressId("")
        }
    }, [userId])

    const loadUserAddresses = async () => {
        if (!userId) return
        setLoadingAddresses(true)
        try {
            const result = await getAddressesAction(userId, "user")
            if (result.addresses) {
                const list = result.addresses as any[]
                setUserAddresses(list)
                const defaultAddress = list.find((a: any) => a.is_default)
                if (defaultAddress) {
                    setSelectedAddressId(defaultAddress.id)
                } else if (list.length > 0) {
                    setSelectedAddressId(list[0].id)
                }
            }
        } catch (err) {
            console.error("Error loading addresses:", err)
        } finally {
            setLoadingAddresses(false)
        }
    }

    const handleCepBlur = async () => {
        const zip = newAddressData.zipCode.replace(/\D/g, "")
        if (zip.length !== 8) return
        setLoadingCep(true)
        try {
            const response = await fetch(`/api/cep?cep=${zip}`)
            const data = await response.json()
            if (!data.erro && !data.error) {
                setNewAddressData(prev => ({
                    ...prev,
                    street: data.logradouro || prev.street,
                    number: data.numero || prev.number,
                    noNumber: data.numero ? data.numero === "S/N" : prev.noNumber,
                    neighborhood: data.bairro || prev.neighborhood,
                    city: data.localidade || prev.city,
                    state: data.uf || prev.state,
                    latitude: typeof data.latitude === "number" ? data.latitude : prev.latitude,
                    longitude: typeof data.longitude === "number" ? data.longitude : prev.longitude,
                }))
            }
        } catch (err) {
            console.error("Error fetching CEP:", err)
        } finally {
            setLoadingCep(false)
        }
    }

    const handleSaveAddress = async () => {
        if (!userId) return
        const { zipCode, street, number, neighborhood, city, state, noNumber, addressType, isDefault } = newAddressData
        const finalNumber = noNumber ? "S/N" : number

        if (!zipCode || !street || !finalNumber || !neighborhood || !city || !state) {
            notifyError("Por favor, preencha todos os campos do endereço.")
            return
        }

        try {
            const result = await createAddressAction({
                entityId: userId,
                entityType: "user",
                zipCode,
                street,
                number: finalNumber,
                complement: newAddressData.complement,
                neighborhood,
                city,
                state,
                isDefault,
                addressType,
                latitude: newAddressData.latitude ?? null,
                longitude: newAddressData.longitude ?? null,
            })

            if (result.error) {
                notifyError(result.error)
            } else {
                notifySuccess("Endereço salvo com sucesso!")
                setShowAddressForm(false)
                setNewAddressData({ zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false, addressType: "casa", isDefault: false, latitude: null, longitude: null })
                await loadUserAddresses()
                const createdId = (result as any)?.address?.id
                if (createdId) setSelectedAddressId(createdId)
            }
        } catch (err) {
            notifyError("Erro ao cadastrar endereço.")
        }
    }

    const handleSetDefaultAddress = async (addressId: string) => {
        if (!userId) return
        const result = await updateAddressAction({
            addressId,
            entityId: userId,
            entityType: "user",
            isDefault: true,
        })
        if (!result.error) {
            await loadUserAddresses()
        } else {
            notifyError(result.error)
        }
    }

    const buildAddressString = (a: any) =>
        `${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ""} - ${a.neighborhood}, ${a.city} - ${a.state}, ${a.zip_code}`

    const handleSubscribe = async () => {
        if (!recurringSaleAvailable) {
            if (planWhatsappUrl) {
                window.open(planWhatsappUrl, "_blank")
            } else {
                notifyError("As assinaturas pela Dudit estão desativadas e o vendedor não cadastrou um WhatsApp.")
            }
            return
        }
        if (partner.isShowcaseActive === false) {
            notifyError("Esta vitrine está temporariamente inativa e não está aceitando novos pedidos.")
            return
        }
        if (isClosedAndBlocking) {
            notifyError("Esta loja está fechada no momento e não está aceitando novos pedidos.")
            return
        }

        if (!userId) {
            router.push(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`)
            return
        }

        if (deliveryType === "delivery" && !selectedAddressId) {
            notifyError("Por favor, selecione um endereço de entrega.")
            return
        }

        setSubmitting(true)
        try {
            const token = await fetchCSRFTokenSingleton() || ""
            const result = await addSubscriptionToCartAction({
                recurringPlanId: plan.id,
                partnerId: partner.partner_id || partner.id,
                csrf_token: token,
                fulfillmentMode: deliveryType === "pickup" ? "pickup" : "delivery",
            })

            if (result.success) {
                invalidateCartCache()
                const checkoutData = {
                    source: "cart",
                    partnerId: partner.partner_id || partner.id,
                    storeId: plan.stores ? partner.store_id : undefined,
                    products: [{
                        id: plan.id,
                        name: plan.name,
                        price: planPrice,
                        quantity: 1,
                    }],
                    partnerInfo: {
                        address: partner.addresses?.[0] || {},
                        paymentMethods: [],
                        mpConnected: !!partner.mp_user_id,
                        mpPublicKey: partner.mp_public_key,
                        store_name: partner.store_name,
                    },
                    cartItems: result.cartItemId
                        ? [{ cartItemId: result.cartItemId, productId: plan.id, quantity: 1 }]
                        : [],
                    deliverySettings: null,
                }
                sessionStorage.setItem("checkout_session", JSON.stringify(checkoutData))
                router.push("/checkout")
            } else {
                notifyError(result.error || "Ocorreu um erro ao assinar o plano.")
            }
        } catch (err) {
            notifyError("Erro inesperado ao assinar.")
        } finally {
            setSubmitting(false)
        }
    }

    const frequencyLabel = useMemo(() => {
        const interval = Number(plan.frequencyInterval || plan.frequency_interval || 1)
        const type = plan.frequencyType || plan.frequency_type || "monthly"

        if (type === "daily") return interval === 1 ? "diário" : `a cada ${interval} dias`
        if (type === "weekly") return interval === 1 ? "semanal" : `a cada ${interval} semanas`
        if (type === "monthly") return interval === 1 ? "mensal" : `a cada ${interval} meses`
        if (type === "yearly") return interval === 1 ? "anual" : `a cada ${interval} anos`
        return "recorrente"
    }, [plan])

    const planPrice = Number(plan.price || 0)
    const planShippingMode = plan.shippingMode || plan.shipping_mode || "included"
    const planShippingFlat = Number(plan.shippingFlatAmount ?? plan.shipping_flat_amount ?? 0)

    const priceSuffix = useMemo(() => {
        const type = plan.frequencyType || plan.frequency_type
        const interval = Number(plan.frequencyInterval || plan.frequency_interval || 1)
        if (type === "daily") return interval === 1 ? "/dia" : `/a cada ${interval} dias`
        if (type === "weekly") return interval === 1 ? "/semana" : `/a cada ${interval} semanas`
        if (type === "monthly") return interval === 1 ? "/mês" : `/a cada ${interval} meses`
        if (type === "yearly") return interval === 1 ? "/ano" : `/a cada ${interval} anos`
        return ""
    }, [plan.frequencyType, plan.frequency_type, plan.frequencyInterval, plan.frequency_interval])

    const deliveryTypeOptions = useMemo(() => {
        const options: { value: string; label: string }[] = []
        if (acceptsPickup) options.push({ value: "pickup", label: "Retirar no local" })
        if (acceptsDelivery) options.push({ value: "delivery", label: "Entrega pelo vendedor" })
        return options
    }, [acceptsPickup, acceptsDelivery])

    // Plano com frete cotado: cota uma unica vez no cadastro, igual ao produto.
    useEffect(() => {
        if (deliveryType !== "delivery" || !acceptsDelivery || planShippingMode !== "quote" || !selectedAddress) {
            setPlanDeliveryFee(null)
            return
        }
        let active = true
        const address = selectedAddress
        quoteDeliveryFeeAction({
            partnerId: partner.partner_id || partner.id,
            storeId: partner.store_id || null,
            destinationAddress: buildAddressString(address),
            destinationCoords: address.latitude && address.longitude
                ? { lat: Number(address.latitude), lng: Number(address.longitude) }
                : null,
            freeDeliveryCoupon: false,
            orderSubtotal: planPrice,
        }).then((quote) => {
            if (!active) return
            setPlanDeliveryFee(quote.success ? Number((quote as any).fee || 0) : null)
        }).catch(() => {
            if (active) setPlanDeliveryFee(null)
        })
        return () => { active = false }
    }, [deliveryType, acceptsDelivery, planShippingMode, selectedAddress, partner.partner_id, partner.id, partner.store_id, planPrice])

    const handleWhatsApp = useCallback(() => {
        const cleaned = partner.phone?.replace(/\D/g, "") ?? ""
        const number = cleaned.startsWith("55") ? cleaned : `55${cleaned}`
        const text = encodeURIComponent(`Olá, ${partner.store_name || partner.store_name}! Vi seu plano "${plan.name}" na Dudit e gostaria de mais informações.`)
        window.open(`https://wa.me/${number}?text=${text}`, "_blank")
    }, [partner.phone, partner.store_name, partner.store_name, plan.name])

    const goToImage = useCallback((index: number) => {
        setSlideDirection(index > activeImgIndex ? 1 : -1)
        setActiveImgIndex(index)
    }, [activeImgIndex])

    const goToPrev = useCallback(() => {
        setSlideDirection(-1)
        setActiveImgIndex((p: number) => (p - 1 + galleryItems.length) % galleryItems.length)
    }, [galleryItems.length])

    const goToNext = useCallback(() => {
        setSlideDirection(1)
        setActiveImgIndex((p: number) => (p + 1) % galleryItems.length)
    }, [galleryItems.length])

    const lightboxNav = useCallback((dir: 1 | -1) => {
        lightboxJustOpened.current = false
        setSlideDirection(dir)
        setLightboxActiveImg((p: number) => (p + dir + galleryItems.length) % galleryItems.length)
    }, [galleryItems.length])

    const openLightbox = useCallback((index: number) => {
        lightboxJustOpened.current = true
        setLightboxActiveImg(index)
        setIsLightboxOpen(true)
    }, [])

    const formattedJoinedDate = useMemo(() => {
        if (!partner.created_at) return "Recente"
        try {
            const date = new Date(partner.created_at)
            return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
        } catch {
            return "Recente"
        }
    }, [partner.created_at])

    const reputationLevel = useMemo(() => {
        const sales = partner.vendas_totais || 0
        const rating = partner.rating || 5.0
        if (sales >= 2000 && rating >= 4.7) {
            return { name: "Diamante", badge: <img src="https://img.dudit.com.br/static/selos/Diamante.png" alt="Diamante" className="h-5 w-5" />, color: "text-brand-green bg-green-50/50 border-green-200", description: "Vendedor Diamante com excelente histórico de atendimento.", level: 5 }
        }
        if (sales >= 500 && rating >= 4.5) {
            return { name: "Platina", badge: <img src="https://img.dudit.com.br/static/selos/Platina.png" alt="Platina" className="h-5 w-5" />, color: "text-brand-green bg-green-50/50 border-green-200", description: "Vendedor Destaque Platina na Dudit.", level: 4 }
        }
        if (sales >= 100 && rating >= 4.3) {
            return { name: "Ouro", badge: <img src="https://img.dudit.com.br/static/selos/Ouro.png" alt="Ouro" className="h-5 w-5" />, color: "text-brand-green bg-green-50/50 border-green-200", description: "Vendedor com reputação Ouro e ótimo serviço.", level: 3 }
        }
        if (sales >= 20 && rating >= 4.0) {
            return { name: "Prata", badge: <img src="https://img.dudit.com.br/static/selos/Prata.png" alt="Prata" className="h-5 w-5" />, color: "text-brand-green bg-green-50/50 border-green-200", description: "Vendedor Prata consistente na plataforma.", level: 2 }
        }
        return { name: "Bronze", badge: <img src="https://img.dudit.com.br/static/selos/Bronze.png" alt="Bronze" className="h-5 w-5" />, color: "text-brand-green bg-green-50/50 border-green-200", description: "Vendedor Bronze iniciando suas vendas na Dudit.", level: 1 }
    }, [partner])

    const displayRating = useMemo(() => {
        return Number(partner.rating) > 0 ? Number(partner.rating).toFixed(1) : "-";
    }, [partner.rating])

    // No fluxo via WhatsApp, vendas e avaliação da Dudit não representam a
    // operação da loja. Nesse caso o card mostra apenas a data de cadastro.
    const isWhatsappFlow = orderFlow === "whatsapp"

    const BuyPanel = (
        <div className="bg-white dark:bg-dark-surface relative">
            <div className="flex items-center gap-2 mb-4">
                <span className="text-[11px] font-bold text-brand-dark dark:text-dark-heading bg-gray-100 dark:bg-dark-border/50 px-2 py-0.5 rounded uppercase tracking-wider">
                    Assinatura
                </span>
                <span className="text-brand-inactive-text dark:text-dark-body text-xs">|</span>
                <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">
                    {frequencyLabel}
                </span>
            </div>

            <h1 className="text-lg md:text-3xl leading-[1.1] font-medium text-brand-dark dark:text-dark-heading mb-6 tracking-tight">
                {plan.name}
            </h1>

            {/* Price */}
            <div className="mb-6">
                <div className="space-y-1">
                    <p className="text-2xl lg:text-3xl leading-none font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(planPrice)}{priceSuffix}
                    </p>
                    <p className="text-xs md:text-[0.875rem] text-brand-inactive-text dark:text-dark-body mt-1">
                        Cobrança recorrente {frequencyLabel}
                    </p>
                </div>
            </div>

            {/* Freight policy */}
            <div className="flex items-start gap-2 pb-6 mb-6 border-b border-brand-border text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
                <TruckIcon size={14} className="text-brand-primary mt-0.5 shrink-0" />
                <span>
                    {!acceptsDelivery ? (
                        <>Somente retirada no local - nenhuma cobrança de frete.</>
                    ) : planShippingMode === "flat" ? (
                        <>Frete fixo de <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(planShippingFlat)}</strong> cobrado em cada ciclo, sem re-cotação.</>
                    ) : planShippingMode === "quote" ? (
                        <>Frete cotado uma única vez no cadastro, conforme o seu endereço, e mantido em todos os ciclos da assinatura.</>
                    ) : (
                        <>Frete incluso no valor da assinatura.</>
                    )}
                </span>
            </div>

            {isPlanOwner && (
                <InfoCard
                    message={canBuyState.reason || (isTeamMember
                        ? "Você não pode assinar planos de um negócio do qual faz parte da equipe."
                        : "Você não pode assinar seus próprios planos.")}
                    color="orange"
                    className="mb-8"
                />
            )}
            {!isPlanOwner && partner.isShowcaseActive === false && (
                <InfoCard
                    title="Vitrine Inativa"
                    message="Esta vitrine está temporariamente inativa e não está aceitando novos pedidos."
                    color="orange"
                    className="mb-8"
                />
            )}
            {!isPlanOwner && partner.isShowcaseActive !== false && isClosedAndBlocking && (
                <InfoCard
                    title="Loja Fechada"
                    message="Esta loja está fechada no momento e não está aceitando novos pedidos fora do horário de funcionamento."
                    color="orange"
                    className="mb-8"
                />
            )}
            {!isPlanOwner && !recurringSaleAvailable && (
                <InfoCard
                    title="Assinatura pelo WhatsApp"
                    message="As assinaturas pela Dudit estão desativadas nesta loja. Continue pelo WhatsApp do vendedor para combinar a contratação."
                    color="yellow"
                    className="mb-8"
                />
            )}
            {!isPlanOwner && (
                <>
                    {/* Delivery Options */}
                    <div className="mb-6">
                        <FormDropdown
                            label="Como deseja receber?"
                            options={deliveryTypeOptions}
                            value={deliveryType}
                            setValue={(v) => setDeliveryType(v === "delivery" ? "delivery" : "pickup")}
                            placeholder="Selecione"
                            width="w-full"
                        />
                    </div>

                    {/* Shipping: address + delivery/pickup rows (parity with product) */}
                    <FormSection className="mb-8">
                        <div className="flex flex-col">
                            {loadingAddresses ? (
                                <div className="py-4 text-center text-xs text-brand-inactive-text dark:text-dark-body animate-pulse">
                                    Carregando endereços...
                                </div>
                            ) : deliveryType === "delivery" && userId && selectedAddress ? (
                                <div className="flex items-center justify-between w-full py-4">
                                    <div className="flex items-stretch gap-3">
                                        <img
                                            src="https://img.dudit.com.br/static/Map.png"
                                            alt="Endereço de entrega"
                                            className="w-10 h-10 object-cover rounded-full shrink-0"
                                        />
                                        <div className="flex flex-col justify-center">
                                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Endereço de Entrega</p>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body max-w-[200px] sm:max-w-xs truncate">
                                                {selectedAddress.street}, {selectedAddress.number}
                                            </p>
                                        </div>
                                    </div>
                                    <Button variant="link" size="sm" className="text-brand-green font-bold hover:underline p-0" onClick={() => setShowAddressModal(true)}>
                                        Trocar
                                    </Button>
                                </div>
                            ) : deliveryType === "delivery" ? (
                                <div className="py-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddressForm(true)}
                                        className="text-xs font-bold text-brand-green hover:underline flex items-center gap-1"
                                    >
                                        <PlusIcon size={14} /> {userAddresses.length > 0 ? "Cadastrar novo endereço" : "Cadastrar endereço de entrega"}
                                    </button>
                                </div>
                            ) : null}

                            {!loadingAddresses && <Separator className="opacity-60" />}

                            {acceptsDelivery && (
                                <>
                                    <div className="flex justify-between items-start py-4">
                                        <div>
                                            <p className="text-sm text-brand-dark dark:text-dark-heading font-medium leading-snug">Entrega pelo vendedor</p>
                                            {deliveryType !== "delivery" ? (
                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">Selecione a entrega acima para informar o endereço</p>
                                            ) : planShippingMode === "quote" ? (
                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">Frete cotado neste endereço e mantido em todos os ciclos</p>
                                            ) : planShippingMode === "flat" ? (
                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">Cobrado em cada ciclo da assinatura, sem re-cotação</p>
                                            ) : (
                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">Frete incluso no valor da assinatura</p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            {deliveryType !== "delivery" ? (
                                                <p className="text-sm font-bold text-brand-inactive-text dark:text-dark-body">-</p>
                                            ) : planShippingMode === "flat" ? (
                                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(planShippingFlat)}</p>
                                            ) : planShippingMode === "quote" ? (
                                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                    {planDeliveryFee === null ? "A combinar" : planDeliveryFee > 0 ? formatCurrency(planDeliveryFee) : "Grátis"}
                                                </p>
                                            ) : (
                                                <p className="text-sm font-bold text-brand-green">Grátis</p>
                                            )}
                                        </div>
                                    </div>
                                    <Separator className="opacity-60" />
                                </>
                            )}

                            {acceptsPickup && (
                                <div className="flex justify-between items-start py-4">
                                    <div>
                                        <p className="text-sm text-brand-dark dark:text-dark-heading font-medium leading-snug">Retirar no local</p>
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">Compareça à loja no dia combinado com o vendedor</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-brand-green">Grátis</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </FormSection>

                    {/* Subscribe button */}
                    <div className="hidden lg:block mb-4">
                        <Button
                            onClick={handleSubscribe}
                            disabled={submitting || (deliveryType === "delivery" && !selectedAddressId) || partner.isShowcaseActive === false || isClosedAndBlocking}
                            className="w-full h-[46px]"
                        >
                            {partner.isShowcaseActive === false ? (
                                "Vitrine Inativa"
                            ) : isClosedAndBlocking ? (
                                "Loja Fechada"
                            ) : !recurringSaleAvailable ? (
                                <span className="flex items-center gap-2">
                                    <WhatsappIcon size={18} className="fill-white" />
                                    Assinar pelo WhatsApp
                                </span>
                            ) : submitting ? (
                                <span className="flex items-center gap-2">
                                    <Spinner />
                                    Processando assinatura...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <CheckCircleIcon size={18} />
                                    Assinar Agora
                                </span>
                            )}
                        </Button>

                        <p className="text-[11px] text-brand-inactive-text dark:text-dark-body text-center mt-4 leading-relaxed font-medium">
                            Ao assinar, você concorda com os termos da Dudit e autoriza cobranças recorrentes no período selecionado. Cancele quando quiser.
                        </p>
                    </div>
                </>
            )}

            {/* Informações importantes Accordion */}
            <div className="border-t border-brand-border pt-4 mb-4">
                <div className="border-b border-brand-border pb-3">
                    <button
                        type="button"
                        onClick={() => setExpandedAccordion(expandedAccordion === "important_info" ? null : "important_info")}
                        className="w-full flex items-center justify-between py-2 text-left hover:text-brand-green transition-colors"
                    >
                        <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">Informações importantes</span>
                        <ChevronDownIcon
                            size={18}
                            className={`text-brand-inactive-text dark:text-dark-body transition-transform duration-200 ${expandedAccordion === "important_info" ? "rotate-180" : ""}`}
                        />
                    </button>
                    <AnimatePresence initial={false}>
                        {expandedAccordion === "important_info" && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                className="overflow-hidden"
                            >
                                <div className="pt-2 pb-1 flex flex-col gap-3">
                                    {/* Item 1 */}
                                    <button
                                        type="button"
                                        onClick={() => setShowPaymentModal(true)}
                                        className="w-full text-left py-2 px-1 hover:bg-brand-gray/50 dark:hover:bg-dark-border/30 transition-colors flex flex-col gap-0.5"
                                    >
                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Pagamento direto ao vendedor</span>
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body">Entenda onde vai o seu dinheiro nesta compra</span>
                                    </button>
                                    {/* Item 2 */}
                                    <button
                                        type="button"
                                        onClick={() => setShowResponsibilityModal(true)}
                                        className="w-full text-left py-2 px-1 hover:bg-brand-gray/50 dark:hover:bg-dark-border/30 transition-colors flex flex-col gap-0.5"
                                    >
                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Quem cuida do seu pedido?</span>
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body">Entenda sobre a entrega, garantia e pós-venda</span>
                                    </button>
                                    {/* Item 3 */}
                                    <button
                                        type="button"
                                        onClick={() => setShowPoliciesModal(true)}
                                        className="w-full text-left py-2 px-1 hover:bg-brand-gray/50 dark:hover:bg-dark-border/30 transition-colors flex flex-col gap-0.5"
                                    >
                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Políticas da loja</span>
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body">Informações sobre devoluções, trocas e cancelamentos</span>
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Store (Reputation & Levels Card) */}
            <div className="mb-8 mt-4">
                {(() => {
                    const sellerAvatarImage = partner.store_avatar && !partner.store_avatar.includes("Placeholder.png") ? getR2ImageUrl(partner.store_avatar, "thumb") : null;
                    const sellerBannerFallback = sellerAvatarImage
                        ? getDefaultBannerSeeded(partner.id || partner.store_name || "Vendedor")
                        : getBannerUrlByColor(getAvatarColor(partner.store_name || "Vendedor"));
                    const sellerBannerImage = partner.banner_url && !partner.banner_url.includes("Placeholder.png")
                        ? getR2ImageUrl(partner.banner_url, "large")
                        : sellerBannerFallback;

                    return (
                        <div className="border border-brand-border rounded-2xl overflow-hidden bg-white dark:bg-dark-surface">
                            {/* Top clickable block linking to partner profile */}
                            <Link href={getStoreUrl(partner)} prefetch={false} className="block group">
                                {/* Banner */}
                                <div className="aspect-[1400/300] w-full relative bg-gray-100 dark:bg-dark-border/50 overflow-hidden select-none">
                                    <img src={sellerBannerImage} alt={`Banner de ${partner.store_name}`} className="w-full h-full object-cover object-center" />
                                    <div className="absolute inset-0" />
                                </div>

                                {/* Profile Header */}
                                <div className="px-4 pt-0 relative flex flex-col">
                                    {/* Avatar Container overlapping the banner */}
                                    <div className="w-14 h-14 rounded-full border-2 border-white overflow-hidden bg-white -mt-7 z-10 self-start shadow-xs">
                                        <UserProfileImage
                                            fullName={partner.store_name}
                                            imageUrl={sellerAvatarImage}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>

                                    {/* Store Name and Details */}
                                    <div className="mt-2 min-w-0">
                                        <div className="flex items-center gap-1.5 justify-between">
                                            <span className="font-bold text-brand-dark dark:text-dark-heading text-base truncate">
                                                {partner.store_name}
                                            </span>
                                        </div>
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 font-medium">
                                            {partner.city} - {partner.state}
                                        </p>
                                    </div>
                                </div>
                            </Link>

                            <div className="px-4 pb-4">
                                {isWhatsappFlow ? (
                                    <div className="mt-2 pt-4 border-t border-brand-border text-center select-none">
                                        <div className="flex flex-col items-center">
                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formattedJoinedDate}</span>
                                            <span className="text-[10px] font-semibold text-brand-inactive-text dark:text-dark-body mt-0.5">Cadastro</span>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Reputation & Levels Bar */}
                                        <div className="my-6 flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-base leading-none">{reputationLevel.badge}</span>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Selo Dudit: {reputationLevel.name}</span>
                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body">Nível do vendedor baseado em reputação e vendas</span>
                                                </div>
                                            </div>

                                            {/* Horizontal segment bars */}
                                            <div className="flex gap-1 h-1.5 w-full bg-transparent rounded-full overflow-hidden mt-1 select-none">
                                                {[1, 2, 3, 4, 5].map((lvl) => (
                                                    <div
                                                        key={lvl}
                                                        className={`flex-1 h-full rounded-sm transition-all duration-300 ${reputationLevel.level >= lvl ? "bg-brand-green" : "bg-gray-200 dark:bg-dark-border"
                                                            }`}
                                                    />
                                                ))}
                                            </div>
                                        </div>

                                        {/* 3 columns metrics */}
                                        <div className="grid grid-cols-3 gap-2 pt-4 border-t border-brand-border text-center select-none">
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{displayRating}</span>
                                                <span className="text-[10px] font-semibold text-brand-inactive-text dark:text-dark-body mt-0.5">Avaliação</span>
                                            </div>
                                            <div className="flex flex-col items-center border-x border-brand-border">
                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{partner.vendas_totais || 0}</span>
                                                <span className="text-[10px] font-semibold text-brand-inactive-text dark:text-dark-body mt-0.5">Vendas</span>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formattedJoinedDate}</span>
                                                <span className="text-[10px] font-semibold text-brand-inactive-text dark:text-dark-body mt-0.5">Cadastro</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* Sponsored ad below seller card */}
            <SponsoredAdDetailSlot ad={sponsoredAd} />

            {!isPlanOwner && (
                <button
                    onClick={() => setShowReportModal(true)}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-2 text-xs font-medium text-brand-inactive-text dark:text-dark-body hover:text-[#d32f2f] transition-colors"
                >
                    <FlagIcon size={14} />
                    Comunicar algo errado
                </button>
            )}
        </div>
    )

    const renderGalleryItem = (
        item: (typeof galleryItems)[number],
        className: string,
        alt: string,
        layout: "inline" | "lightbox" = "inline",
    ) => {
        return <motion.img key={item.src} src={item.src} className={className} alt={alt} custom={slideDirection} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} />
    }

    return (
        <>
            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                url={isMounted ? `${window.location.origin}${getPlanUrl(plan, partner)}` : ""}
                title={plan.name}
                shareMessage={`Gostou? Espalhe a novidade!\n\n*${plan.name}*\nAssinatura recorrente na Dudit:`}
                label="Link do plano"
            />

            <StorePoliciesModal
                isOpen={showPoliciesModal}
                onClose={() => setShowPoliciesModal(false)}
                partnerId={partner.partner_id || partner.id}
                storeName={partner.store_name}
            />

            <ReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                targetType="recurring_plan"
                targetId={plan.id}
                targetName={plan.name || "Assinatura"}
            />

            <DefaultModal
                isOpen={showAddressModal}
                onClose={() => setShowAddressModal(false)}
                title="Seus Endereços"
                maxWidth="md"
            >
                <div className="space-y-3 pb-4">
                    {userAddresses.length === 0 && (
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum endereço cadastrado.</p>
                    )}
                    {userAddresses.map((address: any) => (
                        <div
                            key={address.id}
                            onClick={() => {
                                setSelectedAddressId(address.id)
                                setShowAddressModal(false)
                            }}
                            className={`flex items-start border py-4 rounded-xl transition-all cursor-pointer ${selectedAddressId === address.id
                                ? "border-brand-green bg-green-50/30 dark:bg-green-900/10"
                                : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                                }`}
                        >
                            <div className="mt-2.5 shrink-0 px-4">
                                <RadioButton
                                    name="planAddressSelect"
                                    value={address.id}
                                    checked={selectedAddressId === address.id}
                                    onChange={() => {
                                        setSelectedAddressId(address.id)
                                        setShowAddressModal(false)
                                    }}
                                />
                            </div>
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
                isOpen={showAddressForm}
                onClose={() => setShowAddressForm(false)}
                title="Adicionar novo endereço"
            >
                <div className="flex flex-col gap-4 pb-4">
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

                    <CepInput
                        id="new-addr-cep"
                        name="zipCode"
                        label="CEP"
                        value={newAddressData.zipCode}
                        onChange={val => setNewAddressData(prev => ({ ...prev, zipCode: val }))}
                        onAddressFetched={handleCepBlur}
                    />
                    <Input
                        label="Rua/Avenida"
                        id="new-addr-street"
                        name="street"
                        value={newAddressData.street}
                        onChange={e => setNewAddressData(prev => ({ ...prev, street: e.target.value }))}
                        disabled={loadingCep}
                        placeholder="Rua, Avenida, etc."
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <NumberInputWithCheckbox
                                label="Número"
                                number={newAddressData.number}
                                noNumber={newAddressData.noNumber}
                                onNumberChange={(val) => setNewAddressData(prev => ({ ...prev, number: val }))}
                                onNoNumberChange={(checked) => setNewAddressData(prev => ({ ...prev, noNumber: checked, number: checked ? "S/N" : "" }))}
                                placeholder="123"
                            />
                        </div>
                        <Input
                            label="Complemento"
                            id="new-addr-comp"
                            name="complement"
                            value={newAddressData.complement}
                            onChange={e => setNewAddressData(prev => ({ ...prev, complement: e.target.value }))}
                            placeholder="Apto, Bloco, etc."
                        />
                    </div>
                    <Input
                        label="Bairro"
                        id="new-addr-neighborhood"
                        name="neighborhood"
                        value={newAddressData.neighborhood}
                        onChange={e => setNewAddressData(prev => ({ ...prev, neighborhood: e.target.value }))}
                        disabled={loadingCep}
                        placeholder="Nome do bairro"
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Cidade"
                            id="new-addr-city"
                            name="city"
                            value={newAddressData.city}
                            onChange={e => setNewAddressData(prev => ({ ...prev, city: e.target.value }))}
                            disabled={loadingCep}
                            placeholder="Nome da cidade"
                        />
                        <Input
                            label="Estado"
                            id="new-addr-state"
                            name="state"
                            value={newAddressData.state}
                            onChange={e => setNewAddressData(prev => ({ ...prev, state: e.target.value.toUpperCase().slice(0, 2) }))}
                            disabled={loadingCep}
                            placeholder="UF"
                        />
                    </div>

                    <label className="flex items-center gap-2 text-xs text-brand-dark dark:text-dark-heading cursor-pointer pt-1">
                        <input
                            type="checkbox"
                            checked={newAddressData.isDefault || userAddresses.length === 0}
                            disabled={userAddresses.length === 0}
                            onChange={(e) => setNewAddressData(prev => ({ ...prev, isDefault: e.target.checked }))}
                            className="rounded text-brand-green focus:ring-brand-green h-4 w-4"
                        />
                        <span>Definir como endereço padrão (reflete no ERP de todas as lojas)</span>
                    </label>

                    <div className="flex gap-2">
                        <Button onClick={handleSaveAddress} disabled={loadingCep} className="flex-1">
                            {loadingCep ? <Spinner size={16} className="mr-2" /> : null}
                            Salvar Endereço
                        </Button>
                        <Button variant="outline" onClick={() => setShowAddressForm(false)}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                maxWidth="md"
                hideHeader={true}
            >
                <div className="flex flex-col relative">
                    {/* Close X Button - Desktop Only */}
                    <button
                        onClick={() => setShowPaymentModal(false)}
                        className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-brand-dark dark:text-dark-heading transition-colors hidden md:flex"
                        title="Fechar"
                    >
                        <XIcon size={18} />
                    </button>
                    {/* Header with Dual Squares */}
                    <div className="h-[200px] rounded-2xl flex items-end justify-center mb-8 relative overflow-hidden bg-[#eaf7f0]">
                        <img
                            src="https://img.dudit.com.br/static/illustrations/Pagamento.png"
                            alt="Pagamento"
                            className="w-64 h-auto object-contain transform translate-y-7"
                        />
                    </div>

                    <h4 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-4 text-center">Onde vai o seu dinheiro?</h4>
                    <div className="space-y-4 text-brand-inactive-text dark:text-dark-body text-[15px] text-center leading-relaxed">
                        <p>
                            Na Dudit, a transparência é total. Nós não processamos pagamentos diretamente e não ficamos com nenhuma comissão sobre a sua compra.
                        </p>
                        <p>
                            Isso significa que o seu dinheiro vai direto para o vendedor, seja através de facilitadores seguros (como o Mercado Pago) ou por meio do acerto que você fizer direto no balcão ou no WhatsApp. É mais lucro para quem vende e mais agilidade para quem compra!
                        </p>
                    </div>
                    <Button onClick={() => setShowPaymentModal(false)} className="w-full mt-8 h-12">Entendi</Button>
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={showResponsibilityModal}
                onClose={() => setShowResponsibilityModal(false)}
                maxWidth="md"
                hideHeader={true}
            >
                <div className="flex flex-col relative">
                    {/* Close X Button - Desktop Only */}
                    <Button
                        variant="filled"
                        onClick={() => setShowResponsibilityModal(false)}
                        className="absolute top-3 right-3 z-10 w-10 h-10 hidden md:flex"
                        title="Fechar"
                    >
                        <XIcon size={18} />
                    </Button>
                    {/* Header with Dual Squares */}
                    <div className="h-[200px] rounded-2xl flex items-end justify-center mb-8 relative overflow-hidden bg-[#eaf7f0]">
                        <img
                            src="https://img.dudit.com.br/static/illustrations/Responsabilidade.png"
                            alt="Responsabilidade"
                            className="w-64 h-auto object-contain transform translate-y-7"
                        />
                    </div>

                    <h4 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-4 text-center">Quem cuida do seu pedido?</h4>
                    <div className="space-y-4 text-brand-inactive-text dark:text-dark-body text-[15px] text-center leading-relaxed">
                        <p>
                            A Dudit é a ponte que conecta você ao vendedor. Nós cuidamos da vitrine, da organização e do registro do seu pedido, mas a execução da venda é por conta do vendedor.
                        </p>
                        <p>
                            A responsabilidade por separar o produto, realizar a entrega, oferecer garantia e resolver trocas ou devoluções é exclusivamente do vendedor. Se tiver qualquer dúvida sobre o seu item, o melhor caminho é chamar o vendedor no WhatsApp para alinhar tudo, beleza?
                        </p>
                    </div>
                    <Button onClick={() => setShowResponsibilityModal(false)} className="w-full mt-8 h-12">Entendi</Button>
                </div>
            </DefaultModal>

            {!hideHeaderAndFooter && (
                <MarketplaceHeader
                    userProfile={userProfile}
                    cartCount={cartCount}
                    productName={plan.name}
                    onShare={() => setShowShareModal(true)}
                />
            )}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="min-h-screen bg-white dark:bg-dark-background lg:pt-[50px] font-sans flex flex-col"
            >
                {isMounted && createPortal(
                    <AnimatePresence>
                        {isLightboxOpen && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                transition={{ duration: 0.25, ease: "easeOut" }}
                                className="fixed inset-0 z-[9999] flex flex-col bg-black lg:bg-black/90 lg:backdrop-blur-sm"
                                style={{ zIndex }}
                            >
                                {/* Mobile top bar */}
                                <div className="flex lg:hidden items-center justify-between px-6 pt-12 pb-4 shrink-0">
                                    <button onClick={() => setIsLightboxOpen(false)}
                                        className="w-10 h-10 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                                        <XIcon size={20} />
                                    </button>
                                    <span className="text-white text-sm font-semibold">
                                        {lightboxActiveImg + 1}/{galleryItems.length}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setShowShareModal(true)} className="w-10 h-10 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                                            <ShareIcon size={20} />
                                        </button>
                                    </div>
                                </div>

                                {/* Desktop layout */}
                                <div className="hidden lg:flex flex-1 min-h-0 relative">
                                    <button onClick={() => setIsLightboxOpen(false)}
                                        className="absolute top-6 right-6 z-10 w-11 h-11 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                                        <XIcon size={22} />
                                    </button>

                                    {/* Thumbnails column */}
                                    <div className="flex flex-col gap-2 w-[120px] shrink-0 overflow-y-auto px-5 py-6">
                                        {galleryItems.map((item: any, i: number) => (
                                            <div key={i} onClick={() => { lightboxJustOpened.current = false; setSlideDirection(i > lightboxActiveImg ? 1 : -1); setLightboxActiveImg(i) }}
                                                className={`w-full aspect-square rounded-md border-2 cursor-pointer overflow-hidden shrink-0 transition-all
                                                    ${lightboxActiveImg === i ? "border-white" : "border-white/20 hover:border-white/50"}`}>
                                                <img src={item.src} className="w-full h-full object-cover" alt={`Foto de ${plan.name} à venda em ${partner.city} - ${partner.state}`} />
                                            </div>
                                        ))}
                                    </div>

                                    {/* Main image */}
                                    <div className="relative flex-1 flex items-center justify-center min-w-0 p-8">
                                        <AnimatePresence mode="wait" custom={slideDirection}
                                            onExitComplete={() => { lightboxJustOpened.current = false }}>
                                            {renderGalleryItem(galleryItems[lightboxActiveImg], "max-w-full max-h-full object-contain", `Foto principal de ${plan.name} à venda em ${partner.city} - ${partner.state}`, "lightbox")}
                                        </AnimatePresence>
                                        {galleryItems.length > 1 && (
                                            <>
                                                <Button variant="filled" onClick={() => lightboxNav(-1)}
                                                    className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center">
                                                    <ChevronLeftIcon size={26} />
                                                </Button>
                                                <Button variant="filled" onClick={() => lightboxNav(1)}
                                                    className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center">
                                                    <ChevronRightIcon size={26} />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Mobile image area */}
                                <div className="flex lg:hidden flex-1 min-h-0 relative items-center justify-center"
                                    onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
                                    onTouchEnd={(e) => {
                                        const diff = e.changedTouches[0].clientX - touchStartX.current
                                        if (Math.abs(diff) > 50) {
                                            lightboxNav(diff > 0 ? -1 : 1)
                                        }
                                    }}
                                >
                                    <AnimatePresence mode="wait" custom={slideDirection}
                                        onExitComplete={() => { lightboxJustOpened.current = false }}>
                                        {renderGalleryItem(galleryItems[lightboxActiveImg], "max-w-full max-h-full object-contain px-4", `Foto de ${plan.name} à venda em ${partner.city} - ${partner.state}`, "lightbox")}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}

                <div className="container mx-auto px-4 max-w-[1400px] lg:mt-6 mb-6 flex-grow pb-28 lg:pb-12 pt-4 lg:pt-[50px]">
                    {/* Breadcrumbs */}
                    <div className="hidden lg:flex items-center gap-2 text-sm text-brand-inactive-text dark:text-dark-body mb-8">
                        {partner.city && partner.state && (
                            <>
                                <Link href={`/explorar/${formatCityStateSlug(partner.city, partner.state)}`} prefetch={false} className="hover:text-brand-dark dark:text-dark-heading transition-colors">
                                    {partner.city} - {partner.state}
                                </Link>
                                <ChevronRightIcon size={10} />
                            </>
                        )}
                        <Link href={`/explorar/${formatCityStateSlug(partner.city, partner.state)}?type=planos`} prefetch={false} className="hover:text-brand-dark dark:text-dark-heading transition-colors">
                            Assinaturas
                        </Link>
                        <ChevronRightIcon size={10} />
                        <span className="text-brand-inactive-text dark:text-dark-body truncate max-w-[300px]">{plan.name}</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12">
                        {/* Left Column: Details */}
                        <div className="lg:col-span-8">

                            {/* Gallery */}
                            <div className="flex gap-3 mb-6">
                                {/* Desktop thumbnails */}
                                <div className="hidden lg:flex flex-col gap-2 w-[70px] shrink-0">
                                    {galleryItems.map((item: any, i: number) => (
                                        <div key={i} onClick={() => goToImage(i)}
                                            className={`w-full aspect-square rounded-md border cursor-pointer overflow-hidden transition-all
                                                ${activeImgIndex === i ? "border-brand-green ring-1 ring-brand-green" : "border-brand-border hover:border-brand-border"}`}>
                                            <img src={item.src} className="w-full h-full object-cover" alt={`Foto de ${plan.name} em ${partner.city}`} />
                                        </div>
                                    ))}
                                </div>

                                <div className="flex-1 min-w-0 flex items-start gap-2 lg:gap-4">
                                    {/* Gallery navigation + image (centered vertically) */}
                                    <div className="flex-1 min-w-0 flex items-center gap-2 lg:gap-4">
                                        {/* Desktop Prev Button */}
                                        <div className="hidden lg:flex w-10 shrink-0 items-center justify-center">
                                            {galleryItems.length > 1 && (
                                                <Button variant="filled" onClick={goToPrev} className="w-10 h-10 flex items-center justify-center">
                                                    <ChevronLeftIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                                                </Button>
                                            )}
                                        </div>

                                        <div className="relative flex-1 min-w-0">
                                            {/* Desktop main image */}
                                            <div className="hidden lg:block" style={{ paddingBottom: "100%", position: "relative" }}>
                                                <div ref={galleryContainerRef}
                                                    className="absolute inset-0 bg-brand-gray dark:bg-dark-border/30 overflow-hidden rounded-2xl cursor-zoom-in"
                                                    onMouseMove={(e) => {
                                                        const { left, top, width, height } = galleryContainerRef.current!.getBoundingClientRect()
                                                        zoomOriginX.set(((e.clientX - left) / width) * 100)
                                                        zoomOriginY.set(((e.clientY - top) / height) * 100)
                                                        zoomScale.set(2.2)
                                                    }}
                                                    onMouseLeave={() => zoomScale.set(1)}
                                                    onClick={() => openLightbox(activeImgIndex)}>
                                                    <AnimatePresence mode="popLayout" custom={slideDirection}>
                                                        <motion.img key={activeImgIndex} src={galleryItems[activeImgIndex].src}
                                                            className="absolute inset-0 w-full h-full object-contain cursor-pointer" alt={`Foto de ${plan.name} à venda em ${partner.city} - ${partner.state}`}
                                                            custom={slideDirection} variants={slideVariants}
                                                            initial="enter" animate="center" exit="exit"
                                                            transition={{ duration: 0.2 }}
                                                            onClick={() => openLightbox(activeImgIndex)}
                                                            style={{ transformOrigin, scale: smoothScale }} />
                                                    </AnimatePresence>
                                                </div>
                                            </div>

                                            {/* Mobile main image */}
                                            <div className="lg:hidden relative bg-white dark:bg-dark-surface rounded-xl overflow-hidden cursor-pointer" style={{ aspectRatio: "1/1" }} onClick={() => openLightbox(activeImgIndex)}>
                                                <AnimatePresence mode="wait" custom={slideDirection}>
                                                    {renderGalleryItem(galleryItems[activeImgIndex], "absolute inset-0 w-full h-full object-contain", `Foto de ${plan.name} à venda em ${partner.city} - ${partner.state}`)}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        {/* Desktop Actions Column (top) + Next Button */}
                                        <div className="hidden lg:flex flex-col items-center gap-3 shrink-0 self-stretch">
                                            {/* Action buttons at top */}
                                            <div className="flex flex-col items-center gap-2">
                                                <Button variant="outline" size="icon" onClick={() => setShowShareModal(true)} className="w-10 h-10" title="Compartilhar">
                                                    <ShareIcon size={18} className="text-brand-green" />
                                                </Button>
                                            </div>

                                            {/* Next Button centered vertically in remaining space */}
                                            <div className="flex-1 flex items-center">
                                                {galleryItems.length > 1 && (
                                                    <Button variant="filled" onClick={goToNext} className="w-10 h-10 flex items-center justify-center">
                                                        <ChevronRightIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Buy panel (mobile/tablet layout) */}
                            <div className="lg:hidden mb-6">{BuyPanel}</div>

                            {/* Description */}
                            <div className="mb-10">
                                <h3 className="text-xl font-medium text-brand-dark dark:text-dark-heading mb-4">Descrição</h3>
                                <div className={`relative ${!isDescriptionExpanded ? "max-h-[150px] overflow-hidden" : ""}`}>
                                    <p className="text-sm md:text-[0.9375rem] text-gray-600 dark:text-dark-body leading-relaxed whitespace-pre-wrap">
                                        {plan.description || "Sem descrição."}
                                    </p>
                                    {!isDescriptionExpanded && plan.description?.length > 200 && (
                                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-gray-900 dark:to-transparent" />
                                    )}
                                </div>
                                {plan.description?.length > 200 && (
                                    <button onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                        className="flex items-center gap-1 text-brand-green font-bold text-sm mt-3 hover:underline">
                                        {isDescriptionExpanded ? "Ver menos" : "Ver mais"}
                                        <ChevronDownIcon size={16} className={`transition-transform ${isDescriptionExpanded ? "rotate-180" : ""}`} />
                                    </button>
                                )}
                            </div>

                            {/* Items Included */}
                            <div className="border-t border-brand-border pt-8 mb-10">
                                <h3 className="text-xl font-medium text-brand-dark dark:text-dark-heading mb-5 flex items-center gap-2">
                                    Itens inclusos na assinatura
                                </h3>
                                <div className="space-y-4">
                                    {plan.items && plan.items.length > 0 ? (
                                        plan.items.map((item: any) => {
                                            const type = item.item_type || "product"
                                            const quantity = item.quantity || 1
                                            const details = type === "product" ? item.products : item.services
                                            const name = details?.name || (type === "product" ? "Produto" : "Serviço")
                                            const itemImages = details?.images
                                            const imgUrl = (Array.isArray(itemImages) && itemImages[0]) || PLACEHOLDER

                                            return (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center gap-4 p-4 rounded-xl border border-brand-border bg-brand-gray dark:bg-dark-border/30 hover:border-gray-200 dark:hover:border-dark-border transition-colors"
                                                >
                                                    <div className="w-16 h-16 rounded-[12px] bg-white border border-brand-border overflow-hidden shrink-0">
                                                        <img
                                                            src={getR2ImageUrl(imgUrl)}
                                                            alt={name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-[15px] font-medium text-brand-dark dark:text-dark-heading truncate">
                                                            {name}
                                                        </h3>
                                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">
                                                            Qtd: {quantity}x • {type === "product" ? "Entregável" : "Serviço/Agendável"}
                                                        </p>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    ) : (
                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum item adicionado a este plano.</p>
                                    )}
                                </div>
                            </div>

                            {/* Accordion FAQs */}
                            <div className="border-t border-brand-border pt-8 mb-10">
                                <h3 className="text-xl font-medium text-brand-dark dark:text-dark-heading mb-5">Dúvidas Frequentes</h3>
                                <div className="border border-brand-border rounded-2xl overflow-hidden divide-y divide-brand-border">
                                    {[
                                        {
                                            id: "faq-how",
                                            title: "Como funciona a assinatura?",
                                            content: `As assinaturas recorrentes são processadas de forma automática de acordo com o intervalo do plano (${frequencyLabel}). Você recebe todos os itens descritos no plano de forma recorrente. A cobrança é gerada de acordo com as regras estabelecidas pelo parceiro.`
                                        },
                                        {
                                            id: "faq-pause",
                                            title: "Posso pausar ou cancelar a qualquer momento?",
                                            content: "Sim! Na Dudit, você tem total autonomia. Acessando a área 'Minhas Assinaturas' no seu perfil, você pode pausar temporariamente ou cancelar o plano a qualquer momento, sem taxas ocultas ou multas rescisórias."
                                        },
                                        {
                                            id: "faq-delivery",
                                            title: "Como funciona a entrega/retirada recorrente?",
                                            content: "Você define a modalidade de entrega na hora de assinar. Se optar por Entrega, ela será efetuada no endereço fornecido em cada período de recorrência do plano. Se preferir Retirada, basta comparecer ao local do vendedor no dia combinado."
                                        }
                                    ].map((item) => (
                                        <div key={item.id} className="bg-white dark:bg-dark-surface">
                                            <button
                                                onClick={() => setExpandedAccordion(expandedAccordion === item.id ? null : item.id)}
                                                className="w-full text-left px-5 py-4 flex items-center justify-between text-[15px] font-medium text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors"
                                            >
                                                <span>{item.title}</span>
                                                <ChevronDownIcon size={16} className={`transform transition-transform text-brand-inactive-text dark:text-dark-body duration-200 ${expandedAccordion === item.id ? "rotate-180" : ""}`} />
                                            </button>
                                            <AnimatePresence initial={false}>
                                                {expandedAccordion === item.id && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.2, ease: "easeInOut" }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="px-5 pb-4 text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                                            {item.content}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Desktop Buy Panel */}
                        <div className="hidden lg:block lg:col-span-4 relative">
                            {BuyPanel}
                        </div>
                    </div>

                    {/* Mobile bottom bar */}
                    {!isPlanOwner && (
                        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-surface border-t dark:border-dark-border p-4 z-50 flex gap-3 lg:hidden shadow-lg">
                            <div className="flex-1 flex flex-col justify-center min-w-0">
                                <span className="text-[10px] text-brand-inactive-text dark:text-dark-body font-bold uppercase tracking-wider">Assinatura</span>
                                <span className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-none mt-0.5 truncate">
                                    {formatCurrency(planPrice)}
                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body font-normal">{priceSuffix}</span>
                                </span>
                                {acceptsDelivery && planShippingMode === "flat" && planShippingFlat > 0 && (
                                    <span className="text-[10px] text-brand-inactive-text dark:text-dark-body mt-0.5 truncate">
                                        + frete {formatCurrency(planShippingFlat)} por ciclo
                                    </span>
                                )}
                            </div>
                            <Button
                                className="flex-1 rounded-full min-w-[120px]"
                                disabled={submitting || (deliveryType === "delivery" && !selectedAddressId) || partner.isShowcaseActive === false || isClosedAndBlocking}
                                onClick={handleSubscribe}
                            >
                                {partner.isShowcaseActive === false ? (
                                    "Vitrine Inativa"
                                ) : isClosedAndBlocking ? (
                                    "Loja Fechada"
                                ) : !recurringSaleAvailable ? (
                                    <span className="flex items-center gap-2">
                                        <WhatsappIcon size={16} className="fill-white" />
                                        WhatsApp
                                    </span>
                                ) : submitting ? (
                                    <span className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Assinando...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <CheckCircleIcon size={16} />
                                        Assinar
                                    </span>
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            </motion.div>
        </>
    )
}
