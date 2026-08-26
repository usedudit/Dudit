"use client"

import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useSupabase } from "@/providers/supabase-provider"
import {
    StarIcon,
    ChevronRightIcon,
    ChevronLeftIcon,
    ChevronDownIcon,
    CheckCircleIcon,
    ClockIcon,
    CalendarIcon,
    CheckIcon,
    ShareIcon,
    HeartIcon,
    XIcon,
    TruckIcon,
    ArrowLeftRightIcon,
    PlusIcon,
    TagIcon,
    WhatsappIcon,
    StoreIcon,
    MapPinIcon,
    FileTextIcon,
    FlagIcon,
} from "@/lib/icons"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { useFavorites } from "@/providers/favorites-provider"
import { fetchCSRFTokenSingleton } from "@/hooks/use-csrf-token"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { checkCanUserBuyFromStoreAction } from "@/app/actions/marketplace/cart-extensions"
import { InfoCard } from "@/components/reusable/InfoCard"
import { Button, Input, FormSection, IconPlaceholder, DefaultModal, CepInput, Spinner, StateComboBox, RadioButton, NumberInputWithCheckbox, Badge, ListItem } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { getBillingUnitSuffix } from "@/lib/utils/formatters"
import { ShareModal } from "./ShareModal"
import { AddToCollectionModal } from "./AddToCollectionModal"
import { RequestQuoteModal } from "./RequestQuoteModal"
import { ReportModal } from "./ReportModal"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { ReviewsSection } from "./ReviewsSection"
import { UserProfileImage, getAvatarColor, getBannerUrlByColor } from "@/lib/utils/UserProfileImage"
import { getDefaultBannerSeeded } from "@/lib/utils/banner"
import { useNotification } from "@/hooks/use-notification"
import { getPublicAvailableTimeSlots } from "@/app/actions/marketplace/services"
import {
    prepareServiceBookingCheckoutAction,
    addServiceBookingToCartAction,
    getGiftItemDetailsAction,
} from "@/app/actions/marketplace/cart-extensions"
import { invalidateCartCache } from "@/hooks/use-cart"
import { getPartnerDeliveryConfigAction, quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { getAddressesAction, createAddressAction } from "@/app/actions/shared/addresses"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { normalizeOpeningHours } from "@/lib/utils/opening-hours"
import { VendorPaymentMethodsModal } from "./VendorPaymentMethodsModal"
import { StorePoliciesModal } from "./StorePoliciesModal"
import { getStoreUrl, getServiceUrl, formatCityStateSlug } from "@/lib/utils/url-generator"
import { createSlug, createCategorySlug } from "@/lib/utils/slugify"

import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import { computeItemDisplayPrice } from "@/lib/services/pricing-engine"
import { SponsoredAdDetailSlot } from "@/components/marketplace/ads/SponsoredAdsSlot"
import type { SponsoredAd } from "@/lib/ads/types"

// ─── Types ─────────────────────────────────────────────────────────────────

interface ServiceDetailsPageClientProps {
    service: any
    staff: Array<{ id: string; name: string; isOwner: boolean }>
    reviews: any[]
    currentUserId?: string | null
    userProfile?: any
    cartCount?: number
    sponsoredAd?: SponsoredAd | null
    partnerPlanSlug?: string
}

type BookingStep = "info" | "schedule" | "confirm"

// ─── Helpers ───────────────────────────────────────────────────────────────

const PLACEHOLDER = "https://img.dudit.com.br/static/Placeholder.png"

const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
    return (
        <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
                <StarIcon key={i} size={size} strokeWidth={0}
                    className={i < Math.round(rating) ? "text-brand-green fill-brand-green" : "text-gray-300 fill-gray-300"} />
            ))}
        </div>
    )
}

function formatDuration(minutes: number) {
    if (minutes < 60) return `${minutes}min`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function generateDateRange(startDate: Date, days: number = 7) {
    const dates = []
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
    for (let i = 0; i < days; i++) {
        const d = new Date(startDate)
        d.setDate(startDate.getDate() + i)
        dates.push({
            date: d,
            dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
            num: d.getDate(),
            day: dayNames[d.getDay()],
            month: d.toLocaleDateString("pt-BR", { month: "short" }),
            isToday: i === 0,
        })
    }
    return dates
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

// ─── Main Component ────────────────────────────────────────────────────────

export function ServiceDetailsPageClient({
    service,
    staff,
    reviews,
    currentUserId: initialUserId,
    userProfile,
    cartCount,
    sponsoredAd = null,
    partnerPlanSlug = "free",
}: ServiceDetailsPageClientProps) {
    const router = useRouter()
    const { user, supabase } = useSupabase()
    const { success: notifySuccess, error: notifyError } = useNotification()

    const [userId, setUserId] = useState<string | null | undefined>(initialUserId || user?.id)
    const [step, setStep] = useState<BookingStep>("info")
    const [selectedStaffId, setSelectedStaffId] = useState<string>(staff[0]?.id || "")
    const [weekOffset, setWeekOffset] = useState(0)
    const [selectedDate, setSelectedDate] = useState<string>("")
    const [selectedTime, setSelectedTime] = useState<string>("")
    const [availableSlots, setAvailableSlots] = useState<string[]>([])
    const [isLoadingSlots, setIsLoadingSlots] = useState(false)
    const [isBooking, setIsBooking] = useState(false)
    const [showShareModal, setShowShareModal] = useState(false)
    const [showCollectionModal, setShowCollectionModal] = useState(false)
    const [showRequestQuoteModal, setShowRequestQuoteModal] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
    const [activeImgIndex, setActiveImgIndex] = useState(0)
    const [slideDirection, setSlideDirection] = useState<1 | -1>(1)
    const [isLightboxOpen, setIsLightboxOpen] = useState(false)
    const [lightboxActiveImg, setLightboxActiveImg] = useState(0)
    const lightboxJustOpened = useRef(false)
    const touchStartX = useRef(0)
    const galleryContainerRef = useRef<HTMLDivElement>(null)
    const zoomOriginX = useMotionValue(50)
    const zoomOriginY = useMotionValue(50)
    const zoomScale = useMotionValue(1)
    const smoothScale = useSpring(zoomScale, { stiffness: 180, damping: 22 })
    const transformOrigin = useTransform([zoomOriginX, zoomOriginY], ([x, y]) => `${x}% ${y}%`)

    useEffect(() => {
        if (!service?.id) return
        const timer = setTimeout(() => {
            fetch("/api/marketplace/view", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entityType: "servico", entityId: service.id }),
            }).catch(() => { })
        }, 500)
        return () => clearTimeout(timer)
    }, [service?.id])

    // Redesign states
    const [cep, setCep] = useState("")
    const [shippingState, setShippingState] = useState<"initial" | "calculated">("initial")
    const [showPaymentMethodsModal, setShowPaymentMethodsModal] = useState(false)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [showResponsibilityModal, setShowResponsibilityModal] = useState(false)
    const [showPoliciesModal, setShowPoliciesModal] = useState(false)
    const [showReportModal, setShowReportModal] = useState(false)
    const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
    const [deliveryError, setDeliveryError] = useState<string | null>(null)
    const [deliveryLoading, setDeliveryLoading] = useState(false)
    const [calculatedAddress, setCalculatedAddress] = useState<string | null>(null)
    const [expandedAccordion, setExpandedAccordion] = useState<string | null>(null)
    const [deliveryConfig, setDeliveryConfig] = useState<any>(null)
    const { isFavorited: isFav, toggleFavorite: toggleFav } = useFavorites()

    // Address flow states (checkout-like)
    const [userAddresses, setUserAddresses] = useState<any[]>([])
    const [selectedAddressId, setSelectedAddressId] = useState<string>("")
    const selectedAddress = userAddresses.find(a => a.id === selectedAddressId)
    const [showAddressForm, setShowAddressForm] = useState(false)
    const [showAddressModal, setShowAddressModal] = useState(false)
    const [loadingAddresses, setLoadingAddresses] = useState(false)
    const [loadingCep, setLoadingCep] = useState(false)
    const [newAddressData, setNewAddressData] = useState({
        zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false,
        latitude: null as number | null, longitude: null as number | null
    })

    const showPrice = service.show_price_in_store !== false

    const partner = useMemo(() => {
        const p = Array.isArray(service.partners) ? service.partners[0] : service.partners
        const store = service?.stores || p?.stores || p?.store
        const address = store?.addresses?.[0] || p?.addresses?.[0] || {}
        const storeId = store?.id || p?.store_id || service.store_id || null
        const partnerId = p?.id || service.partner_id
        const storeName = store?.name || p?.name || p?.store_name || "Profissional"

        return {
            id: storeId || partnerId,
            short_id: store?.short_id || p?.short_id || service.store_short_id || p?.store?.short_id,
            slug: store?.slug || p?.slug,
            partner_id: partnerId,
            store_id: storeId,
            name: storeName,
            user_id: p?.user_id,
            phone: store?.phone || store?.whatsapp_phone || p?.phone,
            store_name: storeName,
            city: address?.city || store?.city || p?.city || "Brasil",
            state: address?.state || store?.state || p?.state || "BR",
            store_avatar: store?.logo_url || p?.store_image_url || PLACEHOLDER,
            profile_image_url: store?.logo_url || p?.store_image_url || null,
            banner_url: store?.banner_url || p?.banner_url || null,
            opening_hours: store?.opening_hours || p?.opening_hours || null,
            rating: store?.rating ?? p?.rating ?? 0,
            paymentMethods: store?.payment_methods || p?.payment_methods || [],
            payment_methods: store?.payment_methods || p?.payment_methods || [],
            addresses: store?.addresses || p?.addresses || [],
            mp_user_id: p?.mp_user_id,
            mp_public_key: p?.mp_public_key,
            vendas_totais: store?.vendas_totais || p?.vendas_totais || 0,
            created_at: store?.created_at || p?.created_at,
        }
    }, [service])

    const [activePromotions, setActivePromotions] = useState<any[]>([])

    useEffect(() => {
        if (!partner?.id) return
        const timer = setTimeout(() => {
            listActivePromotionsForMarketplaceAction(partner.id)
                .then((res) => {
                    if (Array.isArray(res)) setActivePromotions(res)
                })
                .catch((e) => console.error("Error loading promotions:", e))
        }, 800)
        return () => clearTimeout(timer)
    }, [partner?.id])

    const activePromo = useMemo(() => {
        return activePromotions.find((promo) => {
            if (promo.applyScope === "entire_cart") return true
            if (promo.applyScope === "specific_services" && promo.applicableServiceIds?.includes(service.id)) return true
            if (promo.applyScope === "category" && service.category_id && promo.applicableCategoryIds?.includes(service.category_id)) return true
            return false
        })
    }, [activePromotions, service.id, service.category_id])

    const activeGiftPromo = useMemo(() => {
        return activePromotions.find((promo) => {
            if (promo.promotionType !== "gift") return false
            if (promo.applyScope === "entire_cart") return true
            if (promo.applyScope === "specific_services" && promo.applicableServiceIds?.includes(service.id)) return true
            if (promo.applyScope === "category" && service.category_id && promo.applicableCategoryIds?.includes(service.category_id)) return true
            return false
        })
    }, [activePromotions, service.id, service.category_id])

    const [giftDetails, setGiftDetails] = useState<{ name: string; image_url: string | null; isProduct: boolean } | null>(null)

    useEffect(() => {
        if (!activeGiftPromo) {
            setGiftDetails(null)
            return
        }

        const fetchGift = async () => {
            try {
                if (activeGiftPromo.giftProductId) {
                    const result = await getGiftItemDetailsAction({
                        itemId: activeGiftPromo.giftProductId,
                        itemType: "product",
                    })
                    if (result) setGiftDetails(result)
                } else if (activeGiftPromo.giftServiceId) {
                    const result = await getGiftItemDetailsAction({
                        itemId: activeGiftPromo.giftServiceId,
                        itemType: "service",
                    })
                    if (result) setGiftDetails(result)
                }
            } catch (e) {
                console.error("Error loading gift details:", e)
            }
        }

        fetchGift()
    }, [activeGiftPromo, supabase])

    const handleCepChange = useCallback((e: any) => {
        const raw = e.target.value.replace(/\D/g, "").slice(0, 8)
        setCep(raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw)
    }, [])

    const [canBuyState, setCanBuyState] = useState<{ canBuy: boolean; isOwner: boolean; isTeamMember: boolean; reason?: string }>(() => {
        const isOwner = !!(userId && partner?.user_id && userId === partner.user_id)
        return {
            canBuy: !isOwner,
            isOwner,
            isTeamMember: false,
            reason: isOwner ? "Você não pode agendar ou comprar seus próprios serviços." : undefined,
        }
    })

    useEffect(() => {
        if (!partner?.partner_id && !partner?.id && !service?.partner_id) return
        const targetPartnerId = service?.partner_id || partner.partner_id || partner.id
        const targetStoreId = service?.store_id || partner.store_id || partner.id
        checkCanUserBuyFromStoreAction(targetPartnerId, targetStoreId).then(res => {
            setCanBuyState(res)
        })
    }, [userId, partner?.partner_id, partner?.id, partner?.store_id, service?.partner_id, service?.store_id])

    const isProductOwner = !canBuyState.canBuy
    const isTeamMember = canBuyState.isTeamMember

    // Load partner delivery configuration
    useEffect(() => {
        if (!partner.id || isProductOwner) return
        const timer = setTimeout(() => {
            getPartnerDeliveryConfigAction(partner.id).then((res: any) => {
                if (res.success) setDeliveryConfig(res)
            })
        }, 500)
        return () => clearTimeout(timer)
    }, [partner.id, isProductOwner])

    // Load user addresses if logged in
    useEffect(() => {
        if (userId && !isProductOwner) {
            const timer = setTimeout(() => loadUserAddresses(), 1000)
            return () => clearTimeout(timer)
        } else {
            setUserAddresses([])
            setSelectedAddressId("")
        }
    }, [userId, isProductOwner])

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

    const buildAddressString = (a: any) =>
        `${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ""} - ${a.neighborhood}, ${a.city} - ${a.state}, ${a.zip_code}`

    const handleAddressSelect = (addressId: string) => {
        setSelectedAddressId(addressId)
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
        setDeliveryLoading(true)
        const csrfToken = await fetchCSRFTokenSingleton() || ""
        const result = await createAddressAction({
            entityId: userId, entityType: "user",
            street, number: finalNumber, complement: newAddressData.complement,
            neighborhood, city, state, zipCode,
            isDefault: userAddresses.length === 0,
            latitude: newAddressData.latitude ?? null,
            longitude: newAddressData.longitude ?? null,
            csrf_token: csrfToken,
        })
        if (result.error) {
            setDeliveryError(result.error)
        } else {
            if (result.address) {
                setUserAddresses(prev => [...prev, result.address])
                setSelectedAddressId(result.address.id)
            } else {
                await loadUserAddresses()
            }
            setShowAddressForm(false)
            setNewAddressData({ zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false, latitude: null, longitude: null })
            setDeliveryError(null)
        }
        setDeliveryLoading(false)
    }

    // Automatically calculate delivery when selectedAddress changes (for logged in users)
    useEffect(() => {
        if (!selectedAddress || !partner.id) return
        let active = true

        async function calculateForAddress() {
            setDeliveryLoading(true)
            setDeliveryError(null)
            try {
                const addressStr = buildAddressString(selectedAddress)
                setCalculatedAddress(`${selectedAddress.city} - ${selectedAddress.state}`)
                setShippingState("calculated")
                setCep(selectedAddress.zip_code || "")

                const quote = await quoteDeliveryFeeAction({
                    partnerId: partner.id,
                    storeId: (service as any)?.store_id || (service as any)?.stores?.id || null,
                    destinationAddress: addressStr,
                    orderSubtotal: pricing.total,
                })
                if (!active) return
                if (quote.success) {
                    setDeliveryFee(Number(quote.fee || 0))
                    setDeliveryError(null)
                } else {
                    setDeliveryFee(null)
                    setDeliveryError(quote.error || "Não realizamos entrega para este endereço.")
                }
            } catch (err) {
                if (active) {
                    setDeliveryError("Erro ao calcular a entrega.")
                    setDeliveryFee(null)
                    setCalculatedAddress(null)
                }
            } finally {
                if (active) setDeliveryLoading(false)
            }
        }

        calculateForAddress()
        return () => { active = false }
    }, [selectedAddress, partner.id])

    // Automatically calculate delivery when CEP becomes 8 digits (for logged out users)
    useEffect(() => {
        if (userId) return // If logged in, use selectedAddress useEffect
        const cleanedCep = cep.replace(/\D/g, "")
        if (cleanedCep.length !== 8) {
            if (cleanedCep.length === 0) {
                setDeliveryFee(null)
                setDeliveryError(null)
                setCalculatedAddress(null)
                setShippingState("initial")
            }
            return
        }

        let active = true
        async function calculateForCep() {
            setDeliveryLoading(true)
            setDeliveryError(null)
            try {
                const response = await fetch(`/api/cep?cep=${cleanedCep}`)
                const data = await response.json()
                if (!active) return

                if (data.erro || data.error) {
                    setDeliveryError("CEP não encontrado.")
                    setDeliveryFee(null)
                    setCalculatedAddress(null)
                    return
                }

                const addressStr = `${data.logradouro || "Rua"}, S/N - ${data.bairro || "Bairro"}, ${data.localidade || "Cidade"} - ${data.uf || "UF"}, ${cleanedCep}`
                setCalculatedAddress(`${data.localidade} - ${data.uf}`)
                setShippingState("calculated")

                const quote = await quoteDeliveryFeeAction({
                    partnerId: partner.id,
                    storeId: (service as any)?.store_id || (service as any)?.stores?.id || null,
                    destinationAddress: addressStr,
                    orderSubtotal: pricing.total,
                })
                if (!active) return
                if (quote.success) {
                    setDeliveryFee(Number(quote.fee || 0))
                    setDeliveryError(null)
                } else {
                    setDeliveryFee(null)
                    setDeliveryError(quote.error || "Não realizamos entrega para este CEP.")
                }
            } catch (err) {
                if (active) {
                    setDeliveryError("Erro ao calcular a entrega.")
                    setDeliveryFee(null)
                    setCalculatedAddress(null)
                }
            } finally {
                if (active) setDeliveryLoading(false)
            }
        }

        calculateForCep()
        return () => { active = false }
    }, [cep, partner.id, userId])

    useEffect(() => { setIsMounted(true) }, [])
    useEffect(() => { if (!userId && user?.id) setUserId(user.id) }, [userId, user])

    // ─── Derived ──────────────────────────────────────────────────────────────

    const serviceImages = useMemo(() => {
        const images = (service.images || [])
            .filter((img: string) => typeof img === "string" && img.trim())
            .map((img: string) => getR2ImageUrl(img))
        return images.length > 0 ? images : [PLACEHOLDER]
    }, [service.images])

    const galleryItems = useMemo(() => {
        return serviceImages.map((src: any) => ({ type: "image" as const, src }))
    }, [serviceImages])

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

    const durationMinutes = Number(service.duration_minutes || 60)
    const bufferMinutes = Number(service.buffer_minutes || 0)
    const price = Number(service.price || 0)
    const schedulingEnabled = true
    const categoryName = (service as any).service_categories?.name || "Serviço"
    const isStartingAt = service.price_type === "starting_at"
    const isFree = service.price_type === "free"
    const pricePrefix = isStartingAt ? "A partir de " : ""
    const billingSuffix = getBillingUnitSuffix(service.billing_unit)

    const pricing = useMemo(() => {
        const base = Number(service.price) || 0
        const promo = Number(service.promotional_price) || 0
        const hasPromo = promo > 0 && promo < base
        const effective = hasPromo ? promo : base

        // Compute best price: compares manual promo vs campaign discount
        const campaignPricingResult = computeItemDisplayPrice(
            base, hasPromo ? promo : null,
            activePromotions,
            { productId: service.id, serviceId: service.id, categoryId: service.category_id || undefined },
        )

        const bestPrice = campaignPricingResult.bestPrice
        const discountSource = campaignPricingResult.discountSource
        const hasCampaignDiscount = discountSource === "campaign"
        const hasManualPromo = discountSource === "manual"
        const total = bestPrice

        // Real Pix Discount from Partner's payment methods
        const pixMethod = partner.paymentMethods?.find((m: any) => m.payment_type === "pix" && m.is_active)
        const pixDiscountPercent = pixMethod?.discount_percent || 0
        const pixTotal = bestPrice * (1 - (pixDiscountPercent / 100))

        // Real Installments from Partner's credit card method
        const ccMethod = partner.paymentMethods?.find((m: any) => m.payment_type === "credito" && m.is_active)
        const hasCC = !!ccMethod
        const maxInstallments = ccMethod?.max_installments || 1
        const installmentPrice = bestPrice / maxInstallments

        const campaignDiscountLabel = hasCampaignDiscount && activePromo
            ? activePromo.discountType === "percentage"
                ? `${activePromo.discountValue}%`
                : `${formatCurrency(campaignPricingResult.campaignDiscount)}`
            : ""

        return {
            current: effective, bestPrice, original: base,
            hasCampaignDiscount, hasManualPromo, total,
            pix: pixTotal,
            pixDiscountPercent,
            hasCC, maxInstallments, installment: installmentPrice,
            discountPercent: Math.round(((base - promo) / base) * 100),
            campaignDiscountLabel,
        }
    }, [service, partner, activePromo, activePromotions])

    const preparationEstimate = useMemo(() => computeOrderPreparationEstimate({
        products: [{
            availability_value: Number(service.availability_value || 0),
            availability_unit: service.availability_unit || "Minutos",
        }],
        openingHours: partner.opening_hours || null,
        pickupWindowMinutes: 30,
        deliveryTimeEstimateMinutes: 0,
    }), [service, partner.opening_hours])

    const avgRating = useMemo(() =>
        reviews.length > 0 ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : 0,
        [reviews]
    )

    const displayRating = useMemo(() => {
        return reviews.length >= 3 ? avgRating.toFixed(1) : "-";
    }, [reviews, avgRating])

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
            return { name: "Diamante", badge: "💎", color: "text-brand-green bg-green-50/50 border-green-200", description: "Profissional Diamante com excelente histórico de atendimento.", level: 5 }
        }
        if (sales >= 500 && rating >= 4.5) {
            return { name: "Platina", badge: "💎", color: "text-brand-green bg-green-50/50 border-green-200", description: "Profissional Destaque Platina na Dudit.", level: 4 }
        }
        if (sales >= 100 && rating >= 4.3) {
            return { name: "Ouro", badge: "🥇", color: "text-brand-green bg-green-50/50 border-green-200", description: "Profissional com reputação Ouro e ótimo serviço.", level: 3 }
        }
        if (sales >= 20 && rating >= 4.0) {
            return { name: "Prata", badge: "🥈", color: "text-brand-green bg-green-50/50 border-green-200", description: "Profissional Prata consistente na plataforma.", level: 2 }
        }
        return { name: "Bronze", badge: "🥉", color: "text-brand-green bg-green-50/50 border-green-200", description: "Profissional Bronze iniciando seus serviços na Dudit.", level: 1 }
    }, [partner])

    const partnerProfileImageUrl = useMemo(() => {
        return getR2ImageUrl(partner.store_avatar)
    }, [partner.store_avatar])

    const selectedStaff = useMemo(() => staff.find((s) => s.id === selectedStaffId), [staff, selectedStaffId])

    // ─── Date navigation ──────────────────────────────────────────────────────

    const today = useMemo(() => {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        return d
    }, [])

    const dates = useMemo(() => {
        const start = new Date(today)
        start.setDate(today.getDate() + weekOffset * 7)
        return generateDateRange(start, 7)
    }, [today, weekOffset])

    const currentMonth = useMemo(() => {
        if (dates.length === 0) return ""
        return dates[0].date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    }, [dates])

    const isClosedOnSelectedDate = useMemo(() => {
        if (!selectedDate) return false
        if (!partner.opening_hours) return false

        const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
        const [year, month, day] = selectedDate.split("-").map(Number)
        const dateObj = new Date(year, month - 1, day)
        const dayOfWeek = DAYS_OF_WEEK[dateObj.getDay()]

        const normalized = normalizeOpeningHours(partner.opening_hours)
        const daySchedule = normalized[dayOfWeek]
        return daySchedule ? !daySchedule.enabled : false
    }, [selectedDate, partner.opening_hours])

    // ─── Fetch slots on date/staff change ─────────────────────────────────────

    useEffect(() => {
        if (!selectedDate || !selectedStaffId || !partner.id) return

        setIsLoadingSlots(true)
        setSelectedTime("")
        getPublicAvailableTimeSlots(
            partner.id,
            selectedStaffId,
            selectedDate,
            durationMinutes,
            bufferMinutes,
            partner.store_id
        ).then((result) => {
            if (result.success) {
                setAvailableSlots(result.slots)
            } else {
                setAvailableSlots([])
            }
            setIsLoadingSlots(false)
        })
    }, [selectedDate, selectedStaffId, partner.id, partner.store_id, durationMinutes, bufferMinutes])

    // Auto-select first date
    useEffect(() => {
        if (dates.length > 0 && !selectedDate) {
            setSelectedDate(dates[0].dateStr)
        }
    }, [dates, selectedDate])

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const buildBookingPayload = useCallback(() => {
        const resolvedPartnerId = service.partner_id || partner?.partner_id || partner?.id
        const resolvedStoreId = service.store_id || partner?.store_id || undefined

        return {
            serviceId: service.id,
            partnerId: resolvedPartnerId,
            storeId: resolvedStoreId,
            booking: {
                staffId: selectedStaffId,
                staffName: selectedStaff?.name || "Profissional",
                date: selectedDate,
                time: selectedTime,
                serviceName: service.name,
                price: pricing.bestPrice,
                durationMinutes,
                storeId: resolvedStoreId,
            },
        }
    }, [selectedStaffId, selectedStaff, selectedDate, selectedTime, service, partner, pricing.bestPrice, durationMinutes])

    const handleBookNowCheckout = useCallback(async () => {
        if (!userId) {
            router.push("/auth/login?next=" + encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : ""))
            return
        }
        if (!selectedDate || !selectedTime || !selectedStaffId) {
            notifyError("Erro", "Selecione data, horário e profissional.")
            return
        }

        setIsBooking(true)
        try {
            const token = await fetchCSRFTokenSingleton() || ""

            let cartItemId: string | undefined
            const payload = buildBookingPayload()
            const result = await prepareServiceBookingCheckoutAction({
                ...payload,
                csrf_token: token,
            })
            if ("error" in result && result.error) {
                console.warn("[handleBookNowCheckout] Checkout error:", result.error)
                notifyError("Erro", result.error || "Não foi possível iniciar o checkout.")
                return
            }
            cartItemId = result.cartItemId
            invalidateCartCache()

            const lineLabel = selectedDate && selectedTime
                ? `${service.name} - ${selectedDate} ${selectedTime}`
                : service.name

            const cartLine = cartItemId
                ? [{
                    cartItemId,
                    itemType: "service_booking" as const,
                    serviceId: service.id,
                    productId: service.id,
                    quantity: 1,
                }]
                : []

            const checkoutData = {
                source: "cart" as const,
                partnerId: payload.partnerId,
                storeId: payload.storeId || undefined,
                products: [{
                    id: service.id,
                    name: lineLabel,
                    price: pricing.bestPrice,
                    quantity: 1,
                }],
                partnerInfo: {
                    address: partner?.addresses?.[0] || {},
                    paymentMethods: (partner?.payment_methods || []).map((m: any) => m.payment_type || m.type).filter(Boolean),
                    mpConnected: !!partner?.mp_user_id,
                    mpPublicKey: partner?.mp_public_key,
                    store_name: partner?.store_name,
                    openingHours: partner?.opening_hours || null,
                },
                cartItems: cartLine,
                deliverySettings: null,
            }

            sessionStorage.setItem("checkout_session", JSON.stringify(checkoutData))
            router.push("/checkout")
        } catch (err: any) {
            console.error("[handleBookNowCheckout] Unexpected error:", err)
            notifyError("Erro", err?.message || "Erro inesperado ao iniciar checkout.")
        } finally {
            setIsBooking(false)
        }
    }, [userId, router, selectedDate, selectedTime, selectedStaffId, buildBookingPayload, service, partner, pricing.bestPrice, notifyError])

    const handleAddBookingToCart = useCallback(async () => {
        if (!userId) {
            router.push("/auth/login?next=" + encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : ""))
            return
        }
        if (!selectedDate || !selectedTime || !selectedStaffId) {
            notifyError("Erro", "Selecione data, horário e profissional.")
            return
        }

        setIsBooking(true)
        try {
            const token = await fetchCSRFTokenSingleton() || ""
            const payload = buildBookingPayload()
            const result = await addServiceBookingToCartAction({
                ...payload,
                csrf_token: token,
            })
            if (result.success) {
                invalidateCartCache()
                notifySuccess("Adicionado à sacola", "O serviço foi adicionado à sacola.")
            } else {
                console.warn("[handleAddBookingToCart] Add to cart error:", result.error)
                notifyError("Erro", result.error || "Não foi possível adicionar à sacola.")
            }
        } catch (err: any) {
            console.error("[handleAddBookingToCart] Unexpected error:", err)
            notifyError("Erro", err?.message || "Erro inesperado ao adicionar à sacola.")
        } finally {
            setIsBooking(false)
        }
    }, [userId, router, selectedDate, selectedTime, selectedStaffId, buildBookingPayload, notifySuccess, notifyError])

    const handleRequestQuoteClick = useCallback(() => {
        if (isProductOwner) return
        const canUseSystemQuote = hasMinimumPlan(partnerPlanSlug || "free", "crescer")
        if (!canUseSystemQuote) {
            const cleanPhone = partner.phone ? partner.phone.replace(/\D/g, "") : ""
            const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : cleanPhone.length >= 10 ? `55${cleanPhone}` : cleanPhone
            const startingPriceFormatted = formatCurrency(Number(service.price || 0))
            const whatsappMsg = encodeURIComponent(`Olá! Vi o serviço "${service.name}" na Dudit (a partir de ${startingPriceFormatted}) e gostaria de solicitar um orçamento para o meu caso.`)
            const whatsappUrl = `https://wa.me/${formattedPhone}?text=${whatsappMsg}`
            window.open(whatsappUrl, "_blank")
            return
        }
        if (!userId) {
            router.push("/auth/login?next=" + encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : ""))
            return
        }
        setShowRequestQuoteModal(true)
    }, [isProductOwner, partnerPlanSlug, partner.phone, service.name, service.price, userId, router])

    const handleLearnMoreClick = useCallback(() => {
        const descEl = document.getElementById("service-description")
        if (descEl) {
            descEl.scrollIntoView({ behavior: "smooth", block: "start" })
            setIsDescriptionExpanded(true)
        }
    }, [])

    // ─── Booking Panel ────────────────────────────────────────────────────────

    const BookingPanel = (
        <div className="bg-white dark:bg-dark-surface relative">
            {/* Service Info Header */}
            <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-brand-dark dark:text-dark-heading bg-gray-100 dark:bg-dark-border/50 px-2 py-0.5 rounded uppercase tracking-wider">
                    {service.service_type === "online" ? "Remoto" : service.service_type === "hybrid" ? "Híbrido" : "Presencial"}
                </span>
                <span className="text-brand-inactive-text dark:text-dark-body text-xs">|</span>
                {showPrice && (!service.billing_unit || service.billing_unit === 'per_service') && (
                    <div className="flex items-center text-sm text-brand-inactive-text dark:text-dark-body text-[13px] font-semibold">
                        <span>Duração: {formatDuration(durationMinutes)}</span>
                        {bufferMinutes > 0 && (
                            <span>+ {bufferMinutes}min intervalo</span>
                        )}
                    </div>
                )}
            </div>

            {/* Rating */}
            {reviews.length > 0 && (
                <div className="flex items-center gap-1.5 mb-3">
                    <StarIcon size={16} className="text-brand-green fill-brand-green" strokeWidth={0} />
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                        {avgRating.toFixed(1)} ({reviews.length} {reviews.length === 1 ? "avaliação" : "avaliações"})
                    </span>
                </div>
            )}

            <h1 className="text-xl md:text-3xl leading-[1.1] font-medium text-brand-dark dark:text-dark-heading mb-6 tracking-tight">
                {service.name}
            </h1>

            {showPrice && activePromo && !pricing.hasCampaignDiscount && !pricing.hasManualPromo && (
                <div className="mb-6 flex">
                    <Badge variant="blue" icon={<TagIcon size={12} />} className="text-xs">
                        {activePromo.name}
                    </Badge>
                </div>
            )}

            {/* Price */}
            <div className="mb-6">
                {!showPrice ? (
                    <div className="space-y-1">
                        <p className="text-3xl leading-none font-bold text-brand-dark dark:text-dark-heading">
                            Preço sob consulta
                        </p>
                    </div>
                ) : (() => {
                    if (isFree) {
                        return (
                            <div className="space-y-1">
                                <p className="text-3xl leading-none font-bold text-brand-green">
                                    Gratuito
                                </p>
                            </div>
                        )
                    }

                    const hasCampaign = pricing.hasCampaignDiscount;
                    const hasProductPromo = pricing.hasManualPromo;
                    const hasPix = pricing.pixDiscountPercent > 0;
                    const displayPrice = pricing.bestPrice;
                    const pixUnitPrice = displayPrice * (1 - pricing.pixDiscountPercent / 100);

                    // Caso: Campanha (com ou sem Pix) usando o novo design de banner
                    if (hasCampaign) {
                        return (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body line-through font-normal">
                                        {pricePrefix}{formatCurrency(pricing.original)}{billingSuffix}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[10px] md:text-[11px] font-semibold uppercase text-white shadow-sm tracking-wider whitespace-nowrap bg-[#2968c8]">
                                        <TagIcon className="w-3 h-3 fill-current shrink-0" />
                                        <span>Oferta Especial</span>
                                    </span>
                                </div>
                                {hasPix ? (
                                    <>
                                        <div className="flex items-baseline gap-2 flex-wrap">
                                            <p className="sm:text-lg md:text-4xl leading-none font-semibold text-brand-dark dark:text-dark-heading">
                                                {pricePrefix}{formatCurrency(pixUnitPrice)}{billingSuffix}
                                            </p>
                                            <span className="text-xs md:text-sm font-semibold text-brand-green">no Pix</span>
                                        </div>
                                        <p className="text-xs md:text-[0.875rem] text-brand-inactive-text dark:text-dark-body mt-1">
                                            ou {pricePrefix}{formatCurrency(displayPrice)}{billingSuffix} em outros meios
                                        </p>
                                    </>
                                ) : (
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                        <p className="sm:text-lg md:text-4xl leading-none font-semibold text-brand-dark dark:text-dark-heading">
                                            {pricePrefix}{formatCurrency(displayPrice)}{billingSuffix}
                                        </p>
                                    </div>
                                )}
                                <Button
                                    variant="link"
                                    onClick={() => setShowPaymentMethodsModal(true)}
                                    className="text-xs font-medium text-brand-green mt-3 px-0 py-0 block text-left hover:underline"
                                >
                                    Ver opções de pagamento
                                </Button>
                            </div>
                        );
                    }

                    // Caso: Produto Promo + Pix
                    if (hasProductPromo && hasPix) {
                        return (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body line-through font-normal">{formatCurrency(pricing.original)}</span>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[10px] md:text-[11px] font-extrabold uppercase text-white shadow-sm tracking-wider whitespace-nowrap bg-[#ff7a00]">
                                        {pricing.discountPercent}% OFF
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-3xl leading-none font-bold text-brand-dark dark:text-dark-heading">
                                        {pricePrefix}{formatCurrency(pixUnitPrice)}{billingSuffix}
                                    </p>
                                    <span className="text-sm font-semibold text-brand-green">no Pix</span>
                                </div>
                                <p className="text-xs md:text-[0.875rem] text-brand-inactive-text dark:text-dark-body mt-1">
                                    ou {pricePrefix}{formatCurrency(displayPrice)}{billingSuffix} em outros meios
                                </p>
                                <Button variant="link" onClick={() => setShowPaymentMethodsModal(true)} className="text-xs font-medium text-brand-green mt-3 px-0 py-0 block text-left">
                                    Ver opções de pagamento
                                </Button>
                            </div>
                        );
                    }

                    // Caso: Só produto promo
                    if (hasProductPromo && !hasPix) {
                        return (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body line-through font-normal">{formatCurrency(pricing.original)}</span>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[10px] md:text-[11px] font-extrabold uppercase text-white shadow-sm tracking-wider whitespace-nowrap bg-[#ff7a00]">
                                        {pricing.discountPercent}% OFF
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className="text-3xl leading-none font-bold text-brand-dark dark:text-dark-heading">
                                        {pricePrefix}{formatCurrency(displayPrice)}{billingSuffix}
                                    </p>
                                </div>
                                <Button variant="link" onClick={() => setShowPaymentMethodsModal(true)} className="text-xs font-medium text-brand-green mt-3 px-0 py-0 block text-left">
                                    Ver opções de pagamento
                                </Button>
                            </div>
                        );
                    }

                    // Caso: Só Pix
                    if (!hasCampaign && !hasProductPromo && hasPix) {
                        return (
                            <div className="space-y-1">
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body line-through font-normal">{formatCurrency(pricing.original)}</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-3xl leading-none font-bold text-brand-dark dark:text-dark-heading">
                                        {pricePrefix}{formatCurrency(pixUnitPrice)}{billingSuffix}
                                    </p>
                                    <span className="text-sm text-brand-green font-medium mt-auto">{pricing.pixDiscountPercent}% no Pix</span>
                                </div>
                                <p className="text-xs md:text-[0.875rem] text-brand-inactive-text dark:text-dark-body mt-1">
                                    ou {pricePrefix}{formatCurrency(displayPrice)}{billingSuffix} em outros meios
                                </p>
                                <Button variant="link" onClick={() => setShowPaymentMethodsModal(true)} className="text-xs font-medium text-brand-green mt-3 px-0 py-0 block text-left">
                                    Ver opções de pagamento
                                </Button>
                            </div>
                        );
                    }

                    // Caso: Sem desconto algum
                    return (
                        <div className="space-y-1">
                            <p className="text-3xl leading-none font-bold text-brand-dark dark:text-dark-heading">
                                {pricePrefix}{formatCurrency(displayPrice)}{billingSuffix}
                            </p>
                            <Button variant="link" onClick={() => setShowPaymentMethodsModal(true)} className="text-xs font-medium text-brand-green mt-3 px-0 py-0 block text-left">
                                Ver opções de pagamento
                            </Button>
                        </div>
                    );
                })()}
            </div>

            {/* Brinde de Campanha discreto */}
            {giftDetails && (
                <div className="mb-6 p-3 bg-brand-green/5 dark:bg-brand-green/10 border border-brand-green/15 rounded-xl flex items-center justify-between gap-3 animate-fade-in select-none">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 relative rounded-lg overflow-hidden border border-brand-green/20 shrink-0 bg-white flex items-center justify-center">
                            {giftDetails.image_url ? (
                                <img
                                    src={getR2ImageUrl(giftDetails.image_url)}
                                    alt={giftDetails.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-green animate-pulse">
                                    <polyline points="20 12 20 22 4 22 4 12" />
                                    <rect x="2" y="7" width="20" height="5" />
                                    <line x1="12" y1="22" x2="12" y2="7" />
                                    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                                    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                                </svg>
                            )}
                        </div>
                        <div className="flex flex-col text-left">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-extrabold tracking-wider px-1.5 py-0.5 rounded bg-brand-green/10 text-brand-green border border-brand-green/20 uppercase">
                                    Brinde Incluso
                                </span>
                            </div>
                            <span className="text-xs md:text-sm font-bold text-brand-dark dark:text-dark-heading mt-0.5">
                                {giftDetails.name}
                            </span>
                            {activeGiftPromo?.minSpendAmount ? (
                                <span className="text-[10px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                                    Em compras deste item acima de {formatCurrency(activeGiftPromo.minSpendAmount)}
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <div className="shrink-0 text-brand-green text-[10px] md:text-xs font-bold bg-brand-green/10 border border-brand-green/20 rounded-full px-2 py-1 select-none">
                        GRÁTIS
                    </div>
                </div>
            )}

            {/* ── Staff Selection (Fixed price only) ── */}
            {showPrice && !isStartingAt && staff.length > 0 && (
                <div className="mb-6">
                    <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Profissional</label>
                    <div className="flex flex-wrap gap-2">
                        {staff.map((member) => (
                            <button
                                key={member.id}
                                onClick={() => setSelectedStaffId(member.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${selectedStaffId === member.id
                                    ? "border-brand-green bg-green-50 text-brand-green"
                                    : "border-brand-border text-brand-dark dark:text-dark-heading hover:border-gray-300 dark:hover:border-dark-border bg-white dark:bg-dark-surface"
                                    }`}
                            >
                                <UserProfileImage fullName={member.name} className="w-6 h-6" />
                                {member.name}
                                {selectedStaffId === member.id && <CheckIcon size={14} />}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Date Selection (Fixed price only) ── */}
            {showPrice && !isStartingAt && (
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                        <label className="text-sm font-bold text-brand-dark dark:text-dark-heading capitalize">{currentMonth}</label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
                                disabled={weekOffset === 0}
                                className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:text-dark-heading disabled:opacity-30 transition-colors"
                            >
                                <ChevronLeftIcon size={16} />
                            </button>
                            <button
                                onClick={() => setWeekOffset(weekOffset + 1)}
                                className="text-brand-dark dark:text-dark-heading transition-colors"
                            >
                                <ChevronRightIcon size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        {dates.map((d) => {
                            const isSelected = selectedDate === d.dateStr
                            return (
                                <div
                                    key={d.dateStr}
                                    className="flex flex-col gap-2 cursor-pointer group items-center"
                                    onClick={() => { setSelectedDate(d.dateStr); setSelectedTime("") }}
                                >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${isSelected
                                        ? "bg-brand-dark text-white"
                                        : "text-brand-dark dark:text-dark-heading border border-gray-200 dark:border-dark-border hover:border-brand-dark"
                                        }`}>
                                        {d.num}
                                    </div>
                                    <span className={`text-xs font-medium ${isSelected ? "text-brand-dark dark:text-dark-heading" : "text-brand-inactive-text dark:text-dark-body"
                                        }`}>
                                        {d.day}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ── Time Slots (Fixed price only) ── */}
            {showPrice && !isStartingAt && (
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                        <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Horários disponíveis</label>
                    </div>

                    {!selectedDate ? (
                        <div className="text-center py-8">
                            <IconPlaceholder
                                icon={CalendarIcon}
                                title="Selecione uma data"
                                subtitle="Escolha uma data acima para ver os horários."
                            />
                        </div>
                    ) : isLoadingSlots ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-3">
                            <Spinner />
                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Verificando disponibilidade...</span>
                        </div>
                    ) : isClosedOnSelectedDate ? (
                        <div className="text-center py-8">
                            <IconPlaceholder
                                icon={CalendarIcon}
                                title="Não é possível agendar neste dia"
                                subtitle="Este estabelecimento não abre neste dia."
                            />
                        </div>
                    ) : availableSlots.length === 0 ? (
                        <div className="text-center py-8">
                            <IconPlaceholder
                                icon={CalendarIcon}
                                title="Nenhum horário disponível"
                                subtitle="Tente outra data ou outro profissional."
                            />
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {availableSlots.map((slot) => (
                                <button
                                    key={slot}
                                    onClick={() => setSelectedTime(slot)}
                                    className={`p-2.5 rounded-xl border text-sm font-bold transition-all text-center ${selectedTime === slot
                                        ? "border-brand-dark bg-brand-dark text-white"
                                        : "border-brand-border hover:border-gray-300 dark:hover:border-dark-border text-brand-dark dark:text-dark-heading"
                                        }`}
                                >
                                    {slot}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Custom Quote Info (Starting at only) ── */}
            {showPrice && isStartingAt && (
                <div className="mb-6">
                    <InfoCard
                        title="Orçamento sob medida"
                        message="Este serviço possui valor inicial flexível. Solicite uma proposta para receber preços personalizados e tirar dúvidas diretamente com o prestador."
                    />
                </div>
            )}

            {/* ── Selected Summary (Fixed price only) ── */}
            {showPrice && !isStartingAt && (
                <AnimatePresence>
                    {selectedTime && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 mb-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <CheckCircleIcon size={16} className="text-brand-green" />
                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Resumo do agendamento</span>
                                </div>
                                <div className="space-y-1.5 text-sm text-brand-inactive-text dark:text-dark-body">
                                    <div className="flex justify-between">
                                        <span>Profissional</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{selectedStaff?.name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Data</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                            {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Horário</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{selectedTime}</span>
                                    </div>
                                    {(!service.billing_unit || service.billing_unit === 'per_service') && (
                                        <div className="flex justify-between">
                                            <span>Duração</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDuration(durationMinutes)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between pt-2 border-t border-emerald-200 mt-2">
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">Valor</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading text-base">{pricePrefix}{formatCurrency(price)}{billingSuffix}</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            )}

            {/* ── CTA Buttons ── */}
            {isProductOwner ? (
                <InfoCard
                    message={canBuyState.reason || (canBuyState.isOwner
                        ? "Você não pode agendar ou comprar seus próprios serviços."
                        : "Você não pode agendar serviços de um negócio do qual faz parte da equipe.")}
                    color="orange"
                    className="mb-8"
                />
            ) : !showPrice ? (
                <div className="hidden lg:block mb-4">
                    {(() => {
                        const cleanPhone = partner.phone ? partner.phone.replace(/\D/g, "") : ""
                        const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : cleanPhone.length >= 10 ? `55${cleanPhone}` : cleanPhone
                        const whatsappMsg = encodeURIComponent(`Olá! Vi o serviço "${service.name}" na Dudit e gostaria de saber o preço.`)
                        const whatsappUrl = `https://wa.me/${formattedPhone}?text=${whatsappMsg}`
                        return (
                            <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full h-[46px] flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold rounded-lg transition-colors text-sm"
                            >
                                <WhatsappIcon size={20} className="fill-white" />
                                Consultar preço
                            </a>
                        )
                    })()}
                </div>
            ) : isStartingAt ? (
                <div className="hidden lg:block space-y-2.5 mb-4">
                    <Button
                        onClick={handleRequestQuoteClick}
                        className="w-full h-[46px]"
                    >
                        <span className="flex items-center gap-2">
                            <FileTextIcon size={18} />
                            Solicitar orçamento
                        </span>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleLearnMoreClick}
                        className="w-full h-[46px]"
                    >
                        Saber mais
                    </Button>
                </div>
            ) : (
                <div className="hidden lg:block space-y-2 mb-4">
                    <Button
                        disabled={!selectedTime || isBooking}
                        onClick={handleBookNowCheckout}
                        className="w-full h-[46px]"
                    >
                        {isBooking ? (
                            <span className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Redirecionando...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <CalendarIcon size={18} />
                                Reservar agora
                            </span>
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        disabled={!selectedTime || isBooking}
                        onClick={handleAddBookingToCart}
                        className="w-full h-[46px]"
                    >
                        Adicionar à sacola
                    </Button>
                </div>
            )}

            {/* Realization Location */}
            {!isProductOwner && (
                <FormSection title="Local de realização do serviço" className="mt-6 mb-6">
                    <div className="flex flex-col">
                        {(!service.fulfillment_modes || service.fulfillment_modes.length === 0) && (
                            <div className="flex items-center gap-2 text-sm text-brand-inactive-text dark:text-dark-body">
                                <span>Não especificado</span>
                            </div>
                        )}
                        {service.fulfillment_modes?.includes("on_site") && (
                            <ListItem
                                icon={StoreIcon}
                                title="No estabelecimento/local do vendedor"
                                className="border-0 px-0 py-0"
                            />
                        )}
                        {service.fulfillment_modes?.includes("customer_location") && (
                            <ListItem
                                icon={MapPinIcon}
                                title="No endereço do cliente"
                            />
                        )}
                    </div>
                </FormSection>
            )}

            {/* Informações importantes Accordion */}
            <div className="border-t border-brand-border pt-4 mb-6">
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
                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Pagamento direto ao profissional</span>
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
                            <Link href={getStoreUrl(partner)} className="block group">
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
                                            <div className="flex items-center gap-1 shrink-0 px-1.5 py-0.5">
                                                <StarIcon size={12} className="text-brand-green fill-brand-green" strokeWidth={0} />
                                                <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">{displayRating}</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 font-medium">
                                            {partner.city} - {partner.state}
                                        </p>
                                    </div>
                                </div>
                            </Link>

                            <div className="px-4 pb-4">
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
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* Sponsored ad below seller card */}
            <SponsoredAdDetailSlot ad={sponsoredAd} />

            {
                !(user?.id && user.id === partner.user_id) && (
                    <button
                        onClick={() => setShowReportModal(true)}
                        className="w-full mt-4 flex items-center justify-center gap-2 py-2 text-xs font-medium text-brand-inactive-text dark:text-dark-body hover:text-[#d32f2f] transition-colors"
                    >
                        <FlagIcon size={14} />
                        Comunicar algo errado
                    </button>
                )
            }
        </div>
    )

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <>
            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                url={isMounted ? `${window.location.origin}${getServiceUrl(service, partner)}` : ""}
                title={service.name}
                shareMessage={`🗓️ Olha esse serviço na Dudit!\n\n*${service.name}*\nConfere aqui os detalhes:`}
                label="Link do serviço"
            />


            <AddToCollectionModal
                isOpen={showCollectionModal}
                onClose={() => setShowCollectionModal(false)}
                itemType="service"
                itemId={service.id}
            />

            <ReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                targetType="service"
                targetId={service.id}
                targetName={service.name}
            />

            <VendorPaymentMethodsModal
                isOpen={showPaymentMethodsModal}
                onClose={() => setShowPaymentMethodsModal(false)}
                storeName={partner.store_name}
                paymentMethods={partner.paymentMethods}
                price={pricing.current}
                mpConnected={!!partner.mp_user_id}
            />

            <StorePoliciesModal
                isOpen={showPoliciesModal}
                onClose={() => setShowPoliciesModal(false)}
                partnerId={partner.id}
                storeName={partner.store_name}
            />

            <DefaultModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                maxWidth="md"
                hideHeader={true}
            >
                <div className="flex flex-col relative">
                    <button
                        onClick={() => setShowPaymentModal(false)}
                        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                        title="Fechar"
                    >
                        <XIcon size={16} />
                    </button>
                    {/* Header with Dual Squares */}
                    <div className="h-[200px] rounded-2xl flex items-end justify-center mb-8 relative overflow-hidden"
                        style={{ background: 'linear-gradient(180deg, #0d5e49 0%, var(--brand-dark) 100%)' }}>
                        <img
                            src="https://img.dudit.com.br/static/icons/Pagamento.png"
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
                            Isso significa que o seu dinheiro vai direto para o profissional, seja através de facilitadores seguros (como o Mercado Pago) ou por meio do acerto que você fizer direto no balcão ou no WhatsApp. É mais lucro para quem vende e mais agilidade para quem compra!
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
                    <Button
                        variant="filled"
                        onClick={() => setShowResponsibilityModal(false)}
                        className="absolute top-3 right-3 z-10 w-10 h-10"
                        title="Fechar"
                    >
                        <XIcon size={18} />
                    </Button>
                    {/* Header with Dual Squares */}
                    <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl p-10 flex items-center justify-center gap-8 mb-8 relative group">
                        <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:-rotate-3 overflow-hidden">
                            <UserProfileImage
                                fullName={partner.store_name}
                                imageUrl={partnerProfileImageUrl.includes("Placeholder.png") ? null : partnerProfileImageUrl}
                                className="w-full h-full rounded-lg"
                            />
                        </div>

                        <div className="flex flex-col items-center gap-1">
                            <div className="w-12 h-6 bg-white dark:bg-dark-surface rounded-full flex items-center justify-center border border-brand-border/50 dark:border-dark-border/50">
                                <ArrowLeftRightIcon size={14} className="text-brand-dark dark:text-dark-heading" />
                            </div>
                        </div>

                        <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:rotate-3">
                            <TruckIcon size={32} className="text-brand-green" />
                        </div>
                    </div>

                    <h4 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-4 text-center">Quem cuida do seu pedido?</h4>
                    <div className="space-y-4 text-brand-inactive-text dark:text-dark-body text-[15px] text-center leading-relaxed">
                        <p>
                            A Dudit é a ponte que conecta você ao profissional. Nós cuidamos da vitrine, da organização e do registro do seu pedido, mas a execução do serviço é por conta do profissional.
                        </p>
                        <p>
                            A responsabilidade por realizar o serviço, oferecer garantia e resolver eventuais problemas é exclusivamente do profissional. Se tiver qualquer dúvida sobre o agendamento, o melhor caminho é chamar o profissional no WhatsApp para alinhar tudo, beleza?
                        </p>
                    </div>
                    <Button onClick={() => setShowResponsibilityModal(false)} className="w-full mt-8 h-12">Entendi</Button>
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
                        disabled={deliveryLoading || loadingCep}
                        className="w-full mb-4"
                    >
                        {deliveryLoading ? <Spinner className="mr-2" size={16} /> : null}
                        Salvar Endereço
                    </Button>
                </div>
            </DefaultModal>

            <MarketplaceHeader
                userProfile={userProfile}
                cartCount={cartCount}
                productName={service.name}
                onShare={() => setShowShareModal(true)}
                favoriteButton={
                    <button onClick={async (e) => { e.stopPropagation(); if (isProductOwner) return; if (!user) return router.push("/auth/login?next=" + encodeURIComponent(window.location.pathname)); await toggleFav(service.id, "servico") }}
                        className="flex items-center justify-center w-8 h-8 transition-all duration-200 cursor-pointer select-none"
                        title={isFav(service.id, "servico") ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
                        <HeartIcon size={20} className={isFav(service.id, "servico") ? "text-brand-green fill-brand-green" : "text-brand-green"} />
                    </button>
                }
            />

            {isMounted && createPortal(
                <AnimatePresence>
                    {isLightboxOpen && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 z-[9999] bg-black/95 flex flex-col"
                        >
                            <div className="flex lg:hidden items-center justify-between px-6 pt-12 pb-4 shrink-0">
                                <button onClick={() => setIsLightboxOpen(false)}
                                    className="w-10 h-10 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                                    <XIcon size={20} />
                                </button>
                                <span className="text-white text-sm font-semibold">
                                    {lightboxActiveImg + 1}/{galleryItems.length}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button onClick={async (e) => { e.stopPropagation(); if (isProductOwner) return; if (!user) return router.push("/auth/login?next=" + encodeURIComponent(window.location.pathname)); await toggleFav(service.id, "servico") }}
                                        className="w-10 h-10 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                                        <HeartIcon size={20} className={isFav(service.id, "servico") ? "fill-white" : ""} />
                                    </button>
                                    <button onClick={() => setShowShareModal(true)} className="w-10 h-10 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                                        <ShareIcon size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="hidden lg:flex flex-1 min-h-0 relative">
                                <button onClick={() => setIsLightboxOpen(false)}
                                    className="absolute top-6 right-6 z-10 w-11 h-11 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                                    <XIcon size={22} />
                                </button>

                                <div className="flex flex-col gap-2 w-[120px] shrink-0 overflow-y-auto px-5 py-6">
                                    {galleryItems.map((item: { src: string | Blob | undefined }, i: number) => (
                                        <div key={i} onClick={() => { lightboxJustOpened.current = false; setSlideDirection(i > lightboxActiveImg ? 1 : -1); setLightboxActiveImg(i) }}
                                            className={`w-full aspect-square rounded-md border-2 cursor-pointer overflow-hidden shrink-0 transition-all
                            ${lightboxActiveImg === i ? "border-white" : "border-white/20 hover:border-white/50"}`}>
                                            <img src={item.src} className="w-full h-full object-cover" alt={`Foto de ${service.name} em ${partner.city} - ${partner.state}`} />
                                        </div>
                                    ))}
                                </div>

                                <div className="relative flex-1 flex items-center justify-center min-w-0 p-8">
                                    <AnimatePresence mode="wait" custom={slideDirection}
                                        onExitComplete={() => { lightboxJustOpened.current = false }}>
                                        <motion.img
                                            key={lightboxActiveImg}
                                            src={galleryItems[lightboxActiveImg]?.src || PLACEHOLDER}
                                            className="max-w-full max-h-full object-contain"
                                            alt={`Foto principal de ${service.name} em ${partner.city} - ${partner.state}`}
                                            custom={slideDirection}
                                            variants={slideVariants}
                                            initial="enter"
                                            animate="center"
                                            exit="exit"
                                            transition={{ duration: 0.2 }}
                                        />
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
                                    <motion.img
                                        key={lightboxActiveImg}
                                        src={galleryItems[lightboxActiveImg]?.src || PLACEHOLDER}
                                        className="max-w-full max-h-full object-contain px-4"
                                        alt={`Foto de ${service.name} em ${partner.city} - ${partner.state}`}
                                        custom={slideDirection}
                                        variants={slideVariants}
                                        initial="enter"
                                        animate="center"
                                        exit="exit"
                                        transition={{ duration: 0.2 }}
                                    />
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="min-h-screen bg-white dark:bg-dark-background lg:pt-[50px] font-sans flex flex-col"
            >
                <div className="container mx-auto px-4 max-w-[1400px] lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12 pt-4 lg:pt-[50px]">
                    {/* Breadcrumb */}
                    <div className="hidden lg:flex items-center gap-2 text-sm text-brand-inactive-text dark:text-dark-body mb-8">
                        {partner.city && partner.state && (
                            <>
                                <Link href={`/explorar/${formatCityStateSlug(partner.city, partner.state)}`} prefetch={false} className="hover:text-brand-dark dark:text-dark-heading transition-colors">
                                    {partner.city} - {partner.state}
                                </Link>
                                <ChevronRightIcon size={10} />
                            </>
                        )}
                        <Link href={`/explorar/${formatCityStateSlug(partner.city, partner.state)}?type=servicos`} prefetch={false} className="hover:text-brand-dark dark:text-dark-heading transition-colors">
                            Serviços
                        </Link>
                        <ChevronRightIcon size={10} />
                        {service.marketplace_category?.parent?.name || service.marketplace_category?.name ? (
                            <>
                                <Link href={`/explorar/${formatCityStateSlug(partner.city, partner.state)}/${createCategorySlug(service.marketplace_category.parent?.name || service.marketplace_category.name)}?type=servicos`} prefetch={false} className="hover:text-brand-dark dark:text-dark-heading transition-colors">
                                    {service.marketplace_category.parent?.name || service.marketplace_category.name}
                                </Link>
                                <ChevronRightIcon size={10} />
                            </>
                        ) : service.service_categories?.name && !service.marketplace_category ? (
                            <>
                                <Link href={`/explorar/${formatCityStateSlug(partner.city, partner.state)}/${createCategorySlug(service.service_categories.name)}?type=servicos`} prefetch={false} className="hover:text-brand-dark dark:text-dark-heading transition-colors">
                                    {service.service_categories.name}
                                </Link>
                                <ChevronRightIcon size={10} />
                            </>
                        ) : null}
                        <span className="text-brand-inactive-text dark:text-dark-body truncate max-w-[300px]">{service.name}</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12">
                        {/* ── Left Column: Gallery + Description ── */}
                        <div className="lg:col-span-8">
                            {/* Gallery */}
                            <div className="flex gap-3 mb-6">
                                <div className="hidden lg:flex flex-col gap-2 w-[70px] shrink-0">
                                    {galleryItems.map((item: { src: string | Blob | undefined }, i: number) => (
                                        <div key={i} onClick={() => goToImage(i)}
                                            className={`w-full aspect-square rounded-md border cursor-pointer overflow-hidden transition-all
                        ${activeImgIndex === i ? "border-brand-green ring-1 ring-brand-green" : "border-brand-border hover:border-brand-border"}`}>
                                            <img src={item.src} className="w-full h-full object-cover" alt={`Foto de ${service.name} em ${partner.city}`} />
                                        </div>
                                    ))}
                                </div>

                                <div className="flex-1 min-w-0 flex items-center gap-2 lg:gap-4">
                                    <div className="hidden lg:flex w-10 shrink-0 items-center justify-center">
                                        {galleryItems.length > 1 && (
                                            <button onClick={goToPrev} className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-brand-border hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors shadow-sm">
                                                <ChevronLeftIcon size={20} className="text-brand-dark" />
                                            </button>
                                        )}
                                    </div>

                                    <div className="relative flex-1 min-w-0">
                                        <div className="hidden lg:block" style={{ paddingBottom: "100%", position: "relative" }}>
                                            <div
                                                ref={galleryContainerRef}
                                                className="absolute inset-0 bg-brand-gray dark:bg-dark-border/30 overflow-hidden rounded-2xl cursor-zoom-in"
                                                onClick={() => openLightbox(activeImgIndex)}
                                                onMouseMove={(e) => {
                                                    const { left, top, width, height } = galleryContainerRef.current!.getBoundingClientRect()
                                                    zoomOriginX.set(((e.clientX - left) / width) * 100)
                                                    zoomOriginY.set(((e.clientY - top) / height) * 100)
                                                    zoomScale.set(2.2)
                                                }}
                                                onMouseLeave={() => zoomScale.set(1)}
                                            >
                                                <AnimatePresence mode="popLayout" custom={slideDirection}>
                                                    <motion.img
                                                        key={activeImgIndex}
                                                        src={galleryItems[activeImgIndex]?.src || PLACEHOLDER}
                                                        className="absolute inset-0 w-full h-full object-contain cursor-pointer"
                                                        alt={`Foto de ${service.name} em ${partner.city} - ${partner.state}`}
                                                        custom={slideDirection}
                                                        variants={slideVariants}
                                                        initial="enter"
                                                        animate="center"
                                                        exit="exit"
                                                        transition={{ duration: 0.2 }}
                                                        style={{ transformOrigin, scale: smoothScale }}
                                                    />
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        <div className="lg:hidden relative bg-white dark:bg-dark-surface rounded-xl overflow-hidden cursor-pointer" style={{ aspectRatio: "1/1" }} onClick={() => openLightbox(activeImgIndex)}>
                                            <AnimatePresence mode="wait" custom={slideDirection}>
                                                <motion.img
                                                    key={activeImgIndex}
                                                    src={galleryItems[activeImgIndex]?.src || PLACEHOLDER}
                                                    className="absolute inset-0 w-full h-full object-contain"
                                                    alt={`Foto de ${service.name} em ${partner.city} - ${partner.state}`}
                                                    custom={slideDirection}
                                                    variants={slideVariants}
                                                    initial="enter"
                                                    animate="center"
                                                    exit="exit"
                                                    transition={{ duration: 0.2 }}
                                                />
                                            </AnimatePresence>
                                        </div>
                                    </div>

                                    <div className="hidden lg:flex flex-col gap-3 shrink-0 items-center self-stretch">
                                        {(() => {
                                            const isFavService = isFav(service.id, "servico")
                                            return (
                                                <Button variant="outline" size="icon" className="w-10 h-10"
                                                    onClick={async (e) => { e.stopPropagation(); if (isProductOwner) return; if (!user) return router.push("/auth/login?next=" + encodeURIComponent(window.location.pathname)); await toggleFav(service.id, "servico") }}
                                                    title={isFavService ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
                                                    <HeartIcon size={20} className={isFavService ? "text-brand-green fill-brand-green" : "text-brand-green"} />
                                                </Button>
                                            )
                                        })()}

                                        <Button variant="outline" size="icon" onClick={() => setShowShareModal(true)} className="w-10 h-10" title="Compartilhar">
                                            <ShareIcon size={18} className="text-brand-green" />
                                        </Button>
                                        <Button variant="outline" size="icon" onClick={() => { if (!user) return router.push("/auth/login?next=" + encodeURIComponent(window.location.pathname)); setShowCollectionModal(true) }} className="w-10 h-10" title="Adicionar à coleção">
                                            <PlusIcon size={18} className="text-brand-green" />
                                        </Button>

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

                            {/* Mobile booking panel */}
                            <div className="lg:hidden mb-6">{BookingPanel}</div>

                            {/* Description */}
                            <div id="service-description" className="mb-10">
                                <h3 className="text-xl font-medium text-brand-dark dark:text-dark-heading mb-4">Descrição</h3>
                                <div className={`relative ${!isDescriptionExpanded ? "max-h-[150px] overflow-hidden" : ""}`}>
                                    {service.description ? (
                                        <div
                                            className="rich-text-content"
                                            dangerouslySetInnerHTML={{ __html: service.description }}
                                        />
                                    ) : (
                                        <p className="text-sm md:text-[0.9375rem] text-gray-600 dark:text-dark-body leading-relaxed">Sem descrição.</p>
                                    )}
                                    {!isDescriptionExpanded && service.description?.length > 200 && (
                                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-gray-900 dark:to-transparent" />
                                    )}
                                </div>
                                {service.description?.length > 200 && (
                                    <button onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                        className="flex items-center gap-1 text-brand-green font-bold text-sm mt-3 hover:underline">
                                        {isDescriptionExpanded ? "Ver menos" : "Ver mais"}
                                    </button>
                                )}
                            </div>

                            {/* Reviews */}
                            <div className="border-t border-brand-border pt-2">
                                <h3 className="text-xl font-medium text-brand-dark dark:text-dark-heading mb-6 mt-8">Avaliações do serviço</h3>
                                <ReviewsSection reviews={reviews} />
                            </div>
                        </div>

                        {/* ── Right Column: Booking Panel (Desktop) ── */}
                        <div className="hidden lg:block lg:col-span-4 relative">
                            {BookingPanel}
                        </div>
                    </div>

                    {/* Mobile bottom bar */}
                    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-surface border-t dark:border-dark-border p-4 z-50 flex gap-2 lg:hidden shadow-lg">
                        {!showPrice ? (
                            (() => {
                                const cleanPhone = partner.phone ? partner.phone.replace(/\D/g, "") : ""
                                const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : cleanPhone.length >= 10 ? `55${cleanPhone}` : cleanPhone
                                const whatsappMsg = encodeURIComponent(`Olá! Vi o serviço "${service.name}" na Dudit e gostaria de saber o preço.`)
                                const whatsappUrl = `https://wa.me/${formattedPhone}?text=${whatsappMsg}`
                                return (
                                    <a
                                        href={whatsappUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-grow h-12 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold rounded-full transition-colors text-sm"
                                    >
                                        <WhatsappIcon size={20} className="fill-white" />
                                        Consultar preço
                                    </a>
                                )
                            })()
                        ) : isStartingAt ? (
                            <>
                                <div className="flex-1 flex flex-col justify-center min-w-0">
                                    <span className="text-base font-bold text-brand-dark dark:text-dark-heading leading-tight truncate">
                                        {pricePrefix}{formatCurrency(pricing.bestPrice || pricing.current)}
                                    </span>
                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                        {billingSuffix ? `por ${billingSuffix.replace("/", "").trim()}` : "Sob medida"}
                                    </span>
                                </div>
                                <Button
                                    variant="outline"
                                    className="rounded-full px-3.5 h-11 text-xs sm:text-sm"
                                    onClick={handleLearnMoreClick}
                                >
                                    Saber mais
                                </Button>
                                <Button
                                    className="flex-1 rounded-full min-w-[140px] h-11 text-xs sm:text-sm font-bold"
                                    onClick={handleRequestQuoteClick}
                                >
                                    Solicitar orçamento
                                </Button>
                            </>
                        ) : (
                            <>
                                <div className="flex-1 flex flex-col justify-center min-w-0">
                                    <span className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-none">
                                        {formatCurrency(pricing.pixDiscountPercent > 0 ? pricing.current * (1 - pricing.pixDiscountPercent / 100) : pricing.current)}
                                    </span>
                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                        {pricing.pixDiscountPercent > 0 ? "no Pix" : formatDuration(durationMinutes)}
                                    </span>
                                </div>
                                <>
                                    <Button
                                        variant="outline"
                                        className="rounded-full px-3"
                                        disabled={!selectedTime || isBooking}
                                        onClick={handleAddBookingToCart}
                                    >
                                        Sacola
                                    </Button>
                                    <Button
                                        className="flex-1 rounded-full min-w-[120px]"
                                        disabled={!selectedTime || isBooking}
                                        onClick={handleBookNowCheckout}
                                    >
                                        {isBooking ? "..." : "Reservar"}
                                    </Button>
                                </>
                            </>
                        )}
                    </div>

                    {/* Request Quote Modal */}
                    <RequestQuoteModal
                        isOpen={showRequestQuoteModal}
                        onClose={() => setShowRequestQuoteModal(false)}
                        service={service}
                        partner={partner}
                        userProfile={userProfile}
                    />
                </div>
            </motion.div>
        </>
    )
}
