import React from 'react'

export default function AppointmentsLoading() {
  return (
    <div className="flex flex-col bg-white dark:bg-dark-surface transition-colors duration-300 min-h-full animate-in fade-in-0 duration-200">
      <div className="max-w-[1700px] mx-auto w-full p-4 md:p-8 pt-6">
        
        {/* Page Header Skeleton (Desktop) */}
        <div className="hidden md:flex flex-col md:flex-row items-start justify-between gap-4 mb-8">
            <div className="flex flex-col gap-2 pt-1">
                <div className="h-9 w-64 bg-gray-200 dark:bg-dark-border rounded-lg animate-pulse" />
                <div className="h-5 w-80 bg-gray-100 dark:bg-dark-border/50 rounded-md animate-pulse" />
            </div>
            
            <div className="h-[42px] w-[200px] bg-gray-200 dark:bg-dark-border rounded-xl animate-pulse" />
        </div>
        
        {/* Header Controls Skeleton (Desktop) */}
        <div className="hidden md:block">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3 w-full lg:w-auto pb-2 lg:pb-0">
                  <div className="h-[40px] w-20 bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                  
                  <div className="h-[40px] w-64 bg-gray-100 dark:bg-dark-border/50 rounded-full animate-pulse" />

                  <div className="h-[40px] w-40 bg-gray-100 dark:bg-dark-border/50 rounded-full animate-pulse" />
              </div>

              <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
                  <div className="h-[40px] w-24 bg-gray-100 dark:bg-dark-border/50 rounded-full animate-pulse" />
                  <div className="h-[40px] w-[40px] bg-gray-100 dark:bg-dark-border/50 rounded-full animate-pulse" />
                  <div className="h-[40px] w-24 bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
              </div>
          </div>
        </div>

        {/* Mobile View Skeleton */}
        <div className="block md:hidden h-full space-y-4">
             <div className="h-10 w-full bg-gray-200 dark:bg-dark-border rounded-lg animate-pulse" />
             <div className="h-64 w-full bg-gray-100 dark:bg-dark-border/50 rounded-2xl animate-pulse" />
             <div className="space-y-3">
                 {[...Array(4)].map((_, i) => (
                     <div key={i} className="h-20 w-full bg-gray-50 dark:bg-dark-border/30 rounded-xl animate-pulse" />
                 ))}
             </div>
        </div>

        {/* Desktop Container Skeleton */}
        <div className="hidden md:block bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden shadow-sm h-[700px]">
            <div className="flex flex-col h-full">
                {/* Timeline Header */}
                <div className="flex h-14 border-b border-brand-border dark:border-dark-border">
                    <div className="w-20 border-r border-brand-border dark:border-dark-border flex-shrink-0" />
                    <div className="flex-1 flex">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="flex-1 border-r border-brand-border dark:border-dark-border flex items-center justify-center p-2">
                                <div className="flex items-center gap-2">
                                    <div className="h-8 w-8 bg-gray-100 dark:bg-dark-border rounded-full animate-pulse" />
                                    <div className="h-4 w-24 bg-gray-100 dark:bg-dark-border rounded animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Timeline Grid */}
                <div className="flex-1 flex overflow-hidden">
                    <div className="w-20 border-r border-brand-border dark:border-dark-border flex-shrink-0 bg-gray-50/50 dark:bg-zinc-900/20">
                        {[...Array(11)].map((_, i) => (
                            <div key={i} className="h-[80px] border-b border-brand-border/50 dark:border-dark-border/30 p-2 text-right">
                                <div className="h-3 w-10 bg-gray-200/50 dark:bg-dark-border/20 rounded animate-pulse ml-auto" />
                            </div>
                        ))}
                    </div>
                    <div className="flex-1 relative">
                        <div className="absolute inset-0 grid grid-cols-4">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="border-r border-brand-border dark:border-dark-border flex flex-col h-full">
                                    {[...Array(11)].map((_, j) => (
                                        <div key={j} className="h-[80px] border-b border-brand-border/50 dark:border-dark-border/30 relative">
                                            {/* Random appointments skeletons */}
                                            {i === j % 4 && (
                                                <div className="absolute inset-x-2 top-2 h-[140px] bg-brand-green/10 dark:bg-brand-green/5 border border-brand-green/20 rounded-xl animate-pulse z-10" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  )
}
