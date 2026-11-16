"use client"

import { useState } from "react"
import Link from "next/link"
import { MenuIcon, XIcon, ChevronRightIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"

const NAV_ITEMS = [
    { label: "Dicas", href: "/blog" },
    { label: "Ferramentas", href: "/ferramentas" },
    { label: "Segmentos", href: "/institucional/segmentos" },
    { label: "Planos", href: "/institucional/planos" },
    { label: "Central de Ajuda", href: "/ajuda" },
]

export default function BlogHeader() {
    const [mobileOpen, setMobileOpen] = useState(false)

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

                <nav className="hidden items-center gap-6 text-sm font-medium text-gray-300 lg:flex xl:gap-8">
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

                <div className="hidden lg:block">
                    <Button asChild>
                        <Link href="/auth/login?mode=partner" prefetch={false}>
                            Começar Grátis
                        </Link>
                    </Button>
                </div>

                <button
                    type="button"
                    onClick={() => setMobileOpen((open) => !open)}
                    className="p-1 text-white lg:hidden"
                    aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
                    aria-expanded={mobileOpen}
                >
                    {mobileOpen ? <XIcon /> : <MenuIcon />}
                </button>
            </div>

            {mobileOpen && (
                <div className="border-t border-white/10 bg-brand-dark lg:hidden dark:bg-dark-surface">
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
                </div>
            )}
        </header>
    )
}
