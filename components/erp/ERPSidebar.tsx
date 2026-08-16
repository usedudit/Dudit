"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ShoppingCartIcon, SettingsIcon, XIcon, ChevronRightIcon, ChevronDownIcon, HomeIcon, StoreIcon, Package, MegaphoneIcon, MoneyIcon, Users, GridIcon, ChartIcon, WrenchIcon } from "@/lib/icons"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { motion, AnimatePresence } from "framer-motion"
import { usePermissions } from "@/lib/permission-context"
import { useSidebar } from "@/lib/sidebar-context"
import { Drawer } from "vaul"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { isSystemResourceActive } from "@/lib/system-resources"

interface SubMenuItem {
    label: string
    href: string
    /** When true, renders as a disabled "Em breve" item */
    comingSoon?: boolean
}

interface NavItem {
    icon: any
    label: string
    href?: string
    submenu?: SubMenuItem[]
    directAccess?: boolean
}

const navItems: NavItem[] = [
    {
        icon: HomeIcon,
        label: "Início",
        href: "/erp/inicio",
    },
    {
        icon: GridIcon,
        label: "Dashboard",
        href: "/erp/painel",
    },
    {
        icon: ShoppingCartIcon,
        label: "Vendas",
        href: "/erp/pedidos",
        submenu: [
            { label: "Pedidos e Vendas", href: "/erp/pedidos" },
            { label: "Orçamentos", href: "/erp/orcamentos" },
            { label: "PDV (Frente de Caixa)", href: "/erp/pdv" },
            { label: "Devoluções", href: "/erp/devolucoes" },
            { label: "Expedição e Entregas", href: "/erp/logistica" },
        ],
    },
    {
        icon: ChartIcon,
        label: "Desempenho",
        href: "/erp/produtividade",
        submenu: [
            { label: "Visão Geral", href: "/erp/produtividade" },
            { label: "Metas", href: "/erp/metas" },
            { label: "Comissões", href: "/erp/comissoes" },
            { label: "Estatísticas", href: "/erp/relatorios" },
        ],
    },
    {
        icon: Package,
        label: "Produtos",
        href: "/erp/produtos",
        submenu: [
            { label: "Catálogo de Produtos", href: "/erp/produtos" },
            { label: "Movimentação de Estoque", href: "/erp/movimentacao-estoque" },
            { label: "Importar XML (NF-e)", href: "/erp/importacao-xml" },
            { label: "Notas de Entrada", href: "/" },
            { label: "Fornecedores", href: "/erp/fornecedores" },
            { label: "Cadastros de Produtos", href: "/erp/produtos/cadastros" },
        ],
    },
    {
        icon: WrenchIcon,
        label: "Serviços",
        href: "/erp/servicos",
        submenu: [
            { label: "Catálogo de Serviços", href: "/erp/servicos" },
            { label: "Agendamentos", href: "/erp/agendamentos" },
            { label: "Ordens de Serviço", href: "/erp/ordens-de-servico" },
            { label: "Cadastros de Serviços", href: "/erp/servicos/cadastros" },
        ],
    },
    {
        icon: Users,
        label: "Clientes",
        href: "/erp/clientes",
    },
    {
        icon: MoneyIcon,
        label: "Financeiro",
        href: "/erp/transacoes",
        submenu: [
            { label: "Movimentações", href: "/erp/transacoes" },
            { label: "Contas a Pagar", href: "/erp/contas-a-pagar" },
            { label: "Contas a Receber", href: "/erp/contas-a-receber" },
            { label: "Caixa (PDV)", href: "/erp/caixa" },
            { label: "Cadastros financeiros", href: "/erp/transacoes/cadastros-financeiro" },
        ],
    },
    {
        icon: MegaphoneIcon,
        label: "Marketing",
        submenu: [
            { label: "Cupons de Desconto", href: "/erp/cupons" },
            { label: "Campanhas e Promoções", href: "/erp/promocoes" },
            { label: "Vídeos da Comunidade", href: "/erp/videos" },
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
        href: "/erp/configuracoes",
    },
]

const PLAN_GATED_MINIMUM: Record<string, "crescer" | "escalar"> = {
    "/erp/lojas": "escalar",
    "/erp/logistica": "crescer",
    "/erp/transacoes": "crescer",
    "/erp/contas-a-pagar": "crescer",
    "/erp/contas-a-receber": "crescer",
    "/erp/caixa": "crescer",
    "/erp/produtos/cadastros": "crescer",
    "/erp/servicos/cadastros": "crescer",
    "/erp/transacoes/cadastros-financeiro": "crescer",
    "/erp/relatorios": "crescer",
    "/erp/cupons": "crescer",
    "/erp/promocoes": "escalar",
    "/erp/produtividade": "escalar",
    "/erp/metas": "escalar",
    "/erp/comissoes": "crescer",
    "/erp/ordens-de-servico": "crescer",
    "/erp/devolucoes": "crescer",
    "/erp/fornecedores": "crescer",
    "/erp/importacao-xml": "crescer",
    "/erp/movimentacao-estoque": "crescer",
    "/erp/videos": "crescer",
}

function ErpPlanGatedNavItem({
    href,
    label,
    planSlug,
    itemClass,
    labelClass,
    onNavigate,
    icon: Icon,
    iconClassName,
    isActiveGroup,
}: {
    href: string
    label: string
    planSlug: string
    itemClass: string
    labelClass?: string
    onNavigate?: () => void
    icon?: React.ComponentType<{ className?: string }>
    iconClassName?: string
    isActiveGroup?: boolean
}) {
    const { openPlanUpgrade } = usePlanUpgrade()
    const minimumPlan = PLAN_GATED_MINIMUM[href]
    const required = minimumPlan && !hasMinimumPlan(planSlug, minimumPlan) ? minimumPlan : null
    const star = required ? planStarIconForTarget(required) : null

    const content = (
        <>
            {Icon ? (
                <div className="w-[44px] h-[44px] flex items-center justify-center shrink-0">
                    <Icon className={cn("w-[20px] h-[20px]", isActiveGroup ? "text-brand-green" : "text-current", iconClassName)} />
                </div>
            ) : null}
            <span className={cn("flex items-center gap-2 min-w-0 flex-1", Icon ? "" : "")}>
                <span className={cn("truncate", labelClass)}>{label}</span>
                {star ? <img src={star} alt="" className="w-4 h-4 shrink-0 object-contain" /> : null}
            </span>
        </>
    )

    if (required) {
        return (
            <button
                type="button"
                className={itemClass}
                onClick={() => {
                    openPlanUpgrade(required)
                    onNavigate?.()
                }}
            >
                {content}
            </button>
        )
    }

    return (
        <Link
            href={href}
            prefetch={false}
            onClick={(e) => {
                if (typeof window !== "undefined" && window.location.pathname === href) {
                    e.preventDefault()
                    window.dispatchEvent(new CustomEvent('erp-sidebar-reset'))
                }
                setTimeout(() => {
                    onNavigate?.()
                }, 0)
            }}
            className={itemClass}>
            {content}
        </Link>
    )
}

export function ERPSidebar() {
    const pathname = usePathname()
    if (pathname === "/erp/pdv") {
        return null
    }
    const { isExpanded, toggleSidebar, isMobileOpen, setIsMobileOpen, sidebarCard } = useSidebar()
    const isCollapsed = !isExpanded
    const { canAccessPath: canAccess, businessInfo: contextBusinessInfo, planSlug } = usePermissions()

    const businessInfo = useMemo(() => normalizeBusinessInfo(contextBusinessInfo), [contextBusinessInfo])

    const sellsProducts = isSystemResourceActive(businessInfo, "products")
    const sellsServices = isSystemResourceActive(businessInfo, "services")
    const isQuick = businessInfo.mode === "quick"
    const ordersResourceActive = isSystemResourceActive(businessInfo, "orders")
    const productsResourceActive = isSystemResourceActive(businessInfo, "products")
    const servicesResourceActive = isSystemResourceActive(businessInfo, "services")
    const quotesResourceActive = isSystemResourceActive(businessInfo, "quotes")
    const goalsResourceActive = isSystemResourceActive(businessInfo, "goals")
    const returnsResourceActive = isSystemResourceActive(businessInfo, "returns")
    const posResourceActive = isSystemResourceActive(businessInfo, "pos")
    const stockMovementsResourceActive = isSystemResourceActive(businessInfo, "stockMovements")
    const productCadastrosResourceActive = isSystemResourceActive(businessInfo, "productCadastros")
    const deliveriesResourceActive = isSystemResourceActive(businessInfo, "deliveries")
    const financialResourceActive = isSystemResourceActive(businessInfo, "financial")
    const appointmentsResourceActive = isSystemResourceActive(businessInfo, "appointments")
    const serviceOrdersResourceActive = isSystemResourceActive(businessInfo, "serviceOrders")
    const serviceCadastrosResourceActive = isSystemResourceActive(businessInfo, "serviceCadastros")
    const customersResourceActive = isSystemResourceActive(businessInfo, "customers")
    const reportsResourceActive = isSystemResourceActive(businessInfo, "reports")
    const marketingResourceActive = isSystemResourceActive(businessInfo, "marketing")
    const couponsResourceActive = isSystemResourceActive(businessInfo, "coupons")
    const campaignsResourceActive = isSystemResourceActive(businessInfo, "campaigns")
    const showcaseResourceActive = isSystemResourceActive(businessInfo, "showcase")
    const productivityResourceActive = isSystemResourceActive(businessInfo, "productivity")
    const communityVideosResourceActive = isSystemResourceActive(businessInfo, "communityVideos")
    const salesGroupActive = ordersResourceActive || quotesResourceActive || returnsResourceActive || posResourceActive || deliveriesResourceActive
    const servicesGroupActive = servicesResourceActive || appointmentsResourceActive || serviceOrdersResourceActive || serviceCadastrosResourceActive

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
        if (href === "/erp/produtos" && pathname.startsWith("/erp/produtos/cadastros")) {
            return false;
        }

        return pathname.startsWith(href + "/");
    }, [pathname])

    // Filter navItems by permissions
    const filteredNavItems = useMemo(() => {
        return navItems
            .map((item) => {
                // Business Rules Filtering
                if (item.href === "/erp/pedidos" && !salesGroupActive) return null;
                if (item.href === "/erp/produtos" && !productsResourceActive) return null;
                if (item.href === "/erp/servicos" && !servicesGroupActive) return null;
                if (item.label === "Financeiro" && !financialResourceActive) return null;
                if (item.href === "/erp/clientes" && !customersResourceActive) return null;
                if (item.label === "Marketing" && !marketingResourceActive) return null;
                if (item.label === "Minha Vitrine" && !showcaseResourceActive) return null;
                if (item.label === "Produtos" && !sellsProducts && !sellsServices) return null; // Only show if they sell anything at all (but usually products. The label is Produtos for the catalogue.)
                if (item.label === "Produtos" && !sellsProducts && sellsServices) return null; // Don't show products if they only sell services
                if (item.label === "Serviços" && !sellsServices) return null;
                if (item.label === "Desempenho" && !productivityResourceActive && !reportsResourceActive) return null;
                if (isQuick) {
                    // Quick mode navigation: simplified, no advanced modules
                    const allowed = new Set(["Início", "Vendas", "Produtos", "Serviços", "Configurações"])
                    if (!allowed.has(item.label)) return null
                    // Strip submenus in quick mode to avoid exposing deep routes
                    if (item.submenu) {
                        return {
                            ...item,
                            submenu: undefined,
                            href: item.href || (item.label === "Vendas" ? "/erp/pedidos" : item.href),
                            directAccess: true,
                        }
                    }
                }

                // Clone item to avoid mutating the original navItems
                const newItem = { ...item };
                if (newItem.submenu) {
                    newItem.submenu = newItem.submenu.filter((sub) => {
                        if (item.href === "/erp/pedidos") {
                            if (sub.href === "/erp/pedidos") return ordersResourceActive
                            if (sub.href === "/erp/devolucoes") return returnsResourceActive
                            if (sub.href === "/erp/orcamentos") return quotesResourceActive
                            if (sub.href === "/erp/pdv") return posResourceActive
                            if (sub.href.startsWith("/erp/logistica")) return deliveriesResourceActive
                        }
                        if (item.href === "/erp/produtos") {
                            if (sub.href === "/erp/produtos") return productsResourceActive
                            if (sub.href === "/erp/movimentacao-estoque") return stockMovementsResourceActive
                            if (sub.href === "/erp/produtos/cadastros") return productCadastrosResourceActive
                            if (sub.href === "/erp/fornecedores") return productsResourceActive
                            if (sub.href === "/erp/importacao-xml") return productsResourceActive
                            return productsResourceActive
                        }
                        if (item.label === "Financeiro") {
                            if (sub.href === "/erp/transacoes") return financialResourceActive
                            if (sub.href === "/erp/contas-a-pagar") return financialResourceActive
                            if (sub.href === "/erp/contas-a-receber") return financialResourceActive
                            if (sub.href === "/erp/caixa") return financialResourceActive
                            if (sub.href === "/erp/transacoes/cadastros-financeiro") return financialResourceActive
                            return financialResourceActive
                        }
                        if (item.href === "/erp/servicos") {
                            if (sub.href === "/erp/agendamentos") return appointmentsResourceActive
                            if (sub.href === "/erp/ordens-de-servico") return serviceOrdersResourceActive
                            if (sub.href === "/erp/servicos/cadastros") return serviceCadastrosResourceActive
                            return servicesResourceActive
                        }
                        if (item.label === "Marketing") {
                            if (sub.href === "/erp/cupons") return couponsResourceActive
                            if (sub.href === "/erp/promocoes") return campaignsResourceActive
                            if (sub.href === "/erp/videos") return communityVideosResourceActive
                            return marketingResourceActive
                        }
                        if (item.label === "Desempenho") {
                            if (sub.href === "/erp/relatorios") return reportsResourceActive
                            return productivityResourceActive
                        }
                        return true
                    })
                }

                // Direct link item (no submenu) - check access
                if (newItem.href && !newItem.submenu) {
                    if (newItem.href === "/erp/inicio") return newItem
                    if (canAccess(newItem.href)) return newItem
                    return null
                }

                // Submenu item - filter sub-items and hide if none remain
                if (newItem.submenu) {
                    const filteredSub = newItem.submenu.filter((sub) => sub.comingSoon || canAccess(sub.href))
                    const directMinimumPlan = newItem.href ? PLAN_GATED_MINIMUM[newItem.href] : undefined
                    if (filteredSub.length === 0) return null
                    return {
                        ...newItem,
                        submenu: filteredSub,
                        directAccess: newItem.href
                            ? canAccess(newItem.href) && (!directMinimumPlan || hasMinimumPlan(planSlug, directMinimumPlan))
                            : false,
                    }
                }

                return newItem
            })
            .filter((item): item is NavItem => item !== null)
    }, [canAccess, planSlug, sellsProducts, sellsServices, isQuick, salesGroupActive, productsResourceActive, servicesGroupActive, financialResourceActive, ordersResourceActive, quotesResourceActive, goalsResourceActive, returnsResourceActive, posResourceActive, stockMovementsResourceActive, productCadastrosResourceActive, deliveriesResourceActive, servicesResourceActive, appointmentsResourceActive, serviceCadastrosResourceActive, customersResourceActive, reportsResourceActive, marketingResourceActive, couponsResourceActive, campaignsResourceActive, showcaseResourceActive, communityVideosResourceActive, productivityResourceActive])

    useEffect(() => {
        setIsMounted(true)
    }, [])

    // Auto-expand active submenu based on current path
    const lastAutoExpandedRef = useRef<string | null>(null)

    useEffect(() => {
        if (isCollapsed) return

        const activeCategory = filteredNavItems.find((item) =>
            item.submenu?.some((sub) => isActivePath(sub.href))
        )

        // Only auto-expand if the active category has changed to a NEW one
        // and we haven't already expanded it for this specific session/navigation
        if (activeCategory && activeCategory.label !== lastAutoExpandedRef.current) {
            setOpenSubmenu(activeCategory.label)
            lastAutoExpandedRef.current = activeCategory.label
        }
    }, [pathname, isCollapsed, isActivePath, filteredNavItems])

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
                    "flex flex-col fixed z-[120] left-0 top-0 h-screen border-r hidden md:flex",
                    "bg-brand-dark border-dark-border",
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
                        "grow py-2 px-3",
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
                            const canOpenDirectPage = item.directAccess !== false
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
                                        {item.href && canOpenDirectPage ? (
                                            (() => {
                                                const directMinimumPlan = PLAN_GATED_MINIMUM[item.href]
                                                const needsPlanGate = directMinimumPlan && !hasMinimumPlan(planSlug, directMinimumPlan)

                                                if (needsPlanGate) {
                                                    return (
                                                        <ErpPlanGatedNavItem
                                                            href={item.href}
                                                            label={item.label}
                                                            planSlug={planSlug}
                                                            icon={Icon}
                                                            isActiveGroup={isActiveGroup}
                                                            itemClass={cn(
                                                                "flex items-center rounded-lg transition-colors duration-200 group relative min-h-[44px] w-full justify-start",
                                                                isActiveGroup ? activeClasses : inactiveClasses
                                                            )}
                                                            onNavigate={() => {
                                                                setIsMobileOpen(false)
                                                                setHoveredItem(null)
                                                                if (hasSubmenu && !isCollapsed) {
                                                                    toggleSubmenu(item.label)
                                                                }
                                                            }}
                                                        />
                                                    )
                                                }

                                                return (
                                                    <Link
                                                        href={item.href}
                                                        prefetch={false}
                                                        onClick={(e) => {
                                                            if (typeof window !== "undefined" && window.location.pathname === item.href) {
                                                                e.preventDefault();
                                                                window.dispatchEvent(new CustomEvent('erp-sidebar-reset'));
                                                            }
                                                            setTimeout(() => {
                                                                setIsMobileOpen(false)
                                                                setHoveredItem(null)
                                                                if (hasSubmenu && !isCollapsed) {
                                                                    toggleSubmenu(item.label)
                                                                }
                                                            }, 0)
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
                                                )
                                            })()
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (isCollapsed && hasSubmenu) {
                                                        setHoveredItem((prev) => (prev === item.label ? null : item.label))
                                                    } else if (!isCollapsed && hasSubmenu) {
                                                        toggleSubmenu(item.label)
                                                    }
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

                                                {hasSubmenu && !isCollapsed && (
                                                    <ChevronDownIcon
                                                        className={cn(
                                                            "w-4 h-4 mr-2 transition-transform duration-200 opacity-60",
                                                            isMenuExpanded ? "rotate-180" : "rotate-0",
                                                        )}
                                                    />
                                                )}
                                            </button>
                                        )}

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

                                                                    {subItem.comingSoon ? (
                                                                        <span
                                                                            className={cn(
                                                                                "flex items-center px-3 py-2 rounded-lg text-sm transition-colors duration-200 relative z-10",
                                                                                "text-brand-inactive-text/50 cursor-default"
                                                                            )}
                                                                        >
                                                                            <span className="flex items-center gap-2">
                                                                                <span>{subItem.label}</span>
                                                                                <span className="text-[10px] font-bold uppercase tracking-wider bg-dark-border/50 text-brand-inactive-text/70 px-1.5 py-0.5 rounded-md">Em breve</span>
                                                                            </span>
                                                                        </span>
                                                                    ) : (
                                                                        <ErpPlanGatedNavItem
                                                                            href={subItem.href}
                                                                            label={subItem.label}
                                                                            planSlug={planSlug}
                                                                            itemClass={cn(
                                                                                "flex items-center px-3 py-2 rounded-lg text-sm transition-colors duration-200 relative z-10",
                                                                                isActive ? activeClasses : inactiveClasses
                                                                            )}
                                                                            onNavigate={() => setIsMobileOpen(false)}
                                                                        />
                                                                    )}
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
                                                                if (subItem.comingSoon) {
                                                                    return (
                                                                        <span
                                                                            key={subItem.label}
                                                                            className="w-full text-left px-4 py-2.5 text-sm text-brand-inactive-text/40 flex items-center justify-between cursor-default"
                                                                        >
                                                                            <span className="flex items-center gap-2">
                                                                                <span>{subItem.label}</span>
                                                                                <span className="text-[9px] font-bold uppercase tracking-wider bg-dark-border/50 text-brand-inactive-text/60 px-1.5 py-0.5 rounded-md">Em breve</span>
                                                                            </span>
                                                                        </span>
                                                                    )
                                                                }
                                                                return (
                                                                    <ErpPlanGatedNavItem
                                                                        key={subItem.href}
                                                                        href={subItem.href}
                                                                        label={subItem.label}
                                                                        planSlug={planSlug}
                                                                        itemClass="w-full text-left px-4 py-2.5 text-sm text-brand-inactive-text hover:text-white hover:bg-white/5 transition-colors flex items-center justify-between group/sub"
                                                                        labelClass={isActive ? "text-brand-green font-medium" : undefined}
                                                                        onNavigate={() => {
                                                                            setIsMobileOpen(false)
                                                                            setHoveredItem(null)
                                                                        }}
                                                                    />
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
                    <Drawer.Content className="bg-brand-dark border-t border-dark-border flex flex-col rounded-t-[20px] h-[85vh] fixed bottom-0 left-0 right-0 z-60 outline-none">
                        <div className="mx-auto w-12 h-1.5 shrink-0 rounded-full bg-dark-border mt-3 mb-2" />
                        <div className="p-4 flex-1 overflow-y-auto no-scrollbar">
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
                                                    onClick={() => {
                                                        setIsMobileOpen(false)
                                                        if (hasSubmenu) toggleSubmenu(item.label)
                                                    }}
                                                >
                                                    <Icon size={20} className={isActive ? "text-brand-green" : ""} />
                                                    <span className="text-[15px] font-medium flex-1 text-left">{item.label}</span>
                                                    {hasSubmenu && (
                                                        <ChevronDownIcon className={cn("w-4 h-4 opacity-50 transition-transform", isMenuExpanded ? "rotate-180" : "")} />
                                                    )}
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
                                                        sub.comingSoon ? (
                                                            <span
                                                                key={sub.label}
                                                                className="py-2 px-3 rounded-lg text-sm text-brand-inactive-text/40 cursor-default flex items-center gap-2"
                                                            >
                                                                <span>{sub.label}</span>
                                                                <span className="text-[9px] font-bold uppercase tracking-wider bg-dark-border/50 text-brand-inactive-text/60 px-1.5 py-0.5 rounded-md">Em breve</span>
                                                            </span>
                                                        ) : (
                                                            <ErpPlanGatedNavItem
                                                                key={sub.href}
                                                                href={sub.href}
                                                                label={sub.label}
                                                                planSlug={planSlug}
                                                                itemClass={cn(
                                                                    "py-2 px-3 rounded-lg text-sm transition-colors",
                                                                    isActivePath(sub.href) ? activeClasses : inactiveClasses
                                                                )}
                                                                onNavigate={() => setIsMobileOpen(false)}
                                                            />
                                                        )
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
