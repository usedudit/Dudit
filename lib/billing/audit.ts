import { getAdminClient } from "@/lib/supabase/admin"

type BillingActionType =
    | "billing.purchase.created"
    | "billing.purchase.completed"
    | "billing.purchase.failed"
    | "billing.purchase.refunded"
    | "billing.purchase.cancelled"
    | "billing.payment.created"
    | "billing.payment.approved"
    | "billing.payment.rejected"
    | "billing.payment.refunded"
    | "billing.payment.failed"
    | "billing.payment.retried"
    | "billing.invoice.generated"
    | "billing.invoice.downloaded"
    | "billing.invoice.viewed"
    | "billing.subscription.cancelled"
    | "billing.subscription.activated"
    | "billing.subscription.renewed"
    | "billing.webhook.received"
    | "billing.webhook.processed"
    | "billing.admin.cancelled"
    | "billing.admin.reactivated"
    | "billing.admin.marked_paid"
    | "billing.admin.note_added"

export async function logBillingAudit(
    action: BillingActionType,
    partnerId: string,
    metadata: Record<string, any>,
    userId?: string | null,
): Promise<void> {
    try {
        const admin = getAdminClient()
        const { error } = await admin.from("audit_logs").insert({
            table_name: "billing",
            action,
            user_id: userId || null,
            partner_id: partnerId,
            new_values: metadata,
        })
        if (error) {
            console.error("[Billing Audit] Error logging audit:", error.message)
        }
    } catch (error) {
        console.error("[Billing Audit] Error:", error)
    }
}

export async function logBillingAdminAudit(
    actionType: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, any>,
    adminUserId: string,
): Promise<void> {
    try {
        const { adminAuditLog } = await import("@/lib/admin/audit")
        await adminAuditLog({
            actionType: actionType as any,
            targetType: targetType as any,
            targetId,
            metadata,
            adminUserId,
        })
    } catch (error) {
        console.error("[Billing Admin Audit] Error:", error)
    }
}
