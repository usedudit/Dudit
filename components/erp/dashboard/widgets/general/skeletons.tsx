export function MetricsSkeleton() {
    return (
        <div className="h-[140px] animate-pulse rounded-2xl border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20" />
    )
}

export function ChartSkeleton({ className }: { className?: string }) {
    return (
        <div className={`h-[340px] animate-pulse rounded-2xl border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20 ${className || ""}`} />
    )
}

export function AlertsSkeleton() {
    return (
        <div className="h-[120px] animate-pulse rounded-2xl border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20" />
    )
}

export function ListSkeleton() {
    return (
        <div className="h-[300px] animate-pulse rounded-2xl border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20" />
    )
}
