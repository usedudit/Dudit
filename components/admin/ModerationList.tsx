"use client"

import React, { useState, useTransition, useCallback } from "react"
import { Button, Badge, Input, Pagination } from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import DefaultModal from "@/components/reusable/DefaultModal"
import {
  SearchIcon, CheckCircleIcon, CancelCircleIcon, EyeIcon, ClockIcon,
  AlertTriangleIcon, TrashIcon, RemoveImageIcon
} from "@/lib/icons"
import { ImageOff } from "lucide-react"
import type { ModerationItem, CursorPaginatedResult } from "@/lib/admin/types"
import {
  getModerationQueue,
  approveModeration,
  rejectFlaggedImages,
  rejectModeration,
} from "@/app/actions/admin/moderation"

// ─── Status badge (using reusable Badge) ────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "orange" | "red" | "green" | "gray" | "blue"; label: string }> = {
    pending_moderation: { variant: "orange", label: "Pendente" },
    flagged: { variant: "red", label: "Flagged" },
    approved: { variant: "green", label: "Aprovado" },
    rejected: { variant: "red", label: "Rejeitado" },
    needs_images: { variant: "blue", label: "Sem imagens" },
  }
  const info = map[status] || { variant: "gray" as const, label: status }
  return <Badge variant={info.variant}>{info.label}</Badge>
}

// ─── Image thumbnail ────────────────────────────────────────────────────────

function ImageThumbnail({ url, selected, onToggle }: { url: string; selected: boolean; onToggle: () => void }) {
  const imageUrl = url.startsWith("http") ? url : `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ""}/${url}`
  return (
    <div
      className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${selected ? "border-red-500 ring-2 ring-red-300" : "border-brand-border dark:border-dark-border"}`}
      onClick={onToggle}
    >
      <img src={imageUrl} alt="" className="w-full h-full object-cover" />
      {selected && (
        <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
          <CancelCircleIcon className="w-6 h-6 text-white" />
        </div>
      )}
    </div>
  )
}

// ─── Product Detail Panel ───────────────────────────────────────────────────

function ProductDetailPanel({
  item, onClose, onApprove, onRejectImages, onFullReject, isPending,
}: {
  item: ModerationItem
  onClose: () => void
  onApprove: (id: string) => void
  onRejectImages: (id: string, urls: string[], reason: string) => void
  onFullReject: (id: string, reason: string) => void
  isPending: boolean
}) {
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
  const [showRejectImagesModal, setShowRejectImagesModal] = useState(false)
  const [showFullRejectModal, setShowFullRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const toggleImage = (url: string) => {
    setSelectedImages(prev => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative ml-auto w-full max-w-2xl bg-white dark:bg-dark-surface h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border p-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Detalhes do produto</h2>
          <Button variant="filled" onClick={onClose} className="w-[40px] h-[40px] p-0 flex items-center justify-center">
            <CancelCircleIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Product Info */}
          <div>
            <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{item.title}</h3>
            <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">{item.description || "Sem descrição"}</p>
            <div className="flex items-center gap-3 mt-3">
              <StatusBadge status={item.moderation_status} />
              <span className="text-sm text-brand-inactive-text dark:text-dark-body">
                R$ {typeof item.price === "number" ? item.price.toFixed(2) : "0.00"}
              </span>
            </div>
          </div>

          {/* Partner / Owner */}
          <div className="p-4 bg-gray-50 dark:bg-dark-background rounded-xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Loja: {item.owner_store_name}</p>
              {item.risk_score > 0 && (
                <Badge variant={item.risk_score >= 50 ? "red" : item.risk_score >= 20 ? "orange" : "blue"}>
                  Risk: {item.risk_score}
                </Badge>
              )}
            </div>
            {item.owner_user_name && (
              <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">Responsável: {item.owner_user_name}</p>
            )}
            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
              Criado em {new Date(item.created_at).toLocaleDateString("pt-BR")}
            </p>
          </div>

          {/* Images */}
          <div>
            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
              Imagens ({item.images?.length || 0})
            </h4>
            {item.images && item.images.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {item.images.map((url: string, idx: number) => (
                  <ImageThumbnail key={idx} url={url} selected={selectedImages.has(url)} onToggle={() => toggleImage(url)} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-700 dark:text-amber-400">
                <ImageOff className="w-5 h-5" />
                <span className="text-sm font-medium">Nenhuma imagem</span>
              </div>
            )}
            {selectedImages.size > 0 && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2 font-medium">
                {selectedImages.size} imagem(ns) selecionada(s) para remoção
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
            <Button onClick={() => onApprove(item.id)} disabled={isPending} className="w-full">
              <CheckCircleIcon className="w-4 h-4 mr-2" />
              Aprovar produto
            </Button>

            {selectedImages.size > 0 && (
              <Button
                variant="outline"
                onClick={() => setShowRejectImagesModal(true)}
                disabled={isPending}
                className="w-full text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700"
              >
                <CancelCircleIcon className="w-4 h-4 mr-2" />
                Remover {selectedImages.size} imagem(ns) selecionada(s)
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => setShowFullRejectModal(true)}
              disabled={isPending}
              className="w-full text-brand-red border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700"
            >
              <CancelCircleIcon className="w-4 h-4 mr-2" />
              Rejeitar produto
            </Button>
          </div>
        </div>

        {/* Reject images — DefaultModal with reason input */}
        <DefaultModal
          isOpen={showRejectImagesModal}
          onClose={() => { setShowRejectImagesModal(false); setRejectReason("") }}
          title="Remover imagens"
          maxWidth="md"
          footer={
            <>
              <Button variant="outline" onClick={() => { setShowRejectImagesModal(false); setRejectReason("") }}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={!rejectReason.trim() || rejectReason.trim().length < 5 || isPending}
                onClick={() => {
                  onRejectImages(item.id, [...selectedImages], rejectReason)
                  setShowRejectImagesModal(false)
                  setRejectReason("")
                }}
              >
                Remover imagens
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
              {selectedImages.size} imagem(ns) serão removidas permanentemente. Esta ação é irreversível.
            </p>
            <Input
              name="reject-reason"
              label="Motivo"
              placeholder="Motivo da remoção (mínimo 5 caracteres)..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              required
              multiline
              rows={3}
            />
          </div>
        </DefaultModal>

        {/* Full reject — DefaultModal with reason input */}
        <DefaultModal
          isOpen={showFullRejectModal}
          onClose={() => { setShowFullRejectModal(false); setRejectReason("") }}
          title="Rejeitar produto"
          maxWidth="md"
          footer={
            <>
              <Button variant="outline" onClick={() => { setShowFullRejectModal(false); setRejectReason("") }}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={!rejectReason.trim() || rejectReason.trim().length < 5 || isPending}
                onClick={() => {
                  onFullReject(item.id, rejectReason)
                  setShowFullRejectModal(false)
                  setRejectReason("")
                }}
              >
                Rejeitar
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
              O produto &quot;{item.title}&quot; será rejeitado e não aparecerá no marketplace.
            </p>
            <Input
              name="full-reject-reason"
              label="Motivo"
              placeholder="Motivo da rejeição (mínimo 5 caracteres)..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              required
              multiline
              rows={3}
            />
          </div>
        </DefaultModal>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface ModerationListProps {
  initialData: CursorPaginatedResult<ModerationItem>
}

const ModerationList = ({ initialData }: ModerationListProps) => {
  const [allItems, setAllItems] = useState<ModerationItem[]>(initialData.data)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [detailItem, setDetailItem] = useState<ModerationItem | null>(null)
  const [noImagesAlert, setNoImagesAlert] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [page, setPage] = useState(1)

  const itemsPerPage = 20

  // ─── Fetch data ────────────────────────────────────────────────────

  const fetchData = useCallback((filter?: string) => {
    startTransition(async () => {
      const result = await getModerationQueue(null, 200, filter || statusFilter)
      setAllItems(result.data)
      setPage(1)
    })
  }, [statusFilter])

  const handleFilterChange = (filter: string) => {
    setStatusFilter(filter)
    fetchData(filter)
  }

  // ─── Actions ───────────────────────────────────────────────────────

  const handleApprove = (id: string) => {
    startTransition(async () => {
      const result = await approveModeration(id)
      if (result.success) {
        setDetailItem(null)
        fetchData()
      }
    })
  }

  const handleRejectImages = (id: string, urls: string[], reason: string) => {
    startTransition(async () => {
      const result = await rejectFlaggedImages(id, reason, urls)
      if (result.success) {
        if (result.noImagesLeft) setNoImagesAlert(true)
        setDetailItem(null)
        fetchData()
      }
    })
  }

  const handleFullReject = (id: string, reason: string) => {
    startTransition(async () => {
      const result = await rejectModeration(id, reason)
      if (result.success) {
        setDetailItem(null)
        fetchData()
      }
    })
  }

  // ─── Filtered + paginated items ────────────────────────────────────

  const filteredItems = allItems.filter(item =>
    !search || item.title.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage)
  const paginated = filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  return (
    <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6 px-4 md:px-8">
        <div className="max-w-[220px]">
          <Input
            name="search"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            suffix={<SearchIcon className="w-4 h-4 text-brand-inactive-text" />}
          />
        </div>
        <div className="flex gap-2">
          {[
            { value: "all", label: "Todos" },
            { value: "pending_moderation", label: "Pendentes" },
            { value: "flagged", label: "Flagged" },
            { value: "needs_images", label: "Sem imagens" },
          ].map(f => (
            <Button
              key={f.value}
              variant={statusFilter === f.value ? "default" : "outline"}
              onClick={() => handleFilterChange(f.value)}
              className="h-[42px] px-3 text-xs"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-20 md:pb-0">
        {paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-center">
            <AlertTriangleIcon className="w-12 h-12 text-brand-inactive-text dark:text-dark-body mb-3" />
            <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-2">Nenhum item na fila</h3>
            <p className="text-brand-inactive-text dark:text-dark-body text-[15px]">
              Todos os produtos foram revisados
            </p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[64px_1fr_100px_130px_100px] gap-4 py-3 px-6 bg-brand-gray dark:bg-dark-border/50 rounded-lg mb-1">
              <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body">Img</span>
              <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body">Produto</span>
              <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Status</span>
              <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Criado em</span>
              <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Ações</span>
            </div>

            {paginated.map((item) => {
              const firstImage = item.images?.[0]
              const imageUrl = firstImage
                ? (firstImage.startsWith("http") ? firstImage : `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ""}/${firstImage}`)
                : null
              return (
                <div
                  key={item.id}
                  onClick={() => setDetailItem(item)}
                  className="grid grid-cols-1 md:grid-cols-[64px_1fr_100px_130px_100px] gap-2 md:gap-4 items-center py-3 px-4 md:px-6 border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 cursor-pointer transition-colors"
                >
                  {/* Image */}
                  <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-dark-border overflow-hidden flex-shrink-0">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <RemoveImageIcon className="w-4 h-4 text-brand-inactive-text" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-brand-dark dark:text-dark-heading truncate">{item.title}</h3>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                      {item.owner_store_name} • {item.images?.length || 0} imagens
                      {item.risk_score > 0 && ` • Risk: ${item.risk_score}`}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="flex justify-center">
                    <StatusBadge status={item.moderation_status} />
                  </div>

                  {/* Time */}
                  <div className="flex items-center justify-center gap-1 text-xs text-brand-inactive-text dark:text-dark-body">
                    <ClockIcon className="w-3 h-3" />
                    {new Date(item.created_at).toLocaleDateString("pt-BR")}
                  </div>

                  {/* Quick Actions */}
                  <div className="flex justify-center gap-2" onClick={e => e.stopPropagation()}>
                    <Button variant="outline" onClick={() => handleApprove(item.id)} disabled={isPending} className="h-8 px-2 text-xs">
                      <CheckCircleIcon className="w-3.5 h-3.5 mr-1" /> Aprovar
                    </Button>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* Detail Panel */}
      {detailItem && (
        <ProductDetailPanel
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onApprove={handleApprove}
          onRejectImages={handleRejectImages}
          onFullReject={handleFullReject}
          isPending={isPending}
        />
      )}

      {/* No images left alert */}
      <AlertModal
        isOpen={noImagesAlert}
        onClose={() => setNoImagesAlert(false)}
        title="Produto sem imagens"
        message="Todas as imagens foram removidas. O produto ficará com status pendente até que o parceiro adicione novas imagens."
        variant="warning"
      />
    </div>
  )
}

export default ModerationList
