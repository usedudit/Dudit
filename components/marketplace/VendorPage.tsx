"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Search, StarIcon, MapPinIcon, ChevronRightIcon, ChevronLeftIcon, ShareIcon, WhatsappIcon, FlagIcon, Check, InfoIcon, TagIcon, RepeatIcon, PackageIcon, ServiceIcon, XIcon, ClockIcon, FilterIcon, MotorbikeIcon, EnergyIcon, ShieldIcon, SearchIcon } from "@/lib/icons"
import { getAvatarColor, getBannerUrlByColor, UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import IconPlaceholder from "@/components/reusable/IconPlaceholder"
import { ShareModal } from "./ShareModal"
import { ReportModal } from "./ReportModal"
import { ReviewsSection } from "./ReviewsSection"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { getDefaultBannerSeeded } from "@/lib/utils/banner"
import { useSupabase } from "@/providers/supabase-provider"
import { trackEvent } from "@/lib/analytics"
import { formatCurrency, formatDate, formatMonth, formatYear, formatNumber } from "@/lib/utils"
import { normalizeOpeningHours, getOpenNowStatus } from "@/lib/utils/opening-hours"
import { calculateDistance, estimateAverageDeliveryTime, estimateDeliveryFeeLabel, formatAverageDeliveryTimeFromRange, estimateDeliveryTimeRange } from "@/lib/services/location.service"
import { getEffectiveMaxDeliveryKm } from "@/lib/delivery/fee"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { pushUrl, replaceUrl } from "@/lib/navigation/history"
import { ListItem } from "@/components/reusable/ListItem"
import BottomSheet from "@/components/BottomSheet"
import { Button, DefaultModal, Input, FormSection, InfoCard, RadioButton, Spinner, CepInput } from "@/components/reusable"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { getAddressesAction } from "@/app/actions/shared/addresses"
import { DUDIT_ACTIVE_ADDRESS_STORAGE_KEY, notifyAddressUpdated, useAddressSync } from "@/lib/utils/address-sync"
import { ItemCard, HorizontalCarousel } from "./shared-components"
import { getStoreUrl, getProductUrl, getServiceUrl, getPlanUrl } from "@/lib/utils/url-generator"
import { ExplorarMobileControls } from "./ExplorarMobileControls"
import { ExplorarFiltersBottomSheet } from "./ExplorarFiltersBottomSheet"
import { ExplorarSortBottomSheet } from "./ExplorarSortBottomSheet"
import { ExplorarViewControls } from "./ExplorarViewControls"
import type { SortOption } from "./explorar-constants"
import {
    isPromoItem,
    matchesBrandFilter,
    matchesConditionFilter,
    matchesPriceRange,
    matchesRatingFilter,
    parseFiltersFromParams,
    serializeFiltersToParams,
    type ExploreFilterState,
} from "./explorar-filters"
import { getProductDisplayImages } from "@/lib/utils/product-display-images"
import { usePathname } from "next/navigation"
import { toCanonicalPaymentType } from "@/lib/payments/payment-method"
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import { computeItemDisplayPrice } from "@/lib/services/pricing-engine"
import { PromotionType, DiscountType } from "@/lib/types/promotion"
import { sortByVendorRelevance, calcVendorItemScore } from "@/lib/marketplace/ranking"
import { buildVendorLocationPopupHtml } from "@/lib/map/mapbox-popup"
import { applyVendorUrgencyBadges } from "@/lib/marketplace/badges"

type VendorContext = "produtos" | "servicos" | "planos"

interface VendorPageClientProps {
    partner: any
    products: any[]
    services: any[]
    plans?: any[]
    reviews: any[]
    stats: any
    ratingDistribution: { star: number; count: number }[]
    productCategories: string[]
    serviceCategories: string[]
    coupons?: any[]
    initialPromotions?: any[]
    userProfile?: any
    cartCount?: number
    isShowcaseActive?: boolean
    initialCategory?: string
}

const getImageUrl = (path?: string | null) => getR2ImageUrl(path)

const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
}

const formatJoinDate = (createdAt: string | Date) => {
    const month = formatMonth(createdAt)
    return `Entrou em ${month.charAt(0).toUpperCase() + month.slice(1)} de ${formatYear(createdAt)}`
}

const openWhatsApp = (phone?: string, storeName?: string) => {
    const cleaned = phone?.replace(/\D/g, "") ?? ""
    const number = cleaned.startsWith("55") ? cleaned : `55${cleaned}`
    const text = encodeURIComponent(`Olá, ${storeName || "tudo bem"}! Vi sua vitrine na Dudit e gostaria de saber mais.`)
    trackEvent("whatsapp_lead_clicked", { store_name: storeName })
    window.open(`https://wa.me/${number}?text=${text}`, "_blank")
}

const normalizeItemForCard = (item: any, partner: any, promotions?: any[]) => {
    const itemType = item.itemType || (item.duration_minutes !== undefined ? "servico" : undefined)

    const resolvedPartnerId = partner?.partner_id || partner?.partnerId || partner?.id

    if (item.itemType === 'plano') {
        return {
            ...item,
            partners: {
                id: resolvedPartnerId,
                partner_id: resolvedPartnerId,
                store_id: partner?.id,
                store_name: partner?.storeName,
                store_avatar: partner?.storeImageUrl,
                city: partner?.city,
                state: partner?.state,
                distance_km_formatted: partner?.distance_km_formatted,
            }
        }
    }
    const hasVariants = !!item.product_variants?.length || !!item.variants?.length || !!item.fallback_variant_price
    const basePrice = Number(item.price) || 0
    const rawPromo = item.promotional_price ? Number(item.promotional_price) : null
    const individualPromo = (hasVariants || !rawPromo || rawPromo >= basePrice) ? null : rawPromo

    let effectivePrice = (!individualPromo && item.fallback_variant_price)
        ? Number(item.fallback_variant_price)
        : (individualPromo || basePrice || 0)
    let originalPrice: number | undefined = individualPromo ? basePrice : undefined

    if (promotions && promotions.length > 0) {
        const pricing = computeItemDisplayPrice(
            basePrice > 0 ? basePrice : effectivePrice,
            individualPromo,
            promotions,
            {
                productId: itemType === "produto" ? item.id : undefined,
                serviceId: itemType === "servico" ? item.id : undefined,
                categoryId: item.category_id || undefined,
            }
        )
        if (pricing.hasDiscount) {
            effectivePrice = pricing.bestPrice
            originalPrice = pricing.referencePrice || basePrice
        }
    }

    return {
        ...item,
        itemType,
        price: effectivePrice,
        originalPrice,
        promotional_price: originalPrice ? effectivePrice : undefined,
        _promotions: promotions,
        images: getProductDisplayImages(item),
        partners: {
            id: resolvedPartnerId,
            partner_id: resolvedPartnerId,
            store_id: partner?.id,
            store_name: partner?.storeName,
            store_avatar: partner?.storeImageUrl,
            city: partner?.city,
            state: partner?.state,
            distance_km_formatted: partner?.distance_km_formatted,
            delivery_settings: partner?.delivery_settings || partner?.deliverySettings || null,
        },
    }
}

const normalizeCategory = (category?: string | null) => (category || "Outros").trim()
const categoryId = (category: string) => category.toLowerCase()

const formatCouponValue = (coupon: any) => {
    if (coupon.discount_type === "free_shipping") return "Entrega grátis"
    if (coupon.discount_type === "percentage") return `${Number(coupon.discount_value || 0)}% OFF`
    return `${formatCurrency(Number(coupon.discount_value || 0))} OFF`
}

const couponScopeLabel = (scope?: string) => {
    if (scope === "products") return "Produtos selecionados"
    if (scope === "services") return "Servicos selecionados"
    if (scope === "categories") return "Categorias selecionadas"
    return "Toda a vitrine"
}

const AVAILABLE_BRANDS = [
    { id: "american_express", label: "American Express", image: "https://img.dudit.com.br/static/icons/payments/Amex.png" },
    { id: "diners", label: "Diners Club", image: "https://img.dudit.com.br/static/icons/payments/Diners.png" },
    { id: "discover", label: "Discover", image: "https://img.dudit.com.br/static/icons/payments/Discover.png" },
    { id: "elo", label: "Elo", image: "https://img.dudit.com.br/static/icons/payments/Elo.png" },
    { id: "hipercard", label: "Hipercard", image: "https://img.dudit.com.br/static/icons/payments/Hipercard.png" },
    { id: "jcb", label: "JCB", image: "https://img.dudit.com.br/static/icons/payments/JCB.png" },
    { id: "mastercard", label: "Mastercard", image: "https://img.dudit.com.br/static/icons/payments/Mastercard.png" },
    { id: "visa", label: "Visa", image: "https://img.dudit.com.br/static/icons/payments/Visa.png" },
]

const paymentKind = (pm: any) => `${pm.type || ""} ${pm.payment_type || ""} ${pm.name || ""}`.toLowerCase()
const isPaymentActive = (pm: any) => pm.is_active !== false
const getUniqueBrands = (methods: any[]) => {
    const brandSet = new Set(
        methods
            .flatMap(pm => String(pm.card_brand || pm.card_brands || "").split(/[;,]/))
            .map(brand => brand.trim().toLowerCase())
            .filter(Boolean)
    )
    return AVAILABLE_BRANDS.filter(b => brandSet.has(b.id))
}

const RatingInline = ({ rating, reviewsCount, short }: { rating: number; reviewsCount: number; short?: boolean }) => (
    <div className="flex items-center gap-1 text-[12px] lg:text-[13px] text-brand-dark dark:text-dark-heading">
        <StarIcon size={14} className="text-brand-green fill-brand-green shrink-0" />
        {reviewsCount > 0 ? (
            <>
                <span className="font-semibold">{formatNumber(rating || 0, 1, 1)}</span>
                <span className="text-brand-inactive-text dark:text-dark-body">
                    {short ? `(${reviewsCount})` : `(${reviewsCount} avaliações)`}
                </span>
            </>
        ) : (
            <span className="text-brand-inactive-text dark:text-dark-body">{short ? "(0)" : "Sem avaliações"}</span>
        )}
    </div>
)

const openStatusToneClass = (status?: string) =>
    status === "open" ? "text-brand-green"
        : status === "closing_soon" ? "text-brand-orange"
            : "text-brand-red"

const MAX_LOCAL_DELIVERY_FALLBACK_KM = 50

const StoreStatusLine = ({ openStatus, delivery, className = "" }: { openStatus: { label: string; status: string } | null; delivery: ReactNode | null; className?: string }) => (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] lg:text-[14px] leading-snug ${className}`}>
        {openStatus && (
            <span className={`font-medium ${openStatusToneClass(openStatus.status)}`}>
                {openStatus.label}
            </span>
        )}
        {openStatus && delivery && (
            <span className="text-brand-inactive-text dark:text-dark-body font-normal">|</span>
        )}
        {delivery}
    </div>
)

const StatItem = ({ value, label, icon }: any) => (
    <div className="flex flex-col items-center flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
            {icon}
            <span className="text-[14px] lg:text-[16px] font-semibold text-brand-dark dark:text-dark-heading truncate">{value}</span>
        </div>
        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body font-medium uppercase">{label}</span>
    </div>
)

const getBusinessDayStatus = (value: any) => {
    if (!value?.enabled) return "closed"

    try {
        const now = new Date()
        const currentMinutes = now.getHours() * 60 + now.getMinutes()

        const [fromH, fromM] = value.from.split(":").map(Number)
        const fromMinutes = fromH * 60 + fromM

        const [toH, toM] = value.to.split(":").map(Number)
        const toMinutes = toH * 60 + toM

        if (fromMinutes < toMinutes) {
            if (currentMinutes < fromMinutes || currentMinutes >= toMinutes) {
                return "closed"
            }
            if (toMinutes - currentMinutes <= 60) {
                return "closing_soon"
            }
            return "open"
        } else {
            const isOpen = currentMinutes >= fromMinutes || currentMinutes < toMinutes
            if (!isOpen) return "closed"

            let remaining = 0
            if (currentMinutes >= fromMinutes) {
                remaining = (24 * 60 - currentMinutes) + toMinutes
            } else {
                remaining = toMinutes - currentMinutes
            }

            if (remaining <= 60) {
                return "closing_soon"
            }
            return "open"
        }
    } catch {
        return "open"
    }
}

const formatOpeningHoursList = (hours: any) => {
    if (typeof hours === "string" || !hours || typeof hours !== "object") return []
    const normalizedHours = normalizeOpeningHours(hours)
    const daysMap: Record<string, string> = {
        monday: "Segunda-feira",
        tuesday: "Terça-feira",
        wednesday: "Quarta-feira",
        thursday: "Quinta-feira",
        friday: "Sexta-feira",
        saturday: "Sábado",
        sunday: "Domingo",
    }
    const currentDayKey = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date().getDay()]
    return Object.entries(normalizedHours)
        .sort((a, b) => ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].indexOf(a[0]) - ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].indexOf(b[0]))
        .map(([key, value]: [string, any]) => {
            const isCurrentDay = key === currentDayKey
            const status = isCurrentDay ? getBusinessDayStatus(value) : "open"
            return {
                dayName: daysMap[key] || key,
                timeString: value?.enabled ? `${value.from} - ${value.to}` : "Fechado",
                isCurrentDay,
                status,
            }
        })
}

const MapboxMap = ({ lat, lng, name, address, isActive }: { lat?: number; lng?: number; name?: string; address?: string; isActive?: boolean }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<any>(null)
    const [isMapping, setIsMapping] = useState(true)
    const [mapError, setMapError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
        const initMap = async () => {
            if (cancelled || !mapContainerRef.current || !token) return
            if (!lat || !lng || isNaN(Number(lat))) {
                setIsMapping(false)
                return
            }
            try {
                if (!document.getElementById("mapbox-gl-css")) {
                    const link = document.createElement("link")
                    link.id = "mapbox-gl-css"
                    link.rel = "stylesheet"
                    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.28.0/mapbox-gl.css"
                    document.head.appendChild(link)
                }
                if (!(window as any).mapboxgl) {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement("script")
                        script.src = "https://api.mapbox.com/mapbox-gl-js/v3.28.0/mapbox-gl.js"
                        script.async = true
                        script.onload = resolve
                        script.onerror = reject
                        document.head.appendChild(script)
                    })
                }
                if (cancelled || !mapContainerRef.current) return
                const mapboxgl = (window as any).mapboxgl
                mapboxgl.accessToken = token
                const map = new mapboxgl.Map({
                    container: mapContainerRef.current,
                    style: "mapbox://styles/mapbox/light-v11",
                    center: [lng, lat],
                    zoom: 15,
                    attributionControl: false,
                })
                map.on("error", (e: any) => {
                    if (cancelled) return
                    setMapError(e?.error?.message || e?.message || "Falha ao carregar o mapa.")
                })
                mapRef.current = map

                // Custom styled pin
                const el = document.createElement("div")
                el.className = "flex items-center justify-center rounded-full w-8 h-8 bg-brand-green text-white shadow-sm border-2 border-white dark:border-dark-surface cursor-pointer"
                el.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>
                `

                const marker = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(mapRef.current)
                if (name || address) {
                    marker.setPopup(
                        new mapboxgl.Popup({ offset: 20, closeButton: true, maxWidth: "270px" })
                            .setHTML(buildVendorLocationPopupHtml({
                                name: name || "Loja Parceira",
                                address: address || "",
                                latitude: Number(lat),
                                longitude: Number(lng),
                            }))
                    )
                }
            } catch {
                setIsMapping(false)
            }
        }
        initMap()
        return () => {
            cancelled = true
            setMapError(null)
            mapRef.current?.remove()
        }
    }, [lat, lng, name, address])

    useEffect(() => {
        if (isActive && mapRef.current) {
            setTimeout(() => {
                mapRef.current?.resize()
            }, 100)
        }
    }, [isActive])

    if (!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || !isMapping) {
        return <div className="w-full h-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center p-4 text-center text-[12px] text-brand-inactive-text dark:text-dark-body">Localização indisponível no mapa.</div>
    }
    if (mapError) {
        return <div className="w-full h-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center p-4 text-center text-[12px] text-brand-inactive-text dark:text-dark-body">Não foi possível carregar o mapa.</div>
    }
    return <div ref={mapContainerRef} className="w-full h-full bg-gray-100 dark:bg-dark-border/50" />
}

const PaymentPill = ({ icon, label }: { icon?: string; label: string }) => (
    <div className="h-9 px-3 rounded-[8px] border border-brand-border bg-white dark:bg-dark-surface flex items-center gap-2">
        {icon && <img src={icon} alt={label} className="h-4 max-w-[52px] object-contain" />}
        <span className="text-[13px] text-brand-dark dark:text-dark-heading font-medium">{label}</span>
    </div>
)

const CardBrands = ({ brands }: { brands: typeof AVAILABLE_BRANDS }) => {
    if (!brands.length) return null
    return (
        <div className="flex flex-wrap gap-2 mt-3">
            {brands.map(brand => {
                return <PaymentPill key={brand.id} icon={brand.image} label={brand.label} />
            })}
        </div>
    )
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

const InfoTab = ({ partner, stats, isActive, onReport }: any) => {
    const hoursList = formatOpeningHoursList(partner.openingHours)
    const paymentMethodsArr = (partner.paymentMethods || []).filter(isPaymentActive)
    const pixMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "pix")
    const cashMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "cash")
    const transferMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "bank_transfer")
    const creditMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "credit_card")
    const debitMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "debit_card")
    const creditBrands = getUniqueBrands(creditMethods)
    const debitBrands = getUniqueBrands(debitMethods)
    const hasSimplePayments = pixMethods.length > 0 || cashMethods.length > 0 || transferMethods.length > 0
    const hasPaymentSections = hasSimplePayments || creditMethods.length > 0 || debitMethods.length > 0

    const mpConnected = !!partner.mp_user_id
    const mpAccepted = partner.mp_accepted_payment_methods
    const mpMethods = mpAccepted ? [
        mpAccepted.pix && { label: "Pix", icon: "https://img.dudit.com.br/static/icons/payments/Pix.png" },
        mpAccepted.boleto && { label: "Boleto" },
        mpAccepted.credit_card && { label: "Cartão de Crédito" },
        mpAccepted.debit_card && { label: "Cartão de Débito" },
        mpAccepted.mercado_pago_wallet && { label: "Saldo MP" },
    ].filter(Boolean) as Array<{ label: string; icon?: string }> : []

    return (
        <div className="pb-10 space-y-8 animate-fade-in">
            {partner.storeDescription && (
                <FormSection title={`Sobre ${partner.storeName}`}>
                    <p className="text-[15px] text-brand-inactive-text dark:text-dark-body leading-relaxed whitespace-pre-wrap">{partner.storeDescription}</p>
                </FormSection>
            )
            }

            {
                mpConnected && (
                    <FormSection title="Pagamento online" hasSeparator>
                        <div className="space-y-3">
                            <ListItem
                                className="!border-none !bg-transparent p-0 cursor-default"
                                icon={
                                    <img
                                        src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png"
                                        alt="Mercado Pago"
                                        className="w-6 h-6 object-contain shrink-0"
                                    />
                                }
                                title="Mercado Pago"
                                description={mpMethods.length > 0 ? mpMethods.map(m => m.label).join(", ") : "Pague com cartão, Pix ou saldo MP."}
                            />
                        </div>
                    </FormSection>
                )
            }

            {
                hasPaymentSections && (
                    <FormSection title="Pagamento na retirada/entrega" hasSeparator>
                        <div className="space-y-5">
                            {hasSimplePayments && (
                                <div>
                                    <h4 className="text-[14px] font-semibold text-brand-dark dark:text-dark-heading mb-2">À Vista / Imediato</h4>
                                    <div className="flex flex-wrap gap-2.5">
                                        {pixMethods.length > 0 && <PaymentPill icon="https://img.dudit.com.br/static/icons/payments/Pix.png" label="Pix" />}
                                        {cashMethods.length > 0 && <PaymentPill icon="https://img.dudit.com.br/static/icons/payments/Dinheiro.png" label="Dinheiro" />}
                                        {transferMethods.length > 0 && <PaymentPill label="Transferência bancária" />}
                                    </div>
                                </div>
                            )}
                            {debitMethods.length > 0 && (
                                <div>
                                    <h4 className="text-[14px] font-semibold text-brand-dark dark:text-dark-heading mb-2">Cartão de débito</h4>
                                    {debitBrands.length > 0 ? <CardBrands brands={debitBrands} /> : <p className="text-[13px] text-brand-inactive-text dark:text-dark-body">Bandeiras não informadas.</p>}
                                </div>
                            )}
                            {creditMethods.length > 0 && (
                                <div>
                                    <h4 className="text-[14px] font-semibold text-brand-dark dark:text-dark-heading mb-2">Cartão de crédito</h4>
                                    {creditBrands.length > 0 ? <CardBrands brands={creditBrands} /> : <p className="text-[13px] text-brand-inactive-text dark:text-dark-body">Bandeiras não informadas.</p>}
                                </div>
                            )}
                        </div>
                    </FormSection>
                )
            }

            {
                hoursList.length > 0 && (
                    <>
                        <FormSection title="Horário de Funcionamento" hasSeparator>
                            <div className="space-y-3">
                                {hoursList.map((item: any) => {
                                    let dayColor = "text-brand-dark dark:text-dark-heading"
                                    let timeColor = "text-brand-inactive-text dark:text-dark-body"
                                    if (item.isCurrentDay) {
                                        if (item.status === "closing_soon") {
                                            dayColor = "text-brand-yellow font-medium"
                                            timeColor = "text-brand-yellow font-medium"
                                        } else if (item.status === "closed") {
                                            dayColor = "text-brand-red font-medium"
                                            timeColor = "text-brand-red font-medium"
                                        } else {
                                            dayColor = "text-brand-green font-medium"
                                            timeColor = "text-brand-green font-medium"
                                        }
                                    }
                                    return (
                                        <div key={item.dayName} className="flex justify-between items-center text-[14px]">
                                            <span className="flex items-center gap-1.5">
                                                <span className={dayColor}>{item.dayName}</span>
                                                {item.isCurrentDay && item.status === "closing_soon" && (
                                                    <ClockIcon size={14} className="text-brand-yellow shrink-0" />
                                                )}
                                                {item.isCurrentDay && item.status === "closed" && (
                                                    <ClockIcon size={14} className="text-brand-red shrink-0" />
                                                )}
                                            </span>
                                            <span className={timeColor}>{item.timeString}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </FormSection>
                    </>
                )
            }

            <FormSection title="Endereço" hasSeparator>
                <div className="flex items-start gap-3 mb-5">
                    <MapPinIcon size={20} className="text-brand-inactive-text dark:text-dark-body mt-1 shrink-0" />
                    <div>
                        <p className="text-[15px] text-brand-inactive-text dark:text-dark-body">{partner.street}, {partner.number}</p>
                        <p className="text-[15px] text-brand-inactive-text dark:text-dark-body">{partner.city} - {partner.state}</p>
                        <p className="text-[15px] text-brand-inactive-text dark:text-dark-body">CEP: {partner.zipCode}</p>
                    </div>
                </div>
                <div className="w-full h-[150px] lg:h-[260px] rounded-[12px] overflow-hidden bg-brand-gray dark:bg-dark-border/50 shrink-0">
                    <MapboxMap lat={partner.lat} lng={partner.lng} name={partner.storeName} address={`${partner.street}, ${partner.number}, ${partner.city}/${partner.state}`} isActive={isActive} />
                </div>
            </FormSection>

            {
                onReport && (
                    <div className="pt-4 border-t border-brand-border dark:border-dark-border">
                        <button
                            onClick={onReport}
                            className="flex items-center gap-2 text-[14px] text-brand-inactive-text dark:text-dark-body hover:text-brand-red hover:text-[#d32f2f] transition-colors"
                        >
                            <FlagIcon size={16} />
                            <span>Comunicar algo errado sobre este vendedor</span>
                        </button>
                    </div>
                )
            }
        </div >
    )
}

const ReviewsTab = ({ reviews }: any) => {
    return (
        <div className="pb-10 animate-fade-in">
            <ReviewsSection reviews={reviews} showItemInfo />
        </div>
    )
}

function CarouselNav({ targetRef, showSeeAll, onSeeAll }: { targetRef: React.RefObject<HTMLDivElement | null>; showSeeAll?: boolean; onSeeAll?: () => void }) {
    const [canLeft, setCanLeft] = useState(false)
    const [canRight, setCanRight] = useState(false)
    const update = useCallback(() => {
        const node = targetRef.current
        if (!node) return
        setCanLeft(node.scrollLeft > 4)
        setCanRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 4)
    }, [targetRef])
    useEffect(() => {
        update()
        const node = targetRef.current
        node?.addEventListener("scroll", update, { passive: true })
        window.addEventListener("resize", update)
        const frame = requestAnimationFrame(update)
        return () => {
            cancelAnimationFrame(frame)
            node?.removeEventListener("scroll", update)
            window.removeEventListener("resize", update)
        }
    }, [update])
    const scroll = (dir: number) => targetRef.current?.scrollBy({ left: dir * 720, behavior: "smooth" })
    return (
        <div className="flex items-center gap-2">
            {showSeeAll && <button onClick={onSeeAll} className="text-[13px] font-bold text-brand-green hover:underline px-2">Ver todos</button>}
            <div className="hidden lg:flex items-center gap-2">
                {canLeft && (
                    <Button variant="filled" onClick={() => scroll(-1)} className="h-9 w-9 p-0 rounded-full bg-brand-gray dark:bg-dark-border/30 text-brand-dark dark:text-dark-heading hover:bg-gray-200 dark:hover:bg-dark-border">
                        <ChevronLeftIcon size={18} />
                    </Button>
                )}
                {canRight && (
                    <Button variant="filled" onClick={() => scroll(1)} className="h-9 w-9 p-0 rounded-full">
                        <ChevronRightIcon size={18} />
                    </Button>
                )}
            </div>
        </div>
    )
}

function ItemsCarousel({ title, items, partner, onSeeAll, sectionId, promotions }: { title: string; items: any[]; partner: any; onSeeAll?: () => void; sectionId?: string; promotions?: any[] }) {
    const ref = useRef<HTMLDivElement>(null)
    if (!items.length) return null
    return (
        <section id={sectionId} data-category-section={sectionId} className="scroll-mt-[150px] mb-10 lg:mb-12">
            <div className="flex items-end justify-between px-4 lg:px-0">
                <h2 className="text-lg lg:text-2xl font-medium text-brand-dark dark:text-dark-heading mb-6">{title}</h2>
                <CarouselNav targetRef={ref} showSeeAll={!!onSeeAll} onSeeAll={onSeeAll} />
            </div>
            <div ref={ref} className="flex gap-4 lg:gap-5 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-3">
                {items.slice(0, 20).map(item => (
                    <div key={item.id} className="snap-start">
                        <ItemCard product={normalizeItemForCard(item, partner)} showSeller={false} promotions={promotions} hideSalesCount />
                    </div>
                ))}
            </div>
        </section>
    )
}

function CampaignSection({ name, onSeeAll, children }: { name: string; onSeeAll: () => void; children: ReactNode }) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [canLeft, setCanLeft] = useState(false)
    const [canRight, setCanRight] = useState(false)
    const update = useCallback(() => {
        const node = scrollRef.current
        if (!node) return
        setCanLeft(node.scrollLeft > 4)
        setCanRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 4)
    }, [])
    useEffect(() => {
        update()
        const node = scrollRef.current
        node?.addEventListener("scroll", update, { passive: true })
        window.addEventListener("resize", update)
        const frame = requestAnimationFrame(update)
        const timer = setTimeout(update, 500)
        return () => {
            cancelAnimationFrame(frame)
            clearTimeout(timer)
            node?.removeEventListener("scroll", update)
            window.removeEventListener("resize", update)
        }
    }, [update])
    const scroll = (dir: number) => scrollRef.current?.scrollBy({ left: dir * 720, behavior: "smooth" })

    return (
        <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg md:text-xl font-black uppercase tracking-tight">{name}</h2>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                    <Button
                        variant="link"
                        onClick={onSeeAll}
                        className="text-sm text-white hover:text-white"
                    >
                        Ver tudo
                    </Button>
                    <div className="hidden lg:flex items-center gap-2">
                        {canLeft && (
                            <Button
                                variant="filled"
                                size="icon"
                                onClick={() => scroll(-1)}
                                className="!w-8 !h-8 bg-white/25 text-brand-dark hover:bg-white/40"
                                aria-label="Rolar ofertas para a esquerda"
                            >
                                <ChevronLeftIcon size={16} />
                            </Button>
                        )}
                        {canRight && (
                            <Button
                                variant="filled"
                                size="icon"
                                onClick={() => scroll(1)}
                                className="!w-8 !h-8 bg-white/25 text-brand-dark hover:bg-white/40"
                                aria-label="Rolar ofertas para a direita"
                            >
                                <ChevronRightIcon size={16} />
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <div className="relative">
                <div ref={scrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide px-1 snap-x snap-mandatory">
                    {children}
                </div>
                <div className={`pointer-events-none absolute inset-y-0 left-0 hidden lg:block w-12 bg-gradient-to-r from-brand-green to-transparent transition-opacity duration-300 ${canLeft ? "opacity-100" : "opacity-0"}`} />
                <div className={`pointer-events-none absolute inset-y-0 right-0 hidden lg:block w-12 bg-gradient-to-l from-brand-green to-transparent transition-opacity duration-300 ${canRight ? "opacity-100" : "opacity-0"}`} />
            </div>
        </>
    )
}

function CouponsCarousel({ coupons, onCouponClick }: { coupons: any[]; onCouponClick: (coupon: any) => void }) {
    const ref = useRef<HTMLDivElement>(null)
    if (!coupons.length) return null
    return (
        <section id="coupons" className="mb-10 lg:mb-12 scroll-mt-[150px]">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg lg:text-2xl font-medium text-brand-dark dark:text-dark-heading mb-6">Cupons do vendedor</h2>
                <CarouselNav targetRef={ref} />
            </div>
            <div ref={ref} className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2">
                {coupons.map(coupon => (
                    <div key={coupon.id} className="w-[280px] lg:w-[340px] shrink-0 snap-start">
                        <ListItem
                            icon={<TagIcon size={22} className="text-brand-green" />}
                            title={formatCouponValue(coupon)}
                            description={`${coupon.code} - ${couponScopeLabel(coupon.apply_scope)}`}
                            onClick={() => onCouponClick(coupon)}
                            right={<span className="text-[12px] font-bold text-brand-green shrink-0">Ver</span>}
                            className="p-4"
                        />
                    </div>
                ))}
            </div>
        </section>
    )
}

function isItemInPromotion(item: any, promo: any, itemType: "produto" | "servico") {
    if (!promo || !item) return false

    const scope = promo.applyScope || promo.apply_scope
    if (scope === "entire_cart") return true

    const productIds = promo.applicableProductIds || (promo.promotion_products || []).map((p: any) => p.product_id || p)
    const categoryIds = promo.applicableCategoryIds || (promo.promotion_categories || []).map((c: any) => c.category_id || c)
    const serviceIds = promo.applicableServiceIds || (promo.promotion_services || []).map((s: any) => s.service_id || s)

    if (itemType === "produto") {
        if (scope === "specific_products") {
            return productIds?.includes(item.id)
        }
        if (scope === "category" && item.category_id) {
            return categoryIds?.includes(item.category_id)
        }
    }

    if (itemType === "servico") {
        if (scope === "specific_services") {
            return serviceIds?.includes(item.id)
        }
        if (scope === "category" && item.category_id) {
            return categoryIds?.includes(item.category_id)
        }
    }

    return false
}

function getPromotionScore(promo: any): number {
    const promoType = promo.promotionType || promo.promotion_type
    const discountType = promo.discountType || promo.discount_type
    const discountValue = Number(promo.discountValue ?? promo.discount_value ?? 0)
    const buyQuantity = Number(promo.buyQuantity ?? promo.buy_quantity ?? 1)
    const payQuantity = Number(promo.payQuantity ?? promo.pay_quantity ?? 0)

    switch (promoType) {
        case PromotionType.DISCOUNT:
        case "discount":
            if (discountType === DiscountType.PERCENTAGE || discountType === "percentage") {
                return 10000 + discountValue
            }
            return discountValue
        case PromotionType.BUY_X_PAY_Y:
        case "buy_x_pay_y": {
            const buy = buyQuantity || 1
            const pay = payQuantity || 0
            return 20000 + ((buy - pay) / buy) * 100
        }
        case PromotionType.GIFT:
        case "gift":
            return 15000 + (promo.priority || 0)
        default:
            return 0
    }
}

function hashSeed(seed: string | number): number {
    const str = String(seed)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
    }
    return Math.abs(hash)
}

function pickBestSection(sections: any[], seed: string | number): any | null {
    if (!sections.length) return null

    const discountSections = sections.filter(
        s => (s.promotion.promotionType === PromotionType.DISCOUNT || s.promotion.promotion_type === "discount")
    )
    const benefitSections = sections.filter(
        s => (s.promotion.promotionType === PromotionType.BUY_X_PAY_Y || s.promotion.promotion_type === "buy_x_pay_y" ||
            s.promotion.promotionType === PromotionType.GIFT || s.promotion.promotion_type === "gift")
    )

    const bestDiscount = discountSections.length > 0
        ? discountSections.reduce((best, s) =>
            getPromotionScore(s.promotion) > getPromotionScore(best.promotion) ? s : best
        )
        : null

    const bestBenefit = benefitSections.length > 0
        ? benefitSections.reduce((best, s) =>
            getPromotionScore(s.promotion) > getPromotionScore(best.promotion) ? s : best
        )
        : null

    if (bestDiscount && bestBenefit) {
        return hashSeed(seed) % 2 === 0 ? bestDiscount : bestBenefit
    }

    return bestDiscount || bestBenefit
}

function VendorListItem({ item, partner }: { item: any; partner: any }) {
    const normalized = normalizeItemForCard(item, partner)
    const imageUrl = normalized.images?.[0] || null
    const itemUrl = normalized.itemType === "plano"
        ? getPlanUrl(normalized, normalized.partners)
        : (normalized.itemType === "servico" || item.duration_minutes !== undefined
            ? getServiceUrl(normalized, normalized.partners)
            : getProductUrl(normalized, normalized.partners))
    return (
        <a
            href={itemUrl}
            className="group grid grid-cols-[80px_1fr] gap-3 border-t border-gray-100 dark:border-dark-border py-3 hover:bg-gray-50/60 dark:hover:bg-dark-border/30 transition-colors"
        >
            <div className="relative aspect-square overflow-hidden rounded-lg bg-brand-gray dark:bg-dark-border/30">
                {imageUrl && <img src={imageUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" />}
            </div>
            <div className="min-w-0 py-1">
                <h3 className="text-[14px] font-medium text-brand-dark dark:text-dark-heading truncate group-hover:text-brand-green transition-colors">{item.name}</h3>
                {item.category && <p className="text-[12px] text-brand-inactive-text dark:text-dark-body mt-0.5">{normalizeCategory(item.category)}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                    {item.promotional_price ? (
                        <>
                            <span className="text-[14px] font-bold text-brand-green">{formatCurrency(Number(item.promotional_price))}</span>
                            <span className="text-[12px] text-brand-inactive-text dark:text-dark-body line-through">{formatCurrency(Number(item.price))}</span>
                        </>
                    ) : item.price ? (
                        <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(Number(item.price))}</span>
                    ) : null}
                </div>
            </div>
        </a>
    )
}

function DeliveryCalculatorModal({
    isOpen,
    onClose,
    partner,
    userId,
    currentAddressLabel,
    initialCoords,
    initialDeliveryInfo,
    onApplyLocation,
}: {
    isOpen: boolean
    onClose: () => void
    partner: any
    userId?: string | null
    currentAddressLabel: string | null
    initialCoords?: { lat: number; lng: number } | null
    initialDeliveryInfo?: {
        distanceKm: number | null
        deliveryTime: string | null
        feeLabel: string | null
        isFreeDelivery: boolean
        outOfRadius: boolean
    } | null
    onApplyLocation: (data: {
        lat: number | null
        lng: number | null
        label: string
        cep?: string | null
        addressId?: string | null
        addressData?: any
    }) => void
}) {
    const [calcCep, setCalcCep] = useState("")
    const [calcLoading, setCalcLoading] = useState(false)
    const [gpsLoading, setGpsLoading] = useState(false)
    const [calcError, setCalcError] = useState<string | null>(null)
    const [calcResult, setCalcResult] = useState<{
        distanceKm: number | null
        deliveryTime: string | null
        feeLabel: string | null
        isFree: boolean
        outOfRadius: boolean
        addressLabel: string
        lat: number | null
        lng: number | null
        cep?: string | null
        addressId?: string | null
        addressData?: any
    } | null>(null)

    const [savedAddresses, setSavedAddresses] = useState<any[]>([])
    const [loadingSavedAddresses, setLoadingSavedAddresses] = useState(false)
    const wasOpenRef = useRef(false)

    // Preenche o resultado inicial apenas na abertura do modal (evita sobrescrever resultado/erro durante re-renders)
    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false
            return
        }
        if (wasOpenRef.current) return
        wasOpenRef.current = true
        setCalcError(null)

        if (currentAddressLabel && (initialCoords || initialDeliveryInfo)) {
            setCalcResult({
                distanceKm: initialDeliveryInfo?.distanceKm ?? null,
                deliveryTime: initialDeliveryInfo?.outOfRadius ? null : (initialDeliveryInfo?.deliveryTime ?? null),
                feeLabel: initialDeliveryInfo?.outOfRadius
                    ? "A combinar"
                    : (initialDeliveryInfo?.feeLabel ?? "A combinar"),
                isFree: Boolean(!initialDeliveryInfo?.outOfRadius && initialDeliveryInfo?.isFreeDelivery),
                outOfRadius: Boolean(initialDeliveryInfo?.outOfRadius),
                addressLabel: currentAddressLabel,
                lat: initialCoords?.lat ?? null,
                lng: initialCoords?.lng ?? null,
            })
        } else {
            setCalcResult(null)
        }
    }, [isOpen, currentAddressLabel, initialCoords, initialDeliveryInfo])

    // Carrega endereços salvos do usuário se estiver logado
    useEffect(() => {
        if (!isOpen) return
        if (userId) {
            setLoadingSavedAddresses(true)
            getAddressesAction(userId, "user")
                .then((res: any) => {
                    if (res?.addresses) {
                        setSavedAddresses(res.addresses)
                    }
                })
                .catch(() => { })
                .finally(() => {
                    setLoadingSavedAddresses(false)
                })
        }
    }, [isOpen, userId])

    const formatCepMask = (val: string) => {
        const clean = val.replace(/\D/g, "").slice(0, 8)
        if (clean.length > 5) {
            return `${clean.slice(0, 5)}-${clean.slice(5)}`
        }
        return clean
    }

    const reverseGeocodeLabel = async (lat: number, lng: number): Promise<string> => {
        try {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 4000)
            const res = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pt`,
                { signal: controller.signal }
            )
            clearTimeout(timer)
            if (res.ok) {
                const data = await res.json()
                const city = data?.city || data?.locality
                const uf = data?.principalSubdivisionCode?.replace(/^BR-/i, "") || ""
                if (city && uf) return `Minha localização (${city}/${uf})`
                if (city) return `Minha localização (${city})`
            }
        } catch {
            // Fallback silencioso
        }
        return "Minha localização atual"
    }

    const processCoordsCalculation = async (
        destCoords: { lat: number; lng: number } | null,
        label: string,
        cep?: string,
        addressId?: string | null,
        addressData?: any
    ) => {
        const storeLat = partner?.lat ?? partner?.latitude ?? null
        const storeLng = partner?.lng ?? partner?.longitude ?? null
        const rawSettings = partner?.delivery_settings || null
        const settings = Array.isArray(rawSettings) ? rawSettings[0] : rawSettings
        const isDeliveryEnabled = settings?.is_delivery_enabled !== false && settings?.isDeliveryEnabled !== false

        let distanceKm: number | null = null
        if (destCoords && storeLat != null && storeLng != null && !isNaN(Number(storeLat)) && !isNaN(Number(storeLng))) {
            distanceKm = Number(calculateDistance(destCoords, { lat: Number(storeLat), lng: Number(storeLng) }).toFixed(1))
        }

        let fee = 0
        let feeLabel: string | null = null
        let outOfRadius = false
        const maxDeliveryKm = getEffectiveMaxDeliveryKm(settings)
        const effectiveRadiusLimit = (maxDeliveryKm != null && maxDeliveryKm > 0)
            ? maxDeliveryKm
            : MAX_LOCAL_DELIVERY_FALLBACK_KM

        // Se a loja não tem coordenadas salvas no parceiro, chamamos quoteDeliveryFeeAction que resolve no banco
        if (distanceKm == null && (partner.partner_id || partner.partnerId)) {
            try {
                const quoteRes = await quoteDeliveryFeeAction({
                    partnerId: partner.partner_id || partner.partnerId,
                    storeId: partner.id,
                    destinationAddress: label,
                    destinationCoords: destCoords,
                })
                if (quoteRes?.success) {
                    distanceKm = quoteRes.distanceKm != null ? Number(quoteRes.distanceKm.toFixed(1)) : null
                    fee = Number(quoteRes.fee || 0)
                    feeLabel = fee === 0 ? "Grátis" : formatCurrency(fee)
                    const serverMaxKm = (quoteRes.maxDeliveryKm != null && quoteRes.maxDeliveryKm > 0)
                        ? quoteRes.maxDeliveryKm
                        : effectiveRadiusLimit
                    if (distanceKm != null && distanceKm > serverMaxKm) {
                        outOfRadius = true
                    }
                } else if (quoteRes && (quoteRes as any).isOutsideRadius) {
                    distanceKm = (quoteRes as any).distanceKm != null ? Number((quoteRes as any).distanceKm.toFixed(1)) : null
                    outOfRadius = true
                }
            } catch { }
        }

        if (distanceKm != null) {
            if (distanceKm > effectiveRadiusLimit) {
                outOfRadius = true
            }
            if (!outOfRadius && !feeLabel) {
                feeLabel = estimateDeliveryFeeLabel({
                    distanceKm,
                    baseFee: settings?.base_fee ?? settings?.baseFee,
                    includedKm: settings?.included_km ?? settings?.includedKm,
                    extraKmPrice: settings?.extra_km_price ?? settings?.extraKmPrice,
                    maxDeliveryKm,
                    isDeliveryEnabled,
                    deliveryPayer: settings?.delivery_payer ?? settings?.deliveryPayer,
                })
            }
        }

        let deliveryTime: string | null = null
        if (!outOfRadius && isDeliveryEnabled) {
            if (distanceKm != null) {
                const rawRange = estimateDeliveryTimeRange(Math.max(0.1, distanceKm))
                deliveryTime = rawRange ? rawRange.replace("-", " a ") : estimateAverageDeliveryTime(Math.max(0.1, distanceKm))
            } else if (partner?.delivery_time_formatted) {
                deliveryTime = formatAverageDeliveryTimeFromRange(partner.delivery_time_formatted)?.replace("-", " a ") || null
            }
        }

        const isFree = !outOfRadius && (feeLabel ? /gr[áa]tis/i.test(feeLabel) : (settings?.delivery_payer === "seller"))

        setCalcResult({
            distanceKm,
            deliveryTime: outOfRadius ? null : (deliveryTime || null),
            feeLabel: outOfRadius
                ? "A combinar"
                : (feeLabel || (isDeliveryEnabled ? "A combinar" : "Apenas retirada")),
            isFree,
            outOfRadius,
            addressLabel: label,
            lat: destCoords?.lat ?? null,
            lng: destCoords?.lng ?? null,
            cep: cep || null,
            addressId: addressId || null,
            addressData: addressData || null,
        })
    }

    const handleCalculateByCep = async (cepInput?: string) => {
        const targetCep = (cepInput || calcCep).replace(/\D/g, "")
        if (targetCep.length !== 8) {
            setCalcError("Digite um CEP válido com 8 dígitos.")
            return
        }
        setCalcLoading(true)
        setCalcError(null)
        setCalcResult(null)
        try {
            const res = await fetch(`/api/cep?cep=${targetCep}`)
            if (!res.ok) {
                throw new Error("CEP não encontrado")
            }
            const data = await res.json()
            if (data.error) {
                throw new Error(data.error)
            }
            const destCoords = data.latitude && data.longitude ? { lat: Number(data.latitude), lng: Number(data.longitude) } : null
            const labelParts = [data.logradouro, data.bairro, `${data.localidade || ""}/${data.uf || ""}`].filter(Boolean)
            const addressLabel = labelParts.length > 0 ? labelParts.join(", ") : `CEP ${formatCepMask(targetCep)}`

            await processCoordsCalculation(destCoords, addressLabel, targetCep)
        } catch (err: any) {
            setCalcError(err?.message || "Erro ao consultar CEP. Verifique o número e tente novamente.")
        } finally {
            setCalcLoading(false)
        }
    }

    const handleUseGps = () => {
        if (typeof window === "undefined" || !navigator.geolocation) {
            setCalcError("Geolocalização não suportada no seu navegador. Digite seu CEP acima.")
            return
        }
        setCalcLoading(true)
        setGpsLoading(true)
        setCalcError(null)
        setCalcResult(null)

        const onSuccess = async (pos: GeolocationPosition) => {
            try {
                const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                const label = await reverseGeocodeLabel(coords.lat, coords.lng)
                await processCoordsCalculation(coords, label)
            } catch {
                setCalcError("Erro ao calcular entrega para sua localização.")
            } finally {
                setCalcLoading(false)
                setGpsLoading(false)
            }
        }

        const onError = (err: GeolocationPositionError) => {
            setCalcLoading(false)
            setGpsLoading(false)
            if (err.code === err.PERMISSION_DENIED) {
                setCalcError("Permissão de localização negada. Ative nas configurações do navegador ou digite seu CEP.")
            } else if (err.code === err.TIMEOUT) {
                setCalcError("Tempo esgotado ao obter sua localização. Tente novamente ou digite seu CEP.")
            } else {
                setCalcError("Não foi possível obter sua localização. Verifique o serviço de localização ou digite seu CEP.")
            }
        }

        navigator.geolocation.getCurrentPosition(
            onSuccess,
            onError,
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        )
    }

    const handleSelectSavedAddress = async (addr: any) => {
        setCalcLoading(true)
        setCalcError(null)
        setCalcResult(null)
        try {
            const label = [addr.street ? `${addr.street}${addr.number ? `, ${addr.number}` : ""}` : "", addr.neighborhood, `${addr.city}/${addr.state}`].filter(Boolean).join(" - ")
            let coords: { lat: number; lng: number } | null = null
            if (addr.latitude != null && addr.longitude != null && !isNaN(Number(addr.latitude)) && !isNaN(Number(addr.longitude)) && (Number(addr.latitude) !== 0 || Number(addr.longitude) !== 0)) {
                coords = { lat: Number(addr.latitude), lng: Number(addr.longitude) }
            } else if (addr.zip_code) {
                const res = await fetch(`/api/cep?cep=${addr.zip_code.replace(/\D/g, "")}`)
                if (res.ok) {
                    const data = await res.json()
                    if (data.latitude && data.longitude) {
                        coords = { lat: Number(data.latitude), lng: Number(data.longitude) }
                    }
                }
            }
            await processCoordsCalculation(coords, label || "Endereço cadastrado", addr.zip_code, addr.id, addr)
        } catch {
            setCalcError("Erro ao calcular para este endereço.")
        } finally {
            setCalcLoading(false)
        }
    }

    const handleConfirm = () => {
        if (!calcResult) return
        onApplyLocation({
            lat: calcResult.lat,
            lng: calcResult.lng,
            label: calcResult.addressLabel,
            cep: calcResult.cep || null,
            addressId: calcResult.addressId || null,
            addressData: calcResult.addressData || null,
        })
        onClose()
    }

    return (
        <DefaultModal isOpen={isOpen} onClose={onClose} title="Calcular Entrega" maxWidth="md">
            <div className="flex flex-col pb-2 space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-brand-border/60 dark:border-dark-border/60">
                    <div className="w-8 h-8 rounded-full bg-brand-green/10 flex items-center justify-center text-brand-green shrink-0">
                        <MotorbikeIcon size={16} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading truncate">
                            {partner?.storeName || "Loja"}
                        </p>
                        {partner?.city && (
                            <p className="text-[12px] text-brand-inactive-text dark:text-dark-body truncate">
                                {partner.city}{partner.state ? `, ${partner.state}` : ""}
                            </p>
                        )}
                    </div>
                </div>

                {/* Input de CEP */}
                <div>
                    <label className="block text-[12px] font-semibold text-brand-dark dark:text-dark-heading mb-1.5">
                        Digite seu CEP
                    </label>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <CepInput
                                label=""
                                value={calcCep}
                                onChange={(val) => {
                                    const masked = formatCepMask(val)
                                    setCalcCep(masked)
                                    if (masked.replace(/\D/g, "").length === 8) {
                                        void handleCalculateByCep(masked)
                                    }
                                }}
                                disabled={calcLoading}
                            />
                        </div>
                        <Button
                            onClick={() => handleCalculateByCep()}
                            disabled={calcLoading || calcCep.replace(/\D/g, "").length !== 8}
                            className="w-[42px] h-[42px]"
                        >
                            {calcLoading && !gpsLoading ? <Spinner /> : <SearchIcon />}
                        </Button>
                    </div>
                </div>

                {/* Opção GPS */}
                <div className="flex items-center justify-between pt-1">
                    <button
                        type="button"
                        onClick={handleUseGps}
                        disabled={calcLoading}
                        className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-green hover:underline active:opacity-75 disabled:opacity-60 transition-opacity"
                    >
                        {gpsLoading ? (
                            <>
                                <Spinner size={14} /> Obtendo localização...
                            </>
                        ) : (
                            <>
                                <MapPinIcon size={14} /> Usar minha localização atual
                            </>
                        )}
                    </button>
                    <a
                        href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-brand-inactive-text dark:text-dark-body hover:underline"
                    >
                        Não sei meu CEP
                    </a>
                </div>

                {calcError && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-[12px] text-brand-red">
                        {calcError}
                    </div>
                )}

                {/* Endereços Salvos */}
                {loadingSavedAddresses && savedAddresses.length === 0 && (
                    <div className="pt-2 border-t border-brand-border/40 dark:border-dark-border/40 flex items-center gap-2 text-[12px] text-brand-inactive-text dark:text-dark-body">
                        <Spinner size={14} /> Carregando seus endereços...
                    </div>
                )}
                {savedAddresses.length > 0 && (
                    <div className="pt-2 border-t border-brand-border/40 dark:border-dark-border/40">
                        <p className="text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-2">
                            Seus Endereços Salvos
                        </p>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {savedAddresses.map((addr) => (
                                <button
                                    key={addr.id}
                                    type="button"
                                    onClick={() => handleSelectSavedAddress(addr)}
                                    disabled={calcLoading}
                                    className="w-full flex items-center justify-between p-2.5 rounded-xl border border-brand-border/70 dark:border-dark-border hover:border-brand-green bg-white dark:bg-dark-surface text-left transition-colors active:scale-[0.99]"
                                >
                                    <div className="min-w-0 pr-2">
                                        <p className="text-[12px] font-semibold text-brand-dark dark:text-dark-heading truncate">
                                            {addr.street ? `${addr.street}${addr.number ? `, ${addr.number}` : ""}` : addr.label || "Endereço"}
                                        </p>
                                        <p className="text-[11px] text-brand-inactive-text dark:text-dark-body truncate">
                                            {[addr.neighborhood, `${addr.city}/${addr.state}`].filter(Boolean).join(" - ")}
                                        </p>
                                    </div>
                                    <span className="text-[11px] font-semibold text-brand-green shrink-0">
                                        Selecionar
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Resultado do Cálculo */}
                {calcResult && (
                    <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-dark-surface/80 border border-brand-border/80 dark:border-dark-border space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-brand-border/60 dark:border-dark-border/60">
                            <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">Destino:</span>
                            <span className="text-[12px] font-semibold text-brand-dark dark:text-dark-heading text-right truncate max-w-[220px]">
                                {calcResult.addressLabel}
                            </span>
                        </div>

                        {calcResult.outOfRadius && (
                            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
                                Este vendedor não realiza entrega local para o endereço selecionado. Combine a entrega diretamente com a loja.
                            </div>
                        )}

                        {/* Cards de Entrega e Tempo Estimado */}
                        <div className="border border-brand-border dark:border-dark-border rounded-lg p-3">
                            <div className="grid grid-cols-2 divide-x divide-brand-border dark:divide-dark-border">
                                {/* Entrega */}
                                <div className="flex flex-col items-center justify-center text-center px-1 py-0.5 min-w-0">
                                    <div className="flex items-center justify-center gap-1 min-w-0 max-w-full">
                                        {!calcResult.outOfRadius && calcResult.distanceKm != null ? (
                                            <MotorbikeIcon
                                                size={15}
                                                className={
                                                    calcResult.isFree
                                                        ? "text-brand-green shrink-0"
                                                        : "text-brand-dark dark:text-dark-heading shrink-0"
                                                }
                                            />
                                        ) : null}
                                        <span className={`font-bold text-[13px] sm:text-[14px] truncate leading-tight ${calcResult.outOfRadius || calcResult.distanceKm == null
                                            ? "text-brand-dark dark:text-dark-heading"
                                            : calcResult.isFree
                                                ? "text-brand-green"
                                                : "text-brand-dark dark:text-dark-heading"
                                            }`}>
                                            {!calcResult.outOfRadius && calcResult.distanceKm != null
                                                ? (calcResult.feeLabel || "A combinar")
                                                : "A combinar"}
                                        </span>
                                    </div>
                                    <span className="text-[11px] sm:text-[12px] text-brand-inactive-text dark:text-dark-body flex items-center justify-center gap-0.5 mt-0.5">
                                        Entrega
                                    </span>
                                </div>

                                {/* Tempo est. */}
                                <div className="flex flex-col items-center justify-center text-center px-1 py-0.5 min-w-0">
                                    <div className="flex items-center justify-center gap-1 min-w-0 max-w-full">
                                        {!calcResult.outOfRadius && calcResult.distanceKm != null && calcResult.deliveryTime ? (
                                            <>
                                                <EnergyIcon size={13} className="text-brand-green shrink-0" />
                                                <span className="font-bold text-[13px] sm:text-[14px] text-brand-dark dark:text-dark-heading truncate leading-tight">
                                                    {calcResult.deliveryTime}
                                                </span>
                                            </>
                                        ) : (
                                            <span className="font-bold text-[13px] sm:text-[14px] text-brand-dark dark:text-dark-heading truncate leading-tight">
                                                A combinar
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] sm:text-[12px] text-brand-inactive-text dark:text-dark-body flex items-center justify-center gap-0.5 mt-0.5">
                                        Tempo est.
                                    </span>
                                </div>
                            </div>
                        </div>

                        <Button
                            onClick={handleConfirm}
                            className="w-full mt-2 font-semibold"
                        >
                            Usar este endereço
                        </Button>
                    </div>
                )}
            </div>
        </DefaultModal>
    )
}

export function VendorPageClient({ partner, products, services, plans = [], reviews, stats, ratingDistribution, productCategories, serviceCategories, coupons = [], initialPromotions = [], userProfile, cartCount, isShowcaseActive: propIsShowcaseActive, initialCategory }: VendorPageClientProps) {
    const isShowcaseActive = propIsShowcaseActive !== undefined
        ? propIsShowcaseActive
        : (partner?.isShowcaseActive ?? partner?.is_showcase_active ?? true)
    const openStatus = useMemo(() => {
        return getOpenNowStatus(partner?.openingHours, undefined, partner?.timezone || "America/Sao_Paulo")
    }, [partner?.openingHours, partner?.timezone])

    const { user } = useSupabase()

    // Delivery calculation states
    const [isDeliveryCalculatorOpen, setIsDeliveryCalculatorOpen] = useState(false)
    const [sessionOverrideCoords, setSessionOverrideCoords] = useState<{ lat: number; lng: number } | null>(null)
    const [sessionOverrideLabel, setSessionOverrideLabel] = useState<string | null>(null)
    const [guestSavedCoords, setGuestSavedCoords] = useState<{ lat: number; lng: number } | null>(null)
    const [guestSavedLabel, setGuestSavedLabel] = useState<string | null>(null)
    const [userAddressCoords, setUserAddressCoords] = useState<{ lat: number; lng: number } | null>(null)
    const [userAddressLabel, setUserAddressLabel] = useState<string | null>(null)
    const [serverDelivery, setServerDelivery] = useState<{
        distanceKm: number | null
        feeLabel: string | null
        isFreeDelivery: boolean
        outOfRadius: boolean
    } | null>(null)

    const currentUserId = user?.id || userProfile?.userId || userProfile?.user_id || null

    // Recupera cálculo persistido anteriormente em localStorage apenas como fallback para visitantes (sem sobrescrever o endereço ativo/padrão do usuário logado)
    useEffect(() => {
        try {
            const saved = localStorage.getItem("dudit_vendor_delivery_calc")
            if (saved) {
                const parsed = JSON.parse(saved)
                if (
                    parsed &&
                    typeof parsed.lat === "number" &&
                    typeof parsed.lng === "number" &&
                    Number.isFinite(parsed.lat) &&
                    Number.isFinite(parsed.lng) &&
                    (parsed.lat !== 0 || parsed.lng !== 0)
                ) {
                    setGuestSavedCoords({ lat: parsed.lat, lng: parsed.lng })
                    if (parsed.label) setGuestSavedLabel(parsed.label)
                }
            }
        } catch { }
    }, [])

    // Busca endereço ativo/padrão do usuário e resolve coordenadas automaticamente ao entrar na página
    const loadUserActiveAddress = useCallback(async () => {
        if (!currentUserId) return

        try {
            const res = await getAddressesAction(currentUserId, "user")
            if (!res?.addresses || res.addresses.length === 0) return

            const list = res.addresses as any[]
            const storedActiveId = typeof window !== "undefined"
                ? localStorage.getItem(DUDIT_ACTIVE_ADDRESS_STORAGE_KEY)
                : null

            const activeAddr = (storedActiveId && list.find((a: any) => a.id === storedActiveId))
                || list.find((a: any) => a.is_default)
                || list[0]

            if (!activeAddr) return

            const labelParts = [
                activeAddr.street ? `${activeAddr.street}${activeAddr.number ? `, ${activeAddr.number}` : ""}` : "",
                activeAddr.neighborhood,
                `${activeAddr.city}/${activeAddr.state}`
            ].filter(Boolean)
            const label = labelParts.length > 0 ? labelParts.join(" - ") : (activeAddr.label || "Endereço cadastrado")

            if (
                activeAddr.latitude != null &&
                activeAddr.longitude != null &&
                !isNaN(Number(activeAddr.latitude)) &&
                !isNaN(Number(activeAddr.longitude)) &&
                (Number(activeAddr.latitude) !== 0 || Number(activeAddr.longitude) !== 0)
            ) {
                setUserAddressCoords({ lat: Number(activeAddr.latitude), lng: Number(activeAddr.longitude) })
                setUserAddressLabel(label)
            } else if (activeAddr.zip_code) {
                const cleanCep = activeAddr.zip_code.replace(/\D/g, "")
                if (cleanCep.length === 8) {
                    try {
                        const cepRes = await fetch(`/api/cep?cep=${cleanCep}`)
                        if (cepRes.ok) {
                            const cepData = await cepRes.json()
                            if (cepData.latitude && cepData.longitude) {
                                setUserAddressCoords({ lat: Number(cepData.latitude), lng: Number(cepData.longitude) })
                                setUserAddressLabel(label)
                            }
                        }
                    } catch { }
                }
            }
        } catch { }
    }, [currentUserId])

    useEffect(() => {
        void loadUserActiveAddress()
    }, [loadUserActiveAddress])

    // Sincroniza se o endereço mudar em outra parte da aplicação (header, modal, etc.)
    useAddressSync(useCallback(() => {
        setSessionOverrideCoords(null)
        setSessionOverrideLabel(null)
        void loadUserActiveAddress()
    }, [loadUserActiveAddress]))

    const userCoords = useMemo(() => {
        if (userAddressCoords) return userAddressCoords
        const lat = Number(userProfile?.latitude)
        const lng = Number(userProfile?.longitude)
        if (userProfile?.latitude != null && userProfile?.longitude != null && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
            return { lat, lng }
        }
        return null
    }, [userAddressCoords, userProfile?.latitude, userProfile?.longitude])

    const effectiveCoords = useMemo(() => {
        return sessionOverrideCoords || userCoords || guestSavedCoords
    }, [sessionOverrideCoords, userCoords, guestSavedCoords])

    const effectiveAddressLabel = useMemo(() => {
        if (sessionOverrideCoords) return sessionOverrideLabel || "Endereço selecionado"
        if (userCoords) return userAddressLabel || userProfile?.address || null
        return guestSavedLabel || userAddressLabel || userProfile?.address || null
    }, [sessionOverrideCoords, sessionOverrideLabel, userCoords, userAddressLabel, userProfile?.address, guestSavedLabel])

    // Resolve cálculo no servidor se a loja não tiver latitude/longitude direta
    useEffect(() => {
        if (!effectiveCoords) {
            setServerDelivery(null)
            return
        }
        const storeLat = partner?.lat ?? partner?.latitude ?? null
        const storeLng = partner?.lng ?? partner?.longitude ?? null

        if (storeLat == null || storeLng == null || isNaN(Number(storeLat)) || isNaN(Number(storeLng))) {
            const partnerId = partner?.partner_id || partner?.partnerId || partner?.id
            if (!partnerId) return

            let active = true
            void quoteDeliveryFeeAction({
                partnerId,
                storeId: partner?.id,
                destinationAddress: effectiveAddressLabel || "",
                destinationCoords: effectiveCoords,
            }).then((quoteRes: any) => {
                if (active && quoteRes?.success) {
                    const dist = quoteRes.distanceKm != null ? Number(quoteRes.distanceKm.toFixed(1)) : null
                    const fee = Number(quoteRes.fee || 0)
                    const serverMaxKm = (quoteRes.maxDeliveryKm != null && quoteRes.maxDeliveryKm > 0)
                        ? quoteRes.maxDeliveryKm
                        : MAX_LOCAL_DELIVERY_FALLBACK_KM
                    const isOutside = Boolean(quoteRes.isOutsideRadius || (dist != null && dist > serverMaxKm))
                    setServerDelivery({
                        distanceKm: dist,
                        feeLabel: isOutside ? null : (fee === 0 ? "Grátis" : formatCurrency(fee)),
                        isFreeDelivery: !isOutside && fee === 0,
                        outOfRadius: isOutside,
                    })
                } else if (active && quoteRes?.isOutsideRadius) {
                    const dist = quoteRes.distanceKm != null ? Number(quoteRes.distanceKm.toFixed(1)) : null
                    setServerDelivery({
                        distanceKm: dist,
                        feeLabel: null,
                        isFreeDelivery: false,
                        outOfRadius: true,
                    })
                }
            }).catch(() => { })

            return () => { active = false }
        } else {
            setServerDelivery(null)
        }
    }, [effectiveCoords, effectiveAddressLabel, partner?.lat, partner?.latitude, partner?.lng, partner?.longitude, partner?.partner_id, partner?.partnerId, partner?.id])

    const deliveryInfo = useMemo(() => {
        const rawSettings = partner?.delivery_settings || null
        const settings = Array.isArray(rawSettings) ? rawSettings[0] : rawSettings
        const isDeliveryEnabled = settings?.is_delivery_enabled !== false && settings?.isDeliveryEnabled !== false
        const sellsProducts = partner?.offeringType ? partner.offeringType !== "services" : (products?.length > 0)

        const storeLat = partner?.lat ?? partner?.latitude ?? null
        const storeLng = partner?.lng ?? partner?.longitude ?? null
        let distanceKm: number | null = null
        if (effectiveCoords && storeLat != null && storeLng != null && !isNaN(Number(storeLat)) && !isNaN(Number(storeLng))) {
            distanceKm = Number(calculateDistance(effectiveCoords, { lat: Number(storeLat), lng: Number(storeLng) }).toFixed(1))
        } else if (serverDelivery?.distanceKm != null) {
            distanceKm = serverDelivery.distanceKm
        }

        const maxDeliveryKm = getEffectiveMaxDeliveryKm(settings)
        const effectiveRadiusLimit = (maxDeliveryKm != null && maxDeliveryKm > 0)
            ? maxDeliveryKm
            : MAX_LOCAL_DELIVERY_FALLBACK_KM
        const outOfRadius = isDeliveryEnabled
            && (
                serverDelivery?.outOfRadius ??
                (distanceKm != null && distanceKm > effectiveRadiusLimit)
            )

        // Formata o tempo estimado como faixa "20 a 30 min" somente quando está dentro da área de entrega
        let deliveryTimeRange: string | null = null
        if (distanceKm != null && !outOfRadius && isDeliveryEnabled) {
            const rawRange = estimateDeliveryTimeRange(Math.max(0.1, distanceKm))
            if (rawRange) {
                deliveryTimeRange = rawRange.replace("-", " a ")
            }
        }

        const fallbackDeliveryTime = (outOfRadius || !isDeliveryEnabled) ? null
            : (distanceKm != null
                ? estimateAverageDeliveryTime(Math.max(0.1, distanceKm))
                : (partner?.delivery_time_formatted ? formatAverageDeliveryTimeFromRange(partner.delivery_time_formatted)?.replace("-", " a ") || null : null))

        const deliveryTime = deliveryTimeRange || fallbackDeliveryTime

        const baseFee = Number(settings?.base_fee ?? settings?.baseFee ?? 0)
        let feeLabel = serverDelivery?.feeLabel || null
        if (!feeLabel && !outOfRadius) {
            feeLabel = estimateDeliveryFeeLabel({
                distanceKm,
                baseFee: settings?.base_fee ?? settings?.baseFee,
                includedKm: settings?.included_km ?? settings?.includedKm,
                extraKmPrice: settings?.extra_km_price ?? settings?.extraKmPrice,
                maxDeliveryKm,
                isDeliveryEnabled,
                deliveryPayer: settings?.delivery_payer ?? settings?.deliveryPayer,
            })
        }

        const isFreeDelivery = !outOfRadius && (serverDelivery?.isFreeDelivery ?? (feeLabel ? /gr[áa]tis/i.test(feeLabel) : (settings?.delivery_payer === "seller")))

        return {
            isDeliveryEnabled,
            sellsProducts,
            outOfRadius,
            distanceKm,
            deliveryTime,
            feeLabel,
            baseFee,
            isFreeDelivery,
            maxDeliveryKm,
            settings,
        }
    }, [partner?.delivery_settings, partner?.lat, partner?.latitude, partner?.lng, partner?.longitude, partner?.offeringType, partner?.delivery_time_formatted, products, effectiveCoords, serverDelivery])

    const hasDeliveryCalculation = Boolean(
        effectiveCoords &&
        deliveryInfo.distanceKm != null &&
        !deliveryInfo.outOfRadius &&
        deliveryInfo.isDeliveryEnabled !== false &&
        deliveryInfo.sellsProducts !== false
    )

    const deliveryNode = useMemo<ReactNode | null>(() => {
        if (!deliveryInfo.isDeliveryEnabled || !deliveryInfo.sellsProducts) {
            return <span className="font-medium text-brand-dark dark:text-dark-heading">Retirada no local</span>
        }

        const { outOfRadius, deliveryTime, feeLabel } = deliveryInfo

        if (outOfRadius || (!deliveryTime && !feeLabel)) {
            return (
                <button
                    type="button"
                    onClick={() => setIsDeliveryCalculatorOpen(true)}
                    className="inline-flex items-center gap-1 font-medium text-brand-dark dark:text-dark-heading hover:text-brand-green transition-colors cursor-pointer"
                    title="Calcular entrega"
                >
                    <span>Entrega • A combinar</span>
                    <ChevronRightIcon size={13} className="text-brand-inactive-text dark:text-dark-body shrink-0" />
                </button>
            )
        }

        const isFreeDelivery = feeLabel ? /gr[áa]tis/i.test(feeLabel) : false
        const mainLabel = ["Entrega", deliveryTime].filter(Boolean).join(" • ")

        return (
            <button
                type="button"
                onClick={() => setIsDeliveryCalculatorOpen(true)}
                className="inline-flex flex-wrap items-center gap-x-1.5 hover:opacity-80 transition-opacity cursor-pointer"
                title="Calcular entrega"
            >
                <span className="font-medium text-brand-dark dark:text-dark-heading">{mainLabel}</span>
                {feeLabel && (
                    <>
                        <span aria-hidden className="text-brand-inactive-text dark:text-dark-body">•</span>
                        <span className={`font-semibold ${isFreeDelivery ? "text-brand-green" : "text-brand-dark dark:text-dark-heading"}`}>{feeLabel}</span>
                    </>
                )}
                <ChevronRightIcon size={13} className="text-brand-inactive-text dark:text-dark-body shrink-0" />
            </button>
        )
    }, [deliveryInfo])

    const hasStatusLine = !!openStatus || !!deliveryNode
    const calculatedReviewsCount = reviews?.length || 0
    const calculatedAverageRating = useMemo(() => {
        if (calculatedReviewsCount === 0) return 0
        const sum = reviews.reduce((acc: number, r: any) => acc + (r.rating || 0), 0)
        return sum / calculatedReviewsCount
    }, [reviews, calculatedReviewsCount])

    const hasEnoughReviews = calculatedReviewsCount >= 3
    const displayRating = hasEnoughReviews ? calculatedAverageRating : 0
    const displayReviewsCount = hasEnoughReviews ? calculatedReviewsCount : 0

    const pathname = usePathname()
    const [activeTag, setActiveTag] = useState("todos")
    // Ref para ler o estado atual do tab ativo fora de callbacks (evita loops de scroll)
    const activeTagRef = useRef(activeTag)
    const [activeSection, setActiveSection] = useState<"products" | "reviews" | "info" | "gallery">("products")
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
    const [activeContext, setActiveContext] = useState<"Produtos" | "Servicos" | "Planos">("Produtos")

    // Tipo de catálogo na URL (?contexto=produtos|servicos|planos)
    const contextParam: VendorContext = activeContext === "Servicos" ? "servicos" : activeContext === "Planos" ? "planos" : "produtos"
    const [categoryView, setCategoryView] = useState<string | null>(() => {
        if (initialCategory) return initialCategory
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search)
            return params.get("categoria")
        }
        return null
    })
    const categoryViewRef = useRef<string | null>(categoryView)
    categoryViewRef.current = categoryView
    activeTagRef.current = activeTag
    const [isContextModalOpen, setIsContextModalOpen] = useState(false)
    const [mobileModalTab, setMobileModalTab] = useState<"reviews" | "info" | "gallery">("reviews")
    const [isAboutPageOpen, setIsAboutPageOpen] = useState(false)
    const [infoHasBeenOpened, setInfoHasBeenOpened] = useState(false)
    const [reviewsHasBeenOpened, setReviewsHasBeenOpened] = useState(false)
    const [galleryHasBeenOpened, setGalleryHasBeenOpened] = useState(false)

    useEffect(() => {
        if (activeSection === "info" || (isAboutPageOpen && mobileModalTab === "info")) {
            setInfoHasBeenOpened(true)
        }
        if (activeSection === "reviews" || (isAboutPageOpen && mobileModalTab === "reviews")) {
            setReviewsHasBeenOpened(true)
        }
        if (activeSection === "gallery" || (isAboutPageOpen && mobileModalTab === "gallery")) {
            setGalleryHasBeenOpened(true)
        }
    }, [activeSection, mobileModalTab, isAboutPageOpen])

    const gallery: string[] = useMemo(() => partner?.gallery || [], [partner?.gallery])
    const [searchValue, setSearchValue] = useState("")
    const [categorySearchValue, setCategorySearchValue] = useState("")
    const [isCategorySearchOpen, setIsCategorySearchOpen] = useState(false)
    const [categorySortBy, setCategorySortBy] = useState<SortOption>("relevancia")
    const [categoryMinPrice, setCategoryMinPrice] = useState("")
    const [categoryMaxPrice, setCategoryMaxPrice] = useState("")
    const [categoryPromoOn, setCategoryPromoOn] = useState(false)
    const [categorySelectedBrands, setCategorySelectedBrands] = useState<string[]>([])
    const [categoryCondition, setCategoryCondition] = useState("")
    const [categoryMinRating, setCategoryMinRating] = useState<number | null>(null)
    const [isCategoryFiltersOpen, setIsCategoryFiltersOpen] = useState(false)
    const [isCategorySortOpen, setIsCategorySortOpen] = useState(false)
    const [showShareModal, setShowShareModal] = useState(false)
    const [showReportModal, setShowReportModal] = useState(false)
    const [selectedCoupon, setSelectedCoupon] = useState<any>(null)
    const [isMounted, setIsMounted] = useState(false)
    const [isStickyVisible, setIsStickyVisible] = useState(false)
    const [mobileTabsScrolledOut, setMobileTabsScrolledOut] = useState(false)
    const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false)
    const [canScrollTabsRight, setCanScrollTabsRight] = useState(false)
    const [pendingScrollId, setPendingScrollId] = useState<string | null>(null)
    const tabsScrollRef = useRef<HTMLDivElement>(null)
    const mobileTabsRef = useRef<HTMLDivElement>(null)
    const topRef = useRef<HTMLDivElement>(null)
    const isStoreOwner = Boolean(user?.id && ((partner?.userId && user.id === partner.userId) || (partner?.user_id && user.id === partner.user_id)))

    const displayProducts = useMemo(() => {
        if (!isMounted) return products || []
        return applyVendorUrgencyBadges(products, user?.id ?? null)
    }, [products, user?.id, isMounted])

    const [partnerPromotions, setPartnerPromotions] = useState<any[]>(initialPromotions || [])

    useEffect(() => {
        setIsMounted(true)
        const targetPartnerId = partner?.partner_id || partner?.partnerId || partner?.id
        const targetStoreId = partner?.id || null
        if (targetPartnerId) {
            listActivePromotionsForMarketplaceAction(targetPartnerId, null, targetStoreId)
                .then(res => setPartnerPromotions(Array.isArray(res) ? res : []))
                .catch(() => { })
        }
    }, [partner?.id, partner?.partner_id, partner?.partnerId])

    const campaignSections = useMemo(() => {
        if (!partnerPromotions || partnerPromotions.length === 0) return []

        return partnerPromotions.map(promo => {
            const promoItems: any[] = []

            if (displayProducts) {
                displayProducts.forEach(p => {
                    if (isItemInPromotion(p, promo, "produto")) {
                        promoItems.push({ ...p, _itemType: "produto" })
                    }
                })
            }

            if (services) {
                services.forEach(s => {
                    if (isItemInPromotion(s, promo, "servico")) {
                        promoItems.push({ ...s, _itemType: "servico" })
                    }
                })
            }

            return {
                promotion: promo,
                items: promoItems
            }
        }).filter(sec => sec.items.length > 0)
    }, [partnerPromotions, displayProducts, services])

    const bestCampaignSection = useMemo(
        () => pickBestSection(campaignSections, partner?.id || "dudit"),
        [campaignSections, partner?.id]
    )

    const partnerRawImage = partner.storeImageUrl || null
    const partnerProfileImageUrl = getImageUrl(partnerRawImage)
    const bannerImage = useMemo(() => {
        if (partner.banner_url) return getImageUrl(partner.banner_url)
        return partnerRawImage ? getDefaultBannerSeeded(partner?.id || partner.storeName || "Vendedor") : getBannerUrlByColor(getAvatarColor(partner.storeName || "Vendedor"))
    }, [partner.banner_url, partnerRawImage, partner.storeName])

    const hasPlans = plans && plans.length > 0

    /**
     * Normaliza um item da vitrine para o mesmo formato dos cards e dos
     * filtros da Explorar (itemType, price, originalPrice, partners...).
     * Assim os filtros funcionam igual nas duas páginas.
     */
    const normalizeVendorItem = useCallback((item: any) => {
        const rawType = item?.itemType || item?._itemType
        const itemType = rawType || (activeContext === "Servicos" ? "servico" : activeContext === "Planos" ? "plano" : "produto")
        return normalizeItemForCard({ ...item, itemType }, partner, partnerPromotions)
    }, [activeContext, partner, partnerPromotions])

    const currentItems = activeContext === "Produtos" ? displayProducts : (activeContext === "Servicos" ? services : plans)

    const contextItems = useMemo(() => {
        return (currentItems || []).map(item => normalizeVendorItem(item))
    }, [currentItems, normalizeVendorItem])

    // Filtros (mesma lógica da página Explorar)
    const applyVendorFilters = useCallback((items: any[]) => {
        let filtered = items
        if (categoryPromoOn) filtered = filtered.filter(isPromoItem)
        if (categorySelectedBrands.length > 0) filtered = filtered.filter(item => matchesBrandFilter(item, categorySelectedBrands))
        if (categoryCondition) filtered = filtered.filter(item => matchesConditionFilter(item, categoryCondition))
        if (categoryMinRating) filtered = filtered.filter(item => matchesRatingFilter(item, categoryMinRating))
        const min = categoryMinPrice ? Number(String(categoryMinPrice).replace(",", ".")) : null
        const max = categoryMaxPrice ? Number(String(categoryMaxPrice).replace(",", ".")) : null
        if (min !== null || max !== null) {
            filtered = filtered.filter(item => matchesPriceRange(item, min, max))
        }
        return filtered
    }, [categoryPromoOn, categorySelectedBrands, categoryCondition, categoryMinRating, categoryMinPrice, categoryMaxPrice])

    const sortVendorItems = useCallback((items: any[]) => {
        const sorted = [...items]
        switch (categorySortBy) {
            case "preco_menor": sorted.sort((a, b) => (a.price || 0) - (b.price || 0)); break
            case "preco_maior": sorted.sort((a, b) => (b.price || 0) - (a.price || 0)); break
            case "recentes": sorted.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()); break
            case "avaliacao": sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break
            case "relevancia":
            default:
                return sortByVendorRelevance(sorted)
        }
        return sorted
    }, [categorySortBy])

    const filteredItems = useMemo(() => {
        const search = searchValue.trim().toLowerCase()
        const searched = contextItems.filter(item => !search || item.name?.toLowerCase().includes(search))
        return applyVendorFilters(searched)
    }, [contextItems, searchValue, applyVendorFilters])

    const groupedItems = useMemo(() => {
        const map = new Map<string, any[]>()
        filteredItems.forEach(item => {
            const name = normalizeCategory(item.category)
            map.set(name, [...(map.get(name) || []), item])
        })
        return Array.from(map.entries())
            .map(([name, items]) => ({
                name,
                id: categoryId(name),
                items: sortVendorItems(items),
            }))
            .sort((a, b) => {
                const topScoreA = a.items[0] ? calcVendorItemScore(a.items[0]) : 0
                const topScoreB = b.items[0] ? calcVendorItemScore(b.items[0]) : 0
                const diffScore = topScoreB - topScoreA
                if (Math.abs(diffScore) > 0.001) return diffScore
                return b.items.length - a.items.length
            })
    }, [filteredItems, sortVendorItems])

    const allTabs = useMemo(() => [
        { id: "todos", label: "Todos" },
        ...groupedItems.map(group => ({ id: group.id, label: group.name })),
    ], [groupedItems])

    const isCampaignView = categoryView?.startsWith("campaign-") || false
    const activeCampaignId = isCampaignView && categoryView ? categoryView.replace("campaign-", "") : null
    const activeCampaignPromo = useMemo(() => {
        return partnerPromotions?.find(p => p.id === activeCampaignId || p.campaignId === activeCampaignId)
    }, [partnerPromotions, activeCampaignId])

    const categoryName = useMemo(
        () => {
            if (!categoryView) return null
            if (isCampaignView) {
                return activeCampaignPromo?.name || "Oferta Especial"
            }
            return groupedItems.find(group => group.id === categoryView)?.name || categoryView
        },
        [categoryView, isCampaignView, activeCampaignPromo, groupedItems]
    )

    // ── Filtros na URL (link compartilhável + botão voltar) ─────────────────
    const vendorFilterState: ExploreFilterState = useMemo(() => ({
        categories: [],
        minPrice: categoryMinPrice,
        maxPrice: categoryMaxPrice,
        promoOn: categoryPromoOn,
        condition: categoryCondition,
        shipping: false,
        minRating: categoryMinRating,
        delivery: "",
        maxDistanceKm: null,
        showcaseOnly: false,
        brands: categorySelectedBrands,
    }), [categoryMinPrice, categoryMaxPrice, categoryPromoOn, categoryCondition, categoryMinRating, categorySelectedBrands])

    const applyFiltersFromUrl = useCallback((urlParams: URLSearchParams) => {
        const parsed = parseFiltersFromParams(urlParams)
        setCategoryMinPrice(parsed.minPrice === "" ? "" : String(parsed.minPrice))
        setCategoryMaxPrice(parsed.maxPrice === "" ? "" : String(parsed.maxPrice))
        setCategoryPromoOn(parsed.promoOn)
        setCategoryCondition(parsed.condition)
        setCategoryMinRating(parsed.minRating)
        setCategorySelectedBrands(parsed.brands || [])
        const ord = urlParams.get("ord") as SortOption | null
        setCategorySortBy(ord || "relevancia")

        // Tipo de catálogo (?contexto=)
        const ctx = urlParams.get("contexto")
        if (ctx === "servicos") setActiveContext("Servicos")
        else if (ctx === "planos") setActiveContext("Planos")
        else if (ctx === "produtos") setActiveContext("Produtos")
    }, [])

    // ── Instant 0ms popstate synchronization for browser Back / Forward ─────
    useEffect(() => {
        const handlePopState = () => {
            if (typeof window === "undefined") return
            const params = new URLSearchParams(window.location.search)
            const cat = params.get("categoria")
            categoryViewRef.current = cat
            setCategoryView(cat)
            setActiveTag(cat || "todos")
            applyFiltersFromUrl(params)
            if (cat) {
                setActiveSection("products")
                setTimeout(scrollToProducts, 0)
            }
        }
        window.addEventListener("popstate", handlePopState)
        return () => window.removeEventListener("popstate", handlePopState)
    }, [applyFiltersFromUrl])

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const category = initialCategory || params.get("categoria")
        if (category) {
            categoryViewRef.current = category
            setCategoryView(category)
            setActiveTag(category)
            setActiveSection("products")
            setTimeout(scrollToProducts, 0)
        }
        // Filtros que vieram na URL (link compartilhado)
        applyFiltersFromUrl(params)
    }, [initialCategory, applyFiltersFromUrl])

    useEffect(() => {
        let ticking = false
        const onScroll = () => {
            if (ticking) return
            window.requestAnimationFrame(() => {
                const bottom = topRef.current?.getBoundingClientRect().bottom ?? 0
                setIsStickyVisible(bottom < 0)
                const tabsTop = mobileTabsRef.current?.getBoundingClientRect().top ?? 999
                setMobileTabsScrolledOut(tabsTop <= 0)
                ticking = false
            })
            ticking = true
        }
        onScroll()
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [categoryView])

    useEffect(() => {
        if (categoryViewRef.current) return

        const sections = Array.from(
            document.querySelectorAll<HTMLElement>("[data-vendor-category-section]")
        )
        if (sections.length === 0) return

        const syncActiveCategoryTag = () => {
            if (categoryViewRef.current) return
            const probe = 150 // alinhado ao scroll-mt das seções
            const scrollY = window.scrollY || window.pageYOffset
            const atBottom =
                window.innerHeight + scrollY >=
                document.documentElement.scrollHeight - 2

            let next: HTMLElement | null = null
            for (const section of sections) {
                if (section.getBoundingClientRect().top <= probe) {
                    next = section
                } else {
                    break
                }
            }

            // Garante que a última seção fique ativa ao chegar no fim da página,
            // evitando o "salto" para a penúltima.
            if (!next && atBottom) {
                next = sections[sections.length - 1]
            }

            if (!next) return
            const id = next.getAttribute("data-vendor-category-section") || ""
            if (!id || activeTagRef.current === id) return

            activeTagRef.current = id
            setActiveTag(id)

                // Rola apenas a barra de abas horizontalmente, nunca a página.
                ; ([`vendor-tab-${id}`, `vendor-tab-${id}-sticky`] as const).forEach((tabId) => {
                    const tab = document.getElementById(tabId)
                    const container = tab?.closest<HTMLElement>("[data-vendor-tabs-scroll]")
                    if (!tab || !container) return
                    const containerRect = container.getBoundingClientRect()
                    const tabRect = tab.getBoundingClientRect()
                    const delta = (tabRect.left - containerRect.left) - (containerRect.width - tabRect.width) / 2
                    if (Math.abs(delta) > 8) {
                        container.scrollTo({ left: container.scrollLeft + delta, behavior: "smooth" })
                    }
                })
        }

        // Executa de imediato e a cada scroll/redimensionamento (com throttle via rAF).
        syncActiveCategoryTag()
        let ticking = false
        const onEvent = () => {
            if (ticking) return
            ticking = true
            window.requestAnimationFrame(() => {
                syncActiveCategoryTag()
                ticking = false
            })
        }
        window.addEventListener("scroll", onEvent, { passive: true })
        window.addEventListener("resize", onEvent)
        return () => {
            window.removeEventListener("scroll", onEvent)
            window.removeEventListener("resize", onEvent)
        }
    }, [groupedItems, categoryView, activeContext])

    const updateTabsScrollState = useCallback(() => {
        const node = tabsScrollRef.current
        if (!node) return
        setCanScrollTabsLeft(node.scrollLeft > 4)
        setCanScrollTabsRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 4)
    }, [])

    useEffect(() => {
        updateTabsScrollState()
        const node = tabsScrollRef.current
        node?.addEventListener("scroll", updateTabsScrollState, { passive: true })
        window.addEventListener("resize", updateTabsScrollState)
        return () => {
            node?.removeEventListener("scroll", updateTabsScrollState)
            window.removeEventListener("resize", updateTabsScrollState)
        }
    }, [updateTabsScrollState, allTabs.length])

    // Funnel event: one capture per storefront id.
    useEffect(() => {
        if (!partner?.id) return
        trackEvent("storefront_viewed", {
            partner_id: partner.partner_id || partner.id,
            store_id: partner.store_id || partner.id,
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [partner?.id])

    const handleWhatsApp = useCallback(() => openWhatsApp(partner.phone, partner.storeName), [partner.phone, partner.storeName])
    const updateCategoryUrl = useCallback((
        tag: string | null,
        push: boolean = true,
        overrides?: Partial<ExploreFilterState> & { sortBy?: SortOption; context?: VendorContext }
    ) => {
        if (typeof window === "undefined") return
        const params = new URLSearchParams(window.location.search)
        if (tag) params.set("categoria", tag)
        else params.delete("categoria")

        // Filtros ativos vão para a URL (link compartilhável + botão voltar)
        const filtersToPersist: ExploreFilterState = { ...vendorFilterState, ...(overrides ?? {}) }
        serializeFiltersToParams(filtersToPersist, params)
        const sortToPersist = overrides?.sortBy ?? categorySortBy
        if (sortToPersist && sortToPersist !== "relevancia") params.set("ord", sortToPersist)
        else params.delete("ord")

        // Tipo de catálogo (produtos/serviços/assinaturas)
        const contextToPersist = overrides?.context ?? contextParam
        if (contextToPersist && contextToPersist !== "produtos") params.set("contexto", contextToPersist)
        else params.delete("contexto")

        const query = params.toString()
        const targetUrl = query ? `${pathname}?${query}` : pathname
        const currentUrl = `${window.location.pathname}${window.location.search}`

        if (targetUrl === currentUrl) return

        if (push) {
            pushUrl(targetUrl)
        } else {
            replaceUrl(targetUrl)
        }
    }, [pathname, vendorFilterState, categorySortBy, contextParam])
    const scrollToProducts = () => document.getElementById("vendor-products")?.scrollIntoView({ behavior: "smooth", block: "start" })

    useEffect(() => {
        if (!categoryView && pendingScrollId) {
            if (pendingScrollId === "todos") {
                scrollToProducts()
            } else {
                const el = document.getElementById(pendingScrollId)
                if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "start" })
                }
            }
            setPendingScrollId(null)
        }
    }, [categoryView, pendingScrollId])

    const openCategory = useCallback((tag: string | null) => {
        setActiveSection("products")
        setCategorySearchValue("")
        setIsCategorySearchOpen(false)
        setActiveTag(tag || "todos")
        // Os filtros ativos são mantidos ao trocar de categoria (como na
        // Explorar) - o usuário vê o chip ativo e pode remover quando quiser.

        if (tag) {
            categoryViewRef.current = tag
            setCategoryView(tag)
            updateCategoryUrl(tag, true)
            setTimeout(scrollToProducts, 0)
        } else {
            // Fechando visualização de categoria
            categoryViewRef.current = null
            setCategoryView(null)
            if (typeof window !== "undefined") {
                updateCategoryUrl(null, false)
            }
        }
    }, [updateCategoryUrl])

    const selectTab = useCallback((tag: string) => {
        setActiveSection("products")
        if (categoryViewRef.current) {
            categoryViewRef.current = null
            setCategoryView(null)
            if (typeof window !== "undefined") {
                updateCategoryUrl(null, false)
            }
            setPendingScrollId(tag)
        } else {
            if (tag === "todos") {
                scrollToProducts()
            } else {
                const el = document.getElementById(tag)
                if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "start" })
                }
            }
        }
        setActiveTag(tag)
    }, [updateCategoryUrl])

    const categoryItems = useMemo(() => {
        if (!categoryView) return []
        const search = categorySearchValue.trim().toLowerCase()
        const matchesSearch = (item: any) => !search || item.name?.toLowerCase().includes(search)

        if (isCampaignView && activeCampaignPromo) {
            const promoItems: any[] = []
            if (displayProducts) {
                displayProducts.forEach(p => {
                    if (isItemInPromotion(p, activeCampaignPromo, "produto")) {
                        promoItems.push(normalizeVendorItem({ ...p, _itemType: "produto" }))
                    }
                })
            }
            if (services) {
                services.forEach(s => {
                    if (isItemInPromotion(s, activeCampaignPromo, "servico")) {
                        promoItems.push(normalizeVendorItem({ ...s, _itemType: "servico" }))
                    }
                })
            }
            return applyVendorFilters(promoItems).filter(matchesSearch)
        }

        // groupedItems já vem filtrado pelos filtros da página
        return (groupedItems.find(group => group.id === categoryView)?.items || []).filter(matchesSearch)
    }, [categoryView, isCampaignView, activeCampaignPromo, displayProducts, services, categorySearchValue, groupedItems, applyVendorFilters, normalizeVendorItem])

    const categoryAvailableBrands = useMemo(() => {
        const brands = new Set<string>()
        contextItems.forEach(item => { if (item.brand) brands.add(item.brand) })
        return Array.from(brands)
    }, [contextItems])

    const categoryActiveFiltersCount = useMemo(() => {
        let count = 0
        if (categorySortBy !== "relevancia") count++
        if (categoryMinPrice || categoryMaxPrice) count++
        if (categoryPromoOn) count++
        if (categorySelectedBrands.length > 0) count++
        if (categoryCondition) count++
        if (categoryMinRating) count++
        return count
    }, [categorySortBy, categoryMinPrice, categoryMaxPrice, categoryPromoOn, categorySelectedBrands, categoryCondition, categoryMinRating])

    const categoryFilteredItems = useMemo(() => {
        return sortVendorItems(categoryItems)
    }, [categoryItems, sortVendorItems])

    // ── Controles de filtro (mesma experiência da página Explorar) ───────────
    const vendorSortOptions = useMemo(() => ([
        { value: "relevancia" as SortOption, label: "Relevância" },
        { value: "preco_menor" as SortOption, label: "Menor preço" },
        { value: "preco_maior" as SortOption, label: "Maior preço" },
        { value: "recentes" as SortOption, label: "Mais recentes" },
        { value: "avaliacao" as SortOption, label: "Melhor avaliados" },
    ]), [])

    const vendorTypeOptions = useMemo(() => {
        const options = [{ value: "Produtos", label: "Produtos" }]
        if ((services || []).length > 0) options.push({ value: "Servicos", label: "Serviços" })
        if (hasPlans) options.push({ value: "Planos", label: "Assinaturas" })
        return options
    }, [services, hasPlans])

    const vendorFilterConfig = useMemo(() => ({
        showType: true,
        showCategory: false,
        showPrice: true,
        showPromo: activeContext !== "Planos",
        showCondition: activeContext === "Produtos",
        showRating: true,
        showShipping: false,
        showStoreFilters: false,
        showBrands: activeContext === "Produtos" && categoryAvailableBrands.length > 0,
    }), [activeContext, categoryAvailableBrands.length])

    /**
     * Atualiza um filtro (ou a ordenação) e mantém a URL sincronizada.
     */
    const patchVendorFilters = useCallback((patch: Partial<ExploreFilterState> & { sortBy?: SortOption; context?: VendorContext }) => {
        if ("minPrice" in patch) setCategoryMinPrice(patch.minPrice === "" || patch.minPrice === undefined ? "" : String(patch.minPrice))
        if ("maxPrice" in patch) setCategoryMaxPrice(patch.maxPrice === "" || patch.maxPrice === undefined ? "" : String(patch.maxPrice))
        if ("promoOn" in patch) setCategoryPromoOn(patch.promoOn === true)
        if ("condition" in patch) setCategoryCondition(patch.condition || "")
        if ("minRating" in patch) setCategoryMinRating(patch.minRating ?? null)
        if ("brands" in patch) setCategorySelectedBrands(patch.brands || [])
        if (patch.sortBy) setCategorySortBy(patch.sortBy)
        updateCategoryUrl(categoryViewRef.current, true, patch)
    }, [updateCategoryUrl])

    const clearVendorFilters = useCallback(() => {
        patchVendorFilters({
            minPrice: "",
            maxPrice: "",
            promoOn: false,
            condition: "",
            minRating: null,
            brands: [],
            sortBy: "relevancia",
        })
    }, [patchVendorFilters])

    const vendorFilterChips = useMemo(() => {
        const chips: { key: string; label: string; value: string; onRemove: () => void }[] = []
        if (categoryMinPrice || categoryMaxPrice) {
            let value = ""
            if (categoryMinPrice && categoryMaxPrice) value = `${formatCurrency(Number(categoryMinPrice))} - ${formatCurrency(Number(categoryMaxPrice))}`
            else if (categoryMinPrice) value = `> ${formatCurrency(Number(categoryMinPrice))}`
            else value = `< ${formatCurrency(Number(categoryMaxPrice))}`
            chips.push({
                key: "price",
                label: "Preço",
                value,
                onRemove: () => patchVendorFilters({ minPrice: "", maxPrice: "" }),
            })
        }
        if (categoryPromoOn) {
            chips.push({
                key: "promo",
                label: "Promoção",
                value: "Ativo",
                onRemove: () => patchVendorFilters({ promoOn: false }),
            })
        }
        if (categoryCondition) {
            chips.push({
                key: "condition",
                label: "Condição",
                value: categoryCondition === "novo" ? "Apenas Novos" : "Usados / Desapegos",
                onRemove: () => patchVendorFilters({ condition: "" }),
            })
        }
        if (categoryMinRating) {
            chips.push({
                key: "rating",
                label: "Avaliação",
                value: `${String(categoryMinRating).replace(".", ",")}+`,
                onRemove: () => patchVendorFilters({ minRating: null }),
            })
        }
        if (categorySelectedBrands.length > 0) {
            chips.push({
                key: "brands",
                label: "Marca",
                value: categorySelectedBrands.join(", "),
                onRemove: () => patchVendorFilters({ brands: [] }),
            })
        }
        if (categorySortBy !== "relevancia") {
            chips.push({
                key: "sort",
                label: "Ordenar",
                value: vendorSortOptions.find(o => o.value === categorySortBy)?.label || categorySortBy,
                onRemove: () => patchVendorFilters({ sortBy: "relevancia" }),
            })
        }
        return chips
    }, [categoryMinPrice, categoryMaxPrice, categoryPromoOn, categoryCondition, categoryMinRating, categorySelectedBrands, categorySortBy, patchVendorFilters, vendorSortOptions])

    /**
     * Troca o tipo do catálogo (Produtos / Serviços / Assinaturas).
     * Filtros que não se aplicam ao novo tipo são removidos junto.
     */
    const switchContext = useCallback((next: "Produtos" | "Servicos" | "Planos") => {
        setActiveContext(next)
        setActiveSection("products")
        setActiveTag("todos")
        categoryViewRef.current = null
        setCategoryView(null)

        const patch: Partial<ExploreFilterState> & { sortBy?: SortOption; context?: VendorContext } = {}
        if (next !== "Produtos") {
            patch.brands = []
            patch.condition = ""
            setCategorySelectedBrands([])
            setCategoryCondition("")
        }
        if (next === "Planos") {
            patch.promoOn = false
            setCategoryPromoOn(false)
        }
        patch.context = next === "Servicos" ? "servicos" : next === "Planos" ? "planos" : "produtos"
        updateCategoryUrl(null, false, patch)
    }, [updateCategoryUrl])

    // Só deve aparecer em telas desktop e quando uma categoria/visão "Ver tudo"
    // está aberta — nem no mobile/tablet e nem na listagem padrão de seções.
    const renderFilterControls = () => (
        <div className="hidden lg:block mb-6">
            <ExplorarViewControls
                onOpenFilters={() => setIsCategoryFiltersOpen(true)}
                onOpenSort={() => setIsCategorySortOpen(true)}
                hasActiveFilters={categoryActiveFiltersCount > 0}
                activeFilterChips={vendorFilterChips}
            />
        </div>
    )

    const shareMessage = useMemo(() => `Olha essa vitrine na Dudit!\n\n*${partner.storeName}*\nConfere aqui os produtos:`, [partner.storeName])

    return (
        <div className="container mx-auto md:px-4 max-w-[1400px] lg:mt-2 mb-6 flex-grow pb-28 lg:pb-12">
            <MarketplaceHeader
                productName={partner.storeName}
                storeSearchPlaceholder={`Buscar em ${partner.storeName}`}
                storeSearchValue={searchValue}
                onStoreSearchChange={setSearchValue}
                onShare={() => setShowShareModal(true)}
                vendorCategoryTitle={categoryName}
                vendorCategorySearchOpen={isCategorySearchOpen}
                vendorCategorySearchValue={categorySearchValue}
                onVendorCategorySearchChange={setCategorySearchValue}
                onVendorCategorySearchOpenChange={(open) => {
                    setIsCategorySearchOpen(open)
                    if (!open) setCategorySearchValue("")
                }}
                onVendorCategoryBack={() => openCategory(null)}
                userProfile={userProfile}
                cartCount={cartCount}
            />

            <div className={`hidden lg:block fixed top-[108px] left-0 right-0 bg-white dark:bg-dark-surface border-b border-brand-border z-[80] transition-all duration-200 ${isStickyVisible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0 pointer-events-none"}`}>
                <div className="max-w-[1400px] mx-auto h-[76px] flex items-center gap-4">
                    <UserProfileImage fullName={partner.storeName} imageUrl={partnerProfileImageUrl?.includes("Placeholder.png") ? null : partnerProfileImageUrl} className="w-12 h-12 shrink-0" />
                    <div className="min-w-0">
                        <h2 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading truncate">{partner.storeName}</h2>
                        <div className="flex items-center gap-2 text-[12px] text-brand-inactive-text dark:text-dark-body">
                            <span>{partner.city}, {partner.state}</span>
                            {partner.distance_km_formatted && <span>{partner.distance_km_formatted}</span>}
                            <RatingInline rating={displayRating} reviewsCount={displayReviewsCount} />
                        </div>
                    </div>
                    <div className="ml-auto w-[420px]">
                        <Input variant="full-rounded" value={categoryView ? categorySearchValue : searchValue} onChange={e => categoryView ? setCategorySearchValue(e.target.value) : setSearchValue(e.target.value)} placeholder={categoryView && categoryName ? `Buscar em ${categoryName}` : `Buscar em ${partner.storeName}`} prefix={<Search size={17} />} />
                    </div>
                </div>
            </div>

            <div ref={topRef} className={categoryView ? "hidden lg:block" : ""}>
                <div className="w-full max-w-[1400px] mx-auto">
                    <div className="relative w-full max-w-[1400px] rounded-none md:rounded-xl lg:rounded-2xl overflow-hidden cursor-pointer select-none transition-all duration-300 bg-gray-100 aspect-[1400/300] dark:bg-dark-border/50 lg:mb-4">
                        <img src={bannerImage} alt="Banner" className="w-full h-full object-cover object-center" />
                    </div>
                </div>

                <div className="px-5 lg:px-0 py-5 lg:py-2 mb-2 lg:mb-8">
                    {!isShowcaseActive && (
                        <InfoCard title="Vitrine Inativa" message="Esta vitrine está temporariamente inativa e não está aceitando novos pedidos." color="orange" className="mb-4" />
                    )}
                    {/* Desktop Layout */}
                    <div className="hidden lg:flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                            <UserProfileImage fullName={partner.storeName} imageUrl={partnerProfileImageUrl?.includes("Placeholder.png") ? null : partnerProfileImageUrl} className="w-[80px] h-[80px] shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <h1 className="text-[24px] font-semibold text-brand-dark dark:text-dark-heading leading-tight truncate">{partner.storeName}</h1>
                                    <button onClick={() => setShowShareModal(true)} className="flex w-[26px] h-[26px] rounded-full border border-brand-border items-center justify-center text-brand-inactive-text dark:text-dark-body hover:text-brand-green hover:border-brand-green transition-colors">
                                        <ShareIcon size={14} />
                                    </button>
                                </div>
                                <p className="text-[14px] text-brand-inactive-text dark:text-dark-body font-normal">{partner.city}, {partner.state}</p>
                                <div className="mt-1.5"><RatingInline rating={displayRating} reviewsCount={displayReviewsCount} /></div>
                            </div>
                        </div>

                        <div className="w-[360px] shrink-0">
                            <Input variant="full-rounded" value={categoryView ? categorySearchValue : searchValue} onChange={e => categoryView ? setCategorySearchValue(e.target.value) : setSearchValue(e.target.value)} placeholder={categoryView && categoryName ? `Buscar em ${categoryName}` : `Buscar em ${partner.storeName}`} prefix={<Search size={17} />} />
                            {hasStatusLine && (
                                <div className="mt-1.5 flex justify-end">
                                    <StoreStatusLine openStatus={openStatus} delivery={deliveryNode} className="justify-end" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mobile/Tablet Layout (lg:hidden) */}
                    <div className="lg:hidden flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <UserProfileImage fullName={partner.storeName} imageUrl={partnerProfileImageUrl?.includes("Placeholder.png") ? null : partnerProfileImageUrl} className="w-[60px] h-[60px] shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                    <h1 className="text-[16px] font-semibold text-brand-dark dark:text-dark-heading leading-tight truncate">{partner.storeName}</h1>
                                    <RatingInline rating={displayRating} reviewsCount={displayReviewsCount} short />
                                </div>
                                <p className="text-[12px] text-brand-inactive-text dark:text-dark-body font-normal leading-tight">{partner.city}, {partner.state}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                onClick={() => setIsAboutPageOpen(true)}
                                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center text-brand-dark dark:text-dark-heading active:bg-gray-200 dark:active:bg-dark-border transition-colors"
                                title="Sobre a loja"
                            >
                                <InfoIcon size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {categoryView && (contextItems.length > 0) && (
                <div className="lg:hidden">
                    <ExplorarMobileControls
                        activeFiltersCount={categoryActiveFiltersCount}
                        onOpenFilters={() => setIsCategoryFiltersOpen(true)}
                        onOpenSort={() => setIsCategorySortOpen(true)}
                    />
                    <div className="h-[46px]" />
                </div>
            )}

            {/* Tablet / Mobile (lg:hidden): Card de Horário, Entrega e Cálculo de Tempo Estimado no estilo da imagem */}
            <div className="lg:hidden px-4 md:px-6 mb-4">
                {/* 3-Column Pill Card */}
                <div className="border border-brand-border dark:border-dark-border rounded-lg p-3">
                    <div className="grid grid-cols-3 divide-x divide-brand-border dark:divide-dark-border">
                        {/* 1. Coisa de horário ali primeiro */}
                        <button
                            type="button"
                            onClick={() => {
                                setMobileModalTab("info")
                                setIsAboutPageOpen(true)
                            }}
                            className="flex flex-col items-center justify-center text-center px-1 py-0.5 hover:opacity-80 active:scale-[0.98] transition-all group min-w-0"
                            title="Ver horários de funcionamento"
                        >
                            <div className="flex items-center justify-center gap-1 min-w-0 max-w-full">
                                <ClockIcon
                                    size={14}
                                    className={
                                        openStatus?.status === "open"
                                            ? "text-brand-green shrink-0"
                                            : openStatus?.status === "closing_soon"
                                                ? "text-brand-orange shrink-0"
                                                : "text-brand-red shrink-0"
                                    }
                                />
                                <span className="font-bold text-[13px] sm:text-[14px] text-brand-dark dark:text-dark-heading truncate leading-tight">
                                    {openStatus ? (
                                        openStatus.status === "open"
                                            ? (openStatus.label.includes("até") ? openStatus.label.replace("Aberto até ", "Até ") : "Aberto")
                                            : openStatus.status === "closing_soon"
                                                ? "Fecha logo"
                                                : "Fechado"
                                    ) : "Aberto"}
                                </span>
                            </div>
                            <span className="text-[11px] sm:text-[12px] text-brand-inactive-text dark:text-dark-body flex items-center justify-center gap-0.5 mt-0.5 group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors">
                                Horários <ChevronRightIcon size={11} className="shrink-0" />
                            </span>
                        </button>

                        {/* 2. Dps bglh de entrega ali com preço msm */}
                        <button
                            type="button"
                            onClick={() => setIsDeliveryCalculatorOpen(true)}
                            className="flex flex-col items-center justify-center text-center px-1 py-0.5 hover:opacity-80 active:scale-[0.98] transition-all group min-w-0"
                            title="Opções e taxa de entrega"
                        >
                            <div className="flex items-center justify-center gap-1 min-w-0 max-w-full">
                                {hasDeliveryCalculation ? (
                                    <>
                                        <MotorbikeIcon
                                            size={15}
                                            className={
                                                deliveryInfo.isFreeDelivery
                                                    ? "text-brand-green shrink-0"
                                                    : "text-brand-dark dark:text-dark-heading shrink-0"
                                            }
                                        />
                                        <span className={`font-bold text-[13px] sm:text-[14px] truncate leading-tight ${deliveryInfo.isFreeDelivery
                                            ? "text-brand-green"
                                            : "text-brand-dark dark:text-dark-heading"
                                            }`}>
                                            {deliveryInfo.feeLabel || "A consultar"}
                                        </span>
                                    </>
                                ) : (
                                    <span className="font-bold text-[13px] sm:text-[14px] text-brand-dark dark:text-dark-heading truncate leading-tight">
                                        A combinar
                                    </span>
                                )}
                            </div>
                            <span className="text-[11px] sm:text-[12px] text-brand-inactive-text dark:text-dark-body flex items-center justify-center gap-0.5 mt-0.5 group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors">
                                {hasDeliveryCalculation && deliveryInfo.isFreeDelivery && deliveryInfo.baseFee > 0 ? (
                                    <span className="line-through">{formatCurrency(deliveryInfo.baseFee)}</span>
                                ) : (
                                    <span>Entrega</span>
                                )}
                                <ChevronRightIcon size={11} className="shrink-0" />
                            </span>
                        </button>

                        {/* 3. Tempo Estimado */}
                        <button
                            type="button"
                            onClick={() => setIsDeliveryCalculatorOpen(true)}
                            className="flex flex-col items-center justify-center text-center px-1 py-0.5 hover:opacity-80 active:scale-[0.98] transition-all group min-w-0"
                            title="Tempo estimado de entrega"
                        >
                            <div className="flex items-center justify-center gap-1 min-w-0 max-w-full">
                                {hasDeliveryCalculation && deliveryInfo.deliveryTime ? (
                                    <>
                                        <EnergyIcon size={13} className="text-brand-green shrink-0" />
                                        <span className="font-bold text-[13px] sm:text-[14px] text-brand-dark dark:text-dark-heading truncate leading-tight">
                                            {deliveryInfo.deliveryTime}
                                        </span>
                                    </>
                                ) : (
                                    <span className="font-bold text-[13px] sm:text-[14px] text-brand-dark dark:text-dark-heading truncate leading-tight">
                                        A combinar
                                    </span>
                                )}
                            </div>
                            <span className="text-[11px] sm:text-[12px] text-brand-inactive-text dark:text-dark-body flex items-center justify-center gap-0.5 mt-0.5 group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors">
                                Tempo est. <ChevronRightIcon size={11} className="shrink-0" />
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            <div ref={mobileTabsRef} className={categoryView ? "hidden" : "lg:hidden"}>
                <div className="flex items-center gap-2 px-3 mb-6 border-b border-brand-border dark:border-dark-border h-[46px]">
                    <button
                        onClick={() => setIsContextModalOpen(true)}
                        className="w-8 h-8 shrink-0 flex items-center justify-center text-brand-dark dark:text-white"
                        title="Selecionar tipo"
                    >
                        {activeContext === "Produtos" ? <PackageIcon size={17} /> : (activeContext === "Servicos" ? <ServiceIcon size={17} /> : <RepeatIcon size={17} />)}
                    </button>

                    <div className="w-px h-5 bg-white/10 dark:bg-dark-border shrink-0" />

                    {canScrollTabsLeft && (
                        <button
                            onClick={() => tabsScrollRef.current?.scrollBy({ left: -160, behavior: "smooth" })}
                            className="w-6 h-full shrink-0 flex items-center justify-center text-brand-inactive-text/60 hover:text-brand-dark dark:text-white/60 dark:hover:text-white transition-colors"
                        >
                            <ChevronLeftIcon size={16} />
                        </button>
                    )}

                    <div ref={tabsScrollRef} data-vendor-tabs-scroll="true" className="flex-1 min-w-0 h-full overflow-x-auto scrollbar-hide">
                        <Tabs value={activeTag} onValueChange={selectTab} className="h-full">
                            <TabsList className="border-0 p-0 h-full gap-5 bg-transparent flex items-center">
                                {allTabs.map(tab => (
                                    <TabsTrigger
                                        id={`vendor-tab-${tab.id}`}
                                        key={tab.id}
                                        value={tab.id}
                                        className="h-full pb-0 pt-0 flex items-center justify-center whitespace-nowrap text-brand-inactive-text dark:text-white/60 data-[state=active]:text-brand-dark data-[state=active]:font-semibold dark:data-[state=active]:text-white bg-transparent data-[state=active]:bg-transparent transition-colors text-[13px] md:text-[14px]"
                                    >
                                        {tab.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>

                    {canScrollTabsRight && (
                        <button
                            onClick={() => tabsScrollRef.current?.scrollBy({ left: 160, behavior: "smooth" })}
                            className="w-6 h-full shrink-0 flex items-center justify-center text-brand-inactive-text/60 hover:text-brand-dark dark:text-white/60 dark:hover:text-white transition-colors"
                        >
                            <ChevronRightIcon size={16} />
                        </button>
                    )}

                    <div className="w-px h-5 bg-white/10 dark:bg-dark-border shrink-0" />

                    <Button
                        variant="outline"
                        onClick={() => setIsCategoryFiltersOpen(true)}
                        className="h-8 w-8 relative"
                        leftIcon={<FilterIcon size={16} />}
                    >
                        {categoryActiveFiltersCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-green text-white text-[10px] font-bold flex items-center justify-center">
                                {categoryActiveFiltersCount}
                            </span>
                        )}
                    </Button>
                </div>
            </div>

            <div className={`lg:hidden fixed top-[52px] left-0 right-0 h-[46px] z-[45] bg-brand-dark dark:bg-dark-surface border-b border-white/10 transition-all duration-200 ${mobileTabsScrolledOut && !categoryView ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-2 opacity-0 pointer-events-none"}`}>
                <div className="flex items-center gap-2 px-3 h-full">
                    <button
                        onClick={() => setIsContextModalOpen(true)}
                        className="w-8 h-8 shrink-0 flex items-center justify-center text-white"
                        title="Selecionar tipo"
                    >
                        {activeContext === "Produtos" ? <PackageIcon size={17} /> : (activeContext === "Servicos" ? <ServiceIcon size={17} /> : <RepeatIcon size={17} />)}
                    </button>
                    <div className="w-px h-5 bg-white/10 dark:bg-dark-border shrink-0" />
                    <div data-vendor-tabs-scroll="true" className="flex items-center gap-2 overflow-x-auto scrollbar-hide flex-1 h-full min-w-0">
                        {allTabs.map(tab => (
                            <button
                                id={`vendor-tab-${tab.id}-sticky`}
                                key={tab.id}
                                onClick={() => selectTab(tab.id)}
                                className={`h-full pb-0 pt-0 flex items-center justify-center shrink-0 whitespace-nowrap px-3 text-[13px] md:text-[14px] ${activeTag === tab.id ? "text-white font-semibold" : "text-white/60"}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="w-px h-5 bg-white/10 dark:bg-dark-border shrink-0" />
                    <button
                        onClick={() => setIsCategoryFiltersOpen(true)}
                        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white relative"
                        title="Filtros"
                    >
                        <FilterIcon size={16} />
                        {categoryActiveFiltersCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-brand-green text-white text-[9px] font-bold flex items-center justify-center">
                                {categoryActiveFiltersCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-10 px-0 pb-20 items-start">
                <aside className="hidden lg:block w-[260px] shrink-0 sticky top-[198px] z-20 bg-white dark:bg-dark-surface self-start">
                    <div>
                        <div className="mb-8">
                            <h3 className="font-normal text-brand-dark dark:text-dark-heading text-[16px] mb-3">Sobre {partner.storeName}</h3>
                            <div className="flex flex-col gap-1">
                                {([{ id: "info", label: "Informações" }, { id: "reviews", label: "Avaliações" }, { id: "gallery", label: "Galeria" }] as const).map(b => (
                                    <button key={b.id} onClick={() => setActiveSection(b.id)} className={`w-full text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center gap-3 ${activeSection === b.id ? "bg-[#ecfdf5] dark:bg-brand-dark/10 text-brand-green font-semibold" : "text-brand-inactive-text dark:text-dark-body hover:bg-brand-gray dark:hover:bg-dark-border/50"}`}>
                                        <span>{b.label}</span>
                                        {activeSection === b.id && <Check size={16} className="ml-auto" />}
                                    </button>
                                ))}
                                <Button variant="filled" onClick={handleWhatsApp} className="mt-3 rounded-full h-10 px-5 gap-2 justify-center">
                                    <WhatsappIcon size={17} /> Contato
                                </Button>
                            </div>
                        </div>

                        {(services.length > 0 || hasPlans) && (
                            <div className="mb-8 border-t border-brand-border pt-6">
                                <h3 className="font-normal text-brand-dark dark:text-dark-heading text-[16px] mb-3">Catálogo</h3>
                                <div className="flex flex-col gap-1">
                                    <button onClick={() => switchContext("Produtos")} className={`w-full text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center gap-3 ${activeContext === "Produtos" && activeSection === "products" ? "bg-[#ecfdf5] dark:bg-brand-dark/10 text-brand-green font-semibold" : "text-brand-inactive-text dark:text-dark-body hover:bg-brand-gray dark:hover:bg-dark-border/50"}`}>
                                        <span>Produtos</span>
                                        {activeContext === "Produtos" && activeSection === "products" && <Check size={16} className="ml-auto" />}
                                    </button>
                                    {services.length > 0 && (
                                        <button onClick={() => switchContext("Servicos")} className={`w-full text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center gap-3 ${activeContext === "Servicos" && activeSection === "products" ? "bg-[#ecfdf5] dark:bg-brand-dark/10 text-brand-green font-semibold" : "text-brand-inactive-text dark:text-dark-body hover:bg-brand-gray dark:hover:bg-dark-border/50"}`}>
                                            <span>Serviços</span>
                                            {activeContext === "Servicos" && activeSection === "products" && <Check size={16} className="ml-auto" />}
                                        </button>
                                    )}
                                    {hasPlans && (
                                        <button onClick={() => switchContext("Planos")} className={`w-full text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center gap-3 ${activeContext === "Planos" && activeSection === "products" ? "bg-[#ecfdf5] dark:bg-brand-dark/10 text-brand-green font-semibold" : "text-brand-inactive-text dark:text-dark-body hover:bg-brand-gray dark:hover:bg-dark-border/50"}`}>
                                            <span>Assinaturas</span>
                                            {activeContext === "Planos" && activeSection === "products" && <Check size={16} className="ml-auto" />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <h3 className="font-normal text-brand-dark dark:text-dark-heading text-[16px] mb-4">Seções</h3>
                        <div className="flex flex-col gap-1 mb-8">
                            <button onClick={() => selectTab("todos")} className={`text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center justify-between ${activeTag === "todos" && activeSection === "products" ? "bg-[#ecfdf5] dark:bg-brand-dark/10 text-brand-green font-semibold" : "text-brand-inactive-text dark:text-dark-body hover:bg-brand-gray dark:hover:bg-dark-border/50"}`}>
                                <span>Todos</span>
                                {activeTag === "todos" && activeSection === "products" && <Check size={16} />}
                            </button>
                            {groupedItems.map(group => (
                                <button key={group.id} onClick={() => selectTab(group.id)} className={`text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center justify-between ${activeTag === group.id && activeSection === "products" ? "bg-[#ecfdf5] dark:bg-brand-dark/10 text-brand-green font-semibold" : "text-brand-inactive-text dark:text-dark-body hover:bg-brand-gray dark:hover:bg-dark-border/50"}`}>
                                    <span className="capitalize">{group.name}</span>
                                    {activeTag === group.id && activeSection === "products" && <Check size={16} />}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                <main id="vendor-products" className="flex-1 min-w-0 w-full lg:w-auto px-5 lg:px-0 scroll-mt-[170px]">
                    {!isShowcaseActive && categoryView && (
                        <div className="mb-4 lg:hidden">
                            <InfoCard title="Vitrine Inativa" message="Esta vitrine está temporariamente inativa e não está aceitando novos pedidos." color="orange" />
                        </div>
                    )}
                    {activeSection === "products" && (
                        <div className="animate-fade-in">
                            {categoryView ? (
                                <section data-category-section={categoryView} className="scroll-mt-[150px] pt-4 lg:pt-0">
                                    <div className="hidden lg:flex mb-8 items-center gap-4">
                                        <Button variant="filled" onClick={() => openCategory(null)} className="w-10 h-10 p-0 flex items-center justify-center shrink-0">
                                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </Button>
                                        <div>
                                            <h2 className="text-xl lg:text-[24px] font-semibold text-brand-dark dark:text-dark-heading">{categoryName}</h2>
                                            <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mt-1">{categoryFilteredItems.length} resultado{categoryFilteredItems.length !== 1 ? "s" : ""} encontrado{categoryFilteredItems.length !== 1 ? "s" : ""}</p>
                                        </div>
                                    </div>
                                    {renderFilterControls()}
                                    {categoryFilteredItems.length > 0 ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5 gap-3 md:gap-4 lg:gap-6 mt-4 lg:mt-4">
                                            {categoryFilteredItems.map((item: any) => (
                                                <ItemCard
                                                    key={item.id}
                                                    product={normalizeItemForCard(item, partner, partnerPromotions)}
                                                    showSeller={false}
                                                    className="w-full"
                                                    promotions={partnerPromotions}
                                                    hideSalesCount
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <IconPlaceholder
                                            placeholderType="image"
                                            imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                            imageAlt="Nada encontrado"
                                            title="Ops!"
                                            subtitle="Nenhum item encontrado para esta categoria com os filtros atuais."
                                        />
                                    )}
                                </section>
                            ) : (
                                <>
                                    <CouponsCarousel coupons={coupons} onCouponClick={setSelectedCoupon} />

                                    {/* Seção de Ofertas Relâmpago / Campanhas - mostra no máximo UMA */}
                                    {bestCampaignSection && (() => {
                                        const promo = bestCampaignSection.promotion
                                        const items = bestCampaignSection.items.slice(0, 20)
                                        return (
                                            <div key={promo.id} className="mb-10 w-full rounded-2xl p-4 bg-brand-green text-brand-dark animate-fade-in shadow-md">
                                                <CampaignSection name={promo.name} onSeeAll={() => openCategory(`campaign-${promo.id}`)}>
                                                    {items.map((item: any) => (
                                                        <div key={item.id} className="snap-start shrink-0">
                                                            <ItemCard
                                                                product={normalizeItemForCard(item, partner, partnerPromotions)}
                                                                showSeller={false}
                                                                promotions={partnerPromotions}
                                                                hidePromoBadge={true}
                                                                hideSalesCount
                                                                className="w-[145px] md:w-[175px] bg-white dark:bg-dark-surface p-2 rounded-xl border border-gray-100 dark:border-dark-border shadow-sm"
                                                            />
                                                        </div>
                                                    ))}
                                                </CampaignSection>
                                            </div>
                                        )
                                    })()}

                                    <div className="space-y-6">
                                        {groupedItems.map(group => (
                                            <div key={group.id} id={group.id} data-vendor-category-section={group.id} className="scroll-mt-[150px]">
                                                <HorizontalCarousel
                                                    title={group.name}
                                                    items={group.items.slice(0, 20)}
                                                    renderItem={(item) => (
                                                        <ItemCard product={normalizeItemForCard(item, partner, partnerPromotions)} showSeller={false} promotions={partnerPromotions} hideSalesCount />
                                                    )}
                                                    onSeeAll={() => openCategory(group.id)}
                                                    itemWidthClass="w-[150px] md:w-[230px]"
                                                />
                                            </div>
                                        ))}
                                        {!groupedItems.length && (
                                            <IconPlaceholder placeholderType="image" imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png" imageAlt="Sem itens" title="Nenhum item por aqui!" subtitle="Este vendedor ainda não adicionou nenhum item." />
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div className="hidden lg:block">
                        <div style={{ display: activeSection === "info" ? "block" : "none" }}>
                            {infoHasBeenOpened && (
                                <>
                                    <FormSection title={`Informações de ${partner.storeName}`}>
                                        <InfoTab partner={{ ...partner, rating: displayRating }} stats={{ ...stats, reviewsCount: displayReviewsCount }} isActive={activeSection === "info"} onReport={() => setShowReportModal(true)} />
                                    </FormSection>
                                </>
                            )}
                        </div>
                        <div style={{ display: activeSection === "reviews" ? "block" : "none" }}>
                            {reviewsHasBeenOpened && (
                                <>
                                    <FormSection title="Avaliações">
                                        <ReviewsTab reviews={reviews} />
                                    </FormSection>
                                </>
                            )}
                        </div>
                        <div style={{ display: activeSection === "gallery" ? "block" : "none" }}>
                            {galleryHasBeenOpened && (
                                <>
                                    <FormSection title="Galeria">
                                        <GalleryTab gallery={gallery} />
                                    </FormSection>
                                </>
                            )}
                        </div>
                    </div>
                </main>
            </div>

            <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} url={isMounted ? `${window.location.origin}${getStoreUrl(partner)}` : ""} title={partner.storeName} shareMessage={shareMessage} label="Link da vitrine" />
            <ReportModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} targetType="partner" targetId={partner.partner_id || partner.partnerId || partner.id} targetName={partner.storeName || partner.store_name || partner.name || "Vendedor"} />

            <DefaultModal isOpen={!!selectedCoupon} onClose={() => setSelectedCoupon(null)} title={selectedCoupon?.code || "Cupom"} maxWidth="sm">
                {selectedCoupon && (
                    <div className="space-y-4">
                        <div className="rounded-[8px] bg-brand-gray dark:bg-dark-border/30 p-4">
                            <p className="text-[28px] font-bold text-brand-dark dark:text-dark-heading">{formatCouponValue(selectedCoupon)}</p>
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">{couponScopeLabel(selectedCoupon.apply_scope)}</p>
                        </div>
                        {Number(selectedCoupon.min_cart_value || 0) > 0 && <p className="text-sm text-brand-inactive-text dark:text-dark-body">Pedido minimo de {formatCurrency(Number(selectedCoupon.min_cart_value))}.</p>}
                        {Number(selectedCoupon.max_discount_value || 0) > 0 && <p className="text-sm text-brand-inactive-text dark:text-dark-body">Desconto maximo de {formatCurrency(Number(selectedCoupon.max_discount_value))}.</p>}
                        {selectedCoupon.first_purchase_only && <p className="text-sm text-brand-inactive-text dark:text-dark-body">Valido apenas para primeira compra.</p>}
                        {selectedCoupon.ends_at && <p className="text-sm text-brand-inactive-text dark:text-dark-body">Valido ate {formatDate(selectedCoupon.ends_at)}.</p>}
                    </div>
                )}
            </DefaultModal>

            <BottomSheet isOpen={isContextModalOpen} onClose={() => setIsContextModalOpen(false)} title="Selecione">
                <div className="px-5 pb-8">
                    {[
                        { value: "Produtos", label: "Produtos" },
                        ...(services.length > 0 ? [{ value: "Servicos", label: "Serviços" }] : []),
                        ...(hasPlans ? [{ value: "Planos", label: "Assinaturas" }] : [])
                    ].map((opt, i, arr) => (
                        <div key={opt.value} onClick={() => { switchContext(opt.value as "Produtos" | "Servicos" | "Planos"); setIsContextModalOpen(false) }} className={`flex items-center justify-between py-5 cursor-pointer ${i < arr.length - 1 ? "border-b border-brand-border" : ""}`}>
                            <span className={`text-[16px] ${activeContext === opt.value ? "font-medium text-brand-green" : "font-normal text-brand-dark dark:text-dark-heading"}`}>{opt.label}</span>
                            <RadioButton name="activeContext" value={opt.value} checked={activeContext === opt.value} onChange={() => { }} />
                        </div>
                    ))}
                </div>
            </BottomSheet>

            <BottomSheet isOpen={isAboutPageOpen} onClose={() => setIsAboutPageOpen(false)}>
                <div className="flex flex-col">
                    <div className="px-1 py-2 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <UserProfileImage fullName={partner.storeName} imageUrl={partnerProfileImageUrl?.includes("Placeholder.png") ? null : partnerProfileImageUrl} className="w-[50px] h-[50px] shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                    <h2 className="text-[16px] font-bold text-brand-dark dark:text-dark-heading leading-tight truncate">{partner.storeName}</h2>
                                    <RatingInline rating={displayRating} reviewsCount={displayReviewsCount} short />
                                </div>
                                <p className="text-[13px] text-brand-inactive-text dark:text-dark-body font-normal leading-tight mt-0.5">{partner.city}, {partner.state}</p>
                            </div>
                        </div>
                        <div className="flex flex-col items-end shrink-0 text-right">
                            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading leading-tight">{stats.salesCount >= 1000 ? `${formatNumber(stats.salesCount / 1000, 1, 1)}k` : stats.salesCount} vendas</span>
                            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body leading-tight mt-1">{formatJoinDate(partner.createdAt)}</span>
                        </div>
                    </div>
                    <div className="sticky top-0 z-40 bg-white dark:bg-dark-surface border-b border-brand-border my-4">
                        <Tabs value={mobileModalTab} onValueChange={(v) => setMobileModalTab(v as any)}>
                            <TabsList className="justify-center gap-6 bg-transparent">
                                <TabsTrigger value="info" className="text-[15px] pb-3">Informações</TabsTrigger>
                                <TabsTrigger value="reviews" className="text-[15px] pb-3">Avaliações</TabsTrigger>
                                <TabsTrigger value="gallery" className="text-[15px] pb-3">Galeria</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                    <div className="px-2 pb-6">
                        <div style={{ display: mobileModalTab === "reviews" ? "block" : "none" }}>
                            {reviewsHasBeenOpened && (
                                <ReviewsTab reviews={reviews} />
                            )}
                        </div>
                        <div style={{ display: mobileModalTab === "info" ? "block" : "none" }}>
                            {infoHasBeenOpened && (
                                <InfoTab partner={{ ...partner, rating: displayRating }} stats={{ ...stats, reviewsCount: displayReviewsCount }} isActive={isAboutPageOpen && mobileModalTab === "info"} onReport={() => setShowReportModal(true)} />
                            )}
                        </div>
                        <div style={{ display: mobileModalTab === "gallery" ? "block" : "none" }}>
                            {galleryHasBeenOpened && (
                                <GalleryTab gallery={gallery} />
                            )}
                        </div>
                    </div>
                </div>
            </BottomSheet>

            <DeliveryCalculatorModal
                isOpen={isDeliveryCalculatorOpen}
                onClose={() => setIsDeliveryCalculatorOpen(false)}
                partner={partner}
                userId={currentUserId}
                currentAddressLabel={effectiveAddressLabel}
                initialCoords={effectiveCoords}
                initialDeliveryInfo={deliveryInfo}
                onApplyLocation={(data) => {
                    if (data.addressId) {
                        setSessionOverrideCoords(null)
                        setSessionOverrideLabel(null)
                        if (data.lat != null && data.lng != null) {
                            setUserAddressCoords({ lat: data.lat, lng: data.lng })
                        }
                        if (data.label) {
                            setUserAddressLabel(data.label)
                        }
                        notifyAddressUpdated(data.addressId, data.addressData)
                        try {
                            localStorage.removeItem("dudit_vendor_delivery_calc")
                        } catch { }
                        return
                    }

                    if (data.lat != null && data.lng != null) {
                        setSessionOverrideCoords({ lat: data.lat, lng: data.lng })
                    }
                    if (data.label) {
                        setSessionOverrideLabel(data.label)
                    }
                    if (!currentUserId && data.lat != null && data.lng != null) {
                        setGuestSavedCoords({ lat: data.lat, lng: data.lng })
                        setGuestSavedLabel(data.label)
                        try {
                            localStorage.setItem("dudit_vendor_delivery_calc", JSON.stringify({
                                lat: data.lat,
                                lng: data.lng,
                                label: data.label,
                                cep: data.cep,
                            }))
                        } catch { }
                    }
                }}
            />

            <ExplorarFiltersBottomSheet
                isOpen={isCategoryFiltersOpen}
                onClose={() => setIsCategoryFiltersOpen(false)}
                onApply={(filters) => {
                    // Troca de tipo (produtos/serviços/assinaturas)
                    const typeChanged = !!filters.type && filters.type !== activeContext
                    const nextContext: VendorContext | undefined = typeChanged
                        ? (filters.type === "Servicos" ? "servicos" : filters.type === "Planos" ? "planos" : "produtos")
                        : undefined
                    if (typeChanged) {
                        switchContext(filters.type as "Produtos" | "Servicos" | "Planos")
                    }
                    patchVendorFilters({
                        minPrice: filters.minPrice === undefined ? "" : String(filters.minPrice || ""),
                        maxPrice: filters.maxPrice === undefined ? "" : String(filters.maxPrice || ""),
                        promoOn: typeChanged && filters.type === "Planos" ? false : filters.promoOn,
                        condition: typeChanged ? "" : (filters.condition || ""),
                        minRating: filters.minRating ?? null,
                        brands: typeChanged ? [] : (filters.brands || []),
                        context: nextContext,
                    })
                }}
                onClear={clearVendorFilters}
                selectedCitySlug={null}
                formatCitySlug={(s) => s}
                onCitySelect={() => { }}
                currentType={activeContext}
                selectedCategories={[]}
                selectedCondition={categoryCondition}
                minPrice={categoryMinPrice}
                maxPrice={categoryMaxPrice}
                promoOn={categoryPromoOn}
                typeOptions={vendorTypeOptions}
                productCategories={[]}
                serviceCategories={[]}
                partnerCategories={[]}
                minRating={categoryMinRating}
                brands={categoryAvailableBrands}
                selectedBrands={categorySelectedBrands}
                brandTypes={["Produtos"]}
                filterConfig={vendorFilterConfig}
            />

            <ExplorarSortBottomSheet
                isOpen={isCategorySortOpen}
                onClose={() => setIsCategorySortOpen(false)}
                sortBy={categorySortBy as any}
                onSortChange={(val) => patchVendorFilters({ sortBy: val as SortOption })}
                sortOptions={vendorSortOptions}
            />
        </div>
    )
}

interface GalleryTabProps {
    gallery: string[]
}

function GalleryTab({ gallery = [] }: GalleryTabProps) {
    const [isLightboxOpen, setIsLightboxOpen] = useState(false)
    const [lightboxActiveImg, setLightboxActiveImg] = useState(0)
    const [slideDirection, setSlideDirection] = useState<1 | -1>(1)
    const lightboxJustOpened = useRef(false)
    const touchStartX = useRef(0)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    const galleryItems = useMemo(() => {
        return gallery.map(img => ({
            type: "image" as const,
            src: img.startsWith("data:") ? img : getR2ImageUrl(img)
        }))
    }, [gallery])

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

    useEffect(() => {
        if (!isLightboxOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") {
                lightboxNav(-1)
            } else if (e.key === "ArrowRight") {
                lightboxNav(1)
            } else if (e.key === "Escape") {
                setIsLightboxOpen(false)
            }
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [isLightboxOpen, lightboxNav])

    return (
        <div className="pb-10 animate-fade-in relative">
            {gallery.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-12">
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/Galeria.png"
                        title="Galeria de imagens vazia"
                        subtitle="Este vendedor ainda não adicionou fotos ao perfil."
                    />
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {gallery.map((img, idx) => {
                        const srcUrl = img.startsWith("data:") ? img : getR2ImageUrl(img, "medium")
                        return (
                            <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border border-brand-border bg-brand-gray dark:bg-dark-border/30">
                                <img
                                    src={srcUrl}
                                    alt={`Galeria ${idx + 1}`}
                                    className="w-full h-full object-cover cursor-pointer"
                                    loading="lazy"
                                    decoding="async"
                                    onClick={() => openLightbox(idx)}
                                />
                            </div>
                        )
                    })}
                </div>
            )}

            {isMounted && createPortal(
                <AnimatePresence>
                    {isLightboxOpen && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className="fixed inset-0 z-[9999] flex flex-col bg-black lg:bg-black/90 lg:backdrop-blur-sm select-none"
                        >
                            {/* ── Mobile / Tablet top bar (hidden on lg) ── */}
                            <div className="flex lg:hidden items-center justify-between px-6 pt-12 pb-4 shrink-0">
                                <button onClick={() => setIsLightboxOpen(false)}
                                    className="w-10 h-10 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                                    <XIcon size={20} />
                                </button>
                                <span className="text-white text-sm font-semibold">
                                    {lightboxActiveImg + 1}/{galleryItems.length}
                                </span>
                                <div className="w-10" />
                            </div>

                            {/* ── Desktop layout ── */}
                            <div className="hidden lg:flex flex-1 min-h-0 relative">
                                {/* Close button */}
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
                                            <img src={item.src} className="w-full h-full object-cover" alt={`Foto da galeria ${i + 1}`} />
                                        </div>
                                    ))}
                                </div>

                                {/* Main image */}
                                <div className="relative flex-1 flex items-center justify-center min-w-0 p-8">
                                    <AnimatePresence mode="wait" custom={slideDirection}
                                        onExitComplete={() => { lightboxJustOpened.current = false }}>
                                        <motion.img
                                            key={galleryItems[lightboxActiveImg].src}
                                            src={galleryItems[lightboxActiveImg].src}
                                            className="max-w-full max-h-full object-contain"
                                            alt={`Foto da galeria ${lightboxActiveImg + 1}`}
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
                                                className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border-none text-white transition-colors">
                                                <ChevronLeftIcon size={26} />
                                            </Button>
                                            <Button variant="filled" onClick={() => lightboxNav(1)}
                                                className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border-none text-white transition-colors">
                                                <ChevronRightIcon size={26} />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* ── Mobile image area ── */}
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
                                        key={galleryItems[lightboxActiveImg].src}
                                        src={galleryItems[lightboxActiveImg].src}
                                        className="max-w-full max-h-full object-contain px-4"
                                        alt={`Foto da galeria ${lightboxActiveImg + 1}`}
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
                                        <button onClick={() => lightboxNav(-1)}
                                            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/30 text-white active:bg-black/50 transition-colors">
                                            <ChevronLeftIcon size={22} />
                                        </button>
                                        <button onClick={() => lightboxNav(1)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/30 text-white active:bg-black/50 transition-colors">
                                            <ChevronRightIcon size={22} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    )
}
