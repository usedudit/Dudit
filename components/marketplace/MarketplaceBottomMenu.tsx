"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSupabase } from "@/providers/supabase-provider"
import { useUserSession } from "@/hooks/use-user-session"
import {
    HomeIcon, SearchIcon, Package, MenuIcon, UserIcon, StoreIcon, HeartIcon, StarIcon, HelpCircleIcon, ChevronRightIcon, LogoutIcon, InfoIcon, MoneyIcon, FileTextIcon, ShieldIcon
} from "@/lib/icons"
import BottomSheet from "@/components/BottomSheet"
import { getUserInitials, getAvatarColor } from "@/lib/utils/UserProfileImage"

export function MarketplaceBottomMenu() {
    const pathname = usePathname()
    const { user, supabase } = useSupabase()
    const { profile } = useUserSession()
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [citySlug, setCitySlug] = useState<string | null>(null)

    // Detect city slug on client side for the Home tab
    useEffect(() => {
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem("dudit_city")
            if (stored) {
                setCitySlug(stored)
            }
        }
    }, [])

    // Do not show on ERP, admin, auth, or checkout screens
    const isExcluded =
        pathname.startsWith("/erp") ||
        pathname.startsWith("/ddt-admin") ||
        pathname.startsWith("/auth") ||
        pathname.startsWith("/checkout")

    // Dynamically apply bottom padding to body to prevent bottom bar from overlapping content
    useEffect(() => {
        if (!isExcluded) {
            document.body.classList.add("max-lg:pb-[72px]")
        } else {
            document.body.classList.remove("max-lg:pb-[72px]")
        }
        return () => {
            document.body.classList.remove("max-lg:pb-[72px]")
        }
    }, [isExcluded])

    if (isExcluded) return null

    const homePath = citySlug ? `/${citySlug}` : "/"

    const userName = profile?.full_name
        ? profile.full_name.split(" ")[0]
        : (user?.email?.split("@")[0] || "Visitante")

    const fullName = profile?.full_name || user?.email?.split("@")[0] || "Visitante"

    const handleSignOut = async () => {
        await supabase.auth.signOut({ scope: "local" })
        setIsMenuOpen(false)
        window.location.href = "/"
    }

    const MenuItem = ({
        label,
        href,
        icon: Icon,
        onClick
    }: {
        label: string
        href?: string
        icon: any
        onClick?: () => void
    }) => {
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
                <Link href={href} onClick={() => setIsMenuOpen(false)}>
                    {content}
                </Link>
            )
        }

        return (
            <div onClick={() => {
                onClick?.()
                setIsMenuOpen(false)
            }}>
                {content}
            </div>
        )
    }

    // Active tab checks
    const isHomeActive = pathname === "/" || pathname === `/${citySlug}`
    const isExploreActive = pathname.startsWith("/explorar")
    const isOrdersActive = pathname.startsWith("/pedidos")

    return (
        <>
            {/* Bottom Nav Bar */}
            <nav
                className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-dark-background/95 border-t border-gray-100 dark:border-dark-border shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md pb-[calc(env(safe-area-inset-bottom,0px))] h-[68px] flex justify-around items-center"
                style={{ paddingBottom: "calc(4px + env(safe-area-inset-bottom, 0px))" }}
            >
                <Link
                    href="/"
                    className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 active:scale-95 ${isHomeActive ? "text-brand-green font-bold" : "text-brand-inactive-text font-medium"
                        }`}
                >
                    <HomeIcon size={22} className={isHomeActive ? "text-brand-green" : "text-brand-inactive-text"} />
                    <span className="text-[11px] mt-1">Início</span>
                </Link>

                <Link
                    href="/explorar"
                    className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 active:scale-95 ${isExploreActive ? "text-brand-green font-bold" : "text-brand-inactive-text font-medium"
                        }`}
                >
                    <SearchIcon size={22} className={isExploreActive ? "text-brand-green" : "text-brand-inactive-text"} />
                    <span className="text-[11px] mt-1">Explorar</span>
                </Link>

                <Link
                    href="/pedidos"
                    className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 active:scale-95 ${isOrdersActive ? "text-brand-green font-bold" : "text-brand-inactive-text font-medium"
                        }`}
                >
                    <Package size={22} className={isOrdersActive ? "text-brand-green" : "text-brand-inactive-text"} />
                    <span className="text-[11px] mt-1">Pedidos</span>
                </Link>

                <button
                    onClick={() => setIsMenuOpen(true)}
                    className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 active:scale-95 ${isMenuOpen ? "text-brand-green font-bold" : "text-brand-inactive-text font-medium"
                        }`}
                >
                    <MenuIcon size={22} className={isMenuOpen ? "text-brand-green" : "text-brand-inactive-text"} />
                    <span className="text-[11px] mt-1">Menu</span>
                </button>
            </nav>

            {/* Menu Overlay Drawer */}
            <BottomSheet isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)}>
                <div className="flex flex-col pb-6 text-brand-dark dark:text-white">
                    {/* User Profile Header Card */}
                    <div className="bg-gradient-to-r from-brand-dark to-brand-green rounded-2xl p-5 text-white flex items-center justify-between shadow-md mb-6 -mx-1 mt-1">
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
                        <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-2">
                            Minha atividade
                        </span>
                        <div className="space-y-1">
                            <MenuItem label="Início" href="/" icon={HomeIcon} />
                            <MenuItem
                                label="Central de Vendedores"
                                href={user ? "/erp/switch" : "/auth/login?mode=partner"}
                                icon={StoreIcon}
                            />
                            <MenuItem label="Central de Ajuda" href="/ajuda" icon={HelpCircleIcon} />
                            <MenuItem
                                label="Favoritos"
                                href={user ? "/perfil?tab=enderecos" : "/auth/login"}
                                icon={HeartIcon}
                            />
                            <MenuItem
                                label="Minhas opiniões"
                                href={user ? "/perfil" : "/auth/login"}
                                icon={StarIcon}
                            />
                        </div>
                    </div>

                    {/* Navigation Group 2: Institutional */}
                    <div className="flex flex-col mt-6">
                        <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-2">
                            Institucional
                        </span>
                        <div className="space-y-1">
                            <MenuItem label="Sobre a Dudit" href="/institucional/sobre" icon={InfoIcon} />
                            <MenuItem label="Nossos Planos" href="/institucional/planos" icon={MoneyIcon} />
                            <MenuItem label="Termos e condições" href="/institucional/termos" icon={FileTextIcon} />
                            <MenuItem label="Política de privacidade" href="/institucional/privacidade" icon={ShieldIcon} />
                        </div>
                    </div>

                    {/* Session Log out */}
                    {user && (
                        <div className="border-t border-gray-100 dark:border-dark-border mt-6 pt-4 px-2">
                            <button
                                onClick={handleSignOut}
                                className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 text-brand-red font-semibold transition-all duration-200 w-full text-left group"
                            >
                                <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center text-brand-red shrink-0 group-hover:scale-105 transition-transform duration-200">
                                    <LogoutIcon size={20} className="text-brand-red" />
                                </div>
                                <span className="text-[14px]">Sair da sessão</span>
                            </button>
                        </div>
                    )}
                </div>
            </BottomSheet>
        </>
    )
}
