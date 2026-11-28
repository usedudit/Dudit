"use client"

import type React from "react"
import { useState, useRef, useEffect, useMemo, memo, useCallback, useTransition } from "react"
import Link from "next/link"
import { IntentPrefetchLink } from "@/components/navigation/IntentPrefetchLink"
import { useRouter, usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { ShoppingBagIcon, MapPinIcon, GlobeIcon, ChevronDownIcon, SearchIcon, CheckIcon, ChevronRightIcon, ChevronLeftIcon, Package, HeartIcon, ShareIcon, XIcon, MoonIcon, PlusIcon } from "@/lib/icons"
import { useSupabase } from "@/providers/supabase-provider"
import { Button } from "@/components/reusable/Button"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Input } from "@/components/reusable/Input"
import { Switch } from "@/components/reusable/Switch"
import BottomSheet from "@/components/BottomSheet"
import { getUserInitials, getAvatarColor, UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getSearchSuggestionsBucket, getMarketplaceAutocompleteAction } from "@/app/actions/marketplace/suggestions"
import { useUserSession } from "@/hooks/use-user-session"
import { useAddressSync } from "@/lib/utils/address-sync"
import { useTransitionDirection } from "@/providers/transition-provider"
import { useLocationRedirect } from "@/hooks/use-location-redirect"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { getCitiesData } from "@/lib/data/cities-loader"
import { ESTADO_MAP } from "@/components/marketplace/explorar-constants"
import { IconPlaceholder } from "../reusable"
import { GeneralFeedbackModal } from "@/components/feedback/GeneralFeedbackModal"
import { QuickAnnounceModal } from "@/components/marketplace/QuickAnnounceModal"
import { useModalLayer } from "@/lib/modal-stack"
import { logLogoutAction } from "@/app/actions/auth/audit"

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

// Cache em memória para sugestões e autocomplete entre montagens do Header
let cachedSuggestionBucket: { label: string; type: string }[] | null = null
const autocompleteCache = new Map<string, { label: string; type: string }[]>()

interface HeaderProps {
    setView?: (
        view:
            | "home"
            | "shop"
            | "cart"
            | "wishlist"
            | "account"
            | "account-info"
            | "account-address"
            | "product-details"
            | "vendor",
    ) => void
    currentView?: string
    userProfile?: { full_name: string | null; address: string | null; avatar_url?: string | null } | null
    cartCount?: number
    productName?: string
    onShare?: () => void
    onFavorite?: () => void
    isFavorite?: boolean
    favoriteButton?: React.ReactNode
    simpleTitle?: string
    storeSearchPlaceholder?: string
    storeSearchValue?: string
    onStoreSearchChange?: (value: string) => void
    vendorCategoryTitle?: string | null
    vendorCategorySearchOpen?: boolean
    vendorCategorySearchValue?: string
    onVendorCategorySearchChange?: (value: string) => void
    onVendorCategorySearchOpenChange?: (open: boolean) => void
    onVendorCategoryBack?: () => void
}

const Header: React.FC<HeaderProps> = ({
    setView,
    currentView,
    userProfile: serverUserProfile,
    cartCount: serverCartCount,
    productName,
    onShare,
    onFavorite,
    isFavorite,
    favoriteButton,
    simpleTitle,
    storeSearchPlaceholder,
    storeSearchValue,
    onStoreSearchChange,
    vendorCategoryTitle,
    vendorCategorySearchOpen,
    vendorCategorySearchValue,
    onVendorCategorySearchChange,
    onVendorCategorySearchOpenChange,
    onVendorCategoryBack,
}) => {
    const { user, supabase, isLoading: isSupabaseLoading } = useSupabase()

    const serverSessionData = useMemo(() => {
        if (serverUserProfile !== undefined || serverCartCount !== undefined) {
            return {
                profile: serverUserProfile ? {
                    full_name: serverUserProfile.full_name,
                    address: serverUserProfile.address,
                    avatar_url: serverUserProfile.avatar_url || null,
                } : null,
                cartCount: serverCartCount || 0,
            }
        }
        return undefined
    }, [serverUserProfile, serverCartCount])

    const { profile, cartCount, isLoading: isSessionLoading, mutate: mutateSession } = useUserSession(serverSessionData)

    useAddressSync(useCallback((_id, payload) => {
        if (payload?.citySlug) {
            setCitySlug(payload.citySlug)
        }
        void mutateSession()
    }, [mutateSession]))

    const isLoading = isSupabaseLoading || isSessionLoading
    const router = useRouter()
    const pathname = usePathname()

    const { setDirection } = useTransitionDirection()
    const isHome = useMemo(() => currentView === "home" || pathname === "/", [currentView, pathname])
    const showDeliveryInfo = useMemo(() => isHome || ["/perfil", "/pedidos", "/sacola"].includes(pathname) || pathname.startsWith("/explorar"), [isHome, pathname])

    const [searchValue, setSearchValue] = useState("")
    const [suggestionBucket, setSuggestionBucket] = useState<{ label: string; type: string }[]>(() => cachedSuggestionBucket || [])
    const [rpcSuggestions, setRpcSuggestions] = useState<{ label: string; type: string }[]>([])
    const [activeRpcQuery, setActiveRpcQuery] = useState("")
    const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false)
    const [isSearchInputFocused, setIsSearchInputFocused] = useState(false)
    const [suggestionsLoaded, setSuggestionsLoaded] = useState(() => !!cachedSuggestionBucket)
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
    const [isThemeTransitioning, setIsThemeTransitioning] = useState(false)
    const { theme, setTheme } = useTheme()
    const [isMobileUserMenuOpen, setIsMobileUserMenuOpen] = useState(false)
    const [isMobileCategoryMenuOpen, setIsMobileCategoryMenuOpen] = useState(false)
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
    const [isScrolled, setIsScrolled] = useState(false)
    const [isPending, startTransition] = useTransition()
    const { requestLocation, loading: isLocationLoading, error: locationError } = useLocationRedirect()

    const [isVisitorModalOpen, setIsVisitorModalOpen] = useState(false)
    const [showStateList, setShowStateList] = useState(false)
    const [showStateDropdown, setShowStateDropdown] = useState(false)
    const [selectedStateFilter, setSelectedStateFilter] = useState<string>("brasil")
    const [visitorSearchQuery, setVisitorSearchQuery] = useState("")
    const [isIpLoading, setIsIpLoading] = useState(false)
    const [citiesList, setCitiesList] = useState<string[]>([])
    const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false)
    const [citySlug, setCitySlug] = useState<string | null>(null)
    const stateDropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (typeof window === "undefined") return

        // 1. Explicit cookie has highest priority (respects "Usar minha localização" and manual city/state/Brasil picks)
        let stored: string | null = null
        const match = document.cookie.match(/(?:^|; )dudit_city=([^;]*)/)
        if (match && match[1]) {
            stored = decodeURIComponent(match[1])
        }

        // 2. Fallback to localStorage
        if (!stored) {
            try {
                stored = localStorage.getItem("dudit_city")
            } catch { }
        }

        // 3. Fallback to current URL path
        if (!stored && pathname) {
            const parts = pathname.split('/').filter(Boolean)
            if (parts[0] === 'explorar' && parts[1]) {
                stored = parts[1]
            } else if (
                parts.length >= 1 &&
                !['auth', 'erp', 'ddt-admin', 'pedidos', 'perfil', 'checkout', 'quote', 'print', 'entregadores', 'sacola', 'favoritos', 'colecoes', 'assinaturas', 'mapa', 'invite', 'institucional', 'ajuda', 'banned', 'brasil'].includes(parts[0]) &&
                /^[a-z0-9-]+-[a-z]{2}$/.test(parts[0])
            ) {
                stored = parts[0]
            }
        }

        if (stored) {
            setCitySlug(stored)
            return
        }

        // 4. Fallback to saved profile address only when no explicit browsing location is set
        if (profile?.citySlug && profile.citySlug !== "brasil" && !profile.citySlug.startsWith("estado-")) {
            setCitySlug(profile.citySlug)
            return
        }

        if (profile?.address && profile.address.includes(" - ") && profile.address !== "Brasil" && profile.address !== "Estado de São Paulo") {
            const [cityName, stateUf] = profile.address.split(" - ")
            if (cityName && stateUf && stateUf.trim().length === 2) {
                const normCity = cityName.trim()
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/(^-|-$)/g, "")
                setCitySlug(`${normCity}-${stateUf.trim().toLowerCase()}`)
            }
        }
    }, [pathname, profile])

    const handleOpenAnnounceModal = useCallback((e?: React.MouseEvent) => {
        if (e) e.preventDefault()
        setIsMobileCategoryMenuOpen(false)
        setIsAnnounceModalOpen(true)
    }, [])

    useEffect(() => {
        if (isVisitorModalOpen && citiesList.length === 0) {
            getCitiesData().then(setCitiesList)
        }
    }, [isVisitorModalOpen, citiesList.length])

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
        if (!isVisitorModalOpen) {
            setShowStateDropdown(false)
        }
    }, [isVisitorModalOpen])

    const filteredCities = useMemo(() => {
        if (!visitorSearchQuery || visitorSearchQuery.trim().length < 2 || citiesList.length === 0) return []
        const q = visitorSearchQuery
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[-\s]+/g, " ")
            .trim()
        return citiesList
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
    }, [visitorSearchQuery, citiesList, selectedStateFilter])

    const formatCitySlugForDisplay = (slug: string): string => {
        if (!slug) return ""
        if (slug === "brasil") return "Brasil"
        if (slug.startsWith("estado-")) {
            const uf = slug.replace("estado-", "").toLowerCase()
            return ESTADO_MAP[uf] || uf.toUpperCase()
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
    }

    const handleSelectCitySlug = (slug: string) => {
        document.cookie = `dudit_city=${slug}; path=/; max-age=${60 * 60 * 24 * 30}`
        localStorage.setItem('dudit_city', slug)
        if (currentView === 'home' || (typeof window !== 'undefined' && window.location.pathname === '/')) {
            window.location.reload()
        } else {
            window.location.href = `/explorar/${slug}`
        }
    }

    const handleIpLocation = async () => {
        setIsIpLoading(true)
        try {
            const res = await fetch("https://ipapi.co/json/")
            if (!res.ok) throw new Error("Falha ao buscar IP")
            const data = await res.json()
            if (data.city && data.region_code) {
                const cityStr = data.city
                const stateIso = data.region_code
                const uf = stateIso.toLowerCase()
                const formattedCity = cityStr
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '')
                const slug = `${formattedCity}-${uf}`

                document.cookie = `dudit_city=${slug}; path=/; max-age=${60 * 60 * 24 * 30}`
                localStorage.setItem('dudit_city', slug)
                if (currentView === 'home' || (typeof window !== 'undefined' && window.location.pathname === '/')) {
                    window.location.reload()
                } else {
                    window.location.href = `/explorar/${slug}`
                }
            } else {
                throw new Error("Dados de IP incompletos")
            }
        } catch (err) {
            console.warn("IP location failed, falling back to navigator geolocation:", err)
            requestLocation()
        } finally {
            setIsIpLoading(false)
        }
    }

    const renderVisitorModal = () => {
        if (!isVisitorModalOpen) return null

        return (
            <DefaultModal
                isOpen={isVisitorModalOpen}
                onClose={() => setIsVisitorModalOpen(false)}
                maxWidth="md"
                hideHeader={true}
            >
                <div className="flex flex-col relative">
                    {/* Close X Button - Desktop Only */}
                    <button
                        onClick={() => setIsVisitorModalOpen(false)}
                        className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-brand-dark dark:text-dark-heading transition-colors hidden md:flex"
                        title="Fechar"
                    >
                        <XIcon size={18} />
                    </button>

                    {/* Header with Dual Squares */}
                    <div className="h-[200px] rounded-2xl flex items-end justify-center mb-8 relative overflow-hidden bg-[#eaf7f0]">
                        <img
                            src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                            alt="Onde você está?"
                            className="w-64 h-auto object-contain transform translate-y-7"
                        />
                    </div>

                    <h4 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-4 text-center">Onde você está?</h4>
                    <p className="text-brand-inactive-text text-[15px] text-center mb-6 leading-relaxed dark:text-dark-body">
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
                                        <GlobeIcon className="w-4 h-4 text-brand-green" />
                                    ) : (
                                        <MapPinIcon className="w-4 h-4 text-brand-green" />
                                    )}
                                    <span>
                                        {selectedStateFilter === "brasil" ? "Brasil" : ESTADO_MAP[selectedStateFilter] || selectedStateFilter.toUpperCase()}
                                    </span>
                                </span>
                                <ChevronDownIcon className={`w-4 h-4 text-brand-inactive-text transition-transform ${showStateDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {showStateDropdown && (
                                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border">
                                    <button
                                        onClick={() => {
                                            setSelectedStateFilter("brasil")
                                            setShowStateDropdown(false)
                                            setVisitorSearchQuery("")
                                            handleSelectCitySlug("brasil")
                                        }}
                                        className="w-full text-left px-4 py-3 flex items-center gap-3 text-sm font-medium text-brand-dark dark:text-dark-heading hover:bg-brand-gray/10 dark:hover:bg-dark-border/20"
                                    >
                                        <GlobeIcon className="w-4 h-4 text-brand-green" />
                                        <span>Brasil (todos os estados)</span>
                                        {selectedStateFilter === "brasil" && <CheckIcon className="w-4 h-4 text-brand-green ml-auto" />}
                                    </button>
                                    {Object.entries(ESTADO_MAP).map(([uf, name]) => (
                                        <button
                                            key={uf}
                                            onClick={() => {
                                                setSelectedStateFilter(uf)
                                                setShowStateDropdown(false)
                                                setVisitorSearchQuery("")
                                                handleSelectCitySlug(`estado-${uf}`)
                                            }}
                                            className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark dark:text-dark-heading hover:bg-brand-gray/10 dark:hover:bg-dark-border/20"
                                        >
                                            <span className="flex items-center gap-3">
                                                <MapPinIcon className="w-4 h-4 text-brand-green" />
                                                {name}
                                            </span>
                                            {selectedStateFilter === uf && <CheckIcon className="w-4 h-4 text-brand-green" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* City search - filters by selected state */}
                        <div className="relative pt-2">
                            <Input
                                placeholder={selectedStateFilter === "brasil" ? "Buscar cidade... (ex: São Paulo, Bauru)" : `Buscar cidade em ${ESTADO_MAP[selectedStateFilter] || selectedStateFilter.toUpperCase()}...`}
                                value={visitorSearchQuery}
                                onChange={(e) => setVisitorSearchQuery(e.target.value)}
                                className="h-[42px] w-full"
                                variant="full-rounded"
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                            />
                            {filteredCities.length > 0 && (
                                <div className="flex flex-col gap-1 border-t pt-2">
                                    {filteredCities.map((slug) => (
                                        <button
                                            key={slug}
                                            onClick={() => handleSelectCitySlug(slug)}
                                            className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-brand-dark dark:text-dark-heading"
                                        >
                                            <span>{formatCitySlugForDisplay(slug)}</span>
                                            {citySlug === slug && <CheckIcon className="w-4 h-4 text-brand-green" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {visitorSearchQuery.trim().length >= 2 && filteredCities.length === 0 && citiesList.length > 0 && (
                                <p className="text-center text-xs text-brand-inactive-text py-3">
                                    Nenhuma cidade encontrada{selectedStateFilter !== "brasil" ? ` em ${ESTADO_MAP[selectedStateFilter]}` : ""}
                                </p>
                            )}
                        </div>
                    </div>

                    <Button
                        onClick={requestLocation}
                        disabled={isIpLoading || isLocationLoading}
                        variant="outline"
                        className="w-full mt-4"
                    >
                        <MapPinIcon className="w-4 h-4" />
                        <span>{isLocationLoading ? "Localizando..." : "Usar minha localização"}</span>
                    </Button>

                    {locationError && (
                        <p className="text-xs text-red-500 text-center mt-2">{locationError}</p>
                    )}

                    {/* Account / saved addresses footer */}
                    {user ? (
                        <div className="text-center mt-6 pt-4 border-t border-brand-border dark:border-dark-border">
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                Para cálculo de frete e entrega, use seus endereços salvos ou informe um CEP no produto.
                            </p>
                            <Button
                                onClick={() => {
                                    setIsVisitorModalOpen(false)
                                    router.push("/perfil?tab=enderecos")
                                }}
                                variant="link"
                                className="text-sm mt-1 inline-block"
                            >
                                Gerenciar meus endereços
                            </Button>
                        </div>
                    ) : (
                        <div className="text-center mt-8 pt-5 border-t border-brand-border dark:border-dark-border">
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                Já tem uma conta cadastrada com endereço salvo?
                            </p>
                            <Button
                                onClick={() => {
                                    setIsVisitorModalOpen(false)
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
            </DefaultModal>
        )
    }

    // DERIVED VALUES - useMemo instead of useState+useEffect to avoid extra re-render
    const { userName, fullName } = useMemo(() => {
        if (user) {
            if (profile?.full_name) {
                return { userName: profile.full_name.split(" ")[0], fullName: profile.full_name }
            }
            const fallback = user.email?.split("@")[0] || "Usuário"
            return { userName: fallback, fullName: fallback }
        }
        return { userName: "Visitante", fullName: "" }
    }, [user, profile?.full_name])

    const userLocation = useMemo(() => {
        if (citySlug) return formatCitySlugForDisplay(citySlug)
        if (profile?.address) return profile.address
        return null
    }, [citySlug, profile?.address])

    const searchContainerRef = useRef<HTMLDivElement>(null)
    const closeMenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const loadSuggestions = useCallback(async () => {
        if (cachedSuggestionBucket) {
            setSuggestionBucket(cachedSuggestionBucket)
            setSuggestionsLoaded(true)
            return
        }
        try {
            const bucket = await getSearchSuggestionsBucket()
            cachedSuggestionBucket = bucket
            setSuggestionBucket(bucket)
            setSuggestionsLoaded(true)
        } catch (error) {
            console.error("Error loading search suggestions:", error)
        }
    }, [])

    // LAZY LOAD: Carrega o bucket no foco desktop OU quando a busca mobile/tablet abrir
    useEffect(() => {
        if ((!isSearchInputFocused && !isMobileSearchOpen) || suggestionsLoaded) return
        void loadSuggestions()
    }, [isSearchInputFocused, isMobileSearchOpen, suggestionsLoaded, loadSuggestions])

    useEffect(() => {
        const trimmed = searchValue.trim()
        const lowerTrimmed = trimmed.toLowerCase()
        if (lowerTrimmed.length < 2) {
            setRpcSuggestions([])
            setActiveRpcQuery("")
            setIsAutocompleteLoading(false)
            return
        }

        // Cache instantâneo (0ms)
        if (autocompleteCache.has(lowerTrimmed)) {
            setRpcSuggestions(autocompleteCache.get(lowerTrimmed)!)
            setActiveRpcQuery(lowerTrimmed)
            setIsAutocompleteLoading(false)
            return
        }

        setIsAutocompleteLoading(true)
        let cancelled = false

        const timer = setTimeout(async () => {
            try {
                const results = await getMarketplaceAutocompleteAction(trimmed)
                if (!cancelled) {
                    autocompleteCache.set(lowerTrimmed, results)
                    setRpcSuggestions(results)
                    setActiveRpcQuery(lowerTrimmed)
                    setIsAutocompleteLoading(false)
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("Error loading autocomplete:", error)
                    setIsAutocompleteLoading(false)
                }
            }
        }, 180)

        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [searchValue])

    const filteredSuggestions = useMemo(() => {
        const trimmed = searchValue.trim()
        if (!trimmed) return []
        const lowerTrimmed = trimmed.toLowerCase()

        // Se o RPC retornou sugestões para a busca atual, usa elas:
        if (activeRpcQuery === lowerTrimmed && rpcSuggestions.length > 0) {
            return rpcSuggestions.slice(0, 8)
        }

        // Fallback instantâneo (0ms) a partir do bucket local
        return suggestionBucket
            .filter((item) => item.label.toLowerCase().includes(lowerTrimmed))
            .slice(0, 8)
    }, [suggestionBucket, searchValue, rpcSuggestions, activeRpcQuery])

    const showSearchDropdown = isSearchInputFocused && searchValue.length > 0 && filteredSuggestions.length > 0
    const showOverlay = isSearchInputFocused || isUserMenuOpen

    // z-index dinâmico: a busca mobile em tela cheia abre acima de tudo que já estava aberto.
    // (o backdrop z-[90] fica de propósito ATRÁS do <header> z-[100] - ele escurece a página
    // enquanto o dropdown de busca/menu está aberto - por isso não recebe z-index dinâmico)
    const zIndex = useModalLayer(isMobileSearchOpen)

    useEffect(() => {
        let ticking = false

        const updateScrolled = () => {
            const shouldBeScrolled = window.scrollY > 10
            setIsScrolled((prev) => (prev !== shouldBeScrolled ? shouldBeScrolled : prev))
            ticking = false
        }

        const handleScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(updateScrolled)
                ticking = true
            }
        }

        window.addEventListener("scroll", handleScroll, { passive: true })
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setIsSearchInputFocused(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    // ✅ FIX: prefetch removido do focus - era o principal gerador de _rsc requests extras na Vercel.
    // Se quiser manter prefetch, use no hover do botão de busca (não no focus do input).
    const handleSearchFocus = useCallback(() => {
        setIsSearchInputFocused(true)
        setIsUserMenuOpen(false)
        void loadSuggestions()
    }, [loadSuggestions])

    const handleCloseMobileSearch = useCallback(() => {
        setIsMobileSearchOpen(false)
        setIsSearchInputFocused(false)
        setSearchValue("")
        setRpcSuggestions([])
        setActiveRpcQuery("")
        setIsAutocompleteLoading(false)
    }, [])

    const handleUserMouseEnter = useCallback(() => {
        if (closeMenuTimer.current) {
            clearTimeout(closeMenuTimer.current)
            closeMenuTimer.current = null
        }
        setIsUserMenuOpen(true)
    }, [])

    const handleUserMouseLeave = useCallback(() => {
        closeMenuTimer.current = setTimeout(() => {
            setIsUserMenuOpen(false)
        }, 150)
    }, [])

    const handleThemeToggle = useCallback(() => {
        if (isThemeTransitioning) return

        const newTheme = theme === "dark" ? "light" : "dark"

        // @ts-ignore
        if (!document.startViewTransition) {
            setTheme(newTheme)
            return
        }

        const x = window.innerWidth - 24
        const y = 24
        const endRadius = Math.hypot(x, window.innerHeight - y)

        setIsThemeTransitioning(true)

        // @ts-ignore
        const transition = document.startViewTransition(() => {
            setTheme(newTheme)
        })

        transition.ready.then(() => {
            const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
            document.documentElement.animate(
                { clipPath: clipPath },
                {
                    duration: 500,
                    easing: "ease-in-out",
                    pseudoElement: "::view-transition-new(root)",
                },
            )
        })

        transition.finished.finally(() => {
            setIsThemeTransitioning(false)
        })
    }, [isThemeTransitioning, theme, setTheme])

    const handleSearch = useCallback((query: string = searchValue) => {
        const trimmed = query.trim()
        if (!trimmed) return
        setIsSearchInputFocused(false)
        setIsMobileSearchOpen(false)
        setDirection("forward")
        startTransition(() => {
            // O servidor resolve o escopo (cidade do usuário/cookie/Brasil) e mantém o ?q=.
            router.push(`/explorar?q=${encodeURIComponent(trimmed)}`)
        })
    }, [searchValue, router, setDirection])

    // Get navigation links with city included
    const navigationLinks = useMemo(() => {
        const exploreBase = citySlug ? `/explorar/${citySlug}` : "/explorar"
        return [
            { label: "Produtos", href: `${exploreBase}?type=produtos` },
            { label: "Serviços", href: `${exploreBase}?type=servicos` },
        ]
    }, [citySlug])

    const desktopNavigationLinks = useMemo(() => {
        const exploreBase = citySlug ? `/explorar/${citySlug}` : "/explorar"
        return [
            { label: "Produtos", href: `${exploreBase}?type=produtos` },
            { label: "Serviços", href: `${exploreBase}?type=servicos` },
        ]
    }, [citySlug])

    const handleSignOut = useCallback(async () => {
        document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
        localStorage.removeItem("dudit_city")
        try {
            await logLogoutAction()
        } catch {
            // Audit logging must never block logout.
        }
        await supabase.auth.signOut({ scope: 'local' })
        setIsUserMenuOpen(false)
        setIsMobileUserMenuOpen(false)
        window.location.href = "/"
    }, [supabase])

    const handleGoBack = useCallback(() => {
        setDirection("back")
        if (window.history.length > 1) {
            router.back()
        } else {
            router.push("/")
        }
    }, [router, setDirection])

    const renderMobileHeader = () => {
        const isProductDetail = !!productName

        if (simpleTitle) {
            return (
                <header className="lg:hidden fixed top-0 inset-x-0 w-full max-w-full z-50 bg-brand-dark dark:bg-dark-surface border-b border-white/10 overflow-hidden">
                    <div className="w-full max-w-full px-4 py-3 flex items-center justify-between min-h-[50px]">
                        <button onClick={handleGoBack} className="shrink-0 text-white p-1 -ml-1">
                            <ChevronLeftIcon size={18} strokeWidth={2.5} />
                        </button>
                        <div className="flex-1 text-center min-w-0">
                            <h1 className="text-white font-bold text-[16px] truncate px-4">
                                {simpleTitle}
                            </h1>
                        </div>
                    </div>
                </header>
            )
        }

        const isVendorPage = !!storeSearchPlaceholder && !vendorCategoryTitle
        const isTransparentHeader = (isProductDetail || isVendorPage) && !isScrolled && !vendorCategoryTitle

        return (
            <header className={`lg:hidden fixed top-0 inset-x-0 w-full max-w-full z-50 overflow-hidden transition-all duration-300 ${isTransparentHeader ? "bg-transparent" : "bg-brand-dark dark:bg-dark-surface border-b border-white/10"}`}>
                <div className="w-full max-w-full px-4 pt-2 pb-2">
                    <div className="flex items-center gap-3 relative min-h-[36px]">
                        {/* Back Button */}
                        {(!isHome || isProductDetail) ? (
                            <Button
                                variant={isTransparentHeader ? "filled" : "ghost"}
                                size="icon"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (vendorCategoryTitle && onVendorCategoryBack) {
                                        onVendorCategoryBack()
                                    } else {
                                        handleGoBack()
                                    }
                                }}
                            >
                                <ChevronLeftIcon size={18} className={`${isTransparentHeader ? "text-brand-dark dark:text-dark-heading" : "text-white"}`} strokeWidth={2.5} />
                            </Button>
                        ) : user ? (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsMobileUserMenuOpen(true)
                                }}
                                className="shrink-0 focus:outline-none"
                            >
                                <UserProfileImage
                                    fullName={fullName}
                                    className="w-9 h-9 border border-white/10"
                                />
                            </button>
                        ) : (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    router.push("/auth/login")
                                }}
                                className="shrink-0 focus:outline-none"
                            >
                                <div className="w-9 h-9 rounded-full border border-white/20 bg-white/10 flex items-center justify-center">
                                    <span className="text-xs text-white/60">?</span>
                                </div>
                            </button>
                        )}

                        {/* Middle Section: Search or Product Name */}
                        <div className="flex-1 flex items-center justify-start min-w-0 transition-all duration-300">
                            {isProductDetail && vendorCategoryTitle ? (
                                <div className="relative w-full h-[36px] overflow-hidden">
                                    <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${vendorCategorySearchOpen ? "opacity-0 -translate-x-6 pointer-events-none" : "opacity-100 translate-x-0"}`}>
                                        <h1 className="text-white font-bold text-[15px] truncate px-2">{vendorCategoryTitle}</h1>
                                    </div>
                                    <div className={`absolute inset-y-0 right-0 z-20 bg-white rounded-full flex items-center px-4 border border-gray-200 transition-all duration-300 ease-out ${vendorCategorySearchOpen ? "-left-[52px] opacity-100" : "left-full opacity-0 pointer-events-none"}`}>
                                        <SearchIcon size={18} className="text-brand-green mr-2 shrink-0" />
                                        <input
                                            type="text"
                                            placeholder={`Buscar em ${vendorCategoryTitle}`}
                                            className="bg-transparent border-none outline-none text-brand-dark text-[14px] w-full placeholder-gray-400 font-normal py-0"
                                            value={vendorCategorySearchValue ?? ""}
                                            onChange={(e) => onVendorCategorySearchChange?.(e.target.value)}
                                        />
                                    </div>
                                </div>
                            ) : isProductDetail && storeSearchPlaceholder ? (
                                <div className={`bg-white h-[36px] rounded-full flex items-center px-4 w-full border border-gray-200 ${isScrolled ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
                                    <SearchIcon size={18} className="text-brand-green mr-2 shrink-0" />
                                    <input
                                        type="text"
                                        placeholder={storeSearchPlaceholder}
                                        className="bg-transparent border-none outline-none text-brand-dark text-[14px] w-full placeholder-gray-400 font-normal py-0"
                                        value={storeSearchValue ?? ""}
                                        onChange={(e) => onStoreSearchChange?.(e.target.value)}
                                    />
                                </div>
                            ) : isProductDetail ? (
                                <div className={`flex-1 flex items-center justify-start min-w-0 transition-all duration-300 ${isScrolled ? "opacity-100" : "opacity-0"}`}>
                                    <h1 className={`font-bold text-[15px] truncate text-left px-2 transition-all duration-300 ${isScrolled ? "text-white" : "text-brand-dark"}`}>
                                        {productName}
                                    </h1>
                                </div>
                            ) : (
                                <button
                                    onClick={() => {
                                        setIsMobileSearchOpen(true)
                                        setIsSearchInputFocused(true)
                                        void loadSuggestions()
                                    }}
                                    className="bg-white h-[36px] rounded-full flex items-center px-3.5 w-full border border-gray-200 cursor-text hover:border-brand-green/40 transition-colors min-w-0"
                                >
                                    <SearchIcon size={18} className="text-brand-green mr-2 shrink-0" />
                                    <span className="text-brand-dark text-[14px] placeholder-gray-400 font-normal truncate">Buscar na Dudit</span>
                                </button>
                            )}
                        </div>

                        {/* Right Section: Actions (Share/Favorite) or Cart */}
                        <div className="flex items-center gap-2 shrink-0 z-10">
                            {isProductDetail && vendorCategoryTitle ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onVendorCategorySearchOpenChange?.(!vendorCategorySearchOpen)
                                    }}
                                    className="w-8 h-8 flex items-center justify-center text-white"
                                >
                                    {vendorCategorySearchOpen ? <span className="text-[22px] leading-none">×</span> : <SearchIcon size={18} />}
                                </button>
                            ) : isProductDetail && storeSearchPlaceholder ? (
                                onShare ? (
                                    <Button
                                        variant={isTransparentHeader ? "filled" : "ghost"}
                                        onClick={(e) => { e.stopPropagation(); onShare?.(); }}
                                        size="icon"
                                    >
                                        <ShareIcon size={18} className={`${isTransparentHeader ? "text-brand-dark dark:text-dark-heading" : "text-white"}`} />
                                    </Button>
                                ) : <div className="w-1" />
                            ) : isProductDetail ? (
                                <>
                                    {onShare && (
                                        <Button
                                            variant={isTransparentHeader ? "filled" : "ghost"}
                                            onClick={(e) => { e.stopPropagation(); onShare?.(); }}
                                            size="icon"
                                        >
                                            <ShareIcon size={18} className={`${isTransparentHeader ? "text-brand-dark dark:text-dark-heading" : "text-white"}`} />
                                        </Button>
                                    )}
                                    {favoriteButton ? (
                                        favoriteButton
                                    ) : onFavorite ? (
                                        <Button
                                            variant={isTransparentHeader ? "filled" : "ghost"}
                                            onClick={(e) => { e.stopPropagation(); onFavorite?.(); }}
                                            size="icon"
                                        >
                                            <HeartIcon size={18} className={`${isTransparentHeader ? "text-brand-dark dark:text-dark-heading" : "text-white"} ${isFavorite ? "fill-current" : ""}`} />
                                        </Button>
                                    ) : null}
                                </>
                            ) : (
                                <>
                                    <IntentPrefetchLink
                                        href="/sacola"
                                        aria-label={cartCount > 0 ? `Sacola (${cartCount} itens)` : "Sacola"}
                                        className="shrink-0 relative text-white p-1 flex items-center justify-center cursor-pointer"
                                    >
                                        <ShoppingBagIcon size={18} strokeWidth={2} />
                                        {cartCount > 0 && (
                                            <span className="absolute -top-1 -right-1 bg-brand-orange text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center border border-brand-dark">
                                                {cartCount}
                                            </span>
                                        )}
                                    </IntentPrefetchLink>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Delivery Info */}
                    {(!isScrolled && showDeliveryInfo && !isProductDetail) && (
                        <div className="flex items-center justify-between mt-2.5 gap-2 min-w-0">
                            <button
                                type="button"
                                onClick={() => setIsVisitorModalOpen(true)}
                                className="flex items-center gap-1.5 text-brand-inactive-text cursor-pointer overflow-hidden hover:opacity-80 transition-opacity min-w-0 flex-1 text-left"
                            >
                                <MapPinIcon size={14} className="shrink-0 text-white" />
                                <span className="text-[12px] font-normal truncate text-white">
                                    {userLocation ? `Buscando em ${userLocation}` : "Escolher localização"}
                                </span>
                                <ChevronRightIcon size={14} className="opacity-60 shrink-0 text-white" />
                            </button>
                            <button
                                type="button"
                                onClick={handleOpenAnnounceModal}
                                className="shrink-0 text-brand-orange font-bold text-[12px] flex items-center gap-0.5 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity"
                            >
                                <PlusIcon size={14} />
                                <span>Anunciar<span className="hidden min-[360px]:inline">&nbsp;grátis</span></span>
                            </button>
                        </div>
                    )}
                </div>
            </header >
        )
    }

    return (
        <>
            <div
                className={`fixed inset-0 bg-black/60 z-[90] transition-opacity duration-300 ease-in-out ${showOverlay ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
            />

            {renderMobileHeader()}

            {/* Mobile Full-Screen Search Overlay */}
            {isMobileSearchOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-[200] bg-white dark:bg-dark-surface flex flex-col"
                    style={{ zIndex }}
                >
                    <div className="w-full max-w-3xl mx-auto flex flex-col h-full">
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-dark-border">
                            <button
                                onClick={handleCloseMobileSearch}
                                className="shrink-0 text-brand-dark dark:text-dark-heading hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
                                title="Voltar"
                            >
                                <ChevronLeftIcon size={20} />
                            </button>

                            <form
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    handleSearch(searchValue)
                                }}
                                className="flex-1 flex items-center h-[40px] bg-brand-gray dark:bg-dark-border/30 rounded-full px-3"
                            >
                                <button
                                    type="submit"
                                    aria-label="Buscar"
                                    className="text-brand-green dark:text-brand-green shrink-0 p-1 mr-1 hover:opacity-80 transition-opacity"
                                    title="Buscar"
                                >
                                    <SearchIcon size={18} />
                                </button>

                                <input
                                    type="search"
                                    autoFocus
                                    enterKeyHint="search"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    placeholder="Buscar na Dudit"
                                    className="marketplace-search-input bg-transparent border-none outline-none text-brand-dark dark:text-dark-heading text-[15px] w-full placeholder-gray-400 dark:placeholder-gray-500 font-normal py-0"
                                    value={searchValue}
                                    onFocus={handleSearchFocus}
                                    onChange={(e) => setSearchValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault()
                                            handleSearch(searchValue)
                                        }
                                    }}
                                />

                                {searchValue.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchValue("")
                                            setRpcSuggestions([])
                                            setActiveRpcQuery("")
                                        }}
                                        className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                                        title="Limpar busca"
                                    >
                                        <XIcon size={18} />
                                    </button>
                                )}
                            </form>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {/* Linha de ação rápida: Buscar pelo termo digitado */}
                            {searchValue.trim().length > 0 && (
                                <button
                                    type="button"
                                    className="w-full flex items-center gap-3 px-5 py-3.5 bg-brand-green/5 dark:bg-brand-green/10 hover:bg-brand-green/10 transition-colors text-left border-b border-gray-100 dark:border-dark-border"
                                    onClick={() => handleSearch(searchValue)}
                                >
                                    <SearchIcon size={18} className="text-brand-green shrink-0" />
                                    <span className="text-[15px] font-medium text-brand-green flex-1 min-w-0 truncate">
                                        Buscar por &ldquo;{searchValue.trim()}&rdquo;
                                    </span>
                                    <ChevronRightIcon size={16} className="text-brand-green shrink-0" />
                                </button>
                            )}

                            {filteredSuggestions.length > 0 ? (
                                <div className="divide-y divide-gray-50 dark:divide-dark-border">
                                    {filteredSuggestions.map((suggestion, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-brand-gray dark:hover:bg-dark-border/30 transition-colors text-left"
                                            onClick={() => {
                                                setSearchValue(suggestion.label)
                                                handleSearch(suggestion.label)
                                            }}
                                        >
                                            <SearchIcon
                                                size={18}
                                                className="text-brand-inactive-text dark:text-dark-body shrink-0"
                                            />

                                            <span className="text-[15px] text-brand-dark dark:text-dark-heading flex-1 min-w-0 truncate">
                                                {suggestion.label}
                                            </span>

                                            <ChevronRightIcon
                                                size={16}
                                                className="text-brand-inactive-text dark:text-dark-body shrink-0"
                                            />
                                        </button>
                                    ))}
                                </div>
                            ) : searchValue.trim().length >= 2 ? (
                                isAutocompleteLoading ? (
                                    <div className="flex flex-col items-center justify-center py-12 px-6">
                                        <div className="flex items-center gap-2 text-brand-inactive-text dark:text-dark-body text-sm">
                                            <div className="w-4 h-4 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                                            <span>Buscando sugestões...</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-16 px-6">
                                        <IconPlaceholder
                                            icon={SearchIcon}
                                            title={`Nenhuma sugestão para "${searchValue}"`}
                                            itemButton={{
                                                text: "Buscar mesmo assim",
                                                action: () => {
                                                    handleSearch(searchValue)
                                                },
                                            }}
                                        />
                                    </div>
                                )
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {isMobileUserMenuOpen && (
                <BottomSheet isOpen={isMobileUserMenuOpen} onClose={() => setIsMobileUserMenuOpen(false)}>
                    <div className="flex flex-col">
                        <div className="px-6 py-5 border-b border-brand-border dark:border-dark-border flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full overflow-hidden border border-brand-border dark:border-dark-border shrink-0 flex items-center justify-center font-semibold text-white ${getAvatarColor(fullName)}`}>
                                {getUserInitials(fullName)}
                            </div>
                            <h3 className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">{userName}</h3>
                        </div>

                        <div className="py-2">
                            {([
                                { label: "Meu Perfil", href: "/perfil", prefetch: false },
                                { label: "Meus Favoritos", href: "/favoritos", prefetch: false },
                                { label: "Minhas Assinaturas", href: "/assinaturas", prefetch: false },
                                { label: "Minhas Avaliações", href: "/perfil?tab=avaliacoes", prefetch: false },
                                { label: "Minhas Coleções", href: "/colecoes", prefetch: false },
                                { label: "Central do Vendedor", href: "/erp/trocar-erp", prefetch: false },
                                { label: "Enviar Feedback", action: () => { setIsMobileUserMenuOpen(false); setIsFeedbackOpen(true); } },
                            ] as any[]).map((item, idx) => {
                                const ItemWrapper: any = item.href ? Link : "div";
                                const wrapProps = item.href
                                    ? { href: item.href, prefetch: item.prefetch }
                                    : { onClick: item.action || item.onClick };

                                return (
                                    <ItemWrapper
                                        key={idx}
                                        {...wrapProps}
                                        className="px-6 py-3 hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors block w-full text-left"
                                        onClick={() => {
                                            if (wrapProps.onClick) wrapProps.onClick();
                                            setIsMobileUserMenuOpen(false);
                                        }}
                                    >
                                        <span className="text-[15px] font-normal text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading">{item.label}</span>
                                    </ItemWrapper>
                                )
                            })}

                            <div className="border-t border-brand-border dark:border-dark-border pt-2">
                                <div className="px-6 py-2.5 flex items-center justify-between">
                                    <span className="text-[14px] font-normal text-brand-inactive-text dark:text-dark-body">Modo escuro</span>
                                    <Switch checked={theme === "dark"} onCheckedChange={handleThemeToggle} />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-brand-border dark:border-dark-border py-2 mt-auto">
                            <div
                                className="px-6 py-3 hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors"
                                onClick={handleSignOut}
                            >
                                <span className="text-[14px] font-normal text-brand-red">Sair da sessão</span>
                            </div>
                        </div>
                    </div>
                </BottomSheet>
            )}

            {isMobileCategoryMenuOpen && (
                <BottomSheet isOpen={isMobileCategoryMenuOpen} onClose={() => setIsMobileCategoryMenuOpen(false)}>
                    <div className="flex flex-col py-2">
                        {navigationLinks.map((link) => (
                            <IntentPrefetchLink
                                key={link.label}
                                href={link.href}
                                onClick={() => setIsMobileCategoryMenuOpen(false)}
                                className="px-6 py-3 text-[15px] font-normal text-brand-inactive-text hover:bg-brand-gray hover:text-brand-dark transition-colors"
                            >
                                {link.label}
                            </IntentPrefetchLink>
                        ))}
                        <div className="border-t border-gray-100 mt-2 pt-2">
                            <button
                                type="button"
                                onClick={handleOpenAnnounceModal}
                                className="w-full text-left px-6 py-3 font-bold text-brand-orange hover:bg-brand-gray cursor-pointer text-[15px] flex items-center justify-between transition-colors"
                            >
                                <span>Anunciar grátis</span>
                                <ChevronRightIcon size={16} />
                            </button>
                        </div>
                    </div>
                </BottomSheet>
            )}

            <header className="hidden lg:flex flex-col w-full bg-brand-dark dark:bg-dark-surface border-b border-white/10 fixed top-0 left-0 right-0 z-[100] shadow-md">
                <div className="w-full h-[68px] flex items-center justify-between max-w-[1400px] px-2 mx-auto gap-4">
                    <IntentPrefetchLink href="/" className="cursor-pointer shrink-0 z-[110] pt-1">
                        <img
                            src="https://img.dudit.com.br/cdn-cgi/image/width=140,format=auto,quality=80/static/Logo.png"
                            alt="Dudit"
                            width={120}
                            height={40}
                            fetchPriority="high"
                            className="h-10 w-[120px] object-contain"
                        />
                    </IntentPrefetchLink>

                    <button
                        type="button"
                        onClick={() => setIsVisitorModalOpen(true)}
                        className="flex flex-col justify-center items-start text-white hover:bg-white/10 rounded-md px-2 py-1.5 cursor-pointer min-w-[140px] transition-colors -ml-1"
                    >
                        {userLocation ? (
                            <span className="text-[11px] text-gray-300 leading-none ml-4 block mb-0.5">
                                Buscando em
                            </span>
                        ) : null}
                        <div className="flex items-center gap-1">
                            <MapPinIcon size={16} className="text-white shrink-0" strokeWidth={2.5} />
                            <span className="text-[13px] font-bold leading-none truncate max-w-[160px]">
                                {userLocation || "Escolher localização"}
                            </span>
                        </div>
                    </button>

                    <div className="flex-1 relative z-[110] mx-4 h-[42px]" ref={searchContainerRef}>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault()
                                handleSearch()
                            }}
                            className="relative flex items-center w-full h-full bg-white rounded-full transition-all duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.12)]"
                        >
                            <input
                                type="search"
                                className="marketplace-search-input flex-1 h-full bg-transparent border-none outline-none text-brand-dark placeholder-gray-400 text-[15px] px-5 w-full font-normal rounded-l-full"
                                placeholder="Buscar produtos, marcas e muito mais..."
                                onFocus={handleSearchFocus}
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            />

                            <Button
                                type="submit"
                                aria-label="Buscar"
                                onClick={() => handleSearch()}
                                className="h-[34px] w-[34px] p-0 flex items-center justify-center mr-1 rounded-full bg-brand-green hover:bg-brand-green/90"
                            >
                                <SearchIcon size={18} className="text-white" />
                            </Button>
                        </form>

                        {showSearchDropdown && (
                            <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-white dark:bg-dark-surface rounded-[16px] shadow-xl border border-gray-100 dark:border-dark-border overflow-hidden animate-fade-in z-[120]">
                                {filteredSuggestions.map((suggestion, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center gap-3 px-5 py-3 hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer text-brand-inactive-text dark:text-dark-body group"
                                        onClick={() => {
                                            setSearchValue(suggestion.label)
                                            handleSearch(suggestion.label)
                                        }}
                                    >
                                        <SearchIcon size={16} className="text-gray-300 group-hover:text-brand-green" />
                                        <span className="text-[14px]">{suggestion.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-6 z-[110] shrink-0">

                        <div className="relative group" onMouseEnter={handleUserMouseEnter} onMouseLeave={handleUserMouseLeave}>
                            {user ? (
                                <div
                                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => setView?.("account")}
                                >
                                    <div className={`w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-white overflow-hidden font-semibold text-sm ${getAvatarColor(fullName)} relative`}>
                                        {getUserInitials(fullName)}
                                    </div>
                                    <div className="flex flex-col text-white">
                                        <span className="text-[11px] font-normal">Olá, {userName}</span>
                                        <div className="flex items-center">
                                            <span className="text-[13px] font-bold">Minha conta</span>
                                            <ChevronDownIcon size={14} className={`ml-1 text-brand-green transition-transform duration-300 ${isUserMenuOpen ? "rotate-180" : ""}`} />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => router.push("/auth/login")}
                                >
                                    <div className="w-9 h-9 rounded-full border border-gray-200 bg-white flex items-center justify-center text-brand-green">
                                        <span className="text-sm">?</span>
                                    </div>
                                    <div className="flex flex-col text-white">
                                        <span className="text-[11px] font-normal">Olá, visitante</span>
                                        <span className="text-[13px] font-bold">Entrar</span>
                                    </div>
                                </div>
                            )}

                            {isUserMenuOpen && user && (
                                <div className="absolute top-[calc(100%+12px)] left-1/2 -translate-x-1/2 w-[280px] bg-white dark:bg-dark-surface rounded-[8px] shadow-[0_8px_30px_rgba(0,0,0,0.15)] border border-gray-100 dark:border-dark-border overflow-visible animate-fade-in flex flex-col">
                                    <div className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-dark-surface border-t border-l border-gray-100 dark:border-dark-border transform rotate-45" />

                                    <div className="px-5 py-5 border-b border-gray-100 dark:border-dark-border flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full overflow-hidden border border-gray-100 dark:border-dark-border shrink-0 flex items-center justify-center font-semibold text-white ${getAvatarColor(fullName)}`}>
                                            {getUserInitials(fullName)}
                                        </div>
                                        <h3 className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">{userName}</h3>
                                    </div>

                                    <div className="py-2">
                                        {([
                                            { label: "Meu Perfil", href: "/perfil", prefetch: false },
                                            { label: "Meus Favoritos", href: "/favoritos", prefetch: false },
                                            { label: "Minhas Assinaturas", href: "/assinaturas", prefetch: false },
                                            { label: "Minhas Avaliações", href: "/perfil?tab=avaliacoes", prefetch: false },
                                            { label: "Minhas Coleções", href: "/colecoes", prefetch: false },
                                            { label: "Central do Vendedor", href: "/erp/trocar-erp", prefetch: false },
                                            { label: "Enviar Feedback", action: () => { setIsUserMenuOpen(false); setIsFeedbackOpen(true); } },
                                        ] as any[]).map((item, idx) => {
                                            const ItemWrapper: any = item.href ? Link : "div";
                                            const wrapProps = item.href
                                                ? { href: item.href, prefetch: item.prefetch }
                                                : { onClick: item.action || item.onClick };

                                            return (
                                                <ItemWrapper
                                                    key={idx}
                                                    {...wrapProps}
                                                    className="px-6 py-2.5 hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors block w-full text-left"
                                                    onClick={() => {
                                                        if (wrapProps.onClick) wrapProps.onClick();
                                                        setIsUserMenuOpen(false)
                                                    }}
                                                >
                                                    <span className="text-[14px] font-normal text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading">{item.label}</span>
                                                </ItemWrapper>
                                            )
                                        })}
                                    </div>

                                    <div className="border-t border-brand-border dark:border-dark-border py-2">
                                        <div className="px-6 py-2.5 flex items-center justify-between">
                                            <span className="text-[14px] font-normal text-brand-inactive-text dark:text-dark-body">Modo escuro</span>
                                            <Switch checked={theme === "dark"} onCheckedChange={handleThemeToggle} />
                                        </div>
                                    </div>

                                    <div className="border-t border-brand-border dark:border-dark-border py-2 mt-auto">
                                        <div
                                            className="px-6 py-3 hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors"
                                            onClick={handleSignOut}
                                        >
                                            <span className="text-[14px] font-normal text-brand-red">Sair da sessão</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {user && <NotificationBell variant="marketplace" />}

                        <IntentPrefetchLink href="/pedidos" aria-label="Meus pedidos" className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity text-white">
                            <Package size={18} aria-hidden="true" />
                            <span className="text-[13px] font-medium hidden xl:block">Pedidos</span>
                        </IntentPrefetchLink>

                        <IntentPrefetchLink
                            href="/sacola"
                            aria-label={cartCount > 0 ? `Sacola (${cartCount} itens)` : "Sacola"}
                            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity text-white"
                        >
                            <div className="relative">
                                <ShoppingBagIcon size={18} aria-hidden="true" />
                                {cartCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-brand-orange text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center border border-brand-dark">
                                        {cartCount}
                                    </span>
                                )}
                            </div>
                            <span className="text-[13px] font-medium hidden xl:block">Sacola</span>
                        </IntentPrefetchLink>
                    </div>
                </div>

                <div className="w-full h-[40px] bg-brand-dark dark:bg-dark-surface flex items-center max-w-[1400px] mx-auto text-white text-[13px] border-t border-white/10">
                    <div className="flex items-center gap-1 h-full overflow-x-auto no-scrollbar">
                        {desktopNavigationLinks.map((link) => (
                            <IntentPrefetchLink
                                key={link.label}
                                href={link.href}
                                className="px-3 py-1.5 whitespace-nowrap rounded-full hover:bg-white/10 transition-all font-normal"
                            >
                                {link.label}
                            </IntentPrefetchLink>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={handleOpenAnnounceModal}
                        className="ml-auto font-bold text-brand-orange hover:text-brand-orange/70 cursor-pointer text-[13px] flex items-center gap-1 py-1"
                    >
                        <span>Anunciar grátis</span>
                        <ChevronRightIcon size={14} />
                    </button>
                </div>
            </header>

            <QuickAnnounceModal
                isOpen={isAnnounceModalOpen}
                onClose={() => setIsAnnounceModalOpen(false)}
                userProfile={profile}
            />

            {renderVisitorModal()}
            <GeneralFeedbackModal
                isOpen={isFeedbackOpen}
                onClose={() => setIsFeedbackOpen(false)}
            />
        </>
    )
}

export { MemoizedHeader as MarketplaceHeader }
const MemoizedHeader = memo(Header)
export default MemoizedHeader
