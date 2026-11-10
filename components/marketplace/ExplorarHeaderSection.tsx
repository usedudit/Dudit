"use client"

import { Button } from "@/components/reusable"
import { ChevronLeft } from "lucide-react"

interface ExplorarHeaderSectionProps {
    title: string
    resultsCount: number
    showBackButton?: boolean
    onBack?: () => void
    isLoading?: boolean
}

export function ExplorarHeaderSection({
    title,
    resultsCount,
    showBackButton = false,
    onBack,
    isLoading = false,
}: ExplorarHeaderSectionProps) {
    return (
        <div className="hidden lg:block mb-6">
            <div className="flex items-start gap-3">
                {showBackButton && (
                    <div className="hidden lg:flex pt-1">
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
                    {/* Título e contador: desktop apenas.
                        Em tablet/mobile a cidade e filtros são exibidos na barra
                        e badges de filtro, então essa seção é ocultada. */}
                    <h1 className="text-xl font-medium text-brand-dark dark:text-dark-heading mb-1 truncate">
                        {title}
                    </h1>
                    {isLoading ? (
                        <div className="flex items-center mt-1">
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
