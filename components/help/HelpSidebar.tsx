"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { helpCategories, HelpCategory, HelpArticle } from "@/lib/help-data"
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"

export default function HelpSidebar({ className }: { className?: string }) {
    const params = useParams()
    const currentSlug = params.slug?.[params.slug.length - 1]
    const [searchQuery, setSearchQuery] = useState("")
    const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
        "boas-vindas": true,
        "login-registro": true,
        "gestao": true
    })

    const toggleCategory = (id: string) => {
        setOpenCategories(prev => ({ ...prev, [id]: !prev[id] }))
    }

    const filteredCategories = helpCategories.map(cat => ({
        ...cat,
        articles: cat.articles.filter(art => 
            art.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (art as any).description?.toLowerCase().includes(searchQuery.toLowerCase())
        )
    })).filter(cat => cat.articles.length > 0)

    return (
        <aside className={cn("flex flex-col h-full bg-white border-r border-gray-100 overflow-y-auto custom-scrollbar", className)}>
            {/* Search Bar */}
            <div className="p-4 sticky top-0 bg-white z-10">
                <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Perguntar ou buscar..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded bg-white pointer-events-none">
                        Ctrl K
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 pb-8">
                {filteredCategories.map(category => (
                    <div key={category.id} className="mb-2">
                        <button
                            onClick={() => toggleCategory(category.id)}
                            className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors group"
                        >
                            <div className="flex items-center gap-2">
                                {category.icon && <span className="text-sm">{category.icon}</span>}
                                <span>{category.title}</span>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                {openCategories[category.id] ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                            </div>
                        </button>

                        <AnimatePresence initial={false}>
                            {(openCategories[category.id] || searchQuery.length > 0) && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <ul className="mt-1 space-y-0.5">
                                        {category.articles.map(article => {
                                            const isActive = currentSlug === article.slug
                                            return (
                                                <li key={article.id}>
                                                    <Link
                                                        href={`/ajuda/${category.id}/${article.slug}`}
                                                        className={cn(
                                                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all group relative",
                                                            isActive
                                                                ? "bg-brand-green/5 text-brand-green font-medium"
                                                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                                        )}
                                                    >
                                                        {isActive && (
                                                            <motion.div
                                                                layoutId="active-indicator"
                                                                className="absolute left-0 w-1 h-4 bg-brand-green rounded-r-full"
                                                            />
                                                        )}
                                                        <span className="flex-1 truncate">{article.title}</span>
                                                        <ChevronRightIcon
                                                            size={14}
                                                            className={cn(
                                                                "opacity-0 group-hover:opacity-100 transition-opacity",
                                                                isActive ? "text-brand-green" : "text-gray-300"
                                                            )}
                                                        />
                                                    </Link>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div className="p-4 mt-auto border-t border-gray-100">
                <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900">Fornecido por Dudit</p>
                        <p className="text-[10px] text-gray-500">Versão 2.4.0</p>
                    </div>
                </div>
            </div>
        </aside>
    )
}
