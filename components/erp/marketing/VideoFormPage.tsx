"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { AnimatePresence } from "framer-motion"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Tabs, TabsList, TabsTrigger, Button, Input, FormTextarea, Badge, FormSection, TagsInput, SidebarCard, ActionsDropdown, ListItem } from "@/components/reusable"
import { TagsManagerModal } from "@/components/erp/shared/TagsManagerModal"
import { ChevronLeftIcon, ChevronDownIcon, LinkIcon, EditIcon, SaveIcon, ThreeDotsIcon } from "@/lib/icons"
import { useSidebar } from "@/lib/sidebar-context"
import { FadeIn } from "@/components/animations/FadeIn"
import CommunityVideoUploadSection from "./CommunityVideoUploadSection"
import SelectVideoProductSheet from "./SelectVideoProductSheet"
import SelectVideoServiceSheet from "./SelectVideoServiceSheet"
import type { VideoMetadata } from "@/lib/video/shared"
import { formatDate } from "@/lib/utils"

interface VideoFormPageProps {
    video?: any
    onSave: (data: any) => Promise<void>
    onBack: () => void
    onEdit?: () => void
    onDelete?: () => void
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

const STATUS_VARIANTS: Record<string, "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray"> = {
    pending_moderation: "orange",
    approved: "green",
    rejected: "red",
    flagged: "red",
}

function formatMetric(value: number | string | null | undefined): string {
    const n = Number(value ?? 0)
    return new Intl.NumberFormat("pt-BR").format(n)
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[150px]">
                <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{label}</p>
                <div className="flex flex-col gap-1.5">
                    {payload.map((entry: any, index: number) => {
                        const color = entry.fill || "var(--color-brand-green)"
                        return (
                            <div key={index} className="flex items-center justify-between gap-6">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-current shrink-0" style={{ color }} />
                                    <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                        {entry.name}
                                    </span>
                                </div>
                                <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                                    {formatMetric(entry.value)}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }
    return null
}

export default function VideoFormPage({ video, onSave, onBack, onEdit, onDelete, isLoading, partnerId, readOnly }: VideoFormPageProps) {
    const isEditing = !!video
    const [saving, setSaving] = useState(false)

    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [videoMeta, setVideoMeta] = useState<VideoMetadata>(EMPTY_VIDEO)
    const [tags, setTags] = useState<string[]>([])
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false)

    const [linkedItem, setLinkedItem] = useState<{ id: string; name: string; type: "product" | "service" } | null>(null)
    const [linkedCollectionUrl, setLinkedCollectionUrl] = useState("")

    const [showProductSheet, setShowProductSheet] = useState(false)
    const [showServiceSheet, setShowServiceSheet] = useState(false)

    const [errors, setErrors] = useState<Record<string, string>>({})
    const [activeTab, setActiveTab] = useState("general")

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const { setHeaderOverride } = useSidebar()

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
                setLinkedItem({ id: video.linked_item_id, name: video.linked_item_name || "", type: "product" })
            } else if (video.linked_item_type === "service" && video.linked_item_id) {
                setLinkedItem({ id: video.linked_item_id, name: video.linked_item_name || "", type: "service" })
            } else {
                setLinkedItem(null)
            }
            setLinkedCollectionUrl(video.linked_collection_url || (video.linked_item_type === "collection" && video.linked_collection_short_id ? `/colecoes/${video.linked_collection_short_id}` : ""))
            setTags(video.tags || [])
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

    const pageTitle = readOnly ? (video?.title || "Vídeo") : isEditing ? "Editar Vídeo" : "Novo Vídeo"

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [pageTitle, handleBack, setHeaderOverride])

    const getTabErrorCount = (tab: string) => {
        const errorFields: Record<string, string> = {
            title: "general",
            videoUrl: "general",
        }
        return Object.keys(errors).filter((f) => errorFields[f] === tab).length
    }

    const comparisonData = [
        {
            name: "Visualizações",
            total: Number(video?.views_count ?? 0),
            recente: Number(video?.views_last_30_days ?? 0),
        },
        {
            name: "Cliques",
            total: Number(video?.clicks_count ?? 0),
            recente: Number(video?.clicks_last_30_days ?? 0),
        },
    ]

    return (
        <FadeIn className="h-full">
            <div className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-0 scroll-smooth custom-scrollbar">

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
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="hidden md:inline truncate">{readOnly ? (video?.title || "Vídeo") : isEditing ? "Editar Vídeo" : "Novo Vídeo"}</span>
                                            {readOnly && video?.moderation_status && (
                                                <Badge variant={STATUS_VARIANTS[video.moderation_status] || "gray"} className="whitespace-nowrap scale-90 shrink-0" />
                                            )}
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            {readOnly ? "Visualizando vídeo da comunidade." : isEditing ? "Atualize as informações do vídeo comunitário" : "Adicione um novo vídeo à comunidade"}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        {readOnly ? (
                                            <>
                                                {onDelete && (
                                                    <ActionsDropdown
                                                        onDelete={onDelete}
                                                    />
                                                )}
                                                {onEdit && (
                                                    <Button onClick={onEdit} className="whitespace-nowrap" leftIcon={<EditIcon size={18} />}>
                                                        Editar vídeo
                                                    </Button>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <Button variant="outline" onClick={handleBack} disabled={saving || isLoading}>
                                                    Cancelar
                                                </Button>
                                                <Button onClick={handleSubmit} disabled={saving || isLoading} leftIcon={<SaveIcon size={18} />}>
                                                    {saving || isLoading ? "Salvando..." : isEditing ? "Salvar" : "Criar"}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="general">
                                            Dados gerais
                                            {getTabErrorCount("general") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                        </TabsTrigger>
                                        {readOnly && (
                                            <TabsTrigger value="metrics">
                                                Métricas
                                            </TabsTrigger>
                                        )}
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="max-w-[1300px] mx-auto w-full px-4 md:px-6 py-6">
                            <AnimatePresence mode="wait">
                                {activeTab === "general" && (
                                    <FadeIn key="general" className="block">
                                        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                            {/* ESQUERDA (Principal) */}
                                            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                                {readOnly ? (
                                                    <>
                                                        {/* Informações Básicas */}
                                                        <FormSection title="Informações Básicas" className="mb-8">
                                                            <div className="space-y-6">
                                                                <div>
                                                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Título</span>
                                                                    <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                                                        {title || "-"}
                                                                    </h1>
                                                                </div>
                                                            </div>
                                                        </FormSection>

                                                        {/* Descrição */}
                                                        <FormSection title="Descrição" className="mb-8">
                                                            <div className={`relative ${!isDescriptionExpanded ? "max-h-[160px] overflow-hidden" : ""}`}>
                                                                {description ? (
                                                                    <p className="text-sm md:text-base text-brand-dark dark:text-dark-heading leading-relaxed">
                                                                        {description}
                                                                    </p>
                                                                ) : (
                                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">Sem descrição cadastrada.</p>
                                                                )}
                                                                {!isDescriptionExpanded && description.length > 250 && (
                                                                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white dark:from-dark-surface to-transparent pointer-events-none" />
                                                                )}
                                                            </div>
                                                            {description.length > 250 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                                                    className="flex items-center gap-1 text-brand-primary dark:text-brand-primary font-bold text-sm mt-3 hover:underline cursor-pointer"
                                                                >
                                                                    {isDescriptionExpanded ? "Ver menos descrição" : "Ver mais descrição"}
                                                                    <ChevronDownIcon size={16} className={`transition-transform duration-200 ${isDescriptionExpanded ? "rotate-180" : ""}`} />
                                                                </button>
                                                            )}
                                                        </FormSection>

                                                        {/* Vídeo */}
                                                        {videoMeta.video_url && (
                                                            <FormSection title="Vídeo">
                                                                <div className="w-full aspect-video overflow-hidden rounded-lg border border-brand-border dark:border-dark-border bg-black">
                                                                    {videoMeta.video_type === "youtube" || videoMeta.video_type === "vimeo" ? (
                                                                        <iframe
                                                                            src={
                                                                                videoMeta.video_type === "youtube"
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
                                                            </FormSection>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        {/* Informações Básicas */}
                                                        <FormSection title="Informações Básicas" className="mb-8">
                                                            <div className="space-y-6">
                                                                <Input
                                                                    label="Título"
                                                                    name="title"
                                                                    value={title}
                                                                    onChange={(e) => setTitle(e.target.value)}
                                                                    placeholder="Título do vídeo"
                                                                    error={!!errors.title}
                                                                    errorMessage={errors.title}
                                                                    disabled={readOnly}
                                                                    maxLength={150}
                                                                />
                                                            </div>
                                                        </FormSection>

                                                        {/* Descrição */}
                                                        <FormSection title="Descrição" className="mb-8">
                                                            <FormTextarea
                                                                label="Descrição"
                                                                name="description"
                                                                value={description}
                                                                onChange={(e) => setDescription(e.target.value)}
                                                                placeholder="Descrição do vídeo..."
                                                                rows={4}
                                                                disabled={readOnly}
                                                            />
                                                        </FormSection>

                                                        {/* Vídeo */}
                                                        <FormSection title="Vídeo">
                                                            <CommunityVideoUploadSection
                                                                video={videoMeta}
                                                                onChange={setVideoMeta}
                                                            />
                                                        </FormSection>
                                                    </>
                                                )}
                                            </div>

                                            {/* DIREITA (SidebarCard) */}
                                            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                                <SidebarCard hasSeparator hasTopStrip title="Organização">
                                                    {readOnly ? (
                                                        <div className="space-y-4">
                                                            <div className="flex justify-between items-center pb-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Produto Vinculado</span>
                                                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                                    {linkedItem?.type === "product" ? (linkedItem.name || linkedItem.id) : "-"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Serviço Vinculado</span>
                                                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                                    {linkedItem?.type === "service" ? (linkedItem.name || linkedItem.id) : "-"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Link da Coleção</span>
                                                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading truncate max-w-[150px]">
                                                                    {linkedCollectionUrl || "-"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center py-2">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Palavras-chave</span>
                                                                <div className="flex flex-wrap gap-1 justify-end">
                                                                    {tags.length > 0 ? tags.map((tag, i) => (
                                                                        <Badge key={i} variant="gray" className="whitespace-nowrap scale-90">
                                                                            {tag}
                                                                        </Badge>
                                                                    )) : (
                                                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">-</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
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
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setLinkedItem(null)}
                                                                            className="text-sm text-red-500 hover:text-red-600"
                                                                        >
                                                                            Remover
                                                                        </button>
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
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setLinkedItem(null)}
                                                                            className="text-sm text-red-500 hover:text-red-600"
                                                                        >
                                                                            Remover
                                                                        </button>
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
                                                            <div>
                                                                <ListItem
                                                                    title="Gerenciar palavras-chave"
                                                                    description={tags.length > 0 ? `${tags.length} tag${tags.length !== 1 ? "s" : ""} cadastrada${tags.length !== 1 ? "s" : ""}` : "Nenhuma tag cadastrada"}
                                                                    right={tags.length > 0 ? (
                                                                        <div className="flex flex-wrap gap-1.5 max-w-[70%]">
                                                                            {tags.slice(0, 3).map((tag: string, i: number) => (
                                                                                <Badge key={i} variant="gray" icon={null} className="px-2 py-0.5 text-[11px] font-medium">
                                                                                    {tag}
                                                                                </Badge>
                                                                            ))}
                                                                            {tags.length > 3 && (
                                                                                <Badge variant="gray" icon={null} className="px-2 py-0.5 text-[11px] font-medium text-brand-inactive-text">
                                                                                    +{tags.length - 3}
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                    ) : null}
                                                                    showChevron
                                                                    onClick={() => setIsTagsModalOpen(true)}
                                                                    disabled={readOnly}
                                                                    className={`cursor-pointer ${readOnly ? "opacity-50" : ""}`}
                                                                />
                                                                <TagsManagerModal
                                                                    isOpen={isTagsModalOpen}
                                                                    onClose={() => setIsTagsModalOpen(false)}
                                                                    tags={tags}
                                                                    onChange={setTags}
                                                                    disabled={readOnly}
                                                                    title="Palavras-chave de busca"
                                                                    description="Adicione termos relacionados para ajudar clientes a encontrarem este vídeo na busca."
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </SidebarCard>
                                            </div>
                                        </div>
                                    </FadeIn>
                                )}
                                {activeTab === "metrics" && readOnly && (
                                    <FadeIn key="metrics" className="block">
                                        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                            {/* ESQUERDA (Principal) */}
                                            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                                {/* Comparison Chart */}
                                                <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col">
                                                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-6">
                                                        Comparativo: Histórico vs Últimos 30 dias
                                                    </h3>
                                                    <div className="h-64 w-full">
                                                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                                            <BarChart data={comparisonData} barGap={6} barCategoryGap="25%">
                                                                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-brand-border)" />
                                                                <XAxis
                                                                    dataKey="name"
                                                                    tickLine={false}
                                                                    axisLine={false}
                                                                    tick={{ fill: "currentColor", className: "text-brand-inactive-text dark:text-dark-body", fontSize: 12, fontWeight: 500 }}
                                                                />
                                                                <YAxis
                                                                    tickLine={false}
                                                                    axisLine={false}
                                                                    tick={{ fill: "currentColor", className: "text-brand-inactive-text dark:text-dark-body", fontSize: 12, fontWeight: 500 }}
                                                                />
                                                                <Tooltip
                                                                    content={<CustomTooltip />}
                                                                    cursor={{ fill: "var(--color-brand-green-light)", opacity: 0.1 }}
                                                                />
                                                                <Bar dataKey="total" name="Total Histórico" radius={[6, 6, 0, 0]} fill="var(--color-brand-green)" />
                                                                <Bar dataKey="recente" name="Últimos 30 Dias" radius={[6, 6, 0, 0]} fill="var(--color-brand-dark)" />
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* DIREITA (SidebarCard) */}
                                            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                                <SidebarCard hasSeparator hasTopStrip title="Informações">
                                                    <div className="space-y-4">
                                                        <div className="flex justify-between items-center pb-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body">Criado em</span>
                                                            <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                                {formatDate(video?.created_at)}
                                                            </span>
                                                        </div>
                                                        {video?.published_at && (
                                                            <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Publicado em</span>
                                                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                                    {formatDate(video.published_at)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {video?.updated_at && (
                                                            <div className="flex justify-between items-center py-2">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Atualizado em</span>
                                                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                                    {formatDate(video.updated_at)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </SidebarCard>
                                            </div>
                                        </div>
                                    </FadeIn>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        {readOnly ? (
                            <>
                                <ActionsDropdown
                                    fullWidth={!onEdit}
                                    onDelete={onDelete}
                                    trigger={
                                        <Button
                                            variant="outline"
                                            className="w-full h-12"
                                            leftIcon={<ThreeDotsIcon size={18} />}
                                        >
                                            Opções
                                        </Button>
                                    }
                                />
                                {onEdit && (
                                    <Button onClick={onEdit} className="flex-1 h-12" leftIcon={<EditIcon size={18} />}>
                                        Editar vídeo
                                    </Button>
                                )}
                            </>
                        ) : (
                            <>
                                <Button variant="outline" onClick={handleBack} disabled={saving || isLoading} className="flex-1 h-12">
                                    Cancelar
                                </Button>
                                <Button onClick={handleSubmit} disabled={saving || isLoading} className="flex-1 h-12" leftIcon={<SaveIcon size={18} />}>
                                    {saving || isLoading ? "Salvando..." : isEditing ? "Salvar" : "Criar"}
                                </Button>
                            </>
                        )}
                    </div>
                </Tabs>

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
