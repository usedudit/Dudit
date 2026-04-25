import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { SkeletonLoader } from "@/components/reusable"

export default function ExplorarLoading() {
    const cards = Array.from({ length: 8 })

    return (
        <>
            <MarketplaceHeader />
            <div className="min-h-screen bg-white pt-[40px] lg:pt-[110px] flex flex-col">
                <div className="container mx-auto max-w-[1300px] flex gap-8 items-start flex-grow pb-24 lg:pb-12 mt-6 lg:mt-8">
                    <aside className="hidden lg:block w-[280px] shrink-0 pt-4">
                        <SkeletonLoader width={160} height={18} className="mb-6" />
                        <div className="space-y-3 mb-8">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="flex items-center gap-2">
                                    <SkeletonLoader width={18} height={18} circle />
                                    <SkeletonLoader width={120} height={14} />
                                </div>
                            ))}
                        </div>
                        <div className="mb-8">
                            <SkeletonLoader width={120} height={18} className="mb-4" />
                            <div className="flex flex-wrap gap-2">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <SkeletonLoader key={i} width={70} height={28} className="rounded-full" />
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between mb-8">
                            <SkeletonLoader width={130} height={16} />
                            <SkeletonLoader width={40} height={22} className="rounded-full" />
                        </div>
                        <div className="mb-8">
                            <SkeletonLoader width={120} height={18} className="mb-4" />
                            <div className="flex gap-3">
                                <SkeletonLoader width="100%" height={40} className="rounded-[8px]" />
                                <SkeletonLoader width="100%" height={40} className="rounded-[8px]" />
                            </div>
                        </div>
                        <div>
                            <SkeletonLoader width={150} height={18} className="mb-4" />
                            <div className="flex flex-wrap gap-2">
                                {[1, 2, 3, 4].map(i => (
                                    <SkeletonLoader key={i} width={60} height={28} className="rounded-full" />
                                ))}
                            </div>
                        </div>
                    </aside>

                    <div className="flex-1 w-full min-w-0">
                        <div className="mb-6 pt-4">
                            <SkeletonLoader width={180} height={28} className="mb-2" />
                            <SkeletonLoader width={160} height={16} />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {cards.map((_, i) => (
                                <div key={i} className="flex flex-col gap-3">
                                    <SkeletonLoader height={170} className="rounded-[12px]" />
                                    <SkeletonLoader height={16} width="80%" />
                                    <SkeletonLoader height={14} width="60%" />
                                    <div className="flex justify-between items-end pt-1">
                                        <SkeletonLoader height={20} width={70} />
                                        <SkeletonLoader height={14} width={40} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <MarketplaceFooter />
            </div>
        </>
    )
}