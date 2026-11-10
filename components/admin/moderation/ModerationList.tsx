"use client"

import { useState, useTransition, useMemo, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Badge, IconPlaceholder, ThreeDotsLoader, Pagination } from "@/components/reusable"
import ModerationListRow from "./ModerationListRow"
import ModerationPageControls from "./ModerationPageControls"
import AdminModerationDetailView from "./AdminModerationDetailView"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { StoreIcon } from "@/lib/icons"
import type { ModerationItem, CursorPaginatedResult } from "@/lib/admin/types"
import { getModerationQueue, approveModeration } from "@/app/actions/admin/moderation"
import { toast } from "@/hooks/use-notification"
import { useEntityState } from "@/hooks/use-entity-state"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

const ITEMS_PER_PAGE = 8

interface ModerationListProps {
    initialData?: CursorPaginatedResult<ModerationItem>
}

const ModerationList = ({ initialData }: ModerationListProps) => {
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()
    const router = useRouter()
    const [statusFilter, setStatusFilter] = useState("all")
    const [isPending, startTransition] = useTransition()
    const [items, setItems] = useState<ModerationItem[]>(initialData?.data || [])
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)

    // ─── Approve Handler ──────────────────────────────────────────────────────
    const handleApprove = (id: string, type: ModerationItem["type"]) => {
        startTransition(async () => {
            const result = await approveModeration(id, type as any)
            if (result.success) {
                const label = type === "product" ? "Produto" : type === "service" ? "Serviço" : type === "partner" ? "Perfil" : "Item"
                toast.success(`${label} aprovado com sucesso!`)
                setItems(prev => prev.filter(i => i.id !== id))
                setPage(1)
            } else {
                const label = type === "product" ? "produto" : type === "service" ? "serviço" : type === "partner" ? "perfil" : "item"
                toast.error(result.error || `Erro ao aprovar ${label}`)
            }
        })
    }

    // ─── Detail Handler ─────────────────────────────────────────────────────────
    // Produto/serviço abrem a tela de detalhe do catálogo (form ERP + abas de
    // Comprador e Loja / Histórico & Auditoria). Demais tipos seguem no detalhe
    // inline da moderação.
    const handleDetail = (item: ModerationItem) => {
        if (item.type === "product") {
            router.push(`/ddt-admin/catalog/products/${item.id}`)
            return
        }
        if (item.type === "service") {
            router.push(`/ddt-admin/catalog/services/${item.id}`)
            return
        }
        openEntity("view", item.id)
    }

    // ─── Refresh Handler ──────────────────────────────────────────────────────
    const refreshItems = useCallback(() => {
        startTransition(async () => {
            try {
                const result = await getModerationQueue(null, 50, statusFilter)
                setItems(result.data)
            } catch (err) {
                console.error("Failed to refresh moderation queue:", err)
            }
        })
    }, [statusFilter])

    // ─── Instant in-memory filtering (0ms) ────────────────────────────────────
    const filteredItems = useMemo(() => {
        const term = search.trim().toLowerCase()

        return items.filter(item => {
            // Status filter
            if (statusFilter !== "all" && item.moderation_status !== statusFilter) {
                return false
            }

            // Search filter - matches title, store name, or id
            if (term) {
                const title = (item.title || "").toLowerCase()
                const storeName = (item.store_name || item.owner_store_name || "").toLowerCase()
                const itemId = (item.id || "").toLowerCase()
                if (!title.includes(term) && !storeName.includes(term) && !itemId.includes(term)) {
                    return false
                }
            }

            return true
        })
    }, [items, statusFilter, search])

    // ─── Pagination ──────────────────────────────────────────────────
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredItems.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredItems, page])

    // Reset to page 1 on filter/search change
    useEffect(() => {
        setPage(1)
    }, [statusFilter, search])

    // ─── If viewing detail (inline) ──────────────────────────────────────────────────────────
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        const currentItem = items.find(i => i.id === entityState.entityId)
        if (currentItem) {
            return (
                <AdminModerationDetailView
                    item={currentItem}
                    onBack={closeEntity}
                />
            )
        }
    }

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
                .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                {/* Desktop Header */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Moderação
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Revise produtos, serviços e perfis pendentes de aprovação no marketplace
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={refreshItems}
                            disabled={isPending}
                            className="px-3 py-1.5 text-sm font-medium text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border rounded-lg hover:bg-gray-200 dark:hover:bg-dark-border/50 transition-colors disabled:opacity-50"
                        >
                            {isPending ? "Atualizando..." : "Atualizar"}
                        </button>
                    </div>
                </div>

                {/* Mobile Header */}
                <div className="md:hidden flex items-center justify-between mb-4 flex-none px-4">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-[24px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Moderação
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[13px] font-medium">
                            Revise produtos, serviços e perfis pendentes
                        </p>
                    </div>
                    <button
                        onClick={refreshItems}
                        disabled={isPending}
                        className="px-2.5 py-1.5 text-xs font-medium text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border rounded-lg hover:bg-gray-200 dark:hover:bg-dark-border/50 transition-colors disabled:opacity-50"
                    >
                        {isPending ? "..." : "Atualizar"}
                    </button>
                </div>

                {/* Page Controls (ERP Standard) */}
                <ModerationPageControls
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    search={search}
                    onSearchChange={setSearch}
                    items={items}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 lg:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {isPending && items.length === 0 ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[400px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : filteredItems.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Fila vazia"
                                    title="Nenhum item na fila"
                                    subtitle={search || statusFilter !== "all"
                                        ? "Tente ajustar seus filtros de busca."
                                        : "Todos os itens foram revisados ou não correspondem aos filtros atuais."
                                    }
                                    itemButton={search || statusFilter !== "all" ? {
                                        text: "Limpar filtros",
                                        action: () => {
                                            setStatusFilter("all")
                                            setSearch("")
                                        },
                                        variant: "outline",
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((item) => (
                                        <div
                                            key={item.id}
                                            className="py-4 flex items-start gap-3 cursor-pointer"
                                            onClick={() => handleDetail(item)}
                                        >
                                            <div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-dark-border overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                                                {item.images?.[0] ? (
                                                    <img
                                                        src={getR2ImageUrl(item.images[0])}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <StoreIcon className="w-5 h-5 text-brand-inactive-text" />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                                <div className="flex justify-between items-start gap-2">
                                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                        {item.title}
                                                    </h3>
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

                                                <div className="flex items-center gap-2 text-xs text-brand-inactive-text truncate">
                                                    <StoreIcon size={12} className="shrink-0" />
                                                    <span className="truncate">{item.store_name || item.owner_store_name}</span>
                                                </div>

                                                <span className="text-[10px] font-medium text-brand-inactive-text opacity-70 truncate">
                                                    {item.id}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop Table View */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1100px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">Produto</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">Loja</th>
                                                    <th className="py-3 px-2 w-20 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">Imagens</th>
                                                    <th className="py-3 px-2 w-40 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">Data</th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">Status</th>
                                                    <th className="py-3 px-2 w-24 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((item) => (
                                                    <ModerationListRow
                                                        key={item.id}
                                                        item={item}
                                                        isPending={isPending}
                                                        onDetail={handleDetail}
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
                                            fixedUntil="lg"
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </FadeIn>
    )
}

export default ModerationList
