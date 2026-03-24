import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { SkeletonLoader } from "@/components/reusable"

export default function CartLoading() {
    return (
        <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
            <MarketplaceHeader />

            <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-6 max-w-[1300px] w-full pt-6 md:pt-10 pb-20 mt-[68px] lg:mt-[108px]">

                {/* Header */}
                <div className="mb-8">
                    <SkeletonLoader width={220} height={32} className="mb-2" />
                    <SkeletonLoader width={260} height={20} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    <div className="lg:col-span-12 space-y-10">

                        {[1, 2].map((partner) => (
                            <div key={partner} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                                {/* Vendor Cart */}
                                <div className="lg:col-span-8">

                                    <div className="px-6 py-4 flex items-center justify-between bg-brand-gray rounded-[10px]">
                                        <div className="flex items-center gap-3">
                                            <SkeletonLoader width={18} height={18} />
                                            <SkeletonLoader width={26} height={26} circle />
                                            <SkeletonLoader width={150} height={18} />
                                        </div>

                                        <SkeletonLoader width={20} height={20} circle />
                                    </div>

                                    <div className="px-2 md:px-6 pt-6">

                                        {[1, 2, 3].map((item) => (
                                            <div key={item} className="pb-6 mb-6">
                                                {/* Desktop */}
                                                <div className="hidden md:flex gap-4">
                                                    <SkeletonLoader width={18} height={18} />

                                                    <SkeletonLoader
                                                        width={80}
                                                        height={80}
                                                        className="rounded-[8px]"
                                                    />

                                                    <div className="flex-1">
                                                        <SkeletonLoader
                                                            width="70%"
                                                            height={18}
                                                            className="mb-2"
                                                        />

                                                        <SkeletonLoader
                                                            width={140}
                                                            height={14}
                                                            className="mb-3"
                                                        />

                                                        <SkeletonLoader
                                                            width={90}
                                                            height={18}
                                                        />
                                                    </div>

                                                    <div className="flex items-center gap-4">
                                                        <SkeletonLoader
                                                            width={100}
                                                            height={36}
                                                            className="rounded-[8px]"
                                                        />

                                                        <SkeletonLoader
                                                            width={70}
                                                            height={18}
                                                        />

                                                        <SkeletonLoader
                                                            width={32}
                                                            height={32}
                                                            circle
                                                        />
                                                    </div>
                                                </div>

                                                {/* Mobile */}
                                                <div className="flex md:hidden gap-3">
                                                    <SkeletonLoader width={18} height={18} />

                                                    <SkeletonLoader
                                                        width={72}
                                                        height={72}
                                                        className="rounded-[8px]"
                                                    />

                                                    <div className="flex-1">
                                                        <SkeletonLoader
                                                            width="80%"
                                                            height={16}
                                                            className="mb-2"
                                                        />

                                                        <SkeletonLoader
                                                            width={120}
                                                            height={14}
                                                            className="mb-3"
                                                        />

                                                        <div className="flex justify-between items-center">
                                                            <SkeletonLoader
                                                                width={90}
                                                                height={30}
                                                                className="rounded-[8px]"
                                                            />
                                                            <SkeletonLoader
                                                                width={60}
                                                                height={18}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Mobile summary */}
                                        <div className="mt-4 pt-4 md:hidden space-y-3">
                                            <SkeletonLoader width="100%" height={16} />
                                            <SkeletonLoader width="100%" height={16} />
                                            <SkeletonLoader width="60%" height={18} />
                                            <SkeletonLoader
                                                width="100%"
                                                height={44}
                                                className="rounded-[10px]"
                                            />
                                        </div>

                                        {/* Desktop bottom */}
                                        <div className="hidden md:block mt-6">
                                            <SkeletonLoader width={160} height={16} />
                                        </div>

                                    </div>
                                </div>

                                {/* Sidebar */}
                                <div className="hidden lg:block lg:col-span-4">
                                    <div className="sticky top-[100px] p-6 space-y-4">
                                        <SkeletonLoader width={160} height={20} />
                                        <SkeletonLoader width="100%" height={16} />
                                        <SkeletonLoader width="100%" height={16} />
                                        <SkeletonLoader width="70%" height={22} />

                                        <SkeletonLoader
                                            width="100%"
                                            height={46}
                                            className="rounded-[10px]"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <MarketplaceFooter />
        </div>
    )
}