"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Menu, XIcon, ChevronRightIcon, ChevronDownIcon, HomeIcon, ShieldIcon, ShoppingCartIcon, ReturnIcon, MoneyIcon, UserIcon, MegaphoneIcon, FlagIcon, FileIcon, BriefcaseIcon, MotorbikeIcon, AnalyticsIcon, SettingsConfigIcon, BoxIcon } from "@/lib/icons"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { useSidebarState } from "@/lib/hooks/use-sidebar-state"
import { motion, AnimatePresence } from "framer-motion"
import { Drawer } from "vaul"

interface SubMenuItem {
    label: string
    href: string
}

interface NavItem {
    icon: any
    label: string
    href?: string
    submenu?: SubMenuItem[]
}

const navItems: NavItem[] = [
    {
        icon: HomeIcon,
        label: "Início",
        href: "/",
    },
    {
        icon: AnalyticsIcon,
        label: "Analytics da Dudit",
        href: "/ddt-admin/analytics",
    },
    {
        icon: SettingsConfigIcon,
        label: "Sistema & Manutenção",
        href: "/ddt-admin/system",
    },
    {
        icon: ShieldIcon,
        label: "Moderação",
        href: "/ddt-admin/moderation",
    },
    {
        icon: ShoppingCartIcon,
        label: "Pedidos",
        href: "/ddt-admin/orders",
    },
    {
        icon: ReturnIcon,
        label: "Trocas e devolucoes",
        href: "/ddt-admin/returns",
    },
    {
        icon: MoneyIcon,
        label: "Faturamento",
        href: "/ddt-admin/billing",
        submenu: [
            { label: "Dashboard", href: "/ddt-admin/billing" },
            { label: "Compras", href: "/ddt-admin/billing/purchases" },
            { label: "Assinaturas", href: "/ddt-admin/billing/subscriptions" },
            { label: "Pagamentos", href: "/ddt-admin/billing/payments" },
            { label: "Faturas", href: "/ddt-admin/billing/invoices" },
            { label: "Reembolsos", href: "/ddt-admin/billing/reembolsos" },
        ],
    },
    {
        icon: UserIcon,
        label: "Usuários / Punições",
        href: "/ddt-admin/users",
    },
    {
        icon: BriefcaseIcon,
        label: "Parceiros",
        href: "/ddt-admin/partners",
    },
    {
        icon: BoxIcon,
        label: "Catálogo",
        submenu: [
            { label: "Produtos", href: "/ddt-admin/catalog/products" },
            { label: "Serviços", href: "/ddt-admin/catalog/services" },
            { label: "Planos recorrentes", href: "/ddt-admin/catalog/plans" },
        ],
    },
    {
        icon: MotorbikeIcon,
        label: "Entregadores",
        href: "/ddt-admin/entregadores",
    },
    {
        icon: MegaphoneIcon,
        label: "Publicidade",
        href: "/ddt-admin/advertising",
    },
    {
        icon: FlagIcon,
        label: "Denúncias",
        href: "/ddt-admin/reports",
    },
    {
        icon: FileIcon,
        label: "Audit Logs",
        href: "/ddt-admin/audit",
    },
]

import { useSidebar } from "@/lib/sidebar-context"

interface AdminSidebarProps {
    initialExpanded?: boolean
}

export function AdminSidebar({ initialExpanded = true }: AdminSidebarProps) {
    const pathname = usePathname()
    const fallbackSidebar = useSidebarState(initialExpanded)

    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch {
        // Outside SidebarProvider
    }

    const isExpanded = sidebarContext ? sidebarContext.isExpanded : fallbackSidebar.isExpanded
    const toggleSidebar = sidebarContext ? sidebarContext.toggleSidebar : fallbackSidebar.toggleSidebar
    const isCollapsed = !isExpanded

    const isMobileOpen = sidebarContext ? sidebarContext.isMobileOpen : false
    const setIsMobileOpen = sidebarContext ? sidebarContext.setIsMobileOpen : () => { }

    const [isMounted, setIsMounted] = useState(false)
    const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)

    // Controle de Hover com Delay
    const [hoveredItem, setHoveredItem] = useState<string | null>(null)
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const sidebarRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)

    const isActivePath = useCallback((href: string) => {
        if (href === "/ddt-admin") {
            return pathname === href
        }
        return pathname === href || pathname?.startsWith(href + "/")
    }, [pathname])

    const filteredNavItems = navItems

    useEffect(() => {
        setIsMounted(true)
    }, [])

    useEffect(() => {
        if (isCollapsed) return

        const activeItem = navItems.find((item) =>
            item.submenu?.some((sub) => isActivePath(sub.href)),
        )
        if (activeItem && openSubmenu !== activeItem.label) {
            setOpenSubmenu(activeItem.label)
        }
    }, [pathname, isCollapsed, isActivePath])

    useEffect(() => {
        if (isCollapsed) {
            setOpenSubmenu(null)
            setHoveredItem(null)
        }
    }, [isCollapsed])

    const toggleSubmenu = (label: string) => {
        setOpenSubmenu((prev) => (prev === label ? null : label))
    }

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
            {/* DESKTOP SIDEBAR */}
            <div
                ref={sidebarRef}
                className={cn(
                    "hidden xl:flex flex-col fixed z-40 left-0 top-0 h-screen border-r",
                    "bg-brand-dark dark:bg-dark-background border-dark-border",
                    "transition-[width] duration-300 ease-in-out",
                    "xl:static xl:translate-x-0",
                    isCollapsed ? "xl:w-[68px]" : "xl:w-64",
                )}
            >
                <div className="h-[65px] flex items-center px-3 overflow-hidden shrink-0 relative transition-all duration-300">
                    <Link href="/ddt-admin" prefetch={false} className="flex items-center gap-3 w-full h-full relative">
                        <div className="flex items-center justify-center shrink-0 w-[44px]">
                            <img
                                src="https://img.dudit.com.br/static/Icon.png"
                                alt="Dudit Icon"
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
                                className="h-7 w-auto object-contain"
                            />
                        </div>
                    </Link>
                </div>

                <div className="px-3 mb-2">
                    <div className="h-px w-full bg-dark-border" />
                </div>

                <button
                    onClick={toggleSidebar}
                    className={cn(
                        "hidden xl:flex items-center justify-center absolute -right-3 top-8 z-50 w-6 h-6",
                        "bg-dark-surface border border-dark-border rounded-full shadow-sm hover:bg-dark-border",
                        "transition-transform duration-300",
                    )}
                >
                    <ChevronRightIcon
                        className={cn("w-3 h-3 transition-transform duration-300 text-gray-400", isCollapsed ? "rotate-0" : "rotate-180")}
                    />
                </button>

                <nav
                    className={cn(
                        "flex-grow py-2 px-3",
                        isCollapsed
                            ? "overflow-visible"
                            : "overflow-y-auto overflow-x-hidden scrollbar-hide"
                    )}
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                    <ul className="space-y-1">
                        {filteredNavItems.map((item) => {
                            const Icon = item.icon
                            const hasSubmenu = item.submenu && item.submenu.length > 0
                            const isMenuExpanded = openSubmenu === item.label

                            const isDirectActive = item.href ? isActivePath(item.href) : false
                            const isSubActive = hasSubmenu && item.submenu?.some((sub) => isActivePath(sub.href))
                            const isActiveGroup = isDirectActive || isSubActive

                            return (
                                <li
                                    key={item.label}
                                    className="relative group w-full"
                                    onMouseEnter={() => handleMouseEnter(item.label)}
                                    onMouseLeave={handleMouseLeave}
                                >
                                    <div className="w-full">
                                        <button
                                            onClick={(e) => {
                                                if (!isCollapsed && hasSubmenu) {
                                                    toggleSubmenu(item.label)
                                                }
                                            }}
                                            className={cn(
                                                "flex items-center rounded-lg transition-colors duration-200 group relative min-h-[44px] w-full justify-start",
                                                isActiveGroup ? activeClasses : inactiveClasses
                                            )}
                                        >
                                            {item.href && !hasSubmenu ? (
                                                <Link href={item.href} prefetch={false} className="absolute inset-0 z-10" />
                                            ) : null}

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
                                                        ? "max-w-0 opacity-0 translate-x-[-10px]"
                                                        : "max-w-[150px] opacity-100 translate-x-0",
                                                )}
                                            >
                                                {item.label}
                                            </span>

                                            {hasSubmenu && !isCollapsed && (
                                                <ChevronDownIcon
                                                    className={cn(
                                                        "w-4 h-4 mr-2 transition-transform duration-200 opacity-60",
                                                        isMenuExpanded ? "rotate-180" : "rotate-0",
                                                    )}
                                                />
                                            )}
                                        </button>

                                        {/* SUBMENU - MODO EXPANDIDO */}
                                        {hasSubmenu && !isCollapsed && (
                                            <div
                                                className={cn(
                                                    "overflow-hidden transition-all duration-300 ease-in-out",
                                                    isMenuExpanded ? "max-h-[500px] opacity-100 mt-1" : "max-h-0 opacity-0",
                                                )}
                                            >
                                                <div className="relative ml-[22px]">
                                                    <ul className="space-y-1">
                                                        {item.submenu!.map((subItem, index) => {
                                                            const isActive = isActivePath(subItem.href)
                                                            const isLast = index === item.submenu!.length - 1

                                                            return (
                                                                <li key={subItem.href} className="relative pl-6">
                                                                    <div className="absolute left-0 top-0 bottom-0 w-6 pointer-events-none">
                                                                        <div
                                                                            className={cn(
                                                                                "absolute left-0 top-0 w-[12px] h-[calc(50%)]",
                                                                                "border-l border-b border-white/10 border-dark-border",
                                                                                "rounded-bl-[8px]",
                                                                            )}
                                                                        />
                                                                        {!isLast && (
                                                                            <div
                                                                                className={cn(
                                                                                    "absolute left-0 top-[50%] bottom-[-4px] w-0",
                                                                                    "border-l border-dark-border",
                                                                                )}
                                                                            />
                                                                        )}
                                                                    </div>

                                                                    <Link
                                                                        href={subItem.href}
                                                                        prefetch={false}
                                                                        className={cn(
                                                                            "flex items-center px-3 py-2 rounded-lg text-sm transition-colors duration-200 relative z-10",
                                                                            isActive ? activeClasses : inactiveClasses
                                                                        )}
                                                                    >
                                                                        {subItem.label}
                                                                    </Link>
                                                                </li>
                                                            )
                                                        })}
                                                    </ul>
                                                </div>
                                            </div>
                                        )}

                                        {/* SUBMENU - MODO COLAPSADO (CARD ANIMADO COM FRAMER MOTION) */}
                                        <AnimatePresence>
                                            {isCollapsed && hoveredItem === item.label && (
                                                <motion.div
                                                    initial={{ opacity: 0, x: 10, scale: 0.95 }}
                                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                                    exit={{ opacity: 0, x: 5, scale: 0.95 }}
                                                    transition={{ duration: 0.15, ease: "easeOut" }}
                                                    className="absolute left-[calc(100%+16px)] top-0 z-50 bg-dark-surface border border-dark-border rounded-xl shadow-xl min-w-[200px] overflow-hidden"
                                                >
                                                    <div className="px-4 py-3 border-b border-dark-border bg-dark-surface/50">
                                                        <span className="text-sm font-bold text-white block">{item.label}</span>
                                                    </div>

                                                    <div className="py-1 bg-dark-background">
                                                        {hasSubmenu ? (
                                                            item.submenu!.map((subItem) => {
                                                                const isActive = isActivePath(subItem.href)
                                                                return (
                                                                    <Link
                                                                        key={subItem.href}
                                                                        href={subItem.href}
                                                                        prefetch={false}
                                                                        className="w-full text-left px-4 py-2.5 text-sm text-brand-inactive-text hover:text-white hover:bg-white/5 transition-colors flex items-center justify-between group/sub"
                                                                    >
                                                                        <span className={isActive ? "text-brand-green font-medium" : ""}>
                                                                            {subItem.label}
                                                                        </span>
                                                                    </Link>
                                                                )
                                                            })
                                                        ) : (
                                                            <div className="p-2">
                                                                <div className="text-xs text-brand-inactive-text px-2 pb-1">Navegar para {item.label}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </nav>
            </div>

            {/* MOBILE TRIGGER BUTTON */}
            <button
                ref={triggerRef}
                onClick={() => setIsMobileOpen(true)}
                className="xl:hidden fixed top-4 left-4 z-30 p-2 bg-dark-background rounded-xl border border-dark-border shadow-sm"
            >
                <Menu className="w-6 h-6 text-white" />
            </button>

            {/* MOBILE BOTTOM SHEET (VAUL) */}
            <Drawer.Root open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
                    <Drawer.Content className="bg-brand-dark dark:bg-dark-background border-t border-dark-border flex flex-col rounded-t-[20px] h-[85vh] fixed bottom-0 left-0 right-0 z-[60] outline-none">
                        <div className="mx-auto w-12 h-1.5 shrink-0 rounded-full bg-dark-border mt-3 mb-2" />

                        <div className="px-4 py-2 flex items-center justify-between shrink-0">
                            <Link
                                href="/ddt-admin"
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
                                {filteredNavItems.map((item) => {
                                    const Icon = item.icon
                                    const hasSubmenu = item.submenu && item.submenu.length > 0
                                    const isMenuExpanded = openSubmenu === item.label
                                    const isActive = item.href ? isActivePath(item.href) : (hasSubmenu && item.submenu?.some((sub) => isActivePath(sub.href)))

                                    return (
                                        <div key={item.label} className="flex flex-col">
                                            {item.href && !hasSubmenu ? (
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
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => hasSubmenu ? toggleSubmenu(item.label) : null}
                                                    className={cn(
                                                        "flex items-center gap-3 p-3 rounded-xl transition-colors relative",
                                                        isActive ? activeClasses : inactiveClasses
                                                    )}
                                                >
                                                    <Icon size={20} className={isActive ? "text-brand-green" : ""} />
                                                    <span className="text-[15px] font-medium flex-1 text-left">{item.label}</span>
                                                    {hasSubmenu && (
                                                        <ChevronDownIcon className={cn("w-4 h-4 opacity-50 transition-transform", isMenuExpanded ? "rotate-180" : "")} />
                                                    )}
                                                </button>
                                            )}

                                            {hasSubmenu && isMenuExpanded && (
                                                <div className="flex flex-col gap-1 pl-11 pr-3 pb-2">
                                                    {item.submenu!.map((sub) => (
                                                        <Link
                                                            key={sub.href}
                                                            href={sub.href}
                                                            prefetch={false}
                                                            className={cn(
                                                                "py-2 px-3 rounded-lg text-sm transition-colors",
                                                                isActivePath(sub.href) ? activeClasses : inactiveClasses
                                                            )}
                                                            onClick={() => setIsMobileOpen(false)}
                                                        >
                                                            {sub.label}
                                                        </Link>
                                                    ))}
                                                </div>
                                            )}
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
