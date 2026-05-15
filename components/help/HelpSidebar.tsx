"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { helpCategories } from "@/lib/help-data"
import { ChevronDownIcon, ChevronRightIcon, InstagramIcon, FacebookIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { Button } from "@/components/reusable"

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

    // Helper to get emoji for categories that don't have one in data
    const getCategoryEmoji = (id: string) => {
        if (id === "boas-vindas") return "👋"
        if (id === "login-registro") return "🔐"
        if (id === "gestao") return "📊"
        if (id === "pedidos") return "📦"
        if (id === "financeiro") return "💰"
        return "📁"
    }

    return (
        <aside className={cn("flex flex-col h-[calc(100vh-72px)] bg-white dark:bg-dark-bg border-r border-gray-100 dark:border-dark-border overflow-y-auto custom-scrollbar sticky top-[72px]", className)}>
            {/* Navigation */}
            <nav className="flex-1 px-2 pt-4 pb-8">
                {filteredCategories.map(category => (
                    <div key={category.id} className="mb-1">
                        <button
                            onClick={() => toggleCategory(category.id)}
                            className={cn(
                                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold text-gray-400 dark:text-dark-body uppercase tracking-wider transition-all group cursor-pointer",
                                "hover:bg-gray-50 dark:hover:bg-dark-surface hover:text-gray-900 dark:hover:text-dark-heading"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-sm">{category.icon || getCategoryEmoji(category.id)}</span>
                                <span>{category.title}</span>
                            </div>
                            <div className="transition-transform duration-200">
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
                                                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all group relative cursor-pointer",
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

            {/* Footer with Socials */}
            <div className="p-4 mt-auto border-t border-gray-100 dark:border-dark-border">
                <div className="flex items-center justify-center gap-3">
                    <Button 
                        variant="outline" 
                        className="rounded-full w-10 h-10 p-0 border-gray-200 dark:border-dark-border text-gray-500 dark:text-dark-body hover:text-brand-green dark:hover:text-brand-green hover:border-brand-green dark:hover:border-brand-green transition-all"
                        onClick={() => window.open("https://instagram.com", "_blank")}
                    >
                        <InstagramIcon size={18} />
                    </Button>
                    <Button 
                        variant="outline" 
                        className="rounded-full w-10 h-10 p-0 border-gray-200 dark:border-dark-border text-gray-500 dark:text-dark-body hover:text-brand-green dark:hover:text-brand-green hover:border-brand-green dark:hover:border-brand-green transition-all"
                        onClick={() => window.open("https://facebook.com", "_blank")}
                    >
                        <FacebookIcon size={18} />
                    </Button>
                </div>
                <p className="text-[10px] text-center text-gray-400 dark:text-dark-body mt-3 font-medium uppercase tracking-widest">
                    Versão 2.4.0
                </p>
            </div>
        </aside>
    )
}
