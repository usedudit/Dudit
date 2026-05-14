"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { helpCategories } from "@/lib/help-data"
import { ChevronDownIcon, ChevronRightIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"

export default function HelpSidebar({ 
    className,
    searchQuery
}: { 
    className?: string,
    searchQuery: string
}) {
    const params = useParams()
    const currentSlug = params.slug?.[params.slug.length - 1]
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
            art.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
    })).filter(cat => cat.articles.length > 0)

    return (
        <aside className={cn("flex flex-col h-[calc(100vh-72px)] bg-white dark:bg-dark-bg border-r border-gray-100 dark:border-dark-border overflow-y-auto custom-scrollbar sticky top-[72px]", className)}>
            {/* Navigation */}
            <nav className="flex-1 px-2 pt-4 pb-8">
                {filteredCategories.map(category => (
                    <div key={category.id} className="mb-2">
                        <button
                            onClick={() => toggleCategory(category.id)}
                            className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-gray-400 dark:text-dark-body uppercase tracking-wider hover:text-gray-600 dark:hover:text-dark-heading transition-colors group"
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
                                                                ? "bg-brand-green/5 dark:bg-brand-green/10 text-brand-green font-medium" 
                                                                : "text-gray-600 dark:text-dark-body hover:bg-gray-50 dark:hover:bg-dark-surface hover:text-gray-900 dark:hover:text-dark-heading"
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
                                                                isActive ? "text-brand-green" : "text-gray-300 dark:text-dark-border"
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
            <div className="p-4 mt-auto border-t border-gray-100 dark:border-dark-border">
                <div className="bg-gray-50 dark:bg-dark-surface rounded-xl p-3 flex items-center gap-3">
                   <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-dark-border flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500 dark:text-dark-body" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                        </svg>
                   </div>
                   <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900 dark:text-dark-heading">Fornecido por Dudit</p>
                        <p className="text-[10px] text-gray-500 dark:text-dark-body">Versão 2.4.0</p>
                   </div>
                </div>
            </div>
        </aside>
    )
}
