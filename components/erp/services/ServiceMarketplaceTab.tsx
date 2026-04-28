"use client"

import type React from "react"
import { useState } from "react"
import { Input, Checkbox, Button } from "@/components/reusable"
import { XIcon, LinkIcon } from "@/lib/icons"

interface ServiceMarketplaceTabProps {
    serviceData: any
    handleInputChange: (e: any) => void
    isEditing: boolean
}

export const ServiceMarketplaceTab: React.FC<ServiceMarketplaceTabProps> = ({
    serviceData, handleInputChange, isEditing
}) => {
    const [tagInput, setTagInput] = useState("")

    const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && tagInput.trim()) {
            e.preventDefault()
            const currentTags = serviceData.tags || []
            if (!currentTags.includes(tagInput.trim())) {
                handleInputChange({
                    target: { name: "tags", value: [...currentTags, tagInput.trim()] }
                })
            }
            setTagInput("")
        }
    }

    const removeTag = (tagToRemove: string) => {
        const currentTags = serviceData.tags || []
        handleInputChange({
            target: { name: "tags", value: currentTags.filter((t: string) => t !== tagToRemove) }
        })
    }

    return (
        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                        Vitrine e Marketplace
                    </h3>
                    <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-1 mb-6">
                        Configure como seu serviço será exibido para seus clientes no seu site/catálogo online.
                    </p>

                    <div className="bg-brand-gray/30 dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border space-y-6">
                        <div className="flex flex-col gap-4">
                            <Checkbox
                                label="Exibir este serviço na sua vitrine online"
                                checked={serviceData.show_in_marketplace}
                                onChange={(c) => handleInputChange({ target: { name: "show_in_marketplace", value: c } })}
                                disabled={!isEditing}
                                name="show_in_marketplace"
                            />

                            <Checkbox
                                label="Destacar serviço (Aparece no topo e na página inicial)"
                                checked={serviceData.highlight_service}
                                onChange={(c) => handleInputChange({ target: { name: "highlight_service", value: c } })}
                                disabled={!isEditing}
                                name="highlight_service"
                            />
                        </div>
                    </div>
                </div>

                <div className="mb-8">
                    <h3 className="text-md font-bold text-brand-dark dark:text-dark-heading mb-4">Informações Adicionais</h3>

                    <div className="space-y-6">
                        <Input
                            label="Link do Vídeo"
                            name="video_url"
                            value={serviceData.video_url || ""}
                            onChange={handleInputChange}
                            disabled={!isEditing}
                            placeholder="Ex: https://youtube.com/watch?v=..."
                            suffix={<LinkIcon className="w-5 h-5 text-brand-inactive-text" />}
                        />

                        <Input
                            label="Garantia ou Condições"
                            name="warranty"
                            value={serviceData.warranty || ""}
                            onChange={handleInputChange}
                            disabled={!isEditing}
                            placeholder="Ex: 30 dias de retorno gratuito, Garantia de satisfação..."
                        />
                    </div>
                </div>
            </div>

            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border">
                <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Tags e Buscas</h3>
                    <p className="text-sm text-brand-inactive-text mb-4">
                        Adicione palavras-chave para ajudar os clientes a encontrarem este serviço na busca.
                    </p>

                    <div className="mb-4">
                        <Input
                            name="tagInput"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
                            disabled={!isEditing}
                            placeholder="Digite a tag e aperte Enter"
                            label="Nova Tag"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {(serviceData.tags || []).map((tag: string, index: number) => (
                            <div key={index} className="flex items-center gap-1 bg-brand-gray/50 dark:bg-dark-border px-3 py-1.5 rounded-full text-sm font-medium">
                                {tag}
                                {isEditing && (
                                    <button
                                        type="button"
                                        onClick={() => removeTag(tag)}
                                        className="text-brand-inactive-text hover:text-red-500 transition-colors ml-1"
                                    >
                                        <XIcon className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                        {(!serviceData.tags || serviceData.tags.length === 0) && (
                            <span className="text-sm text-brand-inactive-text italic">Nenhuma tag adicionada.</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
