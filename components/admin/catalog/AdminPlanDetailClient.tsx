"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AdminStoreCard } from "@/components/admin/AdminStoreCard"
import { AdminCatalogProviders } from "./AdminCatalogProviders"
import PlanDetailPage from "@/components/erp/recurring/PlanDetailPage"
import NewRecurringPlanPage from "@/components/erp/recurring/NewRecurringPlanPage"
import {
    updateAdminRecurringPlan,
    deleteAdminRecurringPlan,
    getAdminPlanFormData,
} from "@/app/actions/admin/catalog"
import { useNotification } from "@/hooks/use-notification"
import AlertModal from "@/components/reusable/AlertModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import { TrashIcon } from "@/lib/icons"

interface AdminPlanDetailClientProps {
    plan: any
    partnerId: string
    businessInfo?: unknown
    store?: any
}

export default function AdminPlanDetailClient({
    plan,
    partnerId,
    businessInfo,
    store,
}: AdminPlanDetailClientProps) {
    const router = useRouter()
    const [view, setView] = useState<"detail" | "edit">("detail")
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const { success: notifySuccess, error: notifyError } = useNotification()

    const handleSave = async (payload: any): Promise<{ success?: boolean; error?: string } | void> => {
        const res: any = await updateAdminRecurringPlan({ ...payload, planId: plan.id })
        if (res?.success) {
            router.refresh()
            return { success: true }
        }
        return { success: false, error: res?.error || "Erro ao salvar o plano." }
    }

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const res: any = await deleteAdminRecurringPlan(plan.id)
            if (res?.success) {
                notifySuccess("Plano excluído", res.message || "Plano removido do catálogo.")
                router.push("/ddt-admin/catalog/plans")
            } else {
                notifyError("Erro", res?.error || "Erro ao excluir plano")
            }
        } catch {
            notifyError("Erro", "Erro ao excluir plano")
        } finally {
            setIsDeleting(false)
            setShowDeleteModal(false)
        }
    }

    return (
        <AdminCatalogProviders
            partnerId={partnerId}
            businessInfo={businessInfo}
            initialStores={store ? [store] : []}
        >
            <div className="px-4 md:px-8 pt-4 pb-8">
                {store && <AdminStoreCard store={store} />}
                {view === "detail" ? (
                    <PlanDetailPage
                        key={`plan-detail-${plan.id}`}
                        partnerId={partnerId}
                        plan={plan}
                        onBack={() => router.push("/ddt-admin/catalog/plans")}
                        canManage
                        onEdit={() => setView("edit")}
                        onDelete={() => setShowDeleteModal(true)}
                        loadFormData={getAdminPlanFormData}
                    />
                ) : (
                    <NewRecurringPlanPage
                        key={`plan-edit-${plan.id}`}
                        partnerId={partnerId}
                        plan={plan}
                        onBack={() => setView("detail")}
                        onSave={handleSave}
                        loadFormData={getAdminPlanFormData}
                    />
                )}
            </div>

            {showDeleteModal && (
                <AlertModal
                    onClose={() => setShowDeleteModal(false)}
                    onConfirm={handleDelete}
                    title="Excluir plano recorrente?"
                    message="Se o plano possuir itens vinculados a assinaturas ou pedidos, ele será arquivado em vez de excluído."
                    confirmText={isDeleting ? "Excluindo..." : "Excluir"}
                    icon={<TrashIcon />}
                    isDestructive
                    disabled={isDeleting}
                />
            )}

            <SavingStatusModal isOpen={isDeleting} text="Excluindo plano..." />
        </AdminCatalogProviders>
    )
}
