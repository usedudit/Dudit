"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Badge, Button, Spinner, IconPlaceholder } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import { adminListRefundRequestsAction } from "@/app/actions/billing/refunds"
import { AdminRefundReviewModal } from "@/components/admin/AdminRefundReviewModal"
import {
    RotateCcw,
    ShieldCheck,
    Clock,
    CheckCircle2,
    XCircle,
    ExternalLink,
    Search,
    Filter,
    Store,
    AlertCircle,
} from "lucide-react"
import Link from "next/link"

const getStatusBadgeVariant = (status: string) => {
    switch (status) {
        case "approved":
            return "green" as const
        case "rejected":
            return "red" as const
        case "under_review":
            return "blue" as const
        case "cancelled":
            return "gray" as const
        default:
            return "orange" as const
    }
}

const getStatusLabel = (status: string) => {
    switch (status) {
        case "approved":
            return "Aprovado / Estornado"
        case "rejected":
            return "Recusado"
        case "under_review":
            return "Em Análise"
        case "cancelled":
            return "Cancelado"
        default:
            return "Pendente"
    }
}

const getReasonLabel = (cat: string) => {
    switch (cat) {
        case "repentance_7_days":
            return "Arrependimento (CDC 7d)"
        case "double_charge":
            return "Cobrança duplicada"
        case "technical_issue":
            return "Problema técnico"
        case "commercial_agreement":
            return "Acordo comercial"
        case "unsatisfied":
            return "Insatisfação"
        default:
            return "Outro"
    }
}

export function AdminRefundsPage() {
    const [statusFilter, setStatusFilter] = useState("all")
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<any[]>([])
    const [stats, setStats] = useState<any>({ total: 0, pending: 0, approved: 0, rejected: 0, within7Days: 0 })
    const [selectedRefund, setSelectedRefund] = useState<any | null>(null)
    const [reviewModalOpen, setReviewModalOpen] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await adminListRefundRequestsAction({
                status: statusFilter,
            })
            if (res.success) {
                setData(res.data || [])
                if (res.stats) setStats(res.stats)
            }
        } catch (err) {
            console.error("[AdminRefundsPage] Error loading data:", err)
        } finally {
            setLoading(false)
        }
    }, [statusFilter])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleOpenReview = (refund: any) => {
        setSelectedRefund(refund)
        setReviewModalOpen(true)
    }

    return (
        <div className="p-6 space-y-6">
            {/* Cards de Métricas e Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border">
                    <span className="text-xs text-brand-inactive-text font-medium">Total de Pedidos</span>
                    <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-1">{stats.total}</p>
                </div>
                <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border">
                    <span className="text-xs text-brand-orange font-medium flex items-center gap-1">
                        <Clock size={14} />
                        <span>Pendentes</span>
                    </span>
                    <p className="text-2xl font-bold text-brand-orange mt-1">{stats.pending}</p>
                </div>
                <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border">
                    <span className="text-xs text-brand-green font-medium flex items-center gap-1">
                        <CheckCircle2 size={14} />
                        <span>Estornados</span>
                    </span>
                    <p className="text-2xl font-bold text-brand-green mt-1">{stats.approved}</p>
                </div>
                <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border">
                    <span className="text-xs text-brand-red font-medium flex items-center gap-1">
                        <XCircle size={14} />
                        <span>Recusados</span>
                    </span>
                    <p className="text-2xl font-bold text-brand-red mt-1">{stats.rejected}</p>
                </div>
                <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border col-span-2 sm:col-span-1">
                    <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                        <ShieldCheck size={14} />
                        <span>Garantia 7 Dias CDC</span>
                    </span>
                    <p className="text-2xl font-bold text-blue-600 mt-1">{stats.within7Days}</p>
                </div>
            </div>

            {/* Filtros de Status */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-dark-surface p-4 rounded-2xl border border-brand-border dark:border-dark-border">
                <div className="flex items-center gap-2">
                    {[
                        { id: "all", label: "Todos" },
                        { id: "pending", label: "Pendentes" },
                        { id: "approved", label: "Estornados" },
                        { id: "rejected", label: "Recusados" },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setStatusFilter(tab.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${statusFilter === tab.id ? "bg-brand-green text-white" : "bg-brand-gray text-gray-600 hover:text-gray-900"}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <Button variant="outline" size="sm" onClick={loadData}>
                    Atualizar Lista
                </Button>
            </div>

            {/* Tabela de Solicitações */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                {loading ? (
                    <div className="py-20 flex justify-center items-center">
                        <Spinner size={32} />
                    </div>
                ) : data.length === 0 ? (
                    <div className="py-20 text-center text-xs text-brand-inactive-text">
                        Nenhuma solicitação de reembolso encontrada com os filtros atuais.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-brand-gray dark:bg-dark-border/40 text-brand-inactive-text font-medium border-b border-brand-border dark:border-dark-border">
                                <tr>
                                    <th className="py-3 px-4">Loja / Parceiro</th>
                                    <th className="py-3 px-4">Plano / Fatura</th>
                                    <th className="py-3 px-4">Valor</th>
                                    <th className="py-3 px-4">Motivo & Evidências</th>
                                    <th className="py-3 px-4">Garantia CDC</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4">Data</th>
                                    <th className="py-3 px-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                {data.map((r) => {
                                    const stores = r.partner?.stores || []
                                    const hq = stores.find((s: any) => s.is_headquarters) || stores[0] || {}
                                    const imagesCount = Array.isArray(r.images) ? r.images.length : 0
                                    const docsCount = Array.isArray(r.documents) ? r.documents.length : 0

                                    return (
                                        <tr key={r.id} className="hover:bg-brand-gray/40 dark:hover:bg-dark-border/20 transition-colors">
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-lg bg-brand-green/10 flex items-center justify-center text-brand-green flex-shrink-0">
                                                        {hq.logo_url ? (
                                                            <img src={hq.logo_url} alt="" className="w-full h-full object-cover rounded-lg" />
                                                        ) : (
                                                            <Store size={16} />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading block truncate max-w-[180px]">
                                                            {hq.name || "Loja Parceira"}
                                                        </span>
                                                        <span className="text-[10px] text-brand-inactive-text block">
                                                            ID: {r.partner_id?.slice(0, 8)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="py-3.5 px-4 font-medium text-brand-dark dark:text-dark-heading">
                                                {r.purchase?.plan?.name ? `Plano ${r.purchase.plan.name}` : r.purchase?.description || "Assinatura"}
                                            </td>

                                            <td className="py-3.5 px-4 font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(r.amount)}
                                            </td>

                                            <td className="py-3.5 px-4">
                                                <span className="font-medium block">{getReasonLabel(r.reason_category)}</span>
                                                <span className="text-[10px] text-brand-inactive-text block">
                                                    {imagesCount} fotos • {docsCount} PDFs
                                                </span>
                                            </td>

                                            <td className="py-3.5 px-4">
                                                {r.is_within_7_days ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                                                        <ShieldCheck size={12} />
                                                        <span>7 dias CDC</span>
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                                                        <span>Fora do prazo</span>
                                                    </span>
                                                )}
                                            </td>

                                            <td className="py-3.5 px-4">
                                                <Badge variant={getStatusBadgeVariant(r.status)}>
                                                    {getStatusLabel(r.status)}
                                                </Badge>
                                            </td>

                                            <td className="py-3.5 px-4 text-brand-inactive-text">
                                                {formatDate(r.created_at)}
                                            </td>

                                            <td className="py-3.5 px-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Link href={`/reembolso/${r.token}`} target="_blank">
                                                        <Button variant="ghost" size="icon" title="Ver Portal">
                                                            <ExternalLink size={14} />
                                                        </Button>
                                                    </Link>

                                                    <Button
                                                        variant="filled"
                                                        size="sm"
                                                        onClick={() => handleOpenReview(r)}
                                                    >
                                                        {r.status === "pending" || r.status === "under_review" ? "Julgar" : "Ver Detalhes"}
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Análise & Step-Up Auth */}
            {reviewModalOpen && selectedRefund && (
                <AdminRefundReviewModal
                    isOpen={reviewModalOpen}
                    onClose={() => setReviewModalOpen(false)}
                    refund={selectedRefund}
                    onSuccess={loadData}
                />
            )}
        </div>
    )
}
