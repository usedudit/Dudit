"use client"

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, Tooltip, ActionsDropdown } from "@/components/reusable"
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
    onArchive?: () => void
    onUnarchive?: () => void
    onDuplicate?: () => void
    onShare?: () => void
    onPrefetchMouseEnter?: () => void
    onPrefetchMouseLeave?: () => void
    onPrefetchTouchStart?: () => void
}

const formatDuration = (duration: number | null | undefined) => {
    if (!duration || duration <= 0) return "-"
    const minutes = Math.floor(duration / 60)
    const seconds = Math.floor(duration % 60).toString().padStart(2, "0")
    return `${minutes}:${seconds}`
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
        onArchive,
        onUnarchive,
        onDuplicate,
        onShare,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: VideoGridCardProps) => {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={onDetails}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                <div className="flex gap-4 mb-2">
                    {/* Thumbnail do Vídeo */}
                    <div className="w-18 h-18 rounded-lg bg-brand-gray dark:bg-dark-border shrink-0 overflow-hidden relative">
                        {video.video_thumbnail ? (
                            <img
                                src={video.video_thumbnail}
                                alt={video.title}
                                loading="lazy"
                                className="w-full h-full object-cover rounded-lg bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <PlayIcon className="w-6 h-6 text-brand-inactive-text" />
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        {/* Linha 1: Nome + Badge Status + Checkbox */}
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                                <h3
                                    className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate"
                                    title={video.title}
                                >
                                    <span className="truncate">{video.title || "Sem título"}</span>
                                </h3>
                                <Tooltip text={`Status: ${STATUS_LABELS[video.moderation_status] || video.moderation_status}`}>
                                    <Badge
                                        variant={STATUS_VARIANTS[video.moderation_status] || "gray"}
                                        className="whitespace-nowrap scale-90 shrink-0"
                                    />
                                </Tooltip>
                            </div>

                            {/* Checkbox */}
                            <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selected} onChange={onSelect} />
                            </div>
                        </div>

                        {/* Linha 2: Visualizações • Cliques */}
                        <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate flex items-center">
                            <span>{video.views_count ?? 0} visualizações</span>
                            <span className="mx-1.5">•</span>
                            <span>{video.clicks_count ?? 0} cliques</span>
                        </div>

                        {/* Linha 3: Duração */}
                        <div className="mt-1.5">
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                {formatDuration(video.duration || video.video_duration)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Área do Rodapé */}
                <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex items-end justify-between">
                    {/* Data de publicação */}
                    <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                            {video.published_at ? "Publicado" : "Criado"}
                        </span>
                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                            {formatDate(video.published_at || video.created_at)}
                        </span>
                    </div>

                    {/* Botão de Ações */}
                    <div
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <ActionsDropdown
                            onView={onView || onDetails}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onArchive={onArchive}
                            onUnarchive={onUnarchive}
                            onDuplicate={onDuplicate}
                            onShare={onShare}
                        />
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) =>
        prev.selected === next.selected &&
        prev.video === next.video
)

VideoGridCard.displayName = "VideoGridCard"

export default VideoGridCard
