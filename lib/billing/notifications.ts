type BillingNotificationType =
    | "billing.payment_received"
    | "billing.payment_failed"
    | "billing.invoice_available"
    | "billing.subscription_cancelled"
    | "billing.subscription_renewed"
    | "billing.subscription_activated"
    | "billing.refund_requested"
    | "billing.refund_approved"
    | "billing.refund_rejected"

const notificationLabels: Record<BillingNotificationType, string> = {
    "billing.payment_received": "Pagamento recebido",
    "billing.payment_failed": "Falha no pagamento",
    "billing.invoice_available": "Fatura disponível",
    "billing.subscription_cancelled": "Assinatura cancelada",
    "billing.subscription_renewed": "Assinatura renovada",
    "billing.subscription_activated": "Assinatura ativada",
    "billing.refund_requested": "Solicitação de reembolso enviada",
    "billing.refund_approved": "Reembolso aprovado",
    "billing.refund_rejected": "Solicitação de reembolso recusada",
}

export async function sendBillingNotification(
    type: BillingNotificationType,
    userId: string,
    partnerId: string,
    metadata: Record<string, any>,
): Promise<void> {
    try {
        const { createNotification } = await import("@/lib/services/notification.service")
        await createNotification({
            userId,
            type: type as any,
            title: notificationLabels[type],
            message: metadata.message || "",
            entityType: "billing_purchase" as any,
            entityId: metadata.purchaseId,
            data: metadata,
        } as any)
    } catch (error) {
        console.error("[Billing Notification] Error:", error)
    }
}

export async function notifyPartnerTeam(
    type: BillingNotificationType,
    partnerId: string,
    metadata: Record<string, any>,
): Promise<void> {
    try {
        const { createNotificationsForUsers } = await import("@/lib/services/notification.service")
        const { getPartnerTeamUserIds } = await import("@/lib/services/notification.service")
        const userIds = await getPartnerTeamUserIds(partnerId)

        if (userIds.length === 0) return

        await createNotificationsForUsers(userIds, {
            type: type as any,
            title: notificationLabels[type],
            message: metadata.message || "",
            entityType: "billing_purchase" as any,
            entityId: metadata.purchaseId,
            data: metadata,
        } as any)
    } catch (error) {
        console.error("[Billing Notification Team] Error:", error)
    }
}
