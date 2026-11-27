"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { IntentPrefetchLink } from "@/components/navigation/IntentPrefetchLink"
import { usePathname } from "next/navigation"
import { useSupabase } from "@/providers/supabase-provider"
import {
    HomeIcon, SearchIcon, Package, MenuIcon, UserIcon, StoreIcon, HeartIcon, StarIcon, HelpCircleIcon, ChevronRightIcon, LogoutIcon, InfoIcon, MoneyIcon, FileTextIcon, ShieldIcon, EditIcon, TrashIcon, RepeatIcon,
    CustomerSupportIcon,
    NewsIcon,
    TargetIcon
} from "@/lib/icons"
import BottomSheet from "@/components/BottomSheet"
import { getUserInitials, getAvatarColor } from "@/lib/utils/UserProfileImage"
import { useCollectionDetailMenu } from "@/lib/collection-detail-menu"
import { useUserSession } from "@/hooks/use-user-session"
import { useAddressSync } from "@/lib/utils/address-sync"
import { logLogoutAction } from "@/app/actions/auth/audit"

function MenuItem({
    label,
    href,
    icon: Icon,
    onClick,
    onClose
}: {
    label: string
    href?: string
    icon: any
    onClick?: () => void
    onClose?: () => void
}) {
    const content = (
        <div className="flex items-center justify-between px-3 py-3.5 rounded-xl hover:bg-gray-50 dark:hover:bg-dark-border/20 cursor-pointer transition-all duration-200 group">
            <div className="flex items-center">
                <div className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-white mr-3 shrink-0 group-hover:scale-105 transition-transform duration-200">
                    <Icon size={20} className="text-brand-dark dark:text-gray-200" />
                </div>
                <span className="text-[14px] font-semibold text-gray-700 dark:text-gray-200 group-hover:text-brand-green dark:group-hover:text-brand-green transition-colors">
                    {label}
                </span>
            </div>
            <ChevronRightIcon size={16} className="text-gray-400 dark:text-gray-600 group-hover:translate-x-0.5 transition-transform duration-200" />
        </div>
    )

    if (href) {
        return (
            <IntentPrefetchLink href={href} onClick={onClose}>
                {content}
            </IntentPrefetchLink>
        )
    }

    return (
        <div onClick={() => {
            onClick?.()
            onClose?.()
        }}>
            {content}
        </div>
    )
}

export function MarketplaceBottomMenu() {
    const pathname = usePathname()
    const { user, supabase } = useSupabase()
    const { profile } = useUserSession()
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [citySlug, setCitySlug] = useState<string | null>(null)
    const collectionMenu = useCollectionDetailMenu()

    useAddressSync(useCallback((_id, payload) => {
        if (payload?.citySlug) {
            setCitySlug(payload.citySlug)
        }
    }, []))

    // Detect city slug on client side for the Home and Explorar tabs
    // Priority: explicit cookie/localStorage → current URL → saved profile address
    useEffect(() => {
        if (typeof window === "undefined") return

        // 1. From explicit cookie (highest priority — respects user's active browsing location)
        let stored: string | null = null
        const match = document.cookie.match(/(?:^|; )dudit_city=([^;]*)/)
        if (match && match[1]) {
            stored = decodeURIComponent(match[1])
        }

        // 2. From localStorage
        if (!stored) {
            try {
                stored = localStorage.getItem("dudit_city")
            } catch { }
        }

        // 3. From current URL path
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

        // 4. Fallback to saved profile address ONLY when no explicit browsing location is set
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
    }, [pathname, profile, user])

    // Do not show on ERP, admin, auth, checkout, quote or print screens
    const isExcluded =
        !pathname ||
        pathname.startsWith("/erp") ||
        pathname.startsWith("/ddt-admin") ||
        pathname.startsWith("/auth") ||
        pathname.startsWith("/checkout") ||
        pathname.startsWith("/quote") ||
        pathname.startsWith("/print") ||
        pathname.startsWith("/entregadores")

    const homePath = "/"
    const explorePath = citySlug ? `/explorar/${citySlug}` : "/explorar/brasil"

    const isCollectionDetailOwner = !!collectionMenu?.isOwner && pathname?.startsWith("/colecoes/")

    const userName = profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "Visitante"
    const fullName = profile?.full_name || user?.email?.split("@")[0] || "Visitante"

    const handleSignOut = async () => {
        document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
        localStorage.removeItem("dudit_city")
        try {
            await logLogoutAction()
        } catch {
            // Audit logging must never block logout.
        }
        await supabase.auth.signOut({ scope: "local" })
        setIsMenuOpen(false)
        window.location.href = "/"
    }

    // Active tab checks
    const isHomeActive = pathname === "/" || pathname === `/${citySlug}`
    const isExploreActive = pathname.startsWith("/explorar")
    const isOrdersActive = pathname.startsWith("/pedidos")

    if (isExcluded) return null

    return (
        <>
            {/* Bottom Nav Bar */}
            {isCollectionDetailOwner ? (
                <nav
                    className="lg:hidden print:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-white/10 pb-[calc(env(safe-area-inset-bottom,0px))] h-[60px] flex justify-around items-center"
                >
                    <button
                        onClick={collectionMenu.onEdit}
                        className="flex-1 h-10 max-w-[180px] flex items-center justify-center gap-2 rounded-full border border-brand-border dark:border-dark-border text-brand-dark dark:text-white text-[14px] font-semibold hover:bg-gray-50 dark:hover:bg-dark-border/40 transition-colors"
                    >
                        <EditIcon size={18} />
                        Editar
                    </button>
                    <button
                        onClick={collectionMenu.onDelete}
                        className="flex-1 h-10 max-w-[180px] flex items-center justify-center gap-2 rounded-full border border-red-200 dark:border-red-900 text-brand-red text-[14px] font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                        <TrashIcon size={18} />
                        Excluir
                    </button>
                </nav>
            ) : (
                <nav
                    className="lg:hidden print:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-white/10 pb-[calc(env(safe-area-inset-bottom,0px))] h-[60px] flex justify-around items-center"
                >
                    <IntentPrefetchLink
                        href="/"
                        className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 ${isHomeActive ? "text-[#0d5e49] dark:text-brand-green font-bold" : "text-brand-dark dark:text-dark-body font-medium"
                            }`}
                    >
                        <HomeIcon size={22} className={isHomeActive ? "text-[#0d5e49] dark:text-brand-green" : "text-brand-dark dark:text-dark-body"} />
                        <span className="text-[11px] mt-1">Início</span>
                    </IntentPrefetchLink>

                    <IntentPrefetchLink
                        href={explorePath}
                        className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 ${isExploreActive ? "text-[#0d5e49] dark:text-brand-green font-bold" : "text-brand-dark dark:text-dark-body font-medium"
                            }`}
                    >
                        <SearchIcon size={22} className={isExploreActive ? "text-[#0d5e49] dark:text-brand-green" : "text-brand-dark dark:text-dark-body"} />
                        <span className="text-[11px] mt-1">Explorar</span>
                    </IntentPrefetchLink>

                    <IntentPrefetchLink
                        href="/pedidos"
                        className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 ${isOrdersActive ? "text-[#0d5e49] dark:text-brand-green font-bold" : "text-brand-dark dark:text-dark-body font-medium"
                            }`}
                    >
                        <Package size={22} className={isOrdersActive ? "text-[#0d5e49] dark:text-brand-green" : "text-brand-dark dark:text-dark-body"} />
                        <span className="text-[11px] mt-1">Pedidos</span>
                    </IntentPrefetchLink>

                    <button
                        onClick={() => setIsMenuOpen(true)}
                        className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 ${isMenuOpen ? "text-[#0d5e49] dark:text-brand-green font-bold" : "text-brand-dark dark:text-dark-body font-medium"
                            }`}
                    >
                        <MenuIcon size={22} className={isMenuOpen ? "text-[#0d5e49] dark:text-brand-green" : "text-brand-dark dark:text-dark-body"} />
                        <span className="text-[11px] mt-1">Menu</span>
                    </button>
                </nav>
            )}

            {/* Menu Overlay Drawer */}
            {isMenuOpen && (
                <BottomSheet isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)}>
                    <div className="flex flex-col py-2">
                        {/* User Card */}
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-brand-dark text-white mb-6 shadow-sm">
                            <div className="flex items-center min-w-0">
                                {user ? (
                                    <div className={`w-12 h-12 rounded-full overflow-hidden border-2 border-white/50 shrink-0 flex items-center justify-center font-bold text-lg text-white ${getAvatarColor(fullName)}`}>
                                        {getUserInitials(fullName)}
                                    </div>
                                ) : (
                                    <div className="w-12 h-12 rounded-full border-2 border-white/50 bg-white/20 shrink-0 flex items-center justify-center text-white">
                                        <UserIcon size={24} />
                                    </div>
                                )}
                                <div className="flex flex-col ml-3 min-w-0">
                                    <h3 className="text-[16px] font-bold truncate pr-2">
                                        {user ? `Olá, ${userName}` : "Olá, visitante"}
                                    </h3>
                                    {user ? (
                                        <Link
                                            href="/perfil"
                                            prefetch={false}
                                            onClick={() => setIsMenuOpen(false)}
                                            className="text-[12px] opacity-90 underline font-medium hover:opacity-100 flex items-center mt-0.5"
                                        >
                                            <span>Meu perfil</span>
                                            <ChevronRightIcon size={12} className="ml-0.5 shrink-0" />
                                        </Link>
                                    ) : (
                                        <Link
                                            href="/auth/login"
                                            onClick={() => setIsMenuOpen(false)}
                                            className="text-[12px] opacity-90 underline font-medium hover:opacity-100 flex items-center mt-0.5"
                                        >
                                            <span>Entrar na minha conta</span>
                                            <ChevronRightIcon size={12} className="ml-0.5 shrink-0" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Navigation Group 1: Activity */}
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-heading mb-2 px-2">
                                Minha atividade
                            </span>
                            <div className="space-y-1">
                                <MenuItem label="Início" href="/" icon={HomeIcon} onClose={() => setIsMenuOpen(false)} />
                                <MenuItem
                                    label="Central do Vendedor"
                                    href={user ? "/erp/inicio" : "/auth/login?mode=partner"}
                                    icon={StoreIcon}
                                    onClose={() => setIsMenuOpen(false)}
                                />
                            </div>
                        </div>

                        {/* Navigation Group 2: Institutional */}
                        <div className="flex flex-col mt-6">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-heading mb-2 px-2">
                                A Dudit
                            </span>
                            <div className="space-y-1">
                                <MenuItem label="Como a Dudit funciona" href="/institucional/inicio" icon={InfoIcon} onClose={() => setIsMenuOpen(false)} />
                                <MenuItem label="Por que a Dudit existe" href="/institucional/sobre" icon={TargetIcon} onClose={() => setIsMenuOpen(false)} />
                                <MenuItem label="Blog do Dino" href="/blog" icon={NewsIcon} onClose={() => setIsMenuOpen(false)} />
                                <MenuItem label="Central de Ajuda" href="/ajuda" icon={HelpCircleIcon} onClose={() => setIsMenuOpen(false)} />
                                <MenuItem label="Fale com a gente" href="/institucional/contato" icon={CustomerSupportIcon} onClose={() => setIsMenuOpen(false)} />
                            </div>
                        </div>
                    </div>
                </BottomSheet>
            )}
        </>
    )
}
