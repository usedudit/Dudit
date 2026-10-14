"use client"

import { useState } from "react"
import Link from "next/link"
import {
    listAdminCatalogProducts,
    listAdminCatalogServices,
    listAdminCatalogPlans,
} from "@/app/actions/admin/catalog"
import { formatCurrency } from "@/lib/utils/formatters"
import { SearchIcon, BoxIcon } from "@/lib/icons"

type CatalogKind = "products" | "services" | "plans"

interface AdminCatalogListProps {
    kind: CatalogKind
    initialItems: any[]
}

const STATUS_LABELS: Record<string, string> = {
    ativo: "Ativo",
    inativo: "Inativo",
    arquivado: "Arquivado",
    active: "Ativo",
    inactive: "Inativo",
    archived: "Arquivado",
    deleted: "Excluído",
}

const statusClasses = (status: string) => {
    if (status === "ativo" || status === "active") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    if (status === "arquivado" || status === "archived") return "bg-gray-100 text-gray-600 dark:bg-dark-border/40 dark:text-dark-body"
    return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
}

const formatDate = (value?: string | null) => {
    if (!value) return "—"
    try {
        return new Date(value).toLocaleDateString("pt-BR")
    } catch {
        return "—"
    }
}

const frequencyLabel = (plan: any) => {
    const types: Record<string, string> = {
        daily: "Diário",
        weekly: "Semanal",
        monthly: "Mensal",
        yearly: "Anual",
    }
    const interval = Number(plan.frequency_interval) || 1
    const base = types[plan.frequency_type] || plan.frequency_type || "—"
    return interval > 1 ? `${base} (x${interval})` : base
}

export function AdminCatalogList({ kind, initialItems }: AdminCatalogListProps) {
    const [items, setItems] = useState<any[]>(initialItems)
    const [search, setSearch] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = async (term: string) => {
        setIsLoading(true)
        setError(null)
        try {
            const input = { search: term, limit: 100 }
            const res =
                kind === "products"
                    ? await listAdminCatalogProducts(input)
                    : kind === "services"
                        ? await listAdminCatalogServices(input)
                        : await listAdminCatalogPlans(input)
            if (res.success) setItems(res.data.items)
            else setError(res.error)
        } catch {
            setError("Erro ao carregar itens do catálogo")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        load(search)
    }

    const handleClear = () => {
        setSearch("")
        load("")
    }

    const columns =
        kind === "products"
            ? ["Produto", "Parceiro", "Preço", "Estoque", "Status", "Atualizado"]
            : kind === "services"
                ? ["Serviço", "Parceiro", "Preço", "Duração", "Status", "Atualizado"]
                : ["Plano", "Parceiro", "Frequência", "Status", "Atualizado"]

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                        {kind === "products" ? "Produtos" : kind === "services" ? "Serviços" : "Planos recorrentes"}
                    </h2>
                    <p className="text-sm text-brand-inactive-text mt-1">
                        Clique em um item para abrir a edição completa no modo vendedor.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-72">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por nome ou SKU..."
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-green/40"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-green text-white hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {isLoading ? "Buscando..." : "Buscar"}
                    </button>
                    {search && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="px-3 py-2 text-sm rounded-lg border border-brand-border dark:border-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                        >
                            Limpar
                        </button>
                    )}
                </form>
            </div>

            {error && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-sm text-red-700 dark:text-red-400">
                    {error}
                </div>
            )}

            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-border/20">
                                {columns.map((col) => (
                                    <th
                                        key={col}
                                        className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-brand-inactive-text dark:text-dark-body"
                                    >
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={columns.length}
                                        className="px-4 py-12 text-center text-sm text-brand-inactive-text"
                                    >
                                        <div className="flex flex-col items-center gap-3">
                                            <BoxIcon className="w-8 h-8 opacity-50" />
                                            <span>Nenhum item encontrado no catálogo.</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {items.map((item) => (
                                <tr
                                    key={item.id}
                                    className="border-b border-brand-border/60 dark:border-dark-border/60 last:border-0 hover:bg-brand-gray/40 dark:hover:bg-dark-border/20 transition-colors"
                                >
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/ddt-admin/catalog/${kind}/${item.id}`}
                                            className="font-semibold text-sm text-brand-dark dark:text-dark-heading hover:text-brand-green transition-colors"
                                        >
                                            {item.name || "Sem nome"}
                                        </Link>
                                        {item.sku && (
                                            <span className="block text-xs text-brand-inactive-text font-mono mt-0.5">
                                                {item.sku}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-brand-inactive-text dark:text-dark-body">
                                        {item.partner_name || "—"}
                                    </td>
                                    {kind !== "plans" && (
                                        <td className="px-4 py-3 text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                            {typeof item.price === "number" ? formatCurrency(item.price) : "—"}
                                        </td>
                                    )}
                                    {kind === "products" && (
                                        <td className="px-4 py-3 text-sm text-brand-inactive-text dark:text-dark-body">
                                            {item.stock_quantity ?? 0}
                                        </td>
                                    )}
                                    {kind === "services" && (
                                        <td className="px-4 py-3 text-sm text-brand-inactive-text dark:text-dark-body">
                                            {item.duration_minutes ? `${item.duration_minutes} min` : "—"}
                                        </td>
                                    )}
                                    {kind === "plans" && (
                                        <td className="px-4 py-3 text-sm text-brand-inactive-text dark:text-dark-body">
                                            {frequencyLabel(item)}
                                        </td>
                                    )}
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusClasses(
                                                item.status || "",
                                            )}`}
                                        >
                                            {STATUS_LABELS[item.status || ""] || item.status || "—"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-brand-inactive-text dark:text-dark-body">
                                        {formatDate(item.updated_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
