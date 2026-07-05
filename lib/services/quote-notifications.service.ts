import "server-only"

import { logAuditEvent } from "./timeline.service"
import { UnosendService } from "./unosend.service"
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
 * Keeps audit records standardized in Portuguese and initiates emails via Unosend.
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

    // 2. Email Notifications via Unosend (Fire-and-forget, fails silently to prevent breaking primary actions)
    try {
        const supabase = getAdminClient()

        // Fetch seller email
        let sellerEmail: string | null = null
        if (quote.user_id) {
            const { data: profile } = await supabase
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", quote.user_id)
                .maybeSingle()
            try {
                const { data: authData } = await supabase.auth.admin.getUserById(quote.user_id)
                if (authData?.user?.email) {
                    sellerEmail = authData.user.email
                }
            } catch (err) {
                console.error("Error fetching seller email from auth.users:", err)
            }
        }

        const customerEmail = quote.customers?.email || null
        const customerName = quote.customers?.name || "Cliente"

        if (event === "shared" && customerEmail) {
            // Email to customer with approval details
            await UnosendService.sendEmail({
                userId: quote.user_id || undefined,
                to: [{ email: customerEmail, name: customerName }],
                subject: `Orçamento Disponível - ${quoteNum}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #113833;">
                        <h2>Seu orçamento ${quoteNum} está pronto!</h2>
                        <p>Olá, ${customerName}.</p>
                        <p>A proposta comercial já está disponível para sua análise e aprovação online.</p>
                        <div style="margin: 24px 0;">
                            <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/quote/${quote.public_token}" 
                               style="background-color: #113833; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                                Visualizar e Responder
                            </a>
                        </div>
                        <p>Se você optar por aprovar como visitante, use o código de aprovação a seguir quando solicitado:</p>
                        <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #10b981; margin: 12px 0;">
                            ${quote.metadata?.plain_code || "Código enviado pelo vendedor"}
                        </p>
                        <p>Válido até: ${quote.expiration_date ? new Date(quote.expiration_date).toLocaleDateString("pt-BR") : "Não expira"}</p>
                        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
                        <small style="color: #6b7280;">Dudit ERP - Soluções Comerciais Inteligentes</small>
                    </div>
                `,
                text: `Olá ${customerName}. Seu orçamento ${quoteNum} está disponível. Acesse o link para aprovar: ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/quote/${quote.public_token}`,
            })
        }

        if (event === "approved" && sellerEmail) {
            // Email to seller notifying approval
            await UnosendService.sendEmail({
                userId: quote.user_id || undefined,
                to: [{ email: sellerEmail }],
                subject: `Orçamento Aprovado! - ${quoteNum}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #113833;">
                        <h2>Ótima notícia! O orçamento ${quoteNum} foi aprovado.</h2>
                        <p>O cliente <strong>${actorName || customerName}</strong> aprovou o orçamento hoje às ${new Date().toLocaleTimeString("pt-BR")}.</p>
                        <p><strong>Total:</strong> R$ ${quote.total}</p>
                        <p>O orçamento está pronto para ser convertido em pedido no ERP.</p>
                        <div style="margin: 24px 0;">
                            <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/erp/quotes" 
                               style="background-color: #113833; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                                Abrir no ERP
                            </a>
                        </div>
                    </div>
                `,
                text: `O orçamento ${quoteNum} foi aprovado pelo cliente. Total: R$ ${quote.total}`,
            })
        }

        if (event === "rejected" && sellerEmail) {
            // Email to seller notifying rejection
            await UnosendService.sendEmail({
                userId: quote.user_id || undefined,
                to: [{ email: sellerEmail }],
                subject: `Orçamento Recusado - ${quoteNum}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #113833;">
                        <h2>O orçamento ${quoteNum} foi recusado pelo cliente.</h2>
                        <p>O cliente <strong>${actorName || customerName}</strong> indicou que não aceitará a proposta comercial.</p>
                        <p><strong>Motivo informado:</strong></p>
                        <blockquote style="background-color: #f3f4f6; border-left: 4px solid #ef4444; padding: 12px; margin: 12px 0; font-style: italic;">
                            ${rejectionReason || "Nenhum motivo fornecido."}
                        </blockquote>
                        <p>Você pode acessar a timeline de negociações no ERP para revisar as mensagens.</p>
                        <div style="margin: 24px 0;">
                            <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/erp/quotes" 
                               style="background-color: #113833; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                                Ver no ERP
                            </a>
                        </div>
                    </div>
                `,
                text: `O orçamento ${quoteNum} foi recusado pelo cliente. Motivo: ${rejectionReason}`,
            })
        }

    } catch (emailErr) {
        console.error("[quote-notifications] Failed to send email via Unosend:", emailErr)
    }
}
