"use client"

import { Button } from "@/components/reusable"
import { ChevronLeft } from "lucide-react"

interface ExplorarHeaderSectionProps {
    title: string
    resultsCount: number
    showBackButton?: boolean
    onBack?: () => void
}

export function ExplorarHeaderSection({
    title,
    resultsCount,
    showBackButton = false,
    onBack,
}: ExplorarHeaderSectionProps) {
    return (
        <div className="mb-6">
            <div className="flex items-start gap-3">
                {showBackButton && (
                    <div className="hidden md:flex pt-1">
                        <Button
                            variant="filled"
                            onClick={onBack}
                            className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
                        >
                            <ChevronLeft className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                        </Button>
                    </div>
                )}
                <div className="flex-1">
                    <h1 className="text-lg lg:text-2xl font-medium text-brand-dark dark:text-dark-heading mb-1">
                        {title}
                    </h1>
                    <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mt-1">
                        {resultsCount} resultado{resultsCount !== 1 ? "s" : ""} encontrado{resultsCount !== 1 ? "s" : ""}
                    </p>
                </div>
            </div>
        </div>
    )
}
