"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { ItemCard } from "./shared-components"
import { Switch } from "@/components/reusable/Switch"
import { IconPlaceholder, RadioButton, Dropdown, DropdownItem, Button } from "@/components/reusable"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import Link from "next/link"
import { getPartnerUrl } from "@/lib/utils/url-generator"
import { motion, AnimatePresence } from "framer-motion"
import { SkeletonLoader } from "@/components/reusable/SkeletonLoader"
import { ChevronDown, ChevronLeft } from "lucide-react"
import { searchMarketplace } from "@/app/actions/marketplace/search"

interface ExplorarPageClientProps {
  initialResults?: any[]
  query?: string
  type?: 'produtos' | 'servicos' | 'vitrines' | 'tudo'
  userProfile?: any
  cartCount?: number
}

type SortOption = "relevancia" | "preco_menor" | "preco_maior" | "recentes"

export function ExplorarPageClient({ initialResults = [], query = '', type = 'tudo', userProfile, cartCount, hideHeaderAndFooter }: ExplorarPageClientProps & { hideHeaderAndFooter?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [currentType, setCurrentType] = useState(type)
  const [isNavigating, setIsNavigating] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>("relevancia")
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

  // INFINITE SCROLL STATE
  const [items, setItems] = useState<any[]>(initialResults)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialResults.length >= 20)
  const observerTarget = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false) // HARD GUARD against concurrent requests
  const MAX_ITEMS = 300 // Memory cap — prevents mobile lag

  useEffect(() => {
    setIsNavigating(false)
    setItems(initialResults)
    setHasMore(initialResults.length >= 20)
    loadingMoreRef.current = false
  }, [initialResults, query, type])

  const loadMore = useCallback(async () => {
    // HARD GUARD: Prevent concurrent requests (ref > state because state can be stale in closures)
    if (loadingMoreRef.current || !hasMore) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      let currentListings = items.filter(i => i.itemType !== 'loja')
      if (currentType === 'vitrines') {
        currentListings = items.filter(i => i.itemType === 'loja')
      } else if (currentType === 'produtos') {
        currentListings = items.filter(i => i.itemType === 'produto')
      } else if (currentType === 'servicos') {
        currentListings = items.filter(i => i.itemType === 'servico')
      }
      const lastItem = currentListings[currentListings.length - 1]

      const cursor = lastItem?.created_at ? new Date(lastItem.created_at).getTime() : undefined
      const lastId = lastItem?.id

      let limits: any = { geral: 40 }
      if (currentType === 'produtos') limits = { produtos: 40 }
      else if (currentType === 'servicos') limits = { servicos: 40 }
      else if (currentType === 'vitrines') limits = { vitrines: 40 }

      const nextBatch = await searchMarketplace(query, currentType, { ...limits, cursor, lastId })

      if (!nextBatch || nextBatch.length === 0) {
        setHasMore(false)
      } else {
        setItems(prev => {
          const seen = new Set(prev.map(p => p.id))
          const pureNew = nextBatch.filter(p => !seen.has(p.id))

          if (pureNew.length === 0) {
            setHasMore(false)
            return prev
          }

          const merged = [...prev, ...pureNew]
          // MEMORY CAP: Discard oldest items if exceeding limit
          if (merged.length > MAX_ITEMS) {
            return merged.slice(merged.length - MAX_ITEMS)
          }
          return merged
        })
      }
    } catch (e) {
      console.error("[Infinite Scroll Failed]", e)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [items, hasMore, query, currentType])

  // HARDENED IntersectionObserver — disconnects while loading, single trigger
  useEffect(() => {
    if (!hasMore || loadingMore) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMoreRef.current) {
        loadMore()
      }
    }, {
      rootMargin: "600px"
    })

    if (observerTarget.current) observer.observe(observerTarget.current)

    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadMore])


  const normalizedInitialResults = useMemo(() => {
    return items.map((item) => {
      if (item.itemType === 'loja') return item
      const hasOwnImages = item.images && item.images.length > 0
      const images = hasOwnImages ? item.images : (item.fallback_variant_image ? [item.fallback_variant_image] : item.images)
      const basePrice = Number(item.promotional_price || item.price)
      const price = (!item.promotional_price && item.fallback_variant_price) ? Number(item.fallback_variant_price) : basePrice
      return {
        ...item,
        price,
        originalPrice: item.promotional_price ? Number(item.price) : undefined,
        images,
        partners: Array.isArray(item.partners) ? item.partners[0] : item.partners,
      }
    })
  }, [items])

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
      const vitrines = normalizedInitialResults.filter(r => r.itemType === 'loja').slice(0, 4)
      const list = normalizedInitialResults.filter(r => r.itemType !== 'loja')
      return { vitrinesDestaque: vitrines, dataToFilter: list }
    }

    const list = normalizedInitialResults.filter(r => r.itemType !== 'loja')
    return { vitrinesDestaque: [], dataToFilter: list }
  }, [normalizedInitialResults, currentType])

  const [promoOn, setPromoOn] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")

  const { categories, regions } = useMemo(() => {
    return {
      categories: [...new Set(dataToFilter.map((p) => p.category).filter(Boolean))],
      regions: [...new Set(dataToFilter.map((p) => p.partners?.state).filter(Boolean))]
    }
  }, [dataToFilter])

  const filteredResults = useMemo(() => {
    let filtered = [...dataToFilter]
    if (selectedCategories.length > 0) filtered = filtered.filter((p) => selectedCategories.includes(p.category))
    if (selectedRegions.length > 0) filtered = filtered.filter((p) => selectedRegions.includes(p.partners?.state))
    if (minPrice) filtered = filtered.filter((p) => p.price && p.price >= Number.parseFloat(minPrice))
    if (maxPrice) filtered = filtered.filter((p) => p.price && p.price <= Number.parseFloat(maxPrice))
    if (promoOn) filtered = filtered.filter((p) => p.originalPrice !== undefined)

    // Ordenação
    if (sortBy === "preco_menor") {
      filtered.sort((a, b) => (a.price || 0) - (b.price || 0))
    } else if (sortBy === "preco_maior") {
      filtered.sort((a, b) => (b.price || 0) - (a.price || 0))
    } else if (sortBy === "recentes") {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    } else {
      // Relevância
      filtered.sort((a, b) => {
        const scoreA = (a.rating || 0) * 10 + (a.originalPrice ? 20 : 0) + (a.stock_quantity > 0 ? 5 : 0)
        const scoreB = (b.rating || 0) * 10 + (b.originalPrice ? 20 : 0) + (b.stock_quantity > 0 ? 5 : 0)
        return scoreB - scoreA
      })
    }
    return filtered
  }, [dataToFilter, selectedCategories, selectedRegions, minPrice, maxPrice, promoOn, sortBy])

  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (selectedCategories.length > 0) count++
    if (selectedRegions.length > 0) count++
    if (minPrice || maxPrice) count++
    if (promoOn) count++
    return count
  }, [selectedCategories, selectedRegions, minPrice, maxPrice, promoOn])

  const sortLabel = useMemo(() => {
    const labels = {
      relevancia: "Relevância",
      preco_menor: "Menor Preço",
      preco_maior: "Maior Preço",
      recentes: "Mais Recentes"
    }
    return labels[sortBy]
  }, [sortBy])

  const handleTypeChange = (newType: string) => {
    if (newType === currentType) return
    setCurrentType(newType as any)
    setHasMore(true) // Permite carregar mais itens do novo tipo, se houver
  }

  const toggleCategory = (cat: string) => setSelectedCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]))
  const toggleRegion = (reg: string) => setSelectedRegions((prev) => (prev.includes(reg) ? prev.filter((r) => r !== reg) : [...prev, reg]))

  const Chip = ({ label, selected, onClick }: { label: string; selected?: boolean; onClick?: () => void }) => (
    <div onClick={onClick} className={`px-4 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-all cursor-pointer ${selected ? "bg-brand-green text-[#ecfdf5]" : "bg-[#ecfdf5] text-brand-dark hover:bg-[#d1fae5]"}`}>
      {label}
    </div>
  )

  const pageTitle = useMemo(() => {
    if (query) return "Explorar"
    if (currentType === "produtos") return "Produtos"
    if (currentType === "servicos") return "Serviços"
    if (currentType === "vitrines") return "Vitrines"
    return "Explorar"
  }, [query, currentType])

  const FiltersContent = () => (
    <div className="mb-8">
      <h2 className="hidden lg:block text-[16px] font-bold text-brand-dark mb-6">Filtre sua busca:</h2>

      <div className="mb-8">
        <h3 className="text-[15px] font-bold text-brand-dark mb-4">Tipo de Item</h3>
        <div className="flex flex-col">
          {[
            { value: 'tudo', label: 'Ver Tudo' },
            { value: 'produtos', label: 'Produtos' },
            { value: 'servicos', label: 'Serviços' },
            { value: 'vitrines', label: 'Vitrines de Lojas' }
          ].map((item) => (
            <RadioButton
              key={item.value}
              name="item_type"
              value={item.value}
              checked={currentType === item.value}
              onChange={() => handleTypeChange(item.value)}
              label={item.label}
            />
          ))}
        </div>
      </div>

      {currentType !== 'vitrines' && categories.length > 0 && (
        <div className="mb-8">
          <h3 className="text-[15px] font-bold text-brand-dark mb-4">Categoria</h3>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => <Chip key={cat} label={cat} selected={selectedCategories.includes(cat)} onClick={() => toggleCategory(cat)} />)}
          </div>
        </div>
      )}
      {currentType !== 'vitrines' && (
        <>
          <div className="space-y-6 border-t border-brand-border pt-6 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-bold text-brand-dark">Em promoção</span>
              <Switch checked={promoOn} onCheckedChange={setPromoOn} />
            </div>
          </div>
          <div className="mb-8 border-t border-brand-border pt-6">
            <h3 className="text-[15px] font-bold text-brand-dark mb-4">Faixa de preço</h3>
            <div className="flex gap-3 mb-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-brand-inactive-text">R$</span>
                <input type="number" placeholder="Mínimo" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="w-full h-[40px] border border-brand-border rounded-[8px] pl-9 pr-2 text-[14px] outline-none focus:border-brand-green" />
              </div>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-brand-inactive-text">R$</span>
                <input type="number" placeholder="Máximo" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-full h-[40px] border border-brand-border rounded-[8px] pl-9 pr-2 text-[14px] outline-none focus:border-brand-green" />
              </div>
            </div>
          </div>
        </>
      )}
      {currentType !== 'vitrines' && regions.length > 0 && (
        <div className="mb-8 border-t border-brand-border pt-6">
          <h3 className="text-[15px] font-bold text-brand-dark mb-4">Região do vendedor</h3>
          <div className="flex flex-wrap gap-2">
            {regions.map((reg) => <Chip key={reg} label={reg} selected={selectedRegions.includes(reg)} onClick={() => toggleRegion(reg)} />)}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      {!hideHeaderAndFooter && <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />}
      <div className="min-h-screen bg-white font-sans animate-fade-in flex flex-col">
        <style>{`.animate-fade-in { animation: fadeIn 0.4s ease-out forwards; } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>

        {/* TOP BAR - MOBILE ONLY */}
        <div className="lg:hidden bg-white border-b border-gray-100 z-30 sticky top-[60px]">
          <div className="container mx-auto px-4 h-[60px] flex items-center gap-3">
            <Dropdown
              className="flex-1"
              trigger={
                <div className="h-10 border border-brand-border rounded-[10px] px-4 flex items-center justify-between bg-white cursor-pointer hover:border-brand-green transition-colors">
                  <span className="text-[14px] font-medium text-brand-dark truncate">{sortLabel}</span>
                  <ChevronDown className="w-4 h-4 text-brand-inactive-text ml-2 shrink-0" />
                </div>
              }
            >
              <DropdownItem onClick={() => setSortBy("relevancia")}>Relevância</DropdownItem>
              <DropdownItem onClick={() => setSortBy("preco_menor")}>Menor Preço</DropdownItem>
              <DropdownItem onClick={() => setSortBy("preco_maior")}>Maior Preço</DropdownItem>
              <DropdownItem onClick={() => setSortBy("recentes")}>Mais Recentes</DropdownItem>
            </Dropdown>

            <button
              onClick={() => setIsFilterSheetOpen(true)}
              className="h-10 px-6 border border-brand-border rounded-[10px] flex items-center justify-center gap-2 bg-white hover:border-brand-green transition-colors"
            >
              <span className="text-[14px] font-bold text-brand-dark">Filtrar</span>
              {activeFiltersCount > 0 && (
                <div className="w-5 h-5 bg-brand-green text-white text-[10px] font-bold border-2 border-white rounded-full flex items-center justify-center">
                  {activeFiltersCount}
                </div>
              )}
            </button>
          </div>
        </div>

        <div className="container mx-auto px-4 lg:px-6 max-w-[1300px] flex gap-8 items-start flex-grow pb-24 lg:pb-12 mt-6 lg:mt-8">
          <aside className="hidden lg:block w-[280px] shrink-0 pt-4">
            <FiltersContent />
          </aside>

          <div className="flex-1 w-full min-w-0">
            <div className="mb-6 pt-4 flex flex-col lg:flex-row lg:items-end lg:justify-between lg:mb-8">
              <div>
                <h1 className="text-[24px] lg:text-[32px] font-bold text-brand-dark mb-2 leading-tight">{pageTitle}</h1>
                <p className="text-[14px] text-brand-inactive-text">
                  {filteredResults.length + vitrinesDestaque.length} {(filteredResults.length + vitrinesDestaque.length) === 1 ? "resultado encontrado" : "resultados encontrados"}
                </p>
              </div>

              {/* DESKTOP SORT */}
              <div className="hidden lg:block mt-4 lg:mt-0">
                <Dropdown
                  trigger={
                    <div className="h-10 border border-brand-border rounded-[10px] px-6 flex items-center gap-4 bg-white cursor-pointer hover:border-brand-green transition-colors min-w-[200px]">
                      <span className="text-[14px] font-medium text-brand-dark shrink-0">Ordenar por:</span>
                      <span className="text-[14px] font-bold text-brand-dark truncate">{sortLabel}</span>
                      <ChevronDown className="w-4 h-4 text-brand-inactive-text ml-auto" />
                    </div>
                  }
                >
                  <DropdownItem onClick={() => setSortBy("relevancia")}>Relevância</DropdownItem>
                  <DropdownItem onClick={() => setSortBy("preco_menor")}>Menor Preço</DropdownItem>
                  <DropdownItem onClick={() => setSortBy("preco_maior")}>Maior Preço</DropdownItem>
                  <DropdownItem onClick={() => setSortBy("recentes")}>Mais Recentes</DropdownItem>
                </Dropdown>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentType}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {isNavigating ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {[...Array(8)].map((_, i) => (
                      <div key={`skeleton-${i}`} className="border border-brand-border p-4 rounded-xl flex flex-col gap-4">
                        <SkeletonLoader height={160} />
                        <SkeletonLoader height={20} width="80%" />
                        <SkeletonLoader height={15} width="60%" />
                        <div className="mt-auto flex justify-between items-end">
                          <SkeletonLoader height={25} width="40%" />
                          <SkeletonLoader height={15} width="30%" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {vitrinesDestaque.length > 0 && (
                      <div className="mb-10">
                        <h2 className="text-[18px] font-bold text-brand-dark mb-4 opacity-80 tracking-widest text-xs uppercase">Vitrines relacionadas</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {vitrinesDestaque.map((item) => (
                            <Link key={`vitrine-${item.id}`} href={getPartnerUrl(item.partners)} prefetch={false} className="border border-brand-border p-4 rounded-xl flex flex-col items-center text-center hover:border-brand-green transition-colors group">
                              <img src={item.images[0]} alt={item.name} className="w-20 h-20 rounded-full object-cover mb-3" />
                              <h3 className="font-bold text-brand-dark truncate w-full group-hover:text-brand-green transition-colors">{item.name}</h3>
                              <p className="text-xs text-brand-inactive-text truncate w-full mb-3">{item.partners?.city} - {item.partners?.state}</p>
                              <span className="text-[11px] font-bold text-brand-green mt-auto bg-green-50 px-3 py-1 rounded-full uppercase tracking-wider">Ver Vitrine</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {filteredResults.length === 0 && vitrinesDestaque.length === 0 && !hasMore ? (
                      <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                        imageAlt="O Dino revirou tudo e não achou!"
                        title="O Dino revirou tudo e não achou!"
                        subtitle="Não encontramos nada com esses filtros. Que tal tentar uma busca diferente ou limpar os filtros?"
                      />
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                        {filteredResults.map((item) => {
                          if (item.itemType === 'loja') {
                            return (
                              <Link key={`loja-${item.id}`} href={getPartnerUrl(item.partners)} prefetch={false} className="border border-brand-border p-4 rounded-xl flex flex-col items-center text-center hover:border-brand-green transition-colors group">
                                <img src={item.images[0]} alt={item.name} className="w-20 h-20 rounded-full object-cover mb-4 shadow-sm" />
                                <h3 className="font-bold text-brand-dark truncate w-full group-hover:text-brand-green transition-colors">{item.name}</h3>
                                <p className="text-xs text-brand-inactive-text truncate w-full mb-4">{item.partners?.city} - {item.partners?.state}</p>
                                <span className="text-sm font-bold text-brand-green mt-auto uppercase tracking-wide">Explorar Loja</span>
                              </Link>
                            )
                          }
                          return <ItemCard key={item.id} product={item as any} />
                        })}

                        {/* 
                          INFINITE SCROLL LOADER (IntersectionObserver Target) 
                        */}
                        {hasMore && (
                          <div
                            ref={observerTarget}
                            className="col-span-full py-12 flex items-center justify-center min-h-[100px]"
                          >
                            <div className="flex flex-col items-center gap-2">
                              <SkeletonLoader height={24} width={180} />
                              <span className="text-[12px] text-brand-inactive-text animate-pulse">Carregando mais...</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        {!hideHeaderAndFooter && <MarketplaceFooter />}
      </div>

      {/* MOBILE FILTERS OVERLAY */}
      {/* ... keeping overlay unchanged ... */}
      <AnimatePresence>
        {isFilterSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white flex flex-col font-sans"
          >
            <header className="h-16 flex items-center px-4 border-b border-gray-100 flex-shrink-0">
              <button onClick={() => setIsFilterSheetOpen(false)} className="w-10 h-10 flex items-center justify-center">
                <ChevronLeft className="w-6 h-6 text-brand-dark" />
              </button>
              <h2 className="flex-1 text-center font-bold text-[18px] text-brand-dark pr-10">Filtrar por</h2>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-8">
              <FiltersContent />
            </div>

            <footer className="p-6 bg-white border-t border-gray-100 flex flex-col gap-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
              <Button onClick={() => setIsFilterSheetOpen(false)} variant="default" className="w-full h-12 text-sm rounded-[12px] font-bold bg-brand-green text-white">Ver resultados</Button>
              <button
                onClick={() => {
                  setSelectedCategories([])
                  setSelectedRegions([])
                  setMinPrice("")
                  setMaxPrice("")
                  setPromoOn(false)
                }}
                className="w-full h-10 text-sm font-bold text-brand-inactive-text hover:text-brand-dark transition-colors"
              >
                Limpar filtros
              </button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
