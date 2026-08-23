"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { Badge, Button, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import AlertModal from "@/components/reusable/AlertModal"
import FilterSheet from "@/components/reusable/FilterSheet"
import type { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { BillingPageControls } from "./BillingPageControls"
import BillingGridCard from "./BillingGridCard"
import BillingListRow from "./BillingListRow"
import { InvoicePrintModal } from "./InvoicePrintModal"
import { listPurchasesPageAction, updatePurchaseStatusAction, getPurchaseAction } from "@/app/actions/billing/purchases"
import { generateInvoiceAction, getInvoiceAction } from "@/app/actions/billing/invoices"
import { getPaymentMethodLabel } from "@/lib/billing/invoice-utils"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatCurrency, formatDate } from "@/lib/utils"
import { ArrowUpDownIcon, PrinterIcon, XIcon, ShoppingCartIcon } from "@/lib/icons"
import type { PurchaseWithRelations, BillingInvoice, BillingFilters, SortConfig } from "@/lib/billing/types"

const STATUS_VARIANTS: Record<string, "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray"> = {
    pending: "orange",
    completed: "green",
    failed: "red",
    refunded: "purple",
    cancelled: "gray",
    partially_refunded: "orange",
}

const PAYMENT_VARIANTS: Record<string, "green" | "red" | "orange" | "blue" | "purple" | "gray"> = {
    pending: "orange",
    processing: "blue",
    approved: "green",
    rejected: "red",
    refunded: "purple",
    cancelled: "gray",
    chargeback: "red",
}

function getStatusLabel(status: string, metadata?: any): string {
    if (status === "pending" && metadata?.billing_cycle === "next") {
        return "A pagar"
    }
    if (status === "pending" && metadata?.subscription_status === "past_due") {
        return "Em atraso"
    }
    const labels: Record<string, string> = {
        pending: "Pendente",
        completed: "Pago",
        approved: "Pago",
        failed: "Falhou",
        rejected: "Recusado",
        refunded: "Reembolsado",
        cancelled: "Cancelado",
        partially_refunded: "Reembolso parcial",
        processing: "Processando",
        chargeback: "Chargeback",
    }
    return labels[status] || status
}

function getStatusVariant(status: string, metadata?: any): "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray" {
    if (status === "pending" && metadata?.subscription_status === "past_due") {
        return "red"
    }
    return STATUS_VARIANTS[status] || "gray"
}

function getGatewayLabel(gateway: string | null): string {
    const labels: Record<string, string> = {
        mercado_pago: "Mercado Pago",
        stripe: "Stripe",
        asaas: "Asaas",
        pagseguro: "PagSeguro",
        manual: "Manual",
    }
    return labels[gateway || ""] || gateway || "-"
}

function getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        subscription: "Assinatura",
        addon: "Add-on",
        marketplace_feature: "Funcionalidade",
        credit_pack: "Créditos",
        service: "Serviço",
        order_payment: "Pedido",
        future: "Futuro",
    }
    return labels[type] || type
}

const COLUMNS = [
    { id: "type", label: "Tipo", align: "left" as const, width: "100px" },
    { id: "description", label: "Descrição", align: "left" as const },
    { id: "amount", label: "Valor", align: "right" as const, width: "120px" },
    { id: "status", label: "Status", align: "left" as const, width: "120px" },
    { id: "gateway", label: "Gateway", align: "left" as const, width: "120px" },
    { id: "date", label: "Data", align: "left" as const, width: "140px" },
    { id: "actions", label: "", align: "center" as const, width: "60px" },
]

interface BillingPageProps {
    initialPartnerId?: string
    showTitle?: boolean
}

export function BillingPage({ initialPartnerId, showTitle }: BillingPageProps) {
    const isMobile = useMediaQuery("(max-width: 767px)")
    const [data, setData] = useState<PurchaseWithRelations[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize] = useState(20)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [viewMode, setViewMode] = useState<"grid" | "list">("list")
    const [filters, setFilters] = useState<Record<string, any>>({})
    const [filterOpen, setFilterOpen] = useState(false)
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)

    const [selectedPurchase, setSelectedPurchase] = useState<PurchaseWithRelations | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)

    const [invoiceData, setInvoiceData] = useState<any>(null)
    const [invoiceOpen, setInvoiceOpen] = useState(false)
    const [invoiceLoading, setInvoiceLoading] = useState<string | null>(null)

    const [cancelTarget, setCancelTarget] = useState<PurchaseWithRelations | null>(null)
    const [cancelOpen, setCancelOpen] = useState(false)

    const effectiveViewMode = isMobile ? "grid" : viewMode
    const filteredColumns = COLUMNS

    const billingFilters: BillingFilters = useMemo(() => ({
        partner_id: initialPartnerId,
        purchase_type: filters.purchase_type?.length ? (filters.purchase_type.length === 1 ? filters.purchase_type[0] : filters.purchase_type) : undefined,
        status: filters.status?.length ? (filters.status.length === 1 ? filters.status[0] : filters.status) : undefined,
        search: search || undefined,
        date_from: filters.date?.from || undefined,
        date_to: filters.date?.to || undefined,
    }), [initialPartnerId, filters, search])

    const hasActiveFilters = useMemo(() => {
        return !!(
            (filters.purchase_type?.length && filters.purchase_type.length > 0) ||
            (filters.status?.length && filters.status.length > 0) ||
            filters.date?.from ||
            filters.date?.to
        )
    }, [filters])

    const loadPage = useCallback(async (p: number) => {
        setLoading(true)
        try {
            const sortKey = sortConfig?.key === "amount" ? "total_amount"
                : sortConfig?.key === "date" ? "created_at"
                    : sortConfig?.key === "type" ? "purchase_type"
                        : sortConfig?.key === "status" ? "status"
                            : undefined
            const result = await listPurchasesPageAction(p, pageSize, billingFilters, sortKey, sortConfig?.direction)
            setData(result.data)
            setTotal(result.total)
            setPage(result.page)
        } catch (err) {
            console.error("[BillingPage] Error loading:", err)
        } finally {
            setLoading(false)
        }
    }, [pageSize, billingFilters, sortConfig])

    useEffect(() => {
        loadPage(1)
    }, [loadPage])

    const totalPages = Math.ceil(total / pageSize)

    const filterSections = useMemo<FilterSectionConfig[]>(() => {
        const sections: FilterSectionConfig[] = [
            {
                id: "purchase_type",
                title: "Tipo",
                type: "checkbox-list",
                options: ["subscription", "addon", "credit_pack", "order_payment"],
                optionLabels: {
                    subscription: "Assinatura",
                    addon: "Add-on",
                    credit_pack: "Pacote de Créditos",
                    order_payment: "Pedido",
                },
            },
            {
                id: "status",
                title: "Status",
                type: "checkbox-list",
                options: ["completed", "pending", "failed", "refunded", "cancelled", "partially_refunded"],
                optionLabels: {
                    completed: "Pago",
                    pending: "Pendente",
                    failed: "Falhou",
                    refunded: "Reembolsado",
                    cancelled: "Cancelado",
                    partially_refunded: "Reembolso parcial",
                },
            },
            {
                id: "date",
                title: "Período",
                type: "date-period",
            },
        ]
        return sections
    }, [])

    const clearFilters = useCallback(() => {
        setFilters({})
    }, [])

    const handleViewDetails = async (purchase: PurchaseWithRelations) => {
        const full = await getPurchaseAction(purchase.id)
        setSelectedPurchase(full || purchase)
        setDetailOpen(true)
    }

    const handleInvoice = async (invoice?: BillingInvoice) => {
        if (!invoice && selectedPurchase?.invoice_id) {
            setInvoiceLoading(selectedPurchase.invoice_id)
            const result = await getInvoiceAction(selectedPurchase.invoice_id)
            if (result) {
                setInvoiceData(result.invoice_data)
                setInvoiceOpen(true)
            }
            setInvoiceLoading(null)
            return
        }
        if (invoice) {
            setInvoiceLoading(invoice.id)
            const result = await getInvoiceAction(invoice.id)
            if (result) {
                setInvoiceData(result.invoice_data)
                setInvoiceOpen(true)
            }
            setInvoiceLoading(null)
        }
    }

    const handleGenerateInvoice = async () => {
        if (!selectedPurchase) return
        setInvoiceLoading("generate")
        const result = await generateInvoiceAction(selectedPurchase.id)
        setInvoiceLoading(null)
        if (result.success && result.data) {
            setInvoiceData(result.data.invoice_data)
            setInvoiceOpen(true)
            loadPage(page)
        }
    }

    const handleCancel = async () => {
        if (!cancelTarget) return
        const csrf = await fetch("/api/csrf-token").then((r) => r.json()).then((r) => r.token)
        await updatePurchaseStatusAction(cancelTarget.id, "cancelled", csrf)
        setCancelOpen(false)
        setCancelTarget(null)
        loadPage(page)
    }

    const handleSort = (colId: string) => {
        if (colId === "actions") return
        setSortConfig((prev) => ({
            key: colId,
            direction: prev?.key === colId && prev.direction === "asc" ? "desc" : "asc",
        }))
    }

    // ── Detail sheet content ──
    const detailContent = selectedPurchase && (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            <header className="border-b border-brand-border dark:border-dark-border p-6 flex justify-between items-center">
                <h2 className="text-xl font-bold dark:text-dark-heading">Detalhes da Compra</h2>
                <Button variant="filled" onClick={() => setDetailOpen(false)} size="icon">
                    <XIcon className="w-5 h-5" />
                </Button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
                <div className="flex items-center justify-between">
                    <Badge variant={getStatusVariant(selectedPurchase.status, selectedPurchase.metadata)}>
                        {getStatusLabel(selectedPurchase.status, selectedPurchase.metadata)}
                    </Badge>
                    <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(selectedPurchase.total_amount)}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs text-brand-inactive-text font-medium">Tipo</p>
                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{getTypeLabel(selectedPurchase.purchase_type)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-brand-inactive-text font-medium">Data</p>
                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatDate(selectedPurchase.created_at)}</p>
                    </div>
                    {selectedPurchase.description && (
                        <div className="col-span-2">
                            <p className="text-xs text-brand-inactive-text font-medium">Descrição</p>
                            <p className="text-sm text-brand-dark dark:text-dark-heading">{selectedPurchase.description}</p>
                        </div>
                    )}
                </div>

                {(selectedPurchase.payments || []).length > 0 && (
                    <div>
                        <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Pagamentos</h4>
                        <div className="space-y-2">
                            {(selectedPurchase.payments || []).map((payment) => (
                                <div key={payment.id} className="flex items-center justify-between p-3 rounded-xl bg-brand-gray dark:bg-dark-border/50">
                                    <div className="flex items-center gap-3">
                                        <Badge variant={PAYMENT_VARIANTS[payment.status] || "gray"}>
                                            {getStatusLabel(payment.status)}
                                        </Badge>
                                        <span className="text-xs text-brand-inactive-text">
                                            {getPaymentMethodLabel(payment.payment_method_type)}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(payment.amount)}</span>
                                        {payment.paid_at && (
                                            <p className="text-[11px] text-brand-inactive-text">{formatDate(payment.paid_at)}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {selectedPurchase.invoice && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-brand-green/5 border border-brand-green/20">
                        <div>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Fatura {selectedPurchase.invoice.invoice_number}</p>
                            <p className="text-xs text-brand-inactive-text">Clique para visualizar</p>
                        </div>
                        <Button variant="outline" size="sm" leftIcon={<PrinterIcon />} onClick={() => handleInvoice(selectedPurchase.invoice!)}>
                            Imprimir
                        </Button>
                    </div>
                )}

                {!selectedPurchase.invoice && selectedPurchase.status === "completed" && (
                    <Button
                        variant="default"
                        leftIcon={<PrinterIcon />}
                        onClick={handleGenerateInvoice}
                        isLoading={invoiceLoading === "generate"}
                    >
                        Gerar Fatura
                    </Button>
                )}
            </div>

            <footer className="shrink-0 border-t border-brand-border p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center justify-between">
                    <Button variant="ghost" leftIcon={<XIcon />} onClick={() => setDetailOpen(false)}>
                        Fechar
                    </Button>
                    {selectedPurchase.status === "pending" && (
                        <Button
                            variant="destructive"
                            leftIcon={<XIcon />}
                            onClick={() => { setCancelTarget(selectedPurchase); setCancelOpen(true); setDetailOpen(false) }}
                        >
                            Cancelar compra
                        </Button>
                    )}
                </div>
            </footer>
        </div>
    )

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background">
            <div className="flex-1 overflow-y-auto">
                {showTitle && (
                    <div className="px-4 md:px-8 pt-4 pb-2">
                        <h1 className="text-xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading">
                            Compras
                        </h1>
                    </div>
                )}

                <BillingPageControls
                    searchValue={search}
                    onSearchChange={setSearch}
                    viewMode={effectiveViewMode}
                    onViewModeChange={setViewMode}
                    onOpenFilter={() => setFilterOpen(true)}
                    hasActiveFilters={hasActiveFilters}
                />

                <div className={showTitle ? "px-4 md:px-8 pb-8" : "px-0 pb-8"}>
                    {loading && data.length === 0 ? (
                        <div className="flex justify-center py-20">
                            <ThreeDotsLoader />
                        </div>
                    ) : data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <IconPlaceholder
                                icon={ShoppingCartIcon}
                                title="Nenhuma compra encontrada"
                                subtitle="Nenhuma compra corresponde aos filtros selecionados."
                            />
                        </div>
                    ) : effectiveViewMode === "grid" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {data.map((p) => (
                                <BillingGridCard
                                    key={p.id}
                                    id={p.id}
                                    type={p.purchase_type}
                                    typeLabel={getTypeLabel(p.purchase_type)}
                                    description={p.description}
                                    amount={p.amount}
                                    totalAmount={p.total_amount}
                                    status={p.status}
                                    statusLabel={getStatusLabel(p.status, p.metadata)}
                                    statusVariant={getStatusVariant(p.status, p.metadata)}
                                    gatewayLabel={getGatewayLabel(p.gateway)}
                                    createdAt={p.created_at}
                                    onDetails={() => handleViewDetails(p)}
                                    onCancel={p.status === "pending" ? () => { setCancelTarget(p); setCancelOpen(true) } : undefined}
                                    onInvoice={p.invoice_id ? () => handleInvoice() : undefined}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                        {filteredColumns.map((col) => {
                                            const isSorted = sortConfig?.key === col.id
                                            return (
                                                <th
                                                    key={col.id}
                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors ${col.id === "actions" ? "rounded-r-lg" : ""}`}
                                                    style={{ width: col.width }}
                                                    onClick={() => handleSort(col.id)}
                                                >
                                                    <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                        <span>{col.label}</span>
                                                        {col.id !== "actions" && (
                                                            <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                                                <ArrowUpDownIcon
                                                                    size={14}
                                                                    className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100 block" : "text-brand-inactive-text hidden group-hover:block opacity-40"} ${isSorted && sortConfig?.direction === "desc" ? "rotate-180" : ""}`}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </th>
                                            )
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((p) => (
                                        <BillingListRow
                                            key={p.id}
                                            id={p.id}
                                            type={p.purchase_type}
                                            typeLabel={getTypeLabel(p.purchase_type)}
                                            description={p.description}
                                            amount={p.amount}
                                            totalAmount={p.total_amount}
                                            status={p.status}
                                            statusLabel={getStatusLabel(p.status, p.metadata)}
                                            statusVariant={getStatusVariant(p.status, p.metadata)}
                                            gatewayLabel={getGatewayLabel(p.gateway)}
                                            createdAt={p.created_at}
                                            columns={filteredColumns}
                                            onDetails={() => handleViewDetails(p)}
                                            onCancel={p.status === "pending" ? () => { setCancelTarget(p); setCancelOpen(true) } : undefined}
                                            onInvoice={p.invoice_id ? () => handleInvoice() : undefined}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {totalPages > 1 && (
                        <div className="mt-6">
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                onPageChange={(p) => loadPage(p)}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* ── Filter Sheet ── */}
            <FilterSheet
                isOpen={filterOpen}
                onClose={() => setFilterOpen(false)}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={clearFilters}
            />

            {/* ── Detail Sheet (Portal on desktop, BottomSheet on mobile) ── */}
            {isMobile ? (
                <BottomSheet isOpen={detailOpen} onClose={() => setDetailOpen(false)}>
                    {detailContent}
                </BottomSheet>
            ) : (
                <Portal>
                    <div
                        className={`fixed inset-0 bg-black/50 z-50 transition-opacity ${detailOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                        onClick={() => setDetailOpen(false)}
                    >
                        <div
                            className={`fixed right-4 top-4 bottom-4 w-96 bg-white dark:bg-dark-surface shadow-2xl rounded-2xl transition-transform duration-300 overflow-hidden ${detailOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {detailContent}
                        </div>
                    </div>
                </Portal>
            )}

            {/* ── Invoice Print Modal ── */}
            <InvoicePrintModal
                isOpen={invoiceOpen}
                onClose={() => setInvoiceOpen(false)}
                invoiceData={invoiceData}
                invoiceId={selectedPurchase?.invoice_id || ""}
            />

            {/* ── Cancel Alert ── */}
            <AlertModal
                isOpen={cancelOpen}
                onClose={() => { setCancelOpen(false); setCancelTarget(null) }}
                onConfirm={handleCancel}
                title="Cancelar compra"
                message="Tem certeza que deseja cancelar esta compra? Esta ação pode não ser reversível."
                variant="danger"
                confirmText="Sim, cancelar"
                cancelText="Não, manter"
            />
        </FadeIn>
    )
}
