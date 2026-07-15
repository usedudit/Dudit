"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { ThreeDotsLoader, Pagination, AlertModal } from "@/components/reusable"
import { BillingPageControls } from "./BillingPageControls"
import { BillingGridCard } from "./BillingGridCard"
import { BillingListRow } from "./BillingListRow"
import { BillingDetailSheet } from "./BillingDetailSheet"
import { listPurchasesAction, updatePurchaseStatusAction } from "@/app/actions/billing/purchases"
import { generateInvoiceAction, getInvoiceAction } from "@/app/actions/billing/invoices"
import { InvoicePrintModal } from "./InvoicePrintModal"
import type { PurchaseWithRelations, BillingInvoice, BillingFilters } from "@/lib/billing/types"
import { Crown, Tag, CreditCard, ShoppingCart } from "lucide-react"

const STATUS_VARIANTS: Record<string, "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray"> = {
    pending: "orange",
    completed: "green",
    failed: "red",
    refunded: "purple",
    cancelled: "gray",
    partially_refunded: "orange",
}

const TYPE_LABELS: Record<string, string> = {
    subscription: "Assinatura",
    addon: "Add-on",
    marketplace_feature: "Funcionalidade",
    credit_pack: "Créditos",
    service: "Serviço",
    order_payment: "Pedido",
    future: "Futuro",
}

function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        pending: "Pendente",
        completed: "Concluído",
        failed: "Falhou",
        refunded: "Reembolsado",
        cancelled: "Cancelado",
        partially_refunded: "Parcial",
    }
    return labels[status] || status
}

function getGatewayLabel(gateway: string | null): string {
    const labels: Record<string, string> = {
        mercado_pago: "Mercado Pago",
        stripe: "Stripe",
        asaas: "Asaas",
        pagseguro: "PagSeguro",
        manual: "Manual",
    }
    return labels[gateway || ""] || gateway || "—"
}

const COLUMNS = [
    { id: "type", label: "Tipo", width: "100px" },
    { id: "description", label: "Descrição" },
    { id: "partner", label: "Parceiro" },
    { id: "amount", label: "Valor", align: "right" as const, width: "120px" },
    { id: "status", label: "Status", width: "120px" },
    { id: "gateway", label: "Gateway", width: "120px" },
    { id: "date", label: "Data", width: "140px" },
    { id: "actions", label: "", width: "60px" },
]

interface BillingPageProps {
    initialPartnerId?: string
    hidePartnerColumn?: boolean
    showTitle?: boolean
}

export function BillingPage({ initialPartnerId, hidePartnerColumn, showTitle }: BillingPageProps) {
    const [purchases, setPurchases] = useState<PurchaseWithRelations[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState("all")
    const [search, setSearch] = useState("")
    const [viewMode, setViewMode] = useState<"grid" | "list">("list")
    const [cursor, setCursor] = useState<string | null>(null)
    const [hasMore, setHasMore] = useState(false)
    const [selectedPurchase, setSelectedPurchase] = useState<PurchaseWithRelations | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)

    const [invoiceData, setInvoiceData] = useState<any>(null)
    const [invoiceOpen, setInvoiceOpen] = useState(false)
    const [invoiceLoading, setInvoiceLoading] = useState<string | null>(null)

    const [cancelTarget, setCancelTarget] = useState<PurchaseWithRelations | null>(null)
    const [cancelOpen, setCancelOpen] = useState(false)

    const debounceRef = useRef<NodeJS.Timeout | null>(null)

    const loadPurchases = useCallback(async (resetCursor = true) => {
        setLoading(true)
        try {
            const filters: BillingFilters = {
                partner_id: initialPartnerId,
                purchase_type: activeTab === "all" ? "all" : activeTab as any,
                search: search || undefined,
            }
            const result = await listPurchasesAction(resetCursor ? null : cursor, 20, filters)
            if (resetCursor) {
                setPurchases(result.data)
            } else {
                setPurchases((prev) => [...prev, ...result.data])
            }
            setCursor(result.nextCursor)
            setHasMore(result.hasMore)
        } catch (err) {
            console.error("[BillingPage] Error loading:", err)
        } finally {
            setLoading(false)
        }
    }, [activeTab, search, cursor, initialPartnerId])

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => loadPurchases(true), 300)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [activeTab, search])

    const handleViewDetails = (purchase: PurchaseWithRelations) => {
        setSelectedPurchase(purchase)
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
            loadPurchases(true)
        }
    }

    const handleCancel = async () => {
        if (!cancelTarget) return
        const csrf = await fetch("/api/csrf-token").then((r) => r.json()).then((r) => r.token)
        await updatePurchaseStatusAction(cancelTarget.id, "cancelled", csrf)
        setCancelOpen(false)
        setCancelTarget(null)
        loadPurchases(true)
    }

    const tabs = [
        { key: "all", label: "Todas", icon: undefined },
        { key: "subscription", label: "Assinaturas", icon: Crown },
        { key: "addon", label: "Add-ons", icon: Tag },
        { key: "credit_pack", label: "Créditos", icon: CreditCard },
        { key: "order_payment", label: "Pedidos", icon: ShoppingCart },
    ]

    const filteredColumns = hidePartnerColumn
        ? COLUMNS.filter((c) => c.id !== "partner")
        : COLUMNS

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
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    searchValue={search}
                    onSearchChange={setSearch}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    tabs={tabs}
                />

                <div className="px-4 md:px-8 pb-8">
                    {loading && purchases.length === 0 ? (
                        <div className="flex justify-center py-20">
                            <ThreeDotsLoader />
                        </div>
                    ) : purchases.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-16 h-16 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center mb-4">
                                <ShoppingCart className="w-8 h-8 text-brand-inactive-text" />
                            </div>
                            <p className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1">Nenhuma compra encontrada</p>
                            <p className="text-sm text-brand-inactive-text">Nenhuma compra corresponde aos filtros selecionados.</p>
                        </div>
                    ) : viewMode === "grid" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {purchases.map((p) => (
                                <BillingGridCard
                                    key={p.id}
                                    id={p.id}
                                    type={p.purchase_type}
                                    typeLabel={TYPE_LABELS[p.purchase_type] || p.purchase_type}
                                    description={p.description}
                                    amount={p.amount}
                                    totalAmount={p.total_amount}
                                    status={p.status}
                                    statusLabel={getStatusLabel(p.status)}
                                    statusVariant={STATUS_VARIANTS[p.status] || "gray"}
                                    gatewayLabel={getGatewayLabel(p.gateway)}
                                    partnerName={p.partner_name}
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
                                        {filteredColumns.map((col) => (
                                            <th
                                                key={col.id}
                                                className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}
                                                style={col.width ? { width: col.width } : undefined}
                                            >
                                                {col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchases.map((p) => (
                                        <BillingListRow
                                            key={p.id}
                                            id={p.id}
                                            type={p.purchase_type}
                                            typeLabel={TYPE_LABELS[p.purchase_type] || p.purchase_type}
                                            description={p.description}
                                            amount={p.amount}
                                            totalAmount={p.total_amount}
                                            status={p.status}
                                            statusLabel={getStatusLabel(p.status)}
                                            statusVariant={STATUS_VARIANTS[p.status] || "gray"}
                                            gatewayLabel={getGatewayLabel(p.gateway)}
                                            partnerName={p.partner_name}
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

                    {hasMore && purchases.length > 0 && (
                        <div className="flex justify-center mt-6">
                            <button
                                onClick={() => loadPurchases(false)}
                                className="text-sm font-bold text-brand-green hover:text-brand-green/80"
                                disabled={loading}
                            >
                                {loading ? "Carregando..." : "Carregar mais"}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <BillingDetailSheet
                isOpen={detailOpen}
                onClose={() => setDetailOpen(false)}
                purchase={selectedPurchase}
                onInvoice={handleInvoice}
                onCancel={(p) => { setCancelTarget(p); setCancelOpen(true); setDetailOpen(false) }}
            />

            <InvoicePrintModal
                isOpen={invoiceOpen}
                onClose={() => setInvoiceOpen(false)}
                invoiceData={invoiceData}
                invoiceId={selectedPurchase?.invoice_id || ""}
            />

            <AlertModal
                isOpen={cancelOpen}
                onClose={() => { setCancelOpen(false); setCancelTarget(null) }}
                onConfirm={handleCancel}
                title="Cancelar compra"
                message={`Tem certeza que deseja cancelar esta compra? Esta ação pode não ser reversível.`}
                variant="danger"
                confirmText="Sim, cancelar"
                cancelText="Não, manter"
            />
        </FadeIn>
    )
}
