"use client"

import ThreeDotsLoader from '@/components/reusable/ThreeDotsLoader'

export default function GenericERPLoading() {
  return (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center">
      <ThreeDotsLoader />
    </div>
  )
}
