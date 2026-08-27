"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { helpCategories, HelpCategory, HelpArticle } from "@/lib/help-data"
import { ChevronDownIcon, ChevronRightIcon, InstagramIcon, TwitterIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { Button } from "@/components/reusable"

interface CategoryGroup {
    id: string
    title: string
    icon: string
    categories: HelpCategory[]
}

const categoryGroups: CategoryGroup[] = [
    {
        id: "gestao",
        title: "Gestão",
        icon: "📊",
        categories: helpCategories.filter(cat =>
            ["vendas", "produtos-estoque", "servicos", "financeiro", "clientes", "marketing"].includes(cat.id)
        )
    },
    {
        id: "vitrine-online",
        title: "Vitrine Online",
        icon: "🛍️",
        categories: helpCategories.filter(cat =>
            ["vitrine-online"].includes(cat.id)
        )
    },
    {
        id: "portal-entregador",
        title: "Portal do Entregador",
        icon: "🚚",
        categories: helpCategories.filter(cat =>
            ["entregas"].includes(cat.id)
        )
    },
    {
        id: "geral",
        title: "Geral",
        icon: "ℹ️",
        categories: helpCategories.filter(cat =>
            ["boas-vindas", "login-registro"].includes(cat.id)
        )
    }
]

export default function HelpSidebar({
    className,
    searchQuery
}: {
    className?: string,
    searchQuery: string
}) {
    const params = useParams()
    const currentSlug = params.slug?.[params.slug.length - 1]
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
        "gestao": true,
        "vitrine-online": false,
        "portal-entregador": false,
        "geral": false
    })
    const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({})

    const toggleGroup = (id: string) => {
        setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }))
    }

    const toggleCategory = (id: string) => {
        setOpenCategories(prev => ({ ...prev, [id]: !prev[id] }))
    }

    const filterArticles = (articles: HelpArticle[]) => {
        return articles.filter(art =>
            art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            art.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
    }

    const filteredGroups = categoryGroups.map(group => ({
        ...group,
        categories: group.categories.map(cat => ({
            ...cat,
            articles: filterArticles(cat.articles)
        })).filter(cat => cat.articles.length > 0)
    })).filter(group => group.categories.length > 0)

    const getCategoryEmoji = (id: string) => {
        if (id === "boas-vindas") return "👋"
        if (id === "login-registro") return "🔐"
        if (id === "vendas") return "🛒"
        if (id === "entregas") return "🚚"
        if (id === "financeiro") return "💰"
        if (id === "produtos-estoque") return "📦"
        if (id === "servicos") return "🛠️"
        if (id === "clientes") return "👥"
        if (id === "vitrine-online") return "🛍️"
        if (id === "marketing") return "📢"
        return "📁"
    }

    return (
        <aside className={cn("flex flex-col h-[calc(100vh-72px)] bg-white dark:bg-dark-surface border-r border-gray-100 dark:border-dark-border overflow-y-auto custom-scrollbar sticky top-[72px]", className)}>
            <nav className="flex-1 px-2 pt-4 pb-8">
                {filteredGroups.map(group => (
                    <div key={group.id} className="mb-2">
                        <button
                            onClick={() => toggleGroup(group.id)}
                            className={cn(
                                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-bold text-brand-dark dark:text-dark-heading transition-all group cursor-pointer",
                                "hover:bg-brand-gray dark:hover:bg-dark-border/40 hover:text-brand-dark dark:hover:text-dark-heading"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-sm">{group.icon}</span>
                                <span>{group.title}</span>
                            </div>
                            <div className="transition-transform duration-200">
                                {openGroups[group.id] ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                            </div>
                        </button>

                        <AnimatePresence initial={false}>
                            {(openGroups[group.id] || searchQuery.length > 0) && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <div className="ml-2 mt-1 space-y-1">
                                        {group.categories.map(category => (
                                            <div key={category.id}>
                                                <button
                                                    onClick={() => toggleCategory(category.id)}
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-semibold transition-all group cursor-pointer",
                                                        "text-brand-dark/80 dark:text-dark-heading/80 hover:bg-brand-gray dark:hover:bg-dark-border/40 hover:text-brand-dark dark:hover:text-dark-heading"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs">{category.icon || getCategoryEmoji(category.id)}</span>
                                                        <span>{category.title}</span>
                                                    </div>
                                                    <div className="transition-transform duration-200">
                                                        {openCategories[category.id] ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
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
                                                            <ul className="mt-0.5 space-y-0.5 ml-2">
                                                                {category.articles.map(article => {
                                                                    const isActive = currentSlug === article.slug
                                                                    return (
                                                                        <li key={article.id}>
                                                                            <Link
                                                                                href={`/ajuda/${category.id}/${article.slug}`}
                                                                                className={cn(
                                                                                    "flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] transition-all group relative cursor-pointer",
                                                                                    isActive
                                                                                        ? "bg-brand-green/10 text-brand-green font-semibold"
                                                                                        : "text-brand-inactive-text dark:text-dark-body hover:bg-brand-gray dark:hover:bg-dark-border/40 hover:text-brand-dark dark:hover:text-dark-heading"
                                                                                )}
                                                                            >
                                                                                {isActive && (
                                                                                    <motion.div
                                                                                        layoutId="active-indicator"
                                                                                        className="bg-brand-green w-1 rounded-full self-stretch shrink-0 min-h-4"
                                                                                    />
                                                                                )}
                                                                                <span className="flex-1 truncate">{article.title}</span>
                                                                                <ChevronRightIcon
                                                                                    size={12}
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
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ))}
            </nav>

            <div className="p-4 mt-auto border-t border-gray-100 dark:border-dark-border">
                <div className="flex items-center justify-center gap-3">
                    <Button
                        variant="outline"
                        className="rounded-full w-10 h-10 p-0 border-gray-200 dark:border-dark-border text-gray-500 dark:text-dark-body hover:text-brand-green dark:hover:text-brand-green hover:border-brand-green dark:hover:border-brand-green transition-all"
                        onClick={() => window.open("https://instagram.com/usedudit", "_blank")}
                    >
                        <InstagramIcon size={18} />
                    </Button>
                    <Button
                        variant="outline"
                        className="rounded-full w-10 h-10 p-0 border-gray-200 dark:border-dark-border text-gray-500 dark:text-dark-body hover:text-brand-green dark:hover:text-brand-green hover:border-brand-green dark:hover:border-brand-green transition-all"
                        onClick={() => window.open("https://twitter.com/usedudit", "_blank")}
                    >
                        <TwitterIcon size={18} />
                    </Button>
                </div>
            </div>
        </aside>
    )
}
