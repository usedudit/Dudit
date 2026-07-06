"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { PlayIcon } from "@/lib/icons"
import { formatDate } from "@/lib/utils"

const STATUS_VARIANTS: Record<string, "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray"> = {
    pending_moderation: "orange",
    approved: "green",
    rejected: "red",
    flagged: "red",
}

const STATUS_LABELS: Record<string, string> = {
    pending_moderation: "Pendente",
    approved: "Aprovado",
    rejected: "Rejeitado",
    flagged: "Sinalizado",
}

interface VideoGridCardProps {
    video: any
    selected: boolean
    onSelect: (id: string) => void
    onDetails: (video: any) => void
    onEdit: (video: any) => void
    onDelete: (video: any) => void
    onPrefetchMouseEnter?: () => void
    onPrefetchMouseLeave?: () => void
    onPrefetchTouchStart?: () => void
}

const VideoGridCard = React.memo(
    ({
        video,
        selected,
        onSelect,
        onDetails,
        onEdit,
        onDelete,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: VideoGridCardProps) => {
        return (
            <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`group relative bg-white dark:bg-dark-surface rounded-xl border border-gray-100 dark:border-dark-border overflow-hidden hover:shadow-md transition-all cursor-pointer ${selected ? "ring-2 ring-brand-green" : ""}`}
                onClick={() => onDetails(video)}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                <div className="relative aspect-[9/16] bg-brand-gray dark:bg-dark-border overflow-hidden">
                    {video.video_thumbnail ? (
                        <img src={video.video_thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <PlayIcon className="w-8 h-8 text-brand-inactive-text" />
                        </div>
                    )}
                    <Badge variant={STATUS_VARIANTS[video.moderation_status] || "gray"} className="absolute top-2 left-2 text-xs">
                        {STATUS_LABELS[video.moderation_status] || video.moderation_status}
                    </Badge>
                    <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => onSelect(video.id)}
                            className="w-4 h-4 rounded border-gray-300 text-brand-green focus:ring-brand-green"
                        />
                    </div>
                    <div className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-2 py-0.5 rounded">
                        {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, "0")}
                    </div>
                </div>
                <div className="p-3 space-y-1">
                    <h3 className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                        {video.title || "Sem título"}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-brand-inactive-text">
                        <span>{video.views_count} visualizações</span>
                        <span>{video.clicks_count} cliques</span>
                    </div>
                    <p className="text-xs text-brand-inactive-text">
                        {video.published_at ? formatDate(video.published_at) : formatDate(video.created_at)}
                    </p>
                </div>
            </motion.div>
        )
    }
)

VideoGridCard.displayName = "VideoGridCard"

export default VideoGridCard
