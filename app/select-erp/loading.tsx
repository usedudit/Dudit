import SkeletonLoader from "@/components/erp/SkeletonLoader"

export default function SelectErpLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <SkeletonLoader />
    </div>
  )
}
