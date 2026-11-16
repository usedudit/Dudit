"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MenuIcon, XIcon, SearchIcon, ChevronRightIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import { motion, AnimatePresence } from "framer-motion"

const NAV_ITEMS = [
    { label: "Dicas", href: "/blog" },
    { label: "Central de Ajuda", href: "/ajuda" },
    { label: "Segmentos", href: "/institucional/segmentos" },
    { label: "Planos", href: "/institucional/planos" },
]

export default function BlogHeader({ initialQuery = "" }: { initialQuery?: string }) {
    const [mobileOpen, setMobileOpen] = useState(false)
    const [query, setQuery] = useState(initialQuery)
    const router = useRouter()

    const submitSearch = (event: React.FormEvent) => {
        event.preventDefault()
        const trimmed = query.trim()
        router.push(trimmed ? `/blog?q=${encodeURIComponent(trimmed)}` : "/blog")
        setMobileOpen(false)
    }

    return (
        <header className="sticky top-0 z-50 w-full bg-brand-dark border-b border-white/10 shadow-md">
            <div className="mx-auto flex h-[68px] w-full max-w-[1400px] items-center justify-between gap-4 px-4 lg:px-6">
                <Link href="/" prefetch={false} className="shrink-0 pt-1">
                    <img
                        src="https://img.dudit.com.br/cdn-cgi/image/width=140,format=auto,quality=80/static/Logo.png"
                        alt="Dudit"
                        width={140}
                        height={40}
                        className="h-10 w-auto object-contain"
                    />
                </Link>

                <nav className="hidden lg:flex items-center gap-6 xl:gap-8 text-sm font-medium text-gray-300">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            prefetch={false}
                            className="transition-colors hover:text-brand-green"
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="hidden lg:flex items-center gap-3">
                    <form onSubmit={submitSearch} className="relative">
                        <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Buscar dicas..."
                            aria-label="Buscar no blog"
                            className="h-10 w-52 rounded-full border border-white/10 bg-white/10 pl-9 pr-4 text-sm text-white placeholder:text-gray-400 outline-none transition-all focus:w-64 focus:border-brand-green/60 focus:bg-white/15"
                        />
                    </form>
                    <Button asChild size="sm" className="whitespace-nowrap">
                        <Link href="/auth/login?mode=partner" prefetch={false}>
                            Começar grátis
                        </Link>
                    </Button>
                </div>

                <button
                    type="button"
                    onClick={() => setMobileOpen((open) => !open)}
                    className="lg:hidden p-2 text-white"
                    aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
                    aria-expanded={mobileOpen}
                >
                    {mobileOpen ? <XIcon size={24} /> : <MenuIcon size={24} />}
                </button>
            </div>

            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="lg:hidden overflow-hidden border-t border-white/10 bg-brand-dark"
                    >
                        <div className="mx-auto w-full max-w-[1400px] px-4 py-4">
                            <form onSubmit={submitSearch} className="relative mb-4">
                                <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Buscar dicas..."
                                    aria-label="Buscar no blog"
                                    className="h-11 w-full rounded-full border border-white/10 bg-white/10 pl-9 pr-4 text-sm text-white placeholder:text-gray-400 outline-none focus:border-brand-green/60"
                                />
                            </form>

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
                                <Link href="/auth/login?mode=partner" prefetch={false} onClick={() => setMobileOpen(false)}>
                                    Começar grátis
                                </Link>
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    )
}
