"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Accordion, Button, IconPlaceholder, Spinner } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useERPData, useMediaQuery } from "@/components/erp/hooks"
import { getProductSupplierDetailsAction } from "@/app/actions/erp/products"
import { formatCurrency, formatUnit } from "@/lib/utils"
import { useModalLayer } from "@/lib/modal-stack"
import { ClockIcon, Package, TagIcon, XIcon } from "@/lib/icons"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import type { ProductSupplierWithDetails } from "@/lib/types/product"

const PREVIEW_LIMIT = 3
const SEE_ALL_PAGE_SIZE = 20

type SeeAllKind = "costHistory" | "purchases"

const TimelineItem = React.memo(({
    icon: Icon,
    time,
    title,
    subtitle,
}: {
    icon: any
    time: string
    title: string
    subtitle?: string
}) => (
    <div className="flex relative z-10 w-full">
        <div className="w-8 h-8 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex-shrink-0 flex items-center justify-center mr-4 border-[3px] border-white dark:border-dark-surface shadow-[0_0_0_2px_#ffffff] dark:shadow-[0_0_0_2px_rgba(28,28,30,0.5)]">
            <Icon size={14} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <div className="flex flex-col justify-start -mt-0.5 min-w-0 flex-1">
            <div className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wide mb-1">
                {time}
            </div>
            <div className="text-[14px] font-semibold text-brand-dark dark:text-dark-heading leading-snug">
                {title}
            </div>
            {subtitle && (
                <div className="text-[12px] text-brand-inactive-text mt-0.5 truncate">{subtitle}</div>
            )}
        </div>
    </div>
))
TimelineItem.displayName = "TimelineItem"

const RowSkeleton = () => (
    <div className="flex animate-pulse items-center gap-4 py-2">
        <div className="h-8 w-8 shrink-0 rounded-full bg-gray-100 dark:bg-dark-border" />
        <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-dark-border" />
            <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-dark-border" />
        </div>
    </div>
)

interface SupplierDetailSheetProps {
    isOpen: boolean
    onClose: () => void
    supplier: ProductSupplierWithDetails | null
    productId?: string
    productUnit?: string
}

export const SupplierDetailSheet: React.FC<SupplierDetailSheetProps> = ({
    isOpen,
    onClose,
    supplier,
    productId,
    productUnit,
}) => {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const zIndex = useModalLayer(isOpen)
    const [seeAllKind, setSeeAllKind] = useState<SeeAllKind | null>(null)

    const supplierId = supplier?.supplier_id || null

    useEffect(() => {
        if (!isOpen) setSeeAllKind(null)
    }, [isOpen])

    // Preview leve: só 3 itens por seção. Os demais carregam na sheet "Ver tudo".
    const detailsQuery = useERPData(
        ["erp", "product-supplier-details", productId, supplierId],
        () =>
            getProductSupplierDetailsAction(productId as string, supplierId as string, {
                purchasesPage: 1,
                purchasesLimit: PREVIEW_LIMIT,
                costHistoryPage: 1,
                costHistoryLimit: PREVIEW_LIMIT,
            }),
        { enabled: isOpen && Boolean(productId && supplierId), priority: "normal" }
    )

    const data = detailsQuery.data && !detailsQuery.data.error ? detailsQuery.data : null
    const queryError: string | null =
        detailsQuery.data?.error || (detailsQuery.isError ? "Não foi possível carregar os detalhes." : null)
    const isLoading = !data && !queryError && (detailsQuery.isLoading || detailsQuery.isFetching)

    const purchases: any[] = data?.purchases || []
    const costHistory: any[] = data?.costHistory || []
    const purchasesTotal: number = data?.purchasesTotal || 0
    const costHistoryTotal: number = data?.costHistoryTotal || 0

    const supplierName = supplier?.supplier_name || "Fornecedor"

    const content = supplier ? (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            <header className="shrink-0 border-b border-brand-border dark:border-dark-border p-5 lg:p-6 flex justify-between items-center gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <UserProfileImage
                        fullName={supplier.supplier_name || "Fornecedor"}
                        imageUrl={supplier.supplier_image_url}
                        className="w-11 h-11 text-base shrink-0"
                    />
                    <div className="min-w-0">
                        <h2 className="text-lg lg:text-xl font-bold text-brand-dark dark:text-dark-heading truncate">
                            {supplier.supplier_name || "Fornecedor"}
                        </h2>
                        <p className="text-sm text-brand-inactive-text truncate">
                            {supplier.supplier_document || "Detalhes do fornecedor"}
                        </p>
                    </div>
                </div>
                <Button
                    variant="filled"
                    size="icon"
                    onClick={onClose}
                    className="hidden lg:flex shrink-0"
                    title="Fechar detalhes"
                    aria-label="Fechar detalhes"
                >
                    <XIcon className="w-5 h-5" />
                </Button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar space-y-2">
                {/* Última Compra */}
                <Accordion title="Última Compra" defaultOpen>
                    <div className="flex items-center gap-3 pb-3 border-b border-brand-border dark:border-dark-border">
                        <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0">
                            <Package size={18} className="text-brand-green" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {supplier.supplier_name}
                            </p>
                            <p className="text-xs text-brand-inactive-text truncate">
                                {supplier.last_purchase_date
                                    ? `Última compra em ${new Date(supplier.last_purchase_date).toLocaleDateString("pt-BR")}`
                                    : "Nenhuma compra registrada"}
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-xs text-brand-inactive-text font-medium">Último Custo</p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                {supplier.last_purchase_price != null
                                    ? formatCurrency(supplier.last_purchase_price)
                                    : supplier.cost_price != null
                                        ? formatCurrency(supplier.cost_price)
                                        : "-"}
                            </p>
                            {supplier.last_purchase_price != null && (
                                <p className="text-[11px] text-brand-inactive-text truncate">
                                    {supplier.last_invoice_key ? `NF ${supplier.last_invoice_key}` : "Compra registrada"}
                                </p>
                            )}
                        </div>
                        <div>
                            <p className="text-xs text-brand-inactive-text font-medium">Custo Atual</p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                {supplier.cost_price != null ? formatCurrency(supplier.cost_price) : "-"}
                            </p>
                            {supplier.supplier_sku && (
                                <p className="text-[11px] text-brand-inactive-text truncate">
                                    SKU {supplier.supplier_sku}
                                </p>
                            )}
                        </div>
                    </div>
                </Accordion>

                {/* Histórico de Custos */}
                <Accordion title="Histórico de Custos">
                    {queryError ? (
                        <p className="text-sm text-brand-red text-center py-4">{queryError}</p>
                    ) : isLoading ? (
                        <div className="flex justify-center py-4">
                            <Spinner size={20} />
                        </div>
                    ) : costHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center py-6">
                            <IconPlaceholder
                                icon={ClockIcon}
                                containerSize="w-12 h-12 mb-2"
                                iconSize="w-5 h-5"
                                titleClass="text-base font-bold text-brand-dark dark:text-dark-heading mb-1"
                                subtitleClass="text-sm text-brand-inactive-text dark:text-dark-body mb-0"
                                title="Nenhum histórico encontrado"
                                subtitle="Não foram encontrados eventos de custo para este fornecedor."
                            />
                        </div>
                    ) : (
                        <>
                            <div className="space-y-6 relative">
                                {costHistory.length > 1 && (
                                    <div className="absolute left-[15px] top-4 bottom-[-16px] w-[2px] bg-brand-green-light dark:bg-dark-border/40 z-0" />
                                )}
                                {costHistory.map((h: any) => (
                                    <TimelineItem
                                        key={h.id}
                                        icon={TagIcon}
                                        time={new Date(h.changed_at).toLocaleDateString("pt-BR")}
                                        title={formatCurrency(h.new_cost)}
                                        subtitle={
                                            h.previous_cost != null
                                                ? `Anterior: ${formatCurrency(h.previous_cost)}`
                                                : undefined
                                        }
                                    />
                                ))}
                            </div>
                            {costHistoryTotal > PREVIEW_LIMIT && (
                                <button
                                    type="button"
                                    onClick={() => setSeeAllKind("costHistory")}
                                    className="mt-4 w-full text-center text-sm font-bold text-brand-green hover:underline"
                                >
                                    Ver tudo ({costHistoryTotal})
                                </button>
                            )}
                        </>
                    )}
                </Accordion>

                {/* Compras Recentes */}
                <Accordion title="Compras Recentes">
                    {queryError ? (
                        <p className="text-sm text-brand-red text-center py-4">{queryError}</p>
                    ) : isLoading ? (
                        <div className="flex justify-center py-4">
                            <Spinner size={20} />
                        </div>
                    ) : purchases.length === 0 ? (
                        <p className="text-sm text-brand-inactive-text text-center py-4">
                            Nenhuma compra encontrada
                        </p>
                    ) : (
                        <>
                            <div className="space-y-6 relative">
                                {purchases.length > 1 && (
                                    <div className="absolute left-[15px] top-4 bottom-[-16px] w-[2px] bg-brand-green-light dark:bg-dark-border/40 z-0" />
                                )}
                                {purchases.map((p: any) => (
                                    <TimelineItem
                                        key={p.id}
                                        icon={Package}
                                        time={new Date(p.date).toLocaleDateString("pt-BR")}
                                        title={p.invoice_number || supplier.supplier_name || "Compra"}
                                        subtitle={`${Number(p.quantity).toFixed(2)} ${formatUnit(
                                            productUnit
                                        )} x ${formatCurrency(p.unit_cost)} · ${formatCurrency(p.total_cost)}`}
                                    />
                                ))}
                            </div>
                            {purchasesTotal > PREVIEW_LIMIT && (
                                <button
                                    type="button"
                                    onClick={() => setSeeAllKind("purchases")}
                                    className="mt-4 w-full text-center text-sm font-bold text-brand-green hover:underline"
                                >
                                    Ver tudo ({purchasesTotal})
                                </button>
                            )}
                        </>
                    )}
                </Accordion>
            </div>

            {/* Sheet "Ver tudo" - lista completa com infinite scroll */}
            <SeeAllSheet
                isOpen={seeAllKind !== null}
                kind={seeAllKind}
                onClose={() => setSeeAllKind(null)}
                productId={productId}
                supplierId={supplierId}
                supplierName={supplierName}
                productUnit={productUnit}
            />
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
                className={`fixed inset-0 bg-black/50 z-50 transition-opacity ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                style={{ zIndex }}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-96 bg-white dark:bg-dark-surface shadow-2xl rounded-2xl transition-transform duration-300 overflow-hidden ${isOpen ? "translate-x-0" : "translate-x-[120%]"
                        }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet "Ver tudo": lista completa (custos ou compras) com infinite scroll
// (sentinel + IntersectionObserver), no mesmo padrão da SelectSupplierSheet.
// ─────────────────────────────────────────────────────────────────────────────

interface SeeAllSheetProps {
    isOpen: boolean
    kind: SeeAllKind | null
    onClose: () => void
    productId?: string
    supplierId?: string | null
    supplierName: string
    productUnit?: string
}

const SeeAllSheet: React.FC<SeeAllSheetProps> = ({
    isOpen,
    kind,
    onClose,
    productId,
    supplierId,
    supplierName,
    productUnit,
}) => {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const zIndex = useModalLayer(isOpen)

    const [items, setItems] = useState<any[]>([])
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const listScrollRef = useRef<HTMLDivElement>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const loadMoreLock = useRef(false)
    const requestIdRef = useRef(0)

    const title = kind === "costHistory" ? "Histórico de Custos" : "Compras Recentes"

    const loadPage = useCallback(
        async (pageToLoad: number, append: boolean) => {
            if (!productId || !supplierId || !kind) return

            const requestId = ++requestIdRef.current
            setIsLoading(true)
            setError(null)

            try {
                const options =
                    kind === "costHistory"
                        ? {
                            purchasesPage: 1,
                            purchasesLimit: 1,
                            costHistoryPage: pageToLoad,
                            costHistoryLimit: SEE_ALL_PAGE_SIZE,
                        }
                        : {
                            purchasesPage: pageToLoad,
                            purchasesLimit: SEE_ALL_PAGE_SIZE,
                            costHistoryPage: 1,
                            costHistoryLimit: 1,
                        }

                const res = await getProductSupplierDetailsAction(productId, supplierId, options)
                if (requestId !== requestIdRef.current) return

                if (res.error) {
                    setError(res.error)
                    return
                }

                const fetched = (kind === "costHistory" ? res.costHistory : res.purchases) || []
                const total = (kind === "costHistory" ? res.costHistoryTotal : res.purchasesTotal) || 0

                setItems((prev) => (append ? [...prev, ...fetched] : fetched))
                setPage(pageToLoad)
                setHasMore(pageToLoad * SEE_ALL_PAGE_SIZE < total)
            } catch (e: any) {
                if (requestId === requestIdRef.current) {
                    setError(e?.message || "Não foi possível carregar os dados.")
                }
            } finally {
                if (requestId === requestIdRef.current) setIsLoading(false)
            }
        },
        [productId, supplierId, kind]
    )

    // Reset ao abrir / trocar de seção
    useEffect(() => {
        if (!isOpen) return
        requestIdRef.current++
        setItems([])
        setPage(1)
        setHasMore(false)
        setError(null)
        setIsLoading(false)
        loadMoreLock.current = false
        if (listScrollRef.current) listScrollRef.current.scrollTop = 0
        void loadPage(1, false)
    }, [isOpen, kind, loadPage])

    // Infinite scroll: sentinel no fim do container de scroll
    useEffect(() => {
        const root = listScrollRef.current
        const target = sentinelRef.current
        if (!isOpen || !root || !target || !hasMore || isLoading) return

        const obs = new IntersectionObserver(
            (entries) => {
                if (!entries[0]?.isIntersecting || loadMoreLock.current) return
                loadMoreLock.current = true
                void loadPage(page + 1, true).finally(() => {
                    window.setTimeout(() => {
                        loadMoreLock.current = false
                    }, 120)
                })
            },
            { root, rootMargin: "100px", threshold: 0 }
        )
        obs.observe(target)
        return () => obs.disconnect()
    }, [isOpen, hasMore, isLoading, page, loadPage])

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            <header className="shrink-0 border-b border-brand-border dark:border-dark-border p-5 lg:p-6 flex justify-between items-center gap-4">
                <div className="min-w-0">
                    <h2 className="text-lg lg:text-xl font-bold text-brand-dark dark:text-dark-heading truncate">
                        {title}
                    </h2>
                    <p className="text-sm text-brand-inactive-text truncate">{supplierName}</p>
                </div>
                <Button
                    variant="filled"
                    size="icon"
                    onClick={onClose}
                    className="hidden lg:flex shrink-0"
                    title="Fechar"
                    aria-label="Fechar"
                >
                    <XIcon className="w-5 h-5" />
                </Button>
            </header>

            <div ref={listScrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
                {items.length === 0 && isLoading ? (
                    <div className="p-4 space-y-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <RowSkeleton key={i} />
                        ))}
                    </div>
                ) : error ? (
                    <p className="text-sm text-brand-red text-center py-6">{error}</p>
                ) : items.length === 0 ? (
                    <div className="px-4 py-12">
                        <IconPlaceholder
                            icon={kind === "costHistory" ? ClockIcon : Package}
                            title="Nenhum registro encontrado"
                            subtitle={
                                kind === "costHistory"
                                    ? "Não foram encontrados eventos de custo para este fornecedor."
                                    : "Nenhuma compra registrada para este fornecedor."
                            }
                        />
                    </div>
                ) : (
                    <div className="p-4 lg:p-6">
                        <div className="space-y-6 relative">
                            {items.length > 1 && (
                                <div className="absolute left-[15px] top-4 bottom-[-16px] w-[2px] bg-brand-green-light dark:bg-dark-border/40 z-0" />
                            )}
                            {kind === "costHistory"
                                ? items.map((h: any) => (
                                    <TimelineItem
                                        key={h.id}
                                        icon={TagIcon}
                                        time={new Date(h.changed_at).toLocaleDateString("pt-BR")}
                                        title={formatCurrency(h.new_cost)}
                                        subtitle={
                                            h.previous_cost != null
                                                ? `Anterior: ${formatCurrency(h.previous_cost)}`
                                                : undefined
                                        }
                                    />
                                ))
                                : items.map((p: any) => (
                                    <TimelineItem
                                        key={p.id}
                                        icon={Package}
                                        time={new Date(p.date).toLocaleDateString("pt-BR")}
                                        title={p.invoice_number || supplierName || "Compra"}
                                        subtitle={`${Number(p.quantity).toFixed(2)} ${formatUnit(
                                            productUnit
                                        )} x ${formatCurrency(p.unit_cost)} · ${formatCurrency(p.total_cost)}`}
                                    />
                                ))}
                        </div>

                        {isLoading && (
                            <div className="mt-4 space-y-2">
                                <RowSkeleton />
                                <RowSkeleton />
                            </div>
                        )}

                        {hasMore && <div ref={sentinelRef} className="h-3 w-full shrink-0" aria-hidden />}
                    </div>
                )}
            </div>
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
        <Portal>
            <div
                className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                style={{ zIndex }}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-[450px] bg-white dark:bg-dark-surface shadow-2xl rounded-2xl transition-transform duration-300 overflow-hidden ${isOpen ? "translate-x-0" : "translate-x-[120%]"
                        }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    )
}

export default SupplierDetailSheet
