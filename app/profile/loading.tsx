import { SkeletonLoader } from "@/components/reusable"

export default function ProfileLoading() {
    const cards = Array.from({ length: 4 })
    const rows = Array.from({ length: 3 })

    return (
        <div className="animate-fade-in">

            <div className="flex items-center mb-8">
                <div>
                    <SkeletonLoader width={180} height={28} className="mb-2" />
                    <SkeletonLoader width={380} height={16} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                {cards.map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-5 rounded-2xl h-full">
                        <SkeletonLoader width={48} height={48} className="rounded-full" />
                        <div className="flex-1 flex flex-col gap-2">
                            <SkeletonLoader height={16} width="60%" />
                            <SkeletonLoader height={14} width="90%" />
                        </div>
                        <SkeletonLoader width={18} height={18} />
                    </div>
                ))}
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

            <div className="mt-6 flex gap-2">
                <SkeletonLoader width={140} height={36} className="rounded-md" />
                <SkeletonLoader width={120} height={36} className="rounded-md" />
            </div>

        </div>
    )
}