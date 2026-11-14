"use client"

import { useState, useTransition, useMemo, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button, IconPlaceholder, ThreeDotsLoader, Pagination } from "@/components/reusable"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"
import ModerationListRow from "./ModerationListRow"
import ModerationGridCard from "./ModerationGridCard"
import ModerationPageControls from "./ModerationPageControls"
import AdminModerationDetailView from "./AdminModerationDetailView"
import { AdminQuickModerationModal } from "./AdminQuickModerationModal"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import {
    Settings2Icon,
    PackageIcon,
    SearchIcon,
    PlayIcon,
    RotateIcon,
} from "@/lib/icons"
import type { ModerationItem, CursorPaginatedResult } from "@/lib/admin/types"
import { getModerationQueue, approveModeration, rejectModeration } from "@/app/actions/admin/moderation"
import { useAdminActionModal } from "../AdminActionModal"
import { toast } from "@/hooks/use-notification"
import { useEntityState } from "@/hooks/use-entity-state"

const ITEMS_PER_PAGE = 12

interface ModerationListProps {
    initialData?: CursorPaginatedResult<ModerationItem>
    currentMode?: "automatic" | "manual" | "videos"
    onModeChange?: (mode: "automatic" | "manual" | "videos") => void
}

const ModerationList = ({
    initialData,
    currentMode = "automatic",
    onModeChange,
}: ModerationListProps) => {
    const { state: entityState, close: closeEntity } = useEntityState()
    const router = useRouter()
    const { modal: actionModal, runAction } = useAdminActionModal()

    const [statusFilter, setStatusFilter] = useState("all")
    const [typeFilter, setTypeFilter] = useState("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const [isPending, startTransition] = useTransition()
    const [items, setItems] = useState<ModerationItem[]>(initialData?.data || [])
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [quickReviewItem, setQuickReviewItem] = useState<ModerationItem | null>(null)

    // ─── Approve Handler ──────────────────────────────────────────────────────
    const handleApprove = useCallback((id: string, type: ModerationItem["type"]) => {
        const item = items.find((i) => i.id === id)
        const typeLabel = type === "product" ? "Produto" : type === "service" ? "Serviço" : type === "partner" ? "Perfil" : "Item"

        runAction({
            title: `Aprovar ${typeLabel}`,
            description: `Confirme a aprovação de "${item?.title || id}" no marketplace.`,
            changedFields: ["Status alterado para Aprovado"],
            confirmLabel: "Aprovar",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const result = await approveModeration(id, type as any, {
                    reason: payload.reason,
                    riskScore: payload.riskScore,
                    notifySeller: payload.notifySeller,
                })
                if (result.success) {
                    toast.success(`${typeLabel} aprovado com sucesso!`)
                    setItems((prev) => prev.filter((i) => i.id !== id))
                    return { success: true }
                }
                toast.error(result.error || `Erro ao aprovar ${typeLabel.toLowerCase()}`)
                return { success: false, error: result.error }
            },
        })
    }, [items, runAction])

    // ─── Reject Handler ───────────────────────────────────────────────────────
    const handleReject = useCallback((item: ModerationItem) => {
        const typeLabel = item.type === "product" ? "Produto" : item.type === "service" ? "Serviço" : item.type === "partner" ? "Perfil" : "Item"

        runAction({
            title: `Rejeitar ${typeLabel}`,
            description: `Informe o motivo da rejeição de "${item.title}".`,
            requireReason: true,
            changedFields: ["Status alterado para Rejeitado"],
            confirmLabel: "Confirmar Rejeição",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const result = await rejectModeration(item.id, payload.reason, item.type as any, {
                    reason: payload.reason,
                    riskScore: payload.riskScore,
                    notifySeller: payload.notifySeller,
                })
                if (result.success) {
                    toast.success(`${typeLabel} rejeitado com sucesso!`)
                    setItems((prev) => prev.filter((i) => i.id !== item.id))
                    return { success: true }
                }
                toast.error(result.error || `Erro ao rejeitar ${typeLabel.toLowerCase()}`)
                return { success: false, error: result.error }
            },
        })
    }, [runAction])

    // ─── Edit Handler ─────────────────────────────────────────────────────────
    const handleEdit = useCallback((item: ModerationItem) => {
        let editUrl = ""
        if (item.type === "product") {
            editUrl = `/ddt-admin/catalog/products/${item.id}`
        } else if (item.type === "service") {
            editUrl = `/ddt-admin/catalog/services/${item.id}`
        } else if (item.type === "recurring_plan") {
            editUrl = `/ddt-admin/catalog/plans/${item.id}`
        } else if (item.type === "partner") {
            editUrl = `/ddt-admin/partners/${item.id}`
        } else if (item.type === "community_video") {
            editUrl = `/ddt-admin/videos`
        }

        if (editUrl) {
            window.open(editUrl, "_blank")
        } else {
            setQuickReviewItem(item)
        }
    }, [])

    // ─── Detail / Quick Review Handler ─────────────────────────────────────────
    const handleDetail = useCallback((item: ModerationItem) => {
        setQuickReviewItem(item)
    }, [])

    // ─── Status Filter Handler ───────────────────────────────────────────────
    const handleStatusFilterChange = useCallback((newFilter: string) => {
        setStatusFilter(newFilter)
        startTransition(async () => {
            try {
                const result = await getModerationQueue(null, 100, newFilter)
                setItems(result.data)
            } catch (err) {
                console.error("Failed to load moderation queue for status:", err)
            }
        })
    }, [])

    // ─── Refresh Handler ──────────────────────────────────────────────────────
    const refreshItems = useCallback(() => {
        startTransition(async () => {
            try {
                const result = await getModerationQueue(null, 100, statusFilter)
                setItems(result.data)
                toast.success("Fila de moderação atualizada")
            } catch (err) {
                console.error("Failed to refresh moderation queue:", err)
                toast.error("Erro ao atualizar fila")
            }
        })
    }, [statusFilter])

    // ─── Instant in-memory filtering (0ms) ────────────────────────────────────
    const filteredItems = useMemo(() => {
        const term = search.trim().toLowerCase()

        return items.filter((item) => {
            // Status filter
            if (statusFilter !== "all" && item.moderation_status !== statusFilter) {
                return false
            }

            // Type filter
            if (typeFilter !== "all" && item.type !== typeFilter) {
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
    }, [items, statusFilter, typeFilter, search])

    // ─── Pagination ──────────────────────────────────────────────────
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredItems.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredItems, page])

    // Reset to page 1 on filter/search change
    useEffect(() => {
        setPage(1)
    }, [statusFilter, typeFilter, search])

    // ─── If viewing detail (inline) ──────────────────────────────────────────────────────────
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        const currentItem = items.find((i) => i.id === entityState.entityId)
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

                    {/* Dropdown de Ações no estilo ERP com Settings2Icon */}
                    <div className="flex items-center gap-3">
                        <Dropdown
                            trigger={
                                <Button
                                    variant="outline"
                                    className="h-[42px] px-3 gap-2"
                                    leftIcon={<Settings2Icon size={18} />}
                                >
                                    Ações
                                </Button>
                            }
                            align="right"
                            showChevron={false}
                        >
                            <DropdownItem
                                onClick={() => onModeChange?.("automatic")}
                                className={currentMode === "automatic" ? "font-bold text-brand-green" : ""}
                            >
                                <PackageIcon size={16} /> Fila de Moderação
                            </DropdownItem>
                            <DropdownItem
                                onClick={() => onModeChange?.("manual")}
                                className={currentMode === "manual" ? "font-bold text-brand-green" : ""}
                            >
                                <SearchIcon size={16} /> Busca por ID
                            </DropdownItem>
                            <DropdownItem
                                onClick={() => onModeChange?.("videos")}
                                className={currentMode === "videos" ? "font-bold text-brand-green" : ""}
                            >
                                <PlayIcon size={16} /> Vídeos da Comunidade
                            </DropdownItem>
                            <div className="border-t border-brand-border dark:border-dark-border my-1" />
                            <DropdownItem onClick={refreshItems} disabled={isPending}>
                                <RotateIcon size={16} className={isPending ? "animate-spin" : ""} /> Atualizar Fila
                            </DropdownItem>
                        </Dropdown>
                    </div>
                </div>

                {/* Mobile Header */}
                <div className="md:hidden flex items-center justify-between mb-4 flex-none px-4">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-[24px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Moderação
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[13px] font-medium">
                            Revise itens pendentes
                        </p>
                    </div>

                    <Dropdown
                        trigger={
                            <Button
                                variant="outline"
                                className="w-[42px] h-[42px] p-0 flex items-center justify-center"
                            >
                                <Settings2Icon className="w-4 h-4" />
                            </Button>
                        }
                        align="right"
                        showChevron={false}
                    >
                        <DropdownItem
                            onClick={() => onModeChange?.("automatic")}
                            className={currentMode === "automatic" ? "font-bold text-brand-green" : ""}
                        >
                            <PackageIcon size={16} /> Fila de Moderação
                        </DropdownItem>
                        <DropdownItem
                            onClick={() => onModeChange?.("manual")}
                            className={currentMode === "manual" ? "font-bold text-brand-green" : ""}
                        >
                            <SearchIcon size={16} /> Busca por ID
                        </DropdownItem>
                        <DropdownItem
                            onClick={() => onModeChange?.("videos")}
                            className={currentMode === "videos" ? "font-bold text-brand-green" : ""}
                        >
                            <PlayIcon size={16} /> Vídeos da Comunidade
                        </DropdownItem>
                        <div className="border-t border-brand-border dark:border-dark-border my-1" />
                        <DropdownItem onClick={refreshItems} disabled={isPending}>
                            <RotateIcon size={16} /> Atualizar Fila
                        </DropdownItem>
                    </Dropdown>
                </div>

                {/* Page Controls (ERP Standard) */}
                <ModerationPageControls
                    statusFilter={statusFilter}
                    setStatusFilter={handleStatusFilterChange}
                    typeFilter={typeFilter}
                    setTypeFilter={setTypeFilter}
                    search={search}
                    onSearchChange={setSearch}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    items={items}
                />

                {/* List / Grid Content */}
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
                                    subtitle={
                                        search || statusFilter !== "all" || typeFilter !== "all"
                                            ? "Tente ajustar seus filtros de busca."
                                            : "Todos os itens foram revisados ou não correspondem aos filtros atuais."
                                    }
                                    itemButton={
                                        search || statusFilter !== "all" || typeFilter !== "all"
                                            ? {
                                                text: "Limpar filtros",
                                                action: () => {
                                                    setStatusFilter("all")
                                                    setTypeFilter("all")
                                                    setSearch("")
                                                },
                                                variant: "outline",
                                            }
                                            : undefined
                                    }
                                />
                            </FadeIn>
                        ) : viewMode === "grid" ? (
                            /* ─── Grid View ─── */
                            <FadeIn key="grid" className="w-full">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {paginatedItems.map((item) => (
                                        <ModerationGridCard
                                            key={item.id}
                                            item={item}
                                            isPending={isPending}
                                            onDetail={handleDetail}
                                            onApprove={handleApprove}
                                            onReject={handleReject}
                                            onEdit={handleEdit}
                                        />
                                    ))}
                                </div>

                                {/* Pagination */}
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
                        ) : (
                            /* ─── List View ─── */
                            <FadeIn key="list" className="w-full">
                                {/* Desktop Table View */}
                                <div className="w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                        Item / Produto
                                                    </th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                        Loja
                                                    </th>
                                                    <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Tipo
                                                    </th>
                                                    <th className="py-3 px-2 w-40 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Data
                                                    </th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Status
                                                    </th>
                                                    <th className="py-3 px-2 w-24 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Ações
                                                    </th>
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
                                                        onReject={handleReject}
                                                        onEdit={handleEdit}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination */}
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

            {/* Modal de Moderação Rápida (com DefaultModal e useAdminActionModal) */}
            {quickReviewItem && (
                <AdminQuickModerationModal
                    item={quickReviewItem}
                    isOpen={!!quickReviewItem}
                    onClose={() => setQuickReviewItem(null)}
                    onResolved={(action, updatedItem) => {
                        if (action === "approved" || action === "rejected") {
                            setItems((prev) => prev.filter((i) => i.id !== quickReviewItem.id))
                            setQuickReviewItem(null)
                        } else if (action === "updated" && updatedItem) {
                            setItems((prev) =>
                                prev.map((i) => (i.id === updatedItem.id ? { ...i, ...updatedItem } : i))
                            )
                            setQuickReviewItem((prev) => (prev ? { ...prev, ...updatedItem } : null))
                        }
                    }}
                />
            )}

            {/* Modal de Ação para aprovações/rejeições diretas */}
            {actionModal}
        </FadeIn>
    )
}

export default ModerationList
