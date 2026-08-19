"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { Drawer } from "vaul"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"
import {
    HomeIcon,
    TruckIcon,
    HelpCircleIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronDownIcon,
    MenuIcon,
    MoonIcon,
    SunIcon,
    LogoutIcon,
} from "@/lib/icons"
import { useSidebar } from "@/lib/sidebar-context"
import { Dropdown, DropdownItem } from "@/components/reusable"
import { getUserInitials, getAvatarColor } from "@/lib/utils/UserProfileImage"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"

interface NavItem {
    label: string
    href: string
    icon: any
}

const navItems: NavItem[] = [
    {
        label: "Início",
        href: "/entregadores",
        icon: HomeIcon,
    },
    {
        label: "Minhas Entregas",
        href: "/entregadores/entregas",
        icon: TruckIcon,
    },
]

const ChevronRight = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="m9 18 6-6-6-6" />
    </svg>
)

export function DeliveryPortalSidebar() {
    const pathname = usePathname()
    const { isExpanded, toggleSidebar, isMobileOpen, setIsMobileOpen } = useSidebar()
    const isCollapsed = !isExpanded
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    const isActivePath = (href: string) => {
        if (href === "/entregadores") {
            return pathname === "/entregadores"
        }
        return pathname === href || pathname.startsWith(`${href}/`)
    }

    const activeClasses = "bg-brand-gray text-brand-dark font-semibold dark:bg-dark-border dark:text-dark-heading shadow-xs"
    const inactiveClasses = "text-brand-inactive-text hover:bg-brand-gray hover:text-brand-dark dark:text-dark-body dark:hover:bg-dark-border/60 dark:hover:text-dark-heading"

    return (
        <>
            {/* DESKTOP SIDEBAR */}
            <aside
                className={cn(
                    "hidden md:flex flex-col bg-white dark:bg-dark-background border-r border-brand-border dark:border-dark-border z-30 transition-all duration-300 ease-in-out shrink-0 select-none relative",
                    isCollapsed ? "w-[72px]" : "w-64"
                )}
            >
                {/* LOGO AREA */}
                <div
                    className={cn(
                        "h-16 flex items-center px-4 border-b border-brand-border dark:border-dark-border transition-all duration-300",
                        isCollapsed ? "justify-center px-2" : "justify-between"
                    )}
                >
                    <Link
                        href="/entregadores"
                        className="flex items-center gap-3 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-brand-green rounded-lg"
                    >
                        {!isCollapsed ? (
                            <img
                                src="https://img.dudit.com.br/static/Logo.png"
                                alt="Dudit"
                                className="h-7 w-auto transition-all"
                            />
                        ) : (
                            <div className="w-9 h-9 rounded-xl bg-brand-green/10 dark:bg-brand-green/20 text-brand-green font-bold flex items-center justify-center text-lg shadow-xs">
                                D
                            </div>
                        )}
                    </Link>
                </div>

                {/* SECTION LABEL */}
                {!isCollapsed && (
                    <div className="px-5 pt-5 pb-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-brand-inactive-text/70 dark:text-dark-body/60">
                            Portal do Entregador
                        </p>
                    </div>
                )}

                {/* NAVIGATION ITEMS */}
                <nav
                    className={cn(
                        "grow py-3 px-3",
                        isCollapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden custom-scrollbar"
                    )}
                >
                    <ul className="space-y-1.5">
                        {navItems.map((item) => {
                            const Icon = item.icon
                            const active = isActivePath(item.href)

                            if (isCollapsed) {
                                return (
                                    <li key={item.label} className="relative group w-full">
                                        <TooltipPrimitive.Provider delayDuration={150}>
                                            <TooltipPrimitive.Root>
                                                <TooltipPrimitive.Trigger asChild>
                                                    <Link
                                                        href={item.href}
                                                        className={cn(
                                                            "flex items-center justify-center rounded-xl transition-all duration-200 min-h-[44px] w-full",
                                                            active ? activeClasses : inactiveClasses
                                                        )}
                                                    >
                                                        <Icon
                                                            size={20}
                                                            className={cn(
                                                                "transition-colors",
                                                                active ? "text-brand-green" : "text-current"
                                                            )}
                                                        />
                                                    </Link>
                                                </TooltipPrimitive.Trigger>
                                                <TooltipPrimitive.Portal>
                                                    <TooltipPrimitive.Content
                                                        side="right"
                                                        sideOffset={12}
                                                        className="z-50 rounded-lg bg-brand-dark dark:bg-dark-surface px-3 py-1.5 text-xs font-semibold text-white shadow-md animate-in fade-in-0 zoom-in-95"
                                                    >
                                                        {item.label}
                                                        <TooltipPrimitive.Arrow className="fill-brand-dark dark:fill-dark-surface" />
                                                    </TooltipPrimitive.Content>
                                                </TooltipPrimitive.Portal>
                                            </TooltipPrimitive.Root>
                                        </TooltipPrimitive.Provider>
                                    </li>
                                )
                            }

                            return (
                                <li key={item.label} className="w-full">
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium",
                                            active ? activeClasses : inactiveClasses
                                        )}
                                    >
                                        <Icon
                                            size={20}
                                            className={cn(
                                                "transition-colors shrink-0",
                                                active ? "text-brand-green" : "text-current"
                                            )}
                                        />
                                        <span className="truncate">{item.label}</span>
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                </nav>

                {/* BOTTOM / COLLAPSE BUTTON */}
                <div className="p-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between gap-2">
                    {!isCollapsed ? (
                        <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body truncate pl-1">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                            <span className="truncate">Operação Ativa</span>
                        </div>
                    ) : null}

                    <button
                        type="button"
                        onClick={toggleSidebar}
                        aria-label={isCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
                        className={cn(
                            "flex items-center justify-center h-9 w-9 rounded-xl text-brand-inactive-text hover:bg-brand-gray hover:text-brand-dark dark:hover:bg-dark-border dark:hover:text-dark-heading transition-colors",
                            isCollapsed && "mx-auto"
                        )}
                        title={isCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
                    >
                        {isCollapsed ? <ChevronRightIcon size={18} /> : <ChevronLeftIcon size={18} />}
                    </button>
                </div>
            </aside>

            {/* MOBILE DRAWER (VAUL) */}
            <Drawer.Root open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 bg-black/50 z-50 backdrop-blur-xs" />
                    <Drawer.Content className="bg-white dark:bg-dark-background border-t border-brand-border dark:border-dark-border flex flex-col rounded-t-[24px] max-h-[85vh] fixed bottom-0 left-0 right-0 z-60 outline-none shadow-2xl">
                        <div className="mx-auto w-12 h-1.5 shrink-0 rounded-full bg-gray-300 dark:bg-dark-border mt-3 mb-2" />
                        <div className="px-5 py-4 border-b border-brand-border dark:border-dark-border flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <img
                                    src="https://img.dudit.com.br/static/Logo.png"
                                    alt="Dudit"
                                    className="h-6 w-auto"
                                />
                                <span className="text-xs font-semibold uppercase tracking-wider text-brand-inactive-text">
                                    Portal do Entregador
                                </span>
                            </div>
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto">
                            <nav className="flex flex-col gap-2">
                                {navItems.map((item) => {
                                    const Icon = item.icon
                                    const active = isActivePath(item.href)
                                    return (
                                        <Link
                                            key={item.label}
                                            href={item.href}
                                            onClick={() => setIsMobileOpen(false)}
                                            className={cn(
                                                "flex items-center gap-3 p-3.5 rounded-xl transition-colors text-base font-medium",
                                                active ? activeClasses : inactiveClasses
                                            )}
                                        >
                                            <Icon
                                                size={22}
                                                className={cn(active ? "text-brand-green" : "text-current")}
                                            />
                                            <span>{item.label}</span>
                                        </Link>
                                    )
                                })}
                            </nav>
                        </div>
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        </>
    )
}

interface UserProfileData {
    fullName: string
    email: string
    initials: string
    avatarColor: string
}

export function DeliveryPortalHeader({ userProfile }: { userProfile?: UserProfileData }) {
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const pathname = usePathname()
    const { setIsMobileOpen } = useSidebar()
    const [isTransitioning, setIsTransitioning] = useState(false)

    const userName = userProfile?.fullName || "Entregador"
    const userEmail = userProfile?.email || ""
    const userInitials = userProfile?.initials || getUserInitials(userName)
    const avatarColor = userProfile?.avatarColor || getAvatarColor(userName)

    const getPageTitle = () => {
        if (pathname === "/entregadores") return "Início"
        if (pathname === "/entregadores/entregas") return "Minhas Entregas"
        if (pathname.startsWith("/entregadores/entregas/")) return "Detalhes da Entrega"
        return "Portal do Entregador"
    }

    const isSubPage = pathname.startsWith("/entregadores/entregas/") && pathname !== "/entregadores/entregas"
    const displayTitle = getPageTitle()

    const handleThemeChange = (event: React.MouseEvent<HTMLButtonElement>) => {
        if (isTransitioning) return

        // @ts-ignore
        if (!document.startViewTransition) {
            setTheme(theme === "dark" ? "light" : "dark")
            return
        }

        const x = event.clientX
        const y = event.clientY
        const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))

        setIsTransitioning(true)

        // @ts-ignore
        const transition = document.startViewTransition(() => {
            setTheme(theme === "dark" ? "light" : "dark")
        })

        transition.ready.then(() => {
            const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
            document.documentElement.animate(
                { clipPath: clipPath },
                {
                    duration: 500,
                    easing: "ease-in-out",
                    pseudoElement: "::view-transition-new(root)",
                }
            )
        })

        transition.finished.finally(() => {
            setIsTransitioning(false)
        })
    }

    const handleSignOut = async () => {
        document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
        localStorage.removeItem("dudit_city")
        await supabase.auth.signOut({ scope: "local" })
        window.location.href = "/auth/login?mode=partner"
    }

    return (
        <header className="sticky top-0 bg-brand-page-bg dark:bg-dark-background z-30 border-b border-brand-border dark:border-dark-border">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-14 relative">
                    {/* LEFT / BREADCRUMB */}
                    <div className="flex items-center gap-3">
                        {isSubPage ? (
                            <button
                                className="text-brand-dark dark:text-dark-heading md:hidden p-1.5 -ml-1.5 rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border"
                                onClick={() => router.push("/entregadores/entregas")}
                                aria-label="Voltar"
                            >
                                <ChevronLeftIcon className="w-6 h-6" />
                            </button>
                        ) : (
                            <button
                                className="text-brand-dark dark:text-dark-heading md:hidden p-1.5 -ml-1.5 rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border"
                                onClick={() => setIsMobileOpen(true)}
                                aria-label="Abrir menu"
                            >
                                <MenuIcon className="w-6 h-6" />
                            </button>
                        )}

                        {/* DESKTOP BREADCRUMB */}
                        <div className="hidden md:flex items-center gap-2">
                            <Link
                                href="/entregadores"
                                className="group flex items-center gap-2 pl-2 pr-3 py-1 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border transition-colors cursor-pointer select-none"
                            >
                                <div className="w-5 h-5 rounded-md bg-brand-green/10 text-brand-green flex items-center justify-center">
                                    <TruckIcon size={13} />
                                </div>
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading leading-none">
                                    Portal do Entregador
                                </span>
                            </Link>

                            <ChevronRight className="w-4 h-4 text-brand-inactive-text/50 dark:text-dark-body/50" />

                            <h1 className="text-sm font-medium text-brand-inactive-text dark:text-dark-body px-1">
                                {displayTitle}
                            </h1>
                        </div>
                    </div>

                    {/* MOBILE TITLE */}
                    <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 md:hidden max-w-[200px] truncate text-center">
                        <h1 className="text-base font-bold text-brand-dark dark:text-dark-heading truncate">
                            {displayTitle}
                        </h1>
                    </div>

                    {/* RIGHT ACTIONS */}
                    <div className="flex items-center gap-3">
                        {/* THEME TOGGLE */}
                        <button
                            type="button"
                            onClick={handleThemeChange}
                            aria-label="Alternar tema claro/escuro"
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-border bg-white text-brand-dark hover:bg-brand-gray dark:border-dark-border dark:bg-dark-surface dark:text-dark-heading dark:hover:bg-dark-border transition-colors cursor-pointer shrink-0"
                            title="Alternar tema"
                        >
                            {theme === "dark" ? (
                                <SunIcon className="w-4 h-4 text-amber-400" />
                            ) : (
                                <MoonIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                            )}
                        </button>

                        <div className="h-6 w-px bg-brand-border dark:border-dark-border" />

                        {/* USER PROFILE DROPDOWN */}
                        <Dropdown
                            align="right"
                            showChevron={false}
                            trigger={
                                <div className="flex items-center gap-2 cursor-pointer select-none">
                                    <div
                                        className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-xs border border-brand-border dark:border-dark-border",
                                            avatarColor
                                        )}
                                    >
                                        {userInitials}
                                    </div>
                                    <div className="hidden lg:flex flex-col text-left">
                                        <span className="text-xs font-bold text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[120px]">
                                            {userName}
                                        </span>
                                        <span className="text-[10px] text-brand-green font-semibold leading-tight">
                                            Entregador
                                        </span>
                                    </div>
                                    <ChevronDownIcon size={14} className="hidden lg:block text-brand-inactive-text opacity-60" />
                                </div>
                            }
                        >
                            <div className="px-4 py-3 border-b border-brand-border dark:border-dark-border">
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                    {userName}
                                </p>
                                {userEmail && (
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate mt-0.5">
                                        {userEmail}
                                    </p>
                                )}
                                <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Entregador Ativo
                                </div>
                            </div>

                            <DropdownItem onClick={() => router.push("/entregadores")}>
                                <HomeIcon size={16} /> Painel Inicial
                            </DropdownItem>
                            <DropdownItem onClick={() => router.push("/entregadores/entregas")}>
                                <TruckIcon size={16} /> Minhas Entregas
                            </DropdownItem>
                            <DropdownItem onClick={() => router.push("/ajuda")}>
                                <HelpCircleIcon size={16} /> Central de Ajuda
                            </DropdownItem>

                            <div className="border-t border-brand-border dark:border-dark-border my-1" />

                            <DropdownItem onClick={handleSignOut} className="text-red-600 dark:text-red-400">
                                <LogoutIcon size={16} /> Sair da conta
                            </DropdownItem>
                        </Dropdown>
                    </div>
                </div>
            </div>
        </header>
    )
}

// Backward compatibility alias
export const DeliveryPortalTopbar = DeliveryPortalHeader
