"use client"

import { SkeletonLoader } from "@/components/reusable/SkeletonLoader"

function CategoryCircleSkeleton() {
    return (
        <div className="shrink-0 flex flex-col items-center gap-2 w-[85px]">
            <SkeletonLoader width={68} height={68} circle />
            <SkeletonLoader width={50} height={12} className="rounded" />
        </div>
    )
}

function VideoCardSkeleton() {
    return (
        <div className="shrink-0 w-[170px]">
            <SkeletonLoader height={240} className="rounded-[16px] mb-3" />
            <SkeletonLoader width="80%" height={14} className="rounded mb-1" />
            <SkeletonLoader width="50%" height={12} className="rounded" />
        </div>
    )
}

function VitrineCardSkeleton() {
    return (
        <div className="shrink-0 w-full">
            <SkeletonLoader height={140} className="rounded-[16px] mb-3" />
            <div className="flex items-center gap-3">
                <SkeletonLoader width={48} height={48} circle />
                <div className="flex-1 space-y-2">
                    <SkeletonLoader width="60%" height={16} className="rounded" />
                    <SkeletonLoader width="40%" height={12} className="rounded" />
                </div>
            </div>
        </div>
    )
}

function ItemCardSkeleton() {
    return (
        <div className="flex flex-col gap-3">
            <SkeletonLoader height={170} className="rounded-[16px]" />
            <SkeletonLoader height={16} width="85%" className="rounded" />
            <SkeletonLoader height={14} width="50%" className="rounded" />
            <div className="flex justify-between items-center pt-1 border-t border-gray-50 dark:border-dark-border mt-2">
                <div className="flex items-center gap-2">
                    <SkeletonLoader width={24} height={24} circle />
                    <SkeletonLoader width={60} height={12} className="rounded" />
                </div>
                <SkeletonLoader width={40} height={14} className="rounded" />
            </div>
        </div>
    )
}

function SectionCarouselSkeleton({ count, cardWidth, children }: { count: number; cardWidth: string; children: React.ReactNode }) {
    return (
        <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
                <SkeletonLoader width={200} height={24} className="rounded" />
                <SkeletonLoader width={50} height={16} className="rounded" />
            </div>
            <div
                className="flex gap-4 overflow-x-auto pb-2 px-1"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
            >
                {Array.from({ length: count }).map((_, i) => (
                    <div key={i} className={`shrink-0 ${cardWidth}`}>
                        {children}
                    </div>
                ))}
            </div>
        </div>
    )
}

function ViewControlsSkeleton() {
    return (
        <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <SkeletonLoader width={90} height={38} className="rounded-full shrink-0 hidden lg:block" />
                <SkeletonLoader width={90} height={38} className="rounded-full shrink-0 hidden lg:block" />
            </div>
            <SkeletonLoader width={80} height={38} className="rounded-full shrink-0 hidden lg:block" />
        </div>
    )
}

function HeaderSectionSkeleton() {
    return (
        <div className="mb-6">
            <div className="flex items-start gap-3">
                <SkeletonLoader width={36} height={36} className="rounded-lg shrink-0 hidden md:block" />
                <div className="flex-1 space-y-2">
                    <SkeletonLoader width={180} height={24} className="rounded" />
                    <SkeletonLoader width={140} height={16} className="rounded" />
                </div>
                <SkeletonLoader width={34} height={34} className="rounded-full shrink-0 lg:hidden" />
            </div>
        </div>
    )
}

export const ExploreContentSkeleton = ({
    type,
    hasSection,
    hideHeader = true,
}: {
    type: string
    hasSection?: boolean
    hideHeader?: boolean
}) => {
    const isGridType = type === 'produtos' || type === 'servicos' || hasSection

    return (
        <div>
            {type === 'tudo' && !hasSection && (
                <div className="space-y-6 lg:space-y-10 mb-6 lg:mb-8">
                    {/* Categories circles */}
                    <div className="mb-6 lg:mb-8">
                        <SkeletonLoader width={120} height={24} className="rounded mb-4" />
                        <div
                            className="flex gap-4 overflow-x-auto pb-2"
                            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                        >
                            {Array.from({ length: 8 }).map((_, i) => (
                                <CategoryCircleSkeleton key={i} />
                            ))}
                        </div>
                    </div>

                    {/* Community videos carousel */}
                    <SectionCarouselSkeleton count={4} cardWidth="w-[170px]">
                        <VideoCardSkeleton />
                    </SectionCarouselSkeleton>

                    {/* Vendedores em destaque carousel */}
                    <SectionCarouselSkeleton count={4} cardWidth="w-[270px] sm:w-[320px]">
                        <VitrineCardSkeleton />
                    </SectionCarouselSkeleton>
                </div>
            )}

            {/* Header section */}
            {!hideHeader && <HeaderSectionSkeleton />}

            {/* View controls */}
            <ViewControlsSkeleton />

            {/* Product/Service grid */}
            {isGridType ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <ItemCardSkeleton key={i} />
                    ))}
                </div>
            ) : (
                <SectionCarouselSkeleton count={6} cardWidth="w-[270px] sm:w-[320px]">
                    <VitrineCardSkeleton />
                </SectionCarouselSkeleton>
            )}
        </div>
    )
}
