"use client"

import { useState, useTransition } from "react"
import { Button, Badge, Input, Tabs, TabsList, TabsTrigger, Pagination, IconPlaceholder, DefaultModal } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { TagIcon, EditIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useAdminActionModal } from "@/components/admin/AdminActionModal"
import {
    getAdminPromotions,
    updateAdminPromotion,
    type AdminPromotionStats,
} from "@/app/actions/admin/promotions"

interface PromotionsListProps {
    initialData: any[]
    initialStats?: AdminPromotionStats
}

export default function PromotionsList({ initialData, initialStats }: PromotionsListProps) {
    const [promotions, setPromotions] = useState(initialData)
    const [stats, setStats] = useState(initialStats)
    const [statusTab, setStatusTab] = useState("all")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const itemsPerPage = 8

    const [editingPromo, setEditingPromo] = useState<any | null>(null)
    const [editForm, setEditForm] = useState<{
        is_active: boolean
        discount_value: number
        ends_at: string
    }>({
        is_active: true,
        discount_value: 0,
        ends_at: "",
    })

    const [isPending, startTransition] = useTransition()
    const { modal: actionModal, runAction } = useAdminActionModal()

    const filtered = promotions.filter((p) => {
        const matchesStatus =
            statusTab === "all"
                ? true
                : statusTab === "active"
                    ? p.is_active === true
                    : p.is_active === false

        const matchesSearch =
            !search.trim() ||
            p.code?.toLowerCase().includes(search.toLowerCase()) ||
            p.stores?.name?.toLowerCase().includes(search.toLowerCase())

        return matchesStatus && matchesSearch
    })

    const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

    const handleOpenEdit = (promo: any) => {
        setEditingPromo(promo)
        setEditForm({
            is_active: promo.is_active ?? true,
            discount_value: Number(promo.discount_value) || 0,
            ends_at: promo.ends_at ? promo.ends_at.slice(0, 10) : "",
        })
    }

    const handleSaveEdit = async () => {
        if (!editingPromo) return

        const changedFields: string[] = []
        if (editForm.is_active !== editingPromo.is_active) changedFields.push("status ativo/inativo")
        if (editForm.discount_value !== Number(editingPromo.discount_value)) changedFields.push("valor de desconto")
        if (editForm.ends_at !== (editingPromo.ends_at?.slice(0, 10) || "")) changedFields.push("validade")

        const result = await runAction({
            title: "Salvar Alterações no Cupom",
            description: `Cupom "${editingPromo.code}" (${editingPromo.stores?.name || "Loja"})`,
            changedFields,
            force: true,
            confirmLabel: "Salvar e Notificar",
            notifyLabel: "Enviar notificação pelo Dudit ao vendedor",
            runner: async (payload) => {
                const res = await updateAdminPromotion(
                    editingPromo.id,
                    {
                        is_active: editForm.is_active,
                        discount_value: editForm.discount_value,
                        ends_at: editForm.ends_at || null,
                    },
                    payload
                )

                if (!res.success) {
                    return { success: false, error: res.error || "Erro ao atualizar cupom" }
                }

                // Update local state
                setPromotions((prev) =>
                    prev.map((item) =>
                        item.id === editingPromo.id
                            ? {
                                  ...item,
                                  is_active: editForm.is_active,
                                  discount_value: editForm.discount_value,
                                  ends_at: editForm.ends_at,
                              }
                            : item
                    )
                )

                toast.success(`Cupom "${editingPromo.code}" atualizado com sucesso!`)
                setEditingPromo(null)
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
            <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Total de Cupons</p>
                    <p className="text-2xl font-bold text-brand-dark dark:text-white mt-1">{stats?.total ?? promotions.length}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Ativos</p>
                    <p className="text-2xl font-bold text-green-500 mt-1">{stats?.active ?? 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Inativos / Pausados</p>
                    <p className="text-2xl font-bold text-red-500 mt-1">{stats?.inactive ?? 0}</p>
                </div>
            </div>

            {/* Controls: Search & Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <Tabs value={statusTab} onValueChange={(val) => { setStatusTab(val); setPage(1) }}>
                    <TabsList className="bg-brand-gray dark:bg-dark-border/40 p-1 rounded-xl">
                        <TabsTrigger value="all">Todos</TabsTrigger>
                        <TabsTrigger value="active">Ativos</TabsTrigger>
                        <TabsTrigger value="inactive">Inativos</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="w-full md:w-72">
                    <Input
                        type="text"
                        placeholder="Buscar por código ou loja..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                </div>
            </div>

            {/* List / Table */}
            {paginated.length === 0 ? (
                <IconPlaceholder
                    icon={TagIcon}
                    title="Nenhuma promoção encontrada"
                    subtitle="Não há cupons ou promoções correspondentes aos filtros aplicados."
                />
            ) : (
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-brand-gray/60 dark:bg-dark-border/30 text-xs font-semibold uppercase tracking-wider text-brand-inactive-text border-b border-brand-border dark:border-dark-border">
                                <tr>
                                    <th className="px-5 py-4">Código / Data</th>
                                    <th className="px-5 py-4">Loja / Parceiro</th>
                                    <th className="px-5 py-4">Desconto</th>
                                    <th className="px-5 py-4">Utilizações</th>
                                    <th className="px-5 py-4">Validade</th>
                                    <th className="px-5 py-4">Status</th>
                                    <th className="px-5 py-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                {paginated.map((promo) => {
                                    const isPercentage = promo.discount_type === "percentage"
                                    const discountLabel = isPercentage
                                        ? `${promo.discount_value}% OFF`
                                        : promo.discount_type === "free_shipping"
                                            ? "Frete Grátis"
                                            : formatCurrency(promo.discount_value || 0)

                                    return (
                                        <tr key={promo.id} className="hover:bg-brand-gray/30 dark:hover:bg-white/5 transition-colors">
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="font-bold font-mono text-brand-dark dark:text-white block tracking-wider">{promo.code}</span>
                                                <span className="text-xs text-brand-inactive-text block">{formatDate(promo.created_at)}</span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="font-medium text-brand-dark dark:text-white block">{promo.stores?.name || "Loja"}</span>
                                                <span className="text-xs text-brand-inactive-text block">{promo.stores?.phone || ""}</span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="font-bold text-brand-green block">{discountLabel}</span>
                                                {promo.min_cart_value > 0 && (
                                                    <span className="text-xs text-brand-inactive-text block">
                                                        Mín: {formatCurrency(promo.min_cart_value)}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap text-xs">
                                                <span className="font-semibold text-brand-dark dark:text-white">
                                                    {promo.usage_count || 0}
                                                </span>
                                                {promo.usage_limit ? ` / ${promo.usage_limit}` : " (ilimitado)"}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap text-xs text-brand-inactive-text">
                                                {promo.ends_at ? formatDate(promo.ends_at) : "Sem prazo"}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <Badge variant={promo.is_active ? "green" : "red"}>
                                                    {promo.is_active ? "Ativo" : "Inativo"}
                                                </Badge>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap text-right">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenEdit(promo)}
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

            {/* Modal de Edição */}
            {editingPromo && (
                <DefaultModal
                    isOpen={Boolean(editingPromo)}
                    onClose={() => setEditingPromo(null)}
                    title={`Editar Cupom: ${editingPromo.code}`}
                    description={`Loja: ${editingPromo.stores?.name || "Loja"}`}
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="ghost" onClick={() => setEditingPromo(null)}>
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
                                Status do Cupom
                            </label>
                            <select
                                className="w-full px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-white text-sm"
                                value={editForm.is_active ? "true" : "false"}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, is_active: e.target.value === "true" }))}
                            >
                                <option value="true">Ativo</option>
                                <option value="false">Inativo / Pausado</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Valor do Desconto ({editingPromo.discount_type === "percentage" ? "%" : "R$"})
                            </label>
                            <Input
                                type="number"
                                min={0}
                                value={editForm.discount_value}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, discount_value: Number(e.target.value) }))}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Data de Término / Validade
                            </label>
                            <Input
                                type="date"
                                value={editForm.ends_at}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, ends_at: e.target.value }))}
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

