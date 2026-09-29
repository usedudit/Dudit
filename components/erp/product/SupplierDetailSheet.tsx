"use client"

import React, { useEffect, useState } from "react"
import { Accordion, Button, IconPlaceholder, Pagination, Spinner } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useERPData, useMediaQuery } from "@/components/erp/hooks"
import { getProductSupplierDetailsAction } from "@/app/actions/erp/products"
import { formatCurrency, formatUnit } from "@/lib/utils"
import { useModalLayer } from "@/lib/modal-stack"
import { ClockIcon, Package, TagIcon, XIcon } from "@/lib/icons"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import type { ProductSupplierWithDetails } from "@/lib/types/product"

const PURCHASES_PER_PAGE = 5

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
    const [purchasesPage, setPurchasesPage] = useState(1)

    const supplierId = supplier?.supplier_id || null

    useEffect(() => {
        if (isOpen) setPurchasesPage(1)
    }, [isOpen, supplierId])

    // Detalhes carregados sob demanda e cacheados pelo react-query:
    // reabrir a sheet do mesmo fornecedor é instantâneo.
    const detailsQuery = useERPData(
        ["erp", "product-supplier-details", productId, supplierId, purchasesPage],
        () =>
            getProductSupplierDetailsAction(productId as string, supplierId as string, {
                purchasesPage,
                purchasesLimit: PURCHASES_PER_PAGE,
            }),
        { enabled: isOpen && Boolean(productId && supplierId), priority: "normal" }
    )

    const data = detailsQuery.data && !detailsQuery.data.error ? detailsQuery.data : null
    const queryError: string | null =
        detailsQuery.data?.error || (detailsQuery.isError ? "Não foi possível carregar os detalhes." : null)
    const isLoading = !data && !queryError && (detailsQuery.isLoading || detailsQuery.isFetching)

    const purchases: any[] = data?.purchases || []
    const costHistory: any[] = data?.costHistory || []
    const purchasesTotalPages = Math.ceil((data?.purchasesTotal || 0) / PURCHASES_PER_PAGE)

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
                    )}
                    {purchasesTotalPages > 1 && (
                        <div className="mt-4">
                            <Pagination
                                currentPage={purchasesPage}
                                totalPages={purchasesTotalPages}
                                onPageChange={setPurchasesPage}
                            />
                        </div>
                    )}
                </Accordion>
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

export default SupplierDetailSheet
