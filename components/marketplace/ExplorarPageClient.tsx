"use client"

import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from "react"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { ItemCard, VitrineCard, HorizontalCarousel } from "./shared-components"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import type { LocationContext } from "@/lib/utils/location-label"
import { getLocationLabel } from "@/lib/utils/location-label"
import { IconPlaceholder, DefaultModal, SkeletonLoader } from "@/components/reusable"
import { useRouter, useSearchParams, usePathname, useParams } from "next/navigation"
import { CommunityVideosCarousel } from "./CommunityVideosCarousel"
import {
    MapPin,
    Check,
} from "lucide-react"
import Link from "next/link"
import { applySellerDiversity, calcCategoryBrowseScore } from "@/lib/marketplace/ranking"
import { searchMarketplace, type MarketplaceListCursor } from "@/app/actions/marketplace/search"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { getProductDisplayImages } from "@/lib/utils/product-display-images"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { StarIcon } from "@/lib/icons"
import { getStoreUrl, getPlanUrl, getProductUrl, getServiceUrl } from "@/lib/utils/url-generator"
import { formatCurrency } from "@/lib/utils"
import { SponsoredAdsCarousel } from "@/components/marketplace/ads/SponsoredAdsCarousel"
import type { SponsoredAd } from "@/lib/ads/types"
import citiesData from "@/lib/data/cities.json"
import { useLocationRedirect } from "@/hooks/use-location-redirect"
import { getMarketplaceCategoriesClient, getMarketplaceServiceCategoriesClient, getMarketplacePartnerCategoriesClient } from "@/lib/data/marketplace-categories-client"
import { ExplorarMobileControls } from "./ExplorarMobileControls"
import { ExplorarHeaderSection } from "./ExplorarHeaderSection"
import { ExplorarViewControls } from "./ExplorarViewControls"
import { ExplorarFiltersBottomSheet } from "./ExplorarFiltersBottomSheet"
import { ExplorarSortBottomSheet } from "./ExplorarSortBottomSheet"
import { ExploreContentSkeleton } from "./explorar-skeleton"
import { CATEGORY_SLUG_MAP, COMMON_CITY_ACCENTS, FALLBACK_CATEGORIES } from "./explorar-constants"
import type { SortOption, ViewMode } from "./explorar-constants"
import { getFilterConfig, getSortOptionsForMode, type PageMode } from "./contextual-filters"

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
    communityVideos?: any[]
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
    const [dbServiceCategories, setDbServiceCategories] = useState<{ id?: string; name: string; icon_url: string | null }[]>([])
    const [dbPartnerCategories, setDbPartnerCategories] = useState<{ id?: string; name: string; icon_url: string | null }[]>([])
    const [viewMode, setViewMode] = useState<ViewMode>("grid")

    const locationContext = useMemo<LocationContext | null>(() => {
        const currentCity = selectedCitySlug || pathCity || null
        if (!currentCity || currentCity === "brasil") {
            return currentCity === "brasil" ? { scope: "country" } : null
        }
        if (currentCity.startsWith("estado-")) {
            return { scope: "state", state: currentCity.replace("estado-", "").toUpperCase() }
        }
        const state = currentCity.split("-").pop()?.toUpperCase() || null
        let city: string | null = null
        if (currentCity === cidade && resolvedCityName) {
            city = resolvedCityName.split(" - ")[0] || null
        }
        if (!city) {
            const formatted = formatCitySlug(currentCity)
            city = formatted.includes(" - ") ? formatted.split(" - ")[0] : formatted
        }
        return { scope: "city", city, state }
    }, [selectedCitySlug, pathCity, cidade, resolvedCityName, formatCitySlug])

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

        getMarketplaceCategoriesClient(null).then(cats => {
            if (cats && cats.length > 0) {
                setDbCategories(cats)
            }
        })
        getMarketplaceServiceCategoriesClient(null).then(cats => {
            if (cats && cats.length > 0) {
                setDbServiceCategories(cats)
            }
        })
        getMarketplacePartnerCategoriesClient(null).then(cats => {
            if (cats && cats.length > 0) {
                setDbPartnerCategories(cats)
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
    const fetchFnMountedRef = useRef(false) // Dev-mode strict-mode guard

    const queryKeyString = `${query}:${currentType}:${selectedCitySlug}:${selectedRadius}:${selectedSection}`
    useEffect(() => {
        fetchFnMountedRef.current = false
    }, [queryKeyString])

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

        const catSlug = categories.length > 0 ? categoryToSlug(categories[0]) : ""

        if (city && catSlug) {
            router.push(`/explorar/${city}/${catSlug}${queryPart}`)
        } else if (city) {
            router.push(`/explorar/${city}${queryPart}`)
        } else if (catSlug) {
            queryParams.set("categoria", catSlug)
            router.push(`/explorar?${queryParams.toString()}`)
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
    const citySyncDoneRef = useRef(false)

    useEffect(() => {
        // Run only once on mount
        if (citySyncDoneRef.current) return
        citySyncDoneRef.current = true

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

            // Guard: only sync if city actually changed
            if (userCitySlug !== selectedCitySlug) {
                document.cookie = `dudit_city=${userCitySlug}; path=/; max-age=${60 * 60 * 24 * 30}`
                localStorage.setItem("dudit_city", userCitySlug)
                setSelectedCitySlug(userCitySlug)
                updateUrl(userCitySlug, selectedCategories, query, currentType)
            }
            return
        }

        // 2. Fall back to cookie/localStorage ONLY for logged-out visitors
        //    (logged-in users without an address stay on /explorar = Brasil)
        let savedCity: string | null = null
        if (!userProfile) {
            savedCity = localStorage.getItem("dudit_city")
            if (!savedCity) {
                const match = document.cookie.match(/(?:^|; )dudit_city=([^;]*)/)
                if (match) savedCity = match[1]
            }
        }

        if (savedCity && savedCity !== selectedCitySlug) {
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
    }, [])

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
            if (rawType === "plano" || rawType === "plan" || rawType === "recorrente" || rawType === "recurring") return "plano"

            if (item?.store_name || item?.name || item?.partners?.store_name) return "loja"
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
        const categoryStr = typeof itemCategory === 'string' ? itemCategory : String(itemCategory || "")
        if (!categoryStr) return false
        const normalize = (s: string) => s
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/&/g, "e")
            .replace(/[-_]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        const normItem = normalize(categoryStr)
        const normTarget = normalize(catName)
        if (normItem === normTarget) return true
        // Fallback: check if one contains the other (for subcategory variations)
        // Only if the difference isn't too large (avoid false positives like "casa" matching "casa & utilidades")
        const lenDiff = Math.abs(normItem.length - normTarget.length)
        if (lenDiff <= 8 && (normItem.includes(normTarget) || normTarget.includes(normItem))) {
            return true
        }
        return false
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

    const productCategories = useMemo(
        () => (dbCategories.length > 0 ? dbCategories : FALLBACK_CATEGORIES),
        [dbCategories]
    )

    const filterCategoriesList = useMemo(() => {
        if (currentType === "servicos") return dbServiceCategories
        if (currentType === "vitrines" || currentType === "negocios") return dbPartnerCategories
        return productCategories
    }, [currentType, dbServiceCategories, dbPartnerCategories, productCategories])

    const isStandardCategory = useCallback((catName: string) => {
        return filterCategoriesList.some(cat => matchCategory(catName, cat.name))
    }, [filterCategoriesList])

    const activeCategoriesList = useMemo(() => {
        const all = [...filterCategoriesList]
        const hasOutros = dataToFilter.some(p => {
            if (p.itemType === 'loja') return false
            const itemCat = p.category
            return !itemCat || !isStandardCategory(itemCat)
        })
        if (hasOutros && !all.some(c => c.name === "Outros")) {
            all.push({ name: "Outros", icon_url: null })
        }
        return all
    }, [filterCategoriesList, dataToFilter, isStandardCategory])

    const outrosItems = useMemo(() => {
        return dataToFilter.filter(p => {
            if (p.itemType === 'loja') return false
            const itemCat = p.category
            return !itemCat || !isStandardCategory(itemCat)
        }).slice(0, 20)
    }, [dataToFilter, isStandardCategory])

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
    }, [dataToFilter, selectedCategories, minPrice, maxPrice, promoOn, sortBy, selectedSection, isStandardCategory])

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
        if (currentType !== 'produtos' && currentType !== 'em-oferta') return []
        return filteredResults.filter(p => p.originalPrice !== undefined && p.originalPrice > p.price).slice(0, 20)
    }, [filteredResults, currentType])

    const showFeaturedSections = currentType === 'tudo' && selectedCategories.length === 0 && !query && !selectedSection && rawItems.length > 0

    const pageMode = useMemo((): PageMode => {
        if (query || (currentType !== 'tudo' && currentType !== 'em-alta' && currentType !== 'novos-anunciados')) return "search"
        if (selectedSection) return "section-detail"
        if (selectedCategories.length > 0) return "category"
        return "sections"
    }, [query, currentType, selectedSection, selectedCategories])

    const isCategoryMode = pageMode === "category" && selectedCategories.length === 1
    const categoryName = isCategoryMode ? selectedCategories[0] : null

    const subcategoriesList = useMemo(() => {
        if (!isCategoryMode || !categoryName) return []
        const subs = new Set<string>()
        dataToFilter.forEach(item => {
            if (itemMatchesCategory(item, categoryName) && item.subcategoryName) {
                subs.add(item.subcategoryName)
            }
        })
        return [...subs].sort()
    }, [isCategoryMode, categoryName, dataToFilter])

    const categoryPromos = useMemo(() => {
        if (!isCategoryMode) return []
        return dataToFilter
            .filter(item => itemMatchesCategory(item, categoryName!) && item.originalPrice !== undefined && item.originalPrice > item.price)
            .slice(0, 20)
    }, [isCategoryMode, categoryName, dataToFilter])

    const categoryTopRated = useMemo(() => {
        if (!isCategoryMode) return []
        return dataToFilter
            .filter(item => itemMatchesCategory(item, categoryName!) && (item.rating ?? 0) > 0)
            .sort((a, b) => (b.rating || 0) - (a.rating || 0))
            .slice(0, 20)
    }, [isCategoryMode, categoryName, dataToFilter])

    const categoryStores = useMemo(() => {
        if (!isCategoryMode) return []
        return normalizedInitialResults
            .filter(r => r.itemType === 'loja' && itemMatchesCategory(r, categoryName!))
            .slice(0, 20)
    }, [isCategoryMode, categoryName, normalizedInitialResults])

    const showCategoryDiscoverySections = isCategoryMode && (subcategoriesList.length > 0 || categoryPromos.length > 0 || categoryTopRated.length > 0 || categoryStores.length > 0)

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
    }, [query, currentType, selectedCategories, selectedCitySlug, selectedSection, resolveCategoryName])

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
                    <strong className="text-brand-dark">"{term}"</strong> em{" "}
                    <strong className="text-brand-dark">{cityNameOnly}</strong>.
                    Conhece alguém que vende? Convide pra Dudit!
                </>
            )
        }

        if (currentType === "produtos") {
            return (
                <>
                    Nenhum produto cadastrado em{" "}
                    <strong className="text-brand-dark">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a vender aqui - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "servicos") {
            return (
                <>
                    Nenhum serviço cadastrado em{" "}
                    <strong className="text-brand-dark">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a oferecer seus serviços - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "planos") {
            return (
                <>
                    Nenhum plano recorrente cadastrado em{" "}
                    <strong className="text-brand-dark">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a oferecer assinaturas - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "vitrines") {
            return (
                <>
                    Nenhuma loja cadastrada em{" "}
                    <strong className="text-brand-dark">{cityNameOnly}</strong> ainda.
                    Crie sua vitrine - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "negocios") {
            return (
                <>
                    Nenhum negócio cadastrado em{" "}
                    <strong className="text-brand-dark">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a vender aqui - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "bem-avaliados") {
            return (
                <>
                    Nenhum item bem avaliado cadastrado em{" "}
                    <strong className="text-brand-dark">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a vender aqui - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "em-oferta") {
            return (
                <>
                    Nenhum item em oferta cadastrado em{" "}
                    <strong className="text-brand-dark">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a vender aqui - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "em-alta") {
            return (
                <>
                    Nenhum item em alta cadastrado em{" "}
                    <strong className="text-brand-dark">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a vender aqui - é gratuito e sem comissão!
                </>
            )
        }

        if (currentType === "novos-anunciados") {
            return (
                <>
                    Nenhum item novo cadastrado em{" "}
                    <strong className="text-brand-dark">{cityNameOnly}</strong> ainda.
                    Seja o primeiro a vender aqui - é gratuito e sem comissão!
                </>
            )
        }

        return (
            <>
                Nenhum vendedor cadastrado em{" "}
                <strong className="text-brand-dark">{cityNameOnly}</strong> ainda.
                Seja o primeiro ou convide quem você conhece!
            </>
        )
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

    const applyFilters = (filters: {
        type: string
        categories: string[]
        minPrice: string | number
        maxPrice: string | number
        promoOn: boolean
        radius: number | null
    }) => {
        setCurrentType(filters.type as any)
        setSelectedCategories(filters.categories)
        setMinPrice(filters.minPrice)
        setMaxPrice(filters.maxPrice)
        setPromoOn(filters.promoOn)
        setSelectedRadius(filters.radius)
        updateUrl(selectedCitySlug, filters.categories, query, filters.type, filters.radius, selectedSection)
    }

    const typeOptions = [
        { value: "tudo", label: "Tudo" },
        { value: "produtos", label: "Produtos" },
        { value: "servicos", label: "Serviços" },
        { value: "vitrines", label: "Lojas" },
        { value: "planos", label: "Assinaturas" },
    ]

    const sortOptions: { value: SortOption; label: string }[] = [
        { value: "relevancia", label: "Relevancia" },
        { value: "preco_menor", label: "Menor preco" },
        { value: "preco_maior", label: "Maior preco" },
        { value: "recentes", label: "Mais recentes" },
    ]

    const activeFilterChips = useMemo(() => {
        const chips: { key: string; label: string; value: string; onRemove: () => void }[] = []
        if (selectedCategories.length > 0) {
            chips.push({
                key: "category",
                label: "Categoria",
                value: resolveCategoryName(selectedCategories[0]),
                onRemove: () => toggleCategory(selectedCategories[0]),
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
                onRemove: () => { setMinPrice(""); setMaxPrice("") },
            })
        }
        if (promoOn) {
            chips.push({
                key: "promo",
                label: "Promoção",
                value: "Ativo",
                onRemove: () => setPromoOn(false),
            })
        }
        if (sortBy !== "relevancia") {
            const sortLabel = sortOptions.find(o => o.value === sortBy)?.label || sortBy
            chips.push({
                key: "sort",
                label: "Ordenar",
                value: sortLabel,
                onRemove: () => setSortBy("relevancia"),
            })
        }
        if (currentType !== "tudo") {
            const typeLabel = typeOptions.find(o => o.value === currentType)?.label || currentType
            chips.push({
                key: "type",
                label: "Tipo",
                value: typeLabel,
                onRemove: () => {
                    setCurrentType("tudo")
                    updateUrl(selectedCitySlug, selectedCategories, query, "tudo")
                },
            })
        }
        return chips
    }, [selectedCategories, minPrice, maxPrice, promoOn, sortBy, currentType, selectedCitySlug, query, resolveCategoryName])

    const getItemUrl = (item: any) => {
        if (item.itemType === "loja") return getStoreUrl(item.partners || item)
        if (item.itemType === "plano") return getPlanUrl(item, item.partners)
        if (item.itemType === "servico") return getServiceUrl(item, item.partners)
        return getProductUrl(item, item.partners)
    }

    const renderListRow = (item: any) => {
        const partner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const isStore = item.itemType === "loja"
        const showPrice = !isStore && item.show_price_in_store !== false
        const sellerName = partner?.store_name || item.name || ""
        const sellerLogoRaw = partner?.store_avatar || partner?.store_image_url || item.logo_url || null
        const sellerLogoUrl = sellerLogoRaw && !String(sellerLogoRaw).includes("Placeholder.png") ? getR2ImageUrl(sellerLogoRaw) : null
        const locationLabel = getLocationLabel(partner, locationContext)

        const imageUrl = isStore
            ? (sellerLogoUrl || partner?.banner_url || "https://img.dudit.com.br/static/Placeholder.png")
            : getPrimaryProductDisplayImage(item)

        return (
            <Link
                key={`${item.itemType}-${item.id}`}
                href={getItemUrl(item)}
                prefetch={false}
                className="group grid grid-cols-[80px_1fr] gap-3 border-t border-gray-100 py-3 sm:grid-cols-[180px_1fr] hover:bg-gray-50/60"
            >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-brand-gray">
                    <img src={imageUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                </div>
                <div className="min-w-0 py-1">
                    {isStore ? (
                        <>
                            <div className="flex items-center gap-2">
                                <h3 className="line-clamp-2 text-base font-bold text-brand-dark sm:text-lg">{item.name}</h3>
                                {(item.rating ?? 0) > 0 && (
                                    <span className="flex items-center gap-1 text-xs font-bold text-brand-dark shrink-0">
                                        <StarIcon size={12} className="text-brand-green fill-brand-green" />
                                        {Number(item.rating).toFixed(1)}
                                    </span>
                                )}
                            </div>
                            {(item.category || item.subcategoryName) && (
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium text-brand-inactive-text">
                                    {item.category && <span className="truncate">{item.category}</span>}
                                    {item.category && item.subcategoryName && <span className="w-1 h-1 rounded-full bg-brand-inactive-text shrink-0" />}
                                    {item.subcategoryName && <span className="truncate text-brand-green">{item.subcategoryName}</span>}
                                </div>
                            )}
                            {locationLabel && (
                                <p className="mt-1.5 text-[11px] text-gray-500 font-normal truncate">{locationLabel}</p>
                            )}
                        </>
                    ) : (
                        <>
                            <h3 className="line-clamp-2 text-sm md:text-[15px] font-normal text-brand-dark sm:max-w-full">{item.name}</h3>
                            <div className="flex justify-between items-center mt-1">
                                <div className="flex flex-col">
                                    {showPrice ? (
                                        <div className="flex items-baseline gap-2">
                                            {item.originalPrice && <span className="text-xs text-brand-inactive-text line-through">{formatCurrency(item.originalPrice)}</span>}
                                            <span className="text-base font-bold text-brand-dark leading-tight">{formatCurrency(item.price || 0)}</span>
                                        </div>
                                    ) : (
                                        <span className="text-xs font-bold text-brand-dark">Preco sob consulta</span>
                                    )}
                                </div>
                                {(item.rating ?? 0) > 0 && (
                                    <div className="flex items-center gap-0.5 shrink-0">
                                        <StarIcon size={12} className="text-brand-green fill-brand-green" />
                                        <span className="text-[11px] font-bold text-brand-dark">{Number(item.rating).toFixed(1)}</span>
                                    </div>
                                )}
                            </div>
                            {sellerName && (
                                <>
                                    <div className="border-t border-gray-100 my-2" />
                                    <div className="flex items-start gap-2 pt-0.5">
                                        <UserProfileImage
                                            fullName={sellerName}
                                            imageUrl={sellerLogoUrl}
                                            className="w-8 h-8 border border-gray-100 shrink-0 bg-gray-50"
                                        />
                                        <div className="flex flex-col min-w-0">
                                            <p className="text-[11px] md:text-xs text-brand-dark font-medium truncate leading-tight">
                                                {sellerName}
                                            </p>
                                            {locationLabel && (
                                                <p className="text-[11px] text-gray-500 font-normal truncate">{locationLabel}</p>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            </Link>
        )
    }

    const filterConfig = useMemo(() => {
        return getFilterConfig(selectedSection, pageMode)
    }, [selectedSection, pageMode])

    const contextualSortOptions = useMemo(() => {
        return getSortOptionsForMode(pageMode, selectedSection)
    }, [pageMode, selectedSection])

    const renderListingItem = (item: any) => {
        const userCoords = userProfile?.latitude && userProfile?.longitude
            ? { lat: userProfile.latitude, lng: userProfile.longitude }
            : null

        if (viewMode === "list") return renderListRow(item)

        if (item.itemType === 'loja') {
            return <VitrineCard key={`loja-${item.id}`} vitrine={item} hideCity={!!selectedCitySlug} locationContext={locationContext} className="w-full" />
        }
        return <ItemCard key={`${item.itemType}-${item.id}`} product={item as any} userCoords={userCoords} locationContext={locationContext} className="w-full" />
    }

    // Renders the category discovery sections
    const renderCategoryDiscoverSections = () => {
        if (!showCategoryDiscoverySections) return null
        return (
            <div className="mb-6 lg:mb-8 space-y-6 lg:space-y-10">
                {subcategoriesList.length > 0 && (
                    <div className="w-full">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg lg:text-2xl font-medium text-brand-dark">Subcategorias</h2>
                        </div>
                        <div className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-2">
                            {subcategoriesList.map((sub) => (
                                <button
                                    key={sub}
                                    onClick={() => {/* would filter by subcategory */ }}
                                    className="shrink-0 px-4 py-2 rounded-full border border-gray-200 bg-white text-sm font-bold text-brand-dark hover:border-brand-green hover:bg-green-50 transition-colors whitespace-nowrap"
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
                        renderItem={(item: any) => <ItemCard product={item} userCoords={userProfile?.latitude && userProfile?.longitude ? { lat: userProfile.latitude, lng: userProfile.longitude } : null} locationContext={locationContext} className="w-full" />}
                        itemWidthClass="w-[190px] sm:w-[210px]"
                    />
                )}
                {categoryTopRated.length >= 2 && (
                    <HorizontalCarousel
                        title="⭐ Melhor avaliados"
                        subtitle={`Os favoritos em ${categoryName}`}
                        items={categoryTopRated}
                        renderItem={(item: any) => <ItemCard product={item} userCoords={userProfile?.latitude && userProfile?.longitude ? { lat: userProfile.latitude, lng: userProfile.longitude } : null} locationContext={locationContext} className="w-full" />}
                        itemWidthClass="w-[190px] sm:w-[210px]"
                    />
                )}
                {categoryStores.length >= 2 && (
                    <HorizontalCarousel
                        title="🏪 Lojas que vendem"
                        subtitle={`Vendedores de ${categoryName}`}
                        items={categoryStores}
                        renderItem={(item: any) => <VitrineCard vitrine={item} hideCity={!!selectedCitySlug} locationContext={locationContext} className="w-full" />}
                        itemWidthClass="w-[270px] sm:w-[320px]"
                    />
                )}
            </div>
        )
    }

    const showExploreSections = pageMode === "sections" && !selectedSection

    // ─── Themed rotating sections ───────────────────────────────────────
    const CATEGORY_THEMES = [
        { id: "auto", title: "Hora de cuidar do veículo", slug: "auto-e-moto", category: "Auto & Moto", emoji: "🚗" },
        { id: "casa", title: "Dando um trato na casa", slug: "casa-e-utilidades", category: "Casa & Utilidades", emoji: "🏠" },
        { id: "moda", title: "Renove o visual", slug: "moda-e-beleza", category: "Moda & Beleza", emoji: "👗" },
        { id: "tecnologia", title: "Tecnologia pra facilitar", slug: "tecnologia-e-eletronicos", category: "Tecnologia & Eletrônicos", emoji: "💻" },
        { id: "pet", title: "Mimos pro seu pet", slug: "pets", category: "Pets", emoji: "🐾" },
        { id: "saude", title: "Cuide de você", slug: "saude-e-bem-estar", category: "Saúde & Bem-estar", emoji: "💚" },
        { id: "construcao", title: "Reformando a casa", slug: "construcao-e-ferramentas", category: "Construção & Ferramentas", emoji: "🔧" },
        { id: "agro", title: "Pro campo e jardim", slug: "agro-e-jardim", category: "Agro & Jardim", emoji: "🌱" },
        { id: "infantil", title: "Diversão para os pequenos", slug: "infantil-e-brinquedos", category: "Infantil & Brinquedos", emoji: "🧸" },
        { id: "alimentacao", title: "Sabores da região", slug: "alimentacao", category: "Alimentação", emoji: "🍽️" },
    ]

    const themedSections = useMemo(() => {
        if (!showExploreSections) return []
        const available: typeof CATEGORY_THEMES = []

        for (const theme of CATEGORY_THEMES) {
            const catName = theme.category
            const items = dataToFilter.filter(item => itemMatchesCategory(item, catName))
            if (items.length > 0) {
                available.push(theme)
            }
        }

        if (available.length === 0) return []

        // Daily seeded pick for rotation
        const today = new Date().toDateString()
        const seed = (today + (selectedCitySlug || "br")).split("").reduce((a, c) => a + c.charCodeAt(0), 0)
        const pickCount = Math.min(2, available.length)
        const picked: typeof CATEGORY_THEMES = []
        const used = new Set<number>()

        for (let i = 0; i < pickCount; i++) {
            let idx = (seed + i * 7) % available.length
            let attempts = 0
            while (used.has(idx) && attempts < available.length) {
                idx = (idx + 1) % available.length
                attempts++
            }
            if (!used.has(idx)) {
                used.add(idx)
                picked.push(available[idx])
            }
        }

        return picked.map(theme => {
            const items = dataToFilter
                .filter(item => itemMatchesCategory(item, theme.category))
                .slice(0, 20)
            return { ...theme, items }
        })
    }, [showExploreSections, dataToFilter, selectedCitySlug])

    const showCommunityVideos = communityVideos.length > 0

    const goToCategory = (catName: string) => {
        const catSlug = categoryToSlug(catName)
        const typeParam = currentType && currentType !== "tudo" ? `?type=${currentType}` : ""
        router.push(`/explorar/${selectedCitySlug || "brasil"}/${catSlug}${typeParam}`)
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
                <div className="container mx-auto max-w-[1400px] flex-grow pb-24 lg:pb-12 mt-4">
                    {/* CATEGORIAS EM CÍRCULOS (type-aware) */}
                    {!query && activeCategoriesList.length > 0 && !isLandingPage && (
                        <div className="mb-6 lg:mb-8">
                            <h2 className="text-lg lg:text-2xl font-medium text-brand-dark mb-4">Categorias</h2>
                            <div className="flex gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {activeCategoriesList.map((cat) => (
                                    <button
                                        key={cat.name}
                                        onClick={() => goToCategory(cat.name)}
                                        className="snap-start shrink-0 flex flex-col items-center gap-2 group w-[85px]"
                                    >
                                        <div className="w-[68px] h-[68px] rounded-full bg-brand-gray border border-gray-100 flex items-center justify-center overflow-hidden group-hover:border-brand-green group-hover:shadow-md transition-all duration-200">
                                            {cat.icon_url ? (
                                                <img src={cat.icon_url} alt={cat.name} className="w-9 h-9 object-contain" />
                                            ) : (
                                                <span className="text-2xl">📦</span>
                                            )}
                                        </div>
                                        <span className="text-[11px] font-bold text-center leading-tight text-brand-dark line-clamp-2">{cat.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ─── SECTIONS MODE: Discover sections on top ─── */}
                    {showExploreSections && (
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
                                        <VitrineCard key={vitrine.id} vitrine={vitrine} hideCity={!!selectedCitySlug} className="w-full" />
                                    )}
                                    onSeeAll={() => {
                                        setCurrentType("vitrines")
                                        updateUrl(selectedCitySlug, selectedCategories, query, "vitrines")
                                    }}
                                    itemWidthClass="w-[270px] sm:w-[320px]"
                                />
                            )}

                            {/* 5. SEÇÕES TEMÁTICAS ROTATÓRIAS */}
                            {themedSections.map((theme) => (
                                <HorizontalCarousel
                                    key={theme.id}
                                    title={`${theme.emoji} ${theme.title}`}
                                    items={theme.items}
                                    renderItem={(item: any) => <ItemCard product={item} userCoords={userProfile?.latitude && userProfile?.longitude ? { lat: userProfile.latitude, lng: userProfile.longitude } : null} locationContext={locationContext} className="w-full" />}
                                    itemWidthClass="w-[190px] sm:w-[210px]"
                                    onSeeAll={() => {
                                        const catSlug = Object.keys(CATEGORY_SLUG_MAP).find(key => CATEGORY_SLUG_MAP[key] === theme.category) || theme.slug
                                        router.push(`/explorar/${selectedCitySlug || "brasil"}/${catSlug}`)
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* ─── CATEGORY DISCOVERY SECTIONS ─── */}
                    {renderCategoryDiscoverSections()}

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

                        <div
                            key={`${currentType}-${selectedCategories.join(",")}-${selectedCitySlug}-${isLoading || (isFetching && !isFetchingNextPage)}`}
                            style={{ animation: 'fadeIn 0.2s ease-out' }}
                        >
                            {isLoading || (isFetching && !isFetchingNextPage) ? (
                                <ExploreContentSkeleton type={currentType} hasSection={!!selectedSection} />
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
                            ) : rawItems.length === 0 && !isCategoryMode ? (
                                <div className="flex justify-center">
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                        imageAlt="Não temos nada assim ainda!"
                                        title="Não temos nada assim ainda!"
                                        subtitle={emptySubtitle}
                                        buttons={[
                                            {
                                                text: "Eu vendo algo",
                                                action: () => {
                                                    router.push(userProfile ? "/erp/trocar-erp" : "/auth/login?mode=partner")
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
                                                    <VitrineCard key={vitrine.id} vitrine={vitrine} hideCity={false} locationContext={locationContext} className="w-full" />
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
                                        onOpenFilters={() => setIsFiltersBottomSheetOpen(true)}
                                        onOpenSort={() => setIsSortBottomSheetOpen(true)}
                                        hasActiveFilters={activeFiltersCount > 0}
                                        activeFilterChips={activeFilterChips}
                                    />


                                    {filteredResults.length === 0 && !hasNextPage ? (
                                        <div className="py-12 flex flex-col items-center">
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                imageAlt="Não temos nada assim ainda!"
                                                title="Não temos nada assim ainda!"
                                                subtitle="Ainda não temos itens nessa cidade ou com essa combinação de filtros. Que tal limpar os filtros?"
                                                buttons={[
                                                    {
                                                        text: "Eu vendo algo",
                                                        action: () => {
                                                            router.push(userProfile ? "/erp/trocar-erp" : "/auth/login?mode=partner")
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
                                    ) : (
                                        <div className={viewMode === "grid"
                                            ? `grid ${currentType === 'vitrines' ? 'grid-cols sm:grid-cols-2 md:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'} gap-3 md:gap-4 lg:gap-6 mt-4`
                                            : "rounded-lg border border-gray-100 bg-white mt-4"
                                        }>
                                            {filteredResults.map((item) => renderListingItem(item))}

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
                                                        locationContext={locationContext}
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

                                    {/* Seção Patrocinados na sua região */}
                                    <SponsoredAdsCarousel
                                        ads={activeAds}
                                        slot={query ? "search" : "explore"}
                                        title="Patrocinados na sua região"
                                        className="mt-12 pt-8 border-t border-gray-100"
                                    />
                                </>
                            )}

                        </div>
                    </div>
                </div>

                {!hideHeaderAndFooter && <MarketplaceFooter />}
            </div>

            {/* FILTERS SHEET */}
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
                selectedRadius={selectedRadius}
                minPrice={minPrice}
                maxPrice={maxPrice}
                promoOn={promoOn}
                typeOptions={[
                    { value: "tudo", label: "Tudo" },
                    { value: "produtos", label: "Produtos" },
                    { value: "servicos", label: "Serviços" },
                    { value: "planos", label: "Assinaturas" },
                    { value: "vitrines", label: "Lojas" },
                ]}
                productCategories={productCategories}
                serviceCategories={dbServiceCategories}
                partnerCategories={dbPartnerCategories}
                filterConfig={filterConfig}
            />

            <ExplorarSortBottomSheet
                isOpen={isSortBottomSheetOpen}
                onClose={() => setIsSortBottomSheetOpen(false)}
                sortBy={sortBy as any}
                onSortChange={(val) => setSortBy(val as any)}
                sortOptions={contextualSortOptions}
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
                    {activeCategoriesList.map((cat) => {
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
