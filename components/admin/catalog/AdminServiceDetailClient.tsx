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

    const handleSave = async (payload: any): Promise<{ success: boolean; error?: string }> => {
        const result = await updateAdminService(service.id, payload)
        if (result.success) return { success: true }
        return { success: false, error: result.error }
    }

    const handleDeleteConfirm = async (): Promise<{ success: boolean; error?: string }> => {
        const result = await deleteAdminCatalogService(service.id)
        if (result.success) return { success: true }
        return { success: false, error: result.error }
    }

    const handleArchiveToggle = async (
        isCurrentlyArchived: boolean,
    ): Promise<{ success: boolean; error?: string }> => {
        const result = await setAdminCatalogServiceArchived(service.id, !isCurrentlyArchived)
        if (result.success) return { success: true }
        return { success: false, error: result.error }
    }

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
        </AdminCatalogProviders>
    )
}
