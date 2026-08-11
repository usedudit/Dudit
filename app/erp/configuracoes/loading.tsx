export default function SettingsLoading() {
    return (
        <div className="animate-in fade-in-0 duration-200 ease-out flex flex-col h-full bg-white dark:bg-dark-background">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">

                {/* Header skeleton */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-3 pt-1">
                        <div className="h-10 w-80 bg-gray-200 dark:bg-dark-border rounded-lg animate-pulse" />
                        <div className="h-5 w-96 bg-gray-200 dark:bg-dark-border rounded-md animate-pulse" />
                    </div>
                </div>

                {/* Tabs skeleton */}
                <div className="mb-8 px-4 md:px-8">
                    <div className="flex items-center gap-8 border-b border-brand-border dark:border-dark-border pb-[1px]">
                        <div className="h-6 w-40 bg-gray-200 dark:bg-dark-border rounded animate-pulse mb-4" />
                        <div className="h-6 w-40 bg-gray-200 dark:bg-dark-border rounded animate-pulse mb-4" />
                        <div className="h-6 w-44 bg-gray-200 dark:bg-dark-border rounded animate-pulse mb-4" />
                    </div>
                </div>

                {/* Cards Grid skeleton */}
                <div className="flex-1 overflow-hidden px-4 md:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {[...Array(8)].map((_, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-4 p-5 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface h-28"
                                style={{ animationDelay: `${i * 50}ms` }}
                            >
                                {/* Icon circle */}
                                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-dark-border/50 animate-pulse shrink-0" />

                                {/* Content */}
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-3/4 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                    <div className="h-3 w-full bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                    <div className="h-3 w-5/6 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                </div>

                                {/* Chevron */}
                                <div className="h-4 w-4 bg-gray-200 dark:bg-dark-border rounded animate-pulse ml-2" />
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    )
}
