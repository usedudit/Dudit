"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { TruckIcon, Package, XIcon, ChevronRightIcon } from "@/lib/icons"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { useSidebar } from "@/lib/sidebar-context"
import { Drawer } from "vaul"

interface NavItem {
    icon: any
    label: string
    href: string
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
        href: "/entregadores/entregas-disponiveis",
    },
]

export function DeliverySidebar({
    userProfile,
}: {
    userProfile?: { fullName: string; email: string }
}) {
    const pathname = usePathname()
    const { isExpanded, toggleSidebar, isMobileOpen, setIsMobileOpen } = useSidebar()
    const isCollapsed = !isExpanded

    const [isMounted, setIsMounted] = useState(false)

    // Controle de Hover com Delay
    const [hoveredItem, setHoveredItem] = useState<string | null>(null)
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const sidebarRef = useRef<HTMLDivElement>(null)

    const isActivePath = useCallback((href: string) => {
        if (!pathname) return false
        if (pathname === href) return true
        return pathname.startsWith(href + "/")
    }, [pathname])

    useEffect(() => {
        setIsMounted(true)
    }, [])

    useEffect(() => {
        if (isCollapsed) {
            setHoveredItem(null)
        }
    }, [isCollapsed])

    // Lógica de Hover com Delay
    const handleMouseEnter = (label: string) => {
        if (!isCollapsed) return
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current)
            hoverTimeoutRef.current = null
        }
        setHoveredItem(label)
    }

    const handleMouseLeave = () => {
        if (!isCollapsed) return
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredItem(null)
        }, 150) // 150ms de tolerância
    }

    if (!isMounted) return null

    // Cores Forçadas do Dark Mode
    const activeClasses = "bg-brand-green/10 text-brand-green font-medium"
    const inactiveClasses = "text-brand-inactive-text hover:text-white hover:bg-white/5"

    return (
        <TooltipPrimitive.Provider delayDuration={0}>
            <div
                className={cn(
                    "fixed inset-0 bg-slate-900/50 z-40 md:hidden transition-opacity duration-200",
                    isMobileOpen ? "opacity-100" : "opacity-0 pointer-events-none",
                )}
                aria-hidden="true"
                onClick={() => setIsMobileOpen(false)}
            />

            <div
                ref={sidebarRef}
                className={cn(
                    "flex flex-col fixed z-[120] left-0 top-0 h-screen border-r hidden md:flex",
                    "bg-brand-dark dark:bg-dark-background border-dark-border",
                    "transition-[width] duration-300 ease-in-out",
                    "md:relative md:translate-x-0 md:z-[100]", // Ensure z-index works on desktop by changing from static to relative
                    isCollapsed ? "md:w-[68px]" : "md:w-64",
                    isMobileOpen ? "translate-x-0 w-64" : "-translate-x-full w-64",
                )}
            >
                <div className="h-[65px] flex items-center px-3 overflow-hidden shrink-0 relative transition-all duration-300">
                    <Link href="/" prefetch={false} className="flex items-center gap-3 w-full h-full relative">
                        <div className="flex items-center justify-center shrink-0 w-[44px]">
                            <img
                                src="https://img.dudit.com.br/static/Icon.png"
                                alt="Dudit"
                                className="h-8 w-auto object-contain transition-all duration-300"
                            />
                        </div>
                        <div
                            className={cn(
                                "transition-all duration-300 ease-in-out overflow-hidden flex items-center",
                                isCollapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"
                            )}
                        >
                            <img
                                src="https://img.dudit.com.br/static/Logo.png"
                                alt="Dudit Logo"
                                className="h-8 w-auto object-contain"
                            />
                        </div>
                    </Link>

                    <button className="md:hidden absolute right-2" onClick={() => setIsMobileOpen(false)}>
                        <XIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                    </button>
                </div>

                <div className="px-3 mb-2">
                    <div className="h-px w-full bg-dark-border" />
                </div>

                <button
                    onClick={toggleSidebar}
                    className={cn(
                        "hidden md:flex items-center justify-center absolute -right-3 top-8 z-50 w-6 h-6",
                        "border-white/30 bg-white/10 hover:bg-white/20 text-white border dark:bg-dark-surface dark:border-dark-border rounded-full dark:hover:bg-dark-border",
                        "transition-transform duration-300",
                    )}
                >
                    <ChevronRightIcon
                        className={cn("w-3 h-3 transition-transform duration-300 text-brand-inactive-text dark:text-dark-body", isCollapsed ? "rotate-0" : "rotate-180")}
                    />
                </button>

                <nav
                    className={cn(
                        "grow py-2 px-3",
                        isCollapsed
                            ? "overflow-visible"
                            : "overflow-y-auto overflow-x-hidden scrollbar-hide"
                    )}
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                    <ul className="space-y-1">
                        {navItems.map((item) => {
                            const Icon = item.icon
                            const isDirectActive = isActivePath(item.href)
                            const isActiveGroup = isDirectActive

                            return (
                                <li
                                    key={item.label}
                                    className="relative group w-full"
                                    onMouseEnter={() => handleMouseEnter(item.label)}
                                    onMouseLeave={handleMouseLeave}
                                >
                                    <div className="w-full">
                                        <Link
                                            href={item.href}
                                            prefetch={false}
                                            onClick={() => {
                                                setIsMobileOpen(false)
                                                setHoveredItem(null)
                                            }}
                                            className={cn(
                                                "flex items-center rounded-lg transition-colors duration-200 group relative min-h-[44px] w-full justify-start",
                                                isActiveGroup ? activeClasses : inactiveClasses
                                            )}
                                        >
                                            <div className="w-[44px] h-[44px] flex items-center justify-center shrink-0">
                                                <Icon
                                                    className={cn(
                                                        "w-[20px] h-[20px] transition-colors",
                                                        isActiveGroup ? "text-brand-green" : "text-current"
                                                    )}
                                                />
                                            </div>

                                            <span
                                                className={cn(
                                                    "text-[14px] font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out origin-left flex-1 text-left",
                                                    isCollapsed
                                                        ? "max-w-0 md:opacity-0 translate-x-[-10px] md:block hidden"
                                                        : "max-w-[150px] opacity-100 translate-x-0",
                                                )}
                                            >
                                                {item.label}
                                            </span>
                                        </Link>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </nav>
            </div>

            {/* MOBILE BOTTOM SHEET (VAUL) */}
            <Drawer.Root open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
                    <Drawer.Content className="bg-brand-dark dark:bg-dark-background border-t border-dark-border flex flex-col rounded-t-[20px] h-[85vh] fixed bottom-0 left-0 right-0 z-60 outline-none">
                        <div className="mx-auto w-12 h-1.5 shrink-0 rounded-full bg-dark-border mt-3 mb-2" />

                        {/* Top Bar: Logo Dudit with link to homepage / marketplace */}
                        <div className="px-4 py-2 flex items-center justify-between shrink-0">
                            <Link
                                href="/"
                                prefetch={false}
                                onClick={() => setIsMobileOpen(false)}
                                className="flex items-center gap-3 group"
                            >
                                <div className="flex items-center justify-center shrink-0 w-[36px]">
                                    <img
                                        src="https://img.dudit.com.br/static/Icon.png"
                                        alt="Dudit"
                                        className="h-7 w-auto object-contain transition-transform group-hover:scale-105"
                                    />
                                </div>
                                <img
                                    src="https://img.dudit.com.br/static/Logo.png"
                                    alt="Dudit Logo"
                                    className="h-6 w-auto object-contain"
                                />
                            </Link>

                            <button
                                type="button"
                                onClick={() => setIsMobileOpen(false)}
                                className="p-1.5 rounded-lg text-brand-inactive-text hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <XIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-4 my-1 shrink-0">
                            <div className="h-px w-full bg-dark-border" />
                        </div>

                        <div className="p-4 pt-1 flex-1 overflow-y-auto no-scrollbar">
                            <nav className="flex flex-col gap-1">
                                {navItems.map((item) => {
                                    const Icon = item.icon
                                    const isActive = item.href ? isActivePath(item.href) : false

                                    return (
                                        <div key={item.label} className="flex flex-col">
                                            <Link
                                                href={item.href}
                                                prefetch={false}
                                                className={cn(
                                                    "flex items-center gap-3 p-3 rounded-xl transition-colors relative",
                                                    isActive ? activeClasses : inactiveClasses
                                                )}
                                                onClick={() => setIsMobileOpen(false)}
                                            >
                                                <Icon size={20} className={isActive ? "text-brand-green" : ""} />
                                                <span className="text-[15px] font-medium flex-1 text-left">{item.label}</span>
                                            </Link>
                                        </div>
                                    )
                                })}
                            </nav>
                        </div>
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        </TooltipPrimitive.Provider>
    )
}