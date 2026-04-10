export default function ERPPageLoading() {
    return (
        <div className="animate-in fade-in-0 duration-200 ease-out flex flex-col h-full bg-white dark:bg-dark-background">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">

                {/* Header skeleton */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-40 bg-gray-200 dark:bg-dark-border rounded-md animate-pulse" />
                        </div>
                        <div className="h-5 w-64 bg-gray-200 dark:bg-dark-border rounded-md animate-pulse" />
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="h-10 w-[96px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                        <div className="h-10 w-[140px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                    </div>
                </div>

                {/* Tabs skeleton */}
                <div className="mb-6 px-4 md:px-8">
                    <div className="flex items-center gap-6 border-b border-gray-200 dark:border-dark-border pb-px">
                        <div className="h-6 w-16 bg-gray-200 dark:bg-dark-border rounded animate-pulse mb-3" />
                        <div className="h-6 w-20 bg-gray-200 dark:bg-dark-border rounded animate-pulse mb-3" />
                        <div className="h-6 w-16 bg-gray-200 dark:bg-dark-border rounded animate-pulse mb-3" />
                        <div className="h-6 w-24 bg-gray-200 dark:bg-dark-border rounded animate-pulse mb-3" />
                    </div>
                </div>

                {/* Controls Bar skeleton */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                    {/* Mobile controls */}
                    <div className="md:hidden flex flex-row items-center gap-2 w-full">
                        <div className="flex-1 h-[42px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                        <div className="h-[42px] w-[42px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                        <div className="h-[42px] w-[42px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                        <div className="h-[42px] w-[42px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                    </div>

                    {/* Desktop controls */}
                    <div className="hidden md:flex items-center w-full gap-4">
                        <div className="flex items-center gap-3 shrink-0">
                            <div className="h-[42px] w-80 bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                            <div className="h-[42px] w-[90px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                        </div>

                        <div className="flex-1" />

                        <div className="h-[42px] w-[74px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse shrink-0" />
                    </div>
                </div>

                {/* Table/List skeleton */}
                <div className="flex-1 overflow-hidden px-4 md:px-8">
                    <div className="space-y-3">
                        {/* Desktop Table Skeleton */}
                        <div className="hidden md:block">
                            <div className="space-y-2 p-4">
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="flex items-center gap-6 py-3" style={{ animationDelay: `${i * 50}ms` }}>
                                        <div className="h-4 w-4 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                        <div className="h-10 w-10 bg-gray-200 dark:bg-dark-border rounded-lg animate-pulse" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-4 w-1/4 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                            <div className="h-3 w-32 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                        </div>
                                        <div className="h-4 w-24 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                        <div className="h-4 w-20 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                        <div className="h-4 w-32 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                        <div className="h-4 w-[60px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Mobile/Tablet List Skeleton */}
                        <div className="md:hidden block">
                            <div className="flex flex-col">
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 flex items-start gap-4">
                                        {/* Imagem */}
                                        <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-dark-border animate-pulse shrink-0" />

                                        {/* Detalhes */}
                                        <div className="flex-1 space-y-2.5">
                                            <div className="flex justify-between items-start">
                                                <div className="h-5 w-3/4 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                                <div className="h-2.5 w-2.5 rounded-full bg-gray-200 dark:bg-dark-border animate-pulse" />
                                            </div>
                                            <div className="h-4 w-1/2 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className="h-5 w-20 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                                <div className="h-4 w-2 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                                <div className="h-5 w-12 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                                                <div className="h-5 w-16 bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}
