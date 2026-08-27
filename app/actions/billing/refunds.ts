"use server"

import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/authorization"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { getMpPlatformAccessToken, cancelMpSubscription } from "@/lib/services/mercadopago/subscriptions"
import { logBillingAudit } from "@/lib/billing/audit"
import { notifyPartnerTeam } from "@/lib/billing/notifications"

// ─── SCHEMAS ─────────────────────────────────────────────────────────────────

const requestRefundSchema = z.object({
    partnerId: z.string().uuid(),
    purchaseId: z.string().uuid(),
    reasonCategory: z.enum([
        "repentance_7_days",
        "double_charge",
        "technical_issue",
        "commercial_agreement",
        "unsatisfied",
        "other",
    ]),
    reasonDescription: z.string().trim().min(10, "Por favor, explique o motivo do reembolso com pelo menos 10 caracteres."),
    images: z.array(z.string().url()).max(5, "Máximo de 5 imagens permitido.").default([]),
    documents: z.array(z.string().url()).max(3, "Máximo de 3 documentos PDF permitido.").default([]),
})

const adminProcessRefundSchema = z.object({
    refundRequestId: z.string().uuid(),
    refundConfirmation: z.string().refine((v) => v === "ESTORNAR", {
        message: "Digite exatamente ESTORNAR para confirmar",
    }),
    refundPassword: z.string().min(1, "A senha de administrador é obrigatória para processar o estorno financeiro."),
    adminResponse: z.string().trim().optional().nullable(),
    adminEvidence: z.array(z.string().url()).max(5).optional().default([]),
    refundAmount: z.number().positive().optional().nullable(),
    idempotencyKey: z.string().trim().optional().nullable(),
})

const adminRejectRefundSchema = z.object({
    refundRequestId: z.string().uuid(),
    adminResponse: z.string().trim().min(5, "Informe uma justificativa de recusa para o lojista."),
    adminEvidence: z.array(z.string().url()).max(5).optional().default([]),
})

// ─── 1. SOLICITAR REEMBOLSO (LOJISTA) ─────────────────────────────────────────

export async function requestSubscriptionRefundAction(input: z.input<typeof requestRefundSchema>) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: "Não autenticado." }
        }

        const data = requestRefundSchema.parse(input)
        const supabase = createAdminClient()

        // 1. Verificar se o usuário tem acesso ao parceiro
        const { data: partnerUser } = await supabase
            .from("partner_users")
            .select("partner_id")
            .eq("partner_id", data.partnerId)
            .eq("user_id", user.id)
            .maybeSingle()

        const { data: partnerOwner } = await supabase
            .from("partners")
            .select("id, user_id")
            .eq("id", data.partnerId)
            .eq("user_id", user.id)
            .maybeSingle()

        if (!partnerUser && !partnerOwner) {
            return { error: "Acesso não autorizado para esta empresa." }
        }

        // 2. Buscar a compra (purchase) e verificar elegibilidade
        const { data: purchase, error: purchaseErr } = await supabase
            .from("billing_purchases")
            .select(`
                id, partner_id, user_id, purchase_type, purchaseable_type, purchaseable_id,
                amount, total_amount, currency, status, gateway, gateway_payment_id,
                subscription_id, created_at,
                payments:billing_payments(id, status, gateway_payment_id, paid_at, amount)
            `)
            .eq("id", data.purchaseId)
            .eq("partner_id", data.partnerId)
            .single()

        if (purchaseErr || !purchase) {
            return { error: "Fatura/Compra não encontrada." }
        }

        if (purchase.status !== "completed") {
            return { error: "Apenas faturas pagas e concluídas podem receber solicitação de reembolso." }
        }

        const purchaseAmount = Number(purchase.total_amount || purchase.amount || 0)
        if (purchaseAmount <= 0) {
            return { error: "Não é possível solicitar reembolso de assinaturas ou faturas gratuitas." }
        }

        // 3. Verificar se já existe solicitação aberta para esta compra ou parceiro
        const { data: existingRequest } = await supabase
            .from("billing_refund_requests")
            .select("id, status, token")
            .eq("purchase_id", data.purchaseId)
            .in("status", ["pending", "under_review", "approved"])
            .maybeSingle()

        if (existingRequest) {
            return {
                error: "Já existe uma solicitação de reembolso em andamento ou aprovada para esta fatura.",
                token: existingRequest.token,
            }
        }

        // 4. Calcular se está dentro do prazo legal dos 7 dias do CDC
        const createdAtTime = new Date(purchase.created_at).getTime()
        const nowTime = Date.now()
        const daysElapsed = (nowTime - createdAtTime) / (1000 * 60 * 60 * 24)
        const isWithin7Days = daysElapsed <= 7.05 // margem técnica de tolerância

        // 5. Obter o pagamento vinculado mais recente
        const paymentsList = (purchase.payments || []) as any[]
        const approvedPayment = paymentsList.find((p) => p.status === "approved") || paymentsList[0]

        // 6. Inserir a solicitação
        const { data: newRefund, error: insertErr } = await supabase
            .from("billing_refund_requests")
            .insert({
                partner_id: data.partnerId,
                user_id: user.id,
                subscription_id: purchase.subscription_id || null,
                purchase_id: data.purchaseId,
                payment_id: approvedPayment?.id || null,
                amount: purchaseAmount,
                reason_category: data.reasonCategory,
                reason_description: data.reasonDescription,
                images: data.images,
                documents: data.documents,
                is_within_7_days: isWithin7Days,
                status: "pending",
            })
            .select("id, token, requested_at")
            .single()

        if (insertErr || !newRefund) {
            console.error("[requestSubscriptionRefundAction] Insert error:", insertErr)
            return { error: "Erro ao registrar solicitação de reembolso." }
        }

        // 7. Auditoria e Notificação
        await logBillingAudit("billing.purchase.created", data.partnerId, {
            refund_request_id: newRefund.id,
            purchase_id: data.purchaseId,
            reason_category: data.reasonCategory,
            is_within_7_days: isWithin7Days,
            token: newRefund.token,
        }, user.id)

        await notifyPartnerTeam(
            "billing.refund_requested",
            data.partnerId,
            {
                message: `Solicitação de reembolso enviada para a fatura de R$ ${purchase.total_amount}. Acompanhe pelo portal.`,
                purchaseId: data.purchaseId,
                refundRequestId: newRefund.id,
                token: newRefund.token,
            }
        )

        return {
            success: true,
            token: newRefund.token,
            refundRequestId: newRefund.id,
            isWithin7Days,
        }
    } catch (error: any) {
        console.error("[requestSubscriptionRefundAction] Unexpected error:", error)
        return { error: error?.message || "Erro inesperado ao solicitar reembolso." }
    }
}

// ─── 1.1 BUSCAR REEMBOLSO ATIVO (PARCEIRO / ASSINATURA) ──────────────────────

export async function getActiveRefundForPartnerAction(partnerId: string, subscriptionId?: string) {
    try {
        const user = await getCurrentUser()
        if (!user) return { success: false, error: "Não autenticado." }

        const supabase = createAdminClient()

        let query = supabase
            .from("billing_refund_requests")
            .select(`
                id, token, status, amount, refunded_amount, reason_category,
                reason_description, requested_at, created_at, grace_period_ends_at,
                is_within_7_days, purchase_id, subscription_id
            `)
            .eq("partner_id", partnerId)
            .in("status", ["pending", "under_review", "approved"])
            .order("created_at", { ascending: false })
            .limit(1)

        if (subscriptionId) {
            query = query.eq("subscription_id", subscriptionId)
        }

        const { data, error } = await query.maybeSingle()
        if (error) {
            console.error("[getActiveRefundForPartnerAction] Error:", error)
            return { success: false, error: error.message }
        }

        return { success: true, data: data || null }
    } catch (err: any) {
        console.error("[getActiveRefundForPartnerAction] Unexpected error:", err)
        return { success: false, error: err.message }
    }
}

// ─── 2. DETALHES PÚBLICOS DO REEMBOLSO (PORTAL COM PREVIEW) ───────────────────

export async function getPublicRefundDetailsAction(token: string) {
    try {
        if (!token || typeof token !== "string" || token.length < 10) {
            return { error: "Token inválido." }
        }

        const supabase = createAdminClient()

        const { data: refund, error: refundErr } = await supabase
            .from("billing_refund_requests")
            .select(`
                id, token, status, amount, refunded_amount, reason_category, reason_description,
                images, documents, admin_response, admin_evidence, is_within_7_days,
                grace_period_ends_at, requested_at, processed_at, created_at, updated_at,
                partner:partner_id (
                    id,
                    stores (id, name, logo_url, phone, cnpj, cpf, is_headquarters)
                ),
                purchase:purchase_id (
                    id, amount, total_amount, currency, status, purchase_type, description,
                    billing_period_start, billing_period_end, created_at, purchaseable_type, purchaseable_id
                ),
                subscription:subscription_id (
                    id, status, current_period_start, current_period_end, trial_end, cancel_at_period_end
                ),
                payment:payment_id (
                    id, gateway, status, paid_at, amount
                )
            `)
            .eq("token", token)
            .single()

        if (refundErr || !refund) {
            return { error: "Solicitação de reembolso não encontrada." }
        }

        // Carregar plano se purchaseable_id existir
        let plan = null
        if (refund.purchase?.purchaseable_id) {
            const { data: planData } = await supabase
                .from("billing_plans")
                .select("id, name, slug, price, features")
                .eq("id", refund.purchase.purchaseable_id)
                .maybeSingle()
            plan = planData
        }

        // Sanitizar dados da loja matriz
        const stores = (refund.partner as any)?.stores || []
        const hqStore = stores.find((s: any) => s.is_headquarters) || stores[0] || {}

        return {
            success: true,
            refund: {
                ...refund,
                purchase: refund.purchase ? {
                    ...refund.purchase,
                    plan,
                } : null,
                partnerName: hqStore.name || "Minha Empresa",
                partnerLogo: hqStore.logo_url || null,
                partnerDocument: hqStore.cnpj || hqStore.cpf || "",
                partnerPhone: hqStore.phone || "",
            },
        }
    } catch (error: any) {
        console.error("[getPublicRefundDetailsAction] Error:", error)
        return { error: error?.message || "Erro ao carregar detalhes do reembolso." }
    }
}

// ─── 3. LISTAGEM ADMINISTRATIVA DE REEMBOLSOS ──────────────────────────────────

export async function adminListRefundRequestsAction(params?: {
    status?: string
    search?: string
    page?: number
    limit?: number
}) {
    try {
        await requireAdmin("moderator")
        const supabase = createAdminClient()

        const page = params?.page || 1
        const limit = params?.limit || 20
        const from = (page - 1) * limit
        const to = from + limit - 1

        let query = supabase
            .from("billing_refund_requests")
            .select(`
                id, token, status, amount, refunded_amount, reason_category, reason_description,
                images, documents, admin_response, is_within_7_days, requested_at, processed_at,
                grace_period_ends_at, created_at,
                partner:partner_id (
                    id,
                    stores (id, name, logo_url, is_headquarters)
                ),
                purchase:purchase_id (
                    id, amount, total_amount, description, status, gateway_payment_id,
                    purchase_type, purchaseable_type, purchaseable_id
                ),
                subscription:subscription_id (
                    id, status, mercado_pago_subscription_id
                ),
                payment:payment_id (
                    id, status, gateway, gateway_payment_id, paid_at
                )
            `, { count: "exact" })

        if (params?.status && params.status !== "all") {
            query = query.eq("status", params.status)
        }

        query = query.order("created_at", { ascending: false }).range(from, to)

        const { data, count, error } = await query

        if (error) {
            console.error("[adminListRefundRequestsAction] Error:", error)
            return { error: error.message }
        }

        // Carregar planos para todas as compras listadas
        const planIds = Array.from(
            new Set((data || []).map((r: any) => r.purchase?.purchaseable_id).filter(Boolean))
        )
        const { data: plansData } = planIds.length
            ? await supabase.from("billing_plans").select("id, name, slug, price").in("id", planIds)
            : { data: [] }
        const planMap = new Map((plansData || []).map((p: any) => [p.id, p]))

        const enrichedData = (data || []).map((r: any) => ({
            ...r,
            purchase: r.purchase ? {
                ...r.purchase,
                plan: r.purchase.purchaseable_id ? planMap.get(r.purchase.purchaseable_id) || null : null,
            } : null,
        }))

        // Estatísticas rápidas
        const { data: statsData } = await supabase
            .from("billing_refund_requests")
            .select("status, is_within_7_days")

        const stats = {
            total: statsData?.length || 0,
            pending: statsData?.filter((s: any) => s.status === "pending" || s.status === "under_review").length || 0,
            approved: statsData?.filter((s: any) => s.status === "approved").length || 0,
            rejected: statsData?.filter((s: any) => s.status === "rejected").length || 0,
            within7Days: statsData?.filter((s: any) => s.is_within_7_days).length || 0,
        }

        return {
            success: true,
            data: enrichedData,
            totalCount: count || 0,
            page,
            limit,
            stats,
        }
    } catch (error: any) {
        console.error("[adminListRefundRequestsAction] Error:", error)
        return { error: error?.message || "Erro ao listar solicitações de reembolso." }
    }
}

// ─── 4. PROCESSAR ESTORNO VIA ADMIN (STEP-UP AUTH & MERCADO PAGO) ─────────────

export async function adminProcessRefundAction(input: z.input<typeof adminProcessRefundSchema>) {
    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    try {
        // 1. Permissão Admin
        await requireAdmin("admin")
        const adminUser = await getCurrentUser()
        if (!adminUser) return { error: "Admin não autenticado." }

        const data = adminProcessRefundSchema.parse(input)

        // 2. Step-Up Authentication: Validação de Senha do Administrador
        let adminEmail = adminUser.email
        if (!adminEmail) {
            const { data: authUser } = await supabase.auth.admin.getUserById(adminUser.id)
            adminEmail = authUser?.user?.email
        }
        if (!adminEmail) {
            return { error: "Email do administrador não identificado." }
        }

        const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: adminEmail,
            password: data.refundPassword,
        })

        if (signInErr) {
            return { error: "Senha de administrador incorreta. Ação não autorizada." }
        }

        // 3. Buscar a solicitação de reembolso com dados do pagamento Mercado Pago
        const { data: refundReq, error: reqErr } = await supabase
            .from("billing_refund_requests")
            .select(`
                id, partner_id, user_id, subscription_id, purchase_id, payment_id,
                amount, status, token,
                purchase:purchase_id (
                    id, partner_id, user_id, amount, total_amount, gateway, gateway_payment_id,
                    subscription_id
                ),
                payment:payment_id (
                    id, gateway, gateway_payment_id, amount, status
                ),
                subscription:subscription_id (
                    id, partner_id, mercado_pago_subscription_id, status
                )
            `)
            .eq("id", data.refundRequestId)
            .single()

        if (reqErr || !refundReq) {
            return { error: "Solicitação de reembolso não encontrada." }
        }

        if (refundReq.status === "approved") {
            return { error: "Esta solicitação já foi aprovada e estornada anteriormente." }
        }

        // 4. Bloqueio de concorrência
        const { data: locked, error: lockErr } = await supabase
            .from("billing_refund_requests")
            .update({ status: "under_review", updated_at: nowIso })
            .eq("id", data.refundRequestId)
            .in("status", ["pending", "under_review"])
            .select("id")
            .maybeSingle()

        if (lockErr || !locked) {
            return { error: "A solicitação já está sendo processada por outro administrador." }
        }

        const purchase = refundReq.purchase as any
        const payment = refundReq.payment as any
        const subscription = refundReq.subscription as any

        // 5. Identificar o ID de pagamento no Mercado Pago
        const mpPaymentId = payment?.gateway_payment_id || purchase?.gateway_payment_id
        const targetAmount = data.refundAmount ? Number(data.refundAmount) : Number(refundReq.amount)

        let mpRefundId: string | null = null

        // 6. Chamar a API do Mercado Pago para efetuar o estorno financeiro
        if (mpPaymentId) {
            try {
                const accessToken = await getMpPlatformAccessToken()
                const mpRefundRes = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}/refunds`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                        "X-Idempotency-Key": data.idempotencyKey || `admin-refund-${refundReq.id}-${Date.now()}`,
                    },
                    body: JSON.stringify(targetAmount ? { amount: targetAmount } : {}),
                })

                if (!mpRefundRes.ok) {
                    const errJson = await mpRefundRes.json().catch(() => ({}))
                    console.error("[adminProcessRefundAction] MP Refund API Error:", errJson)
                    // Se falhou no MP, reverte status para pending
                    await supabase
                        .from("billing_refund_requests")
                        .update({ status: "pending", updated_at: nowIso })
                        .eq("id", data.refundRequestId)

                    return { error: `Erro no Mercado Pago: ${errJson.message || "Não foi possível estornar o pagamento"}` }
                }

                const mpRefundData = await mpRefundRes.json()
                mpRefundId = String(mpRefundData.id || "")
            } catch (mpErr: any) {
                console.error("[adminProcessRefundAction] Fetch MP Error:", mpErr)
                await supabase
                    .from("billing_refund_requests")
                    .update({ status: "pending", updated_at: nowIso })
                    .eq("id", data.refundRequestId)

                return { error: `Falha de comunicação com Mercado Pago: ${mpErr.message}` }
            }
        }

        // 7. Cancelar recorrência no Mercado Pago se houver preapproval
        const mpSubId = subscription?.mercado_pago_subscription_id
        if (mpSubId) {
            try {
                await cancelMpSubscription(mpSubId, "Reembolso aprovado pela administração")
            } catch (cancelErr: any) {
                console.warn("[adminProcessRefundAction] Cancel Preapproval Warning:", cancelErr.message)
            }
        }

        // 8. Calcular carência de 24 horas para o lojista
        const gracePeriodDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
        const gracePeriodIso = gracePeriodDate.toISOString()

        // 9. Atualizar tabelas no banco de dados
        // a) Pagamento
        if (payment?.id) {
            await supabase
                .from("billing_payments")
                .update({
                    status: "refunded",
                    updated_at: nowIso,
                })
                .eq("id", payment.id)
        }

        // b) Compra
        if (purchase?.id) {
            await supabase
                .from("billing_purchases")
                .update({
                    status: "refunded",
                    updated_at: nowIso,
                })
                .eq("id", purchase.id)
        }

        // c) Assinatura: cancela e ajusta término para a carência de 24h
        if (subscription?.id) {
            await supabase
                .from("subscriptions")
                .update({
                    status: "cancelled",
                    cancelled_at: nowIso,
                    ended_at: gracePeriodIso,
                    current_period_end: gracePeriodIso,
                    updated_at: nowIso,
                })
                .eq("id", subscription.id)
        }

        // d) Solicitação de reembolso
        await supabase
            .from("billing_refund_requests")
            .update({
                status: "approved",
                refunded_amount: targetAmount,
                mp_refund_id: mpRefundId,
                admin_response: data.adminResponse || "Reembolso aprovado e estorno processado.",
                admin_evidence: data.adminEvidence || [],
                admin_id: adminUser.id,
                processed_at: nowIso,
                grace_period_ends_at: gracePeriodIso,
                updated_at: nowIso,
            })
            .eq("id", data.refundRequestId)

        // 10. Invalidar cache de planos
        try {
            const { invalidatePartnerPlanCache } = await import("@/lib/services/subscription.service")
            invalidatePartnerPlanCache(refundReq.partner_id)
        } catch {}

        // 11. Auditoria
        await logBillingAudit("billing.purchase.refunded", refundReq.partner_id, {
            refund_request_id: refundReq.id,
            purchase_id: refundReq.purchase_id,
            refunded_amount: targetAmount,
            mp_refund_id: mpRefundId,
            admin_id: adminUser.id,
            grace_period_ends_at: gracePeriodIso,
        }, adminUser.id)

        // 12. Notificação ao Lojista
        await notifyPartnerTeam(
            "billing.refund_approved",
            refundReq.partner_id,
            {
                message: `Reembolso de R$ ${targetAmount.toFixed(2)} aprovado e estornado. Carência de 24h ativada antes da migração para o plano Gratuito.`,
                purchaseId: refundReq.purchase_id,
                refundRequestId: refundReq.id,
                token: refundReq.token,
            }
        )

        return {
            success: true,
            mpRefundId,
            gracePeriodEndsAt: gracePeriodIso,
        }
    } catch (error: any) {
        console.error("[adminProcessRefundAction] Unexpected error:", error)
        return { error: error?.message || "Erro inesperado ao processar estorno." }
    }
}

// ─── 5. RECUSAR REEMBOLSO VIA ADMIN ───────────────────────────────────────────

export async function adminRejectRefundAction(input: z.input<typeof adminRejectRefundSchema>) {
    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    try {
        await requireAdmin("moderator")
        const adminUser = await getCurrentUser()
        if (!adminUser) return { error: "Admin não autenticado." }

        const data = adminRejectRefundSchema.parse(input)

        const { data: refundReq, error: reqErr } = await supabase
            .from("billing_refund_requests")
            .select("id, partner_id, token, purchase_id")
            .eq("id", data.refundRequestId)
            .single()

        if (reqErr || !refundReq) {
            return { error: "Solicitação de reembolso não encontrada." }
        }

        const { error: updateErr } = await supabase
            .from("billing_refund_requests")
            .update({
                status: "rejected",
                admin_response: data.adminResponse,
                admin_evidence: data.adminEvidence || [],
                admin_id: adminUser.id,
                processed_at: nowIso,
                updated_at: nowIso,
            })
            .eq("id", data.refundRequestId)

        if (updateErr) {
            return { error: "Erro ao atualizar solicitação." }
        }

        // Auditoria
        await logBillingAudit("billing.purchase.failed", refundReq.partner_id, {
            refund_request_id: refundReq.id,
            purchase_id: refundReq.purchase_id,
            status: "rejected",
            admin_response: data.adminResponse,
            admin_id: adminUser.id,
        }, adminUser.id)

        // Notificação
        await notifyPartnerTeam(
            "billing.refund_rejected",
            refundReq.partner_id,
            {
                message: `Solicitação de reembolso recusada. Motivo: ${data.adminResponse}`,
                purchaseId: refundReq.purchase_id,
                refundRequestId: refundReq.id,
                token: refundReq.token,
            }
        )

        return { success: true }
    } catch (error: any) {
        console.error("[adminRejectRefundAction] Error:", error)
        return { error: error?.message || "Erro ao recusar reembolso." }
    }
}
