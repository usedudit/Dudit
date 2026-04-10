export default function FinancialCategoriesLoading() {
    return (
        <div className="animate-in fade-in-0 duration-200 ease-out flex flex-col h-full bg-white dark:bg-dark-background">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <div className="h-8 w-56 bg-gray-200 dark:bg-dark-border rounded-md animate-pulse" />
                        <div className="h-5 w-96 max-w-full bg-gray-200 dark:bg-dark-border rounded-md animate-pulse" />
                    </div>
                    <div className="h-10 w-[140px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                </div>

                <div className="mb-6 px-4 md:px-8">
                    <div className="flex items-center gap-6 border-b border-gray-200 dark:border-dark-border pb-[1px]">
                        <div className="h-6 w-24 bg-gray-200 dark:bg-dark-border rounded animate-pulse mb-3" />
                        <div className="h-6 w-28 bg-gray-200 dark:bg-dark-border rounded animate-pulse mb-3" />
                    </div>
                </div>

                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 flex-none px-4 md:px-8">
                    <div className="md:hidden flex items-center gap-2 w-full">
                        <div className="flex-1 h-[42px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                        <div className="h-[42px] w-[42px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                    </div>
                    <div className="hidden md:flex items-center w-full gap-4">
                        <div className="h-[42px] w-80 bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                        <div className="flex-1 min-w-0" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {[...Array(8)].map((_, i) => (
                            <div
                                key={i}
                                className="rounded-2xl border border-gray-200 dark:border-dark-border p-4 h-[160px] flex flex-col gap-3 animate-pulse"
                            >
                                <div className="flex gap-4">
                                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-dark-border shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 w-3/4 bg-gray-200 dark:bg-dark-border rounded" />
                                        <div className="h-3 w-1/2 bg-gray-200 dark:bg-dark-border rounded" />
                                    </div>
                                </div>
                                <div className="mt-auto pt-4 border-t border-gray-200 dark:border-dark-border flex justify-between">
                                    <div className="h-3 w-20 bg-gray-200 dark:bg-dark-border rounded" />
                                    <div className="h-8 w-8 bg-gray-200 dark:bg-dark-border rounded-full" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
