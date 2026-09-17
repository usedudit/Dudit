"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, Checkbox, Tooltip } from "@/components/reusable"
import { PlayIcon } from "@/lib/icons"
import { formatDate } from "@/lib/utils"

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
    minWidth?: string
}

interface VideoListItemProps {
    video: any
    columns: ColumnDef[]
    selected: boolean
    onSelect: (id: string) => void
    onEdit: (video: any) => void
    onDelete: (video: any) => void
    onDetails: (video: any) => void
    onPrefetchMouseEnter?: () => void
    onPrefetchMouseLeave?: () => void
    onPrefetchTouchStart?: () => void
}

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

const VideoListItem = React.memo(
    ({
        video,
        columns,
        selected,
        onSelect,
        onEdit,
        onDelete,
        onDetails,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: VideoListItemProps) => {
        return (
            <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`group border-b border-brand-border/50 dark:border-dark-border/30 transition-colors hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 cursor-pointer ${selected ? "bg-brand-primary/5 dark:bg-brand-primary/10" : ""}`}
                onClick={() => onDetails(video)}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                <td className="py-3 px-2 pl-6" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center">
                        <Checkbox checked={selected} onChange={() => onSelect(video.id)} />
                    </div>
                </td>
                <td className="py-3 px-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 aspect-[9/16] rounded overflow-hidden bg-brand-gray dark:bg-dark-border shrink-0 relative">
                            {video.video_thumbnail ? (
                                <img src={video.video_thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                                <div className="flex items-center justify-center h-full">
                                    <PlayIcon className="w-4 h-4 text-brand-inactive-text" />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0">
                            <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading truncate block max-w-[200px]">
                                {video.title || "Sem título"}
                            </span>
                        </div>
                    </div>
                </td>
                <td className="py-3 px-2">
                    <Badge variant={STATUS_VARIANTS[video.moderation_status] || "gray"} className="whitespace-nowrap">
                        {STATUS_LABELS[video.moderation_status] || video.moderation_status}
                    </Badge>
                </td>
                <td className="py-3 px-2 text-sm text-brand-inactive-text text-center">
                    {video.views_count}
                </td>
                <td className="py-3 px-2 text-sm text-brand-inactive-text text-center">
                    {video.clicks_count}
                </td>
                <td className="py-3 px-2 text-sm text-brand-inactive-text">
                    {video.published_at ? formatDate(video.published_at) : formatDate(video.created_at)}
                </td>
                <td className="py-3 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <ActionsDropdown
                        onEdit={() => onEdit(video)}
                        onDelete={() => onDelete(video)}
                    />
                </td>
            </motion.tr>
        )
    }
)

VideoListItem.displayName = "VideoListItem"

export default VideoListItem
