"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangleIcon, InfoIcon, ShieldIcon, XIcon, ArrowRightIcon } from "@/lib/icons"
import type { GlobalAnnouncementConfig } from "@/lib/system/types"

interface GlobalAnnouncementBannerProps {
  initialAnnouncement?: GlobalAnnouncementConfig | null
}

const STORAGE_KEY_PREFIX = "dudit_dismissed_announcement_"

export function GlobalAnnouncementBanner({ initialAnnouncement }: GlobalAnnouncementBannerProps) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [announcement, setAnnouncement] = useState<GlobalAnnouncementConfig | null>(
    initialAnnouncement || null
  )
  const [isDismissed, setIsDismissed] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!initialAnnouncement) {
      fetch("/api/system/announcement")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.active) {
            setAnnouncement(data)
          }
        })
        .catch(() => { })
    }
  }, [initialAnnouncement])

  useEffect(() => {
    if (!announcement || !announcement.active || !announcement.id) {
      setIsDismissed(true)
      return
    }

    if (announcement.expires_at && new Date(announcement.expires_at) < new Date()) {
      setIsDismissed(true)
      return
    }

    try {
      const dismissed = localStorage.getItem(`${STORAGE_KEY_PREFIX}${announcement.id}`)
      setIsDismissed(Boolean(dismissed))
    } catch {
      setIsDismissed(false)
    }
  }, [announcement])

  if (pathname?.startsWith("/print")) {
    return null
  }

  if (!mounted || isDismissed || !announcement || !announcement.active || !announcement.message) {
    return null
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${announcement.id}`, "true")
    } catch { }
  }

  const isUrgent = announcement.type === "urgent"
  const isWarning = announcement.type === "warning"

  const bgClasses = isUrgent
    ? "bg-rose-950/90 border-rose-800/80 text-rose-100"
    : isWarning
      ? "bg-[#181408]/95 border-amber-500/40 text-amber-100"
      : "bg-[#061814]/95 border-emerald-500/40 text-emerald-100"

  const iconBg = isUrgent
    ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
    : isWarning
      ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
      : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"

  const IconComponent = isUrgent ? ShieldIcon : isWarning ? AlertTriangleIcon : InfoIcon

  return createPortal(
    <AnimatePresence>
      {!isDismissed && (
        <motion.div
          initial={{ y: -56, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -56, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md ${bgClasses}`}
        >
          <div className="w-full max-w-7xl mx-auto px-4 py-2.5 sm:py-3">
            <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className={`shrink-0 p-1.5 rounded-lg border flex items-center justify-center ${iconBg}`}>
                  <IconComponent className="w-4 h-4" />
                </span>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                  {announcement.title && (
                    <span className="font-bold tracking-tight shrink-0">
                      {announcement.title}:
                    </span>
                  )}
                  <span className="text-zinc-200 truncate sm:whitespace-normal font-medium">
                    {announcement.message}
                  </span>

                  {announcement.link_url && (
                    <Link
                      href={announcement.link_url}
                      className="inline-flex items-center gap-1 font-bold underline underline-offset-2 hover:opacity-80 transition ml-1 shrink-0 text-white"
                    >
                      {announcement.link_text || "Saiba mais"}
                      <ArrowRightIcon className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>

              {announcement.closable && (
                <button
                  onClick={handleDismiss}
                  aria-label="Fechar aviso"
                  className="shrink-0 p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
