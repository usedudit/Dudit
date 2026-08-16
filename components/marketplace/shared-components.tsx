"use client"

import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from "react"
import { HeartIcon, StarIcon, ChevronRightIcon, ChevronLeftIcon, ShieldIcon, InfoIcon, EditIcon, TagIcon, ClockIcon, EnergyIcon } from "@/lib/icons"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { getAvatarColor, getBannerUrlByColor, UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getProductUrl, getStoreUrl, getServiceUrl, getPlanUrl } from "@/lib/utils/url-generator"
import { formatCurrency } from "@/lib/utils";
import { getBillingUnitSuffix } from "@/lib/utils/formatters"
import { getRandomDefaultBanner } from "@/lib/utils/banner"
import { useFavorites } from "@/providers/favorites-provider"
import { useSupabase } from "@/providers/supabase-provider"
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import { computeItemDisplayPrice } from "@/lib/services/pricing-engine"
import { getLocationLabel, type LocationContext } from "@/lib/utils/location-label"

const HOME_BANNERS = [
    { id: 1, src: 'https://img.dudit.com.br/static/banners/Banner-1.png', alt: 'Venda aqui' },
    { id: 2, src: 'https://img.dudit.com.br/static/banners/Banner-2.png', alt: 'Gerencie tudo' },
];

const HOME_CATEGORIES = [
    { name: 'Decoração', image: 'https://img.dudit.com.br/static/Placeholder.png' },
];

export const HeroBanner: React.FC<{ height?: number }> = ({ height = 300 }) => {
    return (
        <section className="mt-6 mb-12 px-4 lg:px-0 group flex justify-center w-full">
            <div className="relative w-full max-w-[1400px] rounded-xl lg:rounded-2xl overflow-hidden cursor-pointer select-none transition-all duration-300 bg-gray-100 aspect-[2.65/1] md:aspect-auto md:h-[300px] dark:bg-dark-border/50">
                <img
                    src="https://img.dudit.com.br/cdn-cgi/image/width=1400,format=auto,quality=85/static/banners/Banner-1.png"
                    srcSet="https://img.dudit.com.br/cdn-cgi/image/width=750,format=auto,quality=80/static/banners/Banner-1.png 750w, https://img.dudit.com.br/cdn-cgi/image/width=1400,format=auto,quality=85/static/banners/Banner-1.png 1400w"
                    sizes="(max-width: 768px) 100vw, 1400px"
                    alt="Dudit"
                    width={1400}
                    height={528}
                    className="w-full h-full object-cover object-center transition-transform duration-500"
                    fetchPriority="high"
                    decoding="async"
                />
            </div>
        </section>
    );
};

interface VitrineCardProps {
    vitrine: any
    hideCity?: boolean
    className?: string
    locationContext?: LocationContext | null
}

export const VitrineCard: React.FC<VitrineCardProps> = memo(({ vitrine, hideCity = false, className = "w-[280px] md:w-[320px]", locationContext = null }) => {
    // Resolve partner object (handle array or object)
    const rawPartner = Array.isArray(vitrine.partners) ? vitrine.partners[0] : vitrine.partners
    const partner = rawPartner || {}
    const storeName = partner.name || partner.store_name || vitrine.name || "Vendedor"
    const rawStoreAvatar =
        partner.store_avatar ||
        partner.store_image_url ||
        partner.profile_image_url ||
        null
    const storeAvatar = rawStoreAvatar ? getR2ImageUrl(rawStoreAvatar, "thumb") : null
    const hasPartnerLogo = !!rawStoreAvatar && !String(rawStoreAvatar).includes("Placeholder.png")

    // Resolve banner logic strictly using banner_url (never logo_url)
    const rawBanner = vitrine.banner_url || partner.banner_url || null
    const bannerUrl = rawBanner && !rawBanner.includes("Placeholder.png") ? rawBanner : null
    const fallbackBanner = hasPartnerLogo
        ? getRandomDefaultBanner()
        : getBannerUrlByColor(getAvatarColor(storeName))
    const bannerImage = bannerUrl ? getR2ImageUrl(bannerUrl, "large") : fallbackBanner
    const city = partner.city || vitrine.city || ""
    const state = partner.state || vitrine.state || ""
    const category = vitrine.category || partner.category || (typeof partner.category === "string" ? partner.category : null)
    const reviewsCount = partner.reviewsCount ?? vitrine.reviewsCount ?? 0
    const showRating = (vitrine.rating ?? partner.rating ?? 0) > 0
    const locationLabel = getLocationLabel(partner, locationContext)

    return (
        <Link
            href={getStoreUrl({ ...partner, ...vitrine })}
            prefetch={false}
            className={`flex flex-col group cursor-pointer active:scale-[0.98] transition-all duration-300 ${className}`}
        >
            <div className="relative w-full aspect-[2.65/1] rounded-[16px] overflow-hidden bg-gray-100 mb-3 shrink-0 dark:bg-dark-border/50">
                <img
                    src={bannerImage}
                    alt={storeName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                />
                <div className="absolute inset-0" />
            </div>

            <div className="flex items-center gap-3 px-1">
                <UserProfileImage
                    fullName={storeName}
                    imageUrl={storeAvatar && !storeAvatar.includes("Placeholder.png") ? storeAvatar : null}
                    className="w-12 h-12 border border-brand-border shrink-0 bg-gray-50 dark:bg-dark-border/30"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="font-bold text-brand-dark text-base truncate dark:text-dark-heading">
                            {storeName}
                        </h3>
                        {showRating && (
                            <div className="flex items-center gap-0.5 shrink-0 ml-0.5">
                                <StarIcon size={10} className="text-brand-green fill-brand-green" />
                                <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">{Number(vitrine.rating ?? partner.rating).toFixed(1)}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[13px] text-brand-inactive-text mt-0.5 dark:text-dark-body">
                        {category && (
                            <>
                                <span className="font-medium truncate">{category}</span>
                                {locationLabel && (
                                    <span className="w-1 h-1 rounded-full bg-brand-inactive-text shrink-0" />
                                )}
                            </>
                        )}
                        {locationLabel && (
                            <span className="font-medium truncate">{locationLabel}</span>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    )
})

interface CategoryListProps {
    vitrines?: any[]
}

export const CategoryList: React.FC<CategoryListProps> = ({ vitrines = [] }) => {
    return (
        <section className="mx-auto mb-16 max-w-[1400px]">
            <div className="px-4 lg:px-0 mb-8 flex items-end justify-between">
                <div>
                    <h2 className="text-2xl md:text-[32px] font-bold text-brand-dark mb-1 leading-tight dark:text-dark-heading">Vitrines Populares</h2>
                    <div className="text-gray-500 font-normal text-sm md:text-base dark:text-dark-body">Explore lojas e encontre itens únicos da sua região.</div>
                </div>
                <Link
                    prefetch={false}
                    href="/explorar?type=vitrines"
                    className="hidden md:flex font-bold text-brand-green hover:underline text-sm mb-1 items-center gap-1"
                >
                    Ver todas <ChevronRightIcon size={16} />
                </Link>
            </div>

            <div className="flex overflow-x-auto gap-4 md:gap-6 px-4 lg:px-0 scrollbar-hide pb-4 snap-x snap-mandatory">
                {vitrines.length > 0 ? (
                    vitrines.slice(0, 8).map((vitrine) => (
                        <div key={vitrine.id} className="snap-start">
                            <VitrineCard vitrine={vitrine} />
                        </div>
                    ))
                ) : (
                    HOME_CATEGORIES.map((cat) => (
                        <Link href={`/explorar?q=${cat.name}`} key={cat.name} prefetch={false} className="flex flex-col gap-3 min-w-[100px] items-center text-center group snap-start">
                            <div className="w-[100px] h-[100px] md:w-[120px] md:h-[120px] rounded-full overflow-hidden border border-gray-100 transition-all dark:border-dark-border">
                                <img
                                    src={cat.image || "https://img.dudit.com.br/static/Placeholder.png"}
                                    alt={cat.name}
                                    className="w-full h-full object-cover transition-transform duration-500"
                                    loading="lazy"
                                />
                            </div>
                            <span className="font-semibold text-gray-800 text-xs md:text-sm group-hover:text-brand-green transition-colors dark:text-dark-heading">{cat.name}</span>
                        </Link>
                    ))
                )}
            </div>
        </section>
    );
};

export const InfoSection: React.FC = () => {
    const items = [
        { title: 'O cliente é seu', text: 'Sem canais intermediários blindando vendas. Você controla a carteira de clientes, fidelizando-os mais a cada compra.', icon: <InfoIcon size={28} className="text-brand-green" strokeWidth={2} /> },
        { title: 'Sem cobrança de comissões', text: 'Você sabe tudo que gasta antes. Sem sustos com 15% ou 20% das suas vendas sendo engolidas pela taxa da plataforma.', icon: <ShieldIcon size={28} className="text-brand-green" strokeWidth={2} /> },
        { title: 'Personalize como quiser', text: 'Configure produtos e variações localmente. Tenha uma vitrine fiel ao rosto real da sua marca física.', icon: <EditIcon size={28} className="text-brand-green" strokeWidth={2} /> },
        { title: 'Sistema Completo e Simples', text: 'Nada de telas de ERP complexas. Entenda exatamente seu fluxo de caixa desde o balcão até a entrega final.', icon: <HeartIcon size={28} className="text-brand-green" strokeWidth={2} /> }
    ];

    return (
        <section className="mb-16">
            <div className="mx-auto max-w-[1400px]">
                <h2 className="text-2xl md:text-[32px] font-bold text-brand-dark mb-8 px-4 lg:px-0 dark:text-dark-heading">Vender online nunca foi tão simples</h2>
                <div className="flex overflow-x-auto gap-4 md:gap-6 px-4 lg:px-0 scrollbar-hide pb-4 snap-x">
                    {items.map((item, idx) => (
                        <div key={idx} className="bg-[#ffebe5] p-6 rounded-[16px] min-w-[260px] md:flex-1 flex flex-col items-start gap-4 snap-center cursor-pointer transition-shadow dark:bg-[#2a2417]">
                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center dark:bg-dark-surface">
                                {item.icon}
                            </div>
                            <div>
                                <h3 className="font-bold text-brand-dark text-lg mb-2 leading-tight dark:text-dark-heading">{item.title}</h3>
                                <p className="text-gray-600 text-sm leading-relaxed dark:text-dark-body">{item.text}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

interface ItemCardProps {
    product: {
        id: string
        name: string
        price: number
        images?: string[]
        originalPrice?: number
        slug?: string
        rating?: number
        reviews?: number
        partners?: {
            store_name: string
            store_avatar?: string
            profile_image_url?: string
            store_image_url?: string
            latitude?: number | null
            longitude?: number | null
            distance_km?: number | null
            distance_km_formatted?: string | null
            city?: string | null
            state?: string | null
            neighborhood?: string | null
        }
    }
    userCoords?: { lat: number; lng: number } | null
    showSeller?: boolean
    promotions?: any[]
    hidePromoBadge?: boolean
    hideSalesCount?: boolean
    className?: string
    locationContext?: LocationContext | null
}

// Simple client-side cache for partner promotions to avoid redundant network requests
const promotionsCache: Record<string, Promise<any[]>> = {}
const promotionsValueCache: Record<string, any[]> = {}

function getCachedPartnerPromotions(partnerId: string) {
    if (!promotionsCache[partnerId]) {
        promotionsCache[partnerId] = listActivePromotionsForMarketplaceAction(partnerId)
            .then(res => {
                const arr = Array.isArray(res) ? res : []
                promotionsValueCache[partnerId] = arr
                return arr
            })
            .catch(() => {
                promotionsValueCache[partnerId] = []
                return []
            })
    }
    return promotionsCache[partnerId]
}

export const ItemCard: React.FC<ItemCardProps> = memo(({ product, userCoords, showSeller = true, className = "w-[200px] md:w-[230px]", promotions: preloadedPromotions, hidePromoBadge, hideSalesCount, locationContext = null }) => {
    const { user } = useSupabase()
    const router = useRouter()
    const { isFavorited, toggleFavorite } = useFavorites()
    const imageUrl = getPrimaryProductDisplayImage(product, "medium")
    const rawDistance = product.partners?.distance_km_formatted || null
    const distance = rawDistance && !rawDistance.includes("Infinity") ? rawDistance : null
    const partner = Array.isArray(product.partners) ? product.partners[0] : product.partners
    const partnerUserId = (partner as any)?.user_id
    const isOwner = !!(user && partnerUserId && user.id === partnerUserId)
    const itemType = (product as any).itemType === "plano" ? "plano" : ((product as any).itemType === "servico" ? "servico" : "produto")
    const favorited = itemType !== "plano" ? isFavorited(product.id, itemType) : false
    const handleFavoriteClick = useCallback(async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (isOwner) return
        if (!user) return router.push("/auth/login?next=" + encodeURIComponent(window.location.pathname))
        if (itemType === "plano") return
        await toggleFavorite(product.id, itemType as "produto" | "servico")
    }, [user, router, toggleFavorite, product.id, itemType, isOwner])

    const rawPartnerImage = partner?.store_avatar || partner?.store_image_url || partner?.profile_image_url || null
    const partnerImageUrl = rawPartnerImage ? getR2ImageUrl(rawPartnerImage, "thumb") : null
    const partnerId = partner?.id || null
    const sellerName = partner?.store_name || (product.partners as any)?.store_name || 'Vendedor'
    const sellerCategory = (product as any).category as string | null | undefined
    const sellerSubcategory = (product as any).subcategoryName as string | null | undefined
    const sellerLabel = sellerSubcategory || sellerCategory || null
    const locationLabel = getLocationLabel(partner, locationContext)

    const preloadedPromos = (product as any)._promotions || preloadedPromotions

    const [activePromotions, setActivePromotions] = useState<any[]>(() => {
        if (preloadedPromos) return preloadedPromos
        if (partnerId && promotionsValueCache[partnerId]) {
            return promotionsValueCache[partnerId]
        }
        return []
    })

    useEffect(() => {
        if (preloadedPromos || !partnerId || promotionsValueCache[partnerId]) {
            return
        }
        getCachedPartnerPromotions(partnerId).then((promos) => {
            if (promos && promos.length > 0) {
                setActivePromotions(promos)
            }
        })
    }, [partnerId, preloadedPromos])

    const variantLowestPrice = useMemo(() => {
        const variants = (product as any).product_variants || (product as any).variants
        if (!variants || variants.length === 0) {
            if ((product as any).fallback_variant_price != null && Number((product as any).fallback_variant_price) > 0) {
                return Number((product as any).fallback_variant_price)
            }
            return null
        }
        const activeVariants = variants.filter((v: any) => v.is_active !== false)
        if (activeVariants.length === 0) {
            if ((product as any).fallback_variant_price != null && Number((product as any).fallback_variant_price) > 0) {
                return Number((product as any).fallback_variant_price)
            }
            return null
        }
        const basePrice = Number(product.originalPrice) || Number(product.price) || 0
        const prices = activeVariants
            .map((v: any) => {
                const adj = Number(v.price_adjustment ?? v.price ?? 0)
                if (adj > 0) return adj
                return basePrice > 0 ? basePrice : 0
            })
            .filter((p: number) => p > 0)

        if (prices.length > 0) {
            return Math.min(...prices)
        }
        if ((product as any).fallback_variant_price != null && Number((product as any).fallback_variant_price) > 0) {
            return Number((product as any).fallback_variant_price)
        }
        return null
    }, [(product as any).product_variants, (product as any).variants, (product as any).fallback_variant_price, product.price, product.originalPrice])

    const pricing = useMemo(() => {
        const hasVariants = !!(product as any).product_variants?.length || !!(product as any).variants?.length || !!(product as any).fallback_variant_price
        const basePrice = Number(product.originalPrice) || Number(product.price) || 0
        const effectivePrice = (hasVariants && variantLowestPrice !== null && (basePrice === 0 || variantLowestPrice > 0))
            ? (basePrice > 0 && !hasVariants ? basePrice : variantLowestPrice)
            : (basePrice > 0 ? basePrice : (variantLowestPrice || 0))
        const individualPromo = hasVariants ? null : (product.originalPrice ? Number(product.price) : null)
        return computeItemDisplayPrice(
            effectivePrice,
            individualPromo,
            activePromotions,
            { productId: itemType === "produto" ? product.id : undefined, serviceId: itemType === "servico" ? product.id : undefined, categoryId: (product as any).category_id || undefined },
        )
    }, [activePromotions, product.price, product.originalPrice, product.id, itemType, (product as any).category_id, variantLowestPrice, (product as any).product_variants, (product as any).variants, (product as any).fallback_variant_price])

    const displayPrice = pricing.bestPrice
    const referencePrice = pricing.referencePrice
    const discountPercent = pricing.discountPercent

    const itemUrl = itemType === "plano"
        ? getPlanUrl(product, product.partners)
        : (itemType === "servico"
            ? getServiceUrl(product, product.partners)
            : getProductUrl(product, product.partners))

    let frequencyText = ""
    if (itemType === "plano" && (product as any).frequency_type) {
        const freq = (product as any).frequency_type
        if (freq === "monthly") frequencyText = "/mês"
        else if (freq === "weekly") frequencyText = "/sem"
        else if (freq === "yearly") frequencyText = "/ano"
        else if (freq === "daily") frequencyText = "/dia"
    }

    const showPrice = (product as any).show_price_in_store !== false
    const badgeLabel = (product as any)._badgeLabel as string | undefined
    const badgeVariant = (product as any)._badgeVariant as string | undefined
    const timeLeft = (product as any)._timeLeft as string | undefined
    const salesCount = Number((product as any)._sales ?? (product as any).sales_last_30_days ?? (product as any).sales ?? 0) || 0

    return (
        <div className={`relative group/card h-full shrink-0 ${className}`}>
            <Link
                href={itemUrl}
                prefetch={false}
                className="block h-full flex-col hover:no-underline"
            >
                <div className="relative mb-3 overflow-hidden rounded-[16px] border border-gray-100 bg-brand-gray aspect-square dark:border-dark-border dark:bg-dark-border/30">
                    <img
                        src={imageUrl || "https://img.dudit.com.br/static/Placeholder.png"}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-500"
                        loading="lazy"
                    />
                    <div className="absolute top-2 left-2 z-10 flex gap-1.5 flex-wrap max-w-[80%]">
                        {!hidePromoBadge && showPrice && pricing.badgeVariant && (
                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold uppercase text-white shadow-sm tracking-wider whitespace-nowrap
                                ${pricing.badgeVariant === "blue" ? "bg-[#2968c8]" : "bg-[#ff7a00]"}`}>
                                {pricing.badgeVariant === "blue" ? (
                                    <>
                                        <TagIcon className="w-3 h-3 fill-current shrink-0" />
                                        <span>Oferta Especial</span>
                                    </>
                                ) : (
                                    <span>{pricing.discountPercent}% OFF</span>
                                )}
                            </div>
                        )}
                        {timeLeft && (
                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold uppercase text-white shadow-sm tracking-wider whitespace-nowrap bg-[#ffa503]`}>
                                <EnergyIcon className="w-3 h-3 shrink-0" />
                                {timeLeft}
                            </div>
                        )}
                        {badgeLabel && badgeVariant === "green" && (
                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold uppercase text-white shadow-sm tracking-wider whitespace-nowrap bg-brand-dark`}>
                                {badgeLabel}
                            </div>
                        )}
                        {badgeLabel && badgeVariant === "purple" && (
                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold uppercase text-white shadow-sm tracking-wider whitespace-nowrap bg-purple-600`}>
                                {badgeLabel}
                            </div>
                        )}
                        {badgeLabel && badgeVariant === "blue" && (
                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold uppercase text-white shadow-sm tracking-wider whitespace-nowrap bg-[#2968c8]`}>
                                {badgeLabel}
                            </div>
                        )}
                        {badgeLabel && badgeVariant === "red" && (
                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold uppercase text-white shadow-sm tracking-wider whitespace-nowrap bg-[#e11d48]`}>
                                <ClockIcon className="w-3 h-3 shrink-0" />
                                {badgeLabel}
                            </div>
                        )}
                    </div>
                    {itemType !== "plano" && (
                        <button
                            onClick={handleFavoriteClick}
                            className={`absolute top-2 right-2 z-10 transition-opacity w-8 h-8 rounded-full flex items-center justify-center
                                ${favorited ? "opacity-100 bg-white shadow-md" : "opacity-0 group-hover/card:opacity-100 bg-white/90 hover:bg-white shadow-sm"}`}
                            aria-label={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                            title={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                        >
                            <HeartIcon size={16}
                                className={`transition-colors duration-200 ${favorited ? "text-brand-green fill-brand-green" : "text-brand-green"}`} />
                        </button>
                    )}
                </div>

                <div className="px-1">
                    <h3 className="text-sm md:text-[15px] font-normal text-brand-dark line-clamp-2 min-h-[2.5em] mb-0.5 dark:text-dark-heading">
                        {product.name}
                    </h3>

                    {!hideSalesCount && salesCount > 0 && (
                        <p className="text-[11px] text-brand-inactive-text leading-tight mb-1 dark:text-dark-body">
                            {salesCount} vendidos
                        </p>
                    )}

                    <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                            {showPrice && referencePrice && (
                                <span className="text-xs text-brand-inactive-text line-through dark:text-dark-body">
                                    {formatCurrency(referencePrice)}
                                </span>
                            )}
                            <div className="flex items-center gap-1.5">
                                <span className="text-base font-bold text-brand-dark leading-tight dark:text-dark-heading">
                                    {!showPrice ? (
                                        "Preço sob consulta"
                                    ) : (
                                        <>
                                            {itemType === "servico" && (product as any).price_type === "starting_at" ? "A partir de " : ""}
                                            {formatCurrency(displayPrice)}
                                            {frequencyText || (itemType === "servico" ? getBillingUnitSuffix((product as any).billing_unit) : "")}
                                        </>
                                    )}
                                </span>
                            </div>
                        </div>

                        {(product.rating ?? 0) > 0 && (
                            <div className="flex items-center gap-0.5">
                                <StarIcon size={12} className="text-brand-green fill-brand-green" />
                                <span className="text-[11px] font-bold text-brand-dark dark:text-dark-heading">{Number(product.rating).toFixed(1)}</span>
                            </div>
                        )}
                    </div>

                    {showSeller && <div className="border-t border-gray-100 my-2 dark:border-dark-border" />}

                    {showSeller && <div className="flex items-start gap-2 pt-1">
                        <UserProfileImage
                            fullName={sellerName}
                            imageUrl={partnerImageUrl && !partnerImageUrl.includes("Placeholder.png") ? partnerImageUrl : null}
                            className="w-8 h-8 border border-gray-100 shrink-0 bg-gray-50 dark:border-dark-border dark:bg-dark-border/30"
                        />
                        <div className="flex flex-col min-w-0">
                            <p className="text-[11px] md:text-xs text-brand-dark font-medium truncate leading-tight dark:text-dark-heading">
                                {sellerName}
                            </p>
                            {(locationContext ? locationLabel : (sellerLabel || distance)) && (
                                <p className="text-[11px] text-gray-500 font-normal truncate dark:text-dark-body">
                                    {locationContext ? (
                                        locationLabel && <span>{locationLabel}</span>
                                    ) : (
                                        <>
                                            {sellerLabel && <span>{sellerLabel}</span>}
                                            {sellerLabel && distance && <span className="w-1 h-1 rounded-full bg-brand-inactive-text inline-block mx-1 align-middle" />}
                                            {distance && <span>{distance}</span>}
                                        </>
                                    )}
                                </p>
                            )}
                        </div>
                    </div>}
                </div>
            </Link>
        </div>
    );
});

interface ProductCarouselProps {
    title: string
    subtitle?: string
    products: any[]
    seeMoreLink?: string
    userCoords?: { lat: number; lng: number } | null
    isVitrineSection?: boolean
}

export const ProductCarousel: React.FC<ProductCarouselProps> = ({
    title,
    subtitle,
    products,
    seeMoreLink = "#",
    userCoords,
    isVitrineSection
}) => {
    if (isVitrineSection) {
        return (
            <section className="mx-auto mb-12 md:mb-16 max-w-[1400px] overflow-hidden">
                <div className="flex items-end justify-between px-4 lg:px-0">
                    <div>
                        <h2 className="text-lg lg:text-2xl font-medium text-brand-dark mb-6 dark:text-dark-heading">{title}</h2>
                        {subtitle && <p className="text-brand-inactive-text text-sm md:text-base dark:text-dark-body">{subtitle}</p>}
                    </div>
                    <Link
                        href={seeMoreLink}
                        prefetch={false}
                        className="hidden md:flex font-bold text-brand-green hover:underline text-sm mb-1 items-center gap-1"
                    >
                        Exibir mais <ChevronRightIcon size={16} />
                    </Link>
                </div>

                <div className="flex overflow-x-auto gap-4 md:gap-6 px-4 lg:px-0 scrollbar-hide pb-4 snap-x snap-mandatory">
                    {products.map((store: any) => {
                        const storeSlug = store.slug || store.store_name?.toLowerCase().replace(/\s+/g, "-") || store.id
                        const storeUrl = getStoreUrl({ id: store.id, slug: store.slug, store_name: store.store_name, city: store.city, state: store.state })
                        const storeImage = store.store_avatar || store.store_image_url
                        const imgUrl = storeImage
                            ? (storeImage.includes("Placeholder.png") || storeImage.includes("dudit.com.br/static")
                                ? getR2ImageUrl(storeImage)
                                : storeImage)
                            : "https://img.dudit.com.br/static/Placeholder.png"

                        return (
                            <Link
                                key={store.id}
                                href={storeUrl}
                                prefetch={false}
                                className="w-[180px] md:w-[220px] shrink-0 snap-start block hover:no-underline"
                            >
                                <div className="flex flex-col items-center gap-3 p-4 rounded-[16px] border border-gray-100 bg-white hover:shadow-md transition-all h-full dark:border-dark-border dark:bg-dark-surface">
                                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-2 border-gray-100 bg-brand-gray shrink-0 dark:border-dark-border dark:bg-dark-border/30">
                                        <img
                                            src={imgUrl}
                                            alt={store.store_name || "Loja"}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    </div>
                                    <div className="text-center min-w-0 w-full">
                                        <p className="text-sm md:text-[15px] font-semibold text-brand-dark truncate dark:text-dark-heading">
                                            {store.store_name || "Loja"}
                                        </p>
                                        {(store.rating ?? 0) > 0 && (
                                            <div className="flex items-center justify-center gap-1 mt-1">
                                                <StarIcon size={12} className="text-brand-green fill-brand-green" />
                                                <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">{Number(store.rating).toFixed(1)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            </section>
        )
    }

    return (
        <section className="mx-auto mb-12 md:mb-16 max-w-[1400px] overflow-hidden">
            <div className="flex items-end justify-between px-4 lg:px-0">
                <div>
                    <h2 className="text-lg lg:text-2xl font-medium text-brand-dark mb-6 dark:text-dark-heading">{title}</h2>
                    {subtitle && <p className="text-brand-inactive-text text-sm md:text-base dark:text-dark-body">{subtitle}</p>}
                </div>
                <Link
                    href={seeMoreLink}
                    prefetch={false}
                    className="hidden md:flex font-bold text-brand-green hover:underline text-sm mb-1 items-center gap-1"
                >
                    Exibir mais <ChevronRightIcon size={16} />
                </Link>
            </div>

            <div className="flex overflow-x-auto gap-4 md:gap-6 px-4 lg:px-0 scrollbar-hide pb-4 snap-x snap-mandatory">
                {products.map((product) => (
                    <ItemCard key={product.id} product={product} userCoords={userCoords} />
                ))}
            </div>
        </section>
    );
};

export const HorizontalCarousel = ({
    title,
    subtitle,
    items,
    renderItem,
    onSeeAll,
    banner,
    itemWidthClass = "w-[230px]"
}: {
    title: string
    subtitle?: string
    items: any[]
    renderItem: (item: any) => React.ReactNode
    onSeeAll?: () => void
    banner?: {
        title: string
        subtitle?: string
        gradient: string
        imageUrl?: string
        link?: string
    }
    itemWidthClass?: string
}) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [showLeftArrow, setShowLeftArrow] = useState(false)
    const [showRightArrow, setShowRightArrow] = useState(false)

    const checkScroll = () => {
        const el = scrollContainerRef.current
        if (el) {
            setShowLeftArrow(el.scrollLeft > 2)
            setShowRightArrow(el.scrollLeft + el.clientWidth < el.scrollWidth - 5)
        }
    }

    useEffect(() => {
        const el = scrollContainerRef.current
        if (!el || typeof window === "undefined" || window.innerWidth < 1024) return

        checkScroll()
        let rafId: number
        let debounceTimer: ReturnType<typeof setTimeout>
        const handleScroll = () => {
            cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(checkScroll)
        }
        const handleResize = () => {
            clearTimeout(debounceTimer)
            debounceTimer = setTimeout(checkScroll, 150)
        }
        el.addEventListener("scroll", handleScroll, { passive: true })
        window.addEventListener("resize", handleResize, { passive: true })

        const timer = setTimeout(checkScroll, 500)

        return () => {
            el.removeEventListener("scroll", handleScroll)
            window.removeEventListener("resize", handleResize)
            clearTimeout(timer)
            cancelAnimationFrame(rafId)
            clearTimeout(debounceTimer)
        }
    }, [items])

    const scroll = (direction: 'left' | 'right') => {
        const el = scrollContainerRef.current
        if (el) {
            const scrollAmount = el.clientWidth * 0.75
            el.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            })
        }
    }

    if (!items || items.length === 0) return null

    return (
        <div className="mb-10 w-full animate-fade-in">
            <div className="flex items-end justify-between mb-6">
                <div>
                    <h2 className="text-lg lg:text-2xl font-medium text-brand-dark mb-1 dark:text-dark-heading">{title}</h2>
                    {subtitle && <p className="text-brand-inactive-text text-sm md:text-base dark:text-dark-body">{subtitle}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {onSeeAll && (
                        <button
                            onClick={onSeeAll}
                            className="text-[13px] font-extrabold text-brand-green hover:underline cursor-pointer px-2 py-1 select-none"
                        >
                            Ver tudo
                        </button>
                    )}
                    <div className="hidden lg:flex items-center gap-1.5">
                        {showLeftArrow && (
                            <button
                                onClick={() => scroll('left')}
                                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 transition-colors duration-200 shadow-sm cursor-pointer dark:border-dark-border dark:bg-dark-surface dark:hover:bg-dark-border/30"
                            >
                                <ChevronLeftIcon className="w-4 h-4 text-brand-dark dark:text-dark-heading" />
                            </button>
                        )}
                        {showRightArrow && (
                            <button
                                onClick={() => scroll('right')}
                                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 transition-colors duration-200 shadow-sm cursor-pointer dark:border-dark-border dark:bg-dark-surface dark:hover:bg-dark-border/30"
                            >
                                <ChevronRightIcon className="w-4 h-4 text-brand-dark dark:text-dark-heading" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div
                ref={scrollContainerRef}
                className="flex gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth pb-3 px-1"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
            >
                {banner && (
                    <div className="snap-start shrink-0 w-[170px] h-auto">
                        <a
                            href={banner.link || '#'}
                            className={`flex flex-col items-center justify-center text-center p-4 rounded-[16px] w-full h-full min-h-[250px] bg-gradient-to-br ${banner.gradient} text-white hover:scale-[1.02] transition-all duration-300 shadow-md`}
                        >
                            {banner.imageUrl ? (
                                <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover rounded-[16px]" />
                            ) : (
                                <div className="flex flex-col items-center gap-3">
                                    <span className="font-extrabold text-xl leading-tight whitespace-pre-line">{banner.title}</span>
                                    {banner.subtitle && (
                                        <span className="text-xs font-medium opacity-90">{banner.subtitle}</span>
                                    )}
                                </div>
                            )}
                        </a>
                    </div>
                )}
                {items.map((item, idx) => (
                    <div key={idx} className={`snap-start shrink-0 ${itemWidthClass}`}>
                        {renderItem(item)}
                    </div>
                ))}
            </div>
        </div>
    )
};
