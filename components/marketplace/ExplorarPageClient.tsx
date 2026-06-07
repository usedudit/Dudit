"use client"

import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from "react"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { ItemCard, VitrineCard } from "./shared-components"
import { IconPlaceholder, Button, DefaultModal, RadioButton } from "@/components/reusable"
import { MoneyInput } from "@/components/reusable/Inputs/MoneyInput"
import { useRouter, useSearchParams, usePathname, useParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { SkeletonLoader } from "@/components/reusable/SkeletonLoader"
import {
    ChevronLeft,
    ChevronRight,
    MapPin,
    Check,
} from "lucide-react"
import { searchMarketplace, type MarketplaceListCursor } from "@/app/actions/marketplace/search"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { getProductDisplayImages } from "@/lib/utils/product-display-images"
import { SponsoredAdsCarousel } from "@/components/marketplace/ads/SponsoredAdsCarousel"
import { SponsoredAdsSearchInline } from "@/components/marketplace/ads/SponsoredAdsSlot"
import type { SponsoredAd } from "@/lib/ads/types"
import citiesData from "@/lib/data/cities.json"
import { useLocationRedirect } from "@/hooks/use-location-redirect"
import { getMarketplaceCategoriesClient } from "@/lib/data/marketplace-categories-client"

interface ExplorarPageClientProps {
    initialResults?: any[]
    query?: string
    type?: 'produtos' | 'servicos' | 'vitrines' | 'tudo' | 'planos'
    cidade?: string
    categoria?: string
    userProfile?: any
    cartCount?: number
    exploreAds?: SponsoredAd[]
    searchAds?: SponsoredAd[]
}

type SortOption = "relevancia" | "preco_menor" | "preco_maior" | "recentes"

const CATEGORY_SLUG_MAP: { [key: string]: string } = {
    "casa-e-utilidades": "Casa & Utilidades",
    "moda-e-beleza": "Moda & Beleza",
    "saude-e-bem-estar": "Saúde & Bem-estar",
    "tecnologia-e-eletronicos": "Tecnologia & Eletrônicos",
    "auto-e-moto": "Auto & Moto",
    "pets": "Pets",
    "construcao-e-ferramentas": "Construção & Ferramentas",
    "agro-e-jardim": "Agro & Jardim",
    "infantil-e-brinquedos": "Infantil & Brinquedos",
    "alimentacao": "Alimentação",
    "outros": "Outros"
}

const CATEGORY_GRADIENTS = [
    "from-[#FF8008] to-[#FFC837]", // Warm Orange/Yellow
    "from-[#11998e] to-[#38ef7d]", // Fresh Green
    "from-[#00c6ff] to-[#0072ff]", // Ocean Blue
    "from-[#7F00FF] to-[#E100FF]", // Vivid Purple
    "from-[#fe0979] to-[#ff6a00]", // Sunset Pink/Orange
    "from-[#F7971E] to-[#FFD200]", // Golden Yellow
    "from-[#4facfe] to-[#00f2fe]", // Sky Blue
    "from-[#00b09b] to-[#96c93d]"  // Lime/Emerald
]


const FALLBACK_CATEGORIES = [
    { name: "Casa & Utilidades", icon_url: "https://img.dudit.com.br/static/categories/products/Casa-e-utilidades.png" },
    { name: "Moda & Beleza", icon_url: "https://img.dudit.com.br/static/categories/products/Moda-e-beleza.png" },
    { name: "Saúde & Bem-estar", icon_url: "https://img.dudit.com.br/static/categories/products/Saude-e-bem-estar.png" },
    { name: "Tecnologia & Eletrônicos", icon_url: "https://img.dudit.com.br/static/categories/products/Tecnologia-e-eletronicos.png" },
    { name: "Auto & Moto", icon_url: "https://img.dudit.com.br/static/categories/products/Auto-e-moto.png" },
    { name: "Pets", icon_url: "https://img.dudit.com.br/static/categories/products/Pets.png" },
    { name: "Construção & Ferramentas", icon_url: "https://img.dudit.com.br/static/categories/products/Construcao-e-ferramentas.png" },
    { name: "Agro & Jardim", icon_url: "https://img.dudit.com.br/static/categories/products/Agro-e-jardim.png" },
    { name: "Infantil & Brinquedos", icon_url: "https://img.dudit.com.br/static/categories/products/Infantil-e-brinquedos.png" }
]

function formatCitySlug(slug: string | null) {
    if (!slug) return ""
    const parts = slug.split("-")
    const state = parts.pop()?.toUpperCase() || ""
    const city = parts.join(" ").replace(/\b\w/g, l => l.toUpperCase())
    return `${city} - ${state}`
}

const ExploreContentSkeleton = ({ type }: { type: string }) => {
    return (
        <div className="space-y-12 animate-pulse">
            {type === 'tudo' && (
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <SkeletonLoader width={220} height={24} className="rounded" />
                        <SkeletonLoader width={60} height={16} className="rounded" />
                    </div>
                    <div className="flex gap-4 overflow-x-auto scrollbar-none">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="shrink-0 w-[270px] sm:w-[320px]">
                                <SkeletonLoader height={140} className="rounded-[16px] mb-3" />
                                <div className="flex items-center gap-3">
                                    <SkeletonLoader width={48} height={48} circle />
                                    <div className="flex-1 space-y-2">
                                        <SkeletonLoader width="60%" height={16} className="rounded" />
                                        <SkeletonLoader width="40%" height={12} className="rounded" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div>
                <div className="mb-6">
                    <SkeletonLoader width={200} height={24} className="rounded" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="flex flex-col gap-3">
                            <SkeletonLoader height={170} className="rounded-[16px]" />
                            <SkeletonLoader height={16} width="85%" className="rounded" />
                            <SkeletonLoader height={14} width="50%" className="rounded" />
                            <div className="flex justify-between items-center pt-1 border-t border-gray-50 mt-2">
                                <div className="flex items-center gap-2">
                                    <SkeletonLoader width={24} height={24} circle />
                                    <SkeletonLoader width={60} height={12} className="rounded" />
                                </div>
                                <SkeletonLoader width={40} height={14} className="rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

// Reusable Horizontal Carousel with Scroll-Aware Navigation Chevrons
const HorizontalCarousel = ({
    title,
    items,
    renderItem,
    onSeeAll,
    itemWidthClass = "w-[230px]"
}: {
    title: string
    items: any[]
    renderItem: (item: any) => React.ReactNode
    onSeeAll?: () => void
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
        if (el) {
            checkScroll()
            el.addEventListener("scroll", checkScroll)
            window.addEventListener("resize", checkScroll)

            // Recheck after renders
            const timer = setTimeout(checkScroll, 500)

            return () => {
                el.removeEventListener("scroll", checkScroll)
                window.removeEventListener("resize", checkScroll)
                clearTimeout(timer)
            }
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
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg lg:text-2xl font-medium text-brand-dark mb-6">{title}</h2>
                <div className="flex items-center gap-3">
                    {onSeeAll && (
                        <button
                            onClick={onSeeAll}
                            className="text-[13px] font-extrabold text-brand-green hover:underline cursor-pointer px-2 py-1 select-none"
                        >
                            Ver tudo
                        </button>
                    )}
                    <div className="flex items-center gap-1.5">
                        {showLeftArrow && (
                            <button
                                onClick={() => scroll('left')}
                                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 transition-colors duration-200 shadow-sm cursor-pointer"
                            >
                                <ChevronLeft className="w-4 h-4 text-brand-dark" />
                            </button>
                        )}
                        {showRightArrow && (
                            <button
                                onClick={() => scroll('right')}
                                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 transition-colors duration-200 shadow-sm cursor-pointer"
                            >
                                <ChevronRight className="w-4 h-4 text-brand-dark" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div
                ref={scrollContainerRef}
                className="flex gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth pb-3 px-1"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {items.map((item, idx) => (
                    <div key={idx} className={`snap-start shrink-0 ${itemWidthClass}`}>
                        {renderItem(item)}
                    </div>
                ))}
            </div>
        </div>
    )
}

export function ExplorarPageClient({
    initialResults = [],
    query = '',
    type = 'tudo',
    cidade = '',
    categoria = '',
    userProfile,
    cartCount,
    hideHeaderAndFooter,
    exploreAds = [],
    searchAds = [],
}: ExplorarPageClientProps & { hideHeaderAndFooter?: boolean }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const params = useParams()
    const { requestLocation, loading: isLocationLoading } = useLocationRedirect()

    const slug = (params?.slug as string[]) || []
    const pathCity = slug[0] || ""
    const pathCategorySlug = slug[1] || ""
    const pathCategory = pathCategorySlug ? (CATEGORY_SLUG_MAP[pathCategorySlug] || pathCategorySlug) : ""

    const [currentType, setCurrentType] = useState<any>(type)
    const [sortBy, setSortBy] = useState<SortOption>("relevancia")
    const [selectedCitySlug, setSelectedCitySlug] = useState<string | null>(cidade || pathCity || null)
    const [dbCategories, setDbCategories] = useState<{ id?: string; name: string; icon_url: string | null }[]>([])

    const categoriesList = useMemo(() => {
        return dbCategories.length > 0 ? dbCategories : FALLBACK_CATEGORIES
    }, [dbCategories])

    useEffect(() => {
        getMarketplaceCategoriesClient(null).then(cats => {
            if (cats && cats.length > 0) {
                setDbCategories(cats)
            }
        })
    }, [])

    // Modal states
    const [isSortModalOpen, setIsSortModalOpen] = useState(false)
    const [isTypeModalOpen, setIsTypeModalOpen] = useState(false)
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false)
    const [isCityModalOpen, setIsCityModalOpen] = useState(false)
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)

    // City search input
    const [citySearchText, setCitySearchText] = useState("")

    // Filters state
    const [promoOn, setPromoOn] = useState(false)
    const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
        if (pathCategory) return [pathCategory]
        if (categoria) {
            return categoria.split(",").map(c => CATEGORY_SLUG_MAP[c.toLowerCase()] || c)
        }
        return []
    })
    const [minPrice, setMinPrice] = useState<number | string>("")
    const [maxPrice, setMaxPrice] = useState<number | string>("")

    const observerTarget = useRef<HTMLDivElement>(null)
    const MAX_ITEMS = 300 // Memory cap

    const isLandingPage = useMemo(() => {
        return currentType === 'tudo' && selectedCategories.length === 0 && !query
    }, [currentType, selectedCategories, query])

    const fetchType = isLandingPage ? 'vitrines' : currentType

    // Unified URL synchronization helper
    const updateUrl = (
        city: string | null,
        categories: string[],
        searchQ: string,
        typeStr: string
    ) => {
        const queryParams = new URLSearchParams()
        if (searchQ) queryParams.set("q", searchQ)
        if (typeStr !== "tudo") queryParams.set("type", typeStr)

        const queryStr = queryParams.toString()
        const queryPart = queryStr ? `?${queryStr}` : ""

        if (city) {
            if (categories.length > 0) {
                const catName = categories[0]
                const catSlug = Object.keys(CATEGORY_SLUG_MAP).find(key => CATEGORY_SLUG_MAP[key] === catName) || catName
                router.push(`/explorar/${city}/${catSlug}${queryPart}`)
            } else {
                router.push(`/explorar/${city}${queryPart}`)
            }
        } else {
            router.push(`/explorar${queryPart}`)
        }
    }

    // Handles browser Back/Forward navigation syncing path params and searchParams back to component state
    useEffect(() => {
        const urlType = searchParams.get("type") || "tudo"
        if (urlType !== currentType) {
            setCurrentType(urlType as any)
        }

        const pathCity = slug[0] || null
        const urlCity = pathCity || searchParams.get("cidade") || null
        if (urlCity !== selectedCitySlug) {
            setSelectedCitySlug(urlCity)
        }

        const pathCategorySlug = slug[1] || null
        const pathCategory = pathCategorySlug ? (CATEGORY_SLUG_MAP[pathCategorySlug] || pathCategorySlug) : null

        let nextCats: string[] = []
        if (pathCategory) {
            nextCats = [pathCategory]
        } else {
            const urlCat = searchParams.get("categoria")
            if (urlCat) {
                nextCats = urlCat.split(",").map(c => CATEGORY_SLUG_MAP[c.toLowerCase()] || c)
            }
        }

        const isCatsEqual = selectedCategories.length === nextCats.length &&
            selectedCategories.every((val, index) => val === nextCats[index])
        if (!isCatsEqual) {
            setSelectedCategories(nextCats)
        }
    }, [searchParams, params])

    // Handle city synchronization from URL/cookies/localProfile on mount
    useEffect(() => {
        const pathCity = slug[0] || null
        const urlCity = pathCity || searchParams.get("cidade")
        if (urlCity) {
            document.cookie = `dudit_city=${urlCity}; path=/; max-age=${60 * 60 * 24 * 30}`
            localStorage.setItem("dudit_city", urlCity)
            setSelectedCitySlug(urlCity)
            return
        }

        // 1. If logged in, prioritize userProfile address
        if (userProfile?.city && userProfile?.state) {
            const normCity = userProfile.city
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "")
            const userCitySlug = `${normCity}-${userProfile.state.toLowerCase()}`

            document.cookie = `dudit_city=${userCitySlug}; path=/; max-age=${60 * 60 * 24 * 30}`
            localStorage.setItem("dudit_city", userCitySlug)
            setSelectedCitySlug(userCitySlug)
            updateUrl(userCitySlug, selectedCategories, query, currentType)
            return
        }

        // 2. If logged out (or logged in but no profile city), fall back to cookie/localStorage
        let savedCity = localStorage.getItem("dudit_city")
        if (!savedCity) {
            const match = document.cookie.match(/(?:^|; )dudit_city=([^;]*)/)
            if (match) savedCity = match[1]
        }

        if (savedCity) {
            setSelectedCitySlug(savedCity)
            updateUrl(savedCity, selectedCategories, query, currentType)
            return
        }

        // 3. For logged-out users without a saved location, auto-locate ONLY if permission is already granted
        if (!userProfile && typeof window !== "undefined" && navigator?.permissions) {
            navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
                if (result.state === "granted") {
                    requestLocation()
                }
            }).catch((err) => {
                console.error("Error querying geolocation permission:", err)
            })
        }
    }, [searchParams, userProfile])

    const limitConfig = useMemo(() => {
        if (fetchType === "produtos") return { produtos: 40 } as const
        if (fetchType === "servicos") return { servicos: 40 } as const
        if (fetchType === "vitrines") return { vitrines: 40 } as const
        if (fetchType === "planos") return { planos: 40 } as const
        return { geral: 40 } as const
    }, [fetchType])

    // Query fetch
    const { items: rawItemsUncapped, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching } = useInfiniteList<
        any,
        MarketplaceListCursor
    >({
        queryKey: ["explore", query, fetchType, selectedCitySlug],
        initialPage:
            (fetchType === type && selectedCitySlug === cidade) ||
                (isLandingPage && type === 'tudo' && selectedCitySlug === cidade)
                ? { items: initialResults, nextCursor: null, hasMore: initialResults.length >= (isLandingPage ? 40 : (type === 'tudo' ? 10 : 40)) }
                : undefined,
        fetchFn: async ({ cursor }) => {
            const res = await searchMarketplace(query, fetchType as any, {
                ...limitConfig,
                cursor,
                cidade: selectedCitySlug || undefined
            })
            return res
        },
        dedupeKey: (item) => String(item?.itemType || "") + ":" + String(item?.id || ""),
        staleTime: 30000,
        refetchOnMount: true,
        refetchOnWindowFocus: false,
    })

    const rawItems = useMemo(() => {
        const all = rawItemsUncapped || []
        if (all.length > MAX_ITEMS) return all.slice(0, MAX_ITEMS)
        return all
    }, [rawItemsUncapped])

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "200px",
        threshold: 0,
    })

    const normalizedInitialResults = useMemo(() => {
        const normalizeItemType = (item: any) => {
            const rawType = String(item?.itemType || "").toLowerCase()
            if (rawType === "loja" || rawType === "vitrine" || rawType === "vitrines" || rawType === "partner" || rawType === "parceiro") {
                return "loja"
            }
            if (rawType === "produto" || rawType === "product") return "produto"
            if (rawType === "servico" || rawType === "serviço" || rawType === "service") return "servico"
            if (rawType === "plano" || rawType === "plan" || rawType === "recorrente" || rawType === "recurring") return "plano"

            if (item?.store_name || item?.partners?.store_name) return "loja"
            return rawType
        }

        return rawItems.map((item: any) => {
            const itemType = normalizeItemType(item)
            if (itemType === "loja") {
                return {
                    ...item,
                    itemType,
                }
            }
            const images = getProductDisplayImages(item)
            const basePrice = Number(item.promotional_price || item.price)
            const price = (!item.promotional_price && item.fallback_variant_price) ? Number(item.fallback_variant_price) : basePrice
            return {
                ...item,
                itemType,
                price,
                originalPrice: item.promotional_price ? Number(item.price) : undefined,
                images,
                partners: Array.isArray(item.partners) ? item.partners[0] : item.partners,
            }
        })
    }, [rawItems])

    const { vitrinesDestaque, dataToFilter } = useMemo(() => {
        if (currentType === 'vitrines') {
            const list = normalizedInitialResults.filter(r => r.itemType === 'loja')
            return { vitrinesDestaque: [], dataToFilter: list }
        }

        if (currentType === 'produtos') {
            const list = normalizedInitialResults.filter(r => r.itemType === 'produto')
            return { vitrinesDestaque: [], dataToFilter: list }
        }

        if (currentType === 'servicos') {
            const list = normalizedInitialResults.filter(r => r.itemType === 'servico')
            return { vitrinesDestaque: [], dataToFilter: list }
        }

        if (currentType === 'planos') {
            const list = normalizedInitialResults.filter(r => r.itemType === 'plano')
            return { vitrinesDestaque: [], dataToFilter: list }
        }

        if (currentType === 'tudo') {
            const vitrines = normalizedInitialResults.filter(r => r.itemType === 'loja')
            const sortedVitrines = [...vitrines]
                .sort((a, b) => (b.rating || 0) - (a.rating || 0))
                .slice(0, 20)
            const list = normalizedInitialResults.filter(r => r.itemType !== 'loja')
            return { vitrinesDestaque: sortedVitrines, dataToFilter: list }
        }

        const list = normalizedInitialResults.filter(r => r.itemType !== 'loja')
        return { vitrinesDestaque: [], dataToFilter: list }
    }, [normalizedInitialResults, currentType])

    const matchCategory = (itemCategory: string | null, catName: string) => {
        if (!itemCategory) return false
        const normItem = itemCategory.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        const normTarget = catName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        return normItem === normTarget
    }

    const isStandardCategory = (catName: string) => {
        return categoriesList.some(cat => matchCategory(catName, cat.name))
    }

    const activeCategoriesList = useMemo(() => {
        const all = [...categoriesList]
        const hasOutros = dataToFilter.some(p => {
            if (p.itemType === 'loja') return false
            const itemCat = p.category
            return !itemCat || !isStandardCategory(itemCat)
        })
        if (hasOutros && !all.some(c => c.name === "Outros")) {
            all.push({ name: "Outros", icon_url: null })
        }
        return all
    }, [categoriesList, dataToFilter])

    const outrosItems = useMemo(() => {
        return dataToFilter.filter(p => {
            if (p.itemType === 'loja') return false
            const itemCat = p.category
            return !itemCat || !isStandardCategory(itemCat)
        }).slice(0, 20)
    }, [dataToFilter, categoriesList])

    // In-memory filters for advanced filters
    const filteredResults = useMemo(() => {
        let filtered = [...dataToFilter]
        if (selectedCategories.length > 0) {
            const activeCat = selectedCategories[0]
            if (activeCat === "Outros") {
                filtered = filtered.filter((p) => {
                    if (p.itemType === 'loja') return false
                    return !p.category || !isStandardCategory(p.category)
                })
            } else {
                filtered = filtered.filter((p) => {
                    return matchCategory(p.category, activeCat)
                })
            }
        }
        if (minPrice) filtered = filtered.filter((p) => p.price && p.price >= Number(minPrice))
        if (maxPrice) filtered = filtered.filter((p) => p.price && p.price <= Number(maxPrice))
        if (promoOn) filtered = filtered.filter((p) => p.originalPrice !== undefined)

        // Sorting
        if (sortBy === "preco_menor") {
            filtered.sort((a, b) => (a.price || 0) - (b.price || 0))
        } else if (sortBy === "preco_maior") {
            filtered.sort((a, b) => (b.price || 0) - (a.price || 0))
        } else if (sortBy === "recentes") {
            filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        } else {
            // Relevância
            filtered.sort((a, b) => {
                const stockA = a.stock_available ?? a.stock_quantity ?? 0
                const stockB = b.stock_available ?? b.stock_quantity ?? 0
                const scoreA = (a.rating || 0) * 10 + (a.originalPrice ? 20 : 0) + (stockA > 0 ? 5 : 0)
                const scoreB = (b.rating || 0) * 10 + (b.originalPrice ? 20 : 0) + (stockB > 0 ? 5 : 0)
                return scoreB - scoreA
            })
        }
        return filtered
    }, [dataToFilter, selectedCategories, minPrice, maxPrice, promoOn, sortBy, categoriesList])

    const activeFiltersCount = useMemo(() => {
        let count = 0
        if (selectedCategories.length > 0) count++
        if (minPrice || maxPrice) count++
        if (promoOn) count++
        if (sortBy !== "relevancia") count++
        if (currentType !== "tudo") count++
        return count
    }, [selectedCategories, minPrice, maxPrice, promoOn, sortBy, currentType])

    const categoryShowcases = useMemo(() => {
        if (selectedCategories.length === 0) return []
        const activeCat = selectedCategories[0]
        if (activeCat === "Outros") return []
        return normalizedInitialResults.filter(
            r => r.itemType === 'loja' && matchCategory(r.category, activeCat)
        )
    }, [normalizedInitialResults, selectedCategories])

    const categoryOffers = useMemo(() => {
        if (selectedCategories.length === 0) return []
        return filteredResults.filter(p => p.originalPrice !== undefined && p.originalPrice > p.price)
    }, [filteredResults, selectedCategories])

    const promoProducts = useMemo(() => {
        if (currentType !== 'produtos') return []
        return filteredResults.filter(p => p.originalPrice !== undefined && p.originalPrice > p.price).slice(0, 20)
    }, [filteredResults, currentType])

    const subcategoryGroups = useMemo(() => {
        if (selectedCategories.length === 0) return []
        const groups: { [key: string]: any[] } = {}
        filteredResults.forEach((item) => {
            const subName = item.subcategoryName || "Outros"
            if (!groups[subName]) {
                groups[subName] = []
            }
            groups[subName].push(item)
        })
        return Object.entries(groups)
            .map(([name, list]) => ({ name, list }))
            .filter(g => g.list.length > 0)
    }, [filteredResults, selectedCategories])

    const handleTypeChange = (newType: string) => {
        if (newType === currentType) return
        setCurrentType(newType as any)
        setSelectedCategories([])
        setMinPrice("")
        setMaxPrice("")
        setPromoOn(false)
        updateUrl(selectedCitySlug, [], query, newType)
    }

    const toggleCategory = (catName: string) => {
        setSelectedCategories((prev) => {
            const next = prev.includes(catName) ? [] : [catName]
            updateUrl(selectedCitySlug, next, query, currentType)
            return next
        })
    }

    const handleSelectCity = (citySlug: string | null) => {
        if (citySlug) {
            document.cookie = `dudit_city=${citySlug}; path=/; max-age=${60 * 60 * 24 * 30}`
            localStorage.setItem("dudit_city", citySlug)
        } else {
            document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
            localStorage.removeItem("dudit_city")
        }
        setSelectedCitySlug(citySlug)
        setCitySearchText("")
        updateUrl(citySlug, selectedCategories, query, currentType)
    }

    // Filter cities list by search input
    const filteredCitiesSuggestions = useMemo(() => {
        if (!citySearchText) return []
        const q = citySearchText
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[-\s]+/g, " ")
            .trim()
        return citiesData
            .filter((slug: string) => {
                const norm = slug
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[-\s]+/g, " ")
                return norm.includes(q)
            })
            .slice(0, 5)
    }, [citySearchText])

    // Group remaining products by category for feed view
    const categoriesWithProducts = useMemo(() => {
        const groups: { [key: string]: any[] } = {}
        filteredResults.forEach((item) => {
            if (item.itemType === 'produto' || item.itemType === 'servico') {
                const cat = item.category || "Outros"
                if (!groups[cat]) groups[cat] = []
                groups[cat].push(item)
            }
        })
        return Object.entries(groups)
            .map(([name, list]) => ({ name, list }))
            .filter(g => g.list.length >= 2)
            .slice(0, 3) // Show top 3 category carousels
    }, [filteredResults])

    // Get products not in top category carousels
    const remainingResults = useMemo(() => {
        if (query) {
            return filteredResults
        }
        if (currentType !== 'tudo' || selectedCategories.length > 0 || categoriesWithProducts.length === 0) {
            return filteredResults
        }
        const topCategoriesNames = categoriesWithProducts.map(c => c.name)
        return filteredResults.filter(item => !topCategoriesNames.includes(item.category || "Outros"))
    }, [filteredResults, categoriesWithProducts, currentType, selectedCategories, query])

    const pageTitle = useMemo(() => {
        const citySuffix = selectedCitySlug ? ` em ${formatCitySlug(selectedCitySlug).split(" - ")[0]}` : ""
        if (query) return `Resultados para "${query}"${citySuffix}`
        if (selectedCategories.length > 0) return `${selectedCategories[0]}${citySuffix}`
        if (currentType === "produtos") return `Produtos${citySuffix}`
        if (currentType === "servicos") return `Serviços${citySuffix}`
        if (currentType === "planos") return `Assinaturas e Planos${citySuffix}`
        if (currentType === "vitrines") return `Lojas e Vitrines${citySuffix}`
        return `Explorar`
    }, [query, currentType, selectedCategories, selectedCitySlug])

    const emptySubtitle = useMemo(() => {
        const cityNameOnly = selectedCitySlug ? formatCitySlug(selectedCitySlug).split(" - ")[0] : ""
        const term = query || (selectedCategories.length > 0 ? selectedCategories[0] : "")
        if (term) {
            return `Ainda não encontramos resultados para <strong class='text-brand-dark'>"${term}"</strong> em <strong class='text-brand-dark'>${cityNameOnly}</strong>. Conhece alguém que vende? Convide pra Dudit!`
        }
        if (currentType === "produtos") {
            return `Nenhum produto cadastrado em <strong class='text-brand-dark'>${cityNameOnly}</strong> ainda. Seja o primeiro a vender aqui — é gratuito e sem comissão!`
        }
        if (currentType === "servicos") {
            return `Nenhum serviço cadastrado em <strong class='text-brand-dark'>${cityNameOnly}</strong> ainda. Seja o primeiro a oferecer seus serviços — é gratuito e sem comissão!`
        }
        if (currentType === "planos") {
            return `Nenhum plano recorrente cadastrado em <strong class='text-brand-dark'>${cityNameOnly}</strong> ainda. Seja o primeiro a oferecer assinaturas — é gratuito e sem comissão!`
        }
        if (currentType === "vitrines") {
            return `Nenhuma loja cadastrada em <strong class='text-brand-dark'>${cityNameOnly}</strong> ainda. Crie sua vitrine — é gratuito e sem comissão!`
        }
        return `Nenhum vendedor cadastrado em <strong class='text-brand-dark'>${cityNameOnly}</strong> ainda. Seja o primeiro ou convide quem você conhece!`
    }, [currentType, selectedCitySlug, query, selectedCategories])

    const handleInvite = useCallback(() => {
        const cityNameOnly = selectedCitySlug ? formatCitySlug(selectedCitySlug).split(" - ")[0] : ""
        const term = query || (selectedCategories.length > 0 ? selectedCategories[0] : "") || "produtos e serviços"
        const text = `Oi! Procurei por "${term}" na Dudit em ${cityNameOnly} e ainda não encontrei vendedores. Que tal começar a vender na Dudit? É 100% gratuito e sem taxas: https://dudit.com.br/invite`
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
        window.open(url, "_blank")
    }, [selectedCitySlug, query, selectedCategories])

    return (
        <>
            {!hideHeaderAndFooter && <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />}
            <div className="min-h-screen bg-white font-sans animate-fade-in flex flex-col pt-2">
                <style>{`
                    .scrollbar-none::-webkit-scrollbar { display: none; }
                    .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                `}</style>

                {/* 1. TITLE SECTION */}
                {!isLandingPage && (
                    <div className="container mx-auto px-4 max-w-[1400px] mt-6">
                        <h1 className="text-lg lg:text-3xl font-medium text-brand-dark mb-6">
                            {pageTitle}
                        </h1>
                    </div>
                )}

                {/* 2. CATEGORIES RECTANGULAR SLIDER */}
                {(currentType === 'tudo' || currentType === 'produtos' || currentType === 'vitrines' || currentType === 'servicos') && activeCategoriesList.length > 0 && (
                    <div className="bg-white py-6">
                        <div className="container mx-auto px-4 max-w-[1400px]">
                            <div className="flex gap-3 overflow-x-auto scrollbar-none py-2 px-1">
                                {activeCategoriesList.map((cat, idx) => {
                                    const isSelected = selectedCategories.includes(cat.name)
                                    const gradient = CATEGORY_GRADIENTS[idx % CATEGORY_GRADIENTS.length]
                                    return (
                                        <div
                                            key={cat.name}
                                            onClick={() => toggleCategory(cat.name)}
                                            className="flex flex-col items-center cursor-pointer select-none shrink-0 w-[80px] sm:w-[96px]"
                                        >
                                            <div
                                                className={`relative w-[80px] h-[80px] sm:w-[96px] sm:h-[96px] rounded-[24px] overflow-hidden border border-transparent select-none bg-gradient-to-br ${gradient} ${isSelected
                                                    ? "ring-2 ring-brand-green ring-offset-2"
                                                    : ""
                                                    }`}
                                            >
                                                <div className="flex items-center justify-center w-full h-full p-4 sm:p-5">
                                                    {cat.icon_url ? (
                                                        <img
                                                            src={cat.icon_url}
                                                            alt={cat.name}
                                                            className="w-12 h-12 sm:w-14 sm:h-14 object-contain select-none"
                                                        />
                                                    ) : (
                                                        <span className="text-3xl sm:text-4xl filter drop-shadow-sm select-none">📦</span>
                                                    )}
                                                </div>
                                            </div>
                                            <span
                                                className={`text-[12px] sm:text-[13px] font-bold text-center mt-2 leading-tight truncate w-full select-none ${isSelected ? "text-brand-green font-extrabold" : "text-brand-dark"
                                                    }`}
                                            >
                                                {cat.name}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. FILTERS BAR (NOT STICKY - SCROLLS ALONG WITH THE PAGE) */}
                {!isLandingPage && rawItems.length > 0 && (
                    <div className="bg-white py-4">
                        <div className="container mx-auto px-4 max-w-[1400px] flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1 flex-1">

                                {/* CITY FILTER CHIP */}
                                <button
                                    onClick={() => setIsCityModalOpen(true)}
                                    className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap select-none cursor-pointer ${selectedCitySlug
                                        ? "bg-[#ecfdf5] border-brand-green text-brand-green"
                                        : "bg-white border-gray-200 text-brand-dark"
                                        }`}
                                >
                                    <span>{selectedCitySlug ? formatCitySlug(selectedCitySlug) : "Selecione a Cidade"}</span>
                                </button>

                                {/* SORT FILTER CHIP */}
                                <button
                                    onClick={() => setIsSortModalOpen(true)}
                                    className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap select-none cursor-pointer ${sortBy !== "relevancia"
                                        ? "bg-[#ecfdf5] border-brand-green text-brand-green"
                                        : "bg-white border-gray-200 text-brand-dark"
                                        }`}
                                >
                                    <span>Ordenar por: {sortBy === 'relevancia' ? 'Relevância' : sortBy === 'preco_menor' ? 'Menor Preço' : sortBy === 'preco_maior' ? 'Maior Preço' : 'Mais Recentes'}</span>
                                </button>

                                {/* TYPE FILTER CHIP */}
                                <button
                                    onClick={() => setIsTypeModalOpen(true)}
                                    className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap select-none cursor-pointer ${currentType !== "tudo"
                                        ? "bg-[#ecfdf5] border-brand-green text-brand-green"
                                        : "bg-white border-gray-200 text-brand-dark"
                                        }`}
                                >
                                    <span>Ver: {currentType === 'tudo' ? 'Tudo' : currentType === 'produtos' ? 'Produtos' : currentType === 'servicos' ? 'Serviços' : currentType === 'planos' ? 'Assinaturas' : 'Lojas'}</span>
                                </button>

                                {/* CATEGORY FILTER CHIP (SHOWN ONLY WHEN TOP CATEGORIES SLIDER IS HIDDEN) */}
                                {currentType === 'servicos' && (
                                    <button
                                        onClick={() => setIsCategoryModalOpen(true)}
                                        className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap select-none cursor-pointer ${selectedCategories.length > 0
                                            ? "bg-[#ecfdf5] border-brand-green text-brand-green"
                                            : "bg-white border-gray-200 text-brand-dark"
                                            }`}
                                    >
                                        <span>Categoria</span>
                                        {selectedCategories.length > 0 && <span className="text-[10px] font-extrabold">({selectedCategories.length})</span>}
                                    </button>
                                )}

                                {/* PROMOTION FILTER CHIP */}
                                <button
                                    onClick={() => setPromoOn(!promoOn)}
                                    className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap select-none cursor-pointer ${promoOn
                                        ? "bg-brand-green text-white border-brand-green"
                                        : "bg-white border-gray-200 text-brand-dark"
                                        }`}
                                >
                                    <span>Em Promoção</span>
                                </button>

                                {/* PRICE FILTER CHIP */}
                                <button
                                    onClick={() => setIsPriceModalOpen(true)}
                                    className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap select-none cursor-pointer ${minPrice || maxPrice
                                        ? "bg-[#ecfdf5] border-brand-green text-brand-green"
                                        : "bg-white border-gray-200 text-brand-dark"
                                        }`}
                                >
                                    <span>Preço</span>
                                    {(minPrice || maxPrice) && <span className="font-extrabold text-[10px]">({minPrice ? `≥R$${minPrice}` : ""} {maxPrice ? `≤R$${maxPrice}` : ""})</span>}
                                </button>

                                {/* CLEAR ALL FILTERS */}
                                {activeFiltersCount > 0 && (
                                    <button
                                        onClick={() => {
                                            setSelectedCategories([])
                                            setMinPrice("")
                                            setMaxPrice("")
                                            setPromoOn(false)
                                            setSortBy("relevancia")
                                            setCurrentType("tudo")
                                            updateUrl(selectedCitySlug, [], query, "tudo")
                                        }}
                                        className="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-full text-xs font-bold flex items-center gap-1 transition-all duration-200 select-none cursor-pointer"
                                    >
                                        <span>Limpar filtros</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 4. MAIN PRODUCT & LOJA CONTENT SECTION */}
                <div className="container mx-auto px-4 max-w-[1400px] flex-grow pb-24 lg:pb-12 mt-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`${currentType}-${selectedCategories.join(",")}-${selectedCitySlug}-${isLoading || (isFetching && !isFetchingNextPage)}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            {isLoading || (isFetching && !isFetchingNextPage) ? (
                                <ExploreContentSkeleton type={currentType} />
                            ) : !selectedCitySlug ? (
                                <div className="flex justify-center">
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                                        imageAlt="Onde você está?"
                                        title="Onde você está?"
                                        subtitle="Para encontrar os melhores produtos, serviços e negócios locais pertinho de você, precisamos saber a sua localização."
                                        itemButton={{
                                            text: "Escolher Cidade",
                                            action: () => {
                                                setIsCityModalOpen(true)
                                            },
                                            variant: "default"
                                        }}
                                    />
                                </div>
                            ) : rawItems.length === 0 ? (
                                <div className="flex justify-center">
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc="https://img.dudit.com.br/static/mascots/EstamosChegando.png"
                                        imageAlt="Estamos Chegando!"
                                        title="Estamos Chegando!"
                                        subtitle={emptySubtitle}
                                        buttons={[
                                            {
                                                text: "Eu vendo algo",
                                                action: () => {
                                                    router.push(userProfile ? "/erp/switch" : "/auth/login?mode=partner")
                                                },
                                                variant: "default"
                                            },
                                            {
                                                text: "Conheço quem vende",
                                                action: handleInvite,
                                                variant: "outline"
                                            }
                                        ]}
                                    />
                                </div>
                            ) : isLandingPage ? (
                                <div className="space-y-12">
                                    <div>
                                        <h2 className="text-lg lg:text-2xl font-medium text-brand-dark mb-6">
                                            Descubra o que tem em {formatCitySlug(selectedCitySlug).split(" - ")[0]}
                                        </h2>

                                        {/* Premium iFood-style Banners */}
                                        <div className="flex md:grid md:grid-cols-3 gap-4 overflow-x-auto md:overflow-visible scrollbar-none snap-x snap-mandatory px-4 md:px-0 -mx-4 md:mx-0 py-1">
                                            {/* Banner 1: Produtos */}
                                            <div
                                                onClick={() => handleTypeChange("produtos")}
                                                className="w-[82vw] md:w-auto shrink-0 md:shrink snap-center relative overflow-hidden rounded-lg cursor-pointer select-none active:scale-[0.98] transition-all duration-300 group"
                                            >
                                                <img
                                                    src="https://img.dudit.com.br/static/banners/BannerProdutos.png"
                                                    alt="Produtos"
                                                    className="w-full h-auto block object-cover group-hover:scale-[1.02] transition-transform duration-300"
                                                />
                                            </div>

                                            {/* Banner 2: Serviços */}
                                            <div
                                                onClick={() => handleTypeChange("servicos")}
                                                className="w-[82vw] md:w-auto shrink-0 md:shrink snap-center relative overflow-hidden rounded-lg cursor-pointer select-none active:scale-[0.98] transition-all duration-300 group"
                                            >
                                                <img
                                                    src="https://img.dudit.com.br/static/banners/BannerServicos.png"
                                                    alt="Serviços"
                                                    className="w-full h-auto block object-cover group-hover:scale-[1.02] transition-transform duration-300"
                                                />
                                            </div>

                                            {/* Banner 3: Alimentação */}
                                            <div
                                                onClick={() => {
                                                    setCurrentType("tudo")
                                                    setSelectedCategories(["Alimentação"])
                                                    updateUrl(selectedCitySlug, ["Alimentação"], query, "tudo")
                                                }}
                                                className="w-[82vw] md:w-auto shrink-0 md:shrink snap-center relative overflow-hidden rounded-lg cursor-pointer select-none active:scale-[0.98] transition-all duration-300 group"
                                            >
                                                <img
                                                    src="https://img.dudit.com.br/static/banners/BannerAlimentacao.png"
                                                    alt="Alimentação"
                                                    className="w-full h-auto block object-cover group-hover:scale-[1.02] transition-transform duration-300"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Infinite Scrolled Grid of Vitrines */}
                                    <div>
                                        <h3 className="text-lg lg:text-2xl font-medium text-brand-dark mb-6">
                                            Lojas e Profissionais em {formatCitySlug(selectedCitySlug).split(" - ")[0]}
                                        </h3>

                                        <div className="flex overflow-x-auto gap-4 pb-4 scrollbar-none snap-x snap-mandatory px-4 md:px-0 -mx-4 md:mx-0 py-1 md:grid md:grid-cols-3 lg:grid-cols-4 md:gap-6 md:overflow-visible md:pb-0">
                                            {normalizedInitialResults.map((item) => (
                                                <VitrineCard key={`vitrine-landing-${item.id}`} vitrine={item} hideCity={!!selectedCitySlug} className="w-[260px] sm:w-[280px] md:w-full shrink-0 md:shrink snap-center" />
                                            ))}

                                            {/* INFINITE SCROLL OBSERVER */}
                                            {hasNextPage && (
                                                <div
                                                    ref={observerTarget}
                                                    className="shrink-0 w-[120px] md:col-span-full md:w-full py-6 md:py-12 flex flex-col items-center justify-center min-h-[120px] snap-center"
                                                >
                                                    {isFetchingNextPage ? (
                                                        <div className="flex flex-col items-center gap-2 animate-pulse text-center">
                                                            <SkeletonLoader height={24} width={80} />
                                                            <span className="text-[9px] md:text-[11px] font-bold text-brand-inactive-text">Carregando...</span>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* A. VITRINES (LOJAS) RELACIONADAS CAROUSEL (DOORDASH STYLE) */}
                                    {selectedCategories.length === 0 && !query && vitrinesDestaque.length > 0 && (
                                        <HorizontalCarousel
                                            title="Lojas e Profissionais Recomendados"
                                            items={vitrinesDestaque}
                                            onSeeAll={() => handleTypeChange('vitrines')}
                                            itemWidthClass="w-[280px] md:w-[320px]"
                                            renderItem={(item) => <VitrineCard vitrine={item} hideCity={!!selectedCitySlug} className="w-full" />}
                                        />
                                    )}

                                    {selectedCategories.length === 0 && !query && exploreAds.length > 0 && (
                                        <SponsoredAdsCarousel
                                            ads={exploreAds}
                                            slot="explore"
                                            title="Patrocinados perto de você"
                                            size="compact"
                                            className="mb-6"
                                        />
                                    )}

                                    {/* B. FEED MODE: SHOW CAROUSELS BY CATEGORY FIRST */}
                                    {selectedCategories.length === 0 && !query && currentType === 'tudo' && categoriesWithProducts.length > 0 && (
                                        <div className="space-y-4">
                                            {categoriesWithProducts.map((catGroup) => (
                                                <HorizontalCarousel
                                                    key={catGroup.name}
                                                    title={`${catGroup.name} em destaque`}
                                                    items={catGroup.list}
                                                    itemWidthClass="w-[200px] md:w-[230px]"
                                                    renderItem={(item) => {
                                                        const userCoords = userProfile?.latitude && userProfile?.longitude
                                                            ? { lat: userProfile.latitude, lng: userProfile.longitude }
                                                            : null
                                                        return <ItemCard product={item} userCoords={userCoords} className="w-full" />
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {/* NEW: B.2 OUTROS ITENS CAROUSEL */}
                                    {selectedCategories.length === 0 && !query && currentType === 'tudo' && outrosItems.length > 0 && (
                                        <HorizontalCarousel
                                            title="Outros Itens"
                                            items={outrosItems}
                                            onSeeAll={() => {
                                                setSelectedCategories(["Outros"])
                                                updateUrl(selectedCitySlug, ["Outros"], query, currentType)
                                            }}
                                            itemWidthClass="w-[200px] md:w-[230px]"
                                            renderItem={(item) => {
                                                const userCoords = userProfile?.latitude && userProfile?.longitude
                                                    ? { lat: userProfile.latitude, lng: userProfile.longitude }
                                                    : null
                                                return <ItemCard product={item} userCoords={userCoords} className="w-full" />
                                            }}
                                        />
                                    )}

                                    {/* C. PRODUTOS EM PROMOÇÃO CAROUSEL */}
                                    {selectedCategories.length === 0 && !query && currentType === 'produtos' && promoProducts.length > 0 && (
                                        <HorizontalCarousel
                                            title="Produtos em Promoção"
                                            items={promoProducts}
                                            itemWidthClass="w-[200px] md:w-[230px]"
                                            renderItem={(item) => {
                                                const userCoords = userProfile?.latitude && userProfile?.longitude
                                                    ? { lat: userProfile.latitude, lng: userProfile.longitude }
                                                    : null
                                                return <ItemCard product={item} userCoords={userCoords} className="w-full" />
                                            }}
                                        />
                                    )}

                                    {/* C. MAIN LISTINGS (GRID OR CAROUSEL FALLBACK) */}
                                    {selectedCategories.length === 0 && (
                                        <div className="mt-8">
                                            {currentType === 'tudo' && !query && categoriesWithProducts.length > 0 && remainingResults.length > 0 && (
                                                <h3 className="text-[16px] lg:text-[20px] font-bold text-brand-dark mb-6 opacity-90 tracking-wide border-t border-gray-100 pt-8">
                                                    Outras ofertas incríveis
                                                </h3>
                                            )}

                                            {remainingResults.length === 0 && vitrinesDestaque.length === 0 && !hasNextPage ? (
                                                <div className="py-12 flex flex-col items-center">
                                                    <IconPlaceholder
                                                        placeholderType="image"
                                                        imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                        imageAlt="O Dino revirou tudo e não achou!"
                                                        title="O Dino revirou tudo e não achou!"
                                                        subtitle="Ainda não temos parceiros ativos nessa cidade ou com essa combinação de filtros. Que tal mudar de cidade ou limpar os filtros?"
                                                    />
                                                    {activeFiltersCount > 0 && (
                                                        <button
                                                            onClick={() => {
                                                                setSelectedCategories([])
                                                                setMinPrice("")
                                                                setMaxPrice("")
                                                                setPromoOn(false)
                                                                setSortBy("relevancia")
                                                                setCurrentType("tudo")
                                                                updateUrl(selectedCitySlug, [], query, "tudo")
                                                            }}
                                                            className="mt-6 px-6 py-2.5 bg-brand-green text-white font-bold rounded-xl text-xs shadow-md hover:bg-brand-dark transition-colors duration-200 select-none cursor-pointer"
                                                        >
                                                            Limpar filtros de busca
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className={`grid ${currentType === 'vitrines' ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'} gap-3 md:gap-4 lg:gap-6`}>
                                                    {remainingResults.map((item, index) => {
                                                        const userCoords = userProfile?.latitude && userProfile?.longitude
                                                            ? { lat: userProfile.latitude, lng: userProfile.longitude }
                                                            : null

                                                        const resultNode = item.itemType === 'loja' ? (
                                                            <VitrineCard key={`loja-${item.id}`} vitrine={item} hideCity={!!selectedCitySlug} className="w-full" />
                                                        ) : (
                                                            <ItemCard key={item.id} product={item as any} userCoords={userCoords} className="w-full" />
                                                        )

                                                        const shouldInjectSearchAds = !!query && searchAds.length > 0 && index === 5

                                                        if (!shouldInjectSearchAds) {
                                                            return resultNode
                                                        }

                                                        return (
                                                            <Fragment key={`result-with-ads-${item.id}`}>
                                                                {resultNode}
                                                                <SponsoredAdsSearchInline ads={searchAds} />
                                                            </Fragment>
                                                        )
                                                    })}

                                                    {/* INFINITE SCROLL OBSERVER */}
                                                    {hasNextPage && (
                                                        <div
                                                            ref={observerTarget}
                                                            className="col-span-full py-12 flex flex-col items-center justify-center min-h-[120px]"
                                                        >
                                                            {isFetchingNextPage ? (
                                                                <div className="flex flex-col items-center gap-2 animate-pulse">
                                                                    <SkeletonLoader height={24} width={180} />
                                                                    <span className="text-[11px] font-bold text-brand-inactive-text">Carregando mais opções...</span>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* D. CATEGORY-SPECIFIC LAYOUT */}
                                    {selectedCategories.length > 0 && (
                                        <div className="space-y-8">
                                            {selectedCategories[0] === "Outros" ? (
                                                <div>
                                                    <h3 className="text-lg lg:text-2xl font-medium text-brand-dark mb-6">
                                                        Itens Diversos
                                                    </h3>
                                                    {filteredResults.length === 0 ? (
                                                        <div className="py-12 flex flex-col items-center">
                                                            <IconPlaceholder
                                                                placeholderType="image"
                                                                imageSrc="https://img.dudit.com.br/static/mascots/EstamosChegando.png"
                                                                imageAlt="Estamos Chegando!"
                                                                title="Estamos Chegando!"
                                                                subtitle={`Ainda não temos itens diversos em <strong class='text-brand-dark'>${selectedCitySlug ? formatCitySlug(selectedCitySlug).split(" - ")[0] : "sua cidade"}</strong>. Conhece alguém que vende? Convide pra Dudit!`}
                                                                buttons={[
                                                                    {
                                                                        text: "Eu vendo algo",
                                                                        action: () => {
                                                                            router.push(userProfile ? "/erp/switch" : "/auth/login?mode=partner")
                                                                        },
                                                                        variant: "default" as const
                                                                    },
                                                                    {
                                                                        text: "Conheço quem vende",
                                                                        action: handleInvite,
                                                                        variant: "outline" as const
                                                                    }
                                                                ]}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6">
                                                            {filteredResults.map((item) => {
                                                                if (item.itemType === 'loja') {
                                                                    return <VitrineCard key={`loja-${item.id}`} vitrine={item} hideCity={!!selectedCitySlug} className="w-full" />
                                                                }
                                                                const userCoords = userProfile?.latitude && userProfile?.longitude
                                                                    ? { lat: userProfile.latitude, lng: userProfile.longitude }
                                                                    : null
                                                                return <ItemCard key={item.id} product={item as any} userCoords={userCoords} className="w-full" />
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Vendedores da Categoria */}
                                                    {categoryShowcases.length > 0 && (
                                                        <HorizontalCarousel
                                                            title="Lojas e Vendedores"
                                                            items={categoryShowcases}
                                                            itemWidthClass="w-[280px] md:w-[320px]"
                                                            renderItem={(item) => <VitrineCard vitrine={item} hideCity={!!selectedCitySlug} className="w-full" />}
                                                        />
                                                    )}

                                                    {/* Ofertas da Categoria */}
                                                    {categoryOffers.length > 0 && (
                                                        <HorizontalCarousel
                                                            title="Ofertas da Categoria"
                                                            items={categoryOffers}
                                                            itemWidthClass="w-[200px] md:w-[230px]"
                                                            renderItem={(item) => {
                                                                const userCoords = userProfile?.latitude && userProfile?.longitude
                                                                    ? { lat: userProfile.latitude, lng: userProfile.longitude }
                                                                    : null
                                                                return <ItemCard product={item} userCoords={userCoords} className="w-full" />
                                                            }}
                                                        />
                                                    )}

                                                    {/* Seções por Subcategoria */}
                                                    {subcategoryGroups.map((group) => (
                                                        <HorizontalCarousel
                                                            key={group.name}
                                                            title={group.name}
                                                            items={group.list}
                                                            itemWidthClass="w-[200px] md:w-[230px]"
                                                            renderItem={(item) => {
                                                                const userCoords = userProfile?.latitude && userProfile?.longitude
                                                                    ? { lat: userProfile.latitude, lng: userProfile.longitude }
                                                                    : null
                                                                return <ItemCard product={item} userCoords={userCoords} className="w-full" />
                                                            }}
                                                        />
                                                    ))}

                                                    {/* Nenhuma correspondência nos filtros da categoria */}
                                                    {categoryShowcases.length === 0 && categoryOffers.length === 0 && subcategoryGroups.length === 0 && (
                                                        <div className="py-12 flex flex-col items-center">
                                                            <IconPlaceholder
                                                                placeholderType="image"
                                                                imageSrc="https://img.dudit.com.br/static/mascots/EstamosChegando.png"
                                                                imageAlt="Estamos Chegando!"
                                                                title="Estamos Chegando!"
                                                                subtitle={`Ainda não temos itens de <strong class='text-brand-dark'>${selectedCategories[0]}</strong> em <strong class='text-brand-dark'>${selectedCitySlug ? formatCitySlug(selectedCitySlug).split(" - ")[0] : "sua cidade"}</strong>. Conhece alguém que vende? Convide pra Dudit!`}
                                                                buttons={[
                                                                    {
                                                                        text: "Eu vendo algo",
                                                                        action: () => {
                                                                            router.push(userProfile ? "/erp/switch" : "/auth/login?mode=partner")
                                                                        },
                                                                        variant: "default" as const
                                                                    },
                                                                    {
                                                                        text: "Conheço quem vende",
                                                                        action: handleInvite,
                                                                        variant: "outline" as const
                                                                    }
                                                                ]}
                                                            />
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
                {!hideHeaderAndFooter && <MarketplaceFooter />}
            </div >

            {/* ========================================================
                PREMIUM REUSABLE MODALS (REPLACING OLD INLINE POPOVERS)
                ======================================================== */}

            {/* 1. SORT MODAL */}
            <DefaultModal
                isOpen={isSortModalOpen}
                onClose={() => setIsSortModalOpen(false)}
                title="Ordenar por"
                maxWidth="md"
            >
                <div className="flex flex-col gap-1 py-2 px-4">
                    {[
                        { value: "relevancia", label: "Relevância" },
                        { value: "preco_menor", label: "Menor Preço" },
                        { value: "preco_maior", label: "Maior Preço" },
                        { value: "recentes", label: "Mais Recentes" }
                    ].map((opt) => (
                        <RadioButton
                            key={opt.value}
                            name="sort_option"
                            value={opt.value}
                            checked={sortBy === opt.value}
                            onChange={() => {
                                setSortBy(opt.value as any)
                                setIsSortModalOpen(false)
                            }}
                            label={opt.label}
                        />
                    ))}
                </div>
            </DefaultModal>

            {/* 2. TYPE MODAL */}
            <DefaultModal
                isOpen={isTypeModalOpen}
                onClose={() => setIsTypeModalOpen(false)}
                title="Tipo de Negócio"
                maxWidth="md"
            >
                <div className="flex flex-col gap-1 py-2 px-4">
                    {[
                        { value: "tudo", label: "Ver Tudo" },
                        { value: "produtos", label: "Produtos" },
                        { value: "servicos", label: "Serviços" },
                        { value: "planos", label: "Assinaturas Recorrentes" },
                        { value: "vitrines", label: "Lojas e Vitrines" }
                    ].map((opt) => (
                        <RadioButton
                            key={opt.value}
                            name="business_type"
                            value={opt.value}
                            checked={currentType === opt.value}
                            onChange={() => {
                                handleTypeChange(opt.value)
                                setIsTypeModalOpen(false)
                            }}
                            label={opt.label}
                        />
                    ))}
                </div>
            </DefaultModal>

            {/* 3. CITY SELECTOR MODAL */}
            <DefaultModal
                isOpen={isCityModalOpen}
                onClose={() => setIsCityModalOpen(false)}
                title="📍 Localização"
                maxWidth="md"
            >
                <div className="flex flex-col gap-4 py-2 text-brand-dark">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500">Filtrar vendedores da cidade:</span>
                        {selectedCitySlug && (
                            <button
                                onClick={() => {
                                    handleSelectCity(null)
                                    setIsCityModalOpen(false)
                                }}
                                className="text-xs text-red-500 font-bold underline"
                            >
                                Remover filtro
                            </button>
                        )}
                    </div>

                    <div className="relative flex items-center">
                        <input
                            type="text"
                            placeholder="Buscar cidade... (ex: São Paulo, Bauru)"
                            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none text-brand-dark"
                            value={citySearchText}
                            onChange={(e) => setCitySearchText(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={() => {
                            requestLocation()
                            setIsCityModalOpen(false)
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border rounded-md text-xs font-bold text-brand-dark"
                    >
                        <MapPin className="w-4 h-4" />
                        <span>Usar minha localização</span>
                    </button>

                    {filteredCitiesSuggestions.length > 0 && (
                        <div className="flex flex-col gap-1 border-t pt-2">
                            {filteredCitiesSuggestions.map((slug) => (
                                <button
                                    key={slug}
                                    onClick={() => {
                                        handleSelectCity(slug)
                                        setIsCityModalOpen(false)
                                    }}
                                    className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark"
                                >
                                    <span>{formatCitySlug(slug)}</span>
                                    {selectedCitySlug === slug && <Check className="w-4 h-4 text-brand-green" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DefaultModal>

            {/* 4. PRICE MODAL */}
            <DefaultModal
                isOpen={isPriceModalOpen}
                onClose={() => setIsPriceModalOpen(false)}
                title="Filtrar por Preço"
                maxWidth="sm"
                footer={
                    <div className="flex items-center justify-end w-full pt-4 gap-4">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setMinPrice("")
                                setMaxPrice("")
                                setIsPriceModalOpen(false)
                            }}
                        >
                            Limpar
                        </Button>
                        <Button onClick={() => setIsPriceModalOpen(false)}>
                            Aplicar
                        </Button>
                    </div>
                }
            >
                <div className="flex gap-4 py-4 text-brand-dark">
                    <div className="flex-1">
                        <MoneyInput
                            label="Preço Mínimo"
                            placeholder="Mínimo"
                            value={minPrice}
                            onChange={(val) => setMinPrice(val || "")}
                        />
                    </div>
                    <div className="flex-1">
                        <MoneyInput
                            label="Preço Máximo"
                            placeholder="Máximo"
                            value={maxPrice}
                            onChange={(val) => setMaxPrice(val || "")}
                        />
                    </div>
                </div>
            </DefaultModal>

            {/* 5. CATEGORY MODAL (SHOWN ONLY WHEN TOP CATEGORIES SLIDER IS HIDDEN) */}
            <DefaultModal
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                title="Filtrar por Categoria"
                maxWidth="md"
            >
                <div className="flex flex-col gap-2 py-2 max-h-[350px] overflow-y-auto pr-1">
                    {categoriesList.map((cat) => {
                        const isSelected = selectedCategories.includes(cat.name)
                        return (
                            <button
                                key={cat.name}
                                onClick={() => toggleCategory(cat.name)}
                                className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark"
                            >
                                <div className="flex items-center gap-3">
                                    {cat.icon_url ? (
                                        <img src={cat.icon_url} alt={cat.name} className="w-6 h-6 object-contain" />
                                    ) : (
                                        <span className="text-lg">📦</span>
                                    )}
                                    <span>{cat.name}</span>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-brand-green" />}
                            </button>
                        )
                    })}
                </div>
            </DefaultModal>
        </>
    )
}
