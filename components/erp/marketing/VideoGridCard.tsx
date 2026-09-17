"use client"

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
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
    onSelect: () => void
    onDetails: () => void
    onEdit: () => void
    onDelete: () => void
    onView?: () => void
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
        onView,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: VideoGridCardProps) => {
        const duration = video.duration
        const minutes = Math.floor(duration / 60)
        const seconds = (duration % 60).toString().padStart(2, "0")

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative overflow-hidden"
                onClick={onDetails}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                <div className="relative aspect-video bg-brand-gray dark:bg-dark-border overflow-hidden">
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
                    <div className="absolute bottom-2 right-2 text-xs text-white bg-black/60 px-2 py-0.5 rounded">
                        {minutes}:{seconds}
                    </div>
                    <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected} onChange={onSelect} />
                    </div>
                </div>

                <div className="p-3 space-y-2 flex-1 flex flex-col">
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

                <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                    <Tooltip text="Ações">
                        <div className="shrink-0">
                            <ActionsDropdown
                                onView={onView || onDetails}
                                onEdit={onEdit}
                                onDelete={onDelete}
                            />
                        </div>
                    </Tooltip>
                </div>
            </motion.div>
        )
    },
    (prev, next) => prev.selected === next.selected && prev.video === next.video
)

VideoGridCard.displayName = "VideoGridCard"

export default VideoGridCard