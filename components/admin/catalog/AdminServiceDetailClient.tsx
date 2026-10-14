"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AdminStoreCard } from "@/components/admin/AdminStoreCard"
import { AdminCatalogProviders } from "./AdminCatalogProviders"
import { AddServicePage } from "@/components/erp/servicos/AddServicePage"
import {
    updateAdminService,
    deleteAdminCatalogService,
    setAdminCatalogServiceArchived,
    getAdminServiceCatalogMetadata,
} from "@/app/actions/admin/catalog"

interface AdminServiceDetailClientProps {
    service: any
    partnerId: string
    businessInfo?: unknown
    store?: any
}

export default function AdminServiceDetailClient({
    service,
    partnerId,
    businessInfo,
    store,
}: AdminServiceDetailClientProps) {
    const router = useRouter()
    const [mode, setMode] = useState<"add" | "details" | "edit" | "duplicate">("details")

    const handleClose = () => {
        setMode("details")
        router.refresh()
    }

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

    return (
        <AdminCatalogProviders
            partnerId={partnerId}
            businessInfo={businessInfo}
            initialStores={store ? [store] : []}
        >
            <div className="px-4 md:px-8 pt-4 pb-8">
                {store && <AdminStoreCard store={store} />}
                <AddServicePage
                    onBack={() => router.push("/ddt-admin/catalog/services")}
                    service={service}
                    mode={mode}
                    setMode={setMode}
                    partnerId={partnerId}
                    onSave={handleSave}
                    metadataLoader={getAdminServiceCatalogMetadata}
                    onDeleteConfirm={handleDeleteConfirm}
                    onArchiveToggle={handleArchiveToggle}
                    onClose={handleClose}
                />
            </div>
        </AdminCatalogProviders>
    )
}
