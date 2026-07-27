"use client"

import { useState, useTransition, useRef, useMemo, useEffect } from "react"
import { Button, Badge, Input, IconPlaceholder, ThreeDotsLoader, Pagination } from "@/components/reusable"
import ReturnListRow from "./ReturnListRow"
import ReturnsPageControls from "./ReturnsPageControls"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { ReturnIcon, StoreIcon, XIcon, InfoIcon, PackageIcon, ClockIcon } from "@/lib/icons"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import { getAdminReturnRequests } from "@/app/actions/admin/marketplace-ops"
import BottomSheet from "@/components/BottomSheet"
import Portal from "@/components/Portal"
import { useMediaQuery } from "@/components/erp/hooks"
import { useEntityPage } from "@/hooks/use-entity-page"
import { toast } from "@/hooks/use-notification"
import { formatCurrency, formatDate } from "@/lib/utils"
import Link from "next/link"

// ─── Main Component ─────────────────────────────────────────────────────────

interface ReturnsListProps {
    initialData: CursorPaginatedResult<any>
}

const ReturnsList = ({ initialData }: ReturnsListProps) => {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const observerTarget = useRef<HTMLDivElement>(null)
    const [statusTab, setStatusTab] = useState("all")
    const [detailRequest, setDetailRequest] = useState<any>(null)
    const [isPending, startTransition] = useTransition()

    // Search state
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(t)
    }, [search])

    // ─── Entity Page ──────────────────────────────────────────────────────────
    const entityPage = useEntityPage<any, any, string>({
        entityType: 'admin-returns',
        partnerId: 'admin',
        queryKey: ['admin', 'returns', statusTab, debouncedSearch],
        initialItems: (debouncedSearch === "" && statusTab === "all") ? initialData.data : [],
        initialNextCursor: (debouncedSearch === "" && statusTab === "all") ? initialData.nextCursor : null,
        initialHasMore: (debouncedSearch === "" && statusTab === "all") ? initialData.hasMore : true,
        fetchPageFn: async ({ cursor }) => {
            const res = await getAdminReturnRequests(cursor, 40, {
                status: statusTab === "all" ? undefined : statusTab,
                search: debouncedSearch
            })
            return { items: res.data, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: (r) => r.id,
        getDetailFn: async () => null,
    })

    const {
        items: rawRequests, hasNextPage, isFetchingNextPage, isListLoading, fetchNextPage, afterMutation,
    } = entityPage

    // Pagination
    const [page, setPage] = useState(1)
    const itemsPerPage = 8
    const totalPages = Math.ceil(rawRequests.length / itemsPerPage)
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return rawRequests.slice(start, start + itemsPerPage)
    }, [rawRequests, page])

    // Reset page when filters change
    useEffect(() => { setPage(1) }, [debouncedSearch, statusTab])

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">

                {/* Header Title/Subtitle (ERP Standard) */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Trocas e Devoluções
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie solicitações de troca e devolução dos clientes.
                        </p>
                    </div>
                </div>

                {/* Page Controls */}
                <ReturnsPageControls
                    search={search}
                    setSearch={setSearch}
                    statusTab={statusTab}
                    setStatusTab={setStatusTab}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 && !isListLoading ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Nenhuma solicitação"
                                    title="Nenhuma solicitação encontrada"
                                    subtitle={search ? "Tente ajustar sua busca." : "Nenhuma troca ou devolução no momento."}
                                    itemButton={search ? {
                                        text: "Limpar Busca",
                                        action: () => setSearch(""),
                                        variant: "outline"
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : isListLoading ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[500px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full">
                                {/* Mobile/Tablet View */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((request) => {
                                        const refundAmount = Number(request.refund_amount || 0)
                                        const timelineCount = Array.isArray(request.return_events) ? request.return_events.length : 0
                                        return (
                                            <div
                                                key={request.id}
                                                className="py-5 flex flex-col gap-3 cursor-pointer"
                                                onClick={() => setDetailRequest(request)}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <span className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                            #{request.id.slice(0, 8)}
                                                        </span>
                                                        <span className="text-xs font-medium text-brand-inactive-text">
                                                            {request.customer_name_snapshot || "Cliente"}
                                                        </span>
                                                    </div>
                                                    <Badge variant={request.status === "APPROVED" ? "green" : request.status === "REJECTED" ? "red" : "orange"}>
                                                        {request.status || "N/A"}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {getBadgeForType(request.request_type)}
                                                    <span className="text-xs text-brand-inactive-text ml-auto">
                                                        {formatDate(request.created_at)}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 text-xs text-brand-inactive-text">
                                                    <StoreIcon size={12} />
                                                    <span>{request.stores?.name || request.partners?.stores?.[0]?.name || request.partners?.store_name || "-"}</span>
                                                    <span className="ml-auto">{timelineCount} eventos</span>
                                                    {refundAmount > 0 && (
                                                        <span className="font-bold">{formatCurrency(refundAmount)}</span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Desktop Table View */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1100px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">Solicitação</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Pedido</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Cliente</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Seller</th>
                                                    <th className="py-3 px-2 w-20 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Tipo</th>
                                                    <th className="py-3 px-2 w-24 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Status</th>
                                                    <th className="py-3 px-2 w-24 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Resolução</th>
                                                    <th className="py-3 px-2 w-24 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Valor</th>
                                                    <th className="py-3 px-2 w-20 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Origem</th>
                                                    <th className="py-3 px-2 w-24 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">Timeline</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((request) => (
                                                    <ReturnListRow
                                                        key={request.id}
                                                        request={request}
                                                        isPending={isPending}
                                                        onDetail={setDetailRequest}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <Pagination
                                        currentPage={page}
                                        totalPages={totalPages}
                                        onPageChange={(p) => {
                                            setPage(p)
                                            if (p >= totalPages - 1 && hasNextPage && !isFetchingNextPage) {
                                                void fetchNextPage()
                                            }
                                        }}
                                    />
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Detail Sheet */}
            <ReturnDetailsSheet
                request={detailRequest}
                isOpen={!!detailRequest}
                onClose={() => setDetailRequest(null)}
            />
        </FadeIn>
    )
}

export default ReturnsList

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getBadgeForType(type: string) {
    switch (type) {
        case "exchange": return <Badge variant="blue">Troca</Badge>
        case "return": return <Badge variant="orange">Devolução</Badge>
        case "complaint": return <Badge variant="red">Reclamação</Badge>
        default: return <Badge variant="gray">{type}</Badge>
    }
}

// ─── Detail Sheet Sub-component ──────────────────────────────────────────────

interface ReturnDetailsSheetProps {
    request: any | null
    isOpen: boolean
    onClose: () => void
}

function ReturnDetailsSheet({ request, isOpen, onClose }: ReturnDetailsSheetProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const refundAmount = Number(request?.refund_amount || 0)
    const creditAmount = Number(request?.store_credit_amount || 0)
    const timelineCount = Array.isArray(request?.return_events) ? request.return_events.length : 0
    const evidenceCount = Array.isArray(request?.return_evidence) ? request.return_evidence.length : 0
    const items = Array.isArray(request?.return_items) ? request.return_items : []

    const content = request ? (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            {/* Header */}
            <header className="z-10 shrink-0 flex items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex flex-col gap-0.5">
                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Detalhes da Solicitação</h2>
                    <p className="text-[10px] font-bold text-brand-inactive-text opacity-70 tracking-widest uppercase font-mono truncate max-w-[300px]">
                        #{request.id.slice(0, 8)}
                    </p>
                </div>
                <Button variant="filled" onClick={onClose} size="icon">
                    <XIcon className="w-5 h-5" />
                </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* Header Info */}
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-brand-gray dark:bg-dark-border/30 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <ReturnIcon className="w-7 h-7 text-brand-inactive-text" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-tight">
                            {getBadgeForType(request.request_type)}
                        </h3>
                        <p className="text-xs text-brand-inactive-text mt-1">
                            {formatDate(request.created_at)}
                        </p>
                        <p className="text-[10px] font-bold text-brand-inactive-text opacity-70 tracking-widest uppercase font-mono mt-1">
                            Pedido: {request.order_number_snapshot || request.orders?.order_number || "-"}
                        </p>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="p-4 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border space-y-4">
                    <div className="flex items-start gap-3">
                        <StoreIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                        <div>
                            <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Cliente</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                {request.customer_name_snapshot || "Cliente"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                        <StoreIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                        <div>
                            <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Vendedor</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                {request.stores?.name || request.partners?.store_name || "-"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                        <InfoIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                        <div className="flex-1">
                            <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Status</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                                <Badge variant={request.status === "APPROVED" ? "green" : request.status === "REJECTED" ? "red" : "orange"}>
                                    {request.status || "N/A"}
                                </Badge>
                                <Badge variant="blue">{request.eligibility_status || "N/A"}</Badge>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                        <InfoIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                        <div>
                            <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Resolução</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                {request.desired_resolution || request.approved_resolution || request.resolution_type || "-"}
                            </span>
                        </div>
                    </div>

                    {(refundAmount > 0 || creditAmount > 0) && (
                        <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                            <InfoIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                            <div>
                                <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Valores</span>
                                {refundAmount > 0 && (
                                    <span className="text-sm font-bold text-brand-green block">Reembolso: {formatCurrency(refundAmount)}</span>
                                )}
                                {creditAmount > 0 && (
                                    <span className="text-sm font-bold text-brand-blue block">Crédito: {formatCurrency(creditAmount)}</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Itens */}
                    {items.length > 0 && (
                        <div className="pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                            <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block mb-2">Itens</span>
                            <div className="space-y-2">
                                {items.map((item: any) => (
                                    <div key={item.id} className="flex justify-between items-center bg-white dark:bg-dark-background p-3 rounded-xl border border-brand-border dark:border-dark-border">
                                        <div className="min-w-0 flex-1">
                                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading block truncate">
                                                {item.product_name_snapshot || "Item"}
                                            </span>
                                            <span className="text-[11px] text-brand-inactive-text">
                                                Qtd: {item.quantity || 1} - {item.reason || item.condition || "-"}
                                            </span>
                                        </div>
                                        {item.net_item_value_snapshot && (
                                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading ml-2">
                                                {formatCurrency(Number(item.net_item_value_snapshot))}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Timeline & Evidence */}
                <div className="p-4 bg-brand-gray/30 dark:bg-dark-border/10 rounded-2xl border border-brand-border dark:border-dark-border">
                    <div className="flex justify-between items-center">
                        <div>
                            <span className="text-[11px] font-bold text-brand-inactive-text block">Linha do Tempo</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{timelineCount} eventos</span>
                        </div>
                        <div className="text-right">
                            <span className="text-[11px] font-bold text-brand-inactive-text block">Evidências</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{evidenceCount} arquivo(s)</span>
                        </div>
                    </div>
                </div>

                {/* Motivo do Cliente */}
                {request.customer_reason && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/20">
                        <div className="flex gap-3">
                            <InfoIcon className="text-blue-600 shrink-0 mt-0.5" size={18} />
                            <div>
                                <p className="text-sm font-bold text-blue-900 dark:text-blue-300">Motivo do Cliente</p>
                                <p className="text-xs text-blue-800 dark:text-blue-400 leading-relaxed mt-1">
                                    {request.customer_reason}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Source & SLA */}
                <div className="flex gap-4">
                    <div className="flex-1 bg-brand-gray/30 dark:bg-dark-border/10 rounded-xl p-3 text-center">
                        <span className="text-[10px] font-bold text-brand-inactive-text block">Origem</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{request.source || "-"}</span>
                    </div>
                    {request.sla_status && (
                        <div className="flex-1 bg-brand-gray/30 dark:bg-dark-border/10 rounded-xl p-3 text-center">
                            <span className="text-[10px] font-bold text-brand-inactive-text block">SLA</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{request.sla_status}</span>
                        </div>
                    )}
                </div>

                {/* Link para detalhes completos */}
                <div className="text-center">
                    <Link
                        href={`/ddt-admin/returns/${request.id}`}
                        className="text-sm font-bold text-brand-primary hover:underline"
                    >
                        Ver detalhes completos →
                    </Link>
                </div>
            </div>
        </div>
    ) : null

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-96 md:w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    )
}
