"use client"

import { Fragment, useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { MoonIcon, SunIcon, LogoutIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import Dropdown, { DropdownItem } from "@/components/reusable/Dropdown"
import { useTheme } from "next-themes"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"

interface AdminPageHeaderProps {
    pageTitle: string
    userProfile?: {
        fullName: string
        email: string
        initials: string
        avatarColor: string
    }
}

export function AdminPageHeader({ pageTitle, userProfile }: AdminPageHeaderProps) {
    const [isScrolled, setIsScrolled] = useState(false)
    const { theme, setTheme, resolvedTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        const handler = () => setIsScrolled(window.scrollY > 10)
        window.addEventListener("scroll", handler)
        return () => window.removeEventListener("scroll", handler)
    }, [])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        window.location.href = "/login"
    }

    if (!mounted) {
        return (
            <header className="h-16 border-b border-brand-border dark:border-dark-border bg-white/80 dark:bg-dark-surface/80 backdrop-blur-sm sticky top-0 z-30">
                <div className="max-w-[1400px] mx-auto px-4 h-full flex items-center justify-between">
                    <h1 className="text-xl font-bold text-brand-dark dark:text-white">{pageTitle}</h1>
                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center text-brand-inactive-text">
                        {userProfile?.initials || "?"}
                    </div>
                </div>
            </header>
        )
    }

    const currentTheme = resolvedTheme || theme

    return (
        <header className={cn(
            "h-16 border-b border-brand-border dark:border-dark-border bg-white/80 dark:bg-dark-surface/80 backdrop-blur-sm sticky top-0 z-30 transition-all duration-200",
            isScrolled ? "shadow-sm" : ""
        )}>
            <div className="max-w-[1400px] mx-auto px-4 h-full flex items-center justify-between">
                {/* Left side - Title */}
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold text-brand-dark dark:text-white truncate max-w-[400px]">
                        {pageTitle}
                    </h1>
                </div>

                {/* Right side - User menu & Theme */}
                <div className="flex items-center gap-3">
                    {/* Theme toggle */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
                        aria-label="Toggle theme"
                    >
                        {currentTheme === "dark" ? (
                            <SunIcon className="w-5 h-5 text-amber-500" />
                        ) : (
                            <MoonIcon className="w-5 h-5 text-brand-dark dark:text-white" />
                        )}
                    </Button>

                    {/* User avatar dropdown */}
                    {userProfile ? (
                        <Dropdown
                            trigger={
                                <button className="flex items-center gap-2 p-1.5 rounded-full hover:bg-brand-gray/50 dark:hover:bg-dark-border/50 transition-colors">
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white",
                                        userProfile.avatarColor
                                    )}>
                                        {userProfile.initials}
                                    </div>
                                </button>
                            }
                        >
                            <DropdownItem disabled className="px-3 py-2 text-sm font-medium text-brand-dark dark:text-white">
                                {userProfile.fullName}
                            </DropdownItem>
                            <DropdownItem disabled className="px-3 py-1 text-xs text-brand-inactive-text">
                                {userProfile.email}
                            </DropdownItem>
                            <DropdownItem disabled className="px-3 py-1 border-t border-brand-border dark:border-dark-border my-1">
                                <div className="h-0" />
                            </DropdownItem>
                            <DropdownItem onClick={handleSignOut} className="text-red-600 flex items-center gap-2">
                                <LogoutIcon className="w-4 h-4" />
                                Sair
                            </DropdownItem>
                        </Dropdown>
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center text-brand-inactive-text text-sm font-medium">
                            ?
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}