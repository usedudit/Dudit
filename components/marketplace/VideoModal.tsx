"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
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
  partner?: { name?: string; store_name?: string; store_image_url: string | null } | null
}

interface VideoModalProps {
  video: VideoData | null
  isOpen: boolean
  onClose: () => void
}

const MAX_DESC_LENGTH = 120

export function VideoModal({ video, isOpen, onClose }: VideoModalProps) {
  const [mounted, setMounted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [linkedItem, setLinkedItem] = useState<LinkedItemData | null>(null)
  const [linkedItemLoading, setLinkedItemLoading] = useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [showPanel, setShowPanel] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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
      if (e.key === "Escape") onClose()
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown)
    }
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.load()
      videoRef.current.play().catch(() => {})
    }
  }, [isOpen, video?.video_url])

  useEffect(() => {
    setDescriptionExpanded(false)
    setShowPanel(false)
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

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && video && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed inset-0 z-[9999] bg-black overflow-hidden"
          onClick={onClose}
          onMouseEnter={() => setShowPanel(true)}
          onMouseLeave={() => setShowPanel(false)}
        >
          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="absolute top-4 right-4 z-20 w-10 h-10 sm:w-11 sm:h-11 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <XIcon size={22} />
          </button>

          {/* Info toggle (mobile) */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowPanel((p) => !p)
            }}
            className="absolute bottom-4 right-4 z-20 w-10 h-10 sm:w-11 sm:h-11 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer lg:hidden"
            aria-label="Detalhes do vídeo"
          >
            <ChevronDownIcon size={22} className={`transition-transform duration-300 ${showPanel ? "rotate-180" : ""}`} />
          </button>

          {/* Fullscreen video */}
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

          {/* Info + Linked Item Panel (hover on desktop / toggle on mobile) */}
          <AnimatePresence>
            {showPanel && (
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 sm:p-6 pt-14"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-full max-w-2xl mx-auto space-y-3">
                  {/* Title & Store */}
                  <div>
                    {video.title && (
                      <h3 className="font-bold text-white text-base sm:text-lg leading-tight">
                        {video.title}
                      </h3>
                    )}
                    {video.partner && (
                      <p className="text-xs sm:text-sm text-white/70 mt-0.5">
                        por <span className="font-medium text-white">{video.partner?.name || video.partner?.store_name}</span>
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  {description && (
                    <div>
                      <p className={`text-xs sm:text-sm text-white/80 leading-relaxed whitespace-pre-wrap ${!descriptionExpanded ? "line-clamp-2" : ""}`}>
                        {description}
                      </p>
                      {shouldTruncate && (
                        <button
                          onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                          className="flex items-center gap-1 text-brand-green font-bold text-xs mt-1 hover:underline cursor-pointer"
                        >
                          {descriptionExpanded ? "Ver menos" : "Ver mais"}
                          <ChevronDownIcon size={14} className={`transition-transform ${descriptionExpanded ? "rotate-180" : ""}`} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Linked Item Loader */}
                  {linkedItemLoading && (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 animate-pulse bg-white/10">
                      <div className="w-14 h-14 rounded-lg bg-white/20 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-white/20 rounded w-3/4" />
                        <div className="h-3 bg-white/20 rounded w-1/2" />
                      </div>
                    </div>
                  )}

                  {/* Linked Item Card */}
                  {linkedItem && !linkedItemLoading && (
                    <Link
                      href={linkedItem.url}
                      onClick={handleLinkedClick}
                      className="block hover:no-underline group"
                    >
                      <div className="p-3 rounded-xl border border-white/10 group-hover:border-white/25 transition-colors bg-white/10 group-hover:bg-white/15 backdrop-blur-sm">
                        <div className="flex gap-3 items-center">
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-white border border-white/10 shrink-0">
                            <img
                              src={linkedItem.imageUrl}
                              alt={linkedItem.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <h4 className="font-bold text-white text-xs sm:text-sm leading-snug line-clamp-2">
                              {linkedItem.name}
                            </h4>
                            {linkedItem.type === "collection" ? (
                              <p className="text-xs text-white/70 mt-0.5">
                                {linkedItem.itemsCount} {linkedItem.itemsCount === 1 ? "item" : "itens"}
                              </p>
                            ) : (
                              <div className="flex items-center justify-between mt-1">
                                <div className="flex items-center gap-2">
                                  {linkedItem.showPrice !== false ? (
                                    <>
                                      <span className="text-xs sm:text-sm font-bold text-white">
                                        {formatCurrency(linkedItem.displayPrice!)}
                                      </span>
                                      {linkedItem.referencePrice && linkedItem.hasDiscount && (
                                        <span className="text-[11px] text-white/60 line-through">
                                          {formatCurrency(linkedItem.referencePrice)}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-xs font-bold text-white">Preço sob consulta</span>
                                  )}
                                </div>
                                {(linkedItem.rating ?? 0) > 0 && (
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <StarIcon size={12} className="text-brand-green fill-brand-green" />
                                    <span className="text-[11px] font-bold text-white">{linkedItem.rating}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 hidden sm:block">
                            <span className="inline-block text-xs font-bold text-white bg-brand-green px-3 py-2 rounded-full group-hover:bg-[#047857] transition-colors">
                              {linkedItem.type === "product" ? "Ver Produto" : linkedItem.type === "service" ? "Ver Serviço" : "Ver Coleção"}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 block sm:hidden">
                          <span className="block w-full text-center text-xs font-bold text-white bg-brand-green rounded-full py-1.5 group-hover:bg-[#047857] transition-colors">
                            {linkedItem.type === "product" ? "Ver Produto" : linkedItem.type === "service" ? "Ver Serviço" : "Ver Coleção"}
                          </span>
                        </div>
                      </div>
                    </Link>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}


