import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { SkeletonLoader } from "@/components/reusable"

export default function MyOrdersLoading() {
    return (
        <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
            <MarketplaceHeader currentView="account-info" />

            <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-6 max-w-[1300px] w-full pt-6 md:pt-10 pb-20 mt-[68px] lg:mt-[108px]">
                {/* Header Loading */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <SkeletonLoader width={200} height={32} className="mb-2" />
                        <SkeletonLoader width={250} height={20} />
                    </div>
                    <SkeletonLoader width={180} height={44} className="hidden sm:block rounded-[12px]" />
                </div>

                {/* Orders Loading */}
                <div className="space-y-6 flex-1">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-white dark:bg-dark-surface rounded-[12px] overflow-hidden">
                            {/* Card Header Loading */}
                            <div className="px-6 py-4 bg-brand-gray dark:bg-emerald-900/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <SkeletonLoader width={40} height={40} circle />
                                    <div>
                                        <SkeletonLoader width={150} height={20} className="mb-1" />
                                        <SkeletonLoader width={120} height={16} />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto pl-14 md:pl-0">
                                    <div className="flex flex-col items-end">
                                        <SkeletonLoader width={40} height={16} className="mb-1" />
                                        <SkeletonLoader width={80} height={24} />
                                    </div>
                                    <SkeletonLoader width={90} height={28} className="rounded-full" />
                                </div>
                            </div>

                            {/* Card Content Loading */}
                            <div className="p-6">
                                <div className="space-y-4">
                                    {[1, 2].map((j) => (
                                        <div key={j} className="flex gap-4">
                                            <SkeletonLoader width={64} height={64} className="rounded-[8px] shrink-0" />
                                            <div className="flex-1 flex justify-between items-start pt-1">
                                                <div>
                                                    <SkeletonLoader width={180} height={20} className="mb-1" />
                                                    <SkeletonLoader width={120} height={16} />
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <SkeletonLoader width={60} height={20} className="mb-1" />
                                                    <SkeletonLoader width={50} height={16} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex justify-end gap-3 mt-8 pt-6">
                                    <SkeletonLoader width={120} height={40} className="rounded-[10px]" />
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
