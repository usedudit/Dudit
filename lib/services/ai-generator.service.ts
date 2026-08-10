import "server-only"
import { redis } from "@/lib/redis"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { getAdminClient } from "@/lib/supabase/admin"
import { SecureLogger } from "@/lib/secure-logger"
import { getAiProvider } from "@/lib/ai/product-generation/providers"
import { extractLocalDataSimple } from "@/lib/ai/product-generation/local-extractor"
import crypto from "crypto"

// Configuração de limites diários por plano
export const AI_GENERATION_LIMITS = {
  free: 0,
  crescer: 10,
  escalar: 50,
} as const

export interface GenerateInput {
  title: string
  itemType: "product" | "service"
  images?: string[]
}

export interface GeneratedDetails {
  brand: string
  description: string
  tags: string[]
  specs: Record<string, string>
  category: {
    id: string | null
    confidence: number
  }
}

export interface GenerationResult {
  success: boolean
  data?: GeneratedDetails
  error?: string
  message?: string
  cached?: boolean
}

// Helper para remover acentos
function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

// Helper para gerar hash do título + tipo
function hashInput(title: string, itemType: string): string {
  return crypto.createHash("sha256").update(`${title.trim().toLowerCase()}:${itemType}`).digest("hex")
}

// Helper para obter data no fuso de Brasília (America/Sao_Paulo)
function getSaoPauloDateStr(): string {
  const now = new Date()
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now) // Retorna "YYYY-MM-DD"
}

// Helper para remover formatações markdown de blocos de código JSON
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7)
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3)
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3)
  }
  return cleaned.trim()
}

export class AiGeneratorService {
  /**
   * Gera detalhes (descrição, marca, tags, especificações e categoria)
   * a partir do título do produto/serviço com fallback de modelos.
   */
  static async generateProductDetails(
    partnerId: string,
    userId: string,
    input: GenerateInput
  ): Promise<GenerationResult> {
    const startTime = Date.now()
    const { title, itemType = "product" } = input

    if (!title || !title.trim()) {
      return { success: false, error: "invalid_input", message: "O título não pode ser vazio." }
    }

    const hashed = hashInput(title, itemType)
    const cacheKey = `ai:cache:prod_details:${partnerId}:${hashed}`
    const todayStr = getSaoPauloDateStr()
    const rateLimitKey = `ai:rate_limit:${partnerId}:${todayStr}`

    // 1. Verificar plano e limite de taxa diário
    try {
      const plan = await getPartnerPlan(partnerId)
      const planSlug = (plan?.slug || "free").toLowerCase() as keyof typeof AI_GENERATION_LIMITS
      const limit = AI_GENERATION_LIMITS[planSlug] ?? 0

      if (limit === 0) {
        return {
          success: false,
          error: "plan_blocked",
          message: "A geração por IA não está inclusa no seu plano atual. Faça upgrade para o plano Crescer ou superior."
        }
      }

      const currentUsage = (await redis.get<number>(rateLimitKey)) || 0
      if (currentUsage >= limit) {
        return {
          success: false,
          error: "limit_exceeded",
          message: `Você atingiu o limite diário de ${limit} gerações do seu plano.`
        }
      }

      // 2. Verificar cache (24 horas)
      const cachedData = await redis.get<GeneratedDetails>(cacheKey)
      if (cachedData) {
        SecureLogger.info("AI_GENERATION_CACHE_HIT", { partner_id: partnerId, user_id: userId, title })
        return {
          success: true,
          data: cachedData,
          cached: true
        }
      }

      // 3. Buscar categorias oficiais do banco de dados e formatar
      const admin = getAdminClient()
      const isProduct = itemType === "product"
      const { data: dbCategories, error: catError } = await admin
        .from(isProduct ? "marketplace_product_categories" : "marketplace_service_categories")
        .select("id, name, parent_id")

      if (catError) {
        SecureLogger.warn("[AI GENERATOR] Falha ao carregar categorias oficiais:", { error: catError.message })
      }

      const categoryList: Array<{ id: string; path: string }> = []
      const categoryIdSet = new Set<string>()

      if (dbCategories && dbCategories.length > 0) {
        const catMap = new Map(dbCategories.map((c: any) => [c.id, c]))
        for (const c of dbCategories) {
          categoryIdSet.add(c.id)
          // Montar o caminho hierárquico (ex: "Tecnologia & Eletrônicos > celular")
          let path = c.name
          let current = c
          while (current.parent_id && catMap.has(current.parent_id)) {
            current = catMap.get(current.parent_id)
            path = `${current.name} > ${path}`
          }
          categoryList.push({ id: c.id, path })
        }
      }

      const categoriesContext = categoryList
        .map((c) => `[ID: "${c.id}"] ${c.path}`)
        .join("\n")

      // 4. Montar o Prompt para interpretação semântica direta pela IA
      const prompt = `
        Você é um assistente de cadastro de ${isProduct ? "produtos" : "serviços"} preciso e consistente.
        Sua tarefa é analisar o seguinte título e preencher os dados correspondentes em JSON:
        Título: "${title}"

        Lista Oficial de Categorias Disponíveis (Selecione o ID mais adequado da lista abaixo):
        ${categoriesContext || "Nenhuma categoria disponível."}

        Regras Cruciais:
        1. DESCRIÇÃO:
           - Escreva uma descrição de venda atraente e bem redigida, em português natural, com tom profissional e convidativo.
           - Estruture em 2 a 3 parágrafos curtos:
             a) Abertura: apresente o item de forma convidativa, destacando seu principal benefício ou uso.
             b) Meio: detalhe características relevantes (qualidade, material, funcionalidade, diferenciais, compatibilidade) de forma natural e específica.
             c) Encerramento: indique para quem é ideal ou qual problema ele resolve.
           - Máximo de aproximadamente 700 caracteres no total.
           - Proibido: emojis, exageros ("melhor do mercado", "perfeito", "revolucionário"), promessas falsas, links, jargão técnico excessivo e menção a preço.
        2. MARCA:
           - Identifique a marca presente no título. Se nenhuma marca estiver clara, retorne string vazia "".
        3. TAGS:
           - Gere entre 5 e 10 tags. Nunca mais de 10.
           - Devem ser curtas, minúsculas, sem acentos, sem repetição, relevantes para busca.
        4. ESPECIFICAÇÕES (Ficha técnica):
           - Extraia atributos de especificações relevantes contidos no título (ex: Cor, Armazenamento, Capacidade, Voltagem, Potência, Modelo, etc.).
           - Máximo de 10 atributos.
           - Não invente nada fora do que o título sugere. Ignore valores vazios.
        5. CATEGORIA:
           - Analise o título e selecione exatamente um ID da "Lista Oficial de Categorias Disponíveis".
           - Retorne um score de confiança (confidence) entre 0.0 e 1.0.
           - Se nenhuma categoria coincidir ou você tiver dúvidas, retorne o campo id como string vazia "" e a confiança como 0.0.
           - NUNCA invente novos IDs ou nomes de categorias. Use apenas os IDs da lista.

        Response Format:
        Responda EXCLUSIVAMENTE com o objeto JSON estruturado. Não use blocos de código markdown ou texto livre.
        {
          "description": string,
          "brand": string,
          "tags": string[],
          "specs": { [key: string]: string },
          "category": {
            "id": string,
            "confidence": number
          }
        }
      `

      // 5. Abstração de Provedor e Cadeia de Fallback de Modelos
      const provider = getAiProvider()

      // Modelo padrão do provedor + fallbacks do próprio provedor.
      // Se AI_PRODUCT_MODEL for definido, ele é usado como modelo padrão.
      const models = Array.from(new Set([provider.defaultModel, ...provider.fallbackModels]))

      let apiResponseText = ""
      let modelUsed = ""
      let tokensPrompt: number | null = null
      let tokensCompletion: number | null = null
      let lastError: any = null

      for (const currentModel of models) {
        try {
          SecureLogger.info(`[AI GENERATOR] Tentando geração com o modelo: ${currentModel}`)
          const apiResult = await provider.generate(prompt, currentModel, { timeout: 10000 })
          
          apiResponseText = apiResult.text
          modelUsed = apiResult.modelUsed
          tokensPrompt = apiResult.tokensPrompt
          tokensCompletion = apiResult.tokensCompletion
          
          break // Sucesso!
        } catch (err: any) {
          lastError = err
          SecureLogger.warn(`[AI GENERATOR] Falha no modelo ${currentModel}: ${err.message}. Avançando para o próximo fallback...`)
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }

      if (!apiResponseText) {
        throw new Error(`Falha em todos os modelos da cadeia de fallback. Último erro: ${lastError?.message || "Desconhecido"}`)
      }

      // 6. Limpar e parsear o retorno JSON
      const cleanedJson = cleanJsonResponse(apiResponseText)
      const aiResponseObj = JSON.parse(cleanedJson)

      const description = (aiResponseObj.description || "").trim().slice(0, 800)
      const brand = (aiResponseObj.brand || "").trim()

      let rawTags = Array.isArray(aiResponseObj.tags) ? aiResponseObj.tags : []
      const sanitizedTags = Array.from(
        new Set(
          rawTags
            .map((t: any) => removeAccents(String(t).toLowerCase().trim()))
            .filter((t: any) => t.length > 1 && !t.includes(" "))
        )
      ).slice(0, 10) as string[]

      const rawSpecs = typeof aiResponseObj.specs === "object" && aiResponseObj.specs !== null ? aiResponseObj.specs : {}
      const sanitizedSpecs: Record<string, string> = {}
      let specCount = 0
      for (const [key, val] of Object.entries(rawSpecs)) {
        if (specCount >= 10) break
        const cleanKey = String(key).trim()
        const cleanVal = String(val).trim()
        if (cleanKey && cleanVal) {
          sanitizedSpecs[cleanKey] = cleanVal
          specCount++
        }
      }

      // 7. Processar a Categoria com corte de Confiança (0.85) e verificar validade
      let finalCategoryId: string | null = null
      const aiCategory = aiResponseObj.category || {}
      const aiCategoryId = (aiCategory.id || "").trim()
      const aiConfidence = Number(aiCategory.confidence || 0)

      if (aiCategoryId && categoryIdSet.has(aiCategoryId) && aiConfidence >= 0.85) {
        finalCategoryId = aiCategoryId
      } else {
        SecureLogger.info("[AI GENERATOR] Categoria descartada (baixa confiança ou ID inválido)", {
          id: aiCategoryId,
          confidence: aiConfidence,
        })
      }

      const finalDetails: GeneratedDetails = {
        brand,
        description,
        tags: sanitizedTags,
        specs: sanitizedSpecs,
        category: {
          id: finalCategoryId,
          confidence: aiConfidence,
        }
      }

      // 8. Salvar no Cache
      await redis.set(cacheKey, finalDetails, { ex: 24 * 3600 })

      // 9. Incrementar Rate Limit diário
      await redis.incr(rateLimitKey)
      await redis.expire(rateLimitKey, 48 * 3600)

      const durationMs = Date.now() - startTime
      SecureLogger.info("AI_GENERATION_SUCCESS", {
        partner_id: partnerId,
        user_id: userId,
        model_used: modelUsed,
        duration_ms: durationMs,
        tokens_prompt: tokensPrompt,
        tokens_completion: tokensCompletion,
        success: true,
      })

      return {
        success: true,
        data: finalDetails
      }

    } catch (error: any) {
      const durationMs = Date.now() - startTime
      const errorMsg = error.message || "Erro na cadeia de geração da IA."
      
      SecureLogger.error("AI_GENERATION_FAILED", {
        partner_id: partnerId,
        user_id: userId,
        duration_ms: durationMs,
        success: false,
        error_message: errorMsg
      })

      // Fallback local simples por regex em caso de indisponibilidade ou erro
      SecureLogger.warn("[AI GENERATOR] IA indisponível. Executando fallback local básico por regex.", { error: errorMsg })
      const fallbackData = extractLocalDataSimple(title)

      return {
        success: true,
        data: fallbackData,
        message: "IA temporariamente indisponível. Alguns campos foram preenchidos de forma básica com base no título."
      }
    }
  }
}
