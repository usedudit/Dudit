const PulseBlock = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse rounded-[24px] border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20 ${className}`} />
)

export default function RecurringSubscriptionsLoading() {
    return (
        <div className="p-4">
            <div className="w-full space-y-6 pt-4 px-4 md:px-8">
                <div className="space-y-2">
                    <div className="h-8 w-72 animate-pulse rounded-lg bg-brand-gray/40 dark:bg-dark-border/20" />
                    <div className="h-4 w-96 animate-pulse rounded-lg bg-brand-gray/40 dark:bg-dark-border/20" />
                </div>
                <PulseBlock className="h-[120px] w-full" />
                <PulseBlock className="h-[480px] w-full" />
            </div>
        </div>
    )
}
