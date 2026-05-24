"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { ItemCard, VitrineCard } from "./shared-components"
import { Switch } from "@/components/reusable/Switch"
import { IconPlaceholder, Button } from "@/components/reusable"
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
    ArrowDownAZ, 
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
    userProfile?: any
    cartCount?: number
}

type SortOption = "relevancia" | "preco_menor" | "preco_maior" | "recentes"

const MARKETPLACE_CATEGORIES = [
  { name: "Alimentação", icon: "🍔", desc: "Lanches e pratos" },
  { name: "Mercado", icon: "🛒", desc: "Compras e pet" },
  { name: "Casa & Construção", icon: "🛠️", desc: "Reparos e materiais" },
  { name: "Serviços", icon: "🧹", desc: "Profissionais locais" },
  { name: "Moda & Estilo", icon: "👕", desc: "Vestuário e acessórios" },
  { name: "Beleza", icon: "💅", desc: "Estética e bem-estar" },
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

export function ExplorarPageClient({ 
    initialResults = [], 
    query = '', 
    type = 'tudo', 
    cidade = '',
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
    
    // Top popovers state
    const [activePopover, setActivePopover] = useState<'sort' | 'type' | 'price' | 'city' | null>(null)
    
    // City search state
    const [citySearchText, setCitySearchText] = useState("")

    // Filter states
    const [promoOn, setPromoOn] = useState(false)
    const [selectedCategories, setSelectedCategories] = useState<string[]>([])
    const [minPrice, setMinPrice] = useState<number | string>("")
    const [maxPrice, setMaxPrice] = useState<number | string>("")

    const observerTarget = useRef<HTMLDivElement>(null)
    const MAX_ITEMS = 300 // Memory cap

    // Handle city synchronization from URL/cookies
    useEffect(() => {
        const urlCity = searchParams.get("cidade")
        if (urlCity) {
            setSelectedCitySlug(urlCity)
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
            const params = new URLSearchParams(searchParams.toString())
            params.set("cidade", savedCity)
            router.replace(`${pathname}?${params.toString()}`)
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
        setActivePopover(null)

        // Update URL param
        const params = new URLSearchParams(searchParams.toString())
        params.set("type", newType)
        router.replace(`${pathname}?${params.toString()}`)
    }

    const toggleCategory = (catName: string) => {
        setSelectedCategories((prev) => 
            prev.includes(catName) ? prev.filter((c) => c !== catName) : [...prev, catName]
        )
    }

    const handleSelectCity = (citySlug: string | null) => {
        setSelectedCitySlug(citySlug)
        setActivePopover(null)
        setCitySearchText("")

        const params = new URLSearchParams(searchParams.toString())
        if (citySlug) {
            params.set("cidade", citySlug)
            document.cookie = `dudit_city=${citySlug}; path=/; max-age=${60 * 60 * 24 * 30}`
            localStorage.setItem("dudit_city", citySlug)
        } else {
            params.delete("cidade")
            document.cookie = `dudit_city=; path=/; max-age=0`
            localStorage.removeItem("dudit_city")
        }
        router.replace(`${pathname}?${params.toString()}`)
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
        return `Explorar Dudit${citySuffix}`
    }, [query, currentType, selectedCitySlug])

    // Horizontal snap carousel renderer helper
    const HorizontalCarousel = ({ title, items, renderItem, onSeeAll }: { title: string, items: any[], renderItem: (item: any) => React.ReactNode, onSeeAll?: () => void }) => {
        const scrollContainerRef = useRef<HTMLDivElement>(null)
        const scroll = (direction: 'left' | 'right') => {
            if (scrollContainerRef.current) {
                const scrollAmount = 300 * 2
                scrollContainerRef.current.scrollBy({
                    left: direction === 'left' ? -scrollAmount : scrollAmount,
                    behavior: 'smooth'
                })
            }
        }

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
                            <button 
                                onClick={() => scroll('left')}
                                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 active:scale-95 transition-all shadow-sm cursor-pointer"
                            >
                                <ChevronLeft className="w-4 h-4 text-brand-dark" />
                            </button>
                            <button 
                                onClick={() => scroll('right')}
                                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 active:scale-95 transition-all shadow-sm cursor-pointer"
                            >
                                <ChevronRight className="w-4 h-4 text-brand-dark" />
                            </button>
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

    return (
        <>
            {!hideHeaderAndFooter && <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />}
            <div className="min-h-screen bg-white font-sans animate-fade-in flex flex-col pt-2">
                <style>{`
                    .scrollbar-none::-webkit-scrollbar { display: none; }
                    .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
                `}</style>

                {/* 1. PREMIUM HORIZONTAL CATEGORIES SLIDER */}
                <div className="bg-[#fcfdfd] border-b border-gray-100 py-6">
                    <div className="container mx-auto px-4 max-w-[1300px]">
                        <div className="flex gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory py-1 px-1">
                            {MARKETPLACE_CATEGORIES.map((cat) => {
                                const isSelected = selectedCategories.includes(cat.name)
                                return (
                                    <div 
                                        key={cat.name}
                                        onClick={() => toggleCategory(cat.name)}
                                        className={`snap-start shrink-0 w-[100px] h-[100px] sm:w-[120px] sm:h-[120px] rounded-2xl flex flex-col items-center justify-center p-3 border transition-all duration-300 cursor-pointer select-none ${
                                            isSelected 
                                                ? "bg-[#ecfdf5] border-brand-green shadow-md scale-[1.03] text-brand-green" 
                                                : "bg-white border-gray-200 hover:border-brand-green hover:shadow-sm text-brand-dark"
                                        }`}
                                    >
                                        <span className="text-3xl sm:text-4xl mb-2 filter drop-shadow-sm">{cat.icon}</span>
                                        <span className="text-[11px] sm:text-[12px] font-bold text-center leading-tight truncate w-full">{cat.name}</span>
                                        <span className="text-[8px] sm:text-[9px] text-center text-brand-inactive-text mt-0.5 line-clamp-1 hidden sm:block">{cat.desc}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* 2. STICKY TOP FILTER CHIPS BAR */}
                <div className="bg-white border-b border-gray-100 py-3 sticky top-[108px] z-40 backdrop-blur-md bg-white/95">
                    <div className="container mx-auto px-4 max-w-[1300px] flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1 flex-1">
                            
                            {/* CITY FILTER CHIP */}
                            <div className="relative">
                                <button 
                                    onClick={() => setActivePopover(activePopover === 'city' ? null : 'city')}
                                    className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all select-none cursor-pointer ${
                                        selectedCitySlug 
                                            ? "bg-[#ecfdf5] border-brand-green text-brand-green" 
                                            : "bg-white border-gray-200 text-brand-dark hover:bg-gray-50"
                                    }`}
                                >
                                    <MapPin className="w-3.5 h-3.5" />
                                    <span>{selectedCitySlug ? formatCitySlug(selectedCitySlug) : "Selecione a Cidade"}</span>
                                    <span className="text-[10px] opacity-60">▼</span>
                                </button>

                                <AnimatePresence>
                                    {activePopover === 'city' && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setActivePopover(null)} />
                                            <motion.div 
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 8 }}
                                                className="absolute left-0 mt-2 w-72 bg-white border border-gray-100 rounded-2xl shadow-xl p-4 z-50 animate-fade-in"
                                            >
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-xs font-extrabold text-brand-dark">📍 Localização do Vendedor</span>
                                                    {selectedCitySlug && (
                                                        <button 
                                                            onClick={() => handleSelectCity(null)}
                                                            className="text-[10px] text-red-500 font-extrabold hover:underline"
                                                        >
                                                            Remover
                                                        </button>
                                                    )}
                                                </div>
                                                
                                                <div className="relative">
                                                    <input 
                                                        type="text" 
                                                        placeholder="Buscar cidade... (ex: Bauru)"
                                                        className="w-full px-3 py-2 pl-8 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green bg-gray-50"
                                                        value={citySearchText}
                                                        onChange={(e) => setCitySearchText(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-3" />
                                                </div>

                                                <button
                                                    onClick={() => {
                                                        requestLocation()
                                                        setActivePopover(null)
                                                    }}
                                                    className="w-full flex items-center justify-center gap-2 mt-2 py-2 px-3 bg-brand-green/5 text-brand-green rounded-xl text-xs font-bold hover:bg-brand-green/10 transition-all select-none cursor-pointer"
                                                >
                                                    <MapPin className="w-3.5 h-3.5" />
                                                    <span>Usar minha localização</span>
                                                </button>

                                                {filteredCitiesSuggestions.length > 0 && (
                                                    <div className="mt-3 border-t border-gray-100 pt-2 space-y-1.5">
                                                        {filteredCitiesSuggestions.map((slug) => (
                                                            <div 
                                                                key={slug}
                                                                onClick={() => handleSelectCity(slug)}
                                                                className="px-2 py-1.5 hover:bg-gray-50 rounded-lg text-xs text-brand-dark cursor-pointer transition-colors flex items-center justify-between"
                                                            >
                                                                <span>{formatCitySlug(slug)}</span>
                                                                {selectedCitySlug === slug && <Check className="w-3 h-3 text-brand-green" />}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* SORT FILTER CHIP */}
                            <div className="relative">
                                <button 
                                    onClick={() => setActivePopover(activePopover === 'sort' ? null : 'sort')}
                                    className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all select-none cursor-pointer ${
                                        sortBy !== "relevancia" 
                                            ? "bg-[#ecfdf5] border-brand-green text-brand-green" 
                                            : "bg-white border-gray-200 text-brand-dark hover:bg-gray-50"
                                    }`}
                                >
                                    <ArrowDownAZ className="w-3.5 h-3.5" />
                                    <span>Ordenar por: {sortBy === 'relevancia' ? 'Relevância' : sortBy === 'preco_menor' ? 'Menor Preço' : sortBy === 'preco_maior' ? 'Maior Preço' : 'Mais Recentes'}</span>
                                    <span className="text-[10px] opacity-60">▼</span>
                                </button>

                                <AnimatePresence>
                                    {activePopover === 'sort' && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setActivePopover(null)} />
                                            <motion.div 
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 8 }}
                                                className="absolute left-0 mt-2 w-56 bg-white border border-gray-100 rounded-2xl shadow-xl p-2 z-50"
                                            >
                                                {[
                                                    { value: "relevancia", label: "Relevância" },
                                                    { value: "preco_menor", label: "Menor Preço" },
                                                    { value: "preco_maior", label: "Maior Preço" },
                                                    { value: "recentes", label: "Mais Recentes" }
                                                ].map((opt) => (
                                                    <div 
                                                        key={opt.value}
                                                        onClick={() => {
                                                            setSortBy(opt.value as any)
                                                            setActivePopover(null)
                                                        }}
                                                        className="px-3 py-2 hover:bg-gray-50 rounded-xl text-xs text-brand-dark cursor-pointer transition-colors flex items-center justify-between"
                                                    >
                                                        <span>{opt.label}</span>
                                                        {sortBy === opt.value && <Check className="w-3.5 h-3.5 text-brand-green" />}
                                                    </div>
                                                ))}
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* TYPE FILTER CHIP */}
                            <div className="relative">
                                <button 
                                    onClick={() => setActivePopover(activePopover === 'type' ? null : 'type')}
                                    className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all select-none cursor-pointer ${
                                        currentType !== "tudo" 
                                            ? "bg-[#ecfdf5] border-brand-green text-brand-green" 
                                            : "bg-white border-gray-200 text-brand-dark hover:bg-gray-50"
                                    }`}
                                >
                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                    <span>Ver: {currentType === 'tudo' ? 'Tudo' : currentType === 'produtos' ? 'Produtos' : currentType === 'servicos' ? 'Serviços' : 'Lojas'}</span>
                                    <span className="text-[10px] opacity-60">▼</span>
                                </button>

                                <AnimatePresence>
                                    {activePopover === 'type' && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setActivePopover(null)} />
                                            <motion.div 
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 8 }}
                                                className="absolute left-0 mt-2 w-56 bg-white border border-gray-100 rounded-2xl shadow-xl p-2 z-50"
                                            >
                                                {[
                                                    { value: 'tudo', label: 'Ver Tudo' },
                                                    { value: 'produtos', label: 'Produtos' },
                                                    { value: 'servicos', label: 'Serviços' },
                                                    { value: 'vitrines', label: 'Vitrines de Lojas' }
                                                ].map((opt) => (
                                                    <div 
                                                        key={opt.value}
                                                        onClick={() => handleTypeChange(opt.value)}
                                                        className="px-3 py-2 hover:bg-gray-50 rounded-xl text-xs text-brand-dark cursor-pointer transition-colors flex items-center justify-between"
                                                    >
                                                        <span>{opt.label}</span>
                                                        {currentType === opt.value && <Check className="w-3.5 h-3.5 text-brand-green" />}
                                                    </div>
                                                ))}
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* PROMOTION FILTER CHIP */}
                            <button 
                                onClick={() => setPromoOn(!promoOn)}
                                className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all select-none cursor-pointer ${
                                    promoOn 
                                        ? "bg-brand-green text-white border-brand-green" 
                                        : "bg-white border-gray-200 text-brand-dark hover:bg-gray-50"
                                }`}
                            >
                                <Tag className="w-3.5 h-3.5" />
                                <span>Em Promoção</span>
                            </button>

                            {/* PRICE FILTER CHIP */}
                            <div className="relative">
                                <button 
                                    onClick={() => setActivePopover(activePopover === 'price' ? null : 'price')}
                                    className={`px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all select-none cursor-pointer ${
                                        minPrice || maxPrice 
                                            ? "bg-[#ecfdf5] border-brand-green text-brand-green" 
                                            : "bg-white border-gray-200 text-brand-dark hover:bg-gray-50"
                                    }`}
                                >
                                    <span>Preço</span>
                                    {(minPrice || maxPrice) && <span className="font-extrabold text-[10px]">({minPrice ? `≥R$${minPrice}` : ""} {maxPrice ? `≤R$${maxPrice}` : ""})</span>}
                                    <span className="text-[10px] opacity-60">▼</span>
                                </button>

                                <AnimatePresence>
                                    {activePopover === 'price' && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setActivePopover(null)} />
                                            <motion.div 
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 8 }}
                                                className="absolute left-0 mt-2 w-64 bg-white border border-gray-100 rounded-2xl shadow-xl p-4 z-50"
                                            >
                                                <span className="text-xs font-extrabold text-brand-dark mb-2.5 block">Filtrar por Preço</span>
                                                <div className="flex gap-2 mb-3">
                                                    <div className="flex-1">
                                                        <MoneyInput
                                                            placeholder="Mínimo"
                                                            value={minPrice}
                                                            onChange={(val) => setMinPrice(val || "")}
                                                        />
                                                    </div>
                                                    <div className="flex-1">
                                                        <MoneyInput
                                                            placeholder="Máximo"
                                                            value={maxPrice}
                                                            onChange={(val) => setMaxPrice(val || "")}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex justify-between gap-2 border-t border-gray-100 pt-3">
                                                    <button 
                                                        onClick={() => {
                                                            setMinPrice("")
                                                            setMaxPrice("")
                                                            setActivePopover(null)
                                                        }}
                                                        className="text-[10px] font-bold text-gray-500 hover:underline"
                                                    >
                                                        Limpar
                                                    </button>
                                                    <button 
                                                        onClick={() => setActivePopover(null)}
                                                        className="px-3 py-1.5 bg-brand-green text-white text-[11px] font-bold rounded-lg hover:bg-brand-dark transition-colors"
                                                    >
                                                        Aplicar
                                                    </button>
                                                </div>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* CLEAR ALL FILTERS */}
                            {activeFiltersCount > 0 && (
                                <button 
                                    onClick={() => {
                                        setSelectedCategories([])
                                        setMinPrice("")
                                        setMaxPrice("")
                                        setPromoOn(false)
                                    }}
                                    className="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-full text-xs font-bold flex items-center gap-1 transition-all select-none cursor-pointer"
                                >
                                    <span>Limpar Filtros</span>
                                    <X className="w-3 h-3" />
                                </button>
                            )}

                        </div>
                    </div>
                </div>

                {/* 3. MAIN PRODUCT & LOJA CONTENT SECTION */}
                <div className="container mx-auto px-4 max-w-[1300px] flex-grow pb-24 lg:pb-12 mt-8">
                    
                    <div className="mb-6 flex flex-col lg:flex-row lg:items-end lg:justify-between lg:mb-8 border-b border-gray-100 pb-4">
                        <div>
                            <h1 className="text-[24px] lg:text-[32px] font-bold text-brand-dark mb-1 tracking-tight leading-tight">{pageTitle}</h1>
                            <p className="text-[13px] font-medium text-brand-inactive-text">
                                {filteredResults.length + vitrinesDestaque.length} {(filteredResults.length + vitrinesDestaque.length) === 1 ? "resultado encontrado" : "resultados encontrados"}
                            </p>
                        </div>
                    </div>

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
        </>
    )
}
