"use client"

import type React from "react"
import { useState, useRef, useEffect, useMemo, memo, useCallback, useTransition } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import {
  ShoppingBagIcon,
  MapPinIcon,
  ChevronDownIcon,
  SearchIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  MenuIcon,
  Package,
  HeartIcon,
  ShareIcon,
} from "@/lib/icons"
import { useSupabase } from "@/providers/supabase-provider"
import { Button } from "@/components/reusable"
import BottomSheet from "@/components/BottomSheet"
import { getUserInitials, getAvatarColor } from "@/lib/utils/UserProfileImage"
import { getSearchSuggestionsBucket } from "@/app/actions/marketplace/suggestions"
import { useUserSession } from "@/hooks/use-user-session"
import { useTransitionDirection } from "@/providers/transition-provider"
import { useLocationRedirect } from "@/hooks/use-location-redirect"

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
  const showDeliveryInfo = useMemo(() => isHome || ["/perfil", "/pedidos", "/cart"].includes(pathname), [isHome, pathname])

  const [searchValue, setSearchValue] = useState("")
  const [suggestionBucket, setSuggestionBucket] = useState<{ label: string; type: string }[]>([])
  const [isSearchInputFocused, setIsSearchInputFocused] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isMobileUserMenuOpen, setIsMobileUserMenuOpen] = useState(false)
  const [isMobileCategoryMenuOpen, setIsMobileCategoryMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { requestLocation, loading: isLocationLoading, error: locationError } = useLocationRedirect()

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

  const filteredSuggestions = useMemo(() => {
    if (!searchValue.trim()) return []
    const search = searchValue.toLowerCase().trim()
    return suggestionBucket
      .filter((item) => item.label.toLowerCase().includes(search))
      .slice(0, 8)
  }, [suggestionBucket, searchValue])

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

  const handleSearch = useCallback((query: string = searchValue) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setIsSearchInputFocused(false)
    setDirection("forward")
    startTransition(() => {
      router.push(`/explorar?q=${encodeURIComponent(trimmed)}`)
    })
  }, [searchValue, router])

  const handleSignOut = useCallback(async () => {
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

    return (
      <header className={`lg:hidden w-full fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isProductDetail && !isScrolled && !storeSearchPlaceholder ? "bg-transparent" : "bg-brand-dark"}`}>
        {/* standard logo header only if not product detail or if scrolled */}
        {isHome && (
          <div className={`flex items-center justify-between px-4 overflow-hidden transition-all duration-300 ease-in-out ${isScrolled ? "h-0 opacity-0" : "h-[50px] opacity-100 pt-3 pb-1"}`}>
            <Link href="/" prefetch={true} className="cursor-pointer">
              <img
                src="https://img.dudit.com.br/static/Logo.png"
                alt="Dudit"
                width={100}
                height={32}
                className="h-8 w-auto object-contain"
              />
            </Link>
            <button className="text-white" onClick={() => setIsMobileCategoryMenuOpen(true)}>
              <MenuIcon size={24} strokeWidth={2.5} />
            </button>
          </div>
        )}

        <div className={`px-4 pb-3 transition-all duration-500 ${(isScrolled || !isHome || isProductDetail) ? "pt-3" : "pt-1"}`}>
          <div className="flex items-center gap-3 relative min-h-[40px]">
            {/* Back Button / User Icon */}
            <button
              className={`shrink-0 z-10 w-10 h-10 flex items-center justify-center transition-all duration-300 ${isProductDetail && !storeSearchPlaceholder ? "bg-white rounded-full shadow-md" : "bg-transparent"}`}
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
                <ChevronLeftIcon size={20} className={`${storeSearchPlaceholder ? "text-white" : isProductDetail && !isScrolled ? "text-brand-dark" : isScrolled ? "text-brand-dark" : "text-white"}`} strokeWidth={2.5} />
              ) : user ? (
                <img
                  src="https://img.dudit.com.br/static/Placeholder.png"
                  alt="User"
                  width={36}
                  height={36}
                  className="w-9 h-9 rounded-full border border-gray-200 object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full border border-gray-200 bg-gray-100 flex items-center justify-center">
                  <span className="text-xs text-gray-500">?</span>
                </div>
              )}
            </button>

            {/* Middle Section: Search or Product Name */}
            <div className="flex-1 flex items-center justify-start min-w-0 transition-all duration-300">
              {isProductDetail && vendorCategoryTitle ? (
                <div className="relative w-full h-[38px] overflow-visible">
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
                <div className="bg-white h-[38px] rounded-full flex items-center px-4 w-full border border-gray-200 transition-all duration-300 opacity-100">
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
                <div className="bg-white h-[38px] rounded-full flex items-center px-4 w-full border border-gray-200">
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
                  className="w-10 h-10 flex items-center justify-center text-white"
                >
                  {vendorCategorySearchOpen ? <span className="text-[22px] leading-none">×</span> : <SearchIcon size={20} />}
                </button>
              ) : isProductDetail && storeSearchPlaceholder ? (
                onShare ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onShare?.(); }}
                    className="w-10 h-10 flex items-center justify-center text-white"
                  >
                    <ShareIcon size={20} />
                  </button>
                ) : <div className="w-1" />
              ) : isProductDetail ? (
                <>
                  {onShare && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onShare?.(); }}
                      className={`transition-all duration-300 flex items-center justify-center w-10 h-10 bg-white rounded-full shadow-md text-brand-dark`}
                    >
                      <ShareIcon size={20} />
                    </button>
                  )}
                  {onFavorite && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onFavorite?.(); }}
                      className={`transition-all duration-300 flex items-center justify-center w-10 h-10 bg-white rounded-full shadow-md text-brand-dark`}
                    >
                      <HeartIcon size={20} className={isFavorite ? "fill-current" : ""} />
                    </button>
                  )}
                </>
              ) : (
                <Link href="/cart" prefetch={true} className="shrink-0 relative text-white px-1 flex items-center justify-center cursor-pointer">
                  <ShoppingBagIcon size={24} strokeWidth={2} />
                  {cartCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-brand-orange text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center border border-brand-dark">
                      {cartCount}
                    </span>
                  )}
                </Link>
              )}
            </div>
          </div>

          {/* Delivery Info */}
          {(!isScrolled && showDeliveryInfo && !isProductDetail) && (
            <div onClick={requestLocation} className="flex items-center gap-1.5 px-1 mt-2.5 text-brand-inactive-text cursor-pointer w-full overflow-hidden hover:opacity-80 transition-opacity">
              <MapPinIcon size={14} className="shrink-0 text-white" />
              <span className="text-[12px] font-normal truncate leading-tight ml-0.5 text-white">
                {isLocationLoading ? "Buscando..." : userLocation ? `Enviar para ${userLocation}` : "Usar minha localização"}
              </span>
              {!isLocationLoading && <ChevronRightIcon size={14} className="opacity-60 shrink-0 mt-0.5 text-white" />}
              {locationError && <span className="text-[10px] text-red-400 ml-auto truncate">{locationError}</span>}
            </div>
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

      <BottomSheet isOpen={isMobileUserMenuOpen} onClose={() => setIsMobileUserMenuOpen(false)}>
        <div className="flex flex-col">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full overflow-hidden border border-gray-100 shrink-0 flex items-center justify-center font-semibold text-white ${getAvatarColor(fullName)}`}>
              {getUserInitials(fullName)}
            </div>
            <h3 className="text-[16px] font-bold text-brand-dark">{userName}</h3>
          </div>

          <div className="py-2">
            {[
              { label: "Seu perfil", href: "/perfil" },
              { label: "Seus pedidos", href: "/pedidos" },
              { label: "Lojas favoritas", action: () => setView?.("vendor") },
              { label: "Central do Parceiro", href: "/erp/switch" },
            ].map((item, idx) => {
              const ItemWrapper: any = item.href ? Link : "div";
              const wrapProps = item.href
                ? { href: item.href, prefetch: true }
                : { onClick: item.action };

              return (
                <ItemWrapper
                  key={idx}
                  {...wrapProps}
                  className="px-6 py-3 hover:bg-brand-gray cursor-pointer transition-colors block w-full text-left"
                  onClick={() => {
                    if (wrapProps.onClick) wrapProps.onClick();
                    setIsMobileUserMenuOpen(false);
                  }}
                >
                  <span className="text-[15px] font-normal text-brand-inactive-text hover:text-brand-dark">{item.label}</span>
                </ItemWrapper>
              )
            })}
          </div>

          <div className="border-t border-gray-100 py-2 mt-2">
            <div
              className="px-6 py-3 hover:bg-brand-gray cursor-pointer transition-colors"
              onClick={handleSignOut}
            >
              <span className="text-[15px] font-normal text-brand-inactive-text">Sair da sessão</span>
            </div>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={isMobileCategoryMenuOpen} onClose={() => setIsMobileCategoryMenuOpen(false)}>
        <div className="flex flex-col py-2">
          {[
            { label: "Ofertas do Dia", href: "/explorar?q=oferta" },
            { label: "Produtos", href: "/explorar?type=produtos" },
            { label: "Serviços", href: "/services" },
          ].map((link) => (
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
              <span>Começar a vender</span>
              <ChevronRightIcon size={16} />
            </Link>
          </div>
        </div>
      </BottomSheet>

      <header className="hidden lg:flex flex-col w-full bg-brand-dark fixed top-0 left-0 right-0 z-[100] shadow-md">
        <div className="w-full h-[68px] flex items-center justify-between max-w-[1300px] px-2 mx-auto gap-4">

          <Link href="/" prefetch={false} className="cursor-pointer shrink-0 z-[110] pt-1">
            <img
              src="https://img.dudit.com.br/static/Logo.png"
              alt="Dudit"
              width={140}
              height={40}
              className="h-10 w-auto object-contain"
            />
          </Link>

          <div onClick={requestLocation} className="flex flex-col justify-center items-start text-white hover:bg-white/10 rounded-md px-2 py-1.5 cursor-pointer min-w-[140px] transition-colors -ml-1">
            {userLocation ? (
              <span className="text-[11px] text-gray-300 leading-none ml-4 block mb-0.5">
                Enviar para {userName}
              </span>
            ) : null}
            <div className="flex items-center gap-1">
              <MapPinIcon size={16} className="text-white shrink-0" strokeWidth={2.5} />
              <span className="text-[13px] font-bold leading-none truncate max-w-[160px]">
                {isLocationLoading ? "Buscando..." : userLocation || "Usar localização"}
              </span>
            </div>
            {locationError && <span className="text-[10px] text-red-400 leading-tight mt-0.5 ml-4">{locationError}</span>}
          </div>

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
              <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-white rounded-[16px] shadow-xl border border-gray-100 overflow-hidden animate-fade-in z-[120]">
                {filteredSuggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-brand-gray cursor-pointer text-brand-inactive-text group"
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
                  <div className={`w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-white overflow-hidden font-semibold text-sm ${getAvatarColor(fullName)}`}>
                    {getUserInitials(fullName)}
                  </div>
                  <div className="flex flex-col text-white">
                    <span className="text-[11px] font-normal leading-tight">Olá, {userName}</span>
                    <div className="flex items-center">
                      <span className="text-[13px] font-bold leading-tight">Minha conta</span>
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
                    <span className="text-[11px] font-normal leading-tight">Olá, visitante</span>
                    <span className="text-[13px] font-bold leading-tight">Entrar</span>
                  </div>
                </div>
              )}

              {isUserMenuOpen && user && (
                <div className="absolute top-[calc(100%+12px)] left-1/2 -translate-x-1/2 w-[280px] bg-white rounded-[8px] shadow-[0_8px_30px_rgba(0,0,0,0.15)] border border-gray-100 overflow-visible animate-fade-in flex flex-col">
                  <div className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-t border-l border-gray-100 transform rotate-45" />

                  <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full overflow-hidden border border-gray-100 shrink-0 flex items-center justify-center font-semibold text-white ${getAvatarColor(fullName)}`}>
                      {getUserInitials(fullName)}
                    </div>
                    <h3 className="text-[16px] font-bold text-brand-dark">{userName}</h3>
                  </div>

                  <div className="py-2">
                    {[
                      { label: "Seu perfil", href: "/perfil" },
                      { label: "Seus pedidos", href: "/pedidos" },
                      { label: "Lojas favoritas", action: () => setView?.("vendor") },
                      { label: "Central do Parceiro", href: "/erp/switch" },
                    ].map((item, idx) => {
                      const ItemWrapper: any = item.href ? Link : "div";
                      const wrapProps = item.href
                        ? { href: item.href, prefetch: true }
                        : { onClick: item.action };

                      return (
                        <ItemWrapper
                          key={idx}
                          {...wrapProps}
                          className="px-6 py-2.5 hover:bg-brand-gray cursor-pointer transition-colors block w-full text-left"
                          onClick={() => {
                            if (wrapProps.onClick) wrapProps.onClick();
                            setIsUserMenuOpen(false)
                          }}
                        >
                          <span className="text-[14px] font-normal text-brand-inactive-text hover:text-brand-dark">{item.label}</span>
                        </ItemWrapper>
                      )
                    })}
                  </div>

                  <div className="border-t border-gray-100 py-2 mt-auto">
                    <div
                      className="px-6 py-3 hover:bg-brand-gray cursor-pointer transition-colors"
                      onClick={handleSignOut}
                    >
                      <span className="text-[14px] font-normal text-brand-inactive-text">Sair da sessão</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Link href="/pedidos" prefetch={false} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity text-white">
              <Package size={20} strokeWidth={2} />
              <span className="text-[13px] font-medium hidden xl:block">Pedidos</span>
            </Link>

            <Link href="/cart" prefetch={false} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity text-white">
              <div className="relative">
                <ShoppingBagIcon size={20} strokeWidth={2} />
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

        <div className="w-full h-[40px] bg-brand-dark flex items-center max-w-[1300px] mx-auto text-white text-[13px] border-t border-white/5">
          <div className="flex items-center gap-1 h-full overflow-x-auto no-scrollbar">
            {[
              { label: "Ofertas do Dia", href: "/explorar?q=oferta" },
              { label: "Produtos", href: "/explorar?type=produtos" },
              { label: "Serviços", href: "/explorar?type=servicos" },
            ].map((link) => (
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
            prefetch={true}
            className="ml-auto font-bold text-brand-orange hover:text-brand-orange/70 cursor-pointer text-[13px] flex items-center gap-1 py-1"
          >
            <span>Começar a vender</span>
            <ChevronRightIcon size={14} />
          </Link>
        </div>
      </header>
    </>
  )
}

export { MemoizedHeader as MarketplaceHeader }
const MemoizedHeader = memo(Header)
export default MemoizedHeader
