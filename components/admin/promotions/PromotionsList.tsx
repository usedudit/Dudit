"use client"

import React, { useState, useTransition, useMemo } from "react"
import {
    Button,
    Badge,
    Input,
    Pagination,
    IconPlaceholder,
    ActionsDropdown,
    DefaultModal,
} from "@/components/reusable"
import FilterSheet, { type FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { toast } from "@/hooks/use-notification"
import {
    TagIcon,
    EditIcon,
    EyeIcon,
    StoreIcon,
    ClockIcon,
    SearchIcon,
    ListIcon,
    GridIcon,
    FilterIcon,
} from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useAdminActionModal } from "@/components/admin/AdminActionModal"
import {
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
    const [activeTab, setActiveTab] = useState("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const itemsPerPage = 10

    // Filter Sheet state
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
    const [statusFilters, setStatusFilters] = useState<string[]>([])

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

    const tabs = useMemo(() => [
        { id: "all", label: "Todos os Cupons", count: stats?.total ?? promotions.length },
        { id: "active", label: "Ativos", count: stats?.active ?? promotions.filter((p) => p.is_active).length },
        { id: "inactive", label: "Inativos", count: stats?.inactive ?? promotions.filter((p) => !p.is_active).length },
    ], [stats, promotions])

    const filtered = useMemo(() => {
        return promotions.filter((p) => {
            let matchesTab = true
            if (activeTab === "active") matchesTab = p.is_active === true
            else if (activeTab === "inactive") matchesTab = p.is_active === false

            const matchesStatusFilter =
                statusFilters.length === 0 ||
                (statusFilters.includes("active") && p.is_active) ||
                (statusFilters.includes("inactive") && !p.is_active)

            const term = search.trim().toLowerCase()
            const matchesSearch =
                !term ||
                p.code?.toLowerCase().includes(term) ||
                p.store_name?.toLowerCase().includes(term) ||
                p.stores?.name?.toLowerCase().includes(term)

            return matchesTab && matchesStatusFilter && matchesSearch
        })
    }, [promotions, activeTab, statusFilters, search])

    const paginated = useMemo(() => {
        return filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
    }, [filtered, page])

    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

    const handleOpenEdit = (promo: any) => {
        setEditingPromo(promo)
        setEditForm({
            is_active: promo.is_active ?? true,
            discount_value: Number(promo.discount_value || 0),
            ends_at: promo.ends_at ? promo.ends_at.slice(0, 10) : "",
        })
    }

    const handleSaveEdit = async () => {
        if (!editingPromo) return

        const changedFields: string[] = []
        if (editForm.is_active !== editingPromo.is_active) changedFields.push("status ativo/inativo")
        if (editForm.discount_value !== Number(editingPromo.discount_value)) changedFields.push("valor do desconto")
        if (editForm.ends_at !== (editingPromo.ends_at?.slice(0, 10) || "")) changedFields.push("data final")

        await runAction({
            title: "Salvar Alterações na Promoção / Cupom",
            description: `Cupom ${editingPromo.code} (${editingPromo.store_name || editingPromo.stores?.name || "Loja"})`,
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
                    toast({ title: "Erro ao salvar", description: res.error, variant: "destructive" })
                    return { success: false, error: res.error }
                }

                toast({ title: "Sucesso", description: "Cupom atualizado com sucesso." })
                setPromotions((prev) =>
                    prev.map((p) =>
                        p.id === editingPromo.id
                            ? {
                                  ...p,
                                  is_active: editForm.is_active,
                                  discount_value: editForm.discount_value,
                                  ends_at: editForm.ends_at,
                              }
                            : p
                    )
                )
                setEditingPromo(null)
                return { success: true }
            },
        })
    }

    const filterSections: FilterSectionConfig[] = [
        {
            id: "status",
            title: "Status da Promoção",
            type: "checkbox-list",
            options: ["active", "inactive"],
            optionLabels: {
                active: "Ativos",
                inactive: "Inativos",
            },
        },
    ]

    return (
        <FadeIn className="w-full space-y-6 pt-4 px-4 md:px-8 max-w-[1700px] mx-auto pb-12">
            {/* Top Controls matching ERP */}
            <div className="flex flex-col gap-4">
                {/* Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id)
                                    setPage(1)
                                }}
                                className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                                    isActive
                                        ? "bg-brand-dark dark:bg-white text-white dark:text-brand-dark shadow-sm"
                                        : "bg-white dark:bg-dark-surface text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-white border border-brand-border dark:border-dark-border"
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        isActive
                                            ? "bg-white/20 text-white dark:bg-brand-dark/20 dark:text-brand-dark"
                                            : "bg-brand-gray dark:bg-dark-border text-brand-inactive-text"
                                    }`}
                                >
                                    {tab.count}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Search & Actions Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="relative w-full sm:w-80 md:w-96">
                        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
                        <Input
                            placeholder="Buscar por código ou loja..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value)
                                setPage(1)
                            }}
                            className="pl-10 h-10 text-xs rounded-xl border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                        />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsFilterSheetOpen(true)}
                            className="flex items-center gap-2 text-xs font-semibold h-10 px-3 border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                        >
                            <FilterIcon className="w-3.5 h-3.5" />
                            <span>Filtros</span>
                            {statusFilters.length > 0 && (
                                <span className="w-2 h-2 rounded-full bg-brand-green" />
                            )}
                        </Button>

                        <div className="flex items-center border border-brand-border dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface p-0.5">
                            <button
                                onClick={() => setViewMode("list")}
                                className={`p-2 rounded-lg transition-colors ${
                                    viewMode === "list"
                                        ? "bg-brand-green-light dark:bg-dark-border text-brand-dark dark:text-white"
                                        : "text-brand-inactive-text hover:text-brand-dark"
                                }`}
                                title="Visualização em Lista"
                            >
                                <ListIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode("grid")}
                                className={`p-2 rounded-lg transition-colors ${
                                    viewMode === "grid"
                                        ? "bg-brand-green-light dark:bg-dark-border text-brand-dark dark:text-white"
                                        : "text-brand-inactive-text hover:text-brand-dark"
                                }`}
                                title="Visualização em Grade"
                            >
                                <GridIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {filtered.length === 0 ? (
                <div className="bg-white dark:bg-dark-surface rounded-[24px] p-8 border border-brand-border dark:border-dark-border flex flex-col justify-center min-h-[360px]">
                    <IconPlaceholder
                        title="Nenhum cupom ou promoção encontrada"
                        subtitle="Não há itens correspondentes aos filtros aplicados."
                        className="py-12"
                    />
                </div>
            ) : viewMode === "list" ? (
                /* ERP List / Table Layout */
                <div className="bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-brand-gray/50 dark:bg-dark-border/30 border-b border-brand-border dark:border-dark-border">
                                <tr>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Código / Cupom
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Loja / Vendedor
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Desconto
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Mínimo da Sacola
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Usos / Limite
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Vigência
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body text-center">
                                        Status
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body text-center">
                                        Ações
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                {paginated.map((promo) => {
                                    const storeName = promo.store_name || promo.stores?.name || "Loja Parceira"
                                    const isPercent = promo.discount_type === "percentage" || promo.discount_type === "percent"

                                    return (
                                        <tr
                                            key={promo.id}
                                            onClick={() => handleOpenEdit(promo)}
                                            className="h-[72px] cursor-pointer hover:bg-brand-green-light/5 dark:hover:bg-dark-border/20 transition-colors"
                                        >
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                                        <TagIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading block uppercase tracking-wider">
                                                            {promo.code}
                                                        </span>
                                                        <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                            Criado em {formatDate(promo.created_at)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="flex items-center gap-1.5 font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                    <StoreIcon size={14} className="text-brand-green shrink-0" />
                                                    <span className="truncate max-w-[180px]">{storeName}</span>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle">
                                                <span className="text-[14px] font-bold text-brand-green">
                                                    {isPercent
                                                        ? `${promo.discount_value}% OFF`
                                                        : formatCurrency(promo.discount_value || 0)}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-xs font-medium text-brand-dark dark:text-dark-heading">
                                                {promo.min_cart_value ? formatCurrency(promo.min_cart_value) : "Sem mínimo"}
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                                {promo.usage_count ?? 0}
                                                {promo.usage_limit ? ` / ${promo.usage_limit}` : " (Ilimitado)"}
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                {promo.ends_at ? `Até ${formatDate(promo.ends_at)}` : "Sem data limite"}
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-center">
                                                <Badge variant={promo.is_active ? "green" : "gray"}>
                                                    {promo.is_active ? "Ativo" : "Inativo"}
                                                </Badge>
                                            </td>
                                            <td
                                                className="py-3.5 px-5 align-middle text-center"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenEdit(promo)}
                                                    className="inline-flex items-center gap-1 text-xs h-8 px-2.5"
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
            ) : (
                /* ERP Grid Mode */
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {paginated.map((promo) => {
                            const storeName = promo.store_name || promo.stores?.name || "Loja Parceira"
                            const isPercent = promo.discount_type === "percentage" || promo.discount_type === "percent"

                            return (
                                <div
                                    key={promo.id}
                                    onClick={() => handleOpenEdit(promo)}
                                    className="p-5 rounded-[24px] bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-9 h-9 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                                    <TagIcon size={16} />
                                                </div>
                                                <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading uppercase group-hover:text-brand-green transition-colors">
                                                    {promo.code}
                                                </span>
                                            </div>
                                            <Badge variant={promo.is_active ? "green" : "gray"}>
                                                {promo.is_active ? "Ativo" : "Inativo"}
                                            </Badge>
                                        </div>

                                        <div className="space-y-1 mb-4">
                                            <p className="text-base font-bold text-brand-green">
                                                {isPercent
                                                    ? `${promo.discount_value}% OFF`
                                                    : formatCurrency(promo.discount_value || 0)}
                                            </p>
                                            <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text dark:text-dark-body pt-1">
                                                <StoreIcon size={12} className="text-brand-green shrink-0" />
                                                <span className="truncate">{storeName}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between">
                                        <span className="text-xs text-brand-inactive-text font-medium">
                                            {promo.ends_at ? `Até ${formatDate(promo.ends_at)}` : "Sem data limite"}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleOpenEdit(promo)
                                            }}
                                            className="text-xs h-8 px-2.5"
                                        >
                                            Editar
                                        </Button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {totalPages > 1 && (
                        <div className="p-4 bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border flex justify-end">
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Filter Sheet */}
            <FilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                sections={filterSections}
                filters={{ status: statusFilters }}
                setFilters={(newFilters: any) => setStatusFilters(newFilters.status || [])}
                onClear={() => setStatusFilters([])}
            />

            {/* Edit Modal with AdminActionModal */}
            {editingPromo && (
                <DefaultModal
                    isOpen={Boolean(editingPromo)}
                    onClose={() => setEditingPromo(null)}
                    title={`Editar Cupom / Promoção ${editingPromo.code}`}
                    description={`Loja: ${editingPromo.store_name || editingPromo.stores?.name || "Loja Parceira"}`}
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
                                Status da Promoção
                            </label>
                            <select
                                className="w-full px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-white text-sm"
                                value={editForm.is_active ? "active" : "inactive"}
                                onChange={(e) =>
                                    setEditForm((prev) => ({
                                        ...prev,
                                        is_active: e.target.value === "active",
                                    }))
                                }
                            >
                                <option value="active">Ativo (Em circulação)</option>
                                <option value="inactive">Inativo (Pausado)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Valor do Desconto
                            </label>
                            <Input
                                type="number"
                                value={editForm.discount_value}
                                onChange={(e) =>
                                    setEditForm((prev) => ({
                                        ...prev,
                                        discount_value: parseFloat(e.target.value) || 0,
                                    }))
                                }
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Data Final de Validade
                            </label>
                            <Input
                                type="date"
                                value={editForm.ends_at}
                                onChange={(e) =>
                                    setEditForm((prev) => ({
                                        ...prev,
                                        ends_at: e.target.value,
                                    }))
                                }
                            />
                        </div>
                    </div>
                </DefaultModal>
            )}

            {/* Action Context Modal (Notification + Audit) */}
            {actionModal}
        </FadeIn>
    )
}
