"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AdminCatalogProviders } from "./AdminCatalogProviders"
import PlanDetailPage from "@/components/erp/recurring/PlanDetailPage"
import NewRecurringPlanPage from "@/components/erp/recurring/NewRecurringPlanPage"
import {
    updateAdminRecurringPlan,
    deleteAdminRecurringPlan,
    getAdminPlanFormData,
} from "@/app/actions/admin/catalog"
import { CatalogPartiesTab, CatalogTimelineTab } from "./AdminCatalogDetailTabs"
import { useAdminActionModal, type AdminActionResult } from "../AdminActionModal"
import { diffChangedFields } from "@/lib/admin/changed-fields"
import { useNotification } from "@/hooks/use-notification"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"

interface AdminPlanDetailClientProps {
    plan: any
    partnerId: string
    businessInfo?: unknown
    store?: any
    partnerName?: string | null
    auditEvents?: any[]
}

export default function AdminPlanDetailClient({
    plan,
    partnerId,
    businessInfo,
    store,
    partnerName,
    auditEvents,
}: AdminPlanDetailClientProps) {
    const router = useRouter()
    const [view, setView] = useState<"detail" | "edit">("detail")
    const [isDeleting, setIsDeleting] = useState(false)
    const { success: notifySuccess, error: notifyError } = useNotification()
    const { modal: actionModal, runAction } = useAdminActionModal()

    const handleBack = () => router.push("/ddt-admin/moderation")

    const handleSave = async (payload: any): Promise<{ success?: boolean; error?: string; cancelled?: boolean } | void> => {
        const changedFields = diffChangedFields(plan, payload)
        const result = await runAction({
            title: "Salvar alterações",
            description: `Plano "${plan.name}"`,
            changedFields,
            confirmLabel: "Salvar",
            runner: async (actionPayload) => {
                const res: any = await updateAdminRecurringPlan(
                    { ...payload, planId: plan.id },
                    {
                        reason: actionPayload.reason || null,
                        riskScore: actionPayload.riskScore,
                        notifySeller: actionPayload.notifySeller,
                        changedFields,
                    },
                )
                if (res?.success) return { success: true }
                return { success: false, error: res?.error || "Erro ao salvar o plano." }
            },
        })
        if (result.cancelled) return { success: false, cancelled: true }
        if (result.success) {
            router.refresh()
            return { success: true }
        }
        return { success: false, error: result.error || "Erro ao salvar o plano." }
    }

    const handleDelete = async (): Promise<AdminActionResult> =>
        runAction({
            title: "Excluir plano recorrente",
            description:
                'Se o plano possuir itens vinculados a assinaturas ou pedidos, ele será arquivado em vez de excluído. O time do vendedor será notificado.',
            requireReason: true,
            confirmLabel: "Excluir",
            runner: async (actionPayload) => {
                setIsDeleting(true)
                try {
                    const res: any = await deleteAdminRecurringPlan(plan.id, {
                        reason: actionPayload.reason,
                        riskScore: actionPayload.riskScore,
                        notifySeller: actionPayload.notifySeller,
                    })
                    if (res?.success) {
                        notifySuccess("Plano excluído", res.message || "Plano removido do catálogo.")
                        router.push("/ddt-admin/moderation")
                        return { success: true }
                    }
                    notifyError("Erro", res?.error || "Erro ao excluir plano")
                    return { success: false, error: res?.error || "Erro ao excluir plano" }
                } catch {
                    notifyError("Erro", "Erro ao excluir plano")
                    return { success: false, error: "Erro ao excluir plano" }
                } finally {
                    setIsDeleting(false)
                }
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
                    itemId={plan.id}
                />
            ),
        },
        {
            value: "timeline",
            label: "Histórico & Auditoria",
            content: <CatalogTimelineTab events={auditEvents} createdAt={plan.createdAt || plan.created_at} />,
        },
    ]

    return (
        <AdminCatalogProviders
            partnerId={partnerId}
            businessInfo={businessInfo}
            initialStores={store ? [store] : []}
        >
            <div className="px-4 md:px-8 pt-4 pb-8">
                {view === "detail" ? (
                    <PlanDetailPage
                        key={`plan-detail-${plan.id}`}
                        partnerId={partnerId}
                        plan={plan}
                        onBack={handleBack}
                        canManage
                        onEdit={() => setView("edit")}
                        onDelete={() => void handleDelete()}
                        loadFormData={getAdminPlanFormData}
                        extraTabs={extraTabs}
                    />
                ) : (
                    <NewRecurringPlanPage
                        key={`plan-edit-${plan.id}`}
                        partnerId={partnerId}
                        plan={plan}
                        onBack={() => setView("detail")}
                        onSave={handleSave}
                        loadFormData={getAdminPlanFormData}
                        extraTabs={extraTabs}
                    />
                )}
            </div>

            {actionModal}

            <SavingStatusModal isOpen={isDeleting} text="Excluindo plano..." />
        </AdminCatalogProviders>
    )
}
