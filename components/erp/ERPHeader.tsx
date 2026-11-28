"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { MenuIcon, MoonIcon, LogoutIcon, ChevronDownIcon, ChevronLeftIcon, UserIcon, CreditCardIcon, HelpCircleIcon, AlertTriangleIcon, ChevronsUpDown, ChevronRightIcon, CashierIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import Dropdown from "../reusable/Dropdown"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import { StoreSwitcher } from "../store-switcher"
import { UserProfileImage, getUserInitials, getAvatarColor } from "@/lib/utils/UserProfileImage"
import { useSidebar } from "@/lib/sidebar-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import BottomSheet from "../BottomSheet"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { SubscriptionStatusButton, type SubscriptionStatusButtonProps } from "./SubscriptionStatusButton"
import { Switch } from "../reusable/Switch"
import { GeneralFeedbackModal } from "@/components/feedback/GeneralFeedbackModal"
import { usePermissions } from "@/lib/permission-context"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { logLogoutAction } from "@/app/actions/auth/audit"

interface ERPHeaderProps {
    sidebarOpen?: boolean
    setSidebarOpen?: (arg: boolean) => void
    pageTitle?: string
    backHref?: string // Link to go back (e.g., /erp/produtos)
    onBack?: () => void // Custom back logic (e.g. discard changes)
    isSubPage?: boolean // Force ChevronLeftIcon even without backHref
    subscription?: SubscriptionStatusButtonProps | null
    userProfile?: {
        fullName: string
        email: string
        initials: string
        avatarColor: string
        imageUrl?: string | null
    }
}

export function ERPHeader({ sidebarOpen, setSidebarOpen, pageTitle = "", backHref, onBack, isSubPage, subscription, userProfile }: ERPHeaderProps) {
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const pathname = usePathname()
    const [isTransitioning, setIsTransitioning] = useState(false)
    const { profile, isLoading: isProfileLoading } = useUserProfile(userProfile ? { full_name: userProfile.fullName, address: null, avatar_url: null } : null)

    const [userName, setUserName] = useState(userProfile?.fullName || profile?.full_name || "Usuário")
    const [userEmail, setUserEmail] = useState(userProfile?.email || "")
    const [userInitials, setUserInitials] = useState(userProfile?.initials || getUserInitials(userProfile?.fullName || profile?.full_name || "U"))
    const [avatarColor, setAvatarColor] = useState(userProfile?.avatarColor || getAvatarColor(userProfile?.fullName || profile?.full_name || "Usuário"))
    const imageUrl = null
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
    const { partnerId, planSlug, role, businessInfo } = usePermissions()
    const isDesapego = normalizeBusinessInfo(businessInfo).mode === "desapego"
    const { setIsMobileOpen, headerOverride } = useSidebar()
    const searchParams = useSearchParams()

    // No active deletion status checked since deletion is immediate and logs user out

    // Update local state when profile data arrives
    useEffect(() => {
        if (profile?.full_name && !userProfile?.fullName) {
            setUserName(profile.full_name)
            setUserInitials(getUserInitials(profile.full_name))
            setAvatarColor(getAvatarColor(profile.full_name))
        }
    }, [profile, userProfile])
    // supabase singleton imported directly

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
                },
            )
        })

        transition.finished.finally(() => {
            setIsTransitioning(false)
        })
    }

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
        const clearLocation = () => {
            document.cookie = "dudit_city=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
            document.cookie = "dudit_coords=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
            try {
                localStorage.removeItem("dudit_city")
            } catch { }
        }
        clearLocation()
        try {
            await logLogoutAction()
        } catch {
            // Audit logging must never block logout.
        }
        await supabase.auth.signOut({ scope: 'local' })
        clearLocation()
        window.location.href = "/"
    }

    const segments = pathname.split("/").filter(Boolean)
    const isAutoInnerPage = segments.length > 2 && !segments.includes("cadastros") && !segments.includes("cadastros-financeiro")

    const currentParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : searchParams
    const hasEntityParam = currentParams.has("create") || currentParams.has("view") || currentParams.has("edit") || currentParams.has("duplicate")
    const isSettingsSubTab = currentParams.has("tab") && !["empresa", "vendas", "adicionais"].includes(currentParams.get("tab") || "")
    const isQueryOrTabInnerPage = hasEntityParam || isSettingsSubTab

    const isPDV = pathname === "/erp/pdv"
    const displayTitle = headerOverride?.title || pageTitle || "Painel"
    const displayBackHref = headerOverride?.backHref || backHref
    const displayOnBack = headerOverride?.onBack || onBack
    const displayIsSubPage = headerOverride?.isSubPage || isSubPage
    const showBackButton = isPDV || !!(displayBackHref || displayOnBack || displayIsSubPage || isAutoInnerPage || isQueryOrTabInnerPage)

    return (
        <header className="shrink-0 bg-brand-page-bg dark:bg-dark-background z-30 border-b border-brand-border dark:border-dark-border">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-14 relative">
                    <div className="flex items-center gap-3">
                        {showBackButton ? (
                            <button
                                className="text-brand-dark dark:text-dark-heading lg:hidden"
                                onClick={() => {
                                    if (isPDV) {
                                        router.push("/erp/inicio")
                                    } else if (displayOnBack) {
                                        displayOnBack()
                                    } else if (displayBackHref) {
                                        router.push(displayBackHref)
                                    } else {
                                        const nowParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : searchParams
                                        if (nowParams.has("create") || nowParams.has("view") || nowParams.has("edit") || nowParams.has("duplicate")) {
                                            window.dispatchEvent(new CustomEvent('erp-sidebar-reset'))
                                        } else {
                                            router.back()
                                        }
                                    }
                                }}
                            >
                                <ChevronLeftIcon className="w-6 h-6" />
                            </button>
                        ) : (
                            <button
                                className="text-brand-dark dark:text-dark-heading md:hidden"
                                aria-controls="sidebar"
                                aria-expanded={sidebarOpen}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setIsMobileOpen(true)
                                    if (setSidebarOpen) setSidebarOpen(!sidebarOpen)
                                }}
                            >
                                <MenuIcon className="w-6 h-6" />
                            </button>
                        )}

                        {/* --- ÁREA DO BREADCRUMB CORRIGIDA --- */}
                        <div className="hidden md:flex items-center gap-2">

                            {/* Botão Unificado (Ícone + Nome + Setas) */}
                            <div
                                className={cn(
                                    "group flex items-center gap-2 pl-1 pr-2 py-1 rounded-full transition-colors select-none",
                                    !isDesapego && "hover:bg-gray-100 dark:hover:bg-dark-border cursor-pointer"
                                )}
                            >
                                <div className="flex items-center gap-1.5 h-full">
                                    {/* 2. Nome do Local (Alinhado) */}
                                    {/* Envolto em div para garantir pointer-events-none se necessário para evitar hover duplo */}
                                    <div className="text-sm font-semibold text-brand-dark dark:text-dark-heading leading-none pb-[1px]">
                                        <StoreSwitcher />
                                    </div>

                                    {/* 3. Ícone Duas Setas (Selector) - apenas se não for desapego */}
                                    {!isDesapego && (
                                        <ChevronsUpDown className="w-4 h-4 text-brand-inactive-text/70 dark:text-dark-body/70" />
                                    )}
                                </div>
                            </div>

                            {/* Separador Chevron Right */}
                            <ChevronRightIcon className="w-4 h-4 text-brand-inactive-text/50 dark:text-dark-body/50" />

                            {/* Título da Página */}
                            <h1 className="text-sm font-normal text-brand-inactive-text dark:text-dark-body px-1">
                                {displayTitle}
                            </h1>

                            {isPDV && (
                                <>
                                    <div className="h-4 w-px bg-brand-border dark:bg-dark-border mx-1" />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => router.push("/erp/inicio")}
                                        className="h-8 py-1 px-4 text-xs font-semibold"
                                    >
                                        Voltar
                                    </Button>
                                </>
                            )}

                        </div>
                        {/* ------------------------------------ */}
                    </div>

                    {/* Mobile centered title */}
                    <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 md:hidden max-w-[calc(100%_-_8rem)]">
                        <h1 className="text-lg sm:text-xl font-bold text-brand-dark dark:text-dark-heading truncate text-center">
                            {displayTitle}
                        </h1>
                    </div>

                    <div className="flex items-center gap-3">
                        {subscription && <SubscriptionStatusButton {...subscription} />}
                        {isPDV && (
                            <button
                                onClick={() => router.push("/erp/caixa")}
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-border bg-white text-brand-dark hover:bg-brand-gray dark:border-dark-border dark:bg-dark-surface dark:text-dark-heading dark:hover:bg-dark-border transition-colors cursor-pointer shrink-0"
                                title="Controle de Caixa"
                            >
                                <CashierIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                            </button>
                        )}
                        {isPDV && (
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('open-pos-shortcuts'))}
                                className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-border bg-white text-brand-dark hover:bg-brand-gray dark:border-dark-border dark:bg-dark-surface dark:text-dark-heading dark:hover:bg-dark-border transition-colors cursor-pointer shrink-0"
                                title="Atalhos e Ajuda"
                            >
                                <HelpCircleIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                            </button>
                        )}
                        <div className="hidden md:flex items-center gap-3">
                            <NotificationBell variant="erp" />
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
                                        { label: "Minha Assinatura", href: "/erp/configuracoes?tab=assinatura", icon: <CreditCardIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                                        { label: "Central de Ajuda", href: "/ajuda", icon: <HelpCircleIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                                        { label: "Enviar Feedback", onClick: () => setIsFeedbackOpen(true), icon: <MessageSquare className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
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
                            <NotificationBell variant="erp" />
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
                            { label: "Minha Assinatura", href: "/erp/configuracoes?tab=assinatura", icon: <CreditCardIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                            { label: "Central de Ajuda", href: "/ajuda", icon: <HelpCircleIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
                            { label: "Enviar Feedback", onClick: () => { setIsProfileOpen(false); setIsFeedbackOpen(true); }, icon: <MessageSquare className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" /> },
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

            <GeneralFeedbackModal
                isOpen={isFeedbackOpen}
                onClose={() => setIsFeedbackOpen(false)}
                partnerId={partnerId}
                partnerPlan={planSlug}
                userRole={role}
            />

        </header>
    )
}