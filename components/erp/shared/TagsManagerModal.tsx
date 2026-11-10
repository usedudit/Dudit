"use client"

import React, { useState, useEffect } from "react"
import { DefaultModal } from "@/components/reusable"
import { TagsInput } from "@/components/reusable"
import { PlusIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"

interface TagsManagerModalProps {
    isOpen: boolean
    onClose: () => void
    tags: string[]
    onChange: (tags: string[]) => void
    disabled?: boolean
    title?: string
    description?: string
    maxTags?: number
}

export const TagsManagerModal: React.FC<TagsManagerModalProps> = ({
    isOpen,
    onClose,
    tags,
    onChange,
    disabled = false,
    title = "Palavras-chave de busca",
    description = "Adicione termos relacionados para ajudar clientes a encontrarem este item na busca.",
    maxTags = 20,
}) => {
    const [localTags, setLocalTags] = useState<string[]>(tags)

    // Sync local tags with props when they change externally
    useEffect(() => {
        setLocalTags(tags)
    }, [tags])

    const handleTagsChange = (newTags: string[]) => {
        if (newTags.length <= maxTags) {
            setLocalTags(newTags)
            onChange(newTags)
        }
    }

    const handleSave = () => {
        onChange(localTags)
        onClose()
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            maxWidth="md"
            footer={
                <div className="flex w-full items-center justify-end gap-4">
                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">
                        {localTags.length}/{maxTags}
                    </span>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={onClose} disabled={disabled}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={disabled}
                            leftIcon={<PlusIcon className="w-4 h-4" />}
                        >
                            Salvar
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="space-y-3">
                {description && (
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        {description}
                    </p>
                )}

                <TagsInput
                    tags={localTags}
                    onChange={handleTagsChange}
                    disabled={disabled}
                    placeholder="Digite uma palavra-chave e pressione Enter..."
                    className="w-full"
                    boxClassName="h-[132px] overflow-y-auto custom-scrollbar"
                />

                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                    Use Enter para adicionar. Para remover, clique no <strong>X</strong> da tag ou use Backspace no campo de entrada.
                </p>
            </div>
        </DefaultModal>
    )
}

export default TagsManagerModal
