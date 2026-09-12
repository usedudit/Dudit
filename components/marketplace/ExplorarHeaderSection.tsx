"use client"

import { Button } from "@/components/reusable"
import { GridIcon, ListIcon } from "@/lib/icons"
import { ChevronLeft } from "lucide-react"

type ViewMode = "grid" | "list"

interface ExplorarHeaderSectionProps {
    title: string
    resultsCount: number
    showBackButton?: boolean
    onBack?: () => void
    isLoading?: boolean
    viewMode?: ViewMode
    onViewModeChange?: (mode: ViewMode) => void
}

export function ExplorarHeaderSection({
    title,
    resultsCount,
    showBackButton = false,
    onBack,
    isLoading = false,
    viewMode,
    onViewModeChange,
}: ExplorarHeaderSectionProps) {
    return (
        <div className="mb-6">
            <div className="flex items-start gap-3">
                {showBackButton && (
                    <div className="flex pt-1">
                        <Button
                            variant="filled"
                            onClick={onBack}
                            className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
                        >
                            <ChevronLeft className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                        </Button>
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg lg:text-2xl font-medium text-brand-dark dark:text-dark-heading mb-1">
                        {title}
                    </h1>
                    {isLoading ? (
                        <div className="h-5 flex items-center mt-1">
                            <span className="inline-block w-28 h-3.5 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                        </div>
                    ) : (
                        <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mt-1">
                            {resultsCount} resultado{resultsCount !== 1 ? "s" : ""} encontrado{resultsCount !== 1 ? "s" : ""}
                        </p>
                    )}
                </div>

                {viewMode && onViewModeChange && (
                    <div className="flex items-center shrink-0 lg:hidden">
                        <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border rounded-full p-0.5 h-[34px] scale-80 origin-right">
                            <button
                                onClick={() => onViewModeChange("list")}
                                className={`w-7 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list"
                                    ? "bg-gray-100 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading"
                                    : "text-gray-400 dark:text-dark-body/70 hover:text-gray-600"
                                    }`}
                                title="Vista em lista"
                            >
                                <ListIcon className="w-[15px] h-[15px]" />
                            </button>
                            <button
                                onClick={() => onViewModeChange("grid")}
                                className={`w-7 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid"
                                    ? "bg-gray-100 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading"
                                    : "text-gray-400 dark:text-dark-body/70 hover:text-gray-600"
                                    }`}
                                title="Vista em grade"
                            >
                                <GridIcon className="w-[15px] h-[15px]" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
