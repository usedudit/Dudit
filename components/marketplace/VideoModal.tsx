"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { recordVideoClick } from "@/app/actions/marketplace/community-videos"
import { getLinkedItemData, type LinkedItemData } from "@/app/actions/marketplace/video-linked-item"
import Link from "next/link"
import { XIcon, StarIcon, ChevronDownIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { ShoppingBag, Sparkles } from "lucide-react"

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

const MAX_DESC_LENGTH = 100

export function VideoModal({ video, isOpen, onClose }: VideoModalProps) {
  const [mounted, setMounted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [linkedItem, setLinkedItem] = useState<LinkedItemData | null>(null)
  const [linkedItemLoading, setLinkedItemLoading] = useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [isCardMinimized, setIsCardMinimized] = useState(false)

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
    setIsCardMinimized(false)
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
  const storeName = video?.partner?.name || video?.partner?.store_name || "Loja Parceira"
  const storeLogo = video?.partner?.store_image_url

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && video && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed inset-0 z-[9999] bg-black select-none overflow-hidden"
          onClick={onClose}
        >
          {/* Top Bar Header Overlay */}
          <div
            className="absolute top-0 left-0 right-0 z-30 p-3 sm:p-5 flex items-start justify-between gap-3 pointer-events-none"
          >
            {/* Store & Video Title Badge */}
            <div
              className="pointer-events-auto max-w-[calc(100%-60px)] sm:max-w-md bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-2xl p-2.5 sm:p-3 border border-white/15 transition-colors shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5">
                {storeLogo ? (
                  <img
                    src={storeLogo}
                    alt={storeName}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover shrink-0 border border-white/20"
                  />
                ) : (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-brand-green/80 flex items-center justify-center text-white font-bold text-xs shrink-0">
                    {storeName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-bold text-white leading-tight truncate">
                    {storeName}
                  </p>
                  {video.title && (
                    <p className="text-[11px] sm:text-xs text-white/80 leading-tight truncate mt-0.5 font-medium">
                      {video.title}
                    </p>
                  )}
                </div>
              </div>

              {/* Expandable description if present */}
              {description && (
                <div className="mt-2 pt-2 border-t border-white/10 text-[11px] sm:text-xs text-white/90">
                  <p className={!descriptionExpanded ? "line-clamp-2" : "whitespace-pre-wrap max-h-32 overflow-y-auto"}>
                    {description}
                  </p>
                  {shouldTruncate && (
                    <button
                      onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                      className="flex items-center gap-0.5 text-brand-green font-bold text-[10px] mt-1 hover:underline cursor-pointer"
                    >
                      {descriptionExpanded ? "Ver menos" : "Ver mais"}
                      <ChevronDownIcon size={12} className={`transition-transform duration-200 ${descriptionExpanded ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              className="pointer-events-auto w-10 h-10 sm:w-11 sm:h-11 bg-black/40 hover:bg-black/70 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95 border border-white/15 cursor-pointer shadow-lg shrink-0"
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

          {/* Shopee-style Floating Product / Service / Collection Card (Bottom Left, Elevated above Video Controls) */}
          <div className="absolute bottom-16 sm:bottom-20 left-3 sm:left-6 z-30 pointer-events-auto">
            {/* Loading Skeleton for Linked Item */}
            {linkedItemLoading && (
              <div
                className="bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md p-2.5 rounded-2xl shadow-2xl border border-white/20 dark:border-dark-border/40 flex items-center gap-3 w-[260px] animate-pulse"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-dark-border/50 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-200 dark:bg-dark-border/50 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 dark:bg-dark-border/50 rounded w-1/2" />
                </div>
              </div>
            )}

            {/* Linked Item Full Card */}
            {linkedItem && !linkedItemLoading && !isCardMinimized && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 15 }}
                transition={{ duration: 0.2 }}
                className="relative bg-white/95 dark:bg-[#18181b]/95 backdrop-blur-md p-2.5 sm:p-3 rounded-2xl shadow-2xl border border-white/30 dark:border-dark-border/60 max-w-[330px] sm:max-w-[370px] w-[calc(100vw-32px)] sm:w-[360px]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Minimize / Hide button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsCardMinimized(true)
                  }}
                  className="absolute -top-2.5 -right-2.5 w-6 h-6 bg-brand-dark/80 hover:bg-brand-dark text-white rounded-full flex items-center justify-center shadow-md transition-transform hover:scale-110 cursor-pointer border border-white/20"
                  title="Ocultar item"
                  aria-label="Ocultar item"
                >
                  <XIcon size={12} />
                </button>

                <div className="flex items-center gap-3">
                  {/* Thumbnail */}
                  <Link
                    href={linkedItem.url}
                    onClick={handleLinkedClick}
                    className="shrink-0 block group"
                  >
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-dark-border/40 shrink-0 border border-black/5 dark:border-white/10 relative">
                      <img
                        src={linkedItem.imageUrl}
                        alt={linkedItem.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    </div>
                  </Link>

                  {/* Info details */}
                  <Link
                    href={linkedItem.url}
                    onClick={handleLinkedClick}
                    className="flex-1 min-w-0 flex flex-col justify-between hover:no-underline group"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[9px] sm:text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-brand-green/15 text-brand-green dark:bg-brand-green/25 shrink-0">
                        {linkedItem.type === "product" ? "Produto" : linkedItem.type === "service" ? "Serviço" : "Coleção"}
                      </span>
                      {(linkedItem.rating ?? 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-[11px] font-bold text-amber-500">
                          <StarIcon size={11} className="fill-amber-500 text-amber-500" />
                          {Number(linkedItem.rating).toFixed(1)}
                        </span>
                      )}
                    </div>

                    <h4 className="font-bold text-xs sm:text-sm text-brand-dark dark:text-dark-heading line-clamp-1 leading-snug group-hover:text-brand-green transition-colors">
                      {linkedItem.name}
                    </h4>

                    <div className="flex items-baseline gap-1.5 mt-1">
                      {linkedItem.type === "collection" ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                          {linkedItem.itemsCount} {linkedItem.itemsCount === 1 ? "item" : "itens"}
                        </span>
                      ) : linkedItem.showPrice !== false ? (
                        <>
                          <span className="text-xs sm:text-sm font-black text-brand-green">
                            {formatCurrency(linkedItem.displayPrice || 0)}
                          </span>
                          {linkedItem.referencePrice && linkedItem.hasDiscount && (
                            <span className="text-[10px] sm:text-[11px] text-gray-400 line-through">
                              {formatCurrency(linkedItem.referencePrice)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                          Preço sob consulta
                        </span>
                      )}
                    </div>
                  </Link>

                  {/* Direct Action CTA Button */}
                  <Link
                    href={linkedItem.url}
                    onClick={handleLinkedClick}
                    className="shrink-0 px-3 py-2 rounded-xl bg-brand-green hover:bg-[#047857] text-white text-xs font-bold transition-all shadow-sm active:scale-95 flex items-center justify-center hover:no-underline"
                  >
                    Ver
                  </Link>
                </div>
              </motion.div>
            )}

            {/* Minimized Pill (Shopee style toggle) */}
            {linkedItem && !linkedItemLoading && isCardMinimized && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={(e) => {
                  e.stopPropagation()
                  setIsCardMinimized(false)
                }}
                className="bg-white/95 dark:bg-[#18181b]/95 hover:bg-white dark:hover:bg-dark-surface backdrop-blur-md px-3.5 py-2 rounded-full shadow-2xl border border-white/30 dark:border-dark-border/60 text-xs font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                title="Ver item linkado"
                aria-label="Ver item linkado"
              >
                <ShoppingBag size={14} className="text-brand-green" />
                <span>Ver {linkedItem.type === "product" ? "produto" : linkedItem.type === "service" ? "serviço" : "coleção"}</span>
              </motion.button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}


