"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
    TruckIcon,
    HelpCircleIcon,
    ChevronLeftIcon,
    ChevronDownIcon,
    MoonIcon,
    SunIcon,
    UserIcon,
    LogoutIcon,
} from "@/lib/icons"
import { Dropdown, DropdownItem } from "@/components/reusable"
import BottomSheet from "@/components/BottomSheet"
import { getUserInitials, getAvatarColor } from "@/lib/utils/UserProfileImage"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"

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

export function DeliveryPortalHeader({ userProfile }: { userProfile?: UserProfileData }) {
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const pathname = usePathname()
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [isProfileOpen, setIsProfileOpen] = useState(false)

    const userName = userProfile?.fullName || "Entregador"
    const userEmail = userProfile?.email || ""
    const userInitials = userProfile?.initials || getUserInitials(userName)
    const avatarColor = userProfile?.avatarColor || getAvatarColor(userName)

    const getPageTitle = () => {
        if (pathname.startsWith("/entregadores/entregas/")) return "Detalhes da Entrega"
        return "Minhas Entregas"
    }

    const isSubPage = pathname.startsWith("/entregadores/entregas/")
    const displayTitle = getPageTitle()

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
        window.location.href = "/auth/login"
    }

    return (
        <header className="sticky top-0 bg-brand-page-bg dark:bg-dark-background z-30 border-b border-brand-border dark:border-dark-border">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-14 relative">
                    {/* LEFT / LOGO & BREADCRUMB */}
                    <div className="flex items-center gap-3">
                        {isSubPage ? (
                            <button
                                className="text-brand-dark dark:text-dark-heading p-1.5 -ml-1.5 rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border transition-colors cursor-pointer"
                                onClick={() => router.push("/entregadores")}
                                aria-label="Voltar para entregas"
                            >
                                <ChevronLeftIcon className="w-6 h-6" />
                            </button>
                        ) : null}

                        {/* DESKTOP BREADCRUMB */}
                        <div className="flex items-center gap-2">
                            <Link
                                href="/entregadores"
                                className="group flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border transition-colors cursor-pointer select-none"
                            >
                                <img
                                    src="https://img.dudit.com.br/static/Logo.png"
                                    alt="Dudit"
                                    className="h-6 w-auto mr-1"
                                />
                                <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green text-xs font-bold">
                                    <TruckIcon size={12} />
                                    <span>Portal do Entregador</span>
                                </div>
                            </Link>

                            <ChevronRight className="w-4 h-4 text-brand-inactive-text/50 dark:text-dark-body/50" />

                            <h1 className="text-sm font-medium text-brand-inactive-text dark:text-dark-body px-1">
                                {displayTitle}
                            </h1>
                        </div>
                    </div>

                    {/* RIGHT ACTIONS */}
                    <div className="flex items-center gap-3">
                        {/* THEME TOGGLE BUTTON */}
                        <button
                            type="button"
                            onClick={() => handleThemeButtonClick(theme === "dark" ? "light" : "dark")}
                            aria-label="Alternar tema claro/escuro"
                            className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full border border-brand-border bg-white text-brand-dark hover:bg-brand-gray dark:border-dark-border dark:bg-dark-surface dark:text-dark-heading dark:hover:bg-dark-border transition-colors cursor-pointer shrink-0"
                            title="Alternar tema"
                        >
                            {theme === "dark" ? (
                                <SunIcon className="w-4 h-4 text-amber-400" />
                            ) : (
                                <MoonIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                            )}
                        </button>

                        <div className="hidden sm:block h-6 w-px bg-brand-border dark:border-dark-border" />

                        {/* MOBILE PROFILE AVATAR TRIGGER */}
                        <div className="md:hidden flex items-center cursor-pointer" onClick={() => setIsProfileOpen(true)}>
                            <div
                                className={`w-8 h-8 rounded-full ${avatarColor || getAvatarColor(userName)} flex items-center justify-center text-white font-bold text-sm border border-brand-border dark:border-dark-border shadow-xs relative`}
                            >
                                {userInitials || getUserInitials(userName)}
                            </div>
                        </div>

                        {/* DESKTOP PROFILE DROPDOWN (IDENTICAL TO ERPHEADER) */}
                        <Dropdown
                            trigger={
                                <div className="hidden md:flex items-center space-x-2 p-1 cursor-pointer hover:bg-brand-gray dark:hover:bg-dark-border rounded-full transition-colors group">
                                    <div
                                        className={`w-8 h-8 rounded-full ${avatarColor || getAvatarColor(userName)} flex items-center justify-center text-white font-bold text-sm border border-brand-border dark:border-dark-border group-hover:shadow-xs transition-all relative`}
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
                            <div className="px-4 py-3 border-b border-brand-border dark:border-dark-border">
                                <div className="flex items-center space-x-3 mb-4">
                                    <div
                                        className={`w-10 h-10 rounded-full ${avatarColor || getAvatarColor(userName)} flex items-center justify-center text-white font-bold text-sm border border-brand-border dark:border-dark-border shadow-xs`}
                                    >
                                        {userInitials || getUserInitials(userName)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                {userName}
                                            </p>
                                        </div>
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate mt-0.5">
                                            {userEmail}
                                        </p>
                                    </div>
                                </div>

                                <div className="py-1 border-y border-brand-border dark:border-dark-border">
                                    <DropdownItem
                                        className="flex items-center gap-3 w-full"
                                        onClick={() => handleThemeButtonClick(theme === "dark" ? "light" : "dark")}
                                    >
                                        <MoonIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                        <span className="text-sm font-normal text-brand-inactive-text">Modo escuro</span>
                                    </DropdownItem>
                                </div>

                                <div className="py-2">
                                    <DropdownItem>
                                        <Link href="/perfil" prefetch={false} className="flex items-center gap-3 w-full">
                                            <UserIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                            <span className="text-sm font-normal text-brand-inactive-text">Meu perfil</span>
                                        </Link>
                                    </DropdownItem>
                                    <DropdownItem>
                                        <Link href="/ajuda" prefetch={false} className="flex items-center gap-3 w-full">
                                            <HelpCircleIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                            <span className="text-sm font-normal text-brand-inactive-text">Central de ajuda</span>
                                        </Link>
                                    </DropdownItem>
                                </div>

                                <div className="py-1 border-t border-brand-border dark:border-dark-border mt-1">
                                    <DropdownItem className="flex items-center gap-3 w-full hover:bg-brand-red/10" onClick={handleSignOut}>
                                        <LogoutIcon className="w-4 h-4 text-brand-red" />
                                        <span className="text-sm font-normal text-brand-red">Sair da sessão</span>
                                    </DropdownItem>
                                </div>
                            </div>
                        </Dropdown>
                    </div>
                </div>
            </div>

            {/* MOBILE BOTTOMSHEET (IDENTICAL TO ERPHEADER) */}
            <BottomSheet isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)}>
                <div className="flex flex-col py-1">
                    <div className="flex items-center space-x-4 mb-6 px-2 mt-4">
                        <div
                            className={`w-14 h-14 rounded-full ${avatarColor || getAvatarColor(userName)} flex items-center justify-center text-white font-bold text-xl border border-brand-border dark:border-dark-border shadow-md`}
                        >
                            {userInitials || getUserInitials(userName)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate">
                                    {userName}
                                </p>
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-green-500 text-white whitespace-nowrap">
                                    Entregador
                                </span>
                            </div>
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body truncate">{userEmail}</p>
                        </div>
                    </div>

                    <nav className="flex flex-col gap-1">
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-dark-border/30 border border-transparent hover:border-brand-border/30 dark:hover:border-dark-border/50 transition-all">
                            <div className="flex items-center gap-3">
                                <MoonIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                <span className="text-[16px] font-medium text-brand-dark dark:text-dark-heading">Modo escuro</span>
                            </div>
                            <button
                                onClick={() => handleThemeButtonClick(theme === "dark" ? "light" : "dark")}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${theme === "dark" ? "bg-brand-green" : "bg-gray-300 dark:bg-dark-border"
                                    }`}
                            >
                                <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${theme === "dark" ? "translate-x-5" : "translate-x-1"
                                        }`}
                                />
                            </button>
                        </div>

                        <Link
                            href="/perfil"
                            onClick={() => setIsProfileOpen(false)}
                            prefetch={false}
                            className="flex items-center gap-4 p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-dark-border/30 transition-all w-full text-left"
                        >
                            <UserIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            <span className="text-[16px] font-medium text-brand-dark dark:text-dark-heading">Meu perfil</span>
                        </Link>

                        <Link
                            href="/ajuda"
                            onClick={() => setIsProfileOpen(false)}
                            prefetch={false}
                            className="flex items-center gap-4 p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-dark-border/30 transition-all w-full text-left"
                        >
                            <HelpCircleIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            <span className="text-[16px] font-medium text-brand-dark dark:text-dark-heading">Central de ajuda</span>
                        </Link>

                        <div className="h-px bg-brand-border dark:bg-dark-border my-2 mx-2 opacity-50" />

                        <button
                            onClick={handleSignOut}
                            className="flex items-center gap-4 p-4 rounded-2xl bg-red-50/50 dark:bg-red-900/10 text-brand-red w-full text-left transition-all hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                            <div className="w-5 h-5 bg-red-500 rounded flex items-center justify-center shadow-xs">
                                <LogoutIcon className="w-3.5 h-3.5 text-white" />
                            </div>
                            <span className="text-[16px] font-bold">Sair da sessão</span>
                        </button>
                    </nav>
                </div>
            </BottomSheet>
        </header>
    )
}

// Backward compatibility alias
export const DeliveryPortalTopbar = DeliveryPortalHeader
