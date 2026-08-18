"use client"

import type React from "react"
import { useState, useRef, useEffect, useMemo, memo, useCallback, useTransition } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { ShoppingBagIcon, MapPinIcon, ChevronDownIcon, SearchIcon, ChevronRightIcon, ChevronLeftIcon, Package, HeartIcon, ShareIcon, XIcon, MoonIcon } from "@/lib/icons"
import { useSupabase } from "@/providers/supabase-provider"
import { Button } from "@/components/reusable/Button"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Input } from "@/components/reusable/Input"
import { InfoCard } from "@/components/reusable/InfoCard"
import { Switch } from "@/components/reusable/Switch"
import BottomSheet from "@/components/BottomSheet"
import { getUserInitials, getAvatarColor } from "@/lib/utils/UserProfileImage"
import { getSearchSuggestionsBucket, getMarketplaceAutocompleteAction } from "@/app/actions/marketplace/suggestions"
import { useUserSession } from "@/hooks/use-user-session"
import { useTransitionDirection } from "@/providers/transition-provider"
import { useLocationRedirect } from "@/hooks/use-location-redirect"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { getCitiesData } from "@/lib/data/cities-loader"

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
    userProfile?: { full_name: string | null; address: string | null } | null
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
                profile: serverUserProfile || null,
                cartCount: serverCartCount || 0,
            }
        }
        return undefined
    }, [serverUserProfile, serverCartCount])

    const { profile, cartCount, isLoading: isSessionLoading } = useUserSession(serverSessionData)
    const isLoading = isSupabaseLoading || isSessionLoading
    const router = useRouter()
    const pathname = usePathname()

    const { setDirection } = useTransitionDirection()
    const isHome = useMemo(() => currentView === "home" || pathname === "/", [currentView, pathname])
    const showDeliveryInfo = useMemo(() => isHome || ["/perfil", "/pedidos", "/sacola"].includes(pathname) || pathname.startsWith("/explorar"), [isHome, pathname])

    const [searchValue, setSearchValue] = useState("")
    const [suggestionBucket, setSuggestionBucket] = useState<{ label: string; type: string }[]>([])
    const [rpcSuggestions, setRpcSuggestions] = useState<{ label: string; type: string }[]>([])
    const [isSearchInputFocused, setIsSearchInputFocused] = useState(false)
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
    const [isThemeTransitioning, setIsThemeTransitioning] = useState(false)
    const { theme, setTheme } = useTheme()
    const [isMobileUserMenuOpen, setIsMobileUserMenuOpen] = useState(false)
    const [isMobileCategoryMenuOpen, setIsMobileCategoryMenuOpen] = useState(false)
    const [isScrolled, setIsScrolled] = useState(false)
    const [isPending, startTransition] = useTransition()
    const { requestLocation, loading: isLocationLoading, error: locationError } = useLocationRedirect()

    const [isVisitorModalOpen, setIsVisitorModalOpen] = useState(false)
    const [visitorSearchQuery, setVisitorSearchQuery] = useState("")
    const [isIpLoading, setIsIpLoading] = useState(false)
    const [citiesList, setCitiesList] = useState<string[]>([])

    useEffect(() => {
        if (isVisitorModalOpen && citiesList.length === 0) {
            getCitiesData().then(setCitiesList)
        }
    }, [isVisitorModalOpen, citiesList.length])

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
                const norm = slug
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[-\s]+/g, " ")
                return norm.includes(q)
            })
            .slice(0, 5)
    }, [visitorSearchQuery, citiesList])

    const formatCitySlugForDisplay = (slug: string): string => {
        if (!slug) return ""
        if (slug === "brasil") return "Brasil"
        if (slug.startsWith("estado-")) {
            return slug.replace("estado-", "").toUpperCase()
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
        window.location.href = `/${slug}`
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
                window.location.href = `/${slug}`
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
                <div className="flex flex-col relative text-[#003229]">
                    <button
                        onClick={() => setIsVisitorModalOpen(false)}
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

                    <h4 className="text-xl font-bold text-brand-dark mb-4 text-center">Onde você está?</h4>
                    <p className="text-gray-500 text-sm text-center mb-6 leading-relaxed">
                        Informe sua cidade para ver os produtos, vitrines e serviços pertinho de você.
                    </p>

                    <div className="space-y-4">
                        <div className="relative">
                            <Input
                                label="Digite sua cidade"
                                id="visitorCitySearchHeader"
                                name="visitorCitySearchHeader"
                                placeholder="Ex: São Paulo, Rio de Janeiro..."
                                value={visitorSearchQuery}
                                onChange={(e) => setVisitorSearchQuery(e.target.value)}
                            />
                            {filteredCities.length > 0 && (
                                <div className="absolute z-[110] left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border">
                                    {filteredCities.map((slug) => (
                                        <button
                                            key={slug}
                                            onClick={() => handleSelectCitySlug(slug)}
                                            className="w-full text-left px-4 py-3 hover:bg-brand-gray dark:hover:bg-dark-border/30 text-brand-dark dark:text-dark-heading text-sm transition-colors font-medium flex items-center gap-2"
                                        >
                                            <MapPinIcon size={14} className="text-brand-green shrink-0" />
                                            {formatCitySlugForDisplay(slug)}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleIpLocation}
                            disabled={isIpLoading || isLocationLoading}
                            className="w-full flex items-center justify-center gap-2 border-2 border-brand-green text-brand-green font-bold py-3 px-4 rounded-full hover:bg-brand-green/5 transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 text-sm shadow-sm"
                        >
                            {isIpLoading || isLocationLoading ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-brand-green border-t-transparent rounded-full animate-spin"></span>
                                    Detectando...
                                </>
                            ) : (
                                <>
                                    <MapPinIcon size={16} className="shrink-0" />
                                    Usar minha localização
                                </>
                            )}
                        </button>
                    </div>

                    <div className="text-center mt-8 pt-5 border-t border-gray-100">
                        <p className="text-xs text-gray-400">
                            Já tem uma conta cadastrada com endereço salvo?
                        </p>
                        <button
                            onClick={() => {
                                setIsVisitorModalOpen(false)
                                router.push("/auth/login")
                            }}
                            className="text-brand-green font-bold text-sm hover:underline mt-1 inline-block"
                        >
                            Entrar na minha conta
                        </button>
                    </div>
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
        return profile?.address ?? null
    }, [profile?.address])

    const searchContainerRef = useRef<HTMLDivElement>(null)
    const closeMenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [suggestionsLoaded, setSuggestionsLoaded] = useState(false)

    // LAZY LOAD: Buscar sugestões APENAS quando o usuário focar no campo de busca
    useEffect(() => {
        if (!isSearchInputFocused || suggestionsLoaded) return
        const loadSuggestions = async () => {
            try {
                const bucket = await getSearchSuggestionsBucket()
                setSuggestionBucket(bucket)
                setSuggestionsLoaded(true)
            } catch (error) {
                console.error("Error loading search suggestions:", error)
            }
        }
        loadSuggestions()
    }, [isSearchInputFocused, suggestionsLoaded])

    useEffect(() => {
        const trimmed = searchValue.trim()
        if (trimmed.length < 2) {
            setRpcSuggestions([])
            return
        }
        const timer = setTimeout(async () => {
            try {
                const results = await getMarketplaceAutocompleteAction(trimmed)
                setRpcSuggestions(results)
            } catch (error) {
                console.error("Error loading autocomplete:", error)
            }
        }, 220)
        return () => clearTimeout(timer)
    }, [searchValue])

    const filteredSuggestions = useMemo(() => {
        if (!searchValue.trim()) return []
        if (searchValue.trim().length >= 2 && rpcSuggestions.length > 0) {
            return rpcSuggestions.slice(0, 8)
        }
        const search = searchValue.toLowerCase().trim()
        return suggestionBucket
            .filter((item) => item.label.toLowerCase().includes(search))
            .slice(0, 8)
    }, [suggestionBucket, searchValue, rpcSuggestions])

    const showSearchDropdown = isSearchInputFocused && searchValue.length > 0 && filteredSuggestions.length > 0
    const showOverlay = isSearchInputFocused || isUserMenuOpen

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
        setDirection("forward")
        startTransition(() => {
            // Get city from localStorage/cookie or profile
            let savedCity = typeof window !== "undefined" ? localStorage.getItem("dudit_city") : null
            if (!savedCity && typeof document !== "undefined") {
                const match = document.cookie.match(/(?:^|; )dudit_city=([^;]*)/)
                if (match) savedCity = match[1]
            }

            // If we have a city, redirect to that city with the query; otherwise search all of Brazil
            if (savedCity) {
                router.push(`/explorar/${savedCity}?q=${encodeURIComponent(trimmed)}`)
            } else {
                router.push(`/explorar/brasil?q=${encodeURIComponent(trimmed)}`)
            }
        })
    }, [searchValue, router, setDirection])

    // Get navigation links with city included
    const navigationLinks = useMemo(() => {
        let savedCity = typeof window !== "undefined" ? localStorage.getItem("dudit_city") : null
        if (!savedCity && typeof document !== "undefined") {
            const match = document.cookie.match(/(?:^|; )dudit_city=([^;]*)/)
            if (match) savedCity = match[1]
        }

        const basePath = savedCity ? `/explorar/${savedCity}` : "/explorar/brasil"
        return [
            { label: "Ofertas do Dia", href: `${basePath}?q=oferta` },
            { label: "Produtos", href: `${basePath}?type=produtos` },
            { label: "Serviços", href: `/services` },
        ]
    }, [])

    const desktopNavigationLinks = useMemo(() => {
        let savedCity = typeof window !== "undefined" ? localStorage.getItem("dudit_city") : null
        if (!savedCity && typeof document !== "undefined") {
            const match = document.cookie.match(/(?:^|; )dudit_city=([^;]*)/)
            if (match) savedCity = match[1]
        }

        const basePath = savedCity ? `/explorar/${savedCity}` : "/explorar/brasil"
        return [
            { label: "Ofertas do Dia", href: `${basePath}?q=oferta` },
            { label: "Produtos", href: `${basePath}?type=produtos` },
            { label: "Serviços", href: `${basePath}?type=servicos` },
        ]
    }, [])

    const handleSignOut = useCallback(async () => {
        document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
        localStorage.removeItem("dudit_city")
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
                <header className="lg:hidden w-full fixed top-0 left-0 right-0 z-50 bg-brand-dark">
                    <div className="px-4 py-3 flex items-center justify-between min-h-[50px]">
                        <button onClick={handleGoBack} className="shrink-0 text-white p-1 -ml-1">
                            <ChevronLeftIcon size={24} strokeWidth={2.5} />
                        </button>
                        <div className="flex-1 text-center min-w-0">
                            <h1 className="text-white font-bold text-[16px] truncate px-4">
                                {simpleTitle}
                            </h1>
                        </div>
                        <div className="w-8 shrink-0" /> {/* Spacer for centering */}
                    </div>
                </header>
            )
        }

        const isVendorPage = !!storeSearchPlaceholder && !vendorCategoryTitle
        const isTransparentHeader = (isProductDetail || isVendorPage) && !isScrolled && !vendorCategoryTitle

        return (
            <header className={`lg:hidden w-full fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isTransparentHeader ? "bg-transparent" : "bg-brand-dark"}`}>
                <div className="px-4 pt-2 pb-2">
                    <div className="flex items-center gap-3 relative min-h-[36px]">
                        {/* Back Button / User Icon */}
                        <button
                            className={`shrink-0 z-10 w-9 h-9 flex items-center justify-center transition-all duration-300 ${isTransparentHeader ? "bg-white rounded-full shadow-md text-brand-dark" : "bg-transparent text-white"}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (vendorCategoryTitle && onVendorCategoryBack) {
                                    onVendorCategoryBack()
                                } else if (!isHome || isProductDetail) {
                                    handleGoBack()
                                } else {
                                    user ? setIsMobileUserMenuOpen(true) : router.push("/auth/login")
                                }
                            }}
                        >
                            {(!isHome || isProductDetail) ? (
                                <ChevronLeftIcon size={20} className={`${isTransparentHeader ? "text-brand-dark" : "text-white"}`} strokeWidth={2.5} />
                            ) : user ? (
                                <div className="relative shrink-0 w-9 h-9">
                                    <img
                                        src="https://img.dudit.com.br/static/Placeholder.png"
                                        alt="User"
                                        width={36}
                                        height={36}
                                        className="w-9 h-9 rounded-full border border-gray-200 object-cover"
                                    />
                                </div>
                            ) : (
                                <div className="w-9 h-9 rounded-full border border-gray-200 bg-gray-100 flex items-center justify-center">
                                    <span className="text-xs text-gray-500">?</span>
                                </div>
                            )}
                        </button>

                        {/* Middle Section: Search or Product Name */}
                        <div className="flex-1 flex items-center justify-start min-w-0 transition-all duration-300">
                            {isProductDetail && vendorCategoryTitle ? (
                                <div className="relative w-full h-[36px] overflow-visible">
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
                                <div className="bg-white h-[36px] rounded-full flex items-center px-4 w-full border border-gray-200">
                                    <SearchIcon size={18} className="text-brand-green mr-2" />
                                    <input
                                        type="text"
                                        placeholder="Buscar na Dudit"
                                        className="bg-transparent border-none outline-none text-brand-dark text-[14px] w-full placeholder-gray-400 font-normal py-0"
                                        value={searchValue}
                                        onChange={(e) => setSearchValue(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                    />
                                </div>
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
                                    className="w-9 h-9 flex items-center justify-center text-white"
                                >
                                    {vendorCategorySearchOpen ? <span className="text-[22px] leading-none">×</span> : <SearchIcon size={20} />}
                                </button>
                            ) : isProductDetail && storeSearchPlaceholder ? (
                                onShare ? (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onShare?.(); }}
                                        className={`transition-all duration-300 flex items-center justify-center w-9 h-9 ${isTransparentHeader ? "bg-white rounded-full shadow-md text-brand-dark" : "bg-transparent text-white"}`}
                                    >
                                        <ShareIcon size={20} />
                                    </button>
                                ) : <div className="w-1" />
                            ) : isProductDetail ? (
                                <>
                                    {onShare && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onShare?.(); }}
                                            className={`transition-all duration-300 flex items-center justify-center w-9 h-9 ${isScrolled ? "bg-transparent shadow-none text-white" : "bg-white rounded-full shadow-md text-brand-dark"}`}
                                        >
                                            <ShareIcon size={20} />
                                        </button>
                                    )}
                                    {favoriteButton ? (
                                        favoriteButton
                                    ) : onFavorite ? (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onFavorite?.(); }}
                                            className={`transition-all duration-300 flex items-center justify-center w-9 h-9 ${isScrolled ? "bg-transparent shadow-none text-white" : "bg-white rounded-full shadow-md text-brand-dark"}`}
                                        >
                                            <HeartIcon size={20} className={isFavorite ? "fill-current" : ""} />
                                        </button>
                                    ) : null}
                                </>
                            ) : (
                                <>
                                    {user && (
                                        <NotificationBell variant="marketplace" className="shrink-0" />
                                    )}
                                    <Link href="/sacola" prefetch={false} className="shrink-0 relative text-white px-1 flex items-center justify-center cursor-pointer">
                                        <ShoppingBagIcon size={24} strokeWidth={2} />
                                        {cartCount > 0 && (
                                            <span className="absolute -top-1.5 -right-1.5 bg-brand-orange text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center border border-brand-dark">
                                                {cartCount}
                                            </span>
                                        )}
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Delivery Info */}
                    {(!isScrolled && showDeliveryInfo && !isProductDetail) && (
                        <Link
                            href={user && userLocation ? "/perfil?tab=enderecos" : "#"}
                            onClick={(e) => {
                                if (!user || !userLocation) {
                                    e.preventDefault()
                                    setIsVisitorModalOpen(true)
                                }
                            }}
                            className="flex items-center gap-1.5 px-1 mt-2.5 text-brand-inactive-text cursor-pointer w-full overflow-hidden hover:opacity-80 transition-opacity"
                        >
                            <MapPinIcon size={14} className="shrink-0 text-white" />
                            <span className="text-[12px] font-normal truncate ml-0.5 text-white">
                                {userLocation ? `Você está em ${userLocation}` : "Cadastrar endereço"}
                            </span>
                            <ChevronRightIcon size={14} className="opacity-60 shrink-0 mt-0.5 text-white" />
                        </Link>
                    )}
                </div>
            </header>
        )
    }

    return (
        <>
            <div
                className={`fixed inset-0 bg-black/60 z-[90] transition-opacity duration-300 ease-in-out ${showOverlay ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
            />

            {renderMobileHeader()}

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
                                { label: "Meu Perfil", href: "/perfil" },
                                { label: "Meus Favoritos", href: "/favoritos" },
                                { label: "Minhas Avaliações", href: "/perfil?tab=avaliacoes" },
                                { label: "Minhas Coleções", href: "/colecoes" },
                                { label: "Central do Vendedor", href: "/erp/trocar-erp" },
                            ] as any[]).map((item, idx) => {
                                const ItemWrapper: any = item.href ? Link : "div";
                                const wrapProps = item.href
                                    ? { href: item.href, prefetch: false }
                                    : { onClick: item.action };

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

                            <div className="flex items-center justify-between px-6 py-3 rounded-xl">
                                <span className="flex items-center gap-3">
                                    <MoonIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    <span className="text-[15px] font-medium text-brand-dark dark:text-dark-heading">Modo escuro</span>
                                </span>
                                <Switch checked={theme === "dark"} onCheckedChange={handleThemeToggle} />
                            </div>
                        </div>

                        <div className="border-t border-gray-100 dark:border-dark-border py-2 mt-2">
                            <div
                                className="px-6 py-3 hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors"
                                onClick={handleSignOut}
                            >
                                <span className="text-[15px] font-normal text-brand-inactive-text dark:text-dark-body">Sair da sessão</span>
                            </div>
                        </div>
                    </div>
                </BottomSheet>
            )}

            {isMobileCategoryMenuOpen && (
                <BottomSheet isOpen={isMobileCategoryMenuOpen} onClose={() => setIsMobileCategoryMenuOpen(false)}>
                    <div className="flex flex-col py-2">
                        {navigationLinks.map((link) => (
                            <Link
                                key={link.label}
                                href={link.href}
                                prefetch={false}
                                onClick={() => setIsMobileCategoryMenuOpen(false)}
                                className="px-6 py-3 text-[15px] font-normal text-brand-inactive-text hover:bg-brand-gray hover:text-brand-dark transition-colors"
                            >
                                {link.label}
                            </Link>
                        ))}
                        <div className="border-t border-gray-100 mt-2 pt-2">
                            <Link
                                href="/auth/login?mode=partner"
                                prefetch={false}
                                onClick={() => setIsMobileCategoryMenuOpen(false)}
                                className="px-6 py-3 font-bold text-brand-orange hover:bg-brand-gray cursor-pointer text-[15px] flex items-center gap-1 transition-colors"
                            >
                                <span>Anunciar grátis</span>
                                <ChevronRightIcon size={16} />
                            </Link>
                        </div>
                    </div>
                </BottomSheet>
            )}

            <header className="hidden lg:flex flex-col w-full bg-brand-dark fixed top-0 left-0 right-0 z-[100] shadow-md">
                <div className="w-full h-[68px] flex items-center justify-between max-w-[1400px] px-2 mx-auto gap-4">
                    <Link href="/" prefetch={false} className="cursor-pointer shrink-0 z-[110] pt-1">
                        <img
                            src="https://img.dudit.com.br/cdn-cgi/image/width=140,format=auto,quality=80/static/Logo.png"
                            alt="Dudit"
                            width={140}
                            height={40}
                            className="h-10 w-auto object-contain"
                        />
                    </Link>

                    <Link
                        href={user && userLocation ? "/perfil?tab=enderecos" : "#"}
                        onClick={(e) => {
                            if (!user || !userLocation) {
                                e.preventDefault()
                                setIsVisitorModalOpen(true)
                            }
                        }}
                        className="flex flex-col justify-center items-start text-white hover:bg-white/10 rounded-md px-2 py-1.5 cursor-pointer min-w-[140px] transition-colors -ml-1"
                    >
                        {userLocation ? (
                            <span className="text-[11px] text-gray-300 leading-none ml-4 block mb-0.5">
                                Você está em
                            </span>
                        ) : null}
                        <div className="flex items-center gap-1">
                            <MapPinIcon size={16} className="text-white shrink-0" strokeWidth={2.5} />
                            <span className="text-[13px] font-bold leading-none truncate max-w-[160px]">
                                {userLocation || "Cadastrar endereço"}
                            </span>
                        </div>
                    </Link>

                    <div className="flex-1 relative z-[110] mx-4 h-[42px]" ref={searchContainerRef}>
                        <div className="relative flex items-center w-full h-full bg-white rounded-full transition-all duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
                            <input
                                type="text"
                                className="flex-1 h-full bg-transparent border-none outline-none text-brand-dark placeholder-gray-400 text-[15px] px-5 w-full font-normal rounded-l-full"
                                placeholder="Buscar produtos, marcas e muito mais..."
                                onFocus={handleSearchFocus}
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            />

                            <Button
                                onClick={() => handleSearch()}
                                className="h-[34px] w-[34px] p-0 flex items-center justify-center mr-1 rounded-full bg-brand-green hover:bg-brand-green/90"
                            >
                                <SearchIcon size={18} className="text-white" />
                            </Button>
                        </div>

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

                                    <div className="px-6 py-5 border-b border-gray-100 dark:border-dark-border flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full overflow-hidden border border-gray-100 dark:border-dark-border shrink-0 flex items-center justify-center font-semibold text-white ${getAvatarColor(fullName)}`}>
                                            {getUserInitials(fullName)}
                                        </div>
                                        <h3 className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">{userName}</h3>
                                    </div>

                                    <div className="py-2">
                                        {([
                                            { label: "Meu Perfil", href: "/perfil" },
                                            { label: "Meus Favoritos", href: "/favoritos" },
                                            { label: "Minhas Avaliações", href: "/perfil?tab=avaliacoes" },
                                            { label: "Minhas Coleções", href: "/colecoes" },
                                            { label: "Central do Vendedor", href: "/erp/trocar-erp" },
                                        ] as any[]).map((item, idx) => {
                                            const ItemWrapper: any = item.href ? Link : "div";
                                            const wrapProps = item.href
                                                ? { href: item.href, prefetch: false }
                                                : { onClick: item.action };

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

                                    <div className="border-t border-gray-100 dark:border-dark-border py-2">
                                        <div className="px-6 py-2.5 flex items-center justify-between hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors">
                                            <span className="flex items-center gap-3">
                                                <MoonIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                                <span className="text-[14px] font-normal text-brand-inactive-text dark:text-dark-body">Modo escuro</span>
                                            </span>
                                            <Switch checked={theme === "dark"} onCheckedChange={handleThemeToggle} />
                                        </div>
                                    </div>

                                    <div className="border-t border-gray-100 dark:border-dark-border py-2 mt-auto">
                                        <div
                                            className="px-6 py-3 hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors"
                                            onClick={handleSignOut}
                                        >
                                            <span className="text-[14px] font-normal text-brand-inactive-text dark:text-dark-body">Sair da sessão</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {user && <NotificationBell variant="marketplace" />}

                        <Link href="/pedidos" prefetch={false} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity text-white">
                            <Package size={20} />
                            <span className="text-[13px] font-medium hidden xl:block">Pedidos</span>
                        </Link>

                        <Link href="/sacola" prefetch={false} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity text-white">
                            <div className="relative">
                                <ShoppingBagIcon size={20} />
                                {cartCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-brand-orange text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center border border-brand-dark">
                                        {cartCount}
                                    </span>
                                )}
                            </div>
                            <span className="text-[13px] font-medium hidden xl:block">Sacola</span>
                        </Link>
                    </div>
                </div>

                <div className="w-full h-[40px] bg-brand-dark flex items-center max-w-[1400px] mx-auto text-white text-[13px] border-t border-white/5">
                    <div className="flex items-center gap-1 h-full overflow-x-auto no-scrollbar">
                        {desktopNavigationLinks.map((link) => (
                            <Link
                                key={link.label}
                                href={link.href}
                                prefetch={false}
                                className="px-3 py-1.5 whitespace-nowrap rounded-full hover:bg-white/10 transition-all font-normal"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>

                    <Link
                        href="/auth/login?mode=partner"
                        prefetch={false}
                        className="ml-auto font-bold text-brand-orange hover:text-brand-orange/70 cursor-pointer text-[13px] flex items-center gap-1 py-1"
                    >
                        <span>Anunciar grátis</span>
                        <ChevronRightIcon size={14} />
                    </Link>
                </div>
            </header>

            {renderVisitorModal()}
        </>
    )
}

export { MemoizedHeader as MarketplaceHeader }
const MemoizedHeader = memo(Header)
export default MemoizedHeader
