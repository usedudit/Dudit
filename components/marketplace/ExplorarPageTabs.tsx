"use client"

import { useEffect, useRef, useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { ChevronLeft, ChevronRight, SlidersHorizontal, ListOrdered } from "lucide-react"
import { Badge } from "@/components/reusable/Badge"

interface ExplorarPageTabsProps {
    activeTab: string
    onTabChange: (tab: string) => void
    activeFiltersCount: number
    sortLabel: string
}

export function ExplorarPageTabs({
    activeTab,
    onTabChange,
    activeFiltersCount,
    sortLabel,
}: ExplorarPageTabsProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(false)

    const checkScroll = () => {
        const el = scrollContainerRef.current
        if (!el) return
        setCanScrollLeft(el.scrollLeft > 0)
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 5)
    }

    useEffect(() => {
        const el = scrollContainerRef.current
        if (!el) return

        checkScroll()
        el.addEventListener("scroll", checkScroll)
        window.addEventListener("resize", checkScroll)

        const timer = setTimeout(checkScroll, 100)
        return () => {
            el.removeEventListener("scroll", checkScroll)
            window.removeEventListener("resize", checkScroll)
            clearTimeout(timer)
        }
    }, [])

    const scroll = (direction: "left" | "right") => {
        const el = scrollContainerRef.current
        if (!el) return
        el.scrollBy({
            left: direction === "left" ? -200 : 200,
            behavior: "smooth",
        })
    }

    return (
        <div className="sticky top-[128px] z-30 bg-white border-b border-gray-100 md:border-b-0">
            <div className="container mx-auto px-4 max-w-[1400px]">
                <div className="relative flex items-center justify-between">
                    {/* Left scroll button */}
                    {canScrollLeft && (
                        <button
                            onClick={() => scroll("left")}
                            className="absolute left-0 top-0 bottom-0 z-10 flex items-center justify-center w-8 bg-gradient-to-r from-white to-transparent md:hidden"
                            aria-label="Scroll filtros esquerda"
                        >
                            <ChevronLeft className="w-4 h-4 text-brand-dark" />
                        </button>
                    )}

                    {/* Tabs container */}
                    <div
                        ref={scrollContainerRef}
                        className="flex-1 overflow-x-auto scrollbar-none"
                        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                    >
                        <Tabs
                            value={activeTab}
                            onValueChange={onTabChange}
                            className="w-full"
                        >
                            <TabsList className="inline-flex gap-0 bg-transparent border-b-0 w-full justify-start h-auto p-0">
                                <TabsTrigger
                                    value="filtros"
                                    className="relative px-4 py-3 font-semibold text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-brand-green data-[state=active]:bg-transparent data-[state=active]:text-brand-green data-[state=active]:shadow-none text-brand-dark hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <SlidersHorizontal className="w-4 h-4" />
                                        <span>Filtros</span>
                                        {activeFiltersCount > 0 && (
                                            <Badge variant="blue" className="ml-1">
                                                {activeFiltersCount}
                                            </Badge>
                                        )}
                                    </div>
                                </TabsTrigger>

                                <TabsTrigger
                                    value="ordenar"
                                    className="relative px-4 py-3 font-semibold text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-brand-green data-[state=active]:bg-transparent data-[state=active]:text-brand-green data-[state=active]:shadow-none text-brand-dark hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <ListOrdered className="w-4 h-4" />
                                        <span>Ordenar</span>
                                        {sortLabel !== "Relevância" && (
                                            <span className="text-xs font-bold text-brand-green">
                                                ({sortLabel})
                                            </span>
                                        )}
                                    </div>
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {/* Right scroll button */}
                    {canScrollRight && (
                        <button
                            onClick={() => scroll("right")}
                            className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center w-8 bg-gradient-to-l from-white to-transparent md:hidden"
                            aria-label="Scroll filtros direita"
                        >
                            <ChevronRight className="w-4 h-4 text-brand-dark" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
