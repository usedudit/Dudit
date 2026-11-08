import type { ModerationResult } from "@/lib/types/moderation"
import { checkTextSafety } from "@/lib/moderation/moderation-service"

/**
 * Modera uma lista de campos de texto livres (nome, descrição, comentário...).
 * Campos vazios/undefined são ignorados.
 */
export async function moderateFields(
  fields: Array<string | null | undefined>,
  options?: { userId?: string; asyncMode?: boolean }
): Promise<ModerationResult> {
  try {
    const texts = fields
      .map((f) => (typeof f === "string" ? f.trim() : ""))
      .filter((f) => f.length > 0)

    if (texts.length === 0) return { valid: true }

    // Por padrão no fluxo de usuário (interactive actions), usamos asyncMode: true
    // para não travar a requisição esperando cold start da Cloudflare Workers AI.
    // A blocklist local (pt-BR) continua bloqueando termos ofensivos instantaneamente (< 0.1ms).
    const asyncMode = options?.asyncMode ?? true
    const result = await checkTextSafety(texts, options?.userId, { asyncMode })

    if (!result.passed) {
      return {
        valid: false,
        error: result.reason || "Conteúdo não aprovado pela moderação",
        flaggedTexts: result.flaggedTexts as any,
        infraFailure: result.degraded || undefined,
      }
    }

    return { valid: true, infraFailure: result.degraded || undefined }
  } catch (err) {
    console.error("[moderateFields] Error:", err)
    // Fail-open: não bloqueia o usuário se a moderação quebrar.
    // `infraFailure` permite que o chamador registre/alerta.
    return { valid: true, infraFailure: true }
  }
}

/**
 * Compatibilidade: moderação de produto/serviço (nome + descrição).
 */
export async function moderateProductContent(data: {
  name?: string
  description?: string
  imageKeysForModeration?: string[]
  userId?: string
  asyncMode?: boolean
}): Promise<ModerationResult> {
  return moderateFields([data.name, data.description], { userId: data.userId, asyncMode: data.asyncMode })
}

/**
 * Moderação de conteúdo público de loja/perfil (nome, descrição/bio).
 */
export async function moderateStoreContent(data: {
  name?: string | null
  description?: string | null
  userId?: string
  asyncMode?: boolean
}): Promise<ModerationResult> {
  return moderateFields([data.name, data.description], { userId: data.userId, asyncMode: data.asyncMode })
}

/**
 * Moderação de comentário de avaliação (review).
 */
export async function moderateReviewContent(data: {
  comment?: string | null
  userId?: string
  asyncMode?: boolean
}): Promise<ModerationResult> {
  return moderateFields([data.comment], { userId: data.userId, asyncMode: data.asyncMode })
}
