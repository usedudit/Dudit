import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { SkeletonLoader } from "@/components/reusable"

function BuyPanelSkeleton() {
    return (
        <div className="bg-white dark:bg-dark-surface">
            {/* Condition + rating row */}
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <SkeletonLoader width={56} height={20} className="rounded" />
                    <SkeletonLoader width={96} height={16} />
                </div>
                <SkeletonLoader width={100} height={14} />
            </div>

            {/* Product name */}
            <SkeletonLoader width="100%" height={28} className="mb-2" />
            <SkeletonLoader width="80%" height={28} className="mb-6" />

            {/* Price block */}
            <div className="flex flex-wrap items-center gap-3 mb-1">
                <SkeletonLoader width={144} height={36} />
                <SkeletonLoader width={80} height={24} />
                <SkeletonLoader width={96} height={24} />
            </div>
            <SkeletonLoader width={224} height={16} className="mb-6" />

            {/* Variant group 1 – image swatches */}
            <SkeletonLoader width={128} height={16} className="mb-3" />
            <div className="flex flex-wrap gap-3 mb-6">
                {[...Array(4)].map((_, i) => (
                    <SkeletonLoader key={i} width={56} height={56} className="rounded-[8px]" />
                ))}
            </div>

            {/* Variant group 2 – text buttons */}
            <SkeletonLoader width={112} height={16} className="mb-3" />
            <div className="flex flex-wrap gap-3 mb-6">
                {[...Array(5)].map((_, i) => (
                    <SkeletonLoader key={i} width={64} height={40} className="rounded-[10px]" />
                ))}
            </div>

            {/* Quantity dropdown */}
            <div className="flex items-center gap-2 mb-2">
                <SkeletonLoader width={80} height={16} />
                <SkeletonLoader width={96} height={14} />
            </div>
            <SkeletonLoader width="100%" height={48} className="rounded-[10px] mb-8" />

            {/* Buy + Cart buttons – desktop only */}
            <div className="hidden lg:block">
                <SkeletonLoader width="100%" height={46} className="rounded-[10px] mb-4" />
                <SkeletonLoader width="100%" height={46} className="rounded-[10px] mb-8" />
            </div>

            {/* Shipping */}
            <SkeletonLoader width={128} height={16} className="mb-2" />
            <div className="border border-gray-100 dark:border-dark-border rounded-[10px] overflow-hidden mb-4">
                <div className="flex justify-between items-start py-3 px-4 border-b border-gray-100 dark:border-dark-border">
                    <div>
                        <SkeletonLoader width={112} height={14} className="mb-1.5" />
                        <SkeletonLoader width={160} height={12} />
                    </div>
                    <SkeletonLoader width={40} height={16} />
                </div>
                <div className="flex justify-between items-start py-3 px-4">
                    <div>
                        <SkeletonLoader width={128} height={14} className="mb-1.5" />
                        <SkeletonLoader width={176} height={12} />
                    </div>
                    <SkeletonLoader width={64} height={16} />
                </div>
            </div>

            {/* Legal rows */}
            <div className="border-t border-gray-100 dark:border-dark-border mb-6">
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-5 border-b border-gray-100 dark:border-dark-border">
                        <div className="flex-1 pr-4">
                            <SkeletonLoader width={192} height={14} className="mb-1.5" />
                            <SkeletonLoader width="100%" height={12} />
                        </div>
                        <SkeletonLoader width={20} height={20} />
                    </div>
                ))}
            </div>

            {/* Store card */}
            <div className="bg-gray-50 dark:bg-dark-border/30 rounded-[12px] p-5 border border-gray-100 dark:border-dark-border">
                <div className="flex items-center gap-3 mb-4">
                    <SkeletonLoader width={48} height={48} circle />
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <SkeletonLoader width={112} height={16} />
                            <SkeletonLoader width={36} height={20} className="rounded" />
                        </div>
                        <SkeletonLoader width={80} height={12} />
                    </div>
                </div>
                <div className="flex items-center gap-4 px-1">
                    <SkeletonLoader width={112} height={12} />
                    <SkeletonLoader width={112} height={12} />
                </div>
            </div>
        </div>
    )
}

export default function ProductDetailsLoading() {
    return (
        <div className="min-h-screen bg-white dark:bg-dark-background lg:pt-[50px] font-sans flex flex-col">
            <MarketplaceHeader />

            <div className="container mx-auto px-4 max-w-[1300px] lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">

                {/* Breadcrumb – desktop */}
                <div className="hidden lg:flex items-center gap-2 mb-8">
                    <SkeletonLoader width={40} height={14} />
                    <SkeletonLoader width={8} height={8} circle />
                    <SkeletonLoader width={64} height={14} />
                    <SkeletonLoader width={8} height={8} circle />
                    <SkeletonLoader width={192} height={14} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* ── Left column ── */}
                    <div className="lg:col-span-8">

                        {/* Gallery */}
                        <div className="flex gap-3 mb-6">

                            {/* Desktop thumbnails */}
                            <div className="hidden lg:flex flex-col gap-2 w-[70px] shrink-0">
                                {[...Array(4)].map((_, i) => (
                                    <SkeletonLoader key={i} width={70} height={70} className="rounded-[8px]" />
                                ))}
                            </div>

                            {/* Main image */}
                            <div className="flex-1 min-w-0">
                                {/* Desktop */}
                                <div className="hidden lg:block" style={{ paddingBottom: "100%", position: "relative" }}>
                                    <div className="absolute inset-0">
                                        <SkeletonLoader width="100%" height="100%" className="rounded-[16px]" />
                                    </div>
                                </div>
                                {/* Mobile */}
                                <div className="lg:hidden" style={{ aspectRatio: "1/1" }}>
                                    <SkeletonLoader width="100%" height="100%" className="rounded-[12px]" />
                                </div>
                            </div>
                        </div>

                        {/* Buy panel – mobile */}
                        <div className="lg:hidden mb-6">
                            <BuyPanelSkeleton />
                        </div>

                        {/* Description */}
                        <div className="mb-10">
                            <SkeletonLoader width={144} height={28} className="mb-4" />
                            <SkeletonLoader width="100%" height={16} className="mb-2" />
                            <SkeletonLoader width="100%" height={16} className="mb-2" />
                            <SkeletonLoader width="100%" height={16} className="mb-2" />
                            <SkeletonLoader width="83%" height={16} className="mb-2" />
                            <SkeletonLoader width="66%" height={16} className="mb-3" />
                            <SkeletonLoader width={112} height={16} />
                        </div>

                        {/* Technical specs */}
                        <div className="mb-10">
                            <SkeletonLoader width={128} height={28} className="mb-4" />
                            <div className="border border-gray-100 dark:border-dark-border rounded-[12px] overflow-hidden">
                                {[...Array(5)].map((_, i) => (
                                    <div
                                        key={i}
                                        className={`flex justify-between items-center px-4 py-3 ${i % 2 === 0 ? "bg-gray-50 dark:bg-dark-border/30" : "bg-white dark:bg-dark-surface"} ${i < 4 ? "border-b border-gray-100 dark:border-dark-border" : ""}`}
                                    >
                                        <SkeletonLoader width={112} height={14} />
                                        <SkeletonLoader width={80} height={14} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Reviews */}
                        <div className="border-t border-gray-100 dark:border-dark-border pt-2">
                            <SkeletonLoader width={192} height={28} className="mb-6 mt-8" />

                            {/* Rating summary */}
                            <div className="border border-gray-100 dark:border-dark-border rounded-[12px] p-5 mb-8 flex gap-8 items-center">
                                <div className="text-center shrink-0">
                                    <SkeletonLoader width={64} height={56} className="rounded mb-2 mx-auto" />
                                    <div className="flex justify-center gap-0.5 mb-1.5">
                                        {[...Array(5)].map((_, i) => <SkeletonLoader key={i} width={12} height={12} circle />)}
                                    </div>
                                    <SkeletonLoader width={96} height={12} />
                                </div>
                                <div className="flex-1 space-y-2">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <SkeletonLoader width={12} height={12} circle />
                                            <SkeletonLoader width={8} height={8} circle />
                                            <div className="flex-1 h-2 bg-gray-100 dark:bg-dark-border/50 rounded-full overflow-hidden">
                                                <SkeletonLoader width={`${[70, 20, 5, 3, 2][i]}%`} height={8} className="rounded-full" />
                                            </div>
                                            <SkeletonLoader width={16} height={12} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Individual reviews */}
                            <div className="space-y-6">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="border-b border-gray-100 dark:border-dark-border pb-6 last:border-0">
                                        <div className="flex items-start gap-3 mb-3">
                                            <SkeletonLoader width={36} height={36} circle />
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-1">
                                                    <SkeletonLoader width={112} height={14} />
                                                    <SkeletonLoader width={80} height={12} />
                                                </div>
                                                <div className="flex gap-0.5 mt-1">
                                                    {[...Array(5)].map((_, j) => <SkeletonLoader key={j} width={10} height={10} circle />)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="ml-12 space-y-1.5">
                                            <SkeletonLoader width="100%" height={14} />
                                            <SkeletonLoader width="80%" height={14} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Right column – desktop buy panel ── */}
                    <div className="hidden lg:block lg:col-span-4">
                        <BuyPanelSkeleton />
                    </div>
                </div>
            </div>

            {/* Mobile bottom bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-surface border-t border-gray-100 dark:border-dark-border p-4 z-50 flex gap-3 lg:hidden shadow-lg">
                <SkeletonLoader width={48} height={48} circle />
                <div className="flex-1">
                    <SkeletonLoader width="100%" height={48} className="rounded-full" />
                </div>
            </div>

            <MarketplaceFooter />
        </div>
    )
}