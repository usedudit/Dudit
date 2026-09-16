import ThreeDotsLoader from "@/components/reusable/ThreeDotsLoader"

export default function HomeLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <ThreeDotsLoader />
    </div>
  )
}
