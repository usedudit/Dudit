import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { SkeletonLoader } from "@/components/reusable"

function RadioCardSkeleton() {
    return (
        <div className="flex items-center border border-gray-100 dark:border-dark-border rounded-[12px] px-4 py-3 gap-4">
            <SkeletonLoader width={24} height={24} className="rounded shrink-0" />
            <div className="flex-1">
                <SkeletonLoader width={96} height={14} className="mb-1.5" />
                <SkeletonLoader width={128} height={12} />
            </div>
            <SkeletonLoader width={20} height={20} circle />
        </div>
    )
}

function SectionSkeleton({ children, collapsed = false }: { children?: React.ReactNode; collapsed?: boolean }) {
    return (
        <div className="bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-border rounded-[12px] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between bg-gray-50 dark:bg-dark-border/30">
                <SkeletonLoader width={96} height={16} />
                <SkeletonLoader width={20} height={20} />
            </div>
            {!collapsed && (
                <div className="p-6">
                    {children}
                </div>
            )}
        </div>
    )
}

export default function CheckoutLoading() {
    return (
        <div className="min-h-screen flex flex-col bg-white dark:bg-dark-background">

            {/* Header */}
            <header className="w-full h-[68px] bg-gray-900 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-50">
                <SkeletonLoader width={112} height={32} className="rounded bg-gray-700" />
                <SkeletonLoader width={144} height={16} className="rounded bg-gray-700" />
            </header>

            <div className="container mx-auto px-4 lg:px-6 max-w-[1300px] w-full pt-6 md:pt-10 pb-32 md:pb-20">

                {/* Page title */}
                <div className="mb-8 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="hidden md:block">
                        <SkeletonLoader width={40} height={40} className="rounded-[10px]" />
                    </div>
                    <div>
                        <SkeletonLoader width={192} height={28} className="mb-2" />
                        <SkeletonLoader width={320} height={16} />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    {/* ── Left column ── */}
                    <div className="lg:col-span-8 space-y-4">

                        {/* Entrega – open */}
                        <SectionSkeleton>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                <RadioCardSkeleton />
                                <RadioCardSkeleton />
                            </div>
                            {/* Pickup address block */}
                            <div className="flex items-stretch gap-3">
                                <SkeletonLoader width={48} height={48} className="rounded-[12px] shrink-0" />
                                <div className="flex-1">
                                    <SkeletonLoader width={128} height={14} className="mb-1.5" />
                                    <SkeletonLoader width="100%" height={12} className="mb-1.5" />
                                    <SkeletonLoader width={224} height={12} />
                                </div>
                            </div>
                        </SectionSkeleton>

                        {/* Pagamento – open */}
                        <SectionSkeleton>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                <RadioCardSkeleton />
                                <RadioCardSkeleton />
                            </div>
                            <SkeletonLoader width={144} height={14} className="mb-2" />
                            <SkeletonLoader width="100%" height={44} className="rounded-[8px]" />
                        </SectionSkeleton>

                        {/* Observações – collapsed */}
                        <SectionSkeleton collapsed />
                    </div>

                    {/* ── Right column – Order summary ── */}
                    <div className="lg:col-span-4">
                        <div className="border border-gray-100 dark:border-dark-border rounded-[12px] overflow-hidden bg-white dark:bg-dark-surface">

                            {/* Card header */}
                            <div className="bg-gray-50 dark:bg-dark-border/30 px-6 py-4 border-b border-gray-100 dark:border-dark-border">
                                <SkeletonLoader width={160} height={16} />
                            </div>

                            <div className="p-6">

                                {/* Product items */}
                                <div className="space-y-4 mb-6">
                                    {[...Array(2)].map((_, i) => (
                                        <div key={i} className="flex gap-3">
                                            <SkeletonLoader width={64} height={64} className="rounded-[8px] shrink-0" />
                                            <div className="flex-1">
                                                <SkeletonLoader width="100%" height={14} className="mb-1.5" />
                                                <SkeletonLoader width="75%" height={14} className="mb-1.5" />
                                                <SkeletonLoader width={80} height={12} className="mb-2" />
                                                <div className="flex justify-between items-center">
                                                    <SkeletonLoader width={64} height={12} />
                                                    <SkeletonLoader width={56} height={14} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Coupon row */}
                                <div className="flex items-center border border-gray-100 dark:border-dark-border rounded-[12px] px-4 py-3 gap-4 mb-4">
                                    <SkeletonLoader width={20} height={20} className="shrink-0" />
                                    <div className="flex-1">
                                        <SkeletonLoader width={112} height={14} className="mb-1.5" />
                                        <SkeletonLoader width={144} height={12} />
                                    </div>
                                    <SkeletonLoader width={20} height={20} />
                                </div>

                                {/* Price breakdown */}
                                <div className="space-y-3 mb-4">
                                    {[["100%", 56], ["100%", 40], ["100%", 64]].map(([, valW], i) => (
                                        <div key={i} className="flex justify-between items-center">
                                            <SkeletonLoader width={64} height={14} />
                                            <SkeletonLoader width={valW as number} height={14} />
                                        </div>
                                    ))}
                                </div>

                                {/* Separator */}
                                <div className="border-t border-gray-100 dark:border-dark-border mb-4" />

                                {/* Total */}
                                <div className="flex justify-between items-end mb-4">
                                    <SkeletonLoader width={112} height={24} />
                                    <SkeletonLoader width={96} height={24} />
                                </div>

                                {/* CTA */}
                                <SkeletonLoader width="100%" height={46} className="rounded-[10px]" />
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Mobile bottom bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-surface border-t border-gray-100 dark:border-dark-border p-4 z-[110] flex gap-3 lg:hidden shadow-lg">
                <div className="flex-1">
                    <SkeletonLoader width="100%" height={48} className="rounded-[10px]" />
                </div>
                <div className="flex-[2]">
                    <SkeletonLoader width="100%" height={48} className="rounded-[10px]" />
                </div>
            </div>

            <MarketplaceFooter />
        </div>
    )
}