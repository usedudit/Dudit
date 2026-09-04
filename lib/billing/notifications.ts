import { sendPushToUser } from "@/lib/services/fcm.service"
import { createNotification, getPartnerTeamUserIds } from "@/lib/services/notification.service"

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

function mapBillingTypeToNotificationType(type: BillingNotificationType): "order_refunded" | "subscription_renewed" | "subscription_created" | "admin_announcement" {
    switch (type) {
        case "billing.refund_approved":
        case "billing.refund_rejected":
        case "billing.refund_requested":
            return "order_refunded"
        case "billing.subscription_renewed":
            return "subscription_renewed"
        case "billing.subscription_activated":
        case "billing.subscription_cancelled":
            return "subscription_created"
        default:
            return "admin_announcement"
    }
}

export async function sendBillingNotification(
    type: BillingNotificationType,
    userId: string,
    partnerId: string,
    metadata: Record<string, any>,
): Promise<void> {
    try {
        const title = notificationLabels[type] || "Notificação de Assinatura"
        const message = metadata.message || ""
        const href = metadata.token ? `/reembolso/${metadata.token}` : "/ddt-admin/billing/reembolsos"
        const notifType = mapBillingTypeToNotificationType(type)
        const idempotencyKey = `billing:${type}:${metadata.refundRequestId || metadata.purchaseId || partnerId}:${userId}:${Date.now()}`

        // 1. Notificação In-App no Dudit
        const { notification } = await createNotification({
            userId,
            type: notifType,
            title,
            message,
            entityType: "subscription",
            entityId: metadata.purchaseId || metadata.refundRequestId || null,
            data: {
                ...metadata,
                billing_type: type,
                partner_id: partnerId,
                audience: "seller",
                href,
            },
            idempotencyKey,
            origin: "system",
        })

        // 2. Notificação Push direta (FCM)
        try {
            await sendPushToUser({
                userId,
                notificationId: notification?.id || idempotencyKey,
                title,
                body: message,
                href,
                type: notifType,
                entityType: "subscription",
                entityId: metadata.purchaseId || metadata.refundRequestId || null,
            })
        } catch (pushErr) {
            console.error("[Billing Push Notification] Error sending push to user:", userId, pushErr)
        }
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
        const userIds = await getPartnerTeamUserIds(partnerId)
        if (!userIds || userIds.length === 0) return

        const title = notificationLabels[type] || "Notificação de Reembolso"
        const message = metadata.message || ""
        const href = metadata.token ? `/reembolso/${metadata.token}` : "/ddt-admin/billing/reembolsos"
        const notifType = mapBillingTypeToNotificationType(type)

        await Promise.all(
            userIds.map(async (userId) => {
                const idempotencyKey = `billing:${type}:${metadata.refundRequestId || metadata.purchaseId || partnerId}:${userId}:${Date.now()}`

                // 1. Notificação In-App no Dudit
                const { notification } = await createNotification({
                    userId,
                    type: notifType,
                    title,
                    message,
                    entityType: "subscription",
                    entityId: metadata.purchaseId || metadata.refundRequestId || null,
                    data: {
                        ...metadata,
                        billing_type: type,
                        partner_id: partnerId,
                        audience: "seller",
                        href,
                    },
                    idempotencyKey,
                    origin: "system",
                })

                // 2. Notificação Push direta (FCM)
                try {
                    await sendPushToUser({
                        userId,
                        notificationId: notification?.id || idempotencyKey,
                        title,
                        body: message,
                        href,
                        type: notifType,
                        entityType: "subscription",
                        entityId: metadata.purchaseId || metadata.refundRequestId || null,
                    })
                } catch (pushErr) {
                    console.error("[Billing Push Notification Team] Error sending push to user:", userId, pushErr)
                }
            })
        )
    } catch (error) {
        console.error("[Billing Notification Team] Error:", error)
    }
}
