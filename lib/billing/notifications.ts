import { sendPushToUser } from "@/lib/services/fcm.service"
import { createNotification, getPartnerTeamUserIds } from "@/lib/services/notification.service"
import { OWNERSHIP_ROLES } from "@/lib/notifications/audience"
import { SMTP2GOService } from "@/lib/services/smtp2go.service"
import { getAdminClient } from "@/lib/supabase/admin"

type BillingNotificationType =
    | "billing.payment_received"
    | "billing.payment_failed"
    | "billing.payment_reminder"
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
    "billing.payment_reminder": "Pagamento pendente",
    "billing.invoice_available": "Fatura disponível",
    "billing.subscription_cancelled": "Assinatura cancelada",
    "billing.subscription_renewed": "Assinatura renovada",
    "billing.subscription_activated": "Assinatura ativada",
    "billing.refund_requested": "Solicitação de reembolso enviada",
    "billing.refund_approved": "Reembolso aprovado",
    "billing.refund_rejected": "Solicitação de reembolso recusada",
}

/** Where the notification should take the user (subscription management). */
const SUBSCRIPTION_SETTINGS_HREF = "/erp/configuracoes?tab=assinatura"

function billingHref(type: BillingNotificationType): string {
    if (type.startsWith("billing.refund")) return "/erp/configuracoes"
    return SUBSCRIPTION_SETTINGS_HREF
}

function billingIdempotencyKey(
    type: BillingNotificationType,
    userId: string,
    partnerId: string,
    metadata: Record<string, any>,
): string {
    const subject =
        metadata.subscription_id ||
        metadata.purchaseId ||
        metadata.refundRequestId ||
        partnerId
    const cycle = metadata.cycle_key || metadata.cycle || ""
    const bucket = metadata.idempotency_bucket || ""
    return `billing:${type}:${subject}:${userId}:${cycle}:${bucket}`
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

async function sendBillingEmail(
    userId: string,
    subject: string,
    htmlBody: string,
): Promise<void> {
    try {
        const admin = getAdminClient()
        const { data: profile } = await admin
            .from("profiles")
            .select("email")
            .eq("id", userId)
            .maybeSingle()

        if (!profile?.email) return

        await SMTP2GOService.sendEmail({
            to: [{ email: profile.email }],
            subject,
            html: htmlBody,
        })
    } catch (err) {
        console.error("[Billing Email] Error sending email:", err)
    }
}

function buildRenewalEmailHtml(
    planName: string,
    amount: number,
    nextBillingDate: string,
): string {
    const formattedAmount = amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    const formattedDate = new Date(nextBillingDate).toLocaleDateString("pt-BR")

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-radius: 8px; padding: 24px;">
    <h2 style="color: #333; margin-top: 0;">Assinatura Renovada</h2>
    <p style="color: #555; line-height: 1.6;">
      Sua assinatura do plano <strong>${planName}</strong> foi renovada com sucesso.
    </p>
    <div style="background: #fff; border-radius: 6px; padding: 16px; margin: 16px 0; border: 1px solid #e9ecef;">
      <p style="margin: 4px 0; color: #333;"><strong>Valor:</strong> ${formattedAmount}</p>
      <p style="margin: 4px 0; color: #333;"><strong>Próximo vencimento:</strong> ${formattedDate}</p>
    </div>
    <p style="color: #888; font-size: 13px; margin-bottom: 0;">
      Caso tenha alguma dúvida, entre em contato conosco.
    </p>
  </div>
</body>
</html>`
}

function buildPaymentFailedEmailHtml(
    planName: string,
    gracePeriodDays: number,
): string {
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-radius: 8px; padding: 24px;">
    <h2 style="color: #c0392b; margin-top: 0;">Falha no Pagamento</h2>
    <p style="color: #555; line-height: 1.6;">
      O pagamento da sua assinatura do plano <strong>${planName}</strong> não foi processado.
    </p>
    <div style="background: #fff3cd; border-radius: 6px; padding: 16px; margin: 16px 0; border: 1px solid #ffc107;">
      <p style="margin: 0; color: #856404;">
        Você tem <strong>${gracePeriodDays} dias</strong> para regularizar o pagamento antes da suspensão dos recursos do plano.
      </p>
    </div>
    <p style="color: #555; line-height: 1.6;">
      Acesse a Dudit para atualizar seu método de pagamento ou entre em contato com o suporte.
    </p>
    <p style="color: #888; font-size: 13px; margin-bottom: 0;">
      Caso tenha alguma dúvida, entre em contato conosco.
    </p>
  </div>
</body>
</html>`
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
        const href = billingHref(type)
        const notifType = mapBillingTypeToNotificationType(type)
        const idempotencyKey = billingIdempotencyKey(type, userId, partnerId, metadata)

        // 1. Notificação In-App na Dudit
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

        // 3. Email (apenas para planos pagos)
        if (metadata.plan_price > 0) {
            try {
                if (type === "billing.subscription_renewed") {
                    await sendBillingEmail(
                        userId,
                        "Dudit - Assinatura Renovada",
                        buildRenewalEmailHtml(
                            metadata.plan_name || "Pago",
                            Number(metadata.plan_price || 0),
                            metadata.next_billing_date || new Date().toISOString(),
                        ),
                    )
                } else if (type === "billing.payment_failed" || type === "billing.payment_reminder") {
                    await sendBillingEmail(
                        userId,
                        type === "billing.payment_reminder"
                            ? "Dudit - Pagamento da Assinatura Pendente"
                            : "Dudit - Falha no Pagamento da Assinatura",
                        buildPaymentFailedEmailHtml(
                            metadata.plan_name || "Pago",
                            3,
                        ),
                    )
                }
            } catch (emailErr) {
                console.error("[Billing Email] Error:", emailErr)
            }
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
        const userIds = await getPartnerTeamUserIds(partnerId, OWNERSHIP_ROLES)
        if (!userIds || userIds.length === 0) return

        const title = notificationLabels[type] || "Notificação de Reembolso"
        const message = metadata.message || ""
        const href = billingHref(type)
        const notifType = mapBillingTypeToNotificationType(type)

        await Promise.all(
            userIds.map(async (userId) => {
                const idempotencyKey = billingIdempotencyKey(type, userId, partnerId, metadata)

                // 1. Notificação In-App na Dudit
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
