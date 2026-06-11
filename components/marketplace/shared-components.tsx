"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import { HeartIcon, StarIcon, ChevronRightIcon, ChevronLeftIcon, ShieldIcon, InfoIcon, EditIcon } from "@/lib/icons"
import { FavoriteButton } from "./FavoriteButton"
import Link from "next/link"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { getAvatarColor, getBannerUrlByColor, UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getProductUrl, getPartnerUrl, getServiceUrl, getPlanUrl } from "@/lib/utils/url-generator"
import { formatCurrency } from "@/lib/utils";
import { getBillingUnitSuffix } from "@/lib/utils/formatters"
import { getRandomDefaultBanner } from "@/lib/utils/banner"
import { Badge } from "@/components/reusable"
import { useFavorites } from "@/providers/favorites-provider"
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import { computeItemDisplayPrice } from "@/lib/services/pricing-engine"

const HOME_BANNERS = [
    { id: 1, src: 'https://img.dudit.com.br/static/banners/Banner-1.png', alt: 'Venda aqui' },
    { id: 2, src: 'https://img.dudit.com.br/static/banners/Banner-2.png', alt: 'Gerencie tudo' },
];

const HOME_CATEGORIES = [
    { name: 'Decoração', image: 'https://img.dudit.com.br/static/Placeholder.png' },
];

function getProductImageUrl(images: string[] | null | undefined): string {
    if (!images || images.length === 0) return "https://img.dudit.com.br/static/Placeholder.png"
    const firstImage = images[0]
    return getR2ImageUrl(firstImage)
}

const DURATION = 5000;

export const HeroBanner: React.FC = () => {
    return (
        <section className="mt-6 mb-12 px-4 lg:px-0 group flex justify-center w-full">
            <div className="w-[82vw] md:w-full max-w-[1400px] aspect-[2.65/1] md:aspect-auto md:h-[300px] relative rounded-[20px] overflow-hidden cursor-pointer select-none active:scale-[0.99] hover:shadow-lg transition-all duration-300">
                <img
                    src="https://img.dudit.com.br/static/banners/Banner-1.png"
                    alt="Dudit Marketplace"
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                    loading="lazy"
                />
            </div>
        </section>
    );
};

interface VitrineCardProps {
    vitrine: any
    hideCity?: boolean
    className?: string
}

export const VitrineCard: React.FC<VitrineCardProps> = ({ vitrine, hideCity = false, className = "w-[280px] md:w-[320px]" }) => {
    // Resolve partner object (handle array or object)
    const rawPartner = Array.isArray(vitrine.partners) ? vitrine.partners[0] : vitrine.partners
    const partner = rawPartner || {}
    const storeName = partner.store_name || vitrine.name || "Vendedor"
    const rawStoreAvatar =
        partner.store_avatar ||
        partner.store_image_url ||
        partner.profile_image_url ||
        null
    const storeAvatar = rawStoreAvatar ? getR2ImageUrl(rawStoreAvatar) : null
    const hasPartnerLogo = !!rawStoreAvatar && !String(rawStoreAvatar).includes("Placeholder.png")

    // Resolve banner logic using the same R2 URL helper used by products/logos.
    const bannerUrl = partner.banner_url || (Array.isArray(vitrine.images) ? vitrine.images[0] : null)
    const fallbackBanner = hasPartnerLogo
        ? getRandomDefaultBanner()
        : getBannerUrlByColor(getAvatarColor(storeName))
    const bannerImage = bannerUrl ? getR2ImageUrl(bannerUrl) : fallbackBanner
    const distance = partner.distance_km_formatted || null
    const city = partner.city || ""
    const state = partner.state || ""
    const category = vitrine.category || partner.category || null
    const reviewsCount = partner.reviewsCount ?? vitrine.reviewsCount ?? 0
    const showRating = (vitrine.rating ?? partner.rating ?? 0) > 0 && reviewsCount >= 3

    return (
        <Link
            href={getPartnerUrl(partner)}
            prefetch={false}
            className={`flex flex-col group cursor-pointer active:scale-[0.98] transition-all duration-300 ${className}`}
        >
            <div className="relative w-full aspect-[16/7] rounded-[16px] overflow-hidden bg-gray-100 mb-3 shrink-0 transition-all duration-300">
                <img
                    src={bannerImage}
                    alt={vitrine.name}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                    loading="lazy"
                />
                <div className="absolute inset-0" />
            </div>

            <div className="flex items-center gap-3 px-1">
                <UserProfileImage
                    fullName={storeName}
                    imageUrl={storeAvatar && !storeAvatar.includes("Placeholder.png") ? storeAvatar : null}
                    className="w-12 h-12 border border-brand-border shrink-0 bg-gray-50"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="font-bold text-brand-dark text-base truncate">
                            {storeName}
                        </h3>
                        {showRating && (
                            <div className="flex items-center gap-0.5 shrink-0 ml-0.5">
                                <StarIcon size={12} className="text-brand-green fill-brand-green" />
                                <span className="text-xs font-bold text-brand-dark">{Number(vitrine.rating ?? partner.rating).toFixed(1)}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[13px] text-brand-inactive-text mt-0.5">
                        {!hideCity && (
                            <span className="truncate">{city}{city && state ? " - " : ""}{state}</span>
                        )}
                        {!hideCity && distance && (
                            <span className="w-1 h-1 rounded-full bg-brand-inactive-text" />
                        )}
                        {distance && (
                            <span className="font-medium">{distance}</span>
                        )}
                        {category && category !== "Loja Parceira" && (
                            <>
                                {(distance || !hideCity) && (
                                    <span className="w-1 h-1 rounded-full bg-brand-inactive-text" />
                                )}
                                <span className="font-medium truncate">{category}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    )
}

interface CategoryListProps {
    vitrines?: any[]
}

export const CategoryList: React.FC<CategoryListProps> = ({ vitrines = [] }) => {
    return (
        <section className="mx-auto mb-16 max-w-[1400px]">
            <div className="px-4 lg:px-0 mb-8 flex items-end justify-between">
                <div>
                    <h2 className="text-2xl md:text-[32px] font-bold text-brand-dark mb-1 leading-tight">Vitrines Populares</h2>
                    <div className="text-gray-500 font-normal text-sm md:text-base">Explore lojas e encontre itens únicos da sua região.</div>
                </div>
                <Link
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
                            <div className="w-[100px] h-[100px] md:w-[120px] md:h-[120px] rounded-full overflow-hidden border border-gray-100 transition-all">
                                <img
                                    src={cat.image || "https://img.dudit.com.br/static/Placeholder.png"}
                                    alt={cat.name}
                                    className="w-full h-full object-cover transition-transform duration-500"
                                    loading="lazy"
                                />
                            </div>
                            <span className="font-semibold text-gray-800 text-xs md:text-sm group-hover:text-brand-green transition-colors">{cat.name}</span>
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
                <h2 className="text-2xl md:text-[32px] font-bold text-brand-dark mb-8 px-4 lg:px-0">Vender online nunca foi tão simples</h2>
                <div className="flex overflow-x-auto gap-4 md:gap-6 px-4 lg:px-0 scrollbar-hide pb-4 snap-x">
                    {items.map((item, idx) => (
                        <div key={idx} className="bg-[#ffebe5] p-6 rounded-[16px] min-w-[260px] md:flex-1 flex flex-col items-start gap-4 snap-center cursor-pointer transition-shadow">
                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
                                {item.icon}
                            </div>
                            <div>
                                <h3 className="font-bold text-brand-dark text-lg mb-2 leading-tight">{item.title}</h3>
                                <p className="text-gray-600 text-sm leading-relaxed">{item.text}</p>
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
        }
    }
    userCoords?: { lat: number; lng: number } | null
    showSeller?: boolean
    className?: string
    promotions?: any[]
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

export const ItemCard: React.FC<ItemCardProps> = ({ product, userCoords, showSeller = true, className = "w-[200px] md:w-[230px]", promotions: preloadedPromotions }) => {
    const { isFavorited } = useFavorites()
    const itemType = (product as any).itemType === "plano" ? "plano" : ((product as any).itemType === "servico" ? "servico" : "produto")
    const favorited = itemType !== "plano" ? isFavorited(product.id, itemType) : false

    const imageUrl = getPrimaryProductDisplayImage(product)
    const distance = product.partners?.distance_km_formatted || null
    const partner = Array.isArray(product.partners) ? product.partners[0] : product.partners
    const rawPartnerImage = partner?.store_avatar || partner?.store_image_url || partner?.profile_image_url || null
    const partnerImageUrl = rawPartnerImage ? getR2ImageUrl(rawPartnerImage) : null
    const partnerId = partner?.id || null

    const [activePromotions, setActivePromotions] = useState<any[]>(() => {
        if (preloadedPromotions) return preloadedPromotions
        if (partnerId && promotionsValueCache[partnerId]) {
            return promotionsValueCache[partnerId]
        }
        return []
    })

    useEffect(() => {
        if (preloadedPromotions) {
            setActivePromotions(preloadedPromotions)
            return
        }
        if (partnerId) {
            if (promotionsValueCache[partnerId]) {
                setActivePromotions(promotionsValueCache[partnerId])
            } else {
                getCachedPartnerPromotions(partnerId).then(setActivePromotions)
            }
        }
    }, [partnerId, preloadedPromotions])

    const pricing = useMemo(() => {
        const basePrice = Number(product.originalPrice) || Number(product.price) || 0
        const individualPromo = product.originalPrice ? Number(product.price) : null
        return computeItemDisplayPrice(
            basePrice,
            individualPromo,
            activePromotions,
            { productId: itemType === "produto" ? product.id : undefined, serviceId: itemType === "servico" ? product.id : undefined, categoryId: (product as any).category_id || undefined },
        )
    }, [activePromotions, product.price, product.originalPrice, product.id, itemType, (product as any).category_id])

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

    return (
        <div className={`relative group/card h-full shrink-0 ${className}`}>
            <Link
                href={itemUrl}
                prefetch={false}
                className="block h-full flex-col hover:no-underline"
            >
                <div className="relative mb-3 overflow-hidden rounded-[16px] border border-gray-100 bg-brand-gray aspect-square">
                    <img
                        src={imageUrl || "https://img.dudit.com.br/static/Placeholder.png"}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-500"
                        loading="lazy"
                    />
                    <div className="absolute top-2 left-2 z-10 flex gap-1.5 flex-wrap max-w-[80%]">
                        {showPrice && pricing.badgeVariant === "blue" && (
                            <Badge variant="blue" icon={null} className="whitespace-nowrap">-{pricing.discountPercent}%</Badge>
                        )}
                        {showPrice && pricing.badgeVariant === "orange" && (
                            <Badge variant="orange" icon={null} className="whitespace-nowrap">-{pricing.discountPercent}%</Badge>
                        )}
                    </div>
                    {itemType !== "plano" && (
                        <FavoriteButton
                            itemId={product.id}
                            itemType={itemType}
                            size="sm"
                            variant="overlay"
                            className={`absolute top-2 right-2 z-10 transition-opacity ${favorited ? "opacity-100" : "opacity-0 group-hover/card:opacity-100"
                                }`}
                        />
                    )}
                </div>

                <div className="px-1">
                    <h3 className="text-sm md:text-[15px] font-normal text-brand-dark line-clamp-2 min-h-[2.5em] mb-1">
                        {product.name}
                    </h3>

                    <div className="flex justify-between items-center mb-3">
                        <div className="flex flex-col">
                            {showPrice && referencePrice && (
                                <span className="text-xs text-brand-inactive-text line-through">
                                    {formatCurrency(referencePrice)}
                                </span>
                            )}
                            <div className="flex items-center gap-1.5">
                                <span className="text-base font-bold text-brand-dark leading-tight">
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
                                <span className="text-[11px] font-bold text-brand-dark">{product.rating}</span>
                            </div>
                        )}
                    </div>

                    {showSeller && <div className="border-t border-gray-100 my-2" />}

                    {showSeller && <div className="flex items-start gap-2 pt-1">
                        <UserProfileImage
                            fullName={partner?.store_name || 'Vendedor'}
                            imageUrl={partnerImageUrl && !partnerImageUrl.includes("Placeholder.png") ? partnerImageUrl : null}
                            className="w-8 h-8 border border-gray-100 shrink-0 bg-gray-50"
                        />
                        <div className="flex flex-col min-w-0">
                            <p className="text-[11px] md:text-xs text-brand-dark font-medium truncate leading-tight">
                                {product.partners?.store_name || 'Vendedor'}
                            </p>
                            <p className="text-[11px] text-gray-500 font-normal truncate">
                                {product.partners?.city ? `${product.partners.city}${product.partners.state ? ` - ${product.partners.state}` : ''}` : ''}
                                {distance && product.partners?.city ? ' • ' : ''}
                                {distance}
                            </p>
                        </div>
                    </div>}
                </div>
            </Link>
        </div>
    );
};

interface ProductCarouselProps {
    title: string
    subtitle?: string
    products: any[]
    seeMoreLink?: string
    userCoords?: { lat: number; lng: number } | null
}

export const ProductCarousel: React.FC<ProductCarouselProps> = ({
    title,
    subtitle,
    products,
    seeMoreLink = "#",
    userCoords
}) => {
    return (
        <section className="mx-auto mb-12 md:mb-16 max-w-[1400px] overflow-hidden">
            <div className="flex items-end justify-between px-4 lg:px-0">
                <div>
                    <h2 className="text-lg lg:text-2xl font-medium text-brand-dark mb-6">{title}</h2>
                    {subtitle && <p className="text-brand-inactive-text text-sm md:text-base">{subtitle}</p>}
                </div>
                <Link
                    href={seeMoreLink}
                    prefetch={true}
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
