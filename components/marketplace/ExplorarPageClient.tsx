"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { ItemCard } from "./shared-components"
import { Switch } from "@/components/reusable/Switch"
import { IconPlaceholder, RadioButton, Dropdown, DropdownItem, Button, FormDropdown } from "@/components/reusable"
import { MoneyInput } from "@/components/reusable/Inputs/MoneyInput"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import Link from "next/link"
import { getPartnerUrl } from "@/lib/utils/url-generator"
import { motion, AnimatePresence } from "framer-motion"
import { SkeletonLoader } from "@/components/reusable/SkeletonLoader"
import { ChevronDown, ChevronLeft } from "lucide-react"
import { searchMarketplace } from "@/app/actions/marketplace/search"
import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query"

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

  const observerTarget = useRef<HTMLDivElement>(null)
  const MAX_ITEMS = 300 // Memory cap

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['explore', query, currentType],
    initialPageParam: null as any,
    queryFn: async ({ pageParam }) => {
      // If we are given no pageParam but we have initialResults and it's the very first render,
      // React Query uses initialData. Wait, we are passing initialData, so this is for NEXT pages.
      let limits: any = { geral: 40 }
      if (currentType === 'produtos') limits = { produtos: 40 }
      else if (currentType === 'servicos') limits = { servicos: 40 }
      else if (currentType === 'vitrines') limits = { vitrines: 40 }

      const nextBatch = await searchMarketplace(query, currentType, {
        ...limits,
        cursor: pageParam?.cursor,
        lastId: pageParam?.lastId
      })
      return nextBatch || []
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length === 0) return undefined;
      const lastItem = lastPage[lastPage.length - 1];
      return {
        cursor: lastItem.created_at ? new Date(lastItem.created_at).getTime() : undefined,
        lastId: lastItem.id
      }
    },
    initialData: () => {
      // Only set initial data if it matches what the server sent to this prop
      return { pages: [initialResults], pageParams: [null] }
    },
    placeholderData: keepPreviousData,
    staleTime: 60000
  })

  const rawItems = useMemo(() => {
    const all = data ? data.pages.flat() : initialResults
    // MEMORY CAP: Discard oldest items if exceeding limit
    if (all.length > MAX_ITEMS) {
      return all.slice(0, MAX_ITEMS)
    }
    return all
  }, [data, initialResults])

  // HARDENED IntersectionObserver — single trigger
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        fetchNextPage()
      }
    }, {
      rootMargin: "600px"
    })

    if (observerTarget.current) observer.observe(observerTarget.current)

    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const normalizedInitialResults = useMemo(() => {
    return rawItems.map((item: any) => {
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
  const [minPrice, setMinPrice] = useState<number | string>("")
  const [maxPrice, setMaxPrice] = useState<number | string>("")

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
    if (minPrice) filtered = filtered.filter((p) => p.price && p.price >= Number(minPrice))
    if (maxPrice) filtered = filtered.filter((p) => p.price && p.price <= Number(maxPrice))
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
            <div className="flex-1 w-full max-w-[200px]">
              <FormDropdown
                value={sortBy}
                setValue={(val) => setSortBy(val as any)}
                options={[
                  { value: "relevancia", label: "Relevância" },
                  { value: "preco_menor", label: "Menor Preço" },
                  { value: "preco_maior", label: "Maior Preço" },
                  { value: "recentes", label: "Mais Recentes" }
                ]}
              />
            </div>

            <Button
              onClick={() => setIsFilterSheetOpen(true)}
              className="h-10 px-6 flex items-center justify-center gap-2"
            >
              <span className="text-[14px] font-bold text-brand-dark">Filtrar</span>
              {activeFiltersCount > 0 && (
                <div className="w-5 h-5 bg-brand-green text-white text-[10px] font-bold border-2 border-white rounded-full flex items-center justify-center">
                  {activeFiltersCount}
                </div>
              )}
            </Button>
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
                <div className="min-w-[200px]">
                  <FormDropdown
                    label="Ordenar por"
                    value={sortBy}
                    setValue={(val) => setSortBy(val as any)}
                    options={[
                      { value: "relevancia", label: "Relevância" },
                      { value: "preco_menor", label: "Menor Preço" },
                      { value: "preco_maior", label: "Maior Preço" },
                      { value: "recentes", label: "Mais Recentes" }
                    ]}
                  />
                </div>
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
                            <Link key={`vitrine-${item.id}`} href={getPartnerUrl(item.partners)} prefetch={true} className="border border-brand-border p-4 rounded-xl flex flex-col items-center text-center hover:border-brand-green transition-colors group">
                              <img src={item.images[0]} alt={item.name} className="w-20 h-20 rounded-full object-cover mb-3" />
                              <h3 className="font-bold text-brand-dark truncate w-full group-hover:text-brand-green transition-colors">{item.name}</h3>
                              <p className="text-xs text-brand-inactive-text truncate w-full mb-3">{item.partners?.city} - {item.partners?.state}</p>
                              <span className="text-[11px] font-bold text-brand-green mt-auto bg-green-50 px-3 py-1 rounded-full uppercase tracking-wider">Ver Vitrine</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {filteredResults.length === 0 && vitrinesDestaque.length === 0 && !hasNextPage ? (
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
                              <Link key={`loja-${item.id}`} href={getPartnerUrl(item.partners)} prefetch={true} className="border border-brand-border p-4 rounded-xl flex flex-col items-center text-center hover:border-brand-green transition-colors group">
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
                        {hasNextPage && (
                          <div
                            ref={observerTarget}
                            className="col-span-full py-12 flex items-center justify-center min-h-[100px]"
                          >
                            <div className="flex flex-col items-center gap-2">
                              {isFetchingNextPage ? (
                                <>
                                  <SkeletonLoader height={24} width={180} />
                                  <span className="text-[12px] text-brand-inactive-text animate-pulse">Carregando mais...</span>
                                </>
                              ) : null}
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
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedCategories([])
                  setSelectedRegions([])
                  setMinPrice("")
                  setMaxPrice("")
                  setPromoOn(false)
                }}
                className="w-full h-10"
              >
                Limpar filtros
              </Button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
