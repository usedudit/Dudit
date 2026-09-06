"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import Button from "../reusable/Button"

export const CategoryCarousel = ({
    categories,
    selectedCategories,
    onToggleCategory,
    onSeeAllCategories,
}: {
    categories: { id?: string; name: string; icon_url: string | null }[]
    selectedCategories: string[]
    onToggleCategory: (catName: string) => void
    onSeeAllCategories: () => void
}) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [showLeftArrow, setShowLeftArrow] = useState(false)
    const [showRightArrow, setShowRightArrow] = useState(false)
    let scrollCheckTimer: ReturnType<typeof setTimeout>

    const checkScroll = () => {
        const el = scrollContainerRef.current
        if (el) {
            setShowLeftArrow(el.scrollLeft > 2)
            setShowRightArrow(el.scrollLeft + el.clientWidth < el.scrollWidth - 5)
        }
    }

    useEffect(() => {
        const el = scrollContainerRef.current
        if (el) {
            checkScroll()
            el.addEventListener("scroll", checkScroll, { passive: true })
            window.addEventListener("resize", checkScroll, { passive: true })
            scrollCheckTimer = setTimeout(checkScroll, 500)
            return () => {
                el.removeEventListener("scroll", checkScroll)
                window.removeEventListener("resize", checkScroll)
                clearTimeout(scrollCheckTimer)
            }
        }
    }, [categories])

    const scroll = (direction: 'left' | 'right') => {
        const el = scrollContainerRef.current
        if (el) {
            el.scrollBy({
                left: direction === 'left' ? -el.clientWidth * 0.75 : el.clientWidth * 0.75,
                behavior: 'smooth'
            })
        }
    }

    return (
        <div className="w-full animate-fade-in">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg lg:text-2xl font-medium text-brand-dark dark:text-dark-heading">Categorias</h2>
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        onClick={onSeeAllCategories}
                        className="text-[13px] font-bold text-brand-green hover:underline cursor-pointer px-2 py-1 select-none"
                    >
                        Ver tudo
                    </Button>
                    <div className="hidden lg:flex items-center gap-1.5">
                        {showLeftArrow && (
                            <Button
                                variant="filled"
                                onClick={() => scroll('left')}
                                className="w-8 h-8"
                            >
                                <ChevronLeft size={16} />
                            </Button>
                        )}
                        {showRightArrow && (
                            <Button
                                variant="filled"
                                onClick={() => scroll('right')}
                                className="w-8 h-8"
                            >
                                <ChevronRight size={16} />
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <div
                ref={scrollContainerRef}
                className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth pb-2 px-1"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                <div className="snap-start shrink-0 w-[110px]">
                    <button
                        onClick={() => onToggleCategory("__all__")}
                        className={`flex flex-col items-center gap-2 p-3 rounded-[16px] transition-all duration-200 w-full h-full border ${selectedCategories.length === 0
                            ? 'bg-brand-green text-white border-brand-green'
                            : 'bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading border-gray-200 dark:border-dark-border hover:border-brand-green hover:bg-green-50'
                            }`}
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedCategories.length === 0 ? 'bg-white/20' : 'bg-brand-gray dark:bg-dark-border/30'
                            }`}>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7" rx="1" />
                                <rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" />
                                <rect x="14" y="14" width="7" height="7" rx="1" />
                            </svg>
                        </div>
                        <span className="text-xs font-bold text-center leading-tight">Tudo</span>
                    </button>
                </div>

                {(categories || []).map((cat) => {
                    const isSelected = selectedCategories.includes(cat.name)
                    return (
                        <div key={cat.name} className="snap-start shrink-0 w-[110px]">
                            <button
                                onClick={() => onToggleCategory(cat.name)}
                                className={`flex flex-col items-center gap-2 p-3 rounded-[16px] transition-all duration-200 w-full h-full border ${isSelected
                                    ? 'bg-brand-green text-white border-brand-green'
                                    : 'bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading border-gray-200 dark:border-dark-border hover:border-brand-green hover:bg-green-50'
                                    }`}
                            >
                                {cat.icon_url ? (
                                    <img src={cat.icon_url} alt={cat.name} className="w-10 h-10 object-contain" />
                                ) : (
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isSelected ? 'bg-white/20' : 'bg-brand-gray dark:bg-dark-border/30'
                                        }`}>
                                        <span className="text-lg">📦</span>
                                    </div>
                                )}
                                <span className="text-[11px] font-bold text-center leading-tight line-clamp-2">{cat.name}</span>
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
