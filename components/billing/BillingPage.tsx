"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import AlertModal from "@/components/reusable/AlertModal"
import FilterSheet from "@/components/reusable/FilterSheet"
import type { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { BillingPageControls } from "./BillingPageControls"
import BillingGridCard from "./BillingGridCard"
import BillingListRow from "./BillingListRow"
import { BillingDetailSheet } from "./BillingDetailSheet"
import { InvoicePrintModal } from "./InvoicePrintModal"
import { listPurchasesPageAction, updatePurchaseStatusAction, getPurchaseAction } from "@/app/actions/billing/purchases"
import { generateInvoiceAction, getInvoiceAction } from "@/app/actions/billing/invoices"
import { getSubscriptionPaymentUrlAction } from "@/app/actions/erp/subscriptions"
import { useMediaQuery } from "@/components/erp/hooks"
import { ArrowUpDownIcon, ShoppingCartIcon } from "@/lib/icons"
import { toast } from "@/hooks/use-notification"
import { resolvePaymentMethodDetails } from "@/lib/billing/payment-method-helper"
import type { PurchaseWithRelations, BillingInvoice, BillingFilters, SortConfig } from "@/lib/billing/types"
import type { ResolvedPaymentMethod } from "@/lib/billing/payment-method-helper"

const STATUS_VARIANTS: Record<string, "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray"> = {
    pending: "orange",
    completed: "green",
    failed: "red",
    refunded: "purple",
    cancelled: "gray",
    partially_refunded: "orange",
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

function paymentMethodForPurchase(p: PurchaseWithRelations): ResolvedPaymentMethod {
    return resolvePaymentMethodDetails(
        {
            payment_method_type: p.payment_method_type ?? null,
            gateway_payment_id: p.gateway_payment_id ?? null,
        },
        p,
    )
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
    { id: "payment_method", label: "Meio Pag.", align: "left" as const, width: "140px" },
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
    const [pageSize] = useState(8)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [viewMode, setViewMode] = useState<"grid" | "list">("list")
    const [filters, setFilters] = useState<Record<string, any>>({})
    const [filterOpen, setFilterOpen] = useState(false)
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)

    const [selectedPurchase, setSelectedPurchase] = useState<PurchaseWithRelations | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)
    const [detailHydrating, setDetailHydrating] = useState(false)
    const detailRequestRef = useRef<string | null>(null)

    const [invoiceData, setInvoiceData] = useState<any>(null)
    const [invoiceOpen, setInvoiceOpen] = useState(false)
    const [invoiceLoading, setInvoiceLoading] = useState<string | null>(null)
    const [printInvoiceId, setPrintInvoiceId] = useState<string>("")

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

    const handleCloseDetails = useCallback(() => {
        setDetailOpen(false)
    }, [])

    const handleViewDetails = useCallback(async (purchase: PurchaseWithRelations) => {
        detailRequestRef.current = purchase.id
        setSelectedPurchase(purchase)
        setDetailOpen(true)
        setDetailHydrating(true)
        try {
            const full = await getPurchaseAction(purchase.id)
            if (full && detailRequestRef.current === purchase.id) {
                setSelectedPurchase(full)
            }
        } catch (err) {
            console.error("[BillingPage] Error loading purchase details:", err)
        } finally {
            if (detailRequestRef.current === purchase.id) {
                setDetailHydrating(false)
            }
        }
    }, [])

    const handlePrintInvoice = useCallback(async (invoice: BillingInvoice) => {
        setInvoiceLoading(invoice.id)
        try {
            setInvoiceData(invoice.invoice_data)
            setPrintInvoiceId(invoice.id)
            setInvoiceOpen(true)
        } catch (err) {
            console.error("[BillingPage] Error preparing invoice:", err)
            toast.error("Erro ao carregar fatura", "Não foi possível abrir a fatura. Tente novamente.")
        } finally {
            setInvoiceLoading(null)
        }
    }, [])

    const handlePrintInvoiceById = useCallback(async (invoiceId?: string | null) => {
        if (!invoiceId) return
        setInvoiceLoading(invoiceId)
        try {
            const invoice = await getInvoiceAction(invoiceId)
            if (invoice) {
                setInvoiceData(invoice.invoice_data)
                setPrintInvoiceId(invoice.id)
                setInvoiceOpen(true)
            } else {
                toast.error("Fatura não encontrada", "Não foi possível carregar a fatura. Tente novamente.")
            }
        } catch (err) {
            console.error("[BillingPage] Error loading invoice:", err)
            toast.error("Erro ao carregar fatura", "Tente novamente.")
        } finally {
            setInvoiceLoading(null)
        }
    }, [])

    const handleGenerateInvoice = useCallback(async () => {
        if (!selectedPurchase) return
        setInvoiceLoading("generate")
        try {
            const result = await generateInvoiceAction(selectedPurchase.id)
            if (result.success && result.data) {
                const newInvoice = result.data
                setInvoiceData(newInvoice.invoice_data)
                setPrintInvoiceId(newInvoice.id)
                setInvoiceOpen(true)
                setSelectedPurchase((prev) =>
                    prev ? { ...prev, invoice: newInvoice, invoice_id: newInvoice.id } : prev,
                )
                loadPage(page)
            } else if (!result.success) {
                toast.error("Erro ao gerar fatura", result.error || "Tente novamente.")
            }
        } catch (err) {
            console.error("[BillingPage] Error generating invoice:", err)
            toast.error("Erro ao gerar fatura", "Tente novamente.")
        } finally {
            setInvoiceLoading(null)
        }
    }, [selectedPurchase, page, loadPage])

    // Resolve an MP checkout link for a pending subscription invoice so the
    // billing history list can offer a per-row "Pagar" action without storing
    // the init_point in the DB.
    const handlePay = useCallback(
        async (p: PurchaseWithRelations) => {
            if (p.purchase_type !== "subscription" || p.status !== "pending" || !p.subscription_id) {
                return
            }
            const res = await getSubscriptionPaymentUrlAction(p.subscription_id)
            if (res.success && res.data?.payment_url) {
                window.location.href = res.data.payment_url
            } else {
                toast.error("Pagamento indisponível", "Não foi possível abrir o checkout. Tente novamente mais tarde.")
            }
        },
        [],
    )

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
                            {data.map((p) => {
                                const pm = paymentMethodForPurchase(p)
                                return (
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
                                        paymentMethodLabel={pm.name}
                                        paymentMethodDetails={pm.detailsText}
                                        paymentMethodIcon={pm.iconUrl}
                                        createdAt={p.created_at}
                                        invoiceId={p.invoice_id}
                                        onDetails={() => handleViewDetails(p)}
                                        onInvoice={handlePrintInvoiceById}
                                        onPay={
                                            p.purchase_type === "subscription" &&
                                            p.status === "pending" &&
                                            !!p.subscription_id
                                                ? () => handlePay(p)
                                                : undefined
                                        }
                                    />
                                )
                            }
                            )
                            }
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
                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors ${col.id === "actions" ? "rounded-r-lg" : ""} ${col.id === "type" ? "rounded-l-lg" : ""}`}
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
                                    {data.map((p) => {
                                        const pm = paymentMethodForPurchase(p)
                                        return (
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
                                                paymentMethodLabel={pm.name}
                                                createdAt={p.created_at}
                                                columns={filteredColumns}
                                                invoiceId={p.invoice_id}
                                                onDetails={() => handleViewDetails(p)}
                                                onInvoice={handlePrintInvoiceById}
                                                onPay={
                                                    p.purchase_type === "subscription" &&
                                                    p.status === "pending" &&
                                                    !!p.subscription_id
                                                        ? () => handlePay(p)
                                                        : undefined
                                                }
                                            />
                                        )
                                    }
                                    )
                                    }
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

            {/* ── Detail Sheet ── */}
            <BillingDetailSheet
                isOpen={detailOpen}
                onClose={handleCloseDetails}
                purchase={selectedPurchase}
                onInvoice={handlePrintInvoice}
                onCancel={(purchase) => {
                    setCancelTarget(purchase)
                    setCancelOpen(true)
                }}
                onGenerateInvoice={handleGenerateInvoice}
                generateLoading={invoiceLoading === "generate"}
                onRefundSuccess={() => loadPage(page)}
                isHydrating={detailHydrating}
            />

            {/* ── Invoice Print Modal ── */}
            <InvoicePrintModal
                isOpen={invoiceOpen}
                onClose={() => setInvoiceOpen(false)}
                invoiceData={invoiceData}
                invoiceId={printInvoiceId}
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
