import { safeFetch, validateImageUrl, SSRFError } from "@/lib/security/ssrf-guard"

export interface SightengineResult {
  moderation?: {
    nudity?: { confidence: number }
    gore?: { confidence: number }
    weapon?: { confidence: number }
    violence?: { confidence: number }
  }
  nudity?: { [key: string]: number }
  gore?: { [key: string]: number }
  weapon?: { [key: string]: number }
  violence?: { [key: string]: number }
  status: string
  request?: { id?: string }
  error?: { message?: string }
}

export interface ModerationAnalysis {
  riskLevel: 'low' | 'medium' | 'high'
  confidence: number
  categories: {
    name: string
    confidence: number
  }[]
  rawResponse: SightengineResult | null
  error?: string
  isUnavailable?: boolean
}

// Apenas 4 categorias conforme solicitado
// Nomes CORRETOS da documentação do Sightengine
const MODELS = [
  'nudity-2.1',
  'gore-2.0',
  'violence',
  'weapon',
]

const CONFIDENCE_THRESHOLD = 0.5 // 50% threshold

/**
 * Função auxiliar recursiva para encontrar o maior valor numérico em um objeto,
 * ignorando chaves de metadados ou segurança.
 */
function findMaxConfidenceRecursive(data: any, ignoredKeys: string[]): number {
  // Se for número direto, retorna ele
  if (typeof data === 'number') return data

  // Se não for objeto (null, string, etc), retorna 0
  if (!data || typeof data !== 'object') return 0

  let max = 0

  for (const [key, value] of Object.entries(data)) {
    // Pula chaves ignoradas (safe, none, context, etc)
    if (ignoredKeys.includes(key)) continue

    // Chama a função novamente para o valor (recursão)
    // Isso garante que entremos em "classes", "type", etc.
    const currentVal = findMaxConfidenceRecursive(value, ignoredKeys)

    if (currentVal > max) {
      max = currentVal
    }
  }

  return max
}

export function analyzeModerationResult(
  result: SightengineResult
): ModerationAnalysis {
  try {
    const categoriesToCheck = [
      { key: 'nudity', name: 'Nudity/Adult Content' },
      { key: 'gore', name: 'Gore' },
      { key: 'violence', name: 'Violence' },
      { key: 'weapon', name: 'Weapons' },
    ]

    const flaggedCategories: { name: string; confidence: number }[] = []
    let maxConfidence = 0

    // Lista negra expandida de campos para ignorar
    const IGNORED_FIELDS = [
      'safe', 'none', 'context', 'request', 'media',
      'status', 'error', 'operations'
    ]

    for (const { key, name } of categoriesToCheck) {
      const categoryData = (result as any)[key]

      // Se a categoria não veio na resposta, ignora
      if (categoryData === undefined || categoryData === null) continue

      // Usa a busca recursiva para achar o maior valor, mesmo aninhado
      const confidence = findMaxConfidenceRecursive(categoryData, IGNORED_FIELDS)

      if (confidence > CONFIDENCE_THRESHOLD) {
        flaggedCategories.push({
          name,
          confidence: Math.round(confidence * 100),
        })
        maxConfidence = Math.max(maxConfidence, confidence)
      }
    }

    // Determinar nível de risco
    let riskLevel: 'low' | 'medium' | 'high' = 'low'
    if (maxConfidence > 0.8) {
      riskLevel = 'high'
    } else if (maxConfidence > 0.6) {
      riskLevel = 'medium'
    }

    return {
      riskLevel,
      confidence: Math.round(maxConfidence * 100),
      categories: flaggedCategories,
      rawResponse: result,
    }
  } catch (error) {
    console.error('[SIGHTENGINE] Error analyzing result:', error)
    return {
      riskLevel: 'low',
      confidence: 0,
      categories: [],
      rawResponse: result,
      isUnavailable: true,
    }
  }
}

/**
 * Faz requisição ao Sightengine com base64 de imagem
 * CORREÇÃO: Usa FormData (multipart) em vez de URLSearchParams
 */
export async function moderateImageWithBase64(
  base64Image: string
): Promise<ModerationAnalysis> {
  try {
    const apiUser = process.env.SIGHTENGINE_API_USER?.trim()
    const apiSecret = process.env.SIGHTENGINE_API_SECRET?.trim()

    if (!apiUser || !apiSecret) {
      console.warn('[SIGHTENGINE] Missing API credentials, failing open (approved)')
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: null,
        isUnavailable: true,
      }
    }

    // 1. Criar o FormData
    const formData = new FormData()
    formData.append('models', MODELS.join(','))
    formData.append('api_user', apiUser)
    formData.append('api_secret', apiSecret)

    // 2. Converter Base64 para Blob para simular um arquivo real
    // Remove o cabeçalho "data:image/png;base64," se existir
    const base64Data = base64Image.includes(',')
      ? base64Image.split(',')[1]
      : base64Image

    // Converte para Buffer e depois para Blob
    const buffer = Buffer.from(base64Data, 'base64')
    const blob = new Blob([buffer], { type: 'image/jpeg' })

    // Anexa como se fosse um arquivo chamado 'image.jpg'
    formData.append('media', blob, 'image.jpg')

    // 3. O Fetch gerencia o Content-Type automaticamente (boundary)
    const response = await safeFetch('https://api.sightengine.com/1.0/check.json', {
      method: 'POST',
      body: formData,
      timeoutMs: 15_000,
      maxResponseBytes: 1 * 1024 * 1024, // 1 MB - API response is JSON
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.warn('[SIGHTENGINE] API error or rate limit, failing open:', response.status, errorText.slice(0, 300))
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: null,
        isUnavailable: true,
      }
    }

    const result: SightengineResult = await response.json()

    // Tratamento específico para quota atingida ou falha de argumentos
    if (result.status === 'failure') {
      console.warn('[SIGHTENGINE] API failure or quota limit exceeded, failing open:', result.error?.message)
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: result,
        isUnavailable: true,
      }
    }

    const analysis = analyzeModerationResult(result)
    return analysis

  } catch (error) {
    console.warn('[SIGHTENGINE] Exception caught, failing open:', error instanceof Error ? error.message : error)
    return {
      riskLevel: 'low',
      confidence: 0,
      categories: [],
      rawResponse: null,
      isUnavailable: true,
    }
  }
}

/**
 * Faz requisição ao Sightengine com URL da imagem (para imagens já salvas).
 * Nota de arquitetura: Como o CDN da dudit (img.dudit.com.br) possui proteção Cloudflare WAF
 * que bloqueia bots e crawlers externos com HTTP 403, para imagens armazenadas no R2/CDN
 * nós baixamos os bytes diretamente do storage via AWS SDK interno e enviamos os bytes crus (base64)
 * ao Sightengine, garantindo 100% de confiabilidade e evitando bloqueios de WAF.
 */
export async function moderateImageWithUrl(
  imageUrl: string
): Promise<ModerationAnalysis> {
  try {
    // Se for imagem no nosso CDN ou chave de storage R2, usa diretamente o buffer interno do R2
    const isInternalStorage =
      imageUrl.includes("dudit.com.br") ||
      imageUrl.includes("r2.dev") ||
      imageUrl.startsWith("users/") ||
      imageUrl.startsWith("products/") ||
      imageUrl.startsWith("partner-") ||
      !imageUrl.startsWith("http")

    if (isInternalStorage) {
      const { getFileBufferFromR2 } = await import("@/lib/r2/server")
      const buffer = await getFileBufferFromR2(imageUrl)
      if (buffer && buffer.length > 0) {
        return moderateImageWithBase64(buffer.toString("base64"))
      }
      console.warn('[SIGHTENGINE] Buffer R2 não encontrado para imagem interna:', imageUrl)
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: null,
        isUnavailable: true,
      }
    }

    // SSRF PROTECTION: Validate the image URL is from an allowed CDN only.
    const urlCheck = validateImageUrl(imageUrl)
    if (!urlCheck.valid) {
      console.warn('[SIGHTENGINE] Blocked image URL:', urlCheck.error)
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: null,
        error: `Image URL rejected: ${urlCheck.error}`,
      }
    }

    const apiUser = process.env.SIGHTENGINE_API_USER?.trim()
    const apiSecret = process.env.SIGHTENGINE_API_SECRET?.trim()

    if (!apiUser || !apiSecret) {
      console.warn('[SIGHTENGINE] Missing API credentials, failing open (approved)')
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: null,
        isUnavailable: true,
      }
    }

    const params = new URLSearchParams({
      url: imageUrl,
      models: MODELS.join(','),
      api_user: apiUser,
      api_secret: apiSecret,
    })

    const response = await safeFetch(
      `https://api.sightengine.com/1.0/check.json?${params.toString()}`,
      {
        method: 'GET',
        timeoutMs: 15_000,
        maxResponseBytes: 1 * 1024 * 1024, // 1 MB - API response is JSON
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.warn('[SIGHTENGINE] API error or rate limit, trying fallback:', response.status, errorText.slice(0, 200))
      // Tenta fallback com buffer direto
      const { getFileBufferFromR2 } = await import("@/lib/r2/server")
      const buffer = await getFileBufferFromR2(imageUrl)
      if (buffer && buffer.length > 0) {
        return moderateImageWithBase64(buffer.toString("base64"))
      }
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: null,
        isUnavailable: true,
      }
    }

    const result: SightengineResult = await response.json()

    if (result.status !== 'success') {
      console.warn('[SIGHTENGINE] API returned non-success status, trying direct buffer fallback:', result.status, result.error?.message)
      const { getFileBufferFromR2 } = await import("@/lib/r2/server")
      const buffer = await getFileBufferFromR2(imageUrl)
      if (buffer && buffer.length > 0) {
        return moderateImageWithBase64(buffer.toString("base64"))
      }
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: result,
        isUnavailable: true,
      }
    }

    const analysis = analyzeModerationResult(result)
    return analysis
  } catch (error) {
    console.warn('[SIGHTENGINE] Exception caught in moderateImageWithUrl, trying buffer fallback:', error instanceof Error ? error.message : error)
    try {
      const { getFileBufferFromR2 } = await import("@/lib/r2/server")
      const buffer = await getFileBufferFromR2(imageUrl)
      if (buffer && buffer.length > 0) {
        return moderateImageWithBase64(buffer.toString("base64"))
      }
    } catch {
      // Ignora erro no fallback
    }
    return {
      riskLevel: 'low',
      confidence: 0,
      categories: [],
      rawResponse: null,
      isUnavailable: true,
    }
  }
}
