"use client"

import React, { useState, useTransition, useMemo, useCallback } from "react"
import {
    Button,
    Badge,
    Input,
    Pagination,
    IconPlaceholder,
    ActionsDropdown,
    DefaultModal,
    FormTextarea,
} from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import {
    VideoIcon,
    EditIcon,
    EyeIcon,
    StoreIcon,
    SearchIcon,
    ListIcon,
    GridIcon,
    FilterIcon,
} from "@/lib/icons"
import { Play } from "lucide-react"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatDate } from "@/lib/utils"
import { useAdminActionModal } from "@/components/admin/AdminActionModal"
import {
    getAdminCommunityVideos,
    updateAdminCommunityVideo,
    type AdminVideoStats,
} from "@/app/actions/admin/community-videos"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import {
    EMPTY_DATE_PERIOD,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"
import { useMediaQuery } from "@/components/erp/hooks"

interface CommunityVideosListProps {
    initialData: any[]
    initialStats?: AdminVideoStats
}

const STATUS_MAP: Record<string, { label: string; variant: "green" | "orange" | "red" | "blue" | "gray" }> = {
    pending: { label: "Pendente", variant: "orange" },
    approved: { label: "Aprovado", variant: "green" },
    rejected: { label: "Rejeitado", variant: "red" },
}

const ITEMS_PER_PAGE = 10

export default function CommunityVideosList({ initialData, initialStats }: CommunityVideosListProps) {
    const isTabletOrMobile = useMediaQuery("(max-width: 1024px)")

    const [activeTab, setActiveTab] = useState("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">(isTabletOrMobile ? "grid" : "list")
    const [page, setPage] = useState(1)

    // Local states - DECLARED BEFORE useEntityPage
    const { search, setSearch, debouncedSearch } = useDebouncedSearch()
    const [filters, setFilters] = useState<{ datePeriod: DatePeriodFilterValue }>({
        datePeriod: { ...EMPTY_DATE_PERIOD },
    })

    const isDefaultView = activeTab === "all" && !isDatePeriodFilterActive(filters.datePeriod)

    const entityPage = useEntityPage<any, any, any>({
        entityType: "community_videos",
        partnerId: "admin",
        queryKey: ["admin-community-videos", activeTab, debouncedSearch, filters.datePeriod],
        initialItems: initialData,
        initialNextCursor: null,
        initialHasMore: false,
        skipInitialData: !isDefaultView,
        search: debouncedSearch,
        setSearch,
        fetchPageFn: async ({ cursor }) => {
            const res = await getAdminCommunityVideos(cursor, 100, {
                status: activeTab === "all" ? undefined : activeTab,
                search: debouncedSearch || undefined,
                startDate: filters.datePeriod.from || undefined,
                endDate: filters.datePeriod.to || undefined,
            })
            return { items: res.data || [], nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((v: any) => String(v?.id || ""), []),
        getDetailFn: async (id: string) => {
            return null
        },
        listToDetail: (item) => ({ ...item, __partial: true }),
        staleTime: 30_000,
    })

    const {
        items: videos,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        entityState,
        openEntity,
        closeEntity,
        afterMutation,
    } = entityPage

    const handleMutation = useCallback(() => {
        afterMutation()
    }, [afterMutation])

    // Detail / Video Player Modal
    const [playingVideo, setPlayingVideo] = useState<any | null>(null)

    // Edit / Moderation State
    const [editingVideo, setEditingVideo] = useState<any | null>(null)
    const [editForm, setEditForm] = useState<{
        moderation_status: "approved" | "pending" | "rejected"
        title: string
        description: string
    }>({
        moderation_status: "pending",
        title: "",
        description: "",
    })

    const [isPending, startTransition] = useTransition()
    const { modal: actionModal, runAction } = useAdminActionModal()

    const tabs = useMemo(() => [
        { id: "all", label: "Todos os Vídeos", count: videos.length },
        { id: "pending", label: "Pendentes", count: videos.filter(v => v.moderation_status === "pending").length },
        { id: "approved", label: "Aprovados", count: videos.filter(v => v.moderation_status === "approved").length },
        { id: "rejected", label: "Rejeitados", count: videos.filter(v => v.moderation_status === "rejected").length },
    ], [videos])

    // Reset pagination when search/filter/tab changes
    useMemo(() => {
        setPage(1)
    }, [debouncedSearch, activeTab, filters.datePeriod])

    const handleOpenEdit = (video: any) => {
        setEditingVideo(video)
        setEditForm({
            moderation_status: video.moderation_status || "pending",
            title: video.title || "",
            description: video.description || "",
        })
    }

    const handleSaveEdit = async () => {
        if (!editingVideo) return

        const changedFields: string[] = []
        if (editForm.moderation_status !== editingVideo.moderation_status) changedFields.push("status de moderação")
        if (editForm.title !== (editingVideo.title || "")) changedFields.push("título")
        if (editForm.description !== (editingVideo.description || "")) changedFields.push("descrição")

        await runAction({
            title: "Salvar Moderação do Vídeo",
            description: `Vídeo "${editingVideo.title || "Sem título"}" (${editingVideo.store_name || editingVideo.stores?.name || "Loja"})`,
            changedFields,
            force: true,
            confirmLabel: "Salvar e Notificar",
            notifyLabel: "Enviar notificação pelo Dudit ao criador do vídeo",
            runner: async (payload) => {
                const res = await updateAdminCommunityVideo(
                    editingVideo.id,
                    {
                        moderation_status: editForm.moderation_status,
                        title: editForm.title,
                        description: editForm.description,
                    },
                    payload
                )

                if (!res.success) {
                    toast({ title: "Erro ao salvar", description: res.error, variant: "destructive" })
                    return { success: false, error: res.error }
                }

                toast({ title: "Sucesso", description: "Vídeo moderado com sucesso." })
                handleMutation()
                setEditingVideo(null)
                return { success: true }
            },
        })
    }

    return (
        <FadeIn className="w-full space-y-6 pt-4 px-4 md:px-8 max-w-[1700px] mx-auto pb-12">
            {/* Top Controls matching ERP */}
            <div className="flex flex-col gap-4">
                {/* Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id)
                                    setPage(1)
                                }}
                                className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                                    isActive
                                        ? "bg-brand-dark dark:bg-white text-white dark:text-brand-dark shadow-sm"
                                        : "bg-white dark:bg-dark-surface text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-white border border-brand-border dark:border-dark-border"
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        isActive
                                            ? "bg-white/20 text-white dark:bg-brand-dark/20 dark:text-brand-dark"
                                            : "bg-brand-gray dark:bg-dark-border text-brand-inactive-text"
                                    }`}
                                >
                                    {tab.count}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Search & Actions Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="relative w-full sm:w-80 md:w-96">
                        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
                        <Input
                            placeholder="Buscar vídeos por título ou loja..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value)
                                setPage(1)
                            }}
                            className="pl-10 h-10 text-xs rounded-xl border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                        />
                    </div>

                    <div className="flex items-center border border-brand-border dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface p-0.5 ml-auto">
                        <button
                            onClick={() => setViewMode("list")}
                            className={`p-2 rounded-lg transition-colors ${
                                viewMode === "list"
                                    ? "bg-brand-green-light dark:bg-dark-border text-brand-dark dark:text-white"
                                    : "text-brand-inactive-text hover:text-brand-dark"
                            }`}
                            title="Visualização em Lista"
                        >
                            <ListIcon className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode("grid")}
                            className={`p-2 rounded-lg transition-colors ${
                                viewMode === "grid"
                                    ? "bg-brand-green-light dark:bg-dark-border text-brand-dark dark:text-white"
                                    : "text-brand-inactive-text hover:text-brand-dark"
                            }`}
                            title="Visualização em Grade"
                        >
                            <GridIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {videos.length === 0 ? (
                <div className="bg-white dark:bg-dark-surface rounded-[24px] p-8 border border-brand-border dark:border-dark-border flex flex-col justify-center min-h-[360px]">
                    <IconPlaceholder
                        title="Nenhum vídeo encontrado"
                        subtitle="Não há vídeos correspondentes aos filtros aplicados."
                        className="py-12"
                    />
                </div>
            ) : viewMode === "list" ? (
                /* ERP List / Table Layout */
                <div className="bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-brand-gray/50 dark:bg-dark-border/30 border-b border-brand-border dark:border-dark-border">
                                <tr>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Vídeo
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Loja / Criador
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Visualizações
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Cliques
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Data de Envio
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body text-center">
                                        Status
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body text-center">
                                        Ações
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                {videos.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE).map((video) => {
                                    const meta = STATUS_MAP[video.moderation_status?.toLowerCase()] || {
                                        label: video.moderation_status,
                                        variant: "gray" as const,
                                    }
                                    const storeName = video.store_name || video.stores?.name || "Loja Parceira"
                                    const thumb = video.video_thumbnail || video.thumbnail_url

                                    return (
                                        <tr
                                            key={video.id}
                                            onClick={() => setPlayingVideo(video)}
                                            className="h-[76px] cursor-pointer hover:bg-brand-green-light/5 dark:hover:bg-dark-border/20 transition-colors"
                                        >
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 rounded-xl bg-neutral-900 overflow-hidden relative shrink-0 border border-brand-border dark:border-dark-border flex items-center justify-center group-hover:scale-105 transition-transform">
                                                        {thumb ? (
                                                            <img
                                                                src={thumb}
                                                                alt=""
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <VideoIcon size={20} className="text-neutral-500" />
                                                        )}
                                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Play size={16} className="text-white fill-current" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading block line-clamp-1 max-w-[240px]">
                                                            {video.title || "Vídeo sem título"}
                                                        </span>
                                                        <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body line-clamp-1 max-w-[240px]">
                                                            {video.description || "Sem descrição"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="flex items-center gap-1.5 font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                    <StoreIcon size={14} className="text-brand-green shrink-0" />
                                                    <span className="truncate max-w-[180px]">{storeName}</span>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                {video.views_count ?? 0}
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                {video.clicks_count ?? 0}
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                                {formatDate(video.created_at)}
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-center">
                                                <Badge variant={meta.variant}>{meta.label}</Badge>
                                            </td>
                                            <td
                                                className="py-3.5 px-5 align-middle text-center"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setPlayingVideo(video)}
                                                        className="text-xs h-8 px-2"
                                                        title="Assistir Vídeo"
                                                    >
                                                        <Play size={14} />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleOpenEdit(video)}
                                                        className="text-xs h-8 px-2.5"
                                                    >
                                                        Moderar
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {Math.ceil(videos.length / ITEMS_PER_PAGE) > 1 && (
                        <div className="p-4 border-t border-brand-border dark:border-dark-border flex justify-end">
                            <Pagination
                                currentPage={page}
                                totalPages={Math.ceil(videos.length / ITEMS_PER_PAGE)}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </div>
            ) : (
                /* ERP Grid Mode matching VideoGridCard */
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {videos.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE).map((video) => {
                            const meta = STATUS_MAP[video.moderation_status?.toLowerCase()] || {
                                label: video.moderation_status,
                                variant: "gray" as const,
                            }
                            const storeName = video.store_name || video.stores?.name || "Loja Parceira"
                            const thumb = video.video_thumbnail || video.thumbnail_url

                            return (
                                <div
                                    key={video.id}
                                    onClick={() => setPlayingVideo(video)}
                                    className="rounded-[24px] bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border overflow-hidden hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                                >
                                    <div className="relative aspect-[9/16] max-h-[260px] bg-neutral-900 w-full overflow-hidden flex items-center justify-center">
                                        {thumb ? (
                                            <img
                                                src={thumb}
                                                alt=""
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                            />
                                        ) : (
                                            <VideoIcon size={32} className="text-neutral-600" />
                                        )}
                                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                            <div className="w-10 h-10 rounded-full bg-white/90 text-brand-dark flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                                <Play size={18} className="fill-current ml-0.5" />
                                            </div>
                                        </div>
                                        <div className="absolute top-3 right-3">
                                            <Badge variant={meta.variant}>{meta.label}</Badge>
                                        </div>
                                    </div>

                                    <div className="p-4 flex flex-col justify-between flex-1">
                                        <div>
                                            <h4 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading line-clamp-1 group-hover:text-brand-green transition-colors">
                                                {video.title || "Vídeo sem título"}
                                            </h4>
                                            <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text dark:text-dark-body pt-1">
                                                <StoreIcon size={12} className="text-brand-green shrink-0" />
                                                <span className="truncate">{storeName}</span>
                                            </div>
                                        </div>

                                        <div className="pt-3 mt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between text-xs text-brand-inactive-text">
                                            <span>{video.views_count ?? 0} visualizações</span>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleOpenEdit(video)
                                                }}
                                                className="text-xs h-7 px-2"
                                            >
                                                Moderar
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {Math.ceil(videos.length / ITEMS_PER_PAGE) > 1 && (
                        <div className="p-4 bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border flex justify-end">
                            <Pagination
                                currentPage={page}
                                totalPages={Math.ceil(videos.length / ITEMS_PER_PAGE)}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Video Player Modal */}
            {playingVideo && (
                <DefaultModal
                    isOpen={Boolean(playingVideo)}
                    onClose={() => setPlayingVideo(null)}
                    title={playingVideo.title || "Visualizar Vídeo"}
                    description={`Loja: ${playingVideo.store_name || playingVideo.stores?.name || "Loja Parceira"}`}
                    footer={
                        <div className="flex justify-between items-center w-full">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const v = playingVideo
                                    setPlayingVideo(null)
                                    handleOpenEdit(v)
                                }}
                            >
                                Alterar Status / Moderar
                            </Button>
                            <Button variant="default" onClick={() => setPlayingVideo(null)}>
                                Fechar
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4 pt-1">
                        <div className="aspect-[9/16] max-h-[460px] mx-auto rounded-2xl overflow-hidden bg-black flex items-center justify-center">
                            {playingVideo.video_url ? (
                                <video
                                    src={playingVideo.video_url}
                                    poster={playingVideo.video_thumbnail || playingVideo.thumbnail_url}
                                    controls
                                    autoPlay
                                    className="w-full h-full object-contain"
                                />
                            ) : (
                                <p className="text-white text-xs">URL do vídeo indisponível</p>
                            )}
                        </div>

                        {playingVideo.description && (
                            <p className="text-xs text-brand-dark dark:text-dark-heading leading-relaxed">
                                {playingVideo.description}
                            </p>
                        )}
                    </div>
                </DefaultModal>
            )}

            {/* Edit / Moderation Modal */}
            {editingVideo && (
                <DefaultModal
                    isOpen={Boolean(editingVideo)}
                    onClose={() => setEditingVideo(null)}
                    title={`Moderar Vídeo da Comunidade`}
                    description={`Loja: ${editingVideo.store_name || editingVideo.stores?.name || "Loja Parceira"}`}
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="ghost" onClick={() => setEditingVideo(null)}>
                                Cancelar
                            </Button>
                            <Button variant="default" onClick={handleSaveEdit}>
                                Prosseguir e Salvar
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4 pt-2">
                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Status de Moderação
                            </label>
                            <select
                                className="w-full px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-white text-sm"
                                value={editForm.moderation_status}
                                onChange={(e) =>
                                    setEditForm((prev) => ({
                                        ...prev,
                                        moderation_status: e.target.value as any,
                                    }))
                                }
                            >
                                <option value="approved">Aprovado (Visível no feed público)</option>
                                <option value="pending">Pendente (Aguardando revisão)</option>
                                <option value="rejected">Rejeitado (Oculto do feed)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Título do Vídeo
                            </label>
                            <Input
                                value={editForm.title}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                            />
                        </div>

                        <div>
                            <FormTextarea
                                label="Descrição do Vídeo"
                                value={editForm.description}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                                rows={3}
                            />
                        </div>
                    </div>
                </DefaultModal>
            )}

            {/* Action Context Modal (Notification + Audit) */}
            {actionModal}
        </FadeIn>
    )
}