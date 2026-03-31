"use client"

import React from 'react'
import ThreeDotsLoader from '@/components/reusable/ThreeDotsLoader'

export default function GenericERPLoading() {
  return (
    <div className="flex h-[calc(100vh-65px)] w-full items-center justify-center bg-dark-background/50 backdrop-blur-sm">
      <ThreeDotsLoader className="scale-125" />
    </div>
  )
}
