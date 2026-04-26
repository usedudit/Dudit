import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"
import MarketplaceHeader from "@/components/marketplace/MarketplaceHeader"
import { SkeletonLoader } from "@/components/reusable"

export default function ProfileLoading() {
    const cards = Array.from({ length: 4 })
    const rows = Array.from({ length: 3 })

    return (
        <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
            <MarketplaceHeader />

            <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-6 max-w-[1300px] w-full pt-6 md:pt-10 pb-20 mt-[68px] lg:mt-[108px]">
                {/* Header Loading */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <SkeletonLoader width={200} height={32} className="mb-2" />
                        <SkeletonLoader width={250} height={20} />
                    </div>
                    <SkeletonLoader width={180} height={44} className="hidden sm:block rounded-[12px]" />
                </div>

                <div className="rounded-[12px] overflow-hidden">
                    <div className="px-6 py-4">
                        <SkeletonLoader width={200} height={18} />
                    </div>

                    <div className="p-6 flex flex-col gap-6">
                        {rows.map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <SkeletonLoader width={40} height={40} className="rounded-full" />
                                <div className="flex-1 flex flex-col gap-2">
                                    <SkeletonLoader width="50%" height={14} />
                                    <SkeletonLoader width="70%" height={12} />
                                </div>
                                <SkeletonLoader width={80} height={32} className="rounded-md" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <MarketplaceFooter />
        </div>
    )
}