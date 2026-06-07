"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import { toast } from "@/hooks/use-notification"
import { Plus } from "lucide-react"
import type { AdminAdvertisementRow } from "@/app/actions/admin/advertisements"
import {
    createAdvertisement,
    updateAdvertisement,
    updateAdvertisementStatus,
    deleteAdvertisement,
    getAdminAdvertisements,
} from "@/app/actions/admin/advertisements"
import AdvertisementListRow, { AdvertisementsEmptyState } from "./AdvertisementListRow"
import AdvertisementFormModal, { formStateToPayload, type AdvertisementFormState } from "./AdvertisementFormModal"

interface AdvertisementsListProps {
    initialData: AdminAdvertisementRow[]
}

export default function AdvertisementsList({ initialData }: AdvertisementsListProps) {
    const [ads, setAds] = useState(initialData)
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

            toast.success(editing ? "Anúncio atualizado" : "Anúncio criado")
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

    const handleDelete = () => {
        if (!deleteTarget) return

        startTransition(async () => {
            const result = await deleteAdvertisement(deleteTarget.id)
            if (!result.success) {
                toast.error(result.error || "Erro ao excluir anúncio")
                return
            }
            toast.success("Anúncio excluído")
            setDeleteTarget(null)
            refreshList()
        })
    }

    return (
        <div className="p-4 md:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-brand-dark dark:text-dark-heading">Publicidade local</h2>
                    <p className="text-sm text-brand-inactive-text">Gerencie anúncios patrocinados por região</p>
                </div>
                <Button onClick={handleCreate} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Novo anúncio
                </Button>
            </div>

            {ads.length === 0 ? (
                <AdvertisementsEmptyState onCreate={handleCreate} />
            ) : (
                <div className="space-y-3">
                    {ads.map((ad) => (
                        <AdvertisementListRow
                            key={ad.id}
                            ad={ad}
                            onEdit={handleEdit}
                            onToggleStatus={handleToggleStatus}
                            onDelete={setDeleteTarget}
                        />
                    ))}
                </div>
            )}

            <AdvertisementFormModal
                open={formOpen}
                editing={editing}
                onClose={() => { setFormOpen(false); setEditing(null) }}
                onSubmit={handleSubmit}
                isSubmitting={isPending}
            />

            <DefaultModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Excluir anúncio"
                maxWidth="sm"
            >
                <p className="text-sm text-brand-inactive-text mb-6">
                    Tem certeza que deseja excluir <strong>{deleteTarget?.title}</strong>? Esta ação não pode ser desfeita.
                </p>
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isPending}>Cancelar</Button>
                    <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                        {isPending ? "Excluindo..." : "Excluir"}
                    </Button>
                </div>
            </DefaultModal>
        </div>
    )
}
