"use client"

import { useState } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { MenuIcon, XIcon, ChevronRightIcon, ShareIcon, ChevronLeftIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"

const NAV_ITEMS = [
    { label: "Dicas", href: "/blog" },
    { label: "Ferramentas", href: "/ferramentas" },
    { label: "Segmentos", href: "/institucional/segmentos" },
    { label: "Planos", href: "/institucional/planos" },
    { label: "Central de Ajuda", href: "/ajuda" },
]

interface BlogHeaderProps {
    isArticle?: boolean
    onBack?: () => void
    onShare?: () => void
}

export default function BlogHeader({ isArticle = false, onBack, onShare }: BlogHeaderProps) {
    const [mobileOpen, setMobileOpen] = useState(false)

    const handleNav = (href: string) => {
        setMobileOpen(false)
        window.location.href = href
    }

    if (isArticle) {
        return (
            <header className="lg:hidden fixed top-0 inset-x-0 w-full max-w-full z-50 bg-brand-dark dark:bg-dark-surface border-b border-white/10 overflow-hidden">
                <div className="w-full max-w-full px-4 pt-2 pb-2">
                    <div className="flex items-center gap-3 relative min-h-[36px]">
                        {/* Back Button - Left */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation()
                                onBack?.()
                            }}
                            aria-label="Voltar"
                        >
                            <ChevronLeftIcon size={18} className="text-white" strokeWidth={2.5} />
                        </Button>

                        {/* Middle: "Dica do Dino" */}
                        <div className="flex-1 flex items-center justify-center min-w-0">
                            <h1 className="text-white font-bold text-[15px] truncate px-2">
                                Dica do Dino
                            </h1>
                        </div>

                        {/* Right: Share Button */}
                        <div className="flex items-center gap-1 shrink-0">
                            {onShare && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onShare()
                                    }}
                                    aria-label="Compartilhar"
                                >
                                    <ShareIcon size={18} className="text-white" />
                                </Button>
                            )}
                            <button
                                type="button"
                                onClick={() => setMobileOpen((open) => !open)}
                                className="p-1 text-white"
                                aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
                                aria-expanded={mobileOpen}
                            >
                                <AnimatePresence mode="wait" initial={false}>
                                    {mobileOpen ? (
                                        <motion.div
                                            key="close"
                                            initial={{ rotate: -90, opacity: 0 }}
                                            animate={{ rotate: 0, opacity: 1 }}
                                            exit={{ rotate: 90, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <XIcon />
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="menu"
                                            initial={{ rotate: 90, opacity: 0 }}
                                            animate={{ rotate: 0, opacity: 1 }}
                                            exit={{ rotate: -90, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <MenuIcon />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile / Tablet Menu */}
                <AnimatePresence>
                    {mobileOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="absolute top-full left-0 w-full bg-brand-dark border-t border-white/10 shadow-lg overflow-hidden"
                        >
                            <div className="mx-auto w-full max-w-[1400px] px-4 py-4">
                                <nav className="flex flex-col">
                                    {NAV_ITEMS.map((item) => (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            prefetch={false}
                                            onClick={() => setMobileOpen(false)}
                                            className="flex items-center justify-between border-b border-white/5 py-3 text-sm font-medium text-gray-300 transition-colors hover:text-brand-green"
                                        >
                                            {item.label}
                                            <ChevronRightIcon size={16} />
                                        </Link>
                                    ))}
                                </nav>

                                <Button asChild className="mt-4 w-full justify-center">
                                    <Link
                                        href="/auth/login?mode=partner"
                                        prefetch={false}
                                        onClick={() => setMobileOpen(false)}
                                    >
                                        Começar Grátis
                                    </Link>
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </header>
        )
    }

    // Regular blog header (non-article pages)
    return (
        <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-brand-dark dark:bg-dark-surface">
            <div className="mx-auto flex h-[68px] w-full max-w-[1400px] items-center justify-between gap-4 px-4 lg:px-2">
                <Link href="/" prefetch={false} className="shrink-0 pt-1">
                    <img
                        src="https://img.dudit.com.br/cdn-cgi/image/width=140,format=auto,quality=80/static/Logo.png"
                        alt="Dudit"
                        width={140}
                        height={40}
                        className="h-10 w-auto object-contain"
                    />
                </Link>

                <nav className="hidden items-center gap-6 text-sm font-medium text-gray-300 xl:flex xl:gap-8">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            prefetch={false}
                            className="transition-colors hover:text-brand-green"
                            onClick={(e) => {
                                e.preventDefault()
                                handleNav(item.href)
                            }}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="hidden xl:block">
                    <Button asChild>
                        <Link href="/auth/login?mode=partner" prefetch={false}>
                            Começar Grátis
                        </Link>
                    </Button>
                </div>

                <button
                    type="button"
                    onClick={() => setMobileOpen((open) => !open)}
                    className="p-1 text-white xl:hidden"
                    aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
                    aria-expanded={mobileOpen}
                >
                    <AnimatePresence mode="wait" initial={false}>
                        {mobileOpen ? (
                            <motion.div
                                key="close"
                                initial={{ rotate: -90, opacity: 0 }}
                                animate={{ rotate: 0, opacity: 1 }}
                                exit={{ rotate: 90, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <XIcon />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="menu"
                                initial={{ rotate: 90, opacity: 0 }}
                                animate={{ rotate: 0, opacity: 1 }}
                                exit={{ rotate: -90, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <MenuIcon />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </button>
            </div>

            {/* Mobile / Tablet Menu */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="xl:hidden absolute top-full left-0 w-full bg-brand-dark border-t border-white/10 shadow-lg overflow-hidden"
                    >
                        <div className="mx-auto w-full max-w-[1400px] px-4 py-4">
                            <nav className="flex flex-col">
                                {NAV_ITEMS.map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        prefetch={false}
                                        onClick={() => setMobileOpen(false)}
                                        className="flex items-center justify-between border-b border-white/5 py-3 text-sm font-medium text-gray-300 transition-colors hover:text-brand-green"
                                    >
                                        {item.label}
                                        <ChevronRightIcon size={16} />
                                    </Link>
                                ))}
                            </nav>

                            <Button asChild className="mt-4 w-full justify-center">
                                <Link
                                    href="/auth/login?mode=partner"
                                    prefetch={false}
                                    onClick={() => setMobileOpen(false)}
                                >
                                    Começar Grátis
                                </Link>
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    )
}