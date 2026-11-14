"use client"

import { useState, useTransition } from "react"
import { Button, Badge, Input, Tabs, TabsList, TabsTrigger, Pagination, IconPlaceholder, DefaultModal, FormTextarea } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { FileTextIcon, EditIcon, EyeIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useAdminActionModal } from "@/components/admin/AdminActionModal"
import {
    getAdminQuotes,
    updateAdminQuote,
    type AdminQuoteStats,
} from "@/app/actions/admin/quotes"

interface QuotesListProps {
    initialData: any[]
    initialStats?: AdminQuoteStats
}

const STATUS_MAP: Record<string, { label: string; variant: "green" | "orange" | "red" | "blue" | "gray" }> = {
    pending: { label: "Pendente", variant: "orange" },
    pendente: { label: "Pendente", variant: "orange" },
    draft: { label: "Rascunho", variant: "gray" },
    rascunho: { label: "Rascunho", variant: "gray" },
    sent: { label: "Enviado", variant: "blue" },
    enviado: { label: "Enviado", variant: "blue" },
    approved: { label: "Aprovado", variant: "green" },
    aprovado: { label: "Aprovado", variant: "green" },
    rejected: { label: "Recusado", variant: "red" },
    recusado: { label: "Recusado", variant: "red" },
    cancelled: { label: "Cancelado", variant: "red" },
    cancelado: { label: "Cancelado", variant: "red" },
    expired: { label: "Expirado", variant: "gray" },
    expirado: { label: "Expirado", variant: "gray" },
}

export default function QuotesList({ initialData, initialStats }: QuotesListProps) {
    const [quotes, setQuotes] = useState(initialData)
    const [stats, setStats] = useState(initialStats)
    const [statusTab, setStatusTab] = useState("all")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const itemsPerPage = 8

    const [editingQuote, setEditingQuote] = useState<any | null>(null)
    const [editForm, setEditForm] = useState<{
        status: string
        notes: string
        valid_until: string
    }>({
        status: "",
        notes: "",
        valid_until: "",
    })

    const [isPending, startTransition] = useTransition()
    const { modal: actionModal, runAction } = useAdminActionModal()

    const filtered = quotes.filter((q) => {
        const statusLower = (q.status || "").toLowerCase()
        const matchesStatus =
            statusTab === "all"
                ? true
                : statusTab === "pendente"
                    ? ["pending", "pendente", "draft", "rascunho", "sent", "enviado"].includes(statusLower)
                    : statusTab === "aprovado"
                        ? ["approved", "aprovado"].includes(statusLower)
                        : statusTab === "recusado"
                            ? ["rejected", "recusado", "cancelled", "cancelado"].includes(statusLower)
                            : statusTab === "expirado"
                                ? ["expired", "expirado"].includes(statusLower)
                                : statusLower === statusTab

        const matchesSearch =
            !search.trim() ||
            q.quote_number?.toLowerCase().includes(search.toLowerCase()) ||
            q.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
            q.stores?.name?.toLowerCase().includes(search.toLowerCase())

        return matchesStatus && matchesSearch
    })

    const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

    const handleOpenEdit = (quote: any) => {
        setEditingQuote(quote)
        setEditForm({
            status: quote.status || "draft",
            notes: quote.notes || "",
            valid_until: quote.valid_until ? quote.valid_until.slice(0, 10) : "",
        })
    }

    const handleSaveEdit = async () => {
        if (!editingQuote) return

        const changedFields: string[] = []
        if (editForm.status !== editingQuote.status) changedFields.push("status")
        if (editForm.notes !== (editingQuote.notes || "")) changedFields.push("observações")
        if (editForm.valid_until !== (editingQuote.valid_until?.slice(0, 10) || "")) changedFields.push("validade")

        const result = await runAction({
            title: "Salvar Alterações no Orçamento",
            description: `Orçamento #${editingQuote.quote_number} (${editingQuote.stores?.name || "Loja"})`,
            changedFields,
            force: true,
            confirmLabel: "Salvar e Notificar",
            notifyLabel: "Enviar notificação pelo Dudit ao vendedor",
            runner: async (payload) => {
                const res = await updateAdminQuote(
                    editingQuote.id,
                    {
                        status: editForm.status,
                        notes: editForm.notes,
                        valid_until: editForm.valid_until || null,
                    },
                    payload
                )

                if (!res.success) {
                    return { success: false, error: res.error || "Erro ao atualizar orçamento" }
                }

                // Update local state
                setQuotes((prev) =>
                    prev.map((item) =>
                        item.id === editingQuote.id
                            ? {
                                  ...item,
                                  ...editForm,
                              }
                            : item
                    )
                )

                toast.success(`Orçamento #${editingQuote.quote_number} atualizado com sucesso!`)
                setEditingQuote(null)
                return { success: true }
            },
        })

        if (!result.cancelled && !result.success) {
            toast.error(result.error || "Erro ao salvar alterações.")
        }
    }

    return (
        <FadeIn className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Total de Orçamentos</p>
                    <p className="text-2xl font-bold text-brand-dark dark:text-white mt-1">{stats?.total ?? quotes.length}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Pendentes</p>
                    <p className="text-2xl font-bold text-yellow-500 mt-1">{stats?.pendente ?? 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Aprovados</p>
                    <p className="text-2xl font-bold text-green-500 mt-1">{stats?.aprovado ?? 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Recusados</p>
                    <p className="text-2xl font-bold text-red-500 mt-1">{stats?.recusado ?? 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Expirados</p>
                    <p className="text-2xl font-bold text-brand-inactive-text mt-1">{stats?.expirado ?? 0}</p>
                </div>
            </div>

            {/* Controls: Search & Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <Tabs value={statusTab} onValueChange={(val) => { setStatusTab(val); setPage(1) }}>
                    <TabsList className="bg-brand-gray dark:bg-dark-border/40 p-1 rounded-xl">
                        <TabsTrigger value="all">Todos</TabsTrigger>
                        <TabsTrigger value="pendente">Pendentes</TabsTrigger>
                        <TabsTrigger value="aprovado">Aprovados</TabsTrigger>
                        <TabsTrigger value="recusado">Recusados</TabsTrigger>
                        <TabsTrigger value="expirado">Expirados</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="w-full md:w-72">
                    <Input
                        type="text"
                        placeholder="Buscar por orçamento, cliente ou loja..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                </div>
            </div>

            {/* List / Table */}
            {paginated.length === 0 ? (
                <IconPlaceholder
                    icon={FileTextIcon}
                    title="Nenhum orçamento encontrado"
                    subtitle="Não há orçamentos correspondentes aos filtros aplicados."
                />
            ) : (
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-brand-gray/60 dark:bg-dark-border/30 text-xs font-semibold uppercase tracking-wider text-brand-inactive-text border-b border-brand-border dark:border-dark-border">
                                <tr>
                                    <th className="px-5 py-4">Orçamento / Data</th>
                                    <th className="px-5 py-4">Loja / Parceiro</th>
                                    <th className="px-5 py-4">Cliente</th>
                                    <th className="px-5 py-4">Valor Total</th>
                                    <th className="px-5 py-4">Validade</th>
                                    <th className="px-5 py-4">Status</th>
                                    <th className="px-5 py-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                {paginated.map((quote) => {
                                    const meta = STATUS_MAP[quote.status?.toLowerCase()] || { label: quote.status, variant: "gray" as const }

                                    return (
                                        <tr key={quote.id} className="hover:bg-brand-gray/30 dark:hover:bg-white/5 transition-colors">
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="font-bold text-brand-dark dark:text-white block">#{quote.quote_number}</span>
                                                <span className="text-xs text-brand-inactive-text block">{formatDate(quote.created_at)}</span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="font-medium text-brand-dark dark:text-white block">{quote.stores?.name || "Loja"}</span>
                                                <span className="text-xs text-brand-inactive-text block">{quote.stores?.phone || ""}</span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="font-medium text-brand-dark dark:text-white block">{quote.customer_name || "Cliente sem nome"}</span>
                                                <span className="text-xs text-brand-inactive-text block">{quote.customer_phone || quote.customer_email || ""}</span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="font-bold text-brand-dark dark:text-white block">
                                                    {formatCurrency(quote.total_amount || 0)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap text-xs text-brand-inactive-text">
                                                {quote.valid_until ? formatDate(quote.valid_until) : "Sem prazo"}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <Badge variant={meta.variant}>{meta.label}</Badge>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap text-right space-x-2">
                                                {quote.public_token && (
                                                    <a
                                                        href={`/quote/${quote.public_token}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-brand-inactive-text hover:text-white hover:bg-white/10 transition-colors"
                                                        title="Ver Portal Público do Cliente"
                                                    >
                                                        <EyeIcon className="w-4 h-4" />
                                                        <span className="hidden sm:inline">Portal</span>
                                                    </a>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenEdit(quote)}
                                                    className="inline-flex items-center gap-1.5"
                                                >
                                                    <EditIcon className="w-3.5 h-3.5" />
                                                    <span>Editar</span>
                                                </Button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="p-4 border-t border-brand-border dark:border-dark-border flex justify-end">
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Modal de Edição com o AdminActionModal integrado */}
            {editingQuote && (
                <DefaultModal
                    isOpen={Boolean(editingQuote)}
                    onClose={() => setEditingQuote(null)}
                    title={`Editar Orçamento #${editingQuote.quote_number}`}
                    description={`Loja: ${editingQuote.stores?.name || "Loja"} • Cliente: ${editingQuote.customer_name || "Sem nome"}`}
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="ghost" onClick={() => setEditingQuote(null)}>
                                Cancelar
                            </Button>
                            <Button variant="default" onClick={handleSaveEdit}>
                                Prosseguir e Salvar
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4 pt-2">
                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Status do Orçamento
                            </label>
                            <select
                                className="w-full px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-white text-sm"
                                value={editForm.status}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                            >
                                <option value="draft">Rascunho</option>
                                <option value="pending">Pendente</option>
                                <option value="sent">Enviado</option>
                                <option value="approved">Aprovado</option>
                                <option value="rejected">Recusado</option>
                                <option value="cancelled">Cancelado</option>
                                <option value="expired">Expirado</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Validade da Proposta
                            </label>
                            <Input
                                type="date"
                                value={editForm.valid_until}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, valid_until: e.target.value }))}
                            />
                        </div>

                        <div>
                            <FormTextarea
                                label="Observações e Condições"
                                value={editForm.notes}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                                rows={3}
                            />
                        </div>
                    </div>
                </DefaultModal>
            )}

            {/* Modal de Auditoria e Notificação Administrativa */}
            {actionModal}
        </FadeIn>
    )
}

