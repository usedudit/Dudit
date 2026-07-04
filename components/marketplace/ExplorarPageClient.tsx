"use client"

import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from "react"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { ItemCard, VitrineCard, HeroBanner, HorizontalCarousel } from "./shared-components"
import { IconPlaceholder, Button, DefaultModal, RadioButton } from "@/components/reusable"
import { MoneyInput } from "@/components/reusable/Inputs/MoneyInput"
import { useRouter, useSearchParams, usePathname, useParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { SkeletonLoader } from "@/components/reusable/SkeletonLoader"
import {
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    MapPin,
    Check,
    SlidersHorizontal,
} from "lucide-react"
import Link from "next/link"
import { applySellerDiversity, calcCategoryBrowseScore, sortByTrendingScore } from "@/lib/marketplace/ranking"
import { searchMarketplace, type MarketplaceListCursor } from "@/app/actions/marketplace/search"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { getProductDisplayImages } from "@/lib/utils/product-display-images"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { getPartnerUrl, getPlanUrl, getProductUrl, getServiceUrl } from "@/lib/utils/url-generator"
import { formatCurrency } from "@/lib/utils"
import { SponsoredAdsCarousel } from "@/components/marketplace/ads/SponsoredAdsCarousel"
import { SponsoredAdsSearchInline } from "@/components/marketplace/ads/SponsoredAdsSlot"
import type { SponsoredAd } from "@/lib/ads/types"
import citiesData from "@/lib/data/cities.json"
import { useLocationRedirect } from "@/hooks/use-location-redirect"
import { getMarketplaceCategoriesClient } from "@/lib/data/marketplace-categories-client"
import { parseMarketplaceType } from "@/lib/types/marketplace"
import { ExplorarMobileControls } from "./ExplorarMobileControls"
import { ExplorarHeaderSection } from "./ExplorarHeaderSection"
import { ExplorarViewControls } from "./ExplorarViewControls"
import { ExplorarFilterSidebar } from "./ExplorarFilterSidebar"
import { ExplorarFiltersBottomSheet } from "./ExplorarFiltersBottomSheet"
import { ExplorarSortBottomSheet } from "./ExplorarSortBottomSheet"

interface ExplorarPageClientProps {
    initialResults?: any[]
    initialMoreDistantSellers?: any[]
    initialMoreDistantItems?: any[]
    initialSection?: string
    query?: string
    type?: 'produtos' | 'servicos' | 'vitrines' | 'tudo' | 'planos'
    cidade?: string
    resolvedCityName?: string | null
    categoria?: string
    sectionTitle?: string
    userProfile?: any
    cartCount?: number
    exploreAds?: SponsoredAd[]
    searchAds?: SponsoredAd[]
    isStateRoute?: boolean
}

type SortOption = "relevancia" | "preco_menor" | "preco_maior" | "recentes"
type ViewMode = "grid" | "list"

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

const SECTIONS_BANNERS = [
    {
        id: "promos",
        title: "Em promoção",
        subtitle: "Ofertas imperdíveis",
        emoji: "🎯",
        gradient: "from-[#FF6B35] to-[#FF8C42]"
    },
    {
        id: "best-rated",
        title: "Melhor avaliados",
        subtitle: "Nota acima de 4.8",
        emoji: "🏆",
        gradient: "from-[#11998e] to-[#38ef7d]"
    },
    {
        id: "best-sellers",
        title: "Mais vendidos",
        subtitle: "Os queridinhos da cidade",
        emoji: "🔥",
        gradient: "from-[#4facfe] to-[#00f2fe]"
    }
]


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

const COMMON_CITY_ACCENTS: Record<string, string> = {
    "sao-paulo": "São Paulo",
    "cambe": "Cambé",
    "brasilia": "Brasília",
    "goiania": "Goiânia",
    "florianopolis": "Florianópolis",
    "belem": "Belém",
    "sao-luis": "São Luís",
    "maceio": "Maceió",
    "cuiaba": "Cuiabá",
    "macapa": "Macapá",
    "vitoria": "Vitória",
    "ribeirao-preto": "Ribeirão Preto",
    "sao-jose-dos-campos": "São José dos Campos",
    "sao-bernardo-do-campo": "São Bernardo do Campo",
    "sao-caetano-do-sul": "São Caetano do Sul",
    "sao-jose-do-rio-preto": "São José do Rio Preto",
    "sao-goncalo": "São Gonçalo",
    "sao-joao-de-meriti": "São João de Meriti",
    "sao-jose": "São José",
    "petropolis": "Petrópolis",
    "teresopolis": "Teresópolis",
    "sao-carlos": "São Carlos",
    "chapeco": "Chapecó",
    "marilia": "Marília",
    "paranagua": "Paranaguá",
    "cacador": "Caçador",
    "criciuma": "Criciúma",
    "tubarao": "Tubarão",
    "blumenau": "Blumenau",
    "joinville": "Joinville",
    "itajai": "Itajaí",
    "balneario-camboriu": "Balneário Camboriú",
    "sao-francisco-do-sul": "São Francisco do Sul",
    "sao-joaquim": "São João",
    "caxias-do-sul": "Caxias do Sul",
    "maringa": "Maringá",
    "cascavel": "Cascavel",
    "ponta-grossa": "Ponta Grossa",
    "foz-do-iguacu": "Foz do Iguaçu",
    "guarapuava": "Guarapuava",
    "paranavai": "Paranavaí",
    "apucarana": "Apucarana",
    "arapongas": "Arapongas",
    "umuarama": "Umuarama",
    "toledo": "Toledo",
    "campo-mourao": "Campo Mourão",
    "patos-de-minas": "Patos de Minas",
    "pocos-de-caldas": "Poços de Caldas",
    "juiz-de-fora": "Juiz de Fora",
    "governador-valadares": "Governador Valadares",
    "teofilo-otoni": "Teófilo Otoni",
    "sao-joao-del-rei": "São João del-Rei",
    "sao-lourenco": "São Lourenço",
    "sao-sebastiao": "São Sebastião",
    "ilhabela": "Ilhabela",
    "ubatuba": "Ubatuba",
    "guaruja": "Guarujá",
    "aracaju": "Aracaju",
    "joao-pessoa": "João Pessoa",
};


const ExploreContentSkeleton = ({ type, hasSection }: { type: string; hasSection?: boolean }) => {
    return (
        <div className="space-y-10 animate-pulse">
            {type === 'tudo' && !hasSection && (
                <div className="space-y-8">
                    {/* Banners Row Skeleton */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <SkeletonLoader width={220} height={24} className="rounded" />
                        </div>
                        <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="shrink-0 w-[220px] sm:w-[260px]">
                                    <SkeletonLoader height={110} className="rounded-[16px]" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Sellers Row Skeleton */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <SkeletonLoader width={180} height={20} className="rounded" />
                        </div>
                        <div className="flex gap-4 overflow-x-auto scrollbar-none pb-2">
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

// Category carousel with horizontal scroll
const CategoryCarousel = ({
    categories,
    selectedCategories,
    onToggleCategory,
    onSeeAllCategories,
}: {
    categories: { id?: string; name: string; icon_url: string | null }[]
    selectedCategories: string[]
    onToggleCategory: (catName: string) => void
    onSeeAllCategories: () => void
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
            const timer = setTimeout(checkScroll, 500)
            return () => {
                el.removeEventListener("scroll", checkScroll)
                window.removeEventListener("resize", checkScroll)
                clearTimeout(timer)
            }
        }
    }, [categories])

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

    return (
        <div className="w-full animate-fade-in">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg lg:text-2xl font-medium text-brand-dark">Categorias</h2>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onSeeAllCategories}
                        className="text-[13px] font-extrabold text-brand-green hover:underline cursor-pointer px-2 py-1 select-none"
                    >
                        Ver tudo
                    </button>
                    <div className="hidden lg:flex items-center gap-1.5">
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
                className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth pb-2 px-1"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {/* "Tudo" card */}
                <div className="snap-start shrink-0 w-[110px]">
                    <button
                        onClick={() => onToggleCategory("__all__")}
                        className={`flex flex-col items-center gap-2 p-3 rounded-[16px] transition-all duration-200 w-full h-full border ${selectedCategories.length === 0
                            ? 'bg-brand-green text-white border-brand-green'
                            : 'bg-white text-brand-dark border-gray-200 hover:border-brand-green hover:bg-green-50'
                            }`}
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedCategories.length === 0 ? 'bg-white/20' : 'bg-brand-gray'
                            }`}>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7" rx="1" />
                                <rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" />
                                <rect x="14" y="14" width="7" height="7" rx="1" />
                            </svg>
                        </div>
                        <span className="text-xs font-bold text-center leading-tight">Tudo</span>
                    </button>
                </div>

                {/* Category cards */}
                {(categories || []).map((cat) => {
                    const isSelected = selectedCategories.includes(cat.name)
                    return (
                        <div key={cat.name} className="snap-start shrink-0 w-[110px]">
                            <button
                                onClick={() => onToggleCategory(cat.name)}
                                className={`flex flex-col items-center gap-2 p-3 rounded-[16px] transition-all duration-200 w-full h-full border ${isSelected
                                    ? 'bg-brand-green text-white border-brand-green'
                                    : 'bg-white text-brand-dark border-gray-200 hover:border-brand-green hover:bg-green-50'
                                    }`}
                            >
                                {cat.icon_url ? (
                                    <img src={cat.icon_url} alt={cat.name} className="w-10 h-10 object-contain" />
                                ) : (
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isSelected ? 'bg-white/20' : 'bg-brand-gray'
                                        }`}>
                                        <span className="text-lg">📦</span>
                                    </div>
                                )}
                                <span className="text-[11px] font-bold text-center leading-tight line-clamp-2">{cat.name}</span>
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export function ExplorarPageClient({
    initialResults = [],
    initialMoreDistantSellers = [],
    initialMoreDistantItems = [],
    initialSection,
    query = '',
    type = 'tudo',
    cidade = '',
    resolvedCityName,
    categoria = '',
    userProfile,
    cartCount,
    hideHeaderAndFooter,
    exploreAds = [],
    searchAds = [],
    isStateRoute = false,
}: ExplorarPageClientProps & { hideHeaderAndFooter?: boolean }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const params = useParams()
    const { requestLocation, loading: isLocationLoading } = useLocationRedirect()

    const slug = (params?.slug as string[]) || []
    const pathCity = slug[0] || ""

    const formatCitySlug = useCallback((slug: string | null) => {
        if (!slug) return ""
        if (slug === "brasil") return "Brasil"
        if (slug.startsWith("estado-")) {
            return slug.replace("estado-", "").toUpperCase()
        }
        if (slug === cidade && resolvedCityName) {
            return resolvedCityName
        }
        const parts = slug.split("-")
        const state = parts.pop()?.toUpperCase() || ""
        const cityKey = parts.join("-")
        
        let city = COMMON_CITY_ACCENTS[cityKey]
        if (!city) {
            city = parts
                .map(p => {
                    if (p === "sao") return "São"
                    if (p === "joao") return "João"
                    if (p === "jose") return "José"
                    if (p === "conceicao") return "Conceição"
                    if (p === "ribeirao") return "Ribeirão"
                    if (p === "uniao") return "União"
                    if (p === "cristovao") return "Cristóvão"
                    if (p === "sebastiao") return "Sebastião"
                    if (p === "cambe") return "Cambé"
                    if (p === "e") return "e"
                    if (p === "do" || p === "da" || p === "dos" || p === "das" || p === "de") return p
                    return p.charAt(0).toUpperCase() + p.slice(1)
                })
                .join(" ")
        }
        return `${city} - ${state}`
    }, [cidade, resolvedCityName])
    const pathCategorySlug = slug[1] || ""
    const pathCategory = pathCategorySlug ? (CATEGORY_SLUG_MAP[pathCategorySlug] || pathCategorySlug) : ""

    const [currentType, setCurrentType] = useState<any>(type)
    const [sortBy, setSortBy] = useState<SortOption>("relevancia")
    const [selectedCitySlug, setSelectedCitySlug] = useState<string | null>(cidade || pathCity || null)
    const [selectedRadius, setSelectedRadius] = useState<number | null>(() => {
        const urlRadius = searchParams.get("radius")
        return urlRadius ? Number(urlRadius) : null
    })
    const [selectedSection, setSelectedSection] = useState<string | null>(() => {
        return initialSection || searchParams.get("section") || null
    })
    const [moreDistantSellers, setMoreDistantSellers] = useState<any[]>(initialMoreDistantSellers)
    const [moreDistantItems, setMoreDistantItems] = useState<any[]>(initialMoreDistantItems)

    const [dbCategories, setDbCategories] = useState<{ id?: string; name: string; icon_url: string | null }[]>([])
    const [viewMode, setViewMode] = useState<ViewMode>("grid")

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
    const [isCityModalOpen, setIsCityModalOpen] = useState(false)
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<"filtros" | "ordenar">("filtros")
    const [isFiltersBottomSheetOpen, setIsFiltersBottomSheetOpen] = useState(false)
    const [isSortBottomSheetOpen, setIsSortBottomSheetOpen] = useState(false)

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

    const isLandingPage = false

    const fetchType = currentType

    const updateUrl = (
        city: string | null,
        categories: string[],
        searchQ: string,
        typeStr: string,
        radiusVal?: number | null,
        sectionVal?: string | null
    ) => {
        const queryParams = new URLSearchParams()
        if (searchQ) queryParams.set("q", searchQ)
        if (typeStr !== "tudo") queryParams.set("type", typeStr)

        const rVal = radiusVal !== undefined ? radiusVal : selectedRadius
        const isCity = city && city !== "brasil" && !city.startsWith("estado-")
        if (rVal && isCity) {
            queryParams.set("radius", String(rVal))
        }

        const sVal = sectionVal !== undefined ? sectionVal : selectedSection
        if (sVal) {
            queryParams.set("section", sVal)
        }

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
        setCurrentType(urlType as any)

        const pathCity = slug[0] || null
        const urlCity = pathCity || searchParams.get("cidade") || null
        if (urlCity !== selectedCitySlug) {
            setSelectedCitySlug(urlCity)
        }

        const urlRadius = searchParams.get("radius")
        setSelectedRadius(urlRadius ? Number(urlRadius) : null)

        const urlSection = searchParams.get("section")
        setSelectedSection(urlSection || null)

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

        setSelectedCategories(nextCats)
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
        queryKey: ["explore", query, fetchType, selectedCitySlug, selectedRadius, selectedSection],
        initialPage: (() => {
            const match = ((fetchType === type && selectedCitySlug === cidade) ||
                (isLandingPage && type === 'tudo' && selectedCitySlug === cidade)) &&
                selectedRadius === (searchParams.get("radius") ? Number(searchParams.get("radius")) : null) &&
                selectedSection === (searchParams.get("section") || null)
            if (!match) return undefined

            const last = initialResults[initialResults.length - 1]
            const calcNextCursor: MarketplaceListCursor | null = last?.id
                ? {
                    id: String(last.id),
                    ...(last.created_at ? { createdAt: String(last.created_at) } : {}),
                    ...(typeof last._searchRank === "number" ? { rank: last._searchRank } : {}),
                }
                : null

            const isTudo = fetchType === 'tudo'
            const limitVal = isTudo ? 10 : 40
            const hasMore = initialResults.length >= limitVal && !!calcNextCursor

            return {
                items: initialResults,
                nextCursor: calcNextCursor,
                hasMore,
            }
        })(),
        fetchFn: async ({ cursor }) => {
            const userCoords = userProfile?.latitude && userProfile?.longitude
                ? { lat: userProfile.latitude, lng: userProfile.longitude }
                : null

            const res = await searchMarketplace(query, fetchType as any, {
                ...limitConfig,
                cursor,
                cidade: selectedCitySlug || undefined,
                radius: selectedRadius || undefined,
                latitude: userCoords?.lat,
                longitude: userCoords?.lng,
                section: selectedSection || undefined,
            })


            if (!cursor) {
                setMoreDistantSellers(res.moreDistantSellers || [])
                setMoreDistantItems(res.moreDistantItems || [])
            }

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
        // Ensure itemCategory is a string (handle case where it might be an object)
        const categoryStr = typeof itemCategory === 'string' ? itemCategory : String(itemCategory || "")
        if (!categoryStr) return false
        const normItem = categoryStr.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        const normTarget = catName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        return normItem === normTarget
    }

    const getItemCategoryNames = (item: any) => {
        return [
            item?.category,
            item?.subcategoryName,
            item?.subcategory,
            item?.marketplace_category?.name,
            item?.marketplace_category?.parent?.name,
            item?.service_categories?.name,
        ].filter(Boolean) as string[]
    }

    const itemMatchesCategory = (item: any, catName: string) => {
        return getItemCategoryNames(item).some((name) => matchCategory(name, catName))
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
                    return itemMatchesCategory(p, activeCat)
                })
            }
        }
        if (minPrice) filtered = filtered.filter((p) => p.price && p.price >= Number(minPrice))
        if (maxPrice) filtered = filtered.filter((p) => p.price && p.price <= Number(maxPrice))
        if (promoOn) filtered = filtered.filter((p) => p.originalPrice !== undefined)

        // Filtragem por Seção
        if (selectedSection) {
            if (selectedSection === "promos") {
                filtered = filtered.filter(p => p.itemType === 'produto' && p.originalPrice !== undefined && p.originalPrice > p.price)
            } else if (selectedSection === "best-rated") {
                filtered = filtered.filter(p => p.itemType === 'produto' && (p.rating ?? 0) >= 4.8)
            } else if (selectedSection === "best-sellers") {
                filtered = filtered.filter(p => p.itemType === 'produto')
            }
        }

        // Sorting
        if (sortBy === "preco_menor") {
            filtered.sort((a, b) => (a.price || 0) - (b.price || 0))
        } else if (sortBy === "preco_maior") {
            filtered.sort((a, b) => (b.price || 0) - (a.price || 0))
        } else if (sortBy === "recentes") {
            filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        } else {
            return applySellerDiversity(
                [...filtered].sort((a, b) => calcCategoryBrowseScore(b) - calcCategoryBrowseScore(a)),
            )
        }
        return filtered
    }, [dataToFilter, selectedCategories, minPrice, maxPrice, promoOn, sortBy, selectedSection, categoriesList])

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
            r => r.itemType === 'loja' && itemMatchesCategory(r, activeCat)
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

    const showFeaturedSections = currentType === 'tudo' && selectedCategories.length === 0 && !query && !selectedSection && rawItems.length > 0



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

    const handleRadiusChange = (radius: number | null) => {
        setSelectedRadius(radius)
        updateUrl(selectedCitySlug, selectedCategories, query, currentType, radius)
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
        const citySuffix = selectedCitySlug 
            ? (selectedCitySlug === "brasil" ? " no Brasil" : ` em ${formatCitySlug(selectedCitySlug)}`)
            : ""
        if (query) return `Resultados para "${query}"${citySuffix}`
        if (selectedSection) {
            if (selectedSection === "promos") return `Itens em promoção${citySuffix}`
            if (selectedSection === "best-rated") return `Melhor avaliados${citySuffix}`
            if (selectedSection === "best-sellers") return `Mais vendidos${citySuffix}`
        }
        if (selectedCategories.length > 0) return `${selectedCategories[0]}${citySuffix}`
        if (currentType === "produtos") return `Produtos${citySuffix}`
        if (currentType === "servicos") return `Serviços${citySuffix}`
        if (currentType === "planos") return `Assinaturas e Planos${citySuffix}`
        if (currentType === "vitrines") return `Lojas e Vitrines${citySuffix}`
        return `Itens${citySuffix}`
    }, [query, currentType, selectedCategories, selectedCitySlug, selectedSection])

    const emptySubtitle = useMemo(() => {
        const cityNameOnly = selectedCitySlug ? formatCitySlug(selectedCitySlug).split(" - ")[0] : ""
        const term = query || (selectedCategories.length > 0 ? selectedCategories[0] : "")
        if (term) {
            return `Ainda não encontramos resultados para <strong class='text-brand-dark'>"${term}"</strong> em <strong class='text-brand-dark'>${cityNameOnly}</strong>. Conhece alguém que vende? Convide pra Dudit!`
        }
        if (currentType === "produtos") {
            return `Nenhum produto cadastrado em <strong class='text-brand-dark'>${cityNameOnly}</strong> ainda. Seja o primeiro a vender aqui - é gratuito e sem comissão!`
        }
        if (currentType === "servicos") {
            return `Nenhum serviço cadastrado em <strong class='text-brand-dark'>${cityNameOnly}</strong> ainda. Seja o primeiro a oferecer seus serviços - é gratuito e sem comissão!`
        }
        if (currentType === "planos") {
            return `Nenhum plano recorrente cadastrado em <strong class='text-brand-dark'>${cityNameOnly}</strong> ainda. Seja o primeiro a oferecer assinaturas - é gratuito e sem comissão!`
        }
        if (currentType === "vitrines") {
            return `Nenhuma loja cadastrada em <strong class='text-brand-dark'>${cityNameOnly}</strong> ainda. Crie sua vitrine - é gratuito e sem comissão!`
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

    const clearFilters = () => {
        setSelectedCategories([])
        setMinPrice("")
        setMaxPrice("")
        setPromoOn(false)
        setSortBy("relevancia")
        setCurrentType("tudo")
        setSelectedRadius(null)
        updateUrl(selectedCitySlug, [], query, "tudo", null)
    }

    const typeOptions = [
        { value: "tudo", label: "Tudo" },
        { value: "produtos", label: "Produtos" },
        { value: "servicos", label: "Servicos" },
        { value: "planos", label: "Assinaturas" },
        { value: "vitrines", label: "Lojas" },
    ]

    const sortOptions: { value: SortOption; label: string }[] = [
        { value: "relevancia", label: "Relevancia" },
        { value: "preco_menor", label: "Menor preco" },
        { value: "preco_maior", label: "Maior preco" },
        { value: "recentes", label: "Mais recentes" },
    ]

    const getItemUrl = (item: any) => {
        if (item.itemType === "loja") return getPartnerUrl(item.partners || item)
        if (item.itemType === "plano") return getPlanUrl(item, item.partners)
        if (item.itemType === "servico") return getServiceUrl(item, item.partners)
        return getProductUrl(item, item.partners)
    }

    const renderListRow = (item: any) => {
        const partner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const imageUrl = item.itemType === "loja"
            ? (item.images?.[0] || partner?.banner_url || partner?.store_avatar || "https://img.dudit.com.br/static/Placeholder.png")
            : getPrimaryProductDisplayImage(item)
        const showPrice = item.itemType !== "loja" && item.show_price_in_store !== false

        return (
            <Link
                key={`${item.itemType}-${item.id}`}
                href={getItemUrl(item)}
                prefetch={false}
                className="group grid grid-cols-[112px_1fr] gap-4 border-b border-gray-100 py-4 last:border-b-0 sm:grid-cols-[220px_1fr] hover:bg-gray-50/60"
            >
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-brand-gray sm:aspect-[16/10]">
                    <img src={imageUrl} alt={item.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" loading="lazy" />
                </div>
                <div className="min-w-0 py-1">
                    <h3 className="line-clamp-2 text-base font-bold text-brand-dark sm:text-lg">{item.name}</h3>
                    {item.itemType !== "loja" && (
                        <div className="mt-2">
                            {showPrice ? (
                                <div className="flex flex-wrap items-baseline gap-2">
                                    {item.originalPrice && <span className="text-xs text-brand-inactive-text line-through">{formatCurrency(item.originalPrice)}</span>}
                                    <span className="text-lg font-bold text-brand-dark">{formatCurrency(item.price || 0)}</span>
                                </div>
                            ) : (
                                <span className="text-sm font-bold text-brand-dark">Preco sob consulta</span>
                            )}
                        </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-brand-inactive-text">
                        {partner?.store_name && <span className="font-bold text-brand-dark">{partner.store_name}</span>}
                        {(item.rating ?? 0) > 0 && <span>{Number(item.rating).toFixed(1)} estrela</span>}
                        {partner?.city && <span>{partner.city}{partner.state ? ` - ${partner.state}` : ""}</span>}
                    </div>
                    {(item.category || item.subcategoryName) && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {item.category && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-brand-dark">{item.category}</span>}
                            {item.subcategoryName && <span className="rounded-full bg-[#ecfdf5] px-2.5 py-1 text-[11px] font-bold text-brand-green">{item.subcategoryName}</span>}
                        </div>
                    )}
                </div>
            </Link>
        )
    }

    const renderListingItem = (item: any) => {
        const userCoords = userProfile?.latitude && userProfile?.longitude
            ? { lat: userProfile.latitude, lng: userProfile.longitude }
            : null

        if (viewMode === "list") return renderListRow(item)

        if (item.itemType === 'loja') {
            return <VitrineCard key={`loja-${item.id}`} vitrine={item} hideCity={!!selectedCitySlug} className="w-full" />
        }
        return <ItemCard key={`${item.itemType}-${item.id}`} product={item as any} userCoords={userCoords} className="w-full" />
    }

    return (
        <>
            {!hideHeaderAndFooter && <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />}
            <div className="min-h-screen bg-white font-sans animate-fade-in flex flex-col pt-2">
                <style>{`
                    .scrollbar-none::-webkit-scrollbar { display: none; }
                    .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                `}</style>

                {/* MOBILE CONTROLS (Sticky bar with Filters & Sort buttons) */}
                {!isLandingPage && rawItems.length > 0 && (
                    <ExplorarMobileControls
                        activeFiltersCount={activeFiltersCount}
                        onOpenFilters={() => setIsFiltersBottomSheetOpen(true)}
                        onOpenSort={() => setIsSortBottomSheetOpen(true)}
                    />
                )}

                {/* Add padding to account for sticky mobile controls */}
                {!isLandingPage && rawItems.length > 0 && <div className="lg:hidden h-[46px]" />}

                {/* MAIN CONTENT */}
                <div className="container mx-auto px-4 max-w-[1400px] flex-grow pb-24 lg:pb-12 mt-4">
                    {/* FEATURED SECTIONS - only on default explore page */}
                    {showFeaturedSections && (
                        <div className="mb-4 lg:mb-8 space-y-6 lg:space-y-10">
                            {/* 1. SEÇÕES BANNERS (Descubra o que tem em...) */}
                            <div className="w-full">
                                <h2 className="text-lg lg:text-2xl font-bold text-brand-dark mb-4 animate-fade-in">
                                    {selectedCitySlug 
                                        ? `Descubra o que tem em ${formatCitySlug(selectedCitySlug).split(" - ")[0]}` 
                                        : "Descubra o que tem por perto"}
                                </h2>
                                <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                    {SECTIONS_BANNERS.map((banner) => {
                                        const isActive = selectedSection === banner.id
                                        return (
                                            <button
                                                key={banner.id}
                                                onClick={() => {
                                                    const nextSection = isActive ? null : banner.id
                                                    setSelectedSection(nextSection)
                                                    updateUrl(selectedCitySlug, selectedCategories, query, currentType, selectedRadius, nextSection)
                                                }}
                                                className={`shrink-0 w-[220px] sm:w-[260px] h-[110px] rounded-[16px] bg-gradient-to-r ${banner.gradient} p-4 flex flex-col justify-between text-left text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer select-none border-2 ${
                                                    isActive ? 'border-brand-green ring-2 ring-brand-green/30' : 'border-transparent'
                                                }`}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <span className="text-xs font-semibold uppercase tracking-wider opacity-90">{banner.subtitle}</span>
                                                    <span className="text-2xl">{banner.emoji}</span>
                                                </div>
                                                <span className="text-lg font-bold leading-tight">{banner.title}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )}


                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                        {/* SIDEBAR (Desktop only) */}
                        <ExplorarFilterSidebar
                            userProfile={userProfile}
                            selectedCitySlug={selectedCitySlug}
                            formatCitySlug={formatCitySlug}
                            onCitySelect={() => setIsCityModalOpen(true)}
                            currentType={currentType}
                            typeOptions={[
                                { value: "tudo", label: "Tudo" },
                                { value: "produtos", label: "Produtos" },
                                { value: "servicos", label: "Serviços" },
                                { value: "planos", label: "Assinaturas" },
                                { value: "vitrines", label: "Lojas" },
                            ]}
                            onTypeChange={handleTypeChange}
                            activeCategoriesList={activeCategoriesList}
                            selectedCategories={selectedCategories}
                            onToggleCategory={toggleCategory}
                            selectedRadius={selectedRadius}
                            onRadiusChange={handleRadiusChange}

                            minPrice={minPrice}
                            onMinPriceChange={setMinPrice}
                            maxPrice={maxPrice}
                            onMaxPriceChange={setMaxPrice}
                            sortBy={sortBy}
                            sortOptions={[
                                { value: "relevancia", label: "Relevância" },
                                { value: "preco_menor", label: "Menor Preço" },
                                { value: "preco_maior", label: "Maior Preço" },
                                { value: "recentes", label: "Mais Recentes" },
                            ]}
                            onSortChange={(val) => setSortBy(val as any)}
                            promoOn={promoOn}
                            onPromoToggle={() => setPromoOn(!promoOn)}
                            activeFiltersCount={activeFiltersCount}
                            onClearFilters={clearFilters}
                        />

                        <div className="min-w-0 flex-1">
                            {/* Title Section - ABOVE BANNER */}
                            {!isLandingPage && (
                                <ExplorarHeaderSection
                                    title={pageTitle}
                                    resultsCount={filteredResults.length}
                                    showBackButton={!!query || !!selectedSection}
                                    onBack={() => {
                                        if (selectedSection) {
                                            setSelectedSection(null)
                                            updateUrl(selectedCitySlug, selectedCategories, query, currentType, selectedRadius, null)
                                        } else {
                                            router.back()
                                        }
                                    }}
                                />
                            )}

                            {/* Sponsored Ad Banner - Desktop smaller (lg:max-w-[900px]), responsive height */}
                            {exploreAds.length > 0 && (
                                <div className="mb-6 rounded-lg overflow-hidden bg-gradient-to-r from-gray-100 to-gray-50 aspect-[16/5] lg:max-w-[900px]">
                                    <div className="w-full h-full flex items-center justify-center cursor-pointer">
                                        {exploreAds[0]?.image_url ? (
                                            <img
                                                src={exploreAds[0].image_url}
                                                alt="Patrocinado"
                                                className="w-full h-full object-cover"
                                                onClick={() => {
                                                    if (exploreAds[0]?.destination_url) {
                                                        window.open(exploreAds[0].destination_url, "_blank")
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <div className="text-center text-brand-inactive-text">
                                                <p className="text-sm font-bold">Anúncio Patrocinado</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={`${currentType}-${selectedCategories.join(",")}-${selectedCitySlug}-${isLoading || (isFetching && !isFetchingNextPage)}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {isLoading || (isFetching && !isFetchingNextPage) ? (
                                        <ExploreContentSkeleton type={currentType} hasSection={!!selectedSection} />
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
                                            {/* Landing page content */}
                                        </div>
                                    ) : (
                                        <>
                                            {/* Vendedores em destaque (Browse Mode) */}
                                            {!query && currentType === 'tudo' && !selectedSection && vitrinesDestaque.length > 0 && (
                                                <div className="mb-6 animate-fade-in">
                                                    <HorizontalCarousel
                                                        title="Vendedores em destaque"
                                                        items={vitrinesDestaque}
                                                        renderItem={(vitrine) => (
                                                            <VitrineCard key={vitrine.id} vitrine={vitrine} hideCity={!!selectedCitySlug} className="w-full" />
                                                        )}
                                                        onSeeAll={() => {
                                                            setCurrentType("vitrines")
                                                            updateUrl(selectedCitySlug, selectedCategories, query, "vitrines")
                                                        }}
                                                        itemWidthClass="w-[270px] sm:w-[320px]"
                                                    />
                                                </div>
                                            )}

                                            {/* Carrossel de Lojas Locais na Busca */}
                                            {!!query && currentType === 'tudo' && vitrinesDestaque.length > 0 && (
                                                <div className="mb-6">
                                                    <HorizontalCarousel
                                                        title="Lojas encontradas"
                                                        items={vitrinesDestaque}
                                                        renderItem={(vitrine) => (
                                                            <VitrineCard key={vitrine.id} vitrine={vitrine} hideCity={!!selectedCitySlug} className="w-full" />
                                                        )}
                                                        onSeeAll={() => {
                                                            setCurrentType("vitrines")
                                                            updateUrl(selectedCitySlug, selectedCategories, query, "vitrines")
                                                        }}
                                                        itemWidthClass="w-[270px] sm:w-[320px]"
                                                    />
                                                </div>
                                            )}

                                            {/* Carrossel de Lojas Distantes na Busca */}
                                            {!!query && currentType === 'tudo' && moreDistantSellers.length > 0 && (
                                                <div className="mb-6">
                                                    <HorizontalCarousel
                                                        title="Lojas um pouco mais distantes do seu raio de busca"
                                                        items={moreDistantSellers}
                                                        renderItem={(vitrine) => (
                                                            <VitrineCard key={vitrine.id} vitrine={vitrine} hideCity={false} className="w-full" />
                                                        )}
                                                        onSeeAll={() => {
                                                            const stateSlug = userProfile?.state ? `estado-${userProfile.state.toLowerCase()}` : "brasil"
                                                            setSelectedCitySlug(stateSlug)
                                                            setCurrentType("vitrines")
                                                            updateUrl(stateSlug, selectedCategories, query, "vitrines")
                                                        }}
                                                        itemWidthClass="w-[270px] sm:w-[320px]"
                                                    />
                                                </div>
                                            )}

                                            {/* View Controls and Results */}
                                            <ExplorarViewControls
                                                viewMode={viewMode}
                                                onViewModeChange={setViewMode}
                                                resultsCount={filteredResults.length}
                                            />


                                            {filteredResults.length === 0 && !hasNextPage ? (
                                                <div className="py-12 flex flex-col items-center">
                                                    <IconPlaceholder
                                                        placeholderType="image"
                                                        imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                        imageAlt="Nada encontrado"
                                                        title="Nada encontrado"
                                                        subtitle="Ainda não temos itens nessa cidade ou com essa combinação de filtros. Tente limpar os filtros ou trocar a cidade."
                                                    />
                                                    {activeFiltersCount > 0 && (
                                                        <button
                                                            onClick={clearFilters}
                                                            className="mt-6 px-6 py-2.5 bg-brand-green text-white font-bold rounded-xl text-xs shadow-md hover:bg-brand-dark transition-colors duration-200 select-none cursor-pointer"
                                                        >
                                                            Limpar filtros
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className={viewMode === "grid"
                                                    ? `grid ${currentType === 'vitrines' ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'} gap-3 md:gap-4 lg:gap-6 mt-4`
                                                    : "rounded-lg border border-gray-100 bg-white mt-4"
                                                }>
                                                    {filteredResults.map((item, index) => {
                                                        const resultNode = renderListingItem(item)
                                                        const shouldInjectSearchAds = !!query && searchAds.length > 0 && index === 5

                                                        if (!shouldInjectSearchAds) return resultNode

                                                        return (
                                                            <Fragment key={`result-with-ads-${item.id}`}>
                                                                {resultNode}
                                                                <SponsoredAdsSearchInline ads={searchAds} />
                                                            </Fragment>
                                                        )
                                                    })}

                                                    {hasNextPage && (
                                                        <div
                                                            ref={observerTarget}
                                                            className={viewMode === "grid" ? "col-span-full py-12 flex flex-col items-center justify-center min-h-[120px]" : "py-12 flex flex-col items-center justify-center min-h-[120px]"}
                                                        >
                                                            {isFetchingNextPage ? (
                                                                <div className="flex flex-col items-center gap-2 animate-pulse">
                                                                    <SkeletonLoader height={24} width={180} />
                                                                    <span className="text-[11px] font-bold text-brand-inactive-text">Carregando mais opcoes...</span>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Carrossel de Itens Distantes na Busca */}
                                            {!!query && moreDistantItems.length > 0 && (
                                                <div className="mt-12 pt-8 border-t border-gray-100">
                                                    <HorizontalCarousel
                                                        title="Um pouco mais distantes do seu raio de busca"
                                                        items={moreDistantItems}
                                                        renderItem={(item) => (
                                                            <ItemCard
                                                                key={item.id}
                                                                product={item}
                                                                userCoords={userProfile?.latitude && userProfile?.longitude ? { lat: userProfile.latitude, lng: userProfile.longitude } : null}
                                                                className="w-full"
                                                            />
                                                        )}
                                                        onSeeAll={() => {
                                                            const stateSlug = userProfile?.state ? `estado-${userProfile.state.toLowerCase()}` : "brasil"
                                                            setSelectedCitySlug(stateSlug)
                                                            updateUrl(stateSlug, selectedCategories, query, currentType)
                                                        }}
                                                        itemWidthClass="w-[190px] sm:w-[210px]"
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}

                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {!hideHeaderAndFooter && <MarketplaceFooter />}
            </div>

            {/* BOTTOM SHEETS (Mobile) */}
            <ExplorarFiltersBottomSheet
                userProfile={userProfile}
                isOpen={isFiltersBottomSheetOpen}
                onClose={() => setIsFiltersBottomSheetOpen(false)}
                selectedCitySlug={selectedCitySlug}
                formatCitySlug={formatCitySlug}
                onCitySelect={() => setIsCityModalOpen(true)}
                currentType={currentType}
                typeOptions={[
                    { value: "tudo", label: "Tudo" },
                    { value: "produtos", label: "Produtos" },
                    { value: "servicos", label: "Serviços" },
                    { value: "planos", label: "Assinaturas" },
                    { value: "vitrines", label: "Lojas" },
                ]}
                onTypeChange={handleTypeChange}
                activeCategoriesList={activeCategoriesList}
                selectedCategories={selectedCategories}
                onToggleCategory={toggleCategory}
                selectedRadius={selectedRadius}
                onRadiusChange={handleRadiusChange}

                minPrice={minPrice}
                onMinPriceChange={setMinPrice}
                maxPrice={maxPrice}
                onMaxPriceChange={setMaxPrice}
                sortBy={sortBy}
                sortOptions={[
                    { value: "relevancia", label: "Relevância" },
                    { value: "preco_menor", label: "Menor Preço" },
                    { value: "preco_maior", label: "Maior Preço" },
                    { value: "recentes", label: "Mais Recentes" },
                ]}
                onSortChange={(val) => setSortBy(val as any)}
                promoOn={promoOn}
                onPromoToggle={() => setPromoOn(!promoOn)}
                activeFiltersCount={activeFiltersCount}
                onClearFilters={clearFilters}
            />

            <ExplorarSortBottomSheet
                isOpen={isSortBottomSheetOpen}
                onClose={() => setIsSortBottomSheetOpen(false)}
                sortBy={sortBy as any}
                onSortChange={(val) => setSortBy(val as any)}
                sortOptions={[
                    { value: "relevancia", label: "Relevância" },
                    { value: "preco_menor", label: "Menor Preço" },
                    { value: "preco_maior", label: "Maior Preço" },
                    { value: "recentes", label: "Mais Recentes" },
                ]}
            />

            {/* ========================================================
                PREMIUM REUSABLE MODALS (REPLACING OLD INLINE POPOVERS)
                ======================================================== */}

            {/* 1. CITY SELECTOR MODAL */}
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



            {/* 2. CATEGORY MODAL (SHOWN ONLY WHEN TOP CATEGORIES SLIDER IS HIDDEN) */}
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
