"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { useEntityState } from "@/hooks/use-entity-state"
import { usePermissions } from "@/lib/permission-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { useToast } from "@/hooks/use-toast"
import { useMediaQuery } from "@/components/erp/hooks"
import { getPartnerCommunityVideos, createCommunityVideo, updateCommunityVideo, deleteCommunityVideo, deleteCommunityVideosInBatch, type CommunityVideoItem } from "@/app/actions/marketplace/community-videos"
import { Button, IconPlaceholder, ThreeDotsLoader, AlertModal, Checkbox, SelectionBanner, SavingStatusModal } from "@/components/reusable"
import { useStore } from "@/lib/store-context"
import Pagination from "@/components/reusable/Pagination"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { PlusIcon, TrashIcon } from "@/lib/icons"
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
    const { selectedStore } = useStore()
    const { openPlanUpgrade } = usePlanUpgrade()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")

    const queryClient = useQueryClient()
    const entityState = useEntityState()
    const { state: es, open: openEntity, close: closeEntity, isViewing, isEditing, isCreating } = entityState

    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? "grid" : "list")
    const effectiveViewMode = isTablet ? "grid" : viewMode
    const [page, setPage] = useState(1)
    const [activeTab, setActiveTab] = useState<"Todos" | "Pendentes" | "Aprovados" | "Rejeitados">("Todos")
    const [videoToDelete, setVideoToDelete] = useState<CommunityVideoItem | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [isProcessingBulk, setIsProcessingBulk] = useState(false)
    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

    const handleSelectRow = (id: string) => {
        setSelection((p) => {
            const s = new Set(p.ids)
            s.has(id) ? s.delete(id) : s.add(id)
            return { ids: s }
        })
    }

    const { data: videosData, isLoading: isVideosLoading } = useQuery({
        queryKey: ['erp', 'videos', partnerId],
        queryFn: async () => {
            const { items } = await getPartnerCommunityVideos(partnerId)
            return items ?? []
        },
        staleTime: 30000,
        refetchOnWindowFocus: false,
        placeholderData: [],
    })

    const videos = videosData ?? []

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
                await queryClient.invalidateQueries({ queryKey: ['erp', 'videos', partnerId] })
            } else {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
            }
        } finally {
            setIsDeleting(false)
        }
    }

    const handleAdd = () => openEntity("create")

    const handleBulkDelete = async () => {
        const ids = Array.from(selection.ids)
        if (ids.length === 0) return

        setIsProcessingBulk(true)
        try {
            const result = await deleteCommunityVideosInBatch(ids)
            if (result.success) {
                toast({ title: "Vídeos excluídos", description: `${ids.length} vídeo(s) excluído(s) com sucesso` })
                setShowBulkDeleteConfirm(false)
                setSelection({ ids: new Set() })
                await queryClient.invalidateQueries({ queryKey: ['erp', 'videos', partnerId] })
            } else {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
            }
        } finally {
            setIsProcessingBulk(false)
        }
    }
    const handleEdit = (video: CommunityVideoItem) => openEntity("edit", video.id)
    const handleDetails = (video: CommunityVideoItem) => openEntity("view", video.id)
    const handleCancel = () => closeEntity()

    const handleSave = async (data: any) => {
        if (isEditing && es.entityId) {
            let linkedItemType: "product" | "service" | "collection" | null = null
            let linkedItemId: string | null = null
            if (data.linked_product_id) {
                linkedItemType = "product"
                linkedItemId = data.linked_product_id
            } else if (data.linked_service_id) {
                linkedItemType = "service"
                linkedItemId = data.linked_service_id
            } else if (data.linked_collection_url) {
                linkedItemType = "collection"
                const match = data.linked_collection_url.match(/\/colecoes\/([^/?]+)/)
                linkedItemId = match ? match[1] : data.linked_collection_url
            }

            const result = await updateCommunityVideo(es.entityId, {
                title: data.title,
                description: data.description,
                linkedItemType,
                linkedItemId,
            })
            if (!result.success) throw new Error(result.error)
            toast({ title: "Vídeo atualizado" })
        } else {
            let linkedItemType: "product" | "service" | "collection" | null = null
            let linkedItemId: string | null = null
            if (data.linked_product_id) {
                linkedItemType = "product"
                linkedItemId = data.linked_product_id
            } else if (data.linked_service_id) {
                linkedItemType = "service"
                linkedItemId = data.linked_service_id
            } else if (data.linked_collection_url) {
                linkedItemType = "collection"
                const match = data.linked_collection_url.match(/\/colecoes\/([^/?]+)/)
                linkedItemId = match ? match[1] : data.linked_collection_url
            }

            const result = await createCommunityVideo({
                title: data.title,
                description: data.description,
                videoUrl: data.video_url,
                videoThumbnail: data.video_thumbnail,
                duration: data.duration,
                storeId: selectedStore?.id || null,
                linkedItemType,
                linkedItemId,
            })
            if (!result.success) throw new Error(result.error)
            toast({ title: "Vídeo criado" })
        }
        closeEntity()
        await queryClient.invalidateQueries({ queryKey: ['erp', 'videos', partnerId] })
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
                {isCreating || isEditing || isViewing ? (
                    <FadeIn key="form" className="w-full h-full">
                        <VideoFormPage
                            video={isEditing || isViewing ? currentVideo : undefined}
                            onSave={handleSave}
                            onBack={handleCancel}
                            partnerId={partnerId}
                            readOnly={isViewing}
                        />
                    </FadeIn>
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
                                    {isVideosLoading ? (
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
                                            <SelectionBanner
                                                selectedCount={selection.ids.size}
                                                totalCount={paginatedVideos.length}
                                                onSelectAll={() => setSelection({ ids: new Set(paginatedVideos.map(v => v.id)) })}
                                                onClearSelection={() => setSelection({ ids: new Set() })}
                                                itemName="vídeos"
                                                singularItemName="vídeo"
                                            />
                                            {effectiveViewMode === "grid" ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                    {paginatedVideos.map((video) => (
                                                        <VideoGridCard
                                                            key={video.id}
                                                            video={video}
                                                            selected={selection.ids.has(video.id)}
                                                            onSelect={() => handleSelectRow(video.id)}
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
                                                                        <div className="flex items-center">
                                                                            <Checkbox
                                                                                checked={selection.ids.size === paginatedVideos.length && paginatedVideos.length > 0}
                                                                                onChange={(checked) => {
                                                                                    setSelection({ ids: checked ? new Set(paginatedVideos.map(v => v.id)) : new Set() })
                                                                                }}
                                                                                className="bg-white dark:bg-dark-background"
                                                                            />
                                                                        </div>
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
                                                                        onEdit={() => handleEdit(video)}
                                                                        onDelete={() => setVideoToDelete(video)}
                                                                        onDetails={() => handleDetails(video)}
                                                                        selected={selection.ids.has(video.id)}
                                                                        onSelect={() => handleSelectRow(video.id)}
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
                description={`Tem certeza que deseja excluir "${videoToDelete?.title || "este vídeo"}"? Esta ação não pode ser desfeita.`}
                confirmText="Excluir"
                variant="danger"
                onConfirm={handleDelete}
            />

            <AlertModal
                isOpen={showBulkDeleteConfirm}
                onClose={() => setShowBulkDeleteConfirm(false)}
                title="Excluir vídeos"
                description={`Tem certeza que deseja excluir ${selection.ids.size} vídeo(s)? Esta ação não pode ser desfeita.`}
                confirmText="Sim, excluir"
                variant="danger"
                onConfirm={handleBulkDelete}
            />

            <SavingStatusModal isOpen={isDeleting || isProcessingBulk} text={isDeleting ? "Excluindo vídeo..." : "Excluindo vídeos..."} />

            <FloatingActionBar selectedCount={selection.ids.size} onClearSelection={() => setSelection({ ids: new Set() })}>
                <Button
                    variant="ghostred"
                    className="h-10 px-3"
                    leftIcon={<TrashIcon size={18} />}
                    onClick={() => setShowBulkDeleteConfirm(true)}
                >
                    Excluir
                </Button>
            </FloatingActionBar>
        </>
    )
}
