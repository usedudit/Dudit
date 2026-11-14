"use client"

import { useState, useTransition } from "react"
import { Button, Badge, Input, Tabs, TabsList, TabsTrigger, Pagination, IconPlaceholder, DefaultModal, FormTextarea } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { VideoIcon, EditIcon, EyeIcon, PlayIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatDate } from "@/lib/utils"
import { useAdminActionModal } from "@/components/admin/AdminActionModal"
import {
    getAdminCommunityVideos,
    updateAdminCommunityVideo,
    type AdminVideoStats,
} from "@/app/actions/admin/community-videos"

interface CommunityVideosListProps {
    initialData: any[]
    initialStats?: AdminVideoStats
}

const STATUS_MAP: Record<string, { label: string; variant: "green" | "orange" | "red" | "gray" }> = {
    approved: { label: "Aprovado", variant: "green" },
    pending: { label: "Pendente", variant: "orange" },
    rejected: { label: "Recusado", variant: "red" },
}

export default function CommunityVideosList({ initialData, initialStats }: CommunityVideosListProps) {
    const [videos, setVideos] = useState(initialData)
    const [stats, setStats] = useState(initialStats)
    const [statusTab, setStatusTab] = useState("all")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const itemsPerPage = 8

    const [editingVideo, setEditingVideo] = useState<any | null>(null)
    const [editForm, setEditForm] = useState<{
        moderation_status: "approved" | "pending" | "rejected"
        title: string
        description: string
    }>({
        moderation_status: "approved",
        title: "",
        description: "",
    })

    const [isPending, startTransition] = useTransition()
    const { modal: actionModal, runAction } = useAdminActionModal()

    const filtered = videos.filter((v) => {
        const matchesStatus = statusTab === "all" ? true : v.moderation_status === statusTab
        const matchesSearch =
            !search.trim() ||
            v.title?.toLowerCase().includes(search.toLowerCase()) ||
            v.description?.toLowerCase().includes(search.toLowerCase()) ||
            v.stores?.name?.toLowerCase().includes(search.toLowerCase())

        return matchesStatus && matchesSearch
    })

    const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

    const handleOpenEdit = (video: any) => {
        setEditingVideo(video)
        setEditForm({
            moderation_status: video.moderation_status || "approved",
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

        const result = await runAction({
            title: "Salvar Alterações no Vídeo",
            description: `Vídeo "${editingVideo.title || editingVideo.id}" (${editingVideo.stores?.name || "Loja"})`,
            changedFields,
            force: true,
            confirmLabel: "Salvar e Notificar",
            notifyLabel: "Enviar notificação pelo Dudit ao vendedor",
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
                    return { success: false, error: res.error || "Erro ao atualizar vídeo" }
                }

                // Update local state
                setVideos((prev) =>
                    prev.map((item) =>
                        item.id === editingVideo.id
                            ? {
                                  ...item,
                                  ...editForm,
                              }
                            : item
                    )
                )

                toast.success("Vídeo da comunidade atualizado com sucesso!")
                setEditingVideo(null)
                return { success: true }
            },
        })

        if (!result.cancelled && !result.success) {
            toast.error(result.error || "Erro ao salvar alterações.")
        }
    }

    return (
        <FadeIn className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Total de Vídeos</p>
                    <p className="text-2xl font-bold text-brand-dark dark:text-white mt-1">{stats?.total ?? videos.length}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Aprovados</p>
                    <p className="text-2xl font-bold text-green-500 mt-1">{stats?.approved ?? 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Pendentes</p>
                    <p className="text-2xl font-bold text-yellow-500 mt-1">{stats?.pending ?? 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Recusados</p>
                    <p className="text-2xl font-bold text-red-500 mt-1">{stats?.rejected ?? 0}</p>
                </div>
            </div>

            {/* Controls: Search & Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <Tabs value={statusTab} onValueChange={(val) => { setStatusTab(val); setPage(1) }}>
                    <TabsList className="bg-brand-gray dark:bg-dark-border/40 p-1 rounded-xl">
                        <TabsTrigger value="all">Todos</TabsTrigger>
                        <TabsTrigger value="approved">Aprovados</TabsTrigger>
                        <TabsTrigger value="pending">Pendentes</TabsTrigger>
                        <TabsTrigger value="rejected">Recusados</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="w-full md:w-72">
                    <Input
                        type="text"
                        placeholder="Buscar por título ou loja..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                </div>
            </div>

            {/* List / Table */}
            {paginated.length === 0 ? (
                <IconPlaceholder
                    icon={VideoIcon}
                    title="Nenhum vídeo encontrado"
                    subtitle="Não há vídeos correspondentes aos filtros aplicados."
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {paginated.map((video) => {
                        const meta = STATUS_MAP[video.moderation_status] || { label: video.moderation_status, variant: "gray" as const }

                        return (
                            <div
                                key={video.id}
                                className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow"
                            >
                                <div className="relative aspect-[9/16] bg-black max-h-[300px] overflow-hidden group">
                                    {video.thumbnail_url ? (
                                        <img
                                            src={video.thumbnail_url}
                                            alt={video.title || "Thumbnail"}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/30">
                                            <PlayIcon className="w-12 h-12" />
                                        </div>
                                    )}

                                    <div className="absolute top-2 right-2">
                                        <Badge variant={meta.variant}>{meta.label}</Badge>
                                    </div>

                                    {video.video_url && (
                                        <a
                                            href={video.video_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                                        >
                                            <PlayIcon className="w-10 h-10" />
                                        </a>
                                    )}
                                </div>

                                <div className="p-4 flex-1 flex flex-col justify-between">
                                    <div>
                                        <h3 className="font-bold text-sm text-brand-dark dark:text-white line-clamp-1">{video.title || "Sem título"}</h3>
                                        <p className="text-xs text-brand-inactive-text line-clamp-2 mt-1">{video.description || "Sem descrição"}</p>
                                        <p className="text-xs font-medium text-brand-green mt-2 truncate">{video.stores?.name || "Loja"}</p>
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between text-xs text-brand-inactive-text">
                                        <span>{video.views_count || 0} visualizações</span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleOpenEdit(video)}
                                            className="inline-flex items-center gap-1.5"
                                        >
                                            <EditIcon className="w-3.5 h-3.5" />
                                            <span>Moderar</span>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex justify-end pt-4">
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                    />
                </div>
            )}

            {/* Modal de Edição / Moderação */}
            {editingVideo && (
                <DefaultModal
                    isOpen={Boolean(editingVideo)}
                    onClose={() => setEditingVideo(null)}
                    title={`Moderar Vídeo: ${editingVideo.title || "Sem título"}`}
                    description={`Loja: ${editingVideo.stores?.name || "Loja"}`}
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
                                onChange={(e) => setEditForm((prev) => ({ ...prev, moderation_status: e.target.value as any }))}
                            >
                                <option value="approved">Aprovado (Visível no feed público)</option>
                                <option value="pending">Pendente (Em análise)</option>
                                <option value="rejected">Recusado (Oculto da plataforma)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Título do Vídeo
                            </label>
                            <Input
                                value={editForm.title}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                                placeholder="Título do vídeo..."
                            />
                        </div>

                        <div>
                            <FormTextarea
                                label="Descrição e Tags"
                                value={editForm.description}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                                rows={3}
                            />
                        </div>
                    </div>
                </DefaultModal>
            )}

            {/* Modal de Auditoria e Notificação Administrativa */}
            {actionModal}
        </FadeIn>
    )
}

