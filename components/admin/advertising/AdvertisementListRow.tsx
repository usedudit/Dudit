"use client"

import { Badge } from "@/components/reusable"
import type { AdminAdvertisementRow } from "@/app/actions/admin/advertisements"
import { Megaphone, Pencil, Trash2, Play, Pause } from "lucide-react"

const STATUS_LABELS: Record<string, string> = {
    draft: "Rascunho",
    active: "Ativo",
    paused: "Pausado",
    expired: "Expirado",
}

const STATUS_VARIANT: Record<string, "green" | "red" | "orange" | "gray"> = {
    draft: "gray",
    active: "green",
    paused: "orange",
    expired: "red",
}

const TARGET_LABELS: Record<string, string> = {
    radius: "Raio",
    cities: "Cidades",
    state: "Estado",
    country: "País",
}

interface AdvertisementListRowProps {
    ad: AdminAdvertisementRow
    onEdit: (ad: AdminAdvertisementRow) => void
    onToggleStatus: (ad: AdminAdvertisementRow) => void
    onDelete: (ad: AdminAdvertisementRow) => void
}

export default function AdvertisementListRow({
    ad,
    onEdit,
    onToggleStatus,
    onDelete,
}: AdvertisementListRowProps) {
    const period = `${new Date(ad.starts_at).toLocaleDateString("pt-BR")} — ${new Date(ad.ends_at).toLocaleDateString("pt-BR")}`

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl p-4 md:p-5 flex flex-col md:flex-row gap-4 md:items-center">
            <div className="w-full md:w-20 h-20 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-semibold text-brand-dark dark:text-dark-heading truncate">{ad.title}</h3>
                    <Badge variant={STATUS_VARIANT[ad.status] || "gray"}>{STATUS_LABELS[ad.status]}</Badge>
                    <Badge variant="gray">{TARGET_LABELS[ad.target_mode]}</Badge>
                </div>
                <p className="text-sm text-brand-inactive-text truncate">{ad.advertiser_name}</p>
                <p className="text-xs text-brand-inactive-text mt-1">{period}</p>
            </div>

            <div className="grid grid-cols-3 gap-3 md:gap-6 text-center shrink-0">
                <div>
                    <p className="text-lg font-bold text-brand-dark dark:text-dark-heading">{ad.impressions_count.toLocaleString("pt-BR")}</p>
                    <p className="text-[10px] uppercase tracking-wide text-brand-inactive-text">Impressões</p>
                </div>
                <div>
                    <p className="text-lg font-bold text-brand-dark dark:text-dark-heading">{ad.clicks_count.toLocaleString("pt-BR")}</p>
                    <p className="text-[10px] uppercase tracking-wide text-brand-inactive-text">Cliques</p>
                </div>
                <div>
                    <p className="text-lg font-bold text-brand-green">{ad.ctr}</p>
                    <p className="text-[10px] uppercase tracking-wide text-brand-inactive-text">CTR</p>
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <button
                    type="button"
                    onClick={() => onEdit(ad)}
                    className="p-2 rounded-lg border border-brand-border dark:border-dark-border hover:bg-brand-gray dark:hover:bg-dark-border/30 transition-colors"
                    title="Editar"
                >
                    <Pencil className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={() => onToggleStatus(ad)}
                    className="p-2 rounded-lg border border-brand-border dark:border-dark-border hover:bg-brand-gray dark:hover:bg-dark-border/30 transition-colors"
                    title={ad.status === "active" ? "Pausar" : "Ativar"}
                >
                    {ad.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                    type="button"
                    onClick={() => onDelete(ad)}
                    className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    title="Excluir"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

export function AdvertisementsEmptyState({ onCreate }: { onCreate: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <Megaphone className="w-12 h-12 text-brand-inactive-text mb-4" />
            <h3 className="text-lg font-semibold text-brand-dark dark:text-dark-heading mb-2">Nenhum anúncio cadastrado</h3>
            <p className="text-sm text-brand-inactive-text mb-6 max-w-md">
                Crie campanhas patrocinadas locais para promover negócios, eventos e serviços na região dos usuários.
            </p>
            <button
                type="button"
                onClick={onCreate}
                className="px-6 py-2.5 bg-brand-green text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors"
            >
                Criar anúncio
            </button>
        </div>
    )
}
