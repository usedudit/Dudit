"use client"

import React, { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { HorizontalCarousel } from "./shared-components"
import { CommunityVideoCard } from "./CommunityVideoCard"

const VideoModal = dynamic(
  () => import("./VideoModal").then((m) => m.VideoModal),
  { ssr: false }
)

interface CommunityVideosCarouselProps {
  videos: any[]
  title?: string
}

export function CommunityVideosCarousel({
  videos,
  title = "Vídeos da comunidade",
}: CommunityVideosCarouselProps) {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [videoDataCache, setVideoDataCache] = useState<Map<string, any>>(new Map())

  const selectedVideo = selectedVideoId ? videoDataCache.get(selectedVideoId) || videos.find(v => v.id === selectedVideoId) || null : null

  const handleOpen = useCallback((videoId: string) => {
    const video = videos.find(v => v.id === videoId)
    if (video) {
      setVideoDataCache(prev => new Map(prev).set(videoId, video))
    }
    setSelectedVideoId(videoId)
  }, [videos])

  const handleClose = useCallback(() => {
    setSelectedVideoId(null)
  }, [])

  if (!videos || videos.length === 0) return null

  return (
    <>
      <HorizontalCarousel
        title={title}
        items={videos}
        itemWidthClass="w-[170px]"
        renderItem={(video: any) => (
          <CommunityVideoCard
            video={video}
            onOpen={handleOpen}
          />
        )}
      />
      <VideoModal
        video={selectedVideo}
        isOpen={!!selectedVideoId}
        onClose={handleClose}
      />
    </>
  )
}
