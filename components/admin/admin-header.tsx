"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import {
    MenuIcon,
    MoonIcon,
    LogoutIcon,
    ChevronDownIcon,
    ChevronLeftIcon,
    UserIcon,
    HelpCircleIcon,
    ChevronRightIcon,
    StoreIcon,
} from "@/lib/icons"
import Dropdown from "@/components/reusable/Dropdown"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { useSidebar } from "@/lib/sidebar-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import BottomSheet from "@/components/BottomSheet"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { Switch } from "@/components/reusable/Switch"
import { logLogoutAction } from "@/app/actions/auth/audit"
import { getCurrentAdminRoleAction } from "@/app/actions/admin/admin-user"

const ROLE_LABELS: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Administrador",
    moderator: "Moderador",
}

function formatAdminRole(role?: string | null): string {
    if (!role) return "Administrador"
    return ROLE_LABELS[role.toLowerCase()] || role
}

interface AdminHeaderProps {
    sidebarOpen?: boolean
    setSidebarOpen?: (arg: boolean) => void
    pageTitle?: string
    backHref?: string
    onBack?: () => void
    isSubPage?: boolean
    adminRole?: string
    userProfile?: {
        fullName: string
        email: string
        initials: string
        avatarColor: string
        imageUrl?: string | null
    }
}

export function AdminHeader({
    sidebarOpen,
    setSidebarOpen,
    pageTitle = "Administração",
    backHref,
    onBack,
    isSubPage,
    adminRole,
    userProfile,
}: AdminHeaderProps) {
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isTransitioning, setIsTransitioning] = useState(false)

    const { profile } = useUserProfile(
        userProfile
            ? {
                full_name: userProfile.fullName,
                address: null,
                avatar_url: userProfile.imageUrl || null,
            }
            : null
    )

    const [userName, setUserName] = useState(userProfile?.fullName || profile?.full_name || "Admin")
    const [userEmail, setUserEmail] = useState(userProfile?.email || "")
    const [imageUrl, setImageUrl] = useState<string | null>(userProfile?.imageUrl || null)
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [currentRole, setCurrentRole] = useState<string>(adminRole || "Administrador")

    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch {
        // Outside SidebarProvider fallback
    }

    useEffect(() => {
        if (profile?.full_name && !userProfile?.fullName) {
            setUserName(profile.full_name)
            if ((profile as any).avatar_url) {
                setImageUrl((profile as any).avatar_url)
            }
        }
    }, [profile, userProfile])

    useEffect(() => {
        if (adminRole) {
            setCurrentRole(adminRole)
        } else {
            getCurrentAdminRoleAction()
                .then((res) => {
                    if (res?.role) {
                        setCurrentRole(res.role)
                    }
                    if (res?.email && !userEmail) {
                        setUserEmail(res.email)
                    }
                })
                .catch(() => { })
        }
    }, [adminRole, userEmail])

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

    const segments = pathname ? pathname.split("/").filter(Boolean) : []
    const isAutoInnerPage = segments.length > 2

    const currentParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : searchParams
    const hasEntityParam = currentParams?.has("create") || currentParams?.has("view") || currentParams?.has("edit")
    const isQueryOrTabInnerPage = Boolean(hasEntityParam)

    const displayTitle = sidebarContext?.headerOverride?.title || pageTitle || "Administração"
    const displayBackHref = sidebarContext?.headerOverride?.backHref || backHref
    const displayOnBack = sidebarContext?.headerOverride?.onBack || onBack
    const displayIsSubPage = sidebarContext?.headerOverride?.isSubPage || isSubPage
    const showBackButton = !!(displayBackHref || displayOnBack || displayIsSubPage || isAutoInnerPage || isQueryOrTabInnerPage)

    return (
        <header className="shrink-0 bg-brand-page-bg dark:bg-dark-background z-30 border-b border-brand-border dark:border-dark-border">
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
                                aria-expanded={sidebarOpen ?? sidebarContext?.isMobileOpen}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (sidebarContext) {
                                        sidebarContext.setIsMobileOpen(true)
                                    }
                                    if (setSidebarOpen) setSidebarOpen(!sidebarOpen)
                                }}
                            >
                                <MenuIcon className="w-6 h-6" />
                            </button>
                        )}

                        {/* --- ÁREA DO BREADCRUMB CORRIGIDA --- */}
                        <div className="hidden md:flex items-center gap-2">
                            {/* Botão Unificado (Ícone Dudit + Painel admin + Cargo) */}
                            <Link
                                href="/ddt-admin"
                                prefetch={false}
                                className="group flex items-center gap-2 pl-1 pr-2 py-1 rounded-full transition-colors select-none hover:bg-gray-100 dark:hover:bg-dark-border cursor-pointer"
                            >
                                <div className="flex items-center gap-1.5 h-full">
                                    <div className="flex items-center space-x-2">
                                        <img
                                            src="https://img.dudit.com.br/static/Icon.png"
                                            alt="Painel admin"
                                            className="w-8 h-8 rounded-full object-contain shrink-0"
                                        />
                                        <div className="hidden sm:flex flex-col text-left">
                                            <span className="text-md font-semibold text-brand-dark dark:text-dark-heading line-clamp-1 leading-tight">
                                                Painel admin
                                            </span>
                                            <span className="text-xs text-brand-green leading-tight">
                                                {formatAdminRole(currentRole)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Link>

                            {/* Separador Chevron Right */}
                            <ChevronRightIcon className="w-4 h-4 text-brand-inactive-text/50 dark:text-dark-body/50" />

                            {/* Título da Página */}
                            <h1 className="text-sm font-normal text-brand-inactive-text dark:text-dark-body px-1">
                                {displayTitle}
                            </h1>
                        </div>
                    </div>

                    {/* Mobile centered title */}
                    <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 md:hidden max-w-[calc(100%_-_8rem)]">
                        <h1 className="text-lg sm:text-xl font-bold text-brand-dark dark:text-dark-heading truncate text-center">
                            {displayTitle}
                        </h1>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="hidden md:flex items-center gap-3">
                            <NotificationBell variant="admin" />
                            <div className="h-6 w-px bg-brand-border dark:border-dark-border" />
                        </div>

                        <div className="md:hidden flex items-center cursor-pointer" onClick={() => setIsProfileOpen(true)}>
                            <UserProfileImage
                                fullName={userName}
                                imageUrl={imageUrl}
                                className="w-8 h-8 border border-brand-border dark:border-dark-border shadow-sm"
                            />
                        </div>

                        <Dropdown
                            trigger={
                                <div className="hidden md:flex items-center space-x-2 p-1 cursor-pointer hover:bg-brand-gray dark:hover:bg-dark-border rounded-full transition-colors group">
                                    <UserProfileImage
                                        fullName={userName}
                                        imageUrl={imageUrl}
                                        className="w-8 h-8 border border-brand-border dark:border-dark-border"
                                    />
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
                                    <UserProfileImage
                                        fullName={userName}
                                        imageUrl={imageUrl}
                                        className="w-10 h-10 border border-brand-border dark:border-dark-border"
                                    />
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
                                            <MoonIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                            <span className="text-[14px] font-normal text-brand-inactive-text dark:text-dark-body">Modo escuro</span>
                                        </span>
                                        <Switch checked={theme === "dark"} onCheckedChange={() => handleThemeButtonClick(theme === "dark" ? "light" : "dark")} />
                                    </div>
                                </div>

                                <div className="pt-2">
                                    {([
                                        { label: "Meu Perfil", href: "/perfil", icon: <UserIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                                        { label: "Acessar ERP", href: "/erp/inicio", icon: <StoreIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                                        { label: "Central de Ajuda", href: "/ajuda", icon: <HelpCircleIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                                        { label: "Sair da sessão", className: "brand-red", onClick: handleSignOut, icon: <LogoutIcon className="w-4 h-4 text-brand-red dark:text-brand-red" /> },
                                    ] as any[]).map((item, idx) => {
                                        const ItemWrapper: any = item.href ? Link : "div"
                                        const wrapProps = item.href
                                            ? { href: item.href, prefetch: false }
                                            : { onClick: item.onClick }

                                        return (
                                            <ItemWrapper
                                                key={idx}
                                                {...wrapProps}
                                                className="px-1 py-2.5 hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors block w-full text-left"
                                                onClick={() => {
                                                    if (wrapProps.onClick) wrapProps.onClick()
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
                        <UserProfileImage
                            fullName={userName}
                            imageUrl={imageUrl}
                            className="w-10 h-10 border border-brand-border dark:border-dark-border"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                                    {userName}
                                </p>
                            </div>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate mt-0.5">{userEmail}</p>
                        </div>
                        <div className="shrink-0" onClick={() => setIsProfileOpen(false)}>
                            <NotificationBell variant="admin" />
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
                            { label: "Acessar ERP", href: "/erp/inicio", icon: <StoreIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                            { label: "Central de Ajuda", href: "/ajuda", icon: <HelpCircleIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                            { label: "Sair da sessão", className: "brand-red", onClick: handleSignOut, icon: <LogoutIcon className="w-4 h-4 text-brand-red dark:text-brand-red" /> },
                        ] as any[]).map((item, idx) => {
                            const ItemWrapper: any = item.href ? Link : "div"
                            const wrapProps = item.href
                                ? { href: item.href, prefetch: false }
                                : { onClick: item.onClick }

                            return (
                                <ItemWrapper
                                    key={idx}
                                    {...wrapProps}
                                    className="px-1 py-2.5 hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors block w-full text-left"
                                    onClick={() => {
                                        setIsProfileOpen(false)
                                        if (wrapProps.onClick) wrapProps.onClick()
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
