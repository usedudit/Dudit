"use client"

import React, { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MenuIcon, XIcon, SearchIcon, MoonIcon, SunIcon, ChevronRightIcon, ChevronLeftIcon } from "@/lib/icons"
import { Button, Input } from "@/components/reusable"
import { helpCategories } from "@/lib/help-data"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

export default function HelpHeader({
    onToggleMenu,
    menuOpen,
    searchQuery,
    setSearchQuery
}: {
    onToggleMenu: () => void,
    menuOpen: boolean,
    searchQuery: string,
    setSearchQuery: (val: string) => void
}) {
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
    const [isSearchFocused, setIsSearchFocused] = useState(false)
    const [mounted, setMounted] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const { theme, setTheme } = useTheme()

    useEffect(() => {
        setMounted(true)
    }, [])

    // Filter results for the dropdown
    const filteredResults = searchQuery.trim() ? helpCategories.flatMap(cat =>
        cat.articles.filter(art =>
            art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            art.description.toLowerCase().includes(searchQuery.toLowerCase())
        ).map(art => ({ ...art, categoryTitle: cat.title }))
    ).slice(0, 5) : []

    const showDropdown = isSearchFocused && searchQuery.length > 0 && filteredResults.length > 0

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsSearchFocused(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleResultClick = (category: string, slug: string) => {
        setSearchQuery("")
        setIsSearchFocused(false)
        setIsMobileSearchOpen(false)
        router.push(`/ajuda/${category}/${slug}`)
    }

    return (
        <>
            {/* Desktop Search Overlay - Same as Marketplace */}
            <div
                className={cn(
                    "fixed inset-0 bg-black/60 z-[45] transition-opacity duration-300 ease-in-out pointer-events-none hidden lg:block",
                    isSearchFocused ? "opacity-100" : "opacity-0"
                )}
            />

            <header className="h-[72px] bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border flex items-center px-4 lg:px-8 fixed top-0 left-0 right-0 z-50 w-full">

                <div className="flex items-center gap-4 w-full max-w-[1440px] mx-auto relative h-full">

                    {/* Left Section: Menu Toggle & Logo */}
                    <div className="flex items-center gap-4 shrink-0 z-10">
                        <button
                            onClick={onToggleMenu}
                            className="lg:hidden p-2 text-gray-500 dark:text-dark-body hover:bg-gray-50 dark:hover:bg-dark-border rounded-lg transition-colors"
                        >
                            {menuOpen ? <XIcon /> : <MenuIcon />}
                        </button>

                        <Link href="/" className="flex items-center gap-2 shrink-0">
                            <img
                                src="https://img.dudit.com.br/static/Logo.png"
                                alt="Dudit"
                                className="h-7 w-auto dark:brightness-0 dark:invert"
                            />
                        </Link>
                    </div>

                    {/* Middle Section: Search (Desktop) or Context Title/Search (Mobile) */}
                    <div className="flex-1 flex items-center justify-center relative h-full">

                        {/* Desktop Search Center */}
                        <div className="hidden lg:flex items-center w-full max-w-md relative z-[51]" ref={searchRef}>
                            <Input
                                variant="full-rounded"
                                placeholder="Perguntar ou buscar..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => setIsSearchFocused(true)}
                                prefix={<SearchIcon size={18} className="text-gray-400 dark:text-dark-body" />}
                                className="w-full"
                            />

                            {/* Desktop Search Dropdown */}
                            <AnimatePresence>
                                {showDropdown && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute top-[calc(100%+8px)] left-0 w-full bg-white dark:bg-dark-surface rounded-2xl shadow-xl border border-gray-100 dark:border-dark-border overflow-hidden z-[60]"
                                    >
                                        <div className="p-2">
                                            <p className="px-4 py-2 text-[10px] font-bold text-gray-400 dark:text-dark-body uppercase tracking-widest">Resultados Sugeridos</p>
                                            {filteredResults.map((result) => (
                                                <button
                                                    key={result.id}
                                                    onClick={() => handleResultClick(result.category, result.slug)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-border rounded-xl transition-colors text-left group"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-brand-green/10 dark:bg-brand-green/20 flex items-center justify-center text-brand-green shrink-0">
                                                        <SearchIcon size={16} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-gray-900 dark:text-dark-heading truncate">{result.title}</p>
                                                        <p className="text-xs text-gray-500 dark:text-dark-body truncate">{result.categoryTitle}</p>
                                                    </div>
                                                    <ChevronRightIcon size={14} className="text-gray-300 dark:text-dark-border group-hover:text-brand-green transition-colors" />
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Mobile Header Logic (Vendor Profile Style) */}
                        <div className="lg:hidden flex-1 flex items-center justify-center h-[38px] relative mx-2">
                            {/* Title - Fades out when search is open */}
                            <div className={cn(
                                "absolute inset-0 flex items-center justify-center transition-all duration-300",
                                isMobileSearchOpen ? "opacity-0 -translate-x-6 pointer-events-none" : "opacity-100 translate-x-0"
                            )}>
                                <h1 className="text-gray-900 dark:text-dark-heading font-bold text-[15px] truncate px-2 whitespace-nowrap">
                                    Central de Ajuda
                                </h1>
                            </div>

                            {/* Expandable Search Bar - Slides in from the right */}
                            <div className={cn(
                                "absolute inset-y-0 right-0 z-20 bg-gray-50 dark:bg-dark-border rounded-full flex items-center px-4 border border-gray-200 dark:border-dark-border transition-all duration-300 ease-out",
                                isMobileSearchOpen ? "-left-0 opacity-100" : "left-full opacity-0 pointer-events-none"
                            )}>
                                <SearchIcon size={18} className="text-brand-green mr-2 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Buscar ajuda..."
                                    className="bg-transparent border-none outline-none text-brand-dark dark:text-dark-heading text-[14px] w-full placeholder-gray-400 font-normal py-0"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    autoFocus={isMobileSearchOpen}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Right Actions: Mobile Search Toggle & Theme Toggle */}
                    <div className="flex items-center gap-2 shrink-0 z-10">
                        {/* Mobile Search Toggle */}
                        <button
                            onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
                            className="lg:hidden w-10 h-10 flex items-center justify-center text-gray-500 dark:text-dark-body"
                        >
                            {isMobileSearchOpen ? <XIcon size={22} className="text-gray-400" /> : <SearchIcon size={22} />}
                        </button>

                        {/* Theme Toggle - Desktop & Mobile */}
                        <Button
                            variant="outline"
                            className="rounded-full w-10 h-10 p-0 border-gray-200 dark:border-dark-border text-gray-500 dark:text-dark-body hover:bg-gray-50 dark:hover:bg-dark-border"
                            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        >
                            {mounted && (theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />)}
                        </Button>
                    </div>
                </div>
            </header>
        </>
    )
}
