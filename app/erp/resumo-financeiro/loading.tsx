import { SkeletonLoader } from "@/components/reusable"

export default function FinancialOverviewLoading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonLoader key={index} className="h-[140px] rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonLoader className="h-[220px] rounded-2xl lg:col-span-2" />
        <SkeletonLoader className="h-[220px] rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SkeletonLoader className="h-[420px] rounded-2xl" />
        <SkeletonLoader className="h-[420px] rounded-2xl" />
      </div>
    </div>
  )
}
