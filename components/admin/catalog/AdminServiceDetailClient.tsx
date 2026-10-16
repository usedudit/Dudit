"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AdminCatalogProviders } from "./AdminCatalogProviders"
import { AddServicePage } from "@/components/erp/servicos/AddServicePage"
import {
    updateAdminService,
    deleteAdminCatalogService,
    setAdminCatalogServiceArchived,
    getAdminServiceCatalogMetadata,
} from "@/app/actions/admin/catalog"
import {
    CatalogPartiesTab,
    CatalogTimelineTab,
    useCatalogModeration,
} from "./AdminCatalogDetailTabs"
import { useAdminActionModal, type AdminActionResult } from "../AdminActionModal"
import { diffChangedFields } from "@/lib/admin/changed-fields"

interface AdminServiceDetailClientProps {
    service: any
    partnerId: string
    businessInfo?: unknown
    store?: any
    partnerName?: string | null
    auditEvents?: any[]
}

export default function AdminServiceDetailClient({
    service,
    partnerId,
    businessInfo,
    store,
    partnerName,
    auditEvents,
}: AdminServiceDetailClientProps) {
    const router = useRouter()
    const [mode, setMode] = useState<"add" | "details" | "edit" | "duplicate">("details")
    const { modal: actionModal, runAction } = useAdminActionModal()

    const handleClose = () => {
        setMode("details")
        router.refresh()
    }

    const handleBack = () => router.push("/ddt-admin/moderation")

    const moderation = useCatalogModeration({
        itemId: service.id,
        type: "service",
        moderationStatus: service.moderation_status,
        onDone: () => router.refresh(),
    })

    const handleSave = async (payload: any): Promise<{ success: boolean; error?: string; cancelled?: boolean }> => {
        const changedFields = diffChangedFields(service, payload)
            const result = await runAction({
                title: "Salvar alterações",
                description: `Serviço "${service.name}"`,
                changedFields,
                force: true,
                confirmLabel: "Salvar",
            runner: async (actionPayload) => {
                const res = await updateAdminService(service.id, payload, {
                    reason: actionPayload.reason || null,
                    riskScore: actionPayload.riskScore,
                    notifySeller: actionPayload.notifySeller,
                    changedFields,
                })
                if (res.success) return { success: true }
                return { success: false, error: res.error }
            },
        })
        if (result.cancelled) return { success: false, cancelled: true }
        if (result.success) return { success: true }
        return { success: false, error: result.error }
    }

    const handleDeleteConfirm = async (): Promise<AdminActionResult> =>
        runAction({
            title: "Excluir serviço",
            description: `Serviço "${service.name}". O time do vendedor será notificado.`,
            requireReason: true,
            confirmLabel: "Excluir",
            runner: async (actionPayload) => {
                const res = await deleteAdminCatalogService(service.id, {
                    reason: actionPayload.reason,
                    riskScore: actionPayload.riskScore,
                    notifySeller: actionPayload.notifySeller,
                })
                return res.success ? { success: true } : { success: false, error: res.error }
            },
        })

    const handleArchiveToggle = async (isCurrentlyArchived: boolean): Promise<AdminActionResult> =>
        runAction({
            title: isCurrentlyArchived ? "Desarquivar serviço" : "Arquivar serviço",
            description: `Serviço "${service.name}". O time do vendedor será notificado.`,
            requireReason: true,
            confirmLabel: isCurrentlyArchived ? "Desarquivar" : "Arquivar",
            runner: async (actionPayload) => {
                const res = await setAdminCatalogServiceArchived(service.id, !isCurrentlyArchived, {
                    reason: actionPayload.reason,
                    riskScore: actionPayload.riskScore,
                    notifySeller: actionPayload.notifySeller,
                })
                if (res.success) return { success: true }
                return { success: false, error: res.error }
            },
        })

    const extraTabs = [
        {
            value: "parties",
            label: "Comprador e Loja",
            content: (
                <CatalogPartiesTab
                    store={store}
                    partnerName={partnerName}
                    partnerId={partnerId}
                    itemId={service.id}
                />
            ),
        },
        {
            value: "timeline",
            label: "Histórico & Auditoria",
            content: <CatalogTimelineTab events={auditEvents} createdAt={service.created_at} />,
        },
    ]

    return (
        <AdminCatalogProviders
            partnerId={partnerId}
            businessInfo={businessInfo}
            initialStores={store ? [store] : []}
        >
            <div className="px-4 md:px-8 pt-4 pb-8">
                <AddServicePage
                    onBack={handleBack}
                    service={service}
                    mode={mode}
                    setMode={setMode}
                    partnerId={partnerId}
                    onSave={handleSave}
                    metadataLoader={getAdminServiceCatalogMetadata}
                    onDeleteConfirm={handleDeleteConfirm}
                    onArchiveToggle={handleArchiveToggle}
                    onClose={handleClose}
                    extraTabs={extraTabs}
                    extraDropdownItems={moderation.dropdownItems}
                />
            </div>

            {moderation.modals}
            {actionModal}
        </AdminCatalogProviders>
    )
}
