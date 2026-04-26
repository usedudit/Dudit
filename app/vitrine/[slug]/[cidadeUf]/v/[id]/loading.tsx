import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { SkeletonLoader } from "@/components/reusable"

export default function Loading() {
    return (
        <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
            <MarketplaceHeader />

            <main className="pt-[72px] lg:pt-[110px] flex-grow">
                <div className="container mx-auto px-4 max-w-[1300px] animate-fade-in mt-6">
                    <div className="pt-[40px]">
                        {/* Banner Skeleton */}
                        <div className="w-full h-[220px] lg:mb-4 lg:rounded-[24px] overflow-hidden relative">
                            <SkeletonLoader width="100%" height="100%" />
                        </div>

                        <div className="py-6 mb-2 lg:mb-4">
                            <div className="flex items-center justify-between gap-5">
                                <div className="flex items-center gap-5">
                                    {/* Profile Image Skeleton */}
                                    <SkeletonLoader width={96} height={96} circle className="shrink-0" />
                                    <div className="space-y-2">
                                        {/* Store Name Skeleton */}
                                        <SkeletonLoader width={200} height={24} />
                                        {/* City/State Skeleton */}
                                        <SkeletonLoader width={150} height={16} />
                                        {/* Rating Skeleton */}
                                        <SkeletonLoader width={100} height={16} />
                                    </div>
                                </div>
                                <div className="hidden lg:flex items-start gap-3">
                                    <SkeletonLoader width={42} height={42} circle />
                                    <SkeletonLoader width={120} height={42} className="rounded-full" />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col lg:flex-row gap-10 pb-20">
                            {/* Sidebar Skeleton */}
                            <aside className="hidden lg:block w-[280px] shrink-0 space-y-8">
                                <div className="space-y-4">
                                    <SkeletonLoader width={100} height={20} />
                                    <div className="space-y-2">
                                        <SkeletonLoader width="100%" height={36} className="rounded-[8px]" />
                                        <SkeletonLoader width="100%" height={36} className="rounded-[8px]" />
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <SkeletonLoader width={100} height={20} />
                                    <div className="space-y-2">
                                        {[...Array(5)].map((_, i) => (
                                            <SkeletonLoader key={i} width="100%" height={36} className="rounded-[8px]" />
                                        ))}
                                    </div>
                                </div>
                            </aside>

                            {/* Main Content Skeleton */}
                            <main className="flex-1">
                                <div className="flex items-center justify-between mb-4 hidden lg:flex">
                                    <SkeletonLoader width={150} height={24} />
                                    <SkeletonLoader width={120} height={16} />
                                </div>
                                <div className="hidden lg:flex items-center gap-4 mb-8">
                                    <div className="flex-1">
                                        <SkeletonLoader width="100%" height={42} className="rounded-[12px]" />
                                    </div>
                                    <SkeletonLoader width={220} height={42} className="rounded-[12px]" />
                                </div>
                                {/* Grid Skeleton */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 lg:gap-x-6 gap-y-10 lg:gap-y-12">
                                    {[...Array(8)].map((_, i) => (
                                        <div key={i} className="space-y-3">
                                            <SkeletonLoader width="100%" height={180} className="rounded-[16px]" />
                                            <SkeletonLoader width="90%" height={16} />
                                            <SkeletonLoader width={80} height={18} />
                                        </div>
                                    ))}
                                </div>
                            </main>
                        </div>
                    </div>
                </div>
            </main>

            <MarketplaceFooter />
        </div>
    )
}
