"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { getPartnerPlan, checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { ensureMarketplaceCustomer } from "@/lib/services/marketplace-customer"
import { createNotification } from "@/lib/services/notification.service"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { revalidateQuotes } from "@/lib/utils/revalidation"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { withTelemetry } from "@/lib/utils/action-logger"
import { sanitizeNotes, sanitizeInput } from "@/lib/input-validator"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"

export interface RequestMarketplaceQuoteInput {
    serviceId: string
    partnerId: string
    storeId?: string | null
    description: string
    preferredDate?: string | null
    phone: string
    serviceLocation?: string | null
    additionalNotes?: string | null
}

export async function requestMarketplaceQuoteAction(input: RequestMarketplaceQuoteInput) {
    return withTelemetry("requestMarketplaceQuoteAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const user = await getCurrentUser()
            if (!user) {
                return errorResponse("Você precisa estar conectado para solicitar um orçamento.")
            }

            const description = sanitizeNotes(input.description)?.trim()
            if (!description || description.length < 5) {
                return errorResponse("Por favor, descreva com mais detalhes o que você precisa (mínimo 5 caracteres).")
            }

            const phone = sanitizeInput(input.phone)?.trim()
            if (!phone || phone.replace(/\D/g, "").length < 10) {
                return errorResponse("Por favor, informe um telefone de contato válido com DDD.")
            }

            const adminClient = getAdminClient()

            // 1. Fetch service and partner info
            const { data: service, error: serviceError } = await adminClient
                .from("services")
                .select("id, name, price, price_type, partner_id, store_id, partners(id, user_id, erp_disabled, is_active)")
                .eq("id", input.serviceId)
                .single()

            if (serviceError || !service) {
                return errorResponse("Serviço não encontrado.")
            }

            const partner = Array.isArray(service.partners) ? service.partners[0] : service.partners
            if (!partner || !partner.is_active || partner.erp_disabled) {
                return errorResponse("Este prestador não está disponível no momento.")
            }

            const partnerId = partner.id
            const partnerUserId = partner.user_id

            // 2. Check partner plan: must be 'crescer' or 'escalar'
            const partnerPlan = await getPartnerPlan(partnerId)
            if (!hasMinimumPlan(partnerPlan.slug, "crescer")) {
                return errorResponse("Este prestador recebe solicitações de orçamento apenas via WhatsApp.")
            }

            // 3. Check monthly quotes limit
            const limitCheck = await checkLimit(partnerId, "monthly_quotes")
            if (!limitCheck.allowed) {
                return errorResponse("O prestador atingiu o limite de orçamentos para este mês. Entre em contato via WhatsApp.", { whatsappFallback: true })
            }

            // 4. Fetch buyer profile for customer sync
            const { data: buyerProfile } = await adminClient
                .from("user_profiles")
                .select("full_name, phone, avatar_url")
                .eq("user_id", user.id)
                .maybeSingle()

            const buyerName = buyerProfile?.full_name || user.email?.split("@")[0] || "Cliente Dudit"

            // 5. Ensure customer record for this partner
            const customerId = await ensureMarketplaceCustomer({
                partnerId,
                name: buyerName,
                email: user.email,
                phone: phone || buyerProfile?.phone || null,
                userId: user.id,
            })

            if (!customerId) {
                return errorResponse("Não foi possível registrar os dados do cliente.")
            }

            // 6. Build structured notes and metadata
            const formattedNotes = [
                `📋 Solicitação de Orçamento - Vitrine Digital`,
                `\nDetalhes do pedido:\n${description}`,
                input.preferredDate ? `\nPrazo / Data desejada: ${input.preferredDate}` : null,
                input.serviceLocation ? `\nLocal de realização: ${input.serviceLocation}` : null,
                `\nContato do Cliente: ${phone}`,
                input.additionalNotes ? `\nObservações: ${input.additionalNotes}` : null,
            ].filter(Boolean).join("\n")

            const metadata = {
                origin: "marketplace",
                marketplace_user_id: user.id,
                service_id: service.id,
                service_name: service.name,
                client_description: description,
                client_phone: phone,
                preferred_date: input.preferredDate || null,
                service_location: input.serviceLocation || null,
                requested_at: new Date().toISOString(),
            }

            // 7. Initial items
            const itemsJson = [
                {
                    product_id: null,
                    custom_name: service.name,
                    description: description.substring(0, 500),
                    quantity: 1,
                    unit_price: Number(service.price) || 0,
                    sort_order: 0,
                },
            ]

            // 8. Create Quote using RPC
            const today = new Date().toISOString().split("T")[0]
            const defaultExpirationDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

            const { data: quoteResult, error: rpcError } = await adminClient.rpc("create_quote_with_items", {
                p_partner_id: partnerId,
                p_user_id: partnerUserId,
                p_customer_id: customerId,
                p_status: "draft",
                p_issue_date: today,
                p_expiration_date: defaultExpirationDate,
                p_notes: sanitizeNotes(formattedNotes),
                p_internal_notes: `Solicitação criada diretamente pela Vitrine Digital pelo cliente ${buyerName}.`,
                p_discount_type: "fixed",
                p_discount_value: 0,
                p_shipping_cost: 0,
                p_additional_costs: 0,
                p_items: itemsJson,
            })

            if (rpcError || !quoteResult?.id) {
                console.error("[requestMarketplaceQuoteAction] RPC Error:", rpcError)
                return errorResponse("Não foi possível criar a solicitação de orçamento. Tente novamente.")
            }

            const quoteId = quoteResult.id

            // 9. Update metadata and store_id
            await adminClient
                .from("quotes")
                .update({
                    metadata: metadata as any,
                    store_id: input.storeId || service.store_id || null,
                })
                .eq("id", quoteId)

            // 10. Increment usage and revalidate
            await increment_usage_counter(partnerId, "quotes_month_count")
            await revalidateQuotes(partnerId, quoteId)

            // 11. Timeline audit event
            await logAuditEvent({
                partnerId,
                actorUserId: user.id,
                entityType: "quote",
                entityId: quoteId,
                actionType: "created",
                changeLines: [`Cliente ${buyerName} solicitou orçamento para "${service.name}" via Vitrine Digital.`],
                metadata: {
                    origin: "marketplace",
                    serviceId: service.id,
                    serviceName: service.name,
                },
                source: "marketplace",
            })

            // 12. Send in-app notification to the Seller / Partner owner
            if (partnerUserId) {
                await createNotification({
                    userId: partnerUserId,
                    type: "admin_announcement",
                    title: "Novo Orçamento Solicitado",
                    message: `${buyerName} solicitou um orçamento para o serviço "${service.name}". Acesse Orçamentos para preencher a proposta.`,
                    entityType: "quote",
                    entityId: quoteId,
                    data: {
                        href: `/erp/orcamentos?view=${quoteId}`,
                        quoteId,
                        serviceId: service.id,
                        serviceName: service.name,
                        audience: "seller",
                    },
                    idempotencyKey: `quote-req-seller-${quoteId}`,
                    origin: "system",
                })
            }

            return successResponse({
                quoteId,
                quoteNumber: quoteResult.quote_number,
                message: "Sua solicitação de orçamento foi enviada com sucesso! O prestador entrará em contato em breve com a proposta.",
            })
        } catch (err: any) {
            console.error("[requestMarketplaceQuoteAction] Error:", err)
            return errorResponse(err?.message || "Erro inesperado ao solicitar orçamento.")
        }
    })
}
