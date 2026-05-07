"use client"

// ─── Skeleton primitive ───────────────────────────────────────────────────────
function Sk({ className = "", style }: { className?: string; style?: any }) {
    return (
        <div
            className={`animate-pulse rounded bg-gray-200 ${className}`}
            style={style}
        />
    )
}

// ─── Shimmer bar used for text lines ─────────────────────────────────────────
function SkLine({ w = "w-full", h = "h-4", className = "" }: { w?: string; h?: string; className?: string }) {
    return <Sk className={`${w} ${h} ${className}`} />
}

// ─── Buy Panel skeleton (shared between mobile + desktop) ────────────────────
function BuyPanelSkeleton() {
    return (
        <div className="bg-white relative">
            {/* Condition badge + rating row */}
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <Sk className="w-14 h-5 rounded" />
                    <div className="w-px h-4 bg-gray-200" />
                    <Sk className="w-24 h-4 rounded" />
                </div>
                <div className="flex items-center gap-1.5">
                    <Sk className="w-4 h-4 rounded-full" />
                    <Sk className="w-24 h-3 rounded" />
                </div>
            </div>

            {/* Product name */}
            <div className="space-y-2 mb-6">
                <SkLine w="w-full" h="h-7" />
                <SkLine w="w-4/5" h="h-7" />
            </div>

            {/* Price block */}
            <div className="mb-6">
                <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1">
                    <Sk className="w-36 h-9 rounded" />
                    <Sk className="w-20 h-6 rounded-sm" />
                    <Sk className="w-24 h-6 rounded" />
                </div>
                <SkLine w="w-56" h="h-4" className="mt-1" />
            </div>

            {/* Variants – one attribute group */}
            <div className="space-y-6 mb-8">
                <div>
                    <SkLine w="w-32" h="h-4" className="mb-3" />
                    <div className="flex flex-wrap gap-3">
                        {[...Array(4)].map((_, i) => (
                            <Sk key={i} className="w-14 h-14 rounded-md" />
                        ))}
                    </div>
                </div>

                {/* Second attribute group (e.g., color/size) */}
                <div>
                    <SkLine w="w-28" h="h-4" className="mb-3" />
                    <div className="flex flex-wrap gap-3">
                        {[...Array(5)].map((_, i) => (
                            <Sk key={i} className="w-16 h-10 rounded-lg" />
                        ))}
                    </div>
                </div>

                {/* Quantity dropdown */}
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <SkLine w="w-20" h="h-4" />
                        <SkLine w="w-24" h="h-3" />
                    </div>
                    <Sk className="w-full h-12 rounded-lg" />
                </div>
            </div>

            {/* Buy + Cart buttons – desktop only */}
            <div className="hidden lg:block mb-8">
                <Sk className="w-full h-[46px] rounded-xl mb-4" />
                <Sk className="w-full h-[46px] rounded-xl" />
            </div>

            {/* Shipping section */}
            <div className="mb-8">
                <SkLine w="w-32" h="h-4" className="mb-2" />
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                    {/* Pickup row */}
                    <div className="flex justify-between items-start py-3 px-4 border-b border-gray-100">
                        <div className="space-y-1.5">
                            <SkLine w="w-28" h="h-3.5" />
                            <SkLine w="w-40" h="h-3" />
                        </div>
                        <Sk className="w-10 h-4 rounded" />
                    </div>
                    {/* Delivery row */}
                    <div className="flex justify-between items-start py-3 px-4">
                        <div className="space-y-1.5">
                            <SkLine w="w-32" h="h-3.5" />
                            <SkLine w="w-44" h="h-3" />
                        </div>
                        <Sk className="w-16 h-4 rounded" />
                    </div>
                </div>
            </div>

            {/* Legal info rows */}
            <div className="border-t border-gray-100 mb-6">
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="w-full flex items-center justify-between py-5 border-b border-gray-100">
                        <div className="space-y-1.5 flex-1 pr-4">
                            <SkLine w="w-48" h="h-3.5" />
                            <SkLine w="w-full" h="h-3" />
                        </div>
                        <Sk className="w-5 h-5 rounded shrink-0" />
                    </div>
                ))}
            </div>

            {/* Store card */}
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Sk className="w-12 h-12 rounded-full shrink-0" />
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <SkLine w="w-28" h="h-4" />
                                <Sk className="w-9 h-5 rounded" />
                            </div>
                            <SkLine w="w-20" h="h-3" />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4 px-1">
                    <SkLine w="w-28" h="h-3" />
                    <SkLine w="w-28" h="h-3" />
                </div>
            </div>
        </div>
    )
}

// ─── Main skeleton ────────────────────────────────────────────────────────────
export function ProductDetailsPageSkeleton() {
    return (
        <div className="min-h-screen bg-white lg:pt-[50px] font-sans flex flex-col">

            {/* ── Header skeleton ── */}
            <div className="fixed top-0 left-0 right-0 z-40 h-[50px] bg-white border-b border-gray-100 flex items-center justify-between px-4">
                <Sk className="w-24 h-6 rounded" />
                <div className="flex items-center gap-2">
                    <Sk className="w-8 h-8 rounded-full" />
                    <Sk className="w-8 h-8 rounded-full" />
                </div>
            </div>

            <div className="container mx-auto px-4 max-w-[1300px] lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">

                {/* ── Breadcrumb – desktop only ── */}
                <div className="hidden lg:flex items-center gap-2 mb-8">
                    <SkLine w="w-10" h="h-3.5" />
                    <div className="w-2 h-2 bg-gray-200 rounded-full" />
                    <SkLine w="w-16" h="h-3.5" />
                    <div className="w-2 h-2 bg-gray-200 rounded-full" />
                    <SkLine w="w-48" h="h-3.5" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-8">

                    {/* ── Left column ── */}
                    <div className="lg:col-span-8">

                        {/* Gallery */}
                        <div className="flex gap-3 mb-6">

                            {/* Desktop thumbnail strip */}
                            <div className="hidden lg:flex flex-col gap-2 w-[70px] shrink-0">
                                {[...Array(4)].map((_, i) => (
                                    <Sk key={i} className="w-full aspect-square rounded-md" />
                                ))}
                            </div>

                            {/* Main image */}
                            <div className="flex gap-2 flex-1 min-w-0">
                                <div className="relative flex-1 min-w-0">

                                    {/* Desktop: padding-bottom 100% square */}
                                    <div className="hidden lg:block" style={{ paddingBottom: "100%", position: "relative" }}>
                                        <div className="absolute inset-0 rounded-2xl overflow-hidden">
                                            <Sk className="w-full h-full rounded-2xl" />
                                        </div>
                                    </div>

                                    {/* Mobile: aspect-ratio square */}
                                    <div className="lg:hidden relative rounded-xl overflow-hidden" style={{ aspectRatio: "1/1" }}>
                                        <Sk className="w-full h-full" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Buy panel – mobile/tablet only */}
                        <div className="lg:hidden mb-6">
                            <BuyPanelSkeleton />
                        </div>

                        {/* Description */}
                        <div className="mb-10">
                            <SkLine w="w-36" h="h-7" className="mb-4" />
                            <div className="space-y-2">
                                <SkLine w="w-full" h="h-4" />
                                <SkLine w="w-full" h="h-4" />
                                <SkLine w="w-full" h="h-4" />
                                <SkLine w="w-5/6" h="h-4" />
                                <SkLine w="w-3/4" h="h-4" />
                            </div>
                            <div className="flex items-center gap-1 mt-3">
                                <Sk className="w-28 h-4 rounded" />
                                <Sk className="w-4 h-4 rounded-full" />
                            </div>
                        </div>

                        {/* Technical specs */}
                        <div className="mb-10">
                            <SkLine w="w-32" h="h-7" className="mb-4" />
                            <div className="border border-gray-100 rounded-xl overflow-hidden">
                                {[...Array(5)].map((_, i) => (
                                    <div
                                        key={i}
                                        className={`flex justify-between items-center px-4 py-3 ${i % 2 === 0 ? "bg-gray-50" : "bg-white"} ${i < 4 ? "border-b border-gray-100" : ""}`}
                                    >
                                        <SkLine w="w-28" h="h-3.5" />
                                        <SkLine w="w-20" h="h-3.5" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Reviews */}
                        <div className="border-t border-gray-100 pt-2">
                            <SkLine w="w-48" h="h-7" className="mb-6 mt-8" />

                            {/* Rating summary card */}
                            <div className="border border-gray-100 rounded-xl p-5 mb-8 flex gap-8 items-center">
                                <div className="text-center shrink-0">
                                    <Sk className="w-16 h-14 rounded mx-auto mb-2" />
                                    <div className="flex justify-center gap-0.5 mb-1.5">
                                        {[...Array(5)].map((_, i) => <Sk key={i} className="w-3 h-3 rounded-full" />)}
                                    </div>
                                    <SkLine w="w-24" h="h-3" className="mx-auto" />
                                </div>
                                <div className="flex-1 space-y-2">
                                    {[5, 4, 3, 2, 1].map((star) => (
                                        <div key={star} className="flex items-center gap-2">
                                            <Sk className="w-3 h-3 rounded-full shrink-0" />
                                            <Sk className="w-2 h-2 rounded-full shrink-0" />
                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <Sk
                                                    className="h-full rounded-full"
                                                    style={{ width: `${[70, 20, 5, 3, 2][5 - star]}%` }}
                                                />
                                            </div>
                                            <Sk className="w-4 h-3 rounded shrink-0" />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Individual reviews */}
                            <div className="space-y-6">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="border-b border-gray-100 pb-6 last:border-0">
                                        <div className="flex items-start gap-3 mb-3">
                                            <Sk className="w-9 h-9 rounded-full shrink-0" />
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <SkLine w="w-28" h="h-3.5" />
                                                    <SkLine w="w-20" h="h-3" />
                                                </div>
                                                <div className="flex gap-0.5 mt-1">
                                                    {[...Array(5)].map((_, j) => <Sk key={j} className="w-2.5 h-2.5 rounded-full" />)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="ml-12 space-y-1.5">
                                            <SkLine w="w-full" h="h-3.5" />
                                            <SkLine w="w-4/5" h="h-3.5" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Right column – desktop buy panel ── */}
                    <div className="hidden lg:block lg:col-span-4 relative">
                        <BuyPanelSkeleton />
                    </div>
                </div>
            </div>

            {/* ── Mobile bottom bar ── */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 z-50 flex gap-3 lg:hidden shadow-lg">
                <Sk className="w-12 h-12 rounded-full shrink-0" />
                <Sk className="flex-1 h-12 rounded-full" />
            </div>
        </div>
    )
}