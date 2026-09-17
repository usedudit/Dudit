"use client"

import React, { useCallback } from "react"
import Link from "next/link"
import { recordVideoView } from "@/app/actions/marketplace/community-videos"
import { getStoreUrl } from "@/lib/utils/url-generator"

interface CommunityVideoCardProps {
  video: {
    id: string
    title?: string | null
    video_thumbnail: string
    duration: number
    views_count: number
    partner?: { name: string; store_name?: string; short_id?: string | null; id?: string | null; slug?: string | null; city?: string | null; state?: string | null } | null
  }
  onOpen: (videoId: string) => void
  className?: string
}

export function CommunityVideoCard({ video, onOpen, className = "w-[170px]" }: CommunityVideoCardProps) {
  const handleOpen = useCallback(() => {
    recordVideoView(video.id).catch(() => { })
    onOpen(video.id)
  }, [video.id, onOpen])

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  return (
    <button
      onClick={handleOpen}
      className={`flex flex-col group cursor-pointer transition-all duration-300 text-left ${className}`}
    >
      <div className="relative w-full aspect-[9/16] rounded-[16px] overflow-hidden bg-brand-gray mb-3 shrink-0 dark:bg-dark-border/30">
        <img
          src={video.video_thumbnail}
          alt={video.title || "Vídeo"}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <svg className="w-5 h-5 text-brand-dark ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] font-bold px-2 py-0.5 rounded-[4px]">
          {formatDuration(video.duration)}
        </div>
      </div>

      <div className="px-1">
        <h3 className="text-sm font-normal text-brand-dark line-clamp-2 leading-snug dark:text-dark-heading">
          {video.title || "Vídeo da comunidade"}
        </h3>
        {video.partner?.id && (
          <Link
            href={getStoreUrl(video.partner)}
            className="text-[11px] text-brand-inactive-text mt-1 dark:text-dark-body hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {video.partner?.name || video.partner?.store_name || "Loja parceira"}
          </Link>
        )}
      </div>
    </button>
  )
}
