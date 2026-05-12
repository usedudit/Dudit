"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Search, StarIcon, ArrowLeftIcon, MapPinIcon, ChevronRightIcon, ChevronLeftIcon, ShareIcon, HeartIcon, WhatsappIcon, FlagIcon, Check, InfoIcon, TagIcon, Package } from "@/lib/icons"
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
import { Button, DefaultModal, Input } from "@/components/reusable"
import { ItemCard } from "./shared-components"

interface VendorPageClientProps {
    partner: any
    products: any[]
    services: any[]
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
    const text = encodeURIComponent(`Ola, ${storeName || "tudo bem"}! Vi sua loja na Dudit e gostaria de saber mais.`)
    window.open(`https://wa.me/${number}?text=${text}`, "_blank")
}

const normalizeItemForCard = (item: any, partner: any) => {
    const price = (!item.promotional_price && item.fallback_variant_price)
        ? item.fallback_variant_price
        : (item.promotional_price || item.price || 0)

    return {
        ...item,
        price,
        originalPrice: item.promotional_price ? item.price : undefined,
        images: item.images?.length ? item.images : item.fallback_variant_image ? [item.fallback_variant_image] : item.images,
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
    if (coupon.discount_type === "free_shipping") return "Frete gratis"
    if (coupon.discount_type === "percentage") return `${Number(coupon.discount_value || 0)}% OFF`
    return `${formatCurrency(Number(coupon.discount_value || 0))} OFF`
}

const couponScopeLabel = (scope?: string) => {
    if (scope === "products") return "Produtos selecionados"
    if (scope === "services") return "Servicos selecionados"
    if (scope === "categories") return "Categorias selecionadas"
    return "Toda a loja"
}

const RatingInline = ({ rating, reviewsCount }: { rating: number; reviewsCount: number }) => (
    <div className="flex items-center gap-1.5 text-[12px] lg:text-[13px] text-brand-dark">
        <StarIcon size={14} className="text-brand-green fill-brand-green" />
        {reviewsCount > 0 && rating > 0 ? (
            <>
                <span className="font-semibold">{formatNumber(rating, 1, 1)}</span>
                <span className="text-brand-inactive-text">({reviewsCount} avaliacoes)</span>
            </>
        ) : (
            <span className="text-brand-inactive-text">Sem avaliacoes</span>
        )}
    </div>
)

const StoreStats = ({ rating, sales, createdAt, reviewsCount }: any) => (
    <div className="flex items-center justify-between mb-8">
        <StatItem
            value={reviewsCount > 0 && rating > 0 ? formatNumber(rating, 1, 1) : "Sem avaliacoes"}
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

const InfoTab = ({ partner, stats, onWhatsApp, showContact }: any) => {
    const hoursList = formatOpeningHoursList(partner.openingHours)
    const paymentMethodsArr = partner.paymentMethods || []
    const paymentIcons = [
        paymentMethodsArr.some((pm: any) => pm.type === "pix" && pm.is_active) && { id: "pix", icon: "https://img.dudit.com.br/static/icons/payments/Pix.png" },
        paymentMethodsArr.some((pm: any) => pm.type === "cash" && pm.is_active) && { id: "dinheiro", icon: "https://img.dudit.com.br/static/icons/payments/Dinheiro.png" },
        paymentMethodsArr.some((pm: any) => ["credit_card", "debit_card"].includes(pm.type) && pm.is_active) && { id: "visa", icon: "https://img.dudit.com.br/static/icons/payments/Visa.png" },
    ].filter(Boolean) as Array<{ id: string; icon: string }>

    return (
        <div className="pb-10 space-y-8 animate-fade-in">
            <div className="hidden lg:block">
                <StoreStats rating={partner.rating} sales={stats.salesCount} createdAt={partner.createdAt} reviewsCount={stats.reviewsCount} />
                <div className="h-[1px] bg-brand-border w-full mb-8" />
            </div>

            {partner.storeDescription && (
                <>
                    <div>
                        <h3 className="text-[18px] font-semibold text-brand-dark mb-4">Sobre {partner.storeName}</h3>
                        <p className="text-[15px] text-brand-inactive-text leading-relaxed whitespace-pre-wrap">{partner.storeDescription}</p>
                    </div>
                    <div className="h-[1px] bg-brand-border w-full" />
                </>
            )}

            <div>
                <h3 className="text-[18px] font-semibold text-brand-dark mb-4">Informacoes</h3>
                <div className="space-y-3 text-[14px] text-brand-inactive-text">
                    <p>{partner.city}, {partner.state}</p>
                    {partner.neighborhood && <p>{partner.neighborhood}</p>}
                </div>
                {showContact && (
                    <Button variant="filled" onClick={onWhatsApp} className="mt-5 rounded-full h-11 px-5 gap-2">
                        <WhatsappIcon size={18} /> Contato
                    </Button>
                )}
            </div>
            <div className="h-[1px] bg-brand-border w-full" />

            {paymentIcons.length > 0 && (
                <>
                    <div>
                        <h3 className="text-[18px] font-semibold text-brand-dark mb-4">Formas de pagamento</h3>
                        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
                            {paymentIcons.map(pm => (
                                <div key={pm.id} className="w-[42px] h-[30px] rounded-[4px] border border-brand-border bg-white flex items-center justify-center p-1 shrink-0">
                                    <img src={pm.icon} alt={pm.id} className="w-full h-full object-contain" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="h-[1px] bg-brand-border w-full" />
                </>
            )}

            {hoursList.length > 0 && (
                <>
                    <div>
                        <h3 className="text-[18px] font-semibold text-brand-dark mb-4">Horario de Funcionamento</h3>
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
                <h3 className="text-[18px] font-semibold text-brand-dark mb-4">Endereco</h3>
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
                            <span className="text-[13px] text-brand-inactive-text font-medium mt-2">media de {stats.reviewsCount} avaliacoes</span>
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
                <IconPlaceholder placeholderType="image" imageSrc="https://img.dudit.com.br/static/mascots/Avaliacoes.png" imageAlt="Sem avaliacoes" title="Ainda nao temos avaliacoes por aqui" subtitle="Seja o primeiro a contar para a comunidade como foi sua experiencia!" />
            )}
        </div>
    )
}

function CarouselNav({ targetRef, showSeeAll, onSeeAll }: { targetRef: React.RefObject<HTMLDivElement | null>; showSeeAll?: boolean; onSeeAll?: () => void }) {
    const scroll = (dir: number) => targetRef.current?.scrollBy({ left: dir * 720, behavior: "smooth" })
    return (
        <div className="flex items-center gap-2">
            {showSeeAll && <button onClick={onSeeAll} className="text-[13px] font-bold text-brand-green hover:underline px-2">Ver todos</button>}
            <Button variant="filled" onClick={() => scroll(-1)} className="h-9 w-9 p-0 rounded-full bg-brand-gray text-brand-dark hover:bg-gray-200">
                <ChevronLeftIcon size={18} />
            </Button>
            <Button variant="filled" onClick={() => scroll(1)} className="h-9 w-9 p-0 rounded-full">
                <ChevronRightIcon size={18} />
            </Button>
        </div>
    )
}

function ItemsCarousel({ title, items, partner, onSeeAll, sectionId }: { title: string; items: any[]; partner: any; onSeeAll?: () => void; sectionId?: string }) {
    const ref = useRef<HTMLDivElement>(null)
    if (!items.length) return null
    return (
        <section id={sectionId} data-category-section={sectionId} className="scroll-mt-[150px] mb-10 lg:mb-12">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-[20px] lg:text-[22px] font-semibold text-brand-dark">{title}</h2>
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
                <h2 className="text-[20px] lg:text-[22px] font-semibold text-brand-dark">Cupons do parceiro</h2>
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
                            className="p-4 rounded-[8px]"
                        />
                    </div>
                ))}
            </div>
        </section>
    )
}

export function VendorPageClient({ partner, products, services, reviews, stats, ratingDistribution, productCategories, serviceCategories, coupons = [], userProfile, cartCount }: VendorPageClientProps) {
    const [activeTag, setActiveTag] = useState("todos")
    const [activeSection, setActiveSection] = useState<"products" | "reviews" | "info">("products")
    const [activeContext, setActiveContext] = useState<"Produtos" | "Servicos">("Produtos")
    const [categoryView, setCategoryView] = useState<string | null>(null)
    const [isContextModalOpen, setIsContextModalOpen] = useState(false)
    const [mobileModalTab, setMobileModalTab] = useState<"reviews" | "info">("reviews")
    const [isAboutPageOpen, setIsAboutPageOpen] = useState(false)
    const [searchValue, setSearchValue] = useState("")
    const [showShareModal, setShowShareModal] = useState(false)
    const [showReportModal, setShowReportModal] = useState(false)
    const [selectedCoupon, setSelectedCoupon] = useState<any>(null)
    const [isMounted, setIsMounted] = useState(false)
    const [isStickyVisible, setIsStickyVisible] = useState(false)
    const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false)
    const [canScrollTabsRight, setCanScrollTabsRight] = useState(false)
    const tabsScrollRef = useRef<HTMLDivElement>(null)
    const topRef = useRef<HTMLDivElement>(null)
    const { user } = useSupabase()
    const isStoreOwner = user?.id === partner.userId || user?.id === partner.user_id

    useEffect(() => { setIsMounted(true) }, [])

    const partnerRawImage = partner.store_avatar || partner.store_image_url || partner.profile_image_url || partner.storeImageUrl || null
    const partnerProfileImageUrl = getImageUrl(partnerRawImage)
    const fallbackBanner = partnerRawImage ? getRandomDefaultBanner() : getBannerUrlByColor(getAvatarColor(partner.storeName || "Vendedor"))
    const bannerImage = partner.banner_url ? getImageUrl(partner.banner_url) : fallbackBanner

    const currentItems = activeContext === "Produtos" ? products : services
    const currentCategories = activeContext === "Produtos" ? productCategories : serviceCategories
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
    const scrollToProducts = () => document.getElementById("vendor-products")?.scrollIntoView({ behavior: "smooth", block: "start" })
    const openCategory = (tag: string | null) => {
        setActiveSection("products")
        setCategoryView(tag)
        setActiveTag(tag || "todos")
        setTimeout(scrollToProducts, 0)
    }
    const selectTab = (tag: string) => {
        if (tag === "todos") openCategory(null)
        else if (tag === "featured") {
            setCategoryView(null)
            setActiveTag("featured")
            document.getElementById("featured")?.scrollIntoView({ behavior: "smooth", block: "start" })
        } else openCategory(tag)
    }

    const categoryItems = categoryView
        ? groupedItems.find(group => group.id === categoryView)?.items || []
        : []

    const shareMessage = useMemo(() => `Olha essa loja na Dudit!\n\n*${partner.storeName}*\nConfere aqui os produtos:`, [partner.storeName])

    return (
        <div className="container mx-auto px-0 lg:px-4 max-w-[1300px] animate-fade-in lg:mt-6">
            <MarketplaceHeader
                productName={partner.storeName}
                storeSearchPlaceholder={`Buscar em ${partner.storeName}`}
                storeSearchValue={searchValue}
                onStoreSearchChange={setSearchValue}
                userProfile={userProfile}
                cartCount={cartCount}
            />

            <div className={`hidden lg:block fixed top-[108px] left-0 right-0 bg-white border-b border-brand-border z-[80] transition-all duration-200 ${isStickyVisible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0 pointer-events-none"}`}>
                <div className="max-w-[1300px] mx-auto px-4 h-[76px] flex items-center gap-4">
                    <UserProfileImage fullName={partner.storeName} imageUrl={partnerProfileImageUrl?.includes("Placeholder.png") ? null : partnerProfileImageUrl} className="w-12 h-12 border border-brand-border shrink-0 bg-gray-50" />
                    <div className="min-w-0">
                        <h2 className="text-[17px] font-bold text-brand-dark truncate">{partner.storeName}</h2>
                        <div className="flex items-center gap-2 text-[12px] text-brand-inactive-text">
                            <span>{partner.city}, {partner.state}</span>
                            {partner.distance_km_formatted && <span>{partner.distance_km_formatted}</span>}
                            <RatingInline rating={partner.rating} reviewsCount={stats.reviewsCount} />
                        </div>
                    </div>
                    <div className="ml-auto w-[420px]">
                        <Input variant="full-rounded" value={searchValue} onChange={e => setSearchValue(e.target.value)} placeholder={`Buscar em ${partner.storeName}`} prefix={<Search size={17} />} />
                    </div>
                </div>
            </div>

            <div ref={topRef}>
                <div className="w-full h-[180px] lg:h-[220px] lg:rounded-2xl lg:mb-4 overflow-hidden relative">
                    <img src={bannerImage} alt="Banner" className="w-full h-full object-cover object-center" />
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
                                <div className="mt-1.5"><RatingInline rating={partner.rating} reviewsCount={stats.reviewsCount} /></div>
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

            <div className={`lg:hidden fixed top-[55px] left-0 right-0 z-[45] bg-white border-b border-brand-border shadow-sm transition-all duration-200 ${isStickyVisible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
                <div className="flex items-center gap-1 px-3 py-2">
                    <button onClick={() => setIsContextModalOpen(true)} className="w-9 h-9 shrink-0 flex items-center justify-center text-brand-dark">
                        {activeContext === "Produtos" ? <Package size={19} /> : <HeartIcon size={19} />}
                    </button>
                    {canScrollTabsLeft && <button onClick={() => tabsScrollRef.current?.scrollBy({ left: -160, behavior: "smooth" })} className="w-8 h-9 shrink-0 flex items-center justify-center text-brand-dark"><ChevronLeftIcon size={18} /></button>}
                    <div ref={tabsScrollRef} className="flex-1 overflow-x-auto hide-scrollbar">
                        <Tabs value={activeTag} onValueChange={selectTab}>
                            <TabsList className="border-0 pb-0 pt-0 gap-5 bg-transparent">
                                {allTabs.map(tab => (
                                    <TabsTrigger id={`vendor-tab-${tab.id}`} key={tab.id} value={tab.id} className="pb-1 whitespace-nowrap text-brand-inactive-text data-[state=active]:text-brand-green data-[state=active]:font-bold bg-transparent data-[state=active]:bg-transparent">
                                        {tab.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>
                    {canScrollTabsRight && <button onClick={() => tabsScrollRef.current?.scrollBy({ left: 160, behavior: "smooth" })} className="w-8 h-9 shrink-0 flex items-center justify-center text-brand-dark"><ChevronRightIcon size={18} /></button>}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-10 px-0 pb-20">
                <aside className="hidden lg:block w-[260px] shrink-0">
                    <div className="sticky top-[198px] z-20 bg-white pt-0">
                        <div className="mb-8">
                            <h3 className="font-normal text-brand-dark text-[16px] mb-3">Sobre {partner.storeName}</h3>
                            <div className="flex flex-col gap-1">
                                {([{ id: "reviews", label: "Avaliacoes" }, { id: "info", label: "Informacoes" }] as const).map(b => (
                                    <button key={b.id} onClick={() => setActiveSection(b.id)} className={`w-full text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center gap-3 ${activeSection === b.id ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
                                        <span>{b.label}</span>
                                        {activeSection === b.id && <Check size={16} className="ml-auto" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <h3 className="font-normal text-brand-dark text-[16px] mb-4">{activeContext}</h3>
                        <div className="flex flex-col gap-1 mb-8">
                            {featuredItems.length > 0 && (
                                <button onClick={() => selectTab("featured")} className={`text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center justify-between ${activeTag === "featured" && activeSection === "products" ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
                                    <span>Itens destacados</span>
                                    {activeTag === "featured" && activeSection === "products" && <Check size={16} />}
                                </button>
                            )}
                            <button onClick={() => openCategory(null)} className={`text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center justify-between ${activeTag === "todos" && activeSection === "products" ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
                                <span>Todos</span>
                                {activeTag === "todos" && activeSection === "products" && <Check size={16} />}
                            </button>
                            {groupedItems.map(group => (
                                <button key={group.id} onClick={() => openCategory(group.id)} className={`text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center justify-between ${activeTag === group.id && activeSection === "products" ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
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
                                <section data-category-section={categoryView} className="scroll-mt-[150px]">
                                    <div className="flex items-center gap-2 mb-6">
                                        <button onClick={() => openCategory(null)} className="w-9 h-9 rounded-full bg-brand-gray flex items-center justify-center text-brand-dark">
                                            <ArrowLeftIcon size={18} />
                                        </button>
                                        <div>
                                            <p className="text-[13px] text-brand-inactive-text">Loja</p>
                                            <h2 className="text-[24px] font-semibold text-brand-dark">{groupedItems.find(group => group.id === categoryView)?.name}</h2>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-10">
                                        {categoryItems.map(item => <ItemCard key={item.id} product={normalizeItemForCard(item, partner)} showSeller={false} />)}
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
                                        <IconPlaceholder placeholderType="image" imageSrc="https://img.dudit.com.br/static/mascots/Produtos.png" imageAlt="Sem itens" title="Nenhum item encontrado" subtitle="Tente buscar por outro termo." />
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    <div className="hidden lg:block">
                        {activeSection === "info" && (
                            <div>
                                <h2 className="text-[24px] font-normal text-brand-dark mb-6">Informacoes de {partner.storeName}</h2>
                                <InfoTab partner={partner} stats={stats} onWhatsApp={handleWhatsApp} showContact />
                            </div>
                        )}
                        {activeSection === "reviews" && (
                            <div>
                                <h2 className="text-[24px] font-normal text-brand-dark mb-6">Avaliacoes</h2>
                                <ReviewsTab partner={partner} stats={stats} ratingDistribution={ratingDistribution} reviews={reviews} />
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
                    {["Produtos", "Servicos"].map((opt, i) => (
                        <div key={opt} onClick={() => { setActiveContext(opt as any); setCategoryView(null); setActiveTag("todos"); setIsContextModalOpen(false) }} className={`flex items-center justify-between py-5 cursor-pointer ${i === 0 ? "border-b border-brand-border" : ""}`}>
                            <span className={`text-[16px] ${activeContext === opt ? "font-medium text-brand-green" : "font-normal text-brand-dark"}`}>{opt === "Servicos" ? "Servicos" : opt}</span>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${activeContext === opt ? "border-brand-green" : "border-brand-border"}`}>
                                {activeContext === opt && <div className="w-3 h-3 bg-brand-green rounded-full animate-scale-in" />}
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
                        <StoreStats rating={partner.rating} sales={stats.salesCount} createdAt={partner.createdAt} reviewsCount={stats.reviewsCount} />
                    </div>
                    <div className="sticky top-0 z-40 bg-white border-b border-brand-border mb-4">
                        <Tabs value={mobileModalTab} onValueChange={(v) => setMobileModalTab(v as any)}>
                            <TabsList className="justify-center gap-8 bg-transparent">
                                <TabsTrigger value="reviews" className="text-[15px] pb-3">Avaliacoes</TabsTrigger>
                                <TabsTrigger value="info" className="text-[15px] pb-3">Informacoes</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                    <div className="px-2 pb-6">
                        {mobileModalTab === "reviews"
                            ? <ReviewsTab partner={partner} stats={stats} ratingDistribution={ratingDistribution} reviews={reviews} />
                            : <InfoTab partner={partner} stats={stats} onWhatsApp={handleWhatsApp} showContact={false} />}
                    </div>
                </div>
            </BottomSheet>
        </div>
    )
}
