"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { recordVideoClick } from "@/app/actions/marketplace/community-videos"
import { getLinkedItemData, type LinkedItemData } from "@/app/actions/marketplace/video-linked-item"
import Link from "next/link"
import { XIcon, StarIcon, ChevronDownIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"

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

const MAX_DESC_LENGTH = 120

export function VideoModal({ video, isOpen, onClose }: VideoModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [linkedItem, setLinkedItem] = useState<LinkedItemData | null>(null)
  const [linkedItemLoading, setLinkedItemLoading] = useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.load()
    }
  }, [isOpen, video?.video_url])

  useEffect(() => {
    setDescriptionExpanded(false)
    if (!video?.linked_item_type || !video?.linked_item_id) {
      setLinkedItem(null)
      return
    }
    setLinkedItemLoading(true)
    getLinkedItemData(video.linked_item_type, video.linked_item_id)
      .then(setLinkedItem)
      .catch(() => setLinkedItem(null))
      .finally(() => setLinkedItemLoading(false))
  }, [video?.id, video?.linked_item_type, video?.linked_item_id])

  const handleLinkedClick = useCallback(() => {
    if (video) {
      recordVideoClick(video.id).catch(() => {})
    }
  }, [video])

  const description = video?.description || ""
  const shouldTruncate = description.length > MAX_DESC_LENGTH

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

        <div className="p-4 space-y-3 max-h-[40vh] overflow-y-auto">
          {video?.title && (
            <h3 className="font-bold text-brand-dark text-base">{video.title}</h3>
          )}

          {video?.partner && (
            <p className="text-sm text-brand-inactive-text">
              por <span className="font-medium text-brand-dark">{video.partner.store_name}</span>
            </p>
          )}

          {description && (
            <div>
              <p className={`text-sm text-gray-600 leading-relaxed whitespace-pre-wrap ${!descriptionExpanded ? "line-clamp-2" : ""}`}>
                {description}
              </p>
              {shouldTruncate && (
                <button
                  onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                  className="flex items-center gap-1 text-brand-green font-bold text-xs mt-1 hover:underline"
                >
                  {descriptionExpanded ? "Ver menos" : "Ver mais"}
                  <ChevronDownIcon size={14} className={`transition-transform ${descriptionExpanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          )}

          {linkedItemLoading && (
            <div className="flex items-center gap-3 p-3 rounded-[12px] border border-gray-100 animate-pulse">
              <div className="w-16 h-16 rounded-[8px] bg-gray-200 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          )}

          {linkedItem && !linkedItemLoading && (
            <Link
              href={linkedItem.url}
              onClick={handleLinkedClick}
              className="block hover:no-underline"
            >
              <div className="p-3 rounded-[12px] border border-gray-100 hover:border-gray-200 transition-colors bg-white">
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-[8px] overflow-hidden bg-brand-gray shrink-0">
                    <img
                      src={linkedItem.imageUrl}
                      alt={linkedItem.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <h4 className="font-bold text-brand-dark text-sm leading-snug line-clamp-2">{linkedItem.name}</h4>
                    {linkedItem.type === "collection" ? (
                      <p className="text-[12px] text-brand-inactive-text mt-0.5">
                        {linkedItem.itemsCount} {linkedItem.itemsCount === 1 ? "item" : "itens"}
                      </p>
                    ) : (
                      <div className="flex items-end justify-between mt-1">
                        <div className="flex flex-col">
                          {linkedItem.showPrice !== false ? (
                            <>
                              {linkedItem.referencePrice && linkedItem.hasDiscount && (
                                <span className="text-[11px] text-brand-inactive-text line-through leading-tight">
                                  {formatCurrency(linkedItem.referencePrice)}
                                </span>
                              )}
                              <span className="text-sm font-bold text-brand-dark leading-tight">
                                {formatCurrency(linkedItem.displayPrice!)}
                              </span>
                            </>
                          ) : (
                            <span className="text-sm font-bold text-brand-dark">Preço sob consulta</span>
                          )}
                        </div>
                        {(linkedItem.rating ?? 0) > 0 && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <StarIcon size={12} className="text-brand-green fill-brand-green" />
                            <span className="text-[11px] font-bold text-brand-dark">{linkedItem.rating}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2">
                  <span className="block w-full text-center text-[13px] font-bold text-white bg-brand-green rounded-full py-2 hover:bg-[#047857] transition-colors">
                    {linkedItem.type === "product" ? "Ver Produto" : linkedItem.type === "service" ? "Ver Serviço" : "Ver Coleção"}
                  </span>
                </div>
              </div>
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
