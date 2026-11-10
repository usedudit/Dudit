"use client"

import { useState, useTransition, useMemo } from "react"
import { Button, Badge, Input, Tabs, TabsList, TabsTrigger, Pagination, IconPlaceholder, AlertModal } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import { toast } from "@/hooks/use-notification"
import { PlusIcon, SearchIcon, MegaphoneIcon, CheckCircleIcon, ClockIcon, AlertCircleIcon, EditIcon, TrashIcon } from "@/lib/icons"
import type { AdminAdvertisementRow } from "@/app/actions/admin/advertisements"
import {
    createAdvertisement,
    updateAdvertisement,
    updateAdvertisementStatus,
    deleteAdvertisement,
    getAdminAdvertisements,
} from "@/app/actions/admin/advertisements"
import AdvertisementFormModal, { formStateToPayload, type AdvertisementFormState } from "./AdvertisementFormModal"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { formatDate } from "@/lib/utils"

interface AdvertisementsListProps {
    initialData: AdminAdvertisementRow[]
}

export default function AdvertisementsList({ initialData }: AdvertisementsListProps) {
    const [ads, setAds] = useState(initialData)
    const [statusTab, setStatusTab] = useState("all")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const itemsPerPage = 8

    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<AdminAdvertisementRow | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<AdminAdvertisementRow | null>(null)
    const [isPending, startTransition] = useTransition()

    const refreshList = () => {
        startTransition(async () => {
            try {
                const rows = await getAdminAdvertisements()
                setAds(rows)
            } catch {
                toast.error("Erro ao atualizar lista de anúncios")
            }
        })
    }

    const handleCreate = () => {
        setEditing(null)
        setFormOpen(true)
    }

    const handleEdit = (ad: AdminAdvertisementRow) => {
        setEditing(ad)
        setFormOpen(true)
    }

    const handleSubmit = async (form: AdvertisementFormState) => {
        const payload = formStateToPayload(form)

        startTransition(async () => {
            const result = editing
                ? await updateAdvertisement(editing.id, payload)
                : await createAdvertisement(payload)

            if (!result.success) {
                toast.error(result.error || "Erro ao salvar anúncio")
                return
            }

            toast.success(editing ? "Anúncio atualizado com sucesso" : "Anúncio criado com sucesso")
            setFormOpen(false)
            setEditing(null)
            refreshList()
        })
    }

    const handleToggleStatus = (ad: AdminAdvertisementRow) => {
        const nextStatus = ad.status === "active" ? "paused" : "active"

        startTransition(async () => {
            const result = await updateAdvertisementStatus(ad.id, nextStatus)
            if (!result.success) {
                toast.error(result.error || "Erro ao alterar status")
                return
            }
            toast.success(nextStatus === "active" ? "Anúncio ativado" : "Anúncio pausado")
            refreshList()
        })
    }

    const handleDelete = (reason: string) => {
        if (!deleteTarget) return

        startTransition(async () => {
            const result = await deleteAdvertisement(deleteTarget.id)
            if (!result.success) {
                toast.error(result.error || "Erro ao excluir anúncio")
                return
            }
            toast.success("Anúncio excluído com sucesso")
            setDeleteTarget(null)
            refreshList()
        })
    }

    // Stats
    const stats = useMemo(() => {
        const total = ads.length
        const active = ads.filter(a => a.status === "active").length
        const paused = ads.filter(a => a.status === "paused").length
        const expired = ads.filter(a => a.status === "expired").length
        return { total, active, paused, expired }
    }, [ads])

    // Filter
    const filteredAds = useMemo(() => {
        return ads.filter(ad => {
            const matchesStatus = statusTab === "all" || ad.status === statusTab
            const matchesSearch = !search ||
                ad.title.toLowerCase().includes(search.toLowerCase()) ||
                (ad.advertiser_name && ad.advertiser_name.toLowerCase().includes(search.toLowerCase())) ||
                (ad.cities && ad.cities.some(c => c.toLowerCase().includes(search.toLowerCase())))
            return matchesStatus && matchesSearch
        })
    }, [ads, statusTab, search])

    // Pagination
    const totalPages = Math.ceil(filteredAds.length / itemsPerPage)
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return filteredAds.slice(start, start + itemsPerPage)
    }, [filteredAds, page])

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                {/* Desktop Header */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Publicidade
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie campanhas de anúncios patrocinados, visibilidade regional e métricas.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="default"
                            onClick={handleCreate}
                            leftIcon={<PlusIcon size={18} />}
                        >
                            Novo Anúncio
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mb-6 px-4 md:px-8">
                    <Tabs value={statusTab} onValueChange={(val) => { setStatusTab(val); setPage(1) }}>
                        <TabsList className="px-0">
                            <TabsTrigger value="all" icon={MegaphoneIcon} badge={<TabCountBadge count={stats.total} variant="gray" />}>
                                Todos
                            </TabsTrigger>
                            <TabsTrigger value="active" icon={CheckCircleIcon} badge={<TabCountBadge count={stats.active} variant="green" />}>
                                Ativos
                            </TabsTrigger>
                            <TabsTrigger value="paused" icon={ClockIcon} badge={<TabCountBadge count={stats.paused} variant="orange" />}>
                                Pausados
                            </TabsTrigger>
                            <TabsTrigger value="expired" icon={AlertCircleIcon} badge={<TabCountBadge count={stats.expired} variant="red" />}>
                                Expirados
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {/* Search Bar */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full px-4 md:px-8 mb-6">
                    <div className="w-full sm:w-96">
                        <Input
                            placeholder="Buscar por título ou anunciante..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                            variant="full-rounded"
                            className="h-[42px]"
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 lg:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Nenhum anúncio"
                                    title="Nenhum anúncio encontrado"
                                    subtitle={search ? "Tente ajustar sua busca." : "Nenhum anúncio cadastrado nesta categoria."}
                                    itemButton={{
                                        text: "Criar Primeiro Anúncio",
                                        action: handleCreate,
                                        variant: "default"
                                    }}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Desktop Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">Campanha / Título</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Anunciante</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Região</th>
                                                    <th className="py-3 px-2 w-36 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Período</th>
                                                    <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Cliques / Impr.</th>
                                                    <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Status</th>
                                                    <th className="py-3 px-2 w-28 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((ad) => (
                                                    <tr
                                                        key={ad.id}
                                                        className="group hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 transition-colors"
                                                    >
                                                        <td className="py-3 px-2 pl-6 border-b border-brand-border dark:border-dark-border">
                                                            <div className="flex items-center gap-3">
                                                                {ad.image_url && (
                                                                    <img src={ad.image_url} alt="" className="w-12 h-8 rounded-lg object-cover border border-brand-border dark:border-dark-border" />
                                                                )}
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{ad.title}</span>
                                                                    <span className="text-xs text-brand-inactive-text truncate">{ad.target_mode || "Geral"}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-2 border-b border-brand-border dark:border-dark-border">
                                                            <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{ad.advertiser_name || "Dudit Geral"}</span>
                                                        </td>
                                                        <td className="py-3 px-2 border-b border-brand-border dark:border-dark-border">
                                                            <span className="text-xs text-brand-inactive-text">{ad.cities?.[0] ? `${ad.cities[0]}/${ad.state || "BR"}` : "Nacional"}</span>
                                                        </td>
                                                        <td className="py-3 px-2 border-b border-brand-border dark:border-dark-border text-center">
                                                            <span className="text-xs text-brand-inactive-text block">{formatDate(ad.starts_at)}</span>
                                                            <span className="text-[11px] text-brand-inactive-text block">até {formatDate(ad.ends_at)}</span>
                                                        </td>
                                                        <td className="py-3 px-2 border-b border-brand-border dark:border-dark-border text-center">
                                                            <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">{ad.clicks_count || 0}</span>
                                                            <span className="text-[11px] text-brand-inactive-text"> / {ad.impressions_count || 0}</span>
                                                        </td>
                                                        <td className="py-3 px-2 border-b border-brand-border dark:border-dark-border text-center">
                                                            <Badge variant={ad.status === "active" ? "green" : ad.status === "paused" ? "orange" : "red"}>
                                                                {ad.status === "active" ? "Ativo" : ad.status === "paused" ? "Pausado" : "Expirado"}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-3 px-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleToggleStatus(ad)}
                                                                    className="text-xs font-bold"
                                                                >
                                                                    {ad.status === "active" ? "Pausar" : "Ativar"}
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleEdit(ad)}
                                                                >
                                                                    <EditIcon size={16} />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setDeleteTarget(ad)}
                                                                    className="text-red-500 hover:text-red-600"
                                                                >
                                                                    <TrashIcon size={16} />
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="pt-4">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                            fixedUntil="lg"
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Modal de Formulário */}
            <AdvertisementFormModal
                open={formOpen}
                editing={editing}
                onClose={() => { setFormOpen(false); setEditing(null) }}
                onSubmit={handleSubmit}
                isSubmitting={isPending}
            />

            {/* Modal de Exclusão */}
            <AlertModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => handleDelete("Exclusão manual de anúncio")}
                title="Excluir Anúncio"
                description={`Tem certeza que deseja excluir permanentemente o anúncio "${deleteTarget?.title}"?`}
                confirmText="Excluir Anúncio"
                variant="danger"
            />
        </FadeIn>
    )
}

