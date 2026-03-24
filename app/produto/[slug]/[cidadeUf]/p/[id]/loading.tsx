import { SkeletonLoader } from "@/components/reusable"

export default function ProductDetailsLoading() {
    return (
        <div className="flex flex-col min-h-screen bg-white font-sans">
            {/* Same literal Header Skeleton */}
            <header className="fixed top-0 left-0 right-0 z-[100] bg-brand-dark flex flex-col w-full">
                <div className="hidden lg:flex w-full h-[68px] items-center justify-between max-w-[1300px] px-4 mx-auto gap-4">
                    <div className="w-[140px] h-[40px] bg-white/10 rounded-md" />
                    <div className="flex-1 max-w-[600px] h-[42px] bg-white rounded-full mx-4" />
                    <div className="flex items-center gap-6">
                        <div className="w-[100px] h-[36px] bg-white/10 rounded-md" />
                        <div className="w-[80px] h-[36px] bg-white/10 rounded-md" />
                    </div>
                </div>
                <div className="lg:hidden w-full bg-brand-dark px-4 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 bg-white/10 rounded-full" />
                    <div className="flex-1 h-[38px] bg-white rounded-full" />
                    <div className="w-6 h-6 bg-white/10 rounded-md" />
                </div>
            </header>

            <div className="flex-1 container mx-auto px-4 lg:px-6 max-w-[1300px] pt-6 md:pt-10 pb-20 mt-[68px] lg:mt-[108px]">
                {/* Product Grid Layout matching ProductDetailsPage.tsx */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 xl:gap-14">

                    {/* Gallery Structure matching line 324 of ProductDetailsPage.tsx */}
                    <div className="flex flex-col-reverse lg:flex-row gap-4">
                        {/* Thumbnails Sidebar */}
                        <div className="hidden lg:flex flex-col gap-2 shrink-0">
                            {[1, 2, 3, 4].map((i) => (
                                <SkeletonLoader key={i} className="w-[80px] aspect-square rounded-[12px]" />
                            ))}
                        </div>
                        {/* Main Image */}
                        <div className="flex-1 w-full relative aspect-square rounded-[20px] overflow-hidden">
                            <SkeletonLoader className="w-full h-full" />
                        </div>
                    </div>

                    {/* Info Panel Structure matching line 395 */}
                    <div className="flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <SkeletonLoader className="w-[160px] h-[18px]" />
                            <div className="flex gap-2">
                                <SkeletonLoader circle className="w-10 h-10" />
                                <SkeletonLoader circle className="w-10 h-10" />
                            </div>
                        </div>

                        <SkeletonLoader className="w-[90%] h-[32px] md:h-[40px] mb-2" />
                        <SkeletonLoader className="w-[60%] h-[32px] md:h-[40px] mb-8" />

                        <div className="mb-8 space-y-4">
                            <SkeletonLoader className="w-[200px] h-[40px]" />
                            <SkeletonLoader className="w-[240px] h-[18px]" />
                        </div>

                        {/* Variants Section matching line 416 */}
                        <div className="space-y-8 mb-10">
                            {[1, 2].map((i) => (
                                <div key={i}>
                                    <SkeletonLoader className="w-[120px] h-[20px] mb-4" />
                                    <div className="flex gap-3">
                                        {[1, 2, 3, 4].map((j) => (
                                            <SkeletonLoader key={j} className="w-[60px] h-[60px] rounded-[10px]" />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Actions Section matching line 545 */}
                        <div className="hidden lg:flex flex-col gap-4 mb-10">
                            <SkeletonLoader className="w-full h-[52px] rounded-full" />
                            <SkeletonLoader className="w-full h-[52px] rounded-full" />
                        </div>

                        {/* Security Section matching line 586 */}
                        <div className="h-px bg-brand-gray w-full my-6" />
                        <div className="space-y-3 pt-2">
                            <SkeletonLoader className="w-[150px] h-[20px] mb-4" />
                            {[1, 2, 3].map(i => (
                                <div key={i} className="flex items-center gap-3">
                                    <SkeletonLoader circle className="w-5 h-5 shrink-0" />
                                    <SkeletonLoader className="w-full h-[14px]" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Bar matching line 818 */}
                <div className="lg:hidden fixed bottom-16 left-0 right-0 bg-white p-4 flex gap-3 z-40">
                    <div className="absolute top-0 left-0 w-full h-px bg-brand-gray" />
                    <SkeletonLoader className="flex-1 h-[48px] rounded-full" />
                    <SkeletonLoader className="flex-1 h-[48px] rounded-full" />
                </div>
            </div>

            {/* Same literal Footer Skeleton */}
            <footer className="w-full bg-brand-dark py-12 px-4">
                <div className="max-w-[1300px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="space-y-4">
                            <SkeletonLoader className="w-[120px] h-[20px] bg-white/10" />
                            <div className="space-y-2">
                                {[1, 2, 3].map(j => <SkeletonLoader key={j} className="w-full h-[14px] bg-white/10" />)}
                            </div>
                        </div>
                    ))}
                </div>
            </footer>
        </div>
    )
}
