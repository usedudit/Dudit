"use client"

import { useState } from "react"
import Link from "next/link"
import { Button, Badge, Input, Tabs, TabsList, TabsTrigger, Pagination, IconPlaceholder } from "@/components/reusable"
import { RepeatIcon, EditIcon, EyeIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatDate } from "@/lib/utils"

interface PlansListProps {
    initialItems: any[]
}

const FREQUENCY_LABELS: Record<string, string> = {
    weekly: "Semanal",
    biweekly: "Quinzenal",
    monthly: "Mensal",
    bimonthly: "Bimestral",
    quarterly: "Trimestral",
    semiannual: "Semestral",
    yearly: "Anual",
}

export default function PlansList({ initialItems }: PlansListProps) {
    const [plans, setPlans] = useState(initialItems)
    const [statusTab, setStatusTab] = useState("all")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const itemsPerPage = 8

    const filtered = plans.filter((p) => {
        const matchesStatus =
            statusTab === "all"
                ? true
                : statusTab === "active"
                    ? p.status === "active" || p.status === "ativo"
                    : p.status === "inactive" || p.status === "inativo"

        const matchesSearch =
            !search.trim() ||
            p.name?.toLowerCase().includes(search.toLowerCase()) ||
            p.partner_name?.toLowerCase().includes(search.toLowerCase())

        return matchesStatus && matchesSearch
    })

    const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

    const activeCount = plans.filter((p) => p.status === "active" || p.status === "ativo").length
    const inactiveCount = plans.length - activeCount

    return (
        <FadeIn className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Total de Planos Recorrentes</p>
                    <p className="text-2xl font-bold text-brand-dark dark:text-white mt-1">{plans.length}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Ativos</p>
                    <p className="text-2xl font-bold text-green-500 mt-1">{activeCount}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                    <p className="text-xs text-brand-inactive-text font-medium">Inativos</p>
                    <p className="text-2xl font-bold text-red-500 mt-1">{inactiveCount}</p>
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
                        placeholder="Buscar por plano ou loja..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                </div>
            </div>

            {/* List / Table */}
            {paginated.length === 0 ? (
                <IconPlaceholder
                    icon={RepeatIcon}
                    title="Nenhum plano recorrente encontrado"
                    subtitle="Não há planos correspondentes aos filtros aplicados."
                />
            ) : (
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-brand-gray/60 dark:bg-dark-border/30 text-xs font-semibold uppercase tracking-wider text-brand-inactive-text border-b border-brand-border dark:border-dark-border">
                                <tr>
                                    <th className="px-5 py-4">Plano / Imagem</th>
                                    <th className="px-5 py-4">Loja / Parceiro</th>
                                    <th className="px-5 py-4">Frequência</th>
                                    <th className="px-5 py-4">Marketplace</th>
                                    <th className="px-5 py-4">Status</th>
                                    <th className="px-5 py-4">Atualizado em</th>
                                    <th className="px-5 py-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                {paginated.map((plan) => {
                                    const isActive = plan.status === "active" || plan.status === "ativo"
                                    const freqLabel = FREQUENCY_LABELS[plan.frequency_type] || plan.frequency_type || "Mensal"
                                    const firstImg = Array.isArray(plan.images) && plan.images[0] ? plan.images[0] : null

                                    return (
                                        <tr key={plan.id} className="hover:bg-brand-gray/30 dark:hover:bg-white/5 transition-colors">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    {firstImg ? (
                                                        <img
                                                            src={firstImg}
                                                            alt={plan.name}
                                                            className="w-10 h-10 rounded-xl object-cover border border-brand-border dark:border-dark-border"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-xl bg-brand-gray dark:bg-dark-border/40 flex items-center justify-center text-brand-inactive-text">
                                                            <RepeatIcon className="w-5 h-5" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <span className="font-bold text-brand-dark dark:text-white block">{plan.name}</span>
                                                        <span className="text-xs text-brand-inactive-text block">ID: {plan.id.slice(0, 8)}...</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="font-medium text-brand-dark dark:text-white block">{plan.partner_name || "Loja"}</span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="font-medium text-brand-dark dark:text-white block">{freqLabel}</span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <Badge variant={plan.show_in_marketplace ? "green" : "gray"}>
                                                    {plan.show_in_marketplace ? "Publicado" : "Oculto"}
                                                </Badge>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <Badge variant={isActive ? "green" : "red"}>
                                                    {isActive ? "Ativo" : "Inativo"}
                                                </Badge>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap text-xs text-brand-inactive-text">
                                                {formatDate(plan.updated_at || plan.created_at)}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap text-right">
                                                <Link
                                                    href={`/ddt-admin/catalog/plans/${plan.id}`}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border dark:border-dark-border text-xs font-semibold hover:bg-brand-gray dark:hover:bg-dark-border/30 transition-colors"
                                                >
                                                    <EditIcon className="w-3.5 h-3.5" />
                                                    <span>Editar Plano</span>
                                                </Link>
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
        </FadeIn>
    )
}

