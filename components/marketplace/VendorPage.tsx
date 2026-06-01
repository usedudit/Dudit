"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Search, StarIcon, ArrowLeftIcon, MapPinIcon, ChevronRightIcon, ChevronLeftIcon, ShareIcon, HeartIcon, WhatsappIcon, FlagIcon, Check, InfoIcon, TagIcon, PackageIcon, ServiceIcon, TrashIcon, PlusIcon } from "@/lib/icons"
import { getAvatarColor, getBannerUrlByColor, UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import IconPlaceholder from "@/components/reusable/IconPlaceholder"
import { ShareModal } from "./ShareModal"
import { ReportModal } from "./ReportModal"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { getRandomDefaultBanner } from "@/lib/utils/banner"
import { useSupabase } from "@/providers/supabase-provider"
import { formatCurrency, formatDate, formatMonth, formatYear, formatNumber } from "@/lib/utils"
import { normalizeOpeningHours } from "@/lib/utils/opening-hours"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { ListItem } from "@/components/reusable/ListItem"
import BottomSheet from "@/components/BottomSheet"
import { Button, DefaultModal, Input, Spinner } from "@/components/reusable"
import { ItemCard } from "./shared-components"
import { getProductDisplayImages } from "@/lib/utils/product-display-images"
import { usePathname } from "next/navigation"
import { toCanonicalPaymentType } from "@/lib/payments/payment-method"
import { useNotification } from "@/hooks/use-notification"
import { fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import ImageCropperModal from "@/components/ImageCropperModal"
import { updatePartnerAction } from "@/app/actions/marketplace/partners"

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
    userProfile?: any
    cartCount?: number
}

const getImageUrl = (path?: string | null) => getR2ImageUrl(path)

const formatJoinDate = (createdAt: string | Date) => {
    const month = formatMonth(createdAt)
    return `Entrou em ${month.charAt(0).toUpperCase() + month.slice(1)} de ${formatYear(createdAt)}`
}

const openWhatsApp = (phone?: string, storeName?: string) => {
    const cleaned = phone?.replace(/\D/g, "") ?? ""
    const number = cleaned.startsWith("55") ? cleaned : `55${cleaned}`
    const text = encodeURIComponent(`Ola, ${storeName || "tudo bem"}! Vi sua vitrine na Dudit e gostaria de saber mais.`)
    window.open(`https://wa.me/${number}?text=${text}`, "_blank")
}

const normalizeItemForCard = (item: any, partner: any) => {
    if (item.itemType === 'plano') {
        return {
            ...item,
            partners: {
                store_name: partner.storeName,
                store_avatar: partner.storeImageUrl,
                profile_image_url: partner.profile_image_url,
                city: partner.city,
                state: partner.state,
                distance_km_formatted: partner.distance_km_formatted,
            }
        }
    }
    const price = (!item.promotional_price && item.fallback_variant_price)
        ? item.fallback_variant_price
        : (item.promotional_price || item.price || 0)

    return {
        ...item,
        price,
        originalPrice: item.promotional_price ? item.price : undefined,
        images: getProductDisplayImages(item),
        partners: {
            store_name: partner.storeName,
            store_avatar: partner.storeImageUrl,
            profile_image_url: partner.profile_image_url,
            city: partner.city,
            state: partner.state,
            distance_km_formatted: partner.distance_km_formatted,
        },
    }
}

const normalizeCategory = (category?: string | null) => (category || "Outros").trim()
const categoryId = (category: string) => category.toLowerCase()

const formatCouponValue = (coupon: any) => {
    if (coupon.discount_type === "free_shipping") return "Frete grátis"
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
const getUniqueBrands = (methods: any[]) => Array.from(new Set(methods
    .flatMap(pm => String(pm.card_brand || pm.card_brands || "").split(/[;,]/))
    .map(brand => brand.trim().toLowerCase())
    .filter(Boolean)))

const RatingInline = ({ rating, reviewsCount }: { rating: number; reviewsCount: number }) => (
    <div className="flex items-center gap-1.5 text-[12px] lg:text-[13px] text-brand-dark">
        <StarIcon size={14} className="text-brand-green fill-brand-green" />
        {reviewsCount > 0 ? (
            <>
                <span className="font-semibold">{formatNumber(rating || 0, 1, 1)}</span>
                <span className="text-brand-inactive-text">({reviewsCount} avaliações)</span>
            </>
        ) : (
            <span className="text-brand-inactive-text">Sem avaliações</span>
        )}
    </div>
)

const StoreStats = ({ rating, sales, createdAt, reviewsCount }: any) => (
    <div className="flex items-center justify-between mb-8">
        <StatItem
            value={reviewsCount > 0 ? formatNumber(rating || 0, 1, 1) : "Sem avaliações"}
            label="Avaliacao"
            icon={<StarIcon size={14} className="text-brand-green fill-brand-green" />}
        />
        <div className="w-[1px] h-8 bg-brand-border" />
        <StatItem value={sales >= 1000 ? `${formatNumber(sales / 1000, 1, 1)}k` : sales} label="Vendas" />
        <div className="w-[1px] h-8 bg-brand-border" />
        <StatItem value={formatJoinDate(createdAt)} label="Na Dudit" />
    </div>
)

const StatItem = ({ value, label, icon }: any) => (
    <div className="flex flex-col items-center flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
            {icon}
            <span className="text-[14px] lg:text-[16px] font-semibold text-brand-dark truncate">{value}</span>
        </div>
        <span className="text-[11px] text-brand-inactive-text font-medium uppercase">{label}</span>
    </div>
)

const formatOpeningHoursList = (hours: any) => {
    if (typeof hours === "string" || !hours || typeof hours !== "object") return []
    const normalizedHours = normalizeOpeningHours(hours)
    const daysMap: Record<string, string> = {
        monday: "Segunda-feira",
        tuesday: "Terca-feira",
        wednesday: "Quarta-feira",
        thursday: "Quinta-feira",
        friday: "Sexta-feira",
        saturday: "Sabado",
        sunday: "Domingo",
    }
    const currentDayKey = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date().getDay()]
    return Object.entries(normalizedHours)
        .sort((a, b) => ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].indexOf(a[0]) - ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].indexOf(b[0]))
        .map(([key, value]: [string, any]) => ({
            dayName: daysMap[key] || key,
            timeString: value?.enabled ? `${value.from} - ${value.to}` : "Fechado",
            isCurrentDay: key === currentDayKey,
        }))
}

const MapboxMap = ({ lat, lng, name, address }: { lat?: number; lng?: number; name?: string; address?: string }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<any>(null)
    const [isMapping, setIsMapping] = useState(true)

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
                    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.css"
                    document.head.appendChild(link)
                }
                if (!(window as any).mapboxgl) {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement("script")
                        script.src = "https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.js"
                        script.async = true
                        script.onload = resolve
                        script.onerror = reject
                        document.head.appendChild(script)
                    })
                }
                if (cancelled || !mapContainerRef.current) return
                const mapboxgl = (window as any).mapboxgl
                mapboxgl.accessToken = token
                mapRef.current = new mapboxgl.Map({
                    container: mapContainerRef.current,
                    style: "mapbox://styles/mapbox/light-v11",
                    center: [lng, lat],
                    zoom: 15,
                    attributionControl: false,
                })
                const marker = new mapboxgl.Marker({ color: "#059669" }).setLngLat([lng, lat]).addTo(mapRef.current)
                if (name || address) {
                    marker.setPopup(new mapboxgl.Popup({ offset: 35, closeButton: false }).setHTML(`<div style="padding:4px;font-family:system-ui,sans-serif"><strong>${name}</strong><p style="margin:2px 0 0;font-size:12px;color:#4B5563">${address || ""}</p></div>`))
                }
            } catch {
                setIsMapping(false)
            }
        }
        initMap()
        return () => {
            cancelled = true
            mapRef.current?.remove()
        }
    }, [lat, lng, name, address])

    if (!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || !isMapping) {
        return <div className="w-full h-full bg-gray-100 flex items-center justify-center p-4 text-center text-[12px] text-brand-inactive-text">Localizacao indisponivel no mapa.</div>
    }
    return <div ref={mapContainerRef} className="w-full h-full bg-gray-100" />
}

const PaymentPill = ({ icon, label }: { icon?: string; label: string }) => (
    <div className="h-9 px-3 rounded-[8px] border border-brand-border bg-white flex items-center gap-2">
        {icon && <img src={icon} alt={label} className="h-4 max-w-[52px] object-contain" />}
        <span className="text-[13px] text-brand-dark font-medium">{label}</span>
    </div>
)

const CardBrands = ({ brands }: { brands: string[] }) => {
    if (!brands.length) return null
    return (
        <div className="flex flex-wrap gap-2 mt-3">
            {brands.map(brandId => {
                const brand = AVAILABLE_BRANDS.find(item => item.id === brandId)
                if (!brand) return null
                return <PaymentPill key={brandId} icon={brand.image} label={brand.label} />
            })}
        </div>
    )
}

const InfoTab = ({ partner, stats }: any) => {
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

    return (
        <div className="pb-10 space-y-8 animate-fade-in">
            <div className="hidden lg:block">
                <StoreStats rating={partner.rating} sales={stats.salesCount} createdAt={partner.createdAt} reviewsCount={stats.reviewsCount} />
                <div className="h-[1px] bg-brand-border w-full mb-8" />
            </div>

            {partner.storeDescription && (
                <>
                    <div>
                        <h3 className="text-md lg:text-lg font-medium text-brand-dark mb-4">Sobre {partner.storeName}</h3>
                        <p className="text-[15px] text-brand-inactive-text leading-relaxed whitespace-pre-wrap">{partner.storeDescription}</p>
                    </div>
                    <div className="h-[1px] bg-brand-border w-full" />
                </>
            )}

            {hasPaymentSections && (
                <>
                    <div>
                        <h3 className="text-md lg:text-lg font-medium text-brand-dark mb-4">Formas de pagamento</h3>
                        <div className="space-y-5">
                            {hasSimplePayments && (
                                <div className="flex flex-wrap gap-2">
                                    {pixMethods.length > 0 && <PaymentPill icon="https://img.dudit.com.br/static/icons/payments/Pix.png" label="Pix" />}
                                    {cashMethods.length > 0 && <PaymentPill icon="https://img.dudit.com.br/static/icons/payments/Dinheiro.png" label="Dinheiro" />}
                                    {transferMethods.length > 0 && <PaymentPill label="Transferencia bancaria" />}
                                </div>
                            )}
                            {creditMethods.length > 0 && (
                                <div>
                                    <h4 className="text-[14px] font-semibold text-brand-dark mb-2">Cartao de credito</h4>
                                    {creditBrands.length > 0 ? <CardBrands brands={creditBrands} /> : <p className="text-[13px] text-brand-inactive-text">Bandeiras não informadas.</p>}
                                </div>
                            )}
                            {debitMethods.length > 0 && (
                                <div>
                                    <h4 className="text-[14px] font-semibold text-brand-dark mb-2">Cartao de debito</h4>
                                    {debitBrands.length > 0 ? <CardBrands brands={debitBrands} /> : <p className="text-[13px] text-brand-inactive-text">Bandeiras não informadas.</p>}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="h-[1px] bg-brand-border w-full" />
                </>
            )}

            {hoursList.length > 0 && (
                <>
                    <div>
                        <h3 className="text-md lg:text-lg font-medium text-brand-dark mb-4">Horário de Funcionamento</h3>
                        <div className="space-y-3">
                            {hoursList.map((item: any) => (
                                <div key={item.dayName} className="flex justify-between items-center text-[14px]">
                                    <span className={item.isCurrentDay ? "text-brand-green font-medium" : "text-brand-dark"}>{item.dayName}</span>
                                    <span className={item.isCurrentDay ? "text-brand-green font-medium" : "text-brand-inactive-text"}>{item.timeString}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="h-[1px] bg-brand-border w-full" />
                </>
            )}

            <div>
                <h3 className="text-md lg:text-lg font-medium text-brand-dark mb-4">Endereço</h3>
                <div className="flex items-start gap-3 mb-5">
                    <MapPinIcon size={20} className="text-brand-inactive-text mt-1 shrink-0" />
                    <div>
                        <p className="text-[15px] text-brand-inactive-text">{partner.street}, {partner.number}</p>
                        <p className="text-[15px] text-brand-inactive-text">{partner.city} - {partner.state}</p>
                        <p className="text-[15px] text-brand-inactive-text">CEP: {partner.zipCode}</p>
                    </div>
                </div>
                <div className="w-full h-[150px] lg:h-[260px] rounded-[12px] overflow-hidden bg-gray-100 shrink-0">
                    <MapboxMap lat={partner.lat} lng={partner.lng} name={partner.storeName} address={`${partner.street}, ${partner.number}, ${partner.city}/${partner.state}`} />
                </div>
            </div>
        </div>
    )
}

const ReviewsTab = ({ partner, stats, ratingDistribution, reviews }: any) => {
    const hasReviews = reviews.length > 0
    return (
        <div className="pb-10 animate-fade-in">
            {hasReviews ? (
                <>
                    <div className="bg-brand-gray rounded-[16px] p-5 mb-10 flex items-center justify-between max-w-[800px]">
                        <div className="flex flex-col items-center">
                            <span className="text-[48px] font-semibold text-brand-dark leading-none">{formatNumber(partner.rating, 1, 1)}</span>
                            <RatingInline rating={partner.rating} reviewsCount={stats.reviewsCount} />
                            <span className="text-[13px] text-brand-inactive-text font-medium mt-2">media de {stats.reviewsCount} avaliações</span>
                        </div>
                        <div className="flex-1 ml-10 space-y-1.5">
                            {ratingDistribution.map((row: any) => (
                                <div key={row.star} className="flex items-center gap-3">
                                    <span className="text-[12px] text-brand-inactive-text w-2">{row.star}</span>
                                    <StarIcon size={10} className="text-brand-inactive-text" />
                                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-brand-green rounded-full" style={{ width: `${(row.count / stats.reviewsCount) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-8">
                        {reviews.map((rev: any) => (
                            <div key={rev.id} className="border-b border-brand-border pb-8 last:border-0">
                                <div className="flex items-start gap-4 mb-3">
                                    <div className="w-[50px] h-[50px] rounded-full overflow-hidden shrink-0">
                                        <img src="https://img.dudit.com.br/static/Placeholder.png" className="w-full h-full object-cover" alt="" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[15px] font-semibold text-brand-dark">{rev.profiles?.full_name || "Usuario"}</span>
                                            <span className="text-[13px] text-brand-inactive-text">{formatDate(rev.created_at)}</span>
                                        </div>
                                        <div className="flex gap-0.5 mb-2">
                                            {[...Array(5)].map((_, i) => (
                                                <StarIcon key={i} size={14} className={i < rev.rating ? "text-brand-green fill-brand-green" : "text-gray-300 fill-gray-300"} />
                                            ))}
                                        </div>
                                        {rev.comment && <p className="text-[15px] text-brand-inactive-text leading-relaxed">{rev.comment}</p>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <IconPlaceholder placeholderType="image" imageSrc="https://img.dudit.com.br/static/mascots/Avaliacoes.png" imageAlt="Sem avaliações" title="Ainda não temos avaliações por aqui" subtitle="Seja o primeiro a contar para a comunidade como foi sua experiencia!" />
            )}
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
            {canLeft && (
                <Button variant="filled" onClick={() => scroll(-1)} className="h-9 w-9 p-0 rounded-full bg-brand-gray text-brand-dark hover:bg-gray-200">
                    <ChevronLeftIcon size={18} />
                </Button>
            )}
            {canRight && (
                <Button variant="filled" onClick={() => scroll(1)} className="h-9 w-9 p-0 rounded-full">
                    <ChevronRightIcon size={18} />
                </Button>
            )}
        </div>
    )
}

function ItemsCarousel({ title, items, partner, onSeeAll, sectionId }: { title: string; items: any[]; partner: any; onSeeAll?: () => void; sectionId?: string }) {
    const ref = useRef<HTMLDivElement>(null)
    if (!items.length) return null
    return (
        <section id={sectionId} data-category-section={sectionId} className="scroll-mt-[150px] mb-10 lg:mb-12">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg lg:text-xl font-semibold text-brand-dark">{title}</h2>
                <CarouselNav targetRef={ref} showSeeAll={!!onSeeAll} onSeeAll={onSeeAll} />
            </div>
            <div ref={ref} className="flex gap-4 lg:gap-5 overflow-x-auto hide-scrollbar snap-x snap-mandatory pb-3">
                {items.slice(0, 20).map(item => (
                    <div key={item.id} className="snap-start">
                        <ItemCard product={normalizeItemForCard(item, partner)} showSeller={false} />
                    </div>
                ))}
            </div>
        </section>
    )
}

function CouponsCarousel({ coupons, onCouponClick }: { coupons: any[]; onCouponClick: (coupon: any) => void }) {
    const ref = useRef<HTMLDivElement>(null)
    if (!coupons.length) return null
    return (
        <section id="coupons" className="mb-10 lg:mb-12 scroll-mt-[150px]">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg lg:text-2xl font-medium text-brand-dark mb-6">Cupons do vendedor</h2>
                <CarouselNav targetRef={ref} />
            </div>
            <div ref={ref} className="flex gap-3 overflow-x-auto hide-scrollbar snap-x snap-mandatory pb-2">
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

export function VendorPageClient({ partner, products, services, plans = [], reviews, stats, ratingDistribution, productCategories, serviceCategories, coupons = [], userProfile, cartCount }: VendorPageClientProps) {
    const calculatedReviewsCount = reviews?.length || 0
    const calculatedAverageRating = useMemo(() => {
        if (calculatedReviewsCount === 0) return 0
        const sum = reviews.reduce((acc: number, r: any) => acc + (r.rating || 0), 0)
        return sum / calculatedReviewsCount
    }, [reviews, calculatedReviewsCount])

    const displayRating = calculatedReviewsCount > 0 ? calculatedAverageRating : (partner.rating || 0)
    const displayReviewsCount = calculatedReviewsCount > 0 ? calculatedReviewsCount : (stats.reviewsCount || 0)

    const pathname = usePathname()
    const [activeTag, setActiveTag] = useState("todos")
    const [activeSection, setActiveSection] = useState<"products" | "reviews" | "info" | "gallery">("products")
    const [activeContext, setActiveContext] = useState<"Produtos" | "Servicos" | "Planos">("Produtos")
    const [categoryView, setCategoryView] = useState<string | null>(null)
    const [isContextModalOpen, setIsContextModalOpen] = useState(false)
    const [mobileModalTab, setMobileModalTab] = useState<"reviews" | "info" | "gallery">("reviews")
    const [isAboutPageOpen, setIsAboutPageOpen] = useState(false)
    const [gallery, setGallery] = useState<string[]>(() => partner.gallery || [])
    const [localImages, setLocalImages] = useState<string[]>(() => partner.gallery || [])
    const [searchValue, setSearchValue] = useState("")
    const [categorySearchValue, setCategorySearchValue] = useState("")
    const [isCategorySearchOpen, setIsCategorySearchOpen] = useState(false)
    const [showShareModal, setShowShareModal] = useState(false)
    const [showReportModal, setShowReportModal] = useState(false)
    const [selectedCoupon, setSelectedCoupon] = useState<any>(null)
    const [isMounted, setIsMounted] = useState(false)
    const [isStickyVisible, setIsStickyVisible] = useState(false)
    const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false)
    const [canScrollTabsRight, setCanScrollTabsRight] = useState(false)
    const [pendingScrollId, setPendingScrollId] = useState<string | null>(null)
    const tabsScrollRef = useRef<HTMLDivElement>(null)
    const topRef = useRef<HTMLDivElement>(null)
    const { user } = useSupabase()
    const isStoreOwner = user?.id === partner.userId || user?.id === partner.user_id

    useEffect(() => { setIsMounted(true) }, [])

    const partnerRawImage = partner.store_avatar || partner.store_image_url || partner.profile_image_url || partner.storeImageUrl || null
    const partnerProfileImageUrl = getImageUrl(partnerRawImage)
    const fallbackBanner = partnerRawImage ? getRandomDefaultBanner() : getBannerUrlByColor(getAvatarColor(partner.storeName || "Vendedor"))
    const bannerImage = partner.banner_url ? getImageUrl(partner.banner_url) : fallbackBanner

    const hasPlans = plans && plans.length > 0
    const currentItems = activeContext === "Produtos" ? products : (activeContext === "Servicos" ? services : plans)
    const filteredItems = useMemo(() => {
        const search = searchValue.trim().toLowerCase()
        return currentItems.filter(item => !search || item.name?.toLowerCase().includes(search))
    }, [currentItems, searchValue])

    const groupedItems = useMemo(() => {
        const map = new Map<string, any[]>()
        filteredItems.forEach(item => {
            const name = normalizeCategory(item.category)
            map.set(name, [...(map.get(name) || []), item])
        })
        return Array.from(map.entries()).map(([name, items]) => ({ name, id: categoryId(name), items }))
    }, [filteredItems])

    const featuredItems = useMemo(() => {
        if (activeContext === "Planos") return []
        const highlightedProducts = products.filter(item => item.is_featured || item.is_highlighted)
        const highlightedServices = services.filter(item => item.highlight_service || item.is_featured || item.is_highlighted)
        return (activeContext === "Produtos" ? highlightedProducts : highlightedServices)
            .filter(item => !searchValue.trim() || item.name?.toLowerCase().includes(searchValue.trim().toLowerCase()))
    }, [products, services, activeContext, searchValue])

    const allTabs = useMemo(() => [
        ...(featuredItems.length ? [{ id: "featured", label: "Itens destacados" }] : []),
        { id: "todos", label: "Todos" },
        ...groupedItems.map(group => ({ id: group.id, label: group.name })),
    ], [featuredItems.length, groupedItems])

    const categoryName = useMemo(
        () => categoryView ? groupedItems.find(group => group.id === categoryView)?.name || categoryView : null,
        [categoryView, groupedItems]
    )

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const category = params.get("categoria")
        if (category) {
            setCategoryView(category)
            setActiveTag(category)
            setActiveSection("products")
            setTimeout(scrollToProducts, 0)
        }
    }, [])

    useEffect(() => {
        let ticking = false
        const onScroll = () => {
            if (ticking) return
            window.requestAnimationFrame(() => {
                const bottom = topRef.current?.getBoundingClientRect().bottom ?? 0
                setIsStickyVisible(bottom < 0)
                ticking = false
            })
            ticking = true
        }
        onScroll()
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [])

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            const visible = entries
                .filter(entry => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
            const id = visible?.target.getAttribute("data-category-section")
            if (id) {
                setActiveTag(id)
                const tab = document.getElementById(`vendor-tab-${id}`)
                tab?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" })
            }
        }, { rootMargin: "-120px 0px -55% 0px", threshold: [0.1, 0.35, 0.6] })

        document.querySelectorAll("[data-category-section]").forEach(el => observer.observe(el))
        return () => observer.disconnect()
    }, [groupedItems, featuredItems.length, categoryView, activeContext])

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

    const handleWhatsApp = useCallback(() => openWhatsApp(partner.phone, partner.storeName), [partner.phone, partner.storeName])
    const updateCategoryUrl = useCallback((tag: string | null) => {
        const params = new URLSearchParams(window.location.search)
        if (tag) params.set("categoria", tag)
        else params.delete("categoria")
        const query = params.toString()
        window.history.pushState({}, "", query ? `${pathname}?${query}` : pathname)
    }, [pathname])
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

    const openCategory = (tag: string | null) => {
        setActiveSection("products")
        setCategoryView(tag)
        setCategorySearchValue("")
        setIsCategorySearchOpen(false)
        setActiveTag(tag || "todos")
        updateCategoryUrl(tag)
        setTimeout(scrollToProducts, 0)
    }
    const selectTab = (tag: string) => {
        setActiveSection("products")
        if (categoryView) {
            setCategoryView(null)
            updateCategoryUrl(null)
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
    }

    const categoryItems = categoryView
        ? (groupedItems.find(group => group.id === categoryView)?.items || [])
            .filter(item => !categorySearchValue.trim() || item.name?.toLowerCase().includes(categorySearchValue.trim().toLowerCase()))
        : []

    const shareMessage = useMemo(() => `Olha essa vitrine na Dudit!\n\n*${partner.storeName}*\nConfere aqui os produtos:`, [partner.storeName])

    return (
        <div className="container mx-auto px-0 lg:px-4 max-w-[1400px] animate-fade-in lg:mt-6">
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

            <div className={`hidden lg:block fixed top-[108px] left-0 right-0 bg-white border-b border-brand-border z-[80] transition-all duration-200 ${isStickyVisible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0 pointer-events-none"}`}>
                <div className="max-w-[1400px] mx-auto px-4 h-[76px] flex items-center gap-4">
                    <UserProfileImage fullName={partner.storeName} imageUrl={partnerProfileImageUrl?.includes("Placeholder.png") ? null : partnerProfileImageUrl} className="w-12 h-12 border border-brand-border shrink-0 bg-gray-50" />
                    <div className="min-w-0">
                        <h2 className="text-[17px] font-bold text-brand-dark truncate">{partner.storeName}</h2>
                        <div className="flex items-center gap-2 text-[12px] text-brand-inactive-text">
                            <span>{partner.city}, {partner.state}</span>
                            {partner.distance_km_formatted && <span>{partner.distance_km_formatted}</span>}
                            <RatingInline rating={displayRating} reviewsCount={displayReviewsCount} />
                        </div>
                    </div>
                    <div className="ml-auto w-[420px]">
                        <Input variant="full-rounded" value={searchValue} onChange={e => setSearchValue(e.target.value)} placeholder={`Buscar em ${partner.storeName}`} prefix={<Search size={17} />} />
                    </div>
                </div>
            </div>

            <div ref={topRef} className={categoryView ? "hidden lg:block" : ""}>
                <div className="w-full lg:rounded-2xl lg:mb-4 overflow-hidden relative select-none active:scale-[0.995] transition-all duration-300 group cursor-pointer shadow-sm hover:shadow-md">
                    <img src={bannerImage} alt="Banner" className="w-full h-auto block object-cover object-center group-hover:scale-[1.02] transition-transform duration-500" />
                </div>

                <div className="px-5 lg:px-0 py-5 lg:py-2 mb-2 lg:mb-8">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                            <UserProfileImage fullName={partner.storeName} imageUrl={partnerProfileImageUrl?.includes("Placeholder.png") ? null : partnerProfileImageUrl} className="w-[60px] h-[60px] lg:w-[80px] lg:h-[80px] border border-brand-border shrink-0 bg-gray-50" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                    <h1 className="text-[20px] lg:text-[24px] font-semibold text-brand-dark leading-tight truncate">{partner.storeName}</h1>
                                    <button onClick={() => setShowShareModal(true)} className="hidden lg:flex w-[26px] h-[26px] rounded-full border border-brand-border items-center justify-center text-brand-inactive-text hover:text-brand-green hover:border-brand-green transition-colors">
                                        <ShareIcon size={14} />
                                    </button>
                                </div>
                                <p className="text-[13px] lg:text-[14px] text-brand-inactive-text font-normal">{partner.city}, {partner.state}</p>
                                <div className="mt-1.5"><RatingInline rating={displayRating} reviewsCount={displayReviewsCount} /></div>
                            </div>
                        </div>

                        <div className="hidden lg:block w-[360px]">
                            <Input variant="full-rounded" value={searchValue} onChange={e => setSearchValue(e.target.value)} placeholder={`Buscar em ${partner.storeName}`} prefix={<Search size={17} />} />
                        </div>

                        <div className="hidden lg:flex items-start gap-3">
                            <button className="w-[42px] h-[42px] rounded-full border border-brand-border flex items-center justify-center text-brand-inactive-text hover:text-[#ef4444] hover:border-[#ef4444] transition-colors">
                                <HeartIcon size={20} />
                            </button>
                            {!isStoreOwner && (
                                <button onClick={() => setShowReportModal(true)} className="w-[42px] h-[42px] rounded-full border border-brand-border flex items-center justify-center text-brand-inactive-text hover:text-[#d32f2f] hover:border-[#d32f2f] transition-colors" title="Denunciar vendedor">
                                    <FlagIcon size={20} />
                                </button>
                            )}
                        </div>

                        <div className="lg:hidden flex items-center gap-3">
                            <button onClick={() => setIsAboutPageOpen(true)} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-brand-dark active:bg-gray-200 transition-colors">
                                <InfoIcon size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className={`lg:hidden fixed top-[52px] left-0 right-0 h-[46px] z-[45] bg-brand-dark border-b border-white/10 shadow-md transition-all duration-200 ${isStickyVisible && !categoryView ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
                <div className="flex items-center gap-4 px-3 h-full">
                    <button
                        onClick={() => setIsContextModalOpen(true)}
                        className="w-8 h-8 shrink-0 flex items-center justify-center text-white"
                        title="Selecionar tipo"
                    >
                        {activeContext === "Produtos" ? <PackageIcon size={17} /> : (activeContext === "Servicos" ? <ServiceIcon size={17} /> : <TagIcon size={17} />)}
                    </button>

                    {canScrollTabsLeft && (
                        <button
                            onClick={() => tabsScrollRef.current?.scrollBy({ left: -160, behavior: "smooth" })}
                            className="w-6 h-full shrink-0 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                        >
                            <ChevronLeftIcon size={16} />
                        </button>
                    )}

                    <div ref={tabsScrollRef} className="flex-1 h-full overflow-x-auto hide-scrollbar">
                        <Tabs value={activeTag} onValueChange={selectTab} className="h-full">
                            <TabsList className="border-0 p-0 h-full gap-5 bg-transparent flex items-center">
                                {allTabs.map(tab => (
                                    <TabsTrigger
                                        id={`vendor-tab-${tab.id}`}
                                        key={tab.id}
                                        value={tab.id}
                                        className="h-full pb-0 pt-0 flex items-center justify-center whitespace-nowrap text-white/60 data-[state=active]:text-white data-[state=active]:font-semibold bg-transparent data-[state=active]:bg-transparent transition-colors text-[13px] md:text-[14px]"
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
                            className="w-6 h-full shrink-0 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                        >
                            <ChevronRightIcon size={16} />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-10 px-0 pb-20 items-start">
                <aside className="hidden lg:block w-[260px] shrink-0 sticky top-[198px] z-20 bg-white self-start">
                    <div>
                        <div className="mb-8">
                            <h3 className="font-normal text-brand-dark text-[16px] mb-3">Sobre {partner.storeName}</h3>
                            <div className="flex flex-col gap-1">
                                {([{ id: "info", label: "Informações" }, { id: "reviews", label: "Avaliações" }, { id: "gallery", label: "Galeria" }] as const).map(b => (
                                    <button key={b.id} onClick={() => setActiveSection(b.id)} className={`w-full text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center gap-3 ${activeSection === b.id ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
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
                                <h3 className="font-normal text-brand-dark text-[16px] mb-3">Catálogo</h3>
                                <div className="flex flex-col gap-1">
                                    <button onClick={() => { setActiveContext("Produtos"); setActiveSection("products"); setActiveTag("todos"); setCategoryView(null) }} className={`w-full text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center gap-3 ${activeContext === "Produtos" && activeSection === "products" ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
                                        <span>Produtos</span>
                                        {activeContext === "Produtos" && activeSection === "products" && <Check size={16} className="ml-auto" />}
                                    </button>
                                    {services.length > 0 && (
                                        <button onClick={() => { setActiveContext("Servicos"); setActiveSection("products"); setActiveTag("todos"); setCategoryView(null) }} className={`w-full text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center gap-3 ${activeContext === "Servicos" && activeSection === "products" ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
                                            <span>Serviços</span>
                                            {activeContext === "Servicos" && activeSection === "products" && <Check size={16} className="ml-auto" />}
                                        </button>
                                    )}
                                    {hasPlans && (
                                        <button onClick={() => { setActiveContext("Planos"); setActiveSection("products"); setActiveTag("todos"); setCategoryView(null) }} className={`w-full text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center gap-3 ${activeContext === "Planos" && activeSection === "products" ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
                                            <span>Assinaturas</span>
                                            {activeContext === "Planos" && activeSection === "products" && <Check size={16} className="ml-auto" />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <h3 className="font-normal text-brand-dark text-[16px] mb-4">Seções</h3>
                        <div className="flex flex-col gap-1 mb-8">
                            {featuredItems.length > 0 && (
                                <button onClick={() => selectTab("featured")} className={`text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center justify-between ${activeTag === "featured" && activeSection === "products" ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
                                    <span>Itens destacados</span>
                                    {activeTag === "featured" && activeSection === "products" && <Check size={16} />}
                                </button>
                            )}
                            <button onClick={() => selectTab("todos")} className={`text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center justify-between ${activeTag === "todos" && activeSection === "products" ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
                                <span>Todos</span>
                                {activeTag === "todos" && activeSection === "products" && <Check size={16} />}
                            </button>
                            {groupedItems.map(group => (
                                <button key={group.id} onClick={() => selectTab(group.id)} className={`text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center justify-between ${activeTag === group.id && activeSection === "products" ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
                                    <span className="capitalize">{group.name}</span>
                                    {activeTag === group.id && activeSection === "products" && <Check size={16} />}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                <main id="vendor-products" className="flex-1 px-5 lg:px-0 scroll-mt-[170px]">
                    {activeSection === "products" && (
                        <div className="animate-fade-in">
                            {categoryView ? (
                                <section data-category-section={categoryView} className="scroll-mt-[150px] pt-4 lg:pt-0">
                                    <div className="hidden lg:flex items-center gap-2 mb-6">
                                        <button onClick={() => openCategory(null)} className="w-9 h-9 rounded-full bg-brand-gray flex items-center justify-center text-brand-dark">
                                            <ArrowLeftIcon size={18} />
                                        </button>
                                        <div>
                                            <p className="text-[13px] text-brand-inactive-text">Vitrine</p>
                                            <h2 className="text-[24px] font-semibold text-brand-dark">{groupedItems.find(group => group.id === categoryView)?.name}</h2>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-6 md:gap-x-5 md:gap-y-10">
                                        {categoryItems.map(item => <ItemCard key={item.id} product={normalizeItemForCard(item, partner)} showSeller={false} className="w-full" />)}
                                    </div>
                                </section>
                            ) : (
                                <>
                                    <CouponsCarousel coupons={coupons} onCouponClick={setSelectedCoupon} />
                                    <ItemsCarousel title="Produtos destacados" items={featuredItems} partner={partner} sectionId="featured" />
                                    {groupedItems.map(group => (
                                        <ItemsCarousel key={group.id} title={group.name} items={group.items} partner={partner} sectionId={group.id} onSeeAll={() => openCategory(group.id)} />
                                    ))}
                                    {!groupedItems.length && (
                                        <IconPlaceholder placeholderType="image" imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png" imageAlt="Sem itens" title="Nenhum item encontrado" subtitle="Tente buscar por outro termo." />
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    <div className="hidden lg:block">
                        {activeSection === "info" && (
                            <div>
                                <h2 className="text-[24px] font-normal text-brand-dark mb-6">Informações de {partner.storeName}</h2>
                                <InfoTab partner={{ ...partner, rating: displayRating }} stats={{ ...stats, reviewsCount: displayReviewsCount }} />
                            </div>
                        )}
                        {activeSection === "reviews" && (
                            <div>
                                <h2 className="text-[24px] font-normal text-brand-dark mb-6">Avaliações</h2>
                                <ReviewsTab partner={{ ...partner, rating: displayRating }} stats={{ ...stats, reviewsCount: displayReviewsCount }} ratingDistribution={ratingDistribution} reviews={reviews} />
                            </div>
                        )}
                        {activeSection === "gallery" && (
                            <div>
                                <h2 className="text-[24px] font-normal text-brand-dark mb-6">Galeria</h2>
                                <GalleryTab partner={partner} isStoreOwner={isStoreOwner} gallery={gallery} setGallery={setGallery} localImages={localImages} setLocalImages={setLocalImages} />
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} url={isMounted ? window.location.href : ""} title={partner.storeName} shareMessage={shareMessage} label="Link da vitrine" />
            <ReportModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} targetType="partner" targetId={partner.id} targetName={partner.storeName} />

            <DefaultModal isOpen={!!selectedCoupon} onClose={() => setSelectedCoupon(null)} title={selectedCoupon?.code || "Cupom"} maxWidth="sm">
                {selectedCoupon && (
                    <div className="space-y-4">
                        <div className="rounded-[8px] bg-brand-gray p-4">
                            <p className="text-[28px] font-bold text-brand-dark">{formatCouponValue(selectedCoupon)}</p>
                            <p className="text-sm text-brand-inactive-text mt-1">{couponScopeLabel(selectedCoupon.apply_scope)}</p>
                        </div>
                        {Number(selectedCoupon.min_cart_value || 0) > 0 && <p className="text-sm text-brand-inactive-text">Pedido minimo de {formatCurrency(Number(selectedCoupon.min_cart_value))}.</p>}
                        {Number(selectedCoupon.max_discount_value || 0) > 0 && <p className="text-sm text-brand-inactive-text">Desconto maximo de {formatCurrency(Number(selectedCoupon.max_discount_value))}.</p>}
                        {selectedCoupon.first_purchase_only && <p className="text-sm text-brand-inactive-text">Valido apenas para primeira compra.</p>}
                        {selectedCoupon.ends_at && <p className="text-sm text-brand-inactive-text">Valido ate {formatDate(selectedCoupon.ends_at)}.</p>}
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
                        <div key={opt.value} onClick={() => { setActiveContext(opt.value as any); setCategoryView(null); setActiveTag("todos"); setIsContextModalOpen(false) }} className={`flex items-center justify-between py-5 cursor-pointer ${i < arr.length - 1 ? "border-b border-brand-border" : ""}`}>
                            <span className={`text-[16px] ${activeContext === opt.value ? "font-medium text-brand-green" : "font-normal text-brand-dark"}`}>{opt.label}</span>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${activeContext === opt.value ? "border-brand-green" : "border-brand-border"}`}>
                                {activeContext === opt.value && <div className="w-3 h-3 bg-brand-green rounded-full animate-scale-in" />}
                            </div>
                        </div>
                    ))}
                </div>
            </BottomSheet>

            <BottomSheet isOpen={isAboutPageOpen} onClose={() => setIsAboutPageOpen(false)}>
                <div className="flex flex-col">
                    <div className="px-1 py-2 flex flex-col items-center">
                        <UserProfileImage fullName={partner.storeName} imageUrl={partnerProfileImageUrl?.includes("Placeholder.png") ? null : partnerProfileImageUrl} className="w-[64px] h-[64px] border border-brand-border shrink-0 mb-3 bg-gray-50" />
                        <h2 className="text-[20px] font-bold text-brand-dark leading-none mb-1">{partner.storeName}</h2>
                        <p className="text-[13px] text-brand-inactive-text font-medium">{partner.city}, {partner.state}</p>
                    </div>
                    <div className="mt-4 mb-2 flex justify-center">
                        <StoreStats rating={displayRating} sales={stats.salesCount} createdAt={partner.createdAt} reviewsCount={displayReviewsCount} />
                    </div>
                    <div className="sticky top-0 z-40 bg-white border-b border-brand-border mb-4">
                        <Tabs value={mobileModalTab} onValueChange={(v) => setMobileModalTab(v as any)}>
                            <TabsList className="justify-center gap-6 bg-transparent">
                                <TabsTrigger value="reviews" className="text-[15px] pb-3">Avaliações</TabsTrigger>
                                <TabsTrigger value="info" className="text-[15px] pb-3">Informações</TabsTrigger>
                                <TabsTrigger value="gallery" className="text-[15px] pb-3">Galeria</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                    <div className="px-2 pb-6">
                        {mobileModalTab === "reviews" && (
                            <ReviewsTab partner={{ ...partner, rating: displayRating }} stats={{ ...stats, reviewsCount: displayReviewsCount }} ratingDistribution={ratingDistribution} reviews={reviews} />
                        )}
                        {mobileModalTab === "info" && (
                            <InfoTab partner={{ ...partner, rating: displayRating }} stats={{ ...stats, reviewsCount: displayReviewsCount }} />
                        )}
                        {mobileModalTab === "gallery" && (
                            <GalleryTab partner={partner} isStoreOwner={isStoreOwner} gallery={gallery} setGallery={setGallery} localImages={localImages} setLocalImages={setLocalImages} />
                        )}
                    </div>
                </div>
            </BottomSheet>
        </div>
    )
}

interface GalleryTabProps {
    partner: any
    isStoreOwner: boolean
    gallery: string[]
    setGallery: React.Dispatch<React.SetStateAction<string[]>>
    localImages: string[]
    setLocalImages: React.Dispatch<React.SetStateAction<string[]>>
}

function GalleryTab({ partner, isStoreOwner, gallery, setGallery, localImages, setLocalImages }: GalleryTabProps) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [isSaving, setIsSaving] = useState(false)
    const [cropModalOpen, setCropModalOpen] = useState(false)
    const [tempImageFile, setTempImageFile] = useState<File | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [selectedLightboxImage, setSelectedLightboxImage] = useState<string | null>(null)

    const planLimits = {
        free: 1,
        crescer: 5,
        escalar: 10
    }
    const limit = planLimits[partner.planSlug as 'free' | 'crescer' | 'escalar'] || 1

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.currentTarget.value = ""
        if (!file) return
        if (file.size > 3 * 1024 * 1024) return void notifyError("Máximo 3MB por imagem")
        setTempImageFile(file)
        setCropModalOpen(true)
    }

    const handleCropComplete = (croppedBase64: string) => {
        if (localImages.length >= limit) {
            notifyError(`Seu plano atual permite apenas até ${limit} imagem(ns) na galeria.`)
            return
        }
        setLocalImages(prev => [...prev, croppedBase64])
        setTempImageFile(null)
    }

    const handleRemoveImage = (indexToRemove: number) => {
        setLocalImages(prev => prev.filter((_, i) => i !== indexToRemove))
    }

    const handleCancel = () => {
        setLocalImages(gallery)
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const finalGalleryUrls = [...localImages]
            for (let i = 0; i < finalGalleryUrls.length; i++) {
                const img = finalGalleryUrls[i]
                if (img.startsWith("data:")) {
                    const blob = await (await fetch(img)).blob()
                    const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"
                    const file = new File([blob], `gallery-image-${Date.now()}-${i}.${ext}`, { type: blob.type })
                    const formData = new FormData()
                    formData.append("file", file)
                    const res = await fetchWithCSRF("/api/upload-image?uploadType=products", {
                        method: "POST",
                        body: formData
                    })
                    const data = await res.json()
                    if (data.success && data.key) {
                        finalGalleryUrls[i] = data.key
                    } else {
                        throw new Error(data.error || "Erro no upload da imagem")
                    }
                }
            }

            const result = await updatePartnerAction(partner.id, {
                gallery: finalGalleryUrls,
                userId: partner.userId || partner.user_id,
            })

            if (result?.error) {
                notifyError(result.error)
            } else {
                notifySuccess("Galeria atualizada com sucesso!")
                setGallery(finalGalleryUrls)
            }
        } catch (err: any) {
            notifyError(err.message || "Erro ao salvar galeria")
        } finally {
            setIsSaving(false)
        }
    }

    const isDirty = JSON.stringify(localImages) !== JSON.stringify(gallery)

    return (
        <div className="pb-10 animate-fade-in relative">
            {localImages.length === 0 && !isStoreOwner ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-inactive-text"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                    </div>
                    <h3 className="text-md font-semibold text-brand-dark">Galeria de imagens vazia</h3>
                    <p className="text-[13px] text-brand-inactive-text mt-1">Este vendedor ainda não adicionou fotos ao perfil.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {localImages.map((img, idx) => {
                        const srcUrl = img.startsWith("data:") ? img : getR2ImageUrl(img)
                        return (
                            <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border border-brand-border bg-brand-gray group shadow-sm">
                                <img
                                    src={srcUrl}
                                    alt={`Galeria ${idx + 1}`}
                                    className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                                    onClick={() => setSelectedLightboxImage(srcUrl)}
                                />
                                {isStoreOwner && (
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-10">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveImage(idx);
                                            }}
                                            className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                                            title="Remover imagem"
                                        >
                                            <TrashIcon size={18} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {isStoreOwner && localImages.length < limit && (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="relative aspect-square rounded-2xl border-2 border-dashed border-gray-300 hover:border-brand-green dark:border-white/10 dark:hover:border-brand-green flex flex-col items-center justify-center cursor-pointer transition-colors hover:bg-brand-green/[0.02]"
                        >
                            <PlusIcon size={24} className="text-brand-inactive-text hover:text-brand-green transition-colors mb-2" />
                            <span className="text-[13px] font-semibold text-brand-dark">Adicionar foto</span>
                            <span className="text-[11px] text-brand-inactive-text mt-1">{localImages.length} de {limit}</span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={handleFileChange}
                            />
                        </div>
                    )}
                </div>
            )}

            {isStoreOwner && isDirty && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/90 dark:bg-dark-surface/90 border border-brand-border dark:border-dark-border backdrop-blur-md px-6 py-4 rounded-2xl shadow-xl flex items-center gap-6 animate-slide-up max-w-[90%] md:max-w-md w-full justify-between">
                    <div className="flex flex-col">
                        <span className="text-[13px] font-bold text-brand-dark">Alterações pendentes</span>
                        <span className="text-[11px] text-brand-inactive-text">Galeria modificada ({localImages.length} de {limit})</span>
                    </div>
                    <div className="flex gap-2.5">
                        <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSaving} className="h-9 px-3">
                            Descartar
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-9 px-4 flex items-center gap-1.5 bg-brand-green hover:bg-brand-green-hover text-white border-none">
                            {isSaving && <Spinner size={14} className="text-white" />}
                            Salvar
                        </Button>
                    </div>
                </div>
            )}

            <ImageCropperModal
                isOpen={cropModalOpen}
                onClose={() => {
                    setCropModalOpen(false)
                    setTempImageFile(null)
                }}
                imageFile={tempImageFile}
                onCropComplete={handleCropComplete}
                aspectRatio={1}
            />

            {selectedLightboxImage && (
                <div
                    className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setSelectedLightboxImage(null)}
                >
                    <button
                        className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                        onClick={() => setSelectedLightboxImage(null)}
                    >
                        ✕
                    </button>
                    <img
                        src={selectedLightboxImage}
                        alt="Visualização em tela cheia"
                        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl selection:bg-transparent"
                    />
                </div>
            )}
        </div>
    )
}
