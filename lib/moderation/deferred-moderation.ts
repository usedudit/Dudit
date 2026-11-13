import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import {
  checkTextSafety,
  MODERATION_BACKGROUND_TIMEOUT_MS,
} from "@/lib/moderation/moderation-service"

/**
 * Re-checagem de moderação em background.
 *
 * Quando a chamada inline à Cloudflare estoura o timeout (ou a IA está
 * indisponível), o item NÃO fica sem moderação: ele é salvo normalmente e um
 * job no Trigger.dev refaz a checagem depois, com timeout generoso.
 *
 * Se o texto passar, o job não faz nada (o item já está publicado de forma
 * otimista). Se reprovar, marca `moderation_status = 'rejected'`, o que remove
 * o item das consultas públicas.
 */

export type DeferredModerationEntityType = "product" | "service" | "community_video" | "recurring_plan"

export type DeferredTextModerationPayload = {
  entityType: DeferredModerationEntityType
  entityId: string
  partnerId: string
  /** true = se o texto passar, pode marcar como aprovado. false = deixa pendente (revisão manual). */
  autoApprove: boolean
  /** Hash do texto no momento do agendamento — usado como idempotency key. */
  fingerprint: string
}

const ENTITY_CONFIG: Record<
  DeferredModerationEntityType,
  { table: string; nameColumn: string; exploreType: "produto" | "servico" | null }
> = {
  product: { table: "products", nameColumn: "name", exploreType: "produto" },
  service: { table: "services", nameColumn: "name", exploreType: "servico" },
  community_video: { table: "community_videos", nameColumn: "title", exploreType: null },
  recurring_plan: { table: "recurring_plans", nameColumn: "name", exploreType: null },
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function buildFingerprint(texts: Array<string | null | undefined>): string {
  return texts
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .join("\n")
}

async function markAsPending(
  entityType: DeferredModerationEntityType,
  entityId: string
): Promise<void> {
  try {
    const config = ENTITY_CONFIG[entityType]
    const admin = getAdminClient()
    await admin
      .from(config.table)
      .update({ moderation_status: "pending_moderation", updated_at: new Date().toISOString() })
      .eq("id", entityId)
      .neq("moderation_status", "rejected")
  } catch (err: any) {
    console.error("[MODERATION] Falha ao marcar item como pending:", err?.message || err)
  }
}

/**
 * Agenda uma re-checagem. Retorna `true` se conseguiu enfileirar (Trigger.dev)
 * ou agendar via `after()` do Next.
 *
 * Use somente quando `moderation.infraFailure === true`.
 */
export async function scheduleDeferredTextModeration(input: {
  entityType: DeferredModerationEntityType
  entityId: string
  partnerId: string
  autoApprove: boolean
  texts: Array<string | null | undefined>
}): Promise<boolean> {
  // Sem credenciais a re-checagem também falharia: não adianta encher a fila.
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_AI_TOKEN) {
    console.warn("[MODERATION] Cloudflare AI sem credenciais; re-checagem não agendada.")
    return false
  }

  const fingerprint = await sha256(buildFingerprint(input.texts))
  const payload: DeferredTextModerationPayload = {
    entityType: input.entityType,
    entityId: input.entityId,
    partnerId: input.partnerId,
    autoApprove: input.autoApprove,
    fingerprint,
  }

  const idempotencyKey = `moderation:${input.entityType}:${input.entityId}:${fingerprint.slice(0, 16)}`

  try {
    const { enqueueTriggerTask } = await import("@/lib/internal-cron/enqueue")
    const enqueued = await enqueueTriggerTask("moderation-text-job", payload, { idempotencyKey })
    if (enqueued) {
      console.warn(
        `[MODERATION] Re-checagem agendada em background: ${input.entityType}:${input.entityId}`
      )
      return true
    }
  } catch (err: any) {
    console.error("[MODERATION] Falha ao enfileirar re-checagem:", err?.message || err)
  }

  // Trigger.dev indisponível: roda depois da resposta, ainda na request.
  try {
    const { after } = await import("next/server")
    after(() => {
      runDeferredTextModeration(payload).catch((err) => {
        console.error("[MODERATION] Re-checagem via after() falhou:", err?.message || err)
        void markAsPending(payload.entityType, payload.entityId)
      })
    })
    console.warn(
      `[MODERATION] Trigger.dev indisponível; re-checagem via after() para ${input.entityType}:${input.entityId}`
    )
    return true
  } catch (err: any) {
    console.error("[MODERATION] Não foi possível agendar a re-checagem:", err?.message || err)
  }

  // Último recurso: deixa o item pending para a fila de moderação do admin.
  await markAsPending(input.entityType, input.entityId)

  return false
}

async function updateStatus(
  table: string,
  entityId: string,
  status: "approved" | "rejected"
): Promise<void> {
  const admin = getAdminClient()
  const { error } = await admin
    .from(table)
    .update({ moderation_status: status, updated_at: new Date().toISOString() })
    .eq("id", entityId)

  if (error) throw new Error(`Falha ao atualizar ${table}.moderation_status: ${error.message}`)
}

/** Tenta limpar os caches que decidem se o item aparece no marketplace. */
async function refreshEntityCaches(
  payload: DeferredTextModerationPayload,
  status: "approved" | "rejected"
): Promise<void> {
  const config = ENTITY_CONFIG[payload.entityType]

  if (config.exploreType) {
    try {
      const { removeFromExploreRedis, syncToExploreRedis } = await import("@/lib/redis-sync")
      if (status === "rejected") {
        await removeFromExploreRedis(payload.entityId, config.exploreType, true, false)
      } else {
        await syncToExploreRedis({
          id: payload.entityId,
          type: config.exploreType,
          data: {},
          silent: true,
        })
      }
    } catch (err: any) {
      console.warn("[MODERATION] Falha ao sincronizar cache do marketplace:", err?.message || err)
    }
  }

  try {
    const { revalidateTag } = await import("next/cache")
    const tags =
      payload.entityType === "community_video"
        ? ["community-videos", `community-video-${payload.entityId}`]
        : payload.entityType === "recurring_plan"
          ? ["recurring-plans", `recurring-plan-${payload.entityId}`]
          : [`product-${payload.entityId}`, `service-${payload.entityId}`, "products", "services"]

    for (const tag of tags) {
      try {
        ;(revalidateTag as any)(tag, "max")
      } catch {
        // Fora de uma request do Next (ex.: Trigger.dev) pode não existir.
      }
    }
  } catch {
    // Cache do Next é best-effort; o banco é a fonte da verdade.
  }
}

export type DeferredModerationOutcome = "approved" | "rejected" | "skipped"

/**
 * Executa a re-checagem. Sempre relê o texto do banco (nunca confia no payload).
 * Lança erro quando a IA continua indisponível para o Trigger.dev tentar de novo.
 */
export async function runDeferredTextModeration(
  payload: DeferredTextModerationPayload
): Promise<{ status: DeferredModerationOutcome }> {
  const config = payload ? ENTITY_CONFIG[payload.entityType] : undefined
  if (!config || !payload?.entityId) return { status: "skipped" }

  const admin = getAdminClient()
  const { data: row, error } = await admin
    .from(config.table)
    .select(`id, ${config.nameColumn}, description, moderation_status`)
    .eq("id", payload.entityId)
    .maybeSingle()

  if (error) {
    throw new Error(`[MODERATION] Falha ao buscar ${payload.entityType}: ${error.message}`)
  }
  if (!row) return { status: "skipped" }

  // Já foi rejeitado por um admin (ou por outra execução): não sobrescreve.
  if (row.moderation_status === "rejected") return { status: "skipped" }

  const texts = [row[config.nameColumn], row.description]
    .map((value: unknown) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)

  if (texts.length === 0) {
    if (payload.autoApprove && row.moderation_status === "pending_moderation") {
      await updateStatus(config.table, payload.entityId, "approved")
      await refreshEntityCaches(payload, "approved")
      return { status: "approved" }
    }
    return { status: "skipped" }
  }

  const result = await checkTextSafety(texts, payload.partnerId, {
    timeoutMs: MODERATION_BACKGROUND_TIMEOUT_MS,
  })

  // Continua sem resposta: deixa o Trigger.dev tentar novamente com backoff.
  if (result.degraded) {
    throw new Error("[MODERATION] IA indisponível na re-checagem")
  }

  if (!result.passed) {
    await updateStatus(config.table, payload.entityId, "rejected")
    await refreshEntityCaches(payload, "rejected")
    console.error(
      `[MODERATION] Conteúdo reprovado em background: ${payload.entityType}:${payload.entityId}`,
      result.reason
    )

    // Avisa o canal de moderação (best-effort).
    try {
      const { sendModerationTextFlagged } = await import(
        "@/lib/services/discord-marketplace-webhook.service"
      )
      await sendModerationTextFlagged({
        entityType: payload.entityType,
        entityId: payload.entityId,
        partnerId: payload.partnerId,
        reason: result.reason,
        categories: [...new Set((result.flaggedTexts ?? []).flatMap((t) => t.categories))],
      })
    } catch (err: any) {
      console.warn("[MODERATION] Falha ao notificar Discord:", err?.message || err)
    }

    return { status: "rejected" }
  }

  // Vídeo da comunidade continua pendente até aprovação manual do admin.
  // Também não auto-aprova itens em `flagged`/`needs_images` (revisão de imagem).
  if (payload.autoApprove && row.moderation_status === "pending_moderation") {
    await updateStatus(config.table, payload.entityId, "approved")
    await refreshEntityCaches(payload, "approved")
    return { status: "approved" }
  }

  return { status: "skipped" }
}
