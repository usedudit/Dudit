import type { ModerationResult } from "@/lib/types/moderation"
import { checkTextSafety } from "@/lib/moderation/moderation-service" // <--- Importe do arquivo novo

export async function moderateProductContent(data: {
  name?: string
  description?: string
  imageKeysForModeration?: string[]
}): Promise<ModerationResult> {
  try {
    const texts: string[] = []
    if (data.name?.trim()) texts.push(data.name.trim())
    if (data.description?.trim()) texts.push(data.description.trim())

    // Se não tiver texto, retorna válido direto
    if (texts.length === 0) return { valid: true }

    console.log("[moderateProductContent] Running internal check:", { textsCount: texts.length })

    // CHAMADA DIRETA (Sem HTTP fetch para localhost)
    const result = await checkTextSafety(texts, "system-internal")

    if (!result.passed) {
      return {
        valid: false,
        error: result.reason || "Conteúdo não aprovado pela moderação",
        flaggedTexts: result.flaggedTexts as any,
      }
    }

    return { valid: true }
  } catch (err) {
    console.error("[moderateProductContent] Error:", err)
    // Fail-open: não bloqueia produto, mas sinaliza falha de infra
    // para o worker agendar retry
    return { valid: true, infraFailure: true }
  }
}