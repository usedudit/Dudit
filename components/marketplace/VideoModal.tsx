"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { recordVideoClick } from "@/app/actions/marketplace/community-videos"
import { getLinkedItemData, type LinkedItemData } from "@/app/actions/marketplace/video-linked-item"
import Link from "next/link"
import { XIcon, ChevronDownIcon, FlagIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getStoreUrl } from "@/lib/utils/url-generator"
import { useModalLayer } from "@/lib/modal-stack"
import { ReportModal } from "./ReportModal"

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
   partner?: { name?: string; store_name?: string; store_image_url: string | null; short_id?: string | null; id?: string | null; slug?: string | null; city?: string | null; state?: string | null } | null
}

interface VideoModalProps {
  video: VideoData | null
  isOpen: boolean
  onClose: () => void
}

const MAX_DESC_LENGTH = 100

export function VideoModal({ video, isOpen, onClose }: VideoModalProps) {
  const [mounted, setMounted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [linkedItem, setLinkedItem] = useState<LinkedItemData | null>(null)
  const [linkedItemLoading, setLinkedItemLoading] = useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  // z-index dinâmico: este modal abre acima de tudo que já estava aberto.
  const zIndex = useModalLayer(isOpen)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setShowReportModal(false)
    }
  }, [isOpen, video?.id])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showReportModal) onClose()
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown)
    }
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose, showReportModal])

  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.load()
      videoRef.current.play().catch(() => {})
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
      .catch((err) => {
        console.error("[VideoModal] Failed to fetch linked item:", err)
        setLinkedItem(null)
      })
      .finally(() => setLinkedItemLoading(false))
  }, [video?.id, video?.linked_item_type, video?.linked_item_id])

  const handleLinkedClick = useCallback(() => {
    if (video) {
      recordVideoClick(video.id).catch(() => {})
    }
  }, [video])

  const description = video?.description || ""
  const shouldTruncate = description.length > MAX_DESC_LENGTH
  const storeName = video?.partner?.name || video?.partner?.store_name || "Loja Parceira"
  const storeLogo = video?.partner?.store_image_url ? getR2ImageUrl(video.partner.store_image_url, "thumb") : null

  if (!mounted) return null

  return createPortal(
    <>
    <AnimatePresence>
      {isOpen && video && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed inset-0 z-[9999] bg-black select-none overflow-hidden"
          style={{ zIndex }}
          onClick={onClose}
        >
          {/* Top Right Actions (Report + Close) */}
          <div
            className="absolute top-3 right-3 sm:top-5 sm:right-5 z-30 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                videoRef.current?.pause()
                setShowReportModal(true)
              }}
              className="w-10 h-10 sm:w-11 sm:h-11 bg-white/15 hover:bg-red-500/80 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer"
              aria-label="Denunciar vídeo"
              title="Denunciar vídeo"
            >
              <FlagIcon size={18} />
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 sm:w-11 sm:h-11 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer"
              aria-label="Fechar vídeo"
            >
              <XIcon size={20} />
            </button>
          </div>

          {/* Fullscreen Video Player */}
          <div
            className="absolute inset-0 w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              ref={videoRef}
              controls
              autoPlay
              playsInline
              preload="metadata"
              poster={video.video_thumbnail}
              className="w-full h-full object-contain"
            >
              {video.video_url && <source src={video.video_url} />}
            </video>
          </div>

          {/* Bottom Left: Store Info + Description + Linked Item */}
          <div className="absolute bottom-16 sm:bottom-20 left-3 sm:left-6 z-30 pointer-events-auto max-w-[calc(100vw-120px)] sm:max-w-[400px]">
            <div
              className="flex items-center gap-2.5 mb-2"
              onClick={(e) => e.stopPropagation()}
            >
              {video?.partner?.id ? (
                <Link
                  href={getStoreUrl(video.partner)}
                  className="flex items-center gap-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Store Logo */}
                  {storeLogo ? (
                    <img
                      src={storeLogo}
                      alt={storeName}
                      className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-white/30"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-brand-green/80 flex items-center justify-center text-white font-bold text-sm shrink-0 border-2 border-white/30">
                      {storeName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* Store Name */}
                  <p className="text-sm font-bold text-white drop-shadow-lg truncate">
                    {storeName}
                  </p>
                </Link>
              ) : (
                <>
                  {/* Store Logo */}
                  {storeLogo ? (
                    <img
                      src={storeLogo}
                      alt={storeName}
                      className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-white/30"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-brand-green/80 flex items-center justify-center text-white font-bold text-sm shrink-0 border-2 border-white/30">
                      {storeName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* Store Name */}
                  <p className="text-sm font-bold text-white drop-shadow-lg truncate">
                    {storeName}
                  </p>
                </>
              )}
            </div>

            {/* Description */}
            {description && (
              <div
                className="mb-2 text-xs sm:text-sm text-white/95 drop-shadow-md max-h-24 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <p className={!descriptionExpanded ? "line-clamp-2" : "whitespace-pre-wrap"}>
                  {description}
                </p>
                {shouldTruncate && (
                  <button
                    onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                    className="flex items-center gap-0.5 text-white font-bold text-[11px] mt-1 hover:underline cursor-pointer"
                  >
                    {descriptionExpanded ? "menos" : "mais"}
                    <ChevronDownIcon size={12} className={`transition-transform duration-200 ${descriptionExpanded ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>
            )}

            {/* Linked Item (TikTok style) */}
            {linkedItemLoading && (
              <div
                className="flex items-center gap-2.5 animate-pulse"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-10 rounded-lg bg-white/20 shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-white/20 rounded w-24" />
                  <div className="h-3 bg-white/20 rounded w-16" />
                </div>
              </div>
            )}

            {linkedItem && !linkedItemLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2.5"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Item Thumbnail */}
                <Link
                  href={linkedItem.url}
                  onClick={handleLinkedClick}
                  className="shrink-0 block"
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/10 shrink-0 border border-white/20">
                    <img
                      src={linkedItem.imageUrl}
                      alt={linkedItem.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </Link>

                {/* Item Info */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={linkedItem.url}
                    onClick={handleLinkedClick}
                    className="hover:no-underline block"
                  >
                    <h4 className="font-bold text-xs sm:text-sm text-white drop-shadow-lg line-clamp-1 leading-snug hover:underline">
                      {linkedItem.name}
                    </h4>
                  </Link>
                  {linkedItem.type === "collection" ? (
                    <span className="text-[11px] text-white/80 font-medium">
                      {linkedItem.itemsCount} {linkedItem.itemsCount === 1 ? "item" : "itens"}
                    </span>
                  ) : linkedItem.showPrice !== false ? (
                    <span className="text-xs font-bold text-white drop-shadow-lg">
                      {formatCurrency(linkedItem.displayPrice || 0)}
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-white/80">
                      Preço sob consulta
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    {video && (
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetType="community_video"
        targetId={video.id}
        targetName={video.title || "Vídeo da comunidade"}
      />
    )}
    </>,
    document.body
  )
}


