"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { recordVideoClick } from "@/app/actions/marketplace/community-videos"
import { getProductUrl, getServiceUrl, getPartnerUrl } from "@/lib/utils/url-generator"
import Link from "next/link"
import { XIcon } from "@/lib/icons"

interface VideoData {
  id: string
  title: string | null
  description: string | null
  video_url: string
  video_thumbnail: string
  duration: number
  linked_item_type: "product" | "service" | "collection" | null
  linked_item_id: string | null
  partner_id: string
  views_count: number
  partner?: { store_name: string; store_image_url: string | null } | null
}

interface VideoModalProps {
  video: VideoData | null
  isOpen: boolean
  onClose: () => void
}

export function VideoModal({ video, isOpen, onClose }: VideoModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.load()
    }
  }, [isOpen, video?.video_url])

  const handleLinkedClick = useCallback(() => {
    if (video) {
      recordVideoClick(video.id).catch(() => {})
    }
  }, [video])

  const getLinkedUrl = () => {
    if (!video?.linked_item_type || !video?.linked_item_id) return null
    if (video.linked_item_type === "product") return getProductUrl({ id: video.linked_item_id }, { id: video.partner_id })
    if (video.linked_item_type === "service") return getServiceUrl({ id: video.linked_item_id }, { id: video.partner_id })
    if (video.linked_item_type === "collection") return `/colecoes/${video.linked_item_id}`
    return null
  }

  const linkedUrl = getLinkedUrl()
  const typeLabel = video?.linked_item_type === "product" ? "Ver Produto"
    : video?.linked_item_type === "service" ? "Ver Serviço"
    : video?.linked_item_type === "collection" ? "Ver Coleção"
    : null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 bg-white rounded-[20px] overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{video?.title || "Vídeo"}</DialogTitle>
        </DialogHeader>

        <div className="relative bg-black">
          <video
            ref={videoRef}
            controls
            playsInline
            preload="none"
            poster={video?.video_thumbnail}
            className="w-full aspect-[9/16] max-h-[70vh] object-contain mx-auto"
          >
            {video?.video_url && <source src={video.video_url} />}
          </video>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors z-10"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {video?.title && (
            <h3 className="font-bold text-brand-dark text-base">{video.title}</h3>
          )}

          {video?.partner && (
            <p className="text-sm text-brand-inactive-text">
              por <span className="font-medium text-brand-dark">{video.partner.store_name}</span>
            </p>
          )}

          {video?.description && (
            <p className="text-sm text-gray-600 leading-relaxed">{video.description}</p>
          )}

          {linkedUrl && typeLabel && (
            <Link
              href={linkedUrl}
              onClick={handleLinkedClick}
              className="block"
            >
              <Button className="w-full bg-brand-green text-white hover:bg-[#047857] font-bold">
                {typeLabel}
              </Button>
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
