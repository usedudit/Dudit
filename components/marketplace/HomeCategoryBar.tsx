"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronLeft, ChevronRight, Store, Wrench, ShoppingBag, Sparkles } from "lucide-react"
import { IntentPrefetchLink } from "@/components/navigation/IntentPrefetchLink"

interface HomeCategoryBarProps {
    selectedCitySlug?: string | null
}

interface NavItem {
    name: string
    href: (city: string) => string
    icon_url: string | null
    fallbackIcon: "bag" | "wrench" | "store" | "sparkles"
}

const HOME_NAV_ITEMS: NavItem[] = [
    {
        name: "Produtos",
        href: (city: string) => `/explorar/${city}?type=produtos`,
        icon_url: "https://img.dudit.com.br/static/categories/products/Tecnologia-e-eletronicos.png",
        fallbackIcon: "bag",
    },
    {
        name: "Serviços",
        href: (city: string) => `/explorar/${city}?type=servicos`,
        icon_url: null,
        fallbackIcon: "wrench",
    },
    {
        name: "Lojas",
        href: (city: string) => `/explorar/${city}?type=vitrines`,
        icon_url: null,
        fallbackIcon: "store",
    },
    {
        name: "Assinaturas",
        href: (city: string) => `/explorar/${city}?type=planos`,
        icon_url: null,
        fallbackIcon: "sparkles",
    },
]

export function HomeCategoryBar({ selectedCitySlug }: HomeCategoryBarProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [showLeftArrow, setShowLeftArrow] = useState(false)
    const [showRightArrow, setShowRightArrow] = useState(false)

    const city = selectedCitySlug || "brasil"

    const checkScroll = () => {
        const el = scrollContainerRef.current
        if (el) {
            setShowLeftArrow(el.scrollLeft > 10)
            setShowRightArrow(el.scrollLeft + el.clientWidth < el.scrollWidth - 10)
        }
    }

    useEffect(() => {
        const el = scrollContainerRef.current
        if (el) {
            checkScroll()
            el.addEventListener("scroll", checkScroll, { passive: true })
            window.addEventListener("resize", checkScroll, { passive: true })
            const timer = setTimeout(checkScroll, 400)
            return () => {
                el.removeEventListener("scroll", checkScroll)
                window.removeEventListener("resize", checkScroll)
                clearTimeout(timer)
            }
        }
    }, [])

    const scroll = (direction: "left" | "right") => {
        const el = scrollContainerRef.current
        if (el) {
            el.scrollBy({
                left: direction === "left" ? -el.clientWidth * 0.75 : el.clientWidth * 0.75,
                behavior: "smooth",
            })
        }
    }

    const renderIcon = (item: NavItem) => {
        if (item.icon_url) {
            return (
                <img
                    src={item.icon_url}
                    alt={item.name}
                    className="w-9 h-9 object-contain group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                />
            )
        }

        switch (item.fallbackIcon) {
            case "wrench":
                return <Wrench className="w-6 h-6 text-brand-green group-hover:scale-105 transition-transform" />
            case "store":
                return <Store className="w-6 h-6 text-brand-green group-hover:scale-105 transition-transform" />
            case "sparkles":
                return <Sparkles className="w-6 h-6 text-brand-green group-hover:scale-105 transition-transform" />
            case "bag":
            default:
                return <ShoppingBag className="w-6 h-6 text-brand-green group-hover:scale-105 transition-transform" />
        }
    }

    return (
        <div className="relative w-full group/bar">
            {/* Seta esquerda no desktop */}
            {showLeftArrow && (
                <button
                    onClick={() => scroll("left")}
                    aria-label="Rolar para esquerda"
                    className="hidden lg:flex absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white dark:bg-dark-surface shadow-md border border-gray-200 dark:border-dark-border items-center justify-center text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-dark-border transition-all"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
            )}

            {/* Container com as 4 categorias gerais */}
            <div
                ref={scrollContainerRef}
                className="flex items-center justify-start sm:justify-center gap-6 sm:gap-10 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-2 select-none"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
                {HOME_NAV_ITEMS.map((item) => {
                    const targetHref = item.href(city)
                    return (
                        <IntentPrefetchLink
                            key={item.name}
                            href={targetHref}
                            className="snap-start shrink-0 flex flex-col items-center gap-2 group w-[80px] sm:w-[90px]"
                        >
                            <div className="w-[68px] h-[68px] rounded-full bg-brand-gray dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border flex items-center justify-center overflow-hidden group-hover:border-brand-green group-hover:shadow-md transition-all duration-200">
                                {renderIcon(item)}
                            </div>
                            <span className="text-xs font-bold text-center leading-tight text-brand-dark dark:text-dark-heading line-clamp-2">
                                {item.name}
                            </span>
                        </IntentPrefetchLink>
                    )
                })}
            </div>

            {/* Seta direita no desktop */}
            {showRightArrow && (
                <button
                    onClick={() => scroll("right")}
                    aria-label="Rolar para direita"
                    className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white dark:bg-dark-surface shadow-md border border-gray-200 dark:border-dark-border items-center justify-center text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-dark-border transition-all"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            )}
        </div>
    )
}
