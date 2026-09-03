"use client"

import React, { useState, useTransition, useRef, useEffect } from "react"
import {
    RemoveImageIcon
} from "@/lib/icons"
import { Badge, Pagination, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import ModerationListRow from "./ModerationListRow"
import ModerationPageControls from "./ModerationPageControls"
import AdminModerationDetailView from "./AdminModerationDetailView"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import type { ModerationItem, CursorPaginatedResult } from "@/lib/admin/types"
import {
    getModerationQueue,
    approveModeration,
} from "@/app/actions/admin/moderation"
import { toast } from "@/hooks/use-notification"
import { useEntityState } from "@/hooks/use-entity-state"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"

// ─── Main Component ─────────────────────────────────────────────────────────

interface ModerationListProps {
    initialData?: CursorPaginatedResult<ModerationItem>
}

const ModerationList = ({ initialData }: ModerationListProps) => {
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()
    const observerTarget = useRef<HTMLDivElement>(null)
    const [statusFilter, setStatusFilter] = useState("all")
    const [isPending, startTransition] = useTransition()

    // ─── Entity Page ──────────────────────────────────────────────────────────
    const entityPage = useEntityPage<ModerationItem, any, string | null>({
        entityType: 'admin-moderation',
        partnerId: 'admin',
        queryKey: ['admin', 'moderation', statusFilter],
        initialItems: (statusFilter === 'all' && initialData?.data) ? initialData.data : [],
        initialNextCursor: (statusFilter === 'all' && initialData?.nextCursor) ? initialData.nextCursor : null,
        initialHasMore: (statusFilter === 'all' && initialData) ? initialData.hasMore : true,
        fetchPageFn: async ({ cursor }) => {
            const result = await getModerationQueue(cursor, 50, statusFilter)
            return { items: result.data, nextCursor: result.nextCursor, hasMore: result.hasMore }
        },
        dedupeKey: (item) => item.id,
        getDetailFn: async () => null,
    })

    const {
        items: allItems, fetchNextPage, hasNextPage, isFetchingNextPage, isListLoading, afterMutation,
        search, setSearch, debouncedSearch,
    } = entityPage

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })

    const handleFilterChange = (filter: string) => {
        setStatusFilter(filter)
    }

    // ─── Actions ───────────────────────────────────────────────────────

    const handleApprove = (id: string, type: ModerationItem["type"]) => {
        startTransition(async () => {
            const result = await approveModeration(id, type as any)
            if (result.success) {
                const label = type === "product" ? "Produto" : type === "service" ? "Serviço" : "Perfil"
                toast.success(`${label} aprovado com sucesso!`)
                afterMutation()
            } else {
                const label = type === "product" ? "produto" : type === "service" ? "serviço" : "perfil"
                toast.error(result.error || `Erro ao aprovar ${label}`)
            }
        })
    }

    // ─── Filtered items ────────────────────────────────────

    const filteredItems = allItems.filter(item =>
        !debouncedSearch || item.title.toLowerCase().includes(debouncedSearch.toLowerCase())
    )

    // Pagination
    const [page, setPage] = useState(1)
    const itemsPerPage = 20
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage)
    const paginated = filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    // Reset page when search/filter changes
    useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter])

    // If viewing detail of a specific item via URL (?view=id)
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        const currentItem = allItems.find(i => i.id === entityState.entityId)
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
            <div className="mx-auto w-full flex flex-col h-full overflow-hidden relative">

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
                        {isListLoading ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[400px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : filteredItems.length === 0 ? (
                            <FadeIn key="empty" className="w-full">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Fila vazia"
                                    title="Nenhum item na fila"
                                    subtitle="Todos os produtos foram revisados ou não correspondem aos filtros atuais."
                                    itemButton={search || statusFilter !== "all" ? {
                                        text: "Limpar filtros",
                                        action: () => {
                                            setStatusFilter("all")
                                            setSearch("")
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
                                            className="py-5 flex items-start gap-3 cursor-pointer"
                                            onClick={() => openEntity("view", item.id)}
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
                                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
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
                                                        onDetail={() => openEntity("view", item.id)}
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
                                            onPageChange={(p) => {
                                                setPage(p)
                                                if (p === totalPages && hasNextPage && !isFetchingNextPage) {
                                                    void fetchNextPage()
                                                }
                                            }}
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                    {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
                </div>
            </div>

        </FadeIn>
    )
}

export default ModerationList
