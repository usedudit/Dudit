"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { MenuIcon, MoonIcon, LogoutIcon, ChevronDownIcon, ChevronLeftIcon, UserIcon, HelpCircleIcon, TruckIcon } from "@/lib/icons"
import Dropdown from "@/components/reusable/Dropdown"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import { getUserInitials, getAvatarColor } from "@/lib/utils/UserProfileImage"
import { useSidebar } from "@/lib/sidebar-context"
import BottomSheet from "@/components/BottomSheet"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { Switch } from "../reusable/Switch"
import { setMyDeliveryAvailabilityAction } from "@/app/actions/delivery-drivers"
import { toast } from "@/hooks/use-notification"
import { logLogoutAction } from "@/app/actions/auth/audit"
import DriverLocationBeacon, { DRIVER_AVAILABILITY_EVENT } from "./DriverLocationBeacon"

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

interface UserProfileData {
    fullName: string
    email: string
    initials: string
    avatarColor: string
}

interface DeliveryPortalHeaderProps {
    pageTitle?: string
    backHref?: string // Link to go back (e.g., /entregadores)
    onBack?: () => void // Custom back logic (e.g. discard changes)
    isSubPage?: boolean // Force ChevronLeftIcon even without backHref
    userProfile?: UserProfileData
    initialOnline?: boolean
}

export function DeliveryPortalHeader({
    pageTitle = "",
    backHref,
    onBack,
    isSubPage,
    userProfile,
    initialOnline = false,
}: DeliveryPortalHeaderProps) {
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const pathname = usePathname()
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [isOnline, setIsOnline] = useState(initialOnline)
    const [isTogglingAvailability, setIsTogglingAvailability] = useState(false)

    const userName = userProfile?.fullName || "Entregador"
    const userEmail = userProfile?.email || ""
    const userInitials = userProfile?.initials || getUserInitials(userName)
    const avatarColor = userProfile?.avatarColor || getAvatarColor(userName)
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const { setIsMobileOpen, headerOverride } = useSidebar()
    const searchParams = useSearchParams()

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{ status: string }>).detail
            if (detail?.status) {
                setIsOnline(detail.status === "available" || detail.status === "occupied")
            }
        }
        window.addEventListener(DRIVER_AVAILABILITY_EVENT, handler)
        return () => window.removeEventListener(DRIVER_AVAILABILITY_EVENT, handler)
    }, [])

    const handleThemeButtonClick = (newTheme: string) => {
        if (isTransitioning) return

        // @ts-ignore
        if (!document.startViewTransition) {
            setTheme(newTheme)
            return
        }

        const x = window.innerWidth - 24
        const y = 24
        const endRadius = Math.hypot(x, window.innerHeight - y)

        setIsTransitioning(true)

        // @ts-ignore
        const transition = document.startViewTransition(() => {
            setTheme(newTheme)
        })

        transition.ready.then(() => {
            const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
            document.documentElement.animate(
                { clipPath: clipPath },
                {
                    duration: 500,
                    easing: "ease-in-out",
                    pseudoElement: "::view-transition-new(root)",
                },
            )
        })

        transition.finished.finally(() => {
            setIsTransitioning(false)
        })
    }

    const handleSignOut = async () => {
        document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
        localStorage.removeItem("dudit_city")
        try {
            await logLogoutAction()
        } catch {
            // Audit logging must never block logout.
        }
        await supabase.auth.signOut({ scope: "local" })
        window.location.href = "/auth/login"
    }

    const handleToggleAvailability = async () => {
        if (isTogglingAvailability) return
        setIsTogglingAvailability(true)
        const nextStatus = isOnline ? "offline" : "available"
        try {
            const res = await setMyDeliveryAvailabilityAction(nextStatus)
            if (res.success) {
                setIsOnline(!isOnline)
                window.dispatchEvent(new CustomEvent(DRIVER_AVAILABILITY_EVENT, { detail: { status: nextStatus } }))
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

    const isAutoInnerPage = pathname.startsWith("/entregadores/entregas/")

    const hasEntityParam = searchParams.has("create") || searchParams.has("view") || searchParams.has("edit") || searchParams.has("duplicate")

    const displayTitle = headerOverride?.title || pageTitle || "Minhas Entregas"
    const displayBackHref = headerOverride?.backHref || backHref
    const displayOnBack = headerOverride?.onBack || onBack
    const displayIsSubPage = headerOverride?.isSubPage || isSubPage || isAutoInnerPage || hasEntityParam
    const showBackButton = !!(displayBackHref || displayOnBack || displayIsSubPage)

    return (
        <header className="sticky top-0 bg-brand-page-bg dark:bg-dark-background z-30 border-b border-brand-border dark:border-dark-border">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-14 relative">
                    <div className="flex items-center gap-3">
                        {showBackButton ? (
                            <button
                                className="text-brand-dark dark:text-dark-heading md:hidden"
                                onClick={() => {
                                    if (displayOnBack) {
                                        displayOnBack()
                                    } else if (displayBackHref) {
                                        router.push(displayBackHref)
                                    } else {
                                        router.back()
                                    }
                                }}
                            >
                                <ChevronLeftIcon className="w-6 h-6" />
                            </button>
                        ) : (
                            <button
                                className="text-brand-dark dark:text-dark-heading md:hidden"
                                aria-controls="sidebar"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setIsMobileOpen(true)
                                }}
                            >
                                <MenuIcon className="w-6 h-6" />
                            </button>
                        )}

                        {/* --- ÁREA DO BREADCRUMB (IGUAL AO ERP) --- */}
                        <div className="hidden md:flex items-center gap-2">
                            <h1 className="text-sm font-normal text-brand-inactive-text dark:text-dark-body px-1">
                                Portal do Entregador
                            </h1>

                            {/* Separador Chevron Right */}
                            <ChevronRight className="w-4 h-4 text-brand-inactive-text/50 dark:text-dark-body/50" />

                            {/* Título da Página */}
                            <h1 className="text-sm font-normal text-brand-inactive-text dark:text-dark-body px-1">
                                {displayTitle}
                            </h1>
                        </div>
                        {/* ------------------------------------ */}
                    </div>

                    {/* Mobile centered title */}
                    <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 md:hidden">
                        <h1 className="text-lg sm:text-xl font-bold text-brand-dark dark:text-dark-heading whitespace-nowrap">
                            {displayTitle}
                        </h1>
                    </div>

                    <div className="flex items-center gap-3">
                        <DriverLocationBeacon isOnline={isOnline} />
                        <div className="hidden md:flex items-center gap-3">
                            <NotificationBell variant="erp" />
                            <div className="h-6 w-px bg-brand-border dark:border-dark-border" />
                        </div>

                        <div className="md:hidden flex items-center" onClick={() => setIsProfileOpen(true)}>
                            <div
                                className={`w-8 h-8 rounded-full ${avatarColor || getAvatarColor(userName)} flex items-center justify-center text-white font-bold text-sm cursor-pointer border border-brand-border dark:border-dark-border shadow-sm relative`}
                            >
                                {userInitials || getUserInitials(userName)}
                            </div>
                        </div>

                        <Dropdown
                            trigger={
                                <div className="hidden md:flex items-center space-x-2 p-1 cursor-pointer hover:bg-brand-gray dark:hover:bg-dark-border rounded-full transition-colors group">
                                    <div
                                        className={`w-8 h-8 rounded-full ${avatarColor || getAvatarColor(userName)} flex items-center justify-center text-white font-bold text-sm border border-brand-border dark:border-dark-border transition-all relative`}
                                    >
                                        {userInitials || getUserInitials(userName)}
                                    </div>
                                    <ChevronDownIcon
                                        className="w-4 h-4 mr-2 text-brand-inactive-text group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors"
                                    />
                                </div>
                            }
                            align="right"
                            showChevron={false}
                            width="w-64"
                        >
                            <div className="pt-3 px-3 py-3">
                                <div className="flex items-center space-x-3 pb-4 border-b border-brand-border dark:border-dark-border">
                                    <div
                                        className={`w-10 h-10 rounded-full ${avatarColor || getAvatarColor(userName)} flex items-center justify-center text-white font-bold text-sm border border-brand-border dark:border-dark-border`}
                                    >
                                        {userInitials || getUserInitials(userName)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                {userName}
                                            </p>
                                        </div>
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate mt-0.5">{userEmail}</p>
                                    </div>
                                </div>

                                <div className="border-b border-brand-border dark:border-dark-border">
                                    <div className="px-1 py-2.5 flex items-center justify-between">
                                        <span className="flex items-center gap-3">
                                            <TruckIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                            <span className="text-[14px] font-normal text-brand-inactive-text dark:text-dark-body">Disponível</span>
                                        </span>
                                        <Switch checked={isOnline} onCheckedChange={handleToggleAvailability} disabled={isTogglingAvailability} />
                                    </div>
                                </div>

                                <div className="border-b border-brand-border dark:border-dark-border">
                                    <div className="px-1 py-2.5 flex items-center justify-between">
                                        <span className="flex items-center gap-3">
                                            <MoonIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                            <span className="text-[14px] font-normal text-brand-inactive-text dark:text-dark-body">Modo escuro</span>
                                        </span>
                                        <Switch checked={theme === "dark"} onCheckedChange={() => handleThemeButtonClick(theme === "dark" ? "light" : "dark")} />
                                    </div>
                                </div>

                                <div className="pt-2">
                                    {([
                                        { label: "Meu Perfil", href: "/perfil", icon: <UserIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                                        { label: "Central de Ajuda", href: "/ajuda", icon: <HelpCircleIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                                        { label: "Sair da sessão", className: "brand-red", onClick: handleSignOut, icon: <LogoutIcon className="w-4 h-4 text-brand-red dark:text-brand-red" /> }
                                    ] as any[]).map((item, idx) => {
                                        const ItemWrapper: any = item.href ? Link : "div";
                                        const wrapProps = item.href
                                            ? { href: item.href, prefetch: false }
                                            : { onClick: item.onClick };

                                        return (
                                            <ItemWrapper
                                                key={idx}
                                                {...wrapProps}
                                                className="px-1 py-2.5 hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors block w-full text-left"
                                                onClick={() => {
                                                    if (wrapProps.onClick) wrapProps.onClick();
                                                }}
                                            >
                                                <span className="flex items-center gap-3">
                                                    {item.icon}
                                                    <span className={`text-[14px] font-normal ${item.className ? `text-${item.className}` : "text-brand-inactive-text dark:text-dark-body"}`}>{item.label}</span>
                                                </span>
                                            </ItemWrapper>
                                        )
                                    })}
                                </div>
                            </div>
                        </Dropdown>
                    </div>
                </div>
            </div>

            <BottomSheet isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)}>
                <div className="pt-3 px-3 py-3">
                    <div className="flex items-center space-x-3 pb-4 border-b border-brand-border dark:border-dark-border">
                        <div
                            className={`w-10 h-10 rounded-full ${avatarColor || getAvatarColor(userName)} flex items-center justify-center text-white font-bold text-sm border border-brand-border dark:border-dark-border`}
                        >
                            {userInitials || getUserInitials(userName)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                                    {userName}
                                </p>
                            </div>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate mt-0.5">{userEmail}</p>
                        </div>
                        <div className="shrink-0" onClick={() => setIsProfileOpen(false)}>
                            <NotificationBell variant="erp" />
                        </div>
                    </div>

                    <div className="border-b border-brand-border dark:border-dark-border">
                        <div className="px-1 py-2.5 flex items-center justify-between">
                            <span className="flex items-center gap-3">
                                <TruckIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                <span className="text-[14px] font-normal text-brand-inactive-text dark:text-dark-body">Disponível</span>
                            </span>
                            <Switch checked={isOnline} onCheckedChange={handleToggleAvailability} disabled={isTogglingAvailability} />
                        </div>
                    </div>

                    <div className="border-b border-brand-border dark:border-dark-border">
                        <div className="px-1 py-2.5 flex items-center justify-between">
                            <span className="flex items-center gap-3">
                                <MoonIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                <span className="text-[14px] font-normal text-brand-inactive-text dark:text-dark-body">Modo escuro</span>
                            </span>
                            <Switch checked={theme === "dark"} onCheckedChange={() => handleThemeButtonClick(theme === "dark" ? "light" : "dark")} />
                        </div>
                    </div>

                    <div className="pt-2">
                        {([
                            { label: "Meu Perfil", href: "/perfil", icon: <UserIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                            { label: "Central de Ajuda", href: "/ajuda", icon: <HelpCircleIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                            { label: "Sair da sessão", className: "brand-red", onClick: handleSignOut, icon: <LogoutIcon className="w-4 h-4 text-brand-red dark:text-brand-red" /> }
                        ] as any[]).map((item, idx) => {
                            const ItemWrapper: any = item.href ? Link : "div";
                            const wrapProps = item.href
                                ? { href: item.href, prefetch: false }
                                : { onClick: item.onClick };

                            return (
                                <ItemWrapper
                                    key={idx}
                                    {...wrapProps}
                                    className="px-1 py-2.5 hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors block w-full text-left"
                                    onClick={() => {
                                        if (wrapProps.onClick) wrapProps.onClick();
                                    }}
                                >
                                    <span className="flex items-center gap-3">
                                        {item.icon}
                                        <span className={`text-[14px] font-normal ${item.className ? `text-${item.className}` : "text-brand-inactive-text dark:text-dark-body"}`}>{item.label}</span>
                                    </span>
                                </ItemWrapper>
                            )
                        })}
                    </div>
                </div>
            </BottomSheet>

        </header>
    )
}

// Backward compatibility alias
export const DeliveryPortalTopbar = DeliveryPortalHeader