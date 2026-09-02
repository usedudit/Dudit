const PulseBlock = ({ className }: { className?: string }) => (
    <div className={`animate-pulse rounded-[24px] border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20 ${className}`} />
)

export function ReportsSkeleton() {
    return (
        <div className="flex flex-col gap-6">
            {/* Row 1: KPI horizontal cards */}
            <PulseBlock className="h-[120px] w-full" />

            {/* Row 2: Large chart (8) + Donut (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8">
                    <PulseBlock className="h-[320px] w-full" />
                </div>
                <div className="lg:col-span-4">
                    <PulseBlock className="h-[320px] w-full" />
                </div>
            </div>

            {/* Row 3: Large chart (8) + Ranking (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8">
                    <PulseBlock className="h-[300px] w-full" />
                </div>
                <div className="lg:col-span-4">
                    <PulseBlock className="h-[300px] w-full" />
                </div>
            </div>

            {/* Row 4: 3 equal cards */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4">
                    <PulseBlock className="h-[240px] w-full" />
                </div>
                <div className="lg:col-span-4">
                    <PulseBlock className="h-[240px] w-full" />
                </div>
                <div className="lg:col-span-4">
                    <PulseBlock className="h-[240px] w-full" />
                </div>
            </div>
        </div>
    )
}
