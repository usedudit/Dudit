"use client"

import React, { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MenuIcon, XIcon, SearchIcon, InstagramIcon, FacebookIcon, ChevronRightIcon } from "@/lib/icons"
import { Button, Input } from "@/components/reusable"
import { helpCategories } from "@/lib/help-data"
import { motion, AnimatePresence } from "framer-motion"
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
    const searchRef = useRef<HTMLDivElement>(null)
    const router = useRouter()

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
        <header className="h-[72px] bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border flex items-center px-4 lg:px-8 sticky top-0 z-50 w-full">
            <div className="flex items-center gap-4 w-full max-w-[1440px] mx-auto relative h-full">
                
                <AnimatePresence mode="wait">
                    {!isMobileSearchOpen ? (
                        <motion.div 
                            key="logo-section"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="flex items-center gap-4 flex-1 lg:flex-none"
                        >
                            {/* Mobile Menu Toggle */}
                            <button 
                                onClick={onToggleMenu}
                                className="lg:hidden p-2 text-gray-500 dark:text-dark-body hover:bg-gray-50 dark:hover:bg-dark-border rounded-lg transition-colors"
                            >
                                {menuOpen ? <XIcon /> : <MenuIcon />}
                            </button>

                            {/* Logo */}
                            <Link href="/" className="flex items-center gap-2 shrink-0">
                                <img 
                                    src="https://img.dudit.com.br/static/Logo.png" 
                                    alt="Dudit" 
                                    className="h-7 w-auto dark:brightness-0 dark:invert" 
                                />
                                <div className="h-4 w-[1px] bg-gray-200 dark:bg-dark-border mx-1 hidden sm:block" />
                                <span className="text-sm font-bold text-gray-900 dark:text-dark-heading hidden sm:block whitespace-nowrap">Central de ajuda</span>
                            </Link>
                        </motion.div>
                    ) : null}
                </AnimatePresence>

                {/* Desktop Search Center */}
                <div className="hidden lg:flex items-center flex-1 justify-center px-8 relative" ref={searchRef}>
                    <div className="max-w-md w-full relative">
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
                </div>

                {/* Mobile Search Input (Expandable) */}
                <AnimatePresence>
                    {isMobileSearchOpen && (
                        <motion.div 
                            initial={{ x: "100%", opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: "100%", opacity: 0 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="absolute inset-y-0 right-12 left-12 lg:hidden flex items-center z-10"
                        >
                            <Input
                                variant="full-rounded"
                                placeholder="Buscar ajuda..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                                prefix={<SearchIcon size={18} className="text-brand-green" />}
                                className="w-full"
                            />
                            {/* Mobile Dropdown Results could go here too if needed, but the requirement is just the expand */}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Right Actions */}
                <div className="flex items-center gap-2 shrink-0">
                    <button 
                        onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
                        className="lg:hidden p-2 text-gray-500 dark:text-dark-body hover:bg-gray-50 dark:hover:bg-dark-border rounded-lg transition-colors"
                    >
                        {isMobileSearchOpen ? <XIcon size={22} /> : <SearchIcon size={22} />}
                    </button>

                    <div className="hidden sm:flex items-center gap-2">
                        <Button 
                            variant="outline" 
                            className="rounded-full w-10 h-10 p-0 dark:border-dark-border dark:text-dark-body dark:hover:bg-dark-border"
                            onClick={() => window.open("https://instagram.com", "_blank")}
                        >
                            <InstagramIcon size={18} />
                        </Button>
                        <Button 
                            variant="outline" 
                            className="rounded-full w-10 h-10 p-0 dark:border-dark-border dark:text-dark-body dark:hover:bg-dark-border"
                            onClick={() => window.open("https://facebook.com", "_blank")}
                        >
                            <FacebookIcon size={18} />
                        </Button>
                    </div>
                </div>
            </div>
        </header>
    )
}
