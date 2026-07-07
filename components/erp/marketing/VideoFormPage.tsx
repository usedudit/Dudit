"use client"

import React, { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { Button, Input, FormTextarea, Badge, FormSection } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import SelectVideoProductSheet from "./SelectVideoProductSheet"
import SelectVideoServiceSheet from "./SelectVideoServiceSheet"
import { ChevronLeftIcon, LinkIcon, PlayIcon } from "@/lib/icons"
import { supabaseBrowser } from "@/lib/supabase/browser-client"

interface VideoFormPageProps {
    video?: any
    onSave: (data: any) => Promise<void>
    onCancel: () => void
    isLoading?: boolean
}

export default function VideoFormPage({ video, onSave, onCancel, isLoading }: VideoFormPageProps) {
    const isEditing = !!video
    const [saving, setSaving] = useState(false)

    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [videoUrl, setVideoUrl] = useState("")
    const [videoThumbnail, setVideoThumbnail] = useState("")
    const [publishedAt, setPublishedAt] = useState("")
    const [duration, setDuration] = useState(0)
    const [tags, setTags] = useState<string[]>([])

    const [linkedProductId, setLinkedProductId] = useState<string | null>(null)
    const [linkedServiceId, setLinkedServiceId] = useState<string | null>(null)
    const [linkedCollectionUrl, setLinkedCollectionUrl] = useState("")

    const [showProductSheet, setShowProductSheet] = useState(false)
    const [showServiceSheet, setShowServiceSheet] = useState(false)

    const [products, setProducts] = useState<any[]>([])
    const [services, setServices] = useState<any[]>([])
    const [loadingProducts, setLoadingProducts] = useState(false)
    const [loadingServices, setLoadingServices] = useState(false)

    const [errors, setErrors] = useState<Record<string, string>>({})

    useEffect(() => {
        if (video) {
            setTitle(video.title || "")
            setDescription(video.description || "")
            setVideoUrl(video.video_url || "")
            setVideoThumbnail(video.video_thumbnail || "")
            setPublishedAt(video.published_at ? video.published_at.split("T")[0] : "")
            setDuration(video.duration || 0)
            setTags(video.tags || [])
            setLinkedProductId(video.linked_product_id || null)
            setLinkedServiceId(video.linked_service_id || null)
            setLinkedCollectionUrl(video.linked_collection_url || "")
        }
    }, [video])

    useEffect(() => {
        fetchProducts()
        fetchServices()
    }, [])

    async function fetchProducts() {
        setLoadingProducts(true)
        try {
            const { data } = await supabaseBrowser.from("products").select("id, name, image, price, is_active").order("name")
            setProducts(data || [])
        } catch (err) {
            console.error(err)
        } finally {
            setLoadingProducts(false)
        }
    }

    async function fetchServices() {
        setLoadingServices(true)
        try {
            const { data } = await supabaseBrowser.from("services").select("id, name, image, price, is_active").order("name")
            setServices(data || [])
        } catch (err) {
            console.error(err)
        } finally {
            setLoadingServices(false)
        }
    }

    const validate = useCallback(() => {
        const errs: Record<string, string> = {}
        if (!title.trim()) errs.title = "O título é obrigatório"
        if (!videoUrl.trim()) errs.videoUrl = "A URL do vídeo é obrigatória"
        setErrors(errs)
        return Object.keys(errs).length === 0
    }, [title, videoUrl])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!validate()) return
        setSaving(true)
        try {
            await onSave({
                title: title.trim(),
                description: description.trim(),
                video_url: videoUrl.trim(),
                video_thumbnail: videoThumbnail.trim() || null,
                published_at: publishedAt ? new Date(publishedAt).toISOString() : null,
                duration,
                tags,
                linked_product_id: linkedProductId,
                linked_service_id: linkedServiceId,
                linked_collection_url: linkedCollectionUrl.trim() || null,
            })
        } finally {
            setSaving(false)
        }
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col bg-white dark:bg-dark-background min-h-screen">
            {/* Sticky Header */}
            <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
                <div className="max-w-[1300px] mx-auto px-4 md:px-6 py-4">
                    <div className="hidden md:flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button onClick={onCancel} className="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-border/40 transition-colors">
                                <ChevronLeftIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                            </button>
                            <div>
                                <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                    {isEditing ? "Editar Vídeo" : "Novo Vídeo"}
                                </h1>
                                <p className="text-sm text-brand-inactive-text">
                                    {isEditing ? "Atualize as informações do vídeo comunitário." : "Adicione um novo vídeo à comunidade."}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button variant="outline" onClick={onCancel}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSubmit} disabled={saving || isLoading}>
                                {saving || isLoading ? "Salvando..." : isEditing ? "Atualizar" : "Criar"}
                            </Button>
                        </div>
                    </div>
                    {/* Mobile header */}
                    <div className="flex md:hidden items-center gap-3">
                        <button onClick={onCancel} className="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-border/40 transition-colors">
                            <ChevronLeftIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                        </button>
                        <div className="flex-1">
                            <h1 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                {isEditing ? "Editar Vídeo" : "Novo Vídeo"}
                            </h1>
                        </div>
                        <Button size="sm" onClick={handleSubmit} disabled={saving || isLoading}>
                            {saving || isLoading ? "..." : isEditing ? "Salvar" : "Criar"}
                        </Button>
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
                                <Input label="Título" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do vídeo" error={!!errors.title} errorMessage={errors.title} />
                                <FormTextarea label="Descrição" name="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição do vídeo..." rows={4} />
                                <Input label="URL do Vídeo" name="videoUrl" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." prefix={<PlayIcon size={18} />} error={!!errors.videoUrl} errorMessage={errors.videoUrl} />
                                <Input label="URL da Thumbnail" name="videoThumbnail" value={videoThumbnail} onChange={(e) => setVideoThumbnail(e.target.value)} placeholder="https://..." />
                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                    <Input label="Publicado em" name="publishedAt" type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
                                    <Input label="Duração (segundos)" name="duration" type="number" value={duration.toString()} onChange={(e) => setDuration(Number(e.target.value))} />
                                </div>
                                <Input label="Tags (separadas por vírgula)" name="tags" value={tags.join(", ")} onChange={(e) => setTags(e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} placeholder="tag1, tag2, tag3" />
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
                                    {linkedProductId ? (
                                        <div className="flex items-center gap-3 rounded-lg border border-brand-border bg-brand-gray/30 p-3 dark:border-dark-border dark:bg-dark-border/20">
                                            <Badge variant="green" className="whitespace-nowrap">Vinculado</Badge>
                                            <span className="text-sm text-brand-dark dark:text-dark-heading truncate flex-1">
                                                {products.find((p) => p.id === linkedProductId)?.name || linkedProductId}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setLinkedProductId(null)}
                                                className="text-sm text-red-500 hover:text-red-600"
                                            >
                                                Remover
                                            </button>
                                        </div>
                                    ) : (
                                        <Button variant="outline" type="button" onClick={() => setShowProductSheet(true)} className="w-full">
                                            Selecionar Produto
                                        </Button>
                                    )}
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-brand-dark dark:text-dark-heading">
                                        Serviço Vinculado
                                    </label>
                                    {linkedServiceId ? (
                                        <div className="flex items-center gap-3 rounded-lg border border-brand-border bg-brand-gray/30 p-3 dark:border-dark-border dark:bg-dark-border/20">
                                            <Badge variant="cyan" className="whitespace-nowrap">Vinculado</Badge>
                                            <span className="text-sm text-brand-dark dark:text-dark-heading truncate flex-1">
                                                {services.find((s) => s.id === linkedServiceId)?.name || linkedServiceId}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setLinkedServiceId(null)}
                                                className="text-sm text-red-500 hover:text-red-600"
                                            >
                                                Remover
                                            </button>
                                        </div>
                                    ) : (
                                        <Button variant="outline" type="button" onClick={() => setShowServiceSheet(true)} className="w-full">
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
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Bottom Action Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                <Button variant="outline" onClick={onCancel} className="flex-1 h-12">
                    Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={saving || isLoading} className="flex-1 h-12">
                    {saving || isLoading ? "Salvando..." : isEditing ? "Atualizar" : "Criar"}
                </Button>
            </div>

            <SelectVideoProductSheet
                isOpen={showProductSheet}
                onClose={() => setShowProductSheet(false)}
                products={products}
                selectedId={linkedProductId}
                onSave={setLinkedProductId}
                isLoading={loadingProducts}
            />
            <SelectVideoServiceSheet
                isOpen={showServiceSheet}
                onClose={() => setShowServiceSheet(false)}
                services={services}
                selectedId={linkedServiceId}
                onSave={setLinkedServiceId}
                isLoading={loadingServices}
            />
        </motion.div>
    )
}
