"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { ItemCard, VitrineCard, HorizontalCarousel } from "./shared-components"
import type { LocationContext } from "@/lib/utils/location-label"
import { IconPlaceholder, DefaultModal, ListItem, Input, RadioButton, Button, ThreeDotsLoader } from "@/components/reusable"
import { useRouter, useSearchParams, usePathname, useParams } from "next/navigation"
import { CommunityVideosCarousel } from "./CommunityVideosCarousel"
import {
    MapPin,
    Check,
    ChevronDown,
    Globe,
} from "lucide-react"
import { applySellerDiversity, calcCategoryBrowseScore } from "@/lib/marketplace/ranking"
import { applyVendorUrgencyBadges } from "@/lib/marketplace/badges"
import { searchMarketplace, type MarketplaceListCursor, resolveCityAccentBatch } from "@/app/actions/marketplace/search"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useLocationRedirect } from "@/hooks/use-location-redirect"
import { pushUrl } from "@/lib/navigation/history"
import { getProductDisplayImages } from "@/lib/utils/product-display-images"
import { SearchIcon, XIcon } from "@/lib/icons"
import { getStoreUrl, getPlanUrl, getProductUrl, getServiceUrl } from "@/lib/utils/url-generator"
import { formatCurrency } from "@/lib/utils"
import { SponsoredAdsCarousel } from "@/components/marketplace/ads/SponsoredAdsCarousel"
import type { SponsoredAd } from "@/lib/ads/types"
import { getCitiesData } from "@/lib/data/cities-loader"
import { fetchAllMarketplaceCategoriesClient } from "@/lib/data/marketplace-categories-client"
import { ExplorarMobileControls } from "./ExplorarMobileControls"
import { ExplorarHeaderSection } from "./ExplorarHeaderSection"
import { ExplorarViewControls } from "./ExplorarViewControls"
import { SmartSearchBadge, ProximityRingsSection } from "./SmartSearchSections"
import type { ParsedSearchIntent } from "@/lib/search/intent-parser"
import type { ProximityRingsResult } from "@/lib/search/proximity-rings"
import { ExploreContentSkeleton } from "./explorar-skeleton"
import { CATEGORY_SLUG_MAP, COMMON_CITY_ACCENTS, FALLBACK_CATEGORIES, ESTADO_MAP } from "./explorar-constants"
import type { SortOption } from "./explorar-constants"

// Code-splitting para os bottom sheets pesados (evita carregar Framer Motion e swipe hooks na carga inicial)
const ExplorarFiltersBottomSheet = dynamic(
    () => import("./ExplorarFiltersBottomSheet").then((mod) => mod.ExplorarFiltersBottomSheet),
    { ssr: false }
)

const ExplorarSortBottomSheet = dynamic(
    () => import("./ExplorarSortBottomSheet").then((mod) => mod.ExplorarSortBottomSheet),
    { ssr: false }
)
import {
    DELIVERY_OPTIONS,
    EMPTY_FILTER_STATE,
    LOJA_SEM_CATEGORIA,
    OUTROS_CATEGORY,
    getItemDistanceKm,
    getItemRating,
    isItemUncategorized,
    isPromoItem,
    itemMatchesCategory,
    matchesConditionFilter,
    matchesDeliveryFilter,
    matchesDistanceFilter,
    matchesPriceRange,
    matchesRatingFilter,
    matchesShippingFilter,
    mergeCategoryLists,
    parseFiltersFromParams,
    serializeFiltersToParams,
    type CategoryLists,
    type DeliveryFilter,
    type ExploreFilterState,
} from "./explorar-filters"
import { getFilterConfig, getSortOptionsForMode, type PageMode } from "./contextual-filters"
import { trackExplicitDemandAction } from "@/app/actions/admin/analytics"
import { trackEvent } from "@/lib/analytics"

// Navegação por grupo na página inicial de Explorar (modo "Tudo").
// Clica num grupo -> mostra as categorias daquele tipo no mesmo lugar.
const CATEGORY_GROUPS = [
    { name: "Produtos", groupType: "produtos", icon_url: "https://img.dudit.com.br/static/categories/products/Tecnologia-e-eletronicos.png" },
    { name: "Serviços", groupType: "servicos", icon_url: null },
    { name: "Lojas", groupType: "vitrines", icon_url: null },
]

/**
 * Extrai cidade e categoria do caminho vivo da URL (/explorar/[cidade]/[categoria]).
 *
 * O `useParams`/`usePathname` do App Router podem ficar defasados depois de um
 * pushState (eles refletem a árvore/RSC anterior). A URL do browser é sempre a
 * fonte mais atual, então a sincronia de estado usa ela como base.
 */
function getLocationPartsFromPath(pathname: string): { city: string | null; category: string | null } {
    const parts = (pathname || "").split("/").filter(Boolean)
    if (parts[0] !== "explorar") return { city: null, category: null }
    return {
        city: parts[1] || null,
        category: parts[2] || null,
    }
}

/** UF (estado) de um slug de cidade ("sao-paulo-sp" -> "sp") ou "brasil". */
function getStateFromCitySlug(citySlug: string | null | undefined): string {
    if (!citySlug || citySlug === "brasil") return "brasil"
    if (citySlug.startsWith("estado-")) return citySlug.replace("estado-", "").toLowerCase()
    const parts = citySlug.split("-")
    const uf = parts.pop()?.toLowerCase() || ""
    return uf.length === 2 ? uf : "brasil"
}

interface ExplorarPageClientProps {
    initialResults?: any[]
    initialMoreDistantSellers?: any[]
    initialMoreDistantItems?: any[]
    initialSearchIntent?: ParsedSearchIntent | null
    initialProximityRings?: ProximityRingsResult<any> | null
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
    communityVideos?: any[]
}

export function ExplorarPageClient({
    initialResults = [],
    initialMoreDistantSellers = [],
    initialMoreDistantItems = [],
    initialSearchIntent = null,
    initialProximityRings = null,
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
    communityVideos = [],
}: ExplorarPageClientProps & { hideHeaderAndFooter?: boolean }) {
    const activeAds = useMemo(() => {
        if (query && searchAds && searchAds.length > 0) return searchAds
        if (exploreAds && exploreAds.length > 0) return exploreAds
        return []
    }, [query, searchAds, exploreAds])

    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const params = useParams()
    const { requestLocation, loading: isLocationLoading } = useLocationRedirect()

    const slug = (params?.slug as string[]) || []
    const pathCity = slug[0] || ""

    const [cityAccentCache, setCityAccentCache] = useState<Record<string, string>>({})

    const formatCitySlug = useCallback((slug: string | null) => {
        if (!slug) return ""
        if (slug === "brasil") return "Brasil"
        if (slug.startsWith("estado-")) {
            const uf = slug.replace("estado-", "").toLowerCase()
            return ESTADO_MAP[uf] || uf.toUpperCase()
        }
        if (slug === cidade && resolvedCityName) {
            return resolvedCityName
        }
        if (cityAccentCache[slug]) {
            const state = slug.split("-").pop()?.toUpperCase() || ""
            return `${cityAccentCache[slug]} - ${state}`
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
    }, [cidade, resolvedCityName, cityAccentCache])

    const categoryToSlug = useCallback((name: string) => {
        return name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/ & /g, "-e-")
            .replace(/&/g, "e")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
    }, [])

    const pathCategorySlug = slug[1] || ""
    const pathCategory = pathCategorySlug ? (CATEGORY_SLUG_MAP[pathCategorySlug] || pathCategorySlug) : ""

    const [currentType, setCurrentType] = useState<any>(type)
    const [sortBy, setSortBy] = useState<SortOption>("relevancia")
    const [selectedCitySlug, setSelectedCitySlug] = useState<string | null>(cidade || pathCity || null)
    const [selectedSection, setSelectedSection] = useState<string | null>(() => {
        return initialSection || searchParams.get("section") || null
    })
    const [moreDistantSellers, setMoreDistantSellers] = useState<any[]>(initialMoreDistantSellers)
    const [moreDistantItems, setMoreDistantItems] = useState<any[]>(initialMoreDistantItems)
    const [searchIntent, setSearchIntent] = useState<ParsedSearchIntent | null>(initialSearchIntent)
    const [proximityRings, setProximityRings] = useState<ProximityRingsResult<any> | null>(initialProximityRings)

    const [dbCategories, setDbCategories] = useState<{ id?: string; name: string; icon_url: string | null }[]>([])
    const [dbServiceCategories, setDbServiceCategories] = useState<{ id?: string; name: string; icon_url: string | null }[]>([])
    const [dbPartnerCategories, setDbPartnerCategories] = useState<{ id?: string; name: string; icon_url: string | null }[]>([])

    const locationContext = useMemo<LocationContext | null>(() => {
        const currentCity = selectedCitySlug || pathCity || null
        if (!currentCity || currentCity === "brasil") {
            return { scope: "country" }
        }
        if (currentCity.startsWith("estado-")) {
            return { scope: "state", state: currentCity.replace("estado-", "").toUpperCase() }
        }
        if (isStateRoute && currentCity) {
            return { scope: "state", state: currentCity.replace(/^estado-/, "").toUpperCase() }
        }
        const state = currentCity.split("-").pop()?.toUpperCase() || null
        let city: string | null = null
        if (currentCity === cidade && resolvedCityName) {
            city = resolvedCityName.split(" - ")[0] || null
        }
        if (!city) {
            const parts = currentCity.split("-")
            parts.pop()
            const cityKey = parts.join("-")
            city = COMMON_CITY_ACCENTS[cityKey] || parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")
        }
        return { scope: "city", city, state }
    }, [selectedCitySlug, pathCity, cidade, resolvedCityName, isStateRoute])

    const userCoords = useMemo(() => {
        return userProfile?.latitude && userProfile?.longitude
            ? { lat: userProfile.latitude, lng: userProfile.longitude }
            : null
    }, [userProfile?.latitude, userProfile?.longitude])

    const resolveCategoryName = useCallback((value: string) => {
        const normalize = (s: string) => s
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/&/g, "e")
            .replace(/[-_]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        const normValue = normalize(value)
        const all = [...dbCategories, ...dbServiceCategories, ...dbPartnerCategories]
        const found = all.find(c => normalize(c.name) === normValue)
        return found?.name || value
    }, [dbCategories, dbServiceCategories, dbPartnerCategories])

    const categoriesLoadedRef = useRef(false)

    useEffect(() => {
        if (categoriesLoadedRef.current) return
        categoriesLoadedRef.current = true

        fetchAllMarketplaceCategoriesClient().then(({ products, services, partners }) => {
            if (products && products.length > 0) setDbCategories(products)
            if (services && services.length > 0) setDbServiceCategories(services)
            if (partners && partners.length > 0) setDbPartnerCategories(partners)
        })
    }, [])

    // Modal states
    const [isCityModalOpen, setIsCityModalOpen] = useState(false)
    const [showStateList, setShowStateList] = useState(false)
    const [showStateDropdown, setShowStateDropdown] = useState(false)
    const [selectedStateFilter, setSelectedStateFilter] = useState<string>(() => getStateFromCitySlug(cidade || pathCity || null))
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
    const stateDropdownRef = useRef<HTMLDivElement>(null)
    const [isFiltersBottomSheetOpen, setIsFiltersBottomSheetOpen] = useState(false)
    const [hasMountedFilters, setHasMountedFilters] = useState(false)
    const [isSortBottomSheetOpen, setIsSortBottomSheetOpen] = useState(false)
    const [hasMountedSort, setHasMountedSort] = useState(false)

    const handleOpenFilters = useCallback(() => {
        setHasMountedFilters(true)
        setIsFiltersBottomSheetOpen(true)
    }, [])

    const handleOpenSort = useCallback(() => {
        setHasMountedSort(true)
        setIsSortBottomSheetOpen(true)
    }, [])

    useEffect(() => {
        if (isFiltersBottomSheetOpen && !hasMountedFilters) setHasMountedFilters(true)
    }, [isFiltersBottomSheetOpen, hasMountedFilters])

    useEffect(() => {
        if (isSortBottomSheetOpen && !hasMountedSort) setHasMountedSort(true)
    }, [isSortBottomSheetOpen, hasMountedSort])

    // Demand modal states
    const [isDemandModalOpen, setIsDemandModalOpen] = useState(false)
    const [isDemandThankYouOpen, setIsDemandThankYouOpen] = useState(false)
    const [selectedDemandType, setSelectedDemandType] = useState<string>("comprar")
    const [demandTerm, setDemandTerm] = useState("")
    const [isSubmittingDemand, setIsSubmittingDemand] = useState(false)
    const isSubmittingDemandRef = useRef(false)

    // City search input
    const [citySearchText, setCitySearchText] = useState("")
    const [citiesData, setCitiesData] = useState<string[]>([])

    // Resolve city accents from DB when modal opens
    const cityAccentFetchDoneRef = useRef(false)
    useEffect(() => {
        if (!isCityModalOpen) return
        getCitiesData().then((cities) => {
            setCitiesData(cities)
            if (!cityAccentFetchDoneRef.current) {
                cityAccentFetchDoneRef.current = true
                resolveCityAccentBatch(cities.slice(0, 200)).then((resolved) => {
                    if (Object.keys(resolved).length > 0) {
                        setCityAccentCache((prev) => ({ ...prev, ...resolved }))
                    }
                }).catch(() => { })
            }
        }).catch(() => { })
    }, [isCityModalOpen])

    // Close state dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (stateDropdownRef.current && !stateDropdownRef.current.contains(e.target as Node)) {
                setShowStateDropdown(false)
            }
        }
        if (showStateDropdown) {
            document.addEventListener("mousedown", handleClickOutside)
            return () => document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [showStateDropdown])

    // Reset dropdown when modal closes
    useEffect(() => {
        if (!isCityModalOpen) {
            setShowStateDropdown(false)
        }
    }, [isCityModalOpen])

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
    const [selectedCondition, setSelectedCondition] = useState<string>("")
    const [onlyShipping, setOnlyShipping] = useState(false)
    const [minRating, setMinRating] = useState<number | null>(null)
    const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("")
    const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null)
    const [showcaseOnly, setShowcaseOnly] = useState(false)

    // Estado consolidado dos filtros (usado na URL, nos chips e na aplicação).
    const filterState: ExploreFilterState = useMemo(() => ({
        categories: selectedCategories,
        minPrice,
        maxPrice,
        promoOn,
        condition: selectedCondition,
        shipping: onlyShipping,
        minRating,
        delivery: deliveryFilter,
        maxDistanceKm,
        showcaseOnly,
    }), [selectedCategories, minPrice, maxPrice, promoOn, selectedCondition, onlyShipping, minRating, deliveryFilter, maxDistanceKm, showcaseOnly])

    const isFirstMountParamsRef = useRef(true)
    const prevParamsKeyRef = useRef("")

    const triggerFilterLoading = useCallback(() => {
        // Feedback de carregamento é 100% real: vem do react-query (isLoading/isFetching)
        // quando a query key muda. Um delay artificial aqui só adicionava latência
        // percebida (220-380ms de skeleton) e remontava a grade inteira a cada troca
        // de filtro - algo especialmente ruim em mobile/tablet.
    }, [])

    const observerTarget = useRef<HTMLDivElement>(null)
    const MAX_ITEMS = 300 // Memory cap
    const fetchFnMountedRef = useRef(false) // Dev-mode strict-mode guard

    const queryKeyString = `${query}:${currentType}:${selectedCitySlug}:${selectedSection}`
    useEffect(() => {
        fetchFnMountedRef.current = false
    }, [queryKeyString])

    // Reset moreDistant state when the search context changes (new query, city, type, section).
    // On client-side navigation the component doesn't remount, so useState initial values won't update.
    // This syncs the server-provided initialMoreDistant* props into state whenever the search key changes,
    // preventing stale "more distant" results from a previous search from persisting.
    const prevQueryKeyRef = useRef(queryKeyString)
    const lastTrackedSearchRef = useRef("")
    useEffect(() => {
        if (prevQueryKeyRef.current !== queryKeyString) {
            prevQueryKeyRef.current = queryKeyString
            setMoreDistantSellers(initialMoreDistantSellers)
            setMoreDistantItems(initialMoreDistantItems)
            setSearchIntent(initialSearchIntent)
            setProximityRings(initialProximityRings)
        }
    }, [queryKeyString, initialMoreDistantSellers, initialMoreDistantItems, initialSearchIntent, initialProximityRings])

    const isLandingPage = false

    const fetchType = currentType

    const updateUrl = (
        city: string | null,
        categories: string[],
        searchQ: string,
        typeStr: string,
        sectionVal?: string | null,
        overrides?: Partial<ExploreFilterState> & { sortBy?: SortOption }
    ) => {
        const queryParams = new URLSearchParams()
        if (searchQ) queryParams.set("q", searchQ)
        if (typeStr && typeStr !== "tudo") queryParams.set("type", typeStr)

        const sVal = sectionVal !== undefined ? sectionVal : selectedSection
        if (sVal) {
            queryParams.set("section", sVal)
        }

        // Filtros ativos vão para a URL: o link fica compartilhável e o botão
        // voltar do navegador volta ao estado anterior dos filtros.
        const filtersToPersist: ExploreFilterState = { ...filterState, ...(overrides ?? {}) }
        serializeFiltersToParams(filtersToPersist, queryParams)

        const sortToPersist = overrides?.sortBy ?? sortBy
        if (sortToPersist && sortToPersist !== "relevancia") queryParams.set("ord", sortToPersist)

        const queryStr = queryParams.toString()
        const queryPart = queryStr ? `?${queryStr}` : ""

        const catSlug = categories.length > 0 ? categoryToSlug(categories[0]) : ""

        let targetUrl = ""
        if (city && catSlug) {
            targetUrl = `/explorar/${city}/${catSlug}${queryPart}`
        } else if (city) {
            targetUrl = `/explorar/${city}${queryPart}`
        } else if (catSlug) {
            queryParams.set("categoria", catSlug)
            targetUrl = `/explorar?${queryParams.toString()}`
        } else {
            targetUrl = `/explorar${queryPart}`
        }

        if (typeof window !== "undefined") {
            const currentRel = `${window.location.pathname}${window.location.search}`
            if (targetUrl === currentRel) return

            // Trocar a LOCALIDADE troca o segmento da rota (/explorar/[cidade]).
            // Isso não pode ser feito com history.pushState: o App Router mantém
            // a árvore/RSC da rota anterior (params e props velhos), e a
            // sincronia de URL devolvia o componente para a cidade antiga
            // (a listagem "carregava" na cidade nova e voltava sozinho).
            // Para rota, usamos router.push, que re-renderiza o servidor
            // com a nova cidade (dados, title e canonical corretos).
            const cityChanged = (city || null) !== (selectedCitySlug || null)
            if (cityChanged) {
                router.push(targetUrl)
                return
            }

            // Mudança só de query string (filtros/ordenação): pushState evita
            // uma ida e volta ao servidor a cada clique.
            pushUrl(targetUrl)
        }
    }

    // Handles browser Back/Forward navigation syncing path params and searchParams back to component state
    const VALID_SORT_OPTIONS: SortOption[] = ["relevancia", "preco_menor", "preco_maior", "recentes", "avaliacao", "distancia"]

    // Aplica os filtros vindos da URL (compartilhamento de link / botão voltar).
    const applyFiltersFromUrl = useCallback((urlParams: URLSearchParams) => {
        const parsed = parseFiltersFromParams(urlParams)
        setMinPrice(parsed.minPrice)
        setMaxPrice(parsed.maxPrice)
        setPromoOn(parsed.promoOn)
        setSelectedCondition(parsed.condition)
        setOnlyShipping(parsed.shipping)
        setMinRating(parsed.minRating)
        setDeliveryFilter(parsed.delivery)
        setMaxDistanceKm(parsed.maxDistanceKm)
        setShowcaseOnly(parsed.showcaseOnly)

        const ord = urlParams.get("ord") as SortOption | null
        setSortBy(ord && VALID_SORT_OPTIONS.includes(ord) ? ord : "relevancia")
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        const urlType = searchParams.get("type") || "tudo"
        setCurrentType(urlType as any)

        // URL viva > params do router: os params podem estar defasados depois
        // de um pushState (o App Router mantém a árvore da rota anterior).
        const live = typeof window !== "undefined"
            ? getLocationPartsFromPath(window.location.pathname)
            : { city: null, category: null }

        const pathCity = live.city || slug[0] || null
        const urlCity = pathCity || searchParams.get("cidade") || null
        if (urlCity) {
            if (urlCity !== selectedCitySlug) {
                setSelectedCitySlug(urlCity)
            }
        } else if (cidade && cidade !== selectedCitySlug) {
            setSelectedCitySlug(cidade)
        }

        const urlSection = searchParams.get("section")
        setSelectedSection(urlSection || null)

        const pathCategorySlug = live.category || slug[1] || null
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

        applyFiltersFromUrl(new URLSearchParams(searchParams.toString()))

        const currentFilterKey = `${urlType}:${urlSection || ""}:${urlCity || ""}:${nextCats.join(",")}`
        if (isFirstMountParamsRef.current) {
            isFirstMountParamsRef.current = false
            prevParamsKeyRef.current = currentFilterKey
        } else if (prevParamsKeyRef.current !== currentFilterKey) {
            prevParamsKeyRef.current = currentFilterKey
            triggerFilterLoading()
        }
    }, [searchParams, params, triggerFilterLoading, applyFiltersFromUrl])

    // Popstate listener to guarantee 0ms responsive Back/Forward sync with window.history.pushState
    useEffect(() => {
        const onPopState = () => {
            if (typeof window === "undefined") return
            triggerFilterLoading()
            const url = new URL(window.location.href)
            const pathnameParts = url.pathname.replace(/^\/explorar\/?/, "").split("/").filter(Boolean)
            const pCity = pathnameParts[0] || null
            const pCatSlug = pathnameParts[1] || null
            const pCat = pCatSlug ? (CATEGORY_SLUG_MAP[pCatSlug] || pCatSlug) : null

            const typeParam = url.searchParams.get("type") || "tudo"
            const sectionParam = url.searchParams.get("section")
            const catParam = url.searchParams.get("categoria")

            setCurrentType(typeParam as any)
            setSelectedSection(sectionParam || null)
            if (pCity) setSelectedCitySlug(pCity)

            if (pCat) {
                setSelectedCategories([pCat])
            } else if (catParam) {
                setSelectedCategories(catParam.split(",").map(c => CATEGORY_SLUG_MAP[c.toLowerCase()] || c))
            } else {
                setSelectedCategories([])
            }

            applyFiltersFromUrl(url.searchParams)
        }

        window.addEventListener("popstate", onPopState)
        return () => window.removeEventListener("popstate", onPopState)
    }, [triggerFilterLoading, applyFiltersFromUrl])



    // Handle city synchronization from URL/cookies/localProfile on mount.
    // Apenas persiste o escopo resolvido pelo servidor (cidade do perfil/cookie).
    // NÃO redireciona mais: o redirect automático causava navegação dupla no
    // mesmo componente ("Rendered more hooks than during the previous render").
    const citySyncDoneRef = useRef(false)

    useEffect(() => {
        // Run only once on mount
        if (citySyncDoneRef.current) return
        citySyncDoneRef.current = true

        const pathCity = slug[0] || null
        const urlCity = pathCity || searchParams.get("cidade")
        const isLoggedIn = Boolean(userProfile)

        if (urlCity) {
            // Logged-in users: persist the URL city to cookie/localStorage
            // Logged-out users: only use the URL city for this session (don't persist)
            if (isLoggedIn) {
                document.cookie = `dudit_city=${urlCity}; path=/; max-age=${60 * 60 * 24 * 30}`
                localStorage.setItem("dudit_city", urlCity)
            }
            return
        }

        // 1. If logged in and no explicit browsing city cookie is set, seed from the user's saved address
        const hasExplicitCookie = /(?:^|; )dudit_city=([^;]+)/.test(document.cookie)
        if (!hasExplicitCookie && userProfile?.city && userProfile?.state) {
            const normCity = userProfile.city
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "")
            const userCitySlug = `${normCity}-${userProfile.state.toLowerCase()}`
            document.cookie = `dudit_city=${userCitySlug}; path=/; max-age=${60 * 60 * 24 * 30}`
            localStorage.setItem("dudit_city", userCitySlug)
            return
        }

        // 2. Fall back to cookie/localStorage for logged-out visitors (read-only, don't overwrite)
        // No action needed here - the cookie/localStorage already has the value from the server

        // 3. For logged-out users without a saved location, auto-locate ONLY if permission is already granted
        if (!isLoggedIn && typeof window !== "undefined" && navigator?.permissions) {
            navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
                if (result.state === "granted") {
                    requestLocation()
                }
            }).catch((err) => {
                console.error("Error querying geolocation permission:", err)
            })
        }
    }, [])

    const limitConfig = useMemo(() => {
        if (fetchType === "produtos") return { produtos: 40 } as const
        if (fetchType === "servicos") return { servicos: 40 } as const
        if (fetchType === "vitrines") return { vitrines: 40 } as const
        if (fetchType === "planos") return { planos: 40 } as const
        return { geral: 40 } as const
    }, [fetchType])

    // Query fetch
    const { items: rawItemsUncapped, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteList<
        any,
        MarketplaceListCursor
    >({
        queryKey: ["explore", query, fetchType, selectedCitySlug, selectedSection],
        initialPage: (() => {
            const match = ((fetchType === type && selectedCitySlug === cidade) ||
                (isLandingPage && type === 'tudo' && selectedCitySlug === cidade)) &&
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
            // Dev-mode strict-mode guard: skip second synchronous call
            if (fetchFnMountedRef.current) {
                return { items: [], nextCursor: null, hasMore: false }
            }
            fetchFnMountedRef.current = true

            const userCoords = userProfile?.latitude && userProfile?.longitude
                ? { lat: userProfile.latitude, lng: userProfile.longitude }
                : null

            const res = await searchMarketplace(query, fetchType as any, {
                ...limitConfig,
                cursor,
                cidade: selectedCitySlug || undefined,
                latitude: userCoords?.lat,
                longitude: userCoords?.lng,
                section: selectedSection || undefined,
            })


            if (!cursor) {
                setMoreDistantSellers(res.moreDistantSellers || [])
                setMoreDistantItems(res.moreDistantItems || [])
                setSearchIntent(res.searchIntent ?? null)
                setProximityRings(res.proximityRings ?? null)
            }

            return res
        },
        dedupeKey: (item) => String(item?.itemType || "") + ":" + String(item?.id || ""),
        staleTime: 30000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    })

    // Esqueleto apenas quando ainda não há dados da query atual (isPending && isFetching).
    // Usar `isFetching` aqui trocava a grade inteira por esqueleto em todo refetch de
    // fundo (reconexão/invalidação), causando um flash que é muito pior em mobile.
    const isContentLoading = isLoading

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
        const userId = userProfile?.userId || null

        const normalizeItemType = (item: any) => {
            const rawType = String(item?.itemType || "").toLowerCase()
            if (rawType === "loja" || rawType === "vitrine" || rawType === "vitrines" || rawType === "partner" || rawType === "parceiro") {
                return "loja"
            }
            if (rawType === "produto" || rawType === "product") return "produto"
            if (rawType === "servico" || rawType === "serviço" || rawType === "service") return "servico"
            if (rawType === "plano" || rawType === "plan" || rawType === "recorrente" || rawType === "recurring") return "plano"

            if (item?.store_name || item?.name) return "loja"
            return rawType
        }

        const normalized = rawItems.map((item: any) => {
            const itemType = normalizeItemType(item)
            if (itemType === "loja") {
                // Vitrine sem categoria cadastrada chega do servidor com o rótulo
                // "Loja Parceira" - limpamos para o card não mostrar uma
                // categoria falsa (e para o filtro "Outros" pegar a loja).
                const rawCategory = typeof item?.category === "string" ? item.category : null
                const hasCategory = !!rawCategory && rawCategory !== LOJA_SEM_CATEGORIA
                return {
                    ...item,
                    itemType,
                    category: hasCategory ? rawCategory : null,
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

        // Apply urgency badges (Destaque, Últimos X) to products
        return applyVendorUrgencyBadges(normalized, userId)
    }, [rawItems, userProfile?.userId])

    const productCategories = useMemo(
        () => (dbCategories.length > 0 ? dbCategories : FALLBACK_CATEGORIES),
        [dbCategories]
    )

    // Listas de categorias por tipo de item (usadas para saber se um item
    // tem categoria conhecida e, portanto, se entra ou não no filtro "Outros").
    const categoryLists: CategoryLists = useMemo(() => ({
        products: productCategories,
        services: dbServiceCategories,
        partners: dbPartnerCategories,
    }), [productCategories, dbServiceCategories, dbPartnerCategories])

    const isUncategorized = useCallback(
        (item: any) => isItemUncategorized(item, categoryLists),
        [categoryLists]
    )

    // A categoria selecionada também vale para as vitrines em destaque.
    const matchesSelectedCategory = useCallback((item: any) => {
        if (selectedCategories.length === 0) return true
        const activeCat = selectedCategories[0]
        if (activeCat === OUTROS_CATEGORY) return isUncategorized(item)
        return itemMatchesCategory(item, activeCat)
    }, [selectedCategories, isUncategorized])

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

        if (currentType === 'negocios') {
            const list = normalizedInitialResults.filter(r => r.itemType === 'loja')
            return { vitrinesDestaque: [], dataToFilter: list }
        }

        if (currentType === 'bem-avaliados') {
            const allItems = normalizedInitialResults.filter(r => r.itemType !== 'loja')
            const sortedItems = [...allItems]
                .sort((a, b) => (b.rating || 0) - (a.rating || 0))
                .slice(0, 20)
            return { vitrinesDestaque: [], dataToFilter: sortedItems }
        }

        if (currentType === 'em-oferta') {
            const list = normalizedInitialResults.filter(r => r.itemType !== 'loja' && r.originalPrice !== undefined && r.originalPrice > r.price)
            return { vitrinesDestaque: [], dataToFilter: list }
        }

        if (currentType === 'em-alta') {
            const allItems = normalizedInitialResults.filter(r => r.itemType !== 'loja')
            const sortedItems = [...allItems]
                .sort((a, b) => (b.sales_last_30_days || 0) - (a.sales_last_30_days || 0))
                .slice(0, 20)
            return { vitrinesDestaque: [], dataToFilter: sortedItems }
        }

        if (currentType === 'novos-anunciados') {
            const allItems = normalizedInitialResults.filter(r => r.itemType !== 'loja')
            const sortedItems = [...allItems]
                .sort((a, b) => {
                    const dateA = new Date(a.created_at || 0)
                    const dateB = new Date(b.created_at || 0)
                    return dateB.getTime() - dateA.getTime()
                })
                .slice(0, 20)
            return { vitrinesDestaque: [], dataToFilter: sortedItems }
        }

        if (currentType === 'tudo') {
            // As vitrines em destaque também respeitam a categoria selecionada
            // (inclusive "Outros", que mostra as lojas sem categoria).
            const vitrines = normalizedInitialResults
                .filter(r => r.itemType === 'loja')
                .filter(matchesSelectedCategory)
            const sortedVitrines = [...vitrines]
                .sort((a, b) => (b.rating || 0) - (a.rating || 0))
                .slice(0, 20)
            const list = normalizedInitialResults.filter(r => r.itemType !== 'loja')
            return { vitrinesDestaque: sortedVitrines, dataToFilter: list }
        }

        const list = normalizedInitialResults.filter(r => r.itemType !== 'loja')
        return { vitrinesDestaque: [], dataToFilter: list }
    }, [normalizedInitialResults, currentType, matchesSelectedCategory])

    // Categorias oferecidas no filtro. Em "Tudo" mostramos a união das três
    // listas (produtos + serviços + lojas), sem duplicar nomes.
    const filterCategoriesList = useMemo(() => {
        if (currentType === "servicos") return dbServiceCategories
        if (currentType === "vitrines" || currentType === "negocios") return dbPartnerCategories
        if (currentType === "produtos") return productCategories
        return mergeCategoryLists([productCategories, dbServiceCategories, dbPartnerCategories])
    }, [currentType, dbServiceCategories, dbPartnerCategories, productCategories])

    const activeCategoriesList = useMemo(() => {
        const all = [...filterCategoriesList]
        // As categorias vêm do banco via client-side fetch. Enquanto não
        // carregaram, não faz sentido oferecer "Outros" (a lista viria só com
        // ele e pareceria errada no primeiro paint).
        if (filterCategoriesList.length === 0) return all
        const hasOutros = dataToFilter.some(isUncategorized)
        if (hasOutros && !all.some(c => c.name === OUTROS_CATEGORY)) {
            all.push({ name: OUTROS_CATEGORY, icon_url: null })
        }
        return all
    }, [filterCategoriesList, dataToFilter, isUncategorized])

    const categoryCircles = useMemo(
        () => (currentType === "tudo" ? CATEGORY_GROUPS : activeCategoriesList),
        [currentType, activeCategoriesList]
    )

    // In-memory filters for advanced filters (aplicados às listas local e distante)
    const applyBrowseFilters = useCallback((source: any[], opts?: { preserveOrder?: boolean }) => {
        let filtered = [...source]
        if (selectedCategories.length > 0) {
            const activeCat = selectedCategories[0]
            if (activeCat === OUTROS_CATEGORY) {
                // "Outros" = tudo que está sem categoria (inclui vitrines sem
                // categoria cadastrada) + itens explicitamente em "Outros".
                filtered = filtered.filter(isUncategorized)
            } else {
                filtered = filtered.filter((p) => itemMatchesCategory(p, activeCat))
            }
        }

        // Preço: vitrines não têm preço próprio e itens "sob consulta" não são
        // descartados (antes eles sumiam da listagem inteira).
        const min = minPrice ? Number(minPrice) : null
        const max = maxPrice ? Number(maxPrice) : null
        if (min !== null || max !== null) {
            filtered = filtered.filter((p) => matchesPriceRange(p, min, max))
        }

        // Promoção: só produtos/serviços tem promoção - vitrines não são
        // eliminadas pelo filtro (antes a lista de lojas ficava vazia).
        if (promoOn) {
            filtered = filtered.filter((p) => p.itemType === 'loja' ? true : isPromoItem(p))
        }

        // Filtragem por Condição (Novos / Usados / Desapegos)
        if (selectedCondition) {
            filtered = filtered.filter((p) => matchesConditionFilter(p, selectedCondition))
        }

        // Filtragem por Envio nacional (transportadora)
        if (onlyShipping) {
            filtered = filtered.filter((p) => matchesShippingFilter(p))
        }

        // Avaliação mínima
        if (minRating) {
            filtered = filtered.filter((p) => matchesRatingFilter(p, minRating))
        }

        // Entrega (com entrega / somente retirada / entrega grátis)
        if (deliveryFilter) {
            filtered = filtered.filter((p) => matchesDeliveryFilter(p, deliveryFilter))
        }

        // Raio de distância
        if (maxDistanceKm) {
            filtered = filtered.filter((p) => matchesDistanceFilter(p, maxDistanceKm, userCoords))
        }

        // Vitrine online ativa
        if (showcaseOnly) {
            filtered = filtered.filter((p) => {
                if (p.itemType !== 'loja') return false
                return p.is_showcase_active !== false && p.partners?.is_showcase_active !== false
            })
        }

        // Filtragem por Seção
        if (selectedSection) {
            if (selectedSection === "promos") {
                filtered = filtered.filter(p => p.itemType === 'produto' && isPromoItem(p))
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
        } else if (sortBy === "avaliacao") {
            filtered.sort((a, b) => getItemRating(b) - getItemRating(a))
        } else if (sortBy === "distancia") {
            filtered.sort((a, b) => {
                const da = getItemDistanceKm(a, userCoords) ?? Number.POSITIVE_INFINITY
                const db = getItemDistanceKm(b, userCoords) ?? Number.POSITIVE_INFINITY
                return da - db
            })
        } else if (opts?.preserveOrder) {
            // Mantém a ordem já definida pelo ranking/distance do servidor (ex.: itens distantes)
            return filtered
        } else {
            return applySellerDiversity(
                [...filtered].sort((a, b) => calcCategoryBrowseScore(b) - calcCategoryBrowseScore(a)),
            )
        }
        return filtered
    }, [selectedCategories, minPrice, maxPrice, promoOn, selectedCondition, onlyShipping, minRating, deliveryFilter, maxDistanceKm, showcaseOnly, sortBy, selectedSection, isUncategorized, userCoords])

    const filteredResults = useMemo(
        () => applyBrowseFilters(dataToFilter),
        [applyBrowseFilters, dataToFilter]
    )

    // Funnel event: capture each distinct search context once, after the
    // current query finished loading so results_count is accurate. The raw term
    // is intentionally not sent; only its length keeps the event PII-free.
    useEffect(() => {
        if (isLoading) return
        const term = query.trim()
        if (!term) return
        const searchKey = `${term}:${currentType}:${selectedCitySlug}`
        if (lastTrackedSearchRef.current === searchKey) return
        lastTrackedSearchRef.current = searchKey
        trackEvent("search_performed", {
            term_length: term.length,
            results_count: rawItems.length,
            type: currentType,
            city: selectedCitySlug,
        })
    }, [query, currentType, selectedCitySlug, rawItems.length, isLoading])

    // Apply urgency badges to more distant items
    const moreDistantItemsWithBadges = useMemo(() => {
        return applyVendorUrgencyBadges(moreDistantItems, userProfile?.userId || null)
    }, [moreDistantItems, userProfile?.userId])

    // Itens distantes: listados direto na página, respondendo aos mesmos filtros/ordenação.
    // A ordem de relevância (texto + marketplace_score + distância) vem do servidor e é preservada.
    const filteredDistant = useMemo(() => {
        if (!query || moreDistantItemsWithBadges.length === 0) return []
        const typeFiltered = moreDistantItemsWithBadges.filter((item: any) => {
            if (currentType === "produtos") return item.itemType === "produto"
            if (currentType === "servicos") return item.itemType === "servico"
            if (currentType === "vitrines" || currentType === "negocios") return item.itemType === "loja"
            if (currentType === "planos") return item.itemType === "plano"
            return true
        })
        return applyBrowseFilters(typeFiltered, { preserveOrder: true })
    }, [query, moreDistantItemsWithBadges, currentType, applyBrowseFilters])

    const activeFiltersCount = useMemo(() => {
        let count = 0
        if (selectedCategories.length > 0) count++
        if (minPrice || maxPrice) count++
        if (promoOn) count++
        if (selectedCondition) count++
        if (onlyShipping) count++
        if (minRating) count++
        if (deliveryFilter) count++
        if (maxDistanceKm) count++
        if (showcaseOnly) count++
        if (sortBy !== "relevancia") count++
        if (currentType !== "tudo") count++
        return count
    }, [selectedCategories, minPrice, maxPrice, promoOn, selectedCondition, onlyShipping, minRating, deliveryFilter, maxDistanceKm, showcaseOnly, sortBy, currentType])

    const pageMode = useMemo((): PageMode => {
        if (query || (currentType !== 'tudo' && currentType !== 'em-alta' && currentType !== 'novos-anunciados')) return "search"
        if (selectedSection) return "section-detail"
        if (selectedCategories.length > 0) return "category"
        return "sections"
    }, [query, currentType, selectedSection, selectedCategories])

    const filterConfig = useMemo(() => {
        return getFilterConfig(selectedSection, pageMode, currentType)
    }, [selectedSection, pageMode, currentType])

    const contextualSortOptions = useMemo(() => {
        return getSortOptionsForMode(pageMode, selectedSection, currentType)
    }, [pageMode, selectedSection, currentType])

    const isCategoryMode = pageMode === "category" && selectedCategories.length === 1
    const categoryName = isCategoryMode ? selectedCategories[0] : null

    const subcategoriesList = useMemo(() => {
        if (!isCategoryMode || !categoryName) return []
        const normalize = (s: string) => s
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/&/g, "e")
            .replace(/[-_]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        const normCategory = normalize(categoryName)
        const subs = new Set<string>()
        dataToFilter.forEach(item => {
            if (matchesSelectedCategory(item) && item.subcategoryName) {
                if (normalize(item.subcategoryName) !== normCategory) {
                    subs.add(item.subcategoryName)
                }
            }
        })
        return [...subs].sort()
    }, [isCategoryMode, categoryName, dataToFilter, matchesSelectedCategory])

    const categoryPromos = useMemo(() => {
        if (!isCategoryMode) return []
        return dataToFilter
            .filter(item => matchesSelectedCategory(item) && isPromoItem(item))
            .slice(0, 20)
    }, [isCategoryMode, dataToFilter, matchesSelectedCategory])

    const categoryTopRated = useMemo(() => {
        if (!isCategoryMode) return []
        return dataToFilter
            .filter(item => matchesSelectedCategory(item) && (item.rating ?? 0) > 0)
            .sort((a, b) => (b.rating || 0) - (a.rating || 0))
            .slice(0, 20)
    }, [isCategoryMode, dataToFilter, matchesSelectedCategory])

    const categoryStores = useMemo(() => {
        if (!isCategoryMode) return []
        return normalizedInitialResults
            .filter(r => r.itemType === 'loja' && matchesSelectedCategory(r))
            .slice(0, 20)
    }, [isCategoryMode, matchesSelectedCategory, normalizedInitialResults])

    const showCategoryDiscoverySections = isCategoryMode && (subcategoriesList.length > 0 || categoryPromos.length > 0 || categoryTopRated.length > 0 || categoryStores.length > 0)

    const toggleCategory = (catName: string) => {
        triggerFilterLoading()
        // Calcula fora do updater: updateUrl pode disparar navegação
        // (router.push) e chamar isso dentro do updater rodaria a navegação
        // durante o render do React.
        const next = selectedCategories.includes(catName) ? [] : [catName]
        setSelectedCategories(next)
        updateUrl(selectedCitySlug, next, query, currentType)
    }

    const handleSelectCity = (citySlug: string | null) => {
        triggerFilterLoading()
        if (citySlug) {
            document.cookie = `dudit_city=${citySlug}; path=/; max-age=${60 * 60 * 24 * 30}`
            try {
                localStorage.setItem("dudit_city", citySlug)
            } catch { }
        } else {
            document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
            try {
                localStorage.removeItem("dudit_city")
            } catch { }
        }
        setSelectedCitySlug(citySlug)
        setCitySearchText("")
        // O seletor de estado do modal acompanha a localidade atual
        setSelectedStateFilter(getStateFromCitySlug(citySlug))
        updateUrl(citySlug, selectedCategories, query, currentType, selectedSection)
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
                // Filter by selected state if not "brasil"
                if (selectedStateFilter !== "brasil") {
                    const cityState = slug.split("-").pop()?.toLowerCase()
                    if (cityState !== selectedStateFilter) return false
                }
                const norm = slug
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[-\s]+/g, " ")
                return norm.includes(q)
            })
            .slice(0, 5)
    }, [citySearchText, citiesData, selectedStateFilter])

    const pageTitle = useMemo(() => {
        const citySuffix = selectedCitySlug
            ? (selectedCitySlug === "brasil"
                ? " no Brasil"
                : selectedCitySlug.startsWith("estado-")
                    ? ` no estado de ${formatCitySlug(selectedCitySlug)}`
                    : ` em ${formatCitySlug(selectedCitySlug)}`)
            : ""
        if (query) {
            const stateIsSynced = currentType === type && selectedCitySlug === cidade
            const hasLocalResults = stateIsSynced && rawItems.length > 0
            return `Resultados para "${query}"${hasLocalResults ? citySuffix : ""}`
        }
        if (selectedSection) {
            if (selectedSection === "promos") return `Itens em promoção${citySuffix}`
            if (selectedSection === "best-rated") return `Melhor avaliados${citySuffix}`
            if (selectedSection === "best-sellers") return `Mais vendidos${citySuffix}`
        }
        if (selectedCategories.length > 0) return `${resolveCategoryName(selectedCategories[0])}${citySuffix}`
        if (currentType === "produtos") return `Produtos${citySuffix}`
        if (currentType === "servicos") return `Serviços${citySuffix}`
        if (currentType === "planos") return `Assinaturas e Planos${citySuffix}`
        if (currentType === "vitrines") return `Lojas e Vitrines${citySuffix}`
        if (currentType === "negocios") return `Negócios${citySuffix}`
        if (currentType === "bem-avaliados") return `Bem avaliados${citySuffix}`
        if (currentType === "em-oferta") return `Em oferta${citySuffix}`
        if (currentType === "em-alta") return `Em alta${citySuffix}`
        if (currentType === "novos-anunciados") return `Novos anunciados${citySuffix}`
        return `Itens${citySuffix}`
    }, [query, currentType, selectedCategories, selectedCitySlug, selectedSection, resolveCategoryName, rawItems.length, type, cidade])

    useEffect(() => {
        document.title = `${pageTitle} | Dudit`
    }, [pageTitle])

    const emptySubtitle = useMemo(() => {
        const cityNameOnly = selectedCitySlug
            ? formatCitySlug(selectedCitySlug).split(" - ")[0]
            : ""

        const term =
            query || (selectedCategories.length > 0 ? selectedCategories[0] : "")

        if (term) {
            return (
                <>
                    Ainda não encontramos resultados para{" "}
                    <strong className="text-brand-dark dark:text-dark-heading">"{term}"</strong> em{" "}
                    <strong className="text-brand-dark dark:text-dark-heading">{cityNameOnly}</strong>.
                    Conhece alguém que vende? Convide pra Dudit!
                </>
            )
        }

        if (currentType === "produtos") {
            return (
                <>
                    Nenhum produto cadastrado em{" "}
                    <strong className="text-brand-dark dark:text-dark-heading">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a vender aqui - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "servicos") {
            return (
                <>
                    Nenhum serviço cadastrado em{" "}
                    <strong className="text-brand-dark dark:text-dark-heading">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a oferecer seus serviços - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "planos") {
            return (
                <>
                    Nenhum plano recorrente cadastrado em{" "}
                    <strong className="text-brand-dark dark:text-dark-heading">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a oferecer assinaturas - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "vitrines") {
            return (
                <>
                    Nenhuma loja cadastrada em{" "}
                    <strong className="text-brand-dark dark:text-dark-heading">{cityNameOnly}</strong> ainda.
                    Crie sua vitrine - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "negocios") {
            return (
                <>
                    Nenhum negócio cadastrado em{" "}
                    <strong className="text-brand-dark dark:text-dark-heading">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a vender aqui - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "bem-avaliados") {
            return (
                <>
                    Nenhum item bem avaliado cadastrado em{" "}
                    <strong className="text-brand-dark dark:text-dark-heading">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a vender aqui - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "em-oferta") {
            return (
                <>
                    Nenhum item em oferta cadastrado em{" "}
                    <strong className="text-brand-dark dark:text-dark-heading">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a vender aqui - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "em-alta") {
            return (
                <>
                    Nenhum item em alta cadastrado em{" "}
                    <strong className="text-brand-dark dark:text-dark-heading">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a vender aqui - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "novos-anunciados") {
            return (
                <>
                    Nenhum item novo cadastrado em{" "}
                    <strong className="text-brand-dark dark:text-dark-heading">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a vender aqui - é gratuito e sem comissão!
                </>
            )
        }

        return (
            <>
                Nenhum vendedor cadastrado em{" "}
                <strong className="text-brand-dark dark:text-dark-heading">{cityNameOnly}</strong> ainda.
                Seja o primeiro ou convide quem você conhece!
            </>
        )
    }, [currentType, selectedCitySlug, query, selectedCategories])


    const handleInvite = useCallback(() => {
        const cityNameOnly = selectedCitySlug ? formatCitySlug(selectedCitySlug).split(" - ")[0] : ""
        const term = query || (selectedCategories.length > 0 ? selectedCategories[0] : "") || "produtos e serviços"
        const text = `Oi! Procurei por "${term}" na Dudit em ${cityNameOnly} e ainda não encontrei vendedores. Que tal começar a vender na Dudit? É 100% gratuito e sem taxas: https://dudit.com.br/auth/login?mode=partner`
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
        window.open(url, "_blank")
    }, [selectedCitySlug, query, selectedCategories])

    const handleOpenDemandModal = useCallback(() => {
        const defaultTerm = query || (selectedCategories.length > 0 ? selectedCategories[0] : "")
        setDemandTerm(defaultTerm)
        if (currentType === "servicos") {
            setSelectedDemandType("contratar")
        } else if (currentType === "vitrines" || currentType === "negocios") {
            setSelectedDemandType("loja")
        } else {
            setSelectedDemandType("comprar")
        }
        setIsDemandModalOpen(true)
    }, [query, selectedCategories, currentType])

    const handleSubmitDemand = useCallback(async () => {
        const term = demandTerm.trim()
        if (!term || isSubmittingDemandRef.current) return

        isSubmittingDemandRef.current = true
        setIsSubmittingDemand(true)
        const demandTypeLabels: Record<string, string> = {
            comprar: "Quero comprar",
            contratar: "Quero contratar",
            loja: "Quero encontrar loja",
            encontrar: "Quero encontrar loja",
        }

        try {
            await trackExplicitDemandAction(
                demandTypeLabels[selectedDemandType] || "Quero comprar",
                term,
                selectedCitySlug || undefined
            )
            trackEvent("search_zero_results", {
                term,
                demand_type: demandTypeLabels[selectedDemandType] || "Quero comprar",
                city: selectedCitySlug,
            })
            setDemandTerm("")
            setIsDemandModalOpen(false)
            setIsDemandThankYouOpen(true)
        } catch (err) {
            console.error("[DEMAND_SUBMIT] Erro ao enviar demanda:", err)
        } finally {
            setIsSubmittingDemand(false)
            setTimeout(() => {
                isSubmittingDemandRef.current = false
            }, 800)
        }
    }, [demandTerm, selectedDemandType, selectedCitySlug])

    /**
     * Aplica um patch nos filtros (usado pelos chips de filtro ativo e pelo
     * botão de ordenação) mantendo a URL sincronizada - assim o link
     * compartilhado e o botão "voltar" refletem o que está na tela.
     */
    const patchFilters = (patch: Partial<ExploreFilterState> & { sortBy?: SortOption }) => {
        const changedFilters = Object.keys(patch)
        if (changedFilters.length > 0) {
            trackEvent("filter_applied", {
                filters: changedFilters,
                type: currentType,
                city: selectedCitySlug,
            })
        }
        triggerFilterLoading()
        if (patch.categories) setSelectedCategories(patch.categories)
        if ("minPrice" in patch) setMinPrice(patch.minPrice as number | string)
        if ("maxPrice" in patch) setMaxPrice(patch.maxPrice as number | string)
        if ("promoOn" in patch) setPromoOn(patch.promoOn === true)
        if ("condition" in patch) setSelectedCondition(patch.condition || "")
        if ("shipping" in patch) setOnlyShipping(patch.shipping === true)
        if ("minRating" in patch) setMinRating(patch.minRating ?? null)
        if ("delivery" in patch) setDeliveryFilter(patch.delivery || "")
        if ("maxDistanceKm" in patch) setMaxDistanceKm(patch.maxDistanceKm ?? null)
        if ("showcaseOnly" in patch) setShowcaseOnly(patch.showcaseOnly === true)
        if (patch.sortBy) setSortBy(patch.sortBy)
        updateUrl(selectedCitySlug, patch.categories ?? selectedCategories, query, currentType, selectedSection, patch)
    }

    const clearFilters = () => {
        triggerFilterLoading()
        setSelectedCategories([])
        setMinPrice("")
        setMaxPrice("")
        setPromoOn(false)
        setSelectedCondition("")
        setOnlyShipping(false)
        setMinRating(null)
        setDeliveryFilter("")
        setMaxDistanceKm(null)
        setShowcaseOnly(false)
        setSortBy("relevancia")
        setCurrentType("tudo")
        updateUrl(selectedCitySlug, [], query, "tudo", selectedSection, { ...EMPTY_FILTER_STATE, sortBy: "relevancia" })
    }

    const applyFilters = (filters: {
        type: string
        categories: string[]
        minPrice: string | number
        maxPrice: string | number
        promoOn: boolean
        condition?: string
        shipping?: boolean
        minRating?: number | null
        delivery?: DeliveryFilter
        maxDistanceKm?: number | null
        showcaseOnly?: boolean
    }) => {
        triggerFilterLoading()
        setCurrentType(filters.type as any)
        setSelectedCategories(filters.categories)
        setMinPrice(filters.minPrice)
        setMaxPrice(filters.maxPrice)
        setPromoOn(filters.promoOn)
        setSelectedCondition(filters.condition || "")
        setOnlyShipping(filters.shipping === true)
        setMinRating(filters.minRating ?? null)
        setDeliveryFilter(filters.delivery || "")
        setMaxDistanceKm(filters.maxDistanceKm ?? null)
        setShowcaseOnly(filters.showcaseOnly === true)
        updateUrl(selectedCitySlug, filters.categories, query, filters.type, selectedSection, {
            categories: filters.categories,
            minPrice: filters.minPrice,
            maxPrice: filters.maxPrice,
            promoOn: filters.promoOn,
            condition: filters.condition || "",
            shipping: filters.shipping === true,
            minRating: filters.minRating ?? null,
            delivery: filters.delivery || "",
            maxDistanceKm: filters.maxDistanceKm ?? null,
            showcaseOnly: filters.showcaseOnly === true,
        })
    }

    const typeOptions = [
        { value: "tudo", label: "Tudo" },
        { value: "produtos", label: "Produtos" },
        { value: "servicos", label: "Serviços" },
        { value: "vitrines", label: "Lojas" },
        { value: "planos", label: "Assinaturas" },
    ]

    const activeFilterChips = useMemo(() => {
        const chips: { key: string; label: string; value: string; onRemove: () => void }[] = []

        // Cidade como chip de filtro: substitui a badge solta que ficava no header,
        // aparecendo exatamente como os demais chips de filtro ativo na barra de filtros.
        // O X abre o seletor de cidade para trocar/remover a localização.
        if (selectedCitySlug) {
            const cityValue = formatCitySlug(selectedCitySlug)
            if (cityValue) {
                chips.push({
                    key: "cidade",
                    label: "Localidade",
                    value: cityValue,
                    onRemove: () => setIsCityModalOpen(true),
                })
            }
        }

        if (selectedCategories.length > 0) {
            chips.push({
                key: "category",
                label: "Categoria",
                value: resolveCategoryName(selectedCategories[0]),
                onRemove: () => {
                    triggerFilterLoading()
                    toggleCategory(selectedCategories[0])
                },
            })
        }
        if (minPrice || maxPrice) {
            let value = ""
            if (minPrice && maxPrice) value = `${formatCurrency(Number(minPrice))} - ${formatCurrency(Number(maxPrice))}`
            else if (minPrice) value = `> ${formatCurrency(Number(minPrice))}`
            else value = `< ${formatCurrency(Number(maxPrice))}`
            chips.push({
                key: "price",
                label: "Preço",
                value,
                onRemove: () => patchFilters({ minPrice: "", maxPrice: "" }),
            })
        }
        if (promoOn) {
            chips.push({
                key: "promo",
                label: "Promoção",
                value: "Ativo",
                onRemove: () => patchFilters({ promoOn: false }),
            })
        }
        if (selectedCondition) {
            chips.push({
                key: "condition",
                label: "Condição",
                value: selectedCondition === "novo" ? "Apenas Novos" : "Usados / Desapegos",
                onRemove: () => patchFilters({ condition: "" }),
            })
        }
        if (onlyShipping) {
            chips.push({
                key: "shipping",
                label: "Envio nacional",
                value: "Ativo",
                onRemove: () => patchFilters({ shipping: false }),
            })
        }
        if (minRating) {
            chips.push({
                key: "rating",
                label: "Avaliação",
                value: `${String(minRating).replace(".", ",")}+`,
                onRemove: () => patchFilters({ minRating: null }),
            })
        }
        if (deliveryFilter) {
            const deliveryLabel = DELIVERY_OPTIONS.find(o => o.value === deliveryFilter)?.label || deliveryFilter
            chips.push({
                key: "delivery",
                label: "Entrega",
                value: deliveryLabel,
                onRemove: () => patchFilters({ delivery: "" }),
            })
        }
        if (maxDistanceKm) {
            chips.push({
                key: "distance",
                label: "Distância",
                value: `Até ${maxDistanceKm} km`,
                onRemove: () => patchFilters({ maxDistanceKm: null }),
            })
        }
        if (showcaseOnly) {
            chips.push({
                key: "showcase",
                label: "Vitrine",
                value: "Online ativa",
                onRemove: () => patchFilters({ showcaseOnly: false }),
            })
        }
        if (sortBy !== "relevancia") {
            const sortLabel = contextualSortOptions.find(o => o.value === sortBy)?.label || sortBy
            chips.push({
                key: "sort",
                label: "Ordenar",
                value: sortLabel,
                onRemove: () => patchFilters({ sortBy: "relevancia" }),
            })
        }
        if (currentType !== "tudo") {
            const typeLabel = typeOptions.find(o => o.value === currentType)?.label || currentType
            chips.push({
                key: "type",
                label: "Tipo",
                value: typeLabel,
                onRemove: () => {
                    triggerFilterLoading()
                    setCurrentType("tudo")
                    updateUrl(selectedCitySlug, selectedCategories, query, "tudo")
                },
            })
        }
        return chips
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCategories, minPrice, maxPrice, promoOn, selectedCondition, onlyShipping, minRating, deliveryFilter, maxDistanceKm, showcaseOnly, sortBy, currentType, selectedCitySlug, selectedSection, query, resolveCategoryName, triggerFilterLoading, contextualSortOptions, formatCitySlug])

    const getItemUrl = (item: any) => {
        if (item.itemType === "loja") return getStoreUrl(item.partners || item)
        if (item.itemType === "plano") return getPlanUrl(item, item.partners)
        if (item.itemType === "servico") return getServiceUrl(item, item.partners)
        return getProductUrl(item, item.partners)
    }

    useEffect(() => {
        if (!contextualSortOptions.some(o => o.value === sortBy)) {
            setSortBy("relevancia")
        }
    }, [contextualSortOptions, sortBy])

    const renderListingItem = (item: any, priority = false) => {
        if (item.itemType === 'loja') {
            return <VitrineCard key={`loja-${item.id}`} vitrine={item} userCoords={userCoords} hideCity={!!selectedCitySlug} locationContext={locationContext} priority={priority} className="w-full [content-visibility:auto] [contain-intrinsic-size:auto_360px]" />
        }
        return <ItemCard key={`${item.itemType}-${item.id}`} product={item as any} userCoords={userCoords} locationContext={locationContext} priority={priority} className="w-full [content-visibility:auto] [contain-intrinsic-size:auto_360px]" />
    }

    const renderDistantItem = (item: any) => {
        if (item.itemType === 'loja') {
            return <VitrineCard key={`loja-dist-${item.id}`} vitrine={item} userCoords={userCoords} hideCity={false} preferCityLabel locationOnly locationContext={locationContext} className="w-full [content-visibility:auto] [contain-intrinsic-size:auto_360px]" />
        }
        return <ItemCard key={`dist-${item.itemType}-${item.id}`} product={item as any} userCoords={userCoords} locationContext={locationContext} preferCityLabel locationOnly className="w-full [content-visibility:auto] [contain-intrinsic-size:auto_360px]" />
    }

    // Renders the category discovery sections
    const renderCategoryDiscoverSections = () => {
        if (!showCategoryDiscoverySections) return null
        return (
            <div className="mb-6 lg:mb-8 space-y-6 lg:space-y-10">
                {subcategoriesList.length > 0 && (
                    <div className="w-full">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading">Subcategorias</h2>
                        </div>
                        <div className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-2">
                            {subcategoriesList.map((sub) => (
                                <button
                                    key={sub}
                                    onClick={() => {/* would filter by subcategory */ }}
                                    className="shrink-0 px-4 py-2 rounded-full border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-sm font-bold text-brand-dark dark:text-dark-heading hover:border-brand-green hover:bg-green-50 transition-colors whitespace-nowrap"
                                >
                                    {sub}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {categoryPromos.length >= 2 && (
                    <HorizontalCarousel
                        title="🎯 Em promoção"
                        subtitle={`Ofertas especiais em ${categoryName}`}
                        items={categoryPromos}
                        renderItem={(item: any) => <ItemCard product={item} userCoords={userCoords} locationContext={locationContext} className="w-full" />}
                        itemWidthClass="w-[150px] md:w-[230px]"
                    />
                )}
                {categoryTopRated.length >= 2 && (
                    <HorizontalCarousel
                        title="⭐ Melhor avaliados"
                        subtitle={`Os favoritos em ${categoryName}`}
                        items={categoryTopRated}
                        renderItem={(item: any) => <ItemCard product={item} userCoords={userCoords} locationContext={locationContext} className="w-full" />}
                        itemWidthClass="w-[150px] md:w-[230px]"
                    />
                )}
                {categoryStores.length >= 2 && (
                    <HorizontalCarousel
                        title="🏪 Lojas que vendem"
                        subtitle={`Vendedores de ${categoryName}`}
                        items={categoryStores}
                        renderItem={(item: any) => <VitrineCard vitrine={item} userCoords={userCoords} hideCity={!!selectedCitySlug} locationContext={locationContext} className="w-full" />}
                        itemWidthClass="w-[150px] md:w-[230px]"
                    />
                )}
            </div>
        )
    }

    const showExploreSections = pageMode === "sections" && !selectedSection

    // Lojas/vitrines exibidas em destaque ou no carrossel de busca (em "tudo",
    // elas são separadas de `dataToFilter`, então não entram em `filteredResults`).
    const displayedVitrinesCount =
        currentType === "tudo" && (!!query || showExploreSections)
            ? vitrinesDestaque.length
            : 0

    const totalResultsCount = filteredResults.length + displayedVitrinesCount

    // Estado "sem nenhum resultado" da listagem local.
    // NÃO usar `moreDistantItems`/`moreDistantSellers` aqui: o servidor busca esses
    // itens numa query "distante" separada sempre que há busca por cidade, então eles
    // existem mesmo com 0 resultados locais e fariam a condição nunca ser verdadeira
    // (mantendo título, contador, filtros e badge de localidade na tela).
    const isEmptyListing = useMemo(() => {
        if (isContentLoading) return false
        if (isCategoryMode) return false
        return rawItems.length === 0 && filteredResults.length === 0
    }, [isContentLoading, isCategoryMode, rawItems.length, filteredResults.length])

    // ─── Themed rotating sections (desativadas temporariamente no lançamento) ───
    const themedSections: any[] = []

    const showCommunityVideos = communityVideos.length > 0

    const selectGroupNav = (groupType: string) => {
        triggerFilterLoading()
        setSelectedCategories([])
        setSelectedSection(null)
        setCurrentType(groupType)
        setSelectedCondition("")
        updateUrl(selectedCitySlug, [], query, groupType, null)
    }

    const selectGroupCategory = (groupType: string, catName: string) => {
        triggerFilterLoading()
        if (currentType !== groupType) {
            setCurrentType(groupType)
            setSelectedCondition("")
        }
        setSelectedCategories([catName])
        updateUrl(selectedCitySlug, [catName], query, groupType)
    }

    const handleCategoryCircleClick = (cat: { name: string; icon_url: string | null; groupType?: string }) => {
        if (cat.groupType) selectGroupNav(cat.groupType)
        else selectGroupCategory(currentType, cat.name)
    }

    return (
        <>
            {!hideHeaderAndFooter && <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />}
            <div className="min-h-screen bg-white dark:bg-dark-background font-sans animate-fade-in flex flex-col">
                <style>{`
                    .scrollbar-none::-webkit-scrollbar { display: none; }
                    .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                `}</style>

                {/* MOBILE CONTROLS (Sticky bar with Filters & Sort buttons) */}
                {rawItems.length > 0 && (
                    <ExplorarMobileControls
                        activeFiltersCount={activeFiltersCount}
                        onOpenFilters={handleOpenFilters}
                        onOpenSort={handleOpenSort}
                    />
                )}

                {/* Always reserve space for sticky mobile controls */}
                {rawItems.length > 0 && <div className="lg:hidden h-[46px]" />}

                {/* MAIN CONTENT */}
                <div className="container mx-auto max-w-[1400px] flex-grow pb-28 lg:pb-12 lg:mt-8 px-4">
                    {/* CATEGORIAS EM CÍRCULOS (type-aware) - Hide when completely empty */}
                    {!query && categoryCircles.length > 0 && !isLandingPage && !isCategoryMode && !isEmptyListing && (
                        <div className="mb-6 lg:mb-8">
                            <h2 className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-6">Categorias</h2>
                            <div className="flex gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {categoryCircles.map((cat) => (
                                    <button
                                        key={cat.name}
                                        onClick={() => handleCategoryCircleClick(cat)}
                                        className="snap-start shrink-0 flex flex-col items-center gap-2 group w-[85px]"
                                    >
                                        <div className="w-[68px] h-[68px] rounded-full bg-brand-gray dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border flex items-center justify-center overflow-hidden group-hover:border-brand-green group-hover:shadow-md transition-all duration-200">
                                            {cat.icon_url ? (
                                                <img src={cat.icon_url} alt={cat.name} className="w-9 h-9 object-contain" />
                                            ) : (
                                                <span className="text-2xl">📦</span>
                                            )}
                                        </div>
                                        <span className="text-[11px] font-bold text-center leading-tight text-brand-dark dark:text-dark-heading line-clamp-2">{cat.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ─── SECTIONS MODE: Discover sections on top ─── */}
                    {showExploreSections && !isEmptyListing && (
                        <div className="mb-6 lg:mb-8 space-y-6 lg:space-y-10">
                            {/* 3. VÍDEOS DA COMUNIDADE */}
                            {showCommunityVideos && (
                                <CommunityVideosCarousel
                                    videos={communityVideos}
                                    title="Vídeos da comunidade"
                                />
                            )}

                            {/* 4. VENDEDORES EM DESTAQUE */}
                            {vitrinesDestaque.length > 0 && (
                                <HorizontalCarousel
                                    title="Vendedores em destaque"
                                    items={vitrinesDestaque}
                                    renderItem={(vitrine) => (
                                        <VitrineCard key={vitrine.id} vitrine={vitrine} userCoords={userCoords} hideCity={!!selectedCitySlug} locationContext={locationContext} className="w-full" />
                                    )}
                                    onSeeAll={() => {
                                        triggerFilterLoading()
                                        setCurrentType("vitrines")
                                        updateUrl(selectedCitySlug, selectedCategories, query, "vitrines")
                                    }}
                                    itemWidthClass="w-[270px] sm:w-[320px]"
                                />
                            )}

                            {/* 5. SEÇÕES TEMÁTICAS ROTATÓRIAS (Preservadas no código, desativadas temporariamente no lançamento inicial) */}
                            {false && themedSections.map((theme) => (
                                <HorizontalCarousel
                                    key={theme.id}
                                    title={`${theme.emoji} ${theme.title}`}
                                    items={theme.items}
                                    renderItem={(item: any) => <ItemCard product={item} userCoords={userCoords} locationContext={locationContext} className="w-full" />}
                                    itemWidthClass="w-[150px] md:w-[230px]"
                                    onSeeAll={() => {
                                        const catSlug = Object.keys(CATEGORY_SLUG_MAP).find(key => CATEGORY_SLUG_MAP[key] === theme.category) || theme.slug
                                        router.push(`/explorar/${selectedCitySlug || "brasil"}/${catSlug}`)
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* ─── CATEGORY DISCOVERY SECTIONS ─── */}
                    {!isEmptyListing && renderCategoryDiscoverSections()}

                    <div className="min-w-0 flex-1">
                        {/* Title Section - ABOVE BANNER - Hide when completely empty */}
                        {!isLandingPage && !isEmptyListing && (
                            <ExplorarHeaderSection
                                title={pageTitle}
                                resultsCount={totalResultsCount}
                                isLoading={isContentLoading}
                                showBackButton={!!query || !!selectedSection || isCategoryMode}
                                onBack={() => {
                                    if (selectedSection) {
                                        triggerFilterLoading()
                                        setSelectedSection(null)
                                        updateUrl(selectedCitySlug, selectedCategories, query, currentType, null)
                                    } else if (isCategoryMode) {
                                        triggerFilterLoading()
                                        setSelectedCategories([])
                                        updateUrl(selectedCitySlug, [], query, currentType)
                                    } else {
                                        router.back()
                                    }
                                }}
                            />
                        )}

                        {/* Filtros / Ordenar - fixos logo abaixo do título - Hide when completely empty */}
                        {!isLandingPage && !isEmptyListing && (
                            <ExplorarViewControls
                                onOpenFilters={handleOpenFilters}
                                onOpenSort={handleOpenSort}
                                hasActiveFilters={activeFiltersCount > 0}
                                activeFilterChips={activeFilterChips}
                                leadingBadge={
                                    !!query && searchIntent ? (
                                        <SmartSearchBadge
                                            query={query}
                                            searchIntent={searchIntent}
                                            nearbyCount={rawItems.length}
                                            regionalCount={(proximityRings?.regional.length ?? 0) + (proximityRings?.regionalSellers.length ?? 0)}
                                            nationalShippingCount={proximityRings?.nationalShipping.length ?? 0}
                                        />
                                    ) : null
                                }
                            />
                        )}

                        <div
                            key={isContentLoading ? "skeleton" : "content"}
                            style={{ animation: 'fadeIn 0.2s ease-out' }}
                        >
                            {isContentLoading ? (
                                <ExploreContentSkeleton type={currentType} hasSection={!!selectedSection} hideHeader={true} />
                            ) : !selectedCitySlug && rawItems.length === 0 ? (
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
                            ) : rawItems.length === 0 && !isCategoryMode && moreDistantItems.length === 0 && moreDistantSellers.length === 0 ? (
                                <div className="flex justify-center">
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                        imageAlt="Não temos nada assim ainda!"
                                        title="Não temos nada assim ainda!"
                                        subtitle={emptySubtitle}
                                        buttons={[
                                            {
                                                text: "Eu vendo",
                                                action: () => {
                                                    router.push(userProfile ? "/erp/inicio" : "/auth/login?mode=partner")
                                                },
                                                variant: "default"
                                            },
                                            {
                                                text: "Conheço quem vende",
                                                action: handleInvite,
                                                variant: "outline"
                                            },
                                            {
                                                text: "Estou procurando isso",
                                                action: handleOpenDemandModal,
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
                                    {/* Empty state with action buttons when no local results found in city/radius */}
                                    {rawItems.length === 0 && !isCategoryMode && (
                                        <div className="flex flex-col items-center">
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                imageAlt="Não temos nada assim ainda!"
                                                title="Não temos nada assim ainda!"
                                                subtitle={emptySubtitle}
                                                buttons={[
                                                    {
                                                        text: "Eu vendo",
                                                        action: () => {
                                                            router.push(userProfile ? "/erp/inicio" : "/auth/login?mode=partner")
                                                        },
                                                        variant: "default"
                                                    },
                                                    {
                                                        text: "Conheço quem vende",
                                                        action: handleInvite,
                                                        variant: "outline"
                                                    },
                                                    {
                                                        text: "Estou procurando isso",
                                                        action: handleOpenDemandModal,
                                                        variant: "outline"
                                                    }
                                                ]}
                                            />
                                        </div>
                                    )}

                                    {/* Carrossel de Lojas Locais na Busca */}
                                    {!!query && currentType === 'tudo' && vitrinesDestaque.length > 0 && (
                                        <div className="mb-6">
                                            <HorizontalCarousel
                                                title="Lojas e vitrines encontradas"
                                                items={vitrinesDestaque}
                                                renderItem={(vitrine) => (
                                                    <VitrineCard key={vitrine.id} vitrine={vitrine} userCoords={userCoords} hideCity={!!selectedCitySlug} locationContext={locationContext} className="w-full" />
                                                )}
                                                onSeeAll={() => {
                                                    setCurrentType("vitrines")
                                                    updateUrl(selectedCitySlug, selectedCategories, query, "vitrines")
                                                }}
                                                itemWidthClass="w-[270px] sm:w-[320px]"
                                            />
                                        </div>
                                    )}

                                    {/* Título da seção de resultados (sem filtro de tipo) */}
                                    {currentType === 'tudo' && filteredResults.length > 0 && (
                                        <h2 className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mt-8 mb-4">Todos os resultados</h2>
                                    )}

                                    {filteredResults.length > 0 ? (
                                        <div className={`grid ${currentType === 'vitrines' || currentType === 'negocios' ? 'grid sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 lg:gap-6 mt-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'} gap-3 md:gap-4 lg:gap-6 mt-4`}>
                                            {filteredResults.map((item, index) => renderListingItem(item, index < 6))}

                                            {hasNextPage && (
                                                <div
                                                    ref={observerTarget}
                                                    className="col-span-full py-12 flex flex-col items-center justify-center min-h-[120px]"
                                                >
                                                    {isFetchingNextPage ? (
                                                        <div className="flex flex-col items-center gap-2">
                                                            <ThreeDotsLoader />
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>
                                    ) : rawItems.length > 0 && displayedVitrinesCount === 0 && !hasNextPage && moreDistantItems.length === 0 ? (
                                        <div className="py-12 flex flex-col items-center">
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                imageAlt="Não temos nada assim ainda!"
                                                title="Não temos nada assim ainda!"
                                                subtitle="Ainda não temos itens nessa cidade ou com essa combinação de filtros. Que tal limpar os filtros?"
                                                buttons={[
                                                    {
                                                        text: "Eu vendo",
                                                        action: () => {
                                                            router.push(userProfile ? "/erp/inicio" : "/auth/login?mode=partner")
                                                        },
                                                        variant: "default"
                                                    },
                                                    {
                                                        text: "Conheço quem vende",
                                                        action: handleInvite,
                                                        variant: "outline"
                                                    },
                                                    {
                                                        text: "Estou procurando isso",
                                                        action: handleOpenDemandModal,
                                                        variant: "outline"
                                                    }
                                                ]}
                                            />
                                        </div>
                                    ) : null}

                                    {/* Anéis de Proximidade: Cidades vizinhas -> Envio nacional CEP -> Outras opções */}
                                    {!!query && (
                                        <ProximityRingsSection
                                            rings={proximityRings}
                                            currentType={currentType}
                                            renderDistantItem={renderDistantItem}
                                            fallbackSellers={moreDistantSellers}
                                            fallbackItems={filteredDistant}
                                        />
                                    )}

                                    {/* Seção Patrocinados na sua região */}
                                    <SponsoredAdsCarousel
                                        ads={activeAds}
                                        slot={query ? "search" : "explore"}
                                        title="Patrocinados na sua região"
                                        className="mt-12 pt-8 border-t border-gray-100 dark:border-dark-border"
                                    />
                                </>
                            )}

                        </div>
                    </div>
                </div>

                {!hideHeaderAndFooter && <MarketplaceFooter />}
            </div>

            {/* FILTERS SHEET */}
            {hasMountedFilters && (
                <ExplorarFiltersBottomSheet
                    userProfile={userProfile}
                    isOpen={isFiltersBottomSheetOpen}
                    onClose={() => setIsFiltersBottomSheetOpen(false)}
                    onApply={applyFilters}
                    onClear={clearFilters}
                    selectedCitySlug={selectedCitySlug}
                    formatCitySlug={formatCitySlug}
                    onCitySelect={() => setIsCityModalOpen(true)}
                    currentType={currentType}
                    selectedCategories={selectedCategories}
                    selectedCondition={selectedCondition}
                    minPrice={minPrice}
                    maxPrice={maxPrice}
                    promoOn={promoOn}
                    shipping={onlyShipping}
                    minRating={minRating}
                    delivery={deliveryFilter}
                    maxDistanceKm={maxDistanceKm}
                    showcaseOnly={showcaseOnly}
                    typeOptions={typeOptions}
                    productCategories={productCategories}
                    serviceCategories={dbServiceCategories}
                    partnerCategories={dbPartnerCategories}
                    filterConfig={filterConfig}
                />
            )}

            {hasMountedSort && (
                <ExplorarSortBottomSheet
                    isOpen={isSortBottomSheetOpen}
                    onClose={() => setIsSortBottomSheetOpen(false)}
                    sortBy={sortBy as any}
                    onSortChange={(val) => {
                        patchFilters({ sortBy: val as SortOption })
                    }}
                    sortOptions={contextualSortOptions}
                />
            )}

            {/* 1. CITY SELECTOR MODAL */}
            {isCityModalOpen && (
                <DefaultModal
                    isOpen={isCityModalOpen}
                    onClose={() => setIsCityModalOpen(false)}
                    maxWidth="md"
                    hideHeader={true}
                >
                    <div className="flex flex-col relative text-[#003229]">
                        <button
                            onClick={() => setIsCityModalOpen(false)}
                            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                            title="Fechar"
                        >
                            <XIcon size={16} />
                        </button>

                        {/* Header with gradient and mascot */}
                        <div
                            className="h-[200px] rounded-2xl flex items-end justify-center mb-6 relative overflow-hidden"
                            style={{ background: "linear-gradient(180deg, #0d5e49 0%, var(--brand-dark) 100%)" }}
                        >
                            <img
                                src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                                alt="Onde você está?"
                                className="w-48 h-auto object-contain transform translate-y-4"
                            />
                        </div>

                        <h4 className="text-xl font-bold text-brand-dark mb-4 text-center dark:text-dark-heading">Onde você está?</h4>
                        <p className="text-gray-500 text-sm text-center mb-6 leading-relaxed dark:text-dark-body">
                            Informe sua cidade para ver os produtos, vitrines e serviços pertinho de você.
                        </p>

                        <div className="space-y-4">
                            {/* Location scope selector: Brasil / Estado */}
                            <div className="relative" ref={stateDropdownRef}>
                                <button
                                    onClick={() => setShowStateDropdown(!showStateDropdown)}
                                    className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark dark:text-dark-heading hover:bg-brand-gray/10 dark:hover:bg-dark-border/20 rounded-lg border border-brand-border dark:border-dark-border"
                                >
                                    <span className="flex items-center gap-3">
                                        {selectedStateFilter === "brasil" ? (
                                            <Globe className="w-4 h-4 text-brand-green" />
                                        ) : (
                                            <MapPin className="w-4 h-4 text-brand-green" />
                                        )}
                                        <span>
                                            {selectedStateFilter === "brasil" ? "Brasil" : ESTADO_MAP[selectedStateFilter] || selectedStateFilter.toUpperCase()}
                                        </span>
                                    </span>
                                    <ChevronDown className={`w-4 h-4 text-brand-inactive-text transition-transform ${showStateDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                {showStateDropdown && (
                                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border">
                                        <button
                                            onClick={() => {
                                                setSelectedStateFilter("brasil")
                                                setShowStateDropdown(false)
                                                setCitySearchText("")
                                                handleSelectCity("brasil")
                                                setIsCityModalOpen(false)
                                            }}
                                            className="w-full text-left px-4 py-3 flex items-center gap-3 text-sm font-medium text-brand-dark dark:text-dark-heading hover:bg-brand-gray/10 dark:hover:bg-dark-border/20"
                                        >
                                            <Globe className="w-4 h-4 text-brand-green" />
                                            <span>Brasil (todos os estados)</span>
                                            {selectedStateFilter === "brasil" && <Check className="w-4 h-4 text-brand-green ml-auto" />}
                                        </button>
                                        {Object.entries(ESTADO_MAP).map(([uf, name]) => (
                                            <button
                                                key={uf}
                                                onClick={() => {
                                                    setSelectedStateFilter(uf)
                                                    setShowStateDropdown(false)
                                                    setCitySearchText("")
                                                    handleSelectCity(`estado-${uf}`)
                                                    setIsCityModalOpen(false)
                                                }}
                                                className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark dark:text-dark-heading hover:bg-brand-gray/10 dark:hover:bg-dark-border/20"
                                            >
                                                <span className="flex items-center gap-3">
                                                    <MapPin className="w-4 h-4 text-brand-green" />
                                                    {name}
                                                </span>
                                                {selectedStateFilter === uf && <Check className="w-4 h-4 text-brand-green" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* City search - filters by selected state */}
                            <div className="relative">
                                <Input
                                    placeholder={selectedStateFilter === "brasil" ? "Buscar por cidade... (ex: São Paulo, Bauru)" : `Buscar cidade em ${ESTADO_MAP[selectedStateFilter] || selectedStateFilter.toUpperCase()}...`}
                                    value={citySearchText}
                                    onChange={(e) => setCitySearchText(e.target.value)}
                                    className="h-[42px] w-full"
                                    variant="full-rounded"
                                    prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                                />
                                {filteredCitiesSuggestions.length > 0 && (
                                    <div className="flex flex-col gap-1 border-t pt-2">
                                        {filteredCitiesSuggestions.map((slug) => (
                                            <button
                                                key={slug}
                                                onClick={() => {
                                                    handleSelectCity(slug)
                                                    setIsCityModalOpen(false)
                                                }}
                                                className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark dark:text-dark-heading"
                                            >
                                                <span>{formatCitySlug(slug)}</span>
                                                {selectedCitySlug === slug && <Check className="w-4 h-4 text-brand-green" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {citySearchText.trim().length >= 2 && filteredCitiesSuggestions.length === 0 && citiesData.length > 0 && (
                                    <p className="text-center text-xs text-brand-inactive-text py-3">
                                        Nenhuma cidade encontrada{selectedStateFilter !== "brasil" ? ` em ${ESTADO_MAP[selectedStateFilter]}` : ""}
                                    </p>
                                )}
                            </div>

                            <Button
                                onClick={() => {
                                    requestLocation()
                                    setIsCityModalOpen(false)
                                }}
                                variant="outline"
                                className="w-full"
                            >
                                <MapPin className="w-4 h-4" />
                                <span>Usar minha localização</span>
                            </Button>

                            {/* Only show login link when user is NOT logged in */}
                            {!userProfile && (
                                <div className="text-center mt-8 pt-5 border-t border-brand-border dark:border-dark-border">
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                        Já tem uma conta cadastrada com endereço salvo?
                                    </p>
                                    <Button
                                        onClick={() => {
                                            setIsCityModalOpen(false)
                                            router.push("/auth/login")
                                        }}
                                        variant="link"
                                        className="text-sm mt-1 inline-block"
                                    >
                                        Entrar na minha conta
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </DefaultModal>
            )}

            {/* 2. CATEGORY MODAL (SHOWN ONLY WHEN TOP CATEGORIES SLIDER IS HIDDEN) */}
            {isCategoryModalOpen && (
                <DefaultModal
                    isOpen={isCategoryModalOpen}
                    onClose={() => setIsCategoryModalOpen(false)}
                    title="Filtrar por Categoria"
                    maxWidth="md"
                >
                    <div className="flex flex-col gap-2 py-2 max-h-[350px] overflow-y-auto pr-1">
                        {activeCategoriesList.map((cat) => {
                            const isSelected = selectedCategories.includes(cat.name)
                            return (
                                <button
                                    key={cat.name}
                                    onClick={() => toggleCategory(cat.name)}
                                    className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark dark:text-dark-heading"
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
            )}

            {/* 3. DEMAND MODAL - "Estou procurando isso" */}
            {isDemandModalOpen && (
                <DefaultModal
                    isOpen={isDemandModalOpen}
                    onClose={() => setIsDemandModalOpen(false)}
                    title="O que você está procurando?"
                    maxWidth="md"
                >
                    <div className="flex flex-col gap-4 py-2">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Selecione o tipo de demanda e digite o que precisa. Vamos tentar encontrar alguém que possa ajudar!
                        </p>

                        <div className="flex flex-col gap-2.5">
                            <ListItem
                                title="Quero comprar"
                                description="Produtos, peças, eletrônicos, roupas ou itens físicos"
                                className={`p-3.5 transition-all cursor-pointer ${selectedDemandType === "comprar"
                                    ? "border-brand-green ring-1 ring-brand-green bg-green-50/20 dark:bg-green-950/20"
                                    : ""
                                    }`}
                                onClick={() => setSelectedDemandType("comprar")}
                                right={
                                    <RadioButton
                                        name="demandType"
                                        value="comprar"
                                        checked={selectedDemandType === "comprar"}
                                        onChange={() => setSelectedDemandType("comprar")}
                                    />
                                }
                            />

                            <ListItem
                                title="Quero contratar"
                                description="Serviços, profissionais, reformas, assistências ou diárias"
                                className={`p-3.5 transition-all cursor-pointer ${selectedDemandType === "contratar"
                                    ? "border-brand-green ring-1 ring-brand-green bg-green-50/20 dark:bg-green-950/20"
                                    : ""
                                    }`}
                                onClick={() => setSelectedDemandType("contratar")}
                                right={
                                    <RadioButton
                                        name="demandType"
                                        value="contratar"
                                        checked={selectedDemandType === "contratar"}
                                        onChange={() => setSelectedDemandType("contratar")}
                                    />
                                }
                            />

                            <ListItem
                                title="Quero encontrar loja ou empresa"
                                description="Estabelecimentos comerciais, empresas locais ou pontos de atendimento"
                                className={`p-3.5 transition-all cursor-pointer ${selectedDemandType === "loja" || selectedDemandType === "encontrar"
                                    ? "border-brand-green ring-1 ring-brand-green bg-green-50/20 dark:bg-green-950/20"
                                    : ""
                                    }`}
                                onClick={() => setSelectedDemandType("loja")}
                                right={
                                    <RadioButton
                                        name="demandType"
                                        value="loja"
                                        checked={selectedDemandType === "loja" || selectedDemandType === "encontrar"}
                                        onChange={() => setSelectedDemandType("loja")}
                                    />
                                }
                            />
                        </div>

                        <div className="pt-1">
                            <Input
                                label="O que você precisa?"
                                placeholder={
                                    selectedDemandType === "comprar"
                                        ? "Ex: pneu goodyear, notebook dell, camiseta..."
                                        : selectedDemandType === "contratar"
                                            ? "Ex: encanador, eletricista, fotógrafo..."
                                            : "Ex: conserto de ar condicionado, autopeças, pet shop..."
                                }
                                value={demandTerm}
                                onChange={(e) => setDemandTerm(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !isSubmittingDemand && demandTerm.trim()) {
                                        e.preventDefault()
                                        handleSubmitDemand()
                                    }
                                }}
                                disabled={isSubmittingDemand}
                                autoFocus
                            />
                        </div>

                        <Button
                            variant="default"
                            className="w-full font-bold"
                            onClick={handleSubmitDemand}
                            disabled={!demandTerm.trim() || isSubmittingDemand}
                            isLoading={isSubmittingDemand}
                        >
                            {isSubmittingDemand ? "Enviando..." : "Enviar"}
                        </Button>
                    </div>
                </DefaultModal>
            )}

            {/* 4. DEMAND THANK YOU MODAL */}
            {isDemandThankYouOpen && (
                <DefaultModal
                    isOpen={isDemandThankYouOpen}
                    onClose={() => setIsDemandThankYouOpen(false)}
                    title=""
                    maxWidth="sm"
                    hideHeader
                >
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/Feedback.png"
                        imageAlt="Obrigado pelo seu feedback!"
                        title="Obrigado!"
                        subtitle="Recebemos sua demanda! Vamos tentar encontrar alguém que possa te ajudar com isso. Fique de olho nas novidades da Dudit!"
                        itemButton={{
                            text: "Entendido",
                            action: () => setIsDemandThankYouOpen(false),
                            variant: "default"
                        }}
                    />
                </DefaultModal>
            )}
        </>
    )
}
