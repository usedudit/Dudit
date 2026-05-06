import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { SkeletonLoader } from "@/components/reusable"

export default function ProductDetailsLoading() {
    return (
        <div className="flex flex-col min-h-screen bg-white font-sans text-brand-dark pt-[60px]">
            <MarketplaceHeader productName="Carregando..." />

            <div className="container mx-auto px-4 max-w-[1300px] lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">
                <div className="hidden lg:flex items-center gap-2 text-sm text-brand-inactive-text mb-8">
                    <SkeletonLoader className="w-10 h-4" />
                    <SkeletonLoader className="w-4 h-4" />
                    <SkeletonLoader className="w-20 h-4" />
                    <SkeletonLoader className="w-4 h-4" />
                    <SkeletonLoader className="w-40 h-4" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-8">

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
                                <div className="flex items-center gap-3">
                                    <SkeletonLoader className="w-[120px] h-[32px]" />
                                    <SkeletonLoader className="w-[80px] h-[20px]" />
                                    <SkeletonLoader className="w-[100px] h-[24px]" />
                                </div>
                                <SkeletonLoader className="w-[220px] h-[16px]" />
                            </div>

                            {/* variants */}
                            <div className="space-y-6">
                                {[1, 2].map(i => (
                                    <div key={i}>
                                        <SkeletonLoader className="w-[100px] h-[16px] mb-3" />
                                        <div className="flex gap-3">
                                            {[1, 2, 3, 4].map(j => (
                                                <SkeletonLoader key={j} className="w-14 h-14 rounded-md" />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* quantity */}
                            <SkeletonLoader className="w-full h-[48px]" />

                            {/* buttons */}
                            <SkeletonLoader className="w-full h-[46px] rounded-lg" />
                            <SkeletonLoader className="w-full h-[46px] rounded-lg" />

                            {/* shipping */}
                            <div className="space-y-3">
                                <SkeletonLoader className="w-[140px] h-[18px]" />
                                <div className="border rounded-lg p-4 space-y-4">
                                   <div className="flex justify-between">
                                       <SkeletonLoader className="w-[120px] h-[14px]" />
                                       <SkeletonLoader className="w-[60px] h-[14px]" />
                                   </div>
                                   <div className="flex justify-between">
                                       <SkeletonLoader className="w-[120px] h-[14px]" />
                                       <SkeletonLoader className="w-[60px] h-[14px]" />
                                   </div>
                                </div>
                            </div>

                            {/* security */}
                            <div className="border-t pt-4 space-y-4">
                                {[1, 2].map(i => (
                                    <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                                        <div className="space-y-1 flex-1">
                                            <SkeletonLoader className="w-[60%] h-[14px]" />
                                            <SkeletonLoader className="w-[40%] h-[12px]" />
                                        </div>
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
                            <SkeletonLoader className="w-[120px] h-[16px]" />
                            <SkeletonLoader className="w-[100px] h-[16px]" />
                        </div>

                        {/* title */}
                        <SkeletonLoader className="w-full h-[32px]" />
                        <SkeletonLoader className="w-[80%] h-[32px]" />

                        {/* price */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <SkeletonLoader className="w-[140px] h-[36px]" />
                                <SkeletonLoader className="w-[80px] h-[20px]" />
                                <SkeletonLoader className="w-[120px] h-[28px]" />
                            </div>
                            <SkeletonLoader className="w-[260px] h-[16px]" />
                        </div>

                        {/* variants */}
                        <div className="space-y-6">
                            {[1, 2].map(i => (
                                <div key={i}>
                                    <SkeletonLoader className="w-[100px] h-[16px] mb-3" />
                                    <div className="flex gap-3">
                                        {[1, 2, 3, 4].map(j => (
                                            <SkeletonLoader key={j} className="w-14 h-14 rounded-md" />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* buttons */}
                        <SkeletonLoader className="w-full h-[46px] rounded-lg" />
                        <SkeletonLoader className="w-full h-[46px] rounded-lg" />

                        {/* shipping */}
                        <div className="space-y-3">
                            <SkeletonLoader className="w-[140px] h-[18px]" />
                            <div className="border rounded-lg p-4 space-y-4">
                                <div className="flex justify-between">
                                    <SkeletonLoader className="w-[140px] h-[14px]" />
                                    <SkeletonLoader className="w-[60px] h-[14px]" />
                                </div>
                                <div className="flex justify-between">
                                    <SkeletonLoader className="w-[140px] h-[14px]" />
                                    <SkeletonLoader className="w-[60px] h-[14px]" />
                                </div>
                            </div>
                        </div>

                        {/* store */}
                        <div className="bg-brand-gray rounded-xl p-5">
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