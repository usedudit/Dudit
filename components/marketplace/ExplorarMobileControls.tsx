"use client"

import { Button } from "@/components/reusable"
import { SlidersHorizontal, ListOrdered } from "lucide-react"
import { Badge } from "@/components/reusable/Badge"

interface ExplorarMobileControlsProps {
    activeFiltersCount: number
    onOpenFilters: () => void
    onOpenSort: () => void
}

export function ExplorarMobileControls({
    activeFiltersCount,
    onOpenFilters,
    onOpenSort,
}: ExplorarMobileControlsProps) {
    return (
        <div className="lg:hidden fixed top-[52px] left-0 right-0 h-[46px] z-40 bg-white border-b border-gray-100 shadow-sm flex items-center px-4 gap-2">
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
