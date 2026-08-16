import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { SkeletonLoader } from "@/components/reusable"

export default function ExplorarLoading() {
    const cards = Array.from({ length: 8 })

    return (
        <>
            <MarketplaceHeader />
            <div className="min-h-screen bg-white dark:bg-dark-background pt-[110px] lg:pt-[108px] flex flex-col">
                <main className="container mx-auto px-4 max-w-[1300px] flex-grow pb-24 lg:pb-12 mt-6">
                    {/* 1. Title Skeleton */}
                    <div className="mb-6">
                        <SkeletonLoader width={180} height={36} className="rounded-lg" />
                    </div>

                    {/* 2. Categories Slider Skeleton */}
                    <div className="flex gap-6 overflow-x-auto scrollbar-none py-4 mb-6">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="flex flex-col items-center shrink-0 w-[70px] sm:w-[90px]">
                                <SkeletonLoader width={56} height={56} circle />
                                <SkeletonLoader width={50} height={12} className="mt-2 rounded" />
                            </div>
                        ))}
                    </div>

                    {/* 3. Filters Bar Skeleton */}
                    <div className="flex gap-3 overflow-x-auto scrollbar-none py-3 mb-8">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <SkeletonLoader key={i} width={100} height={32} className="rounded-full" />
                        ))}
                    </div>

                    {/* 4. Carousels / Grid Content Skeleton */}
                    <div className="space-y-12">
                        {/* Carousel 1 (Vitrines) */}
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <SkeletonLoader width={220} height={24} className="rounded" />
                                <SkeletonLoader width={60} height={16} className="rounded" />
                            </div>
                            <div className="flex gap-4 overflow-x-auto scrollbar-none">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="shrink-0 w-[280px] sm:w-[320px]">
                                        <SkeletonLoader height={140} className="rounded-[16px] mb-3" />
                                        <div className="flex items-center gap-3">
                                            <SkeletonLoader width={48} height={48} circle />
                                            <div className="flex-1 space-y-2">
                                                <SkeletonLoader width="60%" height={16} className="rounded" />
                                                <SkeletonLoader width="40%" height={12} className="rounded" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Product Grid Skeleton */}
                        <div>
                            <div className="mb-6">
                                <SkeletonLoader width={200} height={24} className="rounded" />
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                                {cards.map((_, i) => (
                                    <div key={i} className="flex flex-col gap-3">
                                        <SkeletonLoader height={170} className="rounded-[16px]" />
                                        <SkeletonLoader height={16} width="85%" className="rounded" />
                                        <SkeletonLoader height={14} width="50%" className="rounded" />
                                        <div className="flex justify-between items-center pt-1 border-t border-gray-50 mt-2">
                                            <div className="flex items-center gap-2">
                                                <SkeletonLoader width={24} height={24} circle />
                                                <SkeletonLoader width={60} height={12} className="rounded" />
                                            </div>
                                            <SkeletonLoader width={40} height={14} className="rounded" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </main>
                <MarketplaceFooter />
            </div>
        </>
    )
}