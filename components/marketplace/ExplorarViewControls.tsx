"use client"

import { GridIcon, ListIcon } from "@/lib/icons"

type ViewMode = "grid" | "list"

interface ExplorarViewControlsProps {
    viewMode: ViewMode
    onViewModeChange: (mode: ViewMode) => void
    resultsCount: number
}

export function ExplorarViewControls({
    viewMode,
    onViewModeChange,
    resultsCount,
}: ExplorarViewControlsProps) {
    return (
        <div className="flex items-center justify-between mb-6">
            {/* Results count */}
            <div className="text-sm text-brand-inactive-text">
                {resultsCount > 0 && <span>{resultsCount} resultado{resultsCount !== 1 ? 's' : ''}</span>}
            </div>

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
    )
}
