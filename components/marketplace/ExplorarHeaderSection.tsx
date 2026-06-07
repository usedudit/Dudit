"use client"

interface ExplorarHeaderSectionProps {
    title: string
    resultsCount: number
}

export function ExplorarHeaderSection({
    title,
    resultsCount,
}: ExplorarHeaderSectionProps) {
    return (
        <div className="mb-6">
            <div className="flex items-start gap-3">
                <div className="flex-1">
                    <h1 className="text-2xl lg:text-3xl font-bold text-brand-dark">
                        {title}
                    </h1>
                    <p className="text-sm font-medium text-brand-inactive-text mt-1">
                        {resultsCount} resultado{resultsCount !== 1 ? "s" : ""} encontrado{resultsCount !== 1 ? "s" : ""}
                    </p>
                </div>
            </div>
        </div>
    )
}
