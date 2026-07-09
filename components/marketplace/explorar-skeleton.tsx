"use client"

import { SkeletonLoader } from "@/components/reusable/SkeletonLoader"

export const ExploreContentSkeleton = ({ type, hasSection }: { type: string; hasSection?: boolean }) => {
    return (
        <div className="space-y-10 animate-pulse">
            {type === 'tudo' && !hasSection && (
                <div className="space-y-8">
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <SkeletonLoader width={220} height={24} className="rounded" />
                        </div>
                        <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="shrink-0 w-[220px] sm:w-[260px]">
                                    <SkeletonLoader height={110} className="rounded-[16px]" />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <SkeletonLoader width={180} height={20} className="rounded" />
                        </div>
                        <div className="flex gap-4 overflow-x-auto scrollbar-none pb-2">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="shrink-0 w-[270px] sm:w-[320px]">
                                    <SkeletonLoader height={140} className="rounded-[16px] mb-3" />
                                    <div className="flex items-center gap-3">
                                        <SkeletonLoader width={48} height={48} circle />
                                        <div className="flex-1 space-y-2">
                                            <SkeletonLoader width="60%" height={16} className="rounded" />
                                            <SkeletonLoader width="40%" height={12} className="rounded" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div>
                <div className="mb-6">
                    <SkeletonLoader width={200} height={24} className="rounded" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="flex flex-col gap-3">
                            <SkeletonLoader height={170} className="rounded-[16px]" />
                            <SkeletonLoader height={16} width="85%" className="rounded" />
                            <SkeletonLoader height={14} width="50%" className="rounded" />
                            <div className="flex justify-between items-center pt-1 border-t border-gray-50 mt-2">
                                <div className="flex items-center gap-2">
                                    <SkeletonLoader width={24} height={24} circle />
                                    <SkeletonLoader width={60} height={12} className="rounded" />
                                </div>
                                <SkeletonLoader width={40} height={14} className="rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
