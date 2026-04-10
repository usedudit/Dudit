"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
    ShoppingCartIcon,
    SettingsIcon,
    XIcon,
    ChevronRightIcon,
    ChevronDownIcon,
    HomeIcon,
    StoreIcon,
    Package,
    MegaphoneIcon,
    MoneyIcon,
    Users,
    DashboardIcon,
    ChartIcon,
    WrenchIcon
} from "@/lib/icons"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { motion, AnimatePresence } from "framer-motion"
import { usePermissions } from "@/lib/permission-context"
import { useSidebar } from "@/lib/sidebar-context"
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
        href: "/erp/home",
    },
    {
        icon: DashboardIcon,
        label: "Dashboard",
        href: "/erp/dashboard", // gráficos, métricas, relatórios rápidos
    },
    {
        icon: ShoppingCartIcon,
        label: "Vendas",
        submenu: [
            { label: "Pedidos e Vendas", href: "/erp/orders" },
            { label: "Orçamentos", href: "/erp/quotes" },
            { label: "PDV (Frente de Caixa)", href: "/" },
            { label: "Devoluções", href: "/" },
            { label: "Expedição e Entregas", href: "/" },
        ],
    },
    {
        icon: Package,
        label: "Produtos",
        submenu: [
            { label: "Catálogo de Produtos", href: "/erp/products" },
            { label: "Movimentação de Estoque", href: "/erp/stock-movements" },
            { label: "Notas de Entrada", href: "/" },
            { label: "Fornecedores", href: "/" },
            { label: "Cadastros de Produtos", href: "/erp/products/cadastros" },
        ],
    },
    {
        icon: WrenchIcon,
        label: "Serviços",
        submenu: [
            { label: "Agendamentos", href: "/" },
            { label: "Ordens de Serviço", href: "/" },
            { label: "Catálogo de Serviços", href: "/" },
            { label: "Categorias de Serviços", href: "/" },
        ],
    },
    {
        icon: Users,
        label: "Clientes",
        href: "/erp/customers",
    },
    {
        icon: MoneyIcon,
        label: "Financeiro",
        submenu: [
            { label: "Transações", href: "/erp/financial/transactions" },
            { label: "Fluxo de Caixa", href: "/" },
            { label: "DRE Gerencial", href: "/" },
            { label: "Cadastros financeiros", href: "/erp/financial/cadastros-financeiro" },
        ],
    },
    {
        icon: ChartIcon,
        label: "Relatórios",
        href: "/erp/reports",
    },
    {
        icon: MegaphoneIcon,
        label: "Marketing",
        submenu: [
            { label: "Cupons de Desconto", href: "/" },
            { label: "Campanhas e Promoções", href: "/" },
        ],
    },
    {
        icon: StoreIcon,
        label: "Minha Vitrine",
        submenu: [
            { label: "Personalizar Perfil", href: "/" },
            { label: "Avaliações e Reputação", href: "/" },
            { label: "QR Code e Compartilhar", href: "/" },
        ],
    },
    {
        icon: SettingsIcon,
        label: "Configurações",
        href: "/erp/settings",
    },
]

export function ERPSidebar() {
    const pathname = usePathname()
    const { isExpanded, toggleSidebar, isMobileOpen, setIsMobileOpen } = useSidebar()
    const isCollapsed = !isExpanded
    const { canAccessPath: canAccess, businessInfo: contextBusinessInfo } = usePermissions()

    const businessInfo = useMemo(() => {
        let info = contextBusinessInfo
        if (typeof info === "string") {
            try {
                info = JSON.parse(info)
            } catch (e) {
                console.error("Error parsing business_info in sidebar:", e)
                info = null
            }
        }
        return info || { sells: ["products"], channels: ["online"] }
    }, [contextBusinessInfo])

    const sellsProducts = businessInfo.sells?.includes("products") ?? true
    const sellsServices = businessInfo.sells?.includes("services") ?? false
    const sellsOnline = businessInfo.channels?.includes("online") ?? true
    const sellsPdv = businessInfo.channels?.includes("pdv") ?? false

    const [isMounted, setIsMounted] = useState(false)
    const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)

    // Controle de Hover com Delay
    const [hoveredItem, setHoveredItem] = useState<string | null>(null)
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const sidebarRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)

    const isActivePath = useCallback((href: string) => {
        if (!pathname) return false;
        if (pathname === href) return true;

        // Exception for the Submenu of Products: "Catálogo de Produtos" should not be marked active if currently in "Cadastros de Produtos"
        if (href === "/erp/products" && pathname.startsWith("/erp/products/cadastros")) {
            return false;
        }

        return pathname.startsWith(href + "/");
    }, [pathname])

    // Filter navItems by permissions
    const filteredNavItems = useMemo(() => {
        return navItems
            .map((item) => {
                // Business Rules Filtering
                if (item.label === "Produtos" && !sellsProducts && !sellsServices) return null; // Only show if they sell anything at all (but usually products. The label is Produtos for the catalogue.)
                if (item.label === "Produtos" && !sellsProducts && sellsServices) return null; // Don't show products if they only sell services
                if (item.label === "Serviços" && !sellsServices) return null;
                if (item.label === "Minha Vitrine" && !sellsOnline) return null;

                // Clone item to avoid mutating the original navItems
                const newItem = { ...item };

                // Submenu business rules filtering
                if (newItem.submenu) {
                    newItem.submenu = newItem.submenu.filter((sub) => {
                        if (sub.href === "/erp/pos" && !sellsPdv) return false;
                        return true;
                    });
                }

                // Direct link item (no submenu) — check access
                if (newItem.href && !newItem.submenu) {
                    return canAccess(newItem.href) ? newItem : null
                }

                // Submenu item — filter sub-items and hide if none remain
                if (newItem.submenu) {
                    const filteredSub = newItem.submenu.filter(sub => canAccess(sub.href))
                    if (filteredSub.length === 0) return null
                    return { ...newItem, submenu: filteredSub }
                }

                return newItem
            })
            .filter((item): item is NavItem => item !== null)
    }, [canAccess, sellsProducts, sellsServices, sellsOnline, sellsPdv])

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
            <div
                className={cn(
                    "fixed inset-0 bg-slate-900/50 z-40 md:hidden transition-opacity duration-200",
                    isMobileOpen ? "opacity-100" : "opacity-0 pointer-events-none",
                )}
                aria-hidden="true"
                onClick={() => setIsMobileOpen(false)}
            />

            {/* Manual sidebar trigger button removed - using ERPHeader icon */}

            <div
                ref={sidebarRef}
                className={cn(
                    "flex flex-col fixed z-40 left-0 top-0 h-screen border-r hidden md:flex",
                    "bg-dark-background border-dark-border",
                    "transition-[width] duration-300 ease-in-out",
                    "md:static md:translate-x-0",
                    isCollapsed ? "md:w-[68px]" : "md:w-64",
                    isMobileOpen ? "translate-x-0 w-64" : "-translate-x-full w-64",
                )}
            >
                <div className="h-[65px] flex items-center px-3 overflow-hidden shrink-0 relative transition-all duration-300">
                    <Link href="/" prefetch={true} className="flex items-center gap-3 w-full h-full relative">
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
                        "bg-dark-surface border border-dark-border rounded-full shadow-sm hover:bg-dark-border",
                        "transition-transform duration-300",
                    )}
                >
                    <ChevronRightIcon
                        className={cn("w-3 h-3 transition-transform duration-300 text-brand-inactive-text dark:text-dark-body", isCollapsed ? "rotate-0" : "rotate-180")}
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
                                                <Link href={item.href} className="absolute inset-0 z-10" onClick={() => setIsMobileOpen(false)} />
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
                                                        ? "max-w-0 md:opacity-0 translate-x-[-10px] md:block hidden"
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
                                                                                "border-l border-b border-dark-border",
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
                                                                        onClick={() => setIsMobileOpen(false)}
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
                                                    // Ajustado o left para calc(100% + 16px) para dar mais espaço
                                                    className="absolute left-[calc(100%+16px)] top-0 z-50 bg-dark-surface border border-dark-border rounded-xl shadow-xl min-w-[200px] overflow-hidden"
                                                >
                                                    {/* Header do Card com cor diferente para destaque */}
                                                    <div className="px-4 py-3 border-b border-dark-border bg-dark-surface/50">
                                                        <span className="text-sm font-bold text-white block">{item.label}</span>
                                                    </div>

                                                    {/* Corpo do Card */}
                                                    <div className="py-1 bg-dark-background">
                                                        {hasSubmenu ? (
                                                            item.submenu!.map((subItem) => {
                                                                const isActive = isActivePath(subItem.href)
                                                                return (
                                                                    <Link
                                                                        key={subItem.href}
                                                                        href={subItem.href}
                                                                        className="w-full text-left px-4 py-2.5 text-sm text-brand-inactive-text hover:text-white hover:bg-white/5 transition-colors flex items-center justify-between group/sub"
                                                                    >
                                                                        <span className={isActive ? "text-brand-green font-medium" : ""}>
                                                                            {subItem.label}
                                                                        </span>
                                                                    </Link>
                                                                )
                                                            })
                                                        ) : (
                                                            // Item sem submenu
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

            {/* MOBILE BOTTOM SHEET (VAUL) */}
            <Drawer.Root open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
                    <Drawer.Content className="bg-dark-background border-t border-dark-border flex flex-col rounded-t-[20px] h-[85vh] fixed bottom-0 left-0 right-0 z-[60] outline-none">
                        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-dark-border mt-3 mb-2" />
                        <div className="p-4 flex-1 overflow-y-auto no-scrollbar">
                            <nav className="flex flex-col gap-1">
                                {filteredNavItems.map((item) => {
                                    const Icon = item.icon
                                    const hasSubmenu = item.submenu && item.submenu.length > 0
                                    const isMenuExpanded = openSubmenu === item.label
                                    const isActive = item.href ? isActivePath(item.href) : (hasSubmenu && item.submenu?.some((sub) => isActivePath(sub.href)))

                                    return (
                                        <div key={item.label} className="flex flex-col">
                                            <button
                                                onClick={() => hasSubmenu ? toggleSubmenu(item.label) : null}
                                                className={cn(
                                                    "flex items-center gap-3 p-3 rounded-xl transition-colors relative",
                                                    isActive ? activeClasses : inactiveClasses
                                                )}
                                            >
                                                {item.href && !hasSubmenu && (
                                                    <Link href={item.href} className="absolute inset-0" onClick={() => setIsMobileOpen(false)} />
                                                )}
                                                <Icon size={20} className={isActive ? "text-brand-green" : ""} />
                                                <span className="text-[15px] font-medium flex-1 text-left">{item.label}</span>
                                                {hasSubmenu && (
                                                    <ChevronDownIcon className={cn("w-4 h-4 opacity-50 transition-transform", isMenuExpanded ? "rotate-180" : "")} />
                                                )}
                                            </button>

                                            {hasSubmenu && isMenuExpanded && (
                                                <div className="flex flex-col gap-1 pl-11 pr-3 pb-2">
                                                    {item.submenu!.map((sub) => (
                                                        <Link
                                                            key={sub.href}
                                                            href={sub.href}
                                                            onClick={() => setIsMobileOpen(false)}
                                                            className={cn(
                                                                "py-2 px-3 rounded-lg text-sm transition-colors",
                                                                isActivePath(sub.href) ? activeClasses : inactiveClasses
                                                            )}
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