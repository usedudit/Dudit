"use client"

import React, { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
    TruckIcon,
    Package,
    CheckCircleIcon,
    MoonIcon,
    SunIcon,
    LogoutIcon,
    UserIcon,
    ChevronLeftIcon,
    MenuIcon,
    XIcon,
} from "@/lib/icons"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { getUserInitials, getAvatarColor } from "@/lib/utils/UserProfileImage"
import { setMyDeliveryAvailabilityAction } from "@/app/actions/delivery-drivers"
import { toast } from "@/hooks/use-notification"

interface NavItem {
    icon: any
    label: string
    href: string
    badge?: string
}

const navItems: NavItem[] = [
    {
        icon: TruckIcon,
        label: "Minhas Entregas",
        href: "/entregadores",
    },
    {
        icon: Package,
        label: "Entregas Disponíveis",
        href: "/entregadores/disponiveis",
    },
]

export function DeliverySidebar({
    userProfile,
    initialOnline = true,
}: {
    userProfile?: { fullName: string; email: string }
    initialOnline?: boolean
}) {
    const pathname = usePathname()
    const router = useRouter()
    const { theme, setTheme } = useTheme()
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isMobileOpen, setIsMobileOpen] = useState(false)
    const [isOnline, setIsOnline] = useState(initialOnline)
    const [isTogglingAvailability, setIsTogglingAvailability] = useState(false)

    const userName = userProfile?.fullName || "Entregador"
    const userEmail = userProfile?.email || ""
    const userInitials = getUserInitials(userName)
    const avatarColor = getAvatarColor(userName)

    const handleToggleAvailability = async () => {
        setIsTogglingAvailability(true)
        const nextStatus = isOnline ? "offline" : "available"
        try {
            const res = await setMyDeliveryAvailabilityAction(nextStatus)
            if (res.success) {
                setIsOnline(!isOnline)
                toast.success(isOnline ? "Você está offline agora." : "Você está online e pronto para receber entregas!")
            } else {
                toast.error(res.error || "Não foi possível alterar status.")
            }
        } catch {
            toast.error("Erro ao alterar disponibilidade.")
        } finally {
            setIsTogglingAvailability(false)
        }
    }

    const handleSignOut = async () => {
        document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
        localStorage.removeItem("dudit_city")
        await supabase.auth.signOut({ scope: "local" })
        window.location.href = "/auth/login"
    }

    const isActiveRoute = (href: string) => {
        if (href === "/entregadores") {
            return pathname === "/entregadores" || pathname.startsWith("/entregadores/entregas")
        }
        return pathname === href || pathname.startsWith(href)
    }

    const sidebarContent = (
        <div className="flex h-full flex-col justify-between overflow-hidden bg-white dark:bg-dark-surface border-r border-brand-border dark:border-dark-border select-none">
            {/* TOP HEADER / BRAND */}
            <div>
                <div className={cn("flex items-center justify-between border-b border-brand-border px-4 py-3.5 dark:border-dark-border", isCollapsed ? "justify-center px-2" : "px-4")}>
                    <Link
                        href="/entregadores"
                        className={cn("flex items-center gap-2.5 overflow-hidden transition-all", isCollapsed && "justify-center")}
                    >
                        <img
                            src="https://img.dudit.com.br/static/Logo.png"
                            alt="Dudit"
                            className="h-7 w-auto shrink-0"
                        />
                        {!isCollapsed && (
                            <div className="flex flex-col">
                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading leading-tight">
                                    Dudit Entregas
                                </span>
                                <span className="text-[11px] font-semibold text-brand-green">
                                    Portal do Entregador
                                </span>
                            </div>
                        )}
                    </Link>

                    {/* COLLAPSE TOGGLE (DESKTOP) */}
                    <button
                        type="button"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="hidden md:flex h-7 w-7 items-center justify-center rounded-lg text-brand-inactive-text hover:bg-brand-gray hover:text-brand-dark dark:hover:bg-dark-border dark:hover:text-white transition-colors cursor-pointer"
                        title={isCollapsed ? "Expandir menu" : "Recolher menu"}
                    >
                        <ChevronLeftIcon className={cn("w-4 h-4 transition-transform duration-200", isCollapsed && "rotate-180")} />
                    </button>
                </div>

                {/* DRIVER PROFILE / AVAILABILITY STATUS */}
                <div className={cn("p-3 border-b border-brand-border dark:border-dark-border bg-gray-50/50 dark:bg-dark-border/10", isCollapsed && "p-2")}>
                    {!isCollapsed ? (
                        <div className="space-y-2.5">
                            <div className="flex items-center gap-3">
                                <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs", avatarColor)}>
                                    {userInitials}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-xs text-brand-dark dark:text-dark-heading truncate">
                                        {userName}
                                    </p>
                                    <p className="text-[11px] text-brand-inactive-text dark:text-dark-body truncate">
                                        {userEmail}
                                    </p>
                                </div>
                            </div>

                            {/* ONLINE / OFFLINE TOGGLE */}
                            <button
                                type="button"
                                onClick={handleToggleAvailability}
                                disabled={isTogglingAvailability}
                                className={cn(
                                    "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border shadow-2xs",
                                    isOnline
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
                                        : "bg-gray-100 border-gray-200 text-gray-600 dark:bg-dark-border/40 dark:border-dark-border dark:text-dark-body"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", isOnline ? "bg-emerald-500 animate-pulse" : "bg-gray-400")} />
                                    <span>{isOnline ? "Online (Recebendo)" : "Offline (Pausado)"}</span>
                                </div>
                                <span className="text-[10px] uppercase font-extrabold opacity-75">
                                    {isOnline ? "Ativo" : "Inativo"}
                                </span>
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={handleToggleAvailability}
                            disabled={isTogglingAvailability}
                            className="w-full flex justify-center py-2 cursor-pointer"
                            title={isOnline ? "Status: Online" : "Status: Offline"}
                        >
                            <span className={cn("w-3 h-3 rounded-full", isOnline ? "bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-900/40" : "bg-gray-400")} />
                        </button>
                    )}
                </div>

                {/* NAVIGATION ITEMS */}
                <nav className="p-2 space-y-1">
                    <TooltipPrimitive.Provider delayDuration={100}>
                        {navItems.map((item) => {
                            const active = isActiveRoute(item.href)
                            const IconComponent = item.icon

                            const linkElement = (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all duration-150 group relative cursor-pointer",
                                        active
                                            ? "bg-brand-green/10 text-brand-green font-bold dark:bg-brand-green/15 dark:text-emerald-400"
                                            : "text-brand-inactive-text hover:bg-brand-gray hover:text-brand-dark dark:text-dark-body dark:hover:bg-dark-border dark:hover:text-white",
                                        isCollapsed && "justify-center px-2"
                                    )}
                                >
                                    <IconComponent className={cn("w-5 h-5 shrink-0 transition-transform duration-150 group-hover:scale-105", active && "text-brand-green dark:text-emerald-400")} />
                                    {!isCollapsed && (
                                        <span className="truncate">{item.label}</span>
                                    )}
                                    {active && (
                                        <motion.div
                                            layoutId="active-pill"
                                            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-brand-green rounded-r-full"
                                        />
                                    )}
                                </Link>
                            )

                            if (isCollapsed) {
                                return (
                                    <TooltipPrimitive.Root key={item.href}>
                                        <TooltipPrimitive.Trigger asChild>
                                            {linkElement}
                                        </TooltipPrimitive.Trigger>
                                        <TooltipPrimitive.Portal>
                                            <TooltipPrimitive.Content
                                                side="right"
                                                sideOffset={8}
                                                className="z-50 rounded-lg bg-brand-dark px-3 py-1.5 text-xs font-bold text-white shadow-md dark:bg-dark-surface dark:text-white border border-brand-border/20"
                                            >
                                                {item.label}
                                                <TooltipPrimitive.Arrow className="fill-brand-dark dark:fill-dark-surface" />
                                            </TooltipPrimitive.Content>
                                        </TooltipPrimitive.Portal>
                                    </TooltipPrimitive.Root>
                                )
                            }

                            return linkElement
                        })}
                    </TooltipPrimitive.Provider>
                </nav>
            </div>

            {/* BOTTOM / FOOTER ACTIONS */}
            <div className={cn("p-2 border-t border-brand-border dark:border-dark-border space-y-1", isCollapsed && "p-1.5")}>
                {/* THEME TOGGLE */}
                <button
                    type="button"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-brand-inactive-text hover:bg-brand-gray hover:text-brand-dark dark:text-dark-body dark:hover:bg-dark-border dark:hover:text-white transition-colors cursor-pointer",
                        isCollapsed && "justify-center px-2"
                    )}
                    title="Alternar tema claro/escuro"
                >
                    {theme === "dark" ? <SunIcon className="w-4 h-4 text-amber-400 shrink-0" /> : <MoonIcon className="w-4 h-4 shrink-0" />}
                    {!isCollapsed && <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>}
                </button>

                {/* SIGN OUT */}
                <button
                    type="button"
                    onClick={handleSignOut}
                    className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-brand-red hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer",
                        isCollapsed && "justify-center px-2"
                    )}
                    title="Sair da sessão"
                >
                    <LogoutIcon className="w-4 h-4 shrink-0 text-brand-red" />
                    {!isCollapsed && <span>Sair da conta</span>}
                </button>
            </div>
        </div>
    )

    return (
        <>
            {/* DESKTOP SIDEBAR */}
            <aside
                className={cn(
                    "hidden md:block h-screen shrink-0 transition-all duration-300 ease-in-out sticky top-0 z-40",
                    isCollapsed ? "w-16" : "w-64"
                )}
            >
                {sidebarContent}
            </aside>

            {/* MOBILE FLOATING MENU TRIGGER */}
            <div className="md:hidden fixed bottom-4 right-4 z-40">
                <button
                    type="button"
                    onClick={() => setIsMobileOpen(true)}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-green text-white shadow-lg hover:bg-brand-green/90 transition-transform active:scale-95 cursor-pointer"
                    aria-label="Abrir menu"
                >
                    <MenuIcon size={22} />
                </button>
            </div>

            {/* MOBILE DRAWER */}
            {isMobileOpen && (
                <div
                    className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-xs transition-opacity"
                    onClick={() => setIsMobileOpen(false)}
                >
                    <div
                        className="fixed left-0 top-0 bottom-0 w-72 bg-white dark:bg-dark-surface shadow-2xl transition-transform"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-end p-2 border-b border-brand-border dark:border-dark-border">
                            <button
                                type="button"
                                onClick={() => setIsMobileOpen(false)}
                                className="p-2 text-brand-inactive-text hover:bg-brand-gray dark:hover:bg-dark-border rounded-lg cursor-pointer"
                            >
                                <XIcon size={20} />
                            </button>
                        </div>
                        <div className="h-[calc(100%-48px)]">
                            {sidebarContent}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
