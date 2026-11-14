"use client"

import { useState, useTransition } from "react"
import { Button, Badge, Input, Tabs, TabsList, TabsTrigger, Pagination, IconPlaceholder, DefaultModal, FormTextarea } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import { toast } from "@/hooks/use-notification"
import { SearchIcon, WrenchIcon, EditIcon, ShareIcon, EyeIcon, ClockIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useAdminActionModal } from "@/components/admin/AdminActionModal"
import {
    getAdminServiceOrders,
    updateAdminServiceOrder,
    type AdminServiceOrderStats,
} from "@/app/actions/admin/service-orders"

interface ServiceOrdersListProps {
    initialData: any[]
    initialStats?: AdminServiceOrderStats
}

const STATUS_MAP: Record<string, { label: string; variant: "green" | "orange" | "red" | "blue" | "gray" }> = {
    aberta: { label: "Aberta", variant: "blue" },
    aguardando_aprovacao: { label: "Aguardando Aprovação", variant: "orange" },
    aprovada: { label: "Aprovada", variant: "blue" },
    em_andamento: { label: "Em Andamento", variant: "orange" },
    aguardando_peca: { label: "Aguardando Peça", variant: "orange" },
    concluida: { label: "Concluída", variant: "green" },
    entregue: { label: "Entregue", variant: "green" },
    cancelada: { label: "Cancelada", variant: "red" },
}

export default function ServiceOrdersList({ initialData, initialStats }: ServiceOrdersListProps) {
    const [orders, setOrders] = useState(initialData)
    const [stats, setStats] = useState(initialStats)
    const [statusTab, setStatusTab] = useState("all")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const itemsPerPage = 8

    const [editingOrder, setEditingOrder] = useState<any | null>(null)
    const [editForm, setEditForm] = useState<{
        status: string
        title: string
        description: string
        diagnosis: string
        internal_notes: string
    }>({
        status: "",
        title: "",
        description: "",
        diagnosis: "",
        internal_notes: "",
    })

    const [isPending, startTransition] = useTransition()
    const { modal: actionModal, runAction } = useAdminActionModal()

    const filtered = orders.filter((o) => {
        const matchesStatus =
            statusTab === "all"
                ? true
                : statusTab === "andamento"
                    ? ["em_andamento", "aguardando_peca"].includes(o.status)
                    : statusTab === "concluida"
                        ? ["concluida", "entregue"].includes(o.status)
                        : o.status === statusTab

        const matchesSearch =
            !search.trim() ||
            o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
            o.title?.toLowerCase().includes(search.toLowerCase()) ||
            o.customer_snapshot?.name?.toLowerCase().includes(search.toLowerCase()) ||
            o.stores?.name?.toLowerCase().includes(search.toLowerCase())

        return matchesStatus && matchesSearch
    })

    const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

    const handleOpenEdit = (order: any) => {
        setEditingOrder(order)
        setEditForm({
            status: order.status || "aberta",
            title: order.title || "",
            description: order.description || "",
            diagnosis: order.diagnosis || "",
            internal_notes: order.internal_notes || "",
        })
    }

    const handleSaveEdit = async () => {
        if (!editingOrder) return

        const changedFields: string[] = []
        if (editForm.status !== editingOrder.status) changedFields.push("status")
        if (editForm.title !== editingOrder.title) changedFields.push("título")
        if (editForm.description !== (editingOrder.description || "")) changedFields.push("descrição")
        if (editForm.diagnosis !== (editingOrder.diagnosis || "")) changedFields.push("diagnóstico")
        if (editForm.internal_notes !== (editingOrder.internal_notes || "")) changedFields.push("observações internas")

        const result = await runAction({
            title: "Salvar Alterações na OS",
            description: `Ordem de Serviço #${editingOrder.order_number} (${editingOrder.stores?.name || "Loja"})`,
            changedFields,
            force: true,
            confirmLabel: "Salvar e Notificar",
            notifyLabel: "Enviar notificação pelo Dudit ao vendedor",
            runner: async (payload) => {
                const res = await updateAdminServiceOrder(
                    editingOrder.id,
                    {
                        status: editForm.status,
                        title: editForm.title,
                        description: editForm.description,
                        diagnosis: editForm.diagnosis,
                        internal_notes: editForm.internal_notes,
                    },
                    payload
                )

                if (!res.success) {
                    return { success: false, error: res.error || "Erro ao atualizar OS" }
                }

                // Update local state
                setOrders((prev) =>
                    prev.map((item) =>
                        item.id === editingOrder.id
                            ? {
                                  ...item,
                                  ...editForm,
                              }
                            : item
                    )
                )

                toast.success(`OS #${editingOrder.order_number} atualizada com sucesso!`)
                setEditingOrder(null)
                return { success: true }
            },
        })

        if (!result.cancelled && !result.success) {
            toast.error(result.error || "Erro ao salvar alterações.")
        }
    }

    return (
        <FadeIn className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header & Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Total de OSs</p>
                    <p className="text-2xl font-bold text-brand-dark dark:text-white mt-1">{stats?.total ?? orders.length}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Abertas</p>
                    <p className="text-2xl font-bold text-blue-500 mt-1">{stats?.aberta ?? 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Aguardando Aprovação</p>
                    <p className="text-2xl font-bold text-yellow-500 mt-1">{stats?.aguardando_aprovacao ?? 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Em Andamento</p>
                    <p className="text-2xl font-bold text-orange-500 mt-1">{stats?.em_andamento ?? 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Concluídas</p>
                    <p className="text-2xl font-bold text-green-500 mt-1">{stats?.concluida ?? 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Canceladas</p>
                    <p className="text-2xl font-bold text-red-500 mt-1">{stats?.cancelada ?? 0}</p>
                </div>
            </div>

            {/* Controls: Search & Filter Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <Tabs value={statusTab} onValueChange={(val) => { setStatusTab(val); setPage(1) }}>
                    <TabsList className="bg-brand-gray dark:bg-dark-border/40 p-1 rounded-xl">
                        <TabsTrigger value="all">Todas</TabsTrigger>
                        <TabsTrigger value="aberta">Abertas</TabsTrigger>
                        <TabsTrigger value="aguardando_aprovacao">Aguard. Aprovação</TabsTrigger>
                        <TabsTrigger value="andamento">Em Andamento</TabsTrigger>
                        <TabsTrigger value="concluida">Concluídas</TabsTrigger>
                        <TabsTrigger value="cancelada">Canceladas</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="w-full md:w-72">
                    <Input
                        type="text"
                        placeholder="Buscar por OS, cliente ou loja..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                </div>
            </div>

            {/* List / Table */}
            {paginated.length === 0 ? (
                <IconPlaceholder
                    icon={WrenchIcon}
                    title="Nenhuma ordem de serviço encontrada"
                    subtitle="Não há registros correspondentes aos filtros aplicados."
                />
            ) : (
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-brand-gray/60 dark:bg-dark-border/30 text-xs font-semibold uppercase tracking-wider text-brand-inactive-text border-b border-brand-border dark:border-dark-border">
                                <tr>
                                    <th className="px-5 py-4">OS / Data</th>
                                    <th className="px-5 py-4">Loja / Parceiro</th>
                                    <th className="px-5 py-4">Cliente</th>
                                    <th className="px-5 py-4">Título / Serviço</th>
                                    <th className="px-5 py-4">Valor Total</th>
                                    <th className="px-5 py-4">Status</th>
                                    <th className="px-5 py-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                {paginated.map((os) => {
                                    const meta = STATUS_MAP[os.status] || { label: os.status, variant: "gray" as const }
                                    const customerName = os.customer_snapshot?.name || "Cliente sem nome"

                                    return (
                                        <tr key={os.id} className="hover:bg-brand-gray/30 dark:hover:bg-white/5 transition-colors">
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="font-bold text-brand-dark dark:text-white block">#{os.order_number}</span>
                                                <span className="text-xs text-brand-inactive-text block">{formatDate(os.created_at)}</span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="font-medium text-brand-dark dark:text-white block">{os.stores?.name || "Loja"}</span>
                                                <span className="text-xs text-brand-inactive-text block">{os.stores?.phone || ""}</span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="font-medium text-brand-dark dark:text-white block">{customerName}</span>
                                                <span className="text-xs text-brand-inactive-text block">{os.customer_snapshot?.phone || ""}</span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="font-medium text-brand-dark dark:text-white block truncate max-w-xs">{os.title || "Sem título"}</span>
                                                <span className="text-xs text-brand-inactive-text block truncate max-w-xs">{os.description || ""}</span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="font-bold text-brand-dark dark:text-white block">
                                                    {formatCurrency(os.total_amount || 0)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <Badge variant={meta.variant}>{meta.label}</Badge>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap text-right space-x-2">
                                                {os.public_token && (
                                                    <a
                                                        href={`/os/${os.public_token}`}
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
                                                    onClick={() => handleOpenEdit(os)}
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
            {editingOrder && (
                <DefaultModal
                    isOpen={Boolean(editingOrder)}
                    onClose={() => setEditingOrder(null)}
                    title={`Editar Ordem de Serviço #${editingOrder.order_number}`}
                    description={`Loja: ${editingOrder.stores?.name || "Loja"} • Cliente: ${editingOrder.customer_snapshot?.name || "Sem nome"}`}
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="ghost" onClick={() => setEditingOrder(null)}>
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
                                Status da OS
                            </label>
                            <select
                                className="w-full px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-white text-sm"
                                value={editForm.status}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                            >
                                <option value="aberta">Aberta</option>
                                <option value="aguardando_aprovacao">Aguardando Aprovação</option>
                                <option value="aprovada">Aprovada</option>
                                <option value="em_andamento">Em Andamento</option>
                                <option value="aguardando_peca">Aguardando Peça</option>
                                <option value="concluida">Concluída</option>
                                <option value="entregue">Entregue</option>
                                <option value="cancelada">Cancelada</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Título do Serviço
                            </label>
                            <Input
                                value={editForm.title}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                                placeholder="Título do serviço..."
                            />
                        </div>

                        <div>
                            <FormTextarea
                                label="Descrição do Problema / Solicitação"
                                value={editForm.description}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                                rows={2}
                            />
                        </div>

                        <div>
                            <FormTextarea
                                label="Diagnóstico Técnico"
                                value={editForm.diagnosis}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, diagnosis: e.target.value }))}
                                rows={2}
                            />
                        </div>

                        <div>
                            <FormTextarea
                                label="Observações Internas (Admin & Loja)"
                                value={editForm.internal_notes}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, internal_notes: e.target.value }))}
                                rows={2}
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

