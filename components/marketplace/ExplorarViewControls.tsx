"use client"

import { Button, Badge } from "@/components/reusable"
import { GridIcon, ListIcon, FilterIcon } from "@/lib/icons"
import { X, ListOrdered } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type ViewMode = "grid" | "list"

interface ActiveFilterChip {
    key: string
    label: string
    value: string
    onRemove: () => void
}

interface ExplorarViewControlsProps {
    viewMode: ViewMode
    onViewModeChange: (mode: ViewMode) => void
    onOpenFilters: () => void
    onOpenSort: () => void
    hasActiveFilters: boolean
    activeFilterChips?: ActiveFilterChip[]
}

export function ExplorarViewControls({
    viewMode,
    onViewModeChange,
    onOpenFilters,
    onOpenSort,
    hasActiveFilters,
    activeFilterChips = [],
}: ExplorarViewControlsProps) {
    return (
        <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Filter toggle button */}
                <Button
                    variant="outline"
                    onClick={onOpenFilters}
                    leftIcon={<FilterIcon size={18} />}
                    className="shrink-0 hidden lg:inline-flex"
                >
                    Filtros
                </Button>

                {/* Sort button */}
                <Button
                    variant="outline"
                    onClick={onOpenSort}
                    leftIcon={<ListOrdered className="w-4 h-4" />}
                    className="shrink-0 hidden lg:inline-flex"
                >
                    Ordenar
                </Button>

                {hasActiveFilters && (
                    <div className="h-8 w-px bg-gray-100 dark:bg-dark-border/50 shrink-0" />
                )}

                {/* Active filter badges (horizontal scroll) */}
                <div className="flex-1 min-w-0 relative h-[42px] flex items-center">
                    <div className="overflow-x-auto hide-scrollbar flex items-center gap-2 w-full">
                        <AnimatePresence>
                            {activeFilterChips.map((chip) => (
                                <motion.div
                                    key={chip.key}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ duration: 0.15 }}
                                    className="shrink-0"
                                >
                                    <Badge variant="gray" icon={null} className="flex items-center gap-1 pr-1 py-1">
                                        <span className="opacity-70 font-normal whitespace-nowrap">{chip.label}:</span>
                                        <span className="font-bold truncate max-w-[120px]">{chip.value}</span>
                                        <button
                                            onClick={chip.onRemove}
                                            className="hover:bg-black/10 dark:hover:bg-white/20 rounded-full p-0.5 ml-0.5 transition-colors shrink-0"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            <div className="hidden lg:flex items-center shrink-0">
                {/* View toggle - ERP Style */}
                <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border rounded-full p-1 h-[42px] shrink-0">
                    <button
                        onClick={() => onViewModeChange("list")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list"
                            ? "bg-gray-100 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading"
                            : "text-gray-400 dark:text-dark-body/70 hover:text-gray-600"
                            }`}
                        title="Vista em lista"
                    >
                        <ListIcon className="w-[18px] h-[18px]" />
                    </button>
                    <button
                        onClick={() => onViewModeChange("grid")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid"
                            ? "bg-gray-100 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading"
                            : "text-gray-400 dark:text-dark-body/70 hover:text-gray-600"
                            }`}
                        title="Vista em grade"
                    >
                        <GridIcon className="w-[18px] h-[18px]" />
                    </button>
                </div>
            </div>
        </div>
    )
}
