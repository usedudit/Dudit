"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AdminCatalogProviders } from "./AdminCatalogProviders"
import AddProductPage from "@/components/erp/product/AddProductPage"
import {
    updateAdminProduct,
    deleteAdminCatalogProduct,
    setAdminCatalogProductArchived,
} from "@/app/actions/admin/catalog"
import {
    CatalogPartiesTab,
    CatalogTimelineTab,
    useCatalogModeration,
} from "./AdminCatalogDetailTabs"
import { useNotification } from "@/hooks/use-notification"
import { UNITS } from "@/lib/constants/product-constants"

interface AdminProductDetailClientProps {
    product: any
    suppliers: any[]
    partnerId: string
    businessInfo?: unknown
    store?: any
    partnerName?: string | null
    auditEvents?: any[]
}

export default function AdminProductDetailClient({
    product,
    suppliers,
    partnerId,
    businessInfo,
    store,
    partnerName,
    auditEvents,
}: AdminProductDetailClientProps) {
    const router = useRouter()
    const [mode, setMode] = useState<"add" | "details" | "edit" | "duplicate">("details")
    const [isSaving, setIsSaving] = useState(false)
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [unidadesMedida] = useState(() => UNITS.map((unit) => ({ codigo: unit, descricao: unit })))

    const handleBack = () => router.push("/ddt-admin/moderation")

    const moderation = useCatalogModeration({
        itemId: product.id,
        type: "product",
        moderationStatus: product.moderation_status,
        onDone: () => router.refresh(),
    })

    const handleSave = async (payload: any): Promise<{ success: boolean; error?: string }> => {
        setIsSaving(true)
        try {
            const {
                partnerId: _partnerId,
                storeId: _storeId,
                csrf_token: _csrfToken,
                pending_variants: _pendingVariants,
                pending_suppliers: _pendingSuppliers,
                isDuplicate: _isDuplicate,
                ...data
            } = payload
            const result = await updateAdminProduct(product.id, data)
            if (result.success) {
                notifySuccess("Produto atualizado", "Produto atualizado com sucesso!")
                setMode("details")
                router.refresh()
                return { success: true }
            }
            notifyError("Erro", result.error || "Erro ao atualizar produto")
            return { success: false, error: result.error }
        } catch (error: any) {
            notifyError("Erro", "Erro ao atualizar produto")
            return { success: false, error: error?.message }
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteConfirm = async (): Promise<{ success: boolean; error?: string }> => {
        const result = await deleteAdminCatalogProduct(product.id)
        if (result.success) return { success: true }
        return { success: false, error: result.error }
    }

    const handleArchiveToggle = async (
        isCurrentlyArchived: boolean,
    ): Promise<{ success: boolean; error?: string }> => {
        const result = await setAdminCatalogProductArchived(product.id, !isCurrentlyArchived)
        if (result.success) {
            router.refresh()
            return { success: true }
        }
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
                    itemId={product.id}
                />
            ),
        },
        {
            value: "timeline",
            label: "Histórico & Auditoria",
            content: <CatalogTimelineTab events={auditEvents} createdAt={product.created_at} />,
        },
    ]

    return (
        <AdminCatalogProviders
            partnerId={partnerId}
            businessInfo={businessInfo}
            initialStores={store ? [store] : []}
        >
            <div className="px-4 md:px-8 pt-4 pb-8">
                <AddProductPage
                    onBack={handleBack}
                    product={product}
                    mode={mode}
                    setMode={setMode}
                    onSave={handleSave}
                    onDeleteConfirm={handleDeleteConfirm}
                    onArchiveToggle={handleArchiveToggle}
                    suppliers={suppliers}
                    isSaving={isSaving}
                    unidadesMedida={unidadesMedida}
                    partnerId={partnerId}
                    onClose={() => router.refresh()}
                    extraTabs={extraTabs}
                    extraDropdownItems={moderation.dropdownItems}
                />
            </div>

            {moderation.modals}
        </AdminCatalogProviders>
    )
}
