import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { getImageUrlStatus, cacheImageUrlStatus } from "@/lib/moderation/image-cache"
import { moderateImageWithUrl } from "@/lib/moderation/sightengine-moderation"
import { decideImageStatus } from "@/lib/moderation/image-decision"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

export type DeferredImageModerationPayload = {
  entityType: "product" | "service" | "recurring_plan"
  entityId: string
  partnerId: string
  images: string[]
}

const ENTITY_CONFIG: Record<
  "product" | "service" | "recurring_plan",
  { table: string; exploreType: "produto" | "servico" | null }
> = {
  product: { table: "products", exploreType: "produto" },
  service: { table: "services", exploreType: "servico" },
  recurring_plan: { table: "recurring_plans", exploreType: null },
}

/** Tenta limpar os caches que decidem se o item aparece no marketplace. */
async function refreshEntityCaches(
  payload: DeferredImageModerationPayload,
): Promise<void> {
  const config = ENTITY_CONFIG[payload.entityType]

  if (config.exploreType) {
    try {
      const { syncToExploreRedis } = await import("@/lib/redis-sync")
      await syncToExploreRedis({
        id: payload.entityId,
        type: config.exploreType,
        data: {},
        silent: true,
      })
    } catch (err: any) {
      console.warn("[IMAGE_MODERATION] Falha ao sincronizar cache do marketplace:", err?.message || err)
    }
  }

  try {
    const { revalidateTag } = await import("next/cache")
    const tags = [
      `${payload.entityType}-${payload.entityId}`,
      payload.entityType === "product"
        ? "products"
        : payload.entityType === "service"
          ? "services"
          : "recurring-plans",
    ]

    for (const tag of tags) {
      try {
        ;(revalidateTag as any)(tag, "max")
      } catch {
        // Ignora fora do contexto HTTP
      }
    }
  } catch {
    // Cache do Next é best-effort; o banco é a fonte da verdade.
  }
}

/**
 * Agenda a moderação em background das imagens de um produto ou serviço.
 * Retorna true se conseguiu agendar.
 */
export async function scheduleDeferredImageModeration(
  input: DeferredImageModerationPayload
): Promise<boolean> {
  const validImages = (input.images || []).filter(
    (img): img is string => typeof img === "string" && img.trim().length > 0
  )

  if (validImages.length === 0) {
    return true
  }

  const payload: DeferredImageModerationPayload = {
    entityType: input.entityType,
    entityId: input.entityId,
    partnerId: input.partnerId,
    images: validImages,
  }

  const idempotencyKey = `moderation-img:${input.entityType}:${input.entityId}:${validImages.length}`

  // 1. Tenta enfileirar via Trigger.dev
  try {
    const { enqueueTriggerTask } = await import("@/lib/internal-cron/enqueue")
    const enqueued = await enqueueTriggerTask("moderation-image-job", payload, { idempotencyKey })
    if (enqueued) {
      console.log(`[IMAGE_MODERATION] Checagem de imagem agendada via Trigger.dev: ${input.entityType}:${input.entityId}`)
      return true
    }
  } catch (err: any) {
    console.warn("[IMAGE_MODERATION] Trigger.dev não disponível para imagem, tentando after():", err?.message || err)
  }

  // 2. Fallback: Next.js after()
  try {
    const { after } = await import("next/server")
    after(() => {
      runDeferredImageModeration(payload).catch((err) => {
        console.error("[IMAGE_MODERATION] Erro em runDeferredImageModeration via after():", err?.message || err)
      })
    })
    return true
  } catch (err: any) {
    console.warn("[IMAGE_MODERATION] after() não disponível; executando em background não-bloqueante:", err?.message || err)
  }

  // 3. Fallback final: Promise sem await
  runDeferredImageModeration(payload).catch((err) => {
    console.error("[IMAGE_MODERATION] Falha na execução assíncrona:", err?.message || err)
  })

  return true
}

/**
 * Executa a análise das imagens de um produto/serviço.
 * Se encontrar alguma imagem inapropriada:
 * - Grava no banco `moderation_status = 'flagged'`
 * - Salva em `moderation_reason` a lista de imagens sinalizadas (JSON `{ flagged_images: [...] }`)
 * - Atualiza o cache do marketplace para ocultar as imagens sinalizadas na vitrine pública
 */
export async function runDeferredImageModeration(
  payload: DeferredImageModerationPayload
): Promise<{ status: "flagged" | "approved" | "skipped"; flaggedCount: number }> {
  const config = payload ? ENTITY_CONFIG[payload.entityType] : undefined
  if (!config || !payload?.entityId) return { status: "skipped", flaggedCount: 0 }

  const admin = getAdminClient()
  const { data: row, error } = await admin
    .from(config.table)
    .select("id, moderation_status, moderation_reason, images")
    .eq("id", payload.entityId)
    .maybeSingle()

  if (error || !row) {
    console.warn(`[IMAGE_MODERATION] Entidade não encontrada para checagem: ${payload.entityType}:${payload.entityId}`)
    return { status: "skipped", flaggedCount: 0 }
  }

  // Se já foi reprovado definitivamente pelo admin, não sobrescreve
  if (row.moderation_status === "rejected") {
    return { status: "skipped", flaggedCount: 0 }
  }

  const rawImages = (Array.isArray(row.images) ? row.images : payload.images || []).filter(
    (img: any): img is string => typeof img === "string" && img.trim().length > 0
  )

  if (rawImages.length === 0) {
    return { status: "approved", flaggedCount: 0 }
  }

  const flaggedImages: string[] = []
  let highestRisk: "low" | "medium" | "high" = "low"
  let highestConfidence = 0
  let flaggedCategoriesList: string[] = []
  let allExplicitlyClean = true

  for (const img of rawImages) {
    // 1. Verifica se já está em cache no Redis pelo caminho/URL
    const cachedStatus = await getImageUrlStatus(img)

    if (cachedStatus === "FLAGGED") {
      flaggedImages.push(img)
      continue
    }

    if (cachedStatus === "APPROVED") {
      continue
    }

    // 2. Não está em cache de URL: consulta Sightengine via buffer direto do R2
    const analysis = await moderateImageWithUrl(img)

    if (analysis.isUnavailable) {
      // Se a moderação externa falhar, não bloqueia o lojista, mas não pode auto-aprovar o item se estava flagged
      allExplicitlyClean = false
      continue
    }

    const decision = decideImageStatus(analysis)
    const status = decision.status === "FLAGGED" ? "FLAGGED" : "APPROVED"
    await cacheImageUrlStatus(img, status)

    if (status === "FLAGGED") {
      flaggedImages.push(img)
      if (analysis.riskLevel === "high") highestRisk = "high"
      else if (analysis.riskLevel === "medium" && highestRisk !== "high") highestRisk = "medium"
      highestConfidence = Math.max(highestConfidence, analysis.confidence)
      flaggedCategoriesList.push(...analysis.categories.map((c) => c.name))
    }
  }

  if (flaggedImages.length > 0) {
    const reasonData = {
      reason: "Imagem sinalizada para moderação pelo sistema visual.",
      flagged_images: flaggedImages,
      detected_at: new Date().toISOString(),
    }

    await admin
      .from(config.table)
      .update({
        moderation_status: "flagged",
        moderation_reason: JSON.stringify(reasonData),
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.entityId)

    await refreshEntityCaches(payload)

    console.warn(
      `[IMAGE_MODERATION] Item ${payload.entityType}:${payload.entityId} marcado como FLAGGED (${flaggedImages.length} imagem(ns) sinalizada(s))`
    )

    // Notifica Discord Moderação (best-effort)
    try {
      const { sendModerationImageFlagged } = await import(
        "@/lib/services/discord-marketplace-webhook.service"
      )
      await sendModerationImageFlagged({
        imageUrl: getR2ImageUrl(flaggedImages[0]),
        categories: [...new Set(flaggedCategoriesList)],
        confidence: highestConfidence || 80,
        riskLevel: highestRisk === "high" ? "high" : "medium",
        entityType: payload.entityType,
        entityId: payload.entityId,
        partnerId: payload.partnerId,
      })
    } catch (err: any) {
      console.warn("[IMAGE_MODERATION] Falha ao notificar Discord:", err?.message || err)
    }

    return { status: "flagged", flaggedCount: flaggedImages.length }
  }

  // Se antes estava flagged por imagens e agora TODAS foram expressamente checadas e estão limpas (ex: edição removendo a imagem imprópria)
  if (row.moderation_status === "flagged" && allExplicitlyClean && flaggedImages.length === 0) {
    await admin
      .from(config.table)
      .update({
        moderation_status: "approved",
        moderation_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.entityId)

    await refreshEntityCaches(payload)
    console.log(`[IMAGE_MODERATION] Item ${payload.entityType}:${payload.entityId} auto-aprovado: todas as imagens estão limpas`)
    return { status: "approved", flaggedCount: 0 }
  }

  return { status: "approved", flaggedCount: 0 }
}
