"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { SearchIcon, ChevronDownIcon } from "@/lib/icons"
import { useSupabase } from "@/providers/supabase-provider"
import { useFavorites } from "@/providers/favorites-provider"
import { getUserFavoritesAction } from "@/app/actions/marketplace/favorites"
import { ItemCard } from "./shared-components"
import { Button, IconPlaceholder, DefaultModal, SkeletonLoader, Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import { RadioButton } from "@/components/reusable/RadioButton"
import { useRouter, useSearchParams } from "next/navigation"

interface FavoritesPageClientProps {
    userProfile: any
    cartCount: number
    initialItems?: any[]
    initialCounts?: { total: number; produtos: number; servicos: number }
    currentPage?: number
    totalPages?: number
}

type TabType = "todos" | "produtos" | "servicos"
type SortType = "recentes" | "preco_menor" | "preco_maior" | "nome_az"

const TAB_OPTIONS: { value: TabType; label: string }[] = [
    { value: "todos", label: "Todos" },
    { value: "produtos", label: "Produtos" },
    { value: "servicos", label: "Serviços" },
]

const SORT_OPTIONS: { value: SortType; label: string }[] = [
    { value: "recentes", label: "Mais recentes" },
    { value: "preco_menor", label: "Menor preço" },
    { value: "preco_maior", label: "Maior preço" },
    { value: "nome_az", label: "Nome (A-Z)" },
]

export function FavoritesPageClient({
    userProfile,
    cartCount,
    initialItems,
    initialCounts,
    currentPage = 1,
    totalPages = 1,
}: FavoritesPageClientProps) {
    const { user } = useSupabase()
    const router = useRouter()
    const searchParams = useSearchParams()
    const { favoriteKeys, isLoaded: isFavoritesLoaded } = useFavorites()
    const userId = user?.id

    const [activeTab, setActiveTab] = useState<TabType>("todos")
    const [sortBy, setSortBy] = useState<SortType>("recentes")
    const [searchInput, setSearchInput] = useState("")
    const [searchQuery, setSearchQuery] = useState("")
    const [items, setItems] = useState<any[]>(initialItems ?? [])
    const [isLoading, setIsLoading] = useState(!initialItems)
    const [counts, setCounts] = useState(
        initialCounts ?? { total: 0, produtos: 0, servicos: 0 }
    )
    const [isSortModalOpen, setIsSortModalOpen] = useState(false)
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const hasLoadedOnce = useRef(!!initialItems)

    const handlePageChange = (page: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', String(page))
        router.push(`/favoritos?${params.toString()}`)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    // Redirect unauthenticated users
    useEffect(() => {
        if (!user) {
            router.push("/auth/login?next=/favoritos")
        }
    }, [user, router])

    // Fetch favorites
    const fetchFavorites = useCallback(async (silent = false) => {
        if (!userId) return
        if (!silent && !hasLoadedOnce.current) {
            setIsLoading(true)
        }
        try {
            const favResult = await getUserFavoritesAction({ type: "todos" })

            if (favResult.success) {
                setItems(favResult.items)
                if (favResult.counts) {
                    setCounts(favResult.counts)
                }
                hasLoadedOnce.current = true
            }
        } catch (error) {
            console.error("[Favorites] Fetch error:", error)
        } finally {
            setIsLoading(false)
        }
    }, [userId])

    // Initial fetch if SSR data was not provided
    useEffect(() => {
        if (!hasLoadedOnce.current && userId) {
            fetchFavorites()
        }
    }, [userId, fetchFavorites])

    // When an item is unfavorited from favoriteKeys, remove it immediately from items without reloading
    useEffect(() => {
        if (!isFavoritesLoaded || !hasLoadedOnce.current) return
        setItems((prevItems) => {
            const updated = prevItems.filter((item) => favoriteKeys.has(`${item.itemType}:${item.id}`))
            if (updated.length !== prevItems.length) {
                const prodCount = updated.filter((i) => i.itemType === "produto").length
                const servCount = updated.filter((i) => i.itemType === "servico").length
                setCounts({
                    total: updated.length,
                    produtos: prodCount,
                    servicos: servCount,
                })
                return updated
            }
            return prevItems
        })
    }, [favoriteKeys, isFavoritesLoaded])

    // Filter and sort items
    const filteredItems = useMemo(() => {
        let result = [...items]

        // Tab filter
        if (activeTab === "produtos") {
            result = result.filter((item) => item.itemType === "produto")
        } else if (activeTab === "servicos") {
            result = result.filter((item) => item.itemType === "servico")
        }

        // Search filter (debounced via searchQuery state)
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            result = result.filter((item) => {
                const name = (item.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                const sku = (item.sku || "").toLowerCase()
                const category = (item.category || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                return name.includes(q) || sku.includes(q) || category.includes(q)
            })
        }

        // Sort
        switch (sortBy) {
            case "recentes":
                result.sort((a, b) => new Date(b.favorited_at).getTime() - new Date(a.favorited_at).getTime())
                break
            case "preco_menor":
                result.sort((a, b) => (a.price || 0) - (b.price || 0))
                break
            case "preco_maior":
                result.sort((a, b) => (b.price || 0) - (a.price || 0))
                break
            case "nome_az":
                result.sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"))
                break
        }

        return result
    }, [items, searchQuery, sortBy, activeTab])

    // Debounced search
    const handleSearchChange = useCallback((value: string) => {
        setSearchInput(value)
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = setTimeout(() => {
            setSearchQuery(value)
        }, 300)
    }, [])

    const tabCount = (tab: TabType) => {
        switch (tab) {
            case "todos": return counts.total
            case "produtos": return counts.produtos
            case "servicos": return counts.servicos
        }
    }

    if (!user) return null

    return (
        <>
            <div className="container mx-auto px-4 max-w-[1300px] mt-12 lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12 relative overflow-hidden">
                {/* Header */}
                <div className="hidden lg:block items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                            Favoritos {counts.total > 0 && (<span className="text-brand-inactive-text dark:text-dark-body font-bold text-base lg:text-lg ml-2">({counts.total})</span>)}
                        </h1>
                        <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">Seus produtos e serviços salvos em um só lugar</p>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
                    <TabsList className="bg-transparent px-0 md:px-0 mb-6">
                        {TAB_OPTIONS.map((tab) => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                badge={<span className="ml-1 text-xs text-brand-inactive-text dark:text-dark-body">({tabCount(tab.value)})</span>}
                            >
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                {/* Search & Sort Bar */}
                {counts.total > 0 && (
                    <div className="flex items-center gap-3 mb-6">
                        {/* Search */}
                        <div className="relative flex-1 max-w-md">
                            <Input
                                label=""
                                name="searchQuery"
                                placeholder="Buscar nos favoritos..."
                                value={searchInput}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text dark:text-dark-body" />}
                                className="mb-0"
                                variant="full-rounded"
                            />
                        </div>

                        {/* Sort */}
                        <Button
                            onClick={() => setIsSortModalOpen(true)}
                            variant="outline"
                            className="flex items-center gap-2 w-fit"
                            rightIcon={<ChevronDownIcon size={14} />}
                        >
                            {SORT_OPTIONS.find((s) => s.value === sortBy)?.label}
                        </Button>
                    </div>
                )}

                {/* Content */}
                <div>
                    {isLoading ? (
                        <FavoritesSkeleton />
                    ) : filteredItems.length === 0 ? (
                        <FavoritesEmpty
                            hasSearch={!!searchQuery.trim()}
                            activeTab={activeTab}
                            totalCount={counts.total}
                        />
                    ) : (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6">
                                {filteredItems.map((item) => (
                                    <ItemCard
                                        key={`${item.itemType}-${item.id}`}
                                        product={item}
                                        locationContext={userProfile?.city && userProfile?.state ? { scope: "city", city: userProfile.city, state: userProfile.state } : null}
                                        className="w-full"
                                    />
                                ))}
                            </div>

                            {totalPages > 1 && (
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    onPageChange={handlePageChange}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Sort Modal */}
            <DefaultModal
                isOpen={isSortModalOpen}
                onClose={() => setIsSortModalOpen(false)}
                title="Ordenar por"
                maxWidth="md"
            >
                <div className="flex flex-col gap-1 py-2 px-4">
                    {SORT_OPTIONS.map((opt) => (
                        <RadioButton
                            key={opt.value}
                            name="fav_sort_option"
                            value={opt.value}
                            checked={sortBy === opt.value}
                            onChange={() => {
                                setSortBy(opt.value)
                                setIsSortModalOpen(false)
                            }}
                            label={opt.label}
                        />
                    ))}
                </div>
            </DefaultModal>
        </>
    )
}

// ─── Skeleton Loader ────────────────────────────────────────────────────────

function FavoritesSkeleton() {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
                <div key={i}>
                    <SkeletonLoader height={170} className="rounded-[16px] mb-3" />
                    <div className="px-1 space-y-2">
                        <SkeletonLoader height={14} width="80%" className="rounded" />
                        <SkeletonLoader height={18} width="60%" className="rounded" />
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-dark-border mt-2">
                            <SkeletonLoader width={32} height={32} circle />
                            <SkeletonLoader height={12} width="50%" className="rounded" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

// ─── Empty State ────────────────────────────────────────────────────────────

function FavoritesEmpty({
    hasSearch,
    activeTab,
    totalCount,
}: {
    hasSearch: boolean
    activeTab: TabType
    totalCount: number
}) {
    if (hasSearch) {
        return (
            <div className="flex justify-center py-12">
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                    imageAlt="Nenhum favorito encontrado"
                    title="Nenhum resultado"
                    subtitle="Nenhum dos seus favoritos corresponde à busca. Tente um termo diferente."
                />
            </div>
        )
    }

    if (totalCount > 0 && activeTab !== "todos") {
        const label = activeTab === "produtos" ? "produtos" : "serviços"
        return (
            <div className="flex justify-center py-12">
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                    imageAlt={`Sem ${label} favorito`}
                    title={`Sem ${label} favorito`}
                    subtitle={`Você ainda não tem ${label} nos seus favoritos. Explore a Dudit e favorite o que gostar!`}
                    itemButton={{
                        text: "Explorar Dudit",
                        action: () => window.location.href = "/explorar",
                        variant: "default"
                    }}
                />
            </div>
        )
    }

    return (
        <div className="flex justify-center py-12">
            <IconPlaceholder
                placeholderType="image"
                imageSrc="https://img.dudit.com.br/static/mascots/Favoritos.png"
                imageAlt="Seus favoritos estão vazios"
                title="Seus favoritos estão vazios"
                subtitle="Clique no 💚 nos produtos e serviços que gostar para encontrá-los rapidamente aqui depois!"
                itemButton={{
                    text: "Explorar marketplace",
                    action: () => window.location.href = "/explorar",
                    variant: "default"
                }}
            />
        </div>
    )
}
