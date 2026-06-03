import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { SkeletonLoader } from "@/components/reusable"

export default function ProductDetailsLoading() {
    return (
        <div className="flex flex-col min-h-screen bg-white">
            <MarketplaceHeader />

            <div className="container mx-auto px-4 max-w-[1300px] lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">

                {/* GRID REAL */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* LEFT - GALLERY */}
                    <div className="lg:col-span-8">

                        <div className="flex gap-3 mb-6">

                            {/* thumbs desktop */}
                            <div className="hidden lg:flex flex-col gap-2 w-[70px]">
                                {[1, 2, 3, 4].map(i => (
                                    <SkeletonLoader key={i} className="w-full aspect-square rounded-md" />
                                ))}
                            </div>

                            {/* main image */}
                            <div className="flex-1">
                                <div className="relative w-full bg-brand-gray rounded-2xl overflow-hidden"
                                    style={{ paddingBottom: "100%" }}>
                                    <SkeletonLoader className="absolute inset-0 w-full h-full" />
                                </div>
                            </div>
                        </div>

                        {/* BUY PANEL MOBILE */}
                        <div className="lg:hidden mb-6 space-y-6">

                            {/* header */}
                            <div className="flex justify-between items-center">
                                <SkeletonLoader className="w-[120px] h-[16px]" />
                                <SkeletonLoader className="w-[80px] h-[16px]" />
                            </div>

                            {/* title */}
                            <SkeletonLoader className="w-[90%] h-[28px]" />
                            <SkeletonLoader className="w-[70%] h-[28px]" />

                            {/* price */}
                            <div className="space-y-2">
                                <SkeletonLoader className="w-[180px] h-[28px]" />
                                <SkeletonLoader className="w-[220px] h-[16px]" />
                            </div>

                            {/* variants */}
                            <div className="space-y-6">
                                {[1, 2].map(i => (
                                    <div key={i}>
                                        <SkeletonLoader className="w-[120px] h-[18px] mb-3" />
                                        <div className="flex gap-3">
                                            {[1, 2, 3, 4].map(j => (
                                                <SkeletonLoader key={j} className="w-14 h-14 rounded-md" />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* quantity */}
                            <SkeletonLoader className="w-full h-12" />

                            {/* buttons */}
                            <SkeletonLoader className="w-full h-[46px] rounded-lg" />
                            <SkeletonLoader className="w-full h-[46px] rounded-lg" />

                            {/* shipping */}
                            <div className="space-y-3">
                                <SkeletonLoader className="w-[80px] h-[16px]" />
                                <div className="flex gap-2">
                                    <SkeletonLoader className="flex-1 h-12" />
                                    <SkeletonLoader className="w-12 h-12" />
                                </div>
                            </div>

                            {/* security */}
                            <div className="border-t pt-4 space-y-4">
                                {[1, 2].map(i => (
                                    <div key={i} className="flex justify-between items-center">
                                        <SkeletonLoader className="w-[70%] h-[14px]" />
                                        <SkeletonLoader className="w-5 h-5" />
                                    </div>
                                ))}
                            </div>

                            {/* store */}
                            <div className="bg-brand-gray rounded-xl p-5 space-y-4">
                                <div className="flex gap-3">
                                    <SkeletonLoader circle className="w-12 h-12" />
                                    <div className="flex-1 space-y-2">
                                        <SkeletonLoader className="w-[120px] h-[16px]" />
                                        <SkeletonLoader className="w-[80px] h-[12px]" />
                                    </div>
                                </div>
                                <SkeletonLoader className="w-[150px] h-[12px]" />
                            </div>
                        </div>

                        {/* DESCRIPTION */}
                        <div className="mb-10">
                            <SkeletonLoader className="w-[140px] h-[22px] mb-4" />
                            <SkeletonLoader className="w-full h-[14px] mb-2" />
                            <SkeletonLoader className="w-[95%] h-[14px] mb-2" />
                            <SkeletonLoader className="w-[90%] h-[14px]" />
                        </div>

                        {/* TECH SPECS */}
                        <div className="mb-10">
                            <SkeletonLoader className="w-[160px] h-[22px] mb-4" />
                            <div className="border rounded-xl overflow-hidden">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="flex justify-between px-4 py-3">
                                        <SkeletonLoader className="w-[120px] h-[14px]" />
                                        <SkeletonLoader className="w-[80px] h-[14px]" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* REVIEWS */}
                        <div className="border-t pt-6">
                            <SkeletonLoader className="w-[200px] h-[22px] mb-6" />

                            <div className="space-y-6">
                                {[1, 2].map(i => (
                                    <div key={i}>
                                        <div className="flex gap-3 mb-2">
                                            <SkeletonLoader circle className="w-9 h-9" />
                                            <div className="flex-1 space-y-2">
                                                <SkeletonLoader className="w-[120px] h-[14px]" />
                                                <SkeletonLoader className="w-[80px] h-[12px]" />
                                            </div>
                                        </div>
                                        <SkeletonLoader className="w-full h-[14px]" />
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>

                    {/* RIGHT - BUY PANEL DESKTOP */}
                    <div className="hidden lg:block lg:col-span-4 space-y-6">

                        {/* header */}
                        <div className="flex justify-between items-center">
                            <SkeletonLoader className="w-[140px] h-[16px]" />
                            <SkeletonLoader className="w-[80px] h-[16px]" />
                        </div>

                        {/* title */}
                        <SkeletonLoader className="w-[90%] h-[32px]" />
                        <SkeletonLoader className="w-[70%] h-[32px]" />

                        {/* price */}
                        <SkeletonLoader className="w-[200px] h-[32px]" />
                        <SkeletonLoader className="w-[240px] h-[16px]" />

                        {/* variants */}
                        <div className="space-y-6">
                            {[1, 2].map(i => (
                                <div key={i}>
                                    <SkeletonLoader className="w-[120px] h-[18px] mb-3" />
                                    <div className="flex gap-3">
                                        {[1, 2, 3, 4].map(j => (
                                            <SkeletonLoader key={j} className="w-14 h-14 rounded-md" />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* buttons */}
                        <SkeletonLoader className="w-full h-[46px]" />
                        <SkeletonLoader className="w-full h-[46px]" />

                        {/* shipping */}
                        <div className="space-y-3">
                            <SkeletonLoader className="w-[80px] h-[16px]" />
                            <div className="flex gap-2">
                                <SkeletonLoader className="flex-1 h-12" />
                                <SkeletonLoader className="w-12 h-12" />
                            </div>
                        </div>

                        {/* store */}
                        <div className="bg-brand-gray rounded-xl p-5 space-y-4">
                            <div className="flex gap-3">
                                <SkeletonLoader circle className="w-12 h-12" />
                                <div className="flex-1 space-y-2">
                                    <SkeletonLoader className="w-[120px] h-[16px]" />
                                    <SkeletonLoader className="w-[80px] h-[12px]" />
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* MOBILE BOTTOM BAR */}
                <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex gap-3 z-50">
                    <SkeletonLoader className="w-12 h-12 rounded-full" />
                    <SkeletonLoader className="flex-1 h-12 rounded-full" />
                </div>

            </div>

            <MarketplaceFooter />
        </div>
    )
}