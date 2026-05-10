"use client"

import React, { useState, useTransition, useCallback } from "react"
import {
    SearchIcon, CheckCircleIcon, CancelCircleIcon, EyeIcon, ClockIcon,
    AlertTriangleIcon, TrashIcon, RemoveImageIcon, AllProductsIcon
} from "@/lib/icons"
import { ImageOff } from "lucide-react"
import { Button, Badge, Input, Pagination, IconPlaceholder } from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import DefaultModal from "@/components/reusable/DefaultModal"
import ModerationListRow from "./ModerationListRow"
import ModerationPageControls from "./ModerationPageControls"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import type { ModerationItem, CursorPaginatedResult } from "@/lib/admin/types"
import {
    getModerationQueue,
    approveModeration,
    rejectFlaggedImages,
    rejectModeration,
} from "@/app/actions/admin/moderation"
import { formatCurrency, formatDate } from "@/lib/utils"


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
                            <Badge variant={
                                item.moderation_status === "pending_moderation" ? "orange" : 
                                item.moderation_status === "flagged" ? "red" : 
                                item.moderation_status === "approved" ? "green" : 
                                item.moderation_status === "rejected" ? "red" : 
                                item.moderation_status === "needs_images" ? "blue" : "gray"
                            }>
                                {item.moderation_status === "pending_moderation" ? "Pendente" : 
                                 item.moderation_status === "flagged" ? "Flagged" : 
                                 item.moderation_status === "approved" ? "Aprovado" : 
                                 item.moderation_status === "rejected" ? "Rejeitado" : 
                                 item.moderation_status === "needs_images" ? "Sem imagens" : item.moderation_status}
                            </Badge>
                            <span className="text-sm text-brand-inactive-text dark:text-dark-body">
                                {formatCurrency(item.price || 0)}
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
                            Criado em {formatDate(item.created_at)}
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

                {/* Reject images - DefaultModal with reason input */}
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

                {/* Full reject - DefaultModal with reason input */}
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
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                
                {/* Header Title/Subtitle (ERP Standard) */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Moderação de Conteúdo
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Revise e aprove produtos enviados pelos parceiros para garantir a qualidade do marketplace.
                        </p>
                    </div>
                </div>

                {/* Controls (ERP Standard) */}
                <ModerationPageControls 
                    statusFilter={statusFilter}
                    setStatusFilter={handleFilterChange}
                    search={search}
                    onSearchChange={setSearch}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-20 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginated.length === 0 ? (
                            <FadeIn key="empty" className="w-full">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Fila vazia"
                                    title="Nenhum item na fila"
                                    subtitle="Todos os produtos foram revisados ou não correspondem aos filtros atuais."
                                    itemButton={search || statusFilter !== "all" ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setStatusFilter("all")
                                            setSearch("")
                                            fetchData("all")
                                        },
                                        variant: "outline"
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full">
                                {/* Mobile/Tablet View */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginated.map((item) => (
                                        <div
                                            key={item.id}
                                            className="py-5 flex items-start gap-3"
                                            onClick={() => setDetailItem(item)}
                                        >
                                            <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-dark-border overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                                                {item.images?.[0] ? (
                                                    <img src={item.images[0].startsWith("http") ? item.images[0] : `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ""}/${item.images[0]}`} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <RemoveImageIcon className="w-4 h-4 text-brand-inactive-text" />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                                <div className="flex justify-between items-start gap-2">
                                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                        {item.title}
                                                    </h3>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <span className="text-xs font-medium text-brand-inactive-text">
                                                        {item.owner_store_name}
                                                    </span>
                                                    <span className="text-brand-inactive-text">•</span>
                                                    <Badge variant={
                                                        item.moderation_status === "pending_moderation" ? "orange" : 
                                                        item.moderation_status === "flagged" ? "red" : 
                                                        item.moderation_status === "approved" ? "green" : 
                                                        item.moderation_status === "rejected" ? "red" : 
                                                        item.moderation_status === "needs_images" ? "blue" : "gray"
                                                    } className="scale-90 origin-left">
                                                        {item.moderation_status === "pending_moderation" ? "Pendente" : 
                                                            item.moderation_status === "flagged" ? "Flagged" : 
                                                            item.moderation_status === "approved" ? "Aprovado" : 
                                                            item.moderation_status === "rejected" ? "Rejeitado" : 
                                                            item.moderation_status === "needs_images" ? "Sem imagens" : item.moderation_status}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop Table View */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 px-2 w-20 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body uppercase tracking-wider">Img</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 uppercase tracking-wider">Produto</th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 uppercase tracking-wider text-center">Status</th>
                                                    <th className="py-3 px-2 w-40 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 uppercase tracking-wider text-center">Criado em</th>
                                                    <th className="py-3 px-2 w-40 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body uppercase tracking-wider text-center">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginated.map((item) => (
                                                    <ModerationListRow
                                                        key={item.id}
                                                        item={item}
                                                        isPending={isPending}
                                                        onDetail={setDetailItem}
                                                        onApprove={handleApprove}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination (ERP Standard) */}
                                {totalPages > 1 && (
                                    <div className="mt-6">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

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
        </FadeIn>
    )
}

export default ModerationList
