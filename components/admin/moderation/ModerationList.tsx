"use client"

import React, { useState, useTransition, useCallback, useMemo } from "react"
import {
    SearchIcon, CheckCircleIcon, CancelCircleIcon, EyeIcon, ClockIcon,
    AlertTriangleIcon, TrashIcon, RemoveImageIcon, AllProductsIcon,
    StoreIcon, UserIcon, InfoIcon
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
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from "@/components/ui/sheet"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { toast } from "sonner"


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

// ─── Product Moderation Sheet ───────────────────────────────────────────────────

interface ProductModerationSheetProps {
    item: ModerationItem | null
    isOpen: boolean
    onClose: () => void
    onApprove: (id: string) => void
    onRejectImages: (id: string, urls: string[], reason: string) => void
    onFullReject: (id: string, reason: string) => void
    isPending: boolean
}

function ProductModerationSheet({
    item, isOpen, onClose, onApprove, onRejectImages, onFullReject, isPending,
}: ProductModerationSheetProps) {
    const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
    const [showRejectImagesModal, setShowRejectImagesModal] = useState(false)
    const [showFullRejectModal, setShowFullRejectModal] = useState(false)
    const [showApproveModal, setShowApproveModal] = useState(false)
    const [rejectReason, setRejectReason] = useState("")
    const isMobile = useMediaQuery("(max-width: 768px)")

    // Reset local state when item changes
    React.useEffect(() => {
        setSelectedImages(new Set())
        setRejectReason("")
    }, [item])

    const toggleImage = (url: string) => {
        setSelectedImages(prev => {
            const next = new Set(prev)
            if (next.has(url)) next.delete(url)
            else next.add(url)
            return next
        })
    }

    if (!item) return null

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-32 md:pb-6">
                {/* Product Header */}
                <div>
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{item.title}</h3>
                    <div className="flex items-center gap-3 mt-2">
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
                        <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(item.price || 0)}
                        </span>
                    </div>
                </div>

                {/* description */}
                <div>
                    <h4 className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-2">Descrição</h4>
                    <p className="text-sm text-brand-dark dark:text-dark-heading whitespace-pre-wrap leading-relaxed">
                        {item.description || "Sem descrição disponível."}
                    </p>
                </div>

                {/* Partner Info */}
                <div className="p-4 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <StoreIcon size={16} className="text-brand-inactive-text" />
                                <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading">{item.owner_store_name}</span>
                            </div>
                            {item.risk_score > 0 && (
                                <Badge variant={item.risk_score >= 50 ? "red" : item.risk_score >= 20 ? "orange" : "blue"}>
                                    Risk: {item.risk_score}
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <UserIcon size={16} className="text-brand-inactive-text" />
                            <span className="text-sm text-brand-inactive-text dark:text-dark-body">Responsável: <strong>{item.owner_user_name}</strong></span>
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-brand-border dark:border-dark-border">
                            <ClockIcon size={14} className="text-brand-inactive-text" />
                            <span className="text-xs text-brand-inactive-text">Enviado em {formatDate(item.created_at)}</span>
                        </div>
                    </div>
                </div>

                {/* Images */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">Imagens ({item.images?.length || 0})</h4>
                        {selectedImages.size > 0 && (
                            <span className="text-xs font-bold text-brand-red">{selectedImages.size} selecionada(s)</span>
                        )}
                    </div>
                    {item.images && item.images.length > 0 ? (
                        <div className="grid grid-cols-3 gap-3">
                            {item.images.map((url: string, idx: number) => (
                                <ImageThumbnail key={idx} url={url} selected={selectedImages.has(url)} onToggle={() => toggleImage(url)} />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-8 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-dashed border-brand-border dark:border-dark-border text-brand-inactive-text">
                            <ImageOff size={32} className="mb-2 opacity-30" />
                            <span className="text-sm font-medium">Nenhuma imagem enviada</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Sticky Actions */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border flex flex-col gap-3">
                <div className="flex gap-3">
                    <Button 
                        variant="filled" 
                        className="flex-1 rounded-full h-12 text-[15px] font-bold" 
                        onClick={() => setShowApproveModal(true)}
                        disabled={isPending}
                    >
                        <CheckCircleIcon size={20} className="mr-2" /> Aprovar Produto
                    </Button>
                </div>
                <div className="flex gap-3">
                    {selectedImages.size > 0 && (
                        <Button
                            variant="outline"
                            className="flex-1 rounded-full h-12 text-amber-600 border-amber-200 hover:bg-amber-50"
                            onClick={() => setShowRejectImagesModal(true)}
                            disabled={isPending}
                        >
                            <CancelCircleIcon size={20} className="mr-2" /> Remover {selectedImages.size} Imagens
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        className="flex-1 rounded-full h-12 text-brand-red border-red-200 hover:bg-red-50"
                        onClick={() => setShowFullRejectModal(true)}
                        disabled={isPending}
                    >
                        <TrashIcon size={20} className="mr-2" /> Rejeitar Produto
                    </Button>
                </div>
            </div>

            {/* Modals */}
            <DefaultModal
                isOpen={showApproveModal}
                onClose={() => setShowApproveModal(false)}
                title="Aprovar Produto"
                maxWidth="sm"
                footer={
                    <>
                        <Button variant="outline" onClick={() => setShowApproveModal(false)} disabled={isPending}>Cancelar</Button>
                        <Button onClick={() => { onApprove(item.id); setShowApproveModal(false) }} isLoading={isPending}>Confirmar Aprovação</Button>
                    </>
                }
            >
                <div className="flex flex-col items-center text-center gap-4 py-4">
                    <div className="w-16 h-16 rounded-full bg-brand-green/10 flex items-center justify-center text-brand-green">
                        <CheckCircleIcon size={32} />
                    </div>
                    <div>
                        <p className="text-brand-dark dark:text-dark-heading font-bold text-lg">Confirmar aprovação?</p>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-1">O produto &quot;{item.title}&quot; ficará visível imediatamente para todos os usuários.</p>
                    </div>
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={showRejectImagesModal}
                onClose={() => { setShowRejectImagesModal(false); setRejectReason("") }}
                title="Remover Imagens"
                maxWidth="md"
                footer={
                    <>
                        <Button variant="outline" onClick={() => { setShowRejectImagesModal(false); setRejectReason("") }} disabled={isPending}>Cancelar</Button>
                        <Button
                            variant="destructive"
                            disabled={!rejectReason.trim() || rejectReason.trim().length < 5 || isPending}
                            onClick={() => {
                                onRejectImages(item.id, [...selectedImages], rejectReason)
                                setShowRejectImagesModal(false)
                            }}
                            isLoading={isPending}
                        >
                            Confirmar Remoção
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-700 dark:text-amber-400">
                        <InfoIcon size={20} className="shrink-0 mt-0.5" />
                        <p className="text-sm font-medium">{selectedImages.size} imagem(ns) serão removidas. O parceiro será notificado para substituí-las.</p>
                    </div>
                    <Input
                        name="reject-images-reason"
                        label="Motivo da remoção"
                        placeholder="Explique ao parceiro por que as imagens foram removidas..."
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        multiline
                        rows={3}
                        required
                    />
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={showFullRejectModal}
                onClose={() => { setShowFullRejectModal(false); setRejectReason("") }}
                title="Rejeitar Produto"
                maxWidth="md"
                footer={
                    <>
                        <Button variant="outline" onClick={() => { setShowFullRejectModal(false); setRejectReason("") }} disabled={isPending}>Cancelar</Button>
                        <Button
                            variant="destructive"
                            disabled={!rejectReason.trim() || rejectReason.trim().length < 5 || isPending}
                            onClick={() => {
                                onFullReject(item.id, rejectReason)
                                setShowFullRejectModal(false)
                            }}
                            isLoading={isPending}
                        >
                            Confirmar Rejeição
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">O produto será removido da fila e o parceiro receberá o motivo da rejeição.</p>
                    <Input
                        name="full-reject-reason"
                        label="Motivo da rejeição"
                        placeholder="Explique detalhadamente o motivo da rejeição..."
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        multiline
                        rows={3}
                        required
                    />
                </div>
            </DefaultModal>
        </div>
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        )
    }

    return (
        <Sheet open={isOpen} onOpenChange={(v) => !v && onClose()}>
            <SheetContent className="p-0 sm:max-w-md border-0" side="right">
                {content}
            </SheetContent>
        </Sheet>
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
                toast.success("Produto aprovado com sucesso!")
                setDetailItem(null)
                fetchData()
            } else {
                toast.error(result.error || "Erro ao aprovar produto")
            }
        })
    }

    const handleRejectImages = (id: string, urls: string[], reason: string) => {
        startTransition(async () => {
            const result = await rejectFlaggedImages(id, reason, urls)
            if (result.success) {
                toast.success("Imagens removidas com sucesso!")
                if (result.noImagesLeft) setNoImagesAlert(true)
                setDetailItem(null)
                fetchData()
            } else {
                toast.error(result.error || "Erro ao remover imagens")
            }
        })
    }

    const handleFullReject = (id: string, reason: string) => {
        startTransition(async () => {
            const result = await rejectModeration(id, reason)
            if (result.success) {
                toast.success("Produto rejeitado com sucesso!")
                setDetailItem(null)
                fetchData()
            } else {
                toast.error(result.error || "Erro ao rejeitar produto")
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
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-wider">Produto</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider">Parceiro</th>
                                                    <th className="py-3 px-2 w-24 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider text-center">Imagens</th>
                                                    <th className="py-3 px-2 w-40 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider text-center">Data</th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider text-center">Status</th>
                                                    <th className="py-3 px-2 w-24 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-wider text-center">Ações</th>
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

            {/* Detail Sheet */}
            <ProductModerationSheet
                item={detailItem}
                isOpen={!!detailItem}
                onClose={() => setDetailItem(null)}
                onApprove={handleApprove}
                onRejectImages={handleRejectImages}
                onFullReject={handleFullReject}
                isPending={isPending}
            />

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
