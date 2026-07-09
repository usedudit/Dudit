"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { Button, Input, FormTextarea, Badge, FormSection, TagsInput } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import CommunityVideoUploadSection from "./CommunityVideoUploadSection"
import SelectVideoProductSheet from "./SelectVideoProductSheet"
import SelectVideoServiceSheet from "./SelectVideoServiceSheet"
import { ChevronLeftIcon, LinkIcon } from "@/lib/icons"
import type { VideoMetadata } from "@/lib/video/shared"

interface VideoFormPageProps {
    video?: any
    onSave: (data: any) => Promise<void>
    onBack: () => void
    isLoading?: boolean
    partnerId?: string
    readOnly?: boolean
}

const EMPTY_VIDEO: VideoMetadata = {
    video_type: null,
    video_url: null,
    video_thumbnail: null,
    video_duration: null,
    video_provider_id: null,
}

export default function VideoFormPage({ video, onSave, onBack, isLoading, partnerId, readOnly }: VideoFormPageProps) {
    const isEditing = !!video
    const [saving, setSaving] = useState(false)

    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [videoMeta, setVideoMeta] = useState<VideoMetadata>(EMPTY_VIDEO)
    const [tags, setTags] = useState<string[]>([])

    const [linkedItem, setLinkedItem] = useState<{ id: string; name: string; type: "product" | "service" } | null>(null)
    const [linkedCollectionUrl, setLinkedCollectionUrl] = useState("")

    const [showProductSheet, setShowProductSheet] = useState(false)
    const [showServiceSheet, setShowServiceSheet] = useState(false)

    const [errors, setErrors] = useState<Record<string, string>>({})

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    useEffect(() => {
        if (video) {
            setTitle(video.title || "")
            setDescription(video.description || "")
            setVideoMeta({
                video_type: video.video_type || (video.video_url ? "upload" : null),
                video_url: video.video_url || null,
                video_thumbnail: video.video_thumbnail || null,
                video_duration: video.duration || video.video_duration || null,
                video_provider_id: video.video_provider_id || null,
            })
            if (video.linked_item_type === "product" && video.linked_item_id) {
                setLinkedItem({ id: video.linked_item_id, name: "", type: "product" })
            } else if (video.linked_item_type === "service" && video.linked_item_id) {
                setLinkedItem({ id: video.linked_item_id, name: "", type: "service" })
            } else {
                setLinkedItem(null)
            }
            setLinkedCollectionUrl(video.linked_collection_url || "")
        }
    }, [video])

    const linkedProductId = linkedItem?.type === "product" ? linkedItem.id : null
    const linkedServiceId = linkedItem?.type === "service" ? linkedItem.id : null

    const validate = useCallback(() => {
        const errs: Record<string, string> = {}
        if (!title.trim()) errs.title = "O título é obrigatório"
        if (!videoMeta.video_url) errs.videoUrl = "Adicione um vídeo"
        setErrors(errs)
        return Object.keys(errs).length === 0
    }, [title, videoMeta.video_url])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (readOnly) return
        if (!validate()) return
        setSaving(true)
        try {
            await onSave({
                title: title.trim(),
                description: description.trim(),
                video_url: videoMeta.video_url,
                video_thumbnail: videoMeta.video_thumbnail,
                duration: videoMeta.video_duration ? Math.round(videoMeta.video_duration) : null,
                video_type: videoMeta.video_type,
                video_provider_id: videoMeta.video_provider_id,
                tags,
                linked_product_id: linkedProductId,
                linked_service_id: linkedServiceId,
                linked_collection_url: linkedCollectionUrl.trim() || null,
            })
        } finally {
            setSaving(false)
        }
    }

    const handleBack = useCallback(() => onBack?.(), [onBack])

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        {readOnly ? "Vídeo" : isEditing ? "Editar Vídeo" : "Novo Vídeo"}
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        {readOnly ? "Visualizando vídeo da comunidade." : isEditing ? "Atualize as informações do vídeo comunitário" : "Adicione um novo vídeo à comunidade"}
                                    </div>
                                </div>

                                {/* Desktop action buttons */}
                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    <Button variant="outline" onClick={handleBack}>
                                        {readOnly ? "Voltar" : "Cancelar"}
                                    </Button>
                                    {!readOnly && (
                                        <Button onClick={handleSubmit} disabled={saving || isLoading}>
                                            {saving || isLoading ? "Salvando..." : isEditing ? "Atualizar" : "Criar"}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="max-w-[1300px] mx-auto w-full px-4 md:px-6 py-6">
                        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                            {/* Left Column */}
                            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                <FormSection title="Informações do Vídeo" description="Preencha os detalhes principais do vídeo.">
                                    <div className="space-y-5">
                                        <Input label="Título" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do vídeo" error={!!errors.title} errorMessage={errors.title} disabled={readOnly} />
                                        <FormTextarea label="Descrição" name="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição do vídeo..." rows={4} disabled={readOnly} />
                                        {readOnly ? (
                                            <div className="space-y-2">
                                                <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading">Vídeo</label>
                                                {videoMeta.video_url && (
                                                    <div className="w-full aspect-video overflow-hidden rounded-lg border border-brand-border dark:border-dark-border bg-black">
                                                        {videoMeta.video_type === "youtube" || videoMeta.video_type === "vimeo" ? (
                                                            <iframe
                                                                src={videoMeta.video_type === "youtube"
                                                                    ? `https://www.youtube.com/embed/${videoMeta.video_provider_id}`
                                                                    : `https://player.vimeo.com/video/${videoMeta.video_provider_id}`
                                                                }
                                                                title="Preview do vídeo"
                                                                loading="lazy"
                                                                allow="accelerometer; encrypted-media; picture-in-picture"
                                                                allowFullScreen
                                                                className="w-full h-full"
                                                            />
                                                        ) : (
                                                            <video
                                                                src={videoMeta.video_url}
                                                                poster={videoMeta.video_thumbnail || undefined}
                                                                controls
                                                                preload="metadata"
                                                                playsInline
                                                                className="w-full h-full object-contain bg-black"
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <CommunityVideoUploadSection
                                                video={videoMeta}
                                                onChange={setVideoMeta}
                                            />
                                        )}
                                        <TagsInput
                                            label="Tags"
                                            tags={tags}
                                            onChange={setTags}
                                            placeholder="Digite uma tag e pressione Enter"
                                            disabled={readOnly}
                                        />
                                    </div>
                                </FormSection>
                            </div>

                            {/* Right Column */}
                            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                {/* Sidebar Card: Vinculações */}
                                <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Vinculações</h3>
                                    <div className="space-y-5">
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-brand-dark dark:text-dark-heading">
                                                Produto Vinculado
                                            </label>
                                            {linkedItem?.type === "product" ? (
                                                <div className="flex items-center gap-3 rounded-lg border border-brand-border bg-brand-gray/30 p-3 dark:border-dark-border dark:bg-dark-border/20">
                                                    <Badge variant="green" className="whitespace-nowrap">Vinculado</Badge>
                                                    <span className="text-sm text-brand-dark dark:text-dark-heading truncate flex-1">
                                                        {linkedItem.name || linkedItem.id}
                                                    </span>
                                                    {!readOnly && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setLinkedItem(null)}
                                                            className="text-sm text-red-500 hover:text-red-600"
                                                        >
                                                            Remover
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <Button variant="outline" type="button" onClick={() => setShowProductSheet(true)} className="w-full" disabled={readOnly}>
                                                    Selecionar Produto
                                                </Button>
                                            )}
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-brand-dark dark:text-dark-heading">
                                                Serviço Vinculado
                                            </label>
                                            {linkedItem?.type === "service" ? (
                                                <div className="flex items-center gap-3 rounded-lg border border-brand-border bg-brand-gray/30 p-3 dark:border-dark-border dark:bg-dark-border/20">
                                                    <Badge variant="cyan" className="whitespace-nowrap">Vinculado</Badge>
                                                    <span className="text-sm text-brand-dark dark:text-dark-heading truncate flex-1">
                                                        {linkedItem.name || linkedItem.id}
                                                    </span>
                                                    {!readOnly && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setLinkedItem(null)}
                                                            className="text-sm text-red-500 hover:text-red-600"
                                                        >
                                                            Remover
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <Button variant="outline" type="button" onClick={() => setShowServiceSheet(true)} className="w-full" disabled={readOnly}>
                                                    Selecionar Serviço
                                                </Button>
                                            )}
                                        </div>
                                        <Input
                                            label="Link da Coleção"
                                            name="linkedCollectionUrl"
                                            value={linkedCollectionUrl}
                                            onChange={(e) => setLinkedCollectionUrl(e.target.value)}
                                            placeholder="https://dudit.com.br/colecoes/nome-da-colecao"
                                            prefix={<LinkIcon size={18} />}
                                            disabled={readOnly}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Action Bar */}
                {!readOnly && (
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        <Button variant="outline" onClick={handleBack} className="flex-1 h-12">
                            Cancelar
                        </Button>
                        <Button onClick={handleSubmit} disabled={saving || isLoading} className="flex-1 h-12">
                            {saving || isLoading ? "Salvando..." : isEditing ? "Atualizar" : "Criar"}
                        </Button>
                    </div>
                )}

                {!readOnly && (
                    <>
                        <SelectVideoProductSheet
                            isOpen={showProductSheet}
                            onClose={() => setShowProductSheet(false)}
                            partnerId={partnerId || ""}
                            selectedId={linkedProductId}
                            onSave={(id, name) => setLinkedItem(id ? { id, name: name || "", type: "product" } : null)}
                        />
                        <SelectVideoServiceSheet
                            isOpen={showServiceSheet}
                            onClose={() => setShowServiceSheet(false)}
                            partnerId={partnerId || ""}
                            selectedId={linkedServiceId}
                            onSave={(id, name) => setLinkedItem(id ? { id, name: name || "", type: "service" } : null)}
                        />
                    </>
                )}
            </div>
        </FadeIn>
    )
}
