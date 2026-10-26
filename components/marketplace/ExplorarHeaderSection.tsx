"use client"

import { Button, Badge } from "@/components/reusable"
import { ChevronLeft, MapPin } from "lucide-react"

interface ExplorarHeaderSectionProps {
    title: string
    resultsCount: number
    showBackButton?: boolean
    onBack?: () => void
    isLoading?: boolean
    citySlug?: string | null
    formatCitySlug?: (slug: string | null) => string
}

export function ExplorarHeaderSection({
    title,
    resultsCount,
    showBackButton = false,
    onBack,
    isLoading = false,
    citySlug,
    formatCitySlug,
}: ExplorarHeaderSectionProps) {
    const cityLabel = citySlug && formatCitySlug ? formatCitySlug(citySlug) : null

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

                {/* Badge de localização - aparece quando tem cidade definida */}
                {cityLabel && (
                    <Badge variant="gray" className="shrink-0">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{cityLabel}</span>
                    </Badge>
                )}

                <div className="flex-1 min-w-0">
                    <h1 className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-1 truncate">
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
            </div>
        </div>
    )
}
