"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useEntityState } from "@/hooks/use-entity-state"
import { usePermissions } from "@/lib/permission-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { useToast } from "@/hooks/use-toast"
import { useMediaQuery } from "@/components/erp/hooks"
import { getPartnerCommunityVideos, createCommunityVideo, updateCommunityVideo, deleteCommunityVideo, type CommunityVideoItem } from "@/app/actions/marketplace/community-videos"
import { Button, IconPlaceholder, ThreeDotsLoader, AlertModal } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { PlusIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import VideoPageControls from "./VideoPageControls"
import VideoListItem from "./VideoListRow"
import VideoGridCard from "./VideoGridCard"
import VideoFormPage from "./VideoFormPage"

type ActiveTab = "Todos" | "Pendentes" | "Aprovados" | "Rejeitados"
type ViewMode = "list" | "grid"

const ITEMS_PER_PAGE = 12

const COLUMNS = [
    { id: "video", label: "Vídeo", align: "left" as const, width: "300px" },
    { id: "status", label: "Status", align: "left" as const, width: "120px" },
    { id: "views", label: "Visualizações", align: "center" as const, width: "110px" },
    { id: "clicks", label: "Cliques", align: "center" as const, width: "100px" },
    { id: "date", label: "Data", align: "left" as const, width: "140px" },
    { id: "actions", label: "Ações", align: "center" as const, width: "80px" },
]

export default function VideosManagement() {
    const { toast } = useToast()
    const { businessInfo, planSlug, partnerId } = usePermissions()
    const { openPlanUpgrade } = usePlanUpgrade()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")

    const entityState = useEntityState()
    const { state: es, open: openEntity, close: closeEntity, isViewing, isEditing, isCreating } = entityState

    const [videos, setVideos] = useState<CommunityVideoItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<ActiveTab>("Todos")
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? "grid" : "list")
    const effectiveViewMode = isTablet ? "grid" : viewMode
    const [page, setPage] = useState(1)
    const [videoToDelete, setVideoToDelete] = useState<CommunityVideoItem | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const loadVideos = useCallback(async () => {
        if (!partnerId) return
        setIsLoading(true)
        try {
            const { items } = await getPartnerCommunityVideos(partnerId)
            setVideos(items)
        } catch {
            // silent
        } finally {
            setIsLoading(false)
        }
    }, [partnerId])

    useEffect(() => { loadVideos() }, [loadVideos])

    useEffect(() => {
        const timeout = setTimeout(() => setDebouncedSearch(search), 350)
        return () => clearTimeout(timeout)
    }, [search])

    useEffect(() => { setPage(1) }, [debouncedSearch, activeTab])

    const filteredVideos = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase()
        return videos.filter((v) => {
            const searchMatch = !term || v.title?.toLowerCase().includes(term) || v.description?.toLowerCase().includes(term)
            const tabMatch =
                activeTab === "Todos" ||
                (activeTab === "Pendentes" && v.moderation_status === "pending_moderation") ||
                (activeTab === "Aprovados" && v.moderation_status === "approved") ||
                (activeTab === "Rejeitados" && (v.moderation_status === "rejected" || v.moderation_status === "flagged"))
            return searchMatch && tabMatch
        })
    }, [videos, debouncedSearch, activeTab])

    const totalPages = Math.max(1, Math.ceil(filteredVideos.length / ITEMS_PER_PAGE))
    const paginatedVideos = filteredVideos.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

    const handleDelete = async () => {
        if (!videoToDelete) return
        setIsDeleting(true)
        try {
            const result = await deleteCommunityVideo(videoToDelete.id)
            if (result.success) {
                toast({ title: "Vídeo excluído" })
                setVideoToDelete(null)
                await loadVideos()
            } else {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
            }
        } finally {
            setIsDeleting(false)
        }
    }

    const handleAdd = () => openEntity("create")
    const handleEdit = (video: CommunityVideoItem) => openEntity("edit", video.id)
    const handleDetails = (video: CommunityVideoItem) => openEntity("view", video.id)
    const handleCancel = () => closeEntity()

    const handleSave = async (data: any) => {
        if (isEditing && es.entityId) {
            const result = await updateCommunityVideo(es.entityId, data)
            if (!result.success) throw new Error(result.error)
            toast({ title: "Vídeo atualizado" })
        } else {
            const result = await createCommunityVideo({ ...data, partnerId })
            if (!result.success) throw new Error(result.error)
            toast({ title: "Vídeo criado" })
        }
        closeEntity()
        await loadVideos()
    }

    const hasActiveFilters = debouncedSearch.length > 0
    const hasVideos = videos.length > 0

    const currentVideo = useMemo(() => {
        if (!es.entityId) return null
        return videos.find((v) => v.id === es.entityId) || null
    }, [es.entityId, videos])

    if (!hasMinimumPlan(planSlug, "crescer")) {
        return (
            <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background">
                <div className="p-6">
                    <ERPPageHeader title="Vídeos da Comunidade" />
                    <div className="flex items-center justify-center py-20">
                        <IconPlaceholder
                            placeholderType="image"
                            imageSrc="https://img.dudit.com.br/static/mascots/PlanoVender.png"
                            imageAlt="Plano necessário"
                            title="Plano necessário"
                            subtitle="Vídeos da comunidade não disponíveis no seu plano atual. Faça upgrade para Crescer ou Escalar."
                            itemButton={{
                                text: "Ver Plano Crescer",
                                action: () => openPlanUpgrade("crescer"),
                            }}
                        />
                    </div>
                </div>
            </FadeIn>
        )
    }

    return (
        <>
            <AnimatePresence mode="wait">
                {isCreating || isEditing ? (
                    <VideoFormPage
                        key="form"
                        video={isEditing ? currentVideo : undefined}
                        onSave={handleSave}
                        onCancel={handleCancel}
                    />
                ) : (
                    <FadeIn
                        key="list"
                        className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300"
                    >
                        <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                            {/* Desktop Header */}
                            <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                                <div className="flex flex-col gap-2 pt-1">
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                            Vídeos da Comunidade
                                        </h1>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                            {planSlug === "crescer"
                                                ? "Limite: 1 vídeo por mês"
                                                : planSlug === "escalar"
                                                    ? "Limite: 1 vídeo por semana"
                                                    : "Gerencie os vídeos da comunidade."}
                                        </p>
                                    </div>
                                </div>
                                <Button onClick={handleAdd} leftIcon={<PlusIcon size={18} />}>
                                    Novo vídeo
                                </Button>
                            </div>

                            {hasVideos && (
                                <VideoPageControls
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    search={search}
                                    onSearchChange={setSearch}
                                    viewMode={viewMode}
                                    onViewModeChange={setViewMode}
                                    onAddVideo={handleAdd}
                                    hasActiveFilters={hasActiveFilters}
                                />
                            )}

                            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                                <AnimatePresence mode="wait">
                                    {isLoading ? (
                                        <FadeIn key="loading" className="flex items-center justify-center min-h-[500px]">
                                            <ThreeDotsLoader />
                                        </FadeIn>
                                    ) : !hasVideos ? (
                                        <FadeIn key="empty-no-data" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/Cupons.png"
                                                imageAlt="Sem vídeos"
                                                title="Nenhum vídeo cadastrado"
                                                subtitle="Vídeos da comunidade aparecerão aqui após serem publicados."
                                                itemButton={{
                                                    text: "Novo vídeo",
                                                    action: handleAdd,
                                                }}
                                            />
                                        </FadeIn>
                                    ) : paginatedVideos.length === 0 ? (
                                        <FadeIn key="empty-results" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                imageAlt="Nenhum vídeo encontrado"
                                                title="Nenhum vídeo encontrado"
                                                subtitle="Tente ajustar seus filtros ou termos de busca."
                                            />
                                        </FadeIn>
                                    ) : (
                                        <FadeIn
                                            key={activeTab + effectiveViewMode}
                                            className="w-full"
                                        >
                                            {effectiveViewMode === "grid" ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                    {paginatedVideos.map((video) => (
                                                        <VideoGridCard
                                                            key={video.id}
                                                            video={video}
                                                            selected={false}
                                                            onSelect={() => {}}
                                                            onDetails={() => handleDetails(video)}
                                                            onEdit={() => handleEdit(video)}
                                                            onDelete={() => setVideoToDelete(video)}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="w-full overflow-hidden rounded-xl relative">
                                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[850px]">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                                                                        <div className="flex items-center">&nbsp;</div>
                                                                    </th>
                                                                    {COLUMNS.map((col, idx) => (
                                                                        <th
                                                                            key={col.id}
                                                                            className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === COLUMNS.length - 1 ? "rounded-r-lg" : ""}`}
                                                                            style={{ width: col.width }}
                                                                        >
                                                                            <div className={`flex items-center ${col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                                <span>{col.label}</span>
                                                                            </div>
                                                                        </th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {paginatedVideos.map((video) => (
                                                                    <VideoListItem
                                                                        key={video.id}
                                                                        video={video}
                                                                        columns={COLUMNS}
                                                                        selected={false}
                                                                        onSelect={() => {}}
                                                                        onEdit={() => handleEdit(video)}
                                                                        onDelete={() => setVideoToDelete(video)}
                                                                        onDetails={() => handleDetails(video)}
                                                                    />
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </FadeIn>
                                    )}
                                </AnimatePresence>
                            </div>

                            {totalPages > 1 && (
                                <Pagination
                                    currentPage={page}
                                    totalPages={totalPages}
                                    onPageChange={setPage}
                                />
                            )}
                        </div>
                    </FadeIn>
                )}
            </AnimatePresence>

            <AlertModal
                isOpen={!!videoToDelete}
                onClose={() => {
                    if (!isDeleting) setVideoToDelete(null)
                }}
                title="Excluir vídeo"
                description={`Tem certeza que deseja excluir "${videoToDelete?.title || "este vídeo"}"? Esta ação não pode ser desf eita.`}
                confirmText="Excluir"
                variant="danger"
                onConfirm={handleDelete}
            />
        </>
    )
}
