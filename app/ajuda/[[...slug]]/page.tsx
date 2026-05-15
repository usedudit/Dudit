"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { getArticleBySlug } from "@/lib/help-data"
import HelpSidebar from "@/components/help/HelpSidebar"
import HelpHeader from "@/components/help/HelpHeader"
import HelpContent from "@/components/help/HelpContent"
import HelpTOC from "@/components/help/HelpTOC"
import HelpHome from "@/components/help/HelpHome"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/reusable"
import { useTheme } from "next-themes"
import { MoonIcon, SunIcon, XIcon } from "@/lib/icons"
import Link from "next/link"

export default function HelpCenterPage() {
    const params = useParams()
    const router = useRouter()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")

    // Slug handling: can be undefined (home), or an array [category, article]

    const slugArray = params.slug as string[] | undefined
    const isHome = !slugArray || slugArray.length === 0
    const articleSlug = slugArray?.[slugArray.length - 1]

    const article = articleSlug ? getArticleBySlug(articleSlug) : null
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    const [isTransitioning, setIsTransitioning] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

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
        <div className="min-h-screen bg-white dark:bg-dark-surface flex flex-col font-sans">
            <HelpHeader
                onToggleMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
                menuOpen={mobileMenuOpen}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
            />

            {/* Spacer for fixed header */}
            <div className="h-[72px]" />

            <div className="flex-1 flex items-start w-full max-w-[1440px] mx-auto relative min-h-screen">


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
                                className="fixed inset-y-0 left-0 w-[280px] bg-white dark:bg-dark-surface z-50 lg:hidden shadow-2xl flex flex-col"
                            >
                                {/* Sheet Header */}
                                <div className="h-[72px] px-4 flex items-center justify-between border-b border-gray-100 dark:border-dark-border shrink-0">
                                    <Link href="/" className="flex items-center gap-2">
                                        <img
                                            src="https://img.dudit.com.br/static/Logo.png"
                                            alt="Dudit"
                                            className="h-6 w-auto"
                                        />
                                    </Link>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            className="rounded-full w-9 h-9 p-0 border-brand-border dark:border-dark-border text-brand-inactive-text dark:text-dark-body"
                                            onClick={handleThemeChange}
                                        >
                                            {mounted && (theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />)}
                                        </Button>
                                        <Button
                                            variant="filled"
                                            className="rounded-full w-9 h-9 p-0"
                                            onClick={() => setMobileMenuOpen(false)}
                                        >
                                            <XIcon size={18} />
                                        </Button>
                                    </div>
                                </div>

                                <HelpSidebar
                                    className="w-full flex-1 border-none"
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
                            {isHome ? <HelpHome /> : (article && <HelpContent article={article} />)}
                        </div>

                        {/* TOC (Desktop Only) */}
                        {!isHome && article && <HelpTOC content={article.content} />}
                    </div>
                </main>

            </div>
        </div>
    )
}

