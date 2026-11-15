"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/reusable"
import { SlidersHorizontal, ListOrdered } from "lucide-react"
import { Badge } from "@/components/reusable/Badge"

interface ExplorarMobileControlsProps {
    activeFiltersCount: number
    onOpenFilters: () => void
    onOpenSort: () => void
    isVisible?: boolean
    /** Classe de posicionamento vertical (padrão: top-[52px]). */
    topClassName?: string
}

export function ExplorarMobileControls({
    activeFiltersCount,
    onOpenFilters,
    onOpenSort,
    isVisible: explicitIsVisible,
    topClassName = "top-[52px]",
}: ExplorarMobileControlsProps) {
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        if (explicitIsVisible !== undefined) return
        let ticking = false
        const onScroll = () => {
            if (ticking) return
            window.requestAnimationFrame(() => {
                setScrolled(window.scrollY > 10)
                ticking = false
            })
            ticking = true
        }
        onScroll()
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [explicitIsVisible])

    const isVisible = explicitIsVisible !== undefined ? explicitIsVisible : scrolled

    return (
        <div
            className={`lg:hidden fixed ${topClassName} left-0 right-0 h-[46px] z-40 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border shadow-sm flex items-center px-4 gap-2 transition-all duration-200 ${
                isVisible
                    ? "opacity-100 translate-y-0 pointer-events-auto"
                    : "opacity-0 -translate-y-2 pointer-events-none"
            }`}
        >
            {/* Filtros Button */}
            <Button
                variant="outline"
                onClick={onOpenFilters}
                className="h-9 flex-1 flex items-center justify-center gap-2 relative"
            >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="text-xs font-medium">Filtros</span>
                {activeFiltersCount > 0 && (
                    <Badge variant="green" className="absolute top-0 right-0 transform translate-x-1 -translate-y-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]">
                        {activeFiltersCount}
                    </Badge>
                )}
            </Button>

            {/* Ordenar Button */}
            <Button
                variant="outline"
                onClick={onOpenSort}
                className="h-9 flex-1 flex items-center justify-center gap-2"
            >
                <ListOrdered className="w-4 h-4" />
                <span className="text-xs font-medium">Ordenar</span>
            </Button>
        </div>
    )
}
