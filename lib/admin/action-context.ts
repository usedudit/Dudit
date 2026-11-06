import "server-only"

/**
 * Contexto opcional de uma ação administrativa: motivo, risk score e
 * notificação ao vendedor (via Dudit - notificação in-app + push).
 *
 * Usado pelas actions de catálogo (produto/serviço/plano) e de pedidos.
 * Nunca derruba a action principal: falhas de risk score/notificação são
 * apenas logadas.
 */

import { getAdminClient } from "@/lib/supabase/admin"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"

export type AdminActionContext = {
    /** Motivo/mensagem explicando a ação (enviado ao vendedor quando notifySeller). */
    reason?: string | null
    /** Novo risk score (0-100). Aplicado na loja; sem loja, no parceiro. */
    riskScore?: number | null
    /** Enviar notificação in-app ao time do vendedor (requer reason). */
    notifySeller?: boolean
    /** Rótulos das alterações feitas (ex.: ["nome", "preço"]). */
    changedFields?: string[]
}

type ApplyAdminActionContextParams = {
    adminUserId: string
    partnerId?: string | null
    /** Loja do item. Se null, usa a loja sede do parceiro; sem loja, o parceiro. */
    storeId?: string | null
    targetType: "product" | "service" | "recurring_plan" | "order" | "return_request"
    targetId: string
    /** Título da notificação enviada ao vendedor. */
    actionTitle: string
    /** Rótulo da entidade no corpo da notificação (ex.: "produto", "pedido"). */
    entityLabel: string
    /** Nome da entidade no corpo da notificação. */
    entityName?: string | null
    /** Link de destino da notificação no ERP do vendedor. */
    sellerUrl?: string
    ctx?: AdminActionContext | null
}

export async function applyAdminActionContext(p: ApplyAdminActionContextParams): Promise<void> {
    const ctx = p.ctx
    if (!ctx) return

    const reason = ctx.reason?.trim() || ""
    const riskScore =
        typeof ctx.riskScore === "number" && Number.isFinite(ctx.riskScore)
            ? Math.max(0, Math.min(100, Math.round(ctx.riskScore)))
            : null

    const admin = getAdminClient()

    // ─── 1) Risk score: loja (fallback: parceiro) ────────────────────────────
    if (riskScore !== null) {
        try {
            let storeId = p.storeId || null
            let storeName: string | null = null

            if (storeId) {
                const { data: store } = await admin
                    .from("stores")
                    .select("id, name, risk_score")
                    .eq("id", storeId)
                    .maybeSingle()
                if (store) storeName = store.name || null
            } else if (p.partnerId) {
                const { data: head } = await admin
                    .from("stores")
                    .select("id, name, risk_score")
                    .eq("partner_id", p.partnerId)
                    .order("is_headquarters", { ascending: false })
                    .limit(1)
                    .maybeSingle()
                if (head) {
                    storeId = head.id
                    storeName = head.name || null
                }
            }

            if (storeId) {
                const { data: storeRow } = await admin
                    .from("stores")
                    .select("id, risk_score")
                    .eq("id", storeId)
                    .maybeSingle()
                const previous = storeRow?.risk_score ?? 0
                const { error } = await admin.from("stores").update({ risk_score: riskScore }).eq("id", storeId)
                if (error) throw error
                await adminAuditLog({
                    adminUserId: p.adminUserId,
                    actionType: AdminActionType.MODERATION_RISK_SCORE,
                    targetType: "partner",
                    targetId: p.partnerId || storeId,
                    metadata: {
                        scope: "store",
                        storeId,
                        riskTargetType: p.targetType,
                        riskTargetId: p.targetId,
                        previousValue: previous,
                        newValue: riskScore,
                        reason: reason || null,
                    },
                })
            } else if (p.partnerId) {
                // Risk score é armazenado por loja (stores.risk_score).
                // Sem loja vinculada não há onde persistir o valor.
                console.warn("[ADMIN_ACTION] risk score skipped: partner has no store", { partnerId: p.partnerId })
            }

            // Notificação de risk score entra na mensagem combinada abaixo
            // quando há motivo + notifySeller; caso contrário, aviso específico.
            if ((!ctx.notifySeller || !reason) && p.partnerId) {
                await notifySellerTeam({
                    partnerId: p.partnerId,
                    title: p.actionTitle,
                    message: `${reason || "Score de risco ajustado pela administração."}\nRisk score da ${storeName ? `loja "${storeName}"` : "conta"} ajustado para ${riskScore} pontos.`,
                    sellerUrl: p.sellerUrl,
                    targetId: p.targetId,
                    targetKind: p.targetType,
                    extra: { risk_score: riskScore },
                })
            }
        } catch (e) {
            console.error("[ADMIN_ACTION] risk score failed:", e)
        }
    }

    // ─── 2) Notificação in-app ao vendedor ───────────────────────────────────
    if (p.partnerId && ctx.notifySeller && reason) {
        try {
            const lines: string[] = [reason]
            if (riskScore !== null) lines.push(`Risk score ajustado para ${riskScore} pontos.`)

            await notifySellerTeam({
                partnerId: p.partnerId,
                title: p.actionTitle,
                message: lines.join("\n"),
                sellerUrl: p.sellerUrl,
                targetId: p.targetId,
                targetKind: p.targetType,
                extra: {
                    reason,
                    changed_fields: ctx.changedFields || [],
                    risk_score: riskScore,
                },
            })
        } catch (e) {
            console.error("[ADMIN_ACTION] seller notification failed:", e)
        }
    }
}

async function notifySellerTeam(params: {
    partnerId: string
    title: string
    message: string
    sellerUrl?: string
    targetId: string
    targetKind: string
    extra?: Record<string, unknown>
}): Promise<void> {
    const { createNotificationsForUsers, getPartnerTeamUserIds } = await import(
        "@/lib/services/notification.service"
    )
    const teamUserIds = await getPartnerTeamUserIds(params.partnerId)
    if (!teamUserIds.length) return

    await createNotificationsForUsers(teamUserIds, (uid) => ({
        userId: uid,
        type: "admin_announcement",
        title: params.title,
        message: params.message,
        entityType: "announcement",
        entityId: null,
        data: {
            partner_id: params.partnerId,
            audience: "seller",
            url: params.sellerUrl || "/erp/inicio",
            ...(params.extra || {}),
        },
        idempotencyKey: `admin_action:${params.targetKind}:${params.targetId}:${Date.now()}:${uid}`,
        origin: "system",
    }))
}
