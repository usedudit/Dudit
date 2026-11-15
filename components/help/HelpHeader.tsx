"use client"

import React, { useState, useRef, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MenuIcon, XIcon, SearchIcon, MoonIcon, SunIcon, ChevronRightIcon, ChevronLeftIcon } from "@/lib/icons"
import { Button, Input, IconPlaceholder } from "@/components/reusable"
import { helpCategories } from "@/lib/help-data"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { useModalLayer } from "@/lib/modal-stack"

const normalizeText = (text: string) =>
    text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

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
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [isSearchFocused, setIsSearchFocused] = useState(false)
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const zIndex = useModalLayer(isMobileSearchOpen)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!isMobileSearchOpen) return
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            document.body.style.overflow = originalOverflow
        }
    }, [isMobileSearchOpen])

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

    // Filter results for the dropdown & mobile search
    const filteredResults = useMemo(() => {
        const trimmed = searchQuery.trim()
        if (!trimmed) return []
        const normQuery = normalizeText(trimmed)

        const matches: { id: string; title: string; category: string; slug: string; categoryTitle: string }[] = []

        for (const cat of helpCategories) {
            const catTitleMatch = normalizeText(cat.title).includes(normQuery)
            for (const art of cat.articles) {
                const titleMatch = normalizeText(art.title).includes(normQuery)
                const descMatch = art.description ? normalizeText(art.description).includes(normQuery) : false
                if (titleMatch || descMatch || catTitleMatch) {
                    matches.push({
                        ...art,
                        categoryTitle: cat.title,
                    })
                }
            }
        }

        matches.sort((a, b) => {
            const aStarts = normalizeText(a.title).startsWith(normQuery)
            const bStarts = normalizeText(b.title).startsWith(normQuery)
            if (aStarts && !bStarts) return -1
            if (!aStarts && bStarts) return 1
            return 0
        })

        return matches
    }, [searchQuery])

    const desktopResults = useMemo(() => filteredResults.slice(0, 5), [filteredResults])
    const mobileResults = useMemo(() => filteredResults.slice(0, 20), [filteredResults])

    const showDropdown = isSearchFocused && searchQuery.length > 0 && desktopResults.length > 0

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

    const handleCloseMobileSearch = () => {
        setIsMobileSearchOpen(false)
        setIsSearchFocused(false)
        setSearchQuery("")
    }

    const handleSearch = (query: string) => {
        const trimmed = query.trim()
        if (!trimmed) return
        if (filteredResults.length > 0) {
            handleResultClick(filteredResults[0].category, filteredResults[0].slug)
        } else {
            handleCloseMobileSearch()
        }
    }

    return (
        <>
            {/* Desktop Search Overlay - Same as Marketplace */}
            <div
                className={cn(
                    "fixed inset-0 bg-black/60 z-[45] transition-opacity duration-300 ease-in-out hidden lg:block",
                    isSearchFocused ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
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

                        <Link href="/" prefetch={false} className="hidden lg:flex items-center gap-2 shrink-0">
                            <img
                                src="https://img.dudit.com.br/static/Logo.png"
                                alt="Dudit"
                                className="h-10 w-auto object-contain"
                            />
                        </Link>
                    </div>

                    {/* Middle Section: Search (Desktop) or Title (Mobile) */}
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
                                            {desktopResults.map((result) => (
                                                <button
                                                    key={result.id}
                                                    onClick={() => handleResultClick(result.category, result.slug)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-border rounded-xl transition-colors text-left group"
                                                >
                                                    <div className="w-8 h-8 rounded-full bg-brand-green/10 dark:bg-brand-green/20 flex items-center justify-center text-brand-green shrink-0">
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

                        {/* Mobile Header Title */}
                        <div className="lg:hidden flex-1 flex items-center justify-center h-[38px] relative mx-2">
                            <h1 className="text-brand-dark dark:text-dark-heading font-bold text-[15px] truncate px-2 whitespace-nowrap">
                                Central de Ajuda
                            </h1>
                        </div>
                    </div>

                    {/* Right Actions: Mobile Search Toggle & Theme Toggle */}
                    <div className="flex items-center gap-2 shrink-0 z-10">
                        {/* Mobile Search Toggle */}
                        <button
                            onClick={() => setIsMobileSearchOpen(true)}
                            className="lg:hidden w-10 h-10 flex items-center justify-center text-brand-inactive-text dark:text-dark-body hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
                            title="Buscar na Central de Ajuda"
                        >
                            <SearchIcon size={22} />
                        </button>

                        {/* Theme Toggle - Desktop & Mobile */}
                        <Button
                            variant="outline"
                            className="hidden lg:flex rounded-full w-10 h-10 p-0 border-brand-border dark:border-dark-border text-brand-inactive-text dark:text-dark-body hover:bg-brand-gray dark:hover:bg-dark-border transition-all"
                            onClick={handleThemeChange}
                        >
                            {mounted && (theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />)}
                        </Button>
                    </div>
                </div>
            </header>

            {/* Mobile Full-Screen Search Overlay */}
            {isMobileSearchOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-[200] bg-white dark:bg-dark-surface flex flex-col"
                    style={{ zIndex }}
                >
                    <div className="w-full max-w-3xl mx-auto flex flex-col h-full">
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-dark-border">
                            <button
                                onClick={handleCloseMobileSearch}
                                className="shrink-0 text-brand-dark dark:text-dark-heading hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
                                title="Voltar"
                            >
                                <ChevronLeftIcon size={20} />
                            </button>

                            <form
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    handleSearch(searchQuery)
                                }}
                                className="flex-1 flex items-center h-[40px] bg-brand-gray dark:bg-dark-border/30 rounded-full px-3"
                            >
                                <button
                                    type="submit"
                                    className="text-brand-green dark:text-brand-green shrink-0 p-1 mr-1 hover:opacity-80 transition-opacity"
                                    title="Buscar"
                                >
                                    <SearchIcon size={18} />
                                </button>

                                <input
                                    type="search"
                                    autoFocus
                                    enterKeyHint="search"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    placeholder="Buscar na Central de Ajuda"
                                    className="marketplace-search-input bg-transparent border-none outline-none text-brand-dark dark:text-dark-heading text-[15px] w-full placeholder-gray-400 dark:placeholder-gray-500 font-normal py-0"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault()
                                            handleSearch(searchQuery)
                                        }
                                    }}
                                />

                                {searchQuery.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery("")}
                                        className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                                        title="Limpar busca"
                                    >
                                        <XIcon size={18} />
                                    </button>
                                )}
                            </form>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {/* Linha de ação rápida: Buscar pelo termo digitado */}
                            {searchQuery.trim().length > 0 && (
                                <button
                                    type="button"
                                    className="w-full flex items-center gap-3 px-5 py-3.5 bg-brand-green/5 dark:bg-brand-green/10 hover:bg-brand-green/10 transition-colors text-left border-b border-gray-100 dark:border-dark-border"
                                    onClick={() => handleSearch(searchQuery)}
                                >
                                    <SearchIcon size={18} className="text-brand-green shrink-0" />
                                    <span className="text-[15px] font-medium text-brand-green flex-1 min-w-0 truncate">
                                        Buscar por &ldquo;{searchQuery.trim()}&rdquo;
                                    </span>
                                    <ChevronRightIcon size={16} className="text-brand-green shrink-0" />
                                </button>
                            )}

                            {mobileResults.length > 0 ? (
                                <div className="divide-y divide-gray-50 dark:divide-dark-border">
                                    {mobileResults.map((result) => (
                                        <button
                                            key={result.id}
                                            type="button"
                                            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-brand-gray dark:hover:bg-dark-border/30 transition-colors text-left"
                                            onClick={() => handleResultClick(result.category, result.slug)}
                                        >
                                            <SearchIcon
                                                size={18}
                                                className="text-brand-inactive-text dark:text-dark-body shrink-0"
                                            />

                                            <span className="text-[15px] text-brand-dark dark:text-dark-heading flex-1 min-w-0 truncate">
                                                {result.title}
                                            </span>

                                            <ChevronRightIcon
                                                size={16}
                                                className="text-brand-inactive-text dark:text-dark-body shrink-0"
                                            />
                                        </button>
                                    ))}
                                </div>
                            ) : searchQuery.trim().length >= 2 ? (
                                <div className="flex flex-col items-center justify-center py-16 px-6">
                                    <IconPlaceholder
                                        icon={SearchIcon}
                                        title={`Nenhuma sugestão para "${searchQuery}"`}
                                        itemButton={{
                                            text: "Ver todos os tópicos",
                                            action: () => {
                                                handleCloseMobileSearch()
                                                router.push("/ajuda")
                                            },
                                        }}
                                    />
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
