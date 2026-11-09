"use client"

import React, { useState, useEffect } from "react"
import { DefaultModal } from "@/components/reusable"
import { TagsInput } from "@/components/reusable"
import { XIcon, PlusIcon } from "@/lib/icons"
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
            description={description}
            maxWidth="md"
            leftAction={
                <span className="text-sm text-brand-inactive-text dark:text-dark-body">
                    {localTags.length}/{maxTags}
                </span>
            }
            footer={
                <div className="flex w-full justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={disabled}>
                        Cancelar
                    </Button>
                    <Button
                        variant="filled"
                        onClick={handleSave}
                        disabled={disabled}
                        leftIcon={<PlusIcon className="w-4 h-4" />}
                    >
                        Salvar
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <TagsInput
                    tags={localTags}
                    onChange={handleTagsChange}
                    disabled={disabled}
                    placeholder="Digite uma palavra-chave e pressione Enter..."
                    className="w-full"
                />

                {localTags.length > 0 && (
                    <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-3">
                            Clique em uma tag para removê-la, ou use a tecla Backspace no campo de entrada.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {localTags.map((tag, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    onClick={() => handleTagsChange(localTags.filter((_, i) => i !== index))}
                                    disabled={disabled}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-gray dark:bg-dark-border text-sm font-medium text-brand-dark dark:text-dark-heading hover:bg-gray-200 dark:hover:bg-dark-border/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span>{tag}</span>
                                    <XIcon className="w-3.5 h-3.5 text-brand-inactive-text" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {localTags.length === 0 && (
                    <div className="text-center py-8 text-brand-inactive-text dark:text-dark-body">
                        <p className="text-sm">Nenhuma palavra-chave adicionada.</p>
                        <p className="text-xs mt-1">Digite acima e pressione Enter para adicionar.</p>
                    </div>
                )}
            </div>
        </DefaultModal>
    )
}

export default TagsManagerModal