"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { ItemCard, VitrineCard } from "./shared-components"
import { IconPlaceholder, Button, DefaultModal } from "@/components/reusable"
import { MoneyInput } from "@/components/reusable/Inputs/MoneyInput"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { SkeletonLoader } from "@/components/reusable/SkeletonLoader"
import { 
    ChevronLeft, 
    ChevronRight, 
    SlidersHorizontal, 
    MapPin, 
    X, 
    Tag, 
    Star, 
    ArrowUpDown, 
    Check,
    Search
} from "lucide-react"
import { searchMarketplace, type MarketplaceListCursor } from "@/app/actions/marketplace/search"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { getProductDisplayImages } from "@/lib/utils/product-display-images"
import citiesData from "@/lib/data/cities.json"
import { useLocationRedirect } from "@/hooks/use-location-redirect"

interface ExplorarPageClientProps {
    initialResults?: any[]
    query?: string
    type?: 'produtos' | 'servicos' | 'vitrines' | 'tudo'
    cidade?: string
    categoria?: string
    userProfile?: any
    cartCount?: number
}

type SortOption = "relevancia" | "preco_menor" | "preco_maior" | "recentes"

const CATEGORY_SLUG_MAP: { [key: string]: string } = {
  "alimentacao": "Alimentação",
  "mercado-e-conveniencia": "Mercado & Conveniência",
  "casa-e-construcao": "Casa & Construção",
  "servicos-residenciais": "Serviços residenciais",
  "automotivo": "Automotivo",
  "beleza-e-bem-estar": "Beleza & Bem-estar",
  "moda-e-acessorios": "Moda & Acessórios",
  "tecnologia": "Tecnologia",
  "saude": "Saúde",
  "outros": "Outros"
}

const MARKETPLACE_CATEGORIES = [
  { name: "Alimentação", icon: "🍔", desc: "Lanches e pratos" },
  { name: "Mercado & Conveniência", icon: "🛒", desc: "Compras e pet" },
  { name: "Casa & Construção", icon: "🛠️", desc: "Reparos e materiais" },
  { name: "Serviços residenciais", icon: "🧹", desc: "Profissionais locais" },
  { name: "Moda & Acessórios", icon: "👕", desc: "Vestuário e acessórios" },
  { name: "Beleza & Bem-estar", icon: "💅", desc: "Estética e bem-estar" },
  { name: "Automotivo", icon: "🚗", desc: "Oficinas e peças" },
  { name: "Tecnologia", icon: "💻", desc: "Informática e celulares" },
  { name: "Saúde", icon: "🩺", desc: "Cuidados e farmácia" }
]

function formatCitySlug(slug: string | null) {
  if (!slug) return ""
  const parts = slug.split("-")
  const state = parts.pop()?.toUpperCase() || ""
  const city = parts.join(" ").replace(/\b\w/g, l => l.toUpperCase())
  return `${city} - ${state}`
}

// Reusable Horizontal Carousel with Scroll-Aware Navigation Chevrons
const HorizontalCarousel = ({ 
    title, 
    items, 
    renderItem, 
    onSeeAll 
}: { 
    title: string
    items: any[]
    renderItem: (item: any) => React.ReactNode
    onSeeAll?: () => void 
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
                <h2 className="text-[18px] lg:text-[22px] font-bold text-brand-dark tracking-wide">{title}</h2>
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
                                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 active:scale-95 transition-all shadow-sm cursor-pointer"
                            >
                                <ChevronLeft className="w-4 h-4 text-brand-dark" />
                            </button>
                        )}
                        {showRightArrow && (
                            <button 
                                onClick={() => scroll('right')}
                                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 active:scale-95 transition-all shadow-sm cursor-pointer"
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
                    <div key={idx} className="snap-start shrink-0 w-[270px] sm:w-[320px]">
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
    hideHeaderAndFooter 
}: ExplorarPageClientProps & { hideHeaderAndFooter?: boolean }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { requestLocation, loading: isLocationLoading } = useLocationRedirect()

    const [currentType, setCurrentType] = useState(type)
    const [sortBy, setSortBy] = useState<SortOption>("relevancia")
    const [selectedCitySlug, setSelectedCitySlug] = useState<string | null>(cidade || null)
    
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
        if (categoria) {
            return categoria.split(",").map(c => CATEGORY_SLUG_MAP[c.toLowerCase()] || c)
        }
        return []
    })
    const [minPrice, setMinPrice] = useState<number | string>("")
    const [maxPrice, setMaxPrice] = useState<number | string>("")

    const observerTarget = useRef<HTMLDivElement>(null)
    const MAX_ITEMS = 300 // Memory cap

    // Unified URL synchronization helper
    const updateUrl = (
        city: string | null,
        categories: string[],
        searchQ: string,
        typeStr: string
    ) => {
        // If exactly one category is selected, no query is set, and type is 'tudo', use the clean slug layout
        if (city && categories.length === 1 && !searchQ && typeStr === "tudo") {
            const catName = categories[0]
            const slug = Object.keys(CATEGORY_SLUG_MAP).find(key => CATEGORY_SLUG_MAP[key] === catName)
            if (slug) {
                router.push(`/${city}/${slug}`)
                return
            }
        }

        const params = new URLSearchParams()
        if (city) params.set("cidade", city)
        if (categories.length > 0) {
            const slugs = categories.map(cat => {
                const slug = Object.keys(CATEGORY_SLUG_MAP).find(key => CATEGORY_SLUG_MAP[key] === cat)
                return slug || cat
            })
            params.set("categoria", slugs.join(","))
        }
        if (searchQ) params.set("q", searchQ)
        if (typeStr !== "tudo") params.set("type", typeStr)

        const queryStr = params.toString()
        router.push(`/explorar${queryStr ? `?${queryStr}` : ""}`)
    }

    // Handles browser Back/Forward navigation syncing searchParams back to component state
    useEffect(() => {
        const urlType = searchParams.get("type") || "tudo"
        if (urlType !== currentType) {
            setCurrentType(urlType as any)
        }

        const urlCity = searchParams.get("cidade") || null
        if (urlCity !== selectedCitySlug) {
            setSelectedCitySlug(urlCity)
        }

        const urlCat = searchParams.get("categoria")
        const nextCats = urlCat
            ? urlCat.split(",").map(c => CATEGORY_SLUG_MAP[c.toLowerCase()] || c)
            : []
        const isCatsEqual = selectedCategories.length === nextCats.length && 
            selectedCategories.every((val, index) => val === nextCats[index])
        if (!isCatsEqual) {
            setSelectedCategories(nextCats)
        }
    }, [searchParams])

    // Handle city synchronization from URL/cookies/localProfile on mount
    useEffect(() => {
        const urlCity = searchParams.get("cidade")
        if (urlCity) {
            document.cookie = `dudit_city=${urlCity}; path=/; max-age=${60 * 60 * 24 * 30}`
            localStorage.setItem("dudit_city", urlCity)
            return
        }

        let savedCity = localStorage.getItem("dudit_city")
        if (!savedCity) {
            const match = document.cookie.match(/(?:^|; )dudit_city=([^;]*)/)
            if (match) savedCity = match[1]
        }

        if (!savedCity && userProfile?.city && userProfile?.state) {
            const normCity = userProfile.city
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "")
            savedCity = `${normCity}-${userProfile.state.toLowerCase()}`
        }

        if (savedCity) {
            setSelectedCitySlug(savedCity)
            updateUrl(savedCity, selectedCategories, query, currentType)
        }
    }, [searchParams, userProfile])

    const limitConfig = useMemo(() => {
        if (currentType === "produtos") return { produtos: 40 } as const
        if (currentType === "servicos") return { servicos: 40 } as const
        if (currentType === "vitrines") return { vitrines: 40 } as const
        return { geral: 40 } as const
    }, [currentType])

    // Query fetch
    const { items: rawItemsUncapped, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteList<
        any,
        MarketplaceListCursor
    >({
        queryKey: ["explore", query, currentType, selectedCitySlug],
        initialPage:
            currentType === type && selectedCitySlug === cidade
                ? { items: initialResults, nextCursor: null, hasMore: initialResults.length >= (type === 'tudo' ? 10 : 40) }
                : undefined,
        fetchFn: async ({ cursor }) => {
            const res = await searchMarketplace(query, currentType as any, {
                ...limitConfig,
                cursor,
                cidade: selectedCitySlug || undefined
            })
            return res
        },
        dedupeKey: (item) => String(item?.itemType || "") + ":" + String(item?.id || ""),
        staleTime: 60000,
        refetchOnMount: false,
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

        if (currentType === 'tudo') {
            const vitrines = normalizedInitialResults.filter(r => r.itemType === 'loja')
            const list = normalizedInitialResults.filter(r => r.itemType !== 'loja')
            return { vitrinesDestaque: vitrines, dataToFilter: list }
        }

        const list = normalizedInitialResults.filter(r => r.itemType !== 'loja')
        return { vitrinesDestaque: [], dataToFilter: list }
    }, [normalizedInitialResults, currentType])

    // In-memory filters for advanced filters
    const filteredResults = useMemo(() => {
        let filtered = [...dataToFilter]
        if (selectedCategories.length > 0) {
            filtered = filtered.filter((p) => {
                const itemCat = p.category || ""
                return selectedCategories.some(cat => {
                    const normItem = itemCat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    const normTarget = cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    return normItem.includes(normTarget) || normTarget.includes(normItem)
                })
            })
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
    }, [dataToFilter, selectedCategories, minPrice, maxPrice, promoOn, sortBy])

    const activeFiltersCount = useMemo(() => {
        let count = 0
        if (selectedCategories.length > 0) count++
        if (minPrice || maxPrice) count++
        if (promoOn) count++
        return count
    }, [selectedCategories, minPrice, maxPrice, promoOn])

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
            const next = prev.includes(catName) ? prev.filter((c) => c !== catName) : [...prev, catName]
            updateUrl(selectedCitySlug, next, query, currentType)
            return next
        })
    }

    const handleSelectCity = (citySlug: string | null) => {
        setSelectedCitySlug(citySlug)
        setCitySearchText("")
        updateUrl(citySlug, selectedCategories, query, currentType)
    }

    // Filter cities list by search input
    const filteredCitiesSuggestions = useMemo(() => {
        if (!citySearchText) return []
        const q = citySearchText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        return citiesData
            .filter((slug: string) => {
                const norm = slug.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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
        if (currentType !== 'tudo' || selectedCategories.length > 0 || categoriesWithProducts.length === 0) {
            return filteredResults
        }
        const topCategoriesNames = categoriesWithProducts.map(c => c.name)
        return filteredResults.filter(item => !topCategoriesNames.includes(item.category || "Outros"))
    }, [filteredResults, categoriesWithProducts, currentType, selectedCategories])

    const pageTitle = useMemo(() => {
        const citySuffix = selectedCitySlug ? ` em ${formatCitySlug(selectedCitySlug).split(" - ")[0]}` : ""
        if (query) return `Resultados para "${query}"${citySuffix}`
        if (currentType === "produtos") return `Produtos${citySuffix}`
        if (currentType === "servicos") return `Serviços${citySuffix}`
        if (currentType === "vitrines") return `Lojas e Vitrines${citySuffix}`
        return `Explorar`
    }, [query, currentType, selectedCitySlug])

    return (
        <>
            {!hideHeaderAndFooter && <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />}
            <div className="min-h-screen bg-white font-sans animate-fade-in flex flex-col pt-2">
                <style>{`
                    .scrollbar-none::-webkit-scrollbar { display: none; }
                    .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
                `}</style>

                {/* 1. TITLE SECTION */}
                <div className="container mx-auto px-4 max-w-[1300px] mt-6">
                    <h1 className="text-[28px] lg:text-[36px] font-bold text-brand-dark tracking-tight leading-tight">
                        {pageTitle}
                    </h1>
                </div>

                {/* 2. CATEGORIES CIRCULAR SLIDER (VISIBLE ONLY WHEN VER TUDO IS NOT ACTIVE) */}
                {currentType === 'tudo' && (
                    <div className="bg-white py-6 border-b border-gray-100">
                        <div className="container mx-auto px-4 max-w-[1300px]">
                            <div className="flex gap-6 overflow-x-auto scrollbar-none py-2 px-1">
                                {MARKETPLACE_CATEGORIES.map((cat) => {
                                    const isSelected = selectedCategories.includes(cat.name)
                                    return (
                                        <div 
                                            key={cat.name}
                                            onClick={() => toggleCategory(cat.name)}
                                            className="flex flex-col items-center cursor-pointer select-none shrink-0 group w-[70px] sm:w-[90px]"
                                        >
                                            <div 
                                                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gray-50 flex items-center justify-center border transition-all duration-300 group-hover:border-brand-green group-hover:scale-105 select-none ${
                                                    isSelected 
                                                        ? "bg-[#ecfdf5] border-brand-green shadow-sm ring-2 ring-brand-green/20" 
                                                        : "border-gray-200"
                                                }`}
                                            >
                                                <span className="text-2xl sm:text-3xl filter drop-shadow-sm select-none">{cat.icon}</span>
                                            </div>
                                            <span 
                                                className={`text-[11px] sm:text-[12px] font-bold text-center mt-2 leading-tight truncate w-full select-none ${
                                                    isSelected ? "text-brand-green font-extrabold" : "text-brand-dark group-hover:text-brand-green"
                                                }`}
                                            >
                                                {cat.name.toLowerCase()}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. FILTERS BAR (NOT STICKY - SCROLLS ALONG WITH THE PAGE) */}
                <div className="bg-white border-b border-gray-100 py-4">
                    <div className="container mx-auto px-4 max-w-[1300px] flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1 flex-1">
                            
                            {/* CITY FILTER CHIP */}
                            <button 
                                onClick={() => setIsCityModalOpen(true)}
                                className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 select-none cursor-pointer ${
                                    selectedCitySlug 
                                        ? "bg-[#ecfdf5] border-brand-green text-brand-green shadow-sm" 
                                        : "bg-white border-gray-200 text-brand-dark hover:bg-gray-50"
                                }`}
                            >
                                <MapPin className="w-3.5 h-3.5" />
                                <span>{selectedCitySlug ? formatCitySlug(selectedCitySlug) : "Selecione a Cidade"}</span>
                                <span className="text-[9px] opacity-60">▼</span>
                            </button>

                            {/* SORT FILTER CHIP */}
                            <button 
                                onClick={() => setIsSortModalOpen(true)}
                                className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 select-none cursor-pointer ${
                                    sortBy !== "relevancia" 
                                        ? "bg-[#ecfdf5] border-brand-green text-brand-green shadow-sm" 
                                        : "bg-white border-gray-200 text-brand-dark hover:bg-gray-50"
                                }`}
                            >
                                <ArrowUpDown className="w-3.5 h-3.5" />
                                <span>Ordenar por: {sortBy === 'relevancia' ? 'Relevância' : sortBy === 'preco_menor' ? 'Menor Preço' : sortBy === 'preco_maior' ? 'Maior Preço' : 'Mais Recentes'}</span>
                                <span className="text-[9px] opacity-60">▼</span>
                            </button>

                            {/* TYPE FILTER CHIP */}
                            <button 
                                onClick={() => setIsTypeModalOpen(true)}
                                className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 select-none cursor-pointer ${
                                    currentType !== "tudo" 
                                        ? "bg-[#ecfdf5] border-brand-green text-brand-green shadow-sm" 
                                        : "bg-white border-gray-200 text-brand-dark hover:bg-gray-50"
                                }`}
                            >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                <span>Ver: {currentType === 'tudo' ? 'Tudo' : currentType === 'produtos' ? 'Produtos' : currentType === 'servicos' ? 'Serviços' : 'Lojas'}</span>
                                <span className="text-[9px] opacity-60">▼</span>
                            </button>

                            {/* CATEGORY FILTER CHIP (SHOWN ONLY WHEN TOP CATEGORIES SLIDER IS HIDDEN) */}
                            {currentType !== 'tudo' && (
                                <button 
                                    onClick={() => setIsCategoryModalOpen(true)}
                                    className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 select-none cursor-pointer ${
                                        selectedCategories.length > 0
                                            ? "bg-[#ecfdf5] border-brand-green text-brand-green shadow-sm" 
                                            : "bg-white border-gray-200 text-brand-dark hover:bg-gray-50"
                                    }`}
                                >
                                    <span>Categoria</span>
                                    {selectedCategories.length > 0 && <span className="text-[10px] font-extrabold">({selectedCategories.length})</span>}
                                    <span className="text-[9px] opacity-60">▼</span>
                                </button>
                            )}

                            {/* PROMOTION FILTER CHIP */}
                            <button 
                                onClick={() => setPromoOn(!promoOn)}
                                className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 select-none cursor-pointer ${
                                    promoOn 
                                        ? "bg-brand-green text-white border-brand-green shadow-md animate-pulse-subtle" 
                                        : "bg-white border-gray-200 text-brand-dark hover:bg-gray-50"
                                }`}
                            >
                                <Tag className="w-3.5 h-3.5" />
                                <span>Em Promoção</span>
                            </button>

                            {/* PRICE FILTER CHIP */}
                            <button 
                                onClick={() => setIsPriceModalOpen(true)}
                                className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 select-none cursor-pointer ${
                                    minPrice || maxPrice 
                                        ? "bg-[#ecfdf5] border-brand-green text-brand-green shadow-sm" 
                                        : "bg-white border-gray-200 text-brand-dark hover:bg-gray-50"
                                }`}
                            >
                                <span>Preço</span>
                                {(minPrice || maxPrice) && <span className="font-extrabold text-[10px]">({minPrice ? `≥R$${minPrice}` : ""} {maxPrice ? `≤R$${maxPrice}` : ""})</span>}
                                <span className="text-[9px] opacity-60">▼</span>
                            </button>

                            {/* CLEAR ALL FILTERS */}
                            {activeFiltersCount > 0 && (
                                <button 
                                    onClick={() => {
                                        setSelectedCategories([])
                                        setMinPrice("")
                                        setMaxPrice("")
                                        setPromoOn(false)
                                        updateUrl(selectedCitySlug, [], query, currentType)
                                    }}
                                    className="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-full text-xs font-bold flex items-center gap-1 transition-all duration-200 select-none cursor-pointer"
                                >
                                    <span>Limpar Filtros</span>
                                    <X className="w-3 h-3" />
                                </button>
                            )}

                        </div>
                    </div>
                </div>

                {/* 4. MAIN PRODUCT & LOJA CONTENT SECTION */}
                <div className="container mx-auto px-4 max-w-[1300px] flex-grow pb-24 lg:pb-12 mt-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`${currentType}-${selectedCategories.join(",")}-${selectedCitySlug}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <>
                                {/* A. VITRINES (LOJAS) RELACIONADAS CAROUSEL (DOORDASH STYLE) */}
                                {vitrinesDestaque.length > 0 && (
                                    <HorizontalCarousel 
                                        title="Lojas e Profissionais Recomendados"
                                        items={vitrinesDestaque}
                                        onSeeAll={() => handleTypeChange('vitrines')}
                                        renderItem={(item) => <VitrineCard vitrine={item} />}
                                    />
                                )}

                                {/* B. FEED MODE: SHOW CAROUSELS BY CATEGORY FIRST */}
                                {currentType === 'tudo' && selectedCategories.length === 0 && categoriesWithProducts.length > 0 && (
                                    <div className="space-y-4">
                                        {categoriesWithProducts.map((catGroup) => (
                                            <HorizontalCarousel 
                                                key={catGroup.name}
                                                title={`${catGroup.name} em destaque`}
                                                items={catGroup.list}
                                                renderItem={(item) => {
                                                    const userCoords = userProfile?.latitude && userProfile?.longitude
                                                        ? { lat: userProfile.latitude, lng: userProfile.longitude }
                                                        : null
                                                    return <ItemCard product={item} userCoords={userCoords} />
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* C. MAIN LISTINGS (GRID OR CAROUSEL FALLBACK) */}
                                <div className="mt-8">
                                    {currentType === 'tudo' && selectedCategories.length === 0 && categoriesWithProducts.length > 0 && remainingResults.length > 0 && (
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
                                                        updateUrl(selectedCitySlug, [], query, currentType)
                                                    }}
                                                    className="mt-6 px-6 py-2.5 bg-brand-green text-white font-bold rounded-xl text-xs shadow-md hover:bg-brand-dark active:scale-95 transition-all select-none cursor-pointer"
                                                >
                                                    Limpar filtros de busca
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                                            {remainingResults.map((item) => {
                                                if (item.itemType === 'loja') {
                                                    return <VitrineCard key={`loja-${item.id}`} vitrine={item} />
                                                }
                                                const userCoords = userProfile?.latitude && userProfile?.longitude
                                                    ? { lat: userProfile.latitude, lng: userProfile.longitude }
                                                    : null
                                                return <ItemCard key={item.id} product={item as any} userCoords={userCoords} />
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
                            </>
                        </motion.div>
                    </AnimatePresence>
                </div>
                {!hideHeaderAndFooter && <MarketplaceFooter />}
            </div>

            {/* ========================================================
                PREMIUM REUSABLE MODALS (REPLACING OLD INLINE POPOVERS)
                ======================================================== */}

            {/* 1. SORT MODAL */}
            <DefaultModal 
                isOpen={isSortModalOpen} 
                onClose={() => setIsSortModalOpen(false)} 
                title="Ordenar por" 
                maxWidth="lg"
            >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 py-4 justify-items-center">
                    {[
                        { value: "relevancia", label: "Ordenação Padrão", icon: "↕️" },
                        { value: "preco_menor", label: "Menor Preço", icon: "💵" },
                        { value: "preco_maior", label: "Maior Preço", icon: "📈" },
                        { value: "recentes", label: "Mais Recentes", icon: "🕒" }
                    ].map((opt) => {
                        const isSelected = sortBy === opt.value
                        return (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    setSortBy(opt.value as any)
                                    setIsSortModalOpen(false)
                                }}
                                className="flex flex-col items-center cursor-pointer select-none focus:outline-none group w-full"
                            >
                                <div 
                                    className={`w-16 h-16 rounded-full border flex items-center justify-center text-2xl transition-all duration-200 ${
                                        isSelected 
                                            ? "bg-brand-green/5 border-brand-green text-brand-green scale-105 shadow-sm" 
                                            : "bg-white border-gray-200 text-brand-dark hover:border-brand-green"
                                    }`}
                                >
                                    {opt.icon}
                                </div>
                                <span className={`text-[11px] font-bold mt-2 text-center ${isSelected ? "text-brand-green" : "text-brand-dark group-hover:text-brand-green"}`}>
                                    {opt.label}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </DefaultModal>

            {/* 2. TYPE MODAL */}
            <DefaultModal 
                isOpen={isTypeModalOpen} 
                onClose={() => setIsTypeModalOpen(false)} 
                title="Tipo de Negócio" 
                maxWidth="lg"
            >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 py-4 justify-items-center">
                    {[
                        { value: "tudo", label: "Ver Tudo", icon: "🌐" },
                        { value: "produtos", label: "Produtos", icon: "📦" },
                        { value: "servicos", label: "Serviços", icon: "🛠️" },
                        { value: "vitrines", label: "Lojas e Vitrines", icon: "🏪" }
                    ].map((opt) => {
                        const isSelected = currentType === opt.value
                        return (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    handleTypeChange(opt.value)
                                    setIsTypeModalOpen(false)
                                }}
                                className="flex flex-col items-center cursor-pointer select-none focus:outline-none group w-full"
                            >
                                <div 
                                    className={`w-16 h-16 rounded-full border flex items-center justify-center text-2xl transition-all duration-200 ${
                                        isSelected 
                                            ? "bg-brand-green/5 border-brand-green text-brand-green scale-105 shadow-sm" 
                                            : "bg-white border-gray-200 text-brand-dark hover:border-brand-green"
                                    }`}
                                >
                                    {opt.icon}
                                </div>
                                <span className={`text-[11px] font-bold mt-2 text-center ${isSelected ? "text-brand-green" : "text-brand-dark group-hover:text-brand-green"}`}>
                                    {opt.label}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </DefaultModal>

            {/* 3. CITY SELECTOR MODAL */}
            <DefaultModal 
                isOpen={isCityModalOpen} 
                onClose={() => setIsCityModalOpen(false)} 
                title="📍 Localização" 
                maxWidth="md"
            >
                <div className="flex flex-col gap-4 py-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-brand-inactive-text">Filtrar vendedores da cidade:</span>
                        {selectedCitySlug && (
                            <button 
                                onClick={() => {
                                    handleSelectCity(null)
                                    setIsCityModalOpen(false)
                                }}
                                className="text-xs text-red-500 font-extrabold hover:underline"
                            >
                                Remover filtro de cidade
                            </button>
                        )}
                    </div>
                    
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Buscar cidade... (ex: São Paulo, Bauru)"
                            className="w-full px-3.5 py-2.5 pl-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green bg-gray-50 font-medium"
                            value={citySearchText}
                            onChange={(e) => setCitySearchText(e.target.value)}
                        />
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                    </div>

                    <button
                        onClick={() => {
                            requestLocation()
                            setIsCityModalOpen(false)
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-brand-green/5 text-brand-green rounded-xl text-xs font-bold hover:bg-brand-green/10 active:scale-[0.99] transition-all select-none cursor-pointer border border-brand-green/10"
                    >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Usar minha localização</span>
                    </button>

                    {filteredCitiesSuggestions.length > 0 && (
                        <div className="mt-2 border-t border-gray-100 pt-3 space-y-1">
                            {filteredCitiesSuggestions.map((slug) => (
                                <div 
                                    key={slug}
                                    onClick={() => {
                                        handleSelectCity(slug)
                                        setIsCityModalOpen(false)
                                    }}
                                    className="px-3 py-2.5 hover:bg-[#ecfdf5]/30 rounded-xl text-sm text-brand-dark cursor-pointer transition-colors flex items-center justify-between font-bold"
                                >
                                    <span>{formatCitySlug(slug)}</span>
                                    {selectedCitySlug === slug && <Check className="w-4 h-4 text-brand-green" />}
                                </div>
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
                    <div className="flex items-center justify-between w-full border-t border-gray-100 pt-4">
                        <button 
                            onClick={() => {
                                setMinPrice("")
                                setMaxPrice("")
                                setIsPriceModalOpen(false)
                            }}
                            className="text-xs font-bold text-gray-500 hover:underline"
                        >
                            Limpar
                        </button>
                        <button 
                            onClick={() => setIsPriceModalOpen(false)}
                            className="px-6 py-2.5 bg-brand-green text-white text-xs font-bold rounded-xl hover:bg-brand-dark active:scale-95 transition-all shadow-md"
                        >
                            Aplicar
                        </button>
                    </div>
                }
            >
                <div className="flex gap-4 py-4">
                    <div className="flex-1">
                        <label className="text-[11px] font-bold text-brand-inactive-text mb-1 block">Preço Mínimo</label>
                        <MoneyInput
                            placeholder="Mínimo"
                            value={minPrice}
                            onChange={(val) => setMinPrice(val || "")}
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-[11px] font-bold text-brand-inactive-text mb-1 block">Preço Máximo</label>
                        <MoneyInput
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
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 py-2 custom-scrollbar">
                    {MARKETPLACE_CATEGORIES.map((cat) => {
                        const isSelected = selectedCategories.includes(cat.name)
                        return (
                            <div
                                key={cat.name}
                                onClick={() => toggleCategory(cat.name)}
                                className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer select-none transition-all duration-200 ${
                                    isSelected 
                                        ? "bg-[#ecfdf5] border-brand-green text-brand-green shadow-sm" 
                                        : "bg-white border-gray-200 text-brand-dark hover:border-brand-green"
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">{cat.icon}</span>
                                    <span className="text-sm font-bold">{cat.name}</span>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-brand-green" />}
                            </div>
                        )
                    })}
                </div>
            </DefaultModal>
        </>
    )
}
