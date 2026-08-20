"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSupabase } from "@/providers/supabase-provider"
import {
    HomeIcon, SearchIcon, Package, MenuIcon, UserIcon, StoreIcon, HeartIcon, StarIcon, HelpCircleIcon, ChevronRightIcon, LogoutIcon, InfoIcon, MoneyIcon, FileTextIcon, ShieldIcon, EditIcon, TrashIcon
} from "@/lib/icons"
import BottomSheet from "@/components/BottomSheet"
import { getUserInitials, getAvatarColor } from "@/lib/utils/UserProfileImage"
import { useCollectionDetailMenu } from "@/lib/collection-detail-menu"

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
            <Link href={href} prefetch={false} onClick={onClose}>
                {content}
            </Link>
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
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [citySlug, setCitySlug] = useState<string | null>(null)
    const collectionMenu = useCollectionDetailMenu()

    // Detect city slug on client side for the Home and Explorar tabs
    useEffect(() => {
        if (typeof window !== "undefined") {
            let stored = localStorage.getItem("dudit_city")
            if (!stored) {
                const match = document.cookie.match(/(?:^|; )dudit_city=([^;]*)/)
                if (match) stored = match[1]
            }
            if (stored) {
                setCitySlug(stored)
            }
        }
    }, [])

    // Do not show on ERP, admin, auth, checkout, quote or print screens
    const isExcluded =
        !pathname ||
        pathname.startsWith("/erp") ||
        pathname.startsWith("/ddt-admin") ||
        pathname.startsWith("/auth") ||
        pathname.startsWith("/checkout") ||
        pathname.startsWith("/quote") ||
        pathname.startsWith("/print")

    const homePath = citySlug ? `/${citySlug}` : "/"
    const explorePath = citySlug ? `/explorar/${citySlug}` : "/explorar/brasil"

    const isCollectionDetailOwner = !!collectionMenu?.isOwner && pathname?.startsWith("/colecoes/")

    const userName = user?.email?.split("@")[0] || "Visitante"
    const fullName = user?.email?.split("@")[0] || "Visitante"

    const handleSignOut = async () => {
        document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
        localStorage.removeItem("dudit_city")
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
                    <Link
                        href="/"
                        prefetch={false}
                        className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 ${isHomeActive ? "text-brand-green font-bold" : "text-brand-dark dark:text-dark-body font-medium"
                            }`}
                    >
                        <HomeIcon size={22} className={isHomeActive ? "text-brand-green" : "text-brand-dark"} />
                        <span className="text-[11px] mt-1">Início</span>
                    </Link>

                    <Link
                        href={explorePath}
                        prefetch={false}
                        className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 ${isExploreActive ? "text-brand-green font-bold" : "text-brand-dark dark:text-dark-body font-medium"
                            }`}
                    >
                        <SearchIcon size={22} className={isExploreActive ? "text-brand-green" : "text-brand-dark"} />
                        <span className="text-[11px] mt-1">Explorar</span>
                    </Link>

                    <Link
                        href="/pedidos"
                        prefetch={false}
                        className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 ${isOrdersActive ? "text-brand-green font-bold" : "text-brand-dark dark:text-dark-body font-medium"
                            }`}
                    >
                        <Package size={22} className={isOrdersActive ? "text-brand-green" : "text-brand-dark"} />
                        <span className="text-[11px] mt-1">Pedidos</span>
                    </Link>

                    <button
                        onClick={() => setIsMenuOpen(true)}
                        className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 ${isMenuOpen ? "text-brand-green font-bold" : "text-brand-dark dark:text-dark-body font-medium"
                            }`}
                    >
                        <MenuIcon size={22} className={isMenuOpen ? "text-brand-green" : "text-brand-dark"} />
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
                                <MenuItem label="Início" href="/" icon={HomeIcon} onClose={() => setIsMenuOpen(false)} />
                                <MenuItem
                                    label="Central de Vendedores"
                                    href={user ? "/erp/trocar-erp" : "/auth/login?mode=partner"}
                                    icon={StoreIcon}
                                    onClose={() => setIsMenuOpen(false)}
                                />
                                <MenuItem label="Central de Ajuda" href="/ajuda" icon={HelpCircleIcon} onClose={() => setIsMenuOpen(false)} />
                                <MenuItem
                                    label="Favoritos"
                                    href={user ? "/favoritos" : "/auth/login?next=/favoritos"}
                                    icon={HeartIcon}
                                    onClose={() => setIsMenuOpen(false)}
                                />
                                <MenuItem
                                    label="Minhas opiniões"
                                    href={user ? "/perfil" : "/auth/login"}
                                    icon={StarIcon}
                                    onClose={() => setIsMenuOpen(false)}
                                />
                            </div>
                        </div>

                        {/* Navigation Group 2: Institutional */}
                        <div className="flex flex-col mt-6">
                            <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-2">
                                Institucional
                            </span>
                            <div className="space-y-1">
                                <MenuItem label="Sobre a Dudit" href="/institucional/sobre" icon={InfoIcon} onClose={() => setIsMenuOpen(false)} />
                                <MenuItem label="Nossos Planos" href="/institucional/planos" icon={MoneyIcon} onClose={() => setIsMenuOpen(false)} />
                                <MenuItem label="Termos e condições" href="/institucional/termos" icon={FileTextIcon} onClose={() => setIsMenuOpen(false)} />
                                <MenuItem label="Política de privacidade" href="/institucional/privacidade" icon={ShieldIcon} onClose={() => setIsMenuOpen(false)} />
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
            )}
        </>
    )
}
