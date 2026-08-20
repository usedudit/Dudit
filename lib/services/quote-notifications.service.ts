import "server-only"

import { logAuditEvent } from "./timeline.service"
import { createNotification } from "./notification.service"
import { getAdminClient } from "@/lib/supabase/admin"

export type QuoteNotificationEvent = "shared" | "viewed" | "approved" | "rejected" | "expired" | "converted"

interface QuoteNotificationInput {
    event: QuoteNotificationEvent
    quote: any
    actorUserId?: string | null
    actorName?: string | null
    ipAddress?: string | null
    userAgent?: string | null
    rejectionReason?: string | null
    approvalMethod?: string | null
}

/**
 * Handles all notification and audit logging side effects for the public quotation approval system.
 * Keeps audit records standardized in Portuguese and sends in-app Dudit notifications.
 */
export async function notifyQuoteEvent(input: QuoteNotificationInput): Promise<void> {
    const { event, quote, actorUserId, actorName, ipAddress, userAgent, rejectionReason, approvalMethod } = input
    const partnerId = quote.partner_id
    const quoteId = quote.id
    const quoteNum = quote.quote_number || `#${quoteId.substring(0, 8)}`
    const nowStr = new Date().toLocaleDateString("pt-BR")

    // 1. Audit Log Generation (Portuguese)
    let actionType = `quote_${event}`
    let changeLines: string[] = []
    let metadata: Record<string, any> = {
        ipAddress,
        userAgent,
        timestamp: new Date().toISOString(),
    }

    switch (event) {
        case "shared":
            changeLines = [`Enviou o orçamento ${quoteNum} para o cliente.`]
            if (quote.customers?.name) {
                changeLines.push(`Destinatário: ${quote.customers.name}`)
            }
            break

        case "viewed":
            changeLines = [`Orçamento ${quoteNum} visualizado pelo cliente.`]
            break

        case "approved":
            changeLines = [`Orçamento ${quoteNum} APROVADO pelo cliente.`]
            if (actorName) changeLines.push(`Aprovador: ${actorName}`)
            if (approvalMethod) changeLines.push(`Método: ${approvalMethod === "code" ? "Código de aprovação" : "Autenticado"}`)
            break

        case "rejected":
            changeLines = [`Orçamento ${quoteNum} REJEITADO pelo cliente.`]
            if (actorName) changeLines.push(`Rejeitado por: ${actorName}`)
            if (rejectionReason) changeLines.push(`Motivo da recusa: ${rejectionReason}`)
            metadata.rejectionReason = rejectionReason
            break

        case "expired":
            changeLines = [`Orçamento ${quoteNum} expirou automaticamente.`]
            break

        case "converted":
            changeLines = [`Orçamento ${quoteNum} convertido em pedido.`]
            if (quote.converted_order_id) {
                changeLines.push(`Pedido ID: ${quote.converted_order_id}`)
            }
            break
    }

    // Write to audit_logs
    await logAuditEvent({
        partnerId,
        actorUserId: actorUserId || null,
        entityType: "quote",
        entityId: quoteId,
        actionType,
        changeLines,
        metadata,
        source: actorUserId ? "manual" : "system",
    })

    // 2. In-app Dudit notifications (no emails)
    try {
        const customerName = quote.customers?.name || "Cliente"

        // Find seller user_id to send notification
        let sellerUserId: string | null = quote.user_id || null
        if (!sellerUserId) {
            const supabase = getAdminClient()
            const { data: partner } = await supabase
                .from("partners")
                .select("user_id")
                .eq("id", partnerId)
                .maybeSingle()
            sellerUserId = partner?.user_id || null
        }

        if (event === "approved" && sellerUserId) {
            await createNotification({
                userId: sellerUserId,
                title: `Orçamento Aprovado! - ${quoteNum}`,
                message: `${actorName || customerName} aprovou o orçamento ${quoteNum}. Total: R$ ${Number(quote.total || 0).toFixed(2).replace(".", ",")}. Acesse para converter em pedido.`,
                type: "admin_announcement",
                entityType: "quote",
                entityId: quoteId,
                data: {
                    audience: "seller",
                    href: `/erp/orcamentos?quote=${quoteId}`,
                    quoteId,
                    quote_number: quoteNum,
                },
                idempotencyKey: `quote-approved-${quoteId}`,
                origin: "system",
            })
        }

        if (event === "rejected" && sellerUserId) {
            await createNotification({
                userId: sellerUserId,
                title: `Orçamento Recusado - ${quoteNum}`,
                message: `${actorName || customerName} recusou o orçamento ${quoteNum}.${rejectionReason ? ` Motivo: ${rejectionReason}` : ""}`,
                type: "admin_announcement",
                entityType: "quote",
                entityId: quoteId,
                data: {
                    audience: "seller",
                    href: `/erp/orcamentos?quote=${quoteId}`,
                    quoteId,
                    quote_number: quoteNum,
                    rejection_reason: rejectionReason || null,
                },
                idempotencyKey: `quote-rejected-${quoteId}`,
                origin: "system",
            })
        }

        if (event === "viewed" && sellerUserId) {
            await createNotification({
                userId: sellerUserId,
                title: `Orçamento Visualizado - ${quoteNum}`,
                message: `${customerName} visualizou o orçamento ${quoteNum}.`,
                type: "admin_announcement",
                entityType: "quote",
                entityId: quoteId,
                data: {
                    audience: "seller",
                    href: `/erp/orcamentos?quote=${quoteId}`,
                    quoteId,
                    quote_number: quoteNum,
                },
                idempotencyKey: `quote-viewed-${quoteId}-${Math.floor(Date.now() / (30 * 60 * 1000))}`,
                origin: "system",
            })
        }

    } catch (notifErr) {
        console.error("[quote-notifications] Failed to send Dudit notification:", notifErr)
    }
}
