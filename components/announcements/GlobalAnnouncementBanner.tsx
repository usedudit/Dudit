"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangleIcon, InfoIcon, ShieldAlertIcon, XIcon, ArrowRightIcon } from "@/lib/icons"
import type { GlobalAnnouncementConfig } from "@/lib/system/types"

interface GlobalAnnouncementBannerProps {
  initialAnnouncement?: GlobalAnnouncementConfig | null
}

const STORAGE_KEY_PREFIX = "dudit_dismissed_announcement_"

export function GlobalAnnouncementBanner({ initialAnnouncement }: GlobalAnnouncementBannerProps) {
  const pathname = usePathname()
  const [announcement, setAnnouncement] = useState<GlobalAnnouncementConfig | null>(
    initialAnnouncement || null
  )
  const [isDismissed, setIsDismissed] = useState(true) // start true to prevent flash before checking localStorage

  useEffect(() => {
    if (!initialAnnouncement) {
      // If not passed initially, fetch asynchronously
      fetch("/api/system/announcement")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.active) {
            setAnnouncement(data)
          }
        })
        .catch(() => {})
    }
  }, [initialAnnouncement])

  useEffect(() => {
    if (!announcement || !announcement.active || !announcement.id) {
      setIsDismissed(true)
      return
    }

    // Check expiration
    if (announcement.expires_at && new Date(announcement.expires_at) < new Date()) {
      setIsDismissed(true)
      return
    }

    // Check localStorage
    try {
      const dismissed = localStorage.getItem(`${STORAGE_KEY_PREFIX}${announcement.id}`)
      setIsDismissed(Boolean(dismissed))
    } catch {
      setIsDismissed(false)
    }
  }, [announcement])

  // Don't show inside print or maintenance pages
  if (pathname?.startsWith("/print") || pathname?.startsWith("/manutencao")) {
    return null
  }

  if (isDismissed || !announcement || !announcement.active || !announcement.message) {
    return null
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${announcement.id}`, "true")
    } catch {}
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

  const IconComponent = isUrgent ? ShieldAlertIcon : isWarning ? AlertTriangleIcon : InfoIcon

  return (
    <AnimatePresence>
      {!isDismissed && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="relative z-40 w-full overflow-hidden border-b backdrop-blur-md"
        >
          <div className={`w-full px-4 py-2.5 sm:py-3 transition-colors ${bgClasses}`}>
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm">
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
    </AnimatePresence>
  )
}
