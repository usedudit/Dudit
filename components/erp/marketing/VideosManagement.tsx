"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Button, Input, FormTextarea, IconPlaceholder, ThreeDotsLoader, AlertModal, Badge } from "@/components/reusable"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getPartnerCommunityVideos, createCommunityVideo, updateCommunityVideo, deleteCommunityVideo, type CommunityVideoItem } from "@/app/actions/marketplace/community-videos"
import { TrashIcon, PlusIcon, PlayIcon, GridIcon, ListIcon, EditIcon, SearchIcon } from "@/lib/icons"
import { formatDate } from "@/lib/utils"
import Pagination from "@/components/reusable/Pagination"
import { prepareVideoClientPreview, bytesToBase64 } from "@/lib/video/client"

const STATUS_VARIANTS: Record<string, "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray"> = {
  pending_moderation: "orange",
  approved: "green",
  rejected: "red",
  flagged: "red",
}

const STATUS_LABELS: Record<string, string> = {
  pending_moderation: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  flagged: "Sinalizado",
}

type ActiveTab = "Todos" | "Pendentes" | "Aprovados" | "Rejeitados"
type ViewMode = "list" | "grid"
type WrapperMode = "list" | "create" | "edit"

const ITEMS_PER_PAGE = 12

export function VideosManagementPage() {
  const { toast } = useToast()
  const { businessInfo, planSlug, partnerId } = usePermissions()
  const { openPlanUpgrade } = usePlanUpgrade()

  const [videos, setVideos] = useState<CommunityVideoItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>("Todos")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [page, setPage] = useState(1)
  const [wrapperMode, setWrapperMode] = useState<WrapperMode>("list")
  const [selectedVideo, setSelectedVideo] = useState<CommunityVideoItem | null>(null)
  const [videoToDelete, setVideoToDelete] = useState<CommunityVideoItem | null>(null)

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
    const result = await deleteCommunityVideo(videoToDelete.id)
    if (result.success) {
      toast({ title: "Vídeo excluído" })
      setVideoToDelete(null)
      loadVideos()
    } else {
      toast({ title: "Erro", description: result.error, variant: "destructive" })
    }
  }

  const openCreate = () => {
    setSelectedVideo(null)
    setWrapperMode("create")
  }

  const openEdit = (video: CommunityVideoItem) => {
    setSelectedVideo(video)
    setWrapperMode("edit")
  }

  if (!hasMinimumPlan(planSlug, "crescer")) {
    return (
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
    )
  }

  const hasActiveFilters = debouncedSearch.length > 0

  return (
    <>
      <AnimatePresence mode="wait">
        {wrapperMode === "create" || wrapperMode === "edit" ? (
          <VideoFormModal
            key="form"
            mode={wrapperMode}
            video={selectedVideo}
            onBack={() => { setWrapperMode("list"); setSelectedVideo(null) }}
            onSaved={() => { setWrapperMode("list"); setSelectedVideo(null); loadVideos() }}
          />
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <ERPPageHeader title="Vídeos da Comunidade" />
                  <p className="text-sm text-brand-inactive-text mt-1">
                    {planSlug === "crescer" ? "Limite: 1 vídeo por mês" : planSlug === "escalar" ? "Limite: 1 vídeo por semana" : ""}
                  </p>
                </div>
                <Button onClick={openCreate} leftIcon={<PlusIcon size={18} />}>
                  Novo vídeo
                </Button>
              </div>

              {/* Tabs + Search + View toggle */}
              <VideoPageControls
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                search={search}
                onSearchChange={setSearch}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />

              <div className="min-h-[420px]">
                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <div key="loading" className="h-[420px] flex items-center justify-center">
                      <ThreeDotsLoader />
                    </div>
                  ) : filteredVideos.length === 0 ? (
                    <div key="empty" className="h-[600px] flex items-center justify-center">
                      <IconPlaceholder
                        placeholderType="image"
                        imageSrc={
                          hasActiveFilters
                            ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                            : "https://img.dudit.com.br/static/mascots/Cupons.png"
                        }
                        imageAlt={hasActiveFilters ? "Nenhum vídeo encontrado" : "Nenhum vídeo cadastrado"}
                        title={hasActiveFilters ? "Nenhum vídeo encontrado" : "Nenhum vídeo cadastrado"}
                        subtitle={
                          hasActiveFilters
                            ? "Tente ajustar seus filtros ou termos de busca."
                            : "Vídeos da comunidade aparecerão aqui após serem publicados."
                        }
                        itemButton={hasActiveFilters ? undefined : { text: "Novo vídeo", action: openCreate }}
                      />
                    </div>
                  ) : (
                    <motion.div
                      key={`${viewMode}-${activeTab}-${debouncedSearch}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="w-full"
                    >
                      {viewMode === "grid" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          <AnimatePresence>
                            {paginatedVideos.map((video) => (
                              <VideoGridCard
                                key={video.id}
                                video={video}
                                onEdit={() => openEdit(video)}
                                onDelete={() => setVideoToDelete(video)}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {paginatedVideos.map((video) => (
                            <VideoListRow
                              key={video.id}
                              video={video}
                              onEdit={() => openEdit(video)}
                              onDelete={() => setVideoToDelete(video)}
                            />
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {filteredVideos.length > ITEMS_PER_PAGE && (
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AlertModal
        title="Excluir vídeo"
        description={`Tem certeza que deseja excluir "${videoToDelete?.title || "este vídeo"}"?`}
        isOpen={!!videoToDelete}
        onClose={() => setVideoToDelete(null)}
        onConfirm={handleDelete}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />
    </>
  )
}

// ─── Page Controls ────────────────────────────────────────────────────────────

function VideoPageControls({
  activeTab,
  setActiveTab,
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
}: {
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void
  search: string
  onSearchChange: (v: string) => void
  viewMode: ViewMode
  onViewModeChange: (v: ViewMode) => void
}) {
  const tabs: ActiveTab[] = ["Todos", "Pendentes", "Aprovados", "Rejeitados"]

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-brand-gray dark:bg-dark-border/30 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading shadow-sm"
                : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search + View toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
          <input
            type="text"
            placeholder="Buscar vídeos..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-sm text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-green/50"
          />
        </div>
        <div className="flex items-center gap-1 bg-brand-gray dark:bg-dark-border/30 rounded-lg p-1">
          <button
            onClick={() => onViewModeChange("grid")}
            className={`p-1.5 rounded ${viewMode === "grid" ? "bg-white dark:bg-dark-surface shadow-sm" : ""}`}
          >
            <GridIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange("list")}
            className={`p-1.5 rounded ${viewMode === "list" ? "bg-white dark:bg-dark-surface shadow-sm" : ""}`}
          >
            <ListIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Grid Card ────────────────────────────────────────────────────────────────

function VideoGridCard({ video, onEdit, onDelete }: { video: CommunityVideoItem; onEdit: () => void; onDelete: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group bg-white dark:bg-dark-surface rounded-xl border border-gray-100 dark:border-dark-border overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="relative aspect-[9/16] bg-brand-gray dark:bg-dark-border overflow-hidden">
        {video.video_thumbnail ? (
          <img src={video.video_thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="flex items-center justify-center h-full">
            <PlayIcon className="w-8 h-8 text-brand-inactive-text" />
          </div>
        )}
          <Badge variant={STATUS_VARIANTS[video.moderation_status] || "gray"} className="absolute top-2 left-2 text-xs">
          {STATUS_LABELS[video.moderation_status] || video.moderation_status}
        </Badge>
        <div className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-2 py-0.5 rounded">
          {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, "0")}
        </div>
      </div>
      <div className="p-3 space-y-1">
        <h3 className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
          {video.title || "Sem título"}
        </h3>
        <div className="flex items-center gap-3 text-xs text-brand-inactive-text">
          <span>{video.views_count} visualizações</span>
          <span>{video.clicks_count} cliques</span>
        </div>
        <p className="text-xs text-brand-inactive-text">{video.published_at ? formatDate(video.published_at) : formatDate(video.created_at)}</p>
        <div className="flex gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="outline" size="sm" onClick={onEdit} className="flex-1">
            <EditIcon className="w-3 h-3 mr-1" /> Editar
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete} className="flex-1 text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20">
            <TrashIcon className="w-3 h-3 mr-1" /> Excluir
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── List Row ─────────────────────────────────────────────────────────────────

function VideoListRow({ video, onEdit, onDelete }: { video: CommunityVideoItem; onEdit: () => void; onDelete: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-4 bg-white dark:bg-dark-surface rounded-xl border border-gray-100 dark:border-dark-border p-3 hover:shadow-sm transition-shadow"
    >
      <div className="w-16 aspect-[9/16] rounded-lg overflow-hidden bg-brand-gray dark:bg-dark-border shrink-0 relative">
        {video.video_thumbnail ? (
          <img src={video.video_thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="flex items-center justify-center h-full">
            <PlayIcon className="w-5 h-5 text-brand-inactive-text" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
            {video.title || "Sem título"}
          </h3>
          <Badge variant={STATUS_VARIANTS[video.moderation_status] || "gray"} className="text-xs">
            {STATUS_LABELS[video.moderation_status] || video.moderation_status}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-brand-inactive-text mt-1">
          <span>{video.views_count} visualizações</span>
          <span>{video.clicks_count} cliques</span>
          <span>{video.orders_origin_count} pedidos</span>
          <span>{video.published_at ? formatDate(video.published_at) : formatDate(video.created_at)}</span>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <EditIcon className="w-3 h-3" />
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete} className="text-red-500 border-red-200">
          <TrashIcon className="w-3 h-3" />
        </Button>
      </div>
    </motion.div>
  )
}

// ─── Form Modal ───────────────────────────────────────────────────────────────

function VideoFormModal({
  mode,
  video,
  onBack,
  onSaved,
}: {
  mode: "create" | "edit"
  video: CommunityVideoItem | null
  onBack: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState(video?.title || "")
  const [description, setDescription] = useState(video?.description || "")
  const [linkedItemType, setLinkedItemType] = useState<"product" | "service" | "collection" | null>(null)
  const [linkedItemId, setLinkedItemId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadPhase, setUploadPhase] = useState<"idle" | "preparing" | "uploading" | "done">("idle")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSave = async () => {
    if (mode === "create") {
      if (!file) {
        toast({ title: "Validação", description: "Selecione um arquivo de vídeo.", variant: "destructive" })
        return
      }
      setIsSaving(true)
      setUploadPhase("preparing")
      try {
        const meta = await prepareVideoClientPreview(file)
        setUploadPhase("uploading")
        setUploadProgress(0)

        const firstBytesBase64 = await bytesToBase64(meta.firstBytes)
        const res = await fetch("/api/r2/community-video-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: meta.resolvedMime,
            fileSize: file.size,
            duration: meta.duration,
            firstBytesBase64,
          }),
        })
        const signed = await res.json()
        if (!res.ok) throw new Error(signed.error || "Erro ao preparar upload")

        const videoContentType = signed.video?.contentType || signed.signedVideoContentType || meta.resolvedMime
        await putWithProgress(signed.video.uploadUrl, file, videoContentType, (p) => setUploadProgress(p))

        const result = await createCommunityVideo({
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          videoUrl: signed.video.publicUrl,
          videoThumbnail: signed.thumbnail.publicUrl,
          duration: Math.round(meta.duration),
          linkedItemType: linkedItemType,
          linkedItemId: linkedItemId || null,
        })

        if (!result.success) throw new Error(result.error)
        toast({ title: "Vídeo criado com sucesso" })
        onSaved()
      } catch (err: any) {
        toast({ title: "Erro", description: err.message || "Erro ao criar vídeo", variant: "destructive" })
      } finally {
        setIsSaving(false)
        setUploadPhase("idle")
        setUploadProgress(0)
      }
    } else {
      setIsSaving(true)
      try {
        const result = await updateCommunityVideo(video!.id, { title: title.trim() || undefined, description: description.trim() || undefined })
        if (!result.success) throw new Error(result.error)
        toast({ title: "Vídeo atualizado" })
        onSaved()
      } catch (err: any) {
        toast({ title: "Erro", description: err.message || "Erro ao atualizar vídeo", variant: "destructive" })
      } finally {
        setIsSaving(false)
      }
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <ERPPageHeader title={mode === "create" ? "Novo Vídeo" : "Editar Vídeo"} />
      <div className="mt-6 space-y-6">
        <Input
          label="Título"
          name="title"
          placeholder="Ex: Como usar nosso produto"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isSaving}
          maxLength={100}
        />
        <FormTextarea
          label="Descrição"
          name="description"
          placeholder="Descrição do vídeo"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isSaving}
          maxLength={500}
        />

        {mode === "create" && (
          <>
            <div>
              <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1">Arquivo de vídeo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                disabled={isSaving}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-green file:text-white hover:file:bg-[#047857]"
              />
              <p className="text-xs text-brand-inactive-text mt-1">MP4 ou WebM, max 25MB, entre 10 e 60 segundos</p>
              {uploadPhase === "uploading" && (
                <div className="mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-brand-green h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="text-xs text-brand-inactive-text mt-1">Enviando... {uploadProgress}%</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1">Vincular a (opcional)</label>
                <select
                  value={linkedItemType || ""}
                  onChange={(e) => setLinkedItemType((e.target.value as any) || null)}
                  disabled={isSaving}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-sm"
                >
                  <option value="">Nenhum</option>
                  <option value="product">Produto</option>
                  <option value="service">Serviço</option>
                  <option value="collection">Coleção</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1">ID do item</label>
                <input
                  type="text"
                  placeholder="UUID do item"
                  value={linkedItemId}
                  onChange={(e) => setLinkedItemId(e.target.value)}
                  disabled={isSaving || !linkedItemType}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-sm disabled:opacity-50"
                />
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-dark-border">
          <Button variant="outline" onClick={onBack} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} isLoading={isSaving}>
            {mode === "create" ? "Publicar" : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Upload helper ────────────────────────────────────────────────────────────

function putWithProgress(url: string, file: File, contentType: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", contentType)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload interrompido (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error("Upload interrompido (rede ou CORS)"))
    xhr.onabort = () => reject(new Error("Upload interrompido"))
    xhr.send(file)
  })
}