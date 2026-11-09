"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { useRouter, usePathname } from "next/navigation"
import { MenuIcon, MoonIcon, LogoutIcon, ChevronDownIcon, ChevronLeftIcon } from "@/lib/icons"
import Dropdown, { DropdownItem } from "../reusable/Dropdown"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { ShieldAlert } from "lucide-react"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { useSidebar } from "@/lib/sidebar-context"
import { logLogoutAction } from "@/app/actions/auth/audit"

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

interface AdminHeaderProps {
    sidebarOpen?: boolean
    setSidebarOpen?: (arg: boolean) => void
    pageTitle?: string
    backHref?: string
    onBack?: () => void
    userProfile?: {
        fullName: string
        email: string
        initials: string
        avatarColor: string
    }
}

export function AdminHeader({
    sidebarOpen,
    setSidebarOpen,
    pageTitle = "Administração",
    backHref,
    onBack,
    userProfile,
}: AdminHeaderProps) {
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const pathname = usePathname()
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [userName] = useState(userProfile?.fullName || "Admin")
    const [userEmail] = useState(userProfile?.email || "")
    const [userInitials] = useState(userProfile?.initials || "A")
    const [avatarColor] = useState(userProfile?.avatarColor || "bg-red-600")

    // Try to safely access sidebar context
    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch {
        // Outside SidebarProvider fallback
    }

    const effectiveTitle = sidebarContext?.headerOverride?.title || pageTitle
    const effectiveBackHref = sidebarContext?.headerOverride?.backHref || backHref
    const effectiveOnBack = sidebarContext?.headerOverride?.onBack || onBack
    const hasBack = Boolean(effectiveBackHref || effectiveOnBack)

    const handleBackClick = () => {
        if (effectiveOnBack) {
            effectiveOnBack()
        } else if (effectiveBackHref) {
            router.push(effectiveBackHref)
        } else {
            router.back()
        }
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

    return (
        <header className="sticky top-0 bg-brand-page-bg dark:bg-dark-background z-30 border-b border-brand-border dark:border-dark-border">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-14 relative">
                    <div className="flex items-center gap-3">
                        {/* Mobile back or hamburger button */}
                        {hasBack ? (
                            <button
                                onClick={handleBackClick}
                                className="p-1 -ml-1 text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading xl:hidden flex items-center justify-center"
                                aria-label="Voltar"
                            >
                                <ChevronLeftIcon className="w-6 h-6" />
                            </button>
                        ) : (
                            <button
                                className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading xl:hidden"
                                aria-controls="sidebar"
                                aria-expanded={sidebarOpen ?? sidebarContext?.isMobileOpen}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (setSidebarOpen) {
                                        setSidebarOpen(!sidebarOpen)
                                    } else if (sidebarContext) {
                                        sidebarContext.setIsMobileOpen(!sidebarContext.isMobileOpen)
                                    }
                                }}
                            >
                                <MenuIcon className="w-6 h-6" />
                            </button>
                        )}

                        {/* --- ÁREA DO BREADCRUMB --- */}
                        <div className="hidden xl:flex items-center gap-2">
                            <div className="group flex items-center gap-2 pl-1 pr-2 py-1 rounded-full bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 select-none">
                                <div className="flex items-center gap-1.5 h-full">
                                    <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400" />
                                    <div className="text-sm font-semibold text-red-700 dark:text-red-400 leading-none pb-[1px]">
                                        Administração
                                    </div>
                                </div>
                            </div>

                            {/* Separador Chevron Right */}
                            <ChevronRight className="w-4 h-4 text-brand-inactive-text/50 dark:text-dark-body/50" />

                            {/* Título da Página */}
                            <h1 className="text-sm font-normal text-brand-inactive-text dark:text-dark-body px-1">
                                {effectiveTitle}
                            </h1>
                        </div>
                    </div>

                    {/* Mobile centered title */}
                    <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 xl:hidden max-w-[200px] truncate text-center">
                        <h1 className="text-base sm:text-lg font-bold text-brand-dark dark:text-dark-heading truncate">
                            {effectiveTitle}
                        </h1>
                    </div>

                    <div className="flex items-center gap-3">
                        <NotificationBell variant="admin" />

                        <div className="h-6 w-px bg-brand-border dark:border-dark-border" />

                        <Dropdown
                            trigger={
                                <div className="flex items-center space-x-2 p-1 cursor-pointer hover:bg-brand-gray dark:hover:bg-dark-border rounded-full transition-colors">
                                    <div
                                        className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-sm`}
                                    >
                                        {userInitials}
                                    </div>
                                    <ChevronDownIcon
                                        className="w-4 h-4 mr-2 text-brand-inactive-text"
                                    />
                                </div>
                            }
                            align="right"
                            showChevron={false}
                            width="w-64"
                        >
                            <div className="px-3 py-3">
                                <div className="flex items-center space-x-3">
                                    <div
                                        className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-sm`}
                                    >
                                        {userInitials}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                {userName}
                                            </p>
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500 text-white whitespace-nowrap">
                                                ADMIN
                                            </span>
                                        </div>
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate mt-0.5">{userEmail}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="px-3 py-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <MoonIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                        <span className="text-sm text-brand-dark dark:text-dark-heading">Modo Escuro</span>
                                    </div>
                                    <button
                                        onClick={() => handleThemeButtonClick(theme === "dark" ? "light" : "dark")}
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${theme === "dark" ? "bg-brand-green" : "bg-gray-300 dark:bg-dark-border"
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${theme === "dark" ? "translate-x-5" : "translate-x-1"
                                                }`}
                                        />
                                    </button>
                                </div>
                            </div>

                            <div className="py-2 border-t border-brand-border dark:border-dark-border">
                                <DropdownItem
                                    onClick={async () => {
                                        document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
                                        localStorage.removeItem("dudit_city")
                                        try {
                                            await logLogoutAction()
                                        } catch {
                                            // Audit logging must never block logout.
                                        }
                                        await supabase.auth.signOut({ scope: 'local' })
                                        window.location.href = "/auth/login"
                                    }}
                                    className="text-brand-red dark:text-brand-red"
                                >
                                    <div className="w-4 h-4 bg-red-500 rounded flex items-center justify-center">
                                        <LogoutIcon className="w-3 h-3 text-white" />
                                    </div>
                                    Sair do Painel
                                </DropdownItem>
                            </div>
                        </Dropdown>
                    </div>
                </div>
            </div>
        </header>
    )
}
