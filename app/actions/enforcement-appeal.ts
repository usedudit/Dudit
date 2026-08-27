"use server"

import { getCurrentUser } from "@/lib/auth/authorization"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { SMTP2GOService } from "@/lib/services/smtp2go.service"
import { SMTP2GO_TEMPLATE_IDS } from "@/lib/services/smtp2go-templates"
import { getEnforcementAppealEmailHtml } from "@/lib/services/email-templates/enforcement-appeal.template"
import { SecureLogger } from "@/lib/secure-logger"

export interface SubmitEnforcementAppealParams {
    caseId: string
    entityType: "store" | "partner" | "erp" | "user"
    entityId: string
    entityName: string
    reason?: string | null
    appealStatement: string
    contactName?: string
    contactEmail: string
    contactPhone?: string
}

export interface SubmitAppealResult {
    success: boolean
    error?: string
    alreadySubmitted?: boolean
    appealId?: string
    caseId?: string
}

export interface CheckAppealStatusResult {
    hasPendingAppeal: boolean
    appeal: {
        id: string
        caseId: string
        status: "pending" | "under_review" | "approved" | "rejected"
        createdAt: string
        appealStatement: string
    } | null
}

/**
 * Checks if there is already a pending or under_review appeal for this entity.
 */
export async function checkAppealStatusAction(
    entityId: string,
    caseId?: string
): Promise<CheckAppealStatusResult> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { hasPendingAppeal: false, appeal: null }
        }

        const supabase = await getSupabaseServerClient()

        let query = supabase
            .from("enforcement_appeals")
            .select("id, case_id, status, created_at, appeal_statement")
            .eq("user_id", user.id)
            .in("status", ["pending", "under_review"])

        if (entityId) {
            query = query.eq("entity_id", entityId)
        } else if (caseId) {
            query = query.eq("case_id", caseId)
        }

        const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle()

        if (error || !data) {
            return { hasPendingAppeal: false, appeal: null }
        }

        return {
            hasPendingAppeal: true,
            appeal: {
                id: data.id,
                caseId: data.case_id,
                status: data.status,
                createdAt: data.created_at,
                appealStatement: data.appeal_statement,
            },
        }
    } catch (err) {
        console.error("[CHECK_APPEAL_STATUS_ERROR]", err)
        return { hasPendingAppeal: false, appeal: null }
    }
}

/**
 * Submits a new appeal with anti-spam check and SMTP2GO notification dispatch.
 */
export async function submitEnforcementAppealAction(
    params: SubmitEnforcementAppealParams
): Promise<SubmitAppealResult> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { success: false, error: "Você precisa estar autenticado para enviar um recurso." }
        }

        const {
            caseId,
            entityType,
            entityId,
            entityName,
            reason,
            appealStatement,
            contactName,
            contactEmail,
            contactPhone,
        } = params

        // Basic validations
        if (!caseId || !entityId || !entityName) {
            return { success: false, error: "Identificadores do caso incompletos." }
        }

        const trimmedStatement = (appealStatement || "").trim()
        if (trimmedStatement.length < 15) {
            return { success: false, error: "Por favor, elabore sua justificativa com no mínimo 15 caracteres." }
        }

        const validEmail = (contactEmail || user.email || "").trim()
        if (!validEmail || !validEmail.includes("@")) {
            return { success: false, error: "E-mail de contato inválido." }
        }

        const admin = getAdminClient()

        // 1. Ownership validation: apenas o titular/dono pode recorrer
        if (entityType === "user") {
            if (entityId !== user.id) {
                return { success: false, error: "Apenas o titular da conta de usuário pode submeter um recurso." }
            }
        } else if (entityType === "store") {
            const { data: storeData } = await admin
                .from("stores")
                .select("id, partner_id, partners(id, user_id)")
                .eq("id", entityId)
                .single()

            const partnerOwnerId = (storeData?.partners as any)?.user_id
            if (!partnerOwnerId || partnerOwnerId !== user.id) {
                return { success: false, error: "Apenas o proprietário titular do parceiro/loja pode submeter um recurso." }
            }
        } else if (entityType === "partner" || entityType === "erp") {
            const { data: partnerData } = await admin
                .from("partners")
                .select("id, user_id")
                .eq("id", entityId)
                .single()

            if (!partnerData || partnerData.user_id !== user.id) {
                return { success: false, error: "Apenas o proprietário titular do parceiro pode submeter um recurso." }
            }
        }

        const supabase = await getSupabaseServerClient()

        // 2. Anti-Spam Check: Verify if an appeal is already pending for this entity
        const { data: existingAppeals, error: checkError } = await supabase
            .from("enforcement_appeals")
            .select("id, status, created_at")
            .eq("entity_id", entityId)
            .in("status", ["pending", "under_review"])
            .limit(1)

        if (!checkError && existingAppeals && existingAppeals.length > 0) {
            return {
                success: false,
                alreadySubmitted: true,
                error: "Já existe uma solicitação de recurso em análise para este caso. Nossa equipe responderá em breve.",
            }
        }

        const nowIso = new Date().toISOString()
        const formattedDate = new Date().toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        })

        // 2. Insert into enforcement_appeals
        const { data: insertedAppeal, error: insertError } = await supabase
            .from("enforcement_appeals")
            .insert({
                case_id: caseId,
                entity_type: entityType,
                entity_id: entityId,
                entity_name: entityName,
                user_id: user.id,
                user_email: user.email || validEmail,
                user_name: contactName || user.email?.split("@")[0] || "Lojista",
                user_phone: contactPhone || null,
                contact_email: validEmail,
                contact_phone: contactPhone || null,
                reason: reason || "Suspensão administrativa",
                appeal_statement: trimmedStatement,
                status: "pending",
                created_at: nowIso,
            })
            .select("id")
            .single()

        if (insertError) {
            console.error("[SUBMIT_APPEAL_INSERT_ERROR]", insertError)
            return { success: false, error: "Erro ao registrar o recurso no sistema. Tente novamente." }
        }

        const scopeLabels: Record<string, string> = {
            store: "Loja / Filial",
            partner: "Parceiro Completo",
            erp: "Acesso ao ERP",
            user: "Conta de Usuário",
        }
        const entityTypeLabel = scopeLabels[entityType] || entityType

        // 3. Dispatch Email to Dudit Admin / Moderation via SMTP2GO Service
        const adminModerationEmail = process.env.ADMIN_MODERATION_EMAIL || "contato@dudit.com.br"

        try {
            const templateId = SMTP2GO_TEMPLATE_IDS.enforcementAppeal

            const emailData = {
                caseId,
                entityName,
                entityTypeLabel,
                reason: reason || "Decisão administrativa",
                appealStatement: trimmedStatement,
                userName: contactName || user.email?.split("@")[0] || "Lojista",
                userEmail: validEmail,
                userPhone: contactPhone || "Não informado",
                createdAt: formattedDate,
            }

            if (templateId) {
                await SMTP2GOService.sendEmail({
                    to: [{ email: adminModerationEmail, name: "Moderação Dudit" }],
                    subject: `[Novo Recurso] Protocolo #${caseId} - ${entityName} (${entityTypeLabel})`,
                    template_id: templateId,
                    variables: {
                        caseId,
                        entityName,
                        entityTypeLabel,
                        reason: emailData.reason,
                        appealStatement: trimmedStatement,
                        userName: emailData.userName,
                        userEmail: validEmail,
                        userPhone: emailData.userPhone,
                        createdAt: formattedDate,
                    },
                })
            } else {
                // HTML fallback template
                const html = getEnforcementAppealEmailHtml(emailData)
                await SMTP2GOService.sendEmail({
                    to: [{ email: adminModerationEmail, name: "Moderação Dudit" }],
                    subject: `[Novo Recurso] Protocolo #${caseId} - ${entityName} (${entityTypeLabel})`,
                    html,
                })
            }

            SecureLogger.info("[ENFORCEMENT_APPEAL] Email sent to admin moderation", {
                caseId,
                entityId,
                userId: user.id,
                userEmail: validEmail,
                recipient: adminModerationEmail,
            })
        } catch (emailErr) {
            console.error("[ENFORCEMENT_APPEAL_EMAIL_FAILED]", emailErr)
            // We do not fail the appeal submission if the email provider had a temporary glitch
        }

        // 4. In-App Notification for the User in Dudit
        try {
            await supabase.from("notifications").insert({
                user_id: user.id,
                title: `Recurso Registrado (${caseId})`,
                message: `Recebemos seus esclarecimentos para "${entityName}". Sua solicitação está em análise pela equipe de moderação.`,
                type: "warning",
                read: false,
                created_at: nowIso,
            })
        } catch {
            // notification table might have specific columns
        }

        return {
            success: true,
            caseId,
            appealId: insertedAppeal?.id,
        }
    } catch (err: any) {
        console.error("[SUBMIT_APPEAL_ERROR]", err)
        return { success: false, error: err?.message || "Ocorreu um erro ao processar o recurso." }
    }
}
