"use client"

import { Grid3X3, List } from "lucide-react"

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
        <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <p className="text-sm font-semibold text-brand-inactive-text">
                    {resultsCount} resultado{resultsCount !== 1 ? "s" : ""}
                </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                    type="button"
                    onClick={() => onViewModeChange("grid")}
                    aria-label="Ver em grid"
                    className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${viewMode === "grid"
                            ? "border-brand-green bg-[#ecfdf5] text-brand-green"
                            : "border-gray-200 text-brand-dark hover:bg-gray-50"
                        }`}
                >
                    <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    onClick={() => onViewModeChange("list")}
                    aria-label="Ver em lista"
                    className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${viewMode === "list"
                            ? "border-brand-green bg-[#ecfdf5] text-brand-green"
                            : "border-gray-200 text-brand-dark hover:bg-gray-50"
                        }`}
                >
                    <List className="h-4 w-4" />
                </button>
            </div>
        </div>
    )
}
