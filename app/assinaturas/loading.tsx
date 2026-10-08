import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { SkeletonLoader } from "@/components/reusable"

export default function AssinaturasLoading() {
    return (
        <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
            <MarketplaceHeader />

            <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-6 max-w-[1300px] w-full pt-6 md:pt-10 pb-20 mt-[68px] lg:mt-[108px]">
                {/* Header Loading */}
                <div className="mb-8">
                    <SkeletonLoader width={220} height={32} className="mb-2" />
                    <SkeletonLoader width={300} height={20} />
                </div>

                {/* Tabs Loading */}
                <SkeletonLoader width={280} height={36} className="mb-6 rounded-full" />

                {/* Subscriptions Loading */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start flex-1">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white dark:bg-dark-surface rounded-[12px] overflow-hidden">
                            {/* Card Header Loading */}
                            <div className="px-6 py-4 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <SkeletonLoader width={40} height={40} circle />
                                    <div>
                                        <SkeletonLoader width={150} height={20} className="mb-1" />
                                        <SkeletonLoader width={120} height={16} />
                                    </div>
                                </div>
                                <SkeletonLoader width={70} height={16} />
                            </div>

                            {/* Card Content Loading */}
                            <div className="px-6 pb-6">
                                <div className="h-px bg-brand-border dark:bg-dark-border w-full mb-6" />

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                                    <SkeletonLoader width={140} height={14} />
                                    <SkeletonLoader width={120} height={14} />
                                    <SkeletonLoader width={220} height={14} />
                                </div>

                                <div className="space-y-4">
                                    {[1, 2].map((j) => (
                                        <div key={j} className="flex gap-4">
                                            <SkeletonLoader width={48} height={48} className="rounded-[8px] shrink-0" />
                                            <div className="flex-1 pt-1">
                                                <SkeletonLoader width={160} height={18} className="mb-2" />
                                                <SkeletonLoader width={100} height={14} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Card Footer Loading */}
                            <div className="px-6 py-4 border-t border-brand-border dark:border-dark-border flex items-center justify-between gap-4">
                                <div>
                                    <SkeletonLoader width={90} height={14} className="mb-1" />
                                    <SkeletonLoader width={70} height={20} />
                                </div>
                                <div className="flex gap-3">
                                    <SkeletonLoader width={100} height={40} className="rounded-[10px]" />
                                    <SkeletonLoader width={100} height={40} className="rounded-[10px]" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <MarketplaceFooter />
        </div>
    )
}
