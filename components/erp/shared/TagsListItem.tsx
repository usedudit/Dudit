"use client"

import React from "react"
import { ListItem } from "@/components/reusable"

interface TagsListItemProps {
    tags: string[]
    onClick: () => void
    disabled?: boolean
    title?: string
    className?: string
}

/**
 * Item de lista usado nos formulários de produto/serviço/vídeo para abrir
 * o modal de palavras-chave. Mantém o layout estável mesmo com tags longas,
 * mostrando apenas uma prévia compacta ao lado do título.
 */
export const TagsListItem: React.FC<TagsListItemProps> = ({
    tags,
    onClick,
    disabled = false,
    title = "Gerenciar palavras-chave",
    className = "",
}) => {
    const previewLimit = 1
    const previewTags = tags.slice(0, previewLimit)
    const remaining = tags.length - previewTags.length

    return (
        <ListItem
            title={title}
            description={tags.length > 0
                ? `${tags.length} tag${tags.length !== 1 ? "s" : ""} cadastrada${tags.length !== 1 ? "s" : ""}`
                : "Nenhuma tag cadastrada"}
            right={tags.length > 0 ? (
                <div className="flex min-w-0 items-center justify-end gap-1.5">
                    {previewTags.map((tag: string, i: number) => (
                        <span
                            key={`${tag}-${i}`}
                            className="inline-flex h-6 max-w-[96px] items-center rounded-full bg-brand-gray dark:bg-dark-border/40 px-2.5 text-[11px] font-medium text-brand-dark dark:text-dark-heading"
                        >
                            <span className="truncate">{tag}</span>
                        </span>
                    ))}
                    {remaining > 0 && (
                        <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-brand-gray dark:bg-dark-border/40 px-2 text-[11px] font-medium text-brand-inactive-text dark:text-dark-body whitespace-nowrap">
                            +{remaining}
                        </span>
                    )}
                </div>
            ) : null}
            rightClassName="max-w-[55%] min-w-0 overflow-hidden"
            showChevron
            onClick={onClick}
            disabled={disabled}
            className={disabled ? className : `cursor-pointer ${className}`}
        />
    )
}

export default TagsListItem
