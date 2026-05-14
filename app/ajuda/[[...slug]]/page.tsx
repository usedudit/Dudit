"use client"

import React, { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { getArticleBySlug, helpCategories } from "@/lib/help-data"
import HelpSidebar from "@/components/help/HelpSidebar"
import HelpHeader from "@/components/help/HelpHeader"
import HelpContent from "@/components/help/HelpContent"
import HelpTOC from "@/components/help/HelpTOC"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

export default function HelpCenterPage() {
    const params = useParams()
    const router = useRouter()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    
    // Slug handling: can be undefined (home), or an array [category, article]

    const slugArray = params.slug as string[] | undefined
    const articleSlug = slugArray?.[slugArray.length - 1]
    
    const article = articleSlug ? getArticleBySlug(articleSlug) : helpCategories[0].articles[0]

    // Close mobile menu on navigation
    useEffect(() => {
        setMobileMenuOpen(false)
    }, [params.slug])

    // If no article found, maybe redirect to first one or 404
    if (!article && articleSlug) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Artigo não encontrado</h1>
                    <p className="text-gray-500 mb-6">O conteúdo que você está procurando não existe ou foi movido.</p>
                    <button 
                        onClick={() => router.push("/ajuda")}
                        className="text-brand-green font-bold hover:underline"
                    >
                        Voltar para o início
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-white dark:bg-dark-bg flex flex-col font-sans">
            <HelpHeader 
                onToggleMenu={() => setMobileMenuOpen(!mobileMenuOpen)} 
                menuOpen={mobileMenuOpen}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
            />

            <div className="flex-1 flex w-full max-w-[1440px] mx-auto relative">
                
                {/* Desktop Sidebar */}
                <HelpSidebar 
                    className="hidden lg:flex w-72 shrink-0 border-r border-gray-100 dark:border-dark-border" 
                    searchQuery={searchQuery}
                />

                {/* Mobile Sidebar (Drawer) */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <>
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setMobileMenuOpen(false)}
                                className="fixed inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                            />
                            <motion.div 
                                initial={{ x: "-100%" }}
                                animate={{ x: 0 }}
                                exit={{ x: "-100%" }}
                                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                                className="fixed inset-y-0 left-0 w-[280px] bg-white dark:bg-dark-surface z-50 lg:hidden shadow-2xl"
                            >
                                <HelpSidebar 
                                    className="w-full h-full border-none" 
                                    searchQuery={searchQuery}
                                />
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {/* Main View Area */}
                <main className="flex-1 min-w-0 relative">
                    <div className="flex w-full min-h-full">
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            {article && <HelpContent article={article} />}
                        </div>

                        {/* TOC (Desktop Only) */}
                        {article && <HelpTOC content={article.content} />}
                    </div>
                </main>
            </div>
        </div>
    )
}

