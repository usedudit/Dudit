"use client"

import { Button, Badge } from "@/components/reusable"
import { GridIcon, ListIcon } from "@/lib/icons"
import { X } from "lucide-react"
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
    sidebarCollapsed: boolean
    onToggleFilters: () => void
    activeFilterChips?: ActiveFilterChip[]
}

export function ExplorarViewControls({
    viewMode,
    onViewModeChange,
    sidebarCollapsed,
    onToggleFilters,
    activeFilterChips = [],
}: ExplorarViewControlsProps) {
    return (
        <div className="flex items-center justify-end mb-6">
            <div className="flex items-center gap-3">
                {/* Filter toggle button */}
                <Button
                    variant="filled"
                    size="sm"
                    onClick={onToggleFilters}
                    className="h-[42px]"
                >
                    {sidebarCollapsed ? "Filtros" : "Ocultar filtros"}
                </Button>

                {/* Active filter badges */}
                <AnimatePresence>
                    {activeFilterChips.map((chip) => (
                        <motion.div
                            key={chip.key}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.15 }}
                        >
                            <Badge variant="gray" className="flex items-center gap-1 pr-1 py-1">
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

                <div className="h-[42px] w-px bg-gray-100" />

                {/* View toggle - ERP Style */}
                <div className="flex items-center bg-white border border-brand-border rounded-full p-1 h-[42px] shrink-0">
                    <button
                        onClick={() => onViewModeChange("list")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list"
                            ? "bg-gray-100 text-brand-dark"
                            : "text-gray-400 hover:text-gray-600"
                            }`}
                        title="Vista em lista"
                    >
                        <ListIcon className="w-[18px] h-[18px]" />
                    </button>
                    <button
                        onClick={() => onViewModeChange("grid")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid"
                            ? "bg-gray-100 text-brand-dark"
                            : "text-gray-400 hover:text-gray-600"
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
